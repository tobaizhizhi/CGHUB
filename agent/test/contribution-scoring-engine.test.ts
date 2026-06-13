import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scoreContributionWithRubric } from '../src/contribution-scoring-engine.js';
import type { AiScoringTrace, EvidenceSnapshot, ScoreDimension } from '../src/types.js';

const evidenceSnapshot: EvidenceSnapshot = {
  evidenceKey: 'https://github.com/org/repo/pull/123',
  evidenceUrl: 'https://github.com/org/repo/pull/123',
  evidenceId: 'pr-123',
  type: 'github_pull_request',
  title: 'Cobo approval sync',
  summary: 'PR #123 merged，文件 2 个',
  sourceHost: 'github.com',
  fetchedAt: 1781090000000,
  confidence: 1,
  status: 'verified',
  warnings: [],
  github: {
    owner: 'org',
    repo: 'repo',
    number: 123,
    merged: true,
    changedFiles: 2,
    additions: 180,
    deletions: 20,
    files: ['agent/src/cobo-approval-sync-loop.ts'],
    mergedAt: '2026-06-09T00:00:00Z',
  },
};

const llmDimensions: ScoreDimension[] = [
  { key: 'verifiable_output', label: '可验证产出', points: 24, maxPoints: 30, reason: 'PR 已验证且有明确代码产出' },
  { key: 'completion_quality', label: '完成质量', points: 14, maxPoints: 15, reason: '完成质量明确' },
  { key: 'project_impact', label: '项目价值 / 影响范围', points: 18, maxPoints: 25, reason: '影响核心审批同步流程' },
  { key: 'project_relevance', label: '项目相关性', points: 14, maxPoints: 15, reason: '命中核心路径' },
  { key: 'claim_match', label: '描述与证据匹配度', points: 5, maxPoints: 10, reason: '说明基本完整' },
  { key: 'time_reasonableness', label: '时间合理性', points: 1, maxPoints: 5, reason: '时间信息较少' },
];

const placeholderCommitSnapshot: EvidenceSnapshot = {
  evidenceKey: 'https://github.com/Carey-Hugo/cghub-mvp-hackathon/commit/b154499489720bde7e9f8b28520a68543f94ca52',
  evidenceUrl: 'https://github.com/Carey-Hugo/cghub-mvp-hackathon/commit/b154499489720bde7e9f8b28520a68543f94ca52',
  evidenceId: 'demo-placeholder',
  type: 'github_commit',
  title: '保留空文件夹结构',
  summary: 'Commit b1544994 已验证，文件 2 个',
  sourceHost: 'github.com',
  fetchedAt: 1781090000000,
  confidence: 0.8,
  status: 'verified',
  warnings: [],
  github: {
    owner: 'Carey-Hugo',
    repo: 'cghub-mvp-hackathon',
    sha: 'b154499489720bde7e9f8b28520a68543f94ca52',
    createdAt: '2026-06-08T03:12:05Z',
    updatedAt: '2026-06-08T03:12:05Z',
    changedFiles: 2,
    additions: 0,
    deletions: 0,
    files: ['demo-演示/.gitkeep', 'test-测试/.gitkeep'],
  },
};

const coreCommitSnapshot: EvidenceSnapshot = {
  evidenceKey: 'https://github.com/Carey-Hugo/cghub-mvp-hackathon/commit/6872b2df1fc2ade63ad2d01d838f43f47bc802c2',
  evidenceUrl: 'https://github.com/Carey-Hugo/cghub-mvp-hackathon/commit/6872b2df1fc2ade63ad2d01d838f43f47bc802c2',
  evidenceId: 'agent-flow',
  type: 'github_commit',
  title: 'feat(frontend): wire contribution agent flow',
  summary: 'Commit 6872b2df 已验证，文件 11 个',
  sourceHost: 'github.com',
  fetchedAt: 1781090000000,
  confidence: 0.8,
  status: 'verified',
  warnings: [],
  github: {
    owner: 'Carey-Hugo',
    repo: 'cghub-mvp-hackathon',
    sha: '6872b2df1fc2ade63ad2d01d838f43f47bc802c2',
    createdAt: '2026-06-06T06:26:39Z',
    updatedAt: '2026-06-06T06:26:39Z',
    changedFiles: 11,
    additions: 422,
    deletions: 53,
    files: [
      'frontend-前端/README.md',
      'frontend-前端/components/ContributionForm.tsx',
      'frontend-前端/hooks/useContributionPool.ts',
      'frontend-前端/lib/agent-api.ts',
      'frontend-前端/pages/dashboard.tsx',
    ],
  },
};

function input(snapshot = evidenceSnapshot) {
  return {
    title: 'Cobo approval sync',
    description: '实现 Cobo 审批通过后自动上链',
    contributionType: '代码开发',
    amount: '1 PR',
    evidenceUrl: snapshot.evidenceUrl,
    occurredAt: '2026-06-09',
    evidenceSnapshot: snapshot,
  };
}

describe('scoreContributionWithRubric', () => {
  it('uses valid LLM rubric scoring as the final score', async () => {
    const aiScoring: AiScoringTrace = {
      enabled: true,
      provider: 'openai',
      model: 'test-model',
      status: 'success',
      score: 76,
      suggestedScore: 76,
      confidence: 0.84,
      dimensions: llmDimensions,
      summary: 'PR 已合并，修改 Cobo 审批同步逻辑。',
      riskFlags: ['high_impact'],
      needsHumanReview: false,
      createdAt: 1781090000000,
    };

    const result = await scoreContributionWithRubric(input(), {
      llmScorer: async () => aiScoring,
    });

    assert.equal(result.score, 76);
    assert.equal(result.breakdown.source, 'llm');
    assert.equal(result.breakdown.fallbackScore !== undefined, true);
    assert.equal(result.aiScoring?.status, 'success');
  });

  it('falls back to rule scoring and marks Cobo-review risk when LLM is disabled', async () => {
    const result = await scoreContributionWithRubric(input(), {
      llmScorer: async () => ({
        enabled: false,
        provider: 'openai',
        status: 'disabled',
        createdAt: 1781090000000,
      }),
    });

    assert.equal(result.breakdown.source, 'rule_fallback');
    assert.equal(result.aiScoring?.status, 'disabled');
    assert(result.breakdown.riskFlags.includes('llm_unavailable'));
    assert.equal(result.breakdown.needsHumanReview, true);
  });

  it('flags low-confidence and weak-evidence high scores', async () => {
    const weakEvidence: EvidenceSnapshot = {
      ...evidenceSnapshot,
      type: 'text',
      status: 'unverified',
      confidence: 0.2,
      github: undefined,
    };
    const result = await scoreContributionWithRubric(input(weakEvidence), {
      llmScorer: async () => ({
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        status: 'success',
        score: 76,
        suggestedScore: 76,
        confidence: 0.52,
        dimensions: llmDimensions,
        summary: '证据较弱但模型给了高分。',
        riskFlags: [],
        needsHumanReview: false,
        createdAt: 1781090000000,
      }),
    });

    assert(result.breakdown.sanityFlags?.includes('low_score_confidence'));
    assert(result.breakdown.sanityFlags?.includes('evidence_unverified_high_score'));
    assert.equal(result.breakdown.needsHumanReview, true);
  });

  it('caps unverified-evidence scores below the verified ceiling', async () => {
    const weakEvidence: EvidenceSnapshot = {
      ...evidenceSnapshot,
      type: 'url',
      status: 'unverified',
      confidence: 0.45,
      github: undefined,
    };
    const result = await scoreContributionWithRubric(input(weakEvidence), {
      // LLM 跳过，走规则兜底，复现"低置信度也能凑到 ~50 分"的场景
      llmScorer: async () => ({
        enabled: false,
        provider: 'openai',
        status: 'disabled',
        createdAt: 1781090000000,
      }),
    });

    // 未验证证据封顶 35：最终分必须 <= 35，且不超过封顶前的兜底分
    assert(result.score <= 35, `score ${result.score} 应被未验证证据封顶压到 <= 35`);
    assert(result.breakdown.fallbackScore !== undefined);
    assert(result.score <= result.breakdown.fallbackScore!);
    // 维度被等比缩放后，总和仍与最终分一致（容差 1，取整误差）
    const dimensionSum = result.breakdown.dimensions.reduce((sum, dimension) => sum + dimension.points, 0);
    assert(Math.abs(dimensionSum - result.score) <= 1, `维度总分 ${dimensionSum} 与最终分 ${result.score} 不一致`);
  });

  it('keeps high scores intact when evidence is verified and confidence is high', async () => {
    const result = await scoreContributionWithRubric(input(), {
      llmScorer: async () => ({
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        status: 'success',
        score: 82,
        suggestedScore: 82,
        confidence: 0.9,
        dimensions: llmDimensions.map((dimension) =>
          dimension.key === 'project_impact' ? { ...dimension, points: 18 } : dimension,
        ),
        summary: 'PR 已验证且置信度高。',
        riskFlags: [],
        needsHumanReview: false,
        createdAt: 1781090000000,
      }),
    });

    // verified + 高置信度：不应被折扣或封顶
    assert.equal(result.score, 82);
  });

  it('caps placeholder-only commits even when the LLM over-scores them', async () => {
    const result = await scoreContributionWithRubric({
      title: '补充 demo / test 目录占位结构',
      description: '补充 demo-演示 和 test-测试 目录的 .gitkeep，占位保留空目录结构。',
      contributionType: '评审 / 支持',
      amount: '维护 2 个演示 / 测试目录占位',
      evidenceUrl: placeholderCommitSnapshot.evidenceUrl,
      occurredAt: '2026-06-08',
      evidenceSnapshot: placeholderCommitSnapshot,
    }, {
      llmScorer: async () => ({
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        status: 'success',
        score: 75,
        suggestedScore: 75,
        confidence: 0.9,
        dimensions: llmDimensions,
        summary: '模型误判该占位贡献价值较高。',
        riskFlags: [],
        needsHumanReview: false,
        createdAt: 1781090000000,
      }),
    });

    assert.equal(result.score, 20);
    assert.equal(result.breakdown.source, 'llm');
  });

  it('raises substantial core commits to the rule-backed high score when LLM under-scores them', async () => {
    const result = await scoreContributionWithRubric({
      title: '接入贡献提交与 Agent 评分闭环',
      description: '完成前端到 Agent 的贡献提交闭环，把 ContributionForm、Agent API、贡献池读取、Cobo 状态和 dashboard 展示串起来。',
      contributionType: '代码开发',
      amount: '11 个前端文件，约 475 行变更',
      evidenceUrl: coreCommitSnapshot.evidenceUrl,
      occurredAt: '2026-06-06',
      evidenceSnapshot: coreCommitSnapshot,
    }, {
      llmScorer: async () => ({
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        status: 'success',
        score: 76,
        suggestedScore: 76,
        confidence: 0.9,
        dimensions: llmDimensions,
        summary: '模型给了中高分。',
        riskFlags: [],
        needsHumanReview: false,
        createdAt: 1781090000000,
      }),
    });

    assert.equal(result.score, 88);
    assert.equal(result.breakdown.source, 'llm');
  });
});
