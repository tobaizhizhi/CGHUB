import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { RoleButton } from "./ledger/RoleButton";
import { LedgerNotice } from "./ledger/LedgerNotice";

interface FundRoundFormProps {
  disabled?: boolean;
  onFund: (amount: string) => Promise<unknown>;
  embedded?: boolean;
}

const fundSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "请输入注资金额。")
    .refine((value) => Number(value) > 0, "注资金额必须大于 0。"),
});

type FundFormValues = z.infer<typeof fundSchema>;

export function FundRoundForm({ disabled, onFund, embedded }: FundRoundFormProps) {
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FundFormValues>({
    resolver: zodResolver(fundSchema),
    defaultValues: { amount: "" },
  });

  const handleFund = async ({ amount }: FundFormValues) => {
    setMessage("正在授权并注资到目标资金池...");
    try {
      await onFund(amount);
      setMessage(`注资成功：${amount} USDC 已注入奖池`);
      reset({ amount: "" });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "注资失败");
    }
  };

  const content = (
    <>
      <div className="grid gap-2">
        <span className="role-kicker">资金入账</span>
        <h3 className="m-0 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">项目方注资</h3>
        <p className="m-0 text-sm text-[var(--muted)]">项目方向目标资金池注入 USDC，作为贡献者分账资金来源。</p>
      </div>
      <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" onSubmit={handleSubmit(handleFund)}>
        <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
          <span>注资金额</span>
          <input
            {...register("amount")}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)] disabled:bg-[var(--paper-soft)] disabled:text-[var(--dim)]"
            type="number"
            min="1"
            placeholder="USDC"
            disabled={disabled || isSubmitting}
          />
          {errors.amount && <span className="text-xs text-[var(--danger)]">{errors.amount.message}</span>}
        </label>
        <RoleButton type="submit" disabled={disabled || isSubmitting} fullWidth>
          {isSubmitting ? "注资中..." : "注资到资金池"}
        </RoleButton>
      </form>
      {message && <LedgerNotice tone="success">{message}</LedgerNotice>}
    </>
  );

  if (embedded) return <div className="grid gap-3.5">{content}</div>;

  return <section className="grid gap-3.5 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[var(--shadow-soft)]">{content}</section>;
}
