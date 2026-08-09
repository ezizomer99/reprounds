import type { TextStyle } from 'react-native';
import { F } from './colors';

/**
 * The named type roles. Colourless on purpose: `makeStyles(T)` keeps owning
 * colour, so a role can be reused on `T.text`, `T.textDim` or an accent without
 * forking. Spread a role and add the colour:
 *
 *     title: { ...TYPE.sectionLabel, color: T.textDim }
 *
 * Sizes were not invented — each is the value the majority of call sites already
 * used. What this file removes is the drift around them: the section-label style
 * alone had reached seven size/tracking combinations across 58 uppercase sites,
 * with two distinct roles tangled inside it (a card eyebrow and a list-section
 * divider). Those are `sectionLabel` and `listSectionTitle` here, deliberately
 * separate — they look different because they *are* different.
 */
export type TypeRole =
  /** The 22 pt title in every tab and pushed-screen header. */
  | 'screenTitle'
  /** Card eyebrow: the small uppercase label above a section's content. */
  | 'sectionLabel'
  /** A list's own section divider (SectionList headers) — larger, not uppercase. */
  | 'listSectionTitle'
  /**
   * The uppercase label above a form field, filter group or summary key. Same
   * size as the eyebrow but lighter and tracked tighter — it labels an input,
   * it does not head a section.
   */
  | 'fieldLabel'
  /** Name of a card/row's subject. */
  | 'cardTitle'
  /** Default reading size for row content. */
  | 'body'
  /** Secondary line under body text: counts, dates, units. */
  | 'meta'
  /**
   * The floor. Nothing renders below 11 pt except mono numerics, which are
   * legible smaller because they are digits in a fixed grid.
   */
  | 'micro'
  /** Inline navigation affordance ("View all"). */
  | 'link'
  /** Mono numerics, three weights of emphasis. */
  | 'numLg'
  | 'numMd'
  | 'numSm';

export const TYPE: Record<TypeRole, TextStyle> = {
  screenTitle:      { fontFamily: F.uiBold, fontSize: 22, letterSpacing: -0.3 },
  sectionLabel:     { fontFamily: F.uiBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  listSectionTitle: { fontFamily: F.uiBold, fontSize: 16, letterSpacing: -0.2 },
  fieldLabel:       { fontFamily: F.uiMed,  fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle:        { fontFamily: F.uiSemi, fontSize: 15 },
  body:             { fontFamily: F.uiMed,  fontSize: 14 },
  meta:             { fontFamily: F.uiMed,  fontSize: 12 },
  micro:            { fontFamily: F.uiMed,  fontSize: 11 },
  link:             { fontFamily: F.uiMed,  fontSize: 13 },
  numLg:            { fontFamily: F.monoBold, fontSize: 24 },
  numMd:            { fontFamily: F.monoBold, fontSize: 16 },
  numSm:            { fontFamily: F.monoBold, fontSize: 14 },
};

/**
 * Ceilings on OS text scaling, chosen by how much room the glyph has.
 *
 * iOS allows up to 3.1×, which overflows anything in a fixed-size box. Cap the
 * boxes; never cap prose — a user who needs 3× text needs it most on the
 * sentence explaining what went wrong.
 */
export const FONT_SCALE = {
  /** Fixed-width tiles and grid cells. Same value and reason as the session
   *  screen's CELL_MAX_FONT_SCALE and the Highlights row's TILE_MAX_FONT_SCALE. */
  tile: 1.3,
  /** A single-line label in a fixed-height chip or header. */
  chip: 1.4,
  /** Free-flowing text. Explicitly uncapped. */
  prose: undefined,
} as const;
