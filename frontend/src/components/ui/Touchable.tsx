import { ReactNode } from 'react';
import {
  AccessibilityRole,
  AccessibilityState,
  Insets,
  StyleProp,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * How much the target dims while pressed.
 *
 * Named rather than numeric because the raw values had drifted to four
 * (0.7 / 0.75 / 0.8 / 0.85) across ~129 call sites with no rule behind which
 * went where. Three roles is the real vocabulary: a row in a list, a card, a
 * call to action.
 */
export type Feedback = 'row' | 'card' | 'cta';

const ACTIVE_OPACITY: Record<Feedback, number> = { row: 0.7, card: 0.8, cta: 0.85 };

type Base = {
  children: ReactNode;
  /** Optional so a row can be conditionally inert without changing component. */
  onPress?: () => void;
  onLongPress?: () => void;
  /** ms before onLongPress fires — drag handles want this shorter than the default. */
  delayLongPress?: number;
  /**
   * Impact fired on press. Defaults to a Light impact — the app's convention,
   * previously hand-inlined at every call site. `false` opts out (navigation
   * chevrons, anything already followed by a notification haptic).
   */
  haptic?: false | Haptics.ImpactFeedbackStyle;
  disabled?: boolean;
  feedback?: Feedback;
  hitSlop?: number | Insets;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** The "what happens next" line, e.g. "Press and hold, then drag up or down". */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A pressable with the house press feedback, haptic and a11y defaults.
 *
 * `accessibilityLabel` is **required** unless you declare `hasTextChild`. RN
 * derives a label from a `<Text>` descendant, so a button that reads "View all"
 * needs nothing — but an icon-only target announces as "button" and nothing
 * else. That was the single most common a11y gap in the app, and the union below
 * turns it from something a reviewer has to spot into a type error.
 */
export type TouchableProps = Base &
  (
    | { accessibilityLabel: string; hasTextChild?: never }
    | { hasTextChild: true; accessibilityLabel?: string }
  );

export function Touchable({
  children,
  onPress,
  onLongPress,
  delayLongPress,
  haptic = Haptics.ImpactFeedbackStyle.Light,
  disabled = false,
  feedback = 'row',
  hitSlop,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: TouchableProps) {
  return (
    <TouchableOpacity
      style={style}
      onPress={
        onPress
          ? () => {
              if (haptic !== false) void Haptics.impactAsync(haptic);
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      activeOpacity={ACTIVE_OPACITY[feedback]}
      hitSlop={typeof hitSlop === 'number' ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : hitSlop}
      accessibilityRole={accessibilityRole}
      // Merged rather than overwritten: a caller passing `{ selected }` should
      // not have to restate `disabled` to keep the two in sync.
      accessibilityState={{ disabled, ...accessibilityState }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {children}
    </TouchableOpacity>
  );
}
