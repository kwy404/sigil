package com.kwy404.sigil.control

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Size
import androidx.camera.core.CameraSelector
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

/**
 * CameraX feeds about 640 by 480 frames from the front camera, keeping only
 * the latest, to MediaPipe Hand Landmarker in live stream mode. Each frame is
 * turned upright and mirrored, so landmarks match what the user sees: x grows
 * to the right of the screen and y downward, as the gesture engine expects.
 * The model (hand_landmarker.task, Apache 2.0) is bundled in the assets.
 */
class MediaPipeHandPipeline(private val context: Context, private val owner: LifecycleOwner) : HandLandmarkPipeline {
  private val main = Handler(Looper.getMainLooper())
  private var analyzer: ExecutorService? = null
  private var landmarker: HandLandmarker? = null
  private var provider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  private var lastEmptyAt = 0L

  @Volatile
  private var running = false

  override fun start(listener: HandFrameListener) {
    if (running) return
    running = true
    val executor = Executors.newSingleThreadExecutor().also { analyzer = it }
    executor.execute {
      val tracker = try {
        createLandmarker(listener)
      } catch (error: Throwable) {
        // Also UnsatisfiedLinkError: MediaPipe ships no native library for some
        // processors (x86_64 emulators). The service, the bubble and the cursor
        // keep working without tracking instead of the whole app ending.
        reportError(error.message ?: error.javaClass.simpleName)
        null
      }
      if (tracker != null) {
        landmarker = tracker
        main.post { bindCamera(executor) }
      }
    }
  }

  private fun createLandmarker(listener: HandFrameListener): HandLandmarker {
    // Loaded into memory, so the asset may be compressed in the APK.
    val bytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
    model.put(bytes)
    model.rewind()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(Delegate.CPU).build())
      .setRunningMode(RunningMode.LIVE_STREAM)
      .setNumHands(1)
      .setMinHandDetectionConfidence(0.5f)
      .setMinHandPresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .setResultListener { result, _ -> deliver(result, listener) }
      .setErrorListener { error -> reportError(error.message ?: "hand tracker") }
      .build()
    return HandLandmarker.createFromOptions(context, options)
  }

  private fun reportError(message: String) {
    SigilRuntime.emit("onCameraServiceStateChanged", mapOf("running" to true, "error" to message))
  }

  private fun deliver(result: HandLandmarkerResult, listener: HandFrameListener) {
    if (!running) return
    val hands = result.landmarks()
    if (hands.isEmpty()) {
      // A lost hand is reported, at most ten times a second, so the gesture engine can reset.
      val now = SystemClock.uptimeMillis()
      if (now - lastEmptyAt >= EMPTY_EVERY_MS) {
        lastEmptyAt = now
        listener(result.timestampMs(), FloatArray(0), 0f, null)
        HandPreview.offerLandmarks(FloatArray(0))
      }
      return
    }
    val hand = hands[0]
    val values = FloatArray(hand.size * 3)
    for ((i, point) in hand.withIndex()) {
      values[i * 3] = point.x()
      values[i * 3 + 1] = point.y()
      values[i * 3 + 2] = point.z()
    }
    HandPreview.offerLandmarks(values)
    val side = result.handedness().firstOrNull()?.firstOrNull()
    listener(result.timestampMs(), values, side?.score() ?: 1f, side?.categoryName()?.lowercase())
  }

  private fun bindCamera(executor: ExecutorService) {
    if (!running) return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!running) return@addListener
      val cameras = try {
        future.get()
      } catch (error: Exception) {
        reportError(error.message ?: "camera")
        return@addListener
      }
      provider = cameras
      val selector = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
        .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
        .build()
      val useCase = ImageAnalysis.Builder()
        .setResolutionSelector(selector)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()
      useCase.setAnalyzer(executor) { image -> analyze(image) }
      analysis = useCase
      try {
        cameras.unbindAll()
        cameras.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, useCase)
      } catch (error: Exception) {
        reportError(error.message ?: "camera")
      }
    }, { command -> main.post(command) })
  }

  private fun analyze(image: ImageProxy) {
    val tracker = landmarker
    if (tracker == null || !running) {
      image.close()
      return
    }
    val frame: Bitmap = try {
      val raw = image.toBitmap()
      // Upright, then mirrored: the front camera image as the user sees it.
      val matrix = Matrix().apply {
        postRotate(image.imageInfo.rotationDegrees.toFloat())
        postScale(-1f, 1f)
      }
      Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
    } catch (error: Throwable) {
      // A frame that cannot be converted is skipped: an error thrown on this thread would end the app.
      return
    } finally {
      image.close()
    }
    HandPreview.offerFrame(frame)
    try {
      tracker.detectAsync(BitmapImageBuilder(frame).build(), SystemClock.uptimeMillis())
    } catch (error: RuntimeException) {
      // A frame arrived while the tracker was closing.
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
    const val MODEL_ASSET = "hand_landmarker.task"
    private const val EMPTY_EVERY_MS = 100L
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
    return if (bundled) MediaPipeHandPipeline(context, owner) else IdleHandLandmarkPipeline()
  }
}
