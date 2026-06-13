import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildManagerWorkspace,
  deriveManagerNextAction,
} from "../lib/manager-workspace";
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

describe("manager workspace", () => {
  it("keeps admin operations in the manager workspace", () => {
    assert.equal(deriveManagerNextAction(round({ id: "draft", status: "draft", updatedAt: "2026-06-09T07:00:00.000Z" })), "createRound");
    assert.equal(deriveManagerNextAction(round({ id: "open", status: "open", funded: "0", updatedAt: "2026-06-09T08:00:00.000Z" })), "fundRound");
    assert.equal(deriveManagerNextAction(round({ id: "funded", status: "funded", funded: "1", updatedAt: "2026-06-09T09:00:00.000Z" })), "watchContributions");
    assert.equal(deriveManagerNextAction(round({ id: "scoring", status: "scoring", funded: "1", totalScore: "9", updatedAt: "2026-06-09T10:00:00.000Z" })), "finalizeRound");
    assert.equal(deriveManagerNextAction(round({ id: "closed", status: "closed", updatedAt: "2026-06-09T11:00:00.000Z" })), "settled");
  });

  it("builds manager metrics and urgent todo cards", () => {
    const workspace = buildManagerWorkspace([
      round({ id: "draft", status: "draft", updatedAt: "2026-06-09T07:00:00.000Z" }),
      round({ id: "open", status: "open", funded: "0", updatedAt: "2026-06-09T08:00:00.000Z" }),
      round({ id: "scoring", status: "scoring", funded: "1000000", totalScore: "10", updatedAt: "2026-06-09T09:00:00.000Z" }),
      round({ id: "finalized", status: "finalized", funded: "2000000", updatedAt: "2026-06-09T10:00:00.000Z" }),
    ]);

    assert.deepEqual(workspace.todo.map((card) => card.roundRegistryId), ["scoring", "open", "draft"]);
    assert.equal(workspace.metrics.totalActivities, 4);
    assert.equal(workspace.metrics.pendingCreate, 1);
    assert.equal(workspace.metrics.pendingFunding, 1);
    assert.equal(workspace.metrics.pendingFinalize, 1);
    assert.equal(workspace.metrics.totalFunded, "3000000");
  });
});
