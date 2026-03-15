import { useEffect, useRef, useCallback } from "react";
import { modalOverlayClass, modalCardClass } from "../../lib/styles";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}

const widthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, width = "md" }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-focus first focusable element when modal opens
  useEffect(() => {
    if (!open || !cardRef.current) return;
    const timer = setTimeout(() => {
      const focusable = cardRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable && focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Trap focus within modal and handle Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className={modalOverlayClass} onClick={(e) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    }}>
      <div ref={cardRef} data-testid="modal" className={`${modalCardClass} ${widthMap[width]}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            tabIndex={-1}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
