import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import {
  clearWalletConnection,
  normalizeWalletAccount,
  persistWalletConnection,
  shouldRestoreWallet,
  WALLET_AUTOCONNECT_KEY,
} from "../lib/wallet-core";

interface WalletContextValue {
  address: Address | null;
  signer: WalletClient | null;
  walletClient: WalletClient | null;
  chainId: number | null;
  shortAddress: string;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  connectWallet: () => Promise<string | null>;
  disconnect: () => void;
}

type BrowserEthereumProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortAddress = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const applyWalletState = useCallback(async (provider: BrowserEthereumProvider, rawAccount: string | null) => {
    if (!rawAccount) {
      setAddress(null);
      setWalletClient(null);
      return null;
    }

    const nextAddress = getAddress(rawAccount);
    const nextChainId = await readChainId(provider);
    setAddress(nextAddress);
    setChainId(nextChainId);
    setWalletClient(
      createWalletClient({
        account: nextAddress,
        chain: nextChainId === sepolia.id ? sepolia : undefined,
        transport: custom(provider),
      })
    );
    return nextAddress;
  }, []);

  const connectWallet = useCallback(async (): Promise<string | null> => {
    setError(null);
    const provider = getBrowserProvider();
    if (!provider) {
      setError("未检测到浏览器钱包。请安装 MetaMask 或 Cobo Agentic Wallet 扩展。");
      return null;
    }

    setIsLoading(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const connectedAddress = await applyWalletState(provider, normalizeWalletAccount(accounts));
      if (connectedAddress && typeof window !== "undefined") {
        persistWalletConnection(window.localStorage);
      }
      return connectedAddress;
    } catch (connectError) {
      console.error(connectError);
      setError("钱包连接失败，请检查钱包并重试。" + (connectError instanceof Error ? ` ${connectError.message}` : ""));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyWalletState]);

  const disconnect = useCallback(() => {
    if (typeof window !== "undefined") {
      clearWalletConnection(window.localStorage);
    }
    setAddress(null);
    setWalletClient(null);
    setChainId(null);
    setError(null);
  }, []);

  useEffect(() => {
    const provider = getBrowserProvider();
    if (!provider) return;

    let alive = true;
    const restore = async () => {
      try {
        const [accounts, currentChainId] = await Promise.all([
          provider.request({ method: "eth_accounts" }) as Promise<string[]>,
          readChainId(provider),
        ]);
        if (!alive) return;
        setChainId(currentChainId);
        const storedPreference =
          typeof window === "undefined" ? null : window.localStorage.getItem(WALLET_AUTOCONNECT_KEY);
        if (shouldRestoreWallet(accounts, storedPreference)) {
          await applyWalletState(provider, normalizeWalletAccount(accounts));
        }
      } catch {
        if (alive) {
          setAddress(null);
          setWalletClient(null);
        }
      }
    };

    restore();

    const handleAccountsChanged = (accounts: string[]) => {
      const storedPreference =
        typeof window === "undefined" ? null : window.localStorage.getItem(WALLET_AUTOCONNECT_KEY);
      if (!shouldRestoreWallet(accounts, storedPreference)) {
        setAddress(null);
        setWalletClient(null);
        return;
      }
      void applyWalletState(provider, normalizeWalletAccount(accounts));
    };
    const handleChainChanged = (chainIdHex: string) => {
      const nextChainId = Number.parseInt(chainIdHex, 16);
      setChainId(Number.isFinite(nextChainId) ? nextChainId : null);
      if (address) {
        void applyWalletState(provider, address);
      }
    };
    const handleDisconnect = () => {
      setAddress(null);
      setWalletClient(null);
      setChainId(null);
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    provider.on?.("disconnect", handleDisconnect);

    return () => {
      alive = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [address, applyWalletState]);

  const value: WalletContextValue = {
    address,
    signer: walletClient,
    walletClient,
    chainId,
    shortAddress,
    isLoading,
    isConnected: Boolean(address),
    error,
    connectWallet,
    disconnect,
  };

  return createElement(WalletContext.Provider, { value }, children);
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider.");
  }
  return context;
}

function getBrowserProvider() {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { ethereum?: BrowserEthereumProvider }).ethereum ?? null;
}

async function readChainId(provider: BrowserEthereumProvider) {
  const chainIdHex = await provider.request({ method: "eth_chainId" }) as string;
  const parsed = Number.parseInt(chainIdHex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}
