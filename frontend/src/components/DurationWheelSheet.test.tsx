import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { DURATION_SECONDS_RANGE } from '@app/shared';
import { DurationWheelSheet } from './DurationWheelSheet';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Tear the tree down between cases so `screen` never sees more than one sheet.
afterEach(cleanup);

// The wheel's scroll "feel" can't be unit-tested, but the commit path — what a
// Done press actually saves — can. These cover the h:mm:ss math, the keyboard
// toggle, and the range clamp. Under RTL v14 + React 19 re-renders are async, so
// each state change is awaited (findBy*) before the value is read back.
describe('DurationWheelSheet', () => {
  async function switchToKeyboard(value: string) {
    fireEvent.press(screen.getByTestId('duration-input-mode-toggle'));
    fireEvent.changeText(await screen.findByPlaceholderText('0:00'), value);
    await screen.findByDisplayValue(value); // wait for the controlled re-render
  }

  it('commits the seeded value unchanged when Done is pressed on the wheel', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(<DurationWheelSheet current={125} onSelect={onSelect} onClose={onClose} />);
    fireEvent.press(screen.getByText('Done'));
    expect(onSelect).toHaveBeenCalledWith(125);
    expect(onClose).toHaveBeenCalled();
  });

  it('parses a typed h:mm:ss value after switching to the keyboard', async () => {
    const onSelect = jest.fn();
    await render(<DurationWheelSheet current={0} onSelect={onSelect} onClose={jest.fn()} />);
    await switchToKeyboard('1:30:00');
    fireEvent.press(screen.getByText('Done'));
    expect(onSelect).toHaveBeenCalledWith(5400);
  });

  it('does not commit unparseable typed input', async () => {
    const onSelect = jest.fn();
    await render(<DurationWheelSheet current={0} onSelect={onSelect} onClose={jest.fn()} />);
    await switchToKeyboard('abc');
    fireEvent.press(screen.getByText('Done'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clamps a typed value above the allowed range', async () => {
    const onSelect = jest.fn();
    await render(<DurationWheelSheet current={0} onSelect={onSelect} onClose={jest.fn()} />);
    await switchToKeyboard('999:00:00');
    fireEvent.press(screen.getByText('Done'));
    expect(onSelect).toHaveBeenCalledWith(DURATION_SECONDS_RANGE.max);
  });
});
