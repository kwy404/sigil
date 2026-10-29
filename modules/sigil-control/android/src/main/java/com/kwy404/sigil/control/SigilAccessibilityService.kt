package com.kwy404.sigil.control

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The part of Sigil that acts on other apps. Android starts it when the user
 * enables "Sigil hands free control" in the accessibility settings. It reports
 * which app is in front, performs taps, swipes, typing and global actions, and
 * reads the active window when a voice plan looks for a control. It never acts
 * on its own: every call comes from a gesture or a confirmed plan.
 */
class SigilAccessibilityService : AccessibilityService() {
  /** Cursor drawn in an accessibility overlay, which needs no extra permission. */
  val cursor: CursorOverlay by lazy { CursorOverlay(this) }

  override fun onServiceConnected() {
    super.onServiceConnected()
    SigilRuntime.attach(this)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      return
    }
    val packageName = event.packageName?.toString() ?: return
    SigilRuntime.reportForegroundApp(packageName, event.className?.toString())
  }

  override fun onInterrupt() {
    // Sigil gives no spoken or haptic feedback that could be interrupted.
  }

  override fun onUnbind(intent: Intent?): Boolean {
    cursor.hide()
    SigilRuntime.detach(this)
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    cursor.hide()
    SigilRuntime.detach(this)
    super.onDestroy()
  }

  fun tap(x: Float, y: Float): Boolean = press(x, y, 60L)

  fun longPress(x: Float, y: Float, durationMs: Long): Boolean = press(x, y, durationMs.coerceIn(300L, 3000L))

  fun doubleTap(x: Float, y: Float): Boolean {
    val first = Path().apply { moveTo(x, y) }
    val second = Path().apply { moveTo(x, y) }
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(first, 0L, 50L))
      .addStroke(GestureDescription.StrokeDescription(second, 150L, 50L))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  fun swipe(fromX: Float, fromY: Float, toX: Float, toY: Float, durationMs: Long): Boolean {
    val path = Path().apply {
      moveTo(fromX, fromY)
      lineTo(toX, toY)
    }
    return stroke(path, durationMs.coerceIn(50L, 2000L))
  }

  private fun press(x: Float, y: Float, durationMs: Long): Boolean {
    return stroke(Path().apply { moveTo(x, y) }, durationMs)
  }

  private fun stroke(path: Path, durationMs: Long): Boolean {
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0L, durationMs))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  fun globalAction(name: String): Boolean {
    val action = when (name) {
      "back" -> GLOBAL_ACTION_BACK
      "home" -> GLOBAL_ACTION_HOME
      "recents" -> GLOBAL_ACTION_RECENTS
      "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
      "quick_settings" -> GLOBAL_ACTION_QUICK_SETTINGS
      "lock_screen" -> if (Build.VERSION.SDK_INT >= 28) GLOBAL_ACTION_LOCK_SCREEN else return false
      "screenshot" -> if (Build.VERSION.SDK_INT >= 28) GLOBAL_ACTION_TAKE_SCREENSHOT else return false
      else -> return false
    }
    return performGlobalAction(action)
  }

  /** Replaces the text of the focused input field. submit presses the keyboard action key on Android 11 and later. */
  fun typeText(text: String, submit: Boolean): Boolean {
    val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
    val arguments = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
    }
    val typed = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    if (typed && submit && Build.VERSION.SDK_INT >= 30) {
      node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
    }
    return typed
  }

  /** Scrolls the first scrollable container. down and right move forward through the content. */
  fun scroll(direction: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.addLast(root)
    var visited = 0
    while (queue.isNotEmpty() && visited < MAX_NODES) {
      val node = queue.removeFirst()
      visited++
      if (node.isScrollable && node.isVisibleToUser) {
        val action = if (direction == "down" || direction == "right") {
          AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        } else {
          AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        }
        return node.performAction(action)
      }
      for (i in 0 until node.childCount) {
        node.getChild(i)?.let { queue.addLast(it) }
      }
    }
    return false
  }

  /**
   * A flat list of the visible nodes of the active window, breadth first.
   * JavaScript matches selectors against it, so the matching rules live in one
   * place (sigil-core nodeMatches).
   */
  fun snapshot(maxNodes: Int): List<Map<String, Any?>> {
    val root = rootInActiveWindow ?: return emptyList()
    val limit = maxNodes.coerceIn(1, MAX_NODES)
    val out = ArrayList<Map<String, Any?>>()
    val queue = ArrayDeque<Pair<AccessibilityNodeInfo, String>>()
    queue.addLast(root to "0")
    val bounds = Rect()
    while (queue.isNotEmpty() && out.size < limit) {
      val (node, path) = queue.removeFirst()
      if (node.isVisibleToUser) {
        node.getBoundsInScreen(bounds)
        out.add(
          mapOf(
            "id" to path,
            "text" to node.text?.toString(),
            "description" to node.contentDescription?.toString(),
            "resourceId" to node.viewIdResourceName,
            "className" to node.className?.toString(),
            "left" to bounds.left.toDouble(),
            "top" to bounds.top.toDouble(),
            "right" to bounds.right.toDouble(),
            "bottom" to bounds.bottom.toDouble(),
            "clickable" to node.isClickable,
            "editable" to node.isEditable,
            "focused" to node.isFocused,
            "scrollable" to node.isScrollable,
          ),
        )
      }
      for (i in 0 until node.childCount) {
        node.getChild(i)?.let { queue.addLast(it to "$path.$i") }
      }
    }
    return out
  }

  companion object {
    private const val MAX_NODES = 600
  }
}
