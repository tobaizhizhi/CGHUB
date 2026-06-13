import { useQuery } from "@tanstack/react-query";
import { getRounds } from "../lib/agent-api";

export function useManagedRounds() {
  const query = useQuery({
    queryKey: ["managed-rounds"],
    queryFn: getRounds,
  });

  return {
    rounds: query.data?.items ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? "资金池列表加载失败" : "",
    refresh: query.refetch,
  };
}
