/**
 * 入口：把各块串起来跑端到端，用于自测和 Demo 录屏（不依赖 MCP 客户端）。
 *
 * 全流程（前提：owner 已 createRound + fundRound；CAW 已 onboard 且 Main/Sign Pact 配好）：
 *   1. review : Agent 评分并过审批策略
 *   2. record : Cobo Sign Pact 签 proof，CAW Main Pact 发 recordContributionBySig 上链
 *   3.（owner finalizeRound —— 不在本脚本，白织/手动）
 *   4. claim  : pending>0 → CAW Main Pact 调 claimFor 分账
 */

import { newPaymentId } from './utils.js';
import { WalletAgent } from './wallet-agent.js';
import { signContributionTool } from '../tools/sign-contribution.js';

async function main() {
  const demoContributor = '0x00000000000000000000000000000000deadbeef'; // TODO 换成真实贡献者

  // 1. 评分、审批、签名并上链
  const rec = await signContributionTool.handler({
    projectId: '1',
    roundId: '1',
    contributor: demoContributor,
    title: 'demo contribution',
    description: 'demo contribution for CGHub agent flow',
    source: 'github',
    evidenceId: 'pr-123',
    paymentId: newPaymentId(),
  });
  console.log('[1] 评分审批与上链：', rec);

  // 3. finalize 由 owner 做，跳过
  console.log('[3] 等 owner finalizeRound（不在本脚本）');

  // 4. 分账
  const agent = new WalletAgent();
  const pending = await agent.checkPending(demoContributor);
  console.log('[4] pending =', pending.toString());
  if (pending > 0n) {
    const res = await agent.claimForContributor(demoContributor);
    console.log('[4] claimFor：', res);
  }
}

main().catch((e) => {
  console.error('端到端失败：', e);
  process.exit(1);
});
