import {
  Configuration,
  PendingOperationsApi,
  TransactionRecordsApi,
  TransactionsApi,
} from '@cobo/agentic-wallet';
import { config } from './config.js';
import type { ContributionProof } from './types.js';
import { WalletAgent } from './wallet-agent.js';

export interface Eip712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown> & Pick<ContributionProof, 'proofHash'>;
}

export interface CoboTypedDataSigner {
  signTypedData(typedData: Eip712TypedData): Promise<string>;
}

export interface CoboMessageSignRequestOptions {
  sync?: boolean;
  description?: string;
  requestId?: string;
}

export interface CoboMessageSignStatus {
  state: 'pending' | 'signed' | 'rejected';
  txId?: string;
  approvalId?: string;
  status?: number;
  statusDisplay?: string;
  approvalStatus?: string;
  signature?: string;
  failedReason?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CoboMessageSigner implements CoboTypedDataSigner {
  async signTypedData(typedData: Eip712TypedData): Promise<string> {
    const submitted = await submitCoboTypedDataForSignature(typedData, {
      sync: true,
      description: 'CGHub contribution proof',
      requestId: `proof-${typedData.message.proofHash.slice(2, 18)}`,
    });
    if (submitted.signature) return submitted.signature;
    if (!submitted.txId) throw new Error('Cobo messageSign 未返回 signature 或 tx id');
    return waitForMessageSignature(submitted.txId, submitted);
  }
}

async function messageSignApis(): Promise<{
  tx: TransactionsApi;
  records: TransactionRecordsApi;
  pendingOperations: PendingOperationsApi;
}> {
  if (!config.caw.srcAddress) throw new Error('缺 CAW_SRC_ADDRESS，无法用 Cobo messageSign 签 proof');
  const pactKey = await new WalletAgent().ensureSignPactReady();
  const coboConfig = new Configuration({
    apiKey: pactKey,
    basePath: config.cobo.basePath,
  });
  return {
    tx: new TransactionsApi(coboConfig),
    records: new TransactionRecordsApi(coboConfig),
    pendingOperations: new PendingOperationsApi(coboConfig),
  };
}

export async function submitCoboTypedDataForSignature(
  typedData: Eip712TypedData,
  options: CoboMessageSignRequestOptions = {},
): Promise<CoboMessageSignStatus> {
  const { tx } = await messageSignApis();
  const response = await tx.messageSign(config.cobo.walletUuid, {
      chain_id: config.caw.chainId,
      destination_type: 'eip712',
      eip712_typed_data: typedData,
      source_address: config.caw.srcAddress,
      description: options.description ?? 'CGHub contribution proof',
      sync: options.sync ?? true,
      request_id: options.requestId ?? `proof-${typedData.message.proofHash.slice(2, 18)}`,
  });
  const result = response.data.result as any;
  return normalizeMessageSignStatus({
    signature: pickSignature(result),
    txId: result.id,
    approvalId: result.approval_id ?? result.pending_operation_id,
    status: result.status,
    statusDisplay: result.status_display,
    failedReason: result.failed_reason,
  });
}

export async function readCoboMessageSignStatus(txId: string): Promise<CoboMessageSignStatus> {
  const { records, pendingOperations } = await messageSignApis();
  const record = (await records.getUserTransaction(config.cobo.walletUuid, txId)).data.result as any;
  const approvalId = record.approval_id ?? record.pending_operation_id;
  const fromRecord = normalizeCoboMessageSignRecord(record);
  if (fromRecord.signature || fromRecord.state === 'rejected' || !approvalId) return fromRecord;

  const pendingOperation = await findPendingOperationForMessageSign(pendingOperations, {
    approvalId,
    requestId: record.request_id,
  });

  return normalizeCoboMessageSignRecord(record, pendingOperation);
}

async function findPendingOperationForMessageSign(
  pendingOperations: PendingOperationsApi,
  input: { approvalId?: string; requestId?: string },
): Promise<Record<string, any> | undefined> {
  if (input.approvalId) {
    const byId = await pendingOperations.getPendingOperation(input.approvalId)
      .then((response) => response.data.result as any)
      .catch(() => undefined);
    if (byId) return byId;
  }

  if (!input.requestId) return undefined;
  for (const status of ['executed', 'executing', 'pending', 'rejected'] as const) {
    const matched = await pendingOperations.listPendingOperations(status, undefined, undefined, undefined, 50)
      .then((response) => {
        const items = (response.data.result.items ?? []) as any[];
        return items.find((item) =>
          item.request_id === input.requestId ||
          (input.approvalId && item.id === input.approvalId)
        );
      })
      .catch(() => undefined);
    if (matched) return matched;
  }

  return undefined;
}

export function normalizeCoboMessageSignRecord(
  record: Record<string, any>,
  pendingOperation?: Record<string, any>,
): CoboMessageSignStatus {
  const approvalId = record.approval_id ?? record.pending_operation_id ?? pendingOperation?.id;
  const signature =
    pickSignature(record) ??
    pickSignature(record.data) ??
    pickSignature(pendingOperation?.execution_result) ??
    pickSignature(pendingOperation);

  return normalizeMessageSignStatus({
    signature,
    txId: record.id,
    approvalId,
    status: record.status,
    statusDisplay: compact([
      record.status_display,
      record.sub_status,
      pendingOperation?.status ? `approval:${pendingOperation.status}` : undefined,
    ]).join(' / '),
    approvalStatus: pendingOperation?.status,
    failedReason: pendingOperation?.last_error ?? record.data?.failed_reason,
  });
}

function normalizeMessageSignStatus(input: {
  signature?: string;
  txId?: string,
  approvalId?: string,
  status?: number,
  statusDisplay?: string,
  approvalStatus?: string,
  failedReason?: string,
}): CoboMessageSignStatus {
  if (typeof input.signature === 'string' && input.signature) {
    return { ...input, state: 'signed' };
  }
  const normalized = String(input.statusDisplay ?? '').toLowerCase();
  const approvalStatus = String(input.approvalStatus ?? '').toLowerCase();
  if (
    normalized === 'failed' ||
    normalized === 'rejected' ||
    approvalStatus === 'rejected' ||
    approvalStatus === 'expired' ||
    approvalStatus === 'cancelled' ||
    input.status === 901 ||
    input.status === 902
  ) {
    return { ...input, state: 'rejected' };
  }
  return { ...input, state: 'pending' };
}

function pickSignature(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value === null || value === undefined) return undefined;
  if (typeof value === 'string') return isHexSignature(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const signature = pickSignature(item, depth + 1);
      if (signature) return signature;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['signature', 'sig', 'result', 'data', 'execution_result']) {
    const signature = pickSignature(record[key], depth + 1);
    if (signature) return signature;
  }
  for (const item of Object.values(record)) {
    const signature = pickSignature(item, depth + 1);
    if (signature) return signature;
  }
  return undefined;
}

function isHexSignature(value: string): boolean {
  return /^0x[0-9a-fA-F]{130}$/.test(value);
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

async function waitForMessageSignature(
  txId: string,
  initial: CoboMessageSignStatus,
): Promise<string> {
  const timeoutMs = Number(process.env.CAW_MESSAGE_SIGN_TIMEOUT_MS ?? 120_000);
  const started = Date.now();
  let latest = initial;

  for (;;) {
    latest = await readCoboMessageSignStatus(txId);
    if (latest.signature) return latest.signature;

    if (latest.state === 'rejected') {
      const reason = latest.failedReason ? ` reason=${latest.failedReason}` : '';
      throw new Error(`Cobo messageSign 失败：status=${latest.status ?? '-'} status_display=${latest.statusDisplay ?? '-'}${reason} tx_id=${txId}`);
    }

    if (Date.now() - started > timeoutMs) {
      const approvalText = latest.approvalId ? ` approval_id=${latest.approvalId}` : '';
      throw new Error(
        `Cobo messageSign 等待超时：status=${latest.status ?? '-'} status_display=${latest.statusDisplay ?? '-'}${approvalText} tx_id=${txId}`,
      );
    }

    await sleep(3000);
  }
}
