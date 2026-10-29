# Sigil

Sigil is an on device companion that lets you control your phone with hand gestures seen by the front camera and with your voice. A holographic cursor follows your index finger, a pinch taps, an open palm opens the Control Sphere hub, and each app gets its own gesture profile. Voice requests become short plans of visible steps, and Sigil always asks before sending or posting anything. Hand tracking, speech and the language model run on the phone.

Read [docs/VISION.md](docs/VISION.md) for the product, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works and [docs/MODULES.md](docs/MODULES.md) for the API of every module.

## Status

This is the first skeleton (milestone M1).

Works and is tested without a device:

- Gesture engine: 21 point hand model, One Euro filter, and a classifier for open palm, point, pinch, double pinch, pinch and hold, fist, two and three finger swipes, clockwise and counterclockwise circles, flicks, and a moving pinch that turns like a knob or drags like a slider, tested on synthetic hand recordings.
- App profiles: JSON gesture profiles for WhatsApp, Instagram, YouTube, TikTok, Chrome, Messages, Settings and a general profile, validated with a schema. In the general profile a pinched circle turns the volume and a pinched drag up or down changes the brightness.
- Sigil core: intent tools for a local model with a rule based fallback in eight languages, an action planner, a confirmation policy that blocks bulk automation and reads confirm and cancel words the same way in every language, and a plan executor.
- System controls: volume up, down, to a percent, mute and unmute (media by default, ring and alarm when named), play, pause, next and previous for any player, skipping seconds and changing the playback speed, likes, brightness, back, home, recent apps, notifications, quick settings, lock screen, screenshot, power menu, and the Wi-Fi, Bluetooth and Do Not Disturb panels. The Control Sphere has volume and brightness quick actions with live level rings.
- On device language model (milestone M4): llama.rn (llama.cpp) runs Qwen2.5 1.5B Instruct on phones with 6 GB of RAM (lite tier) or Qwen2.5 3B Instruct with 8 GB (full tier), picked from the RAM expo-device reports. The settings section "On device model" shows the recommended tier, its size and memory, and downloads the model once from Hugging Face over Wi-Fi, resumable and checked against a SHA-256 pinned in the code; it can pause, cancel and delete. The planner uses the model when it is loaded and falls back to the rules on a timeout, an invalid call or no model; without a model the rule parser still understands the built in commands. See [On device model](#on-device-model).
- Voice adapter with a mock speech engine.

Needs a device or the next milestones:

- Live hand tracking (MediaPipe Hand Landmarker through a frame processor and inside the camera service).
- The Android control module (accessibility service, cursor overlay, camera foreground service, volume, brightness and media session control) and the llama.rn runtime build in the release APK, but have not run on a phone yet.
- Speed, memory and the quality of the model's tool calls on real phones, in the eight languages.
- On device speech (whisper.rn or the system recognizer).

## On device model

| Tier | Model | File (Q4_K_M GGUF) | Phones |
| --- | --- | --- | --- |
| Rules only | none | none | all |
| Lite | Qwen2.5 1.5B Instruct | 1.12 GB, Apache 2.0 | 6 GB of RAM and more |
| Full | Qwen2.5 3B Instruct | 2.10 GB, Qwen Research License | 8 GB of RAM and more |

- The files come from the official Qwen repositories on Hugging Face, pinned to a commit, with their size and SHA-256 in `src/adapters/catalog.ts`. A file that does not match is deleted.
- Downloads use Wi-Fi only unless the user allows mobile data, check the free storage first, continue after a pause, a lost connection or a restart, and can be cancelled. The model file is the only thing Sigil downloads; requests never leave the phone, and there is no backend.
- The model runs on the CPU with a 2,048 token context and about half the cores. It loads when the user starts to speak or at the first request, and is released in the background, under memory pressure and after five minutes without requests.
- The answer is constrained by a JSON schema to exactly one call to one of the 17 intent tools, through the model's own chat template, and then goes through the same validation and confirmation rules as the rule parser's.
- The full tier's license allows research and evaluation; commercial use of Qwen2.5 3B needs a license from Alibaba Cloud.

## Languages

The app, its voice parser and the Android strings of the control module speak English, Portuguese (Brazil), Spanish, French, German, Italian, Japanese and Chinese (Simplified).

- The app follows the phone's language through expo-localization, with English when Sigil is not translated into it, and the user can pick another language in the app. Messages live in `src/i18n/locales`, one typed file per language, so a missing key fails `tsc`.
- Voice requests are parsed in all eight languages (`src/sigil-core/languages`), with the request's locale tried first.
- The Android strings live in `modules/sigil-control/android/src/main/res/values*`. The module's config plugin (`modules/sigil-control/app.plugin.js`) also writes them into the native project at `expo prebuild`, and expo-localization declares the eight languages for the per app language settings of Android 13 and iOS.
- Store titles and short descriptions are in `store/descriptions`.

## Run it

```sh
npm install
npm test               # unit tests
npm run typecheck      # TypeScript
npx expo-doctor        # dependency and config checks
npx expo start         # Expo Go: the screens work, system control is off
```

The Android control module needs a development build:

```sh
npx eas-cli@latest build --profile development --platform android
```

After installing the build, open Settings, Accessibility and enable "Sigil hands free control". On Android 13 and later, an APK installed outside an app store first needs App info, menu, "Allow restricted settings".

## Platforms

- **Android**: system wide control through an accessibility service, a cursor window over other apps and a camera foreground service with its visible notification. Sigil is declared as an accessibility tool for hands free control.
  - Volume and media keys need no permission.
  - Brightness needs "Modify system settings", which Sigil asks for with an explanation; without it Sigil opens the display settings. Setting the brightness turns adaptive brightness off, or the system would replace the value at once.
  - Skipping seconds and changing the playback speed need notification access ("Sigil media control"): Android shares the active media session only with enabled notification listeners. Sigil never reads notifications.
  - Since Android 10, apps cannot turn Wi-Fi on or off, so Sigil opens the Wi-Fi panel instead; it opens the Bluetooth and Do Not Disturb settings the same way, and the user flips the switch.
- **iOS**: apps cannot control or draw over other apps, so Sigil works inside its own screens and through Shortcuts and App Intents. The screen brightness can be set from Sigil; the system volume cannot (only the system volume view and the hardware buttons change it), and players of other apps cannot be controlled.

## Layout

```
src/
  app/               screens (Expo Router)
  features/          home screen sections, the on device model settings included
  i18n/              typed messages in eight languages, language detection and picker
  gesture-engine/    landmarks, One Euro filter, classifier, synthetic hands
  app-profiles/      JSON gesture profiles and their registry
  sigil-core/        intents, voice parser in eight languages, planner, confirmation policy, executor
  adapters/          speech to text port, on device model (llama.rn engine, downloader, tiers), model catalog
  system-control/    device controllers, gesture dispatch, volume and brightness levels
  cursor-overlay/    holographic cursor (Skia, Reanimated)
  control-sphere/    Control Sphere hub and level rings (Skia, Reanimated)
  ui/                design tokens and primitives
modules/
  sigil-control/     Android native module (Kotlin) and its config plugin
  sigil-memory/      Android native module (Kotlin): CPU cores, free memory and memory pressure for the model
store/
  descriptions/      store title and short description per language
docs/
```

## Author

Alexandre Kohler, [GitHub](https://github.com/kwy404) and [LinkedIn](https://www.linkedin.com/in/alexandre-silva-173687256/).
