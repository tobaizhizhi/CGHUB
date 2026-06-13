import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const coboWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
process.env.CAW_SRC_ADDRESS = coboWallet.address;
process.env.SIGNER_MODE = 'cobo';

const { EIP712_DOMAIN, EIP712_TYPES } = await import('../src/config.js');
const { JsonAgentRegistry } = await import('../src/agent-registry.js');
const { AgentRegistryContributionReviewStore } = await import('../src/contribution-review-store.js');
const {
  requestCoboApprovalForContributionReview,
  syncCoboApprovalAndRecordContributionReview,
} = await import('../src/contribution-review-executor.js');

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'cghub-review-executor-'));
  return {
    store: new AgentRegistryContributionReviewStore(new JsonAgentRegistry(join(dir, 'agent-registry.json'))),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createPendingReview(
  store: InstanceType<typeof AgentRegistryContributionReviewStore>,
  overrides: Partial<Parameters<InstanceType<typeof AgentRegistryContributionReviewStore>['create']>[0]> = {},
) {
  return store.create({
    projectId: '1',
    roundId: '1',
    contributor: '0x1111111111111111111111111111111111111111',
    title: 'High score contribution',
    description: 'Needs Cobo approval',
    source: 'test',
    evidenceId: 'evidence-cobo',
    evidenceUrl: 'https://github.com/org/repo/pull/99',
    paymentId: 'payment-cobo',
    score: 85,
    scoreReason: 'high score',
    evidenceSnapshot: {
      evidenceKey: 'https://github.com/org/repo/pull/99',
      evidenceUrl: 'https://github.com/org/repo/pull/99',
      evidenceId: 'evidence-cobo',
      type: 'github_pull_request',
      title: 'High score contribution',
      summary: 'PR #99 merged，文件 2 个',
      sourceHost: 'github.com',
      fetchedAt: 1781090000000,
      confidence: 1,
      status: 'verified',
      warnings: [],
      github: {
        owner: 'org',
        repo: 'repo',
        number: 99,
        merged: true,
        changedFiles: 2,
        files: ['agent/src/contribution-review-executor.ts'],
      },
    },
    scoreBreakdown: {
      score: 85,
      confidence: 0.95,
      dimensions: [
        {
          key: 'verifiable_output',
          label: '可验证产出',
          points: 30,
          maxPoints: 30,
          reason: 'GitHub PR 已验证且有明确产出',
        },
        {
          key: 'project_relevance',
          label: '项目相关性',
          points: 15,
          maxPoints: 15,
          reason: '命中核心项目路径',
        },
      ],
      reasons: ['证据可信', '相关性强'],
      riskFlags: ['high_impact'],
      rubricVersion: '2026-06-output-factor-rubric-v2',
      source: 'llm',
      fallbackScore: 72,
      sanityFlags: ['llm_needs_human_review'],
      needsHumanReview: true,
    },
    aiScoring: {
      enabled: true,
      provider: 'openai',
      model: 'test-model',
      status: 'success',
      score: 85,
      confidence: 0.95,
      summary: 'PR 已合并，修改 Cobo 审批同步逻辑。',
      riskFlags: ['high_impact'],
      needsHumanReview: true,
      createdAt: 1781090000000,
    },
    status: 'pending_cobo_approval',
    reasons: ['单条评分 85 >= 80'],
    triggeredRules: ['score_threshold'],
    ...overrides,
  });
}

function proofFromRecord(proof: Record<string, string>) {
  return {
    projectId: BigInt(proof.projectId),
    roundId: BigInt(proof.roundId),
    contributor: proof.contributor,
    score: BigInt(proof.score),
    proofHash: proof.proofHash,
    paymentIdHash: proof.paymentIdHash,
    nonce: BigInt(proof.nonce),
    deadline: BigInt(proof.deadline),
  };
}

describe('contribution review Cobo approval executor', () => {
  it('submits high-risk proof to Cobo approval without exposing a signature, then records after approval', async () => {
    const { store, cleanup } = tempStore();
    try {
    const review = createPendingReview(store);

    const pending = await requestCoboApprovalForContributionReview(review, {
      store,
      submitCoboTypedData: async (typedData, options) => {
        assert.equal(typedData.primaryType, 'ContributionProof');
        assert.ok(options.description.length <= 512);
        assert.match(options.description, /github_pull_request verified merged/);
        assert.match(options.description, /PR #99 merged/);
        assert.match(options.description, /可验证产出 30\/30/);
        assert.match(options.description, /conf=0.95/);
        assert.match(options.description, /src=llm/);
        assert.match(options.description, /llm=success/);
        assert.match(options.description, /risk=high_impact/);
        return {
        state: 'pending',
        txId: 'cobo-sign-tx',
        approvalId: 'cobo-approval-id',
        statusDisplay: 'pending',
        };
      },
    });

    assert.equal(pending.coboPending, true);
    assert.equal(pending.review.status, 'pending_cobo_approval');
    assert.equal(pending.review.coboApprovalKind, 'contribution_proof');
    assert.equal(pending.review.signature, undefined);
    assert.equal(pending.review.coboSignTxId, 'cobo-sign-tx');
    assert.equal(pending.review.coboApprovalId, 'cobo-approval-id');
    assert.ok(pending.review.proof?.proofHash);
    assert.equal(store.findByProofHash(pending.review.proof!.proofHash)?.id, review.id);

    const proof = proofFromRecord(pending.review.proof!);
    const signature = await coboWallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, proof);

    const recorded = await syncCoboApprovalAndRecordContributionReview(pending.review, {
      store,
      readCoboMessageSign: async () => ({
        state: 'signed',
        txId: 'cobo-sign-tx',
        approvalId: 'cobo-approval-id',
        signature,
        statusDisplay: 'success',
      }),
      submitContribution: async () => ({
        txId: 'record-tx',
        status: 'success',
        txHash: '0xrecorded',
      }),
    });

    assert.equal(recorded.review.status, 'cobo_approved');
    assert.equal(recorded.review.recorded, true);
    assert.equal(recorded.review.txHash, '0xrecorded');
    assert.equal(recorded.review.signerAddress?.toLowerCase(), coboWallet.address.toLowerCase());
    } finally {
      cleanup();
    }
  });

  it('routes frequency risk through Cobo risk approval before signing the real proof', async () => {
    const { store, cleanup } = tempStore();
    try {
    const review = createPendingReview(store, {
      score: 45,
      scoreReason: 'medium score',
      reasons: ['贡献者 24 小时提交次数 3 >= 3'],
      triggeredRules: ['contributor_daily_submission_threshold'],
    });

    const pending = await requestCoboApprovalForContributionReview(review, {
      store,
      submitCoboTypedData: async (typedData, options) => {
        assert.equal(typedData.primaryType, 'ContributionReviewApproval');
        assert.equal(typedData.message.requiresApproval, '1');
        assert.equal(typedData.message.score, '45');
        assert.ok(typedData.message.proofHash);
        assert.ok(options.description.length <= 512);
        return {
          state: 'pending',
          txId: 'risk-approval-tx',
          approvalId: 'risk-approval-id',
          statusDisplay: 'pending',
        };
      },
    });

    assert.equal(pending.review.coboApprovalKind, 'risk_approval');
    assert.equal(pending.review.signature, undefined);

    const approvalSignature = `0x${'11'.repeat(65)}`;
    const recorded = await syncCoboApprovalAndRecordContributionReview(pending.review, {
      store,
      readCoboMessageSign: async () => ({
        state: 'signed',
        txId: 'risk-approval-tx',
        approvalId: 'risk-approval-id',
        signature: approvalSignature,
        statusDisplay: 'success',
      }),
      signContributionProof: async (proof) => ({
        signature: await coboWallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, proof),
        signerMode: 'cobo',
        signerAddress: coboWallet.address,
      }),
      submitContribution: async () => ({
        txId: 'record-after-risk-approval',
        status: 'success',
        txHash: '0xriskrecorded',
      }),
    });

    assert.equal(recorded.review.status, 'cobo_approved');
    assert.equal(recorded.review.recorded, true);
    assert.equal(recorded.review.txHash, '0xriskrecorded');
    assert.equal(recorded.review.signerAddress?.toLowerCase(), coboWallet.address.toLowerCase());
    } finally {
      cleanup();
    }
  });

  it('fails closed when a pending review is auto-signed by an old Sign Pact', async () => {
    const { store, cleanup } = tempStore();
    try {
    const review = createPendingReview(store, {
      score: 45,
      scoreReason: 'medium score',
      reasons: ['贡献者 24 小时提交次数 3 >= 3'],
      triggeredRules: ['contributor_daily_submission_threshold'],
    });

    await assert.rejects(
      requestCoboApprovalForContributionReview(review, {
        store,
        submitCoboTypedData: async () => ({
          state: 'signed',
          txId: 'risk-approval-tx',
          approvalId: 'risk-approval-id',
          signature: `0x${'22'.repeat(65)}`,
          statusDisplay: 'success',
        }),
      }),
      /未触发人工审批/,
    );
    } finally {
      cleanup();
    }
  });
});
