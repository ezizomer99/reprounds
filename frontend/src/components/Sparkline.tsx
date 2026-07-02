import { useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from '../theme/ThemeContext';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, height = 60, color, width }: SparklineProps) {
  const { T } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const lineColor = color ?? T.primary;

  if (values.length < 2) return null;

  const data = values.map((v) => ({ value: v }));
  const chartWidth = (width ?? screenWidth - 64) - 4;

  return (
    <LineChart
      data={data}
      width={chartWidth}
      height={height}
      color={lineColor}
      thickness={2}
      curved
      areaChart
      startFillColor={lineColor}
      endFillColor={lineColor}
      startOpacity={0.22}
      endOpacity={0.02}
      hideRules
      yAxisColor="transparent"
      xAxisColor="transparent"
      hideYAxisText
      dataPointsColor={lineColor}
      dataPointsRadius={3}
      initialSpacing={0}
      endSpacing={0}
    />
  );
}
