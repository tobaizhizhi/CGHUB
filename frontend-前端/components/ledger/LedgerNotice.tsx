import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface LedgerNoticeProps {
  tone?: "error" | "success" | "warning" | "muted";
  children: ReactNode;
  className?: string;
}

export function LedgerNotice({ tone = "muted", children, className }: LedgerNoticeProps) {
  return (
    <p
      className={cn(
        "rounded-[var(--radius-sm)] border px-3 py-2 font-[var(--font-mono)] text-sm",
        tone === "error" && "border-[var(--danger)] bg-[var(--danger-soft)] text-[#7e2f26]",
        tone === "success" && "border-[var(--success)] bg-[var(--success-soft)] text-[#215537]",
        tone === "warning" && "border-[var(--warning)] bg-[var(--warning-soft)] text-[#76550d]",
        tone === "muted" && "border-[var(--line)] bg-[var(--paper-soft)] text-[var(--muted)]",
        className
      )}
    >
      {children}
    </p>
  );
}
