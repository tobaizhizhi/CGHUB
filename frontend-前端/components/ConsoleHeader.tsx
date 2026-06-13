import Link from "next/link";

interface ConsoleHeaderProps {
  shortAddress: string;
  isConnected: boolean;
  chainId: number | null;
  blockNumber: number | null;
  agentOnline: boolean;
  isLoading?: boolean;
  error?: string | null;
  onConnect(): Promise<string | null>;
  onDisconnect(): void;
}

export function ConsoleHeader({
  shortAddress,
  isConnected,
  chainId,
  blockNumber,
  agentOnline,
  isLoading,
  error,
  onConnect,
  onDisconnect,
}: ConsoleHeaderProps) {
  const network = chainId === 11155111 ? "Sepolia" : chainId ? `链 ${chainId}` : "未连接";

  return (
    <header className="console-header">
      <div className="console-title-block">
        <p className="eyebrow">CGHub · Cobo Agentic 赛道</p>
        <h1>CGHub · AI 自动分账</h1>
        <p className="roles">Agent 评分 · 链上记账 · Cobo 护栏 · 审计留痕</p>
        <div className="hero-metrics">
          <span>凭证已签名</span>
          <span>策略护栏</span>
          <span>免 gas 领取</span>
        </div>
      </div>
      <div className="console-status-row">
        <span className={`status-chip ${agentOnline ? "ok" : "deny"}`}>
          <span className="status-dot" />
          Agent {agentOnline ? "在线" : "离线"}
        </span>
        <span className="status-chip">
          <span className="status-dot pending" />
          {network}
          {blockNumber ? ` #${blockNumber}` : ""}
        </span>
        <Link href="/replay" className="button secondary compact">
          复盘
        </Link>
        {isConnected ? (
          <button className="status-chip wallet-chip" onClick={onDisconnect}>
            {shortAddress || "已连接"} · 断开
          </button>
        ) : (
          <button className="button primary compact" disabled={isLoading} onClick={onConnect}>
            {isLoading ? "连接中..." : "连接钱包"}
          </button>
        )}
        {error && <p className="hint error console-wallet-error">{error}</p>}
      </div>
    </header>
  );
}
