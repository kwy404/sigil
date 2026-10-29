# SIGIL design system

visionOS meets a calm heads up display: a deep dark base, soft bioluminescence, volumetric light, glass and refraction. Serious and premium. No mascots, no cute shapes, no emoji.

The source of truth for every value below is [`tokens.json`](tokens.json) (Design Tokens Community Group format: `$value`, `$type`, `$description`). Dimensions are density independent pixels (dp on Android, pt on iOS). Springs map one to one to `withSpring` in react-native-reanimated.

## Principles

1. **Light is information.** Glow means "alive, active, or under your hand". Nothing glows for decoration. If everything glows, nothing is selected.
2. **Glass carries, light points.** Glass panes hold content. Light marks the one thing that matters right now: the cursor, the focused target, the sphere core.
3. **One accent family.** All light is lumen, an aqua bioluminescence that runs from white hot (50) to deep sea (950). States use their own hues, always with an icon and a label.
4. **Calm by default.** The resting interface is dark and still. Motion appears in response to the hand or the voice and settles fast.
5. **Physics, not timelines.** Things that follow the hand use springs. Fixed durations are for fades and loops.
6. **Accessible first.** Every gesture has a touch and a voice path. Every glow has a non glow fallback. Every animation has a reduced motion form.

## 1. Color

### Base (dark first)

| Token | Value | Use |
|---|---|---|
| `color.base.void` | `#020409` | deepest black, OLED off pixels, icon corners |
| `color.base.abyss` | `#04070E` | camera dim layer, full bleed backdrops |
| `color.base.base` | `#070B15` | default app background, splash background |
| `color.base.surface` | `#0B1120` | solid surface, fallback for `glass.veil` |
| `color.base.raised` | `#10182B` | raised surface, fallback for `glass.pane` |
| `color.base.overlay` | `#172238` | highest surface, fallback for `glass.lens` |
| `color.line.subtle / default / strong` | white blue at 8, 14, 24 percent | hairlines, pane borders, focused borders without glow |

### Lumen, the one accent family

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#EFFFFC` | `#CCFFF6` | `#98FBEA` | **`#5EF2DF`** | `#2FD9C8` | `#17B8AA` | `#0E968C` | `#0B746F` | `#0A5353` | `#083A3C` | `#042220` |

- **300 is the signature.** Focus rings, the cursor ring, active labels, the accent text color on dark.
- **50 is white hot.** Only the core of a light: the cursor core, the point of the mark, the brightest end of a trail.
- **400 and 500 are glow.** Halos and blooms, always blurred, never as flat fills of large areas.
- **600 and 700 are ink on light.** The accent on the light theme (`700` passes 4.5:1 on `#F4F7FB`).
- **800 to 950 are depth.** Fog and ambient tint at low opacity.
- A light source is always layered: core (50) inside glow (300) inside bloom (500) inside ambient (400 at 12 percent). See section 5.

### Text and states

| Role | Dark theme | Light theme |
|---|---|---|
| text primary | `#E8EEF6` | `#0A0F1C` |
| text secondary | `#A7B3C6` | `#3E4A5E` |
| text tertiary | `#7F8BA1` | `#5B6880` |
| text disabled | `#4A5568` | `#9AA4B5` |
| accent | `#5EF2DF` (lumen 300) | `#0B746F` (lumen 700) |
| on accent | `#032824` on lumen 300 | `#FFFFFF` on lumen 700 |
| success | `#8BE39B` | `#1F7A3E` |
| warning | `#FFC46B` | `#8A5300` |
| danger | `#FF7A86` | `#C02A3B` |
| info | `#8AB6FF` | `#2C5DBB` |
| neutral, offline | `#8C97AB` | `#5B6880` |

Success is a green kept about 40° of hue away from lumen, so "done" never reads as "focused". States never rely on color alone: each one ships with its icon (`confirm-action`, `offline`, `hand-lost` and so on) and a short label.

### Measured contrast (WCAG 2.x)

| Pair | Ratio | Needs |
|---|---|---|
| dark text primary on base | 16.85 | 4.5 |
| dark text secondary on base | 9.28 | 4.5 |
| dark text tertiary on base | 5.72 | 4.5 |
| dark text tertiary on raised | 5.15 | 4.5 |
| lumen 300 on base | 14.28 | 4.5 |
| on accent `#032824` on lumen 300 | 11.44 | 4.5 |
| dark danger on base | 7.85 | 4.5 |
| dark neutral on base | 6.68 | 4.5 |
| light text tertiary on `#F4F7FB` | 5.23 | 4.5 |
| light accent lumen 700 on `#F4F7FB` | 5.22 | 4.5 |
| white on lumen 700 | 5.61 | 4.5 |
| light success, the lowest light state | 5.00 | 4.5 |
| text primary on glass over a white camera frame, tint 0.80 | 8.37 | 4.5 |
| text secondary on glass over a white camera frame, tint 0.80 | 4.61 | 4.5 |
| text primary on glass over a white camera frame, tint 0.52 | 3.16 | fails, hence the camera floor |

## 2. Typography

A free pairing from Google Fonts (all OFL):

| Role | Family | Why | Expo package and font keys |
|---|---|---|---|
| Display | **Sora** | geometric and open, futuristic without sci fi clichés; its round forms match the 2 px round icon stroke | `@expo-google-fonts/sora`: `Sora_300Light`, `Sora_400Regular`, `Sora_600SemiBold` |
| Text | **Inter** | the most legible small UI face on Android and iOS, tabular figures, huge language coverage | `@expo-google-fonts/inter`: `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold` |
| HUD (optional utility) | **DM Mono** | calm monospace numerals for telemetry chips ("18 MS", "0.98") | `@expo-google-fonts/dm-mono`: `DMMono_400Regular`, `DMMono_500Medium` |

### Scale

| Token | Family, weight | Size / line | Tracking | Use |
|---|---|---|---|---|
| `type.display-xl` | Sora 300 | 40 / 46 | -0.6 | onboarding headlines, hero numbers |
| `type.display-lg` | Sora 300 | 32 / 38 | -0.4 | large screen titles |
| `type.title-lg` | Sora 400 | 24 / 30 | -0.2 | screen titles |
| `type.title-md` | Sora 400 | 20 / 26 | -0.1 | section titles, sphere context line |
| `type.title-sm` | Sora 600 | 17 / 22 | 0 | card titles |
| `type.body-lg` | Inter 400 | 17 / 24 | 0 | live captions, primary reading |
| `type.body-md` | Inter 400 | 15 / 22 | 0 | default body |
| `type.body-sm` | Inter 400 | 13 / 18 | 0.1 | secondary text |
| `type.label-md` | Inter 500 | 13 / 16 | 0.2 | buttons, chips, quick action labels |
| `type.label-sm` | Inter 600 | 11 / 14 | 0.6 | uppercase overlines |
| `type.caption` | Inter 400 | 12 / 16 | 0.2 | timestamps |
| `type.hud-md` | DM Mono 400 | 13 / 16 | 0.4 | telemetry values |
| `type.hud-sm` | DM Mono 500 | 11 / 14 | 1.1 | uppercase HUD tags: ON DEVICE, LISTENING |

Rules: Sora is never used below 17 px. Uppercase is reserved for HUD tags and overlines, always tracked. Numbers that update live use tabular figures (`fontVariant: ['tabular-nums']`) or DM Mono. Letter spacing values are absolute points, which is what React Native expects. Text follows the OS font scale up to 200 percent; HUD tags cap at 140 percent and reflow instead of truncating. The wordmark is an SVG, never typed.

## 3. Spacing, radius and sizes

**Spacing** is a 4 point grid: `space.0.5` 2, `space.1` 4, `space.1.5` 6, `space.2` 8, `space.3` 12, `space.4` 16, `space.5` 20, `space.6` 24, `space.8` 32, `space.10` 40, `space.12` 48, `space.16` 64, `space.20` 80, `space.24` 96. Screen gutters are 20 (`space.5`). Pane padding is 20 to 24.

**Radius:** `xs` 6 (tags), `sm` 10 (inputs), `md` 14 (buttons, cells), `lg` 20 (cards, panes), `xl` 28 (sheets), `2xl` 36 (full screen glass), `full` (pills, orbs, the sphere). On iOS use continuous corners (`borderCurve: 'continuous'`). Nested radius: inner radius = outer radius minus padding, never below 6.

**Sizes:** touch target 48. **Air target 56, comfortable 64**: anything the holographic cursor can select must be at least 56 dp in its smaller side, or declare a snap area that big (see BEHAVIOR.md). Icons 16, 20, 24, 32. Control Sphere: core 120, quick action orbit radius 132, slot 56, compact sphere 56.

## 4. Glass

Four levels. Higher levels blur more, tint more and carry more light at the edge. Never stack more than two levels; glass on glass on glass turns into mud.

| Level | Blur | Saturation | Tint | Border | Inner light (top, bottom) | Shadow | Use |
|---|---|---|---|---|---|---|---|
| `glass.veil` | 16 | 1.4 | `#0A1222` at 0.38 | 0.5 px white at 0.08 | 0.10, 0 | none | hints and captions over app content |
| `glass.pane` | 28 | 1.6 | `#0C1528` at 0.52 | 1 px white at 0.12 | 0.14, 0.03 | 0 18 40 black at 0.45 | cards, sheets, gesture tutor |
| `glass.lens` | 36 | 1.8 | `#0F1A30` at 0.58 | 1 px lumen 300 at 0.32 | 0.18, 0.04 | glow 24 lumen 400 at 0.18 | focused or hovered element, sphere satellites |
| `glass.core` | 44 | 2.0 | `#0D2236` at 0.66 | 1 px white at 0.26 | 0.22, 0.06 | glow 64 lumen 400 at 0.22 | the Control Sphere body |

Anatomy of a pane, back to front: backdrop blur and saturation, tint, a diagonal sheen (white 11 percent at the top left to 1.5 percent), a vertical border gradient (white 30 percent at the top to lumen 12 percent at the bottom), a 1 px inner highlight along the top edge. Orbs add a specular ellipse at the top left and a refracted lumen arc at the bottom, which is what makes them read as volume.

**Camera floor.** When the backdrop is the live camera or unknown content and the glass carries text, its tint opacity must be at least **0.80** (`glass.*.cameraFloor`). At 0.52, primary text over a white wall measures 3.16:1 and fails; at 0.80 it measures 8.37:1 and secondary text 4.61:1. `glass.veil` never carries text over the camera.

**Fallbacks.** With Reduce Transparency on (iOS `AccessibilityInfo.isReduceTransparencyEnabled()`), on Android below API 31, or in battery saver, every level becomes its solid fallback (`surface`, `raised`, `overlay`) with the same border.

**Implementation in Expo:**

- iOS 26 and later: `GlassView` from `expo-glass-effect` (already a dependency) for panes and the sphere; `clear` style over the camera, `regular` elsewhere, with the level tint as `tintColor`. Check the props against the SDK 58 docs before coding.
- Earlier iOS and Android 12 and later: `BlurView` from `expo-blur` (not installed yet; add with `npx expo install expo-blur`). Approximate intensity mapping: veil 40, pane 60, lens 75, core 90. Tune on a device.
- Android below 12, battery saver, Reduce Transparency: solid fallback colors, no blur.

## 5. Light and particles

### Layers of a light

| Layer | Color | Opacity | Blur |
|---|---|---|---|
| core | lumen 50 | 1 | 0 |
| glow | lumen 300 | 0.9 | 4 |
| bloom | lumen 500 | 0.55 | 16 |
| ambient | lumen 400 | 0.12 | radius 120 |

Glow radii: `light.glow.xs` 4, `sm` 8, `md` 16, `lg` 32, `xl` 64, `halo` 120. Intensity multiplies the opacity of every layer: rest 0.7, active 1.0, pressed 1.25 (clamped), lost 0.3.

### Cursor

Ring radius 14, ring stroke 1.5 (lumen 300), core radius 3 (lumen 50), halo radius 26 at 0.35 (lumen 400). The full state behavior lives in [BEHAVIOR.md](BEHAVIOR.md).

### Trail

| Token | Value |
|---|---|
| `trail.historyMs` | 90 at low speed, 180 base, 260 at full speed |
| `trail.points` | 6 to 28 samples, drawn as a Catmull Rom spline |
| `trail.width` | 5 at the head to 0.5 at the tail |
| `trail.opacity` | 0.9 at the head to 0 at the tail, curve power 1.6 |
| `trail.speed.showAbove` | 120 dp/s; below that there is no trail |
| `trail.speed.full` | 1800 dp/s, the trail reaches its maximum length |
| `trail.retractMs` | 160, when the hand stops, snaps or is lost |

Color ramp along the trail: lumen 50 at the head, lumen 300 at 30 percent, lumen 600 at 70 percent, transparent at the tail.

### Particles

| Token | Value |
|---|---|
| max alive by tier | high 48, mid 24, low 12, reduced motion 0 |
| spawn per second at full speed | high 60, mid 30, low 15 |
| life | 450 to 900 ms |
| size | 1.2 to 2.8 |
| speed | 40 to 140 dp/s, drag 2.2 per second |
| inherit velocity | -0.12 of the cursor velocity (they fall behind) |
| spread | 25° around the opposite of the motion |
| spawn starts / saturates | 300 / 1800 dp/s |
| press burst | 12 particles, 80 to 160 dp/s, 420 ms, plus a ring from radius 14 to 40 in 360 ms |
| sphere | 24 converge on summon, 8 idle motes orbiting at 6 to 14° per second |

**Device tiers** come from `expo-device`: high when `deviceYearClass` is 2022 or later and `totalMemory` is at least 6 GB, mid from 2019 and 4 GB, low otherwise. Battery saver forces low. If frame time stays above 20 ms for 30 frames, drop one tier; climb back after 10 s at 60 fps.

**Budget:** cursor, trail and particles together stay under 2 ms per frame on a mid tier phone. Draw them in one canvas on the UI thread (React Native Skia driven by Reanimated shared values is the recommended renderer; with Reanimated alone keep particles at 12 or fewer).

## 6. Motion

### Durations and easing

| Token | ms | Use |
|---|---|---|
| `instant` | 90 | hover tint, press highlight |
| `quick` | 140 | small fades, chip changes |
| `base` | 220 | panel fades, label changes |
| `gentle` | 320 | screen level fades |
| `slow` | 480 | onboarding, large reveals |
| `breath` | 5200 | one idle breath of the sphere |
| `ambient` | 12000 | slow drifts of fog and motes |

| Easing | Bezier | Use |
|---|---|---|
| `standard` | 0.2, 0, 0, 1 | most transitions |
| `decelerate` | 0.05, 0.7, 0.1, 1 | entrances |
| `accelerate` | 0.3, 0, 0.8, 0.15 | exits |
| `breath` | 0.45, 0, 0.55, 1 | loops, sine like |

### Springs

| Token | damping | stiffness | mass | damping ratio | overshoot | settles in | Use |
|---|---|---|---|---|---|---|---|
| `spring.snap` | 26 | 420 | 0.6 | 0.82 | 1.1 percent | about 185 ms | cursor snapping onto a target |
| `spring.press` | 26 | 600 | 0.5 | 0.75 | 2.8 percent | about 154 ms | press and release of targets and the ring |
| `spring.glide` | 22 | 180 | 1 | 0.82 | 1.1 percent | about 364 ms | panels, sheets, chain nodes |
| `spring.bloom` | 17 | 140 | 1 | 0.72 | 3.9 percent | about 471 ms | sphere summon, quick actions fanning out |
| `spring.settle` | 34 | 260 | 1 | 1.05 | none | about 344 ms | dismissals and collapses |
| `spring.drift` | 20 | 90 | 1 | 1.05 | none | about 585 ms | slow repositioning, the sphere docking |

```ts
import { withSpring, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';
import tokens from '../../design/tokens.json';

const spring = (name: keyof typeof tokens.motion.spring) => ({
  ...tokens.motion.spring[name].$value,
  reduceMotion: ReduceMotion.System,
});

scale.value = withSpring(1, spring('bloom'));
opacity.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) });
```

**Choreography.** Enter with `decelerate` or a spring, exit with `accelerate` or `settle`. Stagger siblings by 28 ms, nearest to the hand first. At most three independent springs on screen at once besides the cursor. Interrupt, never queue: a new target always retargets the running spring from its current value and velocity.

### Reduced motion

When the OS asks for reduced motion (`useReducedMotion()` in Reanimated): springs become 120 ms `standard` timings with opacity only (no scale, no overshoot), and trails, particles, breathing and parallax are off. The cursor keeps its smoothing, because smoothing is function, not decoration.

## 7. Icons

Forty original icons in [`icons/`](icons), drawn to the glyphfox rules of the owner's own library: 24 grid, `stroke-width="2"`, round caps and joins, 2 px padding, no transforms, one optional duotone layer (`class="gf-secondary"`, opacity 0.3, used here for light: the glow of a pinch, the halo of the cursor). Each icon has a sidecar JSON with categories and tags, and the folder passes the glyphfox linter:

```sh
node ../glyphfox/tools/icons/lint.mjs --dir design/icons
```

| Group | Icons |
|---|---|
| Gestures | `gesture-open-palm`, `gesture-point`, `gesture-pinch`, `gesture-double-pinch`, `gesture-pinch-hold`, `gesture-fist`, `gesture-swipe-up`, `gesture-swipe-down`, `gesture-swipe-left`, `gesture-swipe-right`, `gesture-three-fingers`, `gesture-circle-cw`, `gesture-circle-ccw`, `gesture-flick` |
| System | `sphere`, `cursor`, `voice`, `listening`, `thinking`, `offline`, `on-device-model`, `privacy-shield`, `accessibility`, `app-profile`, `action-chain`, `haptics`, `camera-tracking`, `settings`, `battery-saver` |
| Support | `wake-word`, `hand-lost`, `dwell-select`, `snap-target`, `light-trail`, `recent-people`, `quick-actions`, `confirm-action`, `calibrate`, `handedness`, `camera-off` |

Hands are drawn palm toward the viewer, as the front camera sees them, with one construction: 3 px wide finger capsules, curled fingers as low knuckle arcs, an open wrist. The pinch is a front view with the other fingers curled, so it can never be mistaken for the OK sign, which is offensive in Brazil. Use icons at 20 or 24 in UI, 16 only in dense HUD chips, and keep the stroke at 2 at every size (scale the stroke down when you scale an icon up in illustrations).

## 8. Accessibility

| Area | Rule |
|---|---|
| Contrast | body text 4.5:1, large text (24 regular, 19 bold) 3:1, glyphs and focus rings 3:1, always measured against the worst backdrop. Glass over the camera obeys the 0.80 camera floor. |
| Color | no state is color only: icon plus label every time. |
| Reduced motion | see section 6. The sphere does not breathe, nothing orbits, the mark is static. |
| Reduced transparency | solid fallbacks for every glass level. |
| Photosensitivity | no light flashes more than 3 times per second; the press burst peaks at intensity 1.25 for one frame at most. |
| Haptics | `expo-haptics` (add with `npx expo install expo-haptics`). Hover onto a target: `selectionAsync()`, at most one tick per 80 ms. Press: `impactAsync(Light)`. Drag pick up: `impactAsync(Medium)`. Drop: `impactAsync(Light)`. Sphere summon: `impactAsync(Soft)`. Confirmation needed: `notificationAsync(Warning)`. Chain done: `notificationAsync(Success)`. Error: `notificationAsync(Error)`. Hand lost: nothing. Respect the system setting and an in app switch. |
| Alternatives | every gesture has a touch path and a voice path. Dwell select (hover 800 ms, shown with the `dwell-select` ring) replaces the pinch for people who cannot pinch. |
| Motor | adjustable pinch threshold, adjustable smoothing (three presets that move the One Euro `minCutoff`), left or right hand, seated mode with a lower interaction box, tremor mode with a 120 ms longer dwell and wider snap. |
| Screen readers | when TalkBack or VoiceOver is on, the cursor announces the label of the target it snaps to; the sphere is a modal with a logical focus order: context, actions clockwise from the top, people, close. |
| Camera honesty | while the camera runs, a tracking chip is always visible (the `camera-tracking` icon plus "TRACKING"). One tap or the word "camera off" stops it. |
| Text size | follows the OS scale up to 200 percent; layouts reflow, nothing truncates mid word. |

## 9. Using the tokens in the app

`tokens.json` sits next to this file. A typical theme object for React Native reads the dark theme by default and switches to `theme.light` with `useColorScheme()`; glass levels resolve to `GlassView` or `BlurView` props, or to their `fallback` color. Keep the JSON as the only source: generate TypeScript types from it rather than copying values into components.
