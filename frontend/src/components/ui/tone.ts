import type { ThemeColors } from '../../theme/colors';

/**
 * The accent a primitive is tinted with.
 *
 * Primitives take a `Tone`, never a colour string. Two reasons:
 *
 * 1. `withAlpha()` only understands 6-digit `#rrggbb`. Handing it `T.border` or
 *    `T.borderStrong` — which are `rgba(...)` strings — used to be a live
 *    footgun that renders `rgba(NaN,NaN,NaN,α)`, i.e. nothing at all. A union of
 *    tone names makes that a compile error instead of a blank tile on someone's
 *    phone.
 * 2. It keeps the accent vocabulary closed. Every tint in the app today is one
 *    of these seven, so nothing is lost by naming them.
 */
export type Tone =
  | 'primary'
  | 'gold'
  | 'grappling'
  | 'conditioning'
  | 'performance'
  | 'danger'
  | 'neutral';

/**
 * Resolve a tone against the active theme. Always returns a 6-digit hex, so the
 * result is safe to pass to `withAlpha`.
 *
 * `neutral` maps to `textDim` rather than a border token precisely because the
 * border tokens are rgba — see above.
 */
export function toneColor(T: ThemeColors, tone: Tone): string {
  switch (tone) {
    case 'primary':      return T.primary;
    case 'gold':         return T.gold;
    case 'grappling':    return T.grappling;
    case 'conditioning': return T.conditioning;
    case 'performance':  return T.performance;
    case 'danger':       return T.danger;
    case 'neutral':      return T.textDim;
  }
}
