import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface LedgerStatCardProps {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  className?: string;
}

export function LedgerStatCard({ label, value, helper, className }: LedgerStatCardProps) {
  return (
    <article
      className={cn(
        "relative min-h-16 border-l-2 border-[var(--role-color)] bg-transparent px-3 py-2",
        className
      )}
    >
      <span className="block font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">{label}</span>
      <strong className="mt-1.5 block break-words font-[var(--font-display)] text-lg leading-tight text-[var(--ink)] md:text-xl">
        {value}
      </strong>
      {helper && <p className="mt-1.5 text-sm text-[var(--muted)]">{helper}</p>}
    </article>
  );
}
