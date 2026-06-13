import { CheckCircle2, CircleDashed, Lock, TimerReset } from "lucide-react";
import type { RoundDisplayStatus } from "../../lib/managed-rounds";
import { cn } from "../../lib/utils";

interface StatusSealProps {
  status?: RoundDisplayStatus | string;
  label: string;
  className?: string;
}

export function StatusSeal({ status, label, className }: StatusSealProps) {
  const Icon = iconForStatus(status);
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1",
        "font-[var(--font-mono)] text-xs font-extrabold leading-none",
        statusTone(status),
        className
      )}
    >
      <Icon aria-hidden size={13} strokeWidth={2.4} />
      {label}
    </span>
  );
}

function iconForStatus(status?: RoundDisplayStatus | string) {
  if (status === "finalized" || status === "closed" || status === "settled" || status === "archived") return Lock;
  if (status === "draft") return CircleDashed;
  if (status === "scoring") return TimerReset;
  return CheckCircle2;
}

function statusTone(status?: RoundDisplayStatus | string) {
  if (status === "finalized" || status === "closed" || status === "archived") {
    return "border-[var(--danger)] bg-[var(--danger-soft)] text-[#7e2f26]";
  }
  if (status === "draft" || status === "scoring") {
    return "border-[var(--warning)] bg-[var(--warning-soft)] text-[#76550d]";
  }
  if (status === "settled") {
    return "border-[var(--success)] bg-[var(--success-soft)] text-[#215537]";
  }
  return "border-[var(--role-color)] bg-[var(--role-soft)] text-[var(--role-ink)]";
}
