import { useState, useRef, useEffect } from "react";
import type { TaxWorkspaceItem } from "../../lib/types";
import { updateTaxLineItem, updateTransactionReceipt } from "../../lib/tauri";

interface ReceiptCellProps {
  item: TaxWorkspaceItem;
  fiscalYear: number;
  onUpdated: () => void;
}

export default function ReceiptCell({
  item,
  fiscalYear,
  onUpdated,
}: ReceiptCellProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const receiptPath = `receipts/${fiscalYear}/${item.id}_${file.name}`;

    try {
      if (item.source === "tax_line_item") {
        await updateTaxLineItem(item.id, {
          has_receipt: true,
          receipt_path: receiptPath,
        });
      } else {
        await updateTransactionReceipt(item.id, true, receiptPath);
      }
      onUpdated();
    } catch (err) {
      console.error("Failed to attach receipt:", err);
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleRemoveReceipt() {
    setShowMenu(false);
    try {
      if (item.source === "tax_line_item") {
        await updateTaxLineItem(item.id, {
          has_receipt: false,
          receipt_path: null,
        });
      } else {
        await updateTransactionReceipt(item.id, false, null);
      }
      onUpdated();
    } catch (err) {
      console.error("Failed to remove receipt:", err);
    }
  }

  if (item.has_receipt) {
    return (
      <div className="relative inline-block" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowMenu((prev) => !prev)}
          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 cursor-pointer"
          title="Receipt attached"
        >
          &#10003;
        </button>
        {showMenu && (
          <div className="absolute z-30 right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
            {item.receipt_path && (
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                View Receipt
              </button>
            )}
            <button
              type="button"
              onClick={handleRemoveReceipt}
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Remove Receipt
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-pointer"
        title="Attach receipt"
      >
        &#9744;
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileSelected}
        className="hidden"
      />
    </>
  );
}
