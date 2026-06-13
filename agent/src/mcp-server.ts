/**
 * 模块 4：MCP 工具服务
 * 把 4 个核心工具注册成 MCP server（stdio），让支持 MCP 的客户端（Claude/Cursor）直接调。
 * 这是"Agent 自己调"能现场演的关键。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { signContributionTool } from '../tools/sign-contribution.js';
import { submitContributionTool } from '../tools/submit-contribution.js';
import { checkPendingTool } from '../tools/check-pending.js';
import { triggerClaimTool } from '../tools/trigger-claim.js';
import { getAuditTool } from '../tools/get-audit.js';

const server = new McpServer({ name: 'cghub-agent', version: '0.1.0' });

/** 把工具 handler 的返回值包成 MCP 的 CallToolResult */
const asResult = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

// TODO 可选工具（看时间）：pay-x402 / finalize-round / get-audit
server.registerTool(
  signContributionTool.name,
  { description: signContributionTool.description, inputSchema: signContributionTool.inputSchema },
  async (args) => asResult(await signContributionTool.handler(args)),
);
server.registerTool(
  submitContributionTool.name,
  { description: submitContributionTool.description, inputSchema: submitContributionTool.inputSchema },
  async (args) => asResult(await submitContributionTool.handler(args)),
);
server.registerTool(
  checkPendingTool.name,
  { description: checkPendingTool.description, inputSchema: checkPendingTool.inputSchema },
  async (args) => asResult(await checkPendingTool.handler(args)),
);
server.registerTool(
  triggerClaimTool.name,
  { description: triggerClaimTool.description, inputSchema: triggerClaimTool.inputSchema },
  async (args) => asResult(await triggerClaimTool.handler(args)),
);
server.registerTool(
  getAuditTool.name,
  { description: getAuditTool.description, inputSchema: getAuditTool.inputSchema },
  async (args) => asResult(await getAuditTool.handler(args)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('CGHub Agent MCP server 已启动（stdio）');
