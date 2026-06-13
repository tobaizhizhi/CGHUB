import { ProjectActivityCard } from "../../components/ProjectActivityCard";
import { ProjectShell } from "../../components/ProjectShell";
import { EmptyState } from "../../components/ledger/EmptyState";
import { LedgerNotice } from "../../components/ledger/LedgerNotice";
import { LedgerStatCard } from "../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../components/ledger/LoadingSkeleton";
import { PageSection } from "../../components/ledger/PageSection";
import { useManagedRounds } from "../../hooks/useManagedRounds";
import { useProjectActivities } from "../../hooks/useProjectActivities";
import { useWallet } from "../../hooks/useWallet";
import type { ProjectActivityCard as ProjectActivityCardModel } from "../../lib/project-workspace";
import { formatUsdc } from "../../lib/settlement-workspace";

export default function ProjectHomePage() {
  const wallet = useWallet();
  const { rounds, loading, error } = useManagedRounds();
  const workspace = useProjectActivities(rounds);

  return (
    <ProjectShell
      wallet={wallet}
      title="项目方活动管理"
      subtitle="查看活动资金池，处理项目方注资，并跟踪活动状态。"
    >
      <section className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-5">
        <LedgerStatCard label="活动总数" value={`${workspace.metrics.totalActivities}`} />
        <LedgerStatCard label="等待管理者" value={`${workspace.metrics.waitingForManager}`} />
        <LedgerStatCard label="待注资" value={`${workspace.metrics.pendingFunding}`} />
        <LedgerStatCard label="进行中" value={`${workspace.metrics.activeActivities}`} />
        <LedgerStatCard label="总资金池" value={formatUsdc(workspace.metrics.totalFunded)} />
      </section>

      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {loading && <LoadingSkeleton rows={3} />}

      <ActivitySection
        id="funding"
        title="待处理活动"
        description="需要项目方关注的活动：等待管理者创建，或需要项目方注资。"
        activities={workspace.todo}
        emptyText="暂无待处理活动。"
      />

      <ActivitySection
        title="进行中活动"
        description="已经创建、正在收集贡献或进入评分阶段的活动。"
        activities={workspace.groups.ongoing}
        emptyText="暂无进行中活动。"
      />

      <ActivitySection
        id="settlement"
        title="已结束活动"
        description="已关闭、已结清或归档的活动。"
        activities={workspace.groups.ended}
        emptyText="暂无已结束活动。"
      />
    </ProjectShell>
  );
}

function ActivitySection({
  id,
  title,
  description,
  activities,
  emptyText,
}: {
  id?: string;
  title: string;
  description: string;
  activities: ProjectActivityCardModel[];
  emptyText: string;
}) {
  return (
    <PageSection id={id} title={title} description={description} count={activities.length}>
      {activities.length === 0 ? (
        <EmptyState description={emptyText} />
      ) : (
        <div className="grid gap-3">
          {activities.map((activity) => (
            <ProjectActivityCard key={`${title}-${activity.roundRegistryId}`} activity={activity} />
          ))}
        </div>
      )}
    </PageSection>
  );
}
