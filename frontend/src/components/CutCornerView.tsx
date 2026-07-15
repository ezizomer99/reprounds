import { ReactNode, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

interface CutCornerViewProps {
  /** Fill color of the shape. */
  fill: string;
  /** Optional 1px outline color. */
  stroke?: string;
  /** Size of the 45° corner cut in px. Top-left and bottom-right are cut. */
  cut?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A container whose background is an octagon-cut rectangle (top-left and
 * bottom-right corners clipped at 45°), echoing the OctaMark logo. Used for
 * hero elements only — primary CTAs, the rest timer, the PR banner. Everything
 * else in the app is a plain sharp rectangle.
 *
 * RN has no clip-path, so the shape is an SVG polygon sized on layout;
 * children render above it. Give padding/margin via `style` as usual.
 */
export function CutCornerView({ fill, stroke, cut = 12, style, children }: CutCornerViewProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const points = size
    ? [
        `${cut},0`,
        `${size.w},0`,
        `${size.w},${size.h - cut}`,
        `${size.w - cut},${size.h}`,
        `0,${size.h}`,
        `0,${cut}`,
      ].join(' ')
    : null;

  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
      }}
    >
      {points && size && (
        <Svg
          width={size.w}
          height={size.h}
          style={{ position: 'absolute', top: 0, left: 0 }}
          pointerEvents="none"
        >
          <Polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? 1 : 0}
          />
        </Svg>
      )}
      {children}
    </View>
  );
}
