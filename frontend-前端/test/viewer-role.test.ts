import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveViewerIdentity } from "../lib/viewer-role";

describe("viewer role", () => {
  it("treats a connected wallet without pool evidence as an auditor, not a contributor", () => {
    const identity = deriveViewerIdentity({
      walletAddress: "0x1111111111111111111111111111111111111111",
    });

    assert.equal(identity.primaryRole, "auditor");
    assert.deepEqual(identity.roles, ["auditor"]);
    assert.equal(identity.roles.includes("contributor"), false);
  });

  it("keeps project, contract, and contributor roles separate for the same wallet", () => {
    const identity = deriveViewerIdentity({
      walletAddress: "0x1111111111111111111111111111111111111111",
      projectOwnerAddress: "0x1111111111111111111111111111111111111111",
      contractOwnerAddress: "0x1111111111111111111111111111111111111111",
      score: "5",
    });

    assert.equal(identity.primaryRole, "contractOwner");
    assert.deepEqual(identity.roles, ["contractOwner", "projectOwner", "contributor"]);
    assert.equal(identity.label, "合约管理员 + 项目方 + 贡献者");
  });
});
