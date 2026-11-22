package com.vidday.vidday_tv

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import io.flutter.plugin.platform.PlatformView
import org.json.JSONArray
import org.json.JSONObject
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
    context: Context,
    private val params: Map<String, Any?>,
    private val emit: (Map<String, Any?>) -> Unit,
) : PlatformView, Player.Listener {

    private companion object {
        const val USER_AGENT = "Vidday/1.0 (Android)"
        const val TICK_MS = 500L

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

    private val playerView: PlayerView =
        LayoutInflater.from(context).inflate(R.layout.vidday_player_view, null) as PlayerView

    private val player: ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                DefaultDataSource.Factory(
                    context,
                    DefaultHttpDataSource.Factory().setUserAgent(USER_AGENT),
                ),
            ),
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

    private val ticker = object : Runnable {
        override fun run() {
            if (released) return
            emitState()
            handler.postDelayed(this, TICK_MS)
        }
    }

    init {
        playerView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        playerView.player = player
        playerView.keepScreenOn = true
        player.addListener(this)
        pipSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        load()
        handler.postDelayed(ticker, TICK_MS)
    }

    override fun getView(): View = playerView

    override fun dispose() {
        if (released) return
        released = true
        handler.removeCallbacksAndMessages(null)
        player.removeListener(this)
        playerView.player = null
        player.release()
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

        // index.json 很小，但仍是网络请求，放到后台线程避免阻塞首帧。
        Thread {
            val subtitles =
                if (pgsIndexUrl.isNullOrBlank()) emptyList() else fetchPgsSubtitles(pgsIndexUrl)
            handler.post {
                if (released) return@post
                val builder = MediaItem.Builder().setUri(url)
                if (subtitles.isNotEmpty()) {
                    builder.setSubtitleConfigurations(subtitles)
                }
                player.setMediaItem(builder.build())
                player.playWhenReady = autoplay
                player.prepare()
            }
        }.start()
    }

    /** 拉取与 master.m3u8 同级的 `pgs-subs/index.json`，转成外挂 PGS 字幕轨。 */
    private fun fetchPgsSubtitles(indexUrl: String): List<MediaItem.SubtitleConfiguration> {
        return try {
            val connection = URL(indexUrl).openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            val base = indexUrl.substringBeforeLast('/', "") + "/"
            val entries = JSONArray(text)
            val result = mutableListOf<MediaItem.SubtitleConfiguration>()
            for (i in 0 until entries.length()) {
                val entry = entries.optJSONObject(i) ?: continue
                val file = entry.optString("file")
                if (file.isEmpty()) continue
                val absolute = if (file.startsWith("http")) file else base + file
                result.add(
                    MediaItem.SubtitleConfiguration.Builder(Uri.parse(absolute))
                        .setMimeType(MimeTypes.APPLICATION_PGS)
                        .setLanguage(entry.optString("lang", "und"))
                        .setLabel(pgsLabel(entry))
                        .build(),
                )
            }
            result
        } catch (_: Exception) {
            // 该片源没有 PGS 清单属正常情况，静默跳过
            emptyList()
        }
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

    /** id 为空表示关闭字幕。 */
    fun selectSubtitle(id: String?) {
        val builder = player.trackSelectionParameters.buildUpon()
        if (id.isNullOrBlank()) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        } else {
            val override = resolveOverride(C.TRACK_TYPE_TEXT, id)
            if (override != null) {
                builder.setOverrideForType(override)
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            }
        }
        player.trackSelectionParameters = builder.build()
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
        textTracks = buildTracks(C.TRACK_TYPE_TEXT)
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
        errorMessage = error.message ?: error.errorCodeName
        emitState()
    }

    override fun onVideoSizeChanged(videoSize: VideoSize) {
        videoWidth = videoSize.width
        videoHeight = videoSize.height
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
            ),
        )
    }
}
