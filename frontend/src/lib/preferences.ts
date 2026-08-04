import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Small persistence layer for user preferences — the display unit, whether
 * notifications are on, and so forth.
 *
 * These used to live in `expo-secure-store`. Nothing here is a secret: the rule
 * is that SecureStore holds the session JWT and nothing else. Keeping
 * preferences there put a Keychain round-trip on the cold-start path for every
 * one of them and blurred what "secure" was protecting.
 *
 * Moving the key is not enough on its own, though. A user who already chose lbs
 * has that choice sitting in SecureStore, and a plain switch to AsyncStorage
 * would silently reset them to kg on the next app launch. So the read falls
 * back to the old location once, copies what it finds forward, and clears it.
 */

export async function readPreference(key: string): Promise<string | null> {
  const current = await AsyncStorage.getItem(key);
  if (current !== null) return current;

  // Not migrated yet — look in the old location exactly once.
  let legacy: string | null = null;
  try {
    legacy = await SecureStore.getItemAsync(key);
  } catch {
    // SecureStore is unavailable on some platforms; treat as "nothing to migrate".
    return null;
  }
  if (legacy === null) return null;

  try {
    await AsyncStorage.setItem(key, legacy);
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Migration is best-effort: returning the value still honours the user's
    // choice for this launch, and the next one retries.
  }
  return legacy;
}

export async function writePreference(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}
