import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildActivityTimeline,
  buildContributorSnapshots,
  buildPayoutRows,
  deriveRoundStatus,
  formatActivityAction,
  formatActivityResult,
  formatRoundStatus,
  getNextAction,
} from "../lib/settlement-workspace";

describe("deriveRoundStatus", () => {
  it("describes the round lifecycle from draft to closed", () => {
    assert.equal(deriveRoundStatus(null, "0"), "Draft");
    assert.equal(
      deriveRoundStatus({ exists: true, funded: "0", totalScore: "0", finalized: false }, "0"),
      "Open"
    );
    assert.equal(
      deriveRoundStatus({ exists: true, funded: "100000000", totalScore: "0", finalized: false }, "0"),
      "Funded"
    );
    assert.equal(
      deriveRoundStatus({ exists: true, funded: "100000000", totalScore: "25", finalized: false }, "0"),
      "Scoring"
    );
    assert.equal(
      deriveRoundStatus({ exists: true, funded: "100000000", totalScore: "25", finalized: true }, "1"),
      "Finalized"
    );
    assert.equal(
      deriveRoundStatus({ exists: true, funded: "100000000", totalScore: "25", finalized: true }, "0"),
      "Closed"
    );
  });
});

describe("display formatters", () => {
  it("formats internal settlement states as Chinese UI labels", () => {
    assert.equal(formatRoundStatus("Draft"), "待创建");
    assert.equal(formatRoundStatus("Open"), "开放中");
    assert.equal(formatRoundStatus("Funded"), "已注资");
    assert.equal(formatRoundStatus("Scoring"), "评分中");
    assert.equal(formatRoundStatus("Finalized"), "可领取");
    assert.equal(formatRoundStatus("Closed"), "已结清");
    assert.equal(formatActivityResult("blocked"), "已拦截");
    assert.equal(formatActivityAction("wallet_policy_blocked"), "钱包策略拦截");
  });
});

describe("buildActivityTimeline", () => {
  it("combines settlement events into a user-readable activity timeline", () => {
    const timeline = buildActivityTimeline({
      poolActivities: [
        {
          id: "funded-1",
          type: "funded",
          title: "Round 已注资",
          detail: "amount=100000000",
          txHash: "0xfund",
          blockNumber: 10,
          amount: "100000000",
          ts: 3000,
        },
        {
          id: "claimed-1",
          type: "claimed",
          title: "分账已领取",
          detail: "amount=25000000",
          txHash: "0xclaim",
          blockNumber: 12,
          contributor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          amount: "25000000",
          ts: 5000,
        },
      ],
      decisions: [
        {
          id: "score-1",
          stage: "score",
          result: "allowed",
          contributor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          score: 42,
          reason: "merged frontend work",
          ts: 4000,
        },
      ],
      auditItems: [
        {
          result: "denied",
          action: "transferTokens",
          principal_id: "agent",
          created_at: "1970-01-01T00:00:06.000Z",
          reason: "amount_gt 100",
        },
      ],
    });

    assert.deepEqual(
      timeline.map((item) => ({
        action: item.action,
        result: item.result,
        title: item.title,
        amount: item.amount,
        score: item.score,
      })),
      [
        {
          action: "wallet_policy_blocked",
          result: "blocked",
          title: "钱包策略拦截了 transferTokens",
          amount: undefined,
          score: undefined,
        },
        {
          action: "payout_claimed",
          result: "success",
          title: "0xaaaa...aaaa 已领取 25 USDC",
          amount: "25 USDC",
          score: undefined,
        },
        {
          action: "contribution_scored",
          result: "success",
          title: "Agent 已为 0xaaaa...aaaa 评分",
          amount: undefined,
          score: "42",
        },
        {
          action: "round_funded",
          result: "success",
          title: "本轮已注资 100 USDC",
          amount: "100 USDC",
          score: undefined,
        },
      ]
    );
  });
});

describe("buildPayoutRows", () => {
  it("builds payout preview rows from scores and funded amount", () => {
    const rows = buildPayoutRows({
      funded: "100000000",
      totalScore: "100",
      contributors: [
        {
          address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          score: "40",
          claimed: "10000000",
          pending: "30000000",
        },
        {
          address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          score: "60",
          claimed: "0",
          pending: "60000000",
        },
      ],
    });

    assert.deepEqual(rows, [
      {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortAddress: "0xaaaa...aaaa",
        score: "40",
        shareBps: 4000,
        estimated: "40 USDC",
        claimed: "10 USDC",
        pending: "30 USDC",
      },
      {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        shortAddress: "0xbbbb...bbbb",
        score: "60",
        shareBps: 6000,
        estimated: "60 USDC",
        claimed: "0 USDC",
        pending: "60 USDC",
      },
    ]);
  });
});

describe("buildContributorSnapshots", () => {
  it("overrides the connected wallet with contract state when event history is incomplete", () => {
    const rows = buildContributorSnapshots({
      activities: [
        {
          id: "contribution-1",
          type: "contribution",
          title: "贡献已记录",
          detail: "score=20",
          txHash: "0x1",
          blockNumber: 1,
          contributor: "0x6f933fdc96ee0bdef306621c739ffdfc846c681a",
          score: "20",
        },
        {
          id: "contribution-2",
          type: "contribution",
          title: "贡献已记录",
          detail: "score=92",
          txHash: "0x2",
          blockNumber: 2,
          contributor: "0x6f933fdc96ee0bdef306621c739ffdfc846c681a",
          score: "92",
        },
      ],
      walletAddress: "0x6f933fdc96Ee0BDEF306621C739ffdFc846c681a",
      walletScore: "1346",
      walletClaimed: "87859",
      walletPending: "0",
    });

    assert.deepEqual(rows, [
      {
        address: "0x6f933fdc96Ee0BDEF306621C739ffdFc846c681a",
        score: "1346",
        claimed: "87859",
        pending: "0",
      },
    ]);
  });

  it("normalizes wallet address casing instead of duplicating the same contributor", () => {
    const rows = buildContributorSnapshots({
      activities: [
        {
          id: "contribution-1",
          type: "contribution",
          title: "贡献已记录",
          detail: "score=20",
          txHash: "0x1",
          blockNumber: 1,
          contributor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          score: "20",
        },
      ],
      walletAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      walletScore: "42",
      walletClaimed: "5",
      walletPending: "7",
    });

    assert.deepEqual(rows, [
      {
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        score: "42",
        claimed: "5",
        pending: "7",
      },
    ]);
  });
});

describe("getNextAction", () => {
  it("gives owners and contributors the next useful settlement action", () => {
    assert.deepEqual(getNextAction("owner", "Draft"), {
      label: "创建 Round",
      href: "/manager",
      kind: "primary",
    });
    assert.deepEqual(getNextAction("owner", "Funded"), {
      label: "监控贡献",
      href: "/manager",
      kind: "secondary",
    });
    assert.deepEqual(getNextAction("owner", "Scoring"), {
      label: "关闭结算",
      href: "/manager",
      kind: "primary",
    });
    assert.deepEqual(getNextAction("contributor", "Draft"), {
      label: "查看 Round 状态",
      href: "/",
      kind: "secondary",
    });
    assert.deepEqual(getNextAction("contributor", "Open"), {
      label: "提交贡献",
      href: "/contributor",
      kind: "primary",
    });
    assert.deepEqual(getNextAction("contributor", "Finalized"), {
      label: "领取分账",
      href: "/contributor",
      kind: "primary",
    });
    assert.deepEqual(getNextAction("readOnly", "Scoring"), {
      label: "查看活动",
      href: "/activity",
      kind: "secondary",
    });
  });
});
