import { describe, it, expect } from 'vitest';
import { isCompedEmail } from './entitlements';

describe('isCompedEmail', () => {
  it('returns true for an allowlisted email (case-insensitive)', () => {
    expect(isCompedEmail('ezizomer1999@gmail.com')).toBe(true);
    expect(isCompedEmail('EziZomer1999@Gmail.com')).toBe(true);
  });

  it('returns false for a non-allowlisted email', () => {
    expect(isCompedEmail('someone@example.com')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isCompedEmail(null)).toBe(false);
    expect(isCompedEmail(undefined)).toBe(false);
    expect(isCompedEmail('')).toBe(false);
  });
});
