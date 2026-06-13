import { summarizeCoboStatus, type CoboStatusResponse } from "../lib/cobo-status";

interface GuardrailStatusProps {
  claimMaxAmount?: string;
  tokenId?: string;
  deniedCount?: number;
  coboStatus?: CoboStatusResponse | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export function GuardrailStatus({
  claimMaxAmount = "100",
  tokenId = "SETH_USDC",
  deniedCount = 0,
  coboStatus = null,
  loading = false,
  error = null,
  onRefresh,
}: GuardrailStatusProps) {
  const summary = summarizeCoboStatus(coboStatus);

  return (
    <section className="panel guard-panel">
      <div className="panel-header">
        <h2>Cobo Agent Wallet</h2>
        <p>Agent 的链上执行、资金动作和审计都收束在 Pact / 策略下。</p>
      </div>

      <div className="cobo-scan">
        <div className="scan-ring">
          <span>{loading ? "同步" : "CAW"}</span>
        </div>
        <div>
          <span>Cobo 钱包</span>
          <strong>{summary.walletShort}</strong>
          <p>{summary.balanceLine}</p>
        </div>
      </div>

      <div className="status-grid single cobo-status-grid">
        <div className="metric-card ok"><span>主线 Pact</span><strong>{summary.mainPactStatus}</strong></div>
        <div className="metric-card ok"><span>签名 Pact</span><strong>{summary.signPactStatus}</strong></div>
        <div className="metric-card ok"><span>注资 Pact</span><strong>{summary.fundPactStatus}</strong></div>
        <div className="metric-card ok"><span>护栏 Pact</span><strong>{summary.guardPactStatus}</strong></div>
        <div className="metric-card pending"><span>待审批</span><strong>{summary.pendingApprovalCount}</strong></div>
        <div className="metric-card"><span>Pact 统计</span><strong>{summary.pactStatsLine}</strong></div>
      </div>

      <div className="guard-rules">
        <div className="guard-rule">
          <span className="guard-tag ok">生效中</span>
          <strong>单笔转账上限 {claimMaxAmount} USDC</strong>
          <p>deny_if.amount_gt = {claimMaxAmount}</p>
        </div>
        <div className="guard-rule">
          <span className="guard-tag ok">Pact 已启用</span>
          <strong>{tokenId}</strong>
          <p>链：Sepolia / SETH</p>
        </div>
      </div>

      <div className="guard-result blocked">
        <strong>本轮已拦截 {deniedCount} 笔超额请求</strong>
        <p>计数来自 Agent 决策流；完整 Cobo 审计可在复盘页查看。</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="action-row">
        <button className="button secondary compact" onClick={onRefresh} disabled={loading}>
          {loading ? "同步中..." : "同步 Cobo 状态"}
        </button>
      </div>
    </section>
  );
}
