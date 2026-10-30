package com.kwy404.sigil.control

import android.os.SystemClock
import android.util.Log

/** Counts events in whole seconds, so a figure polled once a second stays steady. */
internal class PerSecond {
  private var second = -1L
  private var count = 0
  private var previous = 0
  private var total = 0L

  @Synchronized
  fun hit() {
    val now = SystemClock.uptimeMillis() / 1000
    if (now != second) {
      previous = if (now == second + 1) count else 0
      second = now
      count = 0
    }
    count++
    total++
  }

  /** Events in the last whole second. */
  @Synchronized
  fun rate(): Int {
    val now = SystemClock.uptimeMillis() / 1000
    return when (now) {
      second -> previous
      second + 1 -> count
      else -> 0
    }
  }

  @Synchronized
  fun total(): Long = total

  @Synchronized
  fun reset() {
    second = -1
    count = 0
    previous = 0
    total = 0
  }
}

/**
 * What the hand tracker did, for the diagnostics page and the report the user
 * can copy: frames at each stage, the model, the camera, and the last error
 * with the stage it happened in. Only numbers and messages; no image or
 * landmark is kept.
 */
object TrackerDiagnostics {
  private const val TAG = "SigilTracker"

  /** Frames CameraX delivered to the analyzer. */
  internal val cameraFrames = PerSecond()

  /** Frames converted and handed to MediaPipe. */
  internal val sentFrames = PerSecond()

  /** Results MediaPipe returned, with or without a hand. */
  internal val results = PerSecond()

  /** Results with a hand in them. */
  internal val handsFound = PerSecond()

  /** none, mediapipe, or idle when the build has no model. */
  @Volatile var pipeline: String = "none"

  @Volatile var modelLoaded = false

  @Volatile var modelLoadMs = -1L

  @Volatile var cameraId: String? = null

  /** CameraX camera state: PENDING_OPEN, OPENING, OPEN, CLOSING or CLOSED. */
  @Volatile var cameraState: String? = null

  /** Size of the upright frame MediaPipe sees. */
  @Volatile var frameWidth = 0

  @Volatile var frameHeight = 0

  /** Rotation CameraX asked for to make the frame upright. */
  @Volatile var rotationDegrees = -1

  /** Display rotation the analysis was bound with, in degrees. */
  @Volatile var targetRotation = -1

  @Volatile var lastErrorStage: String? = null

  @Volatile var lastError: String? = null

  @Volatile var lastErrorAt = 0L

  @Volatile var lastHandAt = 0L

  @Volatile var startedAt = 0L

  /** Smoothed stage times in milliseconds: frame conversion, MediaPipe, and handing the result over. */
  @Volatile var convertMs = 0.0

  @Volatile var inferenceMs = 0.0

  @Volatile var deliveryMs = 0.0

  /** gpu or cpu, chosen by TrackerTuning. */
  @Volatile var delegate = "cpu"

  @Volatile var inputSize = "640x480"

  fun ema(old: Double, sample: Double): Double = if (old == 0.0) sample else old * 0.9 + sample * 0.1

  /** Mean brightness of the last frame, 0 to 255, or -1 before the first. */
  @Volatile var brightness = -1

  /** The camera for the user: starting, ok, busy (another app holds it), disabled or error. */
  @Volatile var camera = "starting"

  /** PowerManager thermal status: 0 none, 1 light, 2 moderate, 3 severe and up. */
  @Volatile var thermal = 0

  /** Frames to MediaPipe: full, idle (no hand for a while) or hot (the phone is warm). */
  @Volatile var rate = "full"

  fun updateCamera(value: String) {
    if (camera == value) return
    camera = value
    publish()
  }

  fun updateThermal(value: Int) {
    if (thermal == value) return
    thermal = value
    publish()
  }

  fun updateRate(value: String) {
    if (rate == value) return
    rate = value
    publish()
  }

  /** Tells JavaScript the camera, heat, rate and rotation changed, for the bubble and Live. */
  fun publish() {
    SigilRuntime.emit(
      "onTrackerState",
      mapOf("camera" to camera, "thermal" to thermal, "rate" to rate, "rotation" to targetRotation),
    )
  }

  /** The last self test, as runSelfTest returned it. */
  @Volatile var selfTest: Map<String, Any?>? = null

  /** The self test feeds its own frames; camera frames wait meanwhile. */
  @Volatile var selfTestRunning = false

  /** An error and its causes in one line, so the root cause shows in the diagnostics and the report. */
  fun describe(error: Throwable): String = generateSequence(error) { it.cause }.take(4).joinToString(" <- ") { failure ->
    failure.message?.let { "${failure.javaClass.simpleName}: $it" } ?: failure.javaClass.simpleName
  }

  private var stackLogged: String? = null

  fun error(stage: String, error: Throwable) {
    val text = describe(error)
    error(stage, text)
    // The full stack once per distinct failure, for the log the emulator test keeps.
    if (text != stackLogged) {
      stackLogged = text
      Log.w(TAG, stage, error)
    }
  }

  private var loggedAt = 0L

  fun error(stage: String, message: String) {
    val now = System.currentTimeMillis()
    val repeated = stage == lastErrorStage && message.take(300) == lastError
    lastErrorStage = stage
    lastError = message.take(300)
    lastErrorAt = now
    // A failing stage can fail on every frame; the log gets it once every few seconds.
    if (!repeated || now - loggedAt > LOG_EVERY_MS) {
      loggedAt = now
      Log.w(TAG, "$stage: $message")
    }
  }

  private const val LOG_EVERY_MS = 5000L

  /** A new run of the tracker: counters from zero. The last error stays until a newer one. */
  fun begin(kind: String) {
    pipeline = kind
    cameraFrames.reset()
    sentFrames.reset()
    results.reset()
    handsFound.reset()
    modelLoaded = false
    modelLoadMs = -1
    cameraState = null
    frameWidth = 0
    frameHeight = 0
    rotationDegrees = -1
    brightness = -1
    camera = "starting"
    rate = "full"
    startedAt = System.currentTimeMillis()
    publish()
  }

  fun snapshot(): Map<String, Any?> = mapOf(
    "pipeline" to pipeline,
    "modelLoaded" to modelLoaded,
    "modelLoadMs" to modelLoadMs.toDouble(),
    "cameraId" to cameraId,
    "cameraState" to cameraState,
    "frameWidth" to frameWidth,
    "frameHeight" to frameHeight,
    "rotationDegrees" to rotationDegrees,
    "targetRotation" to targetRotation,
    "brightness" to brightness,
    "camera" to camera,
    "thermal" to thermal,
    "rate" to rate,
    "cameraFps" to cameraFrames.rate(),
    "sentFps" to sentFrames.rate(),
    "resultFps" to results.rate(),
    "handFps" to handsFound.rate(),
    "cameraFrames" to cameraFrames.total().toDouble(),
    "sentFrames" to sentFrames.total().toDouble(),
    "results" to results.total().toDouble(),
    "handsFound" to handsFound.total().toDouble(),
    "lastHandAt" to lastHandAt.toDouble(),
    "startedAt" to startedAt.toDouble(),
    "lastErrorStage" to lastErrorStage,
    "lastError" to lastError,
    "lastErrorAt" to lastErrorAt.toDouble(),
    "convertMs" to convertMs,
    "inferenceMs" to inferenceMs,
    "deliveryMs" to deliveryMs,
    "delegate" to delegate,
    "inputSize" to inputSize,
    "cursorFps" to NativeCursor.updates.rate(),
    "endToEndMs" to NativeCursor.endToEndMs,
    "selfTestRunning" to selfTestRunning,
    "selfTest" to selfTest,
  )
}
