import { Canvas, ImageSVG, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';

import { ICONS, type IconName } from './icons';
import { tokens } from './tokens';

/** An icon from design/icons, drawn with Skia in one color. Decorative: screen readers skip it. */
export function Icon({ name, size = 24, color = tokens.color.accent }: { name: IconName; size?: number; color?: string }) {
  const svg = useMemo(() => Skia.SVG.MakeFromString(ICONS[name].replace(/currentColor/g, color)), [name, color]);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      {svg ? (
        <Canvas style={{ width: size, height: size }}>
          <ImageSVG svg={svg} x={0} y={0} width={size} height={size} />
        </Canvas>
      ) : null}
    </View>
  );
}
