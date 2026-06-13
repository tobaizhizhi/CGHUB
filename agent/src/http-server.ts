/**
 * HTTP API 服务：给前端用。
 * 把 4 个工具包成 REST 接口——前端可自行读链，但不碰私钥、不碰 CAW 凭证。
 * CAW 机密凭证只待在本服务的 env 里，绝不下发前端。
 *
 * 跑：npm run api（默认 8787，改 PORT 环境变量）
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

import { signContributionTool } from '../tools/sign-contribution.js';
import { submitContributionTool } from '../tools/submit-contribution.js';
import { checkPendingTool } from '../tools/check-pending.js';
import { triggerClaimTool } from '../tools/trigger-claim.js';
import { getAuditTool } from '../tools/get-audit.js';
import { startAutoClaimLoop } from './auto-claim-loop.js';
import { startCoboApprovalSyncLoop } from './cobo-approval-sync-loop.js';
import { coboErrorMessage, isPolicyDenied } from './cobo-errors.js';
import { appendDecision } from './decision-log.js';
import { guardProbeEnabled, startGuardProbeOnce } from './guard-probe.js';
import {
  defaultAgentRegistry,
  type AgentRegistryReader,
  type AgentRegistryWriter,
  type DecisionInput,
} from './agent-registry.js';
import {
  contributionReviewStore as defaultContributionReviewStore,
  publicContributionReviewRecord,
  type ContributionReviewStore,
} from './contribution-review-store.js';
import { syncCoboApprovalAndRecordContributionReview } from './contribution-review-executor.js';
import {
  JsonRoundRegistry,
  RoundRegistryError,
  type RoundRegistryReader,
  type RoundRegistryWriter,
} from './round-registry.js';
import { WalletAgent, type RoundScope } from './wallet-agent.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

type HttpAgentRegistry = AgentRegistryReader & Partial<Pick<AgentRegistryWriter, 'appendDecision'>>;

interface AgentHttpServerDeps {
  checkPending?: typeof checkPendingTool.handler;
  signContribution?: typeof signContributionTool.handler;
  submitContribution?: typeof submitContributionTool.handler;
  syncCoboApproval?: typeof syncCoboApprovalAndRecordContributionReview;
  contributionReviewStore?: ContributionReviewStore;
  agentRegistry?: HttpAgentRegistry;
  roundRegistry?: RoundRegistryReader;
  walletAgent?: Pick<
    WalletAgent,
    | 'getCoboStatus'
    | 'guardDemo'
    | 'fundRoundFromTreasury'
    | 'payX402'
    | 'checkPending'
    | 'claimForContributor'
  >;
}

type AnyRoundRegistry = RoundRegistryReader | RoundRegistryWriter;

function corsOrigin(req: IncomingMessage): string {
  const requestOrigin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0] ?? 'http://localhost:3000';
}

function send(req: IncomingMessage, res: ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': corsOrigin(req),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'origin',
  });
  res.end(text);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function hasRoundScope(input: { projectId?: unknown; roundId?: unknown }): boolean {
  return input.projectId !== undefined && input.roundId !== undefined;
}

function resolveReviewStore(store?: ContributionReviewStore): ContributionReviewStore {
  return store ?? defaultContributionReviewStore;
}

function resolveAgentRegistry(registry?: HttpAgentRegistry): AgentRegistryReader {
  return registry ?? defaultAgentRegistry;
}

function appendServerDecision(registry: HttpAgentRegistry | undefined, event: DecisionInput): void {
  if (registry?.appendDecision) {
    registry.appendDecision(event);
    return;
  }
  appendDecision(event);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function validateSubmitReview(body: any, store: ContributionReviewStore): { ok: true } | { ok: false; status: number; error: string } {
  const proofHash = typeof body?.proof?.proofHash === 'string' ? body.proof.proofHash : '';
  const signature = typeof body?.signature === 'string' ? body.signature : '';
  if (!proofHash || !signature) return { ok: false, status: 400, error: '缺 proof.proofHash 或 signature' };

  const review = store.findByProofHash(proofHash);
  if (!review) return { ok: false, status: 403, error: 'proof 未绑定已审批 review，拒绝外部上链' };
  if (review.status !== 'auto_allowed' && review.status !== 'cobo_approved') {
    return { ok: false, status: 403, error: `review 状态 ${review.status} 不允许上链` };
  }
  if (!review.signature || review.signature.toLowerCase() !== signature.toLowerCase()) {
    return { ok: false, status: 403, error: 'signature 与后端保存的 review 不一致' };
  }
  if (review.recorded) return { ok: false, status: 409, error: 'review 已经上链记录' };
  return { ok: true };
}

function resolveRoundRegistry(registry?: AnyRoundRegistry): AnyRoundRegistry {
  return registry ?? new JsonRoundRegistry();
}

function resolveRoundRegistryWriter(registry?: AnyRoundRegistry): RoundRegistryWriter {
  const resolved = resolveRoundRegistry(registry);
  if (
    'suggestNextRoundScope' in resolved &&
    'checkRoundIdAvailability' in resolved &&
    'createDraftActivity' in resolved &&
    'markRoundCreated' in resolved &&
    'markRoundFinalized' in resolved
  ) {
    return resolved;
  }
  throw new RoundRegistryError('当前 Round Registry 不支持管理者写入操作', 500);
}

export function createAgentHttpServer(deps: AgentHttpServerDeps = {}): Server {
  return createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(req, res, 204, {});

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // 健康检查
    if (req.method === 'GET' && path === '/') {
      return send(req, res, 200, { ok: true, service: 'cghub-agent-api' });
    }

    // Agent 决策流 → { items: DecisionEvent[] }
    if (req.method === 'GET' && path === '/api/decisions') {
      const limit = Number(url.searchParams.get('limit') ?? '30');
      const projectId = url.searchParams.get('projectId') ?? undefined;
      const roundId = url.searchParams.get('roundId') ?? undefined;
      const registry = resolveAgentRegistry(deps.agentRegistry);
      return send(req, res, 200, { items: registry.listDecisions(limit, { projectId, roundId }) });
    }

    if (req.method === 'GET' && path === '/api/reviews') {
      const store = resolveReviewStore(deps.contributionReviewStore);
      const items = store.list({
        status: (url.searchParams.get('status') ?? undefined) as any,
        projectId: url.searchParams.get('projectId') ?? undefined,
        roundId: url.searchParams.get('roundId') ?? undefined,
        contributor: url.searchParams.get('contributor') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? '50'),
      });
      return send(req, res, 200, { items: items.map(publicContributionReviewRecord) });
    }

    if (req.method === 'GET' && path === '/api/agent-registry') {
      const registry = resolveAgentRegistry(deps.agentRegistry);
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const projectId = url.searchParams.get('projectId') ?? undefined;
      const roundId = url.searchParams.get('roundId') ?? undefined;
      const contributor = url.searchParams.get('contributor') ?? undefined;
      const reviews = registry.listReviews({ projectId, roundId, contributor, limit });
      return send(req, res, 200, {
        reviews: reviews.map(publicContributionReviewRecord),
        decisions: registry.listDecisions(limit, { projectId, roundId }),
        activityEvents: registry.listActivityEvents({ projectId, roundId, contributor, limit }),
      });
    }

    if (req.method === 'POST' && path.startsWith('/api/reviews/')) {
      const rest = path.slice('/api/reviews/'.length);
      const parts = rest.split('/');
      if (parts.length !== 2) return send(req, res, 404, { error: `无此路由: ${req.method} ${path}` });

      const id = decodeURIComponent(parts[0]);
      const action = parts[1];
      const body = await readJson(req);
      const store = resolveReviewStore(deps.contributionReviewStore);
      const current = store.get(id);
      if (!current) return send(req, res, 404, { error: `无此贡献审批记录: ${id}` });

      if (action === 'sync-cobo') {
        if (current.status !== 'pending_cobo_approval' && current.status !== 'cobo_approved') {
          return send(req, res, 409, { error: `review 状态 ${current.status} 不能同步 Cobo 审批` });
        }
        const syncCoboApproval = deps.syncCoboApproval ?? syncCoboApprovalAndRecordContributionReview;
        const synced = await syncCoboApproval(current, {
          store,
          submitContribution: deps.submitContribution,
        });
        appendServerDecision(deps.agentRegistry, {
          stage: 'cobo_approval',
          projectId: synced.review.projectId,
          roundId: synced.review.roundId,
          contributor: synced.review.contributor,
          result: synced.coboRejected ? 'denied' : synced.coboPending ? 'pending' : 'allowed',
          score: synced.review.score,
          reason: synced.coboRejected
            ? 'Cobo App 拒绝评分 proof'
            : synced.coboPending
              ? '等待 Cobo App 审批评分 proof'
              : 'Cobo App 审批通过并返回 signature',
          reviewStatus: synced.review.status,
          triggeredRules: synced.review.triggeredRules,
          reviewId: synced.review.id,
        });
        if (synced.review.signerAddress) {
          appendServerDecision(deps.agentRegistry, {
            stage: 'signed',
            projectId: synced.review.projectId,
            roundId: synced.review.roundId,
            contributor: synced.review.contributor,
            result: 'allowed',
            reason: 'Cobo App 审批后 EIP-712 签名完成',
            signerAddress: synced.review.signerAddress,
            reviewStatus: synced.review.status,
            reviewId: synced.review.id,
          });
        }
        if (synced.txHash) {
          appendServerDecision(deps.agentRegistry, {
            stage: 'recorded',
            projectId: synced.review.projectId,
            roundId: synced.review.roundId,
            contributor: synced.review.contributor,
            result: 'allowed',
            reason: 'CAW Main Pact 已写入 recordContributionBySig',
            txHash: synced.txHash,
            reviewStatus: synced.review.status,
            reviewId: synced.review.id,
          });
        }
        return send(req, res, 200, { item: publicContributionReviewRecord(synced.review) });
      }

      if (action === 'needs-more-evidence') {
        if (current.status !== 'pending_cobo_approval') {
          return send(req, res, 409, { error: `review 状态 ${current.status} 不能要求补证据` });
        }
        const updated = store.updateStatus(id, {
          status: 'needs_more_evidence',
          reviewer: body.reviewer ? String(body.reviewer) : undefined,
          reviewNote: body.reviewNote ? String(body.reviewNote) : undefined,
        });
        appendServerDecision(deps.agentRegistry, {
          stage: 'review',
          projectId: updated.projectId,
          roundId: updated.roundId,
          contributor: updated.contributor,
          result: 'pending',
          score: updated.score,
          reason: body.reviewNote ? String(body.reviewNote) : '要求补充证据',
          reviewStatus: 'needs_more_evidence',
          triggeredRules: updated.triggeredRules,
          reviewId: updated.id,
        });
        return send(req, res, 200, { item: publicContributionReviewRecord(updated) });
      }

      return send(req, res, 404, { error: `无此路由: ${req.method} ${path}` });
    }

    if (req.method === 'GET' && path === '/api/rounds') {
      const registry = resolveRoundRegistry(deps.roundRegistry);
      return send(req, res, 200, { items: await registry.listRounds() });
    }

    if (req.method === 'GET' && path.startsWith('/api/rounds/')) {
      const id = decodeURIComponent(path.slice('/api/rounds/'.length));
      const registry = resolveRoundRegistry(deps.roundRegistry);
      const round = await registry.getRound(id);
      if (!round) return send(req, res, 404, { error: `无此资金池: ${id}` });
      return send(req, res, 200, round);
    }

    if (req.method === 'GET' && path === '/api/manager/next-round-id') {
      const registry = resolveRoundRegistryWriter(deps.roundRegistry);
      return send(req, res, 200, await registry.suggestNextRoundScope());
    }

    if (req.method === 'GET' && path === '/api/manager/round-id-availability') {
      const projectId = url.searchParams.get('projectId') ?? undefined;
      const roundId = url.searchParams.get('roundId') ?? undefined;
      if (!hasRoundScope({ projectId, roundId })) {
        return send(req, res, 400, { error: '缺 projectId / roundId 参数' });
      }
      const checkChain = /^(1|true|yes)$/i.test(url.searchParams.get('checkChain') ?? '');
      const registry = resolveRoundRegistryWriter(deps.roundRegistry);
      return send(req, res, 200, await registry.checkRoundIdAvailability({
        projectId: String(projectId),
        roundId: String(roundId),
        checkChain,
      }));
    }

    if (req.method === 'POST' && path === '/api/manager/activities/draft') {
      const body = await readJson(req);
      const registry = resolveRoundRegistryWriter(deps.roundRegistry);
      return send(req, res, 201, { item: await registry.createDraftActivity(body) });
    }

    if (req.method === 'POST' && path.startsWith('/api/manager/activities/')) {
      const rest = path.slice('/api/manager/activities/'.length);
      const parts = rest.split('/');
      if (parts.length !== 2) return send(req, res, 404, { error: `无此路由: ${req.method} ${path}` });

      const id = decodeURIComponent(parts[0]);
      const action = parts[1];
      const body = await readJson(req);
      const registry = resolveRoundRegistryWriter(deps.roundRegistry);
      if (action === 'mark-created') {
        return send(req, res, 200, { item: await registry.markRoundCreated(id, body) });
      }
      if (action === 'mark-finalized') {
        return send(req, res, 200, { item: await registry.markRoundFinalized(id, body) });
      }
      return send(req, res, 404, { error: `无此路由: ${req.method} ${path}` });
    }

    // 提交贡献 → review gate → Cobo Sign Pact 签名 → CAW Main Pact 上链。
    if (req.method === 'POST' && path === '/api/sign-contribution') {
      const body = await readJson(req);
      if (!hasRoundScope(body)) return send(req, res, 400, { error: '缺 projectId / roundId 参数' });
      try {
        const signContribution = deps.signContribution ?? signContributionTool.handler;
        return send(req, res, 200, await signContribution(body));
      } catch (e: any) {
        return send(req, res, 500, { error: coboErrorMessage(e) });
      }
    }

    // 内部/兼容上链入口：必须能匹配后端保存的 review proof/signature。
    if (req.method === 'POST' && path === '/api/submit-contribution') {
      const body = await readJson(req);
      const reviewCheck = validateSubmitReview(body, resolveReviewStore(deps.contributionReviewStore));
      if (!reviewCheck.ok) return send(req, res, reviewCheck.status, { error: reviewCheck.error });
      const submitContribution = deps.submitContribution ?? submitContributionTool.handler;
      const result = await submitContribution(body);
      const contributor = typeof body?.proof?.contributor === 'string' ? body.proof.contributor : '';
      if (contributor) {
        const proofScope = hasRoundScope(body.proof)
          ? { projectId: String(body.proof.projectId), roundId: String(body.proof.roundId) }
          : {};
        appendServerDecision(deps.agentRegistry, {
          stage: 'recorded',
          ...proofScope,
          contributor,
          result: 'allowed',
          reason: '贡献已上链 recordContributionBySig',
          txHash: result.txHash,
        });
      }
      return send(req, res, 200, result);
    }

    // 查可领 → { pending, score, claimed }（只读 RPC）
    if (req.method === 'GET' && path === '/api/pending') {
      const contributor = url.searchParams.get('contributor');
      if (!contributor) return send(req, res, 400, { error: '缺 contributor 参数' });
      const projectId = url.searchParams.get('projectId') ?? undefined;
      const roundId = url.searchParams.get('roundId') ?? undefined;
      if (!hasRoundScope({ projectId, roundId })) return send(req, res, 400, { error: '缺 projectId / roundId 参数' });
      const checkPending = deps.checkPending ?? checkPendingTool.handler;
      return send(req, res, 200, await checkPending({
        contributor,
        projectId,
        roundId,
      }));
    }

    // 审计日志 → { count, allowed, denied, items }（只读，给前端展示护栏）
    if (req.method === 'GET' && path === '/api/audit') {
      const limit = Number(url.searchParams.get('limit') ?? '20');
      return send(req, res, 200, await getAuditTool.handler({ limit }));
    }

    // Cobo 钱包状态 → 只返回可展示信息，不返回 owner key / pact api_key。
    if (req.method === 'GET' && path === '/api/cobo/status') {
      const walletAgent = deps.walletAgent ?? new WalletAgent();
      return send(req, res, 200, await walletAgent.getCoboStatus());
    }

    // CAW treasury 注资：CAW approve USDC -> CAW fundRound。
    if (req.method === 'POST' && path === '/api/cobo/fund-round') {
      const body = await readJson(req);
      if (!hasRoundScope(body)) return send(req, res, 400, { error: '缺 projectId / roundId 参数' });
      const amount = String(body.amount ?? '');
      const scope: RoundScope = {
        projectId: body.projectId,
        roundId: body.roundId,
      };
      const walletAgent = deps.walletAgent ?? new WalletAgent();
      const result = await walletAgent.fundRoundFromTreasury(amount, scope);
      appendServerDecision(deps.agentRegistry, {
        stage: 'fund',
        projectId: String(scope.projectId),
        roundId: String(scope.roundId),
        contributor: '0x0000000000000000000000000000000000000000',
        result: 'allowed',
        amount,
        txHash: result.fund.txHash,
        reason: 'CAW treasury approve + fundRound',
        gasless: true,
      });
      return send(req, res, 200, result);
    }

    // Cobo payment(x402)：返回 retry headers，调用方用于重放原请求。
    if (req.method === 'POST' && path === '/api/cobo/pay-x402') {
      const body = await readJson(req);
      const walletAgent = deps.walletAgent ?? new WalletAgent();
      const result = await walletAgent.payX402({
        paymentRequired: String(body.paymentRequired ?? ''),
        requestId: body.requestId ? String(body.requestId) : undefined,
      });
      appendServerDecision(deps.agentRegistry, {
        stage: 'payment',
        contributor: '0x0000000000000000000000000000000000000000',
        result: result.status === 'completed' || result.status === 'success' ? 'allowed' : 'pending',
        txHash: result.txHash,
        reason: `Cobo payment(x402) ${result.status}`,
      });
      return send(req, res, 200, result);
    }

    // 触发分账 → { txId, status }（后端持 CAW 凭证，走 contractCall claimFor）
    if (req.method === 'POST' && path === '/api/trigger-claim') {
      const body = await readJson(req);
      if (!hasRoundScope(body)) return send(req, res, 400, { error: '缺 projectId / roundId 参数' });
      const contributor = String(body.contributor ?? '');
      const scope = { projectId: String(body.projectId), roundId: String(body.roundId) };
      try {
        const timeoutMs = Number(process.env.CAW_CLAIM_REQUEST_TIMEOUT_MS ?? 18_000);
        const result = await withTimeout(
          triggerClaimTool.handler(body, { walletAgent: deps.walletAgent }),
          timeoutMs,
          `Cobo 代领请求超时(${timeoutMs}ms)，请稍后重试或检查 Cobo/RPC 状态`,
        );
        if (result.skipped) {
          appendServerDecision(deps.agentRegistry, {
            stage: 'claim',
            ...scope,
            contributor,
            result: 'pending',
            reason: result.reason,
          });
        } else {
          appendServerDecision(deps.agentRegistry, {
            stage: 'guard',
            ...scope,
            contributor,
            result: 'allowed',
            reason: 'Pact contract_call allowed',
          });
          appendServerDecision(deps.agentRegistry, {
            stage: 'claim',
            ...scope,
            contributor,
            result: 'allowed',
            amount: result.pending,
            txHash: result.txHash,
            gasless: true,
            reason: result.txHash ? 'claimFor 已上链确认' : `claimFor 已提交，Cobo 状态：${result.status ?? 'processing'}`,
          });
        }
        return send(req, res, 200, result);
      } catch (e: any) {
        const reason = coboErrorMessage(e);
        if (isPolicyDenied(e)) {
          appendServerDecision(deps.agentRegistry, {
            stage: 'guard',
            ...scope,
            contributor,
            result: 'denied',
            reason,
          });
          return send(req, res, 200, { skipped: true, status: 'denied', reason });
        }
        appendServerDecision(deps.agentRegistry, {
          stage: 'claim',
          ...scope,
          contributor,
          result: 'error',
          reason,
        });
        return send(req, res, 500, { error: reason });
      }
    }

    // Safety probe / 内部护栏调试：使用 transfer policy，让 amount_gt 能被 Cobo Policy 看见。
    if (req.method === 'POST' && (path === '/api/cobo/safety-probe' || path === '/api/guard-demo')) {
      const body = await readJson(req);
      const amount = String(body.amount ?? '0');
      const contributor = '0x0000000000000000000000000000000000000000';
      try {
        const walletAgent = deps.walletAgent ?? new WalletAgent();
        const txId = await walletAgent.guardDemo(amount);
        appendServerDecision(deps.agentRegistry, {
          stage: 'guard',
          contributor,
          result: 'error',
          amount,
          reason: `guard-demo was not blocked; transfer txId=${txId}`,
        });
        return send(req, res, 200, { blocked: false, amount, txId });
      } catch (e: any) {
        const reason = coboErrorMessage(e);
        if (isPolicyDenied(e)) {
          appendServerDecision(deps.agentRegistry, {
            stage: 'guard',
            contributor,
            result: 'denied',
            amount,
            reason,
          });
          return send(req, res, 200, { blocked: true, amount, reason });
        }
        throw e;
      }
    }

    send(req, res, 404, { error: `无此路由: ${req.method} ${path}` });
  } catch (e: any) {
    const statusCode = e instanceof RoundRegistryError ? e.statusCode : 500;
    send(req, res, statusCode, { error: e?.message ?? String(e) });
  }
  });
}

function startServer(): void {
  const server = createAgentHttpServer();
  server.listen(PORT, HOST, () => {
    console.error(`CGHub Agent HTTP API 已启动: http://${HOST}:${PORT}`);
    if (guardProbeEnabled()) {
      startGuardProbeOnce()
        .then((result) => {
          console.error(
            `[guard-probe] attempted=${result.attempted} blocked=${result.blocked ?? false} amount=${result.amount ?? '-'}`,
          );
        })
        .catch((e) => {
          console.error('[guard-probe] failed:', coboErrorMessage(e));
        });
    }
    startCoboApprovalSyncLoop();
    startAutoClaimLoop();
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entrypoint) startServer();
