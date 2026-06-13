import { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import {
  normalizeRoundScope,
  scopeQuery,
  type RoundScope,
} from "../lib/round-scope";

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function useSelectedRoundScope() {
  const router = useRouter();
  const scope = useMemo(
    () =>
      normalizeRoundScope({
        projectId: firstQueryValue(router.query.projectId),
        roundId: firstQueryValue(router.query.roundId),
      }),
    [router.query.projectId, router.query.roundId]
  );

  const selectRound = useCallback(
    async (input: RoundScope) => {
      const next = normalizeRoundScope(input, scope);
      await router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            ...scopeQuery(next),
          },
        },
        undefined,
        { shallow: true }
      );
    },
    [router, scope]
  );

  const query = useMemo(() => scopeQuery(scope), [scope]);

  return {
    scope,
    query,
    selectRound,
  };
}
