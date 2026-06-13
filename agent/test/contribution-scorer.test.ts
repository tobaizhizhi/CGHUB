import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scoreContribution } from '../src/contribution-scorer.js';
import type { EvidenceSnapshot } from '../src/types.js';

const mergedPrSnapshot: EvidenceSnapshot = {
  evidenceKey: 'https://github.com/org/repo/pull/123',
  evidenceUrl: 'https://github.com/org/repo/pull/123',
  evidenceId: 'pr-123',
  type: 'github_pull_request',
  title: '完成活动报名页开发',
  summary: 'PR #123 merged，文件 3 个',
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
    changedFiles: 3,
    additions: 220,
    deletions: 40,
    files: ['frontend-前端/pages/activity.tsx', 'agent/src/cobo-approval-sync-loop.ts'],
    mergedAt: '2026-06-09T00:00:00Z',
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

describe('scoreContribution', () => {
  it('uses evidence snapshot and structured dimensions when judging a submission', () => {
    const result = scoreContribution({
      title: '完成活动报名页开发',
      contributionType: '代码开发',
      amount: '1 个 PR，3 个页面',
      description: '实现 frontend 报名表单、活动列表状态和错误提示。',
      evidenceUrl: 'https://github.com/org/repo/pull/123',
      occurredAt: '2026-06-09',
      evidenceSnapshot: mergedPrSnapshot,
    });

    assert.ok(result.score >= 60);
    assert.equal(result.breakdown.dimensions.length, 6);
    assert.equal(result.breakdown.dimensions[0].key, 'verifiable_output');
    assert.equal(result.breakdown.source, 'rule_fallback');
    assert.equal(result.breakdown.rubricVersion, '2026-06-output-factor-rubric-v2');
    assert.match(result.reason, /PR 已 merged|GitHub PR/);
    assert.match(result.reason, /frontend|agent/);
  });

  it('keeps the rule scorer independent from AI scoring traces', () => {
    const withoutAi = scoreContribution({
      title: '完成活动报名页开发',
      contributionType: '代码开发',
      amount: '1 个 PR，3 个页面',
      description: '实现 frontend 报名表单、活动列表状态和错误提示。',
      evidenceUrl: 'https://github.com/org/repo/pull/123',
      occurredAt: '2026-06-09',
      evidenceSnapshot: mergedPrSnapshot,
    });

    const withAi = scoreContribution({
      title: '完成活动报名页开发',
      contributionType: '代码开发',
      amount: '1 个 PR，3 个页面',
      description: '实现 frontend 报名表单、活动列表状态和错误提示。',
      evidenceUrl: 'https://github.com/org/repo/pull/123',
      occurredAt: '2026-06-09',
      evidenceSnapshot: mergedPrSnapshot,
      aiScoring: {
        enabled: true,
        provider: 'openai',
        model: 'test-model',
        status: 'success',
        summary: 'AI 认为贡献有效',
        score: 100,
        confidence: 1,
        suggestedScore: 100,
        riskFlags: ['high_impact'],
        needsHumanReview: true,
        createdAt: 1781090000000,
      },
    } as any);

    assert.equal(withAi.score, withoutAi.score);
    assert.equal(withAi.breakdown.riskFlags.includes('high_impact'), false);
  });

  it('scores placeholder-only commits around 20 points', () => {
    const result = scoreContribution({
      title: '补充 demo / test 目录占位结构',
      contributionType: '评审 / 支持',
      amount: '维护 2 个演示 / 测试目录占位，便于后续补充脚本和测试材料',
      description: '补充 demo-演示 和 test-测试 目录的 .gitkeep，占位保留空目录结构，方便后续演示材料和测试用例按约定位置沉淀。',
      evidenceUrl: placeholderCommitSnapshot.evidenceUrl,
      occurredAt: '2026-06-08',
      evidenceSnapshot: placeholderCommitSnapshot,
    });

    assert.equal(result.score, 20);
    assert.match(result.reason, /占位|没有代码|可用材料/);
  });

  it('scores substantial core commits in the high 80s', () => {
    const result = scoreContribution({
      title: '接入贡献提交与 Agent 评分闭环',
      contributionType: '代码开发',
      amount: '11 个前端文件，约 475 行变更，连接贡献表单、Agent API、Cobo 状态和链上结算视图',
      description: '完成前端到 Agent 的贡献提交闭环，把 ContributionForm、Agent API、贡献池读取、Cobo 状态和 dashboard 展示串起来。',
      evidenceUrl: coreCommitSnapshot.evidenceUrl,
      occurredAt: '2026-06-06',
      evidenceSnapshot: coreCommitSnapshot,
    });

    assert.equal(result.score, 89);
    assert.match(result.reason, /核心产出|核心流程|命中项目路径/);
  });
});
