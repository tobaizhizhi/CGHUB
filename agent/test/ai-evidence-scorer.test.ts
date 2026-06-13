import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assessEvidenceWithAi, type AiFetch } from '../src/ai-evidence-scorer.js';
import type { EvidenceSnapshot, ScoreBreakdown } from '../src/types.js';

const evidenceSnapshot: EvidenceSnapshot = {
  evidenceKey: 'https://github.com/org/repo/pull/123',
  evidenceUrl: 'https://github.com/org/repo/pull/123',
  evidenceId: 'pr-123',
  type: 'github_pull_request',
  title: 'Persist approval sync',
  summary: 'PR #123 merged',
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

function input() {
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

describe('assessEvidenceWithAi', () => {
  it('returns disabled when no API key is configured', async () => {
    const result = await assessEvidenceWithAi(input(), {
      apiKey: '',
      model: 'test-model',
      now: () => 1781090000000,
    });

    assert.equal(result.status, 'disabled');
    assert.equal(result.enabled, false);
  });

  it('parses JSON AI output from a mocked OpenAI-compatible response', async () => {
    const calls: Array<{ url: string; body?: any; authorization?: string }> = [];
    const fetcher: AiFetch = async (url, init) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body) : undefined,
        authorization: init?.headers?.authorization,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
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
                  }),
                },
              },
            ],
          };
        },
      };
    };

    const result = await assessEvidenceWithAi(input(), {
      fetch: fetcher,
      apiKey: 'test-key',
      model: 'test-model',
      now: () => 1781090000000,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.score, 76);
    assert.equal(result.suggestedScore, 76);
    assert.equal(result.confidence, 0.84);
    assert.equal(result.needsHumanReview, true);
    assert.equal(result.dimensions?.length, 6);
    assert.deepEqual(result.riskFlags, ['high_impact']);
    assert.equal(calls[0].authorization, 'Bearer test-key');
    assert.equal(calls[0].body.model, 'test-model');
  });

  it('returns failed when the AI response is not valid JSON', async () => {
    const fetcher: AiFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'not json' } }] };
      },
    });

    const result = await assessEvidenceWithAi(input(), {
      fetch: fetcher,
      apiKey: 'test-key',
      model: 'test-model',
      now: () => 1781090000000,
    });

    assert.equal(result.status, 'failed');
    assert.match(result.error ?? '', /JSON/);
  });

  it('returns schema_invalid when the JSON does not match the rubric', async () => {
    const fetcher: AiFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                score: 76,
                confidence: 0.9,
                summary: '缺少 dimensions',
                dimensions: [],
                riskFlags: [],
                needsHumanReview: false,
              }),
            },
          }],
        };
      },
    });

    const result = await assessEvidenceWithAi(input(), {
      fetch: fetcher,
      apiKey: 'test-key',
      model: 'test-model',
      now: () => 1781090000000,
    });

    assert.equal(result.status, 'schema_invalid');
    assert.ok(result.validationErrors?.length);
  });
});
