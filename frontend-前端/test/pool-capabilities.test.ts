import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { derivePoolCapabilities } from "../lib/pool-capabilities";

describe("pool capabilities", () => {
  it("enables finalize only for contract owners when the pool is ready to close", () => {
    const capabilities = derivePoolCapabilities({
      roles: ["contractOwner"],
      round: {
        exists: true,
        finalized: false,
        funded: "100000000",
        totalScore: "10",
      },
      walletConnected: true,
      pending: "0",
    });

    assert.deepEqual(capabilities.finalizeRound, {
      visible: true,
      enabled: true,
    });

    const contributorCapabilities = derivePoolCapabilities({
      roles: ["contributor"],
      round: {
        exists: true,
        finalized: false,
        funded: "100000000",
        totalScore: "10",
      },
      walletConnected: true,
      pending: "0",
    });

    assert.equal(contributorCapabilities.finalizeRound.visible, true);
    assert.equal(contributorCapabilities.finalizeRound.enabled, false);
    assert.equal(contributorCapabilities.finalizeRound.reason, "需要连接合约管理员钱包。");
  });

  it("separates contribution submission from payout claiming", () => {
    const openPool = derivePoolCapabilities({
      roles: ["auditor"],
      round: {
        exists: true,
        finalized: false,
        funded: "100000000",
        totalScore: "0",
      },
      walletConnected: true,
      pending: "0",
    });

    assert.deepEqual(openPool.submitContribution, {
      visible: true,
      enabled: true,
    });
    assert.equal(openPool.claimOwnPayout.enabled, false);
    assert.equal(openPool.claimOwnPayout.reason, "项目方关闭该资金池后才会开放领取。");

    const claimablePool = derivePoolCapabilities({
      roles: ["contributor"],
      round: {
        exists: true,
        finalized: true,
        funded: "100000000",
        totalScore: "10",
      },
      walletConnected: true,
      pending: "1",
    });

    assert.equal(claimablePool.submitContribution.enabled, false);
    assert.deepEqual(claimablePool.claimOwnPayout, {
      visible: true,
      enabled: true,
    });
  });

  it("separates round creation from treasury funding", () => {
    const draftPool = derivePoolCapabilities({
      roles: ["contractOwner"],
      round: null,
      walletConnected: true,
      pending: "0",
      coboReady: true,
    });

    assert.deepEqual(draftPool.createRound, {
      visible: true,
      enabled: true,
    });
    assert.equal(draftPool.fundWithCoboTreasury.enabled, false);
    assert.equal(draftPool.fundWithCoboTreasury.reason, "需要先创建链上 Round。");

    const openPool = derivePoolCapabilities({
      roles: ["projectOwner"],
      round: {
        exists: true,
        finalized: false,
        funded: "0",
        totalScore: "0",
      },
      walletConnected: true,
      pending: "0",
      coboReady: true,
    });

    assert.equal(openPool.createRound.enabled, false);
    assert.deepEqual(openPool.fundWithCoboTreasury, {
      visible: true,
      enabled: true,
    });
  });
});
