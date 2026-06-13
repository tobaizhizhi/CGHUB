import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { RoleButton } from "./ledger/RoleButton";
import {
  CONTRIBUTION_TYPE_OPTIONS,
  type ContributionFormValues,
} from "../lib/contribution-submission";

interface ContributionFormProps {
  onSubmit: (values: ContributionFormValues) => Promise<void>;
  submittingLabel?: string;
}

const contributionSchema = z.object({
  title: z.string().trim().min(1, "贡献标题不能为空。"),
  contributionType: z.enum(CONTRIBUTION_TYPE_OPTIONS),
  description: z.string().trim().min(10, "贡献说明需要至少 10 个字符。"),
  evidenceUrl: z.string().trim().url("请输入有效的证据链接。"),
  impactScale: z.string().trim().min(1, "成果规模不能为空。"),
  occurredAt: z.string().trim().min(1, "请选择发生时间。"),
});

const defaultValues: ContributionFormValues = {
  title: "",
  contributionType: CONTRIBUTION_TYPE_OPTIONS[0],
  description: "",
  evidenceUrl: "",
  impactScale: "",
  occurredAt: "",
};

export function ContributionForm({ onSubmit, submittingLabel = "AI 评分中..." }: ContributionFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues,
  });

  const submit = async (values: ContributionFormValues) => {
    await onSubmit(values);
    reset(defaultValues);
  };

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit(submit)}>
      <div className="grid gap-2">
        <span className="role-kicker">贡献记录</span>
        <h3 className="m-0 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">提交贡献</h3>
        <p className="m-0 text-sm text-[var(--muted)]">提交后，Agent 会根据说明、证据和成果规模判断分数，并生成链上贡献证明。</p>
      </div>
      <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
        <span>贡献标题</span>
        <input
          {...register("title")}
          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
          placeholder="例如：完成分账审核页"
        />
        {errors.title && <span className="text-xs text-[var(--danger)]">{errors.title.message}</span>}
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
          <span>贡献类型</span>
          <select
            {...register("contributionType")}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
          >
            {CONTRIBUTION_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors.contributionType && <span className="text-xs text-[var(--danger)]">{errors.contributionType.message}</span>}
        </label>
        <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
          <span>发生时间</span>
          <input
            {...register("occurredAt")}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
            type="date"
          />
          {errors.occurredAt && <span className="text-xs text-[var(--danger)]">{errors.occurredAt.message}</span>}
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
        <span>成果规模</span>
        <input
          {...register("impactScale")}
          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
          placeholder="例如：1 个 PR、3 篇文章、组织 1 场活动"
        />
        {errors.impactScale && <span className="text-xs text-[var(--danger)]">{errors.impactScale.message}</span>}
      </label>
      <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
        <span>证据链接</span>
        <input
          {...register("evidenceUrl")}
          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
          placeholder="https://github.com/org/repo/pull/123"
        />
        {errors.evidenceUrl && <span className="text-xs text-[var(--danger)]">{errors.evidenceUrl.message}</span>}
      </label>
      <label className="grid gap-1.5 text-sm font-extrabold text-[var(--ink-soft)]">
        <span>贡献说明</span>
        <textarea
          {...register("description")}
          className="min-h-32 resize-y rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none transition focus:border-[var(--role-color)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--role-color)_16%,transparent)]"
          placeholder="写清楚做了什么、为什么有价值，以及评审者如何验证。"
          rows={4}
        />
        {errors.description && <span className="text-xs text-[var(--danger)]">{errors.description.message}</span>}
      </label>
      <RoleButton type="submit" disabled={isSubmitting} fullWidth>
        {isSubmitting ? submittingLabel : "提交贡献"}
      </RoleButton>
    </form>
  );
}
