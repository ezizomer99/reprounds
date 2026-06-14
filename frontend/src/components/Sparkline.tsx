import { StyleSheet, View } from 'react-native';
import { T } from '../theme/colors';
import { withAlpha } from '../lib/color';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

// Bar-chart sparkline — no native SVG needed.
// Each value becomes a vertical bar scaled to the min/max range.
export function Sparkline({ values, height = 60, color = T.primary }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const barH = height - 8; // leave 4px top + 4px bottom padding

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
                  backgroundColor: isLast ? T.gold : withAlpha(color, 0.75),
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
