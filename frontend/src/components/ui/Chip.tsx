import { ComponentProps, useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { F, R, ThemeColors } from '../../theme/colors';
import { withAlpha } from '../../lib/color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Reusable pill/chip: a selectable or tap-to-act token. Fires a light haptic on
 * press and carries button a11y (with `selected` state) so call sites don't have
 * to. `variant` picks the active treatment — `solid` fills with the accent,
 * `soft` uses a translucent accent — so screens with either look can share it.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  variant = 'solid',
  leftIcon,
  style,
  textStyle,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  variant?: 'solid' | 'soft';
  leftIcon?: IconName;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const activeChip = variant === 'soft' ? styles.chipActiveSoft : styles.chipActiveSolid;
  const activeText = variant === 'soft' ? styles.chipTextActiveSoft : styles.chipTextActiveSolid;
  const iconColor = selected
    ? variant === 'soft'
      ? T.primary
      : T.onPrimary
    : T.textDim;

  return (
    <TouchableOpacity
      style={[styles.chip, selected && activeChip, style]}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={styles.inner}>
        {leftIcon ? <Ionicons name={leftIcon} size={13} color={iconColor} /> : null}
        <Text style={[styles.chipText, selected && activeText, textStyle]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    chip: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: R.chip,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.surface2,
    },
    chipActiveSolid: { backgroundColor: T.primary, borderColor: T.primary },
    chipActiveSoft: { backgroundColor: withAlpha(T.primary, 0.15), borderColor: T.primary },
    inner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    chipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'capitalize' },
    chipTextActiveSolid: { color: T.onPrimary },
    chipTextActiveSoft: { color: T.primary },
  });
}
