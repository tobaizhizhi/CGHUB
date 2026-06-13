export type RoundStatus = "Draft" | "Open" | "Funded" | "Scoring" | "Finalized" | "Closed";
export type SettlementRole = "owner" | "contributor" | "readOnly";
export type ActionKind = "primary" | "secondary";

export interface WorkspaceAction {
  label: string;
  href: string;
  kind: ActionKind;
}

export interface PayoutContributor {
  address: string;
  score: string;
  claimed?: string;
  pending?: string;
}

export interface BuildContributorSnapshotsInput {
  activities: TimelinePoolActivity[];
  walletAddress?: string | null;
  walletScore?: string;
  walletClaimed?: string;
  walletPending?: string;
}

export interface ContributorSnapshot {
  address: string;
  score: string;
  claimed: string;
  pending: string;
}

export interface BuildPayoutRowsInput {
  funded: string;
  totalScore: string;
  contributors: PayoutContributor[];
}

export interface PayoutRow {
  address: string;
  shortAddress: string;
  score: string;
  shareBps: number;
  estimated: string;
  claimed: string;
  pending: string;
}

export type ActivityAction =
  | "round_created"
  | "round_funded"
  | "contribution_submitted"
  | "contribution_scored"
  | "contribution_recorded"
  | "round_finalized"
  | "payout_claimed"
  | "wallet_policy_blocked";
export type ActivityResult = "success" | "pending" | "blocked" | "failed";

export interface TimelinePoolActivity {
  id: string;
  type: "funded" | "contribution" | "finalized" | "claimed";
  title: string;
  detail: string;
  txHash: string;
  blockNumber: number;
  ts?: number;
  contributor?: string;
  score?: string;
  amount?: string;
}

export interface TimelineDecision {
  id: string;
  ts: number;
  stage: string;
  result: "allowed" | "denied" | "pending" | "error";
  contributor?: string;
  score?: number;
  reason?: string;
  amount?: string;
  txHash?: string;
}

export interface TimelineAuditItem {
  result: "allowed" | "denied" | "pending" | "error";
  action?: string;
  principal_id?: string;
  created_at?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface BuildActivityTimelineInput {
  poolActivities: TimelinePoolActivity[];
  decisions: TimelineDecision[];
  auditItems: TimelineAuditItem[];
}

export interface ActivityItem {
  id: string;
  ts: number;
  action: ActivityAction;
  result: ActivityResult;
  title: string;
  detail: string;
  amount?: string;
  score?: string;
  txHash?: string;
  auditResult?: string;
  raw?: unknown;
}

export interface SettlementRound {
  exists: boolean;
  funded: string;
  totalScore: string;
  finalized: boolean;
}

const roundStatusLabels: Record<RoundStatus, string> = {
  Draft: "待创建",
  Open: "开放中",
  Funded: "已注资",
  Scoring: "评分中",
  Finalized: "可领取",
  Closed: "已结清",
};

const activityResultLabels: Record<ActivityResult, string> = {
  success: "成功",
  pending: "处理中",
  blocked: "已拦截",
  failed: "失败",
};

const activityActionLabels: Record<ActivityAction, string> = {
  round_created: "创建 Round",
  round_funded: "注资",
  contribution_submitted: "提交贡献",
  contribution_scored: "Agent 评分",
  contribution_recorded: "贡献上链",
  round_finalized: "关闭 Round",
  payout_claimed: "领取分账",
  wallet_policy_blocked: "钱包策略拦截",
};

export function deriveRoundStatus(round: SettlementRound | null, pendingTotal: string): RoundStatus {
  if (!round?.exists) return "Draft";
  if (round.finalized) return toBigInt(pendingTotal) > 0n ? "Finalized" : "Closed";
  if (toBigInt(round.funded) === 0n) return "Open";
  if (toBigInt(round.totalScore) === 0n) return "Funded";
  return "Scoring";
}

export function formatRoundStatus(status: RoundStatus) {
  return roundStatusLabels[status];
}

export function formatActivityResult(result: ActivityResult) {
  return activityResultLabels[result];
}

export function formatActivityAction(action: ActivityAction) {
  return activityActionLabels[action];
}

export function getNextAction(role: SettlementRole, status: RoundStatus): WorkspaceAction {
  if (role === "owner") {
    if (status === "Draft") return action("创建 Round", "/manager", "primary");
    if (status === "Open") return action("Treasury 注资", "/manager", "primary");
    if (status === "Funded") return action("监控贡献", "/manager", "secondary");
    if (status === "Scoring") return action("关闭结算", "/manager", "primary");
    if (status === "Finalized") return action("查看分账", "/manager", "secondary");
    return action("开启下一轮", "/manager", "secondary");
  }

  if (role === "contributor") {
    if (status === "Draft") return action("查看 Round 状态", "/", "secondary");
    if (status === "Finalized") return action("领取分账", "/contributor", "primary");
    if (status === "Closed") return action("查看历史", "/activity", "secondary");
    return action("提交贡献", "/contributor", "primary");
  }

  return action("查看活动", "/activity", "secondary");
}

export function buildPayoutRows(input: BuildPayoutRowsInput): PayoutRow[] {
  const funded = toBigInt(input.funded);
  const totalScore = toBigInt(input.totalScore);

  return input.contributors.map((contributor) => {
    const score = toBigInt(contributor.score);
    const estimated = totalScore > 0n ? (funded * score) / totalScore : 0n;
    const shareBps = totalScore > 0n ? Number((score * 10000n) / totalScore) : 0;

    return {
      address: contributor.address,
      shortAddress: shortAddress(contributor.address),
      score: contributor.score,
      shareBps,
      estimated: formatUsdc(estimated),
      claimed: formatUsdc(contributor.claimed ?? "0"),
      pending: formatUsdc(contributor.pending ?? "0"),
    };
  });
}

export function buildContributorSnapshots(input: BuildContributorSnapshotsInput): ContributorSnapshot[] {
  const byAddress = new Map<string, { address: string; score: bigint; claimed: string; pending: string }>();

  for (const activity of input.activities) {
    if (activity.type !== "contribution" || !activity.contributor) continue;
    const key = activity.contributor.toLowerCase();
    const current = byAddress.get(key) ?? {
      address: activity.contributor,
      score: 0n,
      claimed: "0",
      pending: "0",
    };
    current.score += toBigInt(activity.score);
    byAddress.set(key, current);
  }

  if (input.walletAddress) {
    const walletAddress = input.walletAddress;
    const key = walletAddress.toLowerCase();
    const hasWalletState =
      byAddress.has(key) ||
      toBigInt(input.walletScore) > 0n ||
      toBigInt(input.walletClaimed) > 0n ||
      toBigInt(input.walletPending) > 0n;

    if (hasWalletState) {
      const current = byAddress.get(key) ?? {
        address: walletAddress,
        score: 0n,
        claimed: "0",
        pending: "0",
      };
      current.address = walletAddress;
      current.score = toBigInt(input.walletScore);
      current.claimed = input.walletClaimed ?? "0";
      current.pending = input.walletPending ?? "0";
      byAddress.set(key, current);
    }
  }

  return Array.from(byAddress.values()).map((item) => ({
    address: item.address,
    score: item.score.toString(),
    claimed: item.claimed,
    pending: item.pending,
  }));
}

export function buildActivityTimeline(input: BuildActivityTimelineInput): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const activity of input.poolActivities) {
    if (activity.type === "funded") {
      const amount = formatUsdc(activity.amount ?? "0");
      items.push({
        id: activity.id,
        ts: activity.ts ?? activity.blockNumber,
        action: "round_funded",
        result: "success",
        title: `本轮已注资 ${amount}`,
        detail: "项目资金已进入本轮贡献分账池。",
        amount,
        txHash: activity.txHash,
        raw: activity,
      });
    }

    if (activity.type === "claimed") {
      const amount = formatUsdc(activity.amount ?? "0");
      const contributor = shortAddress(activity.contributor);
      items.push({
        id: activity.id,
        ts: activity.ts ?? activity.blockNumber,
        action: "payout_claimed",
        result: "success",
        title: `${contributor} 已领取 ${amount}`,
        detail: "贡献者已从本轮资金池领取分账。",
        amount,
        txHash: activity.txHash,
        raw: activity,
      });
    }

    if (activity.type === "contribution") {
      const contributor = shortAddress(activity.contributor);
      items.push({
        id: activity.id,
        ts: activity.ts ?? activity.blockNumber,
        action: "contribution_recorded",
        result: "success",
        title: `已记录 ${contributor} 的贡献`,
        detail: activity.detail,
        score: activity.score,
        txHash: activity.txHash,
        raw: activity,
      });
    }

    if (activity.type === "finalized") {
      items.push({
        id: activity.id,
        ts: activity.ts ?? activity.blockNumber,
        action: "round_finalized",
        result: "success",
        title: "Round 已关闭",
        detail: "贡献和注资已锁定，贡献者现在可以领取分账。",
        txHash: activity.txHash,
        raw: activity,
      });
    }
  }

  for (const decision of input.decisions) {
    if (decision.stage === "score") {
      const contributor = shortAddress(decision.contributor);
      items.push({
        id: decision.id,
        ts: decision.ts,
        action: "contribution_scored",
        result: decision.result === "error" ? "failed" : "success",
        title: `Agent 已为 ${contributor} 评分`,
        detail: decision.reason ?? "Agent 已完成贡献评分。",
        score: decision.score?.toString(),
        txHash: decision.txHash,
        raw: decision,
      });
    }
  }

  input.auditItems.forEach((audit, index) => {
    if (audit.result !== "denied") return;
    const ts = audit.created_at ? Date.parse(audit.created_at) : 0;
    items.push({
      id: `audit-${audit.created_at ?? index}`,
      ts,
      action: "wallet_policy_blocked",
      result: "blocked",
      title: `钱包策略拦截了 ${audit.action || "Agent 操作"}`,
      detail: String(audit.reason ?? "Cobo 钱包策略拒绝了这次操作。"),
      auditResult: audit.result,
      raw: audit,
    });
  });

  return items.sort((a, b) => b.ts - a.ts);
}

function action(label: string, href: string, kind: ActionKind): WorkspaceAction {
  return { label, href, kind };
}

export function shortAddress(value?: string) {
  if (!value || value.length < 10) return value || "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatUsdc(value: string | number | bigint | undefined | null) {
  const raw = toBigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = raw % 1_000_000n;
  if (fraction === 0n) return `${whole} USDC`;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fractionText} USDC`;
}

function toBigInt(value: string | number | bigint | undefined | null) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.max(0, Math.trunc(value)));
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
