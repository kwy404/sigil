# Sigil

Sigil is a personal companion that lives on the phone and lets you drive it without touching the screen. The front camera follows your hand and a holographic cursor follows your index finger. A pinch taps, a two finger swipe scrolls, a circle turns the volume, and an open palm opens the Control Sphere, Sigil's hub. When pointing is not enough you say what you want, for example "send Ana on WhatsApp that I am on my way", and Sigil plans the steps, shows them and asks before anything is sent.

Everything runs on the phone: hand tracking, speech recognition and the language model. There is no account and no server.

## Who it is for

- **People with limited hand mobility.** Tremor, arthritis, a cast, a spinal cord injury, or a phone mounted on a wheelchair. This is the primary audience and the reason Sigil is built and declared as an accessibility tool.
- **People whose hands are busy.** Cooking, repairing, painting, a phone propped on the desk. The same features help them, but they do not drive the design.

## Principles

1. **On device.** Camera frames, audio, screen content and model weights never leave the phone. Nothing is recorded.
2. **The user starts every action.** A gesture triggers exactly one action where the user points. A voice request produces one plan, shown step by step and stoppable at any moment. Sigil never acts on its own.
3. **Ask before it matters.** Sending, posting, calling, paying, deleting and changing settings always stop for an explicit yes. One message to one person per request. No loops, no schedules, no bulk.
4. **Each app speaks its own language.** A flick moves to the next Reel in Instagram, a double pinch likes in TikTok, a two finger swipe skips a track in YouTube. Gesture profiles are plain JSON, one file per app, easy to read and to extend.
5. **Honest about the platform.** Controlling other apps is possible only on Android. On iOS, Sigil works inside its own screens and through Shortcuts and App Intents, and says so.

## The experience

- **Holographic cursor.** A glowing ring that follows the index finger across every app, with a pulse while idle and a press animation on pinch. The hand only needs to move inside a comfortable box in front of the camera; that box maps to the whole screen.
- **Control Sphere.** An open palm opens a radial hub over the current app: Apps, Voice, Cursor, Profiles, Pause and Settings. Point at a segment and pinch.
- **Voice.** A fist held like a microphone starts listening. Short requests in English, Brazilian Portuguese, Spanish, French, German, Italian, Japanese or Simplified Chinese become a plan of visible steps: open the app, find the contact, type, then ask "Send this to Ana?" before tapping Send.
- **Per app profiles.** Sigil knows which app is in front and loads its profile. Apps without one use the general profile.

## Milestones

| Milestone | Scope |
| --- | --- |
| M1, skeleton | Gesture engine with tests, app profiles, planner, confirmation policy, plan executor, Android control module skeleton, first screen |
| M2, live hands | MediaPipe Hand Landmarker in a frame processor while Sigil is open, and in the camera service while other apps are open; per user calibration of the control box |
| M3, Android end to end | Gestures acting in WhatsApp, YouTube, TikTok and Chrome on real devices; plans executed with confirmation; onboarding with the accessibility disclosure |
| M4, on device language | whisper.rn or the system recognizer; a 1.5B tool calling model through llama.rn; model download manager with tiers by device RAM |
| M5, stores | iOS App Intents and Shortcuts; Play Console accessibility declaration and review |

Where things stand: M1 is done. For M2 and M3, the camera service tracks the hand in Sigil and over other apps, gestures act through the accessibility service, plans run with confirmation, and the guided tour carries the accessibility disclosure; per user calibration and checks on real phones remain. From M4, speech uses the phone's own recognizer, and the local language model is in progress.

## Non goals

- Automating apps in bulk: mass messaging, auto liking, auto following, scheduled posting.
- Cloud processing, recording, or analytics on what is on screen.
- Controlling other apps on iOS, which the platform does not allow.
