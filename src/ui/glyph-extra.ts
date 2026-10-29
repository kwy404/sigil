import type { GlyphElement } from './glyph-types';

/**
 * Interface glyphs the brand set does not cover (chevrons, transport, levels),
 * drawn on the same 24 point grid with the same 2 point round stroke.
 */
export const UI_GLYPHS = {
  'chevron-right': [{ kind: 'path', d: 'M9.5 5.5L16 12l-6.5 6.5' }],
  'chevron-left': [{ kind: 'path', d: 'M14.5 5.5L8 12l6.5 6.5' }],
  'chevron-down': [{ kind: 'path', d: 'M5.5 9.5L12 16l6.5-6.5' }],
  'chevron-up': [{ kind: 'path', d: 'M5.5 14.5L12 8l6.5 6.5' }],
  play: [{ kind: 'path', d: 'M8 5.6v12.8a1.2 1.2 0 0 0 1.84 1.01l10.08-6.4a1.2 1.2 0 0 0 0-2.02L9.84 4.59A1.2 1.2 0 0 0 8 5.6Z', fill: true }],
  pause: [
    { kind: 'rect', x: 6.2, y: 4.8, width: 4.2, height: 14.4, rx: 1.4, fill: true },
    { kind: 'rect', x: 13.6, y: 4.8, width: 4.2, height: 14.4, rx: 1.4, fill: true },
  ],
  stop: [{ kind: 'rect', x: 5.6, y: 5.6, width: 12.8, height: 12.8, rx: 2.8, fill: true }],
  previous: [
    { kind: 'path', d: 'M18.6 6.4v11.2a1 1 0 0 1-1.56.83l-8.2-5.6a1 1 0 0 1 0-1.66l8.2-5.6a1 1 0 0 1 1.56.83Z', fill: true },
    { kind: 'path', d: 'M5.6 6v12' },
  ],
  next: [
    { kind: 'path', d: 'M5.4 6.4v11.2a1 1 0 0 0 1.56.83l8.2-5.6a1 1 0 0 0 0-1.66l-8.2-5.6A1 1 0 0 0 5.4 6.4Z', fill: true },
    { kind: 'path', d: 'M18.4 6v12' },
  ],
  mic: [
    { kind: 'path', d: 'M12 3.4a3 3 0 0 1 3 3v5.2a3 3 0 0 1-6 0V6.4a3 3 0 0 1 3-3Z' },
    { kind: 'path', d: 'M5.8 11.4a6.2 6.2 0 0 0 12.4 0' },
    { kind: 'path', d: 'M12 17.6v3' },
  ],
  'speaker-low': [
    { kind: 'path', d: 'M3.6 9.6h3L11 5.8v12.4l-4.4-3.8h-3Z' },
    { kind: 'path', d: 'M15 9.4a3.6 3.6 0 0 1 0 5.2' },
  ],
  'speaker-high': [
    { kind: 'path', d: 'M3.6 9.6h3L11 5.8v12.4l-4.4-3.8h-3Z' },
    { kind: 'path', d: 'M15 9.4a3.6 3.6 0 0 1 0 5.2' },
    { kind: 'path', d: 'M17.8 6.6a7.6 7.6 0 0 1 0 10.8' },
  ],
  'sun-low': [
    { kind: 'circle', cx: 12, cy: 12, r: 3.4 },
    { kind: 'path', d: 'M12 5.6v.1M12 18.3v.1M5.6 12h.1M18.3 12h.1M7.5 7.5l.07.07M16.43 16.43l.07.07M7.5 16.5l.07-.07M16.43 7.57l.07-.07' },
  ],
  'sun-high': [
    { kind: 'circle', cx: 12, cy: 12, r: 3.6 },
    { kind: 'path', d: 'M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.35 5.35l1.55 1.55M17.1 17.1l1.55 1.55M5.35 18.65l1.55-1.55M17.1 6.9l1.55-1.55' },
  ],
  check: [{ kind: 'path', d: 'M5 12.6l4.4 4.4L19 7.4' }],
  close: [{ kind: 'path', d: 'M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4' }],
  plus: [{ kind: 'path', d: 'M12 5v14M5 12h14' }],
  minus: [{ kind: 'path', d: 'M5 12h14' }],
  'arrow-up-right': [{ kind: 'path', d: 'M7.4 16.6l9.2-9.2M9.2 7.4h7.4v7.4' }],
  'arrow-up': [{ kind: 'path', d: 'M12 19V5.6M6.4 11.2L12 5.6l5.6 5.6' }],
  globe: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M3 12h18' },
    { kind: 'path', d: 'M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z' },
  ],
  info: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M12 11v5.4' },
    { kind: 'circle', cx: 12, cy: 7.8, r: 0.3 },
  ],
  refresh: [
    { kind: 'path', d: 'M19.6 12a7.6 7.6 0 1 1-2.23-5.37' },
    { kind: 'path', d: 'M19.8 4.4v4.2h-4.2' },
  ],
  flask: [
    { kind: 'path', d: 'M9.2 3.4h5.6' },
    { kind: 'path', d: 'M10.4 3.4v5.4L5.3 17.7a1.9 1.9 0 0 0 1.65 2.85h10.1a1.9 1.9 0 0 0 1.65-2.85L13.6 8.8V3.4' },
    { kind: 'path', d: 'M7.6 14.2h8.8' },
  ],
  document: [
    { kind: 'path', d: 'M13.6 3.4H7.6A1.6 1.6 0 0 0 6 5v14a1.6 1.6 0 0 0 1.6 1.6h8.8A1.6 1.6 0 0 0 18 19V7.8Z' },
    { kind: 'path', d: 'M13.6 3.4v4.4H18' },
    { kind: 'path', d: 'M9 12.6h6M9 16.2h4' },
  ],
  code: [{ kind: 'path', d: 'M8.4 7.6L4 12l4.4 4.4M15.6 7.6L20 12l-4.4 4.4M13.2 5.4l-2.4 13.2' }],
  bell: [
    { kind: 'path', d: 'M6 16.4V11a6 6 0 0 1 12 0v5.4l1.6 1.8H4.4Z' },
    { kind: 'path', d: 'M10 20.6a2.1 2.1 0 0 0 4 0' },
  ],
  keyboard: [
    { kind: 'rect', x: 2.8, y: 6, width: 18.4, height: 12, rx: 2.6 },
    { kind: 'path', d: 'M7 10h.01M10.33 10h.01M13.67 10h.01M17 10h.01M7 13.8h.01M17 13.8h.01M9.8 14h4.4' },
  ],
  clock: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M12 7.4V12l3 2' },
  ],
  layers: [
    { kind: 'rect', x: 3.4, y: 8.4, width: 12.2, height: 12.2, rx: 2.4 },
    { kind: 'path', d: 'M8.4 8.4V5.8a2.4 2.4 0 0 1 2.4-2.4h7.4a2.4 2.4 0 0 1 2.4 2.4v7.4a2.4 2.4 0 0 1-2.4 2.4h-2.6' },
  ],
  ellipsis: [
    { kind: 'circle', cx: 5.8, cy: 12, r: 1.5, fill: true },
    { kind: 'circle', cx: 12, cy: 12, r: 1.5, fill: true },
    { kind: 'circle', cx: 18.2, cy: 12, r: 1.5, fill: true },
  ],
  grid: [
    { kind: 'rect', x: 3.6, y: 3.6, width: 7, height: 7, rx: 1.8 },
    { kind: 'rect', x: 13.4, y: 3.6, width: 7, height: 7, rx: 1.8 },
    { kind: 'rect', x: 3.6, y: 13.4, width: 7, height: 7, rx: 1.8 },
    { kind: 'rect', x: 13.4, y: 13.4, width: 7, height: 7, rx: 1.8 },
  ],
  sliders: [
    { kind: 'path', d: 'M6 4v6.4M6 15.6V20M12 4v2.4M12 11.6V20M18 4v9.4M18 18.6V20' },
    { kind: 'circle', cx: 6, cy: 13, r: 2.4 },
    { kind: 'circle', cx: 12, cy: 9, r: 2.4 },
    { kind: 'circle', cx: 18, cy: 16, r: 2.4 },
  ],
  dot: [{ kind: 'circle', cx: 12, cy: 12, r: 4, fill: true }],
} satisfies Record<string, readonly GlyphElement[]>;
