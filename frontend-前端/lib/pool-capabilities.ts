import type { ViewerRole } from "./viewer-role";

export type PoolAction =
  | "createRound"
  | "fundWithCoboTreasury"
  | "fundWithBrowserWallet"
  | "submitContribution"
  | "finalizeRound"
  | "claimOwnPayout"
  | "requestAgentClaim"
  | "reviewActivity";

export interface PoolCapability {
  visible: boolean;
  enabled: boolean;
  reason?: string;
}

export interface PoolCapabilityRound {
  exists: boolean;
  finalized: boolean;
  funded: string;
  totalScore: string;
}

export interface DerivePoolCapabilitiesInput {
  roles: ViewerRole[];
  round: PoolCapabilityRound | null;
  walletConnected: boolean;
  pending: string;
  coboReady?: boolean;
}

export type PoolCapabilities = Record<PoolAction, PoolCapability>;

export function derivePoolCapabilities(input: DerivePoolCapabilitiesInput): PoolCapabilities {
  const round = input.round;
  const hasContractOwner = input.roles.includes("contractOwner");
  const hasProjectOperator = hasContractOwner || input.roles.includes("projectOwner");
  const canCreate = hasContractOwner && !round?.exists;
  const canFund = Boolean(round?.exists) && !round?.finalized;
  const canSubmit = input.walletConnected && Boolean(round?.exists) && !round?.finalized;
  const canClaim = input.walletConnected && Boolean(round?.finalized) && toBigInt(input.pending) > 0n;
  const canFinalize =
    Boolean(round?.exists) &&
    !round?.finalized &&
    toBigInt(round?.funded) > 0n &&
    toBigInt(round?.totalScore) > 0n;

  return {
    createRound: capability(canCreate, createBlockedReason(input, hasContractOwner)),
    fundWithCoboTreasury: capability(canFund && Boolean(input.coboReady) && hasProjectOperator, coboFundBlockedReason(input, hasProjectOperator)),
    fundWithBrowserWallet: capability(canFund && input.walletConnected, browserFundBlockedReason(input)),
    submitContribution: capability(canSubmit, submitBlockedReason(input)),
    finalizeRound: capability(hasContractOwner && canFinalize, hasContractOwner ? finalizeBlockedReason(round) : "需要连接合约管理员钱包。"),
    claimOwnPayout: capability(canClaim, claimBlockedReason(input)),
    requestAgentClaim: capability(canClaim, claimBlockedReason(input)),
    reviewActivity: { visible: true, enabled: true },
  };
}

function disabled(reason: string): PoolCapability {
  return { visible: true, enabled: false, reason };
}

function capability(enabled: boolean, reason?: string): PoolCapability {
  return enabled ? { visible: true, enabled: true } : { visible: true, enabled: false, reason };
}

function finalizeBlockedReason(round: PoolCapabilityRound | null) {
  if (!round?.exists) return "需要先创建链上 Round。";
  if (round.finalized) return "资金池已关闭。";
  if (toBigInt(round.funded) === 0n) return "需要先注资。";
  if (toBigInt(round.totalScore) === 0n) return "需要先记录贡献评分。";
  return undefined;
}

function createBlockedReason(input: DerivePoolCapabilitiesInput, hasContractOwner: boolean) {
  if (input.round?.exists) return "链上 Round 已创建。";
  if (!hasContractOwner) return "需要连接合约管理员钱包。";
  return undefined;
}

function coboFundBlockedReason(input: DerivePoolCapabilitiesInput, hasProjectOperator: boolean) {
  if (!input.round?.exists) return "需要先创建链上 Round。";
  if (input.round.finalized) return "资金池已关闭，不能继续注资。";
  if (!hasProjectOperator) return "需要项目方或合约管理员发起 Treasury 注资。";
  if (!input.coboReady) return "Cobo Treasury 尚未就绪。";
  return undefined;
}

function browserFundBlockedReason(input: DerivePoolCapabilitiesInput) {
  if (!input.walletConnected) return "需要先连接钱包。";
  if (!input.round?.exists) return "需要先创建链上 Round。";
  if (input.round.finalized) return "资金池已关闭，不能继续注资。";
  return undefined;
}

function submitBlockedReason(input: DerivePoolCapabilitiesInput) {
  if (!input.walletConnected) return "需要先连接钱包。";
  if (!input.round?.exists) return "需要先创建链上 Round。";
  if (input.round.finalized) return "资金池已关闭，不能提交新贡献。";
  return undefined;
}

function claimBlockedReason(input: DerivePoolCapabilitiesInput) {
  if (!input.walletConnected) return "需要先连接钱包。";
  if (!input.round?.finalized) return "项目方关闭该资金池后才会开放领取。";
  if (toBigInt(input.pending) === 0n) return "当前钱包暂无可领取分账。";
  return undefined;
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
