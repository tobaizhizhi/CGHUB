import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const roleButtonClass = cva(
  [
    "ledger-button inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] border px-3.5 py-2",
    "text-sm font-extrabold no-underline transition",
    "hover:-translate-y-0.5 hover:no-underline",
    "disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--paper-soft)] disabled:text-[var(--dim)]",
  ],
  {
    variants: {
      variant: {
        primary: "ledger-button-primary border-[var(--role-color)] bg-[var(--role-color)] text-white",
        secondary:
          "ledger-button-secondary border-[color-mix(in_srgb,var(--role-color)_34%,var(--line))] bg-[var(--role-soft)] text-[var(--role-ink)]",
        outline: "ledger-button-outline border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)]",
        danger: "ledger-button-danger border-[var(--danger)] bg-[var(--danger)] text-white",
        ghost: "ledger-button-ghost border-transparent bg-transparent text-[var(--role-ink)] hover:bg-[var(--role-soft)]",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5 text-xs",
        md: "min-h-10 px-3.5 py-2 text-sm",
        lg: "min-h-11 px-4 py-2.5 text-base",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

interface RoleButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof roleButtonClass> {
  children: ReactNode;
}

export function RoleButton({ className, variant, size, fullWidth, children, ...props }: RoleButtonProps) {
  return (
    <button className={cn(roleButtonClass({ variant, size, fullWidth }), className)} {...props}>
      {children}
    </button>
  );
}
