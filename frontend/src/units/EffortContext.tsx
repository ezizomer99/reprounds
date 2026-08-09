import { createContext, useContext, useEffect, useState } from 'react';
import { readPreference, writePreference } from '../lib/preferences';

const STORE_KEY = 'effort_metric';

/**
 * How the lifter records how hard a set was.
 *
 * `strength_sets` has carried both an `rpe` and an `rir` column since the first
 * migration, and the API validates both — but only RPE ever had an input, so
 * `rir` was dead storage. They are two ways of saying the same thing (RIR ≈ 10 −
 * RPE), and lifters are firmly in one camp or the other, so this is a
 * preference rather than a second column crammed into the set row: the row has
 * a weight, a reps and an intensity cell, and on a phone there is no room for a
 * fourth without squeezing the two that get typed every set.
 */
export type EffortMetric = 'rpe' | 'rir';

function isEffortMetric(value: string | null): value is EffortMetric {
  return value === 'rpe' || value === 'rir';
}

type EffortContextValue = {
  metric: EffortMetric;
  setMetric: (m: EffortMetric) => void;
};

const EffortContext = createContext<EffortContextValue>({
  metric: 'rpe',
  setMetric: () => {},
});

export function EffortProvider({ children }: { children: React.ReactNode }) {
  const [metric, setMetricState] = useState<EffortMetric>('rpe');

  useEffect(() => {
    void readPreference(STORE_KEY).then((saved) => {
      if (isEffortMetric(saved)) setMetricState(saved);
    });
  }, []);

  function setMetric(m: EffortMetric) {
    setMetricState(m);
    void writePreference(STORE_KEY, m);
  }

  return <EffortContext.Provider value={{ metric, setMetric }}>{children}</EffortContext.Provider>;
}

export function useEffortMetric(): EffortContextValue {
  return useContext(EffortContext);
}
