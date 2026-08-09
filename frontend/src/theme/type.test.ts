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

  // Guards the drift this file exists to end: the uppercase label had reached
  // seven size/tracking combinations across 58 sites. There are exactly two
  // roles behind those — a card eyebrow and a form-field label — and they are
  // named here so a third cannot appear by accident.
  it('has exactly two uppercase roles, and they are distinguishable', () => {
    const upper = ROLES.filter((r) => TYPE[r].textTransform === 'uppercase');
    expect(upper.sort()).toEqual(['fieldLabel', 'sectionLabel']);
    expect(TYPE.sectionLabel).toEqual({
      fontFamily: F.uiBold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    });
    // Same size, deliberately: what separates them is weight and tracking. The
    // eyebrow heads a section; the field label labels an input.
    expect(TYPE.fieldLabel.fontSize).toBe(TYPE.sectionLabel.fontSize);
    expect(TYPE.fieldLabel.fontFamily).not.toBe(TYPE.sectionLabel.fontFamily);
    expect(TYPE.fieldLabel.letterSpacing).toBeLessThan(
      TYPE.sectionLabel.letterSpacing as number,
    );
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
