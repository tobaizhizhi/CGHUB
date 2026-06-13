import {
  buildActivityCards,
  compareActivities,
  splitActivityCards,
  type ActivityCard,
  type ActivityCardGroups,
} from "./activity-workspace";
import type { ManagedRound } from "./managed-rounds";

export type ManagerNextAction =
  | "createRound"
  | "fundRound"
  | "watchContributions"
  | "finalizeRound"
  | "settled";

export interface ManagerActivityCard extends ActivityCard {
  nextManagerAction: ManagerNextAction;
}

export interface ManagerWorkspaceMetrics {
  totalActivities: number;
  pendingCreate: number;
  pendingFunding: number;
  pendingFinalize: number;
  totalFunded: string;
}

export interface ManagerWorkspace {
  metrics: ManagerWorkspaceMetrics;
  todo: ManagerActivityCard[];
  groups: ActivityCardGroups<ManagerActivityCard>;
  activities: ManagerActivityCard[];
}

export function buildManagerWorkspace(rounds: ManagedRound[]): ManagerWorkspace {
  const activities = buildActivityCards(rounds, "manager").map((card): ManagerActivityCard => {
    const source = rounds.find((round) => round.id === card.roundRegistryId);
    return {
      ...card,
      nextManagerAction: source ? deriveManagerNextAction(source) : "settled",
    };
  });
  const groups = splitActivityCards(activities, { includeDraft: true });
  const todo = activities
    .filter((activity) => activity.nextManagerAction === "createRound" || activity.nextManagerAction === "fundRound" || activity.nextManagerAction === "finalizeRound")
    .sort(compareManagerTodo);

  return {
    metrics: {
      totalActivities: activities.length,
      pendingCreate: activities.filter((activity) => activity.nextManagerAction === "createRound").length,
      pendingFunding: activities.filter((activity) => activity.nextManagerAction === "fundRound").length,
      pendingFinalize: activities.filter((activity) => activity.nextManagerAction === "finalizeRound").length,
      totalFunded: activities.reduce((total, activity) => total + toBigInt(activity.funded), 0n).toString(),
    },
    todo,
    groups,
    activities,
  };
}

export function deriveManagerNextAction(round: ManagedRound): ManagerNextAction {
  if (round.status === "draft" || round.status === "creating" || round.status === "create_failed" || !round.exists) {
    return "createRound";
  }
  if (round.status === "open" && toBigInt(round.funded) === 0n) return "fundRound";
  if (round.status === "open" || round.status === "funded") return "watchContributions";
  if (round.status === "scoring") return "finalizeRound";
  return "settled";
}

export function managerNextActionLabel(action: ManagerNextAction) {
  const labels: Record<ManagerNextAction, string> = {
    createRound: "创建 Round",
    fundRound: "Treasury 注资",
    watchContributions: "监控贡献",
    finalizeRound: "关闭结算",
    settled: "已结束",
  };
  return labels[action];
}

function compareManagerTodo(a: ManagerActivityCard, b: ManagerActivityCard) {
  const priority = todoPriority(a.nextManagerAction) - todoPriority(b.nextManagerAction);
  if (priority !== 0) return priority;
  return compareActivities(a, b);
}

function todoPriority(action: ManagerNextAction) {
  if (action === "finalizeRound") return 0;
  if (action === "fundRound") return 1;
  if (action === "createRound") return 2;
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
