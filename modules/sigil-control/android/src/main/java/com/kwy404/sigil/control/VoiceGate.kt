package com.kwy404.sigil.control

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Decides, from the level of each audio frame, whether a capture holds clear
 * speech, so Sigil never acts on noise or broken audio. Plain Kotlin with no
 * Android types, so its rules are unit tested on the JVM.
 *
 * The first [Config.calibrationMs] set the noise floor. Speech starts when
 * [Config.startFrames] frames in a row rise [Config.startMarginDb] above the
 * floor and ends after [Config.endSilenceMs] below the floor plus
 * [Config.endMarginDb]. While nobody speaks the floor keeps following the
 * room slowly. [speechStartFrame] and [speechEndFrame] mark the speech, so
 * the silence before and after it can be trimmed.
 */
class VoiceGate(private val config: Config = Config()) {
  data class Config(
    val frameMs: Int = 20,
    val calibrationMs: Int = 300,
    val startMarginDb: Double = 10.0,
    val endMarginDb: Double = 6.0,
    val startFrames: Int = 3,
    val endSilenceMs: Int = 900,
    val minSpeechMs: Int = 350,
    /** Average speech level over the floor below which the speech is too quiet to trust. */
    val minSnrDb: Double = 12.0,
    /** Share of speech frames with clipped samples above which the audio counts as broken. */
    val maxClippedShare: Double = 0.3,
    /** A floor above this level means a noisy place, for the "too noisy here" hint. */
    val noisyFloorDb: Double = -42.0,
    /** How fast the floor follows the room while nobody speaks, from 0 to 1 per frame. */
    val floorAdapt: Double = 0.03,
    /** Levels below this count as silence. */
    val silenceDb: Double = -90.0,
    /** The meter spans this many dB above the floor. */
    val meterRangeDb: Double = 30.0,
  ) {
    companion object {
      /**
       * For recognizers that capture on their own and only report a level
       * (SpeechRecognizer onRmsChanged, roughly 0 to 10 dB every 50 ms):
       * smaller margins and no clipping check.
       */
      fun forRecognizerLevels() = Config(
        frameMs = 50,
        startMarginDb = 3.0,
        endMarginDb = 1.5,
        startFrames = 2,
        minSnrDb = 3.0,
        noisyFloorDb = 6.0,
        silenceDb = -10.0,
        meterRangeDb = 8.0,
      )
    }
  }

  enum class Phase { CALIBRATING, WAITING, SPEECH, ENDED }

  enum class Event { SPEECH_STARTED, SPEECH_ENDED }

  /** Why a capture is not clear speech. */
  enum class Rejection { NO_SPEECH, TOO_SHORT, CLIPPED, TOO_QUIET }

  var phase = Phase.CALIBRATING
    private set

  /** The noise floor in dB, or null while it is being measured. */
  var noiseFloorDb: Double? = null
    private set

  var frames = 0
    private set

  /** First frame of the speech, or -1 before it starts. */
  var speechStartFrame = -1
    private set

  /** Frame right after the last speech frame, or -1 before the speech ends. */
  var speechEndFrame = -1
    private set

  private val calibrationFrames = max(1, config.calibrationMs / config.frameMs)
  private val endSilenceFrames = max(1, config.endSilenceMs / config.frameMs)
  private var calibrationSum = 0.0
  private var loudRun = 0
  private var loudSum = 0.0
  private var loudClipped = 0
  private var quietRun = 0
  private var quietSum = 0.0
  private var speechFrames = 0
  private var speechLevelSum = 0.0
  private var clippedFrames = 0
  private var lastLevelDb = config.silenceDb

  /** Pushes one frame. Returns an event when speech starts or ends with it. */
  fun push(levelDb: Double, clipped: Boolean = false): Event? {
    val level = max(levelDb, config.silenceDb)
    lastLevelDb = level
    val index = frames++
    when (phase) {
      Phase.CALIBRATING -> {
        calibrationSum += level
        if (frames >= calibrationFrames) {
          noiseFloorDb = calibrationSum / frames
          phase = Phase.WAITING
        }
      }
      Phase.WAITING -> {
        val floor = noiseFloorDb ?: level
        if (level >= floor + config.startMarginDb) {
          loudRun++
          loudSum += level
          if (clipped) loudClipped++
          if (loudRun >= config.startFrames) {
            phase = Phase.SPEECH
            speechStartFrame = index - loudRun + 1
            speechFrames = loudRun
            speechLevelSum = loudSum
            clippedFrames = loudClipped
            return Event.SPEECH_STARTED
          }
        } else {
          loudRun = 0
          loudSum = 0.0
          loudClipped = 0
          noiseFloorDb = floor + (level - floor) * config.floorAdapt
        }
      }
      Phase.SPEECH -> {
        val floor = noiseFloorDb ?: config.silenceDb
        if (level < floor + config.endMarginDb) {
          quietRun++
          quietSum += level
          if (quietRun >= endSilenceFrames) {
            phase = Phase.ENDED
            speechEndFrame = index - quietRun + 1
            return Event.SPEECH_ENDED
          }
        } else {
          // A short pause belongs to the speech once the voice comes back.
          speechFrames += quietRun + 1
          speechLevelSum += quietSum + level
          if (clipped) clippedFrames++
          quietRun = 0
          quietSum = 0.0
        }
      }
      Phase.ENDED -> Unit
    }
    return null
  }

  /** Ends the capture where it is, as when the time limit is reached. */
  fun finish() {
    if (phase == Phase.SPEECH) {
      phase = Phase.ENDED
      speechEndFrame = frames - quietRun
    }
  }

  /** Length of the speech in milliseconds, without the silence around it. */
  val speechMs: Int
    get() = speechFrames * config.frameMs

  /** Average speech level over the noise floor, in dB. */
  val snrDb: Double
    get() {
      val floor = noiseFloorDb ?: return 0.0
      return if (speechFrames == 0) 0.0 else speechLevelSum / speechFrames - floor
    }

  val clippedShare: Double
    get() = if (speechFrames == 0) 0.0 else clippedFrames.toDouble() / speechFrames

  /** True when the room is loud enough to make recognition unreliable. */
  val noisy: Boolean
    get() = (noiseFloorDb ?: config.silenceDb) > config.noisyFloorDb

  /** The last level from 0 to 1 for a meter: 0 at the noise floor, 1 at the top of the range. */
  fun meterLevel(): Double {
    val floor = noiseFloorDb ?: (config.silenceDb + 30.0)
    return ((lastLevelDb - floor) / config.meterRangeDb).coerceIn(0.0, 1.0)
  }

  /** Null when the capture holds clear speech, or why it does not. */
  fun rejection(): Rejection? = when {
    speechStartFrame < 0 -> Rejection.NO_SPEECH
    speechMs < config.minSpeechMs -> Rejection.TOO_SHORT
    clippedShare > config.maxClippedShare -> Rejection.CLIPPED
    snrDb < config.minSnrDb -> Rejection.TOO_QUIET
    else -> null
  }

  companion object {
    /** Level of 16 bit samples in dB relative to full scale. */
    fun levelDb(samples: ShortArray, count: Int): Double {
      if (count <= 0) return -90.0
      var sum = 0.0
      for (i in 0 until count) {
        val value = samples[i] / 32768.0
        sum += value * value
      }
      val rms = sqrt(sum / count)
      return if (rms <= 1e-9) -90.0 else max(-90.0, 20.0 * log10(rms))
    }

    /** True when more than one percent of the samples sit at full scale. */
    fun isClipped(samples: ShortArray, count: Int): Boolean {
      if (count <= 0) return false
      var hits = 0
      for (i in 0 until count) {
        val value = samples[i].toInt()
        if (value >= 32_600 || value <= -32_600) hits++
      }
      return hits * 100 > count
    }
  }
}
