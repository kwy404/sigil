package com.kwy404.sigil.control

import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot

/** What the bubble shows. */
enum class BubbleState {
  TRACKING,
  HAND,
  LISTENING,
  PAUSED;

  companion object {
    fun from(name: String): BubbleState = when (name) {
      "hand" -> HAND
      "listening" -> LISTENING
      "paused" -> PAUSED
      else -> TRACKING
    }
  }
}

/**
 * The floating bubble over every app while Sigil runs. It shows whether Sigil
 * is tracking, sees a hand, listens or is paused. A tap opens the Control
 * Sphere; a long press opens a small menu (pause or resume, microphone, open
 * Sigil, stop). It can be dragged, snaps to the nearest side and dims when
 * nothing happens. It needs "display over other apps".
 */
class FloatingBubble(private val context: Context, private val actions: Actions) {
  interface Actions {
    fun onBubbleTap()
    fun onMenuAction(action: String)
    fun isPaused(): Boolean
    fun microphoneOn(): Boolean
  }

  private val handler = Handler(Looper.getMainLooper())
  private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val density = context.resources.displayMetrics.density
  private val size = (BUBBLE_DP * density).toInt()
  private var bubble: BubbleView? = null
  private var params: WindowManager.LayoutParams? = null
  private var menu: View? = null
  private var state = BubbleState.TRACKING
  private val dim = Runnable { bubble?.animate()?.alpha(IDLE_ALPHA)?.setDuration(400)?.start() }

  fun canShow(): Boolean = Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(context)

  fun show() {
    if (!canShow()) return
    handler.post {
      if (bubble != null) return@post
      val layout = WindowManager.LayoutParams(
        size,
        size,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
      )
      layout.gravity = Gravity.TOP or Gravity.START
      val screen = context.resources.displayMetrics
      layout.x = screen.widthPixels - size - (8 * density).toInt()
      layout.y = (screen.heightPixels * 0.35f).toInt()
      val view = BubbleView(context)
      view.setState(state)
      view.setOnTouchListener(DragListener())
      try {
        windowManager.addView(view, layout)
        bubble = view
        params = layout
        wake()
      } catch (error: RuntimeException) {
        // Without the overlay permission the bubble stays hidden.
      }
    }
  }

  fun hide() {
    handler.post {
      closeMenu()
      handler.removeCallbacks(dim)
      val view = bubble ?: return@post
      bubble = null
      params = null
      runCatching { windowManager.removeView(view) }
    }
  }

  fun setState(next: BubbleState) {
    handler.post {
      if (state == next) return@post
      state = next
      bubble?.setState(next)
      wake()
    }
  }

  /** Full opacity now, dimmed again after a while without news. */
  private fun wake() {
    val view = bubble ?: return
    handler.removeCallbacks(dim)
    view.animate().alpha(1f).setDuration(150).start()
    handler.postDelayed(dim, IDLE_MS)
  }

  private fun snapToEdge() {
    val view = bubble ?: return
    val layout = params ?: return
    val width = context.resources.displayMetrics.widthPixels
    val margin = (8 * density).toInt()
    val target = if (layout.x + size / 2 < width / 2) margin else width - size - margin
    ValueAnimator.ofInt(layout.x, target).apply {
      duration = 180
      addUpdateListener { animator ->
        layout.x = animator.animatedValue as Int
        runCatching { windowManager.updateViewLayout(view, layout) }
      }
      start()
    }
  }

  private fun openMenu() {
    closeMenu()
    val layout = params ?: return
    val panel = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      val padding = (8 * density).toInt()
      setPadding(padding, padding, padding, padding)
      background = GradientDrawable().apply {
        cornerRadius = 16 * density
        setColor(Color.argb(245, 16, 24, 43))
        setStroke((1 * density).toInt(), Color.argb(90, 94, 242, 223))
      }
    }
    val paused = actions.isPaused()
    val items = listOf(
      (if (paused) "resume" else "pause") to context.getString(if (paused) R.string.sigil_bubble_resume else R.string.sigil_bubble_pause),
      "microphone" to context.getString(if (actions.microphoneOn()) R.string.sigil_bubble_mic_off else R.string.sigil_bubble_mic_on),
      "open" to context.getString(R.string.sigil_bubble_open),
      "stop" to context.getString(R.string.sigil_bubble_stop),
    )
    for ((action, label) in items) {
      panel.addView(
        TextView(context).apply {
          text = label
          textSize = 16f
          setTextColor(if (action == "stop") Color.rgb(255, 122, 134) else Color.rgb(232, 238, 246))
          val vertical = (12 * density).toInt()
          val horizontal = (16 * density).toInt()
          setPadding(horizontal, vertical, horizontal, vertical)
          isClickable = true
          setOnClickListener {
            closeMenu()
            actions.onMenuAction(action)
          }
        },
      )
    }
    val width = context.resources.displayMetrics.widthPixels
    val menuParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT,
    )
    menuParams.gravity = Gravity.TOP or Gravity.START
    val onLeft = layout.x + size / 2 < width / 2
    menuParams.x = if (onLeft) layout.x + size + (8 * density).toInt() else maxOf(0, layout.x - (220 * density).toInt())
    menuParams.y = layout.y
    panel.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_OUTSIDE) closeMenu()
      false
    }
    try {
      windowManager.addView(panel, menuParams)
      menu = panel
      handler.postDelayed({ closeMenu() }, MENU_MS)
    } catch (error: RuntimeException) {
      menu = null
    }
  }

  private fun closeMenu() {
    val panel = menu ?: return
    menu = null
    runCatching { windowManager.removeView(panel) }
  }

  private inner class DragListener : View.OnTouchListener {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private var startX = 0f
    private var startY = 0f
    private var originX = 0
    private var originY = 0
    private var dragging = false
    private var longPressed = false
    private val longPress = Runnable {
      longPressed = true
      openMenu()
    }

    override fun onTouch(view: View, event: MotionEvent): Boolean {
      val layout = params ?: return false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          wake()
          startX = event.rawX
          startY = event.rawY
          originX = layout.x
          originY = layout.y
          dragging = false
          longPressed = false
          handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - startX
          val dy = event.rawY - startY
          if (!dragging && hypot(dx, dy) > slop) {
            dragging = true
            handler.removeCallbacks(longPress)
          }
          if (dragging) {
            layout.x = originX + dx.toInt()
            layout.y = originY + dy.toInt()
            runCatching { windowManager.updateViewLayout(view, layout) }
          }
        }
        MotionEvent.ACTION_UP -> {
          handler.removeCallbacks(longPress)
          when {
            dragging -> snapToEdge()
            !longPressed && abs(event.rawX - startX) <= slop -> actions.onBubbleTap()
          }
        }
        MotionEvent.ACTION_CANCEL -> handler.removeCallbacks(longPress)
      }
      return true
    }
  }

  companion object {
    private const val BUBBLE_DP = 56f
    private const val IDLE_MS = 4000L
    private const val MENU_MS = 6000L
    private const val IDLE_ALPHA = 0.45f

    /** Opens Sigil at a route of its own, such as control/sphere. */
    fun openSigil(context: Context, path: String) {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("sigil://$path"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      runCatching { context.startActivity(intent) }
    }
  }
}

/** The bubble itself: a dark disc with a glowing ring whose color and glyph follow the state. */
private class BubbleView(context: Context) : View(context) {
  private val density = context.resources.displayMetrics.density
  private val disc = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(235, 11, 17, 32) }
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 3 * density
  }
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bar = RectF()
  private var state = BubbleState.TRACKING

  init {
    contentDescription = "Sigil"
  }

  fun setState(next: BubbleState) {
    state = next
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    val radius = minOf(cx, cy) - 3 * density
    val color = when (state) {
      BubbleState.TRACKING -> Color.rgb(23, 184, 170)
      BubbleState.HAND -> Color.rgb(94, 242, 223)
      BubbleState.LISTENING -> Color.rgb(255, 196, 107)
      BubbleState.PAUSED -> Color.rgb(167, 179, 198)
    }
    ring.color = color
    glyph.color = color
    canvas.drawCircle(cx, cy, radius, disc)
    canvas.drawCircle(cx, cy, radius, ring)
    when (state) {
      BubbleState.PAUSED -> {
        val w = 4 * density
        val h = 14 * density
        bar.set(cx - 6 * density, cy - h / 2, cx - 6 * density + w, cy + h / 2)
        canvas.drawRoundRect(bar, w / 2, w / 2, glyph)
        bar.set(cx + 2 * density, cy - h / 2, cx + 2 * density + w, cy + h / 2)
        canvas.drawRoundRect(bar, w / 2, w / 2, glyph)
      }
      BubbleState.LISTENING -> {
        val w = 8 * density
        val h = 14 * density
        bar.set(cx - w / 2, cy - h / 2 - 2 * density, cx + w / 2, cy + h / 2 - 2 * density)
        canvas.drawRoundRect(bar, w / 2, w / 2, glyph)
        canvas.drawRect(cx - density, cy + h / 2, cx + density, cy + h / 2 + 5 * density, glyph)
      }
      BubbleState.HAND -> canvas.drawCircle(cx, cy, 8 * density, glyph)
      BubbleState.TRACKING -> {
        glyph.style = Paint.Style.STROKE
        glyph.strokeWidth = 2 * density
        canvas.drawCircle(cx, cy, 7 * density, glyph)
        glyph.style = Paint.Style.FILL
      }
    }
  }
}
