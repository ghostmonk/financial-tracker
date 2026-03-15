import { useState, useEffect, useCallback, useMemo } from "react";
import { listCategories } from "./tauri";
import type { Category } from "./types";

export function useFetchData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  initialValue: T,
): { data: T; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(typeof err === "string" ? err : "An error occurred");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}

export function useCategoryMap() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    listCategories().then(setCategories).catch(console.error);
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const parentMap = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const children = m.get(c.parent_id) || [];
        children.push(c);
        m.set(c.parent_id, children);
      }
    }
    return m;
  }, [categories]);

  return { categories, categoryMap, parentMap };
}

export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, handler]);
}
