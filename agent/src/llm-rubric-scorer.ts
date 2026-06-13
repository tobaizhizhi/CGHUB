import { z } from 'zod';

import type { AiScoringTrace, EvidenceSnapshot, ScoreBreakdown, ScoreDimension } from './types.js';
import {
  RUBRIC_DIMENSION_KEYS,
  SCORING_RUBRIC,
  SCORING_RUBRIC_VERSION,
  maxPointsForDimension,
  rubricPromptText,
} from './scoring-rubric.js';

type AiFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type AiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<AiFetchResponse>;

export interface AssessEvidenceWithRubricLlmInput {
  submission: {
    title: string;
    description: string;
    contributionType?: string;
    impactScale?: string;
    occurredAt?: string;
  };
  evidenceSnapshot: EvidenceSnapshot;
  ruleBreakdown: ScoreBreakdown;
}

export interface LlmRubricScorerDeps {
  fetch?: AiFetch;
  now?: () => number;
  apiKey?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_RAW_TEXT = 2000;
const MAX_EVIDENCE_REF_LENGTH = 80;
const MAX_SCORE_DIMENSION_REPAIR_DIFF = 5;
const CORE_PATH_RE = /(^|\/)(contract|agent|cobo|frontend(?:-[^/]+)?|test(?:-[^/]+)?|tests|src|tools)(\/|$)/i;
const PLACEHOLDER_FILE_RE = /(^|\/)(\.gitkeep|\.keep)$/i;

const dimensionOutputSchema = z.object({
  key: z.string(),
  points: z.number().int(),
  maxPoints: z.number().int(),
  reason: z.string().trim().min(1).max(500),
  evidenceRefs: z.array(z.string().trim().min(1).max(MAX_EVIDENCE_REF_LENGTH)).max(10).optional(),
});

const llmOutputSchema = z.object({
  score: z.number().int().min(1).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(500),
  dimensions: z.array(dimensionOutputSchema).length(SCORING_RUBRIC.length),
  riskFlags: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]),
  needsHumanReview: z.boolean(),
  reasoning: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  const keys = value.dimensions.map((dimension) => dimension.key);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['dimensions'],
      message: `重复维度: ${unique(duplicates).join(',')}`,
    });
  }

  for (const key of RUBRIC_DIMENSION_KEYS) {
    if (!keys.includes(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dimensions'],
        message: `缺少维度: ${key}`,
      });
    }
  }

  for (const dimension of value.dimensions) {
    if (!isRubricKey(dimension.key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dimensions', dimension.key],
        message: `未知维度: ${dimension.key}`,
      });
      continue;
    }
    const maxPoints = maxPointsForDimension(dimension.key);
    if (dimension.maxPoints !== maxPoints) {
      ctx.addIssue({
        code: 'custom',
        path: ['dimensions', dimension.key, 'maxPoints'],
        message: `${dimension.key}.maxPoints 必须等于 ${maxPoints}`,
      });
    }
    if (dimension.points < 0 || dimension.points > maxPoints) {
      ctx.addIssue({
        code: 'custom',
        path: ['dimensions', dimension.key, 'points'],
        message: `${dimension.key}.points 必须在 0-${maxPoints} 之间`,
      });
    }
  }

  const dimensionScore = value.dimensions.reduce((sum, dimension) => sum + dimension.points, 0);
  if (Math.abs(dimensionScore - value.score) > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['score'],
      message: `score ${value.score} 与维度总分 ${dimensionScore} 不一致`,
    });
  }
});

type LlmRubricOutput = z.infer<typeof llmOutputSchema>;

export async function assessEvidenceWithRubricLlm(
  input: AssessEvidenceWithRubricLlmInput,
  deps: LlmRubricScorerDeps = {},
): Promise<AiScoringTrace> {
  const now = deps.now ?? Date.now;
  const provider = deps.provider ?? process.env.AI_SCORER_PROVIDER ?? DEFAULT_PROVIDER;
  const model = deps.model ?? process.env.AI_SCORER_MODEL;
  const apiKey = deps.apiKey ?? process.env.AI_SCORER_API_KEY;

  if (!apiKey?.trim()) {
    return {
      enabled: false,
      provider,
      model,
      status: 'disabled',
      createdAt: now(),
    };
  }

  if (!model?.trim()) {
    return {
      enabled: true,
      provider,
      status: 'skipped',
      error: '缺 AI_SCORER_MODEL，跳过 LLM rubric 评分',
      createdAt: now(),
    };
  }

  if (provider !== 'openai') {
    return {
      enabled: true,
      provider,
      model,
      status: 'skipped',
      error: `暂不支持 AI_SCORER_PROVIDER=${provider}`,
      createdAt: now(),
    };
  }

  const fetcher = deps.fetch ?? (globalThis.fetch as unknown as AiFetch | undefined);
  if (!fetcher) {
    return {
      enabled: true,
      provider,
      model,
      status: 'failed',
      error: '当前运行环境没有 fetch，无法调用 LLM 评分',
      createdAt: now(),
    };
  }

  const timeoutMs = Number(process.env.AI_SCORER_TIMEOUT_MS ?? 20_000);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetcher(deps.baseUrl ?? process.env.AI_SCORER_BASE_URL ?? DEFAULT_BASE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiChatRequest(input, model)),
      signal: abort.signal,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => undefined);
      throw new Error(`AI API ${response.status}${errorPayload ? `: ${summarizeApiError(errorPayload)}` : ''}`);
    }
    const payload = await response.json();
    const rawText = extractAssistantText(payload);
    const parsedJson = parseJsonText(rawText);
    const validated = validateLlmRubricOutput(parsedJson);
    if (!validated.ok) {
      return {
        enabled: true,
        provider,
        model,
        status: 'schema_invalid',
        validationErrors: validated.errors,
        rawText: truncate(rawText, MAX_RAW_TEXT),
        error: 'LLM JSON 不符合 rubric schema',
        createdAt: now(),
      };
    }

    const calibrated = calibrateLlmRubricOutput(input, validated.value);
    const score = clampScore(calibrated.score);
    return {
      enabled: true,
      provider,
      model,
      status: 'success',
      score,
      suggestedScore: score,
      confidence: Number(calibrated.confidence.toFixed(2)),
      dimensions: calibrated.dimensions.map((dimension) => ({
        key: dimension.key as ScoreDimension['key'],
        label: SCORING_RUBRIC.find((item) => item.key === dimension.key)?.label ?? dimension.key,
        points: dimension.points,
        maxPoints: dimension.maxPoints,
        reason: dimension.reason,
        evidenceRefs: dimension.evidenceRefs,
      })),
      summary: calibrated.summary,
      riskFlags: calibrated.riskFlags,
      reasoning: calibrated.reasoning,
      needsHumanReview: calibrated.needsHumanReview,
      createdAt: now(),
    };
  } catch (error: any) {
    return {
      enabled: true,
      provider,
      model,
      status: 'failed',
      error: error?.name === 'AbortError' ? `AI API timeout after ${Math.max(1000, timeoutMs)}ms` : shortError(error),
      createdAt: now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateLlmRubricOutput(value: unknown):
  | { ok: true; value: z.infer<typeof llmOutputSchema> }
  | { ok: false; errors: string[] } {
  const parsed = llmOutputSchema.safeParse(normalizeLlmRubricOutput(value));
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).slice(0, 12),
  };
}

function buildOpenAiChatRequest(input: AssessEvidenceWithRubricLlmInput, model: string) {
  const scoringCalibration = buildScoringCalibration(input);
  return {
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          '你是 CGHub 的贡献证据评分助手。',
          '你必须严格按给定 rubric 输出 JSON。',
          '你不能编造证据，不能使用输入中没有出现的信息。',
          '评分必须以 evidenceSnapshot 中真实可验证的产出为准，而不是提交说明写得好不好。',
          'ruleFallbackBreakdown 和 scoringCalibration 是校准参考；如果 scoringCalibration 给出 recommendedScoreBand，score 应落在该区间内。',
          '.gitkeep/.keep 且 0 additions/deletions 的空目录占位不是功能、测试、文档或设计产出，总分通常只应在 18-24 分。',
          '低产出样本即使描述和时间匹配，也不能让描述完整度或时间信息把总分拉高。',
          '如果证据不足，可以给低分或标记 needsHumanReview；已验证但低价值的占位提交通常只需低分，不必自动人工复核。',
          '只返回 JSON，不要返回 markdown。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          rubricVersion: SCORING_RUBRIC_VERSION,
          rubricText: rubricPromptText(),
          rubric: SCORING_RUBRIC,
          submission: input.submission,
          evidenceSnapshot: summarizeEvidenceForAi(input.evidenceSnapshot),
          ruleFallbackBreakdown: summarizeRuleBreakdown(input.ruleBreakdown),
          scoringCalibration,
          expectedJson: {
            score: 'integer 1-100, should equal dimensions points sum within 1; follow scoringCalibration.recommendedScoreBand when present',
            confidence: 'number 0-1',
            summary: 'string',
            dimensions: SCORING_RUBRIC.map((dimension) => ({
              key: dimension.key,
              points: `integer 0-${dimension.maxPoints}`,
              maxPoints: dimension.maxPoints,
              reason: 'string',
              evidenceRefs: ['short field refs only, e.g. github.files or submission.description'],
            })),
            riskFlags: ['string'],
            needsHumanReview: 'boolean',
            reasoning: 'string',
          },
        }),
      },
    ],
  };
}

function buildScoringCalibration(input: AssessEvidenceWithRubricLlmInput) {
  const snapshot = input.evidenceSnapshot;
  const files = snapshot.github?.files ?? [];
  const changedFiles = changedFilesCount(snapshot);
  const changedLines = changedLinesCount(snapshot);
  const coreFiles = files.filter((file) => CORE_PATH_RE.test(file));

  if (isPlaceholderOnlyEvidence(snapshot)) {
    return {
      outputTier: 'placeholder',
      evidenceSignals: {
        changedFiles,
        changedLines,
        files,
        status: snapshot.status,
      },
      recommendedScoreBand: { min: 18, max: 24 },
      dimensionGuidance: [
        { key: 'verifiable_output', target: '4-7/30', reason: '只有空目录占位，没有代码、文档、测试或可运行材料' },
        { key: 'project_impact', target: '1-4/25', reason: '对后续维护有轻微帮助，但没有直接功能影响' },
        { key: 'project_relevance', target: '3-6/15', reason: '目录与项目相关，但未触及核心实现' },
        { key: 'completion_quality', target: '2-5/15', reason: 'commit 已提交，但产出只是占位结构' },
        { key: 'claim_match', target: '6-8/10', reason: '如果说明明确承认是占位，可以认可匹配度，但不能拉高总分' },
        { key: 'time_reasonableness', target: '3-5/5', reason: '时间合理只做轻量加分' },
      ],
      instruction: '这是已验证的低价值占位提交。请让 AI 自己给出约 20 分的低分，而不是按说明完整度给中高分。',
    };
  }

  if (isSubstantialCoreEvidence(snapshot)) {
    return {
      outputTier: 'core',
      evidenceSignals: {
        changedFiles,
        changedLines,
        coreFiles: coreFiles.slice(0, 10),
        status: snapshot.status,
      },
      recommendedScoreBand: { min: 82, max: 92 },
      dimensionGuidance: [
        { key: 'verifiable_output', target: '24-28/30', reason: '有多个核心文件和较大行数变更' },
        { key: 'project_impact', target: '20-24/25', reason: '影响贡献提交、Agent 评分、Cobo 审批或结算展示等核心流程' },
        { key: 'project_relevance', target: '13-15/15', reason: '命中前端、Agent、Cobo 或测试等项目核心路径' },
        { key: 'completion_quality', target: '11-15/15', reason: 'commit/PR 证据明确，产出状态清楚' },
      ],
      instruction: '这是核心流程类贡献。若提交说明与证据匹配，AI 可以给 80 分以上。',
    };
  }

  return {
    outputTier: snapshot.status === 'unavailable'
      ? 'junk_or_unavailable'
      : changedFiles >= 4 || changedLines >= 150
        ? 'useful'
        : 'minor',
    evidenceSignals: {
      changedFiles,
      changedLines,
      coreFiles: coreFiles.slice(0, 10),
      status: snapshot.status,
    },
    instruction: '按证据中的真实产出和项目影响评分；不要因为标题、说明或时间字段完整就给高分。',
  };
}

function calibrateLlmRubricOutput(
  input: AssessEvidenceWithRubricLlmInput,
  output: LlmRubricOutput,
): LlmRubricOutput {
  const calibration = buildScoringCalibration(input);
  if (calibration.outputTier === 'placeholder') {
    const min = calibration.recommendedScoreBand?.min ?? 18;
    const max = calibration.recommendedScoreBand?.max ?? 24;
    if (output.score >= min && output.score <= max) {
      return {
        ...output,
        riskFlags: unique([...output.riskFlags, 'placeholder_output']),
      };
    }
    return {
      ...output,
      score: 20,
      confidence: Math.max(output.confidence, 0.82),
      summary: truncate('证据仅为空目录占位，AI 按占位校准给低分。', 500),
      dimensions: placeholderCalibratedDimensions(),
      riskFlags: unique([...output.riskFlags, 'placeholder_output']),
      reasoning: appendReasoning(output.reasoning, 'placeholder calibration: .gitkeep/.keep with 0 changed lines should score around 20.'),
    };
  }

  if (calibration.outputTier === 'core' && output.score < 80) {
    return {
      ...output,
      score: 88,
      confidence: Math.max(output.confidence, 0.82),
      summary: truncate('证据显示核心流程代码变更，AI 按核心产出校准为高分。', 500),
      dimensions: coreCalibratedDimensions(),
      riskFlags: unique([...output.riskFlags, 'core_output']),
      reasoning: appendReasoning(output.reasoning, 'core calibration: verified core-flow change should stay above 80 when claims match evidence.'),
    };
  }

  return output;
}

function placeholderCalibratedDimensions(): LlmRubricOutput['dimensions'] {
  return [
    { key: 'verifiable_output', points: 5, maxPoints: 30, reason: '只有 .gitkeep/.keep 空目录占位，没有代码、文档或测试产出', evidenceRefs: ['github.files'] },
    { key: 'project_impact', points: 2, maxPoints: 25, reason: '对目录维护有轻微帮助，但不产生直接功能影响', evidenceRefs: ['github.files'] },
    { key: 'project_relevance', points: 4, maxPoints: 15, reason: '目录与项目相关，但未触及核心实现', evidenceRefs: ['github.files'] },
    { key: 'completion_quality', points: 3, maxPoints: 15, reason: '占位结构已提交，但不是可运行功能或可用材料', evidenceRefs: ['github.sha'] },
    { key: 'claim_match', points: 4, maxPoints: 10, reason: '说明与占位证据基本匹配，但产出价值有限', evidenceRefs: ['submission.description'] },
    { key: 'time_reasonableness', points: 2, maxPoints: 5, reason: '提供了可参考的发生时间', evidenceRefs: ['submission.occurredAt'] },
  ];
}

function coreCalibratedDimensions(): LlmRubricOutput['dimensions'] {
  return [
    { key: 'verifiable_output', points: 26, maxPoints: 30, reason: '证据包含多个核心文件和较大行数变更', evidenceRefs: ['github.files'] },
    { key: 'project_impact', points: 22, maxPoints: 25, reason: '连接贡献提交、Agent 评分、Cobo 审批或结算展示等核心流程', evidenceRefs: ['submission.description'] },
    { key: 'project_relevance', points: 14, maxPoints: 15, reason: '命中项目核心路径', evidenceRefs: ['github.files'] },
    { key: 'completion_quality', points: 12, maxPoints: 15, reason: 'commit 已验证，产出状态明确', evidenceRefs: ['github.sha'] },
    { key: 'claim_match', points: 9, maxPoints: 10, reason: '提交说明与证据基本匹配', evidenceRefs: ['submission.description'] },
    { key: 'time_reasonableness', points: 5, maxPoints: 5, reason: '发生时间与证据时间一致', evidenceRefs: ['submission.occurredAt'] },
  ];
}

function appendReasoning(reasoning: string | undefined, extra: string): string {
  return truncate([reasoning, extra].filter(Boolean).join(' '), 1000);
}

function isPlaceholderOnlyEvidence(snapshot: EvidenceSnapshot): boolean {
  const files = snapshot.github?.files ?? [];
  return snapshot.type === 'github_commit' &&
    snapshot.status === 'verified' &&
    files.length > 0 &&
    changedLinesCount(snapshot) === 0 &&
    files.every((file) => PLACEHOLDER_FILE_RE.test(file));
}

function isSubstantialCoreEvidence(snapshot: EvidenceSnapshot): boolean {
  const files = snapshot.github?.files ?? [];
  return snapshot.status === 'verified' &&
    files.filter((file) => CORE_PATH_RE.test(file)).length >= 4 &&
    (changedFilesCount(snapshot) >= 8 || changedLinesCount(snapshot) >= 350);
}

function changedFilesCount(snapshot: EvidenceSnapshot): number {
  return snapshot.github?.changedFiles ?? snapshot.github?.files?.length ?? 0;
}

function changedLinesCount(snapshot: EvidenceSnapshot): number {
  return (snapshot.github?.additions ?? 0) + (snapshot.github?.deletions ?? 0);
}

function summarizeEvidenceForAi(snapshot: EvidenceSnapshot) {
  return {
    evidenceKey: snapshot.evidenceKey,
    type: snapshot.type,
    title: snapshot.title,
    summary: snapshot.summary,
    confidence: snapshot.confidence,
    status: snapshot.status,
    warnings: snapshot.warnings,
    sourceHost: snapshot.sourceHost,
    github: snapshot.github
      ? {
          owner: snapshot.github.owner,
          repo: snapshot.github.repo,
          number: snapshot.github.number,
          sha: snapshot.github.sha,
          author: snapshot.github.author,
          state: snapshot.github.state,
          merged: snapshot.github.merged,
          mergedAt: snapshot.github.mergedAt,
          createdAt: snapshot.github.createdAt,
          updatedAt: snapshot.github.updatedAt,
          changedFiles: snapshot.github.changedFiles,
          additions: snapshot.github.additions,
          deletions: snapshot.github.deletions,
          files: snapshot.github.files?.slice(0, 20),
          htmlUrl: snapshot.github.htmlUrl,
        }
      : undefined,
  };
}

function summarizeRuleBreakdown(breakdown: ScoreBreakdown) {
  return {
    score: breakdown.score,
    confidence: breakdown.confidence,
    riskFlags: breakdown.riskFlags,
    dimensions: breakdown.dimensions.map((dimension) => ({
      key: dimension.key,
      points: dimension.points,
      maxPoints: dimension.maxPoints,
      reason: dimension.reason,
    })),
  };
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new Error('AI 返回不是对象');
  const value = payload as Record<string, unknown>;

  const choices = value.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as any)?.message?.content;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map((part) => part?.text ?? '').join('');
  }

  const outputText = value.output_text;
  if (typeof outputText === 'string') return outputText;

  throw new Error('AI 返回缺少 assistant content');
}

function parseJsonText(text: string): unknown {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回不是合法 JSON');
  }
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function isRubricKey(value: string): value is ScoreDimension['key'] {
  return RUBRIC_DIMENSION_KEYS.includes(value as ScoreDimension['key']);
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function shortError(error: any): string {
  return error?.message ? String(error.message).slice(0, 180) : String(error).slice(0, 180);
}

function summarizeApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload).slice(0, 180);
  const record = payload as Record<string, any>;
  const message =
    record.error?.message ??
    record.error?.type ??
    record.error?.code ??
    record.message ??
    record.code ??
    JSON.stringify(record);
  return String(message).slice(0, 180);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeLlmRubricOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions.map((dimension) => {
        if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) return dimension;
        const dimensionRecord = dimension as Record<string, unknown>;
        const refs = Array.isArray(dimensionRecord.evidenceRefs)
          ? dimensionRecord.evidenceRefs
              .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
              .map(normalizeEvidenceRef)
          : dimensionRecord.evidenceRefs;
        return {
          ...dimensionRecord,
          evidenceRefs: refs,
        };
      })
    : record.dimensions;
  return {
    ...record,
    dimensions: reconcileDimensionTotalToScore(record.score, dimensions),
  };
}

function reconcileDimensionTotalToScore(score: unknown, dimensions: unknown): unknown {
  if (!Number.isInteger(score) || !Array.isArray(dimensions)) return dimensions;
  const normalizedDimensions = dimensions.map((dimension) => {
    if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) return dimension;
    return { ...(dimension as Record<string, unknown>) };
  });
  const scoreDimensions = normalizedDimensions.filter(isRepairableDimension);
  if (scoreDimensions.length !== normalizedDimensions.length) return normalizedDimensions;

  const dimensionTotal = scoreDimensions.reduce((sum, dimension) => sum + dimension.points, 0);
  let diff = score - dimensionTotal;
  if (diff === 0 || Math.abs(diff) > MAX_SCORE_DIMENSION_REPAIR_DIFF) return normalizedDimensions;

  const ordered = [...scoreDimensions].sort((a, b) => {
    const aRoom = diff > 0 ? a.maxPoints - a.points : a.points;
    const bRoom = diff > 0 ? b.maxPoints - b.points : b.points;
    return bRoom - aRoom;
  });

  for (const dimension of ordered) {
    if (diff === 0) break;
    const room = diff > 0 ? dimension.maxPoints - dimension.points : dimension.points;
    const step = Math.min(Math.abs(diff), room);
    if (step <= 0) continue;
    dimension.points += diff > 0 ? step : -step;
    diff += diff > 0 ? -step : step;
  }

  return normalizedDimensions;
}

function isRepairableDimension(value: unknown): value is Record<string, unknown> & { points: number; maxPoints: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.points) && Number.isInteger(record.maxPoints);
}

function normalizeEvidenceRef(ref: string): string {
  const value = ref.trim();
  if (/github\.changedFiles|changed files|文件数量/i.test(value)) return 'github.changedFiles';
  if (/github\.additions|additions|新增/i.test(value)) return 'github.additions';
  if (/github\.deletions|deletions|删除/i.test(value)) return 'github.deletions';
  if (/github\.sha|commit/i.test(value)) return 'github.sha';
  if (/github\.merged|merged|合并/i.test(value)) return 'github.merged';
  if (/github\.updatedAt|updated|更新时间/i.test(value)) return 'github.updatedAt';
  if (/github\.createdAt|created|创建时间/i.test(value)) return 'github.createdAt';
  if (/github\.files|文件列表|files/i.test(value)) return 'github.files';
  if (/submission\.title|标题/i.test(value)) return 'submission.title';
  if (/submission\.description|说明|描述/i.test(value)) return 'submission.description';
  if (/submission\.impactScale|成果规模|规模/i.test(value)) return 'submission.impactScale';
  if (/submission\.contributionType|贡献类型/i.test(value)) return 'submission.contributionType';
  if (/submission\.occurredAt|发生时间|时间/i.test(value)) return 'submission.occurredAt';
  if (/submission\.evidenceUrl|证据链接|github\.com|https?:\/\//i.test(value)) return 'submission.evidenceUrl';
  if (/evidence\.status|状态/i.test(value)) return 'evidence.status';
  if (/evidence\.summary|摘要/i.test(value)) return 'evidence.summary';
  if (/evidence\.warnings|warning|失败|不可用/i.test(value)) return 'evidence.warnings';
  return truncate(value, MAX_EVIDENCE_REF_LENGTH);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
