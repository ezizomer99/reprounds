// Password hashing for credential (email/password) accounts.
//
// Uses PBKDF2-HMAC-SHA-256 via the native WebCrypto API — no third-party crypto
// dependency, and available on the Cloudflare Workers runtime out of the box.
//
// Why PBKDF2 (and not scrypt/argon2)?
//   Cloudflare's workerd runtime caps PBKDF2 at 100,000 iterations (higher
//   values throw). OWASP's 2023 baseline for PBKDF2-SHA-256 is 600,000
//   iterations, which we cannot reach on this platform — 100,000 is the
//   platform maximum and a reasonable floor. Argon2/scrypt would need a WASM
//   dependency and more CPU; PBKDF2 via SubtleCrypto is native, fast (a single
//   hash is single-digit milliseconds — comfortably inside the Worker CPU
//   budget, which is 30s on the paid plan), and easy to upgrade later.
//
// Hashes are stored in a self-describing format so the algorithm/params can be
// rotated without a schema change and old hashes keep verifying:
//
//     pbkdf2-sha256$<iterations>$<base64Salt>$<base64Hash>
//
// On successful login the caller can opt to re-hash if the stored params are
// weaker than the current defaults (not implemented yet — see needsRehash).

const ALGO = 'pbkdf2-sha256';
// workerd caps PBKDF2 iterations at 100,000; use the maximum the platform allows.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: BufferSource, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Hash a plaintext password into the self-describing storage format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGO}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/** Constant-time comparison of two equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verify a plaintext password against a stored self-describing hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [algo, iterStr, saltB64, hashB64] = parts;
  if (algo !== ALGO) return false;

  const iterations = Number.parseInt(iterStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let salt: Uint8Array<ArrayBuffer>;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    salt = base64ToBytes(saltB64);
    expected = base64ToBytes(hashB64);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
