import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ManagerActivityCard } from "../../components/ManagerActivityCard";
import { ManagerShell } from "../../components/ManagerShell";
import { AiScoringExplanation } from "../../components/AiScoringExplanation";
import { EmptyState } from "../../components/ledger/EmptyState";
import { LedgerNotice } from "../../components/ledger/LedgerNotice";
import { LedgerPanel } from "../../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../components/ledger/LoadingSkeleton";
import { PageSection } from "../../components/ledger/PageSection";
import { roleButtonClass } from "../../components/ledger/RoleButton";
import { useManagedRounds } from "../../hooks/useManagedRounds";
import { useManagerActivities } from "../../hooks/useManagerActivities";
import { useWallet } from "../../hooks/useWallet";
import {
  getContributionReviews,
  requestMoreEvidence,
  type ContributionReviewRecord,
} from "../../lib/agent-api";
import type { ManagerActivityCard as ManagerActivityCardModel } from "../../lib/manager-workspace";
import { formatUsdc } from "../../lib/settlement-workspace";
import { cn } from "../../lib/utils";

export default function ManagerHomePage() {
  const wallet = useWallet();
  const { rounds, loading, error } = useManagedRounds();
  const workspace = useManagerActivities(rounds);

  return (
    <ManagerShell
      wallet={wallet}
      title="管理者结算总控"
      subtitle="创建活动、开资金池、结束活动，并维护活动和链上 ID 的对应关系。"
    >
      <LedgerPanel variant="primary" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <span className="role-kicker">活动生命周期</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">新开活动资金池</h2>
          <p>填写标题、描述和轮次，分配 projectId / roundId，并用管理者钱包创建链上资金池。</p>
        </div>
        <Link className={cn(roleButtonClass({ variant: "primary" }), "max-sm:w-full")} href="/manager/activities/new">
          创建活动
        </Link>
      </LedgerPanel>

      <section className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="活动总数" value={`${workspace.metrics.totalActivities}`} />
        <LedgerStatCard label="待创建" value={`${workspace.metrics.pendingCreate}`} />
        <LedgerStatCard label="待注资" value={`${workspace.metrics.pendingFunding}`} />
        <LedgerStatCard label="待关闭" value={`${workspace.metrics.pendingFinalize}`} />
        <LedgerStatCard label="总资金池" value={formatUsdc(workspace.metrics.totalFunded)} />
      </section>

      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={3} />}

      <ActivitySection
        title="管理者待办"
        description="需要创建资金池、等待注资或关闭活动的生命周期待办。"
        activities={workspace.todo}
        emptyText="暂无管理者待办。"
      />

      <ActivitySection
        title="进行中活动"
        description="已创建、已注资或正在评分的活动。"
        activities={workspace.groups.ongoing}
        emptyText="暂无进行中活动。"
      />

      <ActivitySection
        title="已结束活动"
        description="已关闭、已结清或归档的活动。"
        activities={workspace.groups.ended}
        emptyText="暂无已结束活动。"
      />

      <ContributionReviewQueue reviewer={wallet.address ?? undefined} />
    </ManagerShell>
  );
}

function ContributionReviewQueue({ reviewer }: { reviewer?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState<ContributionReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getContributionReviews({ status: "pending_cobo_approval", limit: 20 });
      setReviews(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审批队列读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const requestEvidence = async (review: ContributionReviewRecord) => {
    setActionId(review.id);
    setError(null);
    try {
      await requestMoreEvidence(review.id, { reviewer, reviewNote: "需要补充证据" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "补证据请求失败");
    } finally {
      setActionId(null);
    }
  };

  return (
    <PageSection
      title="Cobo 评分审批"
      description="高风险评分会进入 Cobo App 审批；审批通过后，CAW 会把分数写到链上。"
      count={reviews.length}
      action={
        <button
          type="button"
          className={cn(roleButtonClass({ variant: "secondary", size: "sm" }), "min-w-24")}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "收起" : "展开"}
          <ChevronDown size={14} aria-hidden className={cn("transition", expanded && "rotate-180")} />
        </button>
      }
    >
      {!expanded ? (
        <LedgerPanel variant="soft" className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="m-0 text-sm text-[var(--muted)]">
            审批队列已收起，当前有 {reviews.length} 条等待 Cobo App 处理的贡献评分。
          </p>
          {loading && <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">同步中</span>}
        </LedgerPanel>
      ) : (
        <>
          {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
          {loading && reviews.length === 0 ? (
            <LoadingSkeleton rows={2} />
          ) : reviews.length === 0 ? (
            <EmptyState description="暂无等待 Cobo App 审批的贡献。" />
          ) : (
            <div className="grid gap-3">
              {reviews.map((review) => (
                <LedgerPanel key={review.id} className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <span className="role-kicker">{review.projectId} / {review.roundId}</span>
                      <h3 className="mt-1 font-[var(--font-display)] text-lg text-[var(--ink)]">{review.title}</h3>
                      <p>{review.score} 分 · {review.reasons.join("；") || review.scoreReason}</p>
                      {(review.coboApprovalId || review.coboSignTxId) && (
                        <p>{review.coboApprovalId || review.coboSignTxId}</p>
                      )}
                      {review.evidenceUrl && <p>{review.evidenceUrl}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={roleButtonClass({ variant: "secondary" })}
                        disabled={actionId === review.id}
                        onClick={() => requestEvidence(review)}
                      >
                        补证据
                      </button>
                    </div>
                  </div>
                  <AiScoringExplanation result={review} className="mt-0 border-t-0 pt-0" />
                </LedgerPanel>
              ))}
            </div>
          )}
        </>
      )}
    </PageSection>
  );
}

function ActivitySection({
  title,
  description,
  activities,
  emptyText,
}: {
  title: string;
  description: string;
  activities: ManagerActivityCardModel[];
  emptyText: string;
}) {
  return (
    <PageSection title={title} description={description} count={activities.length}>
      {activities.length === 0 ? (
        <EmptyState description={emptyText} />
      ) : (
        <div className="grid gap-3">
          {activities.map((activity) => (
            <ManagerActivityCard key={`${title}-${activity.roundRegistryId}`} activity={activity} />
          ))}
        </div>
      )}
    </PageSection>
  );
}
