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

dump_ui() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/last-ui.xml" > /dev/null 2>&1
}

# The emulator's launcher sometimes hangs at boot, and its "isn't responding"
# dialog hides the app from the dump. Answer Wait and look again.
dismiss_not_responding() {
  local tries=0 wait
  while [ "$tries" -lt 3 ]; do
    wait=$(grep -oE 'resource-id="android:id/aerr_wait"[^>]*bounds="[^"]*"' "$OUT/last-ui.xml" | head -1 | grep -oE 'bounds="[^"]*"')
    [ -z "$wait" ] && return 0
    read -r x1 y1 x2 y2 <<< "$(echo "$wait" | tr -c '0-9' ' ')"
    echo "answer Wait on a not responding dialog" | tee -a "$OUT/taps.txt"
    adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
    sleep 2
    dump_ui
    tries=$((tries + 1))
  done
}

# Taps the first view whose text or content description is exactly $1.
tap_text() {
  dump_ui
  dismiss_not_responding
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
dump_ui
dismiss_not_responding
shot 01-open
tree 01-open

# The first launch shows the guided tour. Keep a few of its pages, then skip it.
tap_text "Get started"
sleep 3
shot 02-tour-about
tap_text "Next"
sleep 3
shot 03-tour-permission
tree 03-tour-permission
tap_text "Back"
sleep 2
tap_text "Back"
sleep 2
tap_text "Skip tutorial"
sleep 3
shot 04-tour-done
tap_text "Start using Sigil"
sleep 5
shot 05-now
tree 05-now

adb shell input keyevent KEYCODE_HOME
sleep 4
shot 06-home

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 6
shot 07-reopen

# Start: camera service, cursor and bubble.
tap_text "Start"
sleep 8
shot 08-started
tree 08-started

# The emulator has no real hand: the demo hand moves the cursor (and never taps).
adb shell am start -a android.intent.action.VIEW -d "sigil://control/demo" "$PKG" > /dev/null
sleep 6
shot 09-demo
adb shell input keyevent KEYCODE_HOME
sleep 3
shot 10-demo-over-home
sleep 2
shot 11-demo-over-home-later
tree 11-demo-over-home

# The bubble and the tile open the Live sheet through the session.
adb shell am start -a android.intent.action.VIEW -d "sigil://control/sphere" "$PKG" > /dev/null
sleep 5
shot 12-live
tree 12-live

# Every tab and a detail page of each, through deep links.
link() {
  adb shell am start -a android.intent.action.VIEW -d "$2" "$PKG" > /dev/null
  sleep 4
  shot "$1"
}
adb shell input keyevent KEYCODE_BACK
sleep 2
link 13-gestures "sigil://gestures"
link 14-gesture-detail "sigil://gestures/volume-knob"
link 15-apps "sigil://apps"
link 16-app-detail "sigil://apps/youtube"
link 17-voice "sigil://voice"
link 18-settings "sigil://settings"
link 19-permissions "sigil://settings/permissions"
link 20-command "sigil://command?text=open%20YouTube"
tree 20-command

adb shell dumpsys activity services "$PKG" > "$OUT/services.txt" 2>&1
adb shell settings get secure enabled_accessibility_services > "$OUT/accessibility.txt" 2>&1
adb logcat -d > "$OUT/logcat.txt"
grep -E "ReactNativeJS|AndroidRuntime|FATAL|SigilControl|Sigil" "$OUT/logcat.txt" > "$OUT/sigil-log.txt" || true
echo "smoke done"
