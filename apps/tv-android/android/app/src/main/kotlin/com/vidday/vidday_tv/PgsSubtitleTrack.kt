package com.vidday.vidday_tv

import android.util.Log
import androidx.media3.common.text.Cue
import androidx.media3.common.util.Consumer
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.text.SubtitleParser
import androidx.media3.extractor.text.pgs.PgsParser
import java.io.Closeable
import java.io.EOFException
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer

/**
 * 随机读的字幕数据源。
 *
 * 单个 `.sup` 最大见过 137MB，整个读进堆必然 OOM（实测 `InputStream.readBytes()` 会先在
 * `ByteArrayOutputStream` 里涨到 256MB 再复制一份），因此数据先流式落到缓存目录，再按需定位读取。
 */
interface PgsSource : Closeable {

    val length: Long

    fun readFully(offset: Long, destination: ByteArray, destinationOffset: Int, length: Int)
}

/** 文件源：`close()` 会一并删掉缓存文件，生命周期与 [PgsSubtitleTrack] 一致。 */
class FilePgsSource(private val file: File) : PgsSource {

    private val channel = RandomAccessFile(file, "r").channel

    override val length: Long = channel.size()

    override fun readFully(offset: Long, destination: ByteArray, destinationOffset: Int, length: Int) {
        val buffer = ByteBuffer.wrap(destination, destinationOffset, length)
        var done = 0
        while (done < length) {
            val read = channel.read(buffer, offset + done)
            if (read < 0) throw EOFException("读取越界：offset=$offset length=$length")
            done += read
        }
    }

    override fun close() {
        channel.close()
        file.delete()
    }
}

/**
 * 自建 PGS 字幕轨。
 *
 * media3 的 [PgsParser] 只认「裸 section 流」（连续的 `type(1)+size(2)+payload`），而标准
 * `.sup` 每一段前面还带 11 字节帧头（`PG` 魔数 + PTS + DTS）。把 `.sup` 整条喂进去时，
 * 帧头里的 `0x50`（`'P'`）会被当成 section type、后两字节被当成 size，整条流一路跳飞，
 * 最终产出 0 条 cue —— 实测：原始 `.sup` → 0 条（12ms）；剥掉帧头 → 1376 条含位图（88ms）。
 * media3 1.9.2 与 1.4.1 的 `readNextSection` 逐字节一致，升级同样无效。
 *
 * 因此这里由我们自己做「剥帧头 + 按一次呈现（PCS…END）分组 + 用帧头 PTS 补回时间轴」，
 * 位图解码仍复用 media3 的 [PgsParser]，不重写调色板 / RLE 那一套。
 *
 * 为控制内存，解析阶段只遍历段头建立索引（不读负载），位图在播放到该时刻时才解码。
 */
@UnstableApi
class PgsSubtitleTrack private constructor(
    private val source: PgsSource,
    private val events: List<Event>,
) : Closeable {

    /**
     * 一次「呈现」（PCS 到 END）。
     *
     * 各段在文件里并不连续，所以只记录每段 `[type 字节起点, 3 + size)` 的区间，
     * 解码时再读回来拼成连续的 section 流——全片几万段只占几百 KB 索引。
     */
    private class Event(
        val startUs: Long,
        val endUs: Long,
        val offsets: IntArray,
        val lengths: IntArray,
    )

    /** 复用同一个 parser：它每次 `parse` 都先 reset，只在主线程单线程调用即可。 */
    private val parser = PgsParser()

    /** 去帧头后的复用缓冲，按需扩容（单次呈现几十 KB 量级）。 */
    private var scratch = ByteArray(1 shl 16)

    private var cachedEvent: Event? = null
    private var cachedCue: Cue? = null

    /** 解析出的呈现次数，仅用于诊断日志。 */
    val eventCount: Int get() = events.size

    /**
     * 取 [positionUs] 处应显示的字幕。
     *
     * 「清屏」呈现（`PCS` 里没有任何对象）解码后没有位图，返回 null，覆盖层随之清空；
     * 两次呈现之间的空档同样返回 null。
     */
    fun cueAt(positionUs: Long): Cue? {
        if (events.isEmpty()) return null
        // 最后一个 startUs <= positionUs 的呈现
        var low = 0
        var high = events.size - 1
        var found = -1
        while (low <= high) {
            val mid = (low + high) ushr 1
            if (events[mid].startUs <= positionUs) {
                found = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        val event = if (found >= 0 && positionUs < events[found].endUs) events[found] else null
        if (event == null) {
            cachedEvent = null
            cachedCue = null
            return null
        }
        if (event === cachedEvent) return cachedCue
        val decoded = decode(event)
        cachedEvent = event
        cachedCue = decoded
        return decoded
    }

    private fun decode(event: Event): Cue? {
        var total = 0
        for (length in event.lengths) total += length
        if (scratch.size < total) scratch = ByteArray(total)
        var written = 0
        for (index in event.offsets.indices) {
            val length = event.lengths[index]
            source.readFully(event.offsets[index].toLong(), scratch, written, length)
            written += length
        }
        var decoded: Cue? = null
        try {
            parser.parse(
                scratch,
                0,
                total,
                SubtitleParser.OutputOptions.allCues(),
                // 一次呈现只会产出 0 或 1 条 cue，「清屏」那种没有位图
                Consumer { group -> decoded = group.cues.firstOrNull { it.bitmap != null } },
            )
        } catch (error: Exception) {
            Log.w(TAG, "PGS 字幕解码失败", error)
            return null
        }
        return decoded
    }

    override fun close() {
        source.close()
    }

    companion object {
        private const val TAG = "ViddayPgs"

        /** PCS：一次呈现的构图定义 */
        private const val SEGMENT_TYPE_PCS = 0x16

        /** END：一次呈现结束 */
        private const val SEGMENT_TYPE_END = 0x80

        /** 帧头 PTS 以 90kHz 为时间基 */
        private const val PTS_PER_SECOND = 90_000L

        /** 最后一次呈现没有「下一次」可顺延，给 5 秒兜底 */
        private const val LAST_EVENT_FALLBACK_US = 5_000_000L

        /** `PG` + PTS(4) + DTS(4) + type(1) + size(2) */
        private const val FRAME_HEADER_SIZE = 13

        /** type(1) + size(2)，帧头之后就是这两段连着的 section 头 */
        private const val SECTION_HEADER_SIZE = 3

        /**
         * 解析标准 `.sup`：只按段头遍历，遇到 END 收一次呈现。
         * 时间轴取该次呈现里 PCS 的 PTS，结束时间顺延到下一次呈现的起点。
         */
        fun parse(source: PgsSource): PgsSubtitleTrack {
            val starts = ArrayList<Long>()
            val offsets = ArrayList<IntArray>()
            val lengths = ArrayList<IntArray>()

            var groupOffsets = ArrayList<Int>()
            var groupLengths = ArrayList<Int>()
            var groupPts = -1L
            var pcsPts = -1L
            val header = ByteArray(FRAME_HEADER_SIZE)

            var cursor = 0L
            while (cursor + FRAME_HEADER_SIZE <= source.length) {
                source.readFully(cursor, header, 0, FRAME_HEADER_SIZE)
                if (header[0] != 'P'.code.toByte() || header[1] != 'G'.code.toByte()) break
                val pts = readUInt32(header, 2)
                val type = header[10].toInt() and 0xFF
                val size = readUInt16(header, 11)
                if (cursor + FRAME_HEADER_SIZE + size > source.length) break

                if (groupPts < 0) groupPts = pts
                if (type == SEGMENT_TYPE_PCS) pcsPts = pts
                groupOffsets.add((cursor + 10).toInt())
                groupLengths.add(SECTION_HEADER_SIZE + size)
                cursor += FRAME_HEADER_SIZE + size

                if (type == SEGMENT_TYPE_END) {
                    val groupStart = if (pcsPts >= 0) pcsPts else groupPts
                    starts.add(groupStart * 1_000_000L / PTS_PER_SECOND)
                    offsets.add(groupOffsets.toIntArray())
                    lengths.add(groupLengths.toIntArray())
                    groupOffsets = ArrayList()
                    groupLengths = ArrayList()
                    groupPts = -1L
                    pcsPts = -1L
                }
            }

            val events = ArrayList<Event>(starts.size)
            for (index in starts.indices) {
                val endUs =
                    if (index + 1 < starts.size) starts[index + 1] else starts[index] + LAST_EVENT_FALLBACK_US
                events.add(Event(starts[index], endUs, offsets[index], lengths[index]))
            }
            return PgsSubtitleTrack(source, events)
        }

        private fun readUInt16(data: ByteArray, offset: Int): Int =
            ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)

        private fun readUInt32(data: ByteArray, offset: Int): Long =
            ((data[offset].toLong() and 0xFF) shl 24) or
                ((data[offset + 1].toLong() and 0xFF) shl 16) or
                ((data[offset + 2].toLong() and 0xFF) shl 8) or
                (data[offset + 3].toLong() and 0xFF)
    }
}
