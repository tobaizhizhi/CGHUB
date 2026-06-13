import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DetailGrid } from "../components/ledger/DetailGrid";
import { EmptyState } from "../components/ledger/EmptyState";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { LoadingSkeleton } from "../components/ledger/LoadingSkeleton";
import { PageSection } from "../components/ledger/PageSection";
import { roleButtonClass } from "../components/ledger/RoleButton";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useManagedRounds } from "../hooks/useManagedRounds";
import { useSettlementData } from "../hooks/useSettlementData";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../lib/managed-rounds";
import {
  buildPoolActivityFeed,
  managedRoundQuery,
  resolveSelectedManagedRound,
} from "../lib/pool-workspace";
import { formatActivityAction, formatActivityResult, type ActivityResult } from "../lib/settlement-workspace";
import { cn } from "../lib/utils";

const filters = ["all", "success", "blocked", "pending", "failed"] as const;
type ActivityFilter = (typeof filters)[number];

const filterLabels: Record<ActivityFilter, string> = {
  all: "全部",
  success: "成功",
  blocked: "已拦截",
  pending: "处理中",
  failed: "失败",
};

export default function ActivityPage() {
  const router = useRouter();
  const { rounds, loading, error } = useManagedRounds();
  const selectedRound = resolveSelectedManagedRound(rounds, router.query);

  if (selectedRound) return <SelectedActivityPage round={selectedRound} />;

  return (
    <GlobalActivityPage rounds={rounds} loading={loading} error={error} />
  );
}

function GlobalActivityPage({
  rounds,
  loading,
  error,
}: {
  rounds: ManagedRound[];
  loading: boolean;
  error: string;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const feed = useMemo(() => buildPoolActivityFeed(rounds), [rounds]);
  const items = useMemo(
    () => (filter === "all" ? feed : feed.filter((item) => item.result === filter)),
    [feed, filter]
  );

  return (
    <WorkspaceShell
      title="活动"
      subtitle="查看所有资金池的状态变化；每条记录都会标明所属活动和轮次。"
    >
      {error && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 font-[var(--font-mono)] text-sm text-[#7e2f26]">
          {error}
        </p>
      )}

      <PageSection
        eyebrow="全局活动流"
        title="资金池事件"
        action={<ActivityFilters filter={filter} setFilter={setFilter} />}
      >
        <LedgerPanel className="grid gap-3">
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : items.length === 0 ? (
            <EmptyState description="当前筛选下暂无活动。" />
          ) : (
            items.map((item) => (
              <details key={item.id} className="group rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] p-3">
                <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <strong className="font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{item.title}</strong>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <ResultPill result={item.result} />
                  <ChevronDown className="transition group-open:rotate-180" size={18} aria-hidden />
                </summary>
                <DetailGrid
                  className="mt-3"
                  items={[
                    { label: "活动", value: item.activityName },
                    { label: "轮次", value: item.roundName },
                    { label: "链上 ID", value: `${item.projectId} / ${item.roundId}` },
                    { label: "更新时间", value: item.createdAt },
                  ]}
                />
                <Link
                  className={cn(roleButtonClass({ variant: "outline", size: "sm" }), "mt-3")}
                  href={{ pathname: "/activity", query: { roundRegistryId: item.roundRegistryId, projectId: item.projectId, roundId: item.roundId } }}
                >
                  查看该资金池活动
                </Link>
              </details>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function SelectedActivityPage({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const items = useMemo(
    () =>
      filter === "all"
        ? settlement.activityTimeline
        : settlement.activityTimeline.filter((item) => item.result === filter),
    [filter, settlement.activityTimeline]
  );
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
      title="活动"
      subtitle={`${round.activityName} / ${round.roundName} 的链上交易和状态变化。`}
    >
      <PageSection
        eyebrow="池子活动流"
        title={round.roundName}
        action={<ActivityFilters filter={filter} setFilter={setFilter} />}
      >
        <LedgerPanel className="grid gap-3">
          {items.length === 0 ? (
            <EmptyState description="当前筛选下暂无活动。" />
          ) : (
            items.map((item) => (
              <details key={item.id} className="group rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] p-3">
                <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center [&::-webkit-details-marker]:hidden">
                  <div>
                    <strong className="font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{item.title}</strong>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <ResultPill result={item.result} />
                  <ChevronDown className="transition group-open:rotate-180" size={18} aria-hidden />
                </summary>
                <DetailGrid
                  className="mt-3"
                  items={[
                    { label: "动作", value: formatActivityAction(item.action) },
                    { label: "金额", value: item.amount ?? "-" },
                    { label: "分数", value: item.score ?? "-" },
                    { label: "交易", value: item.txHash ?? "-" },
                    { label: "链上结果", value: formatAuditResult(item.auditResult) },
                  ]}
                />
                <pre className="mt-3 max-h-80 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] p-3 text-xs">
                  {JSON.stringify(item.raw ?? {}, null, 2)}
                </pre>
              </details>
            ))
          )}
        </LedgerPanel>
      </PageSection>
    </WorkspaceShell>
  );
}

function ActivityFilters({
  filter,
  setFilter,
}: {
  filter: ActivityFilter;
  setFilter: (filter: ActivityFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] p-1">
      {filters.map((item) => (
        <button
          key={item}
          className={cn(
            "min-h-8 rounded-[calc(var(--radius-sm)-2px)] px-2.5 font-[var(--font-mono)] text-xs font-extrabold transition",
            filter === item
              ? "bg-[var(--role-color)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--role-soft)] hover:text-[var(--role-ink)]"
          )}
          onClick={() => setFilter(item)}
        >
          {filterLabels[item]}
        </button>
      ))}
    </div>
  );
}

function ResultPill({ result }: { result: ActivityResult }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold",
        result === "success" && "border-[var(--success)] bg-[var(--success-soft)] text-[#215537]",
        result === "blocked" && "border-[var(--warning)] bg-[var(--warning-soft)] text-[#76550d]",
        result === "pending" && "border-[var(--line-strong)] bg-[var(--paper)] text-[var(--muted)]",
        result === "failed" && "border-[var(--danger)] bg-[var(--danger-soft)] text-[#7e2f26]"
      )}
    >
      {formatActivityResult(result)}
    </span>
  );
}

function formatAuditResult(result?: string) {
  if (result === "allowed") return "放行";
  if (result === "denied") return "拒绝";
  if (result === "pending") return "处理中";
  if (result === "error") return "错误";
  return result || "-";
}
