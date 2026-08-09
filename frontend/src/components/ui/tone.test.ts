import { Tone, toneColor } from './tone';
import { darkTheme, lightTheme } from '../../theme/colors';
import { withAlpha } from '../../lib/color';

const TONES: Tone[] = [
  'primary',
  'gold',
  'grappling',
  'conditioning',
  'performance',
  'danger',
  'neutral',
];

describe('toneColor', () => {
  // The whole point of the Tone union: whatever it resolves to is safe to hand
  // to withAlpha. If a tone ever pointed at one of the rgba() border tokens,
  // every tint built from it would silently render as nothing.
  it.each([
    ['dark', darkTheme],
    ['light', lightTheme],
  ])('resolves every tone to a 6-digit hex in the %s theme', (_name, theme) => {
    for (const tone of TONES) {
      expect(toneColor(theme, tone)).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it.each([
    ['dark', darkTheme],
    ['light', lightTheme],
  ])('produces usable tints for every tone in the %s theme', (_name, theme) => {
    for (const tone of TONES) {
      expect(withAlpha(toneColor(theme, tone), 0.14)).toMatch(/^rgba\(\d+,\d+,\d+,0\.14\)$/);
    }
  });

  it('gives each theme its own accent rather than a shared constant', () => {
    expect(toneColor(darkTheme, 'primary')).not.toBe(toneColor(lightTheme, 'primary'));
  });

  it('maps neutral to the dim text colour, not to a border token', () => {
    expect(toneColor(darkTheme, 'neutral')).toBe(darkTheme.textDim);
  });
});
