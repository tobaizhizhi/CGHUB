export interface CoboPactSummary {
  id: string;
  name?: string;
  status?: string;
  activatedAt?: string;
  expiresAt?: string;
  progressTxCount?: number;
  progressUsdSpent?: string;
  policies?: unknown[];
}

export interface CoboStatusResponse {
  walletId: string;
  srcAddress: string;
  chainId: string;
  tokenId: string;
  mainPact?: CoboPactSummary;
  signPact?: CoboPactSummary;
  fundPact?: CoboPactSummary;
  guardPact?: CoboPactSummary;
  pactStats?: {
    totalPacts?: number;
    activePacts?: number;
    txCount?: number;
    volumeUsd?: string;
  };
  balances: Array<{
    tokenId?: string;
    chainId?: string;
    address?: string;
    balance?: string;
    symbol?: string;
  }>;
  pendingOperations: Array<{
    id?: string;
    status?: string;
    action?: string;
    createdAt?: string;
  }>;
}

export interface CoboStatusSummary {
  walletShort: string;
  mainPactStatus: string;
  signPactStatus: string;
  fundPactStatus: string;
  guardPactStatus: string;
  balanceLine: string;
  pendingApprovalCount: number;
  pactStatsLine: string;
}

function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatPactStatus(status?: string) {
  if (!status) return "未配置";
  if (status === "active") return "已启用";
  if (status === "pending") return "待审批";
  if (status === "expired") return "已过期";
  if (status === "disabled") return "已停用";
  return status;
}

export function summarizeCoboStatus(status: CoboStatusResponse | null): CoboStatusSummary {
  if (!status) {
    return {
      walletShort: "-",
      mainPactStatus: "未读取",
      signPactStatus: "未读取",
      fundPactStatus: "未读取",
      guardPactStatus: "未读取",
      balanceLine: "等待 Cobo 状态...",
      pendingApprovalCount: 0,
      pactStatsLine: "-",
    };
  }

  const balanceLine = status.balances.length
    ? status.balances
        .slice(0, 3)
        .map((item) => `${item.symbol ?? item.tokenId ?? "token"} ${item.balance ?? "0"}`)
        .join(" / ")
    : "暂无余额数据";

  const stats = status.pactStats;
  const pactStatsLine = stats
    ? `${stats.activePacts ?? 0} 个启用 / ${stats.txCount ?? 0} 笔 / $${stats.volumeUsd ?? "0"}`
    : "-";

  return {
    walletShort: shortAddress(status.srcAddress),
    mainPactStatus: formatPactStatus(status.mainPact?.status),
    signPactStatus: formatPactStatus(status.signPact?.status),
    fundPactStatus: formatPactStatus(status.fundPact?.status),
    guardPactStatus: formatPactStatus(status.guardPact?.status),
    balanceLine,
    pendingApprovalCount: status.pendingOperations.length,
    pactStatsLine,
  };
}
