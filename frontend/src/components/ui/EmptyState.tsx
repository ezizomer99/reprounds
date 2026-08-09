import { ComponentProps, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { D, ThemeColors } from '../../theme/colors';
import { TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { Touchable } from './Touchable';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type EmptyStateProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /**
   * The way out. The trailing arrow is appended here rather than typed into the
   * label, which is how three copies of this ended up with two different arrows.
   */
  action?: { label: string; onPress: () => void };
  /** `inline` sits inside a Section; `screen` fills an empty tab. */
  size?: 'inline' | 'screen';
  style?: StyleProp<ViewStyle>;
};

/** "There is nothing here yet, and here is what to do about it." */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  size = 'inline',
  style,
}: EmptyStateProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.base, styles[size], style]}>
      {icon ? <Ionicons name={icon} size={26} color={T.muted} /> : null}
      <Text style={styles.title}>{title}</Text>
      {/* No maxFontSizeMultiplier on either line: this is prose, and a user who
          needs 3× text needs it most on the sentence explaining what to do. */}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <Touchable
          onPress={action.onPress}
          feedback="row"
          haptic={false}
          hitSlop={8}
          accessibilityLabel={action.label}
        >
          <Text style={styles.action}>{action.label} →</Text>
        </Touchable>
      ) : null}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    base: { alignItems: 'center', gap: 8 },
    inline: { paddingVertical: 24 },
    screen: { flex: 1, justifyContent: 'center', paddingHorizontal: D.pad },
    title: { ...TYPE.body, color: T.textDim, textAlign: 'center' },
    subtitle: { ...TYPE.meta, color: T.muted, textAlign: 'center', maxWidth: 280 },
    action: { ...TYPE.link, color: T.primary },
  });
}
