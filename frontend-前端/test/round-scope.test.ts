import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeRoundScope, scopeQuery } from "../lib/round-scope";

describe("round scope selection", () => {
  it("uses selected round ids when they are valid", () => {
    assert.deepEqual(
      normalizeRoundScope(
        { projectId: "42", roundId: "7" },
        { projectId: 1, roundId: 1 }
      ),
      { projectId: 42, roundId: 7 }
    );
  });

  it("falls back when route ids are missing or invalid", () => {
    assert.deepEqual(
      normalizeRoundScope(
        { projectId: "not-a-number", roundId: "0" },
        { projectId: 3, roundId: 2 }
      ),
      { projectId: 3, roundId: 2 }
    );
  });

  it("serializes the selected round into stable URL query params", () => {
    assert.deepEqual(scopeQuery({ projectId: 42, roundId: 7 }), {
      projectId: "42",
      roundId: "7",
    });
  });
});
