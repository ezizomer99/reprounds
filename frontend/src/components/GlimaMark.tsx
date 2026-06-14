import Svg, { G, Line, Polyline } from 'react-native-svg';
import { T } from '../theme/colors';

interface GlimaMarkProps {
  size?: number;
  color?: string;
}

export function GlimaMark({ size = 48, color = T.text }: GlimaMarkProps) {
  const h = size * 1.2;
  return (
    <Svg width={size} height={h} viewBox="0 0 100 120">
      <G
        fill="none"
        stroke={color}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeWidth={8.5}
      >
        {/* central staff */}
        <Line x1={50} y1={5} x2={50} y2={115} />
        {/* Tiwaz ᛏ — warrior, arms branch down-out from tip */}
        <Polyline points="18,42 50,7 82,42" />
        {/* Gebo ᚷ — bond, the X */}
        <Line x1={18} y1={67} x2={82} y2={95} />
        <Line x1={82} y1={67} x2={18} y2={95} />
      </G>
    </Svg>
  );
}
