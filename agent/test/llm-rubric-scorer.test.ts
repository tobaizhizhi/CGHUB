import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assessEvidenceWithRubricLlm, validateLlmRubricOutput, type AiFetch } from '../src/llm-rubric-scorer.js';
import type { EvidenceSnapshot, ScoreBreakdown } from '../src/types.js';

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
  },
};

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

const ruleBreakdown: ScoreBreakdown = {
  score: 72,
  confidence: 0.95,
  dimensions: [
    { key: 'verifiable_output', label: '可验证产出', points: 24, maxPoints: 30, reason: '证据中有明确产出' },
    { key: 'completion_quality', label: '完成质量', points: 13, maxPoints: 15, reason: '已完成' },
    { key: 'project_impact', label: '项目价值 / 影响范围', points: 18, maxPoints: 25, reason: '规模中等' },
    { key: 'project_relevance', label: '项目相关性', points: 12, maxPoints: 15, reason: '相关' },
    { key: 'claim_match', label: '描述与证据匹配度', points: 4, maxPoints: 10, reason: '说明基本完整' },
    { key: 'time_reasonableness', label: '时间合理性', points: 1, maxPoints: 5, reason: '时间信息较少' },
  ],
  reasons: ['规则评分 72'],
  riskFlags: [],
};

function llmInput() {
  return {
    submission: {
      title: 'Cobo approval sync',
      description: '实现 Cobo 审批通过后自动上链',
      contributionType: '代码开发',
    },
    evidenceSnapshot,
    ruleBreakdown,
  };
}

function placeholderInput() {
  return {
    submission: {
      title: '补充 demo / test 目录占位结构',
      description: '补充 demo-演示 和 test-测试 目录的 .gitkeep，占位保留空目录结构，方便后续演示材料和测试用例按约定位置沉淀。',
      contributionType: '评审 / 支持',
      impactScale: '维护 2 个演示 / 测试目录占位，便于后续补充脚本和测试材料',
      occurredAt: '2026-06-08',
    },
    evidenceSnapshot: placeholderCommitSnapshot,
    ruleBreakdown,
  };
}

function validRubricJson() {
  return {
    score: 76,
    confidence: 0.84,
    summary: 'PR 已合并，修改 Cobo 审批同步逻辑。',
    dimensions: [
      { key: 'verifiable_output', points: 24, maxPoints: 30, reason: 'PR 已验证且有明确代码产出', evidenceRefs: ['github.files'] },
      { key: 'completion_quality', points: 14, maxPoints: 15, reason: '完成质量明确', evidenceRefs: ['github.merged'] },
      { key: 'project_impact', points: 18, maxPoints: 25, reason: '影响核心审批同步流程', evidenceRefs: ['github.changedFiles'] },
      { key: 'project_relevance', points: 14, maxPoints: 15, reason: '命中核心路径', evidenceRefs: ['github.files'] },
      { key: 'claim_match', points: 5, maxPoints: 10, reason: '说明基本完整', evidenceRefs: ['submission.description'] },
      { key: 'time_reasonableness', points: 1, maxPoints: 5, reason: '时间信息较少', evidenceRefs: ['github.updatedAt'] },
    ],
    riskFlags: ['high_impact'],
    needsHumanReview: true,
    reasoning: '证据可信，项目相关性强。',
  };
}

describe('llm rubric scorer', () => {
  it('validates complete rubric JSON', () => {
    const result = validateLlmRubricOutput(validRubricJson());

    assert.equal(result.ok, true);
  });

  it('accepts and trims long evidence refs instead of failing schema validation', () => {
    const longRef = 'https://github.com/org/repo/commit/'.padEnd(320, 'a');
    const result = validateLlmRubricOutput({
      ...validRubricJson(),
      dimensions: validRubricJson().dimensions.map((dimension, index) => ({
        ...dimension,
        evidenceRefs: index === 0 ? [longRef] : dimension.evidenceRefs,
      })),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.value.dimensions[0].evidenceRefs?.[0] : '', 'github.sha');
  });

  it('rejects JSON with a score that does not match dimension totals', () => {
    const result = validateLlmRubricOutput({
      ...validRubricJson(),
      score: 90,
    });

    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.errors.join('\n'), /维度总分/);
  });

  it('repairs small score and dimension-total mismatches from LLM output', () => {
    const result = validateLlmRubricOutput({
      ...validRubricJson(),
      score: 74,
    });

    assert.equal(result.ok, true);
    const total = result.ok ? result.value.dimensions.reduce((sum, dimension) => sum + dimension.points, 0) : 0;
    assert.equal(total, 74);
  });

  it('calls an OpenAI-compatible endpoint and returns a structured trace', async () => {
    const fetcher: AiFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: JSON.stringify(validRubricJson()) } }] };
      },
    });

    const result = await assessEvidenceWithRubricLlm(llmInput(), {
      fetch: fetcher,
      apiKey: 'test-key',
      model: 'test-model',
      now: () => 1781090000000,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.score, 76);
    assert.equal(result.confidence, 0.84);
    assert.equal(result.dimensions?.length, 6);
    assert.equal(result.needsHumanReview, true);
  });

  it('calibrates placeholder-only AI scoring around 20 points', async () => {
    let requestBody: any;
    const fetcher: AiFetch = async (_url, init) => {
      requestBody = init?.body ? JSON.parse(init.body) : undefined;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  score: 75,
                  confidence: 0.86,
                  summary: '模型原始误判为空目录占位给了高分。',
                  dimensions: [
                    { key: 'verifiable_output', points: 24, maxPoints: 30, reason: '误判为较高可验证产出', evidenceRefs: ['github.files'] },
                    { key: 'project_impact', points: 18, maxPoints: 25, reason: '误判为中高影响', evidenceRefs: ['github.files'] },
                    { key: 'project_relevance', points: 14, maxPoints: 15, reason: '命中项目路径', evidenceRefs: ['github.files'] },
                    { key: 'completion_quality', points: 14, maxPoints: 15, reason: 'commit 已验证', evidenceRefs: ['github.sha'] },
                    { key: 'claim_match', points: 4, maxPoints: 10, reason: '说明与占位证据基本匹配', evidenceRefs: ['submission.description'] },
                    { key: 'time_reasonableness', points: 1, maxPoints: 5, reason: '时间信息可参考', evidenceRefs: ['submission.occurredAt'] },
                  ],
                  riskFlags: [],
                  needsHumanReview: false,
                  reasoning: '模型原始输出未正确识别占位。',
                }),
              },
            }],
          };
        },
      };
    };

    const result = await assessEvidenceWithRubricLlm(placeholderInput(), {
      fetch: fetcher,
      apiKey: 'test-key',
      model: 'test-model',
      now: () => 1781090000000,
    });

    const userPayload = JSON.parse(requestBody.messages[1].content);
    assert.equal(userPayload.scoringCalibration.outputTier, 'placeholder');
    assert.deepEqual(userPayload.scoringCalibration.recommendedScoreBand, { min: 18, max: 24 });
    assert.match(userPayload.scoringCalibration.instruction, /20 分/);
    assert.equal(result.status, 'success');
    assert.equal(result.score, 20);
    assert.equal(result.dimensions?.reduce((sum, dimension) => sum + dimension.points, 0), 20);
    assert.deepEqual(result.riskFlags, ['placeholder_output']);
    assert.match(result.summary ?? '', /占位/);
  });
});
