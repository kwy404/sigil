package com.kwy404.sigil.control

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.hypot

/** One Euro filter for one coordinate, the same as the gesture engine's (src/gesture-engine/filter.ts). */
private class OneEuro(private val minCutoff: Double = 1.5, private val beta: Double = 10.0, private val dCutoff: Double = 1.0) {
  private var x = Double.NaN
  private var dx = 0.0
  private var t = 0L

  private fun alpha(cutoff: Double, dt: Double): Double {
    val tau = 1.0 / (2 * PI * cutoff)
    return 1.0 / (1.0 + tau / dt)
  }

  fun next(value: Double, timeMs: Long): Double {
    if (x.isNaN()) {
      x = value
      t = timeMs
      return value
    }
    val dt = ((timeMs - t).coerceAtLeast(1)) / 1000.0
    t = timeMs
    val derivative = (value - x) / dt
    dx += alpha(dCutoff, dt) * (derivative - dx)
    x += alpha(minCutoff + beta * abs(dx), dt) * (value - x)
    return x
  }

  fun reset() {
    x = Double.NaN
    dx = 0.0
  }
}

/**
 * The cursor without JavaScript in its path. Each tracker result gives the
 * index tip; it is filtered (One Euro), mapped to the screen through the same
 * control box as the gesture engine, and the overlay glides toward it on every
 * display frame (Choreographer), so the cursor moves at the display rate even
 * when the tracker runs at 10 to 15 results a second. A pinch shows as a press
 * at once. JavaScript still decides what gestures do; it reads this cursor's
 * position for taps.
 */
object NativeCursor {
  /** Central 60 percent of the width and 50 percent of the height, as DEFAULT_CONTROL_BOX in src/gesture-engine/mapping.ts. */
  private const val BOX_LEFT = 0.2
  private const val BOX_TOP = 0.15
  private const val BOX_RIGHT = 0.8
  private const val BOX_BOTTOM = 0.65
  private const val GLIDE_MS = 45.0
  private const val LOST_FADE_MS = 1200L
  private const val PINCH_ENTER = 0.25
  private const val PINCH_RELEASE = 0.38

  private val main = Handler(Looper.getMainLooper())
  private val filterX = OneEuro()
  private val filterY = OneEuro()

  /** Overlay updates per second, the number the emulator test checks. */
  internal val updates = PerSecond()

  /** Draws the cursor: x, y in screen pixels and the state name; null hides it. Set by the module. */
  @Volatile var draw: ((Float, Float, String) -> Unit)? = null

  @Volatile var hide: (() -> Unit)? = null

  @Volatile var show: (() -> Unit)? = null

  /** JavaScript turns the native cursor off while paused, practicing or playing the demo hand. */
  @Volatile var enabled = false
    set(value) {
      field = value
      if (!value) main.post { stop() }
    }

  @Volatile private var targetX = Double.NaN

  @Volatile private var targetY = Double.NaN

  @Volatile private var pressed = false

  @Volatile private var lostAt = -1L

  @Volatile private var pendingCaptureAt = -1L

  private var shownX = Double.NaN
  private var shownY = Double.NaN
  private var lastFrameNanos = 0L
  private var running = false

  /** Delay from capture to the first display frame showing it, smoothed, in milliseconds. */
  @Volatile var endToEndMs = 0.0
    private set

  /** Where the cursor is on screen now, for taps; NaN when hidden. */
  val x: Double get() = shownX
  val y: Double get() = shownY

  private var screenWidth = 1080
  private var screenHeight = 2400

  fun setScreen(context: Context) {
    val metrics = context.resources.displayMetrics
    screenWidth = metrics.widthPixels
    screenHeight = metrics.heightPixels
    runCatching {
      val window = context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
      if (android.os.Build.VERSION.SDK_INT >= 30) {
        val bounds = window.maximumWindowMetrics.bounds
        screenWidth = bounds.width()
        screenHeight = bounds.height()
      }
    }
  }

  /**
   * One tracker result: 21 landmarks (x, y, z), already mirrored to the user's
   * view, or empty when the hand is lost. captureAt is when the frame left the
   * camera, in uptime milliseconds.
   */
  fun onResult(landmarks: FloatArray, timeMs: Long, captureAt: Long) {
    if (!enabled) return
    if (landmarks.size < 63) {
      if (lostAt < 0) lostAt = timeMs
      return
    }
    lostAt = -1
    val tipX = landmarks[8 * 3].toDouble()
    val tipY = landmarks[8 * 3 + 1].toDouble()
    val fx = filterX.next(tipX, timeMs)
    val fy = filterY.next(tipY, timeMs)
    targetX = ((fx - BOX_LEFT) / (BOX_RIGHT - BOX_LEFT)).coerceIn(0.0, 1.0) * screenWidth
    targetY = ((fy - BOX_TOP) / (BOX_BOTTOM - BOX_TOP)).coerceIn(0.0, 1.0) * screenHeight
    // Pinch: thumb tip to index tip over the palm size, with hysteresis, shown as a press at once.
    val palm = hypot((landmarks[9 * 3] - landmarks[0]).toDouble(), (landmarks[9 * 3 + 1] - landmarks[1]).toDouble() / 0.75)
    val pinch = hypot((landmarks[4 * 3] - landmarks[8 * 3]).toDouble(), (landmarks[4 * 3 + 1] - landmarks[8 * 3 + 1]).toDouble() / 0.75) /
      palm.coerceAtLeast(1e-6)
    pressed = if (pressed) pinch < PINCH_RELEASE else pinch < PINCH_ENTER
    pendingCaptureAt = captureAt
    main.post { start() }
  }

  private val frame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (!running) return
      val nowMs = frameTimeNanos / 1_000_000
      val lost = lostAt
      if (lost >= 0 && android.os.SystemClock.uptimeMillis() - lost > LOST_FADE_MS) {
        stop()
        return
      }
      val tx = targetX
      val ty = targetY
      if (!tx.isNaN()) {
        val dt = if (lastFrameNanos == 0L) 16.0 else (frameTimeNanos - lastFrameNanos) / 1_000_000.0
        lastFrameNanos = frameTimeNanos
        if (shownX.isNaN()) {
          shownX = tx
          shownY = ty
        } else {
          val k = 1 - exp(-dt / GLIDE_MS)
          shownX += (tx - shownX) * k
          shownY += (ty - shownY) * k
        }
        val state = when {
          lost >= 0 -> "lost"
          pressed -> "press"
          else -> "hover"
        }
        draw?.invoke(shownX.toFloat(), shownY.toFloat(), state)
        updates.hit()
        val capture = pendingCaptureAt
        if (capture > 0) {
          pendingCaptureAt = -1
          val delay = (nowMs - capture).toDouble()
          endToEndMs = if (endToEndMs == 0.0) delay else endToEndMs * 0.8 + delay * 0.2
        }
      }
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  private fun start() {
    if (running || !enabled) return
    running = true
    lastFrameNanos = 0L
    show?.invoke()
    Choreographer.getInstance().postFrameCallback(frame)
  }

  private fun stop() {
    running = false
    Choreographer.getInstance().removeFrameCallback(frame)
    targetX = Double.NaN
    targetY = Double.NaN
    shownX = Double.NaN
    shownY = Double.NaN
    pressed = false
    lostAt = -1
    filterX.reset()
    filterY.reset()
    hide?.invoke()
  }
}
