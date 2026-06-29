import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

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

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = Crypto.randomUUID();
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
