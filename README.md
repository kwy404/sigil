# Sigil

Sigil is an on device companion that lets you control your phone with hand gestures seen by the front camera and with your voice. A holographic cursor follows your index finger, a pinch taps, an open palm opens the Control Sphere hub, and each app gets its own gesture profile. Voice requests become short plans of visible steps, and Sigil always asks before sending or posting anything. Hand tracking, speech and the language model run on the phone.

Read [docs/VISION.md](docs/VISION.md) for the product, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works and [docs/MODULES.md](docs/MODULES.md) for the API of every module.

## Status

This is the first skeleton (milestone M1).

Works and is tested without a device:

- Gesture engine: 21 point hand model, One Euro filter, and a classifier for open palm, point, pinch, double pinch, pinch and hold, fist, two and three finger swipes, clockwise and counterclockwise circles and flicks, tested on synthetic hand recordings.
- App profiles: JSON gesture profiles for WhatsApp, Instagram, YouTube, TikTok, Chrome, Messages, Settings and a general profile, validated with a schema.
- Sigil core: intent tools for a local model with a rule based fallback (English and Brazilian Portuguese), an action planner, a confirmation policy that blocks bulk automation, and a plan executor.
- Voice and model adapters with mocks, and the download and memory budget of the candidate models.

Needs a device or the next milestones:

- Live hand tracking (MediaPipe Hand Landmarker through a frame processor and inside the camera service).
- The Android control module (accessibility service, cursor overlay, camera foreground service) is written but has to be built with EAS and tried on a phone.
- On device speech (whisper.rn or the system recognizer) and a local model (llama.rn).

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
- **iOS**: apps cannot control or draw over other apps, so Sigil works inside its own screens and through Shortcuts and App Intents.

## Layout

```
src/
  app/               screens (Expo Router)
  features/          home screen sections
  gesture-engine/    landmarks, One Euro filter, classifier, synthetic hands
  app-profiles/      JSON gesture profiles and their registry
  sigil-core/        intents, planner, confirmation policy, executor
  adapters/          speech to text and local model ports, model catalog
  system-control/    device controllers and gesture dispatch
  cursor-overlay/    holographic cursor (Skia, Reanimated)
  control-sphere/    Control Sphere hub (Skia, Reanimated)
  ui/                placeholder tokens and primitives
modules/
  sigil-control/     Android native module (Kotlin)
docs/
```

## Author

Alexandre Kohler, [GitHub](https://github.com/kwy404) and [LinkedIn](https://www.linkedin.com/in/alexandre-silva-173687256/).
