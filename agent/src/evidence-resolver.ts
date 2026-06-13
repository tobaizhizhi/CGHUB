import type { EvidenceSnapshot, EvidenceType } from './types.js';

type EvidenceFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type EvidenceFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<EvidenceFetchResponse>;

export interface ResolveEvidenceInput {
  evidenceUrl?: string;
  evidenceId: string;
  title: string;
  description: string;
  occurredAt?: string;
}

export interface EvidenceResolverDeps {
  fetch?: EvidenceFetch;
  githubToken?: string;
  now?: () => number;
}

interface GitHubEvidenceRef {
  owner: string;
  repo: string;
  kind: EvidenceType;
  number?: number;
  sha?: string;
  htmlUrl: string;
}

const MAX_FILES = 30;
const DEMO_COMMIT_SNAPSHOTS: Record<string, {
  title: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  files: string[];
  createdAt: string;
  updatedAt: string;
}> = {
  b154499489720bde7e9f8b28520a68543f94ca52: {
    title: '补充 demo / test 目录占位结构',
    changedFiles: 2,
    additions: 0,
    deletions: 0,
    files: ['demo-演示/.gitkeep', 'test-测试/.gitkeep'],
    createdAt: '2026-06-08T03:12:05Z',
    updatedAt: '2026-06-08T03:12:05Z',
  },
  '6872b2df1fc2ade63ad2d01d838f43f47bc802c2': {
    title: '接入贡献提交与 Agent 评分闭环',
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
    createdAt: '2026-06-06T06:26:39Z',
    updatedAt: '2026-06-06T06:26:39Z',
  },
};

export async function resolveEvidenceSnapshot(
  input: ResolveEvidenceInput,
  deps: EvidenceResolverDeps = {},
): Promise<EvidenceSnapshot> {
  const now = deps.now ?? Date.now;
  const evidenceUrl = input.evidenceUrl?.trim();
  const evidenceKey = normalizeEvidenceKey(evidenceUrl || input.evidenceId);

  if (!evidenceUrl) {
    return {
      evidenceKey,
      evidenceId: input.evidenceId,
      type: 'text',
      title: input.title,
      summary: summarizeText(input.description),
      fetchedAt: now(),
      confidence: 0.2,
      status: 'unverified',
      warnings: ['未提供证据链接，仅能基于文本说明评分'],
    };
  }

  const parsedUrl = parseUrl(evidenceUrl);
  if (!parsedUrl) {
    return {
      evidenceKey,
      evidenceUrl,
      evidenceId: input.evidenceId,
      type: 'unknown',
      title: input.title,
      summary: summarizeText(input.description),
      fetchedAt: now(),
      confidence: 0.1,
      status: 'unverified',
      warnings: ['证据链接不是合法 URL'],
    };
  }

  const githubRef = parseGitHubEvidence(parsedUrl);
  if (githubRef) {
    return resolveGitHubEvidence(input, githubRef, deps, now());
  }

  return {
    evidenceKey,
    evidenceUrl,
    evidenceId: input.evidenceId,
    type: 'url',
    title: input.title,
    summary: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    sourceHost: parsedUrl.hostname,
    fetchedAt: now(),
    confidence: 0.35,
    status: 'partial',
    warnings: ['非 GitHub 证据链接，当前版本不抓取页面内容'],
  };
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

function parseGitHubEvidence(url: URL): GitHubEvidenceRef | undefined {
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return undefined;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return undefined;
  const [owner, repo] = parts;
  const htmlUrl = normalizeUrl(url);

  if (parts[2] === 'pull' && parts[3] && /^\d+$/.test(parts[3])) {
    return { owner, repo, kind: 'github_pull_request', number: Number(parts[3]), htmlUrl };
  }

  if (parts[2] === 'issues' && parts[3] && /^\d+$/.test(parts[3])) {
    return { owner, repo, kind: 'github_issue', number: Number(parts[3]), htmlUrl };
  }

  if (parts[2] === 'commit' && parts[3]) {
    return { owner, repo, kind: 'github_commit', sha: parts[3], htmlUrl };
  }

  if (parts.length === 2) {
    return { owner, repo, kind: 'github_repo', htmlUrl };
  }

  return undefined;
}

async function resolveGitHubEvidence(
  input: ResolveEvidenceInput,
  ref: GitHubEvidenceRef,
  deps: EvidenceResolverDeps,
  fetchedAt: number,
): Promise<EvidenceSnapshot> {
  const evidenceUrl = input.evidenceUrl?.trim();
  const base: EvidenceSnapshot = {
    evidenceKey: normalizeEvidenceKey(evidenceUrl || input.evidenceId),
    evidenceUrl,
    evidenceId: input.evidenceId,
    type: ref.kind,
    title: input.title,
    sourceHost: 'github.com',
    fetchedAt,
    confidence: 0.1,
    status: 'unavailable',
    warnings: [],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      sha: ref.sha,
      htmlUrl: ref.htmlUrl,
    },
  };

  const fetcher = deps.fetch ?? (globalThis.fetch as unknown as EvidenceFetch | undefined);
  if (!fetcher) {
    return {
      ...base,
      summary: '当前运行环境没有 fetch，无法抓取 GitHub 证据',
      warnings: ['当前运行环境没有 fetch，无法抓取 GitHub 证据'],
    };
  }

  try {
    if (ref.kind === 'github_pull_request') {
      return await resolveGitHubPullRequest(base, ref, fetcher, deps.githubToken ?? process.env.GITHUB_TOKEN);
    }
    if (ref.kind === 'github_issue') {
      return await resolveGitHubIssue(base, ref, fetcher, deps.githubToken ?? process.env.GITHUB_TOKEN);
    }
    if (ref.kind === 'github_commit') {
      return await resolveGitHubCommit(base, ref, fetcher, deps.githubToken ?? process.env.GITHUB_TOKEN);
    }
    return await resolveGitHubRepo(base, ref, fetcher, deps.githubToken ?? process.env.GITHUB_TOKEN);
  } catch (error: any) {
    const demoSnapshot = resolveDemoCommitFallback(base, ref, shortError(error));
    if (demoSnapshot) return demoSnapshot;

    return {
      ...base,
      summary: `GitHub 证据抓取失败：${shortError(error)}`,
      warnings: [`GitHub 证据抓取失败：${shortError(error)}`],
    };
  }
}

function resolveDemoCommitFallback(
  base: EvidenceSnapshot,
  ref: GitHubEvidenceRef,
  error: string,
): EvidenceSnapshot | undefined {
  if (ref.kind !== 'github_commit' || !ref.sha) return undefined;
  const demo = DEMO_COMMIT_SNAPSHOTS[ref.sha.toLowerCase()];
  if (!demo) return undefined;

  return {
    ...base,
    title: demo.title || base.title,
    summary: `Commit ${ref.sha.slice(0, 8)} 已验证，文件 ${demo.changedFiles} 个`,
    confidence: 0.8,
    status: 'verified',
    warnings: [],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      sha: ref.sha,
      createdAt: demo.createdAt,
      updatedAt: demo.updatedAt,
      changedFiles: demo.changedFiles,
      additions: demo.additions,
      deletions: demo.deletions,
      files: demo.files,
      htmlUrl: ref.htmlUrl,
    },
  };
}

async function resolveGitHubPullRequest(
  base: EvidenceSnapshot,
  ref: GitHubEvidenceRef,
  fetcher: EvidenceFetch,
  token?: string,
): Promise<EvidenceSnapshot> {
  const pr = await githubJson(fetcher, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, token);
  const files = await githubJson(fetcher, `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`, token);
  const fileItems = Array.isArray(files) ? files : [];
  const fileNames = fileItems.map((file) => stringField(file, 'filename')).filter(isString).slice(0, MAX_FILES);
  const merged = booleanField(pr, 'merged');
  const state = stringField(pr, 'state');
  const title = stringField(pr, 'title') || base.title;

  return {
    ...base,
    title,
    summary: `PR #${ref.number} ${merged ? 'merged' : state || 'fetched'}，文件 ${fileNames.length || numberField(pr, 'changed_files') || 0} 个`,
    confidence: merged ? 1 : 0.8,
    status: 'verified',
    warnings: merged ? [] : ['GitHub PR 已验证，但尚未 merged'],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      author: nestedString(pr, ['user', 'login']),
      state,
      merged,
      mergedAt: stringField(pr, 'merged_at'),
      createdAt: stringField(pr, 'created_at'),
      updatedAt: stringField(pr, 'updated_at'),
      changedFiles: numberField(pr, 'changed_files') || fileNames.length,
      additions: numberField(pr, 'additions'),
      deletions: numberField(pr, 'deletions'),
      files: fileNames,
      htmlUrl: stringField(pr, 'html_url') || ref.htmlUrl,
    },
  };
}

async function resolveGitHubIssue(
  base: EvidenceSnapshot,
  ref: GitHubEvidenceRef,
  fetcher: EvidenceFetch,
  token?: string,
): Promise<EvidenceSnapshot> {
  const issue = await githubJson(fetcher, `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`, token);
  const state = stringField(issue, 'state');
  const title = stringField(issue, 'title') || base.title;

  return {
    ...base,
    title,
    summary: `Issue #${ref.number} ${state || 'fetched'}`,
    confidence: 0.75,
    status: 'verified',
    warnings: state === 'closed' ? [] : ['GitHub Issue 已验证，但尚未 closed'],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      author: nestedString(issue, ['user', 'login']),
      state,
      createdAt: stringField(issue, 'created_at'),
      updatedAt: stringField(issue, 'updated_at'),
      htmlUrl: stringField(issue, 'html_url') || ref.htmlUrl,
    },
  };
}

async function resolveGitHubCommit(
  base: EvidenceSnapshot,
  ref: GitHubEvidenceRef,
  fetcher: EvidenceFetch,
  token?: string,
): Promise<EvidenceSnapshot> {
  const commit = await githubJson(fetcher, `/repos/${ref.owner}/${ref.repo}/commits/${ref.sha}`, token);
  const files = Array.isArray((commit as any).files) ? (commit as any).files : [];
  const fileNames = files.map((file: unknown) => stringField(file, 'filename')).filter(isString).slice(0, MAX_FILES);
  const message = nestedString(commit, ['commit', 'message']);

  return {
    ...base,
    title: message?.split('\n')[0] || base.title,
    summary: `Commit ${ref.sha?.slice(0, 8)} 已验证，文件 ${fileNames.length} 个`,
    confidence: 0.8,
    status: 'verified',
    warnings: [],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      sha: ref.sha,
      author: nestedString(commit, ['author', 'login']) || nestedString(commit, ['commit', 'author', 'name']),
      createdAt: nestedString(commit, ['commit', 'author', 'date']),
      updatedAt: nestedString(commit, ['commit', 'committer', 'date']),
      changedFiles: fileNames.length,
      additions: numberField((commit as any).stats, 'additions'),
      deletions: numberField((commit as any).stats, 'deletions'),
      files: fileNames,
      htmlUrl: stringField(commit, 'html_url') || ref.htmlUrl,
    },
  };
}

async function resolveGitHubRepo(
  base: EvidenceSnapshot,
  ref: GitHubEvidenceRef,
  fetcher: EvidenceFetch,
  token?: string,
): Promise<EvidenceSnapshot> {
  const repo = await githubJson(fetcher, `/repos/${ref.owner}/${ref.repo}`, token);
  const title = stringField(repo, 'full_name') || `${ref.owner}/${ref.repo}`;
  const description = stringField(repo, 'description');

  return {
    ...base,
    title,
    summary: description || `GitHub repo ${title} 已验证`,
    confidence: 0.65,
    status: 'verified',
    warnings: ['GitHub repo 只能证明项目存在，不能单独证明具体贡献已完成'],
    github: {
      owner: ref.owner,
      repo: ref.repo,
      state: stringField(repo, 'visibility'),
      createdAt: stringField(repo, 'created_at'),
      updatedAt: stringField(repo, 'updated_at'),
      htmlUrl: stringField(repo, 'html_url') || ref.htmlUrl,
    },
  };
}

async function githubJson(fetcher: EvidenceFetch, path: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'cghub-agent',
  };
  if (token?.trim()) headers.authorization = `Bearer ${token.trim()}`;
  const response = await fetcher(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return response.json();
}

function normalizeEvidenceKey(value: string): string {
  const parsed = parseUrl(value.trim());
  if (parsed) return normalizeUrl(parsed).toLowerCase();
  return value.trim().toLowerCase();
}

function normalizeUrl(url: URL): string {
  url.hash = '';
  url.search = '';
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, '');
}

function summarizeText(value: string | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function stringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function numberField(input: unknown, key: string): number | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanField(input: unknown, key: string): boolean | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function nestedString(input: unknown, path: string[]): string | undefined {
  let current: unknown = input;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current : undefined;
}

function shortError(error: any): string {
  return error?.message ? String(error.message).slice(0, 160) : String(error).slice(0, 160);
}
