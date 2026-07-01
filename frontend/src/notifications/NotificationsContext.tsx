import { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ensureNotificationPermission } from '../lib/notifications';

const STORE_KEY = 'notifications_enabled';

type NotificationsContextValue = {
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue>({
  notificationsEnabled: false,
  setNotificationsEnabled: async () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notificationsEnabled, setNotificationsState] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then(async (saved) => {
      if (saved !== 'true') return;
      // Verify OS permission hasn't been revoked since we last stored 'true'.
      const stillGranted = await ensureNotificationPermission();
      if (stillGranted) {
        setNotificationsState(true);
      } else {
        SecureStore.setItemAsync(STORE_KEY, 'false');
      }
    });
  }, []);

  async function setNotificationsEnabled(enabled: boolean) {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Permission required',
          'Please enable notifications in your device settings.',
        );
        return;
      }
    }
    setNotificationsState(enabled);
    SecureStore.setItemAsync(STORE_KEY, enabled ? 'true' : 'false');
  }

  return (
    <NotificationsContext.Provider value={{ notificationsEnabled, setNotificationsEnabled }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsEnabled(): NotificationsContextValue {
  return useContext(NotificationsContext);
}
