import { config } from './config.js';
import type { ContributionReviewDecision } from './types.js';

export interface EvaluateContributionReviewInput {
  projectId: string;
  roundId: string;
  contributor: string;
  score: number;
  evidenceUrl?: string;
  evidenceId?: string;
  occurredAt?: string;
  currentContributorRoundScore: number;
  contributorSubmissionCount24h: number;
  evidenceAlreadyUsed: boolean;
  scoreConfidence?: number;
  riskFlags?: string[];
  needsHumanReview?: boolean;
  scoringSource?: 'llm' | 'rule_fallback';
  llmStatus?: string;
  evidenceStatus?: 'verified' | 'partial' | 'unverified' | 'unavailable';
}

export interface ContributionReviewThresholds {
  scoreThreshold: number;
  contributorRoundScoreThreshold: number;
  contributorDailySubmissionThreshold: number;
  lowQualityRejectThreshold: number;
}

export function evaluateContributionReview(
  input: EvaluateContributionReviewInput,
  thresholds: ContributionReviewThresholds = config.review,
): ContributionReviewDecision {
  const evidenceUrl = input.evidenceUrl?.trim();
  const evidenceId = input.evidenceId?.trim();
  if (!evidenceUrl && !evidenceId) {
    return {
      reviewStatus: 'needs_more_evidence',
      reasons: ['缺少贡献证据，不能生成资金分配 proof'],
      triggeredRules: ['missing_evidence'],
    };
  }

  // 低质量直接拒绝：分数极低且证据无法验证，判定为乱写，不浪费人工审批队列。
  // 证据 verified/partial 时即使分低也不在此拒绝（可能是真实但规模小的贡献），交由后续阈值或人工处理。
  const evidenceWeak = input.evidenceStatus === 'unverified' || input.evidenceStatus === 'unavailable';
  if (evidenceWeak && input.score < thresholds.lowQualityRejectThreshold) {
    return {
      reviewStatus: 'rejected',
      reasons: [
        `评分 ${input.score} < ${thresholds.lowQualityRejectThreshold} 且证据${input.evidenceStatus === 'unavailable' ? '不可用' : '未验证'}，判定为低质量贡献`,
      ],
      triggeredRules: ['low_quality_rejected'],
    };
  }

  const reasons: string[] = [];
  const triggeredRules: string[] = [];

  if (input.score > thresholds.scoreThreshold) {
    reasons.push(`单条评分 ${input.score} > ${thresholds.scoreThreshold}`);
    triggeredRules.push('score_threshold');
  }

  if (input.needsHumanReview) {
    reasons.push('LLM 或评分引擎标记需要人工复核');
    triggeredRules.push('llm_needs_human_review');
  }

  if (input.scoreConfidence !== undefined && input.scoreConfidence < 0.65) {
    reasons.push(`评分置信度 ${input.scoreConfidence} < 0.65`);
    triggeredRules.push('low_score_confidence');
  }

  if (input.llmStatus === 'disabled') {
    reasons.push('LLM 评分不可用，使用规则兜底，需要 Cobo 复核');
    triggeredRules.push('llm_unavailable');
  } else if (input.llmStatus === 'skipped') {
    reasons.push('LLM 评分跳过，使用规则兜底，需要 Cobo 复核');
    triggeredRules.push('llm_skipped');
  } else if (input.llmStatus === 'failed') {
    reasons.push('LLM 评分失败，使用规则兜底，需要 Cobo 复核');
    triggeredRules.push('llm_failed');
  } else if (input.llmStatus === 'schema_invalid') {
    reasons.push('LLM 输出 schema_invalid，使用规则兜底，需要 Cobo 复核');
    triggeredRules.push('llm_schema_invalid');
  }

  const riskFlags = new Set(input.riskFlags ?? []);
  if (riskFlags.has('llm_rule_score_divergence')) {
    reasons.push('LLM 与规则评分差异过大');
    triggeredRules.push('llm_rule_score_divergence');
  }
  if (riskFlags.has('evidence_unavailable_high_score')) {
    reasons.push('证据不可用但最终评分较高');
    triggeredRules.push('evidence_unavailable_high_score');
  }
  if (riskFlags.has('evidence_unverified_high_score')) {
    reasons.push('证据未验证但最终评分较高');
    triggeredRules.push('evidence_unverified_high_score');
  }

  if (triggeredRules.length > 0) {
    return {
      reviewStatus: 'pending_cobo_approval',
      reasons: unique(reasons),
      triggeredRules: unique(triggeredRules),
    };
  }

  return {
    reviewStatus: 'auto_allowed',
    reasons: ['低风险贡献，允许 Cobo 签名并由 CAW 上链'],
    triggeredRules: [],
  };
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
