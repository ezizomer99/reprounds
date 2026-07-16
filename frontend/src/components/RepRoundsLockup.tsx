import { View } from 'react-native';
import { OctaMark } from './OctaMark';
import { RepRoundsWordmark } from './RepRoundsWordmark';
import { BRAND } from '../theme/colors';

const BONE = BRAND.bone;
const INK = BRAND.ink;

type LockupSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<LockupSize, { mark: number; font: number; gap: number }> = {
  sm: { mark: 22, font: 18, gap: 10 },
  md: { mark: 30, font: 21, gap: 12 },
  lg: { mark: 48, font: 34, gap: 16 },
};

interface RepRoundsLockupProps {
  size?: LockupSize;
  onDark?: boolean;
}

export function RepRoundsLockup({ size = 'md', onDark = false }: RepRoundsLockupProps) {
  const { mark, font, gap } = SIZE_MAP[size];
  const markColor = onDark ? BONE : INK;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <OctaMark size={mark} variant="solid" color={markColor} />
      <RepRoundsWordmark fontSize={font} onDark={onDark} />
    </View>
  );
}
