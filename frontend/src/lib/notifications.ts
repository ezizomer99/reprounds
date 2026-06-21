import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Show a banner + play sound even when the app is foregrounded (so the rest
// timer "ding" fires while you're looking at the screen too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL = 'default';
let permission: boolean | null = null;

/** Request notification permission once (and set up the Android channel). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (permission !== null) return permission;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (granted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: 'Glima',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }
    permission = granted;
    return granted;
  } catch {
    permission = false;
    return false;
  }
}

/** Schedule a local notification N seconds from now. Returns its id (or null). */
export async function scheduleInSeconds(
  seconds: number,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string | null> {
  if (Platform.OS === 'web' || seconds <= 0) return null;
  if (!(await ensureNotificationPermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: ANDROID_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

/** Schedule a local notification at a specific date. Returns its id (or null). */
export async function scheduleAtDate(
  date: Date,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string | null> {
  if (Platform.OS === 'web' || date.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: ANDROID_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelScheduled(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* no-op */
  }
}

/** Cancel all scheduled notifications carrying `data.kind === kind`. */
export async function cancelScheduledByKind(kind: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content.data as { kind?: string } | null)?.kind === kind)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    /* no-op */
  }
}
