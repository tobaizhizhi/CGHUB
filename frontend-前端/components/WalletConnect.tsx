import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { LedgerNotice } from "./ledger/LedgerNotice";
import { RoleButton } from "./ledger/RoleButton";

interface WalletConnectProps {
  address?: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error?: string | null;
  chainId?: number | null;
  onConnect: () => Promise<string | null>;
  onDisconnect: () => void;
}

export function WalletConnect({
  address,
  isConnected,
  isLoading,
  error,
  chainId,
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const shortAddress = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const networkName = chainId === 11155111 ? "Sepolia" : chainId ? `链 ${chainId}` : "未知网络";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-3 shadow-[var(--shadow-soft)]">
      {isConnected ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="m-0 flex items-center gap-1.5 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">
              <Wallet size={14} aria-hidden />
              已连接钱包
            </p>
            <strong className="mt-1 block font-[var(--font-mono)] text-sm text-[var(--ink)]">{shortAddress}</strong>
            <p className="m-0 mt-1 text-xs text-[var(--muted)]">网络：{networkName}</p>
          </div>
          <RoleButton variant="secondary" size="sm" onClick={onDisconnect}>
            断开连接
          </RoleButton>
        </div>
      ) : (
        <div className="grid gap-2">
          <RoleButton size="sm" disabled={isLoading} onClick={onConnect}>
            连接钱包
          </RoleButton>
          <p className="m-0 text-xs text-[var(--muted)]">请安装 MetaMask 或 Cobo Agentic Wallet 浏览器扩展。</p>
          {error ? <LedgerNotice tone="error">{error}</LedgerNotice> : null}
        </div>
      )}
    </div>
  );
}
