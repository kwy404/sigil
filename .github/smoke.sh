#!/usr/bin/env bash
# Installs the APK on the running emulator, turns on what Sigil needs, opens it
# and records what happens. Every step is allowed to fail so the artifact is
# always complete enough to look at.
set -u
PKG=com.kwy404.sigil
SERVICE="$PKG/com.kwy404.sigil.control.SigilAccessibilityService"
APK=android/app/build/outputs/apk/release/app-release.apk
OUT=smoke
mkdir -p "$OUT"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }

# Taps the first view whose text or content description is exactly $1.
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/last-ui.xml" > /dev/null 2>&1
  local bounds
  bounds=$(grep -oE "(text|content-desc)=\"$1\"[^>]*bounds=\"[^\"]*\"" "$OUT/last-ui.xml" | head -1 | grep -oE 'bounds="[^"]*"')
  if [ -z "$bounds" ]; then
    echo "no view with the text $1" | tee -a "$OUT/taps.txt"
    return 0
  fi
  read -r x1 y1 x2 y2 <<< "$(echo "$bounds" | tr -c '0-9' ' ')"
  echo "tap $1 at $(((x1 + x2) / 2)),$(((y1 + y2) / 2))" | tee -a "$OUT/taps.txt"
  adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}
tree() { adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null 2>&1; }

adb install -r -g "$APK" | tee "$OUT/install.txt"
adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow
adb shell settings put secure enabled_accessibility_services "$SERVICE"
adb shell settings put secure accessibility_enabled 1
adb logcat -c

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 20
shot 01-open
tree 01-open

for i in 2 3 4 5 6; do
  adb shell input swipe 540 1700 540 600 400
  sleep 2
  shot "0$i-scroll"
done
tree 06-scroll

adb shell input keyevent KEYCODE_HOME
sleep 4
shot 07-home
tree 07-home

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 6
shot 08-reopen

# The first launch shows the guided tour; skip it to reach the main screen.
tap_text "Skip the tour"
sleep 4
shot 09-main
tree 09-main

# Start: camera service, cursor and bubble.
tap_text "Start"
sleep 8
shot 10-started
tree 10-started

# The emulator has no real hand: the demo hand moves the cursor (and never taps).
adb shell am start -a android.intent.action.VIEW -d "sigil://control/demo" "$PKG" > /dev/null
sleep 6
shot 11-demo
adb shell input keyevent KEYCODE_HOME
sleep 3
shot 12-demo-over-home
sleep 2
shot 13-demo-over-home-later
tree 13-demo-over-home

adb shell am start -a android.intent.action.VIEW -d "sigil://control/sphere" "$PKG" > /dev/null
sleep 5
shot 14-sphere
tree 14-sphere

adb shell dumpsys activity services "$PKG" > "$OUT/services.txt" 2>&1
adb shell settings get secure enabled_accessibility_services > "$OUT/accessibility.txt" 2>&1
adb logcat -d > "$OUT/logcat.txt"
grep -E "ReactNativeJS|AndroidRuntime|FATAL|SigilControl|Sigil" "$OUT/logcat.txt" > "$OUT/sigil-log.txt" || true
echo "smoke done"
