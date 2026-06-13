import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ActivityDossierHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  stamp?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ActivityDossierHeader({
  eyebrow,
  title,
  description,
  stamp,
  children,
  className,
}: ActivityDossierHeaderProps) {
  return (
    <section
      className={cn(
        "grid items-stretch gap-5 border-b border-[color-mix(in_srgb,var(--role-color)_30%,var(--line))] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--role-soft)_44%,transparent),transparent_64%)] pb-5 md:pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]",
        className
      )}
    >
      <div>
        <span className="inline-flex min-h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--role-color)_35%,var(--line))] bg-[var(--role-soft)] px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
          {eyebrow}
        </span>
        <h2 className="mt-3 max-w-4xl font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)] md:text-4xl">{title}</h2>
        {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-soft)] md:text-base">{description}</p>}
        {children}
      </div>
      {stamp}
    </section>
  );
}

interface LedgerStampProps {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function LedgerStamp({ label, value, footer, className }: LedgerStampProps) {
  return (
    <div
      className={cn(
        "grid content-center gap-2.5 rounded-[var(--radius-md)] border-l-2 border-[var(--role-color)] bg-[rgba(255,253,247,0.58)] p-4",
        className
      )}
    >
      <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">{label}</span>
      <strong className="break-words font-[var(--font-display)] text-3xl leading-tight text-[var(--role-ink)]">
        {value}
      </strong>
      {footer && (
        <span className="w-max max-w-full rounded-full bg-[var(--role-soft)] px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
          {footer}
        </span>
      )}
    </div>
  );
}
