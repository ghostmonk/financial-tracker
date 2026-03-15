import { thClass, tdClass } from "../../lib/styles";

interface ThProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  title?: string;
  className?: string;
  onClick?: () => void;
}

export function Th({ children, align = "left", title, className = "", onClick }: ThProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`${thClass} ${alignClass} ${className}`} title={title} onClick={onClick}>
      {children}
    </th>
  );
}

interface TdProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  truncate?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export function Td({ children, align = "left", mono, truncate, className = "", title, onClick }: TdProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
  const monoClass = mono ? "font-mono" : "";
  const truncClass = truncate ? "truncate max-w-[12rem]" : "";
  return (
    <td
      className={`${tdClass} ${alignClass} ${monoClass} ${truncClass} ${className}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </td>
  );
}
