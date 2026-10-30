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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import java.lang.ref.WeakReference

/**
 * Foreground service that keeps the camera (and the microphone when voice is
 * on) available while the user works in other apps. Android shows its
 * notification, with Pause and Stop, for as long as it runs, and the camera
 * privacy indicator stays on. It also owns the floating bubble and keeps the
 * Quick Settings tile and the home screen widget current. It must be started
 * while Sigil is on screen: Android does not let a camera service start from
 * the background.
 */
class SigilCameraService : Service(), LifecycleOwner {
  private var pipeline: HandLandmarkPipeline? = null
  private var microphone = false
  private var bubble: FloatingBubble? = null

  /** CameraX binds the camera to this lifecycle: it runs while the service is started. */
  private val registry = LifecycleRegistry(this)

  override val lifecycle: Lifecycle
    get() = registry

  override fun onCreate() {
    super.onCreate()
    registry.currentState = Lifecycle.State.CREATED
    current = WeakReference(this)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  /**
   * Enters the foreground with the camera type, plus the microphone type when
   * asked, and keeps that choice for the notification text. Returns why
   * Android refused, or null.
   */
  private fun enterForeground(withMicrophone: Boolean): Exception? {
    val before = microphone
    microphone = withMicrophone
    return try {
      ensureChannel()
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 30) {
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        if (withMicrophone) {
          types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        startForeground(NOTIFICATION_ID, notification, types)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      null
    } catch (error: Exception) {
      microphone = before
      error
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        SigilRuntime.emit("onControlAction", mapOf("action" to "stop"))
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_PAUSE -> {
        setPaused(true)
        return START_NOT_STICKY
      }
      ACTION_RESUME -> {
        setPaused(false)
        return START_NOT_STICKY
      }
    }
    val wanted = intent?.getBooleanExtra(EXTRA_MICROPHONE, false) == true &&
      hasPermission(this, Manifest.permission.RECORD_AUDIO)
    var failure = enterForeground(wanted)
    if (failure != null && wanted) {
      // Android can refuse the microphone type alone, for example when the
      // bubble menu turns voice on over another app; tracking works without it.
      failure = enterForeground(false)
    }
    if (failure != null) {
      // SecurityException when a permission is missing, or the Android 12 background start restriction.
      val message = failure.message ?: failure.javaClass.simpleName
      if (running) {
        // Still in the foreground as before: keep tracking and only report the refused change.
        SigilRuntime.emit(
          "onCameraServiceStateChanged",
          mapOf("running" to true, "paused" to paused, "microphone" to microphone, "error" to message),
        )
        return START_NOT_STICKY
      }
      SigilRuntime.emit("onCameraServiceStateChanged", mapOf("running" to false, "error" to message))
      stopSelf()
      return START_NOT_STICKY
    }

    if (!running) {
      running = true
      paused = false
      registry.currentState = Lifecycle.State.RESUMED
      startPipeline()
      bubble = FloatingBubble(this, bubbleActions).also {
        it.setSuppressed(ownScreenInFront)
        it.show()
      }
    }
    publish()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    pipeline?.stop()
    pipeline = null
    bubble?.hide()
    bubble = null
    running = false
    paused = false
    registry.currentState = Lifecycle.State.DESTROYED
    if (current?.get() === this) current = null
    publish()
    super.onDestroy()
  }

  private fun startPipeline() {
    pipeline = HandLandmarkPipelines.create(this, this).also { tracker ->
      tracker.start { frame ->
        SigilRuntime.reportHandFrame(
          frame.timestampMs,
          frame.landmarks,
          frame.score,
          frame.handedness,
          hands = frame.hands,
          aspect = frame.aspect,
          brightness = frame.brightness,
        )
      }
    }
  }

  /** Pausing releases the camera; the service, the bubble and the notification stay so the user can resume. */
  fun setPaused(value: Boolean) {
    if (!running || paused == value) return
    paused = value
    if (value) {
      pipeline?.stop()
      pipeline = null
      bubble?.setState(BubbleState.PAUSED)
    } else {
      startPipeline()
      bubble?.setState(BubbleState.TRACKING)
    }
    SigilRuntime.emit("onControlAction", mapOf("action" to if (value) "pause" else "resume"))
    getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
    publish()
  }

  fun setBubbleState(state: BubbleState) {
    if (!paused) bubble?.setState(state)
  }

  private val bubbleActions = object : FloatingBubble.Actions {
    override fun onBubbleTap() {
      FloatingBubble.openSigil(this@SigilCameraService, "control/sphere")
    }

    override fun onMenuAction(action: String) {
      when (action) {
        "pause" -> setPaused(true)
        "resume" -> setPaused(false)
        "open" -> FloatingBubble.openSigil(this@SigilCameraService, "control/home")
        "stop" -> {
          SigilRuntime.emit("onControlAction", mapOf("action" to "stop"))
          stopSelf()
        }
        else -> SigilRuntime.emit("onControlAction", mapOf("action" to action))
      }
    }

    override fun isPaused(): Boolean = paused

    override fun microphoneOn(): Boolean = microphone
  }

  /** Tells JavaScript, the tile and the widget what changed. */
  private fun publish() {
    SigilRuntime.emit(
      "onCameraServiceStateChanged",
      mapOf("running" to running, "paused" to paused, "microphone" to microphone),
    )
    SigilTileService.update(this)
    SigilWidgetProvider.update(this)
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

  private fun action(action: String, label: Int, code: Int): Notification.Action {
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val intent = PendingIntent.getService(this, code, Intent(this, SigilCameraService::class.java).setAction(action), flags)
    return Notification.Action.Builder(Icon.createWithResource(this, R.drawable.sigil_notification_icon), getString(label), intent).build()
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(): Notification {
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      PendingIntent.getActivity(this, 2, launch, flags)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val text = when {
      paused -> R.string.sigil_camera_notification_paused
      microphone -> R.string.sigil_camera_notification_text_voice
      else -> R.string.sigil_camera_notification_text
    }
    builder
      .setSmallIcon(R.drawable.sigil_notification_icon)
      .setContentTitle(getString(R.string.sigil_camera_notification_title))
      .setContentText(getString(text))
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(if (paused) action(ACTION_RESUME, R.string.sigil_resume, 3) else action(ACTION_PAUSE, R.string.sigil_pause, 3))
      .addAction(action(ACTION_STOP, R.string.sigil_stop, 1))
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
    const val ACTION_PAUSE = "com.kwy404.sigil.control.action.PAUSE"
    const val ACTION_RESUME = "com.kwy404.sigil.control.action.RESUME"
    const val EXTRA_MICROPHONE = "microphone"
    private const val CHANNEL_ID = "sigil_hands_free"
    private const val NOTIFICATION_ID = 4041

    @Volatile
    var running = false
      private set

    @Volatile
    var paused = false
      private set

    @Volatile
    private var current: WeakReference<SigilCameraService>? = null

    /** The running service, for the module to reach the bubble and the pause switch. */
    val instance: SigilCameraService?
      get() = current?.get()

    /** The lifecycle CameraX is bound to: RESUMED while tracking, or none when the service is not running. */
    fun lifecycleState(): String = current?.get()?.registry?.currentState?.name ?: "none"

    /** Sigil's own activity is in front, as React Native reports it; the bubble stays out of the way meanwhile. */
    @Volatile
    var ownScreenInFront = false
      private set

    /** Hides the bubble while Sigil's screen is in front and shows it again over other apps. The cursor is not affected. */
    fun setOwnScreenInFront(value: Boolean) {
      ownScreenInFront = value
      current?.get()?.bubble?.setSuppressed(value)
    }

    fun hasPermission(context: Context, permission: String): Boolean =
      context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }
}
