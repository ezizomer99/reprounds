import { Text, View } from 'react-native';

const INK = '#17140F';
const VERMILION = '#D8432A';
const BONE = '#F4F0E7';

interface RepRoundsWordmarkProps {
  fontSize?: number;
  onDark?: boolean;
}

export function RepRoundsWordmark({ fontSize = 21, onDark = false }: RepRoundsWordmarkProps) {
  const repColor = onDark ? BONE : INK;
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
      <Text style={[textStyle, { color: VERMILION }]}>Rounds</Text>
    </View>
  );
}
