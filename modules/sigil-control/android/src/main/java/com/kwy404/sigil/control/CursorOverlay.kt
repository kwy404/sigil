package com.kwy404.sigil.control

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager

enum class CursorState {
  IDLE,
  HOVER,
  PRESS,
  DRAG,

  /** The hand was lost: the cursor stays where it was, faded, until the hand returns. */
  LOST;

  companion object {
    fun from(name: String): CursorState = when (name) {
      "hover" -> HOVER
      "press" -> PRESS
      "drag" -> DRAG
      "lost" -> LOST
      else -> IDLE
    }
  }
}

/**
 * The holographic cursor drawn above every app. Inside the accessibility
 * service it uses an accessibility overlay window, which needs no extra
 * permission and lets touches through. Elsewhere it falls back to an
 * application overlay, which needs the "display over other apps" permission
 * and must stay at 0.8 opacity or less so Android 12 and later still pass
 * touches to the app below.
 *
 * The window covers the whole screen and never takes touches or focus; only
 * the drawing moves, so updates at 60 Hz cost one invalidate each.
 */
class CursorOverlay(private val context: Context) {
  private val handler = Handler(Looper.getMainLooper())
  private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var view: CursorView? = null

  val isShowing: Boolean
    get() = view != null

  private val usesAccessibilityWindow: Boolean
    get() = context is AccessibilityService

  fun canShow(): Boolean {
    if (usesAccessibilityWindow) return true
    return Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(context)
  }

  fun show(): Boolean {
    if (!canShow()) return false
    handler.post {
      if (view != null) return@post
      val type = if (usesAccessibilityWindow) {
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      }
      // A small window that moves, rather than a screen sized one redrawn on every move.
      val box = CursorView.boxPx(context)
      val params = WindowManager.LayoutParams(
        box,
        box,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
      )
      if (!usesAccessibilityWindow) {
        params.alpha = 0.8f
      }
      if (Build.VERSION.SDK_INT >= 28) {
        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
      params.gravity = android.view.Gravity.TOP or android.view.Gravity.START
      params.x = -box
      params.y = -box
      val cursorView = CursorView(context)
      try {
        windowManager.addView(cursorView, params)
        view = cursorView
        layout = params
      } catch (error: RuntimeException) {
        SigilRuntime.emit("onCursorError", mapOf("message" to (error.message ?: "addView failed")))
      }
    }
    return true
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

  private var layout: WindowManager.LayoutParams? = null

  /** Moves the cursor to screen pixel coordinates: the window moves; the drawing changes only with the state. */
  fun move(x: Float, y: Float, state: CursorState) {
    handler.post {
      val current = view ?: return@post
      val params = layout ?: return@post
      current.setState(state)
      val half = params.width / 2
      params.x = x.toInt() - half
      params.y = y.toInt() - half
      runCatching { windowManager.updateViewLayout(current, params) }
    }
  }
}

private class CursorView(context: Context) : View(context) {
  private val density = context.resources.displayMetrics.density
  private var state = CursorState.IDLE
  private var shaderRadius = -1f

  private val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = RING_STROKE_DP * density
    color = ACCENT
  }
  private val core = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.FILL
    color = CORE
  }

  fun setState(newState: CursorState) {
    if (newState == state) return
    state = newState
    alpha = if (newState == CursorState.LOST) LOST_ALPHA else 1f
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val radius = density * RING_RADIUS_DP * when (state) {
      CursorState.PRESS -> 0.7f
      CursorState.DRAG -> 0.85f
      CursorState.HOVER -> 1.15f
      CursorState.IDLE, CursorState.LOST -> 1f
    }
    val halo = radius * HALO_RADIUS_DP / RING_RADIUS_DP
    if (halo != shaderRadius) {
      shaderRadius = halo
      glow.shader = RadialGradient(cx, cy, halo, ACCENT_HALO, Color.TRANSPARENT, Shader.TileMode.CLAMP)
    }
    canvas.drawCircle(cx, cy, halo, glow)
    canvas.drawCircle(cx, cy, radius, ring)
    canvas.drawCircle(cx, cy, CORE_RADIUS_DP * density, core)
  }

  companion object {
    /** The window size: the largest halo (hover) and a margin. */
    fun boxPx(context: Context): Int = (context.resources.displayMetrics.density * (HALO_RADIUS_DP * 1.15f * 2 + 8)).toInt()

    // light.cursor and lumen colors from the SIGIL design tokens, the same values as src/ui/tokens.ts.
    private const val RING_RADIUS_DP = 14f
    private const val RING_STROKE_DP = 1.5f
    private const val CORE_RADIUS_DP = 3f
    private const val HALO_RADIUS_DP = 26f
    private const val LOST_ALPHA = 0.35f
    private val ACCENT = Color.rgb(94, 242, 223)
    private val ACCENT_HALO = Color.argb(89, 94, 242, 223)
    private val CORE = Color.rgb(239, 255, 252)
  }
}
