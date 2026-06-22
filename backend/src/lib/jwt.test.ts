import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from './jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

describe('signJwt / verifyJwt', () => {
  it('round-trips a payload through sign then verify', async () => {
    const token = await signJwt({ sub: 'user-123' }, SECRET, 3600);
    const payload = await verifyJwt(token, SECRET);
    expect(payload.sub).toBe('user-123');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt({ sub: 'user-123' }, SECRET, 3600);
    await expect(verifyJwt(token, 'a-different-secret-also-32-chars-xx')).rejects.toThrow(
      /signature/i,
    );
  });

  it('rejects a token whose payload has been tampered with', async () => {
    const token = await signJwt({ sub: 'user-123' }, SECRET, 3600);
    const [header, , signature] = token.split('.');
    const forgedBody = btoa(JSON.stringify({ sub: 'attacker', iat: 0, exp: 9999999999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const forged = `${header}.${forgedBody}.${signature}`;
    await expect(verifyJwt(forged, SECRET)).rejects.toThrow(/signature/i);
  });

  it('rejects an expired token', async () => {
    const token = await signJwt({ sub: 'user-123' }, SECRET, -10); // already expired
    await expect(verifyJwt(token, SECRET)).rejects.toThrow(/expired/i);
  });

  it('rejects a structurally malformed token', async () => {
    await expect(verifyJwt('not-a-jwt', SECRET)).rejects.toThrow(/structure/i);
  });
});
