import { ComponentProps, ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { R, ThemeColors } from '../../theme/colors';
import { FONT_SCALE, TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';
import { Touchable } from './Touchable';
import { Tone, toneColor } from './tone';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type StatTileProps = {
  /** Usually a string or number; a node so a locked tile can render a padlock. */
  value: ReactNode;
  label: string;
  /**
   * `stack`  — number over label, centred. A tile in a row of equal tiles.
   * `inline` — icon left, value over label to its right. A chip.
   */
  layout?: 'stack' | 'inline';
  /** `inline` only. */
  icon?: IconName;
  tone?: Tone;
  /** The tinted panel behind the tile. `false` gives a bare cell. */
  filled?: boolean;
  emphasis?: 'lg' | 'md' | 'sm';
  onPress?: () => void;
  /**
   * Defaults to `"{value} {label}"`, which is only right when `value` is text.
   * Pass it explicitly whenever the value is a node, or whenever the abbreviated
   * on-screen form ("4 wk") should be spoken in full ("4 week current streak").
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const EMPHASIS = { lg: TYPE.numLg, md: TYPE.numMd, sm: TYPE.numSm } as const;

/**
 * A single number with a label under it.
 *
 * The flex rules in `inline` are the point of this component. A fixed-size icon
 * next to an unconstrained text column in a `flex`-sized parent overflows as soon
 * as the label is longer than the space left — which is how "current streak"
 * came to run off the edge of its own chip on an ordinary phone, and why it got
 * worse with OS text scaling. The text column gets `flex: 1` + `minWidth: 0`, the
 * icon gets `flexShrink: 0`, both lines get `numberOfLines={1}`, and the whole
 * thing is capped at `FONT_SCALE.tile`. Encoded once here, it cannot be
 * forgotten at a call site.
 */
export function StatTile({
  value,
  label,
  layout = 'stack',
  icon,
  tone = 'neutral',
  filled = true,
  emphasis = layout === 'inline' ? 'sm' : 'lg',
  onPress,
  accessibilityLabel,
  style,
  testID,
}: StatTileProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const accent = toneColor(T, tone);
  const isNeutral = tone === 'neutral';

  // A stacked tile takes its accent all the way through the text; a chip keeps
  // the text neutral and lets the icon carry the colour. Both are the looks
  // already in the app — this preserves them rather than picking one.
  const valueColor = layout === 'stack' && !isNeutral ? accent : T.text;
  const labelColor = layout === 'stack' && !isNeutral ? accent : T.textDim;

  const body =
    layout === 'inline' ? (
      <>
        {icon ? (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(accent, 0.15) }]}>
            <Ionicons name={icon} size={14} color={accent} />
          </View>
        ) : null}
        <View style={styles.textCol}>
          <Text
            style={[EMPHASIS[emphasis], { color: valueColor }]}
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_SCALE.tile}
          >
            {value}
          </Text>
          <Text
            style={[TYPE.micro, { color: labelColor }]}
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_SCALE.tile}
          >
            {label}
          </Text>
        </View>
      </>
    ) : (
      <>
        <Text
          style={[EMPHASIS[emphasis], { color: valueColor }]}
          numberOfLines={1}
          maxFontSizeMultiplier={FONT_SCALE.tile}
        >
          {value}
        </Text>
        <Text
          style={[TYPE.micro, styles.stackLabel, { color: labelColor }]}
          numberOfLines={2}
          maxFontSizeMultiplier={FONT_SCALE.tile}
        >
          {label}
        </Text>
      </>
    );

  const fill = filled
    ? isNeutral
      ? styles.fillNeutral
      : { backgroundColor: withAlpha(accent, layout === 'inline' ? 0.15 : 0.12) }
    : null;
  // An inline chip's own surface is neutral even when toned — the icon carries
  // the accent, so tinting the panel too would double it.
  const inlineFill = filled && layout === 'inline' ? styles.fillNeutral : fill;

  const container = [styles.base, styles[layout], inlineFill, style];
  const a11y = accessibilityLabel ?? `${typeof value === 'object' ? '' : String(value)} ${label}`.trim();

  if (onPress) {
    return (
      <Touchable
        onPress={onPress}
        feedback="row"
        style={container}
        accessibilityLabel={a11y}
        testID={testID}
      >
        {body}
      </Touchable>
    );
  }

  // Not pressable, but still one thing to a screen reader rather than two
  // orphaned strings.
  return (
    <View style={container} accessible accessibilityLabel={a11y} testID={testID}>
      {body}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    base: { borderRadius: R.sm },
    stack: { flex: 1, paddingVertical: 14, alignItems: 'center', gap: 4 },
    inline: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
    fillNeutral: { backgroundColor: T.surface2 },
    iconBox: {
      width: 32,
      height: 32,
      flexShrink: 0,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // The fix: without these the label pushes the chip wider than its share of
    // the row and spills past the padding.
    textCol: { flex: 1, minWidth: 0 },
    stackLabel: { textAlign: 'center' },
  });
}
