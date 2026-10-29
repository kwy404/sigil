package com.kwy404.sigil.control

import android.Manifest
import android.annotation.SuppressLint
import android.annotation.TargetApi
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AudioEffect
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.io.IOException
import java.io.OutputStream
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.Executor

/**
 * One voice request, from the first sample to the transcript, with nothing
 * acted on when the audio is noisy or broken.
 *
 * Sigil takes transient exclusive audio focus so music and videos pause, and
 * prefers the on device recognizer. On Android 13 and later it captures the
 * microphone itself (VOICE_RECOGNITION, or VOICE_COMMUNICATION when something
 * still plays and echo must be cancelled), with the noise suppressor, echo
 * canceler and gain control the phone offers, runs the audio through
 * [VoiceGate] and feeds only the speech, without the silence around it, to the
 * recognizer as 16 kHz mono PCM. Older versions use the recognizer's own
 * capture and gate its level reports. A capture the gate rejects ends without
 * a transcript, so nothing runs.
 *
 * Recognizer calls happen on the main thread; the capture runs on its own.
 */
class SpeechSession(
  private val context: Context,
  private val options: Options,
  private val emit: (String, Map<String, Any?>) -> Unit,
) {
  data class Options(
    val locale: String,
    /** The user agreed to a recognizer that may not run on the phone, asked to prefer offline. */
    val allowOffDevice: Boolean,
    val maxMs: Int = 12_000,
    val noSpeechMs: Int = 7_000,
  )

  /** Called once the session is over, so the module can start another. */
  var onEnded: (() -> Unit)? = null

  private val main = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val lock = Any()
  private var recognizer: SpeechRecognizer? = null
  private var onDevice = false
  private var ownAudio = false
  private var retried = false
  private var focusRequest: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { }

  /** Bumped on every attempt, so callbacks of an abandoned attempt do nothing. */
  private var generation = 0

  @Volatile
  private var capturing = false
  private var pipeRead: ParcelFileDescriptor? = null
  private var gate = VoiceGate()
  private var finished = false
  private var lastLevelAt = 0L

  /** Starts listening. Returns null, or why it cannot: permission, on_device_unavailable or no_recognizer. */
  fun start(): String? {
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      return "permission"
    }
    onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    if (!onDevice) {
      if (!SpeechRecognizer.isRecognitionAvailable(context)) return "no_recognizer"
      if (!options.allowOffDevice) return "on_device_unavailable"
    }
    main.post { begin() }
    return null
  }

  /** Stops waiting for more speech and asks for the transcript of what was said. */
  fun stop() {
    main.post {
      if (finished) return@post
      if (ownAudio) {
        synchronized(lock) { gate.finish() }
        capturing = false
      } else {
        recognizer?.stopListening()
      }
    }
  }

  /** Ends the request without a transcript. */
  fun cancel() {
    main.post { end(null) }
  }

  private fun begin() {
    if (finished) return
    val attempt = ++generation
    takeFocus()
    ownAudio = Build.VERSION.SDK_INT >= 33 && !retried
    synchronized(lock) {
      gate = if (ownAudio) VoiceGate() else VoiceGate(VoiceGate.Config.forRecognizerLevels())
    }
    val created = try {
      if (onDevice && Build.VERSION.SDK_INT >= 31) {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      } else {
        SpeechRecognizer.createSpeechRecognizer(context)
      }
    } catch (error: RuntimeException) {
      end(mapOf("code" to "no_recognizer", "message" to (error.message ?: "recognizer")))
      return
    }
    recognizer = created
    created.setRecognitionListener(listener)
    val intent = recognitionIntent(options.locale, onDevice)
    val output = if (ownAudio && Build.VERSION.SDK_INT >= 33) attachAudioSource(intent) else null
    emit("onSpeechState", mapOf("state" to "listening", "onDevice" to onDevice))
    created.startListening(intent)
    if (output != null) {
      capturing = true
      Thread({ capture(output, attempt) }, "sigil-voice").start()
    } else {
      // The recognizer captures; still give up when nobody speaks or it runs too long.
      main.postDelayed({
        if (attempt == generation && !finished && gate.speechStartFrame < 0) end(rejected(VoiceGate.Rejection.NO_SPEECH))
      }, options.noSpeechMs.toLong())
      main.postDelayed({ if (attempt == generation && !finished) recognizer?.stopListening() }, options.maxMs.toLong())
    }
  }

  /** Points the recognizer at a pipe Sigil writes the cleaned speech into. */
  @TargetApi(33)
  private fun attachAudioSource(intent: Intent): OutputStream {
    val pipe = ParcelFileDescriptor.createPipe()
    pipeRead = pipe[0]
    intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, pipe[0])
    intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
    intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
    intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SAMPLE_RATE)
    return ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])
  }

  @SuppressLint("MissingPermission")
  private fun openRecord(): Pair<AudioRecord, List<AudioEffect>>? {
    // Something still playing after the focus request needs the echo canceller of the call path.
    val sources = if (audio.isMusicActive) {
      listOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.VOICE_RECOGNITION)
    } else {
      listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.MIC)
    }
    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val size = maxOf(minBuffer, FRAME_SAMPLES * 2 * 10)
    for (source in sources) {
      val record = try {
        AudioRecord(source, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
      } catch (error: RuntimeException) {
        continue
      }
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        continue
      }
      val session = record.audioSessionId
      val effects = mutableListOf<AudioEffect>()
      // Some phones throw instead of returning null when an effect cannot attach; the capture goes on without it.
      if (NoiseSuppressor.isAvailable()) runCatching { NoiseSuppressor.create(session) }.getOrNull()?.let { effects.add(it) }
      if (AcousticEchoCanceler.isAvailable()) runCatching { AcousticEchoCanceler.create(session) }.getOrNull()?.let { effects.add(it) }
      if (AutomaticGainControl.isAvailable()) runCatching { AutomaticGainControl.create(session) }.getOrNull()?.let { effects.add(it) }
      effects.forEach { effect -> runCatching { effect.setEnabled(true) } }
      return record to effects
    }
    return null
  }

  private fun capture(output: OutputStream, attempt: Int) {
    // Let players react to the focus request before choosing the audio source.
    try {
      Thread.sleep(FOCUS_SETTLE_MS)
    } catch (interrupted: InterruptedException) {
      return
    }
    val opened = openRecord()
    if (opened == null) {
      runCatching { output.close() }
      main.post { if (attempt == generation) end(mapOf("code" to "audio", "message" to "The microphone could not be opened.")) }
      return
    }
    val (record, effects) = opened
    val frame = ShortArray(FRAME_SAMPLES)
    val bytes = ByteArray(FRAME_SAMPLES * 2)
    val preRoll = ArrayDeque<ByteArray>()
    var tail = -1
    var broken = false
    try {
      record.startRecording()
      while (capturing) {
        val read = record.read(frame, 0, FRAME_SAMPLES)
        if (read <= 0) break
        val level = VoiceGate.levelDb(frame, read)
        val clipped = VoiceGate.isClipped(frame, read)
        val (event, phase, frames, started) = synchronized(lock) {
          val event = gate.push(level, clipped)
          Quad(event, gate.phase, gate.frames, gate.speechStartFrame >= 0)
        }
        for (i in 0 until read) {
          bytes[i * 2] = (frame[i].toInt() and 0xff).toByte()
          bytes[i * 2 + 1] = (frame[i].toInt() shr 8 and 0xff).toByte()
        }
        val chunk = bytes.copyOf(read * 2)
        when (phase) {
          VoiceGate.Phase.CALIBRATING, VoiceGate.Phase.WAITING -> {
            preRoll.addLast(chunk)
            if (preRoll.size > PRE_ROLL_FRAMES) preRoll.removeFirst()
          }
          VoiceGate.Phase.SPEECH -> {
            if (event == VoiceGate.Event.SPEECH_STARTED) {
              main.post { if (attempt == generation) emit("onSpeechState", mapOf("state" to "speech", "onDevice" to onDevice)) }
              preRoll.forEach { output.write(it) }
              preRoll.clear()
            }
            output.write(chunk)
          }
          VoiceGate.Phase.ENDED -> {
            output.write(chunk)
            if (tail < 0) tail = TAIL_FRAMES
            if (--tail <= 0) break
          }
        }
        reportLevel()
        val elapsed = frames * FRAME_MS
        if (elapsed >= options.maxMs) break
        if (!started && elapsed >= options.noSpeechMs) break
      }
    } catch (error: IOException) {
      // The recognizer stopped reading: it ended on its own or was cancelled.
      broken = true
    } catch (error: RuntimeException) {
      // startRecording or read refused (the microphone is busy or no longer allowed). An error
      // thrown on this thread would end the app, so the recognizer finishes with what it has.
      broken = true
    } finally {
      capturing = false
      runCatching { record.stop() }
      record.release()
      effects.forEach { runCatching { it.release() } }
      runCatching { output.close() }
    }
    val rejection = synchronized(lock) {
      gate.finish()
      gate.rejection()
    }
    main.post {
      if (attempt != generation || finished) return@post
      if (rejection != null && !broken) {
        end(rejected(rejection))
      } else {
        emit("onSpeechState", mapOf("state" to "processing", "onDevice" to onDevice))
        recognizer?.stopListening()
      }
    }
  }

  private data class Quad(val event: VoiceGate.Event?, val phase: VoiceGate.Phase, val frames: Int, val started: Boolean)

  private fun reportLevel() {
    val now = System.currentTimeMillis()
    if (now - lastLevelAt < LEVEL_EVERY_MS) return
    lastLevelAt = now
    val (level, noisy) = synchronized(lock) { gate.meterLevel() to gate.noisy }
    main.post { if (!finished) emit("onSpeechLevel", mapOf("level" to level, "noisy" to noisy)) }
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) = Unit

    override fun onBeginningOfSpeech() = Unit

    override fun onRmsChanged(rmsdB: Float) {
      if (ownAudio || finished) return
      val event = synchronized(lock) { gate.push(rmsdB.toDouble()) }
      if (event == VoiceGate.Event.SPEECH_STARTED) {
        emit("onSpeechState", mapOf("state" to "speech", "onDevice" to onDevice))
      }
      reportLevel()
    }

    override fun onBufferReceived(buffer: ByteArray?) = Unit

    override fun onEndOfSpeech() {
      if (!ownAudio && !finished) {
        synchronized(lock) { gate.finish() }
        emit("onSpeechState", mapOf("state" to "processing", "onDevice" to onDevice))
      }
    }

    override fun onError(error: Int) {
      if (finished) return
      val started = synchronized(lock) { gate.speechStartFrame >= 0 }
      // Some recognizers refuse an outside audio source: listen once more with their own microphone.
      if (ownAudio && !retried && !started && (error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_AUDIO)) {
        retried = true
        capturing = false
        releaseRecognizer()
        main.postDelayed({ begin() }, RETRY_DELAY_MS)
        return
      }
      if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
        val rejection = synchronized(lock) { gate.rejection() } ?: VoiceGate.Rejection.NO_SPEECH
        end(rejected(rejection, noMatch = true))
        return
      }
      end(mapOf("code" to errorCode(error), "message" to "Speech recognizer error $error"))
    }

    override fun onResults(results: Bundle?) {
      if (finished) return
      val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
      val scores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
      val rejection = synchronized(lock) {
        gate.finish()
        gate.rejection()
      }
      when {
        texts.isEmpty() || texts[0].isBlank() -> end(rejected(rejection ?: VoiceGate.Rejection.NO_SPEECH, noMatch = true))
        rejection != null -> end(rejected(rejection))
        else -> {
          val confidences = texts.indices.map { index -> scores?.getOrNull(index)?.toDouble() ?: -1.0 }
          end(result(accepted = true, reason = null, texts = texts, confidences = confidences))
        }
      }
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
      if (!finished && !text.isNullOrBlank()) emit("onSpeechPartial", mapOf("text" to text))
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  private fun result(accepted: Boolean, reason: String?, texts: List<String>, confidences: List<Double>): Map<String, Any?> {
    val (speechMs, snrDb, noisy) = synchronized(lock) { Triple(gate.speechMs, gate.snrDb, gate.noisy) }
    return mapOf(
      "texts" to texts,
      "confidences" to confidences,
      "accepted" to accepted,
      "reason" to reason,
      "onDevice" to onDevice,
      "speechMs" to speechMs,
      "snrDb" to snrDb,
      "noisy" to noisy,
    )
  }

  private fun rejected(rejection: VoiceGate.Rejection, noMatch: Boolean = false): Map<String, Any?> =
    result(
      accepted = false,
      reason = if (noMatch && rejection == VoiceGate.Rejection.NO_SPEECH) "no_match" else rejection.name.lowercase(Locale.ROOT),
      texts = emptyList(),
      confidences = emptyList(),
    )

  /** Ends the session once: a result map has texts, an error map has a code, null is a cancel. */
  private fun end(outcome: Map<String, Any?>?) {
    if (finished) return
    finished = true
    capturing = false
    generation++
    releaseRecognizer()
    releaseFocus()
    runCatching { pipeRead?.close() }
    pipeRead = null
    when {
      outcome == null -> emit("onSpeechState", mapOf("state" to "cancelled", "onDevice" to onDevice))
      outcome.containsKey("code") -> emit("onSpeechError", outcome)
      else -> emit("onSpeechResult", outcome)
    }
    onEnded?.invoke()
  }

  private fun releaseRecognizer() {
    val current = recognizer ?: return
    recognizer = null
    runCatching { current.cancel() }
    runCatching { current.destroy() }
  }

  private fun takeFocus() {
    if (Build.VERSION.SDK_INT >= 26) {
      if (focusRequest != null) return
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setOnAudioFocusChangeListener(focusListener)
        .build()
      audio.requestAudioFocus(request)
      focusRequest = request
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
    }
  }

  private fun releaseFocus() {
    if (Build.VERSION.SDK_INT >= 26) {
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audio.abandonAudioFocus(focusListener)
    }
  }

  companion object {
    const val SAMPLE_RATE = 16_000
    private const val FRAME_MS = 20
    private const val FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS / 1000
    /** Audio kept from before the speech started, so its first sound is not cut. */
    private const val PRE_ROLL_FRAMES = 15
    /** Audio sent after the speech ended, so its last sound is not cut. */
    private const val TAIL_FRAMES = 10
    private const val LEVEL_EVERY_MS = 80L
    private const val FOCUS_SETTLE_MS = 150L
    private const val RETRY_DELAY_MS = 150L

    fun recognitionIntent(locale: String, onDevice: Boolean): Intent =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        // Never silently online: a recognizer that is not on the phone is asked to stay offline.
        if (!onDevice) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      }

    fun errorCode(error: Int): String = when (error) {
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
      SpeechRecognizer.ERROR_AUDIO -> "audio"
      SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "server"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "busy"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
      SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "language_unsupported"
      SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language_unavailable"
      else -> "other"
    }

    private fun sameLanguage(tags: List<String>, locale: String): Boolean {
      val wanted = locale.replace('_', '-').lowercase(Locale.ROOT)
      val language = wanted.substringBefore('-')
      return tags.any { tag ->
        val have = tag.replace('_', '-').lowercase(Locale.ROOT)
        have == wanted || have == language
      }
    }

    /**
     * What on device recognition can do for a language: ready, downloading,
     * download (the phone can fetch it), unsupported, off_device_only (only a
     * recognizer that may use the network), none, or unknown (Android 12,
     * which cannot tell).
     */
    fun checkSupport(context: Context, locale: String, callback: (String) -> Unit) {
      val main = Handler(Looper.getMainLooper())
      main.post {
        val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        when {
          !onDevice -> callback(if (SpeechRecognizer.isRecognitionAvailable(context)) "off_device_only" else "none")
          Build.VERSION.SDK_INT < 33 -> callback("unknown")
          else -> checkLanguages(context, locale, main, callback)
        }
      }
    }

    @TargetApi(33)
    private fun checkLanguages(context: Context, locale: String, main: Handler, callback: (String) -> Unit) {
      val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      val done = { answer: String ->
        main.post {
          runCatching { recognizer.destroy() }
          callback(answer)
        }
      }
      recognizer.checkRecognitionSupport(
        recognitionIntent(locale, true),
        Executor { main.post(it) },
        object : RecognitionSupportCallback {
          override fun onSupportResult(support: RecognitionSupport) {
            done(
              when {
                sameLanguage(support.installedOnDeviceLanguages, locale) -> "ready"
                sameLanguage(support.pendingOnDeviceLanguages, locale) -> "downloading"
                sameLanguage(support.supportedOnDeviceLanguages, locale) -> "download"
                else -> "unsupported"
              },
            )
          }

          override fun onError(error: Int) {
            done("unknown")
          }
        },
      )
    }

    /** Asks the phone to download its on device model for a language. Android 13 and later. */
    fun downloadModel(context: Context, locale: String): Boolean {
      if (Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) return false
      val main = Handler(Looper.getMainLooper())
      main.post { triggerDownload(context, locale, main) }
      return true
    }

    @TargetApi(33)
    private fun triggerDownload(context: Context, locale: String, main: Handler) {
      val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      runCatching { recognizer.triggerModelDownload(recognitionIntent(locale, true)) }
      main.postDelayed({ runCatching { recognizer.destroy() } }, 1000)
    }
  }
}
