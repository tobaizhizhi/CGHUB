import { useCallback, useState } from "react";
import type { RoundScopeRequest } from "../lib/agent-api";
import { requestCoboDistribution } from "../lib/cobo-sdk";

interface DistributionRequest extends RoundScopeRequest {
  contributor: string;
}

export function useCoboWallet() {
  const [isCoboReady, setIsCoboReady] = useState(false);

  const connectCoboWallet = useCallback(async () => {
    // 这里可以扩展为真正的 Cobo Agentic Wallet 连接逻辑。
    setIsCoboReady(true);
    return true;
  }, []);

  const requestDistribution = useCallback(
    async (request: DistributionRequest) => {
      const result = await requestCoboDistribution({
        contributor: request.contributor,
        projectId: request.projectId,
        roundId: request.roundId,
      });
      return result;
    },
    []
  );

  return {
    isCoboReady,
    connectCoboWallet,
    requestDistribution,
  };
}
