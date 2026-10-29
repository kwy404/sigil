# Modules

Public API of every module. Each folder under `src/` has an `index.ts` that is its public surface; import from the folder, not from inner files.

## gesture-engine

Hand landmarks in, discrete gestures out. Pure TypeScript, no React Native imports, hot functions marked `'worklet'` so they also run in frame processor and UI runtimes.

### Types

| Export | Description |
| --- | --- |
| `Landmark` | `{ x, y, z }` normalized to the frame, mirrored to the user's view, y down |
| `HandFrame` | `{ t, landmarks: Landmark[] or null, score?, handedness? }`, `t` in milliseconds |
| `HandPoint`, `HAND_LANDMARK_COUNT`, `FINGER_CHAINS` | The 21 point layout of MediaPipe Hand Landmarker |
| `GestureKind` | `open_palm`, `point`, `pinch`, `double_pinch`, `pinch_hold`, `fist`, `swipe_two`, `swipe_three`, `circle_cw`, `circle_ccw`, `flick` |
| `GestureEvent` | `{ kind, t, direction?, phase?, position, confidence }`; `phase` is `start` or `end` for `pinch_hold` |
| `GestureKey`, `GESTURE_KEYS` | The 24 keys profiles bind, directional gestures expanded (`swipe_two_left`, `flick_up`) |
| `HandPose` | `none`, `unknown`, `open_palm`, `point`, `pinch`, `fist`, `two_fingers`, `three_fingers` |

### Classifier

```ts
const classifier = new GestureClassifier({ frameAspect: 3 / 4 });
const events = classifier.push(frame);       // GestureEvent[] completed by this frame
const pending = classifier.flush(now);        // emits a single pinch once the double pinch window is over
const { pose, cursor, pinching, holding, handVisible } = classifier.snapshot;
```

Functional form for worklets: `createClassifierState(overrides)`, `stepClassifier(state, frame)`, `flushClassifier(state, t, force?)`, `snapshotClassifier(state)`. `resolveClassifierConfig(overrides)` merges partial overrides with `DEFAULT_CLASSIFIER_CONFIG`:

| Group | Defaults |
| --- | --- |
| `smoothing` (One Euro) | `minCutoff` 1.5 Hz, `beta` 10, `dCutoff` 1 Hz; `null` disables it |
| `features` | finger extended under 1.0 rad of bend, curled over 1.9 rad, 0.35 rad hysteresis; thumb extended over 0.5 palm sizes from the index base, curled under 0.3 |
| `pinchThresholds` | enter under 0.25 palm sizes, release over 0.38, not when the index is bent over 2.6 rad |
| `stabilizer` | a new pose needs 2 frames and 30 ms |
| `pinch` | shortest 40 ms, hold after 550 ms, double pinch window 350 ms, single pinch deferred until the window closes |
| `holds` | open palm 300 ms, fist 300 ms, point 150 ms |
| `swipe` | 0.2 frame widths within 420 ms, main axis 1.8 times the other, 60 percent of frames in the pose, path no longer than 1.3 times the displacement |
| `circle` | windows of 0.7 to 1.7 s, 0.8 turns, radius over 0.035, radius variation under 45 percent |
| `flick` | 0.14 frame widths within 170 ms, peak speed over 1.6 widths per second, straight |
| `cooldownMs`, `historyMs` | 450 ms, 1800 ms |

### Building blocks

| Export | Description |
| --- | --- |
| `OneEuroFilter`, `oneEuroNext`, `createOneEuroState`, `DEFAULT_ONE_EURO` | Scalar One Euro filter, class and functional forms |
| `createLandmarkFilterState`, `filterLandmarks`, `resetLandmarkFilter` | One filter per coordinate of the 21 landmarks |
| `toIsotropic`, `computeFeatures`, `fingerBend` | Palm size, finger bends and states, pinch distance, palm center |
| `classifyPose`, `createPoseTracker`, `updatePose` | Per frame pose and its stabilizer |
| `detectSwipe`, `detectCircle`, `detectFlick`, `pushTrackPoint`, `dominantDirection` | Motion detectors over a trajectory |
| `mapToScreen`, `ControlBox`, `DEFAULT_CONTROL_BOX` | Camera position to screen pixels |
| `gestureKey`, `describeGesture`, `isGestureKey` | Keys and readable labels ("Two finger swipe left") |
| `flattenLandmarks`, `unflattenLandmarks`, `isValidLandmarks` | The flat 63 number format of the native trackers |

### Synthetic hands and recordings

| Export | Description |
| --- | --- |
| `rigLandmarks(pose, aspect?)`, `rigPose(shape, wrist, scale?, roll?)`, `RIG_SHAPES` | Kinematic hand rig: finger curls, pinch, rotation, scale |
| `renderPerformance(start, segments, options)`, `circlePath` | Scripted performances (hold, move, path, hide) rendered at any fps with seeded noise |
| `sampleRecordings(variant?)`, `negativeRecordings(variant?)`, `HandRecording` | One recording per gesture, and recordings that must stay quiet |
| `replayRecording(recording)`, `traceRecording(recording)` | Run the classifier over a recording; the trace keeps every snapshot for drawing |

## app-profiles

Gesture meaning per app, as validated JSON.

| Export | Description |
| --- | --- |
| `ProfileRegistry.withBuiltins()` | Registry with the eight built in profiles; throws if one is invalid |
| `registry.register(raw, { replace? })` | Validates and adds a profile; returns `{ ok, profile }` or `{ ok: false, issues }` |
| `registry.resolve(packageName, gestureKey)` | `ResolvedBinding` `{ key, action, profileId, inherited }` or null |
| `registry.forPackage(packageName)` | The app profile, or `general` |
| `registry.bindings(profileId)` | Effective bindings, inherited ones included, in vocabulary order |
| `registry.selector(profileId, name)`, `registry.links(profileId)` | UI selectors and URL templates for plans |
| `registry.findApp(spokenName)` | Match by id, name or alias, ignoring case, accents, "the" and "app" |
| `registry.list()`, `get(id)`, `unregister(id)` | Listing and management |
| `validateProfile(raw)`, `formatIssues(issues)` | Validation without a registry |
| `AppProfileSchema`, `ProfileActionSchema`, `SelectorSchema`, `LinksSchema` | zod schemas; `AppProfile`, `ProfileAction`, `Selector` types |
| `describeAction(action)` | Readable label ("Swipe right from cursor") |

Actions a gesture can be bound to:

| `type` | Fields | Effect |
| --- | --- | --- |
| `tap`, `double_tap` | | At the cursor |
| `long_press` | `durationMs?` (300 to 3000) | At the cursor |
| `drag` | | Press and follow the cursor; only on `pinch_hold` |
| `scroll` | `direction` | Scroll the content; `down` shows what is below |
| `swipe` | `direction`, `origin?` (`center` or `cursor`) | A finger swipe across the screen |
| `global` | `action`: back, home, recents, notifications, quick_settings, lock_screen, screenshot | System navigation |
| `media` | `action`: play_pause, next, previous | Media key |
| `volume` | `direction`: up, down | Media volume |
| `open_app` | `app`: profile id or package | Launch an app |
| `sphere` | `action`: toggle, open, close | Control Sphere |
| `voice` | `action`: listen | Start a voice request |
| `cursor` | `action`: toggle, recenter | Cursor visibility |
| `pause` | | Pause gesture control |
| `none` | | Switch an inherited gesture off |

### Adding an app

1. Create `src/app-profiles/profiles/<id>.json`:

   ```json
   {
     "schemaVersion": 1,
     "id": "spotify",
     "name": "Spotify",
     "packages": ["com.spotify.music"],
     "aliases": ["spot"],
     "bindings": {
       "swipe_two_left": { "type": "media", "action": "next" },
       "swipe_two_right": { "type": "media", "action": "previous" }
     }
   }
   ```

2. Add the import to `src/app-profiles/builtin.ts`.
3. Run `npm test`: the registry tests validate every built in profile, check that every gesture resolves, and the dispatch tests check that every binding is deliverable.

Selectors (`resourceId`, `text`, `contentDescription` lists, optional `className`, `commit: true` for send, post and share buttons) are only needed for voice plans. The selectors shipped for WhatsApp, Instagram, Messages, YouTube, TikTok, Chrome and Settings come from public app builds and must be verified on a device.

## sigil-core

Intents, plans, safety and execution. No platform code.

| Export | Description |
| --- | --- |
| `ActionPlanner` | `new ActionPlanner({ profiles, model?, fallback?, policy?, modelTimeoutMs?, defaultMessagingApp?, defaultSearchApp? })` |
| `planner.plan({ text, locale?, foregroundPackage? }, signal?)` | `PlanOutcome`: `planned` (with `Plan` and notes), `clarify`, `blocked`, `unsupported` or `not_understood`. The model gets its own abort signal, aborted after `modelTimeoutMs` (4000 by default) or with `signal`; then the rules plan |
| `planner.prepareModel({ locale?, foregroundPackage? })` | Starts loading a model that is not ready, for example when the user starts to speak |
| `Plan` | `{ request, intent, source: 'model' or 'rules', summary, steps, needsConfirmation }` |
| `PlanStep` | `open_app`, `wait`, `find`, `tap`, `type`, `scroll`, `navigate`, `media`, `confirm`; `StepTarget` is a profile selector, a text, a description or the focused field |
| `describeStep`, `describeTarget` | One line labels for the step feed |
| `INTENT_TOOLS`, `TOOL_NAMES`, `toolDefinitions()` | The 17 intent tools with zod argument schemas, exported as JSON schema function tools |
| `parseToolCall(rawCall)` | Validates a model tool call (object or JSON string arguments) into an `Intent` |
| `parseRequest(text, appNames)`, `cleanRequest(text)` | Deterministic parser for English, Brazilian Portuguese, Spanish, French, German, Italian, Japanese and Simplified Chinese; the language of the request is tried first, and missing accents, number words, CJK numerals and full width digits are understood |
| `parseAnswer(text)` | Yes, no or null for a spoken confirmation in any of the eight languages; a cancel word wins, and a yes counts only when the whole answer is yes words |
| `expandIntent(intent, context)` | Intent to steps, from profile selectors and links |
| `ConfirmationPolicy` | `screenRequest(text)`, `isCommit(step)`, `apply(steps)`, `check(steps)`; `maxCommitsPerPlan` defaults to 1 |
| `isSensitiveLabel`, `namesSeveralPeople` | Helpers behind the policy |
| `LanguageModel`, `ModelContext`, `ModelReply`, `RuleBasedModel` | Model port (`isReady()`, `propose(request, context, tools, signal?)`, optional `prepare(context, tools)`) and its deterministic implementation |
| `PlanExecutor` | `new PlanExecutor({ device, profiles, confirm, policy?, clock?, pollMs?, confirmationTtlMs?, maxScrolls?, onStep? })`, then `run(plan, signal?)` |
| `DeviceController`, `UiNode`, `NodeQuery`, `nodeMatches`, `AppLaunch` | Device port and the shared node matching rules |
| `ConfirmHandler`, `StepEvent`, `ExecutionResult`, `Clock`, `systemClock` | Execution callbacks and results |

## adapters/voice

| Export | Description |
| --- | --- |
| `SpeechToText` | `{ id, onDevice, isAvailable(), listen(options) }` |
| `ListenOptions` | `locale`, `maxDurationMs?`, `endSilenceMs?`, `onPartial?`, `signal?` |
| `Transcript` | `{ text, locale, confidence, durationMs, engine }` |
| `MockSpeechToText`, `DEMO_UTTERANCES`, `createSpeechToText()` | Scripted engine used until a native one is installed |
| `ListenAbortedError` | Thrown when listening is cancelled |

Candidates for the native engine:

| Engine | Download | Notes |
| --- | --- | --- |
| whisper.rn (whisper.cpp) | tiny q5_1 about 32 MB, base q5_1 about 60 MB, small q5_1 about 190 MB | Multilingual, Portuguese included; fully offline; base is the default for short commands; Core ML acceleration on iOS |
| System recognizer through expo-speech-recognition | none | Android 12+ on devices that ship an on device recognizer, iOS with on device recognition; quality and offline support vary by device and language |
| Vosk | about 50 MB per language | Small and fast, lower accuracy |

## adapters/model

The on device language model: the `ChatEngine` port and its llama.rn engine, the `LanguageModel` the planner uses, the model download and the tier for the phone. Everything exported from `index.ts` runs in unit tests with fakes; `platform.ts` wires expo-file-system, expo-network, expo-device, `modules/sigil-memory` and llama.rn, and only the screens import it.

| Export | Description |
| --- | --- |
| `ChatEngine` | `{ id, complete(request, signal?), release?(), isReady?(), prepare?(warmUp) }`: the chat completion surface Sigil needs; aborting the signal stops the generation |
| `ChatRequest`, `ChatResponse`, `ChatMessage` | Messages, tools, tool choice, sampling; response text and tool calls |
| `ToolCallingModel` | `new ToolCallingModel(id, () => engine or null, { temperature?, maxTokens? })`, a `LanguageModel` that loads lazily; `prepare(context, tools)` loads and warms up the engine |
| `buildMessages(request, context)` | A system message that never changes (rules and known apps), a context note (app on screen, language) and the request |
| `extractToolCallsFromText(text)` | Recovers a tool call printed as JSON, with or without tags |
| `MockChatEngine` | Answers through the rule parser, so the model path runs without a runtime |
| `LlamaChatEngine` | `new LlamaChatEngine({ id, modelPath, runtime, contextSize?, threads?, gpuLayers?, idleReleaseMs?, canLoad?, onStatus? })`; `status` is `idle`, `loading`, `ready` or `failed` |
| `LlamaRuntime`, `llamaRnRuntime()` | The runtime port, and llama.rn behind it, imported on first use |
| `threadCountFor(cores)` | About half the cores, at most four; four when the count is unknown |
| `toolList(tools)`, `describeTool(tool)` | The tools as one line each: `send_message(contact: string, text: string, app?: string): description` |
| `toolCallSchema(tools)` | JSON schema that accepts exactly one `{ name, arguments }` call to one of the tools |
| `DEFAULT_CONTEXT_SIZE`, `DEFAULT_IDLE_RELEASE_MS` | 2048 tokens; release after 60 s without requests |
| `ModelDownloader` | `new ModelDownloader({ file, url, storage, network, allowCellular, reserveBytes?, onChange? })`: `restore()`, `start()`, `pause()`, `cancel()`, `delete()`, `recheckNetwork()`, `dispose()` |
| `DownloadState` | `absent`, `downloading` (bytes, total), `paused` (bytes, total, reason `user`, `network` or `interrupted`), `verifying`, `ready` (path), `failed` (error `offline`, `wifi_required`, `no_space`, `network`, `checksum` or `storage`) |
| `ModelStorage`, `NetworkPort`, `NetworkInfo`, `Transfer` | Ports of the downloader: files, the network link and one HTTP transfer |
| `OnDeviceModel` | `snapshot()`, `subscribe(listener)`, `languageModel(tier?)`, `plannerTimeoutMs(tier?)`, `selectTier(tier or 'auto')`, `setAllowCellular(allow)`, `download()`, `pause()`, `cancel()`, `deleteModel()`, `release()` |
| `OnDeviceModelSnapshot`, `TierOption` | RAM, recommended and selected tier, each tier with its model, size, peak memory, fit and download state, and the engine status |
| `PLANNER_TIMEOUT_MS` | `rules` 4000, `lite` 6000, `full` 9000 |
| `getOnDeviceModel()` (`platform.ts`) | The app wide instance; releases the weights in the background and under memory pressure |

The runtime is llama.rn 0.12.9 (llama.cpp), pinned exactly in `package.json`, with its Expo config plugin set to `enableOpenCLAndHexagon: false`, so it runs on the CPU. Its postinstall downloads the prebuilt native libraries of that release and checks them with SHA-256.

| Tier | Model | Pinned file | Size | SHA-256 | License |
| --- | --- | --- | --- | --- | --- |
| lite | Qwen2.5 1.5B Instruct (Q4_K_M) | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` at `91cad51170dc346986eccefdc2dd33a9da36ead9`, `qwen2.5-1.5b-instruct-q4_k_m.gguf` | 1,117,320,736 bytes | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` | Apache 2.0 |
| full | Qwen2.5 3B Instruct (Q4_K_M) | `Qwen/Qwen2.5-3B-Instruct-GGUF` at `7dabda4d13d513e3e842b20f0d435c732f172cbe`, `qwen2.5-3b-instruct-q4_k_m.gguf` | 2,104,932,768 bytes | `626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d` | Qwen Research License |

The download URL is `https://huggingface.co/<repo>/resolve/<commit>/<file>`. Other candidates stay in the catalog without a pinned file:

| Model (Q4_K_M) | Download | Memory loaded | Notes |
| --- | --- | --- | --- |
| Llama 3.2 1B Instruct | about 810 MB | about 1.1 GB | Smallest useful tool caller |
| Llama 3.2 3B Instruct | about 2.0 GB | about 2.6 GB | Alternative license |

| Other runtime | Notes |
| --- | --- |
| react-native-executorch | ExecuTorch runtime with exported Llama 3.2 and Qwen models |
| MLC LLM | Compiled models with GPU on both platforms; heavier integration |

## adapters/catalog

| Export | Description |
| --- | --- |
| `MODEL_CATALOG`, `ModelAsset` | Hand landmarker, speech and language models with download and memory sizes, in megabytes of 1024 * 1024 bytes |
| `PinnedFile`, `fileUrl(file)` | Repository, commit, file name, exact size, SHA-256 and license of a model Sigil downloads, and its official URL |
| `MODEL_TIERS`, `ModelTier`, `findTier(id)` | `rules` (no model), `lite` (Whisper base, Qwen2.5 1.5B), `full` (Whisper small, Qwen2.5 3B) |
| `languageModelOf(tier)` | The language model of a tier, or null for rules only |
| `footprint(assetIds)` | `{ downloadMb, peakMemoryMb, residentMemoryMb }`; speech and language models take turns |
| `recommendTier(deviceRamMb, budgetShare = 0.35)` | Largest tier that fits the phone |
| `ramClassMb(totalMemoryBytes)` | The RAM the phone was sold with, from the total expo-device reports: 7.3 GB reported is an 8 GB phone |

| Tier | Download | Peak memory | Device RAM |
| --- | --- | --- | --- |
| rules | about 8 MB | about 60 MB | 3 GB and up |
| lite | about 1.1 GB | about 1.4 GB | 6 GB and up |
| full | about 2.2 GB | about 2.6 GB | 8 GB and up |

The download column includes the hand landmarker and the speech model of the tier; the model settings download only the language model.

## system-control

| Export | Description |
| --- | --- |
| `getSystemControl()` | `{ mode, native, device }`; mode is `android-system`, `android-setup` or `in-app` |
| `describeMode(mode)` | What the current build can control, in one sentence |
| `AndroidDeviceController` | `DeviceController` over the native module; nodes come from window snapshots matched with `nodeMatches` |
| `InAppDeviceController` | iOS, Expo Go and web: deep links only, every other step reports failure |
| `dispatchProfileAction(action, target, context, ui)` | Executes a profile action at the cursor, or on Sigil's interface |
| `requestControlPermissions({ microphone })` | Camera, microphone and notification permissions on Android |
| `getNativeControl()`, `NativeControl` | The native module or null |
| `readLevels(native)`, `UNKNOWN_LEVELS`, `LevelsSnapshot` | Media volume, mute and screen brightness for the Control Sphere level rings |
| `changeMediaVolume`, `changeScreenBrightness` | One step of volume or brightness, from a gesture or a quick action |

## modules/sigil-control (Android, Kotlin)

Local Expo module, autolinked from `modules/`. JavaScript API (`modules/sigil-control/index.ts`, null where the module is absent):

| Function | Returns | Description |
| --- | --- | --- |
| `getStatus()` | `SigilControlStatus` | Accessibility service on, overlay permission, camera service running, package in front, SDK level |
| `getScreenSize()` | `{ width, height, density }` | Full display in physical pixels, the unit of all coordinates |
| `openAccessibilitySettings()`, `openOverlaySettings()` | boolean | System settings screens |
| `openWriteSettings()`, `openMediaAccessSettings()` | boolean | "Modify system settings" for the brightness, notification access for seeking and speed |
| `openPanel(panel)` | boolean | Wi-Fi, Bluetooth, Do Not Disturb or display settings |
| `startCameraService(withMicrophone)`, `stopCameraService()` | boolean, void | Foreground service; needs the camera permission and Sigil on screen |
| `showCursor()`, `hideCursor()`, `moveCursor(x, y, state)` | boolean, void, void | Cursor window; `state` is idle, hover, press or drag |
| `tap`, `doubleTap`, `longPress`, `swipe` | `Promise<boolean>` | Gestures through the accessibility service |
| `globalAction(name)`, `typeText(text, submit)`, `scroll(direction)` | `Promise<boolean>` | Navigation, typing into the focused field, scrolling |
| `snapshotWindow(maxNodes)` | `Promise<WindowNode[]>` | Visible nodes of the active window, breadth first |
| `mediaKey(action)`, `adjustVolume(direction)` | `Promise<boolean>` | Media keys, and one volume step with the system panel |
| `seekBy(seconds)`, `setPlaybackSpeed(rate)` | `Promise<ControlOutcome>` | The player in front; need notification access, speed needs Android 10 or later |
| `changeVolume(stream, change, level)`, `getVolume(stream)` | `Promise<ControlOutcome>`, `VolumeLevel` | Up, down, set to a percent, mute |
| `changeBrightness(change, level)`, `getBrightness()` | `Promise<ControlOutcome>`, `BrightnessLevel` | Up, down or set to a percent; needs "Modify system settings" |
| `openApp(packageName, url, label)` | `Promise<boolean>` | By package, deep link, or launcher label |

Events: `onServiceStateChanged`, `onForegroundAppChanged`, `onCameraServiceStateChanged`, `onHandFrame` (63 floats per frame), `onCursorError`.

Kotlin classes: `SigilControlModule` (Expo module), `SigilAccessibilityService`, `CursorOverlay`, `SigilCameraService`, `HandLandmarkPipeline` (interface; CameraX and MediaPipe come next), `SigilRuntime` (bridge between the services and the module). Manifest: camera, microphone, foreground service camera and microphone, notifications and overlay permissions; the accessibility service bound by `BIND_ACCESSIBILITY_SERVICE`; the camera service with `foregroundServiceType="camera|microphone"`; a `<queries>` entry for launcher activities.

## modules/sigil-memory (Android, Kotlin)

Local Expo module for the on device model, autolinked from `modules/`. React Native does not forward Android's trim memory callbacks to JavaScript, so this module does. JavaScript API (`modules/sigil-memory/index.ts`, null where the module is absent):

| Function | Returns | Description |
| --- | --- | --- |
| `cpuCores()` | number | `Runtime.availableProcessors()`, for the llama.cpp thread count |
| `memoryInfo()` | `MemoryInfo` | `{ totalBytes, availableBytes, thresholdBytes, lowMemory }` from `ActivityManager.getMemoryInfo`; the model does not load while `lowMemory` is true |

Event: `onMemoryPressure` with `{ level }`, a `ComponentCallbacks2` trim level, registered while JavaScript listens. The model releases its weights from `TRIM_MEMORY_RUNNING_LOW` (10) up. No permissions.

## cursor-overlay

`HoloCursor({ x, y, press, visible, scale? })`: Skia drawing of the cursor inside a parent view, driven by Reanimated shared values (`x`, `y` in points, `press` and `visible` from 0 to 1). Sizes and colors come from the `light.cursor` tokens, the same metrics as the native cursor. Ignores touches; the pulse stops with reduced motion.

## control-sphere

`ControlSphere({ size, segments?, activeId?, onSelect?, children? })`: the hub with a breathing core (one breath every 5.2 s), an orbit (one turn every 12 s) and one arc per segment, in the lumen colors. Both motions stop with reduced motion. Segments are accessible buttons. `DEFAULT_SEGMENTS`: Apps, Voice, Cursor, Profiles, Pause, Settings. `children` draw above the sphere, for example a `HoloCursor`.

## ui

`tokens` (colors, spacing, radii, cursor metrics and motion durations from `design/tokens.json`, dark theme; the Sora, Inter and DM Mono fonts, glass, trails and particles are not wired in yet), `withAlpha`, `Card`, `Chip`, `Button`, `Row`, `textStyles`.
