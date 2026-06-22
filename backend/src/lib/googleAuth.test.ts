import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { verifyGoogleIdToken } from './googleAuth';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const KID = 'test-kid';

let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string; alg: string; use: string };

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mintToken(claims: Record<string, unknown>): Promise<string> {
  const header = { alg: 'RS256', kid: KID, typ: 'JWT' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-user-1',
    email: 'lifter@example.com',
    email_verified: true,
    name: 'Test Lifter',
    picture: 'https://example.com/p.png',
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk = { ...jwk, kid: KID, alg: 'RS256', use: 'sig' };

  // Mock Google's JWKS endpoint so signature verification uses our test key.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ keys: [publicJwk] }),
    })),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('verifyGoogleIdToken', () => {
  it('accepts a valid Google ID token and returns the profile', async () => {
    const token = await mintToken(validClaims());
    const payload = await verifyGoogleIdToken(token, CLIENT_ID);
    expect(payload).toMatchObject({
      sub: 'google-user-1',
      email: 'lifter@example.com',
      name: 'Test Lifter',
    });
  });

  it('rejects a token from an untrusted issuer', async () => {
    const token = await mintToken(validClaims({ iss: 'https://evil.example.com' }));
    await expect(verifyGoogleIdToken(token, CLIENT_ID)).rejects.toThrow(/issuer/i);
  });

  it('rejects a token minted for a different audience', async () => {
    const token = await mintToken(validClaims({ aud: 'someone-elses-client-id' }));
    await expect(verifyGoogleIdToken(token, CLIENT_ID)).rejects.toThrow(/audience/i);
  });

  it('rejects an expired token', async () => {
    const token = await mintToken(validClaims({ exp: Math.floor(Date.now() / 1000) - 10 }));
    await expect(verifyGoogleIdToken(token, CLIENT_ID)).rejects.toThrow(/expired/i);
  });

  it('rejects a token whose email is not verified', async () => {
    const token = await mintToken(validClaims({ email_verified: false }));
    await expect(verifyGoogleIdToken(token, CLIENT_ID)).rejects.toThrow(/not verified/i);
  });
});
