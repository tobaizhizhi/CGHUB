import type { PoolActivity } from "../hooks/useContributionPool";

interface ContributionStreamProps {
  activities: PoolActivity[];
  loading: boolean;
  error: string | null;
}

export function ContributionStream({ activities, loading, error }: ContributionStreamProps) {
  const contributionActivities = activities.filter(
    (activity) => activity.type === "contribution" || activity.type === "funded"
  );

  return (
    <section className="console-panel stream-panel">
      <div className="panel-header">
        <h2>链上贡献流</h2>
        <p>ContributionPool 事件，新事件显示在顶部。</p>
      </div>

      <div className="stream-list">
        {loading && (
          <>
            <div className="stream-skeleton" />
            <div className="stream-skeleton" />
          </>
        )}
        {error && <p className="hint error">{error}</p>}
        {!loading && !error && contributionActivities.length === 0 && (
          <p className="empty-state">等待链上贡献事件...</p>
        )}
        {contributionActivities.map((activity) => (
          <article key={activity.id} className={`stream-row ${activity.type}`}>
            <div>
              <span className="event-badge">{formatActivityType(activity.type)}</span>
              <strong>{activity.title}</strong>
              <p>
                {activity.contributor ? short(activity.contributor) : "本轮"}
                {activity.score ? ` · 分数=${activity.score}` : ""}
                {activity.amount ? ` · 金额=${activity.amount}` : ""}
              </p>
            </div>
            <a
              href={`https://sepolia.etherscan.io/tx/${activity.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              #{activity.blockNumber}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function short(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatActivityType(type: PoolActivity["type"]) {
  if (type === "funded") return "注资";
  if (type === "contribution") return "贡献";
  if (type === "finalized") return "关闭";
  return "领取";
}
