import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/router";
import { ContributorShell } from "../../../components/ContributorShell";
import { AiScoringExplanation } from "../../../components/AiScoringExplanation";
import { ContributionForm } from "../../../components/ContributionForm";
import { ActivityDossierHeader, LedgerStamp } from "../../../components/ledger/ActivityDossierHeader";
import { DetailGrid, type DetailGridItem } from "../../../components/ledger/DetailGrid";
import { EmptyState } from "../../../components/ledger/EmptyState";
import { LedgerNotice } from "../../../components/ledger/LedgerNotice";
import { LedgerPanel } from "../../../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../../components/ledger/LoadingSkeleton";
import { RoleButton } from "../../../components/ledger/RoleButton";
import { useManagedRound } from "../../../hooks/useManagedRound";
import { useSettlementData } from "../../../hooks/useSettlementData";
import { useWallet } from "../../../hooks/useWallet";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../../../lib/managed-rounds";
import { formatUsdc, shortAddress } from "../../../lib/settlement-workspace";

export default function ContributorActivityDetailPage() {
  const router = useRouter();
  const id = useMemo(() => firstValue(router.query.id), [router.query.id]);
  const { round, loading, error } = useManagedRound(router.isReady ? id : undefined);
  const wallet = useWallet();

  if (round) return <ContributorActivityDetail round={round} />;

  return (
    <ContributorShell wallet={wallet} title="活动详情" subtitle="正在读取活动信息。">
      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={2} />}
      {!loading && !error && <EmptyState description="没有找到这个活动。" />}
    </ContributorShell>
  );
}

function ContributorActivityDetail({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const canSubmit = round.status === "open" || round.status === "funded" || round.status === "scoring";
  const claimCapability = settlement.capabilities.claimOwnPayout;
  const myPayout = settlement.myPayout;
  const detailItems: DetailGridItem[] = [
    { label: "链上 ID", value: `${round.projectId} / ${round.roundId}` },
    { label: "项目方", value: shortAddress(round.ownerAddress), copyValue: round.ownerAddress, display: shortAddress(round.ownerAddress) },
    { label: "代币", value: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}`, copyValue: round.tokenAddress, display: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}` },
    ...(round.endsAt ? [{ label: "计划结束", value: formatDateTime(round.endsAt) }] : []),
    ...(round.endedAt ? [{ label: "实际结束", value: formatDateTime(round.endedAt) }] : []),
  ];

  return (
    <ContributorShell
      wallet={settlement.wallet}
      title={round.activityName}
      subtitle={`${round.roundName} 的资金池、我的分数和领取状态。`}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 max-sm:flex-col max-sm:items-stretch">
        <Link href="/contributor">返回贡献者活动</Link>
        <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">{ROUND_STATUS_LABELS[round.status]}</span>
      </div>

      <ActivityDossierHeader
        eyebrow="贡献收益档案"
        title={round.activityName}
        description={round.activityDescription || `${round.roundName} 的贡献提交、分数和收益记录。`}
        stamp={<LedgerStamp label="我的待领取" value={myPayout?.pending ?? "0 USDC"} footer={ROUND_STATUS_LABELS[round.status]} />}
      />

      <section className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="项目池资金" value={formatUsdc(settlement.pool.round?.funded ?? round.funded)} />
        <LedgerStatCard label="我的分数" value={settlement.pool.score} />
        <LedgerStatCard label="预计收益" value={myPayout?.estimated ?? "0 USDC"} />
        <LedgerStatCard label="待领取" value={myPayout?.pending ?? "0 USDC"} />
        <LedgerStatCard label="已领取" value={myPayout?.claimed ?? "0 USDC"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.7fr)]">
        <LedgerPanel as="article" variant="primary" className="lg:row-span-2">
          <span className="role-kicker">我的贡献</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">
            {canSubmit ? "提交贡献" : "活动不可提交"}
          </h2>
          <p>
            当前活动状态为 {ROUND_STATUS_LABELS[round.status]}。贡献凭证会绑定到 project {round.projectId} / round {round.roundId}。
          </p>
          {canSubmit ? (
            <ContributionForm onSubmit={settlement.submitContribution} />
          ) : (
            <LedgerNotice tone="warning">该活动当前不能提交新贡献。</LedgerNotice>
          )}
          {settlement.message && <LedgerNotice tone="success">{settlement.message}</LedgerNotice>}
          <AiScoringExplanation result={settlement.scoringResult} />
        </LedgerPanel>

        <LedgerPanel as="article">
          <span className="role-kicker">领取收益</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{myPayout?.pending ?? "0 USDC"}</h2>
          <p>{settlement.pool.round?.finalized ? "活动已经关闭结算，可以领取可用收益。" : "管理者关闭结算后才会开放领取。"}</p>
          <RoleButton
            disabled={!claimCapability.enabled || settlement.claiming}
            onClick={settlement.manualClaim}
            fullWidth
          >
            {settlement.claiming ? "领取中..." : "领取收益"}
          </RoleButton>
          {!claimCapability.enabled && <LedgerNotice tone="muted">{claimCapability.reason}</LedgerNotice>}
        </LedgerPanel>

        <LedgerPanel as="article">
          <span className="role-kicker">活动档案</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.roundName}</h2>
          <p>这里保留活动和链上绑定信息，方便核对贡献提交到哪一个活动资金池。</p>
          <DetailGrid items={detailItems} />
        </LedgerPanel>
      </section>

      <LedgerPanel className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
          <div>
            <span className="role-kicker">评分</span>
            <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">贡献者评分摘要</h2>
          </div>
          <strong className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[var(--role-ink)]">
            总分 {settlement.pool.round?.totalScore ?? round.totalScore}
          </strong>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)]">
          <div className="hidden min-h-11 grid-cols-5 items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-soft)] px-4 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] md:grid">
            <span>贡献者</span>
            <span>分数</span>
            <span>预计收益</span>
            <span>已领取</span>
            <span>待领取</span>
          </div>
          {settlement.payoutRows.length === 0 ? (
            <EmptyState description="暂无评分记录。" />
          ) : (
            settlement.payoutRows.map((row) => (
              <div key={row.address} className="grid gap-2 border-b border-[var(--line)] px-4 py-3 last:border-b-0 md:grid-cols-5 md:items-center">
                <MetricInline label="贡献者" value={row.shortAddress} />
                <MetricInline label="分数" value={row.score} />
                <MetricInline label="预计收益" value={row.estimated} />
                <MetricInline label="已领取" value={row.claimed} />
                <MetricInline label="待领取" value={row.pending} />
              </div>
            ))
          )}
        </div>
      </LedgerPanel>
    </ContributorShell>
  );
}

function MetricInline({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2.5 py-2 md:border-0 md:bg-transparent md:p-0">
      <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold text-[var(--muted)] md:hidden">{label}</span>
      <strong className="break-words font-[var(--font-mono)] text-sm text-[var(--ink)]">{value}</strong>
    </span>
  );
}

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
