import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface CopyableValueProps {
  value: string;
  label?: string;
  display?: string;
  className?: string;
}

export function CopyableValue({ value, label, display, className }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)]">
        {display ?? value}
      </span>
      <button
        type="button"
        className="inline-flex min-h-7 flex-none items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-2 font-[var(--font-mono)] text-[0.68rem] font-extrabold text-[var(--muted)] transition hover:border-[var(--role-color)] hover:text-[var(--role-ink)]"
        onClick={copy}
        aria-label={label ? `复制${label}` : "复制"}
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        <span>{copied ? "已复制" : "复制"}</span>
      </button>
    </span>
  );
}
