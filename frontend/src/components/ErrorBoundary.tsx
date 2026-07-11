import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, R, D, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

// Themed fallback UI. Kept as a function component so it can use hooks (theme,
// safe-area); the class boundary below only owns error state.
function ErrorFallback({ onReset }: { onReset: () => void }) {
  const { T } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(T);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom }]}>
      <View style={styles.iconCircle}>
        <Ionicons name="alert-circle-outline" size={34} color={T.textDim} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        The app hit an unexpected error. Your logged data is safe — try again.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onReset} activeOpacity={0.85}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surface in dev/log tooling; RevenueCat/Sentry-style reporting can hook here later.
    console.error('[ErrorBoundary]', error);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: T.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.pad,
      gap: 14,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
    body: {
      fontFamily: F.uiMed,
      fontSize: 14,
      color: T.textDim,
      textAlign: 'center',
      lineHeight: 21,
      maxWidth: 300,
    },
    button: {
      marginTop: 8,
      backgroundColor: T.primary,
      borderRadius: R.card,
      paddingVertical: 13,
      paddingHorizontal: 28,
    },
    buttonText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
