package com.kwy404.sigil.control

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/**
 * A small panel at the top of the screen for voice requests made while
 * another app is in front: what Sigil heard, the question it asks and the
 * microphone level. It never takes touches or focus. Like the cursor, it uses
 * the accessibility overlay when the service runs and the application overlay
 * otherwise.
 */
class PromptOverlay(private val context: Context) {
  private val handler = Handler(Looper.getMainLooper())
  private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var view: PromptView? = null

  private val usesAccessibilityWindow: Boolean
    get() = context is AccessibilityService

  fun canShow(): Boolean = usesAccessibilityWindow || (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(context))

  /** Shows or updates the panel. level is 0 to 1, or negative to hide the meter. tone is info, listening, question or warning. */
  fun show(title: String, message: String, level: Float, tone: String): Boolean {
    if (!canShow()) return false
    handler.post {
      val current = view ?: attach() ?: return@post
      current.update(title, message, level, tone)
    }
    return true
  }

  fun setLevel(level: Float) {
    handler.post { view?.setLevel(level) }
  }

  fun hide() {
    handler.post {
      val current = view ?: return@post
      view = null
      try {
        windowManager.removeView(current)
      } catch (ignored: RuntimeException) {
        // Already removed together with its window.
      }
    }
  }

  private fun attach(): PromptView? {
    val type = if (usesAccessibilityWindow) {
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP
    params.y = (context.resources.displayMetrics.density * TOP_MARGIN_DP).toInt()
    if (!usesAccessibilityWindow) {
      params.alpha = 0.8f
    }
    val prompt = PromptView(context)
    return try {
      windowManager.addView(prompt, params)
      view = prompt
      prompt
    } catch (error: RuntimeException) {
      null
    }
  }

  companion object {
    private const val TOP_MARGIN_DP = 40f
  }
}

private class PromptView(context: Context) : View(context) {
  private val density = context.resources.displayMetrics.density
  private val scaled = context.resources.displayMetrics.scaledDensity
  private val margin = 16 * density
  private val padding = 14 * density
  private val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(240, 11, 17, 32) }
  private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 1.5f * density
  }
  private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 13 * scaled
    typeface = Typeface.DEFAULT_BOLD
  }
  private val messagePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 16 * scaled
    color = Color.rgb(232, 238, 246)
  }
  private val meterTrack = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(60, 186, 214, 255) }
  private val meterFill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var title = ""
  private var message = ""
  private var level = -1f
  private var titleLayout: StaticLayout? = null
  private var messageLayout: StaticLayout? = null

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun update(title: String, message: String, level: Float, tone: String) {
    this.title = title
    this.message = message
    this.level = level
    val color = when (tone) {
      "question", "warning" -> Color.rgb(255, 196, 107)
      else -> Color.rgb(94, 242, 223)
    }
    titlePaint.color = color
    border.color = color
    meterFill.color = color
    titleLayout = null
    messageLayout = null
    requestLayout()
    invalidate()
  }

  fun setLevel(value: Float) {
    level = value
    invalidate()
  }

  private fun layoutText(text: String, paint: TextPaint, width: Int): StaticLayout =
    StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setMaxLines(4)
      .build()

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val inner = (width - 2 * margin - 2 * padding).toInt().coerceAtLeast(1)
    val titleText = layoutText(title, titlePaint, inner).also { titleLayout = it }
    val messageText = layoutText(message, messagePaint, inner).also { messageLayout = it }
    val meter = if (level >= 0f) 14 * density else 0f
    val height = padding * 2 + titleText.height + 6 * density + messageText.height + meter
    setMeasuredDimension(width, height.toInt())
  }

  override fun onDraw(canvas: Canvas) {
    box.set(margin, 0f, width - margin, height.toFloat())
    val radius = 18 * density
    canvas.drawRoundRect(box, radius, radius, background)
    canvas.drawRoundRect(box, radius, radius, border)
    var y = padding
    titleLayout?.let { layout ->
      canvas.save()
      canvas.translate(margin + padding, y)
      layout.draw(canvas)
      canvas.restore()
      y += layout.height + 6 * density
    }
    messageLayout?.let { layout ->
      canvas.save()
      canvas.translate(margin + padding, y)
      layout.draw(canvas)
      canvas.restore()
      y += layout.height
    }
    if (level >= 0f) {
      val top = y + 8 * density
      val left = margin + padding
      val right = width - margin - padding
      val bar = 4 * density
      canvas.drawRoundRect(left, top, right, top + bar, bar / 2, bar / 2, meterTrack)
      canvas.drawRoundRect(left, top, left + (right - left) * level.coerceIn(0f, 1f), top + bar, bar / 2, bar / 2, meterFill)
    }
  }
}
