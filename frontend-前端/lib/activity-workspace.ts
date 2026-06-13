import {
  ROUND_STATUS_LABELS,
  type ManagedRound,
  type RoundDisplayStatus,
} from "./managed-rounds";

export type ActivityAudience = "project" | "contributor" | "manager";

export interface ActivityCard {
  roundRegistryId: string;
  projectId: string;
  roundId: string;
  activityName: string;
  activityDescription?: string;
  roundName: string;
  contributionGuide?: string;
  status: RoundDisplayStatus;
  statusLabel: string;
  funded: string;
  totalScore: string;
  contributorCount: number;
  projectOwnerAddress: string;
  poolAddress: string;
  tokenSymbol: string;
  updatedAt: string;
  isUpcoming: boolean;
  isOngoing: boolean;
  isEnded: boolean;
  href: string;
}

export interface ActivityCardGroups<T extends ActivityCard = ActivityCard> {
  upcoming: T[];
  ongoing: T[];
  ended: T[];
}

export function activityDetailHref(round: Pick<ManagedRound, "id">, audience: ActivityAudience) {
  return `/${audience}/activities/${encodeURIComponent(round.id)}`;
}

export function buildActivityCards(rounds: ManagedRound[], audience: ActivityAudience): ActivityCard[] {
  return rounds.map((round) => ({
    roundRegistryId: round.id,
    projectId: round.projectId,
    roundId: round.roundId,
    activityName: round.activityName,
    activityDescription: round.activityDescription,
    roundName: round.roundName,
    contributionGuide: round.contributionGuide,
    status: round.status,
    statusLabel: ROUND_STATUS_LABELS[round.status],
    funded: round.funded,
    totalScore: round.totalScore,
    contributorCount: round.contributorCount,
    projectOwnerAddress: round.ownerAddress,
    poolAddress: round.poolAddress,
    tokenSymbol: round.tokenSymbol,
    updatedAt: round.updatedAt,
    isUpcoming: isUpcomingStatus(round.status),
    isOngoing: isOngoingStatus(round.status),
    isEnded: isEndedStatus(round.status),
    href: activityDetailHref(round, audience),
  }));
}

export function splitActivityCards<T extends ActivityCard>(
  cards: T[],
  options: { includeDraft?: boolean } = {}
): ActivityCardGroups<T> {
  const upcoming = options.includeDraft
    ? cards.filter((card) => card.isUpcoming).sort(compareActivities)
    : [];

  return {
    upcoming,
    ongoing: cards.filter((card) => card.isOngoing).sort(compareActivities),
    ended: cards.filter((card) => card.isEnded).sort(compareRecentActivities),
  };
}

export function isUpcomingStatus(status: RoundDisplayStatus) {
  return status === "draft" || status === "creating" || status === "create_failed";
}

export function isOngoingStatus(status: RoundDisplayStatus) {
  return status === "open" || status === "funded" || status === "scoring";
}

export function isEndedStatus(status: RoundDisplayStatus) {
  return status === "finalized" || status === "closed" || status === "archived";
}

export function compareActivities<T extends Pick<ActivityCard, "status" | "updatedAt">>(a: T, b: T) {
  const priority = activityPriority(a.status) - activityPriority(b.status);
  if (priority !== 0) return priority;
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}

function activityPriority(status: RoundDisplayStatus) {
  if (status === "scoring") return 0;
  if (status === "funded") return 1;
  if (status === "open") return 2;
  if (status === "creating") return 3;
  if (status === "draft") return 4;
  if (status === "create_failed") return 5;
  if (status === "finalized") return 6;
  if (status === "closed") return 7;
  return 8;
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareRecentActivities<T extends Pick<ActivityCard, "updatedAt">>(a: T, b: T) {
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}
