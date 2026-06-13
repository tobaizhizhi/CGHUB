import { useQuery } from "@tanstack/react-query";
import { getRound } from "../lib/agent-api";

export function useManagedRound(id?: string) {
  const query = useQuery({
    queryKey: ["managed-round", id],
    queryFn: () => getRound(id as string),
    enabled: Boolean(id),
  });

  return {
    round: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? "活动加载失败" : "",
    refresh: () => {
      void query.refetch();
    },
  };
}
