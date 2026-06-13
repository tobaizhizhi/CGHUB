import { useMemo } from "react";
import { buildManagerWorkspace } from "../lib/manager-workspace";
import type { ManagedRound } from "../lib/managed-rounds";

export function useManagerActivities(rounds: ManagedRound[]) {
  return useMemo(() => buildManagerWorkspace(rounds), [rounds]);
}
