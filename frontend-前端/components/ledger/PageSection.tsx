import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PageSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  count?: number | string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function PageSection({ eyebrow = "活动", title, description, count, action, children, className, id }: PageSectionProps) {
  return (
    <section id={id} className={cn("mt-9", className)}>
      <div className="mb-4 flex items-end justify-between gap-5 border-l-2 border-[var(--role-color)] pl-3 max-sm:flex-col max-sm:items-stretch">
        <div>
          <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
            {eyebrow}
          </span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)] md:text-3xl">{title}</h2>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <strong className="min-w-16 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgba(255,253,247,0.72)] px-2.5 py-2 text-center font-[var(--font-mono)] text-sm text-[var(--role-ink)]">
              {count} 个
            </strong>
          )}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}
