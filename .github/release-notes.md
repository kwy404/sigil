Preview build of Sigil for Android phones with a 64 bit processor (arm64), which covers nearly every phone of recent years. GitHub Actions built it from this tag, and it is signed with a development key.

**In this build**
- The app in English, Portuguese, Spanish, French, German, Italian, Japanese and Chinese, following the phone language, with a language picker.
- The system panel, which explains and requests each access Sigil uses: accessibility, overlay, camera, microphone, media access and brightness.
- The control module behind the gestures and voice: taps and swipes through the accessibility service, the cursor overlay, volume, brightness, media keys and the system panels.

**Still being built**
- Live hand tracking from the camera.
- Speech recognition on the phone.

Until those land, this build is for trying the interface and the setup, not for hands free use yet.

**Install**
1. Download `sigil-android.apk` below and open it. Android asks you to allow installs from your browser or file manager.
2. On Android 13 and later, an app installed outside a store cannot turn on an accessibility service until you allow it. Open Settings, then Apps, then Sigil. Tap the menu at the top right and choose "Allow restricted settings".
3. Open Sigil and follow the system panel.

In some countries, Google Play Protect blocks apps that are installed outside a store and ask for accessibility access. Sigil has no account and no server. The source of this build is the tagged commit.
