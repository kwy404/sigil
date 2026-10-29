package com.kwy404.sigil.control

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceGateTest {
  private fun VoiceGate.feed(level: Double, frames: Int, clipped: Boolean = false): List<VoiceGate.Event> =
    (0 until frames).mapNotNull { push(level, clipped) }

  @Test
  fun measuresTheNoiseFloorFirst() {
    val gate = VoiceGate()
    gate.feed(-60.0, 14)
    assertEquals(VoiceGate.Phase.CALIBRATING, gate.phase)
    gate.feed(-60.0, 1)
    assertEquals(VoiceGate.Phase.WAITING, gate.phase)
    assertEquals(-60.0, gate.noiseFloorDb!!, 0.001)
  }

  @Test
  fun acceptsClearSpeechAndTrimsTheSilenceAroundIt() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    assertEquals(listOf(VoiceGate.Event.SPEECH_STARTED), gate.feed(-30.0, 40))
    assertEquals(listOf(VoiceGate.Event.SPEECH_ENDED), gate.feed(-60.0, 50))
    assertEquals(15, gate.speechStartFrame)
    assertEquals(55, gate.speechEndFrame)
    assertEquals(800, gate.speechMs)
    assertEquals(30.0, gate.snrDb, 0.001)
    assertNull(gate.rejection())
  }

  @Test
  fun keepsShortPausesInsideTheSpeech() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    gate.feed(-30.0, 20)
    gate.feed(-60.0, 10)
    gate.feed(-30.0, 20)
    assertEquals(listOf(VoiceGate.Event.SPEECH_ENDED), gate.feed(-60.0, 50))
    assertEquals(1000, gate.speechMs)
    assertNull(gate.rejection())
  }

  @Test
  fun rejectsSpeechThatIsTooShort() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    gate.feed(-30.0, 10)
    gate.feed(-60.0, 50)
    assertEquals(VoiceGate.Rejection.TOO_SHORT, gate.rejection())
  }

  @Test
  fun rejectsMostlyClippedAudio() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    gate.feed(-3.0, 40, clipped = true)
    gate.feed(-60.0, 50)
    assertEquals(VoiceGate.Rejection.CLIPPED, gate.rejection())
  }

  @Test
  fun rejectsSpeechTooQuietAgainstTheNoise() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    assertEquals(listOf(VoiceGate.Event.SPEECH_STARTED), gate.feed(-49.0, 40))
    gate.feed(-60.0, 50)
    assertEquals(VoiceGate.Rejection.TOO_QUIET, gate.rejection())
  }

  @Test
  fun rejectsACaptureWithoutSpeech() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    assertTrue(gate.feed(-58.0, 100).isEmpty())
    assertEquals(VoiceGate.Rejection.NO_SPEECH, gate.rejection())
    // The floor follows the room while nobody speaks.
    assertTrue(gate.noiseFloorDb!! > -59.0)
  }

  @Test
  fun flagsANoisyPlace() {
    val noisy = VoiceGate()
    noisy.feed(-35.0, 15)
    assertTrue(noisy.noisy)
    val quiet = VoiceGate()
    quiet.feed(-60.0, 15)
    assertFalse(quiet.noisy)
  }

  @Test
  fun endsAtTheTimeLimit() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    gate.feed(-30.0, 30)
    gate.finish()
    assertEquals(VoiceGate.Phase.ENDED, gate.phase)
    assertEquals(45, gate.speechEndFrame)
    assertEquals(600, gate.speechMs)
    assertNull(gate.rejection())
  }

  @Test
  fun mapsTheLevelForTheMeter() {
    val gate = VoiceGate()
    gate.feed(-60.0, 15)
    gate.push(-45.0)
    assertEquals(0.5, gate.meterLevel(), 0.001)
    gate.push(-70.0)
    assertEquals(0.0, gate.meterLevel(), 0.001)
  }

  @Test
  fun worksOnRecognizerLevels() {
    val gate = VoiceGate(VoiceGate.Config.forRecognizerLevels())
    gate.feed(1.0, 6)
    assertEquals(listOf(VoiceGate.Event.SPEECH_STARTED), gate.feed(7.0, 10))
    assertEquals(listOf(VoiceGate.Event.SPEECH_ENDED), gate.feed(1.0, 20))
    assertEquals(500, gate.speechMs)
    assertNull(gate.rejection())
  }

  @Test
  fun measuresSampleLevelsAndClipping() {
    val full = ShortArray(320) { if (it % 2 == 0) Short.MAX_VALUE else (-Short.MAX_VALUE).toShort() }
    assertEquals(0.0, VoiceGate.levelDb(full, full.size), 0.01)
    assertEquals(-90.0, VoiceGate.levelDb(ShortArray(320), 320), 0.001)
    val half = ShortArray(320) { (if (it % 2 == 0) 16384 else -16384).toShort() }
    assertEquals(-6.02, VoiceGate.levelDb(half, half.size), 0.05)
    val someClipped = ShortArray(320) { if (it < 16) Short.MAX_VALUE else 100.toShort() }
    assertTrue(VoiceGate.isClipped(someClipped, someClipped.size))
    val oneClipped = ShortArray(320) { if (it == 0) Short.MAX_VALUE else 100.toShort() }
    assertFalse(VoiceGate.isClipped(oneClipped, oneClipped.size))
  }
}
