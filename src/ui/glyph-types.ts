/**
 * One drawing instruction of a glyph on the 24 point icon grid. Strokes are
 * 2 units wide with round caps and joins, as in design/icons. Secondary
 * shapes are the duotone light layer (fill at 30 percent); fill draws a solid
 * shape (play, pause and the other transport glyphs).
 */
export type GlyphElement =
  | { kind: 'path'; d: string; fill?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; secondary?: boolean; fill?: boolean }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number; fill?: boolean };
