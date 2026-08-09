import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export type SectionProps = {
  children: ReactNode;
  /**
   * The hairline above the section. Omit on the first section under a screen
   * header — the header's own 2 px rule already closes that edge, and two rules
   * 14 px apart read as a mistake.
   */
  rule?: boolean;
  /**
   * `section` — the standard block: rule, then content.
   * `row` — a tappable row that happens to be its own section (a category link),
   * with symmetric padding instead of the block's top-heavy spacing.
   */
  density?: 'section' | 'row';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A page section in the broadsheet style: flat, separated from its neighbour by
 * a rule, with no radius, fill or shadow. This block had been redefined in 17
 * files; it is the single most duplicated thing in the app.
 *
 * Deliberately a plain `View` and never pressable. Wrapping a whole section in
 * one touch target is how the week block ended up with a seven-day strip that
 * couldn't be tapped day by day — if something inside needs to be pressable,
 * make *that* thing pressable.
 */
export function Section({
  children,
  rule = true,
  density = 'section',
  style,
  testID,
}: SectionProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View
      style={[styles.base, rule && styles.rule, styles[density], style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    base: {},
    rule: { borderTopWidth: 1, borderTopColor: T.borderStrong },
    // paddingBottom is deliberately smaller than paddingTop: the rule belongs to
    // the section below it, so the visual gap between two sections is this 4 plus
    // the parent's `gap` plus the next section's 14.
    section: { paddingTop: 14, paddingBottom: 4 },
    row: { paddingVertical: 14 },
  });
}
