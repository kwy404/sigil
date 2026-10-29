package com.kwy404.sigil.control

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * A small live view of what the hand tracker sees: the front camera image as
 * the user sees it, with the landmarks and bones of the hand drawn on top, so
 * the user can find a good distance and light. Frames reach it only while it
 * is on screen and the camera service runs; nothing is stored.
 */
class HandPreviewView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val canvasView = PreviewCanvas(context)

  init {
    addView(canvasView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    HandPreview.attach(canvasView)
  }

  override fun onDetachedFromWindow() {
    HandPreview.detach(canvasView)
    super.onDetachedFromWindow()
  }
}

/** Shares the latest small frame and landmarks between the tracker thread and the visible previews. */
object HandPreview {
  private val main = Handler(Looper.getMainLooper())
  private val views = mutableSetOf<PreviewCanvas>()
  private var lastFrameAt = 0L

  @Volatile
  var wanted = false
    private set

  internal fun attach(view: PreviewCanvas) {
    synchronized(views) {
      views.add(view)
      wanted = true
    }
  }

  internal fun detach(view: PreviewCanvas) {
    synchronized(views) {
      views.remove(view)
      wanted = views.isNotEmpty()
    }
  }

  /** Called by the tracker with the upright, mirrored frame; keeps a small copy about fifteen times a second. */
  fun offerFrame(frame: Bitmap) {
    if (!wanted) return
    val now = System.currentTimeMillis()
    if (now - lastFrameAt < FRAME_EVERY_MS) return
    lastFrameAt = now
    val width = PREVIEW_WIDTH
    val height = (frame.height * width / frame.width.toFloat()).toInt().coerceAtLeast(1)
    val small = Bitmap.createScaledBitmap(frame, width, height, true)
    main.post { synchronized(views) { views.toList() }.forEach { it.showFrame(small) } }
  }

  /** Called by the tracker with the normalized landmarks of the hand, or an empty array when none is seen. */
  fun offerLandmarks(values: FloatArray) {
    if (!wanted) return
    main.post { synchronized(views) { views.toList() }.forEach { it.showLandmarks(values) } }
  }

  private const val FRAME_EVERY_MS = 66L
  private const val PREVIEW_WIDTH = 240
}

internal class PreviewCanvas(context: Context) : View(context) {
  private val density = context.resources.displayMetrics.density
  private val imagePaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val bone = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(94, 242, 223)
    strokeWidth = 2.5f * density
    strokeCap = Paint.Cap.ROUND
  }
  private val joint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(239, 255, 252) }
  private val matrix = Matrix()
  private var frame: Bitmap? = null
  private var landmarks = FloatArray(0)

  fun showFrame(bitmap: Bitmap) {
    frame = bitmap
    invalidate()
  }

  fun showLandmarks(values: FloatArray) {
    landmarks = values
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    canvas.drawColor(Color.rgb(16, 24, 43))
    val image = frame
    // The image fills the view and is cropped at the center; the landmarks follow the same mapping.
    var scale = 1f
    var dx = 0f
    var dy = 0f
    if (image != null) {
      scale = maxOf(width / image.width.toFloat(), height / image.height.toFloat())
      dx = (width - image.width * scale) / 2f
      dy = (height - image.height * scale) / 2f
      matrix.reset()
      matrix.postScale(scale, scale)
      matrix.postTranslate(dx, dy)
      canvas.drawBitmap(image, matrix, imagePaint)
    }
    val points = landmarks
    if (points.size < 63) return
    val imageWidth = (image?.width ?: width).toFloat() * scale
    val imageHeight = (image?.height ?: height).toFloat() * scale
    fun x(i: Int) = dx + points[i * 3] * imageWidth
    fun y(i: Int) = dy + points[i * 3 + 1] * imageHeight
    for ((a, b) in BONES) {
      canvas.drawLine(x(a), y(a), x(b), y(b), bone)
    }
    for (i in 0 until 21) {
      canvas.drawCircle(x(i), y(i), if (i == 4 || i == 8) 4f * density else 2.5f * density, joint)
    }
  }

  companion object {
    private val BONES = listOf(
      0 to 1, 1 to 2, 2 to 3, 3 to 4,
      0 to 5, 5 to 6, 6 to 7, 7 to 8,
      0 to 9, 9 to 10, 10 to 11, 11 to 12,
      0 to 13, 13 to 14, 14 to 15, 15 to 16,
      0 to 17, 17 to 18, 18 to 19, 19 to 20,
      5 to 9, 9 to 13, 13 to 17,
    )
  }
}
