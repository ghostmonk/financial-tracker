import { useState, useEffect, useCallback } from "react";

interface UseKeyboardNavOptions {
  itemCount: number;
  enabled?: boolean;
  onEnter?: (index: number) => void;
  onRight?: (index: number) => void;
  onLeft?: (index: number) => void;
  onEscape?: () => void;
  onKeyPress?: (key: string, shiftKey: boolean, focusedIndex: number) => void;
  onSelectionChange?: (selectedIndices: Set<number>) => void;
  multiSelect?: boolean;
}

interface UseKeyboardNavResult {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  selectedIndices: Set<number>;
  setSelectedIndices: (indices: Set<number>) => void;
}

export function useKeyboardNav({
  itemCount,
  enabled = true,
  onEnter,
  onRight,
  onLeft,
  onEscape,
  onKeyPress,
  onSelectionChange,
  multiSelect = false,
}: UseKeyboardNavOptions): UseKeyboardNavResult {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [sidebarActive, setSidebarActive] = useState(false);

  useEffect(() => {
    function handleSidebarFocus(e: Event) {
      const active = (e as CustomEvent).detail;
      setSidebarActive(active);
      if (active) {
        setFocusedIndex(-1);
      }
    }
    window.addEventListener("sidebar-focus-changed", handleSidebarFocus);
    return () =>
      window.removeEventListener("sidebar-focus-changed", handleSidebarFocus);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || sidebarActive || itemCount === 0) return;

      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex =
            focusedIndex < itemCount - 1 ? focusedIndex + 1 : focusedIndex;

          if (multiSelect && e.shiftKey) {
            const next = new Set(selectedIndices);
            if (selectionAnchor === null) {
              setSelectionAnchor(focusedIndex >= 0 ? focusedIndex : 0);
            }
            if (next.has(nextIndex)) {
              next.delete(focusedIndex);
            } else {
              next.add(nextIndex);
              if (focusedIndex >= 0) next.add(focusedIndex);
            }
            setSelectedIndices(next);
            onSelectionChange?.(next);
          }

          setFocusedIndex(nextIndex);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex =
            focusedIndex > 0
              ? focusedIndex - 1
              : focusedIndex === -1
                ? 0
                : focusedIndex;

          if (multiSelect && e.shiftKey) {
            const next = new Set(selectedIndices);
            if (selectionAnchor === null) {
              setSelectionAnchor(focusedIndex >= 0 ? focusedIndex : 0);
            }
            if (next.has(prevIndex)) {
              next.delete(focusedIndex);
            } else {
              next.add(prevIndex);
              if (focusedIndex >= 0) next.add(focusedIndex);
            }
            setSelectedIndices(next);
            onSelectionChange?.(next);
          }

          setFocusedIndex(prevIndex);
          break;
        }
        case "Enter":
          if (focusedIndex >= 0) {
            e.preventDefault();
            onEnter?.(focusedIndex);
          }
          break;
        case "ArrowRight":
          if (focusedIndex >= 0) {
            e.preventDefault();
            onRight?.(focusedIndex);
          }
          break;
        case "ArrowLeft":
          if (focusedIndex >= 0) {
            e.preventDefault();
            onLeft?.(focusedIndex);
          }
          break;
        case "Escape":
          e.preventDefault();
          onEscape?.();
          break;
        default: {
          if (focusedIndex >= 0) {
            const isLetter = /^[a-zA-Z]$/.test(e.key);
            const isBackspace = e.key === "Backspace";
            if (isLetter || isBackspace) {
              e.preventDefault();
              onKeyPress?.(e.key, e.shiftKey, focusedIndex);
            }
          }
          break;
        }
      }
    },
    [
      enabled,
      sidebarActive,
      itemCount,
      focusedIndex,
      selectedIndices,
      selectionAnchor,
      multiSelect,
      onEnter,
      onRight,
      onLeft,
      onEscape,
      onKeyPress,
      onSelectionChange,
    ],
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  useEffect(() => {
    if (focusedIndex >= itemCount) {
      setFocusedIndex(itemCount > 0 ? itemCount - 1 : -1);
    }
  }, [itemCount, focusedIndex]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    const el = document.querySelector(`[data-nav-index="${focusedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex]);

  return { focusedIndex, setFocusedIndex, selectedIndices, setSelectedIndices };
}
