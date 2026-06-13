import {
  buildActivityCards,
  isOngoingStatus,
  type ActivityCard,
} from "./activity-workspace";
import type { ManagedRound } from "./managed-rounds";

export interface ContributorRoundBalance {
  score: string;
  pending: string;
  claimed: string;
}

export type ContributorPersonalState = "connectWallet" | "noActivity" | "hasActivity";

export interface ContributorActivityCard extends ActivityCard {
  myScore: string;
  myPending: string;
  myClaimed: string;
  canSubmit: boolean;
  canClaim: boolean;
  personalState: ContributorPersonalState;
}

export interface ContributorPortfolio {
  totalClaimed: string;
  totalPending: string;
  scoredActivityCount: number;
  activities: ContributorActivityCard[];
}

export interface BuildContributorPortfolioInput {
  rounds: ManagedRound[];
  balances: Record<string, ContributorRoundBalance | undefined>;
  walletConnected?: boolean;
}

export function buildContributorPortfolio(input: BuildContributorPortfolioInput): ContributorPortfolio {
  const walletConnected = input.walletConnected ?? true;
  const activities = buildActivityCards(input.rounds, "contributor")
    .filter((card) => card.status !== "draft")
    .map((card): ContributorActivityCard => {
      const balance = input.balances[card.roundRegistryId] ?? {
        score: "0",
        pending: "0",
        claimed: "0",
      };
      const hasActivity = hasPositiveValue(balance.score) || hasPositiveValue(balance.pending) || hasPositiveValue(balance.claimed);

      return {
        ...card,
        myScore: balance.score,
        myPending: balance.pending,
        myClaimed: balance.claimed,
        canSubmit: walletConnected && isOngoingStatus(card.status),
        canClaim: walletConnected && card.status === "finalized" && hasPositiveValue(balance.pending),
        personalState: walletConnected ? (hasActivity ? "hasActivity" : "noActivity") : "connectWallet",
      };
    });

  return {
    totalClaimed: sumValues(activities.map((activity) => activity.myClaimed)),
    totalPending: sumValues(activities.map((activity) => activity.myPending)),
    scoredActivityCount: activities.filter((activity) => hasPositiveValue(activity.myScore)).length,
    activities,
  };
}

function sumValues(values: string[]) {
  return values.reduce((total, value) => total + toBigInt(value), 0n).toString();
}

function hasPositiveValue(value?: string) {
  return toBigInt(value) > 0n;
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
