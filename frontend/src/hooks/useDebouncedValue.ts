import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * no changes. Useful for search inputs so query keys don't change on every
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
