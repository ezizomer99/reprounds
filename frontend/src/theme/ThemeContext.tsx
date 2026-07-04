import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, darkTheme, lightTheme } from './colors';

export type ThemeMode = 'dark' | 'light' | 'system';

const STORE_KEY = 'theme_mode';

type ThemeContextValue = {
  T: ThemeColors;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  T: darkTheme,
  mode: 'system',
  setMode: () => {},
  isDark: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load persisted preference once on mount
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        setModeState(saved);
      }
    });
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    void AsyncStorage.setItem(STORE_KEY, m);
  }

  const resolvedDark =
    mode === 'system' ? systemScheme !== 'light' : mode === 'dark';

  const T = resolvedDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ T, mode, setMode, isDark: resolvedDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
