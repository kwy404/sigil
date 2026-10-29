package com.kwy404.sigil.control

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build

/**
 * The apps the launcher lists, as label and package, so a voice request can
 * open any of them by name. Sigil sees them through the launcher query of its
 * manifest, without QUERY_ALL_PACKAGES. The list is cached and dropped when an
 * app is installed, removed or updated, and JavaScript is told to read it again.
 */
object LaunchableApps {
  @Volatile
  private var cache: List<Map<String, String>>? = null

  private var receiver: BroadcastReceiver? = null

  @Suppress("DEPRECATION")
  fun list(context: Context): List<Map<String, String>> {
    cache?.let { return it }
    val packages = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val seen = HashSet<String>()
    val apps = packages.queryIntentActivities(launcher, 0)
      .mapNotNull { info ->
        val packageName = info.activityInfo?.packageName ?: return@mapNotNull null
        if (packageName == context.packageName) {
          return@mapNotNull null
        }
        val label = info.loadLabel(packages).toString().trim()
        if (label.isEmpty() || !seen.add("$packageName|$label")) {
          return@mapNotNull null
        }
        mapOf("label" to label, "packageName" to packageName)
      }
      .sortedBy { it["label"]?.lowercase() }
    cache = apps
    return apps
  }

  /** Listens for installs, removals and updates. Safe to call more than once. */
  @Synchronized
  fun watch(context: Context, onChange: () -> Unit) {
    if (receiver != null) {
      return
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_PACKAGE_ADDED)
      addAction(Intent.ACTION_PACKAGE_REMOVED)
      addAction(Intent.ACTION_PACKAGE_CHANGED)
      addAction(Intent.ACTION_PACKAGE_REPLACED)
      addDataScheme("package")
    }
    val listener = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        cache = null
        onChange()
      }
    }
    val app = context.applicationContext
    // Package broadcasts come from the system, so the receiver stays closed to other apps.
    if (Build.VERSION.SDK_INT >= 33) {
      app.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      app.registerReceiver(listener, filter)
    }
    receiver = listener
  }

  @Synchronized
  fun unwatch(context: Context) {
    val listener = receiver ?: return
    receiver = null
    try {
      context.applicationContext.unregisterReceiver(listener)
    } catch (error: IllegalArgumentException) {
      // Already unregistered.
    }
  }
}
