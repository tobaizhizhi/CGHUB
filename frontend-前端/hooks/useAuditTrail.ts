import { useCallback, useEffect, useState } from "react";
import { getAudit, type AuditResponse } from "../lib/agent-api";

export function useAuditTrail(opts?: { limit?: number; intervalMs?: number }) {
  const limit = opts?.limit ?? 20;
  const intervalMs = opts?.intervalMs ?? 5000;
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setAudit(await getAudit(limit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "审计日志读取失败");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh({ silent: true }), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  return { audit, loading, error, refresh };
}
