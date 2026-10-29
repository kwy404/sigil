# SIGIL behavior

How the holographic cursor and the Control Sphere behave, precisely enough to implement and tune. Values that also live in [`tokens.json`](tokens.json) are named by their token. All distances are dp, all speeds dp/s, all times ms unless stated.

## 0. Pipeline

```
front camera (30 fps, 60 when available)
  -> hand landmarks on device (21 points per hand, presence score, handedness)
  -> pose and gesture classifier (on device)
  -> anchor point -> camera to screen mapping -> One Euro filter
  -> cursor state machine -> snap -> render (ring, core, halo, trail, particles)
```

Nothing in this pipeline leaves the phone. Frames are processed in memory and dropped; only landmarks (42 numbers per frame) reach the UI layer.

**Platform reach.** On Android, SIGIL drives other apps through an AccessibilityService (global actions, `dispatchGesture` for taps, swipes and scrolls). On iOS, an app cannot drive other apps: SIGIL controls its own surfaces and hands off to apps through App Intents, Shortcuts and deep links. The cursor and the sphere behave the same on both; only the reach of actions differs.

## 1. From camera to screen

1. **Mirror.** The front camera image is mirrored horizontally (`u' = 1 - u`) so the cursor moves the way the hand moves.
2. **Anchor point.** The point the cursor follows:
   - **Pinch centroid** `(thumbTip + indexTip) / 2` while the thumb is near the index (pinch ratio below 0.6). Both fingertips travel toward it during a pinch, so it barely moves when the pinch closes.
   - **Index tip** while the hand is in the point pose (thumb tucked, ratio above 0.6).
   - Switching between the two crossfades over 150 ms, never jumps.
3. **Interaction box.** A box of 0.50 by 0.42 of the camera frame maps to the whole screen, so nobody has to reach the edges of the frame. Its center is set where the hand first engages. The outer 6 percent of the box is eased (compressed) so screen edges are reachable without touching frame edges.
4. **Recentering.** If the anchor rests against an edge of the box for 1.2 s, the box drifts 30 percent toward the hand over 400 ms (`spring.drift`).
5. **Absolute mapping.** Hand position equals cursor position, no acceleration curve. Predictable beats clever for a pointer you cannot touch.
6. **Latency compensation.** Above 600 dp/s the cursor is drawn 24 ms ahead along the filtered velocity, capped at 18 dp. Below that speed, no prediction.

## 2. Smoothing with the One Euro filter

Each axis is filtered independently with the One Euro filter (Casiez, Roussel and Vogel, 2012), using real frame timestamps, never an assumed rate.

```
alpha(fc, dt) = 1 / (1 + tau / dt),  tau = 1 / (2 * pi * fc)
dx   = (x - xPrevFiltered) / dt                 // raw speed, dp/s
edx  = lowpass(dx, alpha(dCutoff, dt))          // smoothed speed
fc   = minCutoff + beta * |edx|                 // adaptive cutoff, Hz
xHat = lowpass(x, alpha(fc, dt))
```

| State | minCutoff (Hz) | beta (per dp/s) | dCutoff (Hz) | Effect |
|---|---|---|---|---|
| tracking | 1.0 | 0.006 | 1.0 | steady at rest, fast in flight |
| hovering | 0.7 | 0.004 | 1.0 | extra steady near a target |
| pressing | position frozen (rewind, below) | | | the click lands where you aimed |
| dragging | 1.4 | 0.009 | 1.0 | responsive while carrying |

What this means in practice: at 50 dp/s the cutoff is about 1.3 Hz (time constant about 120 ms), which removes the 2 to 3 dp of landmark jitter you get at 30 fps. At 1500 dp/s it rises to about 10 Hz (about 16 ms of lag), so fast moves feel direct. The user facing smoothing setting (steady, balanced, quick) moves `minCutoff` to 0.6, 1.0 or 1.6 and leaves beta alone.

**Pinch rewind.** The filter keeps a ring buffer of the last 12 filtered positions. When a pinch closes at time t, the press is placed at the filtered position from t minus 90 ms, before the fingers started to close and drag the anchor with them.

## 3. Engaging and the cursor states

The cursor does not appear just because a hand is visible. Hands are in view all day: holding a cup, scratching a chin. SIGIL engages when the hand **points** (index extended, held 200 ms) or when the **Control Sphere is open**.

### State machine

| From | To | Condition |
|---|---|---|
| idle | tracking | presence score at least 0.7 for 3 frames and point pose held 200 ms, or the sphere opens |
| tracking | hovering | the filtered anchor enters a target's snap zone (section 5) |
| hovering | tracking | the anchor leaves the exit zone (snap zone plus 12) and the 120 ms stickiness has passed |
| tracking, hovering | pressing | pinch ratio drops below 0.24 for 2 frames |
| pressing | tracking, hovering | pinch ratio rises above 0.34 (hysteresis) |
| pressing | dragging | still pinched and the anchor moved 12 or more from the press point |
| dragging | tracking, hovering | pinch opens: drop |
| any | lost | presence below 0.5 for 120 ms, or the anchor leaves the interaction box |
| lost | previous state | the hand returns within 1500 ms and within 120 of the last position (crossfade 120 ms, no jump) |
| lost | idle | 1500 ms without the hand |
| tracking | idle | 4 s with less than 8 of motion, or the hand drops below the box |

**Pinch ratio** is the distance between the thumb tip and the index tip divided by the hand scale (wrist to middle finger knuckle), computed on the 3D world landmarks so it does not change with distance from the camera. **Pinch progress** `p = clamp((0.42 - ratio) / (0.42 - 0.24), 0, 1)` drives the ring before the click, so the user sees the click coming.

**What a pinch means:**

| Result | Rule |
|---|---|
| tap | pinch opens within 300 ms and the press moved less than 12 |
| double pinch | two taps within 350 ms, less than 24 apart |
| long press, pinch and hold | pinch held 500 ms with less than 12 of motion: context action, haptic medium |
| drag | pinched and moved 12 or more |

### Visuals per state

| State | Ring | Core | Halo | Trail and particles | Haptic on entry |
|---|---|---|---|---|---|
| idle | hidden | hidden | hidden | none | none |
| tracking | radius 14, stroke 1.5, lumen 300 | radius 3, lumen 50 | radius 26 at 0.35 | by speed (section 4) | none |
| hovering | morphs into the target: its shape plus 6 of padding, border lumen 300 at 0.6, `glass.lens` fill | becomes a parallax dot: radius 2.5, offset 25 percent of the anchor's offset from the target center, kept inside | spreads into the target at 0.18 | trail retracts in 120 ms, no particles | selection tick |
| pressing | scale `1 - 0.18 * p`, intensity rises to 1.25 at commit | grows to radius 4 | 0.5 | on commit: burst of 12 and a ring from 14 to 40 in 360 ms | impact light |
| dragging | hidden; the item lifts: scale 1.04, `glass.lens` border, shadow | sits on the item | under the item | head width 7, particles at the mid tier rate | impact medium on pick up, light on drop |
| lost | splits into 4 arcs with 18° gaps, text tertiary color, turns at 20° per second | hidden | 0.1 | trail retracts in 160 ms | none |

Intensity follows `light.intensity`: tracking 1.0, hovering 1.0, pressed 1.25, lost 0.3. Every change of ring geometry runs on `spring.snap`; presses on `spring.press`.

**Lost hand rules.** The cursor freezes where it was, dims to 0.3 over 300 ms and shows the segmented ring. A drag in progress is held for 400 ms, then canceled with the item springing home. **Losing the hand never commits an action.** If the sphere is open and the hand stays away for 2500 ms, a `glass.veil` hint says "Show me your hand."

## 4. Trail and particles respond to speed

Speed `v` is the One Euro smoothed speed `|edx|` of the anchor, in dp/s.

**Trail**

```
show       = v > 120 (trail.speed.showAbove)
trailMs    = lerp(90, 260, smoothstep(150, 1800, v))
point age  = now - sample time;  keep samples with age < trailMs (6 to 28 of them)
width(a)   = lerp(5, 0.5, a / trailMs)
opacity(a) = 0.9 * (1 - a / trailMs) ^ 1.6
```

The samples are joined with a Catmull Rom spline and colored lumen 50 at the head, lumen 300 at 30 percent, lumen 600 at 70 percent, transparent at the tail. When speed falls below 120, on snap, or on lost, the trail retracts into the ring in 160 ms instead of vanishing.

**Particles**

```
spawnPerSecond = tierMax * smoothstep(300, 1800, v)       // 60 high, 30 mid, 15 low
position       = anchor + random point within the ring radius
velocity       = -0.12 * cursorVelocity + randomDirection(within 25° of -motion) * random(40, 140)
life           = random(450, 900);  size = random(1.2, 2.8);  drag = 2.2 per second
opacity        = fade in over 60 ms, fade out over the last 60 percent of life
color          = lumen 200, cooling to lumen 400 as it ages
```

Slow, careful pointing produces no particles at all; a fast sweep leaves a short shower behind the cursor. A press commit adds the burst of 12. Caps per tier: 48, 24, 12; reduced motion turns both trail and particles off.

## 5. Snap to targets

Targets register their screen rectangle, corner radius, label and priority. Snapping is how a pointer you cannot touch becomes as accurate as a finger.

| Rule | Value |
|---|---|
| snap radius beyond the bounds | `clamp(0.35 * min(width, height), 20, 44)` |
| exit radius | snap radius plus 12 (hysteresis) |
| attraction | `k = smoothstep(snapRadius, 0, distanceToRect)`, 0 at the edge of the zone, 1 at the target |
| drawn ring center | `lerp(anchor, targetCenter, 0.35 * k)`: pulled, never yanked |
| inside the target | the ring becomes the target's rounded rect (section 3, hovering) |
| stickiness | once snapped, stay at least 120 ms unless the speed exceeds 900 |
| overlapping candidates | score = distance / (1 + 0.25 * priority); switch only when a new score is at least 20 percent better |
| what a press hits | always the snapped target, never the raw position |
| transitions | `spring.snap` (damping 26, stiffness 420, mass 0.6) |

Targets below 56 in their smaller side must declare a snap area of at least 56 (`size.airTarget`). Dense lists switch to row snapping: the ring morphs into the whole row.

## 6. Gesture vocabulary

Global defaults. Each app profile can remap any of them (see section 8).

| Gesture | Recognized when | Default meaning |
|---|---|---|
| open palm | five fingers extended, palm facing the camera, held still (under 20 dp/s) for 400 ms | summon the Control Sphere |
| point | index extended, others curled, 200 ms | show the cursor and point |
| pinch | thumb and index tips meet (section 3) | tap, select |
| double pinch | two pinches within 350 ms | open, the secondary action |
| pinch and hold | pinch held 500 ms | context menu; move while holding to drag |
| fist | all fingers curled within 300 ms of an open hand | dismiss the sphere, back out |
| two finger swipe up or down | index and middle extended together, travel at least 80 at 500 dp/s or more | scroll a page; held after the swipe, scroll continuously |
| two finger swipe left or right | same pose, horizontal | back or forward; previous or next in media |
| three fingers | index, middle and ring extended, held 300 ms | switch apps (Android), switch gesture profile |
| circle clockwise or counterclockwise | index tip draws an arc of at least 270° with a radius between 30 and 160 | a dial: every 30° of turn is one step of volume, brightness or scrub |
| flick | index tip travels at least 48 within 250 ms at 900 dp/s or more, then stops | dismiss a notification, throw an item, next |

Rejection rules: no gesture fires while the hand is moving toward the screen faster than 600 dp/s (reaching to touch), while two hands overlap, or within 300 ms of the previous gesture unless it is a double pinch. A gesture that was recognized but not acted on gets a quiet hint, never an error sound.

## 7. The Control Sphere

The sphere is the home of SIGIL: a glass orb that appears where you call it and offers what makes sense right now.

### Summon

- **Open palm**, held still for 400 ms (`gesture-open-palm`). During those 400 ms a faint ring grows at the palm's projected position, so the user sees it coming; lowering the hand early cancels.
- **Wake word** "Sigil" from the on device keyword spotter.
- **Touch**, a long press on the floating sphere hint at the screen edge.

**Placement.** At the palm's projected position, clamped so the whole layout fits inside the safe area; at the screen center for the wake word.

**Entrance.**

| Element | Motion |
|---|---|
| core | scale 0.2 to 1 on `spring.bloom`, opacity 0 to 1 in 140 ms |
| light | 24 particles converge into the core in 320 ms |
| quick actions | fan out from the core along their angles on `spring.bloom`, staggered 28 ms, nearest to the hand first |
| context pill | drops in on `spring.glide`, 120 ms delay |
| recent people | rise in on `spring.glide`, 180 ms delay |
| haptic | `impactAsync(Soft)` at the start |

### Layout

| Part | Geometry |
|---|---|
| core | diameter 120 (`size.sphere.core`), `glass.core`, the mark's point of light at its center, its two arcs inside |
| status ring | radius 74, thin lumen arcs: on device model, microphone, camera, battery saver. A segment is bright when active, dim when idle, absent when off |
| status line | `type.hud-sm` under the core: ON DEVICE · 18 MS · MIC ON |
| quick actions | 6 slots, diameter 56, on an orbit of radius 132 at -150°, -90°, -30°, 30°, 90° and 150°; icon plus `type.label-md` label |
| context | a `glass.pane` pill above the orbit: app name in `type.title-md` plus one line of state ("Messages · Ana is typing") |
| recent people | up to 3 orbs of 40 below the orbit, initials only, never photos inside the sphere |

The six actions come from the active app profile, ordered by use, with the most likely one at -30° (upper right for the right hand; mirrored for the left hand setting).

**Choosing an action:** point and pinch (snapping makes each slot a 56 target); or, for experts, pinch the core and flick toward a slot (a marking menu: direction within 30° of the slot, 48 of travel in 250 ms) without looking; or say the label ("Sigil, done"); or touch it.

### States

| State | Look and motion | Exit |
|---|---|---|
| idle | breathing: scale 0.985 to 1.015 and glow 0.85 to 1.0, one breath every 5200 ms on the `breath` easing; 8 motes orbit at 6 to 14° per second; the inner arcs turn once every 24 s | any input |
| listening | the core skin ripples with the microphone level (3 lobes, up to 6 of displacement, envelope attack 60 ms and release 240 ms); the inner arcs open 8° each; actions dim to 0.4 and step out 8 on `spring.glide`; a live caption appears below in `type.body-lg` on `glass.pane` | 700 ms of silence, or a pinch on the core |
| thinking | the inner arcs orbit the point, one turn every 1600 ms, linear; the core cools toward lumen 500; after 1200 ms the caption reads "Working on it."; after 6 s the planned steps appear | plan ready, or fist, or "never mind" |
| acting | the plan becomes an action chain: nodes on a line of light (see the `action-chain` illustration). The sphere compacts to 56 and docks at the nearest edge on `spring.drift` so the app stays visible. Each node lights when its step really completes | chain done, error, or stop |
| confirming | before any step that cannot be undone (send, delete, pay, post, call) the chain pauses on a node that reads "Send to Ana? Pinch to confirm." Pinch, touch or "yes" continue; fist or "no" cancel; 8 s without an answer cancels. **Nothing is ever confirmed by timeout** | answer or timeout |
| done | the last node lights, the point flares once to 1.25, haptic success; the compact sphere shows the check for 1200 ms | fades to the edge hint |
| error | the node turns warning amber with one line ("Ana is not in your contacts.") and two options: try again, or say it differently | choice or dismiss |

In reduced motion every state keeps its color, label and caption, without breathing, ripples or orbits.

### Dismissal

| How | Detail |
|---|---|
| fist | the sphere collapses into its point and fades: `spring.settle`, 220 ms opacity |
| two finger swipe down | while the sphere is open |
| voice | "Sigil, close", "never mind", "cancel" |
| timeout | 8 s with no hand in the box and no voice |
| touch | outside the sphere, or the system back gesture |

While a chain is running, dismissing hides the sphere but not the work: the compact orb stays at the edge with its progress arc. Stopping the work takes "Sigil, stop", or a pinch on the compact orb and "Cancel the rest".

## 8. Per app gesture profiles

A profile maps gestures to actions for one app and switches automatically when that app comes to the front (Android: accessibility window events; iOS: SIGIL's own surfaces and the apps it hands off to). Example defaults:

| App | pinch | circle clockwise | flick | two finger swipe down | open palm |
|---|---|---|---|---|---|
| Music | play or pause | volume up | next track | lower volume | sphere |
| Reader | select | font size | next chapter | scroll | sphere |
| Camera | focus here | zoom | switch lens | stop recording | shutter in 3 s |

Rules: open palm is reserved for the sphere unless the app is fullscreen media or camera, and then a two second palm still summons it. A profile can never map an irreversible action to a single gesture without the confirmation step.

## 9. Tuning and privacy notes

- Thresholds above are starting points. Tune them on device with on device telemetry only (counts and timings, never frames), shown in a developer panel, never uploaded.
- Low light: when the landmark presence score stays under 0.5 with a hand clearly in frame, say "Too dark for me to see your hand." and offer voice.
- Battery saver: camera at 15 fps with the One Euro `minCutoff` raised by 0.3 to hide the extra jitter, particles at the low tier, glass to solid.
- The camera indicator chip is always visible while tracking, and the camera stops whenever SIGIL is in the background, unless the user turned on system wide control on Android, which shows a persistent notification.
