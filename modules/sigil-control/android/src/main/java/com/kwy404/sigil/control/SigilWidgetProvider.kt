package com.kwy404.sigil.control

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * A small home screen widget with Sigil's state and one Start or Stop button.
 * Start opens Sigil, which starts hands free control while it is on screen,
 * as Android requires for the camera; Stop works from the home screen.
 */
class SigilWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    manager.updateAppWidget(ids, views(context))
  }

  companion object {
    /** Redraws every Sigil widget after Sigil starts, pauses or stops. */
    fun update(context: Context) {
      runCatching {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, SigilWidgetProvider::class.java))
        if (ids.isNotEmpty()) manager.updateAppWidget(ids, views(context))
      }
    }

    private fun views(context: Context): RemoteViews {
      val running = SigilCameraService.running
      val status = when {
        !running -> R.string.sigil_widget_stopped
        SigilCameraService.paused -> R.string.sigil_widget_paused
        else -> R.string.sigil_widget_running
      }
      val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      val open = PendingIntent.getActivity(
        context,
        10,
        Intent(Intent.ACTION_VIEW, Uri.parse("sigil://control/home")).setPackage(context.packageName),
        flags,
      )
      val toggle = if (running) {
        PendingIntent.getService(
          context,
          11,
          Intent(context, SigilCameraService::class.java).setAction(SigilCameraService.ACTION_STOP),
          flags,
        )
      } else {
        PendingIntent.getActivity(
          context,
          12,
          Intent(Intent.ACTION_VIEW, Uri.parse("sigil://control/start")).setPackage(context.packageName),
          flags,
        )
      }
      return RemoteViews(context.packageName, R.layout.sigil_widget).apply {
        setTextViewText(R.id.sigil_widget_status, context.getString(status))
        setTextViewText(R.id.sigil_widget_button, context.getString(if (running) R.string.sigil_stop else R.string.sigil_start))
        setOnClickPendingIntent(R.id.sigil_widget_root, open)
        setOnClickPendingIntent(R.id.sigil_widget_button, toggle)
      }
    }
  }
}
