package com.kwy404.sigil.memory

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tells JavaScript how many CPU cores and how much free memory the phone has,
 * and when Android asks apps to free memory, so the on device language model
 * can pick its thread count and release its weights under pressure. React
 * Native does not forward trim memory callbacks to JavaScript on Android.
 */
class SigilMemoryModule : Module() {
  private var callbacks: ComponentCallbacks2? = null

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("SigilMemory")

    Events("onMemoryPressure")

    OnStartObserving { watch() }

    OnStopObserving { unwatch() }

    OnDestroy { unwatch() }

    Function("cpuCores") { Runtime.getRuntime().availableProcessors() }

    Function("memoryInfo") {
      val info = ActivityManager.MemoryInfo()
      val manager = context?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      manager?.getMemoryInfo(info)
      mapOf(
        "totalBytes" to info.totalMem.toDouble(),
        "availableBytes" to info.availMem.toDouble(),
        "thresholdBytes" to info.threshold.toDouble(),
        "lowMemory" to info.lowMemory,
      )
    }
  }

  private fun watch() {
    if (callbacks != null) return
    val target = context ?: return
    val listener = object : ComponentCallbacks2 {
      override fun onTrimMemory(level: Int) {
        this@SigilMemoryModule.sendEvent("onMemoryPressure", mapOf("level" to level))
      }

      override fun onConfigurationChanged(newConfig: Configuration) = Unit

      @Deprecated("Replaced by onTrimMemory on Android 14")
      override fun onLowMemory() {
        this@SigilMemoryModule.sendEvent("onMemoryPressure", mapOf("level" to LOW_MEMORY_LEVEL))
      }
    }
    target.registerComponentCallbacks(listener)
    callbacks = listener
  }

  private fun unwatch() {
    val listener = callbacks ?: return
    context?.unregisterComponentCallbacks(listener)
    callbacks = null
  }

  private companion object {
    /** Same value as ComponentCallbacks2.TRIM_MEMORY_COMPLETE, the most severe level. */
    const val LOW_MEMORY_LEVEL = 80
  }
}
