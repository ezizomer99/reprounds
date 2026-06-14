import Svg, { Circle, Polyline } from 'react-native-svg';
import { T } from '../theme/colors';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, width = 300, height = 60, color = T.primary }: SparklineProps) {
  if (values.length < 2) return null;

  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const ptStr = points.join(' ');

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={ptStr}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => {
        const [x, y] = p.split(',');
        const isLast = i === values.length - 1;
        return (
          <Circle
            key={i}
            cx={parseFloat(x)}
            cy={parseFloat(y)}
            r={isLast ? 3.5 : 2.5}
            fill={isLast ? T.gold : color}
          />
        );
      })}
    </Svg>
  );
}
