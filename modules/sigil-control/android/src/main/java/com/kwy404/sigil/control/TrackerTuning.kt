package com.kwy404.sigil.control

import android.app.ActivityManager
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.SystemClock
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Fits the tracker to the phone, once: a few timed runs on a blank frame with
 * the GPU delegate and with the CPU, the faster one wins, and a phone that
 * needs more than 35 ms a frame uses a smaller input (480 by 360). The choice
 * is remembered per device build, so later starts skip the benchmark.
 */
object TrackerTuning {
  private const val PREFS = "sigil_tracker"
  private const val SLOW_MS = 35.0

  data class Choice(val gpu: Boolean, val small: Boolean, val cpuMs: Double, val gpuMs: Double)

  @Volatile var current: Choice? = null
    private set

  fun choose(context: Context): Choice {
    current?.let { return it }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val key = Build.FINGERPRINT
    if (prefs.getString("device", null) == key) {
      val remembered = Choice(prefs.getBoolean("gpu", false), prefs.getBoolean("small", false), prefs.getFloat("cpuMs", -1f).toDouble(), prefs.getFloat("gpuMs", -1f).toDouble())
      current = remembered
      return remembered
    }
    val cpu = benchmark(context, Delegate.CPU) ?: Double.MAX_VALUE
    val gpu = benchmark(context, Delegate.GPU) ?: Double.MAX_VALUE
    val useGpu = gpu < cpu * 0.8
    val best = if (useGpu) gpu else cpu
    val lowRam = (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.isLowRamDevice == true
    val choice = Choice(useGpu, lowRam || best > SLOW_MS, cpu, gpu)
    prefs.edit()
      .putString("device", key)
      .putBoolean("gpu", choice.gpu)
      .putBoolean("small", choice.small)
      .putFloat("cpuMs", cpu.coerceAtMost(9999.0).toFloat())
      .putFloat("gpuMs", gpu.coerceAtMost(9999.0).toFloat())
      .apply()
    current = choice
    return choice
  }

  /** Milliseconds per frame on a blank frame, or null when the delegate does not work here. */
  private fun benchmark(context: Context, delegate: Delegate): Double? = try {
    val bytes = context.assets.open(HandFrames.MODEL_ASSET).use { it.readBytes() }
    val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
    model.put(bytes)
    model.rewind()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(delegate).build())
      .setRunningMode(RunningMode.IMAGE)
      .setNumHands(1)
      .build()
    HandLandmarker.createFromOptions(context, options).use { landmarker ->
      val frame = BitmapImageBuilder(Bitmap.createBitmap(480, 640, Bitmap.Config.ARGB_8888)).build()
      landmarker.detect(frame)
      val started = SystemClock.uptimeMillis()
      repeat(4) { landmarker.detect(frame) }
      (SystemClock.uptimeMillis() - started) / 4.0
    }
  } catch (error: Throwable) {
    TrackerDiagnostics.error("benchmark_${delegate.name.lowercase()}", error)
    null
  }
}
