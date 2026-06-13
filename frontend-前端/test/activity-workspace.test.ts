import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  activityDetailHref,
  buildActivityCards,
  splitActivityCards,
} from "../lib/activity-workspace";
import type { ManagedRound } from "../lib/managed-rounds";

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

describe("activity workspace", () => {
  it("builds audience-specific activity detail links", () => {
    const item = round({ id: "round-a", status: "open", updatedAt: "2026-06-09T08:00:00.000Z" });

    assert.equal(activityDetailHref(item, "project"), "/project/activities/round-a");
    assert.equal(activityDetailHref(item, "contributor"), "/contributor/activities/round-a");
    assert.equal(activityDetailHref(item, "manager"), "/manager/activities/round-a");
  });

  it("groups contributor-visible activities into ongoing and ended", () => {
    const cards = buildActivityCards(
      [
        round({ id: "draft", status: "draft", updatedAt: "2026-06-09T07:00:00.000Z" }),
        round({ id: "open", status: "open", updatedAt: "2026-06-09T08:00:00.000Z" }),
        round({ id: "funded", status: "funded", updatedAt: "2026-06-09T09:00:00.000Z" }),
        round({ id: "scoring", status: "scoring", updatedAt: "2026-06-09T10:00:00.000Z" }),
        round({ id: "finalized", status: "finalized", updatedAt: "2026-06-09T11:00:00.000Z" }),
        round({ id: "closed", status: "closed", updatedAt: "2026-06-09T12:00:00.000Z" }),
      ],
      "contributor"
    );

    const groups = splitActivityCards(cards, { includeDraft: false });

    assert.deepEqual(groups.upcoming.map((card) => card.roundRegistryId), []);
    assert.deepEqual(groups.ongoing.map((card) => card.roundRegistryId), ["scoring", "funded", "open"]);
    assert.deepEqual(groups.ended.map((card) => card.roundRegistryId), ["closed", "finalized"]);
  });

  it("keeps draft activities visible for project management", () => {
    const cards = buildActivityCards(
      [
        round({ id: "draft", status: "draft", updatedAt: "2026-06-09T07:00:00.000Z" }),
        round({ id: "open", status: "open", updatedAt: "2026-06-09T08:00:00.000Z" }),
      ],
      "project"
    );

    const groups = splitActivityCards(cards, { includeDraft: true });

    assert.deepEqual(groups.upcoming.map((card) => card.roundRegistryId), ["draft"]);
    assert.deepEqual(groups.ongoing.map((card) => card.roundRegistryId), ["open"]);
  });
});
