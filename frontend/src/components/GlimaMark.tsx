import { StyleSheet, Text, View } from 'react-native';
import { T, F } from '../theme/colors';

interface GlimaMarkProps {
  size?: number;
  color?: string;
}

// Bindrune rendered as the Tiwaz rune glyph (ᛏ) — no native SVG needed.
// Displays in system fallback font; swap for SVG once native build includes react-native-svg.
export function GlimaMark({ size = 48, color = T.text }: GlimaMarkProps) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.rune, { fontSize: size * 0.92, color, lineHeight: size * 1.1 }]}>
        ᛏ
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  rune: { fontFamily: F.wordmark, textAlign: 'center' },
});
