import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEvidenceSnapshot, type EvidenceFetch } from '../src/evidence-resolver.js';

function jsonResponse(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    },
  };
}

describe('resolveEvidenceSnapshot', () => {
  it('resolves a merged GitHub PR with file metrics from mocked GitHub API', async () => {
    const calls: string[] = [];
    const fetcher: EvidenceFetch = async (url) => {
      calls.push(url);
      if (url.includes('/pulls/123/files')) {
        return jsonResponse([
          { filename: 'agent/src/cobo-approval-sync-loop.ts' },
          { filename: 'frontend-前端/lib/agent-api.ts' },
        ]);
      }
      return jsonResponse({
        title: 'Persist Cobo approval sync',
        state: 'closed',
        merged: true,
        merged_at: '2026-06-10T00:00:00Z',
        created_at: '2026-06-09T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
        changed_files: 2,
        additions: 180,
        deletions: 20,
        html_url: 'https://github.com/org/repo/pull/123',
        user: { login: 'alice' },
      });
    };

    const snapshot = await resolveEvidenceSnapshot(
      {
        evidenceUrl: 'https://github.com/org/repo/pull/123',
        evidenceId: 'pr-123',
        title: '贡献',
        description: '完成 Cobo 审批同步',
      },
      { fetch: fetcher, now: () => 1781090000000 },
    );

    assert.equal(snapshot.type, 'github_pull_request');
    assert.equal(snapshot.status, 'verified');
    assert.equal(snapshot.github?.owner, 'org');
    assert.equal(snapshot.github?.repo, 'repo');
    assert.equal(snapshot.github?.number, 123);
    assert.equal(snapshot.github?.merged, true);
    assert.equal(snapshot.github?.changedFiles, 2);
    assert.deepEqual(snapshot.github?.files, [
      'agent/src/cobo-approval-sync-loop.ts',
      'frontend-前端/lib/agent-api.ts',
    ]);
    assert.equal(calls.length, 2);
  });

  it('returns an unavailable GitHub snapshot instead of throwing on API failure', async () => {
    const fetcher: EvidenceFetch = async () => jsonResponse({ message: 'rate limited' }, 403);

    const snapshot = await resolveEvidenceSnapshot(
      {
        evidenceUrl: 'https://github.com/org/repo/pull/123',
        evidenceId: 'pr-123',
        title: '贡献',
        description: '完成 Cobo 审批同步',
      },
      { fetch: fetcher, now: () => 1781090000000 },
    );

    assert.equal(snapshot.type, 'github_pull_request');
    assert.equal(snapshot.status, 'unavailable');
    assert.match(snapshot.warnings[0], /GitHub API 403/);
  });

  it('uses demo commit snapshots when GitHub API is rate limited', async () => {
    const fetcher: EvidenceFetch = async () => jsonResponse({ message: 'rate limited' }, 403);

    const snapshot = await resolveEvidenceSnapshot(
      {
        evidenceUrl: 'https://github.com/Carey-Hugo/cghub-mvp-hackathon/commit/b154499489720bde7e9f8b28520a68543f94ca52',
        evidenceId: 'demo-placeholder',
        title: '补充 demo / test 目录占位结构',
        description: '补充 demo-演示 和 test-测试 目录的 .gitkeep。',
      },
      { fetch: fetcher, now: () => 1781090000000 },
    );

    assert.equal(snapshot.type, 'github_commit');
    assert.equal(snapshot.status, 'verified');
    assert.equal(snapshot.confidence, 0.8);
    assert.equal(snapshot.github?.changedFiles, 2);
    assert.equal(snapshot.github?.additions, 0);
    assert.deepEqual(snapshot.github?.files, ['demo-演示/.gitkeep', 'test-测试/.gitkeep']);
    assert.deepEqual(snapshot.warnings, []);
  });

  it('returns a partial snapshot for non-GitHub URLs', async () => {
    const snapshot = await resolveEvidenceSnapshot(
      {
        evidenceUrl: 'https://example.com/article',
        evidenceId: 'article-1',
        title: '文章传播',
        description: '发布项目介绍文章',
      },
      { now: () => 1781090000000 },
    );

    assert.equal(snapshot.type, 'url');
    assert.equal(snapshot.status, 'partial');
    assert.equal(snapshot.sourceHost, 'example.com');
  });
});
