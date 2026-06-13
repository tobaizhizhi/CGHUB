# CGHub 贡献结算 Agent

面向 Hackathon、Grant、开源协作和社区活动的 AI 贡献结算系统。贡献者提交证据，Agent 按 rubric 评分，Cobo Agentic Wallet 对高风险动作审批与代执行，`ContributionPool` 按链上贡献分完成奖励结算。

**一句话简介**：CGHub 用 Agent 评估贡献，用 Cobo 审批与执行关键动作，并用链上资金池按可验证贡献分自动分配奖励。
## Demo Video

5分钟精简版demo视频演示链接：https://youtu.be/T-RQU9cLON8

全过程demo视频演示链接：https://youtu.be/md2vfMMJlvo

## 项目简介

CGHub 是一个围绕“活动资金池”和“贡献证据”设计的结算系统，当前实现了三类角色：

- **管理者**：创建活动档案，开设链上 Round，关闭活动并进入结算。
- **用户 / 资金方 / 赞助方**：用户通过付费使用产生资金流入，资金方或赞助方也可以通过预算、注资或赞助让资金进入 Round，并跟踪贡献和结算状态。
- **贡献者**：提交贡献证据，等待 Agent / Cobo 审核，活动结束后领取奖励。

核心流程：

```text
创建活动 / Round
  -> 预算注入或用户付费让资金进入 Round
  -> 贡献者提交证据
  -> Agent 解析证据并评分
  -> Agent review gate 判断评分风险
  -> Agent 生成 EIP-712 typed data 签名请求
  -> CAW 在 Sign Pact 约束下 messageSign，必要时进入 Cobo App 审批
  -> CAW Main Pact 使用签名后的 proof 写入链上贡献分
  -> 管理者 finalize
  -> 贡献者 claim 或 Agent 代触发 claimFor
```

## 解决的问题

很多活动型协作场景会遇到类似问题：

- 奖金池或赞助资金已经存在，但贡献价值依赖人工表格和主观判断。
- 代码、内容、运营、活动组织等贡献证据分散在 GitHub、网页和文本记录里。
- 高分贡献、重复证据、高频提交等风险难以自动拦截。
- 结算动作需要透明审计，但又不希望把私钥和钱包权限暴露给前端。

CGHub 的做法是把“证据、评分、审核、签名、上链、领取”拆成可追踪步骤，并用 Cobo Agentic Wallet 为 Agent 的签名和执行权限加上策略边界。

## 应用场景

CGHub 适合需要“资金进入活动池，再按真实贡献结算”的活动型协作场景。资金可以是预设预算，也可以在活动进行中由用户使用、付费或赞助持续进入。

- **黑客松奖金分配**：把奖金池和贡献评分流程透明化，避免只靠人工表格和主观印象分配奖励。
- **用户付费活动**：活动一边举办，一边让用户通过报名、使用、购买服务或参与任务产生资金流入，最后按贡献分结算给贡献者。
- **付费众测奖励池**：项目方或活动方可以先放入一部分预算，也可以在活动过程中继续追加，再按 Bug 复现、交互反馈、测试记录和修复贡献结算。
- **开源社区贡献激励**：项目方为文档补充、PR 修复、Issue 复现、运营传播等社区贡献设置资金池，让贡献者按可验证产出获得奖励。

## 核心特性

- **活动资金池**：管理者创建活动 Round，项目方预算、赞助资金或用户付费收入都可以进入池子。
- **AI Agent 贡献评分**：Agent 解析贡献证据，按 rubric 生成分数、理由和风险标记。
- **Cobo 审批与代执行**：高风险评分在 CAW `messageSign` 请求阶段进入 Cobo App 审批，Sign Pact 约束签名范围，Main Pact 负责审批后的受限写链和代领取。
- **链上按分结算**：`ContributionPool` 记录贡献分，活动结束后贡献者按分数占比领取奖励。

## Cobo 审批与 Pact 设计

CGHub 里，AI Agent 的评分不是直接等于发钱。评分先经过 Agent review gate，只有低风险贡献会继续生成 EIP-712 typed data，并请求 CAW 在 Sign Pact 约束下完成 `messageSign`；如果触发风险规则，Cobo App 审批发生在这个签名请求阶段。当前主要判断包括：单条评分超过阈值、评分置信度低、LLM 评分不可用或需要人工复核、LLM 与规则评分差异过大，以及证据不可用 / 未验证但评分较高。缺少证据会要求补充，明显低质量且证据不可验证的提交会直接拒绝。

审批和执行拆成两个 Pact：

- **Sign Pact**：只约束 CAW 的 `messageSign` 权限，用于签署 Agent 生成的 EIP-712 typed data。高分 `ContributionProof`，或 Agent 标记的风险复核请求，会在这里进入 Cobo App 审批；它不能直接调用资金池。
- **Main Pact**：只负责受限 `contractCall`，拿签名后的 `ContributionProof` 调 `recordContributionBySig` 写入贡献分，也可以在结算后代触发 `claimFor`；它不能自己生成或签署评分依据。

这样签名权和执行权分离，Agent 只能在 Cobo Policy 允许的范围内把“已解释、已审批的评分”推进到链上。结算阶段的 `claimFor` 也走 CAW Main Pact：贡献者不需要自己处理复杂交易或准备 gas，前端不接触 CAW 凭证，Agent 的代领权限又被限制在 `ContributionPool` 的受限调用里，同时 Cobo 会留下执行记录，方便复盘整条结算链。

## 项目架构

```text
┌──────────────────────────────────────────────────────────┐
│ Next.js 前端                                              │
│ / /manager /project /contributor /pools /replay           │
│ ethers / viem 读链 + Agent HTTP API                       │
└──────────────────────────────┬───────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼───────────────────────────┐
│ Node.js / TypeScript Agent                                │
│ 证据解析 · AI Agent rubric 评分 · Review Store             │
│ EIP-712 签名 · Cobo SDK · Agent Registry                   │
└───────────────┬──────────────────────────────┬───────────┘
                │                              │
                │ Ethereum JSON-RPC            │ Cobo API
┌───────────────▼────────────────┐   ┌─────────▼────────────┐
│ ContributionPool.sol            │   │ Cobo Agentic Wallet  │
│ Round · Score · Claim           │   │ Main / Sign / Fund   │
│ EIP-712 proof verification      │   │ Guard Pacts          │
└─────────────────────────────────┘   └──────────────────────┘
```

## 快速开始

### 本地依赖

| 环境 | 推荐版本 / 说明 |
|------|-----------------|
| Node.js | 20+ |
| npm | 随 Node.js 安装 |
| Foundry | `forge`、`cast` |

### 运行前配置

本仓库已经在 `.env.example` 里放了 Sepolia demo 的默认网络、合约和 Round 配置。先复制配置文件：

```bash
cd agent
cp .env.example .env

cd ../frontend-前端
cp .env.example .env.local
```

需要填写或确认的配置：

| 文件 | 配置 | 说明 |
|------|------|------|
| `agent/.env` | `AGENT_WALLET_API_KEY`、`AGENT_WALLET_WALLET_UUID` | Cobo Agentic Wallet API 凭证。 |
| `agent/.env` | `CAW_SRC_ADDRESS` | Cobo Agentic Wallet 的 EVM 地址，需要与链上 `agentSigner` 对应。 |
| `agent/.env` | `AI_SCORER_MODEL`、`AI_SCORER_API_KEY` | AI Agent rubric 评分服务配置。 |
| `agent/.env` | `POOL_ADDRESS`、`SEPOLIA_RPC_URL` | 已有默认值；只有重新部署合约或更换 RPC 时需要改。 |
| `frontend-前端/.env.local` | `NEXT_PUBLIC_AGENT_API_URL`、`NEXT_PUBLIC_POOL_ADDRESS`、`NEXT_PUBLIC_RPC_URL` | 已有本地 / Sepolia 默认值；只有更换 Agent 地址、合约或 RPC 时需要改。 |

Cobo Pact 首次使用前执行一次提交：

```bash
cd agent
npm run prepare:pacts
```

然后到 Cobo App 审批，并把脚本输出的 `CAW_PACT_ID`、`CAW_SIGN_PACT_ID` 写回 `agent/.env`。如果要用 CAW treasury 注资，再配置 `CAW_FUND_PACT_ID`。

`AGENT_PRIVATE_KEY` 只在 `SIGNER_MODE=local` 时使用；默认 Cobo 签名路径不需要前端接触私钥。GitHub Token 只是增强 GitHub 证据读取稳定性，不作为核心前置条件。

### 安装合约依赖并测试

```bash
cd contract
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge build
forge test
```

### 启动 Agent API

```bash
cd agent
npm install
npm run api
```

Agent 默认监听 `http://localhost:8787`。

### 启动前端

```bash
cd frontend-前端
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 技术栈

### 后端 / Agent

| 技术 | 说明 |
|------|------|
| Node.js + TypeScript | Agent HTTP API 和工具脚本。 |
| `@cobo/agentic-wallet` | Cobo Pact、message sign、contract call、audit、balance。 |
| `ethers` v6 | EIP-712、ABI 编码、合约读取和交易数据构造。 |
| `zod` | 输入参数和 LLM JSON 输出校验。 |

### 前端

| 技术 | 说明 |
|------|------|
| Next.js 14 | 页面路由和前端应用框架。 |
| React 18 | UI 组件。 |
| ethers / viem | 合约读取、事件解析、钱包交互。 |
| React Query | 异步数据请求和缓存。 |
| Zustand | 前端状态管理。 |
| lucide-react | 图标。 |

### 合约

| 技术 | 说明 |
|------|------|
| Solidity 0.8.24 | `ContributionPool` 合约。 |
| Foundry | 合约构建和测试。 |
| OpenZeppelin Contracts | `Ownable`、`SafeERC20`、`EIP712`、`ECDSA`、`ReentrancyGuard`。 |

### 外部 API / AI 工具

| 工具 | 用途 |
|------|------|
| Cobo Agentic Wallet API | Pact、审批、签名和代执行。 |
| OpenAI 兼容 Chat Completions | AI Agent rubric 评分。 |
| GitHub API | 拉取 PR、Issue、Commit、Repo 等证据。 |
| Ethereum JSON-RPC | Sepolia 合约状态和事件读取。 |

## License

MIT
