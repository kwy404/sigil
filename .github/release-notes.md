Preview build of Sigil for Android phones with a 64 bit processor (arm64), which covers nearly every phone of recent years. GitHub Actions built it from this tag, and it is signed with a development key.

**In this build**
- Live hand tracking with the front camera, also over other apps. The cursor follows your index finger, a pinch taps where it points, and each gesture follows the profile of the app in front.
- A floating bubble over other apps that shows whether Sigil is tracking, sees your hand, listens or is paused. Tap it for the Control Sphere; hold it to pause, turn voice on or off, open Sigil or stop. Drag it anywhere and it snaps to the edge.
- A Quick Settings tile, a home screen widget, and Pause and Stop in the notification.
- Voice requests heard by the phone's own speech recognizer: open, close and switch apps, timers, alarms, the flashlight, volume, brightness, media and messages. Sigil cleans the audio, ignores captures that are too short, clipped or noisy, asks you to repeat when it is unsure, and waits for your yes before it sends, posts or closes all apps.
- Typed requests, with the same steps and confirmations.
- A guided tour on the first launch, which you can replay at any time.
- The app in English, Portuguese, Spanish, French, German, Italian, Japanese and Chinese, following the phone language, with a language picker.

**Good to know**
- Android lets an app turn on the camera only from its own screen, so the tile and the widget open Sigil to start.
- The bubble needs "Display over other apps". Voice while other apps are open uses the microphone permission and is on by default; turn it off from the bubble menu.
- Speech stays on the phone. If your phone only has a recognizer that may use the network, Sigil uses it only after you allow it in Sigil's settings, and you can always type instead.
- Hand tracking and voice have been tried on an emulator with a recorded hand, not yet on many phones. Please report what does not work in the issues of this repository.

**Install**
1. Download `sigil-android.apk` below and open it. Android asks you to allow installs from your browser or file manager.
2. On Android 13 and later, an app installed outside a store cannot turn on an accessibility service until you allow it. Open Settings, then Apps, then Sigil. Tap the menu at the top right and choose "Allow restricted settings".
3. Open Sigil and follow the guided tour.

In some countries, Google Play Protect blocks apps that are installed outside a store and ask for accessibility access. Sigil has no account and no server. The source of this build is the tagged commit.
