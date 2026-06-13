import type { ReactNode } from "react";
import { CopyableValue } from "./CopyableValue";
import { cn } from "../../lib/utils";

export interface DetailGridItem {
  label: string;
  value: ReactNode;
  copyValue?: string;
  display?: string;
}

interface DetailGridProps {
  items: DetailGridItem[];
  className?: string;
}

export function DetailGrid({ items, className }: DetailGridProps) {
  return (
    <div className={cn("mt-4 grid gap-0", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid gap-2 border-b border-[var(--line)] py-2.5 md:grid-cols-[minmax(120px,0.42fr)_minmax(0,1fr)]"
        >
          <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">{item.label}</span>
          <strong className="min-w-0 break-words font-[var(--font-mono)] text-sm leading-relaxed text-[var(--ink)]">
            {item.copyValue ? (
              <CopyableValue value={item.copyValue} display={item.display ?? String(item.value)} label={item.label} />
            ) : (
              item.value
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}
