package com.kwy404.sigil.control

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.provider.AlarmClock
import android.provider.MediaStore

/**
 * Phone features a voice request reaches without the accessibility service:
 * the default app of a kind (camera, dialer, calculator and so on), a timer,
 * an alarm and the flashlight. Outcomes are the same strings as the other
 * system controls, so JavaScript can say honestly what happened.
 */
object SystemActions {
  /** Intents that open the phone's default app of a kind, best first. */
  fun roleIntents(role: String): List<Intent> {
    fun selector(category: String) = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, category)
    return when (role) {
      "camera" -> listOf(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
      // The dialer opens empty: Sigil never places a call.
      "phone" -> listOf(Intent(Intent.ACTION_DIAL))
      "contacts" -> listOf(selector(Intent.CATEGORY_APP_CONTACTS))
      "calculator" -> listOf(selector(Intent.CATEGORY_APP_CALCULATOR))
      "calendar" -> listOf(selector(Intent.CATEGORY_APP_CALENDAR))
      "clock" -> listOf(Intent(AlarmClock.ACTION_SHOW_ALARMS))
      "gallery" -> listOf(selector(Intent.CATEGORY_APP_GALLERY))
      "music" -> listOf(selector(Intent.CATEGORY_APP_MUSIC))
      "email" -> listOf(selector(Intent.CATEGORY_APP_EMAIL))
      "maps" -> listOf(selector(Intent.CATEGORY_APP_MAPS))
      "files" -> if (Build.VERSION.SDK_INT >= 29) listOf(selector(Intent.CATEGORY_APP_FILES)) else emptyList()
      "messages" -> listOf(selector(Intent.CATEGORY_APP_MESSAGING))
      "browser" -> listOf(selector(Intent.CATEGORY_APP_BROWSER))
      else -> emptyList()
    }
  }

  /** Starts a countdown in the clock app without opening it. */
  fun timerIntent(seconds: Int): Intent = Intent(AlarmClock.ACTION_SET_TIMER)
    .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
    .putExtra(AlarmClock.EXTRA_SKIP_UI, true)

  /** Opens the clock app with the alarm set, so the user sees and can change it. */
  fun alarmIntent(hour: Int, minute: Int): Intent = Intent(AlarmClock.ACTION_SET_ALARM)
    .putExtra(AlarmClock.EXTRA_HOUR, hour)
    .putExtra(AlarmClock.EXTRA_MINUTES, minute)
    .putExtra(AlarmClock.EXTRA_SKIP_UI, false)

  /**
   * Turns the flashlight of the back camera on or off. Returns done, busy
   * when a camera holds the flash, unsupported without a flash, or failed.
   */
  fun setTorch(context: Context, on: Boolean): String {
    val cameras = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return "unsupported"
    return try {
      val withFlash = cameras.cameraIdList.filter { id ->
        cameras.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      }
      val id = withFlash.firstOrNull { id ->
        cameras.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
      } ?: withFlash.firstOrNull() ?: return "unsupported"
      cameras.setTorchMode(id, on)
      "done"
    } catch (error: CameraAccessException) {
      val busy = error.reason == CameraAccessException.CAMERA_IN_USE ||
        error.reason == CameraAccessException.MAX_CAMERAS_IN_USE
      if (busy) "busy" else "failed"
    } catch (error: IllegalArgumentException) {
      "failed"
    }
  }
}
