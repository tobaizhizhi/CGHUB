# Agent 火堆 · agent/

掌火人：大番薯。方案见 `docs/Agent方案设计.md`。

## 干嘛的

Agent 先给贡献评分并执行 review 策略；通过后由 Cobo Sign Pact 签 EIP-712 proof，再让 CAW Main Pact 把 `recordContributionBySig` 发上链。CAW 钱包发链上交易时需要本机 `cobo-tss-node` signer 在线，否则交易会停在 `Processing/signing`。

闭环：`Agent 评分 → review gate → Cobo Sign Pact 签 proof → CAW Main Pact 上链记录 → ContributionPool 验签记账 / claimFor 分账`。

## 本地联调怎么跑

先启动 CAW 本地 signer（只在持有这把 CAW 钱包 profile 的机器上需要）：

```bash
caw node start
```

然后启动 Agent API：

```bash
cd agent
npm install
npm run api    # 起 HTTP API 给前端（默认 :8787），见 docs/API.md
```

生产部署到 Railway / Render / Fly.io 时，建议设置：

```bash
HOST=0.0.0.0
ALLOWED_ORIGIN=https://your-vercel-app.vercel.app
```

`ALLOWED_ORIGIN` 支持逗号分隔多个前端域名；不要在生产继续使用 `*`。

需要单独跑端到端自测时再用：

```bash
npm run dev    # 签贡献 → CAW 上链 recordContributionBySig，会真实提交一笔测试交易
npm run mcp    # 起 MCP server（stdio）
```

`.env` 是本地机密配置，按 `.env.example` 填，避免提交到仓库。队友要跑真实 CAW 上链，需要拿到对应 CAW 凭证、active pact，并完成/复用这把钱包的本地 TSS profile；否则可以只跑前端读取和签名接口级联调。

需要真实 denied 镜头时，确认 `CAW_GUARD_PACT_ID` / `CAW_GUARD_TOKEN_ID` 指向 transfer 护栏 pact 后，再设置：

```bash
GUARD_PROBE_ENABLED=true
# 可选；不填则用 CLAIM_MAX_AMOUNT + 1
GUARD_PROBE_AMOUNT=
```

Agent API 启动后会自动尝试一次超额 transfer。只有 Cobo Policy 真正拒绝时才写入 `guard denied` 决策流；如果没有被拒，会写 `guard error` 提醒护栏配置不符合预期。

## 目录

```
agent/
├── src/
│   ├── config.ts                # env + EIP-712 domain/types
│   ├── types.ts                 # ContributionProof 等类型
│   ├── abi.ts                   # 运行时加载 abi/
│   ├── contribution-recorder.ts # 模块1：组织 proof + EIP-712 签名
│   ├── executor.ts              # Cobo SDK 发交易（CAW 钱包当 executor）
│   ├── wallet-agent.ts          # 模块3：checkPending + claimFor
│   ├── mcp-server.ts            # 模块4：MCP 工具服务
│   └── index.ts                 # 入口：端到端串联
├── tools/                       # MCP 工具：sign/submit-contribution、check-pending、trigger-claim
├── abi/ContributionPool.abi.json
├── docs/{Agent方案设计.md, API.md}
├── .env.example                 # .env 本地创建，勿提交
├── package.json / tsconfig.json
```

## 现状

- ✅ 记录链路实测上链：`npm run dev` 跑通 sign → CAW recordContributionBySig（Sepolia）
- ✅ 前端联调：`npm run api` + 前端按钮可走 sign → submit → refresh
- ✅ CAW signer 要求已确认：本机 `cobo-tss-node` 在线时可签名并广播；不在线会卡在 `Processing/signing`
- ✅ ABI / EIP-712 / 哈希规则 / proofSalt 全部对齐链上合约（链上实测一致）
- ✅ proof/signature HTTP API 可用（前端对接见 docs/API.md）
- ⏳ claimFor 分账：代码已接同机制，待 owner `finalizeRound` 后可实测

## 关键配置（本地 .env）

- `AGENT_PRIVATE_KEY`：agentSigner（链上 `agentSigner()` 对应私钥）
- `AGENT_WALLET_API_KEY` / `_WALLET_UUID`：CAW 钱包凭证
- `CAW_PACT_ID` / `CAW_SRC_ADDRESS`：主线执行 Pact 与 CAW 钱包地址，负责 `recordContributionBySig` / `claimFor`
- `CAW_SIGN_PACT_ID`：签名 Pact，负责 `SIGNER_MODE=cobo` 时的 EIP-712 `messageSign`
- `CAW_FUND_PACT_ID`：可选注资 Pact，负责 CAW treasury 的 `USDC.approve` + `fundRound`
- `CAW_LEGACY_COMBINED_PACT`：仅兼容旧的“大 Main Pact”，新配置保持 `false`
- `POOL_ADDRESS` / `USDC_ADDRESS` / `PROJECT_ID` / `ROUND_ID`：合约参数
- `ALLOWED_ORIGIN`：允许访问 Agent API 的前端域名，生产填 Vercel URL
- `GUARD_PROBE_ENABLED` / `GUARD_PROBE_AMOUNT`：启动时自动触发真实超额 transfer probe，用于产生 Cobo denied 审计
