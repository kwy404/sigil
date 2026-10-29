package com.kwy404.sigil.control

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService

/**
 * Exists so the user can grant Sigil media access: Android shares the active
 * media sessions only with apps whose notification listener is enabled. Sigil
 * does not read, keep or act on notifications. It only asks the player in
 * front to seek or change its speed when the user requests it. Play, pause,
 * next and previous need no access; they go out as media keys.
 */
class SigilMediaListener : NotificationListenerService() {
  companion object {
    private fun component(context: Context) = ComponentName(context, SigilMediaListener::class.java)

    fun isEnabled(context: Context): Boolean {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
      val mine = component(context)
      return enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
    }

    fun settingsIntent(context: Context): Intent =
      if (Build.VERSION.SDK_INT >= 30) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component(context).flattenToString())
      } else {
        Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
      }

    /** The session that is playing, or else the most recent one. */
    private fun activeController(context: Context): MediaController? {
      val manager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
      val sessions = try {
        manager.getActiveSessions(component(context))
      } catch (error: SecurityException) {
        return null
      }
      return sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: sessions.firstOrNull()
    }

    fun seekBy(context: Context, seconds: Double): String {
      if (!isEnabled(context)) return "media_access"
      val controller = activeController(context) ?: return "failed"
      val state = controller.playbackState ?: return "failed"
      if ((state.actions and PlaybackState.ACTION_SEEK_TO) == 0L) return "unsupported"
      val elapsed = if (state.state == PlaybackState.STATE_PLAYING) {
        ((SystemClock.elapsedRealtime() - state.lastPositionUpdateTime) * state.playbackSpeed).toLong()
      } else {
        0L
      }
      var target = (state.position + elapsed + (seconds * 1000).toLong()).coerceAtLeast(0L)
      val duration = controller.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L
      if (duration > 0L) {
        target = target.coerceAtMost(duration)
      }
      controller.transportControls.seekTo(target)
      return "done"
    }

    fun setSpeed(context: Context, rate: Float): String {
      if (Build.VERSION.SDK_INT < 29) return "unsupported"
      if (!isEnabled(context)) return "media_access"
      val controller = activeController(context) ?: return "failed"
      controller.transportControls.setPlaybackSpeed(rate.coerceIn(0.25f, 4f))
      return "done"
    }
  }
}
