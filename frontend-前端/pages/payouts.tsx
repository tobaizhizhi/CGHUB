import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { EmptyState } from "../components/ledger/EmptyState";
import { LedgerNotice } from "../components/ledger/LedgerNotice";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { LoadingSkeleton } from "../components/ledger/LoadingSkeleton";
import { PageSection } from "../components/ledger/PageSection";
import { RoleButton, roleButtonClass } from "../components/ledger/RoleButton";
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

export default function PayoutsPage() {
  const router = useRouter();
  const { rounds, loading, error } = useManagedRounds();
  const selectedRound = resolveSelectedManagedRound(rounds, router.query);
  const entrypoints = buildPoolEntrypoints(rounds);
  const byId = new Map(rounds.map((round) => [round.id, round]));

  if (selectedRound) return <SelectedPayoutPage round={selectedRound} />;

  return (
    <WorkspaceShell
      title="分账"
      subtitle="按资金池查看待关闭、可领取和已结清的分账状态；操作前必须先选择池子。"
    >
      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={2} />}

      <section className="mt-5 grid gap-4">
        <PoolList
          title="可领取"
          emptyText="暂无可领取资金池。"
          actionLabel="查看分账"
          rounds={pickRounds(byId, entrypoints.claimablePoolIds)}
        />
        <PoolList
          title="待管理者关闭"
          emptyText="暂无待关闭资金池。"
          actionLabel="关闭 Round"
          rounds={pickRounds(byId, entrypoints.closeablePoolIds)}
        />
      </section>

      <PageSection
        eyebrow="历史"
        title="已结清资金池"
        action={
          <Link className={roleButtonClass({ variant: "outline", size: "sm" })} href="/pools">
            查看全部资金池
          </Link>
        }
      >
        <LedgerPanel className="grid gap-2">
          {pickRounds(byId, entrypoints.settledPoolIds).length === 0 ? (
            <EmptyState description="暂无已结清资金池。" />
          ) : (
            pickRounds(byId, entrypoints.settledPoolIds).map((round) => (
              <Link
                key={round.id}
                className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-3 text-[var(--ink)] no-underline transition hover:border-[var(--role-color)] hover:no-underline md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                href={`/pools/${round.id}`}
              >
                <div>
                  <strong className="font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{round.activityName}</strong>
                  <p className="mt-1 text-sm text-[var(--muted)]">{round.roundName} · {ROUND_STATUS_LABELS[round.status]}</p>
                </div>
                <span className="font-[var(--font-mono)] text-sm font-extrabold text-[var(--role-ink)]">{formatUsdc(round.funded)}</span>
              </Link>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function SelectedPayoutPage({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const { payoutRows, pool, myPayout, capabilities } = settlement;
  const [finalizeMessage, setFinalizeMessage] = useState("");
  const query = managedRoundQuery(round);
  const finalizeCapability = capabilities.finalizeRound;
  const claimCapability = capabilities.claimOwnPayout;

  const finalize = async () => {
    setFinalizeMessage("正在关闭 Round...");
    try {
      const tx = await pool.finalizeRound();
      setFinalizeMessage(`Round 已关闭：${String(tx)}`);
    } catch (err) {
      setFinalizeMessage(err instanceof Error ? err.message : "关闭 Round 失败");
    }
  };

  return (
    <WorkspaceShell
      settlement={settlement}
      poolContext={{
        title: round.activityName,
        detail: round.roundName,
        statusLabel: ROUND_STATUS_LABELS[round.status],
        query,
      }}
      title="分账"
      subtitle={`${round.activityName} / ${round.roundName} 的分账预览、关闭和领取。`}
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <LedgerPanel as="article">
          <span className="role-kicker">我的分账</span>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)]">{myPayout?.pending ?? "0 USDC"}</h2>
          <p className="mt-2 text-[var(--muted)]">{pool.round?.finalized ? "该资金池已关闭，可以领取分账。" : "管理者关闭该资金池后才会开放领取。"}</p>
          <RoleButton
            disabled={!claimCapability.enabled || settlement.claiming}
            onClick={settlement.manualClaim}
            className="mt-4"
          >
            {settlement.claiming ? "领取中..." : "领取分账"}
          </RoleButton>
          {!claimCapability.enabled && <LedgerNotice tone="muted" className="mt-3">{claimCapability.reason}</LedgerNotice>}
        </LedgerPanel>

        <LedgerPanel as="article" variant="primary">
          <span className="role-kicker">结算操作</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">关闭资金池</h2>
          <p className="mt-2 text-[var(--muted)]">
            目标：{round.activityName} / {round.roundName}。关闭后会锁定新的贡献和注资。
          </p>
          <RoleButton className="mt-4" disabled={!finalizeCapability.enabled} onClick={finalize}>
            关闭 Round
          </RoleButton>
          {!finalizeCapability.enabled && <LedgerNotice tone="muted" className="mt-3">{finalizeCapability.reason}</LedgerNotice>}
          {finalizeMessage && <LedgerNotice tone={finalizeMessage.includes("失败") ? "error" : "success"} className="mt-3">{finalizeMessage}</LedgerNotice>}
        </LedgerPanel>
      </section>

      <PageSection
        eyebrow="结算记录"
        title="贡献者"
        action={<strong className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 font-[var(--font-mono)] text-sm text-[var(--role-ink)]">已注资 {settlement.fundedLabel}</strong>}
      >
        <LedgerPanel className="overflow-hidden p-0">
          <div className="hidden min-h-11 grid-cols-5 items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-soft)] px-4 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] md:grid">
            <span>贡献者</span>
            <span>占比</span>
            <span>预计</span>
            <span>已领取</span>
            <span>待领取</span>
          </div>
          {payoutRows.length === 0 ? (
            <div className="p-4">
              <EmptyState description="暂无分账记录。" />
            </div>
          ) : (
            payoutRows.map((row) => (
              <div key={row.address} className="grid gap-2 border-b border-[var(--line)] px-4 py-3 last:border-b-0 md:grid-cols-5 md:items-center">
                <MetricInline label="贡献者" value={row.shortAddress} />
                <MetricInline label="占比" value={`${(row.shareBps / 100).toFixed(2)}%`} />
                <MetricInline label="预计" value={row.estimated} />
                <MetricInline label="已领取" value={row.claimed} />
                <MetricInline label="待领取" value={row.pending} />
              </div>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function PoolList({
  title,
  emptyText,
  actionLabel,
  rounds,
}: {
  title: string;
  emptyText: string;
  actionLabel: string;
  rounds: ManagedRound[];
}) {
  return (
    <LedgerPanel as="article">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="role-kicker">资金池</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{title}</h2>
        </div>
        <strong className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2.5 py-2 font-[var(--font-mono)] text-sm text-[var(--role-ink)]">{rounds.length} 个</strong>
      </div>
      <div className="grid overflow-hidden border-t border-[var(--line)]">
        {rounds.length === 0 ? (
          <EmptyState description={emptyText} />
        ) : (
          rounds.map((round) => (
            <div key={round.id} className="grid gap-3 border-b border-[var(--line)] py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <strong className="block truncate font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{round.activityName}</strong>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[var(--muted)]">{round.roundName}</span>
                  <StatusSeal status={round.status} label={ROUND_STATUS_LABELS[round.status]} />
                </div>
              </div>
              <Link className={roleButtonClass({ variant: "secondary", size: "sm" })} href={{ pathname: "/payouts", query: managedRoundQuery(round) }}>
                {actionLabel}
              </Link>
            </div>
          ))
        )}
      </div>
    </LedgerPanel>
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

function pickRounds(byId: Map<string, ManagedRound>, ids: string[]) {
  return ids.map((id) => byId.get(id)).filter(Boolean) as ManagedRound[];
}
