import type { AuditResponse } from "../lib/agent-api";
import { useState } from "react";
import { EmptyState } from "./ledger/EmptyState";
import { LedgerNotice } from "./ledger/LedgerNotice";
import { LedgerPanel } from "./ledger/LedgerPanel";
import { LedgerStatCard } from "./ledger/LedgerStatCard";
import { RoleButton } from "./ledger/RoleButton";
import { cn } from "../lib/utils";

interface AuditTrailProps {
  audit: AuditResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
}

export function AuditTrail({ audit, loading, error, onRefresh }: AuditTrailProps) {
  const [expanded, setExpanded] = useState(false);
  const items = audit?.items ?? [];
  const visibleItems = expanded ? items : items.slice(0, 4);

  return (
    <LedgerPanel className="mt-5">
      <div className="mb-4 flex items-start justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
        <div>
          <span className="role-kicker">审计轨迹</span>
          <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">Cobo 审计轨迹</h2>
          <p className="mt-2 text-[var(--muted)]">放行、拒绝与待处理记录。</p>
        </div>
        <RoleButton variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? "同步中..." : "同步"}
        </RoleButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <LedgerStatCard label="总计" value={audit?.count ?? 0} />
        <LedgerStatCard label="放行" value={audit?.allowed ?? 0} />
        <LedgerStatCard label="拒绝" value={audit?.denied ?? 0} />
      </div>

      <div className="mt-4 grid gap-2">
        {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
        {!error && items.length === 0 && <EmptyState description="暂无审计记录。" />}
        {visibleItems.map((item, index) => (
          <article
            key={`${item.created_at ?? "audit"}-${index}`}
            className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] p-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-start"
          >
            <span
              className={cn(
                "inline-flex min-h-7 items-center justify-center rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold",
                item.result === "allowed" && "border-[var(--success)] bg-[var(--success-soft)] text-[#215537]",
                item.result === "denied" && "border-[var(--danger)] bg-[var(--danger-soft)] text-[#7e2f26]",
                item.result !== "allowed" && item.result !== "denied" && "border-[var(--warning)] bg-[var(--warning-soft)] text-[#76550d]"
              )}
            >
              {formatAuditResult(item.result)}
            </span>
            <div className="min-w-0">
              <strong className="block font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{item.action || "Agent 操作"}</strong>
              <p className="mt-1 break-words font-[var(--font-mono)] text-xs text-[var(--muted)]">
                {item.principal_id ? `主体=${item.principal_id.slice(0, 10)}...` : "主体=-"}
                {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}
              </p>
            </div>
          </article>
        ))}
      </div>

      {items.length > 4 && (
        <RoleButton className="mt-4" variant="outline" size="sm" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "收起审计列表" : `展开 ${items.length} 条审计`}
        </RoleButton>
      )}
    </LedgerPanel>
  );
}

function formatAuditResult(result?: string) {
  if (result === "allowed") return "放行";
  if (result === "denied") return "拒绝";
  if (result === "pending") return "处理中";
  if (result === "error") return "错误";
  return result || "-";
}
