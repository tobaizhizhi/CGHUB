import { isArchivedRound, type ManagedRound } from "./managed-rounds";

export interface ManagedPoolQuery {
  totalCount: number;
  activeCount: number;
  closeableCount: number;
  claimableCount: number;
  unfundedCount: number;
  totalFunded: string;
  recent: string[];
}

export interface PoolEntrypoints {
  contributionPoolIds: string[];
  claimablePoolIds: string[];
  closeablePoolIds: string[];
  settledPoolIds: string[];
  creatablePoolIds: string[];
  fundablePoolIds: string[];
}

export interface SelectedPoolInput {
  roundRegistryId?: string | string[] | null;
  projectId?: string | string[] | number | bigint | null;
  roundId?: string | string[] | number | bigint | null;
}

export interface ManagedRoundQuery extends Record<string, string> {
  roundRegistryId: string;
  projectId: string;
  roundId: string;
}

export interface PoolActivityFeedItem {
  id: string;
  roundRegistryId: string;
  projectId: string;
  roundId: string;
  activityName: string;
  roundName: string;
  action: "pool_created" | "pool_updated" | "pool_funded" | "pool_scoring" | "pool_finalized" | "pool_closed";
  result: "success" | "pending" | "blocked" | "failed";
  title: string;
  detail: string;
  createdAt: string;
}

export function buildPoolDashboard(rounds: ManagedRound[]): ManagedPoolQuery {
  const totalFunded = rounds.reduce((total, round) => total + toBigInt(round.funded), 0n);
  const active = rounds.filter((round) => !isArchivedRound(round));

  return {
    totalCount: rounds.length,
    activeCount: active.length,
    closeableCount: rounds.filter(isCloseablePool).length,
    claimableCount: rounds.filter((round) => round.status === "finalized").length,
    unfundedCount: rounds.filter((round) => round.status === "open" && toBigInt(round.funded) === 0n).length,
    totalFunded: totalFunded.toString(),
    recent: [...rounds]
      .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))
      .slice(0, 3)
      .map((round) => round.id),
  };
}

export function buildPoolActivityFeed(rounds: ManagedRound[]): PoolActivityFeedItem[] {
  return [...rounds]
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))
    .map((round) => {
      const action = activityActionForStatus(round.status);
      return {
        id: `${round.id}-${round.status}-${round.updatedAt}`,
        roundRegistryId: round.id,
        projectId: round.projectId,
        roundId: round.roundId,
        activityName: round.activityName,
        roundName: round.roundName,
        action,
        result: activityResultForStatus(round.status),
        title: `${round.activityName} / ${round.roundName}`,
        detail: activityDetailForStatus(round),
        createdAt: round.updatedAt,
      };
    });
}

export function resolveSelectedManagedRound(
  rounds: ManagedRound[],
  input: SelectedPoolInput
): ManagedRound | undefined {
  const registryId = firstValue(input.roundRegistryId);
  if (registryId) {
    const byRegistryId = rounds.find((round) => round.id === registryId);
    if (byRegistryId) return byRegistryId;
  }

  const projectId = firstValue(input.projectId);
  const roundId = firstValue(input.roundId);
  if (!projectId || !roundId) return undefined;

  return rounds.find((round) => round.projectId === projectId && round.roundId === roundId);
}

export function managedRoundQuery(round: ManagedRound): ManagedRoundQuery {
  return {
    roundRegistryId: round.id,
    projectId: round.projectId,
    roundId: round.roundId,
  };
}

export function buildPoolEntrypoints(rounds: ManagedRound[]): PoolEntrypoints {
  const activeByUrgency = [...rounds].sort(compareActiveLikeRounds);

  return {
    contributionPoolIds: activeByUrgency.filter(isContributionPool).map((round) => round.id),
    claimablePoolIds: activeByUrgency.filter((round) => round.status === "finalized").map((round) => round.id),
    closeablePoolIds: activeByUrgency.filter(isCloseablePool).map((round) => round.id),
    settledPoolIds: [...rounds]
      .filter((round) => round.status === "closed" || round.status === "archived")
      .sort((a, b) => timestamp(b.archivedAt ?? b.updatedAt) - timestamp(a.archivedAt ?? a.updatedAt))
      .map((round) => round.id),
    creatablePoolIds: activeByUrgency.filter((round) => round.status === "draft").map((round) => round.id),
    fundablePoolIds: activeByUrgency.filter(isFundablePool).map((round) => round.id),
  };
}

function firstValue(value: SelectedPoolInput[keyof SelectedPoolInput]) {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function isCloseablePool(round: ManagedRound) {
  return round.status === "scoring";
}

function isContributionPool(round: ManagedRound) {
  return round.status === "open" || round.status === "funded" || round.status === "scoring";
}

function isFundablePool(round: ManagedRound) {
  return round.status === "open" || round.status === "funded";
}

function compareActiveLikeRounds(a: ManagedRound, b: ManagedRound) {
  const priority = activePriority(a.status) - activePriority(b.status);
  if (priority !== 0) return priority;
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}

function activePriority(status: ManagedRound["status"]) {
  if (status === "finalized") return 0;
  if (status === "scoring") return 1;
  if (status === "funded") return 2;
  if (status === "open") return 3;
  if (status === "draft") return 4;
  return 5;
}

function activityActionForStatus(status: ManagedRound["status"]): PoolActivityFeedItem["action"] {
  if (status === "draft") return "pool_created";
  if (status === "funded") return "pool_funded";
  if (status === "scoring") return "pool_scoring";
  if (status === "finalized") return "pool_finalized";
  if (status === "closed" || status === "archived") return "pool_closed";
  return "pool_updated";
}

function activityResultForStatus(status: ManagedRound["status"]): PoolActivityFeedItem["result"] {
  if (status === "draft") return "pending";
  return "success";
}

function activityDetailForStatus(round: ManagedRound) {
  if (round.status === "draft") return "资金池已登记，等待项目方创建链上 Round。";
  if (round.status === "open") return "资金池已创建，等待 Cobo Treasury 注资或贡献提交。";
  if (round.status === "funded") return "资金池已有注资，可以继续收集贡献。";
  if (round.status === "scoring") return `贡献评分进行中，总分 ${round.totalScore}。`;
  if (round.status === "finalized") return "资金池已关闭，贡献者可以领取分账。";
  if (round.status === "closed") return "资金池已结清。";
  return "资金池已归档。";
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
