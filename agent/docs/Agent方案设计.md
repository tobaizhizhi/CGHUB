# Agent 火堆 · 方案设计

> v1.0

> Cobo 加权版推荐架构见：[`../../docs-文档/cobo-agent-wallet-加权架构方案.md`](../../docs-文档/cobo-agent-wallet-加权架构方案.md)。  
> 本文保留早期 Agent 方案背景；后续实现以“Cobo 负责签名权、执行权、资金权、审计权”的 v2 方案为准。

以下设计依据 Cobo SDK 和 合约接口对接说明文档 完成。

## v2 方向摘要

当前 v1 方案里，Agent 后端用 `AGENT_PRIVATE_KEY` 签 EIP-712 贡献 proof，Cobo 主要负责 `contractCall` 上链记录、`claimFor` 分账和 audit。v2 推荐把 Cobo Agent Wallet 提升为核心权限层：

```text
用户提交贡献
-> Agent 计算 score/reason
-> Cobo messageSign 签 EIP-712 proof
-> Cobo contractCall 上链 recordContributionBySig
-> Agent auto-claim loop 扫 pending
-> Cobo contractCall claimFor
-> Cobo transfer policy 做 safety probe denied
-> Console 展示 Pact / Policy / Balance / Audit / Pending approval
```

关键变化：

- `AGENT_PRIVATE_KEY` 只作为 `SIGNER_MODE=local` 的回滚方案。
- `SIGNER_MODE=cobo` 时，贡献 proof 由 CAW `messageSign(eip712)` 签名。
- 合约 `agentSigner` 需要切到 `CAW_SRC_ADDRESS`。
- 所有关键写链动作优先经 CAW `contractCall`，并在 Pact/Policy 下运行。
- Cobo status 不再只是一张护栏卡，而是包含 Pact 状态、余额、pending approval 和 audit 的控制台。

## 一、目标

**Agent 把贡献算成分数，先过 review 策略；通过后由 Cobo Sign Pact 签成合约认的证明，再由 CAW Main Pact 把评分记录写上链，后续分账也走 Cobo。**

强 Cobo 流程里，前端不再拿 `(proof, signature)` 自己决定是否上链；评分通过后，Cobo 同时参与签名授权、CAW 上链记录和审计留痕。所以"Agent 自主"在我们这版里体现为两点：Agent 是唯一能触发有效评分 proof 的角色，以及 Agent 通过 Cobo 自主发起合约调用完成记录和分账。

拆成三块，对应仓库里的核心文件：

| 模块 | 文件 | 干的事 |
|------|------|--------|
| 贡献记录 Agent | `tools/sign-contribution.ts` / `src/contribution-recorder.ts` | 评分、review gate、组织 `ContributionProof`，通过 Cobo Sign Pact 签名 |
| Cobo 钱包调用 | `src/wallet-agent.ts` | 封装 Cobo Agentic Wallet：`contractCall` 调 `recordContributionBySig` / `claimFor` |
| MCP 工具服务 | `src/mcp-server.ts` | 把上面三块包成 MCP 工具，让任意 Agent 能调 |

入口 `src/index.ts` 负责把这四块串起来跑端到端。

---

## 二、整体架构和数据流

白织的合约是**资金池 + 按分数比例分账**模型，不是一笔一转。完整闭环：

```
[owner]      createRound(projectId, roundId, USDC)         一次性，白织/owner 建池
[出资方]     approve(pool, amount) → fundRound(amount)      注入 USDC
                         │
贡献发生（contributor + 业务证据 + score 分数）
                         │
[contribution-recorder]  组织 ContributionProof：
                         { projectId, roundId, contributor, score,
                           proofHash, paymentIdHash, nonce, deadline }
                         review gate 通过后请求 Cobo Sign Pact 签名
                         链下自检 verifyTypedData() == CAW_SRC_ADDRESS
                         │
                         ▼
[CAW Main]   recordContributionBySig(proof, signature)      CAW Main Pact 发交易并留审计
             合约校验签名 + 防重放(proofHash) → score 累加进池子
                         │  多条贡献重复上面这步
                         ▼
[owner]      finalizeRound(projectId, roundId)              锁定，进入领取阶段
                         │
[wallet-agent → Cobo]    读 pending(projectId, roundId, contributor)
                         pending > 0 → contractCall 调 claimFor(...)
                         USDC: ContributionPool → contributor（钱直接到贡献者）
                         │
[前端/Agent] 监听 event：ContributionRecorded / RoundFinalized / Claimed
```

**几个需要特别注意的点：**

1. **存的是 score 不是金额。** 每个贡献者拿多少 = `funded × score / totalScore`，领取时合约算。Agent 只管把"这条贡献值多少分"传进去并签名。一条贡献多少分谁定，见第九节。
2. **记录上链默认由 CAW Main Pact 发。** 合约层面 `recordContributionBySig` 任意地址都能调，但项目主流程不把可复用签名交给前端；CAW 发交易才能保留 Cobo 审计链。
3. **防重放 key 是 `proofHash`，不是 nonce。** 同一个 `proofHash` 上链一次后再提交直接 revert。生成 proof 时必须保证 `proofHash` 唯一且非零。nonce 只参与签名、建议唯一。
4. **finalize 是 owner 权限、不可逆。** 锁定后这轮不能再记贡献。Demo 流程里先把要演的贡献都记完再 finalize。

---

## 三、Cobo Agentic Wallet 接入

### 3.1 Cobo 调合约方法。

`TransactionsApi.contractCall()` 是一等接口，调 `claimFor`：

```typescript
contractCall(wallet_uuid, {
  chain_id: 'SETH',                    // Cobo 的 Sepolia
  contract_addr: POOL_ADDRESS,         // 0x876A...1Bd5
  calldata: iface.encodeFunctionData('claimFor', [projectId, roundId, contributor]),
  value: '0',
  sponsor: true,                       // 走 Cobo Gasless 代付 gas，Demo 现场不用自己备 gas
  request_id: '<幂等 key>',
})
```

`calldata` 用 ethers `Interface.encodeFunctionData` 编。配套还有 `estimateContractCallFee`（估 gas）。所以分账这条线技术上通了。

### 3.2 Cobo 调用全景

我们要用到的 Cobo 接口，都在 `TransactionsApi`：

| 接口 | 用途 |
|------|------|
| `contractCall(...)` | 调 `recordContributionBySig`、`claimFor`，以及可选 CAW treasury `approve` / `fundRound` |
| `transferTokens(...)` | 护栏演示：用 Cobo 原生 transfer 触发 `amount_gt` 拦截 |
| `messageSign(...)` | `SIGNER_MODE=cobo` 时由 CAW 签 EIP-712 `ContributionProof`；高频 / 累计分风险先签 `ContributionReviewApproval` 走 Cobo App 审批 |

Pact / Policy / 审计这套护栏照 `quickstart.ts`：Owner 审批 Pact（intent + policy 限链、目标合约、币种或金额），Agent 在范围内自主调用，超范围 Policy 自动拦、审计可查。这就是"自主但有护栏"，Demo 讲这个。Policy 阈值写配置别硬编码。

当前 Pact 按动作拆分：

| Pact | 环境变量 | 用途 |
|------|----------|------|
| Main | `CAW_PACT_ID` | 只允许调用 ContributionPool，覆盖 `recordContributionBySig` / `claimFor` |
| Sign | `CAW_SIGN_PACT_ID` | 只允许 `messageSign`，覆盖 Cobo EIP-712 `ContributionProof` / `ContributionReviewApproval`；高分或同一贡献者同一 round 24 小时第 3 次起进入 Cobo App 审批 |
| Fund | `CAW_FUND_PACT_ID` | 可选 CAW treasury 注资，覆盖 `USDC.approve` + `ContributionPool.fundRound` |
| Guard | `CAW_GUARD_PACT_ID` | transfer 护栏演示，覆盖 `deny_if.amount_gt` |

### 3.3 wallet-agent 对外暴露什么

| 方法 | 干的事 |
|------|--------|
| `ensurePactReady()` | 提交/复用 Main Pact，轮询到 active，返回 pact-scoped API key |
| `ensureSignPactReady()` | 提交/复用 Sign Pact，供 Cobo `messageSign` 使用 |
| `ensureFundPactReady()` | 提交/复用 Fund Pact，供可选 CAW treasury 注资使用 |
| `ensureGuardPactReady()` | 提交/复用 Guard Pact，供 transfer 护栏演示使用 |
| `checkPending(contributor)` | 读合约 `pending()`，判断有没有可领 |
| `claimForContributor(contributor)` | pending>0 时走 `contractCall → claimFor` 代领 |
| `fundRoundFromTreasury(amount)` | 可选 CAW treasury 注资，走 `approve → fundRound` |
| `getAuditTrail(limit)` | 拉 Cobo 审计日志，Demo 展示用 |

---

## 四、MCP 工具清单

四个核心工具：

```
sign-contribution        Agent 评分后执行审批策略；通过后走 Cobo Sign Pact 签名，再由 CAW Main Pact 上链
  in : { projectId, roundId, contributor, title, description, evidenceUrl?, source, evidenceId, paymentId? }
  out: { reviewStatus, reviewId, txHash? }
       内部：AI score → review gate → Cobo EIP-712 signTypedData → recordContributionBySig

submit-contribution      兼容/内部上链接口；只接受后端审批记录中已签过的 proof
  in : { proof, signature }
  out: { txHash }   // 调 recordContributionBySig

check-pending            查贡献者可领金额 / 分数
  in : { projectId, roundId, contributor }
  out: { pending, score, claimed }

trigger-claim            驱动 Cobo 代领分账
  in : { projectId, roundId, contributor }
  out: { txId, status }   // Cobo contractCall → claimFor
```

可选（看时间）：`finalize-round`（owner 权限，可能白织手动）、`get-audit`（给前端拉审计）。

`mcp-server.ts` 用标准 MCP（stdio）注册。`index.ts` 提供非 MCP 的直跑入口，端到端自测和录屏用。工具先这 4 个核心，任务分配里"参考 AgentVault 11 个"是上限不是指标。

---

## 五、给合约和前端的对接契约

**部署信息以最新部署日志为准。**

### 5.1 合约火堆已提供内容

部署（Sepolia）：

```
ContributionPool : 0x876A0741223EDdaE081Ef22beA513E92335B1Bd5
USDC             : 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
projectId / roundId : 1 / 1
agentSigner      : 部署参数 INITIAL_AGENT_SIGNER（需要对应私钥）
```

会用到的接口：

```solidity
recordContributionBySig(ContributionProof proof, bytes signature)   // 执行方发，Agent 只供 proof+sig

rounds(projectId, roundId) → (token, funded, totalScore, exists, finalized)
scores(projectId, roundId, contributor) → uint256
pending(projectId, roundId, contributor) → uint256
agentSigner() → address            // 自检签名地址
usedProofs(proofHash) → bool        // 防重放自检

claimFor(projectId, roundId, contributor)   // Cobo contractCall 调

// 事件（监听对账）
ContributionRecorded(projectId, roundId, contributor, score, proofHash, paymentIdHash)
RoundFinalized(projectId, roundId)
Claimed(projectId, roundId, contributor, amount)
```

EIP-712（按说明 9.1 / 9.2，字段顺序一字不能错）：

```typescript
const domain = {
  name: "CGHubContributionPool",
  version: "1",
  chainId: 11155111,                 // Sepolia
  verifyingContract: POOL_ADDRESS,
};
const types = {
  ContributionProof: [
    { name: "projectId",     type: "uint256" },
    { name: "roundId",       type: "uint256" },
    { name: "contributor",   type: "address" },
    { name: "score",         type: "uint256" },
    { name: "proofHash",     type: "bytes32" },
    { name: "paymentIdHash", type: "bytes32" },
    { name: "nonce",         type: "uint256" },
    { name: "deadline",      type: "uint256" },
  ],
};
const signature = await wallet.signTypedData(domain, types, message);  // ethers v6
```

claimFor 的 calldata 编码（给 Cobo `contractCall`）：

```typescript
const iface = new ethers.Interface(POOL_ABI);
const calldata = iface.encodeFunctionData("claimFor", [projectId, roundId, contributor]);
```

还需要白织给：**ABI 文件**（`out/ContributionPool.sol/ContributionPool.json` 里的 `abi`）。

### 5.2 我们这里提供给前端火堆的信息

前端可以连接浏览器钱包、读取合约状态；私钥和 CAW 凭证不下发前端。提交贡献 → `sign-contribution` + `submit-contribution`；查可领 → `check-pending`；触发领取 → `trigger-claim`。

展示类数据（round 状态、已领、审计）前端可以直接读合约 `rounds()`/`claimed()` + 监听事件（白织说明第 13 节有最小对接清单），不一定都过我。哪些走我、哪些前端直连，Day5 前跟老实人对一下，别重复造。

---

## 六、技术选型和依赖

| 项 | 选型 | 说明 |
|----|------|------|
| 语言 | TypeScript + tsx | 跟 caw-example 一致，`type: module` |
| 钱包 SDK | `@cobo/agentic-wallet` | `contractCall` / `payment` / `transferTokens` 都用得上 |
| 链交互 | `ethers` v6 | `signTypedData` 做 EIP-712、`verifyTypedData` 自检、`Interface.encodeFunctionData` 编 calldata、读合约 |
| MCP | `@modelcontextprotocol/sdk` | stdio transport |
| 签名 | EIP-712 | 合约标准 |

`agentSigner` 私钥用 env（`AGENT_PRIVATE_KEY`），跟白织测试脚本 env 名对齐。Cobo 三个 env（`AGENT_WALLET_API_URL/API_KEY/WALLET_UUID`）照 `.env.example`。

---

## 七、待确认清单

1. **agentSigner 私钥谁保管、怎么配给 Agent？** Demo 前 Agent 要持有 `agentSigner()` 对应私钥，否则签名验不过。（找白织）
2. **`recordContributionBySig` 谁发交易、gas 谁出？** Agent 不发交易，执行方是后端钱包 / Cobo / 测试钱包？（找白织 + 定流程）
3. **`finalizeRound` 谁触发、什么时机？** owner 权限，Demo 里先记完所有贡献再 finalize，不可逆。（找白织）
4. **`proofHash` / `paymentIdHash` 的 canonical payload 跨语言统一。** 合约说明 9.3 提了——序列化不一致会导致 hash 对不上、对账失败。Day5 前定统一的序列化规则。

---
