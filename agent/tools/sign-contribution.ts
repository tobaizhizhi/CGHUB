/**
 * MCP 工具：sign-contribution
 * Agent 评分后先过 review 策略；通过后由 Cobo 签 proof，并由 CAW Main Pact 上链。
 */

import { z } from 'zod';
import { appendDecision } from '../src/decision-log.js';
import { newPaymentId } from '../src/utils.js';
import { evaluateContributionReview } from '../src/contribution-review-policy.js';
import { contributionReviewStore } from '../src/contribution-review-store.js';
import {
  requestCoboApprovalForContributionReview,
  signAndRecordContributionReview,
} from '../src/contribution-review-executor.js';
import { resolveEvidenceSnapshot } from '../src/evidence-resolver.js';
import { scoreContributionWithRubric } from '../src/contribution-scoring-engine.js';

const runtimeInputSchema = z.object({
  projectId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  roundId: z.union([z.string(), z.number(), z.bigint()]).optional(),
  contributor: z.string(),
  title: z.string().optional(),
  amount: z.string().optional(),
  description: z.string().optional(),
  contributionType: z.string().optional(),
  evidenceUrl: z.string().optional(),
  impactScale: z.string().optional(),
  occurredAt: z.string().optional(),
  source: z.string(),
  evidenceId: z.string(),
  paymentId: z.string().optional(),
}).passthrough();

export const signContributionTool = {
  name: 'sign-contribution',
  description: 'Agent 评分并执行 Cobo 审批闸门；通过后 Cobo 签 proof 并由 CAW 上链',
  inputSchema: {
    contributor: z.string().describe('贡献者收款地址'),
    title: z.string().describe('贡献标题'),
    contributionType: z.string().optional().describe('贡献类型，如代码开发/宣传传播/活动组织'),
    amount: z.string().optional().describe('工作量 / 价值提示，不直接等于分账金额'),
    impactScale: z.string().optional().describe('成果规模，如 1 个 PR、3 篇文章、组织 1 场活动'),
    evidenceUrl: z.string().optional().describe('证据链接，如 PR、文章、视频或活动记录'),
    occurredAt: z.string().optional().describe('贡献发生时间'),
    description: z.string().describe('贡献说明'),
    source: z.string().describe('贡献来源，如 frontend/github'),
    evidenceId: z.string().describe('证据 id，如 frontend-1710000000000 或 pr-123'),
    paymentId: z.string().optional().describe('业务支付 id；不传则自动生成'),
  },
  async handler(args: unknown) {
    const parsed = runtimeInputSchema.parse(args);
    if (parsed.projectId === undefined || parsed.roundId === undefined) {
      throw new Error('缺 projectId / roundId 参数');
    }
    const scoringInput = {
      title: parsed.title?.trim() || parsed.evidenceId,
      amount: parsed.amount ?? parsed.impactScale,
      description: parsed.description?.trim() || parsed.source,
      contributionType: parsed.contributionType,
      evidenceUrl: parsed.evidenceUrl,
      impactScale: parsed.impactScale,
      occurredAt: parsed.occurredAt,
    };
    const decisionScope =
      parsed.projectId !== undefined && parsed.roundId !== undefined
        ? { projectId: String(parsed.projectId), roundId: String(parsed.roundId) }
        : {};

    appendDecision({
      stage: 'received',
      ...decisionScope,
      contributor: parsed.contributor,
      result: 'pending',
      reason: scoringInput.title,
    });

    const evidenceSnapshot = await resolveEvidenceSnapshot({
      evidenceUrl: parsed.evidenceUrl,
      evidenceId: parsed.evidenceId,
      title: scoringInput.title,
      description: scoringInput.description,
      occurredAt: parsed.occurredAt,
    });
    const scored = await scoreContributionWithRubric({
      ...scoringInput,
      evidenceSnapshot,
    });
    const paymentId = parsed.paymentId ?? newPaymentId();

    appendDecision({
      stage: 'score',
      ...decisionScope,
      contributor: parsed.contributor,
      result: 'allowed',
      score: scored.score,
      reason: scored.reason,
    });

    const stats = contributionReviewStore.statsForContributor({
      projectId: String(parsed.projectId),
      roundId: String(parsed.roundId),
      contributor: parsed.contributor,
    });
    const decision = evaluateContributionReview({
      projectId: String(parsed.projectId),
      roundId: String(parsed.roundId),
      contributor: parsed.contributor,
      score: scored.score,
      evidenceUrl: parsed.evidenceUrl,
      evidenceId: parsed.evidenceId,
      occurredAt: parsed.occurredAt,
      currentContributorRoundScore: stats.currentContributorRoundScore,
      contributorSubmissionCount24h: stats.contributorSubmissionCount24h + 1,
      evidenceAlreadyUsed: contributionReviewStore.evidenceAlreadyUsed(parsed.evidenceUrl || parsed.evidenceId),
      scoreConfidence: scored.breakdown.confidence,
      riskFlags: scored.breakdown.riskFlags,
      needsHumanReview: scored.breakdown.needsHumanReview,
      scoringSource: scored.breakdown.source,
      llmStatus: scored.aiScoring?.status,
      evidenceStatus: evidenceSnapshot.status,
    });
    const review = contributionReviewStore.create({
      projectId: String(parsed.projectId),
      roundId: String(parsed.roundId),
      contributor: parsed.contributor,
      title: scoringInput.title,
      description: scoringInput.description,
      contributionType: parsed.contributionType,
      evidenceUrl: parsed.evidenceUrl,
      impactScale: parsed.impactScale,
      occurredAt: parsed.occurredAt,
      source: parsed.source,
      evidenceId: parsed.evidenceId,
      paymentId,
      score: scored.score,
      scoreReason: scored.reason,
      evidenceSnapshot,
      scoreBreakdown: scored.breakdown,
      aiScoring: scored.aiScoring,
      status: decision.reviewStatus,
      reasons: decision.reasons,
      triggeredRules: decision.triggeredRules,
    });

    appendDecision({
      stage: 'review',
      ...decisionScope,
      contributor: parsed.contributor,
      result: decision.reviewStatus === 'auto_allowed'
        ? 'allowed'
        : decision.reviewStatus === 'rejected'
          ? 'denied'
          : 'pending',
      score: scored.score,
      reason: decision.reasons.join('；'),
      reviewStatus: decision.reviewStatus,
      triggeredRules: decision.triggeredRules,
      reviewId: review.id,
    });

    if (decision.reviewStatus === 'pending_cobo_approval') {
      const cobo = await requestCoboApprovalForContributionReview(review);
      appendDecision({
        stage: 'cobo_approval',
        ...decisionScope,
        contributor: parsed.contributor,
        result: cobo.coboRejected ? 'denied' : cobo.coboPending ? 'pending' : 'allowed',
        score: scored.score,
        reason: cobo.coboRejected
          ? 'Cobo App 拒绝评分 proof'
          : cobo.coboPending
            ? '高风险评分 proof 已提交 Cobo App 审批'
            : 'Cobo App 已返回评分 proof 签名',
        reviewStatus: cobo.review.status,
        triggeredRules: decision.triggeredRules,
        reviewId: review.id,
      });

      if (cobo.txHash) {
        if (cobo.review.signerAddress) {
          appendDecision({
            stage: 'signed',
            ...decisionScope,
            contributor: parsed.contributor,
            result: 'allowed',
            reason: 'Cobo App 审批后 EIP-712 签名完成',
            signerAddress: cobo.review.signerAddress,
            reviewStatus: cobo.review.status,
            reviewId: review.id,
          });
        }
        appendDecision({
          stage: 'recorded',
          ...decisionScope,
          contributor: parsed.contributor,
          result: 'allowed',
          reason: 'Cobo 审批通过后 CAW Main Pact 已写入 recordContributionBySig',
          txHash: cobo.txHash,
          reviewStatus: cobo.review.status,
          reviewId: review.id,
        });
      }

      return {
        reviewStatus: cobo.review.status,
        reviewId: review.id,
        recorded: Boolean(cobo.txHash),
        recordTxId: cobo.recordTxId,
        txHash: cobo.txHash,
        score: scored.score,
        reason: scored.reason,
        reasons: decision.reasons,
        triggeredRules: decision.triggeredRules,
        coboSignTxId: cobo.review.coboSignTxId,
        coboApprovalId: cobo.review.coboApprovalId,
        coboApprovalKind: cobo.review.coboApprovalKind,
        coboStatusDisplay: cobo.review.coboStatusDisplay,
        signerMode: cobo.review.signerMode,
        signerAddress: cobo.review.signerAddress,
        evidenceSnapshot: cobo.review.evidenceSnapshot,
        scoreBreakdown: cobo.review.scoreBreakdown,
        aiScoring: cobo.review.aiScoring,
      };
    }

    if (decision.reviewStatus !== 'auto_allowed') {
      return {
        reviewStatus: decision.reviewStatus,
        reviewId: review.id,
        score: scored.score,
        reason: scored.reason,
        reasons: decision.reasons,
        triggeredRules: decision.triggeredRules,
        evidenceSnapshot: review.evidenceSnapshot,
        scoreBreakdown: review.scoreBreakdown,
        aiScoring: review.aiScoring,
      };
    }

    recordAutoAllowedContributionInBackground({
      review,
      decisionScope,
      contributor: parsed.contributor,
    });

    return {
      reviewStatus: 'auto_allowed',
      reviewId: review.id,
      recorded: false,
      score: scored.score,
      reason: scored.reason,
      reasons: decision.reasons,
      triggeredRules: decision.triggeredRules,
      evidenceSnapshot: review.evidenceSnapshot,
      scoreBreakdown: review.scoreBreakdown,
      aiScoring: review.aiScoring,
    };
  },
};

function recordAutoAllowedContributionInBackground(input: {
  review: Parameters<typeof signAndRecordContributionReview>[0];
  decisionScope: { projectId: string; roundId: string };
  contributor: string;
}) {
  void signAndRecordContributionReview(input.review)
    .then((recorded) => {
      const signerLabel = recorded.review.signerMode === 'cobo' ? 'Cobo' : '本地';
      appendDecision({
        stage: 'signed',
        ...input.decisionScope,
        contributor: input.contributor,
        result: 'allowed',
        reason: `${signerLabel} EIP-712 签名完成`,
        signerAddress: recorded.review.signerAddress,
        reviewStatus: 'auto_allowed',
        reviewId: input.review.id,
      });
      appendDecision({
        stage: 'recorded',
        ...input.decisionScope,
        contributor: input.contributor,
        result: 'allowed',
        reason: 'CAW Main Pact 已写入 recordContributionBySig',
        txHash: recorded.txHash,
        reviewStatus: 'auto_allowed',
        reviewId: input.review.id,
      });
    })
    .catch((error: any) => {
      appendDecision({
        stage: 'recorded',
        ...input.decisionScope,
        contributor: input.contributor,
        result: 'error',
        reason: error?.message ? String(error.message).slice(0, 180) : String(error).slice(0, 180),
        reviewStatus: 'auto_allowed',
        reviewId: input.review.id,
      });
    });
}
