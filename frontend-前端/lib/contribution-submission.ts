export const CONTRIBUTION_TYPE_OPTIONS = [
  "代码开发",
  "文档 / 教程",
  "宣传传播",
  "活动组织",
  "设计 / 运营",
  "评审 / 支持",
  "其他",
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPE_OPTIONS)[number];

export interface ContributionFormValues {
  title: string;
  contributionType: ContributionType;
  description: string;
  evidenceUrl: string;
  impactScale: string;
  occurredAt: string;
}

export function buildContributionScoringDescription(values: ContributionFormValues) {
  return [
    `贡献类型：${values.contributionType}`,
    `贡献说明：${values.description}`,
    `证据链接：${values.evidenceUrl}`,
    `成果规模：${values.impactScale}`,
    `发生时间：${values.occurredAt}`,
  ].join("\n");
}

export function contributionEvidenceId(values: Pick<ContributionFormValues, "evidenceUrl">, fallbackId: string) {
  const normalized = values.evidenceUrl.trim();
  return normalized || fallbackId;
}
