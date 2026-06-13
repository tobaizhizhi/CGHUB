import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { roleButtonClass } from "./RoleButton";
import { StatusSeal } from "./StatusSeal";

interface ActivityMetric {
  label: string;
  value: ReactNode;
}

interface ActivityDossierCardProps {
  status?: string;
  statusLabel: string;
  actionLabel?: string;
  title: string;
  description?: string;
  metrics: ActivityMetric[];
  footer: ReactNode;
  href: string;
  cta: string;
  className?: string;
}

export function ActivityDossierCard({
  status,
  statusLabel,
  actionLabel,
  title,
  description,
  metrics,
  footer,
  href,
  cta,
  className,
}: ActivityDossierCardProps) {
  return (
    <article
      className={cn(
        "group relative grid gap-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.72)] p-4 shadow-none transition before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--role-color)] hover:border-[color-mix(in_srgb,var(--role-color)_45%,var(--line))] hover:bg-[var(--paper)] md:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)_auto] md:items-center md:p-4 md:pl-5",
        className
      )}
    >
      <div className="grid min-w-0 gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusSeal status={status} label={statusLabel} />
          {actionLabel && (
            <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">
              {actionLabel}
            </span>
          )}
        </div>
        <h3 className="m-0 font-[var(--font-display)] text-xl leading-tight text-[var(--ink)] md:text-2xl">{title}</h3>
        {description && <p className="m-0 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{description}</p>}
      </div>

      <div className="grid gap-x-4 gap-y-2 border-y border-[var(--line)] py-3 sm:grid-cols-2 md:border-y-0 md:border-l md:py-0 md:pl-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="grid min-w-0 gap-1">
            <span className="block font-[var(--font-mono)] text-[0.7rem] font-extrabold text-[var(--muted)]">
              {metric.label}
            </span>
            <strong className="block break-words text-sm font-black leading-tight text-[var(--ink)] md:text-base">
              {metric.value}
            </strong>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 md:min-w-36 md:flex-col md:items-stretch md:justify-center">
        <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] md:text-right">{footer}</span>
        <Link className={cn(roleButtonClass({ variant: "primary", size: "sm" }), "max-sm:w-full md:w-full")} href={href}>
          {cta}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
