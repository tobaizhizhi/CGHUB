import { useEffect, useMemo, useState } from "react";
import { getPending } from "../lib/agent-api";
import {
  buildContributorPortfolio,
  type ContributorRoundBalance,
} from "../lib/contributor-workspace";
import type { ManagedRound } from "../lib/managed-rounds";

export function useContributorPortfolio(rounds: ManagedRound[], walletAddress?: string | null) {
  const [balances, setBalances] = useState<Record<string, ContributorRoundBalance>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!walletAddress || rounds.length === 0) {
      setBalances({});
      setLoading(false);
      setError("");
      return;
    }

    let alive = true;
    setLoading(true);
    setError("");

    Promise.all(
      rounds.map(async (round) => {
        const balance = await getPending(walletAddress, {
          projectId: round.projectId,
          roundId: round.roundId,
        });
        return [round.id, balance] as const;
      })
    )
      .then((entries) => {
        if (!alive) return;
        setBalances(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "贡献者收益数据加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [rounds, walletAddress]);

  const portfolio = useMemo(
    () =>
      buildContributorPortfolio({
        rounds,
        balances,
        walletConnected: Boolean(walletAddress),
      }),
    [balances, rounds, walletAddress]
  );

  return { portfolio, loading, error, balances };
}
