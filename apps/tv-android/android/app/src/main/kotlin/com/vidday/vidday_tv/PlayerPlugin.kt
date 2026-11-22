package com.vidday.vidday_tv

import android.app.Activity
import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory

/**
 * 播放器的原生桥。
 *
 * Flutter 侧通过 [METHOD_CHANNEL] 下发控制指令，原生通过 [EVENT_CHANNEL]
 * 持续上报播放状态与可选轨道（音轨 / 字幕 / 画质）。
 *
 * 同一时刻只会存在一个播放页，因此用单一实例而非按 viewId 索引。
 */
@OptIn(UnstableApi::class)
class PlayerPlugin(
    private val activity: Activity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        const val VIEW_TYPE = "vidday/player"
        private const val METHOD_CHANNEL = "vidday/player"
        private const val EVENT_CHANNEL = "vidday/player/events"
    }

    private val methodChannel = MethodChannel(messenger, METHOD_CHANNEL)
    private val eventChannel = EventChannel(messenger, EVENT_CHANNEL)

    private var eventSink: EventChannel.EventSink? = null
    private var view: NativePlayerView? = null

    init {
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
    }

    /** 供 MainActivity 注册到 platformViewsController。 */
    val viewFactory: PlatformViewFactory =
        object : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
            override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
                @Suppress("UNCHECKED_CAST")
                val params = (args as? Map<String, Any?>) ?: emptyMap()
                val created = NativePlayerView(activity, context, params, ::emit)
                view = created
                return created
            }
        }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val target = view
        if (target == null) {
            result.error("no_player", "播放器尚未就绪", null)
            return
        }
        when (call.method) {
            "play" -> {
                target.play()
                result.success(null)
            }
            "pause" -> {
                target.pause()
                result.success(null)
            }
            "seekTo" -> {
                target.seekTo((call.argument<Number>("position") ?: 0).toLong())
                result.success(null)
            }
            "seekBy" -> {
                target.seekBy((call.argument<Number>("delta") ?: 0).toLong())
                result.success(null)
            }
            "setVolume" -> {
                target.setVolume((call.argument<Number>("volume") ?: 1.0).toFloat())
                result.success(null)
            }
            "setSpeed" -> {
                target.setSpeed((call.argument<Number>("speed") ?: 1.0).toFloat())
                result.success(null)
            }
            "selectAudio" -> {
                target.selectAudio(call.argument<String>("id"))
                result.success(null)
            }
            "selectVideo" -> {
                target.selectVideo(call.argument<String>("id"))
                result.success(null)
            }
            "selectSubtitle" -> {
                target.selectSubtitle(call.argument<String>("id"))
                result.success(null)
            }
            "enterPip" -> result.success(target.enterPip())
            "retry" -> {
                target.retry()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        eventSink = events
        view?.emitState()
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    /** MainActivity 的 onPictureInPictureModeChanged 回调转投到这里。 */
    fun notifyPipModeChanged(inPip: Boolean) {
        val target = view ?: return
        target.setInPip(inPip)
        target.emitState()
    }

    fun dispose() {
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
        eventSink = null
        view = null
    }

    private fun emit(payload: Map<String, Any?>) {
        eventSink?.success(payload)
    }
}
