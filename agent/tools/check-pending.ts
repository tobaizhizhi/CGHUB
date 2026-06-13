/**
 * MCP 工具：check-pending
 * 查贡献者在某轮的可领金额 / 分数 / 已领。只读，不发交易。
 */

import { ethers } from 'ethers';
import { z } from 'zod';
import { loadPoolAbi } from '../src/abi.js';
import { config } from '../src/config.js';
import type { RoundScope } from '../src/wallet-agent.js';

interface PendingPool {
  pending(projectId: bigint, roundId: bigint, contributor: string): Promise<bigint> | bigint;
  scores(projectId: bigint, roundId: bigint, contributor: string): Promise<bigint> | bigint;
  claimed(projectId: bigint, roundId: bigint, contributor: string): Promise<bigint> | bigint;
}

const runtimeInputSchema = z.object({
  contributor: z.string(),
  projectId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  roundId: z.union([z.string(), z.number(), z.bigint()]).optional(),
}).passthrough();

function resolveRoundScope(scope: RoundScope = {}) {
  return {
    projectId: scope.projectId === undefined ? config.round.projectId : BigInt(scope.projectId),
    roundId: scope.roundId === undefined ? config.round.roundId : BigInt(scope.roundId),
  };
}

export const checkPendingTool = {
  name: 'check-pending',
  description: '查贡献者可领金额(pending)、分数(scores)、已领(claimed)',
  inputSchema: {
    contributor: z.string().describe('贡献者地址'),
    projectId: z.union([z.string(), z.number(), z.bigint()]).optional().describe('目标项目 id'),
    roundId: z.union([z.string(), z.number(), z.bigint()]).optional().describe('目标轮次 id'),
  },
  async handler(
    args: { contributor: string; projectId?: string | number | bigint; roundId?: string | number | bigint },
    deps: { pool?: PendingPool } = {},
  ) {
    const parsed = runtimeInputSchema.parse(args);
    const pool = deps.pool ?? new ethers.Contract(
      config.chain.poolAddress,
      loadPoolAbi(),
      new ethers.JsonRpcProvider(config.chain.rpcUrl),
    );
    const { projectId, roundId } = resolveRoundScope(parsed);

    const [pending, score, claimed] = await Promise.all([
      pool.pending(projectId, roundId, parsed.contributor),
      pool.scores(projectId, roundId, parsed.contributor),
      pool.claimed(projectId, roundId, parsed.contributor),
    ]);

    return {
      pending: pending.toString(),
      score: score.toString(),
      claimed: claimed.toString(),
    };
  },
};
