# AI 评分与 Cobo 审批策略

> 本文定义 CGHub 中 Agent 评分如何变成链上资金分配权，以及哪些评分需要进入人工审批。  
> 核心原则：**Cobo 审核 AI 评分证明，就是审核资金分配权。**

配套落地文档：[AI评分与Cobo审批代码修改方案](./AI评分与Cobo审批代码修改方案.md)

---

## 1. 背景

CGHub 的分账公式是：

```text
贡献者可领取金额 = 资金池金额 * 贡献者分数 / 总贡献分数
```

因此，Agent 给出的 `score` 不是普通展示数据，而是未来资金分配的直接依据。

一条贡献从提交到上链，应该分成两个阶段：

```text
贡献内容审核
-> 评分证明授权
```

Cobo 不负责判断某条贡献内容本身值多少分；这仍然由 CGHub 的 Agent 评分逻辑和管理者复核完成。Cobo 负责的是：在评分结果被允许成为链上 proof 之前，对这次资金分配权生成动作进行授权、约束和审计。

---

## 2. 目标流程

```text
贡献者提交贡献
-> Agent 自动评分
-> 风险策略判断
   -> auto_allowed：请求 Cobo messageSign，随后上链
   -> pending_review：等待人类审批
   -> rejected / needs_more_evidence：不上链
-> 人类审批通过后
-> Cobo messageSign 签评分 proof
-> CAW contractCall 调 recordContributionBySig
-> 链上 score 生效，形成资金分配权
```

关键边界：

- **审批发生在 Cobo 签名之前**。未审批的高风险评分不应该拿到 Cobo 签名。
- **Cobo messageSign 之后，proof 已具备上链资格**。因此签名前的风险策略很重要。
- **recordContributionBySig 上链后，资金分配权成立**。后续 `claimFor` 只是机械领取，不再重新决定资金归属。

---

## 3. 审批状态

每条贡献在链下应有一个审批状态：

| 状态 | 含义 | 是否允许 Cobo 签名 | 是否允许上链 |
| --- | --- | --- | --- |
| `auto_allowed` | 低风险贡献，自动通过 | 是 | 是 |
| `pending_review` | 需要人类审批 | 否 | 否 |
| `accepted` | 人类审批通过 | 是 | 是 |
| `rejected` | 人类拒绝 | 否 | 否 |
| `needs_more_evidence` | 需要补充证据 | 否 | 否 |

前端和 Agent 决策流应展示该状态，避免贡献者误以为"提交表单"就等于"已经形成资金分配权"。

---

## 4. MVP 审批规则

黑客松 MVP 先实现四条规则即可：

| 规则 | 建议动作 | 目的 |
| --- | --- | --- |
| 单条 `score >= 80` | `pending_review` | 防止高分直接变成大额分配权 |
| 同一贡献者同一 round 累计 `score >= 120` | `pending_review` | 防止拆分多条中等分数绕过高分审批 |
| 同一贡献者 24 小时内提交次数 `>= 3` | `pending_review` | 防止高频刷分 |
| 证据缺失或证据重复 | `rejected` 或 `needs_more_evidence` | 防止无证据贡献进入分账 |

建议默认阈值：

```text
SCORE_REVIEW_THRESHOLD=80
CONTRIBUTOR_ROUND_SCORE_REVIEW_THRESHOLD=120
CONTRIBUTOR_DAILY_SUBMISSION_REVIEW_THRESHOLD=3
```

这些阈值应配置化，方便不同活动调整。

---

## 5. 后续可增强规则

MVP 之后可以继续加入：

- 单个贡献者预计分走资金池超过 20%：进入人工审批。
- 同一 evidenceUrl 被重复提交：拒绝或合并。
- 贡献发生时间接近截止时间：进入人工审批。
- 新贡献者首次提交高分贡献：进入人工审批。
- Agent 评分理由包含低置信度或无法验证提示：进入人工审批。
- 管理者手动调高分数超过 20 分：进入人工审批。

这些规则不是第一版必须做，但它们能明显增强"AI 评分不可随便刷"的可信度。

---

## 6. Cobo 集成边界

当前项目已支持 `SIGNER_MODE=cobo`。在该模式下，评分 proof 需要由 Cobo Agent Wallet 进行 `messageSign`。

审批策略应这样落地：

```text
低风险贡献：
Agent 评分 -> auto_allowed -> Cobo messageSign -> CAW 上链

高风险贡献：
Agent 评分 -> pending_review -> Cobo App 审批通过 -> Cobo messageSign -> CAW 上链

拒绝 / 补证据：
Agent 评分 -> rejected / needs_more_evidence -> 不请求 Cobo 签名 -> 不上链
```

当前 Sign Pact 能把 `ContributionProof.score` 超阈值的 proof 交给 Cobo App 审批。提交频率、累计分这类跨请求状态不写成 Pact 的 `tx_count`，因为 `tx_count` 会让 Pact 用满后结束，而不是让第 3 次 proof 单独 pending approval；它应由 CGHub Agent 按 24 小时窗口计算，再提交 `ContributionReviewApproval` 给 Cobo App 审批。审批通过后，后端才请求真实 `ContributionProof` 签名并上链。

---

## 7. 实现建议

建议新增一个独立的评分审批模块：

```text
agent/src/contribution-review-policy.ts
```

输入：

```ts
{
  projectId,
  roundId,
  contributor,
  score,
  evidenceUrl,
  occurredAt,
  currentContributorRoundScore,
  contributorSubmissionCount24h
}
```

输出：

```ts
{
  reviewStatus: "auto_allowed" | "pending_review" | "rejected" | "needs_more_evidence",
  reasons: string[],
  triggeredRules: string[]
}
```

上链前必须检查：

```text
reviewStatus in ["auto_allowed", "accepted"]
```

否则不允许调用 Cobo `messageSign`，也不允许调用 `recordContributionBySig`。

---

## 8. 管理者工作台要求

管理者需要能看到：

- 待审批贡献列表。
- Agent 建议分数。
- 触发审批的规则。
- 贡献证据链接。
- 贡献者历史提交次数和累计分数。
- 批准、拒绝、要求补证据三个动作。

管理者批准后，系统才请求 Cobo 签名并上链。

---

## 9. 演示口径

演示时建议准备三条贡献：

1. 低风险贡献：自动通过，Cobo 签名并上链。
2. 高分贡献：触发人工审批，通过后 Cobo 签名并上链。
3. 重复证据贡献：被拒绝或要求补证据，不请求 Cobo 签名，不上链。

这样可以清楚说明：

```text
Cobo 审核的不是普通转账，而是 AI 评分生成的资金分配权。
高分、高频、高占比、低证据质量的评分证明，必须先通过人类审批，才能获得 Cobo 签名并写入链上。
```

---

## 10. 验收标准

第一版实现完成后，应满足：

- `SIGNER_MODE=cobo` 下，只有 `auto_allowed` 或 `accepted` 贡献会请求 Cobo `messageSign`。
- `score >= 80` 的贡献不会自动签名，而是进入 `pending_review`。
- 同一贡献者同一 round 累计分过高会进入 `pending_review`。
- 同一贡献者 24 小时内提交过多会进入 `pending_review`。
- 证据缺失或重复的贡献不会上链。
- 前端能展示审批状态和触发规则。
- Cobo audit、Agent 决策流、链上 `ContributionRecorded` 能对应同一条贡献。
