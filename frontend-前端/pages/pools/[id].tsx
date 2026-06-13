import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { DetailGrid } from "../../components/ledger/DetailGrid";
import { LedgerPanel } from "../../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../components/ledger/LoadingSkeleton";
import { roleButtonClass } from "../../components/ledger/RoleButton";
import { WorkspaceShell } from "../../components/WorkspaceShell";
import { useSettlementData } from "../../hooks/useSettlementData";
import { getRound } from "../../lib/agent-api";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../../lib/managed-rounds";
import { managedRoundQuery } from "../../lib/pool-workspace";
import { formatUsdc, shortAddress } from "../../lib/settlement-workspace";
import { cn } from "../../lib/utils";

export default function PoolDetailPage() {
  const router = useRouter();
  const id = useMemo(() => {
    const raw = router.query.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.id]);
  const [round, setRound] = useState<ManagedRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !id) return;
    let alive = true;
    setLoading(true);
    getRound(id)
      .then((item) => {
        if (!alive) return;
        setRound(item);
        setError("");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "资金池详情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, router.isReady]);

  if (round) return <PoolDetailWorkspace round={round} />;

  return (
    <WorkspaceShell
      title="资金池详情"
      subtitle="正在读取资金池信息。"
    >
      {error && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#7e2f26]">
          {error}
        </p>
      )}
      {loading && <LoadingSkeleton rows={2} />}
    </WorkspaceShell>
  );
}

function PoolDetailWorkspace({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });

  return (
    <WorkspaceShell
      settlement={settlement}
      poolContext={{
        title: round.activityName,
        detail: round.roundName,
        statusLabel: ROUND_STATUS_LABELS[round.status],
        query: managedRoundQuery(round),
      }}
      title={round.activityName}
      subtitle={`${round.roundName} 的资金、贡献和分账状态。`}
    >
      <section className="grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 md:grid-cols-2 xl:grid-cols-4">
        <LedgerStatCard label="状态" value={ROUND_STATUS_LABELS[round.status]} />
        <LedgerStatCard label="已注资" value={formatUsdc(round.funded)} />
        <LedgerStatCard label="总分" value={round.totalScore} />
        <LedgerStatCard label="贡献者" value={round.contributorCount} />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <LedgerPanel as="article">
          <span className="role-kicker">池子信息</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.roundName}</h2>
          <DetailGrid
            items={[
              { label: "链上 ID", value: `${round.projectId} / ${round.roundId}` },
              {
                label: "资金池合约",
                value: shortAddress(round.poolAddress),
                copyValue: round.poolAddress,
                display: shortAddress(round.poolAddress),
              },
              {
                label: "代币",
                value: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}`,
                copyValue: round.tokenAddress,
                display: `${round.tokenSymbol} ${shortAddress(round.tokenAddress)}`,
              },
              {
                label: "项目方",
                value: shortAddress(round.ownerAddress),
                copyValue: round.ownerAddress,
                display: shortAddress(round.ownerAddress),
              },
              { label: "链上状态", value: settlement.statusLabel },
            ]}
          />
        </LedgerPanel>

        <LedgerPanel as="article" variant="primary">
          <span className="role-kicker">操作</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">进入池子工作流</h2>
          <div className="mt-4 grid gap-2">
            <Link className={cn(roleButtonClass({ variant: "secondary" }), "justify-center")} href={`/contributor/activities/${round.id}`}>
              贡献者详情
            </Link>
            <Link className={cn(roleButtonClass({ variant: "primary" }), "justify-center")} href={`/project/activities/${round.id}`}>
              项目方视图
            </Link>
            <Link className={cn(roleButtonClass({ variant: "secondary" }), "justify-center")} href={`/manager/activities/${round.id}`}>
              管理者视图
            </Link>
            <Link className={cn(roleButtonClass({ variant: "outline" }), "justify-center")} href={{ pathname: "/activity", query: managedRoundQuery(round) }}>
              活动
            </Link>
          </div>
        </LedgerPanel>
      </section>
    </WorkspaceShell>
  );
}
