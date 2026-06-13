import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { splitManagedRounds, type ManagedRound } from "../lib/managed-rounds";

function round(input: Partial<ManagedRound> & Pick<ManagedRound, "id" | "status" | "updatedAt">): ManagedRound {
  return {
    id: input.id,
    projectId: input.projectId ?? "1",
    roundId: input.roundId ?? "1",
    activityName: input.activityName ?? "CGHub Hackathon",
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

describe("managed round list", () => {
  it("puts active pools above closed pools and sorts active pools by urgency", () => {
    const groups = splitManagedRounds([
      round({ id: "closed-new", status: "closed", updatedAt: "2026-06-09T10:00:00.000Z" }),
      round({ id: "open", status: "open", updatedAt: "2026-06-09T12:00:00.000Z" }),
      round({ id: "scoring-old", status: "scoring", updatedAt: "2026-06-09T09:00:00.000Z" }),
      round({ id: "archived-old", status: "archived", updatedAt: "2026-06-08T10:00:00.000Z" }),
      round({ id: "claimable", status: "finalized", updatedAt: "2026-06-09T08:00:00.000Z" }),
      round({ id: "scoring-new", status: "scoring", updatedAt: "2026-06-09T11:00:00.000Z" }),
    ]);

    assert.deepEqual(groups.active.map((item) => item.id), [
      "claimable",
      "scoring-new",
      "scoring-old",
      "open",
    ]);
    assert.deepEqual(groups.archived.map((item) => item.id), ["closed-new", "archived-old"]);
  });
});
