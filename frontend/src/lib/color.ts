/** Matches the only format `withAlpha` can decompose. */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * Translucent variant of a solid colour.
 *
 * Only 6-digit `#rrggbb` works: the parse slices fixed offsets, so an `rgba(...)`
 * token in gives `rgba(NaN,NaN,NaN,α)` out, which renders as nothing. The theme
 * has two such tokens — `border` and `borderStrong` — and they are exactly the
 * ones a caller reaches for when tinting an outline. Rather than fail invisibly,
 * bad input degrades to the opaque colour and warns in dev.
 *
 * Prefer `toneColor(T, tone)` (src/components/ui/tone.ts) to pick the input:
 * `Tone` is a closed union of hex-valued tokens, so it cannot reach here wrong.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!HEX6.test(hex)) {
    if (__DEV__) {
      console.warn(`withAlpha: expected #rrggbb, got "${hex}" — returning it unchanged.`);
    }
    return hex;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
