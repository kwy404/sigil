package com.kwy404.sigil.control

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * The "Sigil" Quick Settings tile. A tap stops Sigil when it runs; otherwise it
 * opens Sigil, which starts hands free control while it is on screen, as
 * Android requires for the camera.
 */
class SigilTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    refresh()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  override fun onClick() {
    super.onClick()
    if (SigilCameraService.running) {
      stopService(Intent(this, SigilCameraService::class.java))
      refresh()
      return
    }
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("sigil://control/start"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }

  private fun refresh() {
    val tile = qsTile ?: return
    val running = SigilCameraService.running
    tile.state = if (running) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.label = getString(R.string.sigil_tile_label)
    if (Build.VERSION.SDK_INT >= 29) {
      tile.subtitle = getString(
        when {
          !running -> R.string.sigil_state_off
          SigilCameraService.paused -> R.string.sigil_state_paused
          else -> R.string.sigil_state_on
        },
      )
    }
    tile.updateTile()
  }

  companion object {
    /** Asks Android to refresh the tile after Sigil starts, pauses or stops. */
    fun update(context: Context) {
      runCatching { TileService.requestListeningState(context, ComponentName(context, SigilTileService::class.java)) }
    }
  }
}
