import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeCoboStatus, type CoboStatusResponse } from "../lib/cobo-status";

describe("summarizeCoboStatus", () => {
  it("summarizes pact status, balances, and pending approvals for display", () => {
    const status: CoboStatusResponse = {
      walletId: "wallet-uuid",
      srcAddress: "0x1111111111111111111111111111111111111111",
      chainId: "SETH",
      tokenId: "SETH_USDC",
      mainPact: {
        id: "main-pact",
        status: "active",
        progressTxCount: 4,
      },
      signPact: {
        id: "sign-pact",
        status: "pending",
      },
      fundPact: {
        id: "fund-pact",
        status: "active",
      },
      guardPact: {
        id: "guard-pact",
        status: "active",
      },
      pactStats: {
        totalPacts: 4,
        activePacts: 3,
        txCount: 5,
        volumeUsd: "12.30",
      },
      balances: [
        { tokenId: "SETH_USDC", balance: "100.5" },
        { tokenId: "SETH", balance: "0.02" },
      ],
      pendingOperations: [
        { id: "pending-1", status: "pending", action: "contract_call" },
      ],
    };

    const summary = summarizeCoboStatus(status);

    assert.equal(summary.walletShort, "0x1111...1111");
    assert.equal(summary.mainPactStatus, "已启用");
    assert.equal(summary.signPactStatus, "待审批");
    assert.equal(summary.fundPactStatus, "已启用");
    assert.equal(summary.guardPactStatus, "已启用");
    assert.equal(summary.balanceLine, "SETH_USDC 100.5 / SETH 0.02");
    assert.equal(summary.pendingApprovalCount, 1);
    assert.equal(summary.pactStatsLine, "3 个启用 / 5 笔 / $12.30");
  });
});
