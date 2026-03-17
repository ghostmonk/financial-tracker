import { useState, useCallback } from "react";

/**
 * A Set<string> backed by localStorage. Survives page navigation and restarts.
 */
export function usePersistedSet(storageKey: string): [Set<string>, (next: Set<string>) => void, (id: string) => void, (id: string) => void] {
  const [value, setValue] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      // ignore
    }
    return new Set();
  });

  const persist = useCallback(
    (next: Set<string>) => {
      setValue(next);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [value, persist],
  );

  const add = useCallback(
    (id: string) => {
      const next = new Set(value);
      next.add(id);
      persist(next);
    },
    [value, persist],
  );

  return [value, persist, toggle, add];
}
