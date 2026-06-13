const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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

async function importKey(secret: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyBytes, ALGORITHM, false, ['sign', 'verify']);
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function signJwt(
  payload: { sub: string },
  secret: string,
  expirySeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    sub: payload.sub,
    iat: now,
    exp: now + expirySeconds,
  };

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const signingInput = `${header}.${body}`;

  const key = await importKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    ALGORITHM,
    key,
    new TextEncoder().encode(signingInput),
  );

  const signature = base64UrlEncode(signatureBuffer);
  return `${signingInput}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token structure');

  const [header, body, signature] = parts;
  const signingInput = `${header}.${body}`;

  const key = await importKey(secret);
  const signatureBuffer = base64UrlDecode(signature);
  const valid = await crypto.subtle.verify(
    ALGORITHM,
    key,
    signatureBuffer,
    new TextEncoder().encode(signingInput),
  );
  if (!valid) throw new Error('Invalid token signature');

  const payload: JwtPayload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(body)),
  );

  if (Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired');

  return payload;
}
