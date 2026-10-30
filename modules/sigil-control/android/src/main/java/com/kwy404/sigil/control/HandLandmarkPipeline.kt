package com.kwy404.sigil.control

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Size
import android.view.Display
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * One tracker result: the first hand's 21 landmarks as x, y, z triples (empty
 * when no hand is seen), its score and side, every hand found, the aspect of
 * the upright frame (width over height) and its brightness from 0 to 255.
 */
class HandFrame(
  val timestampMs: Long,
  val landmarks: FloatArray,
  val score: Float,
  val handedness: String?,
  val hands: List<Map<String, Any?>>,
  val aspect: Float,
  val brightness: Int,
)

typealias HandFrameListener = (frame: HandFrame) -> Unit

/**
 * Produces hand landmarks from the front camera while the camera service
 * runs, so gestures keep working when another app is in front.
 */
interface HandLandmarkPipeline {
  fun start(listener: HandFrameListener)

  fun stop()
}

/** Used when the tracker cannot start (no model in the build): starts, emits nothing, stops. */
class IdleHandLandmarkPipeline : HandLandmarkPipeline {
  override fun start(listener: HandFrameListener) = Unit

  override fun stop() = Unit
}

/** Hand frames reach JavaScript at most 20 times a second, plus every change between hand and no hand. */
internal object JsFrames {
  private const val EVERY_MS = 50L
  private var lastAt = 0L
  private var lastHand = false

  @Synchronized
  fun admit(hand: Boolean): Boolean {
    val now = SystemClock.uptimeMillis()
    if (hand == lastHand && now - lastAt < EVERY_MS) return false
    lastAt = now
    lastHand = hand
    return true
  }
}

/** What the camera frames and the self test share: the model, the conversion, the clock and the result format. */
internal object HandFrames {
  const val MODEL_ASSET = "hand_landmarker.task"

  /** Below MediaPipe's default of 0.5, so a hand at arm's length or in dim light still counts. */
  private const val MIN_CONFIDENCE = 0.4f

  fun createLandmarker(
    context: Context,
    onResult: (HandLandmarkerResult) -> Unit,
    onError: (RuntimeException) -> Unit,
    gpu: Boolean = false,
  ): HandLandmarker {
    // Loaded into memory, so the asset may be compressed in the APK.
    val bytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
    model.put(bytes)
    model.rewind()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(if (gpu) Delegate.GPU else Delegate.CPU).build())
      .setRunningMode(RunningMode.LIVE_STREAM)
      // One: with two, palm detection runs on every frame while one hand is in view, the slowest part.
      // The size, edge and steadiness filters in JavaScript still keep out hands that are not the user's.
      .setNumHands(1)
      .setMinHandDetectionConfidence(MIN_CONFIDENCE)
      .setMinHandPresenceConfidence(MIN_CONFIDENCE)
      .setMinTrackingConfidence(MIN_CONFIDENCE)
      .setResultListener { result, _ -> onResult(result) }
      .setErrorListener { error -> onError(error) }
      .build()
    return HandLandmarker.createFromOptions(context, options)
  }

  /**
   * Turns a camera frame upright (rotate first), then mirrors it, so the
   * landmarks match what the user sees: x grows to the right of the screen and
   * y downward, as the gesture engine expects.
   */
  fun upright(raw: Bitmap, rotationDegrees: Int): Bitmap {
    val matrix = Matrix().apply {
      postRotate(rotationDegrees.toFloat())
      postScale(-1f, 1f)
    }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
  }

  /** MediaPipe refuses a timestamp that is not strictly larger than the previous one. */
  class Clock {
    private var last = 0L

    @Synchronized
    fun next(): Long {
      val now = SystemClock.uptimeMillis()
      last = if (now > last) now else last + 1
      return last
    }
  }

  /**
   * The first hand of a result as 63 floats, or an empty array. Frames are not
   * mirrored in pixels (that cost a copy per frame); x is mirrored here, so the
   * landmarks match what the user sees.
   */
  fun landmarks(result: HandLandmarkerResult): FloatArray {
    val hand = result.landmarks().firstOrNull() ?: return FloatArray(0)
    val values = FloatArray(hand.size * 3)
    for ((i, point) in hand.withIndex()) {
      values[i * 3] = 1f - point.x()
      values[i * 3 + 1] = point.y()
      values[i * 3 + 2] = point.z()
    }
    return values
  }

  fun score(result: HandLandmarkerResult): Float = result.handedness().firstOrNull()?.firstOrNull()?.score() ?: 1f

  /** MediaPipe names the side as if the frame were mirrored; it is not, so the side swaps. */
  fun side(result: HandLandmarkerResult): String? = swap(result.handedness().firstOrNull()?.firstOrNull()?.categoryName()?.lowercase())

  private fun swap(side: String?): String? = when (side) {
    "left" -> "right"
    "right" -> "left"
    else -> side
  }

  /** Every hand of a result, for JavaScript to choose the user's: landmarks, score and side. */
  fun hands(result: HandLandmarkerResult): List<Map<String, Any?>> = result.landmarks().mapIndexed { index, hand ->
    val values = ArrayList<Double>(hand.size * 3)
    for (point in hand) {
      values.add(1.0 - point.x().toDouble())
      values.add(point.y().toDouble())
      values.add(point.z().toDouble())
    }
    val category = result.handedness().getOrNull(index)?.firstOrNull()
    mapOf("landmarks" to values, "score" to (category?.score() ?: 1f).toDouble(), "handedness" to swap(category?.categoryName()?.lowercase()))
  }

  /** Mean brightness of a frame from 0 to 255, sampled on a coarse grid: enough to tell a dark room. */
  fun brightness(frame: Bitmap): Int {
    val columns = 24
    val rows = 32
    var sum = 0L
    for (row in 0 until rows) {
      val y = (frame.height * (row + 0.5f) / rows).toInt().coerceIn(0, frame.height - 1)
      for (column in 0 until columns) {
        val x = (frame.width * (column + 0.5f) / columns).toInt().coerceIn(0, frame.width - 1)
        val pixel = frame.getPixel(x, y)
        sum += (299 * ((pixel shr 16) and 0xff) + 587 * ((pixel shr 8) and 0xff) + 114 * (pixel and 0xff)) / 1000
      }
    }
    return (sum / (columns * rows)).toInt()
  }
}

/**
 * CameraX feeds about 640 by 480 frames from the front camera, keeping only
 * the latest, to MediaPipe Hand Landmarker in live stream mode. Every stage
 * counts its frames and records its errors in [TrackerDiagnostics], so a
 * phone that tracks nothing can say where the frames stop.
 * The model (hand_landmarker.task, Apache 2.0) is bundled in the assets.
 */
class MediaPipeHandPipeline(private val context: Context, private val owner: LifecycleOwner) : HandLandmarkPipeline {
  private val main = Handler(Looper.getMainLooper())
  private val clock = HandFrames.Clock()
  private var analyzer: ExecutorService? = null
  private var landmarker: HandLandmarker? = null
  private var provider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  private var lastEmptyAt = 0L
  private var bindAttempts = 0
  private var lastSentAt = 0L

  @Volatile private var lastAspect = 0.75f

  // Reused for every frame: no bitmap is allocated per frame.
  private var rawBitmap: Bitmap? = null
  private var packed: ByteBuffer? = null
  private var uprightBitmap: Bitmap? = null
  private var uprightCanvas: android.graphics.Canvas? = null
  private val turn = Matrix()
  private val bounds = android.graphics.RectF()

  /** Frames MediaPipe is working on; a new frame waits for none, so the delay never grows on slow phones. */
  private val inFlight = java.util.concurrent.atomic.AtomicInteger()

  /** Capture and send times of each frame in flight, by timestamp, for the stage timings. */
  private val times = java.util.concurrent.ConcurrentHashMap<Long, LongArray>()

  @Volatile private var lastBrightness = -1

  @Volatile private var thermal = 0

  private var thermalListener: Any? = null
  private var displayListener: DisplayManager.DisplayListener? = null

  @Volatile
  private var running = false

  override fun start(listener: HandFrameListener) {
    if (running) return
    running = true
    TrackerDiagnostics.begin("mediapipe")
    TrackerDiagnostics.cameraId = frontCameraId()
    watchThermal()
    watchRotation()
    val executor = Executors.newSingleThreadExecutor().also { analyzer = it }
    executor.execute {
      val tuning = TrackerTuning.choose(context)
      TrackerDiagnostics.inputSize = if (tuning.small) "480x360" else "640x480"
      val started = SystemClock.uptimeMillis()
      val tracker = try {
        val create = { gpu: Boolean ->
          HandFrames.createLandmarker(
            context,
            onResult = { result -> deliver(result, listener) },
            onError = { error -> TrackerDiagnostics.error("error_listener", error) },
            gpu = gpu,
          )
        }
        val created = if (tuning.gpu) runCatching { create(true) }.getOrNull() else null
        TrackerDiagnostics.delegate = if (created != null) "gpu" else "cpu"
        created ?: create(false)
      } catch (error: Throwable) {
        // Also UnsatisfiedLinkError: MediaPipe ships no native library for some
        // processors (x86_64 emulators). The service, the bubble and the cursor
        // keep working without tracking instead of the whole app ending.
        TrackerDiagnostics.error("landmarker_create", error)
        reportError(TrackerDiagnostics.describe(error))
        null
      }
      if (tracker != null) {
        TrackerDiagnostics.modelLoaded = true
        TrackerDiagnostics.modelLoadMs = SystemClock.uptimeMillis() - started
        landmarker = tracker
        main.post { bindCamera(executor) }
      }
    }
  }

  private fun reportError(message: String) {
    SigilRuntime.emit("onCameraServiceStateChanged", mapOf("running" to true, "error" to message))
  }

  private fun deliver(result: HandLandmarkerResult, listener: HandFrameListener) {
    inFlight.updateAndGet { (it - 1).coerceAtLeast(0) }
    if (!running) return
    val received = SystemClock.uptimeMillis()
    val time = times.remove(result.timestampMs())
    if (time != null) TrackerDiagnostics.inferenceMs = TrackerDiagnostics.ema(TrackerDiagnostics.inferenceMs, (received - time[1]).toDouble())
    TrackerDiagnostics.results.hit()
    val values = HandFrames.landmarks(result)
    // The cursor goes straight to the overlay, without JavaScript in its path.
    NativeCursor.onResult(values, result.timestampMs(), time?.get(0) ?: received)
    if (values.isNotEmpty()) {
      TrackerDiagnostics.handsFound.hit()
      TrackerDiagnostics.lastHandAt = System.currentTimeMillis()
    }
    HandPreview.offerLandmarks(values)
    // JavaScript gets at most 20 frames a second for gestures, and every change between hand and no hand.
    if (!JsFrames.admit(values.isNotEmpty())) return
    if (values.isEmpty()) {
      listener(HandFrame(result.timestampMs(), values, 0f, null, emptyList(), lastAspect, lastBrightness))
      TrackerDiagnostics.deliveryMs = TrackerDiagnostics.ema(TrackerDiagnostics.deliveryMs, (SystemClock.uptimeMillis() - received).toDouble())
      return
    }
    listener(
      HandFrame(
        result.timestampMs(),
        values,
        HandFrames.score(result),
        HandFrames.side(result),
        HandFrames.hands(result),
        lastAspect,
        lastBrightness,
      ),
    )
    TrackerDiagnostics.deliveryMs = TrackerDiagnostics.ema(TrackerDiagnostics.deliveryMs, (SystemClock.uptimeMillis() - received).toDouble())
  }

  /** The display rotation, so the frames come upright for the way the phone is held. */
  private fun displayRotation(): Int {
    val display = (context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager)?.getDisplay(Display.DEFAULT_DISPLAY)
    return display?.rotation ?: Surface.ROTATION_0
  }

  private fun frontCameraId(): String? = runCatching {
    val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    manager.cameraIdList.firstOrNull { id ->
      manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
    }
  }.getOrNull()

  private fun bindCamera(executor: ExecutorService) {
    if (!running) return
    bindAttempts++
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!running) return@addListener
      val cameras = try {
        future.get()
      } catch (error: Exception) {
        TrackerDiagnostics.error("camera_bind", error)
        reportError(error.message ?: "camera")
        retryBind(executor)
        return@addListener
      }
      provider = cameras
      val rotation = displayRotation()
      TrackerDiagnostics.targetRotation = rotation * 90
      val selector = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
        .setResolutionStrategy(
          ResolutionStrategy(
            if (TrackerTuning.current?.small == true) Size(480, 360) else Size(640, 480),
            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
          ),
        )
        .build()
      val useCase = ImageAnalysis.Builder()
        .setResolutionSelector(selector)
        .setTargetRotation(rotation)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()
      useCase.setAnalyzer(executor) { image -> analyze(image) }
      analysis = useCase
      try {
        cameras.unbindAll()
        val camera = cameras.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, useCase)
        camera.cameraInfo.cameraState.observe(owner) { state -> onCameraState(state, executor) }
      } catch (error: Exception) {
        TrackerDiagnostics.error("camera_bind", error)
        reportError(error.message ?: "camera")
        retryBind(executor)
      }
    }, { command -> main.post(command) })
  }

  /**
   * The camera's condition for the user: busy while another app (a video call,
   * the camera app) holds it, which CameraX waits out and reopens by itself;
   * disabled by the system; or failed, which binds again after a pause.
   */
  private fun onCameraState(state: CameraState, executor: ExecutorService) {
    TrackerDiagnostics.cameraState = state.type.name
    val failure = state.error
    if (failure != null) TrackerDiagnostics.error("camera_state", cameraErrorName(failure.code))
    val condition = when {
      state.type == CameraState.Type.OPEN -> "ok"
      failure == null -> if (state.type == CameraState.Type.CLOSED) "error" else "starting"
      failure.code == CameraState.ERROR_CAMERA_IN_USE || failure.code == CameraState.ERROR_MAX_CAMERAS_IN_USE -> "busy"
      failure.code == CameraState.ERROR_CAMERA_DISABLED || failure.code == CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED -> "disabled"
      else -> "error"
    }
    if (condition == "ok") bindAttempts = 0
    TrackerDiagnostics.updateCamera(condition)
    if (state.type == CameraState.Type.CLOSED && running && failure?.type == CameraState.ErrorType.CRITICAL) {
      bindAttempts = 0
      retryBind(executor)
    }
  }

  /** Frames slow down when the phone runs hot, instead of stuttering. */
  private fun watchThermal() {
    if (Build.VERSION.SDK_INT < 29) return
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    thermal = power.currentThermalStatus
    TrackerDiagnostics.updateThermal(thermal)
    val listener = PowerManager.OnThermalStatusChangedListener { status ->
      thermal = status
      TrackerDiagnostics.updateThermal(status)
    }
    runCatching { power.addThermalStatusListener(listener) }
    thermalListener = listener
  }

  /** A rotated phone turns the frames too, and JavaScript maps the cursor to the new screen. */
  private fun watchRotation() {
    val displays = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return
    val listener = object : DisplayManager.DisplayListener {
      override fun onDisplayAdded(displayId: Int) = Unit

      override fun onDisplayRemoved(displayId: Int) = Unit

      override fun onDisplayChanged(displayId: Int) {
        if (displayId != Display.DEFAULT_DISPLAY) return
        val rotation = displayRotation()
        if (rotation * 90 == TrackerDiagnostics.targetRotation) return
        TrackerDiagnostics.targetRotation = rotation * 90
        analysis?.targetRotation = rotation
        TrackerDiagnostics.publish()
      }
    }
    displays.registerDisplayListener(listener, main)
    displayListener = listener
  }

  /** The camera may be busy for a moment (another app closing it); try again a few times. */
  private fun retryBind(executor: ExecutorService) {
    if (running && bindAttempts < MAX_BIND_ATTEMPTS) {
      main.postDelayed({ bindCamera(executor) }, BIND_RETRY_MS)
    }
  }

  private fun analyze(image: ImageProxy) {
    TrackerDiagnostics.cameraFrames.hit()
    val tracker = landmarker
    if (tracker == null || !running || TrackerDiagnostics.selfTestRunning) {
      image.close()
      return
    }
    // Full rate while a hand is around; fewer frames after a while without one, or when the phone runs hot.
    val now = SystemClock.uptimeMillis()
    val idle = System.currentTimeMillis() - maxOf(TrackerDiagnostics.lastHandAt, TrackerDiagnostics.startedAt) > IDLE_AFTER_MS
    val gap = when {
      thermal >= PowerManager.THERMAL_STATUS_SEVERE -> HOT_GAP_MS
      thermal >= PowerManager.THERMAL_STATUS_MODERATE -> WARM_GAP_MS
      idle -> IDLE_GAP_MS
      else -> 0L
    }
    TrackerDiagnostics.updateRate(
      when {
        thermal >= PowerManager.THERMAL_STATUS_MODERATE -> "hot"
        idle -> "idle"
        else -> "full"
      },
    )
    if (now - lastSentAt < gap || inFlight.get() > 0) {
      // Dropped rather than queued: on a slow phone the next frame starts fresh, so the delay stays low.
      image.close()
      return
    }
    lastSentAt = now
    val rotation = image.imageInfo.rotationDegrees
    val frame: Bitmap = try {
      convert(image, rotation)
    } catch (error: Throwable) {
      // A frame that cannot be converted is skipped: an error thrown on this thread would end the app.
      TrackerDiagnostics.error("frame_convert", error)
      return
    } finally {
      image.close()
    }
    TrackerDiagnostics.convertMs = TrackerDiagnostics.ema(TrackerDiagnostics.convertMs, (SystemClock.uptimeMillis() - now).toDouble())
    TrackerDiagnostics.rotationDegrees = rotation
    TrackerDiagnostics.frameWidth = frame.width
    TrackerDiagnostics.frameHeight = frame.height
    lastAspect = frame.width / frame.height.toFloat()
    lastBrightness = HandFrames.brightness(frame)
    TrackerDiagnostics.brightness = lastBrightness
    HandPreview.offerFrame(frame)
    try {
      val timestamp = clock.next()
      times[timestamp] = longArrayOf(now, SystemClock.uptimeMillis())
      inFlight.incrementAndGet()
      tracker.detectAsync(BitmapImageBuilder(frame).build(), timestamp)
      TrackerDiagnostics.sentFrames.hit()
    } catch (error: RuntimeException) {
      // Also a frame that arrived while the tracker was closing.
      if (running) TrackerDiagnostics.error("detect", error)
    }
  }

  /**
   * The camera frame upright, in buffers reused from frame to frame: the RGBA
   * plane is copied into one bitmap (row by row when the rows are padded), and
   * turned into a second one when the camera is rotated. No mirroring here;
   * the landmarks are mirrored instead.
   */
  private fun convert(image: ImageProxy, rotation: Int): Bitmap {
    val width = image.width
    val height = image.height
    val plane = image.planes[0]
    val raw = rawBitmap?.takeIf { it.width == width && it.height == height }
      ?: Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { rawBitmap = it }
    val buffer = plane.buffer
    buffer.rewind()
    if (plane.rowStride == width * 4) {
      raw.copyPixelsFromBuffer(buffer)
    } else {
      val out = packed?.takeIf { it.capacity() == width * height * 4 }
        ?: ByteBuffer.allocateDirect(width * height * 4).also { packed = it }
      out.clear()
      for (row in 0 until height) {
        buffer.limit(row * plane.rowStride + width * 4)
        buffer.position(row * plane.rowStride)
        out.put(buffer)
      }
      buffer.clear()
      out.rewind()
      raw.copyPixelsFromBuffer(out)
    }
    if (rotation % 360 == 0) return raw
    val turnedWidth = if (rotation % 180 == 0) width else height
    val turnedHeight = if (rotation % 180 == 0) height else width
    val upright = uprightBitmap?.takeIf { it.width == turnedWidth && it.height == turnedHeight }
      ?: Bitmap.createBitmap(turnedWidth, turnedHeight, Bitmap.Config.ARGB_8888).also {
        uprightBitmap = it
        uprightCanvas = android.graphics.Canvas(it)
      }
    turn.reset()
    turn.postRotate(rotation.toFloat())
    bounds.set(0f, 0f, width.toFloat(), height.toFloat())
    turn.mapRect(bounds)
    turn.postTranslate(-bounds.left, -bounds.top)
    uprightCanvas?.drawBitmap(raw, turn, null)
    return upright
  }

  override fun stop() {
    if (!running) return
    running = false
    if (Build.VERSION.SDK_INT >= 29) {
      val listener = thermalListener as? PowerManager.OnThermalStatusChangedListener
      val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (listener != null && power != null) runCatching { power.removeThermalStatusListener(listener) }
    }
    thermalListener = null
    displayListener?.let { listener ->
      (context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager)?.unregisterDisplayListener(listener)
    }
    displayListener = null
    main.post {
      runCatching { provider?.unbindAll() }
      provider = null
      analysis?.clearAnalyzer()
      analysis = null
    }
    val executor = analyzer ?: return
    analyzer = null
    executor.execute {
      runCatching { landmarker?.close() }
      landmarker = null
    }
    executor.shutdown()
  }

  companion object {
    const val MODEL_ASSET = HandFrames.MODEL_ASSET
    private const val EMPTY_EVERY_MS = 100L
    private const val MAX_BIND_ATTEMPTS = 4
    private const val BIND_RETRY_MS = 2000L
    private const val IDLE_AFTER_MS = 3000L
    private const val IDLE_GAP_MS = 125L
    private const val WARM_GAP_MS = 66L
    private const val HOT_GAP_MS = 100L

    fun cameraErrorName(code: Int): String = when (code) {
      CameraState.ERROR_MAX_CAMERAS_IN_USE -> "max_cameras_in_use"
      CameraState.ERROR_CAMERA_IN_USE -> "camera_in_use"
      CameraState.ERROR_OTHER_RECOVERABLE_ERROR -> "recoverable_error"
      CameraState.ERROR_STREAM_CONFIG -> "stream_config"
      CameraState.ERROR_CAMERA_DISABLED -> "camera_disabled"
      CameraState.ERROR_CAMERA_FATAL_ERROR -> "camera_fatal_error"
      CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED -> "do_not_disturb"
      else -> "camera_error_$code"
    }
  }
}

object HandLandmarkPipelines {
  /** The MediaPipe tracker when its model is in the build, the idle pipeline otherwise. */
  fun create(context: Context, owner: LifecycleOwner): HandLandmarkPipeline {
    val bundled = try {
      context.assets.open(MediaPipeHandPipeline.MODEL_ASSET).close()
      true
    } catch (error: Exception) {
      false
    }
    if (!bundled) {
      TrackerDiagnostics.begin("idle")
      TrackerDiagnostics.error("model_missing", "hand_landmarker.task is not in this build")
      return IdleHandLandmarkPipeline()
    }
    return MediaPipeHandPipeline(context, owner)
  }
}
