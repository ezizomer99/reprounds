import { FONT_SCALE, TYPE, TypeRole } from './type';
import { F } from './colors';

const ROLES = Object.keys(TYPE) as TypeRole[];
const MONO = new Set<string>([F.mono, F.monoBold]);

describe('TYPE', () => {
  it('carries no colour — makeStyles(T) owns that', () => {
    for (const role of ROLES) {
      expect(TYPE[role]).not.toHaveProperty('color');
    }
  });

  it('gives every role a real font family and size', () => {
    const families = new Set<string>(Object.values(F));
    for (const role of ROLES) {
      expect(families).toContain(TYPE[role].fontFamily);
      expect(typeof TYPE[role].fontSize).toBe('number');
    }
  });

  // The floor. 10 pt labels were the app's worst legibility offenders, and mono
  // digits are the only thing legible below 11 because they sit in a fixed grid.
  it('keeps proportional text at 11 pt or above', () => {
    for (const role of ROLES) {
      if (MONO.has(TYPE[role].fontFamily as string)) continue;
      expect(TYPE[role].fontSize).toBeGreaterThanOrEqual(11);
    }
  });

  // Guards the drift this file exists to end: the section-label style had reached
  // seven size/tracking combinations. There is one card eyebrow, and it is this.
  it('has exactly one uppercase eyebrow role', () => {
    const upper = ROLES.filter((r) => TYPE[r].textTransform === 'uppercase');
    expect(upper).toEqual(['sectionLabel']);
    expect(TYPE.sectionLabel).toEqual({
      fontFamily: F.uiBold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    });
  });

  // These two look similar enough to be confused for each other, and were: a
  // card's eyebrow and a SectionList's own divider are different roles.
  it('keeps the list section title distinct from the card eyebrow', () => {
    expect(TYPE.listSectionTitle.fontSize).toBeGreaterThan(TYPE.sectionLabel.fontSize as number);
    expect(TYPE.listSectionTitle.textTransform).toBeUndefined();
  });

  it('orders the numeric emphases', () => {
    const { numLg, numMd, numSm } = TYPE;
    expect(numLg.fontSize).toBeGreaterThan(numMd.fontSize as number);
    expect(numMd.fontSize).toBeGreaterThan(numSm.fontSize as number);
    for (const n of [numLg, numMd, numSm]) expect(MONO.has(n.fontFamily as string)).toBe(true);
  });
});

describe('FONT_SCALE', () => {
  it('caps constrained boxes and leaves prose uncapped', () => {
    expect(FONT_SCALE.tile).toBeLessThan(FONT_SCALE.chip);
    expect(FONT_SCALE.tile).toBeGreaterThan(1);
    // Not a number: passing undefined to maxFontSizeMultiplier is how you say
    // "no ceiling", and prose must never have one.
    expect(FONT_SCALE.prose).toBeUndefined();
  });
});
