# CGHub 贡献结算 Agent Proposal

## 一句话简介

CGHub 是一个面向 Hackathon、Grant、开源协作和社区活动的 AI 贡献结算系统：贡献者提交证据，AI Agent 按 rubric 评分，Cobo Agentic Wallet 审批与执行关键动作，链上资金池按贡献分自动结算奖励。

## 1. 问题

Hackathon、Grant、开源社区和活动型协作通常会遇到一个共同问题：资金已经进入活动或奖励池，但贡献价值很难被公平、透明、可追踪地结算。

当前常见做法依赖人工表格、聊天记录和主观评审，主要问题包括：

- **贡献证据分散**：代码 PR、Issue、Commit、文档、活动组织、运营传播等证据分布在不同平台，难以形成统一记录。
- **评分标准不透明**：贡献价值往往由少数人手动判断，贡献者很难理解自己的分数来源。
- **资金分配难审计**：奖励分配结果可能只停留在表格或后台记录中，缺少可验证的链上依据。
- **Agent 权限风险高**：如果让 Agent 直接签名或执行链上动作，必须限制它能做什么、何时需要人工审批。

CGHub 要解决的是：让“贡献证据 -> AI 评分 -> 风险审批 -> 链上记分 -> 按分结算”成为一条清晰、可审计、可复盘的流程。

## 2. 解决方案

CGHub 将活动奖励结算拆成三个核心对象：

- **活动 / Round**：管理者创建活动，并在链上开设对应资金池。
- **贡献证据**：贡献者提交 GitHub 链接、URL 或文本说明，作为 AI Agent 评分依据。
- **链上贡献分**：AI Agent 评分通过审批后，生成 EIP-712 贡献证明，并写入 `ContributionPool` 合约。

完整流程如下：

```text
管理者创建活动和 Round
  -> 资金方 / 用户向活动资金池注资
  -> 贡献者提交贡献证据
  -> AI Agent 解析证据并按 rubric 评分
  -> 风险策略判断是否需要 Cobo 审批
  -> Cobo Agentic Wallet 签名 / 执行受限链上动作
  -> ContributionPool 记录贡献分
  -> 活动结束后 finalize
  -> 贡献者按分数占比领取奖励
```

这个方案的关键不是让 AI 直接“发钱”，而是让 AI Agent 生成可解释的贡献评分，再通过 Cobo Agentic Wallet 对签名、审批和链上执行设置边界。

## 3. 目标用户

CGHub 的目标用户不是泛泛的 Web3 用户，而是**需要把一笔活动或社区预算，按贡献证据公开、可解释、可审计地分配出去的组织方**。他们通常已经有奖金池、Grant 预算或社区资金，但缺少一套可信的贡献评分和结算流程。

### 核心目标用户

- **黑客松 / 社区活动组织方**：活动结束后需要根据参赛者和志愿者的实际贡献分配奖金，但贡献来源包括代码、文档、设计、运营、宣传和组织工作，单靠人工表格容易产生争议。
- **Grant / 开源资助计划管理者**：需要把预算发给真正产生贡献的人，并留下清晰的证据、评分理由、审批记录和链上结算结果。
- **DAO / 社区财库负责人**：需要对外说明资金为什么发给某些贡献者，避免“谁决定、凭什么、钱去哪了”无法解释。
- **开源项目或开发者社区维护者**：需要长期激励 PR、Issue、Commit、文档、维护、答疑等贡献，并把贡献历史沉淀为可复盘的账本。

### 关键参与者

这些人不一定是系统的购买或发起方，但会直接参与流程：

- **贡献者**：提交贡献证据，查看 AI Agent 评分、审批状态和可领取奖励。
- **资金方 / 赞助方**：向活动资金池注资，并查看资金是否按规则进入贡献者分账。
- **管理者 / 运营人员**：配置活动、处理高风险贡献审批、关闭活动并完成结算。

### 暂不优先覆盖的用户

CGHub 第一阶段不面向普通 DeFi 投资用户、通用企业薪资系统或纯任务悬赏平台。它优先解决的是“多人协作活动中的贡献如何被证明、评分、审批并结算”的问题。

## 4. 技术实现

CGHub 由前端、Agent 服务、智能合约和 Cobo Agentic Wallet 四部分组成。

### 智能合约

核心合约是 `ContributionPool.sol`，负责链上资金池和分账规则：

- `createRound`：创建活动对应的结算 Round。
- `fundRound`：将 USDC 注入指定 Round。
- `recordContributionBySig`：验证 Agent 签名的 EIP-712 `ContributionProof`，并记录贡献分。
- `finalizeRound`：关闭 Round，锁定最终分账状态。
- `claim` / `claimFor`：贡献者本人领取，或由 Agent 代触发领取。

分账公式：

```text
贡献者可领取金额 = 资金池金额 * 贡献者分数 / 总贡献分数
```

### Agent 服务

Agent 是系统的评分、审批和执行编排层，主要能力包括：

- 解析贡献证据，支持 GitHub PR、Issue、Commit、Repo、URL 和文本。
- 使用 AI Agent rubric 对贡献进行评分，输出分数、理由、维度拆解和风险标记。
- 根据风险策略判断贡献是否自动通过、进入 Cobo 审批、拒绝或需要补充证据。
- 生成 EIP-712 `ContributionProof`，并通过 Cobo message sign 签名。
- 调用 Cobo Agentic Wallet 进行受限 `contractCall`，把贡献分写入链上。
- 记录 Agent 决策、贡献审批记录、活动事件和 Cobo 状态，供前端复盘。

### Cobo Agentic Wallet

Cobo Agentic Wallet 用于约束 Agent 的链上权限：

- 通过 Pact 限制 Agent 可调用的合约和函数。
- 高风险贡献评分进入 Cobo App 审批。
- 审批通过后再进行 message sign 或 contract call。
- 记录签名、执行、拒绝和待审批状态，形成审计线索。

CGHub 中的 Pact 是按权限面拆分的，而不是用一个万能后端钱包覆盖所有动作：

| Pact | 主要权限 | 在 CGHub 中的作用 |
|------|----------|-------------------|
| Sign Pact | `messageSign` | 只为 EIP-712 `ContributionProof` / `ContributionReviewApproval` 签名，高风险评分进入 Cobo App 审批。 |
| Main Pact | `contractCall` | 只对 `ContributionPool` 执行受限调用，把已签 proof 写入链上，或在结算后代触发 `claimFor`。 |
| Guard Pact | `transfer` | 演示 Cobo Policy 对超额 transfer 的真实拦截。 |

Sign Pact 和 Main Pact 是故意分开的：Sign Pact 负责“评分 proof 能不能被签名”，Main Pact 负责“已签 proof 能不能被受限写链 / 代领”。两者不互相调用，而是由 Agent 编排成“评分审批 -> 签名证明 -> 链上记分 -> 按分结算”的流程。这样签名权和执行权分离，避免 AI Agent 变成无边界的资金分配脚本。

在 CGHub 中，Cobo 审批的核心含义是：审核 AI Agent 评分是否可以变成链上的资金分配权。

### 前端应用

前端使用 Next.js 构建，按角色拆分主要入口：

- 管理者工作台：活动创建、资金池状态、贡献审批、Cobo 状态。
- 资金方 / 用户视图：活动资金池、注资入口、贡献与结算进度。
- 贡献者视图：贡献提交、评分结果、待领取金额和领取状态。
- 复盘视图：Agent 决策、Cobo 审批、链上事件和资金流状态。

## 5. 使用到的 API / SDK / AI 工具

| 工具 | 用途 |
|------|------|
| Cobo Agentic Wallet SDK / API | Pact、审批、message sign、contract call 和钱包状态读取。 |
| OpenAI 兼容 Chat Completions | AI Agent rubric 评分。 |
| GitHub API | 拉取 PR、Issue、Commit、Repo 等贡献证据。 |
| Ethereum JSON-RPC | 读取 Sepolia 合约状态、提交交易和解析事件。 |
| ethers / viem | EIP-712、ABI 编码、合约读取和钱包交互。 |

## 6. 当前完成度

当前项目已经完成 Hackathon MVP 的核心闭环。

| 模块 | 当前状态 |
|------|----------|
| 智能合约 | 已实现 `ContributionPool`，支持创建 Round、注资、记录贡献分、finalize 和 claim。 |
| AI Agent 评分 | 已实现证据解析、rubric 评分、评分理由、风险标记和贡献审批记录。 |
| Cobo 审批与执行 | 已接入 Cobo Agentic Wallet，支持 Pact 准备、message sign、审批同步、contract call 和状态展示。 |
| 前端三角色 | 已实现管理者、资金方 / 用户、贡献者入口，以及活动、资金池、贡献、结算和复盘页面。 |
| 活动 Registry | 已实现活动 / Round 的本地 Registry，用于管理活动元数据和前端展示状态。 |
| Demo 配置 | 已提供 Sepolia demo 默认配置、`.env.example`、合约地址和本地启动流程。 |

当前仍属于 MVP 阶段，适合 Demo、黑客松评审和小规模测试。生产化使用前，还需要继续补强持久化、权限控制、评分策略运营和部署运维能力。

## 7. 后续计划

后续会继续围绕“评分可信、分配透明、执行可控”推进，重点包括：

- **优化 AI Agent 评分规则**：按贡献类型拆分 rubric。代码 PR 重点看合并状态、改动范围、核心模块和测试；文档 / 教程看清晰度、可复用性和传播效果；设计、产品建议、活动组织和社群运营看协作成本、持续投入和实际影响。
- **加入人的权重与复核**：管理者可以根据活动目标调整不同贡献类型的权重；关键贡献、争议贡献、低置信度评分进入人工复核。AI Agent 负责初评和解释，人负责最终边界判断。
- **增强评分解释**：每条评分尽量拆出基础分、贡献类型权重、证据可信度、人工调整和风险原因，让组织方和贡献者都能看懂结果。
- **细化风险规则**：在现有高分、高频、累计分和证据质量判断外，继续补充资金池占比过高、截止前集中提交、重复证据、新贡献者异常高分、AI 分数与规则兜底分差异过大等风险提示。
- **完善复盘与透明度**：活动结束后沉淀贡献记录、AI 评分理由、人工调整、Cobo 审批状态和链上结算结果，方便组织方复盘，也让贡献者知道奖励如何得出。
