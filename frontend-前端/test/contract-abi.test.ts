import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import { CONTRIBUTION_POOL_ABI } from "../lib/contract";

describe("ContributionPool frontend ABI", () => {
  it("exposes manager lifecycle methods used by the UI", () => {
    const contract = new ethers.Contract(
      "0x0000000000000000000000000000000000000001",
      CONTRIBUTION_POOL_ABI
    );

    assert.equal(typeof contract.createRound, "function");
    assert.equal(typeof contract.fundRound, "function");
    assert.equal(typeof contract.finalizeRound, "function");
  });
});
