package com.kwy404.sigil.control

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the camera (and the microphone when voice is
 * on) available while the user works in other apps. Android shows its
 * notification for as long as it runs, and the camera privacy indicator stays
 * on. It must be started while Sigil is on screen: Android does not let a
 * camera service start from the background.
 */
class SigilCameraService : Service() {
  private var pipeline: HandLandmarkPipeline? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val microphone = intent?.getBooleanExtra(EXTRA_MICROPHONE, false) == true &&
      hasPermission(this, Manifest.permission.RECORD_AUDIO)

    try {
      ensureChannel()
      val notification = buildNotification(microphone)
      if (Build.VERSION.SDK_INT >= 30) {
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        if (microphone) {
          types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        startForeground(NOTIFICATION_ID, notification, types)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      // SecurityException when a permission is missing, or the Android 12 background start restriction.
      SigilRuntime.emit(
        "onCameraServiceStateChanged",
        mapOf("running" to false, "error" to (error.message ?: error.javaClass.simpleName)),
      )
      stopSelf()
      return START_NOT_STICKY
    }

    if (!running) {
      running = true
      pipeline = HandLandmarkPipelines.create(this).also { tracker ->
        tracker.start { timestampMs, landmarks, score ->
          SigilRuntime.reportHandFrame(timestampMs, landmarks, score)
        }
      }
    }
    SigilRuntime.emit("onCameraServiceStateChanged", mapOf("running" to true, "microphone" to microphone))
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    pipeline?.stop()
    pipeline = null
    running = false
    SigilRuntime.emit("onCameraServiceStateChanged", mapOf("running" to false))
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.sigil_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.description = getString(R.string.sigil_channel_description)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(microphone: Boolean): Notification {
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val stopIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, SigilCameraService::class.java).setAction(ACTION_STOP),
      flags,
    )
    val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      PendingIntent.getActivity(this, 2, launch, flags)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    builder
      .setSmallIcon(R.drawable.sigil_notification_icon)
      .setContentTitle(getString(R.string.sigil_camera_notification_title))
      .setContentText(
        getString(
          if (microphone) R.string.sigil_camera_notification_text_voice else R.string.sigil_camera_notification_text,
        ),
      )
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, R.drawable.sigil_notification_icon),
          getString(R.string.sigil_stop),
          stopIntent,
        ).build(),
      )
    if (openIntent != null) {
      builder.setContentIntent(openIntent)
    }
    if (Build.VERSION.SDK_INT >= 31) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  companion object {
    const val ACTION_START = "com.kwy404.sigil.control.action.START"
    const val ACTION_STOP = "com.kwy404.sigil.control.action.STOP"
    const val EXTRA_MICROPHONE = "microphone"
    private const val CHANNEL_ID = "sigil_hands_free"
    private const val NOTIFICATION_ID = 4041

    @Volatile
    var running = false
      private set

    fun hasPermission(context: Context, permission: String): Boolean =
      context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }
}
