package com.kwy404.sigil.control

import java.lang.ref.WeakReference

/**
 * Shared state between the components Android creates on its own (the
 * accessibility service and the camera service) and the Expo module that lives
 * with the React runtime. Events go to JavaScript through [eventSink] while the
 * module is alive and are dropped otherwise.
 */
object SigilRuntime {
  @Volatile
  private var serviceRef: WeakReference<SigilAccessibilityService>? = null

  @Volatile
  var eventSink: ((String, Map<String, Any?>) -> Unit)? = null

  @Volatile
  var foregroundPackage: String? = null
    private set

  val service: SigilAccessibilityService?
    get() = serviceRef?.get()

  fun attach(service: SigilAccessibilityService) {
    serviceRef = WeakReference(service)
    emit("onServiceStateChanged", mapOf("enabled" to true))
  }

  fun detach(service: SigilAccessibilityService) {
    if (serviceRef?.get() === service) {
      serviceRef = null
      emit("onServiceStateChanged", mapOf("enabled" to false))
    }
  }

  fun reportForegroundApp(packageName: String, className: String?) {
    if (packageName == foregroundPackage) {
      return
    }
    foregroundPackage = packageName
    emit("onForegroundAppChanged", mapOf("packageName" to packageName, "className" to className))
  }

  /** Forwards one hand tracker result: 21 landmarks packed as x, y, z triples. */
  fun reportHandFrame(timestampMs: Long, landmarks: FloatArray, score: Float) {
    emit(
      "onHandFrame",
      mapOf(
        "t" to timestampMs.toDouble(),
        "landmarks" to landmarks.map { it.toDouble() },
        "score" to score.toDouble(),
      ),
    )
  }

  fun emit(name: String, body: Map<String, Any?>) {
    eventSink?.invoke(name, body)
  }
}
