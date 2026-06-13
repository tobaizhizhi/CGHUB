import Link from "next/link";
import { useRouter } from "next/router";
import { AiScoringExplanation } from "../components/AiScoringExplanation";
import { ContributionForm } from "../components/ContributionForm";
import { DetailGrid } from "../components/ledger/DetailGrid";
import { EmptyState } from "../components/ledger/EmptyState";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { LoadingSkeleton } from "../components/ledger/LoadingSkeleton";
import { PageSection } from "../components/ledger/PageSection";
import { roleButtonClass } from "../components/ledger/RoleButton";
import { StatusSeal } from "../components/ledger/StatusSeal";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useManagedRounds } from "../hooks/useManagedRounds";
import { useSettlementData } from "../hooks/useSettlementData";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../lib/managed-rounds";
import {
  buildPoolEntrypoints,
  managedRoundQuery,
  resolveSelectedManagedRound,
} from "../lib/pool-workspace";
import { formatUsdc } from "../lib/settlement-workspace";
import { cn } from "../lib/utils";

export default function ContributionsPage() {
  const router = useRouter();
  const { rounds, loading, error } = useManagedRounds();
  const selectedRound = resolveSelectedManagedRound(rounds, router.query);
  const entrypoints = buildPoolEntrypoints(rounds);
  const byId = new Map(rounds.map((round) => [round.id, round]));
  const contributionRounds = entrypoints.contributionPoolIds
    .map((id) => byId.get(id))
    .filter(Boolean) as ManagedRound[];

  if (selectedRound) return <SelectedContributionPage round={selectedRound} />;

  return (
    <WorkspaceShell
      title="贡献"
      subtitle="先选择目标资金池，再提交贡献；贡献凭证会绑定到该活动和轮次。"
    >
      {error && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#7e2f26]">
          {error}
        </p>
      )}

      <PageSection
        eyebrow="选择资金池"
        title="可提交贡献的资金池"
        description="没有选中资金池时不会展示提交表单，避免贡献被写入错误轮次。"
        action={
          <Link className={roleButtonClass({ variant: "outline", size: "sm" })} href="/pools">
            查看全部
          </Link>
        }
      >
        <LedgerPanel className="overflow-hidden p-0">
          <div className="hidden min-h-11 grid-cols-[1.7fr_0.8fr_0.8fr_0.6fr_0.6fr_1fr] items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-soft)] px-4 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] lg:grid">
            <span>活动 / 轮次</span>
            <span>状态</span>
            <span>已注资</span>
            <span>总分</span>
            <span>贡献者</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="p-4">
              <LoadingSkeleton rows={3} />
            </div>
          ) : contributionRounds.length === 0 ? (
            <div className="p-4">
              <EmptyState description="暂无可提交贡献的资金池。" />
            </div>
          ) : (
            contributionRounds.map((round) => (
              <div key={round.id} className="grid gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 lg:grid-cols-[1.7fr_0.8fr_0.8fr_0.6fr_0.6fr_1fr] lg:items-center">
                <div className="min-w-0">
                  <strong className="block truncate font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.activityName}</strong>
                  <p className="mt-1 font-[var(--font-mono)] text-xs text-[var(--muted)]">{round.roundName}</p>
                </div>
                <StatusSeal status={round.status} label={ROUND_STATUS_LABELS[round.status]} />
                <MetricInline label="已注资" value={formatUsdc(round.funded)} />
                <MetricInline label="总分" value={round.totalScore} />
                <MetricInline label="贡献者" value={round.contributorCount} />
                <div className="flex flex-wrap gap-2">
                  <Link className={roleButtonClass({ variant: "primary", size: "sm" })} href={{ pathname: "/contributions", query: managedRoundQuery(round) }}>
                    提交贡献
                  </Link>
                  <Link className={roleButtonClass({ variant: "outline", size: "sm" })} href={`/pools/${round.id}`}>
                    详情
                  </Link>
                </div>
              </div>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function SelectedContributionPage({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const { payoutRows, pool, message, scoringResult } = settlement;
  const canSubmit = round.status === "open" || round.status === "funded" || round.status === "scoring";
  const query = managedRoundQuery(round);

  return (
    <WorkspaceShell
      settlement={settlement}
      poolContext={{
        title: round.activityName,
        detail: round.roundName,
        statusLabel: ROUND_STATUS_LABELS[round.status],
        query,
      }}
      title="贡献"
      subtitle={`${round.activityName} / ${round.roundName} 的贡献提交与评分记录。`}
    >
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <LedgerPanel as="article">
          <span className="role-kicker">目标资金池</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.activityName}</h2>
          <p className="mt-2 text-[var(--muted)]">
            {round.roundName} · 链上 ID {round.projectId} / {round.roundId}
          </p>
          {canSubmit ? (
            <ContributionForm onSubmit={settlement.submitContribution} />
          ) : (
            <p className="mt-4 rounded-[var(--radius-sm)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#76550d]">
              该资金池当前状态为 {ROUND_STATUS_LABELS[round.status]}，不能提交新贡献。
            </p>
          )}
          {message && (
            <p className="mt-4 rounded-[var(--radius-sm)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#215537]">
              {message}
            </p>
          )}
          <AiScoringExplanation result={scoringResult} />
        </LedgerPanel>

        <LedgerPanel as="article" variant="primary">
          <span className="role-kicker">池子状态</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{ROUND_STATUS_LABELS[round.status]}</h2>
          <DetailGrid
            items={[
              { label: "当前总分", value: pool.round?.totalScore ?? round.totalScore },
              { label: "已注资", value: formatUsdc(pool.round?.funded ?? round.funded) },
              { label: "贡献者", value: round.contributorCount },
              { label: "链上 ID", value: `${round.projectId} / ${round.roundId}` },
            ]}
          />
        </LedgerPanel>
      </section>

      <PageSection
        eyebrow="已记录贡献者"
        title="贡献评分"
        action={
          <Link className={roleButtonClass({ variant: "outline", size: "sm" })} href={{ pathname: "/activity", query }}>
            查看活动
          </Link>
        }
      >
        <LedgerPanel className="overflow-hidden p-0">
          <div className="hidden min-h-11 grid-cols-4 items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-soft)] px-4 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] md:grid">
            <span>贡献者</span>
            <span>分数</span>
            <span>预计分账</span>
            <span>状态</span>
          </div>
          {payoutRows.length === 0 ? (
            <div className="p-4">
              <EmptyState description="还没有贡献评分。" />
            </div>
          ) : (
            payoutRows.map((row) => (
              <div key={row.address} className="grid gap-2 border-b border-[var(--line)] px-4 py-3 last:border-b-0 md:grid-cols-4 md:items-center">
                <MetricInline label="贡献者" value={row.shortAddress} />
                <MetricInline label="分数" value={row.score} />
                <MetricInline label="预计分账" value={row.estimated} />
                <StatusSeal status={pool.round?.finalized ? "settled" : "open"} label={pool.round?.finalized ? "已纳入分账" : "已记录"} />
              </div>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function MetricInline({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2.5 py-2 md:border-0 md:bg-transparent md:p-0">
      <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold text-[var(--muted)] md:hidden">{label}</span>
      <strong className={cn("break-words font-[var(--font-mono)] text-sm text-[var(--ink)]", label === "贡献者" && "truncate")}>
        {value}
      </strong>
    </span>
  );
}
