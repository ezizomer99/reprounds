import { StyleSheet, Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Button } from './Button';
import { SectionHeader } from './SectionHeader';
import { StatTile } from './StatTile';
import { Touchable } from './Touchable';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

const impact = Haptics.impactAsync as jest.Mock;
beforeEach(() => impact.mockClear());

// Note for anyone adding cases here: under React 19, @testing-library/react-native
// v14 wraps rendering in an async act(), so `render` and `rerender` return
// promises and MUST be awaited — an un-awaited one resolves to an object with no
// query methods ("getByText is not a function"). For the same reason, don't loop
// renders inside a single test: the act() scopes overlap and corrupt the trees
// that follow. Use it.each instead.

/** The nearest host View above a node — where a text column's flex rules live. */
function parentStyle(node: { parent: unknown }) {
  let cur = node.parent as { type?: unknown; props?: { style?: unknown }; parent: unknown } | null;
  while (cur && cur.type !== 'View') cur = cur.parent as typeof cur;
  return StyleSheet.flatten(cur?.props?.style ?? {}) as Record<string, unknown>;
}

describe('StatTile', () => {
  // The regression test for the bug that started all of this: "current streak"
  // overflowed its chip because the text column had no flex constraint against a
  // fixed-width icon. Without flex:1 + minWidth:0 the column sizes to its content
  // and pushes past the chip's padding.
  it('constrains the text column in the inline layout', async () => {
    const { getByText } = await render(
      <StatTile layout="inline" icon="flash" value="7 wk" label="current streak" />,
    );
    const style = parentStyle(getByText('current streak'));
    expect(style.flex).toBe(1);
    expect(style.minWidth).toBe(0);
  });

  it('keeps both lines to one line each so neither can grow the tile', async () => {
    const { getByText } = await render(
      <StatTile layout="inline" icon="flash" value="7 wk" label="current streak" />,
    );
    expect(getByText('7 wk').props.numberOfLines).toBe(1);
    expect(getByText('current streak').props.numberOfLines).toBe(1);
  });

  it('caps OS text scaling on both lines', async () => {
    const { getByText } = await render(
      <StatTile layout="inline" icon="flash" value="7 wk" label="current streak" />,
    );
    expect(getByText('7 wk').props.maxFontSizeMultiplier).toBe(1.3);
    expect(getByText('current streak').props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('reads as one thing, with the abbreviation spoken in full', async () => {
    const { getByLabelText } = await render(
      <StatTile
        layout="inline"
        icon="flash"
        value="7 wk"
        label="current streak"
        accessibilityLabel="7 week current streak"
      />,
    );
    expect(getByLabelText('7 week current streak')).toBeTruthy();
  });

  it('falls back to value + label for its a11y label', async () => {
    const { getByLabelText } = await render(<StatTile value="12" label="sessions" />);
    expect(getByLabelText('12 sessions')).toBeTruthy();
  });

  it('is pressable only when given an onPress', async () => {
    const onPress = jest.fn();
    const { queryByRole, getByRole, rerender } = await render(<StatTile value="12" label="sessions" />);
    expect(queryByRole('button')).toBeNull();

    await rerender(<StatTile value="12" label="sessions" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SectionHeader', () => {
  // Carried over from the one hand-rolled copy that had it. Without flex:1 on the
  // left block a right-hand control renders off-screen; without minWidth:0 the
  // intent that it may shrink is unstated.
  it('constrains the left block so a right-hand control stays on screen', async () => {
    const { getByText, getByTestId } = await render(
      <SectionHeader title="This week" right={<View testID="toggle" />} />,
    );
    const style = parentStyle(getByText('This week'));
    expect(style.flex).toBe(1);
    expect(style.minWidth).toBe(0);
    expect(getByTestId('toggle')).toBeTruthy();
  });

  it('truncates the title rather than the control', async () => {
    const { getByText } = await render(<SectionHeader title="A very long section title indeed" />);
    expect(getByText('A very long section title indeed').props.numberOfLines).toBe(1);
  });

  it('renders the action as a labelled button and fires it', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(
      <SectionHeader title="Routines" action={{ label: 'View all', onPress }} />,
    );
    fireEvent.press(getByLabelText('View all'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers the action over an also-supplied right control', async () => {
    const { queryByTestId } = await render(
      <SectionHeader
        title="Routines"
        action={{ label: 'View all', onPress: jest.fn() }}
        right={<View testID="toggle" />}
      />,
    );
    expect(queryByTestId('toggle')).toBeNull();
  });
});

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Start Workout" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled, and says so to a screen reader', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Start Workout" onPress={onPress} disabled />);
    const btn = getByRole('button');
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('does not fire while loading, and reports busy', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="Starting" onPress={onPress} loading />);
    const btn = getByRole('button');
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });

  // A buzz with no state change reads as "it worked".
  it('stays silent when disabled', async () => {
    const { getByRole } = await render(<Button label="Start Workout" onPress={jest.fn()} disabled />);
    fireEvent.press(getByRole('button'));
    expect(impact).not.toHaveBeenCalled();
  });

  // One case per variant rather than a loop: under React 19 every render and
  // unmount is its own act() scope, and looping them inside one test overlaps
  // those scopes and corrupts the trees that follow.
  it.each(['hero', 'soft', 'ghost'] as const)(
    'renders the %s variant without needing a colour prop',
    async (variant) => {
      const { getByText } = await render(
        <Button label={variant} onPress={jest.fn()} variant={variant} tone="grappling" />,
      );
      expect(getByText(variant)).toBeTruthy();
    },
  );
});

describe('Touchable', () => {
  it('fires exactly one haptic per press', async () => {
    const { getByRole } = await render(
      <Touchable onPress={jest.fn()} hasTextChild>
        <Text>Tap</Text>
      </Touchable>,
    );
    fireEvent.press(getByRole('button'));
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('can opt out of the haptic', async () => {
    const { getByRole } = await render(
      <Touchable onPress={jest.fn()} haptic={false} hasTextChild>
        <Text>Tap</Text>
      </Touchable>,
    );
    fireEvent.press(getByRole('button'));
    expect(impact).not.toHaveBeenCalled();
  });

  it('merges a caller state with the disabled state', async () => {
    const { getByRole } = await render(
      <Touchable onPress={jest.fn()} accessibilityState={{ selected: true }} hasTextChild>
        <Text>Tap</Text>
      </Touchable>,
    );
    expect(getByRole('button').props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
  });

  it('expands a numeric hitSlop to all four edges', async () => {
    const { getByRole } = await render(
      <Touchable onPress={jest.fn()} hitSlop={8} hasTextChild>
        <Text>Tap</Text>
      </Touchable>,
    );
    expect(getByRole('button').props.hitSlop).toEqual({
      top: 8,
      bottom: 8,
      left: 8,
      right: 8,
    });
  });
});
