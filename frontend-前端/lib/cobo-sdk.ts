import { triggerClaim, type RoundScopeRequest } from "./agent-api";

export interface CoboDistributionRequest extends RoundScopeRequest {
  contributor: string;
}

export async function requestCoboDistribution(request: CoboDistributionRequest) {
  const result = await triggerClaim({
    ...request,
    requestId: buildClaimRequestId(request),
  });

  if (result.skipped) {
    return `Cobo 代领已跳过：${result.reason || "当前没有可领取金额"}`;
  }

  return `Cobo 代领请求已提交：${result.txId || "无 txId"}，状态：${formatClaimStatus(result.status)}`;
}

function buildClaimRequestId(request: CoboDistributionRequest) {
  const projectId = request.projectId === undefined ? "default" : String(request.projectId);
  const roundId = request.roundId === undefined ? "default" : String(request.roundId);
  const contributor = request.contributor.slice(2, 10).toLowerCase();
  return `claim-ui-${projectId}-${roundId}-${contributor}-${Date.now().toString(36)}`;
}

function formatClaimStatus(status?: string) {
  if (!status || status === "submitted") return "已提交";
  if (status === "processing") return "处理中";
  if (status === "pending") return "处理中";
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return status;
}
