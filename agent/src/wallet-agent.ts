/**
 * 模块 3：Cobo Agentic Wallet 调用
 * 分账走 CAW 钱包：读 pending（只读 RPC）→ caw tx call 调 claimFor。
 * CAW 钱包是 executor（在 Cobo Pact 范围内发交易/签名），不需要单独 executor 私钥。
 */

import { ethers } from 'ethers';
import {
  AuditApi,
  BalanceApi,
  Configuration,
  PendingOperationsApi,
  PactsApi,
  TransactionsApi,
  type AuditLogRead,
  type BalanceRead,
  type PactPublicRead,
  type PactSpecInput,
  type PendingOperationRead,
  type WalletPactStatsRead,
} from '@cobo/agentic-wallet';
import { loadPoolAbi } from './abi.js';
import { contractCall, transferTokens, waitTx } from './executor.js';
import { config } from './config.js';
import { getCghubPactDefinition } from './cobo-pacts.js';
import type { CoboPactSummary, CoboStatusResponse } from './types.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RoundScope {
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
}

export interface ClaimForContributorOptions extends RoundScope {
  waitForReceipt?: boolean;
  requestId?: string;
}

function resolveRoundScope(scope: RoundScope = {}): { projectId: bigint; roundId: bigint } {
  return {
    projectId: scope.projectId === undefined ? config.round.projectId : BigInt(scope.projectId),
    roundId: scope.roundId === undefined ? config.round.roundId : BigInt(scope.roundId),
  };
}

/** owner/operator 凭证的 Configuration（提交 pact / 读审计用，非 pact-scoped）。 */
function ownerConfig(): Configuration {
  return new Configuration({ apiKey: config.cobo.apiKey, basePath: config.cobo.basePath });
}

function summarizePact(pact: PactPublicRead): CoboPactSummary {
  return {
    id: pact.id,
    name: pact.name,
    status: pact.status,
    activatedAt: pact.activated_at,
    expiresAt: pact.expires_at,
    progressTxCount: pact.progress_tx_count,
    progressUsdSpent: pact.progress_usd_spent,
    policies: (pact.effective_policies ?? pact.spec?.policies ?? []) as unknown[],
  };
}

function summarizeBalance(balance: BalanceRead): CoboStatusResponse['balances'][number] {
  return {
    tokenId: balance.token_id,
    chainId: balance.chain_id,
    address: balance.address,
    balance: balance.amount,
  };
}

function summarizePendingOperation(operation: PendingOperationRead): CoboStatusResponse['pendingOperations'][number] {
  return {
    id: operation.id,
    status: operation.status,
    action: operation.operation_type,
    createdAt: operation.created_at,
  };
}

function summarizePactStats(stats?: WalletPactStatsRead): CoboStatusResponse['pactStats'] | undefined {
  if (!stats) return undefined;
  return {
    totalPacts: stats.total_pacts,
    activePacts: stats.total_active_pacts,
    txCount: stats.total_tx_count,
    volumeUsd: stats.total_volume_usd,
  };
}

/** 轮询 pact 到 active，返回 pact-scoped api_key。 */
async function waitForPactActive(pactsApi: PactsApi, pactId: string): Promise<string> {
  const terminal = new Set(['rejected', 'expired', 'revoked', 'completed', 'withdrawn']);
  for (;;) {
    const pact = (await pactsApi.getPact(pactId)).data.result;
    const status = String(pact.status ?? '').toLowerCase();
    if (status === 'active') {
      if (!pact.api_key) throw new Error(`pact ${pact.id} 已 active，但当前 API key 看不到 pact-scoped api_key`);
      return pact.api_key;
    }
    if (terminal.has(status)) throw new Error(`Pact ${pactId} 进入终态: ${status}`);
    await sleep(5_000);
  }
}

async function getOrSubmitPact(
  cacheLabel: string,
  configuredPactId: string,
  intent: string,
  spec: PactSpecInput,
): Promise<string> {
  const pactsApi = new PactsApi(ownerConfig());
  if (configuredPactId) return waitForPactActive(pactsApi, configuredPactId);

  const resp = await pactsApi.submitPact({
    wallet_id: config.cobo.walletUuid,
    intent,
    spec,
  });
  const pactId = resp.data.result.pact_id;
  console.error(`[${cacheLabel}] 已提交 Pact，等待 active: ${pactId}`);
  return waitForPactActive(pactsApi, pactId);
}

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
];

interface WalletAgentDeps {
  contractCall?: typeof contractCall;
  transferTokens?: typeof transferTokens;
  waitTx?: typeof waitTx;
  ensurePactReady?: () => Promise<string>;
  ensureFundPactReady?: () => Promise<string>;
  payment?: (request: { protocol: 'x402'; x402_payment_required: string; request_id?: string }) => Promise<{
    id?: string;
    status: string;
    retry_headers?: Record<string, string>;
    tx_hash?: string;
  }>;
}

export class WalletAgent {
  private static pactApiKey?: string;
  private static guardPactApiKey?: string;
  private static signPactApiKey?: string;
  private static fundPactApiKey?: string;
  private deps: WalletAgentDeps;

  constructor(deps: WalletAgentDeps = {}) {
    this.deps = deps;
  }

  /** 提交/激活主线 Pact，返回并缓存 pact-scoped api_key。 */
  async ensurePactReady(): Promise<string> {
    if (this.deps.ensurePactReady) return this.deps.ensurePactReady();
    if (WalletAgent.pactApiKey) return WalletAgent.pactApiKey;
    const pact = getCghubPactDefinition('main');
    WalletAgent.pactApiKey = await getOrSubmitPact(
      pact.cacheLabel,
      pact.configuredPactId,
      pact.intent,
      pact.spec,
    );
    return WalletAgent.pactApiKey;
  }

  /** 提交/激活 transfer 护栏演示 Pact，返回并缓存 pact-scoped api_key。 */
  async ensureGuardPactReady(): Promise<string> {
    if (WalletAgent.guardPactApiKey) return WalletAgent.guardPactApiKey;
    const pact = getCghubPactDefinition('guard');
    WalletAgent.guardPactApiKey = await getOrSubmitPact(
      pact.cacheLabel,
      pact.configuredPactId,
      pact.intent,
      pact.spec,
    );
    return WalletAgent.guardPactApiKey;
  }

  /** 提交/激活 EIP-712 message_sign Pact，返回并缓存 pact-scoped api_key。 */
  async ensureSignPactReady(): Promise<string> {
    if (!config.caw.signPactId && config.caw.legacyCombinedPact && config.caw.pactId) {
      return this.ensurePactReady();
    }
    if (WalletAgent.signPactApiKey) return WalletAgent.signPactApiKey;
    const pact = getCghubPactDefinition('sign');
    WalletAgent.signPactApiKey = await getOrSubmitPact(
      pact.cacheLabel,
      pact.configuredPactId,
      pact.intent,
      pact.spec,
    );
    return WalletAgent.signPactApiKey;
  }

  /** 提交/激活可选 CAW treasury funding Pact，返回并缓存 pact-scoped api_key。 */
  async ensureFundPactReady(): Promise<string> {
    if (this.deps.ensureFundPactReady) return this.deps.ensureFundPactReady();
    if (!config.caw.fundPactId && config.caw.legacyCombinedPact && config.caw.pactId) {
      return this.ensurePactReady();
    }
    if (WalletAgent.fundPactApiKey) return WalletAgent.fundPactApiKey;
    const pact = getCghubPactDefinition('fund');
    WalletAgent.fundPactApiKey = await getOrSubmitPact(
      pact.cacheLabel,
      pact.configuredPactId,
      pact.intent,
      pact.spec,
    );
    return WalletAgent.fundPactApiKey;
  }

  /** 拉审计日志，Demo 展示 allowed/denied。limit 前有 8 个可选占位参数。 */
  async getAuditTrail(limit = 20): Promise<AuditLogRead[]> {
    const audit = new AuditApi(ownerConfig());
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const logs = await audit.listAuditLogs(
      config.cobo.walletUuid,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      safeLimit,
    );
    return logs.data.result.items ?? [];
  }

  /** 拉 Cobo 钱包可展示状态。严禁返回 owner key / pact api_key 等 secret。 */
  async getCoboStatus(): Promise<CoboStatusResponse> {
    const owner = ownerConfig();
    const pacts = new PactsApi(owner);
    const balancesApi = new BalanceApi(owner);
    const pendingApi = new PendingOperationsApi(owner);

    const [mainPact, signPact, fundPact, guardPact, pactStats, balances, pendingOperations] = await Promise.all([
      this.readPactSummary(pacts, config.caw.pactId),
      this.readPactSummary(pacts, config.caw.signPactId),
      this.readPactSummary(pacts, config.caw.fundPactId),
      this.readPactSummary(pacts, config.caw.guardPactId),
      pacts.getWalletPactStats(config.cobo.walletUuid, false, 'zh')
        .then((response) => summarizePactStats(response.data.result))
        .catch(() => undefined),
      balancesApi.listBalances(
        config.cobo.walletUuid,
        config.caw.chainId,
        config.caw.srcAddress || undefined,
        undefined,
        Boolean(config.caw.srcAddress),
        20,
      )
        .then((response) => (response.data.result ?? []).map(summarizeBalance))
        .catch(() => []),
      pendingApi.listPendingOperations('pending', undefined, undefined, undefined, 20)
        .then((response) => (response.data.result.items ?? []).map(summarizePendingOperation))
        .catch(() => []),
    ]);

    return {
      walletId: config.cobo.walletUuid,
      srcAddress: config.caw.srcAddress,
      chainId: config.caw.chainId,
      tokenId: config.caw.guardTokenId,
      mainPact,
      signPact,
      fundPact,
      guardPact,
      pactStats,
      balances,
      pendingOperations,
    };
  }

  private async readPactSummary(pacts: PactsApi, pactId: string): Promise<CoboPactSummary | undefined> {
    if (!pactId) return undefined;
    return pacts.getPact(pactId)
      .then((response) => summarizePact(response.data.result))
      .catch(() => undefined);
  }

  /** 读合约 pending()，判断有没有可领。只读 RPC，不经 CAW */
  async checkPending(contributor: string, scope: RoundScope = {}): Promise<bigint> {
    const provider = new ethers.JsonRpcProvider(config.chain.rpcUrl);
    const pool = new ethers.Contract(config.chain.poolAddress, loadPoolAbi(), provider);
    const round = resolveRoundScope(scope);
    return pool.pending(round.projectId, round.roundId, contributor);
  }

  /**
   * pending>0 时让 CAW 钱包调 claimFor 代领。
   * 钱从 ContributionPool → contributor，CAW 钱包只是调用方（出 gas）。
   */
  async claimForContributor(
    contributor: string,
    scope: ClaimForContributorOptions = {},
  ): Promise<{ txId: string; status: string; hash?: string }> {
    const pactKey = await this.ensurePactReady();
    const iface = new ethers.Interface(loadPoolAbi());
    const round = resolveRoundScope(scope);
    const calldata = iface.encodeFunctionData('claimFor', [
      round.projectId,
      round.roundId,
      contributor,
    ]);
    const requestId = scope.requestId || `claim-${round.projectId}-${round.roundId}-${contributor.slice(2, 10)}`;
    const call = this.deps.contractCall ?? contractCall;
    const wait = this.deps.waitTx ?? waitTx;
    const sub = await call(config.chain.poolAddress, calldata, requestId, pactKey);
    if (!scope.waitForReceipt) return { txId: sub.txId, status: 'processing' };
    const done = await wait(sub.txId, Number(process.env.CAW_CLAIM_WAIT_TIMEOUT_MS ?? 20_000), pactKey);
    return { txId: sub.txId, status: done.status, hash: done.hash };
  }

  /** CAW treasury 注资：先 approve USDC，再 fundRound。 */
  async fundRoundFromTreasury(amount: string, scope: RoundScope = {}): Promise<{
    approve: { txId: string; status: string; txHash?: string };
    fund: { txId: string; status: string; txHash?: string };
  }> {
    const trimmed = String(amount ?? '').trim();
    if (!trimmed) throw new Error('fund amount 不能为空');
    const value = ethers.parseUnits(trimmed, 6);
    if (value <= 0n) throw new Error('fund amount 必须大于 0');

    const pactKey = await this.ensureFundPactReady();
    const call = this.deps.contractCall ?? contractCall;
    const wait = this.deps.waitTx ?? waitTx;
    const suffix = `${Date.now()}`;
    const round = resolveRoundScope(scope);

    const erc20 = new ethers.Interface(ERC20_ABI);
    const approveCalldata = erc20.encodeFunctionData('approve', [config.chain.poolAddress, value]);
    const approveRequestId = `approve-${round.projectId}-${round.roundId}-${suffix}`;
    const approveSub = await call(config.chain.usdcAddress, approveCalldata, approveRequestId, pactKey);
    const approveDone = await wait(approveSub.txId, 120_000, pactKey);

    const pool = new ethers.Interface(loadPoolAbi());
    const fundCalldata = pool.encodeFunctionData('fundRound', [
      round.projectId,
      round.roundId,
      value,
    ]);
    const fundRequestId = `fund-${round.projectId}-${round.roundId}-${suffix}`;
    const fundSub = await call(config.chain.poolAddress, fundCalldata, fundRequestId, pactKey);
    const fundDone = await wait(fundSub.txId, 120_000, pactKey);

    return {
      approve: { txId: approveSub.txId, status: approveDone.status, txHash: approveDone.hash },
      fund: { txId: fundSub.txId, status: fundDone.status, txHash: fundDone.hash },
    };
  }

  /** Cobo payment(x402)：返回 retry headers，调用方用它重放原付费请求。 */
  async payX402(input: { paymentRequired: string; requestId?: string }): Promise<{
    id?: string;
    status: string;
    retryHeaders: Record<string, string>;
    txHash?: string;
  }> {
    const paymentRequired = String(input.paymentRequired ?? '').trim();
    if (!paymentRequired) throw new Error('缺 x402 Payment-Required challenge');
    const requestId = input.requestId || `x402-${Date.now()}`;

    const pay = this.deps.payment ?? (async (request) => {
      const api = new TransactionsApi(new Configuration({
        apiKey: config.cobo.apiKey,
        basePath: config.cobo.basePath,
      }));
      const response = await api.payment(config.cobo.walletUuid, request);
      return response.data.result;
    });

    const result = await pay({
      protocol: 'x402',
      x402_payment_required: paymentRequired,
      request_id: requestId,
    });

    return {
      id: result.id,
      status: result.status,
      retryHeaders: result.retry_headers ?? {},
      txHash: result.tx_hash,
    };
  }

  /** 护栏演示：用 Cobo 原生 transfer 触发 amount_gt，金额对 Policy 可见。 */
  async guardDemo(amount: string): Promise<string> {
    const normalizedAmount = String(amount || '0').trim();
    const value = Number(normalizedAmount);
    if (!Number.isFinite(value) || value <= 0) throw new Error('guard-demo amount 必须是大于 0 的数字');

    const pactKey = await this.ensureGuardPactReady();
    const requestId = `guard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const transfer = this.deps.transferTokens ?? transferTokens;
    const sub = await transfer(normalizedAmount, requestId, pactKey);
    return sub.txId;
  }
}
