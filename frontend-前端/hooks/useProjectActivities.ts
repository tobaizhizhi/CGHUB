import { useMemo } from "react";
import { buildProjectWorkspace } from "../lib/project-workspace";
import type { ManagedRound } from "../lib/managed-rounds";

export function useProjectActivities(rounds: ManagedRound[]) {
  return useMemo(() => buildProjectWorkspace(rounds), [rounds]);
}
