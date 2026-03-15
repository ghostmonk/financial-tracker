import { useEffect, useRef } from "react";
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

export default function Modal({ open, onClose, title, children, width = "md" }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={modalOverlayClass} onClick={(e) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    }}>
      <div ref={cardRef} className={`${modalCardClass} ${widthMap[width]}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
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
