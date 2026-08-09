import { ComponentProps } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { F, R } from '../../theme/colors';
import { FONT_SCALE, TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';
import { CutCornerView } from '../CutCornerView';
import { Touchable } from './Touchable';
import { Tone, toneColor } from './tone';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ButtonVariant = 'hero' | 'soft' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * `hero`  — the screen's primary action, in the 45°-cut octagon shape.
   * `soft`  — a translucent accent pill. The default.
   * `ghost` — text and icon only.
   */
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'md' | 'sm';
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  /** Defaults to true for `hero`, false otherwise. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The app's button.
 *
 * Two constraints worth knowing before reaching for `hero`:
 *
 * 1. `hero` renders a `CutCornerView`, which measures itself with `onLayout` and
 *    therefore paints its polygon one frame late — it is `null` on first paint.
 *    That is fine for a CTA sitting in a laid-out screen and **not** fine inside
 *    a virtualised list cell that mounts during a scroll, where it shows as a
 *    flash of unfilled text. Keep `hero` to the handful of primary actions.
 * 2. `CutCornerView` is also used for two non-button *panels* (the session
 *    summary card and the rest timer). Those are not buttons and deliberately do
 *    not go through here — they keep calling `CutCornerView` directly.
 *
 * `soft` fills at 0.14 alpha with a 0.35 border. The two hand-rolled versions
 * this replaces used 0.14 and 0.12; the 0.02 difference was drift, not intent.
 */
export function Button({
  label,
  onPress,
  variant = 'soft',
  icon,
  size = 'md',
  tone = 'primary',
  disabled = false,
  loading = false,
  fullWidth = variant === 'hero',
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const { T } = useTheme();
  const accent = toneColor(T, tone);

  const iconSize = size === 'md' ? 20 : 16;
  const textStyle = [
    size === 'md' ? styles.labelMd : styles.labelSm,
    { color: variant === 'hero' ? T.onPrimary : accent },
  ];
  const fgColor = variant === 'hero' ? T.onPrimary : accent;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={fgColor} />
      ) : icon ? (
        <Ionicons name={icon} size={iconSize} color={fgColor} />
      ) : null}
      <Text style={textStyle} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.chip}>
        {label}
      </Text>
    </>
  );

  const inner =
    variant === 'hero' ? (
      <CutCornerView fill={accent} style={[styles.inner, styles[size], styles.heroInner]}>
        {content}
      </CutCornerView>
    ) : (
      <View
        style={[
          styles.inner,
          styles[size],
          variant === 'soft' && {
            borderRadius: R.chip,
            borderWidth: 1,
            backgroundColor: withAlpha(accent, 0.14),
            borderColor: withAlpha(accent, 0.35),
          },
        ]}
      >
        {content}
      </View>
    );

  return (
    <Touchable
      onPress={onPress}
      // A disabled button must not fire a haptic — a buzz with no state change
      // reads as "it worked".
      disabled={disabled || loading}
      haptic={disabled || loading ? false : Haptics.ImpactFeedbackStyle.Light}
      feedback="cta"
      style={[
        fullWidth ? styles.fullWidth : styles.hug,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
    >
      {inner}
    </Touchable>
  );
}

// Not a makeStyles(T) factory like the rest of the primitives: every colour here
// comes from `tone`, applied inline, so there is nothing theme-dependent to
// rebuild and no reason to memoize per theme.
const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  disabled: { opacity: 0.5 },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // The cut corners need room to read as a shape rather than a nick.
  heroInner: { paddingHorizontal: 16 },
  md: { paddingVertical: 14, paddingHorizontal: 18 },
  sm: { paddingVertical: 8, paddingHorizontal: 18 },
  labelMd: { fontFamily: F.uiBold, fontSize: 16 },
  labelSm: { ...TYPE.link, fontFamily: F.uiBold },
});
