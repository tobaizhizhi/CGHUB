import { ActivityDossierCard } from "./ledger/ActivityDossierCard";
import type { ProjectActivityCard as ProjectActivityCardModel } from "../lib/project-workspace";
import { projectNextActionLabel } from "../lib/project-workspace";
import { formatUsdc } from "../lib/settlement-workspace";

interface ProjectActivityCardProps {
  activity: ProjectActivityCardModel;
}

export function ProjectActivityCard({ activity }: ProjectActivityCardProps) {
  return (
    <ActivityDossierCard
      status={activity.status}
      statusLabel={activity.statusLabel}
      actionLabel={projectNextActionLabel(activity.nextProjectAction)}
      title={activity.activityName}
      description={activity.activityDescription || `${activity.roundName} · 链上 ID ${activity.projectId} / ${activity.roundId}`}
      metrics={[
        { label: "项目池资金", value: formatUsdc(activity.funded) },
        { label: "总分", value: activity.totalScore },
        { label: "贡献者", value: `${activity.contributorCount}` },
      ]}
      footer={activity.tokenSymbol}
      href={activity.href}
      cta="查看并注资"
      className={`project-card ${activity.status}`}
    />
  );
}
