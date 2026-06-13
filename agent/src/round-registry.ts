import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

import { loadPoolAbi } from './abi.js';
import { config } from './config.js';

export type RoundDisplayStatus =
  | 'draft'
  | 'creating'
  | 'create_failed'
  | 'open'
  | 'funded'
  | 'scoring'
  | 'finalized'
  | 'closed'
  | 'archived';

export interface RoundRegistryRecord {
  id: string;
  projectId: string;
  roundId: string;
  activityName: string;
  activityDescription?: string;
  roundName: string;
  contributionGuide?: string;
  tokenAddress: string;
  tokenSymbol: string;
  ownerAddress: string;
  chainId: number;
  poolAddress: string;
  createTxHash?: string;
  finalizeTxHash?: string;
  status?: RoundDisplayStatus;
  contributorCount?: number;
  createdBy?: string;
  finalizedBy?: string;
  startsAt?: string;
  endsAt?: string;
  endedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ManagedRound extends RoundRegistryRecord {
  status: RoundDisplayStatus;
  funded: string;
  totalScore: string;
  contributorCount: number;
  exists: boolean;
  finalized: boolean;
}

export interface RoundRegistryReader {
  listRounds(): Promise<ManagedRound[]>;
  getRound(id: string): Promise<ManagedRound | undefined>;
}

export interface NextRoundScope {
  projectId: string;
  roundId: string;
  strategy: 'nextProjectIdRoundOne';
}

export interface RoundIdAvailability {
  available: boolean;
  registryExists: boolean;
  chainExists: boolean;
  reason?: string;
}

export interface CreateDraftActivityInput {
  activityTitle?: string;
  activityName?: string;
  activityDescription?: string;
  description?: string;
  roundName?: string;
  projectOwnerAddress?: string;
  ownerAddress?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  startsAt?: string;
  endsAt?: string;
  contributionGuide?: string;
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  createdBy?: string;
}

export interface MarkRoundCreatedInput {
  createTxHash: string;
  createdBy?: string;
}

export interface MarkRoundFinalizedInput {
  finalizeTxHash: string;
  finalizedBy?: string;
}

export interface RoundRegistryWriter extends RoundRegistryReader {
  suggestNextRoundScope(): Promise<NextRoundScope>;
  checkRoundIdAvailability(input: {
    projectId: string | number | bigint;
    roundId: string | number | bigint;
    checkChain?: boolean;
  }): Promise<RoundIdAvailability>;
  createDraftActivity(input: CreateDraftActivityInput): Promise<RoundRegistryRecord>;
  markRoundCreated(id: string, input: MarkRoundCreatedInput): Promise<RoundRegistryRecord>;
  markRoundFinalized(id: string, input: MarkRoundFinalizedInput): Promise<RoundRegistryRecord>;
}

export class RoundRegistryError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'RoundRegistryError';
  }
}

interface RoundState {
  token?: string;
  funded: string;
  totalScore: string;
  exists: boolean;
  finalized: boolean;
}

const DEFAULT_REGISTRY_PATH = fileURLToPath(new URL('../data/rounds.json', import.meta.url));

export class JsonRoundRegistry implements RoundRegistryWriter {
  constructor(private readonly path = process.env.ROUND_REGISTRY_PATH || DEFAULT_REGISTRY_PATH) {}

  async listRounds(): Promise<ManagedRound[]> {
    const records = await this.readRecords();
    return Promise.all(records.map((record) => this.enrich(record)));
  }

  async getRound(id: string): Promise<ManagedRound | undefined> {
    const rounds = await this.listRounds();
    return rounds.find((round) => round.id === id);
  }

  async saveRecords(records: RoundRegistryRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify({ rounds: records }, null, 2)}\n`, 'utf8');
  }

  async suggestNextRoundScope(): Promise<NextRoundScope> {
    const records = await this.readRecords();
    const maxProjectId = records.reduce((max, record) => {
      const value = toPositiveBigInt(record.projectId);
      return value > max ? value : max;
    }, 0n);

    return {
      projectId: (maxProjectId + 1n).toString(),
      roundId: '1',
      strategy: 'nextProjectIdRoundOne',
    };
  }

  async checkRoundIdAvailability(input: {
    projectId: string | number | bigint;
    roundId: string | number | bigint;
    checkChain?: boolean;
  }): Promise<RoundIdAvailability> {
    const projectId = normalizePositiveId(input.projectId, 'projectId');
    const roundId = normalizePositiveId(input.roundId, 'roundId');
    const records = await this.readRecords();
    const registryExists = records.some(
      (record) => record.projectId === projectId && record.roundId === roundId
    );
    let chainExists = false;

    if (input.checkChain) {
      const probeRecord = normalizeRecord({
        projectId,
        roundId,
        activityName: 'availability-probe',
        roundName: 'availability-probe',
        tokenAddress: config.chain.usdcAddress,
        tokenSymbol: 'USDC',
        ownerAddress: ethers.ZeroAddress,
        chainId: config.chain.chainId,
        poolAddress: config.chain.poolAddress,
      });
      const state = await readRoundState(probeRecord);
      chainExists = state.exists;
    }

    const available = !registryExists && !chainExists;
    return {
      available,
      registryExists,
      chainExists,
      reason: available
        ? undefined
        : registryExists
          ? 'projectId / roundId 已存在于活动 Registry'
          : 'projectId / roundId 链上资金池已存在',
    };
  }

  async createDraftActivity(input: CreateDraftActivityInput): Promise<RoundRegistryRecord> {
    const now = new Date().toISOString();
    const suggested = await this.suggestNextRoundScope();
    const projectId = normalizePositiveId(input.projectId ?? suggested.projectId, 'projectId');
    const roundId = normalizePositiveId(input.roundId ?? suggested.roundId, 'roundId');
    const activityName = requiredText(input.activityTitle ?? input.activityName, '活动标题');
    const activityDescription = requiredText(
      input.activityDescription ?? input.description,
      '活动描述'
    );
    const roundName = requiredText(input.roundName, '轮次名称');
    const ownerAddress = normalizeAddress(
      input.projectOwnerAddress ?? input.ownerAddress,
      '项目方地址'
    );
    const tokenAddress = normalizeAddress(input.tokenAddress ?? config.chain.usdcAddress, '资金代币地址');
    const tokenSymbol = (input.tokenSymbol ?? 'USDC').trim() || 'USDC';

    const availability = await this.checkRoundIdAvailability({ projectId, roundId });
    if (!availability.available) {
      throw new RoundRegistryError(availability.reason ?? 'projectId / roundId 已存在', 409);
    }

    const records = await this.readRecords();
    const record: RoundRegistryRecord = {
      id: `project-${projectId}-round-${roundId}`,
      projectId,
      roundId,
      activityName,
      activityDescription,
      roundName,
      contributionGuide: optionalText(input.contributionGuide),
      tokenAddress,
      tokenSymbol,
      ownerAddress,
      chainId: config.chain.chainId,
      poolAddress: config.chain.poolAddress,
      status: 'draft',
      contributorCount: 0,
      createdBy: optionalText(input.createdBy),
      startsAt: optionalText(input.startsAt),
      endsAt: optionalText(input.endsAt),
      createdAt: now,
      updatedAt: now,
    };

    await this.saveRecords([...records, record]);
    return record;
  }

  async markRoundCreated(id: string, input: MarkRoundCreatedInput): Promise<RoundRegistryRecord> {
    const createTxHash = requiredText(input.createTxHash, '创建交易 hash');
    return this.updateRecord(id, (record, now) => ({
      ...record,
      createTxHash,
      createdBy: optionalText(input.createdBy) ?? record.createdBy,
      status: 'open',
      lastError: undefined,
      updatedAt: now,
    }));
  }

  async markRoundFinalized(id: string, input: MarkRoundFinalizedInput): Promise<RoundRegistryRecord> {
    const finalizeTxHash = requiredText(input.finalizeTxHash, '关闭交易 hash');
    const endedAt = new Date().toISOString();
    return this.updateRecord(id, (record, now) => ({
      ...record,
      finalizeTxHash,
      finalizedBy: optionalText(input.finalizedBy) ?? record.finalizedBy,
      status: 'finalized',
      endedAt,
      updatedAt: now,
    }));
  }

  private async updateRecord(
    id: string,
    update: (record: RoundRegistryRecord, now: string) => RoundRegistryRecord
  ): Promise<RoundRegistryRecord> {
    const records = await this.readRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) {
      throw new RoundRegistryError(`无此活动: ${id}`, 404);
    }

    const now = new Date().toISOString();
    const next = update(records[index], now);
    const nextRecords = records.slice();
    nextRecords[index] = next;
    await this.saveRecords(nextRecords);
    return next;
  }

  private async readRecords(): Promise<RoundRegistryRecord[]> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : parsed.rounds;
      return Array.isArray(records) && records.length > 0
        ? records.map(normalizeRecord)
        : [defaultRecord()];
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [defaultRecord()];
      throw error;
    }
  }

  private async enrich(record: RoundRegistryRecord): Promise<ManagedRound> {
    const state = await readRoundState(record);
    const status = deriveRoundStatus(record, state);
    return {
      ...record,
      tokenAddress: state.token && state.token !== ethers.ZeroAddress ? state.token : record.tokenAddress,
      status,
      funded: state.funded,
      totalScore: state.totalScore,
      contributorCount: record.contributorCount ?? 0,
      exists: state.exists,
      finalized: state.finalized,
    };
  }
}

export function deriveRoundStatus(record: Pick<RoundRegistryRecord, 'status' | 'archivedAt'>, state: RoundState): RoundDisplayStatus {
  if (record.status === 'archived' || record.archivedAt) return 'archived';
  if (record.status === 'closed') return 'closed';
  if (record.status === 'create_failed') return 'create_failed';
  if (record.status === 'creating') return 'creating';
  if (!state.exists) return 'draft';
  if (state.finalized) return 'finalized';
  if (BigInt(state.totalScore) > 0n) return 'scoring';
  if (BigInt(state.funded) > 0n) return 'funded';
  return 'open';
}

async function readRoundState(record: RoundRegistryRecord): Promise<RoundState> {
  try {
    const provider = new ethers.JsonRpcProvider(config.chain.rpcUrl);
    const pool = new ethers.Contract(record.poolAddress, loadPoolAbi(), provider);
    const result = await pool.rounds(BigInt(record.projectId), BigInt(record.roundId));
    return {
      token: result.token,
      funded: result.funded?.toString() ?? '0',
      totalScore: result.totalScore?.toString() ?? '0',
      exists: Boolean(result.exists),
      finalized: Boolean(result.finalized),
    };
  } catch {
    return {
      funded: '0',
      totalScore: '0',
      exists: Boolean(record.createTxHash),
      finalized: false,
    };
  }
}

function normalizeRecord(input: any): RoundRegistryRecord {
  const now = new Date().toISOString();
  const projectId = String(input.projectId ?? input.project_id ?? config.round.projectId);
  const roundId = String(input.roundId ?? input.round_id ?? config.round.roundId);
  return {
    id: String(input.id ?? `project-${projectId}-round-${roundId}`),
    projectId,
    roundId,
    activityName: String(input.activityName ?? input.activity_name ?? 'CGHub Hackathon'),
    activityDescription: input.activityDescription ?? input.activity_description ?? input.description,
    roundName: String(input.roundName ?? input.round_name ?? `第 ${roundId} 轮`),
    contributionGuide: input.contributionGuide ?? input.contribution_guide,
    tokenAddress: String(input.tokenAddress ?? input.token_address ?? config.chain.usdcAddress),
    tokenSymbol: String(input.tokenSymbol ?? input.token_symbol ?? 'USDC'),
    ownerAddress: String(input.ownerAddress ?? input.owner_address ?? process.env.OWNER_ADDRESS ?? ethers.ZeroAddress),
    chainId: Number(input.chainId ?? input.chain_id ?? config.chain.chainId),
    poolAddress: String(input.poolAddress ?? input.pool_address ?? config.chain.poolAddress),
    createTxHash: input.createTxHash ?? input.create_tx_hash,
    finalizeTxHash: input.finalizeTxHash ?? input.finalize_tx_hash,
    status: input.status,
    contributorCount: Number(input.contributorCount ?? input.contributor_count ?? 0),
    createdBy: input.createdBy ?? input.created_by,
    finalizedBy: input.finalizedBy ?? input.finalized_by,
    startsAt: input.startsAt ?? input.starts_at,
    endsAt: input.endsAt ?? input.ends_at,
    endedAt: input.endedAt ?? input.ended_at,
    lastError: input.lastError ?? input.last_error,
    createdAt: String(input.createdAt ?? input.created_at ?? now),
    updatedAt: String(input.updatedAt ?? input.updated_at ?? now),
    archivedAt: input.archivedAt ?? input.archived_at,
  };
}

function defaultRecord(): RoundRegistryRecord {
  const now = new Date().toISOString();
  return {
    id: `project-${config.round.projectId}-round-${config.round.roundId}`,
    projectId: config.round.projectId.toString(),
    roundId: config.round.roundId.toString(),
    activityName: process.env.DEFAULT_ACTIVITY_NAME || 'CGHub Hackathon',
    activityDescription: process.env.DEFAULT_ACTIVITY_DESCRIPTION || '默认活动，用于本地演示贡献提交、注资和分账流程。',
    roundName: process.env.DEFAULT_ROUND_NAME || `第 ${config.round.roundId} 轮贡献结算`,
    tokenAddress: config.chain.usdcAddress,
    tokenSymbol: 'USDC',
    ownerAddress: process.env.OWNER_ADDRESS ?? ethers.ZeroAddress,
    chainId: config.chain.chainId,
    poolAddress: config.chain.poolAddress,
    createdAt: now,
    updatedAt: now,
  };
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) {
    throw new RoundRegistryError(`${label}不能为空`, 400);
  }
  return text;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function normalizePositiveId(value: string | number | bigint, label: string): string {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || BigInt(text) <= 0n) {
    throw new RoundRegistryError(`${label} 必须是正整数`, 400);
  }
  return BigInt(text).toString();
}

function toPositiveBigInt(value: string): bigint {
  try {
    const normalized = normalizePositiveId(value, 'projectId');
    return BigInt(normalized);
  } catch {
    return 0n;
  }
}

function normalizeAddress(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!ethers.isAddress(text)) {
    throw new RoundRegistryError(`${label}不是合法 EVM 地址`, 400);
  }
  return ethers.getAddress(text);
}
