# Agent HTTP API（给前端）

> 给前端火堆（老实人）对接。前端可以连接浏览器钱包、读取合约状态；贡献上链和 claim 这类 CAW 执行动作走下面接口，前端不碰私钥、不碰 CAW 凭证。
> 起服务：`npm run api`（默认 `http://localhost:8787`，改 `PORT` 环境变量）。已开 CORS。
> Cobo 加权版架构路线见：[`../../docs-文档/cobo-agent-wallet-加权架构方案.md`](../../docs-文档/cobo-agent-wallet-加权架构方案.md)。

## 当前实现与 v2 方向

当前实现：

```text
/api/sign-contribution：默认 Agent 本地 AGENT_PRIVATE_KEY 签 EIP-712 proof；SIGNER_MODE=cobo 时用 CAW messageSign
/api/submit-contribution：CAW contractCall 上链 recordContributionBySig
/api/trigger-claim：CAW contractCall 调 claimFor
/api/audit：读取 Cobo audit
/api/cobo/safety-probe：CAW transferTokens 触发真实 policy denied
```

已落地 / v2 方向：

```text
SIGNER_MODE=cobo：/api/sign-contribution 由 CAW messageSign(eip712) 签 proof
GET /api/cobo/status：展示 Pact / Balance / Pending approval / Audit 状态
AUTO_CLAIM loop：自动扫描 pending 并经 CAW claimFor
POST /api/cobo/fund-round：可选 CAW treasury approve + fundRound
```

## 接口

### 1. 签贡献（拿 proof + signature）

```
POST /api/sign-contribution
Content-Type: application/json

{
  "contributor": "0x贡献者地址",
  "title": "完成 ContributionPool 前端对接",
  "amount": "0.5",
  "description": "实现贡献提交、链上事件读取和审计展示",
  "source": "frontend",
  "evidenceId": "frontend-1710000000000",
  "paymentId": "可选，不传自动生成"
}
```

返回：

```json
{
  "reviewStatus": "auto_allowed",
  "reviewId": "review-...",
  "recorded": true,
  "recordTxId": "...",
  "txHash": "0x...",
  "score": 72,
  "reason": "GitHub PR 已验证且已 merged；命中核心项目路径：agent/src/... → 72 分",
  "triggeredRules": [],
  "evidenceSnapshot": {
    "type": "github_pull_request",
    "status": "verified",
    "summary": "PR #123 merged，文件 3 个"
  },
  "scoreBreakdown": {
    "score": 72,
    "confidence": 0.95,
    "source": "llm",
    "rubricVersion": "2026-06-llm-rubric-v1",
    "fallbackScore": 68,
    "dimensions": [],
    "riskFlags": []
  },
  "aiScoring": {
    "enabled": true,
    "status": "success",
    "score": 72,
    "confidence": 0.95,
    "needsHumanReview": false
  },
  "signerMode": "cobo",
  "signerAddress": "0xCAW..."
}
```

> 强 Cobo 流程下，`auto_allowed` 会直接请求 Cobo Sign Pact 签 proof，并由 CAW Main Pact 调 `recordContributionBySig`。前端不接收可复用的 `proof/signature`。
> `pending_cobo_approval` 表示高风险评分 proof 已提交到 Cobo App 等待审批；返回里可以带 `coboSignTxId` / `coboApprovalId`，但不会带 `proof/signature`，也不会上链。
> `rejected` / `needs_more_evidence` / `cobo_rejected` 不签名不上链。
> `score` 由 Agent 根据证据快照、rubric 和 LLM JSON 裁决生成；即使请求里带旧版手填 `score`，后端也会忽略它。
> `evidenceSnapshot` / `scoreBreakdown` / `aiScoring` 用于评审复盘。LLM JSON 合法时最终分使用 LLM score；LLM disabled / skipped / failed / schema_invalid 时使用规则兜底分，并进入 Cobo App 复核。

可选证据化评分配置：

```bash
GITHUB_TOKEN=
AI_SCORER_PROVIDER=openai
AI_SCORER_MODEL=
AI_SCORER_API_KEY=
AI_SCORER_BASE_URL=
```

> `GITHUB_TOKEN` 只用于提高 GitHub API 限额。`AI_SCORER_API_KEY` / `AI_SCORER_MODEL` 不填时不会调用 LLM，`scoreBreakdown.source=rule_fallback`。
> 证据化评分不改合约 proof，不要求重新生成 Pact；Cobo App 审批描述会带证据摘要、rubric 分项、置信度、LLM 状态和风险标记。

### 2. 内部/兼容：上链记录

```
POST /api/submit-contribution
{ "proof": {...后端保存过的 proof...}, "signature": "0x..." }
```

返回：`{ "txId": "...", "status": "success", "txHash": "0x..." }`

> 该接口不再是贡献者主流程。它会校验 `proofHash -> reviewId`、review 状态和后端保存的 signature；没有 review record 的外部 proof 会返回 403。
> 正常贡献提交流程由 `/api/sign-contribution` 在后端完成 Cobo 签名和 CAW 上链。

### 3. 查可领金额

```
GET /api/pending?contributor=0x贡献者地址
```

返回：`{ "pending": "...", "score": "...", "claimed": "..." }`（单位是 USDC 最小单位）

### 4. 触发分账（Cobo 代领）

```
POST /api/trigger-claim
{ "contributor": "0x贡献者地址" }
```

返回：`{ "txId": "...", "status": "..." }`，无可领时返回 `{ "skipped": true, "reason": "..." }`

> 这步后端持 CAW 凭证、走 Cobo contractCall 调合约 claimFor。和上链记录一样，需要 CAW 钱包、active pact，以及本机 `cobo-tss-node` signer 在线。

### 5. Agent 决策流

```
GET /api/decisions?limit=30
```

返回：

```json
{
  "items": [
    {
      "id": "score-0xabc-1710000000000-x1y2z3",
      "ts": 1710000000000,
      "stage": "score",
      "contributor": "0x贡献者地址",
      "result": "allowed",
      "score": 50,
      "reason": "命中 核心模块(frontend) → 50 分"
    },
    {
      "id": "received-0xabc-1710000000000-a1b2c3",
      "ts": 1710000000000,
      "stage": "received",
      "contributor": "0x贡献者地址",
      "result": "pending",
      "reason": "完成 ContributionPool 前端对接"
    }
  ]
}
```

> 当前决策流写入 `agent/data/agent-registry.json`，服务重启后仍可追溯；返回顺序是新到旧。`submit-contribution` 只写 `recorded`，不写假的 `guard`；真正的 `guard` 事件只来自 Cobo Pact/Policy 路径。
> 当前阶段包括：`received`、`score`、`signed`、`recorded`、`guard`、`claim`、`fund`。

### 5.1 Agent Registry 追溯接口

```
GET /api/agent-registry?projectId=2&roundId=1&limit=50
```

返回：

```json
{
  "reviews": [],
  "decisions": [],
  "activityEvents": []
}
```

> `reviews` 会过滤 `proof/signature`，避免把可复用签名下发前端。后端本地 Registry 文件会保留 Cobo approval id、Cobo tx id、proofHash、txHash 等审计字段，用于重启恢复和排障。
> `reviews` 中也会保留 `evidenceSnapshot`、`scoreBreakdown`、`aiScoring`，用于解释“这条分数怎么来的”。

### 6. 真实 denied 来源：Safety Probe

前端没有护栏按钮。需要展示超额拦截时，在 Agent 服务端配置：

```bash
GUARD_PROBE_ENABLED=true
# 可选；不填则自动使用 CLAIM_MAX_AMOUNT + 1
GUARD_PROBE_AMOUNT=
```

服务启动后会自动走一次 `transferTokens` 超额转账意图。只有 Cobo Policy 真实返回 denied / 403 时，后端才写入：

```json
{
  "stage": "guard",
  "result": "denied",
  "amount": "101",
  "reason": "Cobo policy denied..."
}
```

如果 transfer 没被拦截，后端不会伪造 denied，而是写入 `result:"error"`，提示 guard pact 或阈值配置不符合预期。

也可以手动触发正式接口：

```
POST /api/cobo/safety-probe
{ "amount": "101" }
```

返回：

```json
{
  "blocked": true,
  "amount": "101",
  "reason": "amount_gt 100"
}
```

> 旧 `POST /api/guard-demo` 仅作为内部兼容调试入口保留，UI 不调用。

### 7. Cobo 状态面板

```
GET /api/cobo/status
```

目标返回：

```json
{
  "walletId": "caw wallet uuid",
  "srcAddress": "0xCAW...",
  "chainId": "SETH",
  "tokenId": "SETH_USDC",
  "mainPact": {
    "id": "...",
    "status": "active",
    "expiresAt": "...",
    "progressTxCount": 3
  },
  "signPact": {
    "id": "...",
    "status": "active",
    "expiresAt": "..."
  },
  "fundPact": {
    "id": "...",
    "status": "active",
    "expiresAt": "..."
  },
  "guardPact": {
    "id": "...",
    "status": "active",
    "expiresAt": "..."
  },
  "pactStats": {
    "totalPacts": 4,
    "activePacts": 4,
    "txCount": 4,
    "volumeUsd": "0"
  },
  "balances": [],
  "pendingOperations": []
}
```

> 这个接口只返回可展示状态，严禁返回 `AGENT_WALLET_API_KEY`、pact api key、`AGENT_PRIVATE_KEY`。

### 8. 可选：CAW treasury 注资

```
POST /api/cobo/fund-round
{ "amount": "100" }
```

可选流程：

```text
CAW Fund Pact contractCall USDC.approve(pool, amount)
-> CAW Fund Pact contractCall ContributionPool.fundRound(projectId, roundId, amount)
-> Cobo audit allowed
-> 前端 funded 刷新
```

> 这不是资金池注资的唯一设计路径；项目方 / 用户也可以直接用自己的钱包给资金池注资。
> 该接口要求 CAW 地址持有测试 USDC。`approve` 和 `fundRound` 必须由同一个 `CAW_SRC_ADDRESS` 发起。
> Fund Pact 的 `target_in` 必须同时包含 `USDC_ADDRESS` 和 `POOL_ADDRESS`，否则 `approve` 或 `fundRound` 会被 Cobo Policy 拦截。
> 成功后 `/api/decisions` 会出现 `stage:"fund"`，用于中栏展示 CAW treasury 资金层动作。

## 关于 CAW 凭证

CAW 的 API Key / pact key 是机密，**不下发前端**——claim/支付都走上面的接口，由后端持凭证执行。

前端若要展示钱包信息，可以使用**非机密**信息：Cobo 钱包地址 + wallet UUID + 链（Sepolia/SETH）。

当前联调状态：CAW 钱包和 pact 已可用；接口 2/4 依赖 CAW signer。接口 1 默认为本地 `agentSigner` 链下签 proof；切到 `SIGNER_MODE=cobo` 后会依赖 CAW `messageSign`，并要求链上 `agentSigner()` 等于 `CAW_SRC_ADDRESS`。新 Pact 拆分后，`CAW_PACT_ID` 只管 ContributionPool 执行，`CAW_SIGN_PACT_ID` 只管 EIP-712 `ContributionProof` / `ContributionReviewApproval` 的 `messageSign`，`CAW_FUND_PACT_ID` 只管可选 CAW treasury 注资。若返回 `Cobo API 403: permission_check_failed`，按失败动作优先检查对应 Pact 是否已 approve：签 proof / 风险审批看 Sign Pact，记录/claim 看 Main Pact，注资看 Fund Pact。

如果前端是想自己用 Cobo SDK 做"连接钱包/支付 UI"，那是另一回事——CAW 是服务端 agent 钱包，跟浏览器钱包连接不是一个东西。

## Cobo 加权实施顺序

```text
1. /api/cobo/status + 前端 Cobo 状态面板
2. AUTO_CLAIM loop
3. safety-probe 文案和决策流改造
4. Cobo messageSign proof 签名联调（Sign Pact 需包含 `ContributionProof` 与 `ContributionReviewApproval` 两类 `message_sign` policy）
5. setAgentSigner(CAW_SRC_ADDRESS)
6. 可选 CAW treasury approve + fundRound（Fund Pact 需包含 USDC + Pool target）
```
