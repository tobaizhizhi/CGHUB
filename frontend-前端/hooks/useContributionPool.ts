import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { getAddress, parseUnits, type Address, type Hex, type WalletClient } from "viem";
import { getPoolReadOnly } from "../lib/contract";
import {
  contributionPoolViemAbi,
  erc20ViemAbi,
  getViemPublicClient,
  poolContractAddress,
} from "../lib/viem-contract";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_ROUND_ID,
  normalizeRoundScope,
  type RoundScope,
} from "../lib/round-scope";

export const PROJECT_ID = DEFAULT_PROJECT_ID;
export const ROUND_ID = DEFAULT_ROUND_ID;
const EVENT_LOOKBACK_BLOCKS = Number(process.env.NEXT_PUBLIC_EVENT_LOOKBACK_BLOCKS || "10");
export const USDC_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export interface RoundInfo {
  token: string;
  funded: string;
  totalScore: string;
  exists: boolean;
  finalized: boolean;
}

export interface PoolActivity {
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

export type ContributionPoolScope = RoundScope;

const resolveScope = normalizeRoundScope;

export function useContributionPool(
  address?: string | null,
  walletClient?: WalletClient | null,
  scope: ContributionPoolScope = {}
) {
  const { projectId, roundId } = resolveScope(scope);
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [score, setScore] = useState<string>("0");
  const [claimed, setClaimed] = useState<string>("0");
  const [pending, setPending] = useState<string>("0");
  const [owner, setOwner] = useState<string>("");
  const [agentSigner, setAgentSigner] = useState<string>("");
  const [activities, setActivities] = useState<PoolActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const readActivities = useCallback(async (pool: ethers.Contract) => {
    try {
      const provider = pool.runner as ethers.Provider;
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - EVENT_LOOKBACK_BLOCKS);
      const filters = (pool as any).filters;

      const [fundedLogs, contributionLogs, finalizedLogs, claimedLogs] = await Promise.all([
        pool.queryFilter(filters.RoundFunded(projectId, roundId), fromBlock, latestBlock),
        pool.queryFilter(filters.ContributionRecorded(projectId, roundId), fromBlock, latestBlock),
        pool.queryFilter(filters.RoundFinalized(projectId, roundId), fromBlock, latestBlock),
        pool.queryFilter(filters.Claimed(projectId, roundId), fromBlock, latestBlock),
      ]);

      const allLogs = [...fundedLogs, ...contributionLogs, ...finalizedLogs, ...claimedLogs] as any[];
      const blockNumbers = Array.from(new Set(allLogs.map((log) => log.blockNumber).filter(Boolean)));
      const timestampEntries = await Promise.all(
        blockNumbers.map(async (blockNumber) => {
          const block = await provider.getBlock(blockNumber).catch(() => null);
          return [blockNumber, block?.timestamp ? block.timestamp * 1000 : undefined] as const;
        })
      );
      const timestamps = new Map(
        timestampEntries.filter((entry): entry is readonly [number, number] => typeof entry[1] === "number")
      );

      const nextActivities: PoolActivity[] = [
        ...fundedLogs.map((log: any) => {
          const amount = log.args?.amount?.toString?.() ?? "-";
          return {
          id: `${log.transactionHash}-${log.index}`,
          type: "funded" as const,
          title: "Round 已注资",
          detail: `金额=${amount}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          ts: timestamps.get(log.blockNumber),
          amount,
        };
        }),
        ...contributionLogs.map((log: any) => {
          const contributor = log.args?.contributor as string | undefined;
          const score = log.args?.score?.toString?.() ?? "-";
          return {
          id: `${log.transactionHash}-${log.index}`,
          type: "contribution" as const,
          title: "贡献已记录",
          detail: `${short(contributor)} 分数=${score}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          ts: timestamps.get(log.blockNumber),
          contributor,
          score,
        };
        }),
        ...finalizedLogs.map((log: any) => ({
          id: `${log.transactionHash}-${log.index}`,
          type: "finalized" as const,
          title: "Round 已关闭",
          detail: `项目=${projectId} round=${roundId}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          ts: timestamps.get(log.blockNumber),
        })),
        ...claimedLogs.map((log: any) => {
          const contributor = log.args?.contributor as string | undefined;
          const amount = log.args?.amount?.toString?.() ?? "-";
          return {
          id: `${log.transactionHash}-${log.index}`,
          type: "claimed" as const,
          title: "分账已领取",
          detail: `${short(contributor)} 金额=${amount}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          ts: timestamps.get(log.blockNumber),
          contributor,
          amount,
        };
        }),
      ].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || b.blockNumber - a.blockNumber);

      setActivities(nextActivities);
    } catch {
      setActivities([]);
    }
  }, [projectId, roundId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pool = getPoolReadOnly();
      const [roundsResult, ownerResult, signerResult] = await Promise.all([
        pool.rounds(projectId, roundId),
        pool.owner().catch(() => ""),
        pool.agentSigner().catch(() => ""),
      ]);
      setRound({
        token: roundsResult.token,
        funded: roundsResult.funded?.toString() ?? "0",
        totalScore: roundsResult.totalScore?.toString() ?? "0",
        exists: Boolean(roundsResult.exists),
        finalized: Boolean(roundsResult.finalized),
      });
      setOwner(ownerResult);
      setAgentSigner(signerResult);

      if (address) {
        const [scoreResult, claimedResult, pendingResult] = await Promise.all([
          pool.scores(projectId, roundId, address),
          pool.claimed(projectId, roundId, address),
          pool.pending(projectId, roundId, address),
        ]);
        setScore(scoreResult?.toString() ?? "0");
        setClaimed(claimedResult?.toString() ?? "0");
        setPending(pendingResult?.toString() ?? "0");
      } else {
        setScore("0");
        setClaimed("0");
        setPending("0");
      }

      await readActivities(pool);
    } catch (err) {
      console.error(err);
      setError("读取合约数据失败，请检查 Sepolia RPC 和合约地址是否正确。" + (err instanceof Error ? ` ${err.message}` : ""));
    } finally {
      setLoading(false);
    }
  }, [address, projectId, readActivities, roundId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitContribution = useCallback(
    async (proof: unknown, signature: string) => {
      const account = requireWalletAccount(walletClient, address, "钱包未连接，无法发起合约调用。请先连接钱包。");
      const publicClient = getViemPublicClient();
      const hash = await walletClient!.writeContract({
        address: poolContractAddress,
        abi: contributionPoolViemAbi,
        functionName: "recordContributionBySig",
        args: [proof as any, signature as Hex],
        account,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    },
    [address, refresh, walletClient]
  );

  const fundRound = useCallback(
    async (amount: string) => {
      const account = requireWalletAccount(walletClient, address, "请先连接钱包再注资。");
      const value = parseUnits(amount, 6);
      if (value <= 0n) {
        throw new Error("注资金额必须大于 0。");
      }

      const publicClient = getViemPublicClient();
      const tokenAddress = getAddress(USDC_ADDRESS) as Address;
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20ViemAbi,
        functionName: "allowance",
        args: [account, poolContractAddress],
      });
      if (allowance < value) {
        const approveHash = await walletClient!.writeContract({
          address: tokenAddress,
          abi: erc20ViemAbi,
          functionName: "approve",
          args: [poolContractAddress, value],
          account,
          chain: null,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const hash = await walletClient!.writeContract({
        address: poolContractAddress,
        abi: contributionPoolViemAbi,
        functionName: "fundRound",
        args: [BigInt(projectId), BigInt(roundId), value],
        account,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    },
    [address, projectId, refresh, roundId, walletClient]
  );

  const createRound = useCallback(async (tokenAddress = USDC_ADDRESS) => {
    const account = requireWalletAccount(walletClient, address, "请先连接管理者钱包再开 Round。");
    const publicClient = getViemPublicClient();
    const hash = await walletClient!.writeContract({
      address: poolContractAddress,
      abi: contributionPoolViemAbi,
      functionName: "createRound",
      args: [BigInt(projectId), BigInt(roundId), getAddress(tokenAddress) as Address],
      account,
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await refresh();
    return hash;
  }, [address, projectId, refresh, roundId, walletClient]);

  const finalizeRound = useCallback(async () => {
    const account = requireWalletAccount(walletClient, address, "请先连接管理者钱包再关 Round。");
    const publicClient = getViemPublicClient();
    const hash = await walletClient!.writeContract({
      address: poolContractAddress,
      abi: contributionPoolViemAbi,
      functionName: "finalizeRound",
      args: [BigInt(projectId), BigInt(roundId)],
      account,
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await refresh();
    return hash;
  }, [address, projectId, refresh, roundId, walletClient]);

  return {
    projectId,
    roundId,
    tokenAddress: USDC_ADDRESS,
    round,
    score,
    claimed,
    pending,
    owner,
    agentSigner,
    activities,
    loading,
    error,
    refresh,
    submitContribution,
    createRound,
    fundRound,
    finalizeRound,
  };
}

function short(value?: string) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function requireWalletAccount(walletClient: WalletClient | null | undefined, address: string | null | undefined, message: string) {
  if (!walletClient || !address) {
    throw new Error(message);
  }
  return getAddress(address) as Address;
}
