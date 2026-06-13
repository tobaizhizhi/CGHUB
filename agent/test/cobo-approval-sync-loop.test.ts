import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { JsonAgentRegistry } from '../src/agent-registry.js';
import { AgentRegistryContributionReviewStore } from '../src/contribution-review-store.js';
import { runCoboApprovalSyncOnce } from '../src/cobo-approval-sync-loop.js';

const contributor = '0x1111111111111111111111111111111111111111';

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'cghub-cobo-sync-'));
  return {
    store: new AgentRegistryContributionReviewStore(new JsonAgentRegistry(join(dir, 'agent-registry.json'))),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createReview(store: AgentRegistryContributionReviewStore) {
  return store.create({
    projectId: '1',
    roundId: '1',
    contributor,
    title: 'High score',
    description: 'Needs Cobo approval',
    source: 'test',
    evidenceId: 'evidence-sync-loop',
    paymentId: 'payment-sync-loop',
    score: 90,
    scoreReason: 'high score',
    status: 'pending_cobo_approval',
    reasons: ['单条评分 90 > 80'],
    triggeredRules: ['score_threshold'],
    coboSignTxId: 'cobo-sign-tx',
    coboApprovalId: 'cobo-approval-id',
    coboSignStatus: 'pending',
  });
}

describe('Cobo approval sync loop', () => {
  it('leaves pending reviews untouched when Cobo approval is still pending', async () => {
    const { store, cleanup } = tempStore();
    try {
      createReview(store);
      const result = await runCoboApprovalSyncOnce({
        store,
        syncReview: async (review: any) => ({ review, coboPending: true }),
        appendDecision() {},
      });

      assert.deepEqual(result, {
        checked: 1,
        pending: 1,
        recorded: 0,
        rejected: 0,
        errors: 0,
      });
    } finally {
      cleanup();
    }
  });

  it('records automatically after Cobo approval returns a signature', async () => {
    const { store, cleanup } = tempStore();
    try {
      const review = createReview(store);
      const decisions: any[] = [];
      const result = await runCoboApprovalSyncOnce({
        store,
        syncReview: async () => {
          const approved = store.updateStatus(review.id, { status: 'cobo_approved' });
          store.attachSignedProof(review.id, {
            proof: { proofHash: '0x' + '22'.repeat(32) },
            signature: '0xsig',
            signerMode: 'cobo',
            signerAddress: contributor,
          });
          const recorded = store.attachTxHash(review.id, {
            txHash: '0xrecorded',
            recordTxId: 'record-tx',
          });
          return { review: { ...recorded, signerAddress: approved.signerAddress ?? contributor }, txHash: '0xrecorded' };
        },
        appendDecision(event) {
          decisions.push(event);
        },
      });

      assert.equal(result.recorded, 1);
      assert.equal(store.get(review.id)?.status, 'cobo_approved');
      assert.equal(store.get(review.id)?.txHash, '0xrecorded');
      assert.deepEqual(decisions.map((event) => event.stage), ['cobo_approval', 'signed', 'recorded']);
    } finally {
      cleanup();
    }
  });

  it('backs off failed reviews before retrying them again', async () => {
    const { store, cleanup } = tempStore();
    try {
      const review = createReview(store);
      const retryState = new Map<string, { attempts: number; nextAttemptAt: number }>();
      let calls = 0;

      const first = await runCoboApprovalSyncOnce({
        store,
        retryState,
        now: 1_000,
        retryBaseMs: 30_000,
        syncReview: async () => {
          calls += 1;
          throw new Error('temporary cobo error');
        },
        appendDecision() {},
      });

      assert.equal(first.checked, 1);
      assert.equal(first.errors, 1);
      assert.equal(calls, 1);
      assert.equal(retryState.get(review.id)?.attempts, 1);
      assert.equal(retryState.get(review.id)?.nextAttemptAt, 31_000);

      const skipped = await runCoboApprovalSyncOnce({
        store,
        retryState,
        now: 2_000,
        retryBaseMs: 30_000,
        syncReview: async () => {
          calls += 1;
          return { review };
        },
        appendDecision() {},
      });

      assert.equal(skipped.checked, 0);
      assert.equal(calls, 1);

      const retried = await runCoboApprovalSyncOnce({
        store,
        retryState,
        now: 31_000,
        retryBaseMs: 30_000,
        syncReview: async () => {
          calls += 1;
          return { review, coboPending: true };
        },
        appendDecision() {},
      });

      assert.equal(retried.checked, 1);
      assert.equal(retried.pending, 1);
      assert.equal(calls, 2);
      assert.equal(retryState.has(review.id), false);
    } finally {
      cleanup();
    }
  });
});
