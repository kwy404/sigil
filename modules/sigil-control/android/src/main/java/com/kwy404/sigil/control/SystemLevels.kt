package com.kwy404.sigil.control

import android.content.Context
import android.content.res.Resources
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Volume and screen brightness. Volume needs no permission. Brightness needs
 * "Modify system settings" (WRITE_SETTINGS), a special access the user grants
 * in Settings; without it [changeBrightness] reports "write_settings" so the
 * screen can explain why and offer the switch or the display settings.
 */
object SystemLevels {
  // Constants of the curve Android's own brightness slider uses since Android 9.
  private const val R = 0.5f
  private const val A = 0.17883277f
  private const val B = 0.28466892f
  private const val C = 0.55991073f

  private fun audio(context: Context) = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun streamType(name: String): Int = when (name) {
    "ring" -> AudioManager.STREAM_RING
    "alarm" -> AudioManager.STREAM_ALARM
    else -> AudioManager.STREAM_MUSIC
  }

  private fun minIndex(audio: AudioManager, stream: Int): Int =
    if (Build.VERSION.SDK_INT >= 28) audio.getStreamMinVolume(stream) else 0

  fun volume(context: Context, name: String): Map<String, Any?> {
    val audio = audio(context)
    val stream = streamType(name)
    val min = minIndex(audio, stream)
    val max = audio.getStreamMaxVolume(stream)
    val index = audio.getStreamVolume(stream)
    val level = if (max > min) (index - min).toDouble() / (max - min) else 0.0
    return mapOf(
      "level" to level.coerceIn(0.0, 1.0),
      "index" to index,
      "min" to min,
      "max" to max,
      "muted" to audio.isStreamMute(stream),
    )
  }

  /** up and down move about a tenth of the range, set goes to level percent. The system volume panel shows the change. */
  fun changeVolume(context: Context, name: String, change: String, level: Double): String {
    val audio = audio(context)
    val stream = streamType(name)
    val flags = AudioManager.FLAG_SHOW_UI
    return try {
      when (change) {
        "mute" -> audio.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, flags)
        "unmute" -> audio.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, flags)
        "up", "down", "set" -> {
          val min = minIndex(audio, stream)
          val max = audio.getStreamMaxVolume(stream)
          val current = audio.getStreamVolume(stream)
          val step = maxOf(1, ((max - min) / 10.0).roundToInt())
          val target = when (change) {
            "up" -> current + step
            "down" -> current - step
            else -> min + ((max - min) * level.coerceIn(0.0, 100.0) / 100.0).roundToInt()
          }.coerceIn(min, max)
          if (change != "down" && audio.isStreamMute(stream)) {
            audio.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, 0)
          }
          audio.setStreamVolume(stream, target, flags)
        }
        else -> return "failed"
      }
      "done"
    } catch (error: SecurityException) {
      // Silencing the ringer can switch Do Not Disturb, which needs its own access.
      "failed"
    }
  }

  /** Slider position from 0 to 1 to the linear brightness setting, as Android's slider maps it. */
  private fun sliderToLinear(position: Float): Float {
    val p = position.coerceIn(0f, 1f)
    val value = if (p <= R) (p / R) * (p / R) else exp((p - C) / A) + B
    return (value / 12f).coerceIn(0f, 1f)
  }

  private fun linearToSlider(linear: Float): Float {
    val n = linear.coerceIn(0f, 1f) * 12f
    val value = if (n <= 1f) sqrt(n) * R else A * ln(n - B) + C
    return value.coerceIn(0f, 1f)
  }

  /** Lowest and highest values of SCREEN_BRIGHTNESS on this device. */
  private fun settingRange(): Pair<Int, Int> {
    val resources = Resources.getSystem()
    fun config(name: String, fallback: Int): Int {
      val id = resources.getIdentifier(name, "integer", "android")
      if (id == 0) return fallback
      return try {
        resources.getInteger(id)
      } catch (error: Resources.NotFoundException) {
        fallback
      }
    }
    val min = config("config_screenBrightnessSettingMinimum", 1)
    val max = config("config_screenBrightnessSettingMaximum", 255)
    return if (max > min) min to max else 1 to 255
  }

  private fun sliderLevel(context: Context): Float {
    val (min, max) = settingRange()
    val value = Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, (min + max) / 2)
    val linear = ((value - min).toFloat() / (max - min)).coerceIn(0f, 1f)
    return if (Build.VERSION.SDK_INT >= 28) linearToSlider(linear) else linear
  }

  fun brightness(context: Context): Map<String, Any?> {
    val mode = Settings.System.getInt(
      context.contentResolver,
      Settings.System.SCREEN_BRIGHTNESS_MODE,
      Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
    )
    return mapOf(
      "level" to sliderLevel(context).toDouble(),
      "automatic" to (mode == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC),
      "writable" to Settings.System.canWrite(context),
    )
  }

  /**
   * up and down move the slider by amount percent, set puts it at amount
   * percent. Adaptive brightness is turned off first, otherwise the system
   * would replace the value right away.
   */
  fun changeBrightness(context: Context, change: String, amount: Double): String {
    if (!Settings.System.canWrite(context)) {
      return "write_settings"
    }
    val current = sliderLevel(context)
    val target = when (change) {
      "up" -> current + amount.toFloat() / 100f
      "down" -> current - amount.toFloat() / 100f
      "set" -> amount.toFloat() / 100f
      else -> return "failed"
    }.coerceIn(0f, 1f)
    val (min, max) = settingRange()
    val linear = if (Build.VERSION.SDK_INT >= 28) sliderToLinear(target) else target
    val value = (min + (max - min) * linear).roundToInt().coerceIn(min, max)
    val resolver = context.contentResolver
    return try {
      Settings.System.putInt(
        resolver,
        Settings.System.SCREEN_BRIGHTNESS_MODE,
        Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
      )
      Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, value)
      "done"
    } catch (error: SecurityException) {
      "write_settings"
    } catch (error: IllegalArgumentException) {
      "failed"
    }
  }
}
