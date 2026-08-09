import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui';
import { D, ThemeColors } from '../theme/colors';
import { TYPE } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';

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
  // Memoized on the theme like every other component in this tree — this one
  // rebuilt its StyleSheet on every render, once per failing card.
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={22} color={T.textDim} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button
          label="Try again"
          onPress={onRetry}
          variant="soft"
          size="sm"
          style={styles.button}
          accessibilityLabel="Retry loading"
        />
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
      ...TYPE.body,
      color: T.textDim,
      textAlign: 'center',
      maxWidth: 280,
    },
    // The fill and border come from Button's `soft` variant now. It used 0.12
    // here and 0.14 elsewhere; that 0.02 was drift, not intent.
    button: { marginTop: 4 },
  });
}
