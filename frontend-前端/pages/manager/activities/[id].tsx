import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ManagerShell } from "../../../components/ManagerShell";
import { ActivityDossierHeader } from "../../../components/ledger/ActivityDossierHeader";
import { ConfirmDialog } from "../../../components/ledger/ConfirmDialog";
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
import { markActivityFinalized } from "../../../lib/agent-api";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../../../lib/managed-rounds";
import { deriveManagerNextAction, managerNextActionLabel } from "../../../lib/manager-workspace";
import { formatUsdc, shortAddress } from "../../../lib/settlement-workspace";

export default function ManagerActivityDetailPage() {
  const router = useRouter();
  const id = useMemo(() => firstValue(router.query.id), [router.query.id]);
  const { round, loading, error, refresh } = useManagedRound(router.isReady ? id : undefined);
  const wallet = useWallet();

  if (round) return <ManagerActivityDetail round={round} refreshRound={refresh} />;

  return (
    <ManagerShell wallet={wallet} title="管理者活动" subtitle="正在读取活动信息。">
      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={2} />}
      {!loading && !error && <EmptyState description="没有找到这个活动。" />}
    </ManagerShell>
  );
}

function ManagerActivityDetail({ round, refreshRound }: { round: ManagedRound; refreshRound: () => void }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const [finalizeMessage, setFinalizeMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const finalizeCapability = settlement.capabilities.finalizeRound;
  const nextAction = deriveManagerNextAction(round);
  const detailItems: DetailGridItem[] = [
    { label: "链上 ID", value: `${round.projectId} / ${round.roundId}` },
    { label: "项目方", value: shortAddress(round.ownerAddress), copyValue: round.ownerAddress, display: shortAddress(round.ownerAddress) },
    { label: "资金池合约", value: shortAddress(round.poolAddress), copyValue: round.poolAddress, display: shortAddress(round.poolAddress) },
    { label: "合约管理员", value: settlement.ownerShort, copyValue: settlement.pool.owner, display: settlement.ownerShort },
    { label: "代币", value: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}`, copyValue: round.tokenAddress, display: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}` },
    ...(round.startsAt ? [{ label: "开始时间", value: formatDateTime(round.startsAt) }] : []),
    ...(round.endsAt ? [{ label: "计划结束", value: formatDateTime(round.endsAt) }] : []),
    ...(round.endedAt ? [{ label: "实际结束", value: formatDateTime(round.endedAt) }] : []),
    ...(round.createTxHash ? [{ label: "创建交易", value: round.createTxHash, copyValue: round.createTxHash }] : []),
    ...(round.finalizeTxHash ? [{ label: "关闭交易", value: round.finalizeTxHash, copyValue: round.finalizeTxHash }] : []),
  ];

  const finalize = async () => {
    setFinalizeMessage("正在关闭结算...");
    setFinalizing(true);
    try {
      const tx = await settlement.pool.finalizeRound();
      await markActivityFinalized(round.id, {
        finalizeTxHash: String(tx),
        finalizedBy: settlement.wallet.address || undefined,
      });
      refreshRound();
      setFinalizeMessage(`Round 已关闭并回写：${String(tx)}`);
      setConfirmOpen(false);
    } catch (err) {
      setFinalizeMessage(err instanceof Error ? err.message : "关闭 Round 失败");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <ManagerShell
      wallet={settlement.wallet}
      title={round.activityName}
      subtitle={`${round.roundName} 的活动信息和结算管理。`}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 max-sm:flex-col max-sm:items-stretch">
        <Link href="/manager">返回管理者总控</Link>
        <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">{managerNextActionLabel(nextAction)}</span>
      </div>

      <ActivityDossierHeader
        eyebrow="活动生命周期档案"
        title={round.activityName}
        description={round.activityDescription || `${round.roundName} 的创建、链上绑定和结束状态。`}
        stamp={
          <div className="grid grid-cols-2 content-center gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--role-color)_32%,var(--line))] bg-[rgba(255,253,247,0.78)] p-4">
            <div className="grid gap-2">
              <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">Project ID</span>
              <strong className="break-words font-[var(--font-display)] text-3xl leading-tight text-[var(--role-ink)]">{round.projectId}</strong>
            </div>
            <div className="grid gap-2">
              <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">Round ID</span>
              <strong className="break-words font-[var(--font-display)] text-3xl leading-tight text-[var(--role-ink)]">{round.roundId}</strong>
            </div>
          </div>
        }
      />

      <section className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="状态" value={ROUND_STATUS_LABELS[round.status]} />
        <LedgerStatCard label="项目池资金" value={formatUsdc(settlement.pool.round?.funded ?? round.funded)} />
        <LedgerStatCard label="总分" value={settlement.pool.round?.totalScore ?? round.totalScore} />
        <LedgerStatCard label="贡献者" value={`${round.contributorCount}`} />
        <LedgerStatCard label="链上状态" value={settlement.pool.round?.exists ? "已创建" : "未创建"} />
      </section>

      <section className="grid gap-4">
        <LedgerPanel as="article">
          <span className="role-kicker">链上绑定信息</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.roundName}</h2>
          <p>管理者在这里核对活动档案、资金池合约和创建 / 关闭交易。</p>
          <DetailGrid items={detailItems} />
        </LedgerPanel>
      </section>

      <section className="mt-4 grid gap-4">
        <LedgerPanel as="article" variant={round.endedAt || settlement.pool.round?.finalized ? "default" : "danger"}>
          <span className="role-kicker">结算管理</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">
            {round.endedAt || settlement.pool.round?.finalized ? "活动已结束" : "结束活动并关闭资金池"}
          </h2>
          <p>
            {round.endedAt || settlement.pool.round?.finalized
              ? "活动已经关闭结算，贡献者可以按分数领取收益。"
              : "关闭后会锁定新的贡献和注资，贡献者可以按分数领取收益。"}
          </p>
          <RoleButton variant="danger" disabled={!finalizeCapability.enabled || finalizing} onClick={() => setConfirmOpen(true)}>
            结束活动
          </RoleButton>
          {!finalizeCapability.enabled && <LedgerNotice tone="muted">{finalizeCapability.reason}</LedgerNotice>}
          {finalizeMessage && <LedgerNotice tone={finalizeMessage.includes("失败") ? "error" : "success"}>{finalizeMessage}</LedgerNotice>}
        </LedgerPanel>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="确认结束活动？"
        description={
          <p className="m-0">
            结束后会关闭当前 project {round.projectId} / round {round.roundId} 的资金池，新的贡献和注资将被锁定。
          </p>
        }
        confirmLabel="确认结束活动"
        busy={finalizing}
        onConfirm={finalize}
        onOpenChange={setConfirmOpen}
      />
    </ManagerShell>
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
