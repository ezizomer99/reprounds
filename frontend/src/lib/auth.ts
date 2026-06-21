import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'session_token';
const DEVICE_ID_KEY = 'device_id';
const GUEST_USER_ID_KEY = 'guest_user_id';

// ── Session token ──────────────────────────────────────────────────────────

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

// ── Guest session ──────────────────────────────────────────────────────────

// crypto.getRandomValues is natively available in Hermes (React Native's JS engine)
// and calls the OS CSPRNG — cryptographically secure without a native module.
function randomUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
  return newId;
}

export async function getGuestUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(GUEST_USER_ID_KEY);
}

export async function setGuestUserId(id: string): Promise<void> {
  await SecureStore.setItemAsync(GUEST_USER_ID_KEY, id);
}

export async function clearGuestData(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(DEVICE_ID_KEY),
    SecureStore.deleteItemAsync(GUEST_USER_ID_KEY),
  ]);
}
