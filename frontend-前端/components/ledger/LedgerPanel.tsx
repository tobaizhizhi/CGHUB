import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface LedgerPanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
  variant?: "default" | "primary" | "soft" | "danger";
  children: ReactNode;
}

export function LedgerPanel({
  as: Component = "section",
  variant = "default",
  className,
  children,
  ...props
}: LedgerPanelProps) {
  return (
    <Component
      className={cn(
        "rounded-[var(--radius-md)] border bg-[rgba(255,253,247,0.78)] p-4 shadow-none md:p-5",
        variant === "default" && "border-[var(--line)]",
        variant === "primary" &&
          "border-[color-mix(in_srgb,var(--role-color)_42%,var(--line))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--role-soft)_46%,transparent),transparent_190px),rgba(255,253,247,0.84)]",
        variant === "soft" && "border-[var(--line)] bg-[var(--paper-soft)]",
        variant === "danger" && "border-[color-mix(in_srgb,var(--danger)_42%,var(--line))] bg-[var(--danger-soft)]",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
