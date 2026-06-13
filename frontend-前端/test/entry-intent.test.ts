import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ENTRY_INTENT_OPTIONS, entryIntentHref, suggestEntryIntent } from "../lib/entry-intent";

describe("entry intent", () => {
  it("exposes project, contributor, and manager entry choices", () => {
    assert.deepEqual(
      ENTRY_INTENT_OPTIONS.map((option) => option.intent),
      ["project", "contributor", "manager"]
    );
  });

  it("routes each entry intent to its dedicated workspace", () => {
    assert.equal(entryIntentHref("project"), "/project");
    assert.equal(entryIntentHref("contributor"), "/contributor");
    assert.equal(entryIntentHref("manager"), "/manager");
  });

  it("suggests an entry intent without granting permissions", () => {
    assert.equal(
      suggestEntryIntent({
        walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contractOwnerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
      "manager"
    );
    assert.equal(
      suggestEntryIntent({
        walletAddress: "0x1111111111111111111111111111111111111111",
        projectOwnerAddress: "0x1111111111111111111111111111111111111111",
      }),
      "project"
    );
    assert.equal(suggestEntryIntent({ walletAddress: "0x2222222222222222222222222222222222222222", pending: "1" }), "contributor");
    assert.equal(suggestEntryIntent({ walletAddress: "0x3333333333333333333333333333333333333333" }), "contributor");
  });
});
