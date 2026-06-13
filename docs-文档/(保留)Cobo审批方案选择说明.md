# Cobo 审批方案选择说明

## 1. 背景

CGHub 的核心风险点不是“AI 给了一个分数”本身，而是：

```text
AI score -> 链上 score -> 资金分配权
```

一旦 `score` 被写入合约，后续贡献者能领取的资金就会按这个分数计算。因此，AI 评分不能只由后端自己决定并直接上链，必须在“评分变成资金分配权”之前引入可审计、可审批、可限制权限的钱包层控制。

当前项目采用 Cobo Agent Wallet，把关键动作拆成：

```text
Agent 评分
-> 风险规则判断
-> Cobo Sign Pact 签名 / Cobo App 审批
-> CAW Main Pact 上链 recordContributionBySig
-> 后续 claimFor 领取
```

其中最关键的是 Sign Pact：它决定一条评分 proof 是否可以被 CAW 签名。没有这个签名，合约不会接受这条评分记录。

---

## 2. 两种方案

### 方案一：使用 ContributionReviewApproval 风险审批单

当前采用的是方案一。

流程：

```text
低风险贡献：
Agent 评分 -> Cobo Sign Pact 签 ContributionProof -> CAW Main Pact 上链

高分贡献：
ContributionProof.score > 阈值
-> Cobo Sign Pact 触发 Cobo App 审批
-> approve 后得到真实 ContributionProof 签名
-> CAW Main Pact 上链

高频 / 累计分过高：
Agent 先计算跨请求风险
-> 构造 ContributionReviewApproval(requiresApproval=1)
-> Cobo Sign Pact 触发 Cobo App 审批
-> approve 后，Agent 再请求真实 ContributionProof 签名
-> CAW Main Pact 上链
```

这里有两类 EIP-712 消息：

| 类型 | 用途 | 是否上链 | 是否需要改合约 |
|------|------|----------|----------------|
| `ContributionProof` | 真实评分 proof，合约验签后记分 | 是 | 否，保持当前结构 |
| `ContributionReviewApproval` | 风险审批单，只给 Cobo App 审批 | 否 | 否 |

`ContributionReviewApproval` 的意义是：把 Cobo Policy 看不到的跨请求风险，比如 24 小时提交次数、本轮累计分，转成 Cobo App 能审批的一条消息。

---

### 方案二：把风险字段直接加入 ContributionProof

方案二是更强绑定的设计。

例如把这些字段直接加入真实 `ContributionProof`：

```text
requiresReview
riskCategory
userDailyRequestIndex
currentRoundScore
nextRoundScore
```

这样 Cobo Sign Pact 可以直接读取真实 proof 里的风险字段：

```text
score > 80 -> 审批
requiresReview == true -> 审批
userDailyRequestIndex >= 3 -> 审批
nextRoundScore >= 120 -> 审批
```

这个方案的优点是：风险字段直接绑定在最终上链 proof 里，理论完整性更强。

但代价也更高：

```text
要改 Solidity ContributionProof struct
要改 EIP-712 TYPEHASH
要改 ABI
要改 Agent proof 类型
要改前后端类型
要重新部署合约
要重新配置 agentSigner / CAW signer
要重新验证整条上链流程
```

对于当前黑客松阶段，这个改动成本和回归风险偏高。

---

## 3. 为什么当前选择方案一

### 3.1 不改合约，交付风险更低

当前合约已经能稳定验证 `ContributionProof` 并记录分数。方案一不改变合约验签结构，只在 Cobo 审批层增加 `ContributionReviewApproval`。

这意味着：

```text
合约不用重新部署
ABI 不变
前端读链逻辑不变
已跑通的 recordContributionBySig 不被破坏
```

对黑客松来说，这是更稳的路径。

### 3.2 能覆盖真实风险

Cobo Pact 本身不记忆历史请求，因此它不能自己知道：

```text
同一贡献者今天提交了几次
同一贡献者本轮已经累计多少分
```

方案一让 Agent 负责计算这些跨请求上下文，再把结论变成：

```text
ContributionReviewApproval(requiresApproval=1)
```

Cobo Sign Pact 只需要做它擅长的事情：

```text
读取当前 EIP-712 消息字段
命中 requiresApproval > 0
触发 Cobo App 人工审批
记录审批和签名审计
```

这不是绕开 Cobo，而是把业务风险转成 Cobo 能执行的策略对象。

### 3.3 Cobo App 审批是真实发生的

方案一不是后端自己写一个“已审批”状态。

高风险时，后端会真正调用 Cobo `messageSign`，提交 `ContributionReviewApproval`。新的 Sign Pact 会要求：

```text
primaryType = ContributionReviewApproval
requiresApproval > 0
```

命中后进入 Cobo App pending approval。

只有 Cobo App approve 后，后端才继续请求真实 `ContributionProof` 签名并上链。

### 3.4 失败时默认安全

如果 Sign Pact 没有正确触发人工审批，后端不会继续偷偷上链。

当前实现是 fail closed：

```text
高风险 review 如果被旧 Sign Pact 自动签了
-> 后端报错
-> 不上链
-> 要求重新生成并 approve 新 Sign Pact
```

这能避免低分高频、累计分过高的贡献绕过 Cobo App 审批。

### 3.5 方案一更适合 Demo 讲清楚

方案一可以非常清晰地展示：

```text
AI 评分不是直接变成钱
高风险评分先进入 Cobo App 审批
Cobo approve 后才有签名
有签名后才由 CAW 写链
链上分数才会影响分账
```

这条故事线比“后端自己审批后直接签名”更强，也比“为了加字段重部署整套合约”更适合黑客松交付。

---

## 4. 为什么不是现在就做方案二

方案二确实更强，但它适合作为产品级增强，而不是当前黑客松主路径。

主要原因：

1. 合约结构要变，风险大。
2. EIP-712 `TYPEHASH` 要变，所有签名和验证都要重测。
3. 已经跑通的 Cobo 签名、上链、前端读链都要回归。
4. 黑客松评审更看重“能跑通、能解释、Cobo 参与关键路径”，不是为了字段完美性牺牲交付稳定性。

因此当前选择：

```text
方案一作为黑客松可交付版本
方案二作为后续产品化增强方向
```

---

## 5. 为什么这个项目需要 Cobo

如果没有 Cobo，这个项目会变成：

```text
后端 Agent 算分
后端私钥签名
后端发交易
前端展示结果
```

这样的问题是：

```text
评分权、签名权、执行权都集中在后端
高风险评分没有钱包层人工审批
没有 Cobo App pending approval
没有 Pact 范围限制
没有 Cobo 审计链
后端一旦出错或被滥用，评分很容易直接变成资金分配权
```

使用 Cobo 后，关键区别是：

| 能力 | 没有 Cobo | 使用 Cobo |
|------|-----------|-----------|
| 签名权 | 后端私钥直接签 | CAW Sign Pact 控制 |
| 高风险审批 | 后端自己判断 | Cobo App 人工 approve |
| 权限边界 | 后端代码约束 | Pact / Policy 约束 |
| 上链执行 | 普通后端钱包 | CAW Main Pact 执行 |
| 审计证据 | 本地日志为主 | Cobo tx id / pending approval / audit |
| 凭证隔离 | 后端私钥风险高 | CAW / pact-scoped key 分层 |
| Demo 可信度 | “后端说它审过” | “Cobo App 真实审批后才签名上链” |

Cobo 在这里不是装饰层，而是把 AI 评分变成资金分配权之前的控制层。

---

## 6. 方案一中的 Cobo 价值

方案一里 Cobo 做了三件关键事：

### 6.1 控制签名权

合约只接受 CAW / agentSigner 的有效 EIP-712 签名。

因此：

```text
没有 Cobo Sign Pact 签名
就没有可上链的 ContributionProof
```

这让 Cobo 成为评分进入链上的前置关口。

### 6.2 触发人工审批

当贡献命中高风险规则：

```text
score > 80
24 小时第 3 次及以后提交
本轮累计分过高
```

它会进入 Cobo App pending approval。

人类 approve 前，后端不会拿到可用于上链的真实 proof 签名。

### 6.3 统一链上执行和审计

审批通过后，后端不是把签名交给前端，而是继续通过 CAW Main Pact 调：

```text
recordContributionBySig
```

这样整条路径都有 Cobo 证据链：

```text
Sign Pact 审批 / 签名
Main Pact 上链执行
Cobo tx id
pending approval 记录
audit 记录
链上 txHash
```

这比单纯后端私钥签名更能体现 Cobo 的产品价值。

---

## 7. 当前方案的边界

方案一不是说后端完全没有作用。后端仍然负责：

```text
AI 评分
统计 24 小时提交次数
统计本轮累计分
判断是否需要 Cobo 审批
构造 ContributionReviewApproval
审批通过后请求真实 ContributionProof 签名
```

因此它的边界是：

```text
Cobo 负责审批权、签名权、执行权、审计权
Agent 负责业务上下文计算和流程编排
合约负责最终验签和记分
```

如果未来要做到更强的不可绕过约束，可以升级到方案二，把风险字段并入真实 `ContributionProof`，让 Cobo Sign Pact 直接检查最终上链 proof 的全部风控字段。

---

## 8. 结论

当前推荐方案：

```text
黑客松版本：方案一，ContributionReviewApproval 风险审批单
产品增强版：方案二，把风险字段并入 ContributionProof 并改合约
```

方案一的优势是：

```text
不改合约
交付稳定
真实触发 Cobo App 审批
覆盖高分、高频、累计分风险
审批后才签真实 proof
上链仍走 CAW Main Pact
Cobo 参与签名权、审批权、执行权、审计权
```

因此，方案一不是“后端随便加一层审批”，而是：

```text
Agent 把跨请求风险转换成 Cobo 可审批的 EIP-712 消息；
Cobo App 审批通过后，评分 proof 才能被签名并写入链上资金分配系统。
```

