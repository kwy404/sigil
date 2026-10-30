package com.kwy404.sigil.control

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min

/**
 * Proves the hand tracker on this phone without a hand in front of it.
 * MediaPipe's own test photos of hands (bundled in assets/selftest, see
 * docs/ARCHITECTURE.md) go through camera sized frames, the same upright and
 * mirror conversion as camera frames, MediaPipe in live stream mode, and the
 * same path to JavaScript as onHandFrame, so the gesture engine and the cursor
 * see them like a real hand. Each photo is held still, then slides from left
 * to right, then gives way to an empty frame. Results carry the photo's name
 * and are marked synthetic: the cursor moves, but no gesture acts on an app.
 * Camera frames wait while the test runs.
 */
internal object TrackerSelfTest {
  const val FOLDER = "selftest"
  private const val TAG = "SigilSelfTest"
  private const val STILL_FRAMES = 24
  private const val MOVING_FRAMES = 30
  private const val GAP_FRAMES = 8
  private const val FRAME_MS = 33L
  private const val WIDTH = 480
  private const val HEIGHT = 640
  private const val SETTLE_MS = 1500L

  /** The order the photos run in: the pointing hand first, so the cursor has somewhere to start. */
  private val ORDER = listOf("pointing_up.jpg", "fist.jpg", "victory.jpg", "thumb_up.jpg", "right_hands.jpg", "left_hands.jpg")

  private class PhotoStats {
    val results = AtomicInteger()
    val hands = AtomicInteger()

    @Volatile var landmarks = 0

    @Volatile var side: String? = null

    @Volatile var score = 0f

    @Volatile var logged = false
  }

  fun photoNames(context: Context): List<String> {
    val all = context.assets.list(FOLDER)?.filter { it.endsWith(".jpg") || it.endsWith(".png") }.orEmpty()
    return all.sortedBy { name -> ORDER.indexOf(name).let { if (it < 0) ORDER.size else it } }
  }

  fun run(context: Context, done: (Map<String, Any?>) -> Unit) {
    if (TrackerDiagnostics.selfTestRunning) {
      done(mapOf("passed" to false, "error" to "busy"))
      return
    }
    TrackerDiagnostics.selfTestRunning = true
    val executor = Executors.newSingleThreadExecutor()
    executor.execute {
      val started = SystemClock.uptimeMillis()
      val names = photoNames(context)
      val stats = names.associateWith { PhotoStats() }
      val photoAt = ConcurrentHashMap<Long, String>()
      val stillAt = ConcurrentHashMap<Long, Boolean>()
      var error: String? = null
      var tracker: HandLandmarker? = null
      var brightness = -1
      var loadMs = -1L
      try {
        if (names.isEmpty()) throw IllegalStateException("no photos in assets/$FOLDER")
        val landmarker = HandFrames.createLandmarker(
          context,
          onResult = { result ->
            val name = photoAt.remove(result.timestampMs())
            val still = stillAt.remove(result.timestampMs()) == true
            val values = HandFrames.landmarks(result)
            val photo = name?.let { stats[it] }
            if (name != null && photo != null) {
              photo.results.incrementAndGet()
              if (values.isNotEmpty()) {
                photo.hands.incrementAndGet()
                photo.landmarks = values.size / 3
                photo.side = HandFrames.side(result)
                photo.score = HandFrames.score(result)
                if (still && !photo.logged) {
                  photo.logged = true
                  logFixture(name, values, photo.side, photo.score)
                }
              }
            }
            HandPreview.offerLandmarks(values)
            // The same path as camera results, marked synthetic so nothing acts on an app.
            SigilRuntime.reportHandFrame(
              result.timestampMs(),
              values,
              HandFrames.score(result),
              HandFrames.side(result),
              synthetic = true,
              fixture = name,
              hands = HandFrames.hands(result),
              aspect = WIDTH / HEIGHT.toFloat(),
              brightness = brightness,
            )
          },
          onError = { failure -> TrackerDiagnostics.error("selftest_error_listener", failure) },
        )
        tracker = landmarker
        loadMs = SystemClock.uptimeMillis() - started
        val clock = HandFrames.Clock()
        val blank = blankFrame()
        for (name in names) {
          val photo = context.assets.open("$FOLDER/$name").use { BitmapFactory.decodeStream(it) }
            ?: throw IllegalStateException("$name could not be decoded")
          for (i in 0 until STILL_FRAMES + MOVING_FRAMES + GAP_FRAMES) {
            val frame = when {
              i < STILL_FRAMES -> compose(photo, 0f)
              i < STILL_FRAMES + MOVING_FRAMES -> {
                // From a fifth of the width to the left to a fifth to the right.
                val progress = (i - STILL_FRAMES) / (MOVING_FRAMES - 1f)
                compose(photo, (progress - 0.5f) * 2f * WIDTH * 0.2f)
              }
              else -> blank
            }
            // Camera frames arrive in sensor orientation; these are already upright (rotation 0).
            val upright = HandFrames.upright(frame, 0)
            brightness = HandFrames.brightness(upright)
            HandPreview.offerFrame(upright)
            val timestamp = clock.next()
            if (i < STILL_FRAMES + MOVING_FRAMES) photoAt[timestamp] = name
            if (i < STILL_FRAMES) stillAt[timestamp] = true
            landmarker.detectAsync(BitmapImageBuilder(upright).build(), timestamp)
            Thread.sleep(FRAME_MS)
          }
        }
        Thread.sleep(SETTLE_MS)
      } catch (failure: Throwable) {
        error = failure.message ?: failure.javaClass.simpleName
        TrackerDiagnostics.error("selftest", failure)
      } finally {
        runCatching { tracker?.close() }
        TrackerDiagnostics.selfTestRunning = false
      }
      val photos = names.map { name ->
        val photo = stats.getValue(name)
        mapOf(
          "name" to name,
          "results" to photo.results.get(),
          "hands" to photo.hands.get(),
          "landmarks" to photo.landmarks,
          "handedness" to photo.side,
          "score" to photo.score.toDouble(),
        )
      }
      val passed = error == null && names.isNotEmpty() && photos.all { (it["hands"] as Int) > 0 && it["landmarks"] == 21 }
      val outcome = mapOf(
        "passed" to passed,
        "photos" to photos,
        "landmarks" to (photos.maxOfOrNull { it["landmarks"] as Int } ?: 0),
        "handsFound" to photos.sumOf { it["hands"] as Int },
        "results" to photos.sumOf { it["results"] as Int },
        "modelLoadMs" to loadMs.toDouble(),
        "totalMs" to (SystemClock.uptimeMillis() - started).toDouble(),
        "error" to error,
        "at" to System.currentTimeMillis().toDouble(),
      )
      TrackerDiagnostics.selfTest = outcome
      Log.i(TAG, "tracker ${if (passed) "PASS" else "FAIL"} ${photos.joinToString { "${it["name"]}=${it["hands"]}/${it["results"]}" }} error=$error")
      executor.shutdown()
      done(outcome)
    }
  }

  /** One line per photo with the landmarks MediaPipe returned, for the Jest fixtures. */
  private fun logFixture(name: String, values: FloatArray, side: String?, score: Float) {
    val points = values.joinToString(",") { String.format(Locale.US, "%.5f", it) }
    val handedness = side?.let { "\"$it\"" } ?: "null"
    Log.i("SigilFixture", "{\"image\":\"$name\",\"handedness\":$handedness,\"score\":${String.format(Locale.US, "%.4f", score)},\"landmarks\":[$points]}")
  }

  private fun blankFrame(): Bitmap {
    val frame = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
    Canvas(frame).drawColor(Color.rgb(40, 40, 46))
    return frame
  }

  /** The photo scaled into a camera sized frame, shifted sideways, on a dark background like a room. */
  private fun compose(photo: Bitmap, shift: Float): Bitmap {
    val frame = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(frame)
    canvas.drawColor(Color.rgb(40, 40, 46))
    val scale = min(WIDTH * 0.8f / photo.width, HEIGHT * 0.8f / photo.height)
    val width = photo.width * scale
    val height = photo.height * scale
    val left = (WIDTH - width) / 2f + shift
    val top = (HEIGHT - height) / 2f
    canvas.drawBitmap(photo, null, RectF(left, top, left + width, top + height), Paint(Paint.FILTER_BITMAP_FLAG))
    return frame
  }
}
