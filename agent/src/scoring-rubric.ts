import type { ScoreDimension } from './types.js';

export const SCORING_RUBRIC_VERSION = '2026-06-output-factor-rubric-v2';

export const SCORING_RUBRIC = [
  {
    key: 'verifiable_output',
    label: '可验证产出',
    maxPoints: 30,
    guidance: '看证据里到底产出了什么：代码、功能、测试、文档、设计稿、运营材料，还是占位/格式调整。占位和无业务影响变更必须低分。',
  },
  {
    key: 'project_impact',
    label: '项目价值 / 影响范围',
    maxPoints: 25,
    guidance: '看贡献是否影响核心流程、用户体验、Agent 评分、Cobo 审批、链上结算、前端页面或活动交付。',
  },
  {
    key: 'project_relevance',
    label: '项目相关性',
    maxPoints: 15,
    guidance: '看贡献是否和当前项目目标、活动任务、核心模块相关。命中核心路径只是相关性信号，不代表自动高价值。',
  },
  {
    key: 'completion_quality',
    label: '完成质量',
    maxPoints: 15,
    guidance: '看产出是否形成可用结果，而不是只存在一个 commit。PR merged、功能接通、测试/文档可用可以加分。',
  },
  {
    key: 'claim_match',
    label: '描述与证据匹配度',
    maxPoints: 10,
    guidance: '看提交说明是否被证据支撑，是否夸大。如果描述核心闭环但证据只是占位/格式调整，必须低分。',
  },
  {
    key: 'time_reasonableness',
    label: '时间合理性',
    maxPoints: 5,
    guidance: '只做轻量校验，确认发生时间和证据时间是否合理；时间正确不能弥补低价值产出。',
  },
] as const satisfies ReadonlyArray<{
  key: ScoreDimension['key'];
  label: string;
  maxPoints: number;
  guidance: string;
}>;

export type ScoringRubricKey = typeof SCORING_RUBRIC[number]['key'];

export const RUBRIC_DIMENSION_KEYS = SCORING_RUBRIC.map((item) => item.key);
export const RUBRIC_TOTAL_POINTS = SCORING_RUBRIC.reduce((sum, item) => sum + item.maxPoints, 0);

export function rubricPromptText(): string {
  return SCORING_RUBRIC
    .map((item) => `${item.key} (${item.label}) ${item.maxPoints} 分：${item.guidance}`)
    .join('\n');
}

export function maxPointsForDimension(key: ScoringRubricKey): number {
  const item = SCORING_RUBRIC.find((dimension) => dimension.key === key);
  if (!item) throw new Error(`Unknown rubric dimension: ${key}`);
  return item.maxPoints;
}

export function labelForDimension(key: ScoringRubricKey): string {
  const item = SCORING_RUBRIC.find((dimension) => dimension.key === key);
  if (!item) throw new Error(`Unknown rubric dimension: ${key}`);
  return item.label;
}
