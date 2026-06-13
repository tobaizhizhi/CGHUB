/**
 * 链上交易执行器：用 Cobo SDK + api_key 让 CAW 钱包发交易。
 * SDK 负责向 CAW 提交 contractCall/transferTokens；交易签名走 Cobo 云端服务端签名。
 *
 * 用 pact-scoped api_key 发交易；api key 来自 WalletAgent 的具体 Pact 入口。
 */

import {
  Configuration,
  TransactionsApi,
  TransactionRecordsApi,
} from '@cobo/agentic-wallet';
import { config } from './config.js';

let txApi: TransactionsApi | undefined;
let recApi: TransactionRecordsApi | undefined;

/** 用 pact-scoped api_key 初始化交易 API。 */
export function initApisWithPactKey(pactApiKey: string): void {
  const scoped = new Configuration({ apiKey: pactApiKey, basePath: config.cobo.basePath });
  txApi = new TransactionsApi(scoped);
  recApi = new TransactionRecordsApi(scoped);
}

function assertApis(): void {
  if (!txApi || !recApi) throw new Error('交易 API 未初始化，先传入 pact-scoped api_key 或调用 initApisWithPactKey');
}

function apisForPactKey(pactApiKey?: string): { tx: TransactionsApi; rec: TransactionRecordsApi } {
  if (pactApiKey) {
    const scoped = new Configuration({ apiKey: pactApiKey, basePath: config.cobo.basePath });
    return { tx: new TransactionsApi(scoped), rec: new TransactionRecordsApi(scoped) };
  }
  assertApis();
  return { tx: txApi!, rec: recApi! };
}

function requireTxId(id: string | undefined): string {
  if (!id) throw new Error('Cobo 交易提交响应缺少 tx id');
  return id;
}

/** 发一笔合约调用，返回 txId（record uuid） */
export async function contractCall(
  contract: string,
  calldata: string,
  requestId: string,
  pactApiKey?: string,
): Promise<{ txId: string }> {
  if (!config.caw.srcAddress) throw new Error('缺 CAW_SRC_ADDRESS（CAW 钱包地址）');
  const apis = apisForPactKey(pactApiKey);
  const res = (
    await apis.tx.contractCall(config.cobo.walletUuid, {
      chain_id: config.caw.chainId,
      contract_addr: contract,
      calldata,
      src_addr: config.caw.srcAddress,
      value: '0',
      sponsor: true,
      request_id: requestId,
    })
  ).data.result;
  return { txId: requireTxId(res.id) };
}

/** 发一笔 Cobo 原生 token transfer，用于护栏演示（amount 对 Policy 可见）。 */
export async function transferTokens(amount: string, requestId: string, pactApiKey?: string): Promise<{ txId: string }> {
  if (!config.caw.srcAddress) throw new Error('缺 CAW_SRC_ADDRESS（CAW 钱包地址）');
  const destination = config.caw.guardDestination || config.caw.srcAddress;
  const apis = apisForPactKey(pactApiKey);
  const res = (
    await apis.tx.transferTokens(config.cobo.walletUuid, {
      chain_id: config.caw.chainId,
      dst_addr: destination,
      token_id: config.caw.guardTokenId,
      amount,
      src_addr: config.caw.srcAddress,
      sponsor: true,
      request_id: requestId,
      description: 'CGHub guardrail demo transfer',
    })
  ).data.result;
  return { txId: requireTxId(res.id) };
}

/** 轮询交易直到上链确认，返回 tx hash */
export async function waitTx(
  txId: string,
  timeoutMs = 120_000,
  pactApiKey?: string,
): Promise<{ status: string; hash?: string }> {
  const apis = apisForPactKey(pactApiKey);
  const start = Date.now();
  for (;;) {
    // SDK 的 status 是数字码，用 status_display 字符串判断（success/failed/broadcasting...）
    const r = (await apis.rec.getUserTransaction(config.cobo.walletUuid, txId)).data.result as any;
    const disp = String(r.status_display ?? '').toLowerCase();
    if (disp === 'success') return { status: disp, hash: r.transaction_hash as string };
    if (disp === 'failed' || disp === 'rejected') throw new Error(`tx ${disp}`);
    if (Date.now() - start > timeoutMs) throw new Error(`tx ${txId} 等待超时(最后状态 ${disp})`);
    await new Promise((res) => setTimeout(res, 5000));
  }
}
