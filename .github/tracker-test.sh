#!/usr/bin/env bash
# Installs the x86 APK, turns on what Sigil needs, opens sigil://control/selftest
# and waits for the verdict of the gesture engine in the log. Exits with an
# error unless the verdict is PASS. Screenshots, the log and the landmarks
# MediaPipe returned for each photo go to tracker-test/.
set -u
PKG=com.kwy404.sigil
SERVICE="$PKG/com.kwy404.sigil.control.SigilAccessibilityService"
APK=android/app/build/outputs/apk/release/app-release.apk
OUT=tracker-test
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

adb install -r -g "$APK" | tee "$OUT/install.txt"
adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow
adb shell settings put secure enabled_accessibility_services "$SERVICE"
adb shell settings put secure accessibility_enabled 1
adb logcat -c

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 25
shot 01-open

# The first launch shows the tour; leave it for the main screen.
tap_text "Get started"
sleep 3
tap_text "Next"
sleep 3
tap_text "Back"
sleep 2
tap_text "Back"
sleep 2
tap_text "Skip tutorial"
sleep 3
tap_text "Start using Sigil"
sleep 5
shot 02-main

adb shell am start -a android.intent.action.VIEW -d "sigil://control/selftest" "$PKG" > /dev/null
# The photos take about fifteen seconds; the cursor follows them over the diagnostics page.
for i in 01 02 03 04 05 06 07 08 09 10; do
  sleep 2
  shot "03-selftest-$i"
done

verdict=""
for i in $(seq 1 60); do
  verdict=$(adb logcat -d -s SigilSelfTest:I | grep -oE "gestures (PASS|FAIL).*" | tail -1)
  [ -n "$verdict" ] && break
  sleep 2
done
sleep 2
shot 04-result
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/04-result.xml" > /dev/null 2>&1

# The live camera path: CameraX frames from the emulated front camera, sent to MediaPipe, results.
adb shell am start -a android.intent.action.VIEW -d "sigil://settings/diagnostics" "$PKG" > /dev/null
sleep 8
shot 05-camera-path
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/05-camera-path.xml" > /dev/null 2>&1
grep -oE 'text="[^"]*"' "$OUT/05-camera-path.xml" | sed 's/^text=//' | paste -sd ' ' > "$OUT/camera-path.txt" || true

adb logcat -d > "$OUT/logcat.txt"
grep -E "SigilSelfTest|SigilTracker|SigilFixture|AndroidRuntime|ReactNativeJS" "$OUT/logcat.txt" > "$OUT/sigil-log.txt" || true
grep -oE 'SigilFixture: \{.*\}' "$OUT/logcat.txt" | sed 's/^SigilFixture: //' > "$OUT/fixtures.jsonl" || true
adb logcat -d -s SigilSelfTest:I > "$OUT/selftest.txt" || true
echo "$verdict" > "$OUT/verdict.txt"
echo "$verdict"
case "$verdict" in
  "gestures PASS"*) echo "The hand tracker test passed." ;;
  *) echo "The hand tracker test failed." ; exit 1 ;;
esac
