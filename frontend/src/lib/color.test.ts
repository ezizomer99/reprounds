import { withAlpha } from './color';
import { darkTheme, lightTheme } from '../theme/colors';

describe('withAlpha', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('decomposes a 6-digit hex', () => {
    expect(withAlpha('#C8F031', 0.15)).toBe('rgba(200,240,49,0.15)');
  });

  it('accepts uppercase and lowercase alike', () => {
    expect(withAlpha('#65a30d', 0.5)).toBe(withAlpha('#65A30D', 0.5));
  });

  it('handles the extremes of the channel range', () => {
    expect(withAlpha('#000000', 1)).toBe('rgba(0,0,0,1)');
    expect(withAlpha('#ffffff', 0)).toBe('rgba(255,255,255,0)');
  });

  // The bug this guards: the theme's border tokens are already rgba(), and the
  // old implementation sliced them by index and produced 'rgba(NaN,NaN,NaN,0.5)'
  // — a colour that renders as nothing at all.
  it('returns rgba input unchanged rather than producing NaN channels', () => {
    const border = darkTheme.border;
    expect(border).toMatch(/^rgba\(/);
    expect(withAlpha(border, 0.5)).toBe(border);
    expect(withAlpha(border, 0.5)).not.toContain('NaN');
  });

  it('warns in dev when given something it cannot parse', () => {
    withAlpha('rgba(0,0,0,0.14)', 0.5);
    expect(warn).toHaveBeenCalled();
  });

  it.each(['', '#fff', '#12345', '#1234567', 'red', 'transparent'])(
    'degrades safely on %p',
    (input) => {
      expect(withAlpha(input, 0.3)).toBe(input);
    },
  );

  // Every theme token a primitive is allowed to tint must survive the round trip.
  it.each([
    ['dark', darkTheme],
    ['light', lightTheme],
  ])('produces a real rgba() for every tintable %s token', (_name, theme) => {
    for (const key of ['primary', 'gold', 'grappling', 'conditioning', 'performance', 'danger', 'textDim'] as const) {
      expect(withAlpha(theme[key], 0.14)).toMatch(/^rgba\(\d+,\d+,\d+,0\.14\)$/);
    }
  });
});
