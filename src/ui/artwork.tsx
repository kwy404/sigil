import { memo, useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GLYPHS, type GlyphName } from './glyph';
import { color, continuous } from './theme';
import { Txt } from './type';

function svgId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** A glyph's shapes inside an SVG, for artwork and covers. */
export function GlyphShapes({ name, ink, width }: { name: GlyphName; ink: string; width: number }) {
  return (
    <>
      {GLYPHS[name].map((element, index) => {
        const line = { stroke: ink, strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
        const solid = { fill: ink, stroke: 'none' };
        switch (element.kind) {
          case 'path':
            return <Path key={index} d={element.d} {...(element.fill ? solid : line)} />;
          case 'circle':
            return element.secondary ? (
              <Circle key={index} cx={element.cx} cy={element.cy} r={element.r} fill={ink} opacity={0.28} />
            ) : (
              <Circle key={index} cx={element.cx} cy={element.cy} r={element.r} {...(element.fill ? solid : line)} />
            );
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
    </>
  );
}

export type ArtworkOrnament = 'knob' | 'slider' | null;

export interface ArtworkProps {
  glyph: GlyphName;
  size: number;
  /** Track number shown in the corner, as in a numbered series. */
  index?: number;
  ornament?: ArtworkOrnament;
  radius?: number;
  /** Brighter glow, for the selected or practiced album. */
  lit?: boolean;
  /** Leave the sign out, when an animated one is drawn on top. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Square cover art for a gesture: a dark monochrome tile with a hairline grid,
 * one soft lumen light and the sign in the accent. One vector view per tile,
 * so a grid of them stays light on mid range phones.
 */
function ArtworkBase({ glyph, size, index, ornament = null, radius = 16, lit = false, bare = false, style }: ArtworkProps) {
  const id = svgId(useId());
  const glyphSize = 46;
  const offset = (100 - glyphSize) / 2;
  const scale = glyphSize / 24;
  // Keep the stroke near 2.2 points on screen whatever the tile size.
  const stroke = Math.max(1.1, Math.min(2, (2.3 * 100) / size / scale));
  return (
    <View style={[styles.tile, continuous, { width: size, height: size, borderRadius: radius }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#121B2D" />
            <Stop offset="0.55" stopColor="#0B111E" />
            <Stop offset="1" stopColor="#070B15" />
          </LinearGradient>
          <Pattern id={`p${id}`} width={10} height={10} patternUnits="userSpaceOnUse">
            <Path d="M10 0H0V10" stroke="#BAD6FF" strokeOpacity={0.06} strokeWidth={0.35} fill="none" />
          </Pattern>
          <RadialGradient id={`f${id}`} cx="50%" cy="48%" r="62%">
            <Stop offset="0" stopColor="#0B111E" stopOpacity={0} />
            <Stop offset="1" stopColor="#0B111E" stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id={`g${id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color.accent} stopOpacity={lit ? 0.34 : 0.2} />
            <Stop offset="0.5" stopColor={color.accentDeep} stopOpacity={lit ? 0.12 : 0.06} />
            <Stop offset="1" stopColor={color.accentDeep} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={100} height={100} fill={`url(#b${id})`} />
        <Rect width={100} height={100} fill={`url(#p${id})`} />
        <Rect width={100} height={100} fill={`url(#f${id})`} />
        <Circle cx={50} cy={50} r={40} fill={`url(#g${id})`} />
        {ornament === 'knob' ? (
          <G>
            <Circle cx={50} cy={50} r={33} stroke={color.accent} strokeOpacity={0.22} strokeWidth={0.8} fill="none" />
            <Path
              d="M50 17A33 33 0 0 1 83 50"
              stroke={color.accent}
              strokeOpacity={0.9}
              strokeWidth={1.4}
              strokeLinecap="round"
              fill="none"
            />
            <Path d="M79.6 44.4L83 50l3.6-5.4" stroke={color.accent} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </G>
        ) : null}
        {ornament === 'slider' ? (
          <G>
            <Path d="M84 22V78" stroke={color.accent} strokeOpacity={0.22} strokeWidth={1.4} strokeLinecap="round" />
            <Path d="M84 40V78" stroke={color.accent} strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" />
            <Circle cx={84} cy={40} r={3.2} fill="#EFFFFC" />
          </G>
        ) : null}
        {bare ? null : (
          <G transform={`translate(${offset} ${offset}) scale(${scale})`}>
            <GlyphShapes name={glyph} ink={color.accent} width={stroke} />
          </G>
        )}
      </Svg>
      {index !== undefined ? (
        <Txt variant="monoTag" tone="tertiary" style={styles.index}>
          {String(index).padStart(2, '0')}
        </Txt>
      ) : null}
    </View>
  );
}

export const Artwork = memo(ArtworkBase);

/**
 * A typographic cover for an app profile, the way a playlist cover carries
 * its name: no third party logos, just the name on the dark tile.
 */
function CoverBase({
  name,
  overline,
  size,
  radius = 16,
  featured = false,
  style,
}: {
  name: string;
  overline: string;
  size: number;
  radius?: number;
  /** The General profile, lit in the accent. */
  featured?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const id = svgId(useId());
  const big = size >= 120;
  const small = size < 80;
  const monogram = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return (
    <View style={[styles.tile, continuous, { width: size, height: size, borderRadius: radius }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`b${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={featured ? '#0E2A2D' : '#131C2F'} />
            <Stop offset="1" stopColor="#070B15" />
          </LinearGradient>
          <Pattern id={`p${id}`} width={12.5} height={12.5} patternUnits="userSpaceOnUse">
            <Path d="M12.5 0H0V12.5" stroke="#BAD6FF" strokeOpacity={0.055} strokeWidth={0.35} fill="none" />
          </Pattern>
          <RadialGradient id={`g${id}`} cx="85%" cy="12%" r="70%">
            <Stop offset="0" stopColor={color.accent} stopOpacity={featured ? 0.3 : 0.12} />
            <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={100} height={100} fill={`url(#b${id})`} />
        <Rect width={100} height={100} fill={`url(#p${id})`} />
        <Rect width={100} height={100} fill={`url(#g${id})`} />
        <Path d="M0 99.6H100" stroke={color.accent} strokeOpacity={featured ? 0.6 : 0.2} strokeWidth={0.8} />
      </Svg>
      {small ? (
        <View style={styles.monogramWrap}>
          <Txt variant="title3" style={[styles.monogram, { fontSize: size * 0.4, lineHeight: size * 0.5 }]} numberOfLines={1}>
            {monogram}
          </Txt>
        </View>
      ) : (
        <View style={[styles.coverText, { padding: big ? 14 : 10 }]}>
          <Txt variant="monoTag" tone={featured ? 'accent' : 'tertiary'} numberOfLines={1}>
            {overline}
          </Txt>
          <Txt
            variant={big ? 'title2' : 'headline'}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={big ? styles.coverTitleBig : styles.coverTitle}>
            {name}
          </Txt>
        </View>
      )}
    </View>
  );
}

export const Cover = memo(CoverBase);

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  index: { position: 'absolute', top: 10, left: 11 },
  coverText: { flex: 1, justifyContent: 'space-between' },
  coverTitle: { fontSize: 15, lineHeight: 18 },
  monogramWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  monogram: { letterSpacing: -0.5 },
  coverTitleBig: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
});
