import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { JsonAgentRegistry } from '../src/agent-registry.js';

const contributor = '0x1111111111111111111111111111111111111111';

function registryPath() {
  const dir = mkdtempSync(join(tmpdir(), 'cghub-agent-registry-'));
  return {
    path: join(dir, 'agent-registry.json'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createReview(registry: JsonAgentRegistry) {
  return registry.createReview({
    projectId: '1',
    roundId: '1',
    contributor,
    title: 'Persistent review',
    description: 'Contribution body',
    source: 'test',
    evidenceId: 'evidence-1',
    evidenceUrl: 'https://github.com/org/repo/pull/1',
    paymentId: 'payment-1',
    score: 42,
    scoreReason: 'test score',
    evidenceSnapshot: {
      evidenceKey: 'https://github.com/org/repo/pull/1',
      evidenceUrl: 'https://github.com/org/repo/pull/1',
      evidenceId: 'evidence-1',
      type: 'github_pull_request',
      title: 'Persistent review',
      summary: 'PR #1 merged',
      sourceHost: 'github.com',
      fetchedAt: 1781090000000,
      confidence: 1,
      status: 'verified',
      warnings: [],
      github: {
        owner: 'org',
        repo: 'repo',
        number: 1,
        merged: true,
        changedFiles: 2,
        files: ['agent/src/agent-registry.ts'],
      },
    },
    scoreBreakdown: {
      score: 42,
      confidence: 0.9,
      dimensions: [
        {
          key: 'verifiable_output',
          label: '可验证产出',
          points: 24,
          maxPoints: 30,
          reason: 'GitHub PR 已验证且有明确产出',
        },
      ],
      reasons: ['GitHub PR 已验证且有明确产出'],
      riskFlags: ['llm_unavailable'],
      rubricVersion: '2026-06-output-factor-rubric-v2',
      source: 'rule_fallback',
      fallbackScore: 42,
      sanityFlags: ['llm_unavailable'],
      needsHumanReview: true,
    },
    aiScoring: {
      enabled: false,
      provider: 'openai',
      status: 'disabled',
      createdAt: 1781090000000,
    },
    status: 'auto_allowed',
    reasons: ['ok'],
    triggeredRules: [],
  });
}

describe('JsonAgentRegistry', () => {
  it('persists reviews, proof indexes, stats, decisions, and activity events', () => {
    const temp = registryPath();
    try {
      const registry = new JsonAgentRegistry(temp.path);
      const review = createReview(registry);
      registry.attachCoboSignRequest(review.id, {
        proof: { proofHash: '0x' + '11'.repeat(32) },
        coboSignTxId: 'cobo-sign-tx',
        coboApprovalId: 'cobo-approval-id',
        coboApprovalKind: 'contribution_proof',
        coboSignStatus: 'pending',
      });
      registry.attachSignedProof(review.id, {
        proof: { proofHash: '0x' + '11'.repeat(32) },
        signature: '0xsig',
        signerMode: 'cobo',
        signerAddress: contributor,
      });
      registry.attachTxHash(review.id, { txHash: '0xtx', recordTxId: 'record-tx' });
      registry.appendDecision({
        projectId: '1',
        roundId: '1',
        contributor,
        stage: 'recorded',
        result: 'allowed',
        reviewId: review.id,
        txHash: '0xtx',
      });

      const restored = new JsonAgentRegistry(temp.path);
      const restoredReview = restored.getReview(review.id);
      assert.equal(restoredReview?.recorded, true);
      assert.equal(restoredReview?.evidenceSnapshot?.type, 'github_pull_request');
      assert.equal(restoredReview?.scoreBreakdown?.dimensions[0].key, 'verifiable_output');
      assert.equal(restoredReview?.scoreBreakdown?.source, 'rule_fallback');
      assert.equal(restoredReview?.aiScoring?.status, 'disabled');
      assert.equal(restored.findReviewByProofHash('0x' + '11'.repeat(32))?.id, review.id);
      assert.equal(restored.evidenceAlreadyUsed('https://github.com/org/repo/pull/1'), true);
      assert.deepEqual(restored.statsForContributor({ projectId: '1', roundId: '1', contributor }), {
        currentContributorRoundScore: 42,
        contributorSubmissionCount24h: 1,
      });
      assert.equal(restored.listDecisions(10, { projectId: '1', roundId: '1' }).length, 1);
      const events = restored.listActivityEvents({ projectId: '1', roundId: '1', limit: 20 });
      assert.ok(events.length >= 3);
      assert.equal(events.some((event) => event.data?.scoringSource === 'rule_fallback'), true);
      assert.equal(events.some((event) => event.data?.llmStatus === 'disabled'), true);
    } finally {
      temp.cleanup();
    }
  });

  it('clears persisted registry data', () => {
    const temp = registryPath();
    try {
      const registry = new JsonAgentRegistry(temp.path);
      createReview(registry);
      registry.appendDecision({
        projectId: '1',
        roundId: '1',
        contributor,
        stage: 'score',
        result: 'allowed',
        score: 42,
      });

      registry.clear();
      const restored = new JsonAgentRegistry(temp.path);

      assert.deepEqual(restored.listReviews(), []);
      assert.deepEqual(restored.listDecisions(), []);
      assert.deepEqual(restored.listActivityEvents(), []);
    } finally {
      temp.cleanup();
    }
  });
});
