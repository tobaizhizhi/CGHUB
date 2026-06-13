import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { JsonAgentRegistry } from '../src/agent-registry.js';
import { AgentRegistryContributionReviewStore } from '../src/contribution-review-store.js';

const contributor = '0x1111111111111111111111111111111111111111';

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'cghub-review-store-'));
  return {
    store: new AgentRegistryContributionReviewStore(new JsonAgentRegistry(join(dir, 'agent-registry.json'))),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('contributionReviewStore', () => {
  it('tracks contributor score, submission count, evidence reuse, and proofHash index', () => {
    const { store, cleanup } = tempStore();
    try {
      const record = store.create({
        projectId: '1',
        roundId: '1',
        contributor,
        title: 'Review me',
        description: 'Contribution body',
        source: 'test',
        evidenceId: 'evidence-1',
        evidenceUrl: 'https://github.com/org/repo/pull/1',
        paymentId: 'payment-1',
        score: 42,
        scoreReason: 'test score',
        status: 'auto_allowed',
        reasons: ['ok'],
        triggeredRules: [],
      });

      const signed = store.attachSignedProof(record.id, {
        proof: { proofHash: '0x' + '11'.repeat(32) },
        signature: '0xsig',
        signerMode: 'cobo',
        signerAddress: contributor,
      });
      store.attachTxHash(record.id, { txHash: '0xtx', recordTxId: 'tx-id' });

      assert.equal(signed.signature, '0xsig');
      assert.equal(store.evidenceAlreadyUsed('https://github.com/org/repo/pull/1'), true);
      assert.equal(store.findByProofHash('0x' + '11'.repeat(32))?.id, record.id);
      assert.deepEqual(store.statsForContributor({ projectId: '1', roundId: '1', contributor }), {
        currentContributorRoundScore: 42,
        contributorSubmissionCount24h: 1,
      });
    } finally {
      cleanup();
    }
  });
});
