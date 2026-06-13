import { useMemo, useState } from "react";
import { useAgentDecisions } from "./useAgentDecisions";
import { useAuditTrail } from "./useAuditTrail";
import { useCoboStatus } from "./useCoboStatus";
import { useCoboWallet } from "./useCoboWallet";
import { useContributionPool, type ContributionPoolScope } from "./useContributionPool";
import { useSelectedRoundScope } from "./useSelectedRoundScope";
import { useWallet } from "./useWallet";
import { signContribution, type SignedContributionResponse } from "../lib/agent-api";
import {
  buildContributionScoringDescription,
  contributionEvidenceId,
  type ContributionFormValues,
} from "../lib/contribution-submission";
import { derivePoolCapabilities } from "../lib/pool-capabilities";
import {
  buildActivityTimeline,
  buildContributorSnapshots,
  buildPayoutRows,
  deriveRoundStatus,
  formatRoundStatus,
  formatUsdc,
  getNextAction,
  shortAddress,
  sumContributorPendingTotal,
  type SettlementRole,
} from "../lib/settlement-workspace";
import { deriveViewerIdentity } from "../lib/viewer-role";

export interface SettlementDataScope extends ContributionPoolScope {
  projectOwnerAddress?: string;
}

export function useSettlementData(scope?: SettlementDataScope) {
  const [message, setMessage] = useState("");
  const [scoringResult, setScoringResult] = useState<SignedContributionResponse | null>(null);
  const [claiming, setClaiming] = useState(false);
  const selectedRound = useSelectedRoundScope();
  const wallet = useWallet();
  const pool = useContributionPool(wallet.address, wallet.signer, scope ?? selectedRound.scope);
  const coboWallet = useCoboWallet();
  const cobo = useCoboStatus();
  const audit = useAuditTrail({ limit: 200, intervalMs: 8000 });
  const decisions = useAgentDecisions({
    projectId: pool.projectId,
    roundId: pool.roundId,
    activities: pool.activities,
    audit: audit.audit,
  });

  const contributors = useMemo(
    () =>
      buildContributorSnapshots({
        activities: pool.activities,
        walletAddress: wallet.address,
        walletScore: pool.score,
        walletClaimed: pool.claimed,
        walletPending: pool.pending,
      }),
    [pool.activities, pool.claimed, pool.pending, pool.score, wallet.address]
  );

  const pendingTotal = useMemo(
    () => sumContributorPendingTotal(contributors),
    [contributors]
  );
  const status = deriveRoundStatus(pool.round, pendingTotal);
  const statusLabel = formatRoundStatus(status);
  const appearsInPoolEvents = Boolean(
    wallet.address &&
      pool.activities.some(
        (activity) => activity.contributor?.toLowerCase() === wallet.address?.toLowerCase()
      )
  );
  const viewerIdentity = deriveViewerIdentity({
    walletAddress: wallet.address,
    projectOwnerAddress: scope?.projectOwnerAddress,
    contractOwnerAddress: pool.owner,
    coboTreasuryAddress: cobo.status?.srcAddress,
    score: pool.score,
    pending: pool.pending,
    claimed: pool.claimed,
    appearsInPoolEvents,
  });
  const capabilities = derivePoolCapabilities({
    roles: viewerIdentity.roles,
    round: pool.round,
    walletConnected: wallet.isConnected,
    pending: pool.pending,
    coboReady: Boolean(cobo.status?.srcAddress),
  });
  const role: SettlementRole =
    viewerIdentity.roles.includes("contractOwner") || viewerIdentity.roles.includes("projectOwner")
      ? "owner"
      : viewerIdentity.roles.includes("contributor")
        ? "contributor"
        : "readOnly";
  const nextAction = getNextAction(role, status);
  const payoutRows = buildPayoutRows({
    funded: pool.round?.funded ?? "0",
    totalScore: pool.round?.totalScore ?? "0",
    contributors,
  });
  const activityTimeline = buildActivityTimeline({
    poolActivities: pool.activities,
    decisions: decisions.decisions,
    auditItems: audit.audit?.items ?? [],
  });
  const myPayout = wallet.address
    ? payoutRows.find((row) => row.address.toLowerCase() === wallet.address?.toLowerCase())
    : undefined;

  const submitContributionFromWorkspace = async (values: ContributionFormValues) => {
    const contributionId = `${Date.now()}`;
    setMessage("");
    setScoringResult(null);
    const contributor = wallet.address ?? (await wallet.connectWallet());
    if (!contributor) throw new Error("请先连接钱包，Agent 需要你的钱包地址作为贡献者地址。");

    setMessage("AI Agent 正在抓取证据并评分，通常需要十几秒。高分贡献会在评分后进入 Cobo 审批。");
    let result;
    try {
      const scoringDescription = buildContributionScoringDescription(values);
      result = await signContribution({
        projectId: pool.projectId,
        roundId: pool.roundId,
        contributor,
        title: values.title,
        amount: values.impactScale,
        description: scoringDescription,
        contributionType: values.contributionType,
        evidenceUrl: values.evidenceUrl,
        impactScale: values.impactScale,
        occurredAt: values.occurredAt,
        source: "frontend",
        evidenceId: contributionEvidenceId(values, contributionId),
        paymentId: `frontend-${contributionId}`,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Agent 评分或 Cobo 审批提交失败。");
      await decisions.refresh();
      return;
    }

    setScoringResult(result);

    if (result.reviewStatus === "auto_allowed") {
      if (!result.recorded || !result.txHash) {
        setMessage(`贡献评分 ${result.score}。${result.reason} 已通过低风险审核，后台正在尝试 CAW 上链。`);
        await decisions.refresh();
        return;
      }
      setMessage(`贡献评分 ${result.score}。${result.reason} 已由 CAW 上链：${result.txHash}`);
      await pool.refresh();
      return;
    }

    if (result.reviewStatus === "pending_cobo_approval") {
      const coboRef = result.coboApprovalId || result.coboSignTxId;
      setMessage(`贡献评分 ${result.score}。该贡献需要 Cobo App 复核${coboRef ? `，审批单：${coboRef}` : "，审批单正在后台创建或同步"}。`);
      await decisions.refresh();
      return;
    }

    if (result.reviewStatus === "cobo_approved") {
      if (result.recorded && result.txHash) {
        setMessage(`Cobo App 已审批，贡献已由 CAW 上链：${result.txHash}`);
        await pool.refresh();
        return;
      }
      setMessage(`Cobo App 已审批，等待 CAW 上链结果。`);
      await decisions.refresh();
      return;
    }

    if (result.reviewStatus === "cobo_rejected") {
      setMessage(`Cobo App 已拒绝该评分 proof。`);
      await decisions.refresh();
      return;
    }

    if (result.reviewStatus === "needs_more_evidence") {
      setMessage(`需要补充证据：${result.reasons?.join("；") || result.reason}`);
      await decisions.refresh();
      return;
    }

    setMessage(`贡献未通过审批：${result.reasons?.join("；") || result.reason}`);
    await decisions.refresh();
  };

  const manualClaim = async () => {
    setClaiming(true);
    try {
      const contributor = wallet.address ?? (await wallet.connectWallet());
      if (!contributor) throw new Error("请先连接钱包，Cobo 代领需要贡献者地址。");
      setMessage("正在请求结算钱包代领...");
      await coboWallet.connectCoboWallet();
      const result = await coboWallet.requestDistribution({
        contributor,
        projectId: pool.projectId,
        roundId: pool.roundId,
      });
      setMessage(`${result}。链上确认可能需要稍等，页面会尝试刷新状态。`);
      pool.refresh().catch(() => {
        setMessage(`${result}。Cobo 已接收请求，链上状态稍后再刷新。`);
      });
    } catch (err) {
      setMessage(err instanceof Error
        ? `Cobo 代领请求失败：${err.message}`
        : "Cobo 代领请求失败，请稍后重试。");
      await decisions.refresh();
    } finally {
      setClaiming(false);
    }
  };

  return {
    wallet,
    pool,
    selectedRound,
    cobo,
    audit,
    decisions,
    status,
    statusLabel,
    viewerIdentity,
    capabilities,
    role,
    nextAction,
    contributors,
    payoutRows,
    activityTimeline,
    myPayout,
    fundedLabel: formatUsdc(pool.round?.funded ?? "0"),
    pendingTotalLabel: formatUsdc(pendingTotal),
    ownerShort: shortAddress(pool.owner),
    message,
    scoringResult,
    claiming,
    submitContribution: submitContributionFromWorkspace,
    manualClaim,
  };
}
