import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { RoleButton } from "./RoleButton";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  busy,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(23,33,28,0.38)] p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--danger)_42%,var(--line))] bg-[var(--paper)] p-5 shadow-[0_24px_70px_rgba(23,33,28,0.22)]"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertTriangle size={20} aria-hidden />
          </span>
          <button
            type="button"
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-2 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]"
            onClick={() => onOpenChange(false)}
            aria-label="关闭确认弹窗"
            disabled={busy}
          >
            <X size={15} aria-hidden />
            <span>关闭</span>
          </button>
        </div>
        <h2 id="confirm-dialog-title" className="mt-4 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">
          {title}
        </h2>
        <div className="mt-3 text-sm text-[var(--muted)]">{description}</div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <RoleButton type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} fullWidth>
            {cancelLabel}
          </RoleButton>
          <RoleButton type="button" variant="danger" onClick={onConfirm} disabled={busy} fullWidth>
            {busy ? "处理中..." : confirmLabel}
          </RoleButton>
        </div>
      </section>
    </div>
  );
}
