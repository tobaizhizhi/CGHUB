import { z } from 'zod';
import { WalletAgent } from '../src/wallet-agent.js';

export const getAuditTool = {
  name: 'get-audit',
  description: '拉 CAW 审计日志，展示 allowed/denied（护栏可视化）',
  inputSchema: {
    limit: z.number().optional().describe('返回条数，默认 20'),
  },
  async handler(args: { limit?: number }) {
    const items = await new WalletAgent().getAuditTrail(args.limit ?? 20);
    const allowed = items.filter((item) => item.result === 'allowed').length;
    const denied = items.filter((item) => item.result === 'denied').length;
    return { count: items.length, allowed, denied, items };
  },
};
