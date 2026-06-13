/**
 * MCP 工具：trigger-claim
 * 驱动 Cobo 通过 contractCall 调 claimFor，把分账打给贡献者。
 * 钱从 ContributionPool → contributor，Cobo 调用方不碰钱。
 */

import { z } from 'zod';
import { WalletAgent, type ClaimForContributorOptions, type RoundScope } from '../src/wallet-agent.js';

interface TriggerClaimWallet {
  checkPending(contributor: string, scope?: RoundScope): Promise<bigint>;
  claimForContributor(
    contributor: string,
    scope?: ClaimForContributorOptions,
  ): Promise<{ txId: string; status: string; hash?: string }>;
}

const runtimeInputSchema = z.object({
  contributor: z.string(),
  projectId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  roundId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  requestId: z.string().optional(),
}).passthrough();

export const triggerClaimTool = {
  name: 'trigger-claim',
  description: 'pending>0 时驱动 Cobo 代领分账（contractCall → claimFor）',
  inputSchema: {
    contributor: z.string().describe('贡献者地址'),
    projectId: z.union([z.string(), z.number(), z.bigint()]).optional().describe('目标项目 id'),
    roundId: z.union([z.string(), z.number(), z.bigint()]).optional().describe('目标轮次 id'),
    requestId: z.string().optional().describe('可选：手动重试时使用的新 Cobo request_id'),
  },
  async handler(args: { contributor: string; projectId?: string | number | bigint; roundId?: string | number | bigint; requestId?: string }, deps: { walletAgent?: TriggerClaimWallet } = {}) {
    const parsed = runtimeInputSchema.parse(args);
    const agent = deps.walletAgent ?? new WalletAgent();
    const checkScope: RoundScope = {
      projectId: parsed.projectId,
      roundId: parsed.roundId,
    };
    const claimScope: ClaimForContributorOptions = {
      ...checkScope,
      requestId: parsed.requestId,
    };

    const pending = await agent.checkPending(parsed.contributor, checkScope);
    if (pending <= 0n) {
      return { skipped: true, reason: 'pending 为 0，无可领金额' };
    }

    const res = await agent.claimForContributor(parsed.contributor, claimScope);
    return { txId: res.txId, status: res.status, txHash: res.hash, pending: pending.toString() };
  },
};
