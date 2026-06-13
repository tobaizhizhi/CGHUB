import { BrainCircuit, ShieldAlert } from "lucide-react";
import type {
  AiScoringTrace,
  ContributionReviewRecord,
  EvidenceSnapshot,
  ScoreBreakdown,
  ScoreDimension,
  SignedContributionResponse,
} from "../lib/agent-api";
import { cn } from "../lib/utils";

type ScoringResult = Pick<
  SignedContributionResponse | ContributionReviewRecord,
  "score" | "scoreBreakdown" | "aiScoring" | "evidenceSnapshot"
> & {
  reason?: string;
  scoreReason?: string;
  reasons?: string[];
  triggeredRules?: string[];
};

interface AiScoringExplanationProps {
  result?: ScoringResult | null;
  className?: string;
}

export function AiScoringExplanation({ result, className }: AiScoringExplanationProps) {
  if (!result) return null;

  const breakdown = result.scoreBreakdown;
  const ai = result.aiScoring;
  const dimensions = normalizedDimensions(breakdown, ai);
  const flags = unique([
    ...(breakdown?.riskFlags ?? []),
    ...(breakdown?.sanityFlags ?? []),
    ...(ai?.riskFlags ?? []),
    ...(result.triggeredRules ?? []),
    ...(breakdown?.needsHumanReview || ai?.needsHumanReview ? ["needs_human_review"] : []),
  ]);
  const summary = ai?.summary || result.reason || result.scoreReason || result.reasons?.join("；");
  const evidence = result.evidenceSnapshot;

  return (
    <div className={cn("mt-4 border-t border-[var(--line)] pt-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="role-kicker inline-flex items-center gap-1.5">
            <BrainCircuit size={14} aria-hidden="true" />
            AI 评分说明
          </span>
          <h4 className="mt-2 font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">
            {result.score} 分 · {sourceLabel(breakdown, ai)}
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right max-sm:w-full max-sm:text-left">
          <MetaPill label="AI 状态" value={aiStatusLabel(ai)} />
          <MetaPill label="置信度" value={formatConfidence(breakdown?.confidence ?? ai?.confidence)} />
        </div>
      </div>

      {summary && (
        <p className="mt-3 rounded-[var(--radius-sm)] border-l-4 border-[color-mix(in_srgb,var(--role-color)_52%,var(--line))] bg-[var(--paper-soft)] px-3 py-2 text-sm text-[var(--ink-soft)]">
          {summary}
        </p>
      )}

      {ai?.reasoning && (
        <div className="mt-3 grid gap-1">
          <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold uppercase text-[var(--muted)]">
            模型说明
          </span>
          <p className="m-0 text-sm text-[var(--ink-soft)]">{ai.reasoning}</p>
        </div>
      )}

      {dimensions.length > 0 && (
        <div className="mt-4 grid gap-2">
          {dimensions.map((dimension) => (
            <DimensionRow key={dimension.key} dimension={dimension} />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {evidence && <EvidenceSummary evidence={evidence} />}
        {flags.length > 0 && (
          <div className="min-w-0">
            <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold uppercase text-[var(--muted)]">
              复核触发
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {flags.map((flag) => (
                <span
                  key={flag}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--warning)_42%,var(--line))] bg-[var(--warning-soft)] px-2 py-1 font-[var(--font-mono)] text-[0.72rem] font-bold text-[#76550d]"
                  title={flag}
                >
                  <ShieldAlert size={12} aria-hidden="true" />
                  <span className="truncate">{flagLabel(flag)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {(ai?.error || ai?.validationErrors?.length) && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-2">
          <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold uppercase text-[var(--muted)]">
            AI 调用备注
          </span>
          {ai.error && <p className="m-0 mt-1 text-sm text-[var(--muted)]">{ai.error}</p>}
          {ai.validationErrors?.length ? (
            <p className="m-0 mt-1 text-sm text-[var(--muted)]">{ai.validationErrors.join("；")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DimensionRow({ dimension }: { dimension: ScoreDimension }) {
  const percent = dimension.maxPoints > 0 ? Math.max(0, Math.min(100, Math.round((dimension.points / dimension.maxPoints) * 100))) : 0;

  return (
    <div className="grid gap-2 border-b border-[var(--line)] pb-2 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block font-[var(--font-mono)] text-sm text-[var(--ink)]">{dimension.label}</strong>
          <p className="m-0 mt-1 text-sm text-[var(--muted)]">{dimension.reason}</p>
        </div>
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--ink)]">
          {dimension.points}/{dimension.maxPoints}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--line)_70%,white)]">
        <div
          className="h-full rounded-full bg-[color-mix(in_srgb,var(--role-color)_72%,var(--success))]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {dimension.evidenceRefs?.length ? (
        <p className="m-0 font-[var(--font-mono)] text-[0.72rem] text-[var(--dim)]">
          证据引用：{dimension.evidenceRefs.join("，")}
        </p>
      ) : null}
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid min-w-[112px] gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2.5 py-2">
      <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold text-[var(--muted)]">{label}</span>
      <strong className="break-words font-[var(--font-mono)] text-xs text-[var(--ink)]">{value}</strong>
    </span>
  );
}

function EvidenceSummary({ evidence }: { evidence: EvidenceSnapshot }) {
  const title = evidence.title || evidence.summary || evidence.sourceHost || evidence.evidenceId;

  return (
    <div className="min-w-0">
      <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold uppercase text-[var(--muted)]">
        证据状态
      </span>
      <div className="mt-2 grid gap-1 text-sm">
        <strong className="break-words font-[var(--font-mono)] text-[var(--ink)]">
          {evidenceStatusLabel(evidence.status)} · {formatConfidence(evidence.confidence)}
        </strong>
        <p className="m-0 break-words text-[var(--muted)]">{title}</p>
        {evidence.warnings.length > 0 && (
          <p className="m-0 break-words font-[var(--font-mono)] text-[0.72rem] text-[var(--dim)]">
            {evidence.warnings.join("；")}
          </p>
        )}
      </div>
    </div>
  );
}

function normalizedDimensions(
  breakdown: ScoreBreakdown | undefined,
  ai: AiScoringTrace | undefined,
): ScoreDimension[] {
  return breakdown?.dimensions?.length ? breakdown.dimensions : ai?.dimensions ?? [];
}

function sourceLabel(breakdown: ScoreBreakdown | undefined, ai: AiScoringTrace | undefined) {
  if (breakdown?.source === "llm") return "LLM 主导评分";
  if (breakdown?.source === "rule_fallback") return "规则兜底评分";
  if (ai?.status === "success") return "LLM 评分";
  return "规则评分";
}

function aiStatusLabel(ai: AiScoringTrace | undefined) {
  if (!ai) return "无 AI 记录";
  if (ai.status === "success") return ai.model ? `成功 ${ai.model}` : "成功";
  if (ai.status === "disabled") return "未启用";
  if (ai.status === "failed") return "失败";
  if (ai.status === "skipped") return "跳过";
  if (ai.status === "schema_invalid") return "格式校验失败";
  return ai.status;
}

function formatConfidence(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function evidenceStatusLabel(status: EvidenceSnapshot["status"]) {
  if (status === "verified") return "已验证";
  if (status === "partial") return "部分验证";
  if (status === "unverified") return "未验证";
  return "不可用";
}

function flagLabel(flag: string) {
  const labels: Record<string, string> = {
    contributor_daily_submission_threshold: "贡献者 24 小时提交过多",
    cumulative_score_threshold: "累计分数过高",
    duplicate_evidence: "重复证据",
    evidence_unavailable_high_score: "弱证据高分",
    evidence_unverified_high_score: "未验证证据高分",
    llm_failed: "LLM 调用失败",
    llm_needs_human_review: "LLM 建议人工复核",
    llm_rule_score_divergence: "LLM 与规则分差较大",
    llm_schema_invalid: "LLM 输出格式异常",
    llm_skipped: "LLM 跳过",
    llm_unavailable: "LLM 不可用",
    low_evidence_confidence: "证据置信度低",
    low_score_confidence: "评分置信度低",
    needs_human_review: "需要人工复核",
    score_threshold: "单条分数超过阈值",
    weak_evidence_high_score: "证据较弱但分数较高",
  };
  return labels[flag] ?? flag.replaceAll("_", " ");
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
