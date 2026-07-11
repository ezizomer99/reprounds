// Single source of truth for complimentary ("comped") Pro accounts. This used to
// be duplicated in two client files (useProGate.ts + subscription.tsx), which
// shipped the owner's allowlist in the app bundle and drifted out of sync. Keeping
// it server-side means the list stays private and is computed once, in toUserShape.
//
// Note: this only covers comped accounts. Genuine RevenueCat Pro entitlement is
// still verified client-side; server-side purchase verification is separate,
// owner-gated infra (see PROGRESS.md / feat/revenuecat-identify).
const COMP_EMAILS = new Set(
  ['ezizomer1999@gmail.com', 'reprounds.test@gmail.com', 'auradegraaf@gmail.com'].map((e) =>
    e.toLowerCase(),
  ),
);

export function isCompedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return COMP_EMAILS.has(email.toLowerCase());
}
