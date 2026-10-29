package com.kwy404.sigil.control

import android.content.Context

/**
 * Produces hand landmarks from the front camera while the camera service runs,
 * so gestures keep working when another app is in front.
 *
 * The production pipeline binds CameraX to the service lifecycle, feeds frames
 * to MediaPipe Hand Landmarker in live stream mode and emits 21 landmarks per
 * frame, mirrored to the user's point of view, through [SigilRuntime]. It is
 * not part of this skeleton because both libraries add native dependencies
 * that are chosen and measured on a device first (see docs/ARCHITECTURE.md).
 */
interface HandLandmarkPipeline {
  fun start(listener: (timestampMs: Long, landmarks: FloatArray, score: Float) -> Unit)

  fun stop()
}

/** Keeps the service contract while no tracker is installed: starts, emits nothing, stops. */
class IdleHandLandmarkPipeline : HandLandmarkPipeline {
  override fun start(listener: (timestampMs: Long, landmarks: FloatArray, score: Float) -> Unit) = Unit

  override fun stop() = Unit
}

object HandLandmarkPipelines {
  @Suppress("UNUSED_PARAMETER")
  fun create(context: Context): HandLandmarkPipeline = IdleHandLandmarkPipeline()
}
