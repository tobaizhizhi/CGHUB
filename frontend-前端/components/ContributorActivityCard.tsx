import { ActivityDossierCard } from "./ledger/ActivityDossierCard";
import type { ContributorActivityCard as ContributorActivityCardModel } from "../lib/contributor-workspace";
import { formatUsdc } from "../lib/settlement-workspace";

interface ContributorActivityCardProps {
  activity: ContributorActivityCardModel;
}

export function ContributorActivityCard({ activity }: ContributorActivityCardProps) {
  return (
    <ActivityDossierCard
      status={activity.status}
      statusLabel={activity.statusLabel}
      actionLabel={activity.canSubmit ? "可提交贡献" : activity.roundName}
      title={activity.activityName}
      description={activity.activityDescription}
      metrics={[
        { label: "项目池资金", value: formatUsdc(activity.funded) },
        { label: "我的分数", value: activity.personalState === "connectWallet" ? "连接后查看" : activity.myScore },
        { label: "待领取", value: activity.personalState === "connectWallet" ? "-" : formatUsdc(activity.myPending) },
        { label: "已领取", value: activity.personalState === "connectWallet" ? "-" : formatUsdc(activity.myClaimed) },
      ]}
      footer={`${activity.contributorCount} 位贡献者`}
      href={activity.href}
      cta="查看并提交"
      className={`contributor-card ${activity.status}`}
    />
  );
}
