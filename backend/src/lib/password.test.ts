import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces a self-describing pbkdf2-sha256 hash', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    const parts = hash.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2-sha256');
    expect(Number.parseInt(parts[1], 10)).toBe(100_000);
    // salt and hash are non-empty base64
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('uses a fresh salt each time (distinct hashes for same password)', async () => {
    const a = await hashPassword('samePassword123');
    const b = await hashPassword('samePassword123');
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('s3cretPassword');
    await expect(verifyPassword('s3cretPassword', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('s3cretPassword');
    await expect(verifyPassword('wrongPassword', hash)).resolves.toBe(false);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    await expect(verifyPassword('whatever', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(verifyPassword('whatever', 'md5$1$aa$bb')).resolves.toBe(false);
  });
});
