import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/router";
import { FundRoundForm } from "../../../components/FundRoundForm";
import { ProjectShell } from "../../../components/ProjectShell";
import { ActivityDossierHeader, LedgerStamp } from "../../../components/ledger/ActivityDossierHeader";
import { DetailGrid, type DetailGridItem } from "../../../components/ledger/DetailGrid";
import { EmptyState } from "../../../components/ledger/EmptyState";
import { LedgerNotice } from "../../../components/ledger/LedgerNotice";
import { LedgerPanel } from "../../../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../../components/ledger/LoadingSkeleton";
import { useManagedRound } from "../../../hooks/useManagedRound";
import { useSettlementData } from "../../../hooks/useSettlementData";
import { useWallet } from "../../../hooks/useWallet";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../../../lib/managed-rounds";
import { deriveProjectNextAction, projectNextActionLabel } from "../../../lib/project-workspace";
import { formatUsdc, shortAddress } from "../../../lib/settlement-workspace";

export default function ProjectActivityDetailPage() {
  const router = useRouter();
  const id = useMemo(() => firstValue(router.query.id), [router.query.id]);
  const { round, loading, error } = useManagedRound(router.isReady ? id : undefined);
  const wallet = useWallet();

  if (round) return <ProjectActivityDetail round={round} />;

  return (
    <ProjectShell wallet={wallet} title="项目方活动" subtitle="正在读取活动信息。">
      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={2} />}
      {!loading && !error && <EmptyState description="没有找到这个活动。" />}
    </ProjectShell>
  );
}

function ProjectActivityDetail({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const nextAction = deriveProjectNextAction(round);
  const browserFundCapability = settlement.capabilities.fundWithBrowserWallet;
  const roundState = settlement.pool.round;
  const canShowFundingForm = Boolean(roundState?.exists) && !roundState?.finalized;
  const detailItems: DetailGridItem[] = [
    { label: "链上 ID", value: `${round.projectId} / ${round.roundId}` },
    { label: "项目方", value: shortAddress(round.ownerAddress), copyValue: round.ownerAddress, display: shortAddress(round.ownerAddress) },
    { label: "资金池合约", value: shortAddress(round.poolAddress), copyValue: round.poolAddress, display: shortAddress(round.poolAddress) },
    { label: "代币", value: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}`, copyValue: round.tokenAddress, display: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}` },
    ...(round.startsAt ? [{ label: "开始时间", value: formatDateTime(round.startsAt) }] : []),
    ...(round.endsAt ? [{ label: "计划结束", value: formatDateTime(round.endsAt) }] : []),
    ...(round.endedAt ? [{ label: "实际结束", value: formatDateTime(round.endedAt) }] : []),
  ];

  const fundWithProjectWallet = async (amount: string) => {
    await settlement.pool.fundRound(amount);
    await settlement.pool.refresh();
  };

  return (
    <ProjectShell
      wallet={settlement.wallet}
      title={round.activityName}
      subtitle={`${round.roundName} 的活动信息和项目方注资。`}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 max-sm:flex-col max-sm:items-stretch">
        <Link href="/project">返回项目方活动</Link>
        <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">{projectNextActionLabel(nextAction)}</span>
      </div>

      <ActivityDossierHeader
        eyebrow="活动资金档案"
        title={round.activityName}
        description={round.activityDescription || `${round.roundName} 的资金池与项目方注资记录。`}
        stamp={
          <LedgerStamp
            label="项目池资金"
            value={formatUsdc(settlement.pool.round?.funded ?? round.funded)}
            footer={ROUND_STATUS_LABELS[round.status]}
          />
        }
      />

      <section className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="状态" value={ROUND_STATUS_LABELS[round.status]} />
        <LedgerStatCard label="项目池资金" value={formatUsdc(settlement.pool.round?.funded ?? round.funded)} />
        <LedgerStatCard label="总分" value={settlement.pool.round?.totalScore ?? round.totalScore} />
        <LedgerStatCard label="贡献者" value={`${round.contributorCount}`} />
        <LedgerStatCard label="链上状态" value={roundState?.exists ? "已创建" : "未创建"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.72fr)]">
        <LedgerPanel as="article">
          <span className="role-kicker">资金池凭证</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.roundName}</h2>
          <p>这里展示活动对应的资金池和链上绑定信息，项目方只需要关注资金状态和注资入口。</p>
          <DetailGrid items={detailItems} />
        </LedgerPanel>

        <LedgerPanel as="article" variant="primary">
          <span className="role-kicker">项目方注资</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">
            {canShowFundingForm ? "用当前钱包注资" : "等待管理者处理"}
          </h2>
          {canShowFundingForm ? (
            <>
              <p>这会使用连接的钱包直接给当前活动资金池注资。</p>
              <FundRoundForm disabled={!browserFundCapability.enabled} onFund={fundWithProjectWallet} embedded />
              {!browserFundCapability.enabled && <LedgerNotice tone="muted">{browserFundCapability.reason}</LedgerNotice>}
            </>
          ) : (
            <LedgerNotice tone="warning">
              {roundState?.finalized
                ? "活动已经关闭结算，项目方不能继续注资。"
              : "链上 Round 尚未创建，请由管理者先创建 Round。"}
            </LedgerNotice>
          )}
        </LedgerPanel>
      </section>
    </ProjectShell>
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
