# CGHub 贡献结算 Agent

面向 Hackathon、Grant、开源协作和社区活动的 AI 贡献结算系统。贡献者提交证据，Agent 按 rubric 评分，Cobo Agentic Wallet 对高风险动作审批与代执行，`ContributionPool` 按链上贡献分完成奖励结算。

**一句话简介**：CGHub 用 Agent 评估贡献，用 Cobo 审批与执行关键动作，并用链上资金池按可验证贡献分自动分配奖励。

## 项目简介

CGHub 是一个围绕“活动资金池”和“贡献证据”设计的结算系统，当前实现了三类角色：

- **管理者**：创建活动档案，开设链上 Round，关闭活动并进入结算。
- **资金方 / 用户**：查看活动资金池，通过注资、付费或赞助等方式让资金进入 Round，并跟踪贡献和结算状态。
- **贡献者**：提交贡献证据，等待 Agent / Cobo 审核，活动结束后领取奖励。

核心流程：

```text
创建活动 / Round
  -> 资金方 / 用户注资、付费或赞助
  -> 贡献者提交证据
  -> Agent 解析证据并评分
  -> 风险策略判断是否进入 Cobo 审批
  -> 签 EIP-712 ContributionProof
  -> CAW 写入链上贡献分
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

## 核心特性

- **活动资金池**：管理者创建活动 Round，资金方 / 用户通过注资、付费或赞助让资金进入池子。
- **AI Agent 贡献评分**：Agent 解析贡献证据，按 rubric 生成分数、理由和风险标记。
- **Cobo 审批与代执行**：高风险评分进入 Cobo App 审批，CAW 负责受限签名和链上执行。
- **链上按分结算**：`ContributionPool` 记录贡献分，活动结束后贡献者按分数占比领取奖励。

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
