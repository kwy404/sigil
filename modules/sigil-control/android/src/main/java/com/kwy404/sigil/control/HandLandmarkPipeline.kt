package com.kwy404.sigil.control

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
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

/** One tracker result: 21 landmarks as x, y, z triples (empty when no hand is seen), its score and side. */
typealias HandFrameListener = (timestampMs: Long, landmarks: FloatArray, score: Float, handedness: String?) -> Unit

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

/** What the camera frames and the self test share: the model, the conversion, the clock and the result format. */
internal object HandFrames {
  const val MODEL_ASSET = "hand_landmarker.task"

  /** Below MediaPipe's default of 0.5, so a hand at arm's length or in dim light still counts. */
  private const val MIN_CONFIDENCE = 0.4f

  fun createLandmarker(
    context: Context,
    onResult: (HandLandmarkerResult) -> Unit,
    onError: (RuntimeException) -> Unit,
  ): HandLandmarker {
    // Loaded into memory, so the asset may be compressed in the APK.
    val bytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
    model.put(bytes)
    model.rewind()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(Delegate.CPU).build())
      .setRunningMode(RunningMode.LIVE_STREAM)
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

  /** The first hand of a result as 63 floats, or an empty array. */
  fun landmarks(result: HandLandmarkerResult): FloatArray {
    val hand = result.landmarks().firstOrNull() ?: return FloatArray(0)
    val values = FloatArray(hand.size * 3)
    for ((i, point) in hand.withIndex()) {
      values[i * 3] = point.x()
      values[i * 3 + 1] = point.y()
      values[i * 3 + 2] = point.z()
    }
    return values
  }

  fun score(result: HandLandmarkerResult): Float = result.handedness().firstOrNull()?.firstOrNull()?.score() ?: 1f

  fun side(result: HandLandmarkerResult): String? = result.handedness().firstOrNull()?.firstOrNull()?.categoryName()?.lowercase()
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

  @Volatile
  private var running = false

  override fun start(listener: HandFrameListener) {
    if (running) return
    running = true
    TrackerDiagnostics.begin("mediapipe")
    TrackerDiagnostics.cameraId = frontCameraId()
    val executor = Executors.newSingleThreadExecutor().also { analyzer = it }
    executor.execute {
      val started = SystemClock.uptimeMillis()
      val tracker = try {
        HandFrames.createLandmarker(
          context,
          onResult = { result -> deliver(result, listener) },
          onError = { error -> TrackerDiagnostics.error("error_listener", error) },
        )
      } catch (error: Throwable) {
        // Also UnsatisfiedLinkError: MediaPipe ships no native library for some
        // processors (x86_64 emulators). The service, the bubble and the cursor
        // keep working without tracking instead of the whole app ending.
        TrackerDiagnostics.error("landmarker_create", error)
        reportError(error.message ?: error.javaClass.simpleName)
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
    if (!running) return
    TrackerDiagnostics.results.hit()
    val values = HandFrames.landmarks(result)
    if (values.isEmpty()) {
      // A lost hand is reported, at most ten times a second, so the gesture engine can reset.
      val now = SystemClock.uptimeMillis()
      if (now - lastEmptyAt >= EMPTY_EVERY_MS) {
        lastEmptyAt = now
        listener(result.timestampMs(), values, 0f, null)
        HandPreview.offerLandmarks(values)
      }
      return
    }
    TrackerDiagnostics.handsFound.hit()
    TrackerDiagnostics.lastHandAt = System.currentTimeMillis()
    HandPreview.offerLandmarks(values)
    listener(result.timestampMs(), values, HandFrames.score(result), HandFrames.side(result))
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
        .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
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
        camera.cameraInfo.cameraState.observe(owner) { state ->
          TrackerDiagnostics.cameraState = state.type.name
          state.error?.let { failure -> TrackerDiagnostics.error("camera_state", cameraErrorName(failure.code)) }
        }
      } catch (error: Exception) {
        TrackerDiagnostics.error("camera_bind", error)
        reportError(error.message ?: "camera")
        retryBind(executor)
      }
    }, { command -> main.post(command) })
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
    val rotation = image.imageInfo.rotationDegrees
    val frame: Bitmap = try {
      HandFrames.upright(image.toBitmap(), rotation)
    } catch (error: Throwable) {
      // A frame that cannot be converted is skipped: an error thrown on this thread would end the app.
      TrackerDiagnostics.error("frame_convert", error)
      return
    } finally {
      image.close()
    }
    TrackerDiagnostics.rotationDegrees = rotation
    TrackerDiagnostics.frameWidth = frame.width
    TrackerDiagnostics.frameHeight = frame.height
    HandPreview.offerFrame(frame)
    try {
      tracker.detectAsync(BitmapImageBuilder(frame).build(), clock.next())
      TrackerDiagnostics.sentFrames.hit()
    } catch (error: RuntimeException) {
      // Also a frame that arrived while the tracker was closing.
      if (running) TrackerDiagnostics.error("detect", error)
    }
  }

  override fun stop() {
    if (!running) return
    running = false
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
