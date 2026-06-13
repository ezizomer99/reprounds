const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

interface JwkKey {
  kid: string;
  n: string;
  e: string;
  alg: string;
  use: string;
}

interface JwksCache {
  keys: JwkKey[];
  fetchedAt: number;
}

let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

function base64UrlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function fetchJwks(forceRefresh = false): Promise<JwkKey[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`Failed to fetch JWKS: ${response.status}`);

  const { keys } = await response.json<{ keys: JwkKey[] }>();
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

async function importRsaPublicKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function verifyWithJwks(
  signingInput: string,
  signatureBuffer: ArrayBuffer,
  kid: string,
  forceRefresh = false,
): Promise<boolean> {
  const keys = await fetchJwks(forceRefresh);
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    if (!forceRefresh) {
      return verifyWithJwks(signingInput, signatureBuffer, kid, true);
    }
    throw new Error(`No JWK found for kid: ${kid}`);
  }

  const cryptoKey = await importRsaPublicKey(jwk);
  return crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    signatureBuffer,
    new TextEncoder().encode(signingInput),
  );
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleTokenPayload> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');

  const [rawHeader, rawPayload, rawSignature] = parts;

  const header: { kid: string; alg: string } = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(rawHeader)),
  );

  if (header.alg !== 'RS256') throw new Error('Unexpected algorithm: ' + header.alg);

  const payload: Record<string, unknown> = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(rawPayload)),
  );

  if (!VALID_ISSUERS.includes(payload['iss'] as string)) {
    throw new Error('Invalid issuer');
  }

  const aud = payload['aud'];
  const audList = Array.isArray(aud) ? aud : [aud];
  if (!audList.includes(clientId)) {
    throw new Error('Invalid audience');
  }

  if (typeof payload['exp'] !== 'number' || Math.floor(Date.now() / 1000) > payload['exp']) {
    throw new Error('Token expired');
  }

  if (payload['email_verified'] !== true) {
    throw new Error('Email not verified');
  }

  const signatureBuffer = base64UrlDecode(rawSignature);
  const valid = await verifyWithJwks(`${rawHeader}.${rawPayload}`, signatureBuffer, header.kid);
  if (!valid) throw new Error('Invalid token signature');

  return {
    sub: payload['sub'] as string,
    email: payload['email'] as string,
    name: (payload['name'] as string) ?? '',
    picture: (payload['picture'] as string) ?? '',
  };
}
