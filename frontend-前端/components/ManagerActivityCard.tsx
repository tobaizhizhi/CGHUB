import { ActivityDossierCard } from "./ledger/ActivityDossierCard";
import type { ManagerActivityCard as ManagerActivityCardModel } from "../lib/manager-workspace";
import { managerNextActionLabel } from "../lib/manager-workspace";
import { formatUsdc } from "../lib/settlement-workspace";

interface ManagerActivityCardProps {
  activity: ManagerActivityCardModel;
}

export function ManagerActivityCard({ activity }: ManagerActivityCardProps) {
  return (
    <ActivityDossierCard
      status={activity.status}
      statusLabel={activity.statusLabel}
      actionLabel={managerNextActionLabel(activity.nextManagerAction)}
      title={activity.activityName}
      description={activity.activityDescription || `${activity.roundName} · 链上 ID ${activity.projectId} / ${activity.roundId}`}
      metrics={[
        { label: "Project ID", value: activity.projectId },
        { label: "Round ID", value: activity.roundId },
        { label: "资金池", value: formatUsdc(activity.funded) },
        { label: "总分", value: activity.totalScore },
      ]}
      footer={`${activity.tokenSymbol} · ${activity.contributorCount} 位贡献者`}
      href={activity.href}
      cta="管理活动"
      className={`manager-card ${activity.status}`}
    />
  );
}
