import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPoolDashboard,
  buildPoolEntrypoints,
  buildPoolActivityFeed,
  managedRoundQuery,
  resolveSelectedManagedRound,
  type ManagedPoolQuery,
} from "../lib/pool-workspace";
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

describe("pool workspace product logic", () => {
  it("builds a global dashboard from every managed pool", () => {
    const dashboard = buildPoolDashboard([
      round({
        id: "open-unfunded",
        status: "open",
        funded: "0",
        updatedAt: "2026-06-09T08:00:00.000Z",
      }),
      round({
        id: "scoring-ready",
        status: "scoring",
        funded: "100000000",
        totalScore: "80",
        updatedAt: "2026-06-09T10:00:00.000Z",
      }),
      round({
        id: "claimable",
        status: "finalized",
        funded: "50000000",
        updatedAt: "2026-06-09T09:00:00.000Z",
      }),
      round({
        id: "closed",
        status: "closed",
        funded: "30000000",
        updatedAt: "2026-06-08T10:00:00.000Z",
      }),
    ]);

    const expected: ManagedPoolQuery = {
      totalCount: 4,
      activeCount: 3,
      closeableCount: 1,
      claimableCount: 1,
      unfundedCount: 1,
      totalFunded: "180000000",
      recent: ["scoring-ready", "claimable", "open-unfunded"],
    };

    assert.deepEqual(dashboard, expected);
  });

  it("classifies pools for contribution, payout, and treasury entry pages", () => {
    const entrypoints = buildPoolEntrypoints([
      round({ id: "draft", status: "draft", updatedAt: "2026-06-09T07:00:00.000Z" }),
      round({ id: "open", status: "open", updatedAt: "2026-06-09T08:00:00.000Z" }),
      round({ id: "funded", status: "funded", updatedAt: "2026-06-09T09:00:00.000Z" }),
      round({ id: "scoring", status: "scoring", updatedAt: "2026-06-09T10:00:00.000Z" }),
      round({ id: "finalized", status: "finalized", updatedAt: "2026-06-09T11:00:00.000Z" }),
      round({ id: "closed", status: "closed", updatedAt: "2026-06-09T12:00:00.000Z" }),
    ]);

    assert.deepEqual(entrypoints.contributionPoolIds, ["scoring", "funded", "open"]);
    assert.deepEqual(entrypoints.claimablePoolIds, ["finalized"]);
    assert.deepEqual(entrypoints.closeablePoolIds, ["scoring"]);
    assert.deepEqual(entrypoints.settledPoolIds, ["closed"]);
    assert.deepEqual(entrypoints.creatablePoolIds, ["draft"]);
    assert.deepEqual(entrypoints.fundablePoolIds, ["funded", "open"]);
  });

  it("resolves the selected pool from registry id before falling back to chain ids", () => {
    const rounds = [
      round({
        id: "hackathon-r1",
        projectId: "1",
        roundId: "1",
        status: "open",
        updatedAt: "2026-06-09T08:00:00.000Z",
      }),
      round({
        id: "sprint-r2",
        projectId: "2",
        roundId: "7",
        status: "funded",
        updatedAt: "2026-06-09T09:00:00.000Z",
      }),
    ];

    assert.equal(
      resolveSelectedManagedRound(rounds, {
        roundRegistryId: "sprint-r2",
        projectId: "1",
        roundId: "1",
      })?.id,
      "sprint-r2"
    );
    assert.equal(resolveSelectedManagedRound(rounds, { projectId: "1", roundId: "1" })?.id, "hackathon-r1");
    assert.equal(resolveSelectedManagedRound(rounds, {})?.id, undefined);
    assert.deepEqual(managedRoundQuery(rounds[1]), {
      roundRegistryId: "sprint-r2",
      projectId: "2",
      roundId: "7",
    });
  });

  it("builds a global activity feed where every item keeps its pool identity", () => {
    const feed = buildPoolActivityFeed([
      round({
        id: "old-open",
        projectId: "1",
        roundId: "1",
        activityName: "CGHub Hackathon",
        roundName: "第一轮",
        status: "open",
        updatedAt: "2026-06-09T08:00:00.000Z",
      }),
      round({
        id: "new-claimable",
        projectId: "2",
        roundId: "7",
        activityName: "Open Source Sprint",
        roundName: "六月结算",
        status: "finalized",
        updatedAt: "2026-06-09T10:00:00.000Z",
      }),
    ]);

    assert.equal(feed[0].roundRegistryId, "new-claimable");
    assert.equal(feed[0].projectId, "2");
    assert.equal(feed[0].roundId, "7");
    assert.equal(feed[0].activityName, "Open Source Sprint");
    assert.equal(feed[0].roundName, "六月结算");
    assert.equal(feed[0].result, "success");
    assert.equal(feed[1].roundRegistryId, "old-open");
  });
});
