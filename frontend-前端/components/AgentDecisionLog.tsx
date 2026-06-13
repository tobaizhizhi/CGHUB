import type { DecisionEvent } from "../lib/agent-api";

interface AgentDecisionLogProps {
  decisions: DecisionEvent[];
  loading: boolean;
  error: string | null;
  fallbackMode?: boolean;
}

export function AgentDecisionLog({
  decisions,
  loading,
  error,
  fallbackMode,
}: AgentDecisionLogProps) {
  return (
    <section className="console-panel decision-panel">
      <div className="panel-header">
        <h2>Agent 决策日志</h2>
        <p>评分、上链、护栏与分账的实时决策流。</p>
      </div>

      {fallbackMode && (
        <p className="fallback-note">决策流由链上事件合成（Agent 实时流未接入）</p>
      )}

      <div className="decision-list">
        {loading && (
          <>
            <div className="stream-skeleton" />
            <div className="stream-skeleton" />
            <div className="stream-skeleton" />
          </>
        )}
        {error && <p className="hint error">{error}</p>}
        {!loading && !error && decisions.length === 0 && (
          <p className="empty-state">等待 Agent 决策事件...</p>
        )}
        {decisions.map((decision) => (
          <article
            key={decision.id}
            className={`decision-row ${decision.stage} ${
              decision.result === "denied" || decision.result === "error" ? "denied" : ""
            }`}
          >
            <span className={`decision-dot ${decision.result}`} />
            <div>
              <span className={`decision-stage ${decision.result}`}>{formatDecisionStage(decision.stage)}</span>
              <p>{renderDecision(decision)}</p>
              <small>{formatTime(decision.ts)}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderDecision(decision: DecisionEvent) {
  const contributor = decision.contributor ? short(decision.contributor) : "未知地址";

  if (decision.stage === "received") return `-> 收到 ${contributor} 的贡献`;
  if (decision.stage === "score") {
    return `-> 计算得分 ${decision.score ?? "-"}${decision.reason ? `（${decision.reason}）` : ""}`;
  }
  if (decision.stage === "review") {
    const rules = decision.triggeredRules?.length ? ` · ${decision.triggeredRules.join(", ")}` : "";
    if (decision.result === "pending") return `-> 进入 Cobo 审批：${decision.reason ?? decision.reviewStatus ?? "-"}${rules}`;
    if (decision.result === "denied") return `x 审批拒绝：${decision.reason ?? decision.reviewStatus ?? "-"}${rules}`;
    return `-> 审批通过：${decision.reason ?? decision.reviewStatus ?? "-"}${rules}`;
  }
  if (decision.stage === "cobo_approval") {
    if (decision.result === "pending") return `-> 等待 Cobo App 审批：${decision.reason ?? decision.reviewStatus ?? "-"}`;
    if (decision.result === "denied") return `x Cobo App 拒绝：${decision.reason ?? decision.reviewStatus ?? "-"}`;
    return `-> Cobo App 审批通过：${decision.reason ?? decision.reviewStatus ?? "-"}`;
  }
  if (decision.stage === "signed") {
    const signer = decision.signerAddress ? short(decision.signerAddress) : "-";
    return `-> ${decision.reason ?? "EIP-712 签名完成"} 签名地址=${signer}`;
  }
  if (decision.stage === "recorded") {
    return `-> CAW 调用 recordContributionBySig${decision.txHash ? ` · ${shortHash(decision.txHash)}` : ""}`;
  }
  if (decision.stage === "guard") {
    if (decision.result === "denied") return `x 被策略拦截：${decision.reason ?? "-"}`;
    if (decision.result === "error") return `x 护栏探针异常：${decision.reason ?? "-"}`;
    if (decision.result === "pending") return `-> 护栏校验处理中：${decision.reason ?? "-"}`;
    return `-> Pact 护栏校验通过${decision.reason ? `（${decision.reason}）` : ""}`;
  }
  if (decision.stage === "claim") {
    if (decision.result === "denied") return `x 分账被拒：${decision.reason ?? "-"}`;
    if (decision.result === "error") return `x claimFor 失败：${decision.reason || "未知错误"}`;
    if (decision.result === "pending") return `-> 分账待处理：${decision.reason ?? "-"}`;
    const label = `✓ 代领 ${decision.amount ?? "-"} USDC${decision.gasless ? " · 零 gas" : ""}`;
    if (!decision.txHash) return label;
    return (
      <>
        {label} ·{" "}
        <a
          className="decision-link"
          href={`https://sepolia.etherscan.io/tx/${decision.txHash}`}
          target="_blank"
          rel="noreferrer"
        >
          Etherscan
        </a>
      </>
    );
  }
  if (decision.stage === "fund") {
    return `-> CAW 资金钱包调用 fundRound ${decision.amount ?? "-"} USDC${
      decision.txHash ? ` · ${shortHash(decision.txHash)}` : ""
    }`;
  }
  if (decision.stage === "payment") {
    return `-> Cobo 支付（x402）${decision.reason ? ` · ${decision.reason}` : ""}`;
  }

  return decision.reason ?? decision.stage;
}

function formatDecisionStage(stage: string) {
  if (stage === "received") return "已接收";
  if (stage === "score") return "评分";
  if (stage === "review") return "审批";
  if (stage === "cobo_approval") return "Cobo审批";
  if (stage === "signed") return "签名";
  if (stage === "recorded") return "上链";
  if (stage === "guard") return "护栏";
  if (stage === "claim") return "分账";
  if (stage === "fund") return "注资";
  if (stage === "payment") return "支付";
  return stage;
}

function formatTime(ts: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString();
}

function short(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
