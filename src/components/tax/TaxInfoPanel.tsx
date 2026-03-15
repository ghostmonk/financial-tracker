import { useState } from "react";
import type { TaxRules } from "../../lib/types";

interface TaxInfoPanelProps {
  open: boolean;
  onClose: () => void;
  taxRules: TaxRules;
}

export default function TaxInfoPanel({
  open,
  onClose,
  taxRules,
}: TaxInfoPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!open) return null;

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Group reminders by context
  const remindersByContext = new Map<string, string[]>();
  for (const r of taxRules.reminders) {
    const list = remindersByContext.get(r.context) || [];
    list.push(r.text);
    remindersByContext.set(r.context, list);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tax Reference</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Info sections */}
          {taxRules.info_sections.map((section) => (
            <div
              key={section.id}
              className="border border-gray-200 dark:border-gray-700 rounded-md"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                {section.title}
                <span className="text-gray-400 text-xs">
                  {collapsed.has(section.id) ? "+" : "-"}
                </span>
              </button>
              {!collapsed.has(section.id) && (
                <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {section.body}
                </div>
              )}
            </div>
          ))}

          {/* Reminders */}
          {remindersByContext.size > 0 && (
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Reminders
              </h3>
              {Array.from(remindersByContext.entries()).map(
                ([context, texts]) => (
                  <div key={context} className="mb-3">
                    <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400 mb-1">
                      {context}
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {texts.map((text, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-600 dark:text-gray-400"
                        >
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
