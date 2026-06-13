import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fundRoundFromCoboTreasury,
  getDecisions,
  getContributionReviews,
  getRounds,
  getPending,
  requestMoreEvidence,
  signContribution,
  triggerClaim,
} from "../lib/agent-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captureJsonFetch() {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return requests;
}

describe("Agent API round scope", () => {
  it("loads managed funding pools from the Agent round registry", async () => {
    const requests = captureJsonFetch();

    await getRounds();

    const url = new URL(requests[0].url);
    assert.equal(url.pathname, "/api/rounds");
  });

  it("sends selected round ids when signing a contribution", async () => {
    const requests = captureJsonFetch();

    await signContribution({
      projectId: "42",
      roundId: "7",
      contributor: "0x1111111111111111111111111111111111111111",
      title: "Round scoped contribution",
      contributionType: "代码开发",
      description: "This contribution belongs to a selected round.",
      evidenceUrl: "https://github.com/org/repo/pull/123",
      impactScale: "1 个 PR",
      occurredAt: "2026-06-09",
      source: "frontend",
      evidenceId: "evidence-1",
    });

    assert.equal(requests[0].body?.projectId, "42");
    assert.equal(requests[0].body?.roundId, "7");
    assert.equal(requests[0].body?.contributionType, "代码开发");
    assert.equal(requests[0].body?.evidenceUrl, "https://github.com/org/repo/pull/123");
    assert.equal(requests[0].body?.impactScale, "1 个 PR");
    assert.equal(requests[0].body?.occurredAt, "2026-06-09");
  });

  it("sends selected round ids when triggering a claim", async () => {
    const requests = captureJsonFetch();

    await triggerClaim({
      projectId: "42",
      roundId: "7",
      contributor: "0x1111111111111111111111111111111111111111",
    });

    assert.equal(requests[0].body?.projectId, "42");
    assert.equal(requests[0].body?.roundId, "7");
  });

  it("sends selected round ids when funding from Cobo treasury", async () => {
    const requests = captureJsonFetch();

    await fundRoundFromCoboTreasury("100", { projectId: "42", roundId: "7" });

    assert.equal(requests[0].body?.amount, "100");
    assert.equal(requests[0].body?.projectId, "42");
    assert.equal(requests[0].body?.roundId, "7");
  });

  it("sends selected round ids when reading pending payouts", async () => {
    const requests = captureJsonFetch();

    await getPending("0x1111111111111111111111111111111111111111", {
      projectId: "42",
      roundId: "7",
    });

    const url = new URL(requests[0].url);
    assert.equal(url.searchParams.get("projectId"), "42");
    assert.equal(url.searchParams.get("roundId"), "7");
  });

  it("sends selected round ids when reading Agent decisions", async () => {
    const requests = captureJsonFetch();

    await getDecisions(30, { projectId: "42", roundId: "7" });

    const url = new URL(requests[0].url);
    assert.equal(url.pathname, "/api/decisions");
    assert.equal(url.searchParams.get("limit"), "30");
    assert.equal(url.searchParams.get("projectId"), "42");
    assert.equal(url.searchParams.get("roundId"), "7");
  });

  it("loads pending contribution reviews for the selected round", async () => {
    const requests = captureJsonFetch();

    await getContributionReviews({ status: "pending_cobo_approval", projectId: "42", roundId: "7", limit: 10 });

    const url = new URL(requests[0].url);
    assert.equal(url.pathname, "/api/reviews");
    assert.equal(url.searchParams.get("status"), "pending_cobo_approval");
    assert.equal(url.searchParams.get("projectId"), "42");
    assert.equal(url.searchParams.get("roundId"), "7");
    assert.equal(url.searchParams.get("limit"), "10");
  });

  it("sends evidence requests to the Agent API", async () => {
    const requests = captureJsonFetch();

    await requestMoreEvidence("review-3", { reviewer: "0xabc" });

    assert.equal(new URL(requests[0].url).pathname, "/api/reviews/review-3/needs-more-evidence");
    assert.equal(requests[0].body?.reviewer, "0xabc");
  });
});
