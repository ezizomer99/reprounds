import { StyleSheet, Text, View } from 'react-native';
import { F } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface GlimaMarkProps {
  size?: number;
  color?: string;
}

export function GlimaMark({ size = 48, color }: GlimaMarkProps) {
  const { T } = useTheme();
  const resolvedColor = color ?? T.text;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.rune, { fontSize: size * 0.92, color: resolvedColor, lineHeight: size * 1.1 }]}>
        ᛏ
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  rune: { fontFamily: F.wordmark, textAlign: 'center' },
});
