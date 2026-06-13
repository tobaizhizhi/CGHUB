import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildContributorPortfolio,
  type ContributorRoundBalance,
} from "../lib/contributor-workspace";
import type { ManagedRound } from "../lib/managed-rounds";

function round(input: Partial<ManagedRound> & Pick<ManagedRound, "id" | "status" | "updatedAt">): ManagedRound {
  return {
    id: input.id,
    projectId: input.projectId ?? input.id,
    roundId: input.roundId ?? "1",
    activityName: input.activityName ?? input.id,
    roundName: input.roundName ?? "第一轮",
    tokenAddress: input.tokenAddress ?? "0x0000000000000000000000000000000000000001",
    tokenSymbol: input.tokenSymbol ?? "USDC",
    ownerAddress: input.ownerAddress ?? "0x1111111111111111111111111111111111111111",
    chainId: input.chainId ?? 11155111,
    poolAddress: input.poolAddress ?? "0x2222222222222222222222222222222222222222",
    status: input.status,
    funded: input.funded ?? "0",
    totalScore: input.totalScore ?? "0",
    contributorCount: input.contributorCount ?? 0,
    exists: input.exists ?? true,
    finalized: input.finalized ?? false,
    createdAt: input.createdAt ?? input.updatedAt,
    updatedAt: input.updatedAt,
    archivedAt: input.archivedAt,
  };
}

describe("contributor workspace", () => {
  it("aggregates claimed and pending balances across activities", () => {
    const balances: Record<string, ContributorRoundBalance> = {
      open: { score: "15", pending: "0", claimed: "1000000" },
      finalized: { score: "30", pending: "500000", claimed: "2000000" },
    };

    const portfolio = buildContributorPortfolio({
      rounds: [
        round({ id: "open", status: "open", funded: "10000000", updatedAt: "2026-06-09T08:00:00.000Z" }),
        round({ id: "finalized", status: "finalized", funded: "20000000", updatedAt: "2026-06-09T09:00:00.000Z" }),
      ],
      balances,
    });

    assert.equal(portfolio.totalClaimed, "3000000");
    assert.equal(portfolio.totalPending, "500000");
    assert.equal(portfolio.activities.find((item) => item.roundRegistryId === "open")?.canSubmit, true);
    assert.equal(portfolio.activities.find((item) => item.roundRegistryId === "finalized")?.canClaim, true);
  });

  it("keeps public activities visible when the wallet is not connected", () => {
    const portfolio = buildContributorPortfolio({
      rounds: [
        round({ id: "funded", status: "funded", updatedAt: "2026-06-09T09:00:00.000Z" }),
      ],
      balances: {},
      walletConnected: false,
    });

    assert.equal(portfolio.activities.length, 1);
    assert.equal(portfolio.activities[0].personalState, "connectWallet");
    assert.equal(portfolio.activities[0].myScore, "0");
    assert.equal(portfolio.activities[0].canSubmit, false);
  });
});
