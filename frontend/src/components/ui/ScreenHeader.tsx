import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, D, ThemeColors } from '../../theme/colors';
import { FONT_SCALE, TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { Touchable } from './Touchable';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Renders a back chevron and tightens the left gutter to suit it. */
  onBack?: () => void;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The title block at the top of a screen, closed by the 2 px rule that separates
 * it from the content. Every tab and pushed screen had its own copy of this.
 *
 * The title is allowed two lines: it carries user-supplied text on some screens
 * (a routine name, a greeting with a long first name) and truncating someone's
 * name to fit is worse than wrapping.
 */
export function ScreenHeader({ title, subtitle, onBack, right, style }: ScreenHeaderProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.header, onBack ? styles.withBack : styles.plain, style]}>
      {onBack ? (
        <Touchable
          onPress={onBack}
          feedback="row"
          haptic={false}
          hitSlop={8}
          style={styles.back}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </Touchable>
      ) : null}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.chip}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 14,
      paddingBottom: 14,
      // The heavy rule is the app's masthead device — it is what makes the
      // sections below read as columns under a header rather than floating cards.
      borderBottomWidth: 2,
      borderBottomColor: T.text,
    },
    plain: { paddingHorizontal: D.pad },
    // The chevron's own touch target supplies most of the left gutter.
    withBack: { paddingHorizontal: 12 },
    back: { padding: 4 },
    titleBlock: { flex: 1, minWidth: 0 },
    title: { ...TYPE.screenTitle, color: T.text },
    subtitle: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },
    right: { flexShrink: 0 },
  });
}
