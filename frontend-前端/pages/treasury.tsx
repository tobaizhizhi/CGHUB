import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { FundRoundForm } from "../components/FundRoundForm";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useCoboStatus } from "../hooks/useCoboStatus";
import { useManagedRounds } from "../hooks/useManagedRounds";
import { useSettlementData } from "../hooks/useSettlementData";
import { fundRoundFromCoboTreasury } from "../lib/agent-api";
import { ROUND_STATUS_LABELS, type ManagedRound } from "../lib/managed-rounds";
import {
  buildPoolEntrypoints,
  managedRoundQuery,
  resolveSelectedManagedRound,
} from "../lib/pool-workspace";
import { summarizeCoboStatus } from "../lib/cobo-status";
import { formatUsdc, shortAddress } from "../lib/settlement-workspace";

export default function TreasuryPage() {
  const router = useRouter();
  const { rounds, loading, error } = useManagedRounds();
  const selectedRound = resolveSelectedManagedRound(rounds, router.query);
  const cobo = useCoboStatus();
  const summary = summarizeCoboStatus(cobo.status);
  const entrypoints = buildPoolEntrypoints(rounds);
  const byId = new Map(rounds.map((round) => [round.id, round]));

  if (selectedRound) return <SelectedTreasuryPage round={selectedRound} />;

  return (
    <WorkspaceShell
      title="资金"
      subtitle="查看 Cobo Treasury 总状态，并选择具体资金池进行创建或注资。"
    >
      <TreasuryMetrics summary={summary} />
      {cobo.error && <p className="workspace-error">{cobo.error}</p>}
      {error && <p className="workspace-error">{error}</p>}

      <section className="workspace-grid two-columns">
        <article className="workspace-panel">
          <div className="workspace-panel-header">
            <div>
              <span className="workspace-kicker">Cobo Treasury</span>
              <h2>资金钱包状态</h2>
            </div>
            <button className="workspace-button secondary" disabled={cobo.loading} onClick={cobo.refresh}>
              {cobo.loading ? "刷新中..." : "刷新"}
            </button>
          </div>
          <div className="policy-list">
            <div><span>资金钱包</span><strong>{summary.walletShort}</strong></div>
            <div><span>余额</span><strong>{summary.balanceLine}</strong></div>
            <div><span>主线 Pact</span><strong>{summary.mainPactStatus}</strong></div>
            <div><span>签名 Pact</span><strong>{summary.signPactStatus}</strong></div>
            <div><span>注资 Pact</span><strong>{summary.fundPactStatus}</strong></div>
            <div><span>护栏 Pact</span><strong>{summary.guardPactStatus}</strong></div>
          </div>
        </article>

        <article className="workspace-panel">
          <div className="workspace-panel-header">
            <div>
              <span className="workspace-kicker">待审批</span>
              <h2>钱包操作</h2>
            </div>
            <strong>{summary.pendingApprovalCount} 个</strong>
          </div>
          <PendingOperations operations={cobo.status?.pendingOperations ?? []} />
        </article>
      </section>

      <section className="workspace-grid two-columns">
        <PoolList
          title="可注资资金池"
          emptyText={loading ? "正在加载资金池..." : "暂无可注资资金池。"}
          actionLabel="注资"
          rounds={pickRounds(byId, entrypoints.fundablePoolIds)}
        />
        <PoolList
          title="待创建资金池"
          emptyText={loading ? "正在加载资金池..." : "暂无待创建资金池。"}
          actionLabel="创建"
          rounds={pickRounds(byId, entrypoints.creatablePoolIds)}
        />
      </section>
    </WorkspaceShell>
  );
}

function SelectedTreasuryPage({ round }: { round: ManagedRound }) {
  const settlement = useSettlementData({
    projectId: round.projectId,
    roundId: round.roundId,
    projectOwnerAddress: round.ownerAddress,
  });
  const { pool, cobo, capabilities } = settlement;
  const [createMessage, setCreateMessage] = useState("");
  const summary = summarizeCoboStatus(cobo.status);
  const createCapability = capabilities.createRound;
  const fundCapability = capabilities.fundWithCoboTreasury;
  const query = managedRoundQuery(round);

  const createRound = async () => {
    setCreateMessage("正在创建 Round...");
    try {
      const tx = await pool.createRound();
      setCreateMessage(`Round 已创建：${String(tx)}`);
    } catch (err) {
      setCreateMessage(err instanceof Error ? err.message : "创建 Round 失败");
    }
  };

  const fundWithCobo = async (amount: string) => {
    await fundRoundFromCoboTreasury(amount, {
      projectId: round.projectId,
      roundId: round.roundId,
    });
    await pool.refresh();
  };

  return (
    <WorkspaceShell
      settlement={settlement}
      poolContext={{
        title: round.activityName,
        detail: round.roundName,
        statusLabel: ROUND_STATUS_LABELS[round.status],
        query,
      }}
      title="资金"
      subtitle={`${round.activityName} / ${round.roundName} 的创建和 Cobo Treasury 注资。`}
    >
      <TreasuryMetrics summary={summary} />

      <section className="workspace-grid two-columns">
        <article className="workspace-panel">
          <span className="workspace-kicker">目标资金池</span>
          <h2>{round.activityName}</h2>
          <div className="policy-list">
            <div><span>轮次</span><strong>{round.roundName}</strong></div>
            <div><span>链上 ID</span><strong>{round.projectId} / {round.roundId}</strong></div>
            <div><span>当前状态</span><strong>{ROUND_STATUS_LABELS[round.status]}</strong></div>
            <div><span>已注资</span><strong>{formatUsdc(pool.round?.funded ?? round.funded)}</strong></div>
          </div>
        </article>

        <article className="workspace-panel">
          <span className="workspace-kicker">Cobo Treasury</span>
          <h2>指定池子注资</h2>
          <p>资金将从受控 Treasury 注入该资金池，不会默认写入其他轮次。</p>
          {pool.round?.exists ? (
            <>
              <FundRoundForm disabled={!fundCapability.enabled} onFund={fundWithCobo} embedded />
              {!fundCapability.enabled && <p className="workspace-muted">{fundCapability.reason}</p>}
            </>
          ) : (
            <>
              <button className="workspace-button primary" disabled={!createCapability.enabled} onClick={createRound}>
                创建 Round
              </button>
              {!createCapability.enabled && <p className="workspace-muted">{createCapability.reason}</p>}
              {createMessage && <p className="workspace-message">{createMessage}</p>}
            </>
          )}
        </article>
      </section>

      <section className="workspace-panel">
        <div className="workspace-panel-header">
          <div>
            <span className="workspace-kicker">策略与审批</span>
            <h2>钱包操作</h2>
          </div>
          <button className="workspace-button secondary" disabled={cobo.loading} onClick={cobo.refresh}>
            {cobo.loading ? "刷新中..." : "刷新资金状态"}
          </button>
        </div>
        <div className="policy-list">
          <div><span>资金钱包</span><strong>{summary.walletShort}</strong></div>
          <div><span>余额</span><strong>{summary.balanceLine}</strong></div>
          <div><span>主线 Pact</span><strong>{summary.mainPactStatus}</strong></div>
          <div><span>签名 Pact</span><strong>{summary.signPactStatus}</strong></div>
          <div><span>注资 Pact</span><strong>{summary.fundPactStatus}</strong></div>
          <div><span>Pact 统计</span><strong>{summary.pactStatsLine}</strong></div>
          <div><span>护栏 Pact</span><strong>{summary.guardPactStatus}</strong></div>
          <div><span>资金池合约</span><strong>{shortAddress(round.poolAddress)}</strong></div>
        </div>
        {cobo.error && <p className="workspace-error">{cobo.error}</p>}
      </section>
    </WorkspaceShell>
  );
}

function TreasuryMetrics({ summary }: { summary: ReturnType<typeof summarizeCoboStatus> }) {
  return (
    <section className="metric-strip">
      <Metric label="资金钱包" value={summary.walletShort} />
      <Metric label="余额" value={summary.balanceLine} />
      <Metric label="主线 Pact" value={summary.mainPactStatus} />
      <Metric label="签名 Pact" value={summary.signPactStatus} />
      <Metric label="注资 Pact" value={summary.fundPactStatus} />
      <Metric label="待审批" value={`${summary.pendingApprovalCount}`} />
    </section>
  );
}

function PendingOperations({ operations }: { operations: Array<{ id?: string; createdAt?: string; action?: string; status?: string }> }) {
  return (
    <div className="workspace-list">
      {operations.length === 0 ? (
        <p className="workspace-empty">暂无待审批操作。</p>
      ) : (
        operations.map((operation) => (
          <div key={operation.id ?? operation.createdAt} className="workspace-row pending">
            <div>
              <strong>{formatOperationAction(operation.action)}</strong>
              <p>{operation.createdAt || "无时间戳"}</p>
            </div>
            <span>{formatOperationStatus(operation.status)}</span>
          </div>
        ))
      )}
    </div>
  );
}

function PoolList({
  title,
  emptyText,
  actionLabel,
  rounds,
}: {
  title: string;
  emptyText: string;
  actionLabel: string;
  rounds: ManagedRound[];
}) {
  return (
    <article className="workspace-panel">
      <div className="workspace-panel-header">
        <div>
          <span className="workspace-kicker">资金池</span>
          <h2>{title}</h2>
        </div>
        <strong>{rounds.length} 个</strong>
      </div>
      <div className="workspace-list">
        {rounds.length === 0 ? (
          <p className="workspace-empty">{emptyText}</p>
        ) : (
          rounds.map((round) => (
            <div key={round.id} className={`workspace-row ${round.status}`}>
              <div>
                <strong>{round.activityName}</strong>
                <p>{round.roundName} · {ROUND_STATUS_LABELS[round.status]}</p>
              </div>
              <Link href={{ pathname: "/treasury", query: managedRoundQuery(round) }}>{actionLabel}</Link>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function formatOperationAction(action?: string) {
  if (!action) return "钱包操作";
  if (action === "contract_call") return "合约调用";
  if (action === "transfer") return "转账";
  return action;
}

function formatOperationStatus(status?: string) {
  if (!status) return "待处理";
  if (status === "pending") return "待处理";
  if (status === "approved") return "已批准";
  if (status === "rejected") return "已拒绝";
  if (status === "failed") return "失败";
  return status;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function pickRounds(byId: Map<string, ManagedRound>, ids: string[]) {
  return ids.map((id) => byId.get(id)).filter(Boolean) as ManagedRound[];
}
