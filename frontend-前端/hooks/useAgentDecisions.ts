import { useCallback, useEffect, useState } from "react";
import type { PoolActivity } from "./useContributionPool";
import {
  AgentApiError,
  getDecisions,
  type AuditResponse,
  type DecisionEvent,
} from "../lib/agent-api";

interface UseAgentDecisionsOptions {
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  activities?: PoolActivity[];
  audit?: AuditResponse | null;
  intervalMs?: number;
}

export function useAgentDecisions(opts?: UseAgentDecisionsOptions) {
  const [decisions, setDecisions] = useState<DecisionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const activities = opts?.activities ?? [];
  const audit = opts?.audit ?? null;
  const intervalMs = opts?.intervalMs ?? 4000;
  const scope = {
    projectId: opts?.projectId,
    roundId: opts?.roundId,
  };

  const synthesize = useCallback(() => {
    const fromActivities = activities.flatMap<DecisionEvent>((activity) => {
      const contributor = activity.contributor ?? "";
      const ts = activity.ts ?? activity.blockNumber;
      const scopedFields =
        scope.projectId !== undefined && scope.roundId !== undefined
          ? { projectId: String(scope.projectId), roundId: String(scope.roundId) }
          : {};

      if (activity.type === "contribution") {
        return [
          {
            id: `activity-score-${activity.id}`,
            ts,
            ...scopedFields,
            stage: "score" as const,
            contributor,
            result: "allowed" as const,
            score: Number(activity.score ?? 0),
            reason: "链上 ContributionRecorded",
            txHash: activity.txHash,
          },
        ];
      }

      if (activity.type === "claimed") {
        return [
          {
            id: `activity-claim-${activity.id}`,
            ts,
            ...scopedFields,
            stage: "claim" as const,
            contributor,
            result: "allowed" as const,
            amount: activity.amount,
            txHash: activity.txHash,
            gasless: true,
          },
        ];
      }

      return [];
    });

    const fromAudit: DecisionEvent[] =
      audit?.items
        ?.filter((item) => item.result === "denied")
        .map((item, index) => {
          const parsedTs = item.created_at ? Date.parse(item.created_at) : NaN;
          return {
            id: `audit-denied-${item.created_at ?? index}-${item.action ?? "action"}`,
            ts: Number.isFinite(parsedTs) ? parsedTs : 0,
            stage: "guard" as const,
            contributor: item.principal_id ?? "",
            result: "denied" as const,
            reason: item.action || "策略拒绝",
          };
        }) ?? [];

    setDecisions([...fromActivities, ...fromAudit].sort((a, b) => b.ts - a.ts));
    setError(null);
  }, [activities, audit, scope.projectId, scope.roundId]);

  const refresh = useCallback(async () => {
    if (fallbackMode) {
      synthesize();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getDecisions(30, scope);
      setDecisions(response.items);
      setFallbackMode(false);
    } catch (err) {
      if (err instanceof AgentApiError && err.status === 404) {
        setFallbackMode(true);
        synthesize();
      } else {
        setError(err instanceof Error ? err.message : "决策流读取失败");
      }
    } finally {
      setLoading(false);
    }
  }, [fallbackMode, scope.projectId, scope.roundId, synthesize]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  useEffect(() => {
    if (fallbackMode) synthesize();
  }, [fallbackMode, synthesize]);

  return { decisions, loading, error, fallbackMode, refresh };
}
