package com.vidday.vidday_tv

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.LayoutInflater
import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.ui.PlayerView
import io.flutter.plugin.platform.PlatformView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max

/**
 * 原生播放器视图：ExoPlayer + TextureView 画面，由 Flutter 的 AndroidView 承载。
 *
 * 相对 video_player 插件的关键差异是暴露了轨道选择（音轨 / 画质 / 字幕），
 * 这是「与 Web 端能力对齐」的前提。
 */
@OptIn(UnstableApi::class)
class NativePlayerView(
    private val activity: Activity,
    private val context: Context,
    private val params: Map<String, Any?>,
    private val emit: (Map<String, Any?>) -> Unit,
) : PlatformView, Player.Listener {

    private companion object {
        const val USER_AGENT = "Vidday/1.0 (Android)"
        const val TICK_MS = 500L

        /** 诊断日志标签：`adb logcat -s ViddayPgs` 可单独过滤。 */
        const val TAG = "ViddayPgs"

        /**
         * 缓冲 / 重试参数对齐 Web 端 video-player.tsx 的 hls.js 配置，
         * 取向同为「弱网 / 抖动优先，用深缓冲换不卡顿」。
         */
        const val MIN_BUFFER_MS = 60_000             // ← maxBufferLength
        const val MAX_BUFFER_MS = 120_000            // ← maxMaxBufferLength
        const val TARGET_BUFFER_BYTES = 120_000_000  // ← maxBufferSize（硬上限）
        const val BACK_BUFFER_MS = 90_000            // ← backBufferLength

        /** 起播门槛：略高于默认值，起播稍慢一点、换更稳的首段播放。 */
        const val BUFFER_FOR_PLAYBACK_MS = 3_000
        /** 卡顿后恢复门槛：高于默认 5s，避免「卡-播-卡」锯齿。 */
        const val AFTER_REBUFFER_MS = 6_000

        /**
         * 保守升档（对齐 Web 端 abrBandWidthUpFactor 0.55）：升档需攒够
         * [MIN_DURATION_FOR_QUALITY_INCREASE_MS] 缓冲，且仅把估算带宽的
         * [ABR_BANDWIDTH_FRACTION] 当作可用余量（ExoPlayer 默认 0.7）。
         */
        const val MIN_DURATION_FOR_QUALITY_INCREASE_MS = 20_000
        const val MAX_DURATION_FOR_QUALITY_DECREASE_MS = 25_000
        const val MIN_DURATION_TO_RETAIN_AFTER_DISCARD_MS = 25_000
        const val ABR_BANDWIDTH_FRACTION = 0.55f

        const val MIN_LOADABLE_RETRY_COUNT = 10      // ← fragLoadPolicy.default.errorRetry.maxNumRetry

        /** PGS 轨在字幕列表里的 id 前缀，用于与 ExoPlayer 内嵌字幕轨区分（与 Web 端一致）。 */
        const val PGS_KEY_PREFIX = "pgs:"

        /** 磁盘上最多保留几份 `.sup`（Top Gun 那类片源单份就有 137MB）。 */
        const val PGS_TRACK_CACHE_LIMIT = 2

        /** PGS 语言标识 → 中文名（与 Web 端 PGS_LANG_LABELS 对齐）。 */
        val LANG_LABELS = mapOf(
            "chs" to "简体中文",
            "chi" to "中文",
            "zho" to "中文",
            "zh" to "中文",
            "cht" to "繁体中文",
            "eng" to "英文",
            "en" to "英文",
            "jpn" to "日文",
            "jp" to "日文",
            "kor" to "韩文",
            "ko" to "韩文",
        )
    }

    private val handler = Handler(Looper.getMainLooper())

    /** 根布局：PlayerView 承载画面，[PgsOverlayView] 叠在上面画位图字幕。 */
    private val rootView: View =
        LayoutInflater.from(context).inflate(R.layout.vidday_player_view, null)
    private val playerView: PlayerView = rootView.findViewById(R.id.vidday_player)
    private val pgsOverlay: PgsOverlayView = rootView.findViewById(R.id.vidday_pgs_overlay)

    /**
     * 保守升档：升档需攒够 [MIN_DURATION_FOR_QUALITY_INCREASE_MS] 缓冲，
     * 且只用估算带宽的 [ABR_BANDWIDTH_FRACTION] 作余量，减少「刚升上去就掉回来」的来回切换。
     */
    private val trackSelector = DefaultTrackSelector(
        context,
        AdaptiveTrackSelection.Factory(
            MIN_DURATION_FOR_QUALITY_INCREASE_MS,
            MAX_DURATION_FOR_QUALITY_DECREASE_MS,
            MIN_DURATION_TO_RETAIN_AFTER_DISCARD_MS,
            ABR_BANDWIDTH_FRACTION,
        ),
    )

    private val player: ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                DefaultDataSource.Factory(
                    context,
                    DefaultHttpDataSource.Factory().setUserAgent(USER_AGENT),
                ),
            )
                // 分片失败重试次数：ExoPlayer 默认仅 3 次，瞬时抖动容易升级为致命错误
                .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(MIN_LOADABLE_RETRY_COUNT)),
        )
        .setTrackSelector(trackSelector)
        .setLoadControl(
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    MIN_BUFFER_MS,
                    MAX_BUFFER_MS,
                    BUFFER_FOR_PLAYBACK_MS,
                    AFTER_REBUFFER_MS,
                )
                .setTargetBufferBytes(TARGET_BUFFER_BYTES)
                .setBackBuffer(BACK_BUFFER_MS, false)
                .build(),
        )
        .build()

    private var released = false
    private var inPip = false
    private var errorMessage: String? = null
    private var videoWidth = 0
    private var videoHeight = 0
    private val pipSupported: Boolean

    private var muted = false

    private var audioTracks: List<Map<String, Any?>> = emptyList()
    private var videoTracks: List<Map<String, Any?>> = emptyList()
    private var textTracks: List<Map<String, Any?>> = emptyList()

    /** 外挂 PGS 轨（来自 `pgs-subs/index.json`），不进 ExoPlayer，由覆盖层自己画。 */
    private var pgsTracks: List<PgsTrack> = emptyList()
    private var selectedPgsId: String? = null

    /** 按访问序淘汰：单份 `.sup` 最大 137MB，留最近两份，切换时不必重下。 */
    private val pgsTrackCache = LinkedHashMap<String, PgsSubtitleTrack>(4, 0.75f, true)

    /** 正在显示的那份，淘汰时要避开（否则会把正在渲染的文件删掉）。 */
    private var activePgsTrack: PgsSubtitleTrack? = null

    /** 同一时刻只跑一路下载：切字幕时掐掉上一路，避免几个上百 MB 的文件并发。 */
    private var pgsDownload: HttpURLConnection? = null

    /** 外挂字幕下载进度，供 Flutter 侧显示「加载中… X%」。 */
    private var pgsLoading: PgsLoading? = null

    private val ticker = object : Runnable {
        override fun run() {
            if (released) return
            emitState()
            handler.postDelayed(this, TICK_MS)
        }
    }

    init {
        playerView.player = player
        playerView.keepScreenOn = true
        pgsOverlay.player = player
        player.addListener(this)
        pipSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        load()
        handler.postDelayed(ticker, TICK_MS)
    }

    override fun getView(): View = rootView

    override fun dispose() {
        if (released) return
        released = true
        handler.removeCallbacksAndMessages(null)
        showPgsTrack(null)
        pgsDownload?.disconnect()
        player.removeListener(this)
        playerView.player = null
        player.release()
        // close() 会一并删掉缓存目录里的 .sup
        pgsTrackCache.values.forEach { it.close() }
        pgsTrackCache.clear()
    }

    // ---------------------------------------------------------------- 加载

    private fun load() {
        val url = params["url"] as? String
        if (url.isNullOrBlank()) {
            errorMessage = "播放地址为空"
            emitState()
            return
        }
        val pgsIndexUrl = params["pgsIndexUrl"] as? String
        val autoplay = params["autoplay"] as? Boolean ?: true
        Log.i(TAG, "起播 url=$url pgsIndex=$pgsIndexUrl")

        // index.json 很小，但仍是网络请求，放到后台线程避免阻塞首帧。
        Thread {
            pgsTracks = if (pgsIndexUrl.isNullOrBlank()) emptyList() else fetchPgsTracks(pgsIndexUrl)
            Log.i(TAG, "PGS 外挂字幕轨数量=${pgsTracks.size}")
            handler.post {
                if (released) return@post
                player.setMediaItem(MediaItem.Builder().setUri(url).build())
                player.playWhenReady = autoplay
                player.prepare()
                rebuildTracks()
                emitState()
            }
        }.start()
    }

    /** 外挂 PGS 轨：id 带 [PGS_KEY_PREFIX]，与 ExoPlayer 内嵌字幕轨区分。 */
    private class PgsTrack(val id: String, val label: String, val url: String)

    /**
     * 一路下载的进度。
     *
     * 每次下载独立一个实例：切字幕会掐掉上一路，若共用一个可变字段，旧线程的收尾会把
     * 新一路的进度 / 提示清掉。
     */
    private class PgsLoading(val label: String) {
        @Volatile var done = 0L
        @Volatile var total = 0L
    }

    /** 拉取与 master.m3u8 同级的 `pgs-subs/index.json`，转成可选的字幕轨。 */
    private fun fetchPgsTracks(indexUrl: String): List<PgsTrack> {
        return try {
            val connection = URL(indexUrl).openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            val status = connection.responseCode
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            val base = indexUrl.substringBeforeLast('/', "") + "/"
            val entries = JSONArray(text)
            Log.i(TAG, "清单 $indexUrl → HTTP $status，条目 ${entries.length()} 个")
            val result = mutableListOf<PgsTrack>()
            for (i in 0 until entries.length()) {
                val entry = entries.optJSONObject(i) ?: continue
                val file = entry.optString("file")
                if (file.isEmpty()) continue
                val absolute = if (file.startsWith("http")) file else base + file
                val label = pgsLabel(entry)
                Log.i(TAG, "  PGS 轨 lang=${entry.optString("lang", "und")} label=$label url=$absolute")
                result.add(PgsTrack(PGS_KEY_PREFIX + file, label, absolute))
            }
            result
        } catch (error: Exception) {
            // 该片源没有 PGS 清单属正常情况，但下载 / 解析失败必须留痕，否则只能看到「没字幕」
            Log.w(TAG, "PGS 清单拉取失败：$indexUrl", error)
            emptyList()
        }
    }

    /**
     * 把 `.sup` 流式落到缓存目录。
     *
     * 不能整个读进堆：Top Gun 那类片源单份就有 137MB，`InputStream.readBytes()` 会先在
     * `ByteArrayOutputStream` 里涨到 256MB 再复制一份，实测直接 OOM 崩掉进程。
     */
    private fun downloadPgsFile(
        target: File,
        connection: HttpURLConnection,
        loading: PgsLoading,
    ) {
        try {
            connection.connectTimeout = 10_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            val declared = connection.contentLength.toLong()
            loading.total = declared
            var written = 0L
            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        written += read
                        loading.done = written
                    }
                }
            }
            if (declared > 0L && written != declared) {
                throw IOException("长度不符：收到 $written，声明 $declared")
            }
        } finally {
            if (pgsDownload === connection) pgsDownload = null
            connection.disconnect()
        }
    }

    /** 选中某条 PGS 轨后，下载并解析好再交给覆盖层。 */
    private fun activatePgsTrack(id: String) {
        val track = pgsTracks.firstOrNull { it.id == id } ?: return
        pgsTrackCache[track.url]?.let { cached ->
            Log.i(TAG, "PGS 字幕命中缓存：${cached.eventCount} 条呈现")
            pgsLoading = null
            showPgsTrack(cached)
            return
        }
        // 切字幕时掐掉上一路下载，避免几个上百 MB 的文件并发
        pgsDownload?.disconnect()
        val connection = URL(track.url).openConnection() as HttpURLConnection
        pgsDownload = connection
        val loading = PgsLoading(track.label)
        pgsLoading = loading
        val target = File(context.cacheDir, "pgs-${System.nanoTime()}.sup")
        Thread {
            var source: FilePgsSource? = null
            var loaded: PgsSubtitleTrack? = null
            try {
                downloadPgsFile(target, connection, loading)
                Log.i(TAG, "PGS 字幕下载完成 ${target.length()} 字节：${track.url}")
                source = FilePgsSource(target)
                loaded = PgsSubtitleTrack.parse(source)
            } catch (error: Throwable) {
                // 后台线程里的任何失败都只当「这条字幕不可用」，不能把整个 app 带崩
                Log.w(TAG, "PGS 字幕加载失败：${track.url}", error)
            }
            val result = loaded
            if (result == null) {
                if (source != null) source.close() else target.delete()
            }
            handler.post {
                // 期间可能已经切走或被换掉，只清掉自己那一路的进度
                if (pgsLoading === loading) pgsLoading = null
                // 退出播放页则直接丢弃
                if (released) {
                    result?.close()
                    return@post
                }
                if (result == null) {
                    Log.w(TAG, "PGS 字幕不可用：${track.url}")
                    emitState()
                    return@post
                }
                Log.i(TAG, "PGS 字幕就绪：${result.eventCount} 条呈现")
                cachePgsTrack(track.url, result)
                // 用户可能已经切到别的字幕了，那就只留在缓存里
                if (selectedPgsId == id) showPgsTrack(result)
                emitState()
            }
        }.start()
    }

    /** 最近两份留在磁盘上；淘汰时避开正在显示的那份。 */
    private fun cachePgsTrack(url: String, track: PgsSubtitleTrack) {
        val previous = pgsTrackCache.put(url, track)
        if (previous != null && previous !== track) previous.close()
        while (pgsTrackCache.size > PGS_TRACK_CACHE_LIMIT) {
            val oldest = pgsTrackCache.entries.firstOrNull { it.value !== activePgsTrack } ?: break
            pgsTrackCache.remove(oldest.key)
            oldest.value.close()
        }
    }

    /** 切换覆盖层显示的字幕轨，并记住「正在显示哪份」，供缓存淘汰避让。 */
    private fun showPgsTrack(track: PgsSubtitleTrack?) {
        activePgsTrack = track
        pgsOverlay.setTrack(track)
    }

    /** 与 Web 端 pgsTrackLabel 同规则：语种藏在文件名末段（如 `.chs&eng`），识别不出再回退原名。 */
    private fun pgsLabel(entry: JSONObject): String {
        val name = entry.optString("name").trim()
        val file = entry.optString("file").trim()
        for (candidate in listOf(name, file)) {
            if (candidate.isEmpty()) continue
            val tokens = candidate.lowercase().substringAfterLast('.').split('&')
            val labels = tokens.mapNotNull { LANG_LABELS[it] }
            if (labels.isNotEmpty()) return "${labels.joinToString(" + ")}（PGS）"
        }
        val fallback = if (name.isNotEmpty()) name else file
        return "$fallback（PGS）"
    }

    // ---------------------------------------------------------------- 播放控制

    fun play() {
        if (player.playbackState == Player.STATE_ENDED) player.seekTo(0)
        player.play()
        emitState()
    }

    fun pause() {
        player.pause()
        emitState()
    }

    fun seekTo(position: Long) {
        player.seekTo(max(position, 0L))
        emitState()
    }

    fun seekBy(delta: Long) {
        val duration = player.duration
        var target = player.currentPosition + delta
        if (target < 0) target = 0
        if (duration != C.TIME_UNSET && target > duration) target = duration
        player.seekTo(target)
        emitState()
    }

    fun setVolume(value: Float) {
        val clamped = value.coerceIn(0f, 1f)
        muted = clamped == 0f
        player.volume = clamped
        emitState()
    }

    fun setSpeed(value: Float) {
        player.setPlaybackSpeed(value.coerceIn(0.25f, 4f))
        emitState()
    }

    fun retry() {
        errorMessage = null
        player.prepare()
        emitState()
    }

    fun setInPip(value: Boolean) {
        inPip = value
    }

    // ---------------------------------------------------------------- 轨道选择

    fun selectAudio(id: String?) {
        val builder = player.trackSelectionParameters.buildUpon()
        val override = id?.let { resolveOverride(C.TRACK_TYPE_AUDIO, it) }
        if (override != null) {
            builder.setOverrideForType(override)
        } else {
            builder.clearOverridesOfType(C.TRACK_TYPE_AUDIO)
        }
        player.trackSelectionParameters = builder.build()
        emitState()
    }

    /** id 为 "auto" 或空表示交回 ABR 自适应码率。 */
    fun selectVideo(id: String?) {
        val builder = player.trackSelectionParameters.buildUpon()
        val override = if (id.isNullOrBlank() || id == "auto") {
            null
        } else {
            resolveOverride(C.TRACK_TYPE_VIDEO, id)
        }
        if (override != null) {
            builder.setOverrideForType(override)
        } else {
            builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO)
        }
        player.trackSelectionParameters = builder.build()
        emitState()
    }

    /** id 为空表示关闭字幕；`pgs:` 开头的走自建覆盖层，其余走 ExoPlayer 内嵌文本轨。 */
    fun selectSubtitle(id: String?) {
        val builder = player.trackSelectionParameters.buildUpon()
        if (id != null && id.startsWith(PGS_KEY_PREFIX)) {
            // PGS 交给覆盖层自己画，同时关掉 ExoPlayer 文本轨，避免它再拉一份 .sup
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            player.trackSelectionParameters = builder.build()
            selectedPgsId = id
            Log.i(TAG, "选中 PGS 字幕 id=$id")
            activatePgsTrack(id)
        } else {
            selectedPgsId = null
            pgsLoading = null
            showPgsTrack(null)
            if (id.isNullOrBlank()) {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                Log.i(TAG, "关闭字幕")
            } else {
                val override = resolveOverride(C.TRACK_TYPE_TEXT, id)
                if (override != null) {
                    builder.setOverrideForType(override)
                    builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                }
                Log.i(TAG, "选中字幕 id=$id 解析成功=${override != null}")
            }
            player.trackSelectionParameters = builder.build()
        }
        rebuildTracks()
        emitState()
    }

    private fun resolveOverride(type: Int, id: String): TrackSelectionOverride? {
        val parts = id.split(':')
        if (parts.size != 2) return null
        val groupIndex = parts[0].toIntOrNull() ?: return null
        val trackIndex = parts[1].toIntOrNull() ?: return null
        val groups = player.currentTracks.groups
        if (groupIndex !in groups.indices) return null
        val group = groups[groupIndex]
        if (group.type != type) return null
        if (trackIndex !in 0 until group.length) return null
        return TrackSelectionOverride(group.mediaTrackGroup, trackIndex)
    }

    private fun rebuildTracks() {
        audioTracks = buildTracks(C.TRACK_TYPE_AUDIO)
        videoTracks = buildTracks(C.TRACK_TYPE_VIDEO)
        // 外挂 PGS 不在 ExoPlayer 里，这里补进字幕列表，UI 才能选到
        val selectedPgs = selectedPgsId
        textTracks = buildTracks(C.TRACK_TYPE_TEXT) + pgsTracks.map { pgs ->
            mapOf<String, Any?>(
                "id" to pgs.id,
                "label" to pgs.label,
                "selected" to (pgs.id == selectedPgs),
                "language" to null,
                "height" to null,
            )
        }
        Log.i(
            TAG,
            "轨道 音=${audioTracks.size} 画=${videoTracks.size} 字幕=${textTracks.size} " +
                "字幕项=${textTracks.map { it["label"] }}",
        )
    }

    private fun buildTracks(type: Int): List<Map<String, Any?>> {
        val override = player.trackSelectionParameters.overrides.values
            .firstOrNull { it.mediaTrackGroup.type == type }
        val groups = player.currentTracks.groups
        val result = mutableListOf<Map<String, Any?>>()
        for (groupIndex in groups.indices) {
            val group = groups[groupIndex]
            if (group.type != type) continue
            for (trackIndex in 0 until group.length) {
                val format = group.getTrackFormat(trackIndex)
                val selected = if (override == null) {
                    group.isTrackSelected(trackIndex)
                } else {
                    override.mediaTrackGroup == group.mediaTrackGroup &&
                        override.trackIndices.contains(trackIndex)
                }
                result.add(
                    mapOf<String, Any?>(
                        "id" to "$groupIndex:$trackIndex",
                        "label" to trackLabel(type, format),
                        "selected" to selected,
                        "height" to format.height.takeIf { it > 0 },
                        "language" to format.language,
                    ),
                )
            }
        }
        return result
    }

    private fun trackLabel(type: Int, format: Format): String {
        if (type == C.TRACK_TYPE_VIDEO) {
            val height = format.height
            return if (height > 0) "${height}P" else (format.label ?: "默认画质")
        }
        format.label?.takeIf { it.isNotBlank() }?.let { return it }
        val language = format.language?.lowercase()
        if (language != null) {
            val name = LANG_LABELS[language] ?: LANG_LABELS[language.substringBefore('-')]
            if (name != null) return name
        }
        return if (type == C.TRACK_TYPE_AUDIO) "音轨" else "字幕"
    }

    // ---------------------------------------------------------------- 画中画

    fun enterPip(): Boolean {
        if (!pipSupported || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        val width = if (videoWidth > 0) videoWidth else 16
        val height = if (videoHeight > 0) videoHeight else 9
        return try {
            activity.enterPictureInPictureMode(
                PictureInPictureParams.Builder().setAspectRatio(Rational(width, height)).build(),
            )
        } catch (_: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------- 状态上报

    override fun onEvents(player: Player, events: Player.Events) {
        if (events.containsAny(Player.EVENT_TRACKS_CHANGED)) rebuildTracks()
        emitState()
    }

    override fun onPlayerError(error: PlaybackException) {
        Log.w(TAG, "播放错误 code=${error.errorCodeName} msg=${error.message}", error)
        errorMessage = error.message ?: error.errorCodeName
        emitState()
    }

    override fun onVideoSizeChanged(videoSize: VideoSize) {
        videoWidth = videoSize.width
        videoHeight = videoSize.height
        pgsOverlay.setVideoSize(videoSize.width, videoSize.height)
        emitState()
    }

    fun emitState() {
        if (released) return
        val duration = player.duration
        val hasVideoOverride = player.trackSelectionParameters.overrides.values
            .any { it.mediaTrackGroup.type == C.TRACK_TYPE_VIDEO }
        emit(
            mapOf<String, Any?>(
                "position" to player.currentPosition,
                "duration" to if (duration == C.TIME_UNSET) 0L else max(duration, 0L),
                "buffered" to player.bufferedPosition,
                "isPlaying" to player.isPlaying,
                "isBuffering" to (player.playbackState == Player.STATE_BUFFERING),
                "hasEnded" to (player.playbackState == Player.STATE_ENDED),
                "volume" to player.volume.toDouble(),
                "muted" to muted,
                "speed" to player.playbackParameters.speed.toDouble(),
                "videoWidth" to videoWidth,
                "videoHeight" to videoHeight,
                "error" to errorMessage,
                "inPip" to inPip,
                "pipSupported" to pipSupported,
                "autoQuality" to !hasVideoOverride,
                "audioTracks" to audioTracks,
                "videoTracks" to videoTracks,
                "textTracks" to textTracks,
                "subtitleLoading" to pgsLoading?.let { loading ->
                    mapOf<String, Any?>(
                        "label" to loading.label,
                        // 没拿到 Content-Length 时给 -1，Flutter 侧显示不确定进度
                        "progress" to if (loading.total > 0L) {
                            loading.done.toDouble() / loading.total
                        } else {
                            -1.0
                        },
                    )
                },
            ),
        )
    }
}
