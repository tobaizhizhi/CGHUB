import { useMemo, useState } from "react";
import type { RoundInfo } from "../hooks/useContributionPool";
import { FundRoundForm } from "./FundRoundForm";

interface FunderActionsProps {
  isConnected: boolean;
  address?: string | null;
  owner?: string;
  projectId: number;
  roundId: number;
  tokenAddress: string;
  round: RoundInfo | null;
  totalScore: string;
  funded: string;
  onCreateRound(): Promise<unknown>;
  onFund(amount: string): Promise<unknown>;
  onFinalizeRound(): Promise<unknown>;
  onManualClaim(): Promise<void>;
  claiming: boolean;
}

export function FunderActions({
  isConnected,
  address,
  owner,
  projectId,
  roundId,
  tokenAddress,
  round,
  totalScore,
  funded,
  onCreateRound,
  onFund,
  onFinalizeRound,
  onManualClaim,
  claiming,
}: FunderActionsProps) {
  const [open, setOpen] = useState(true);
  const [busyAction, setBusyAction] = useState<"create" | "finalize" | null>(null);
  const [message, setMessage] = useState("");

  const isOwner = useMemo(() => {
    if (!address || !owner) return false;
    return address.toLowerCase() === owner.toLowerCase();
  }, [address, owner]);

  if (!isConnected) return null;

  const canCreate = isOwner && !round?.exists;
  const canFund = isOwner && Boolean(round?.exists) && !round?.finalized;
  const canFinalize =
    isOwner &&
    Boolean(round?.exists) &&
    !round?.finalized &&
    BigInt(funded || "0") > 0n &&
    BigInt(totalScore || "0") > 0n;

  const runOwnerAction = async (
    action: "create" | "finalize",
    callback: () => Promise<unknown>
  ) => {
    setBusyAction(action);
    setMessage(action === "create" ? "正在创建 Round..." : "正在关闭 Round...");
    try {
      const result = await callback();
      setMessage(`${action === "create" ? "Round 已创建" : "Round 已关闭"}：${String(result)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "项目方操作失败");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="console-panel funder-actions">
      <button className="fold-button" onClick={() => setOpen((current) => !current)}>
        项目方 Round 控制台
        <span>{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="round-control">
          <div className="round-control-header">
            <div>
              <span className={isOwner ? "owner-badge ok" : "owner-badge locked"}>
                {isOwner ? "已连接项目方" : "仅项目方"}
              </span>
              <h2>Round 生命周期</h2>
              <p>开 round、注资、关 round 都应该在 demo 里可见；贡献提交和 Cobo 分账夹在中间。</p>
            </div>
            <div className="round-id-stack">
              <span>项目 / Round</span>
              <strong>{projectId} / {roundId}</strong>
            </div>
          </div>

          <div className="lifecycle-rail">
            <LifecycleStep
              index="01"
              title="创建"
              detail={round?.exists ? "Round 已创建" : "等待项目方创建"}
              active={Boolean(round?.exists)}
            />
            <LifecycleStep
              index="02"
              title="注资"
              detail={`${funded} 原始 USDC`}
              active={BigInt(funded || "0") > 0n}
            />
            <LifecycleStep
              index="03"
              title="评分"
              detail={`${totalScore} 总分`}
              active={BigInt(totalScore || "0") > 0n}
            />
            <LifecycleStep
              index="04"
              title="关闭"
              detail={round?.finalized ? "已进入领取阶段" : "等待关闭"}
              active={Boolean(round?.finalized)}
            />
          </div>

          <div className="funder-actions-body">
            <div className="owner-action-card">
              <div className="panel-header">
                <h2>开 Round</h2>
                <p>调用 createRound(projectId, roundId, token)，token 使用当前 USDC 配置。</p>
              </div>
              <div className="owner-action-meta">
                <span>代币</span>
                <strong>{short(tokenAddress)}</strong>
              </div>
              <button
                className="button primary"
                disabled={!canCreate || busyAction !== null}
                onClick={() => runOwnerAction("create", onCreateRound)}
              >
                {busyAction === "create" ? "创建中..." : "创建 Round"}
              </button>
            </div>

            <FundRoundForm disabled={!canFund} onFund={onFund} embedded />

            <div className="owner-action-card finalize-card">
              <div className="panel-header">
                <h2>关 Round</h2>
                <p>调用 finalizeRound 后贡献和注资都会锁定，贡献者才可以领取。</p>
              </div>
              <button
                className="button primary"
                disabled={!canFinalize || busyAction !== null}
                onClick={() => runOwnerAction("finalize", onFinalizeRound)}
              >
                {busyAction === "finalize" ? "关闭中..." : "关闭 Round"}
              </button>
              {!canFinalize && (
                <p className="hint">
                  需要 owner 钱包、已创建 round、已注资且 totalScore 大于 0。
                </p>
              )}
            </div>
          </div>

          <div className="manual-claim-box">
            <div>
              <strong>手动补领（高级）</strong>
              <p>兜底触发 claimFor；主路径以 Agent 决策流和链上事件为准。</p>
            </div>
            <button className="button secondary" onClick={onManualClaim} disabled={claiming}>
              {claiming ? "补领中..." : "手动补领"}
            </button>
          </div>

          {!isOwner && (
            <p className="hint error">当前连接钱包不是合约 owner，只能查看生命周期，不能开关 round 或注资。</p>
          )}
          {message && <p className="console-message">{message}</p>}
        </div>
      )}
    </section>
  );
}

function LifecycleStep({
  index,
  title,
  detail,
  active,
}: {
  index: string;
  title: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div className={`lifecycle-step ${active ? "active" : ""}`}>
      <span>{index}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function short(value?: string) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
