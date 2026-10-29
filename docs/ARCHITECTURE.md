# Architecture

Sigil turns two inputs, hand landmarks from the front camera and speech, into actions on the phone. The pure TypeScript core (gesture engine, app profiles, planner, policy) is platform independent and fully unit tested. Platform code is kept behind small ports: a `DeviceController` for actions, a `SpeechToText` for voice and a `LanguageModel` for planning.

```
            SENSING                    UNDERSTANDING                 DECIDING              ACTING
 front camera -> hand landmarker -> gesture-engine ----------> app-profiles ------> system-control -> Android
                 (MediaPipe, 21 pts)  filter, pose, motion        gesture -> action    dispatch          accessibility,
                                      GestureEvent                (per app JSON)                         media keys,
 microphone ---> speech to text ---> sigil-core planner ----> confirmation policy -> PlanExecutor ->   app launch
                 (adapters/voice)     intent tool -> steps       confirm, no bulk     step by step
                                      (adapters/model or rules)

 PRESENTING: holographic cursor (native overlay over apps, Skia inside Sigil), Control Sphere, step feed, confirmation card
```

## Layers and modules

| Layer | Module | Runs where |
| --- | --- | --- |
| Hand model and gestures | `src/gesture-engine` | any JS runtime: JS thread, frame processor worklet, UI worklet |
| Per app meaning | `src/app-profiles` | JS thread |
| Intents, plans, safety | `src/sigil-core` | JS thread |
| Speech and model ports | `src/adapters/voice`, `src/adapters/model`, `src/adapters/catalog.ts` | JS thread, native engines on their own threads |
| On device language model | `src/adapters/model` (llama.rn engine, downloader, tiers) + `modules/sigil-memory` (Kotlin) | JS thread; llama.cpp, the download and the SHA-256 on native worker threads |
| Device actions | `src/system-control` + `modules/sigil-control` (Kotlin) | JS thread calling native, Android main and binder threads |
| Visuals | `src/cursor-overlay`, `src/control-sphere`, `src/ui` | UI thread through Reanimated and Skia |
| Screens | `src/app`, `src/features` | React |

The rule between layers: the core never imports React Native, Expo or native modules. `sigil-core` depends on `app-profiles` (selectors and links) and on gesture types; `system-control` implements the core's `DeviceController` port. Every test runs without a device.

## Gesture path, from frame to action

1. **Frame.** The camera produces frames. In app, a VisionCamera frame processor feeds them to MediaPipe Hand Landmarker. System wide, the camera foreground service binds CameraX to its own lifecycle and runs the same landmarker (see Threading). Either way the result is a `HandFrame`: a timestamp and 21 landmarks, or null when no hand is visible.
2. **Coordinates.** Landmarks are normalized to the frame and mirrored to the user's point of view, so moving the hand right moves the cursor right. Geometry runs in isotropic units (y divided by the frame aspect) so angles do not depend on the camera resolution.
3. **Filter.** A One Euro filter per coordinate (63 channels) removes jitter at rest and adds almost no lag in fast motion. The pinch distance uses raw landmarks, because a click must not wait for the filter.
4. **Features.** Palm size (wrist to middle finger base) is the unit for every distance, so the hand can be near or far. Each finger gets a total bend angle and a state (extended, partial, curled) with hysteresis, plus the thumb to index pinch distance.
5. **Pose.** Each frame is classified as open palm, point, pinch, fist, two fingers, three fingers or unknown, and a stabilizer requires two consecutive frames before the pose changes.
6. **Gestures.** A small state machine turns poses and motion into events:
   - static: `open_palm` and `fist` after 300 ms, `point` after 150 ms (once per cursor session);
   - pinch: `pinch` on release, `double_pinch` for a second pinch within 350 ms, `pinch_hold` start and end after 550 ms;
   - motion: two and three finger swipes (palm travel of 0.2 frame widths within 420 ms, straight and along one axis), circles clockwise and counterclockwise (0.8 turns of the fingertip around the center of its path), and flicks (a short, fast, straight fingertip move).
   A 450 ms cooldown after each motion gesture prevents double triggers.
7. **Profile.** The accessibility service reports the package in front on every window change. `ProfileRegistry.resolve(package, gestureKey)` returns the action of the app profile, or the inherited one from the general profile.
8. **Action.** `dispatchProfileAction` executes it: pointer actions land on the cursor position in screen pixels (mapped from a control box, by default the central 60 percent of the frame width and 50 percent of its height), swipes, scrolls, global actions, media keys, volume, opening an app, or Sigil's own interface (sphere, voice, pause).

## Voice path, from speech to a confirmed plan

1. **Speech to text** produces a transcript in the spoken language (`SpeechToText` port; mock today).
2. **Intent.** The planner asks the `LanguageModel` for exactly one call to one of 17 fixed intent tools: `open_app`, `send_message`, `search`, `scroll`, `navigate`, `tap`, `type_text`, `media`, `seek`, `playback_speed`, `like`, `volume`, `brightness`, `settings_panel`, `control_sphere`, `create_post`, `clarify`. The arguments are validated with zod. If no model is downloaded or loaded, the call times out (4 s by default; 6 s for the lite model and 9 s for the full one), fails or is invalid, the deterministic rule parser produces the same tool call shape. On a timeout the planner aborts the model's signal, so llama.cpp stops generating. A model that is downloaded but not loaded starts loading at the first request, which the rules answer. Only the first call is used.
3. **Steps.** `expandIntent` turns the intent into a flat list of steps: `open_app`, `wait`, `find`, `tap`, `type`, `scroll`, `navigate`, `media`, `confirm`. App knowledge (search buttons, message fields, send buttons, deep links) comes from the profile selectors and links, never from the model. The step language has no loops or branches, so every plan is finite and can be shown before it runs.
4. **Policy.** `ConfirmationPolicy` refuses bulk requests (all contacts, everyone, repeated or scheduled actions), refuses messages to several people, marks commit steps (selectors flagged `commit`, or labels such as send, post, share, call, pay, delete, in English and Portuguese) and inserts a `confirm` step right before each one. A plan may contain at most one commit.
5. **Execution.** `PlanExecutor` runs one visible step at a time against the `DeviceController`. It checks the policy again before starting, so a hand built plan cannot skip it; a commit runs only right after a confirmation the user accepted within 30 seconds; the user can stop the plan at any step.

## Threading

Sigil keeps the per frame work off the JavaScript thread whenever Sigil itself is on screen, and accepts one JavaScript hop per frame while another app is in front.

**In app (Sigil on screen).**

- *Camera thread, frame processor worklet.* The landmarker plugin runs here. Because the gesture engine is written as worklets (plain data state, every hot function marked `'worklet'`), the filter and the classifier can run in the same worklet: `createClassifierState` once, `stepClassifier(state, frame)` per frame. The Babel worklets plugin already transforms the engine; the tests run that transformed code.
- *UI thread.* The cursor position goes to a Reanimated shared value; `HoloCursor` and `ControlSphere` read shared values directly in Skia, so the cursor moves without React renders.
- *JavaScript thread.* Only discrete gesture events (a few per minute) hop here, through the worklets scheduling API, to resolve the profile and run actions.
- How a frame processor shares values with Reanimated depends on the VisionCamera and worklets versions in use. The engine does not depend on that choice: it runs in whichever runtime receives the landmarks.

**System wide (another app in front).**

- VisionCamera is bound to Sigil's activity and stops when Sigil goes to the background, so system wide tracking lives in the camera foreground service: CameraX bound to the service lifecycle and MediaPipe in live stream mode on a background executor (`HandLandmarkPipeline`, an interface in the skeleton).
- Landmarks reach JavaScript as `onHandFrame` events (63 floats at about 30 Hz). The same TypeScript engine classifies them; the foreground service keeps the process and the JavaScript runtime alive.
- The cursor over other apps is a native view. It is moved with `moveCursor` today; once the native pipeline exists, the cursor can be driven natively from the landmarks to remove the JavaScript hop from the hot path, while gesture semantics stay in TypeScript.
- If the JavaScript runtime proves unreliable in the background on some devices, the fallback is a Kotlin port of the classifier, checked against the same recordings.

**Native threads.** Accessibility tree snapshots run as Expo `AsyncFunction`s off the JavaScript thread. Overlay windows are created and moved on the Android main thread. whisper.cpp and llama.cpp run on their own worker threads.

## Per app gesture profiles

- One JSON file per app in `src/app-profiles/profiles`, validated with a zod schema (`AppProfileSchema`) at startup and in the tests. Unknown keys, unknown gestures and unknown actions are errors.
- A profile lists Android packages (`com.whatsapp`, `com.whatsapp.w4b`), aliases for voice ("zap", "wpp"), gesture bindings, UI selectors for plans and URL templates (`launch`, `search`, `compose`).
- Profiles inherit from `general` (or from another profile with `extends`). A binding of `{ "type": "none" }` switches an inherited gesture off.
- Safety by construction: the action set is closed. A gesture can tap where the user points, scroll, swipe, navigate, control media and volume, open an app, or open Sigil's own interface, but no action sends, posts or pays on its own. The registry also refuses any profile that leaves no way to open the Control Sphere.
- The foreground package comes from the accessibility service (`TYPE_WINDOW_STATE_CHANGED`), so profiles switch as soon as the user changes apps.

## System wide control on Android

| Piece | Android component | Notes |
| --- | --- | --- |
| Read the app in front, act on it | `SigilAccessibilityService` | Window state events only; reads the active window on demand; taps, long presses, double taps and swipes with `dispatchGesture`; back, home, recents, notifications, quick settings, lock and screenshot with `performGlobalAction`; text with `ACTION_SET_TEXT` and the keyboard action key on Android 11+; scrolling through scrollable nodes |
| Cursor over every app | `CursorOverlay` | `TYPE_ACCESSIBILITY_OVERLAY` from the service: no extra permission, never touchable, touches pass through. Fallback `TYPE_APPLICATION_OVERLAY` with `SYSTEM_ALERT_WINDOW`, kept at 0.8 opacity so Android 12+ still delivers touches below it |
| Camera while other apps are open | `SigilCameraService` | Foreground service of type `camera`, plus `microphone` when voice is on; `FOREGROUND_SERVICE_CAMERA` and `FOREGROUND_SERVICE_MICROPHONE` (required on Android 14+); visible notification with a Stop action; the system camera indicator stays on |
| Opening apps | `SigilControlModule.openApp` | Launcher intents and deep links; package visibility through a `<queries>` entry for launcher activities instead of `QUERY_ALL_PACKAGES`; a bound accessibility service may start activities from the background |
| Media and volume | `AudioManager` | Media key events and stream volume; no permission |
| Seeking and playback speed | `SigilMediaListener` | Android shares the active media session only with an enabled notification listener, so seeking and speed need notification access; Sigil never reads notifications. Play, pause, next and previous need nothing |
| Brightness | `SystemLevels` | "Modify system settings" (`WRITE_SETTINGS`); adaptive brightness is turned off, or the system would overwrite the value. Without the permission Sigil opens the display settings |
| Wi-Fi, Bluetooth, Do Not Disturb | Settings panels | Android 10 and later do not let apps switch them, so Sigil opens the system panel and the user flips the switch |

The manifest entries live in the module (`modules/sigil-control/android/src/main/AndroidManifest.xml`) and are merged into the app at build time, together with `res/xml/sigil_accessibility_service.xml` (`canPerformGestures`, `canRetrieveWindowContent`, `flagReportViewIds`, `flagRetrieveInteractiveWindows`, `isAccessibilityTool`). Expo autolinking picks up `modules/sigil-control`, and its config plugin (`modules/sigil-control/app.plugin.js`) copies the translated Android strings (`values-*`) into the generated app at prebuild.

Platform rules that shape the design:

- **Camera services start in the foreground.** Android does not let an app start a camera foreground service from the background, so the user turns gesture control on from Sigil's screen; it then keeps running when the user switches apps.
- **Setup is manual.** The user enables "Sigil hands free control" in Settings, Accessibility. Sigil shows its own disclosure first, explaining what the service reads and does, and only then opens the settings screen.
- **Sideloaded builds.** On Android 13 and later, an APK installed outside an app store (for example an EAS internal build) needs App info, menu, "Allow restricted settings" before its accessibility service can be enabled.
- **Advanced Protection.** Android 16 can restrict accessibility services to apps declared as accessibility tools, one more reason the declaration must be accurate.

## Google Play policy

- Apps that use the AccessibilityService API must complete the accessibility declaration in Play Console and describe the use in the store listing.
- `isAccessibilityTool="true"` is reserved for apps whose core purpose is to directly support people with disabilities. Hands free control for people with limited mobility is that purpose, and the listing, onboarding and default settings must reflect it. If Sigil ever ships a variant aimed at convenience only, that variant must drop the flag and follow the prominent disclosure and consent rules.
- Play policy forbids using the API to change settings without permission, to work around privacy controls, or to deceive the user, and recent updates restrict apps from using it to take autonomous actions on the user's behalf. Sigil's design answers this directly: every gesture is a direct, visible action where the user points; every plan comes from a request the user made, runs step by step on screen, can be stopped at any step, and stops for confirmation before sending or posting. Check the policy text again at submission time, since it changes.
- Automation in third party apps such as WhatsApp and Instagram stays user initiated and visible, never bulk. This is enforced in code, not only in policy: bulk requests are refused, a plan sends to one person and contains at most one commit, there are no loops in the step language, and the executor checks every plan again before running it.

## iOS fallback

iOS has no equivalent of the accessibility service for third party apps: an app cannot read or tap inside other apps, cannot draw over them, and cannot use the camera while it is in the background. Sigil on iOS therefore:

- tracks the hand and shows the cursor and the Control Sphere inside its own screens only;
- plans voice requests the same way, then executes what iOS allows: opening apps and searches through URL schemes and universal links (`whatsapp://send?text=`, YouTube search links), and running user Shortcuts through `shortcuts://run-shortcut?name=`;
- exposes its own actions as App Intents, so Siri, the Shortcuts app and the Action button can call Sigil (planned, through a Swift Expo module);
- uses `InAppDeviceController`, which reports every unsupported step as failed instead of pretending.

The native module declares only the Android platform, so iOS builds skip it and `getSystemControl()` reports `in-app` mode. Expo Go behaves the same on both platforms.

## On device language model

The planner can use a small language model that runs on the phone through llama.rn (llama.cpp), sized by the phone's memory. Without it, the rule parser plans every request; the model only adds requests said in the user's own words.

```
 settings: On device model ----> OnDeviceModel ----> ModelDownloader --(once, Wi-Fi)--> Hugging Face, pinned commit
   tier, download, cancel,        tier from RAM        .part file, resume, SHA-256          models/<file>.gguf
   delete, mobile data            settings file
                                       |
 planner ----> ToolCallingModel ----> LlamaChatEngine ----> llama.rn context (n_ctx 2048, CPU threads)
   timeout per tier, abort            lazy load, one call     JSON schema grammar: one tool call
   falls back to the rules            at a time, release      cached system prompt and tool list
```

**Tiers.** `recommendTier` picks the largest tier whose minimum RAM the phone meets and whose peak memory stays under 35 percent of it. The RAM comes from expo-device (`totalMemory`); Android keeps part of the memory for itself (an 8 GB phone reports about 7.3 GB), so `ramClassMb` rounds the report up to the size the phone was sold with before comparing.

| Tier | Language model | File | Phones |
| --- | --- | --- | --- |
| rules | none | none | all |
| lite | Qwen2.5 1.5B Instruct, Q4_K_M | 1.12 GB | 6 GB of RAM and more |
| full | Qwen2.5 3B Instruct, Q4_K_M | 2.10 GB | 8 GB of RAM and more |

The user can switch to any tier the phone holds; tiers above its memory cannot be selected. The choice and the mobile data setting are saved in `sigil-model.json` in the app's document folder.

**Download.** One file per model, pinned in `src/adapters/catalog.ts` to the official Qwen repository at a fixed commit, with its exact size and SHA-256:

- the download only starts on Wi-Fi or Ethernet, unless the user allows mobile data, and only when the storage holds the rest of the file plus 300 MB;
- it writes `models/<file>.part` through an expo-file-system `DownloadTask`, with progress in the settings, and can be paused, resumed and cancelled (cancel deletes the partial file);
- it pauses when the phone leaves Wi-Fi and continues when Wi-Fi is back; after a network error the next try continues from the partial file;
- if the app closes during the download, it continues from the bytes already on disk at the next start (Android resumes from a byte offset; iOS starts over unless the download was paused);
- once complete, the native SHA-256 of the file is compared with the pinned one: a mismatch, or a wrong size, deletes the file; a match moves it to `models/<file>` and writes a `.sha256` marker, so the check runs once;
- Android backups are off for Sigil (`allowBackup` in `app.json`), so the models never go to the cloud; the settings delete them on request.

The only network request Sigil makes for the model is the download of that file. Requests, transcripts and plans never leave the phone.

**Engine.** `LlamaChatEngine` implements the `ChatEngine` port over llama.rn:

- the weights load lazily, when the user starts to speak (`ActionPlanner.prepareModel`) or at the first request, which the rules answer while the model loads; the file is memory mapped, not locked in RAM;
- the context holds 2,048 tokens, with a batch of 512 and one sequence; the thread count comes from the CPU cores (about half of them, at most four, which llama.rn pins to the fastest cores);
- llama.rn runs on the CPU: the OpenCL and Hexagon backends are switched off in its config plugin;
- the messages go through the model's own chat template (the Jinja template in the GGUF file). The 17 tools are listed compactly in the first system message (rendered as JSON by the template they would take about 2,200 tokens, more than the whole context; the list takes about a third), and a JSON schema that only accepts one call to one of the tools becomes a llama.cpp grammar, so the answer is always a well formed call. sigil-core still validates it with zod, and the policy still guards it;
- the first system message never changes, so llama.cpp keeps it in the KV cache: after a warm up at load time a request only evaluates a short context note (app on screen, language) and the request itself;
- one operation runs at a time; aborting the signal calls `stopCompletion`;
- the weights are released when the app goes to the background, when Android reports memory pressure (`TRIM_MEMORY_RUNNING_LOW` and above, through `modules/sigil-memory`; React Native does not forward these callbacks on Android) or iOS sends a memory warning, after five minutes without requests (loading again means evaluating the system prompt again, so a shorter wait would send most requests to the rules), and before the model is deleted or the tier changes. Loading is refused while Android reports low memory.

## Testing without a device

- A kinematic hand rig (`synthetic.ts`) produces the 21 landmarks for any hand shape, rotation, scale and frame aspect, with seeded Gaussian noise.
- Sample recordings cover every gesture of the vocabulary, plus negative recordings for false positives (idle jitter, slow drags, a hand that appears briefly).
- The classifier test replays every recording at 15, 30 and 60 fps with tracker noise of 0.002 and 0.004 frame widths and three seeds. A wider sweep of 3840 replays only failed at noise of 0.005 and above.
- The planner and policy are tested on requests in all eight languages, model outputs (valid, invalid, slow, several calls) and bulk requests; the executor runs plans against an in memory WhatsApp.
- The on device model is tested with fakes of its ports (`src/adapters/__tests__/fakes.ts`): an in memory file system with a transfer the test drives byte by byte, a network that switches between Wi-Fi, mobile data and nothing, and a llama.rn runtime. The tests cover the tier choice, every download state, resume after a pause, a network change or a restart, checksum failures, the engine parameters, warm up, abort, release and the planner fallback.

## Open risks

- Landmark quality at arm's length and in low light; the control box and thresholds need per user calibration on real devices.
- Battery and heat of continuous camera and inference; the service must lower the frame rate when the hand is absent.
- Selectors in third party apps change with app updates and languages; plans fail cleanly when a control is not found, and selectors need on device verification (WhatsApp, Instagram, Messages).
- JavaScript in the background under aggressive OEM battery managers; see the Kotlin classifier fallback above.
- The language model has only run against fakes. Load time, tokens per second, memory, heat and the quality of the tool calls in all eight languages need real phones, and the planner timeouts per tier (6 s and 9 s) must be tuned from those numbers. Releasing the weights in the background means a voice request made while another app is in front loads the model again.
- The full tier's Qwen2.5 3B weights use the Qwen Research License, which needs a license from Alibaba Cloud for commercial use; the lite tier's Qwen2.5 1.5B is Apache 2.0.
