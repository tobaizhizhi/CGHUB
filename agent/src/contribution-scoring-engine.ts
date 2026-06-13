import {
  buildScoreReason,
  scoreContributionByRules,
  type ScoreContributionByRulesInput,
  type ScoreContributionResult,
} from './contribution-scorer.js';
import {
  assessEvidenceWithRubricLlm,
  type AssessEvidenceWithRubricLlmInput,
} from './llm-rubric-scorer.js';
import type { AiScoringTrace, EvidenceSnapshot, ScoreBreakdown } from './types.js';
import { SCORING_RUBRIC_VERSION } from './scoring-rubric.js';

export interface ScoreContributionWithRubricInput extends ScoreContributionByRulesInput {
  evidenceSnapshot: EvidenceSnapshot;
}

export interface ScoreContributionWithRubricDeps {
  ruleScorer?: typeof scoreContributionByRules;
  llmScorer?: typeof assessEvidenceWithRubricLlm;
  now?: () => number;
}

const SCORE_DIVERGENCE_THRESHOLD = 20;
const LOW_CONFIDENCE_THRESHOLD = 0.65;
const HIGH_SCORE_WITH_WEAK_EVIDENCE_THRESHOLD = 60;
const CORE_PATH_RE = /(^|\/)(contract|agent|cobo|frontend(?:-[^/]+)?|test(?:-[^/]+)?|tests|src|tools)(\/|$)/i;

// 证据状态决定最终分数的硬上限：证据越弱，可采信的分数越低。
const EVIDENCE_SCORE_CEILING: Record<EvidenceSnapshot['status'], number> = {
  verified: 100,
  partial: 70,
  unverified: 35,
  unavailable: 15,
};
// 置信度低于 LOW_CONFIDENCE_THRESHOLD 时，分数按比例折扣；置信度为 0 时仍保留的最低比例。
const MIN_CONFIDENCE_FACTOR = 0.6;

export async function scoreContributionWithRubric(
  input: ScoreContributionWithRubricInput,
  deps: ScoreContributionWithRubricDeps = {},
): Promise<ScoreContributionResult> {
  const ruleScorer = deps.ruleScorer ?? scoreContributionByRules;
  const llmScorer = deps.llmScorer ?? assessEvidenceWithRubricLlm;
  const ruleFallback = ruleScorer(input);
  const aiScoring = await safeAssessWithLlm(llmScorer, llmInput(input, ruleFallback.breakdown), deps.now);
  const finalBreakdown = composeFinalBreakdown({
    ruleFallback: ruleFallback.breakdown,
    aiScoring,
    evidenceSnapshot: input.evidenceSnapshot,
  });
  const reason = finalBreakdown.source === 'llm'
    ? buildLlmReason(finalBreakdown, aiScoring)
    : buildFallbackReason(finalBreakdown, aiScoring);

  return {
    score: finalBreakdown.score,
    reason,
    breakdown: finalBreakdown,
    aiScoring,
  };
}

function llmInput(
  input: ScoreContributionWithRubricInput,
  ruleBreakdown: ScoreBreakdown,
): AssessEvidenceWithRubricLlmInput {
  return {
    submission: {
      title: input.title,
      description: input.description,
      contributionType: input.contributionType,
      impactScale: input.impactScale ?? input.amount,
      occurredAt: input.occurredAt,
    },
    evidenceSnapshot: input.evidenceSnapshot,
    ruleBreakdown,
  };
}

async function safeAssessWithLlm(
  llmScorer: typeof assessEvidenceWithRubricLlm,
  input: AssessEvidenceWithRubricLlmInput,
  now: (() => number) | undefined,
): Promise<AiScoringTrace> {
  try {
    return await llmScorer(input, now ? { now } : undefined);
  } catch (error: any) {
    return {
      enabled: true,
      status: 'failed',
      error: error?.message ? String(error.message).slice(0, 180) : String(error).slice(0, 180),
      createdAt: now?.() ?? Date.now(),
    };
  }
}

function composeFinalBreakdown(input: {
  ruleFallback: ScoreBreakdown;
  aiScoring: AiScoringTrace;
  evidenceSnapshot: EvidenceSnapshot;
}): ScoreBreakdown {
  const fallbackScore = input.ruleFallback.score;
  const llmScore = input.aiScoring.score ?? input.aiScoring.suggestedScore;
  const useLlm = input.aiScoring.status === 'success' &&
    Number.isFinite(llmScore) &&
    Number.isFinite(input.aiScoring.confidence) &&
    Array.isArray(input.aiScoring.dimensions) &&
    input.aiScoring.dimensions.length > 0;

  const baseBreakdown: ScoreBreakdown = useLlm
    ? {
        score: clampScore(llmScore!),
        confidence: clampConfidence(input.aiScoring.confidence!),
        dimensions: input.aiScoring.dimensions!,
        reasons: input.aiScoring.dimensions!.map((dimension) => `${dimension.label}: ${dimension.reason}`),
        riskFlags: unique([
          ...input.ruleFallback.riskFlags,
          ...(input.aiScoring.riskFlags ?? []),
        ]),
        rubricVersion: SCORING_RUBRIC_VERSION,
        source: 'llm',
        fallbackScore,
      }
    : {
        ...input.ruleFallback,
        score: fallbackScore,
        confidence: input.ruleFallback.confidence,
        dimensions: input.ruleFallback.dimensions,
        reasons: [...input.ruleFallback.reasons],
        riskFlags: unique([
          ...input.ruleFallback.riskFlags,
          riskFlagForLlmStatus(input.aiScoring.status),
        ]),
        rubricVersion: input.ruleFallback.rubricVersion ?? SCORING_RUBRIC_VERSION,
        source: 'rule_fallback',
        fallbackScore,
      };

  const evidenceCalibratedScore = applyEvidenceScoreGuard(
    baseBreakdown.score,
    fallbackScore,
    input.evidenceSnapshot,
  );
  const sanityFlags = collectSanityFlags({
    score: evidenceCalibratedScore,
    confidence: baseBreakdown.confidence,
    fallbackScore,
    aiScoring: input.aiScoring,
    evidenceSnapshot: input.evidenceSnapshot,
  });
  const riskFlags = unique([
    ...baseBreakdown.riskFlags,
    ...sanityFlags,
  ]);
  const needsHumanReview = Boolean(input.aiScoring.needsHumanReview) || sanityFlags.length > 0;

  // 用证据状态封顶 + 置信度折扣压低"自述类"维度撑起来的虚高分。
  // 注意：sanityFlags 基于调整前的原始分判断，确保弱证据高分该触发的人工复核不会被压分掩盖。
  const adjustedScore = applyConfidenceCeiling(
    evidenceCalibratedScore,
    baseBreakdown.confidence,
    input.evidenceSnapshot.status,
  );
  const scaledDimensions = adjustedScore === baseBreakdown.score
    ? baseBreakdown.dimensions
    : scaleDimensionsToScore(baseBreakdown.dimensions, baseBreakdown.score, adjustedScore);

  return {
    ...baseBreakdown,
    score: adjustedScore,
    dimensions: scaledDimensions,
    reasons: scaledDimensions.map((dimension) => `${dimension.label}: ${dimension.reason}`),
    riskFlags,
    sanityFlags,
    needsHumanReview,
  };
}

function applyConfidenceCeiling(
  score: number,
  confidence: number,
  evidenceStatus: EvidenceSnapshot['status'],
): number {
  const ceiling = EVIDENCE_SCORE_CEILING[evidenceStatus] ?? 100;
  // 置信度 >= 阈值不折扣；低于阈值时在 [MIN_CONFIDENCE_FACTOR, 1] 之间线性折扣。
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const factor = safeConfidence >= LOW_CONFIDENCE_THRESHOLD
    ? 1
    : MIN_CONFIDENCE_FACTOR + (1 - MIN_CONFIDENCE_FACTOR) * (safeConfidence / LOW_CONFIDENCE_THRESHOLD);
  return clampScore(Math.min(ceiling, score * factor));
}

function applyEvidenceScoreGuard(
  score: number,
  fallbackScore: number,
  evidenceSnapshot: EvidenceSnapshot,
): number {
  if (isPlaceholderOnlyCommit(evidenceSnapshot)) {
    return Math.min(24, Math.max(18, Math.min(score, fallbackScore)));
  }
  if (isSubstantialCoreCommit(evidenceSnapshot) && fallbackScore >= 80 && score < 80) {
    return Math.min(88, fallbackScore);
  }
  return score;
}

function scaleDimensionsToScore(
  dimensions: ScoreBreakdown['dimensions'],
  fromScore: number,
  toScore: number,
): ScoreBreakdown['dimensions'] {
  if (fromScore <= 0) return dimensions;
  const ratio = toScore / fromScore;
  return dimensions.map((dimension) => ({
    ...dimension,
    points: Math.max(0, Math.min(dimension.maxPoints, Math.round(dimension.points * ratio))),
  }));
}

function collectSanityFlags(input: {
  score: number;
  confidence: number;
  fallbackScore: number;
  aiScoring: AiScoringTrace;
  evidenceSnapshot: EvidenceSnapshot;
}): string[] {
  const flags: string[] = [];
  if (input.aiScoring.status === 'success' && Math.abs(input.score - input.fallbackScore) >= SCORE_DIVERGENCE_THRESHOLD) {
    flags.push('llm_rule_score_divergence');
  }
  if (input.confidence < LOW_CONFIDENCE_THRESHOLD) {
    flags.push('low_score_confidence');
  }
  if (input.evidenceSnapshot.status === 'unavailable' && input.score >= HIGH_SCORE_WITH_WEAK_EVIDENCE_THRESHOLD) {
    flags.push('evidence_unavailable_high_score');
  }
  if (input.evidenceSnapshot.status === 'unverified' && input.score >= HIGH_SCORE_WITH_WEAK_EVIDENCE_THRESHOLD) {
    flags.push('evidence_unverified_high_score');
  }
  if (input.aiScoring.needsHumanReview) {
    flags.push('llm_needs_human_review');
  }
  if (input.aiScoring.status !== 'success') {
    flags.push(riskFlagForLlmStatus(input.aiScoring.status));
  }
  return unique(flags);
}

function riskFlagForLlmStatus(status: AiScoringTrace['status']): string {
  if (status === 'disabled') return 'llm_unavailable';
  if (status === 'skipped') return 'llm_skipped';
  if (status === 'schema_invalid') return 'llm_schema_invalid';
  if (status === 'failed') return 'llm_failed';
  return '';
}

function buildLlmReason(breakdown: ScoreBreakdown, aiScoring: AiScoringTrace): string {
  const summary = aiScoring.summary ? `${aiScoring.summary}；` : '';
  const core = buildScoreReason(breakdown, 'LLM 按 rubric 评分');
  return `${summary}${core}`;
}

function buildFallbackReason(breakdown: ScoreBreakdown, aiScoring: AiScoringTrace): string {
  const status = aiScoring.status === 'success' ? '' : `；AI ${aiScoring.status}，使用规则兜底`;
  return `${buildScoreReason(breakdown, '规则兜底评分')}${status}`;
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function isPlaceholderOnlyCommit(snapshot: EvidenceSnapshot): boolean {
  const files = snapshot.github?.files ?? [];
  return snapshot.type === 'github_commit' &&
    snapshot.status === 'verified' &&
    files.length > 0 &&
    changedLinesCount(snapshot) === 0 &&
    files.every((file) => /(^|\/)\.gitkeep$/i.test(file) || /(^|\/)\.keep$/i.test(file));
}

function isSubstantialCoreCommit(snapshot: EvidenceSnapshot): boolean {
  const files = snapshot.github?.files ?? [];
  return snapshot.type === 'github_commit' &&
    snapshot.status === 'verified' &&
    coreEvidenceFiles(snapshot).length >= 4 &&
    (changedFilesCount(snapshot) >= 8 || changedLinesCount(snapshot) >= 350);
}

function changedFilesCount(snapshot: EvidenceSnapshot): number {
  return snapshot.github?.changedFiles ?? snapshot.github?.files?.length ?? 0;
}

function changedLinesCount(snapshot: EvidenceSnapshot): number {
  return (snapshot.github?.additions ?? 0) + (snapshot.github?.deletions ?? 0);
}

function coreEvidenceFiles(snapshot: EvidenceSnapshot): string[] {
  return (snapshot.github?.files ?? []).filter((file) => CORE_PATH_RE.test(file));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
