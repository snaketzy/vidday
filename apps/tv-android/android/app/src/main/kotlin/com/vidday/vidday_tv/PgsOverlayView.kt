package com.vidday.vidday_tv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.View
import androidx.media3.common.Player
import androidx.media3.common.text.Cue

/**
 * PGS 位图字幕覆盖层，叠在 `PlayerView` 之上。
 *
 * [PgsSubtitleTrack] 里的位图是按「1920×1080 视频平面」的分数坐标给的，而 `PlayerView`
 * 用 `resize_mode="fit"` 留黑边，因此这里先把视图内真正的画面区域算出来（`contentRect`），
 * 再把字幕按同比例贴上去，保证缩放 / 旋转后位置一致。
 */
class PgsOverlayView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {

    private companion object {
        /** 字幕跟随播放进度的刷新间隔：100ms 内的时间误差肉眼不可见，开销可忽略。 */
        const val TICK_MS = 80L
    }

    /** 由 [NativePlayerView] 注入，用于读当前播放位置。 */
    var player: Player? = null

    private val handler = Handler(Looper.getMainLooper())
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val destination = RectF()

    private var track: PgsSubtitleTrack? = null
    private var cue: Cue? = null
    private var videoWidth = 0
    private var videoHeight = 0

    private val ticker = object : Runnable {
        override fun run() {
            refresh()
            handler.postDelayed(this, TICK_MS)
        }
    }

    /** 选中的 PGS 轨；传 null 表示关闭字幕。 */
    fun setTrack(value: PgsSubtitleTrack?) {
        track = value
        cue = null
        if (value == null) {
            handler.removeCallbacks(ticker)
        } else {
            handler.removeCallbacks(ticker)
            handler.post(ticker)
        }
        invalidate()
    }

    /** 画面尺寸变化（含旋转 / 切分辨率）后重新计算贴合区域。 */
    fun setVideoSize(width: Int, height: Int) {
        videoWidth = width
        videoHeight = height
        invalidate()
    }

    private fun refresh() {
        val currentTrack = track ?: return
        val currentPlayer = player ?: return
        if (currentPlayer.playbackState == Player.STATE_IDLE) return
        val next = if (width == 0 || height == 0) {
            null
        } else {
            currentTrack.cueAt(currentPlayer.currentPosition * 1000L)
        }
        if (next !== cue) {
            cue = next
            invalidate()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        handler.removeCallbacks(ticker)
    }

    @SuppressLint("DrawAllocation")
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bitmap = cue?.bitmap ?: return
        val current = cue ?: return
        val content = contentRect()
        val contentWidth = content.width()
        val contentHeight = content.height()
        if (contentWidth <= 0f || contentHeight <= 0f) return

        val drawWidth =
            if (current.size != Cue.DIMEN_UNSET) current.size * contentWidth else bitmap.width.toFloat()
        val drawHeight = if (current.bitmapHeight != Cue.DIMEN_UNSET) {
            current.bitmapHeight * contentHeight
        } else {
            drawWidth * bitmap.height / bitmap.width
        }
        val left = if (current.position != Cue.DIMEN_UNSET) {
            content.left + current.position * contentWidth
        } else {
            content.left
        }
        val top = if (current.lineType == Cue.LINE_TYPE_FRACTION && current.line != Cue.DIMEN_UNSET) {
            content.top + current.line * contentHeight
        } else {
            content.top
        }

        destination.set(left, top, left + drawWidth, top + drawHeight)
        canvas.drawBitmap(bitmap, null, destination, paint)
    }

    /** `fit` 模式下画面对齐到视图内的哪个矩形（四周补黑边）。 */
    private fun contentRect(): RectF {
        val viewWidth = width.toFloat()
        val viewHeight = height.toFloat()
        if (videoWidth <= 0 || videoHeight <= 0 || viewWidth <= 0f || viewHeight <= 0f) {
            return RectF(0f, 0f, viewWidth, viewHeight)
        }
        val videoAspect = videoWidth.toFloat() / videoHeight
        val viewAspect = viewWidth / viewHeight
        return if (viewAspect > videoAspect) {
            val fitted = viewHeight * videoAspect
            val left = (viewWidth - fitted) / 2f
            RectF(left, 0f, left + fitted, viewHeight)
        } else {
            val fitted = viewWidth / videoAspect
            val top = (viewHeight - fitted) / 2f
            RectF(0f, top, viewWidth, top + fitted)
        }
    }
}
