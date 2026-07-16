import { Text, View } from 'react-native';
import { BRAND } from '../theme/colors';

const INK = BRAND.ink;
const BONE = BRAND.bone;

interface RepRoundsWordmarkProps {
  fontSize?: number;
  onDark?: boolean;
}

export function RepRoundsWordmark({ fontSize = 21, onDark = false }: RepRoundsWordmarkProps) {
  const repColor = onDark ? BONE : INK;
  // Volt lime is unreadable on white — use the deep variant on light backgrounds.
  const roundsColor = onDark ? BRAND.volt : BRAND.voltDeep;
  const letterSpacing = -0.02 * fontSize;

  const textStyle = {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize,
    letterSpacing,
    includeFontPadding: false,
  } as const;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[textStyle, { color: repColor }]}>Rep</Text>
      <Text style={[textStyle, { color: roundsColor }]}>Rounds</Text>
    </View>
  );
}
