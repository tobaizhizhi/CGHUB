export interface RoundScope {
  projectId?: string | number | bigint | null;
  roundId?: string | number | bigint | null;
}

export interface ResolvedRoundScope {
  projectId: number;
  roundId: number;
}

export const DEFAULT_PROJECT_ID = Number(process.env.NEXT_PUBLIC_PROJECT_ID || "1");
export const DEFAULT_ROUND_ID = Number(process.env.NEXT_PUBLIC_ROUND_ID || "1");

export function normalizeRoundScope(
  input: RoundScope = {},
  fallback: ResolvedRoundScope = {
    projectId: DEFAULT_PROJECT_ID,
    roundId: DEFAULT_ROUND_ID,
  }
): ResolvedRoundScope {
  return {
    projectId: positiveInteger(input.projectId, fallback.projectId),
    roundId: positiveInteger(input.roundId, fallback.roundId),
  };
}

export function scopeQuery(scope: ResolvedRoundScope) {
  return {
    projectId: String(scope.projectId),
    roundId: String(scope.roundId),
  };
}

function positiveInteger(value: RoundScope[keyof RoundScope], fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
