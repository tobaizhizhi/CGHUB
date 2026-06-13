export type EntryIntent = "project" | "contributor" | "manager";

export interface SuggestEntryIntentInput {
  walletAddress?: string | null;
  projectOwnerAddress?: string;
  contractOwnerAddress?: string;
  score?: string;
  pending?: string;
  claimed?: string;
}

export interface EntryIntentOption {
  intent: EntryIntent;
  label: string;
  audience: string;
  description: string;
  defaultHref: string;
}

const entryIntentHrefs: Record<EntryIntent, string> = {
  project: "/project",
  contributor: "/contributor",
  manager: "/manager",
};

export const ENTRY_INTENT_OPTIONS: EntryIntentOption[] = [
  {
    intent: "project",
    label: "我是项目方 / 用户",
    audience: "活动资金方",
    description: "查看活动资金池，给活动注资，或支付参与活动费用。",
    defaultHref: entryIntentHrefs.project,
  },
  {
    intent: "contributor",
    label: "我是贡献者",
    audience: "贡献者",
    description: "提交代码、组织、宣传等贡献，查看分数和可领取收益。",
    defaultHref: entryIntentHrefs.contributor,
  },
  {
    intent: "manager",
    label: "我是管理者",
    audience: "活动管理员",
    description: "创建活动、开资金池、结束活动并维护活动生命周期。",
    defaultHref: entryIntentHrefs.manager,
  },
];

export function entryIntentHref(intent: EntryIntent) {
  return entryIntentHrefs[intent];
}

export function suggestEntryIntent(input: SuggestEntryIntentInput = {}): EntryIntent {
  if (matchesAddress(input.walletAddress, input.contractOwnerAddress)) {
    return "manager";
  }

  if (matchesAddress(input.walletAddress, input.projectOwnerAddress)) {
    return "project";
  }

  if (hasPositiveValue(input.score) || hasPositiveValue(input.pending) || hasPositiveValue(input.claimed)) {
    return "contributor";
  }

  return "contributor";
}

function matchesAddress(left?: string | null, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function hasPositiveValue(value?: string) {
  if (!value) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}
