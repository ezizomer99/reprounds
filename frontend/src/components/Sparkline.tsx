import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, height = 60, color }: SparklineProps) {
  const { T } = useTheme();
  const barColor = color ?? T.primary;

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const barH = height - 8;

  return (
    <View style={[styles.container, { height }]}>
      {values.map((v, i) => {
        const fillRatio = (v - min) / range;
        const h = Math.max(4, Math.round(fillRatio * barH));
        const isLast = i === values.length - 1;
        return (
          <View key={i} style={[styles.barWrap, { height: barH }]}>
            <View
              style={[
                styles.bar,
                {
                  height: h,
                  backgroundColor: isLast ? T.gold : withAlpha(barColor, 0.75),
                  width: isLast ? 5 : 3,
                  borderRadius: 2,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingHorizontal: 4,
  },
  barWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {},
});
