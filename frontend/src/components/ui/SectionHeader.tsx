import { ComponentProps, ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, ThemeColors } from '../../theme/colors';
import { FONT_SCALE, TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';
import { Touchable } from './Touchable';
import { Tone, toneColor } from './tone';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type SectionHeaderProps = {
  title: string;
  /** Names the window or scope the section covers, so no title has to claim "this week". */
  subtitle?: string;
  icon?: IconName;
  iconTone?: Tone;
  /**
   * The one "see more" affordance in the app. Previously this was a bare chevron
   * in some places and a coloured text link in others, with three different
   * wordings.
   */
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  /** An arbitrary right-hand control (e.g. the Front/Back toggle on the muscle map). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The header row of a `Section`: optional icon, title, optional subtitle, and
 * either a "see more" action or a caller-supplied control on the right.
 *
 * The flex rules here are load-bearing and are the reason this is a component
 * rather than a style object. `left` needs `flex: 1` or a right-hand control
 * renders off-screen; the title block inside it carries its own `flex: 1` to
 * ellipsize, and in an auto-width parent that made the row swell to the full
 * header width, so `space-between` parked the control past the padding edge.
 * Constraining the parent is what makes the inner `flex: 1` mean "the leftover
 * space" rather than "all of it". `minWidth: 0` changes nothing today — Yoga has
 * no `min-width: auto` — but states that this may shrink.
 *
 * That fix existed in exactly one of the seven hand-rolled copies. Everything
 * else inherited the bug.
 */
export function SectionHeader({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  action,
  right,
  style,
}: SectionHeaderProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const accent = toneColor(T, iconTone);

  return (
    <View style={[styles.header, style]}>
      <View style={styles.left}>
        {icon ? (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(accent, 0.14) }]}>
            <Ionicons name={icon} size={16} color={accent} />
          </View>
        ) : null}
        <View style={styles.titleBlock}>
          <Text
            style={styles.title}
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_SCALE.chip}
          >
            {title}
          </Text>
          {subtitle ? (
            // Two lines, unlike the title: this carries a window label on some
            // screens ("Last 8 weeks") and a whole sentence on others, and
            // clipping a sentence mid-word to keep the header one line high is
            // the worse trade — especially at the 1.4× ceiling.
            <Text
              style={styles.subtitle}
              numberOfLines={2}
              maxFontSizeMultiplier={FONT_SCALE.chip}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {action ? (
        <Touchable
          onPress={action.onPress}
          feedback="row"
          haptic={false}
          hitSlop={8}
          style={styles.action}
          accessibilityLabel={action.accessibilityLabel ?? action.label}
        >
          <Text style={styles.actionLabel} maxFontSizeMultiplier={FONT_SCALE.chip}>
            {action.label}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={T.primary} />
        </Touchable>
      ) : right ? (
        <View style={styles.right}>{right}</View>
      ) : null}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 12,
    },
    // See the component doc — `flex: 1` and `minWidth: 0` are both deliberate.
    left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBox: {
      width: 28,
      height: 28,
      flexShrink: 0,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleBlock: { flex: 1, minWidth: 0 },
    title: { ...TYPE.sectionLabel, color: T.textDim },
    subtitle: { fontFamily: F.ui, fontSize: 11, color: T.muted, marginTop: 2 },
    // Never squeezed: the header shrinks the title before it shrinks the control.
    action: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 2 },
    actionLabel: { ...TYPE.link, color: T.primary },
    right: { flexShrink: 0 },
  });
}
