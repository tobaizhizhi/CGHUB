import {
  buildActivityCards,
  compareActivities,
  splitActivityCards,
  type ActivityCard,
  type ActivityCardGroups,
} from "./activity-workspace";
import type { ManagedRound } from "./managed-rounds";

export type ProjectNextAction =
  | "waitForManager"
  | "fundRound"
  | "trackContributions"
  | "reviewSettlement"
  | "settled";

export interface ProjectActivityCard extends ActivityCard {
  nextProjectAction: ProjectNextAction;
}

export interface ProjectWorkspaceMetrics {
  totalActivities: number;
  waitingForManager: number;
  pendingFunding: number;
  activeActivities: number;
  totalFunded: string;
}

export interface ProjectWorkspace {
  metrics: ProjectWorkspaceMetrics;
  todo: ProjectActivityCard[];
  groups: ActivityCardGroups<ProjectActivityCard>;
  activities: ProjectActivityCard[];
}

export function buildProjectWorkspace(rounds: ManagedRound[]): ProjectWorkspace {
  const activities = buildActivityCards(rounds, "project").map((card): ProjectActivityCard => {
    const source = rounds.find((round) => round.id === card.roundRegistryId);
    return {
      ...card,
      nextProjectAction: source ? deriveProjectNextAction(source) : "settled",
    };
  });
  const groups = splitActivityCards(activities, { includeDraft: true });
  const todo = activities
    .filter((activity) => activity.nextProjectAction === "waitForManager" || activity.nextProjectAction === "fundRound")
    .sort(compareProjectTodo);

  return {
    metrics: {
      totalActivities: activities.length,
      waitingForManager: activities.filter((activity) => activity.nextProjectAction === "waitForManager").length,
      pendingFunding: activities.filter((activity) => activity.nextProjectAction === "fundRound").length,
      activeActivities: activities.filter((activity) => activity.isOngoing).length,
      totalFunded: activities.reduce((total, activity) => total + toBigInt(activity.funded), 0n).toString(),
    },
    todo,
    groups,
    activities,
  };
}

export function deriveProjectNextAction(round: ManagedRound): ProjectNextAction {
  if (round.status === "draft" || !round.exists) return "waitForManager";
  if (round.status === "open" && toBigInt(round.funded) === 0n) return "fundRound";
  if (round.status === "open" || round.status === "funded") return "trackContributions";
  if (round.status === "scoring" || round.status === "finalized") return "reviewSettlement";
  return "settled";
}

export function projectNextActionLabel(action: ProjectNextAction) {
  const labels: Record<ProjectNextAction, string> = {
    waitForManager: "等待管理者",
    fundRound: "项目方注资",
    trackContributions: "跟踪贡献",
    reviewSettlement: "查看结算",
    settled: "已结束",
  };
  return labels[action];
}

function compareProjectTodo(a: ProjectActivityCard, b: ProjectActivityCard) {
  const priority = todoPriority(a.nextProjectAction) - todoPriority(b.nextProjectAction);
  if (priority !== 0) return priority;
  return compareActivities(a, b);
}

function todoPriority(action: ProjectNextAction) {
  if (action === "fundRound") return 0;
  if (action === "waitForManager") return 1;
  return 3;
}

function toBigInt(value: string | number | bigint | undefined | null) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.max(0, Math.trunc(value)));
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
