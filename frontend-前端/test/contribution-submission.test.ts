import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildContributionScoringDescription,
  contributionEvidenceId,
  type ContributionFormValues,
} from "../lib/contribution-submission";

const contribution: ContributionFormValues = {
  title: "完成活动报名页开发",
  contributionType: "代码开发",
  description: "实现报名表单、活动列表状态和错误提示。",
  evidenceUrl: "https://github.com/org/repo/pull/123",
  impactScale: "1 个 PR，3 个页面",
  occurredAt: "2026-06-09",
};

describe("contribution submission payload", () => {
  it("keeps all contributor fields in the Agent scoring context", () => {
    const description = buildContributionScoringDescription(contribution);

    assert.match(description, /贡献类型：代码开发/);
    assert.match(description, /贡献说明：实现报名表单/);
    assert.match(description, /证据链接：https:\/\/github.com\/org\/repo\/pull\/123/);
    assert.match(description, /成果规模：1 个 PR，3 个页面/);
    assert.match(description, /发生时间：2026-06-09/);
  });

  it("uses evidence link as the contribution evidence id when present", () => {
    assert.equal(contributionEvidenceId(contribution, "fallback"), contribution.evidenceUrl);
    assert.equal(contributionEvidenceId({ evidenceUrl: " " }, "fallback"), "fallback");
  });
});
