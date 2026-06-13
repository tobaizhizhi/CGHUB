import Link from "next/link";
import { useMemo } from "react";
import { EmptyState } from "../components/ledger/EmptyState";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../components/ledger/LoadingSkeleton";
import { PageSection } from "../components/ledger/PageSection";
import { roleButtonClass } from "../components/ledger/RoleButton";
import { StatusSeal } from "../components/ledger/StatusSeal";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useManagedRounds } from "../hooks/useManagedRounds";
import {
  ROUND_STATUS_LABELS,
  splitManagedRounds,
  type ManagedRound,
} from "../lib/managed-rounds";
import { buildPoolDashboard, managedRoundQuery } from "../lib/pool-workspace";
import { formatUsdc } from "../lib/settlement-workspace";
import { cn } from "../lib/utils";

export default function PoolsPage() {
  const { rounds, loading, error } = useManagedRounds();
  const groups = useMemo(() => splitManagedRounds(rounds), [rounds]);
  const dashboard = useMemo(() => buildPoolDashboard(rounds), [rounds]);

  return (
    <WorkspaceShell
      title="资金池"
      subtitle="查看所有活动轮次的资金池状态，先选池子，再进行注资、关闭和分账。"
    >
      <section className="grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 md:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="全部池子" value={dashboard.totalCount} />
        <LedgerStatCard label="进行中" value={dashboard.activeCount} />
        <LedgerStatCard label="待关闭" value={dashboard.closeableCount} />
        <LedgerStatCard label="可领取" value={dashboard.claimableCount} />
        <LedgerStatCard label="总注资" value={formatUsdc(dashboard.totalFunded)} />
      </section>

      {error && (
        <p className="mt-4 rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#7e2f26]">
          {error}
        </p>
      )}

      <PoolSection
        title="进行中的资金池"
        description="开放、已注资、评分中和可领取的池子会优先展示。"
        rounds={groups.active}
        loading={loading}
      />

      <PoolSection
        title="已关闭的资金池"
        description="已结清或归档的池子保留在这里，方便查看历史记录。"
        rounds={groups.archived}
        loading={loading}
        muted
      />
    </WorkspaceShell>
  );
}

function PoolSection({
  title,
  description,
  rounds,
  loading,
  muted,
}: {
  title: string;
  description: string;
  rounds: ManagedRound[];
  loading: boolean;
  muted?: boolean;
}) {
  return (
    <PageSection
      eyebrow={muted ? "归档" : "当前"}
      title={title}
      description={description}
      count={rounds.length}
      className={muted ? "opacity-90" : undefined}
    >
      <LedgerPanel className={cn("overflow-hidden p-0", muted && "bg-[var(--paper-soft)]")}>
        <div className="hidden min-h-11 grid-cols-[1.8fr_0.8fr_0.8fr_0.6fr_0.6fr_1.4fr] items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-soft)] px-4 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)] lg:grid">
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
        ) : rounds.length === 0 ? (
          <div className="p-4">
            <EmptyState description="暂无资金池。" />
          </div>
        ) : (
          rounds.map((round) => <PoolRow key={round.id} round={round} />)
        )}
      </LedgerPanel>
    </PageSection>
  );
}

function PoolRow({ round }: { round: ManagedRound }) {
  const query = managedRoundQuery(round);
  return (
    <div className="grid gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 lg:grid-cols-[1.8fr_0.8fr_0.8fr_0.6fr_0.6fr_1.4fr] lg:items-center">
      <div className="min-w-0">
        <strong className="block truncate font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{round.activityName}</strong>
        <p className="mt-1 font-[var(--font-mono)] text-xs text-[var(--muted)]">
          {round.roundName} · {round.projectId} / {round.roundId}
        </p>
      </div>
      <StatusSeal status={round.status} label={ROUND_STATUS_LABELS[round.status]} />
      <MetricInline label="已注资" value={formatUsdc(round.funded)} />
      <MetricInline label="总分" value={round.totalScore} />
      <MetricInline label="贡献者" value={round.contributorCount} />
      <div className="flex flex-wrap gap-2">
        <Link className={roleButtonClass({ variant: "outline", size: "sm" })} href={{ pathname: `/pools/${round.id}`, query }}>
          详情
        </Link>
        {round.status === "draft" && (
          <Link className={roleButtonClass({ variant: "secondary", size: "sm" })} href={`/manager/activities/${round.id}`}>
            创建
          </Link>
        )}
        {(round.status === "open" || round.status === "funded") && (
          <Link className={roleButtonClass({ variant: "secondary", size: "sm" })} href={`/project/activities/${round.id}`}>
            注资
          </Link>
        )}
        {round.status === "scoring" && (
          <Link className={roleButtonClass({ variant: "secondary", size: "sm" })} href={`/manager/activities/${round.id}`}>
            关闭
          </Link>
        )}
        {round.status === "finalized" && (
          <Link className={roleButtonClass({ variant: "secondary", size: "sm" })} href={`/contributor/activities/${round.id}`}>
            分账
          </Link>
        )}
        <Link className={roleButtonClass({ variant: "ghost", size: "sm" })} href={{ pathname: "/activity", query }}>
          活动
        </Link>
      </div>
    </div>
  );
}

function MetricInline({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-2.5 py-2 lg:border-0 lg:bg-transparent lg:p-0">
      <span className="font-[var(--font-mono)] text-[0.68rem] font-extrabold text-[var(--muted)] lg:hidden">{label}</span>
      <strong className="break-words font-[var(--font-mono)] text-sm text-[var(--ink)]">{value}</strong>
    </span>
  );
}
