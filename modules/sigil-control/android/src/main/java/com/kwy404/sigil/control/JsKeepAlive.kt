package com.kwy404.sigil.control

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * Keeps JavaScript timers running while Sigil works over other apps. React
 * Native pauses its timers when Sigil's activity pauses, unless a headless JS
 * task is active, and plan steps, voice questions and the demo hand all wait
 * on timers. This task does no work: JavaScript registers it (see
 * src/runtime/sigil.ts) and keeps it while the camera service runs.
 */
internal object JsKeepAlive {
  const val TASK = "SigilKeepAlive"

  private var taskId: Int? = null

  /** Starts or finishes the task on the main thread, as React Native requires. Calling it twice does nothing more. */
  fun set(reactContext: ReactContext, on: Boolean) {
    UiThreadUtil.runOnUiThread {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      val current = taskId?.takeIf { tasks.isTaskRunning(it) }
      if (on && current == null) {
        taskId = runCatching { tasks.startTask(HeadlessJsTaskConfig(TASK, Arguments.createMap(), 0L, true)) }.getOrNull()
      } else if (!on) {
        current?.let { tasks.finishTask(it) }
        taskId = null
      }
    }
  }
}
