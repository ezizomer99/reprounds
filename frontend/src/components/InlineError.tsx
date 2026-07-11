import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, D, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

// Small, consistent error state for a screen or section whose data failed to
// load. Optional onRetry wires a React Query refetch to a "Try again" button.
export function InlineError({
  message = 'Something went wrong loading this.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { T } = useTheme();
  const styles = makeStyles(T);
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={22} color={T.textDim} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Retry loading"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 28,
      paddingHorizontal: D.pad,
    },
    message: {
      fontFamily: F.uiMed,
      fontSize: 14,
      color: T.textDim,
      textAlign: 'center',
      maxWidth: 280,
    },
    button: {
      marginTop: 4,
      borderRadius: R.chip,
      paddingVertical: 9,
      paddingHorizontal: 18,
      backgroundColor: withAlpha(T.primary, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.35),
    },
    buttonText: { fontFamily: F.uiBold, fontSize: 13, color: T.primary },
  });
}
