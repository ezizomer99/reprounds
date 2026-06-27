import Svg, { Defs, Mask, Polygon, Rect } from 'react-native-svg';

export type OctaVariant = 'solid' | 'line' | 'two-tone';

interface OctaMarkProps {
  size?: number;
  variant?: OctaVariant;
  color?: string;
}

const INK = '#17140F';
const VERMILION = '#D8432A';

const OCTA_POINTS = '60,6 140,6 194,60 194,140 140,194 60,194 6,140 6,60';

export function OctaMark({ size = 48, variant = 'solid', color }: OctaMarkProps) {
  if (variant === 'solid') {
    const fill = color ?? INK;
    return (
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        <Defs>
          <Mask id="octa-mask">
            <Rect x="0" y="0" width="200" height="200" fill="black" />
            <Polygon points={OCTA_POINTS} fill="white" />
            <Rect x="14" y="89" width="172" height="22" rx="11" fill="black" />
            <Rect x="44" y="58" width="19" height="84" rx="7" fill="black" />
            <Rect x="137" y="58" width="19" height="84" rx="7" fill="black" />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width="200" height="200" fill={fill} mask="url(#octa-mask)" />
      </Svg>
    );
  }

  if (variant === 'line') {
    const stroke = color ?? INK;
    return (
      <Svg viewBox="0 0 200 200" width={size} height={size} fill="none">
        <Polygon
          points={OCTA_POINTS}
          stroke={stroke}
          strokeWidth="16"
          strokeLinejoin="round"
        />
        <Rect x="18" y="90" width="164" height="20" rx="10" fill={stroke} />
        <Rect x="44" y="62" width="18" height="76" rx="6" fill={stroke} />
        <Rect x="138" y="62" width="18" height="76" rx="6" fill={stroke} />
      </Svg>
    );
  }

  // two-tone
  const octaStroke = color ?? INK;
  return (
    <Svg viewBox="0 0 200 200" width={size} height={size} fill="none">
      <Polygon
        points={OCTA_POINTS}
        stroke={octaStroke}
        strokeWidth="16"
        strokeLinejoin="round"
      />
      <Rect x="18" y="90" width="164" height="20" rx="10" fill={VERMILION} />
      <Rect x="44" y="62" width="18" height="76" rx="6" fill={VERMILION} />
      <Rect x="138" y="62" width="18" height="76" rx="6" fill={VERMILION} />
    </Svg>
  );
}
