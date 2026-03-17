import { useState, useCallback, useEffect } from "react";
import { updateTransactionsCategory, deleteCategorizationRule } from "./tauri";

export interface UndoEntry {
  transactionIds: string[];
  previousCategoryIds: (string | null)[];
  previousCategorizedByRule: boolean[];
  ruleId: string | null;
  label: string;
}

const MAX_UNDO_DEPTH = 50;

export function useUndoStack(onUndoComplete?: () => void) {
  const [stack, setStack] = useState<UndoEntry[]>([]);

  const push = useCallback((entry: UndoEntry) => {
    setStack((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_UNDO_DEPTH) {
        return next.slice(next.length - MAX_UNDO_DEPTH);
      }
      return next;
    });
  }, []);

  const undo = useCallback(async () => {
    const entry = stack[stack.length - 1];
    if (!entry) return;

    const byCategoryId = new Map<string | null, string[]>();
    for (let i = 0; i < entry.transactionIds.length; i++) {
      const catId = entry.previousCategoryIds[i];
      const group = byCategoryId.get(catId) ?? [];
      group.push(entry.transactionIds[i]);
      byCategoryId.set(catId, group);
    }

    for (const [categoryId, txIds] of byCategoryId) {
      await updateTransactionsCategory(txIds, categoryId);
    }

    if (entry.ruleId) {
      await deleteCategorizationRule(entry.ruleId);
    }

    setStack((prev) => prev.slice(0, -1));
    window.dispatchEvent(new Event("categorization-changed"));
    onUndoComplete?.();
  }, [stack, onUndoComplete]);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (stack.length > 0) {
          e.preventDefault();
          undo();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [stack, undo]);

  return { push, undo, clear, canUndo: stack.length > 0, depth: stack.length };
}
