import { useCallback, useEffect, useState } from "react";
import { getCoboStatus, type CoboStatusResponse } from "../lib/agent-api";

export function useCoboStatus(opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 7000;
  const [status, setStatus] = useState<CoboStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getCoboStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cobo 状态读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  return { status, loading, error, refresh };
}
