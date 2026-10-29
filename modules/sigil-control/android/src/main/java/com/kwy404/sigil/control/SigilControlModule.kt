package com.kwy404.sigil.control

import android.Manifest
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Display
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript entry point to Sigil's Android system control. Every action is a
 * direct translation of a gesture or of one confirmed plan step; the module
 * has no logic that decides to act by itself.
 */
class SigilControlModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("The React context is not ready.")

  /** Cursor window used while the accessibility service is off. */
  private var appCursor: CursorOverlay? = null

  override fun definition() = ModuleDefinition {
    Name("SigilControl")

    Events(
      "onServiceStateChanged",
      "onForegroundAppChanged",
      "onCameraServiceStateChanged",
      "onHandFrame",
      "onCursorError",
    )

    OnCreate {
      SigilRuntime.eventSink = { name, body -> this@SigilControlModule.sendEvent(name, body) }
    }

    OnDestroy {
      SigilRuntime.eventSink = null
      appCursor?.hide()
      appCursor = null
    }

    Function("getStatus") { status() }

    Function("getScreenSize") { screenSize() }

    Function("openAccessibilitySettings") {
      openActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    Function("openOverlaySettings") {
      openActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("openWriteSettings") {
      openActivity(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${context.packageName}")))
    }

    Function("openMediaAccessSettings") { openActivity(SigilMediaListener.settingsIntent(context)) }

    Function("openPanel") { panel: String -> openPanel(panel) }

    Function("startCameraService") { withMicrophone: Boolean -> startCameraService(withMicrophone) }

    Function("stopCameraService") { stopCameraService() }

    Function("showCursor") { activeCursor().show() }

    Function("hideCursor") { hideCursors() }

    Function("moveCursor") { x: Double, y: Double, state: String ->
      activeCursor().move(x.toFloat(), y.toFloat(), CursorState.from(state))
    }

    AsyncFunction("tap") { x: Double, y: Double ->
      SigilRuntime.service?.tap(x.toFloat(), y.toFloat()) ?: false
    }

    AsyncFunction("doubleTap") { x: Double, y: Double ->
      SigilRuntime.service?.doubleTap(x.toFloat(), y.toFloat()) ?: false
    }

    AsyncFunction("longPress") { x: Double, y: Double, durationMs: Double ->
      SigilRuntime.service?.longPress(x.toFloat(), y.toFloat(), durationMs.toLong()) ?: false
    }

    AsyncFunction("swipe") { fromX: Double, fromY: Double, toX: Double, toY: Double, durationMs: Double ->
      SigilRuntime.service?.swipe(fromX.toFloat(), fromY.toFloat(), toX.toFloat(), toY.toFloat(), durationMs.toLong())
        ?: false
    }

    AsyncFunction("globalAction") { name: String ->
      SigilRuntime.service?.globalAction(name) ?: false
    }

    AsyncFunction("typeText") { text: String, submit: Boolean ->
      SigilRuntime.service?.typeText(text, submit) ?: false
    }

    AsyncFunction("scroll") { direction: String ->
      SigilRuntime.service?.scroll(direction) ?: false
    }

    AsyncFunction("snapshotWindow") { maxNodes: Int ->
      SigilRuntime.service?.snapshot(maxNodes) ?: emptyList()
    }

    AsyncFunction("mediaKey") { action: String -> mediaKey(action) }

    AsyncFunction("seekBy") { seconds: Double -> SigilMediaListener.seekBy(context, seconds) }

    AsyncFunction("setPlaybackSpeed") { rate: Double -> SigilMediaListener.setSpeed(context, rate.toFloat()) }

    AsyncFunction("adjustVolume") { direction: String -> adjustVolume(direction) }

    AsyncFunction("changeVolume") { stream: String, change: String, level: Double ->
      SystemLevels.changeVolume(context, stream, change, level)
    }

    Function("getVolume") { stream: String -> SystemLevels.volume(context, stream) }

    AsyncFunction("changeBrightness") { change: String, level: Double ->
      SystemLevels.changeBrightness(context, change, level)
    }

    Function("getBrightness") { SystemLevels.brightness(context) }

    AsyncFunction("openApp") { packageName: String?, url: String?, label: String? ->
      openApp(packageName, url, label)
    }
  }

  private fun status(): Map<String, Any?> = mapOf(
    "accessibilityEnabled" to (SigilRuntime.service != null),
    "overlayPermission" to Settings.canDrawOverlays(context),
    "cameraServiceRunning" to SigilCameraService.running,
    "foregroundPackage" to SigilRuntime.foregroundPackage,
    "writeSettings" to Settings.System.canWrite(context),
    "mediaAccess" to SigilMediaListener.isEnabled(context),
    "sdkInt" to Build.VERSION.SDK_INT,
  )

  @Suppress("DEPRECATION")
  private fun screenSize(): Map<String, Any?> {
    val displays = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    val metrics = DisplayMetrics()
    displays.getDisplay(Display.DEFAULT_DISPLAY)?.getRealMetrics(metrics)
    return mapOf(
      "width" to metrics.widthPixels.toDouble(),
      "height" to metrics.heightPixels.toDouble(),
      "density" to metrics.density.toDouble(),
    )
  }

  /** The service cursor when the accessibility service runs, the application overlay otherwise. */
  private fun activeCursor(): CursorOverlay {
    val service = SigilRuntime.service
    if (service != null) {
      appCursor?.hide()
      appCursor = null
      return service.cursor
    }
    return appCursor ?: CursorOverlay(context.applicationContext).also { appCursor = it }
  }

  private fun hideCursors() {
    SigilRuntime.service?.cursor?.hide()
    appCursor?.hide()
  }

  /** Starting activities from the background is allowed for a bound accessibility service, so it goes first. */
  private fun launchContext(): Context = SigilRuntime.service ?: appContext.currentActivity ?: context

  private fun openActivity(intent: Intent): Boolean {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      launchContext().startActivity(intent)
      true
    } catch (error: RuntimeException) {
      false
    }
  }

  private fun startCameraService(withMicrophone: Boolean): Boolean {
    val ctx = context
    // Starting without the permission would crash the service, so check first.
    if (!SigilCameraService.hasPermission(ctx, Manifest.permission.CAMERA)) {
      return false
    }
    val intent = Intent(ctx, SigilCameraService::class.java)
      .setAction(SigilCameraService.ACTION_START)
      .putExtra(SigilCameraService.EXTRA_MICROPHONE, withMicrophone)
    return try {
      if (Build.VERSION.SDK_INT >= 26) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      true
    } catch (error: RuntimeException) {
      SigilRuntime.emit(
        "onCameraServiceStateChanged",
        mapOf("running" to false, "error" to (error.message ?: error.javaClass.simpleName)),
      )
      false
    }
  }

  private fun stopCameraService() {
    val ctx = context
    ctx.stopService(Intent(ctx, SigilCameraService::class.java))
  }

  /**
   * Wi-Fi, Bluetooth and Do Not Disturb open where the user flips the switch:
   * since Android 10 apps cannot turn Wi-Fi on or off, so Sigil never tries.
   * Each panel lists fallbacks for older versions and vendor settings apps.
   */
  private fun openPanel(panel: String): Boolean {
    val candidates = when (panel) {
      "wifi" -> listOfNotNull(
        if (Build.VERSION.SDK_INT >= 29) Intent(Settings.Panel.ACTION_WIFI) else null,
        Intent(Settings.ACTION_WIFI_SETTINGS),
      )
      "bluetooth" -> listOf(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
      "do_not_disturb" -> listOf(
        Intent("android.settings.ZEN_MODE_SETTINGS"),
        Intent("android.settings.ZEN_MODE_PRIORITY_SETTINGS"),
        Intent(Settings.ACTION_SOUND_SETTINGS),
      )
      "display" -> listOf(Intent(Settings.ACTION_DISPLAY_SETTINGS))
      else -> emptyList()
    }
    return candidates.any { openActivity(it) }
  }

  private fun mediaKey(action: String): Boolean {
    val code = when (action) {
      "play_pause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
      "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
      "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
      "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
      "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
      else -> return false
    }
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    return true
  }

  private fun adjustVolume(direction: String): Boolean {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val adjust = if (direction == "up") AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
    audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, adjust, AudioManager.FLAG_SHOW_UI)
    return true
  }

  private fun isInstalled(packageName: String): Boolean =
    context.packageManager.getLaunchIntentForPackage(packageName) != null

  private fun openApp(packageName: String?, url: String?, label: String?): Boolean {
    val intent = when {
      url != null -> Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        if (packageName != null && isInstalled(packageName)) {
          setPackage(packageName)
        }
      }
      packageName != null -> context.packageManager.getLaunchIntentForPackage(packageName)
      label != null -> launchIntentForLabel(label)
      else -> null
    } ?: return false
    return openActivity(intent)
  }

  /** Finds an installed app by the name shown under its launcher icon. */
  @Suppress("DEPRECATION")
  private fun launchIntentForLabel(label: String): Intent? {
    val packages = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val activities = packages.queryIntentActivities(launcher, 0)
    val wanted = label.trim().lowercase()
    val match = activities.firstOrNull { it.loadLabel(packages).toString().trim().lowercase() == wanted }
      ?: activities.firstOrNull { it.loadLabel(packages).toString().trim().lowercase().startsWith(wanted) }
      ?: return null
    return packages.getLaunchIntentForPackage(match.activityInfo.packageName)
  }
}
