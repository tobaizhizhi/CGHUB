import type {
  AiScoringTrace,
  EvidenceSnapshot,
  ScoreBreakdown,
  ScoreDimension,
} from './types.js';
import {
  SCORING_RUBRIC_VERSION,
  labelForDimension,
  maxPointsForDimension,
} from './scoring-rubric.js';

export interface ScoreContributionByRulesInput {
  title: string;
  amount?: string;
  description: string;
  contributionType?: string;
  evidenceUrl?: string;
  impactScale?: string;
  occurredAt?: string;
  evidenceSnapshot?: EvidenceSnapshot;
}

export type ScoreContributionInput = ScoreContributionByRulesInput & {
  aiScoring?: AiScoringTrace;
};

export interface ScoreContributionResult {
  score: number;
  reason: string;
  breakdown: ScoreBreakdown;
  aiScoring?: AiScoringTrace;
}

type OutputTier = 'junk' | 'placeholder' | 'minor' | 'useful' | 'core';
type ClaimMatch = 'matched' | 'slightly_overclaimed' | 'overclaimed' | 'unsupported';

interface ScoreCalibration {
  tier: OutputTier;
  claimMatch: ClaimMatch;
  evidenceFactor: number;
  outputFactor: number;
  claimFactor: number;
  ceiling: number;
  flags: string[];
}

const CORE_PATH_RE = /(^|\/)(contract|agent|cobo|frontend(?:-[^/]+)?|test(?:-[^/]+)?|tests|src|tools)(\/|$)/i;
const CORE_TEXT_RE = /contract|合约|frontend|前端|agent|cobo|test|测试|pact|审批|上链|钱包/i;
const HIGH_VALUE_RE = /deploy|部署|audit|审计|guard|护栏|security|安全|settlement|清算|registry|持久化|评分|结算|分账|贡献池|资金池|闭环|dashboard/i;
const PLACEHOLDER_FILE_RE = /(^|\/)(\.gitkeep|\.keep)$/i;
const TRIVIAL_TEXT_RE = /typo|错别字|格式|format|lint|空目录|占位|placeholder|gitkeep|\.gitkeep/i;

const OUTPUT_FACTORS: Record<OutputTier, number> = {
  junk: 0.1,
  placeholder: 0.3,
  minor: 0.5,
  useful: 0.8,
  core: 1,
};

const TIER_CEILINGS: Record<OutputTier, number> = {
  junk: 10,
  placeholder: 25,
  minor: 45,
  useful: 75,
  core: 100,
};

const CLAIM_FACTORS: Record<ClaimMatch, number> = {
  matched: 1,
  slightly_overclaimed: 0.8,
  overclaimed: 0.45,
  unsupported: 0.25,
};

export function scoreContributionByRules(input: ScoreContributionByRulesInput): ScoreContributionResult {
  const calibration = scoreCalibration(input);
  const baseDimensions = [
    scoreVerifiableOutput(input, calibration),
    scoreProjectImpact(input, calibration),
    scoreProjectRelevance(input, calibration),
    scoreCompletionQuality(input, calibration),
    scoreClaimMatch(input, calibration),
    scoreTimeReasonableness(input),
  ];
  const baseScore = clampScore(baseDimensions.reduce((sum, item) => sum + item.points, 0));
  const multipliedScore = baseScore * calibration.evidenceFactor * calibration.outputFactor * calibration.claimFactor;
  const finalScore = clampScore(Math.min(calibration.ceiling, Math.max(scoreFloor(calibration), multipliedScore)));
  const dimensions = finalScore === baseScore
    ? baseDimensions
    : scaleDimensionsToScore(baseDimensions, baseScore, finalScore);
  const riskFlags = unique([
    ...collectRiskFlags(input),
    ...calibration.flags,
  ]);
  const ruleBreakdown: ScoreBreakdown = {
    score: finalScore,
    confidence: scoreConfidence(input.evidenceSnapshot, dimensions, calibration),
    dimensions,
    reasons: [
      ...dimensions.map((dimension) => `${dimension.label}: ${dimension.reason}`),
      factorReason(calibration),
    ],
    riskFlags,
    rubricVersion: SCORING_RUBRIC_VERSION,
    source: 'rule_fallback',
    fallbackScore: finalScore,
  };
  const reason = buildReason(ruleBreakdown, '规则兜底评分');
  return {
    score: ruleBreakdown.score,
    reason,
    breakdown: ruleBreakdown,
  };
}

export const scoreContribution = scoreContributionByRules;

function scoreVerifiableOutput(
  input: ScoreContributionByRulesInput,
  calibration: ScoreCalibration,
): ScoreDimension {
  const snapshot = input.evidenceSnapshot;
  const files = changedFilesCount(snapshot);
  const lines = changedLinesCount(snapshot);
  const evidenceRefs = snapshot?.github ? ['github.files', 'github.additions', 'github.deletions'] : ['submission.description'];

  if (calibration.tier === 'junk') {
    return dimension('verifiable_output', 1, '没有可验证产出或证据不可用', evidenceRefs);
  }
  if (calibration.tier === 'placeholder') {
    return dimension('verifiable_output', 6, '证据仅包含空目录占位文件，没有代码 / 文档行变更', ['github.files']);
  }
  if (calibration.tier === 'minor') {
    return dimension('verifiable_output', 12, `可验证产出较轻，涉及 ${files || '少量'} 个文件 / ${lines} 行变更`, evidenceRefs);
  }
  if (calibration.tier === 'core') {
    return dimension('verifiable_output', 26, `核心产出明确，涉及 ${files || '多'} 个文件 / ${lines} 行变更`, evidenceRefs);
  }
  return dimension('verifiable_output', 22, `有明确可验证产出，涉及 ${files || '若干'} 个文件 / ${lines} 行变更`, evidenceRefs);
}

function scoreProjectImpact(
  input: ScoreContributionByRulesInput,
  calibration: ScoreCalibration,
): ScoreDimension {
  const snapshot = input.evidenceSnapshot;
  const files = changedFilesCount(snapshot);
  const lines = changedLinesCount(snapshot);
  const text = contributionText(input);

  if (calibration.tier === 'junk') {
    return dimension('project_impact', 0, '未体现对项目流程或用户结果的影响', []);
  }
  if (calibration.tier === 'placeholder') {
    return dimension('project_impact', 3, '保留目录结构有维护意义，但不产生直接功能影响', ['github.files']);
  }
  if (calibration.tier === 'core') {
    return dimension('project_impact', 22, '连接核心流程，对 Agent 评分、Cobo 审批或结算展示有直接影响', ['submission.description', 'github.files']);
  }
  if (files >= 4 || lines >= 150 || HIGH_VALUE_RE.test(text)) {
    return dimension('project_impact', 18, '对项目流程或用户界面有中等影响', ['github.changedFiles', 'submission.impactScale']);
  }
  return dimension('project_impact', 10, '影响范围较小，主要是局部维护或补充', ['submission.impactScale']);
}

function scoreProjectRelevance(
  input: ScoreContributionByRulesInput,
  calibration: ScoreCalibration,
): ScoreDimension {
  const files = input.evidenceSnapshot?.github?.files ?? [];
  const text = contributionText(input);
  const coreFiles = coreEvidenceFiles(input.evidenceSnapshot);

  if (calibration.tier === 'junk') {
    return dimension('project_relevance', 1, '证据与当前项目目标关联较弱', []);
  }
  if (calibration.tier === 'placeholder') {
    return dimension('project_relevance', 5, '目录结构与项目维护相关，但未触及核心实现', ['github.files']);
  }
  if (coreFiles.length > 0) {
    const points = calibration.tier === 'core' ? 14 : 12;
    return dimension('project_relevance', points, `命中项目路径：${coreFiles.slice(0, 3).join(', ')}`, ['github.files']);
  }
  if (CORE_TEXT_RE.test(text)) {
    return dimension('project_relevance', 10, '文本说明命中项目模块', ['submission.description']);
  }
  if (input.evidenceSnapshot?.sourceHost === 'github.com' || files.length > 0) {
    return dimension('project_relevance', 7, 'GitHub 证据与工程贡献相关', ['evidence.sourceHost']);
  }
  return dimension('project_relevance', 4, '项目相关性较弱', []);
}

function scoreCompletionQuality(
  input: ScoreContributionByRulesInput,
  calibration: ScoreCalibration,
): ScoreDimension {
  const snapshot = input.evidenceSnapshot;

  if (calibration.tier === 'junk') {
    return dimension('completion_quality', 0, '没有形成可用结果', []);
  }
  if (calibration.tier === 'placeholder') {
    return dimension('completion_quality', 5, '占位结构已提交，但不是可运行功能或可用材料', ['github.files']);
  }
  if (snapshot?.type === 'github_pull_request' && snapshot.github?.merged) {
    return dimension('completion_quality', calibration.tier === 'core' ? 15 : 13, 'PR 已 merged，完成质量较明确', ['github.merged']);
  }
  if (snapshot?.type === 'github_commit' && snapshot.status === 'verified') {
    return dimension('completion_quality', calibration.tier === 'core' ? 12 : 11, 'commit 已验证，产出状态明确', ['github.sha']);
  }
  if (snapshot?.type === 'github_issue' && snapshot.status === 'verified') {
    return dimension('completion_quality', snapshot.github?.state === 'closed' ? 10 : 6, snapshot.github?.state === 'closed' ? 'issue 已关闭' : 'issue 尚未关闭', ['github.state']);
  }
  if (snapshot?.status === 'partial') {
    return dimension('completion_quality', 7, '证据部分可验证，完成质量需保守判断', ['evidence.summary']);
  }
  return dimension('completion_quality', 4, '完成质量不明确', []);
}

function scoreClaimMatch(
  input: ScoreContributionByRulesInput,
  calibration: ScoreCalibration,
): ScoreDimension {
  const refs = ['submission.description', 'submission.impactScale', 'github.files'];
  if (calibration.claimMatch === 'matched') {
    const points = calibration.tier === 'placeholder' ? 8 : 10;
    return dimension('claim_match', points, '提交说明与证据基本匹配', refs);
  }
  if (calibration.claimMatch === 'slightly_overclaimed') {
    return dimension('claim_match', 7, '提交说明略高于证据能证明的范围', refs);
  }
  if (calibration.claimMatch === 'overclaimed') {
    return dimension('claim_match', 3, '提交说明明显夸大了证据中的实际产出', refs);
  }
  return dimension('claim_match', 1, '证据无法支撑提交说明', refs);
}

function scoreTimeReasonableness(input: ScoreContributionByRulesInput): ScoreDimension {
  const occurred = parseDate(input.occurredAt);
  const evidenceDate = parseDate(
    input.evidenceSnapshot?.github?.mergedAt ||
      input.evidenceSnapshot?.github?.updatedAt ||
      input.evidenceSnapshot?.github?.createdAt,
  );

  if (occurred && evidenceDate) {
    const days = Math.abs(occurred - evidenceDate) / (24 * 60 * 60 * 1000);
    if (days <= 30) return dimension('time_reasonableness', 5, '发生时间与证据时间一致', ['submission.occurredAt', 'github.updatedAt']);
    return dimension('time_reasonableness', 2, '发生时间与证据时间相差较大', ['submission.occurredAt', 'github.updatedAt']);
  }

  if (occurred) return dimension('time_reasonableness', 3, '提供了贡献发生时间', ['submission.occurredAt']);
  if (evidenceDate) return dimension('time_reasonableness', 2, '证据包含时间信息', ['github.updatedAt']);
  return dimension('time_reasonableness', 0, '缺少时间信息', []);
}

export function buildScoreReason(breakdown: ScoreBreakdown, prefix: string): string {
  return buildReason(breakdown, prefix);
}

function buildReason(breakdown: ScoreBreakdown, prefix: string): string {
  const important = (breakdown.score < 30
    ? breakdown.dimensions.filter((dimension) =>
        dimension.key === 'verifiable_output' ||
        dimension.key === 'project_impact' ||
        dimension.key === 'completion_quality' ||
        dimension.key === 'claim_match')
    : breakdown.dimensions.filter((dimension) => dimension.points >= Math.ceil(dimension.maxPoints * 0.6)))
    .slice(0, 4)
    .map((dimension) => dimension.reason);
  const base = important.length ? important.join('；') : '证据和产出信号较弱';
  const confidence = Number.isFinite(breakdown.confidence) ? `；置信度 ${breakdown.confidence}` : '';
  return `${prefix}：${base}${confidence} -> ${breakdown.score} 分`;
}

function scoreCalibration(input: ScoreContributionByRulesInput): ScoreCalibration {
  const tier = outputTier(input);
  const claimMatch = claimMatchLevel(input, tier);
  return {
    tier,
    claimMatch,
    evidenceFactor: evidenceFactor(input.evidenceSnapshot),
    outputFactor: OUTPUT_FACTORS[tier],
    claimFactor: CLAIM_FACTORS[claimMatch],
    ceiling: TIER_CEILINGS[tier],
    flags: unique([
      tier === 'junk' ? 'junk_output' : '',
      tier === 'placeholder' ? 'placeholder_output' : '',
      claimMatch === 'overclaimed' || claimMatch === 'unsupported' ? 'claim_evidence_mismatch' : '',
      claimMatch === 'slightly_overclaimed' ? 'claim_slightly_overstated' : '',
    ]),
  };
}

function outputTier(input: ScoreContributionByRulesInput): OutputTier {
  const snapshot = input.evidenceSnapshot;
  if (!snapshot || snapshot.status === 'unavailable') return 'junk';
  if (isPlaceholderOnlyEvidence(input)) return 'placeholder';

  const files = changedFilesCount(snapshot);
  const lines = changedLinesCount(snapshot);
  const coreFiles = coreEvidenceFiles(snapshot);
  const text = contributionText(input);

  if (snapshot.status === 'unverified' && files === 0 && lines === 0) return 'junk';
  if (snapshot.type === 'github_repo') return 'minor';
  if (files <= 1 && lines <= 10 && TRIVIAL_TEXT_RE.test(text)) return 'minor';
  if (coreFiles.length >= 4 && (files >= 8 || lines >= 350) && HIGH_VALUE_RE.test(text)) return 'core';
  if ((files >= 8 || lines >= 350) && (coreFiles.length > 0 || HIGH_VALUE_RE.test(text))) return 'core';
  if (files >= 4 || lines >= 150 || snapshot.type === 'github_pull_request') return 'useful';
  if (files > 0 || lines > 0 || snapshot.status === 'partial') return 'minor';
  return 'junk';
}

function claimMatchLevel(input: ScoreContributionByRulesInput, tier: OutputTier): ClaimMatch {
  const text = contributionText(input);
  if (input.evidenceSnapshot?.status === 'unavailable' || input.evidenceSnapshot?.status === 'unverified') {
    return HIGH_VALUE_RE.test(text) ? 'unsupported' : 'slightly_overclaimed';
  }
  if ((tier === 'placeholder' || tier === 'minor') && HIGH_VALUE_RE.test(text)) return 'overclaimed';
  if (tier === 'placeholder') return 'matched';

  const declaredScale = declaredImpactScore(`${input.amount ?? ''} ${input.impactScale ?? ''}`);
  const lines = changedLinesCount(input.evidenceSnapshot);
  const files = changedFilesCount(input.evidenceSnapshot);
  if (declaredScale >= 15 && files <= 1 && lines <= 10) return 'overclaimed';
  if (declaredScale >= 15 && tier === 'minor') return 'slightly_overclaimed';
  return 'matched';
}

function evidenceFactor(snapshot: EvidenceSnapshot | undefined): number {
  if (!snapshot) return 0.25;
  if (snapshot.status === 'verified') return 1;
  if (snapshot.status === 'partial') return 0.8;
  if (snapshot.status === 'unverified') return 0.45;
  return 0.25;
}

function factorReason(calibration: ScoreCalibration): string {
  return [
    `产出等级=${calibration.tier}`,
    `证据系数=${calibration.evidenceFactor}`,
    `产出系数=${calibration.outputFactor}`,
    `匹配系数=${calibration.claimFactor}`,
    `封顶=${calibration.ceiling}`,
  ].join('；');
}

function scoreFloor(calibration: ScoreCalibration): number {
  if (calibration.tier === 'placeholder' && calibration.evidenceFactor === 1 && calibration.claimMatch === 'matched') {
    return 20;
  }
  return 0;
}

function collectRiskFlags(input: ScoreContributionByRulesInput): string[] {
  const flags: string[] = [];
  const snapshot = input.evidenceSnapshot;
  if (snapshot?.status === 'unavailable') flags.push('evidence_unavailable');
  if (snapshot?.status === 'unverified') flags.push('evidence_unverified');
  if (snapshot?.type === 'github_pull_request' && snapshot.github?.merged === false) flags.push('pr_not_merged');
  if ((snapshot?.confidence ?? 1) < 0.4) flags.push('low_evidence_confidence');
  if (!input.description.trim()) flags.push('missing_description');
  return unique(flags);
}

function scoreConfidence(
  snapshot: EvidenceSnapshot | undefined,
  dimensions: ScoreDimension[],
  calibration: ScoreCalibration,
): number {
  const evidenceConfidence = snapshot?.confidence ?? 0.35;
  const filledDimensions = dimensions.filter((dimension) => dimension.points > 0).length / dimensions.length;
  const factorConfidence = calibration.claimFactor < 0.5 || calibration.outputFactor < 0.2 ? 0.75 : 1;
  return Math.max(0.05, Math.min(1, Number((((evidenceConfidence * 0.7) + (filledDimensions * 0.3)) * factorConfidence).toFixed(2))));
}

function isPlaceholderOnlyEvidence(input: ScoreContributionByRulesInput): boolean {
  const snapshot = input.evidenceSnapshot;
  const files = snapshot?.github?.files ?? [];
  return snapshot?.type === 'github_commit' &&
    snapshot.status === 'verified' &&
    files.length > 0 &&
    changedLinesCount(snapshot) === 0 &&
    files.every((file) => PLACEHOLDER_FILE_RE.test(file));
}

function changedFilesCount(snapshot: EvidenceSnapshot | undefined): number {
  return snapshot?.github?.changedFiles ?? snapshot?.github?.files?.length ?? 0;
}

function changedLinesCount(snapshot: EvidenceSnapshot | undefined): number {
  return (snapshot?.github?.additions ?? 0) + (snapshot?.github?.deletions ?? 0);
}

function coreEvidenceFiles(snapshot: EvidenceSnapshot | undefined): string[] {
  return (snapshot?.github?.files ?? []).filter((file) => CORE_PATH_RE.test(file));
}

function scaleDimensionsToScore(
  dimensions: ScoreDimension[],
  fromScore: number,
  toScore: number,
): ScoreDimension[] {
  if (fromScore <= 0) return dimensions;
  const ratio = toScore / fromScore;
  return dimensions.map((item) => ({
    ...item,
    points: Math.max(0, Math.min(item.maxPoints, Math.round(item.points * ratio))),
  }));
}

function dimension(
  key: ScoreDimension['key'],
  points: number,
  reason: string,
  evidenceRefs: string[] = [],
): ScoreDimension {
  const maxPoints = maxPointsForDimension(key);
  return {
    key,
    label: labelForDimension(key),
    points: Math.max(0, Math.min(maxPoints, Math.round(points))),
    maxPoints,
    reason,
    evidenceRefs: unique(evidenceRefs),
  };
}

function declaredImpactScore(text: string): number {
  if (!text.trim()) return 0;
  const count = Number(text.match(/\d+/)?.[0] ?? 0);
  if (/多个|多篇|多场|large|major|核心|闭环/i.test(text) || count >= 5) return 15;
  if (/pr|页面|文章|活动|issue|commit|中等/i.test(text) || count >= 2) return 10;
  return 7;
}

function contributionText(input: ScoreContributionByRulesInput): string {
  return [
    input.title,
    input.contributionType,
    input.description,
    input.amount,
    input.impactScale,
    input.evidenceUrl,
    input.occurredAt,
  ].filter(Boolean).join(' ').toLowerCase();
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
