import { createContext, useContext, useEffect, useState } from 'react';
import { readPreference, writePreference } from '../lib/preferences';
import type { WeightUnit } from './units';

const STORE_KEY = 'weight_unit';

type UnitContextValue = {
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
};

const UnitContext = createContext<UnitContextValue>({
  unit: 'kg',
  setUnit: () => {},
});

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>('kg');

  useEffect(() => {
    void readPreference(STORE_KEY).then((saved) => {
      if (saved === 'kg' || saved === 'lbs') setUnitState(saved);
    });
  }, []);

  function setUnit(u: WeightUnit) {
    setUnitState(u);
    void writePreference(STORE_KEY, u);
  }

  return <UnitContext.Provider value={{ unit, setUnit }}>{children}</UnitContext.Provider>;
}

export function useUnit(): UnitContextValue {
  return useContext(UnitContext);
}
