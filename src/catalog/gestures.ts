import type { GestureKey } from '../gesture-engine/gestures';

/**
 * The gesture vocabulary grouped the way people learn it: one "album" per
 * sign, with its directional variants together. Each album has its icon from
 * design/icons, the keys that count when practicing it, and a group for the
 * filter of the Gestures tab.
 */
export const ALBUM_IDS = [
  'point',
  'pinch',
  'double-pinch',
  'pinch-hold',
  'open-palm',
  'fist',
  'volume-knob',
  'brightness-slider',
  'scroll',
  'swipe',
  'three-fingers',
  'circle',
  'flick',
] as const;

export type AlbumId = (typeof ALBUM_IDS)[number];

export type AlbumGroup = 'pointer' | 'navigation' | 'dials' | 'sphere';

export const ALBUM_GROUPS: readonly AlbumGroup[] = ['pointer', 'navigation', 'dials', 'sphere'];

/** Extra drawing on the artwork for the moving pinch gestures. */
export type AlbumOrnament = 'knob' | 'slider' | null;

export interface GestureAlbum {
  id: AlbumId;
  /** Glyph name from design/icons. */
  icon: string;
  group: AlbumGroup;
  /** Gesture keys of this album; any of them completes a practice. */
  keys: readonly GestureKey[];
  ornament: AlbumOrnament;
}

export const GESTURE_ALBUMS: readonly GestureAlbum[] = [
  { id: 'point', icon: 'gesture-point', group: 'pointer', keys: ['point'], ornament: null },
  { id: 'pinch', icon: 'gesture-pinch', group: 'pointer', keys: ['pinch'], ornament: null },
  { id: 'double-pinch', icon: 'gesture-double-pinch', group: 'pointer', keys: ['double_pinch'], ornament: null },
  { id: 'pinch-hold', icon: 'gesture-pinch-hold', group: 'pointer', keys: ['pinch_hold'], ornament: null },
  { id: 'open-palm', icon: 'gesture-open-palm', group: 'sphere', keys: ['open_palm'], ornament: null },
  { id: 'fist', icon: 'gesture-fist', group: 'sphere', keys: ['fist'], ornament: null },
  { id: 'volume-knob', icon: 'gesture-pinch', group: 'dials', keys: ['pinch_circle_cw', 'pinch_circle_ccw'], ornament: 'knob' },
  {
    id: 'brightness-slider',
    icon: 'gesture-pinch',
    group: 'dials',
    keys: ['pinch_drag_up', 'pinch_drag_down'],
    ornament: 'slider',
  },
  { id: 'scroll', icon: 'gesture-swipe-up', group: 'navigation', keys: ['swipe_two_up', 'swipe_two_down'], ornament: null },
  { id: 'swipe', icon: 'gesture-swipe-right', group: 'navigation', keys: ['swipe_two_left', 'swipe_two_right'], ornament: null },
  {
    id: 'three-fingers',
    icon: 'gesture-three-fingers',
    group: 'navigation',
    keys: ['swipe_three_up', 'swipe_three_down', 'swipe_three_left', 'swipe_three_right'],
    ornament: null,
  },
  { id: 'circle', icon: 'gesture-circle-cw', group: 'dials', keys: ['circle_cw', 'circle_ccw'], ornament: null },
  { id: 'flick', icon: 'gesture-flick', group: 'navigation', keys: ['flick_up', 'flick_down', 'flick_left', 'flick_right'], ornament: null },
];

/** The first gestures to learn, in the order the Now tab shows them. */
export const QUICK_ALBUMS: readonly AlbumId[] = ['point', 'pinch', 'open-palm', 'volume-knob', 'fist', 'scroll'];

export function isAlbumId(value: string): value is AlbumId {
  return (ALBUM_IDS as readonly string[]).includes(value);
}

export function albumById(id: string): GestureAlbum | undefined {
  return GESTURE_ALBUMS.find((album) => album.id === id);
}

/** The album a gesture key belongs to. */
export function albumForKey(key: string): GestureAlbum | undefined {
  return GESTURE_ALBUMS.find((album) => (album.keys as readonly string[]).includes(key));
}
