export type RoundDisplayStatus =
  | "draft"
  | "creating"
  | "create_failed"
  | "open"
  | "funded"
  | "scoring"
  | "finalized"
  | "closed"
  | "archived";

export interface ManagedRound {
  id: string;
  projectId: string;
  roundId: string;
  activityName: string;
  activityDescription?: string;
  roundName: string;
  contributionGuide?: string;
  tokenAddress: string;
  tokenSymbol: string;
  ownerAddress: string;
  chainId: number;
  poolAddress: string;
  createTxHash?: string;
  finalizeTxHash?: string;
  status: RoundDisplayStatus;
  funded: string;
  totalScore: string;
  contributorCount: number;
  exists: boolean;
  finalized: boolean;
  createdBy?: string;
  finalizedBy?: string;
  startsAt?: string;
  endsAt?: string;
  endedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ManagedRoundGroups {
  active: ManagedRound[];
  archived: ManagedRound[];
}

const ACTIVE_STATUS_PRIORITY: Record<RoundDisplayStatus, number> = {
  finalized: 0,
  scoring: 1,
  funded: 2,
  open: 3,
  creating: 4,
  draft: 5,
  create_failed: 6,
  closed: 7,
  archived: 8,
};

export const ROUND_STATUS_LABELS: Record<RoundDisplayStatus, string> = {
  draft: "待创建",
  creating: "创建中",
  create_failed: "创建失败",
  open: "开放中",
  funded: "已注资",
  scoring: "评分中",
  finalized: "可领取",
  closed: "已结清",
  archived: "已归档",
};

export function splitManagedRounds(rounds: ManagedRound[]): ManagedRoundGroups {
  const active = rounds
    .filter((round) => !isArchivedRound(round))
    .sort(compareActiveRounds);
  const archived = rounds
    .filter(isArchivedRound)
    .sort(compareArchivedRounds);

  return { active, archived };
}

export function isArchivedRound(round: Pick<ManagedRound, "status">) {
  return round.status === "closed" || round.status === "archived";
}

function compareActiveRounds(a: ManagedRound, b: ManagedRound) {
  const priority = ACTIVE_STATUS_PRIORITY[a.status] - ACTIVE_STATUS_PRIORITY[b.status];
  if (priority !== 0) return priority;
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}

function compareArchivedRounds(a: ManagedRound, b: ManagedRound) {
  const aTime = timestamp(a.archivedAt ?? a.updatedAt);
  const bTime = timestamp(b.archivedAt ?? b.updatedAt);
  return bTime - aTime;
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
