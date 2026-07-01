import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'rest_timer_default';

export type RestTimerDefault = number;

type RestTimerContextValue = {
  restTimerDefault: RestTimerDefault;
  setRestTimerDefault: (v: RestTimerDefault) => void;
};

const RestTimerContext = createContext<RestTimerContextValue>({
  restTimerDefault: 120,
  setRestTimerDefault: () => {},
});

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [restTimerDefault, setRestTimerState] = useState<RestTimerDefault>(120);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then((saved) => {
      const n = Number(saved);
      if (Number.isInteger(n) && n > 0 && n <= 600) setRestTimerState(n);
    });
  }, []);

  function setRestTimerDefault(v: RestTimerDefault) {
    setRestTimerState(v);
    SecureStore.setItemAsync(STORE_KEY, String(v));
  }

  return (
    <RestTimerContext.Provider value={{ restTimerDefault, setRestTimerDefault }}>
      {children}
    </RestTimerContext.Provider>
  );
}

export function useRestTimerDefault(): RestTimerContextValue {
  return useContext(RestTimerContext);
}
