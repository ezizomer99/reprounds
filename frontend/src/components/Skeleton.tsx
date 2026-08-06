import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * A pulsing placeholder block used while data loads. Compose several together
 * to mimic the shape of the real content (rows, cards) for a smoother
 * blank→loaded transition.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { T } = useTheme();
  // Lazy init: `useRef(new Animated.Value(0.5))` runs the constructor on every
  // render and throws the result away — a placeholder shouldn't cost an
  // allocation per frame of the thing it's standing in for.
  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current === null) opacityRef.current = new Animated.Value(0.5);
  const opacity = opacityRef.current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: T.surface2, opacity },
        style,
      ]}
      // A screen reader landing on a stack of empty pulsing blocks learns
      // nothing; loading states belong to sighted layout, not the a11y tree.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
