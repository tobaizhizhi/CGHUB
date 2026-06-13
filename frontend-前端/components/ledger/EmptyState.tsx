import { FileSearch } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  title?: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title = "暂无记录", description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[rgba(255,253,247,0.68)] p-4 text-[var(--muted)]",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--role-soft)] text-[var(--role-ink)]">
          <FileSearch size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 font-[var(--font-display)] text-lg leading-tight text-[var(--ink)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
