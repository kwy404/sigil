import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BRAND_GLYPHS } from './glyph-data';
import { UI_GLYPHS } from './glyph-extra';
import type { GlyphElement } from './glyph-types';
import { color as palette } from './theme';

export const GLYPHS: Record<GlyphName, readonly GlyphElement[]> = { ...BRAND_GLYPHS, ...UI_GLYPHS };

export type GlyphName = keyof typeof BRAND_GLYPHS | keyof typeof UI_GLYPHS;

export function isGlyphName(value: string): value is GlyphName {
  return value in GLYPHS;
}

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  /** Stroke in screen points. By default 2 grid units, which is 2 points at 24. */
  stroke?: number;
  /** Opacity of the duotone light layer. */
  secondaryOpacity?: number;
  style?: StyleProp<ViewStyle>;
}

function GlyphBase({ name, size = 24, color = palette.text, stroke, secondaryOpacity = 0.3, style }: GlyphProps) {
  const width = stroke === undefined ? 2 : (stroke * 24) / size;
  const line = { stroke: color, strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const solid = { fill: color, stroke: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} pointerEvents="none">
      {GLYPHS[name].map((element, index) => {
        switch (element.kind) {
          case 'path':
            return <Path key={index} d={element.d} {...(element.fill ? solid : line)} />;
          case 'circle':
            if (element.secondary) {
              return <Circle key={index} cx={element.cx} cy={element.cy} r={element.r} fill={color} opacity={secondaryOpacity} />;
            }
            return <Circle key={index} cx={element.cx} cy={element.cy} r={element.r} {...(element.fill ? solid : line)} />;
          case 'rect':
            return (
              <Rect
                key={index}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rx={element.rx}
                {...(element.fill ? solid : line)}
              />
            );
        }
      })}
    </Svg>
  );
}

/** One glyph of the Sigil icon set, drawn as a vector in any color. */
export const Glyph = memo(GlyphBase);

/** The glyph as SVG path strings, for Skia (draw on animations). Circles and rects become paths. */
export function glyphPaths(name: GlyphName): { d: string; secondary: boolean; fill: boolean }[] {
  return GLYPHS[name].map((element) => {
    switch (element.kind) {
      case 'path':
        return { d: element.d, secondary: false, fill: element.fill === true };
      case 'circle': {
        const { cx, cy, r } = element;
        return {
          d: `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
          secondary: element.secondary === true,
          fill: element.fill === true,
        };
      }
      case 'rect': {
        const { x, y, width: w, height: h } = element;
        const r = Math.min(element.rx, w / 2, h / 2);
        return {
          d: `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`,
          secondary: false,
          fill: element.fill === true,
        };
      }
    }
  });
}
