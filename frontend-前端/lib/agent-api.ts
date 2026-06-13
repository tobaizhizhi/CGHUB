import type { ManagedRound } from "./managed-rounds";

const AGENT_API_URL = (
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8787"
).replace(/\/$/, "");

export type { CoboPactSummary, CoboStatusResponse } from "./cobo-status";

export type ContributionReviewStatus =
  | "auto_allowed"
  | "pending_cobo_approval"
  | "cobo_approved"
  | "cobo_rejected"
  | "rejected"
  | "needs_more_evidence";

export type EvidenceType =
  | "github_pull_request"
  | "github_issue"
  | "github_commit"
  | "github_repo"
  | "url"
  | "text"
  | "unknown";

export interface EvidenceSnapshot {
  evidenceKey: string;
  evidenceUrl?: string;
  evidenceId: string;
  type: EvidenceType;
  title?: string;
  summary?: string;
  sourceHost?: string;
  fetchedAt: number;
  confidence: number;
  status: "verified" | "partial" | "unverified" | "unavailable";
  warnings: string[];
  github?: {
    owner: string;
    repo: string;
    number?: number;
    sha?: string;
    author?: string;
    state?: string;
    merged?: boolean;
    mergedAt?: string;
    createdAt?: string;
    updatedAt?: string;
    changedFiles?: number;
    additions?: number;
    deletions?: number;
    files?: string[];
    htmlUrl?: string;
  };
}

export interface ScoreDimension {
  key:
    | "verifiable_output"
    | "project_impact"
    | "project_relevance"
    | "completion_quality"
    | "claim_match"
    | "time_reasonableness";
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
  evidenceRefs?: string[];
}

export interface ScoreBreakdown {
  score: number;
  confidence: number;
  dimensions: ScoreDimension[];
  reasons: string[];
  riskFlags: string[];
  rubricVersion?: string;
  source?: "llm" | "rule_fallback";
  fallbackScore?: number;
  sanityFlags?: string[];
  needsHumanReview?: boolean;
}

export interface AiScoringTrace {
  enabled: boolean;
  provider?: string;
  model?: string;
  status: "disabled" | "success" | "failed" | "skipped" | "schema_invalid";
  score?: number;
  confidence?: number;
  dimensions?: ScoreDimension[];
  summary?: string;
  suggestedScore?: number;
  riskFlags?: string[];
  reasoning?: string;
  needsHumanReview?: boolean;
  validationErrors?: string[];
  rawText?: string;
  error?: string;
  createdAt: number;
}

export interface ContributionReviewRecord {
  id: string;
  projectId: string;
  roundId: string;
  contributor: string;
  title: string;
  description?: string;
  contributionType?: string;
  evidenceUrl?: string;
  impactScale?: string;
  occurredAt?: string;
  score: number;
  scoreReason: string;
  status: ContributionReviewStatus;
  reasons: string[];
  triggeredRules: string[];
  reviewer?: string;
  reviewNote?: string;
  coboSignTxId?: string;
  coboApprovalId?: string;
  coboApprovalKind?: "contribution_proof" | "risk_approval";
  coboSignStatus?: "pending" | "signed" | "rejected";
  coboStatusDisplay?: string;
  recorded?: boolean;
  recordTxId?: string;
  txHash?: string;
  signerMode?: "local" | "cobo";
  signerAddress?: string;
  evidenceSnapshot?: EvidenceSnapshot;
  scoreBreakdown?: ScoreBreakdown;
  aiScoring?: AiScoringTrace;
  createdAt: number;
  updatedAt: number;
}

export interface SignedContributionResponse {
  reviewStatus: ContributionReviewStatus;
  reviewId: string;
  recorded?: boolean;
  recordTxId?: string;
  txHash?: string;
  score: number;
  reason: string;
  reasons?: string[];
  triggeredRules: string[];
  coboSignTxId?: string;
  coboApprovalId?: string;
  coboApprovalKind?: "contribution_proof" | "risk_approval";
  coboStatusDisplay?: string;
  signerMode?: "local" | "cobo";
  signerAddress?: string;
  evidenceSnapshot?: EvidenceSnapshot;
  scoreBreakdown?: ScoreBreakdown;
  aiScoring?: AiScoringTrace;
}

export interface SubmitContributionResponse {
  txId?: string;
  status?: string;
  txHash: string;
}

export interface CoboFundRoundResponse {
  approve: { txId: string; status: string; txHash?: string };
  fund: { txId: string; status: string; txHash?: string };
}

export interface CoboPayX402Response {
  id?: string;
  status: string;
  retryHeaders: Record<string, string>;
  txHash?: string;
}

export interface RoundsResponse {
  items: ManagedRound[];
}

export interface NextRoundIdResponse {
  projectId: string;
  roundId: string;
  strategy: "nextProjectIdRoundOne";
}

export interface RoundIdAvailabilityResponse {
  available: boolean;
  registryExists: boolean;
  chainExists: boolean;
  reason?: string;
}

export interface CreateDraftActivityRequest {
  activityTitle: string;
  activityDescription: string;
  roundName: string;
  projectOwnerAddress: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  startsAt?: string;
  endsAt?: string;
  contributionGuide?: string;
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  createdBy?: string;
}

export interface ManagedActivityMutationResponse {
  item: ManagedRound;
}

export interface MarkActivityCreatedRequest {
  createTxHash: string;
  createdBy?: string;
}

export interface MarkActivityFinalizedRequest {
  finalizeTxHash: string;
  finalizedBy?: string;
}

export interface RoundScopeRequest {
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
}

export interface SubmitContributionRequest {
  proof: Record<string, string>;
  signature: string;
}

export interface PendingResponse {
  pending: string;
  score: string;
  claimed: string;
}

export interface TriggerClaimResponse {
  txId?: string;
  status?: string;
  txHash?: string;
  skipped?: boolean;
  reason?: string;
}

export interface SignContributionRequest {
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  contributor: string;
  title: string;
  amount?: string;
  description: string;
  contributionType?: string;
  evidenceUrl?: string;
  impactScale?: string;
  occurredAt?: string;
  source: string;
  evidenceId: string;
  paymentId?: string;
}

export interface TriggerClaimRequest extends RoundScopeRequest {
  contributor: string;
  requestId?: string;
}

export type DecisionStage =
  | "received"
  | "score"
  | "review"
  | "cobo_approval"
  | "signed"
  | "recorded"
  | "guard"
  | "claim"
  | "fund"
  | "payment";
export type DecisionResult = "allowed" | "denied" | "pending" | "error";

export interface DecisionEvent {
  id: string;
  ts: number;
  projectId?: string;
  roundId?: string;
  roundRegistryId?: string;
  stage: DecisionStage;
  contributor: string;
  result: DecisionResult;
  score?: number;
  reason?: string;
  amount?: string;
  txHash?: string;
  gasless?: boolean;
  signerAddress?: string;
  reviewStatus?: ContributionReviewStatus;
  triggeredRules?: string[];
  reviewId?: string;
}

export interface DecisionsResponse {
  items: DecisionEvent[];
}

export type ActivityRegistryEventType =
  | "round_draft_created"
  | "round_created"
  | "round_funded"
  | "contribution_submitted"
  | "contribution_scored"
  | "contribution_reviewed"
  | "contribution_recorded"
  | "round_finalized"
  | "claim_triggered"
  | "claim_recorded";

export interface ActivityRegistryEvent {
  id: string;
  ts: number;
  projectId?: string;
  roundId?: string;
  roundRegistryId?: string;
  contributor?: string;
  type: ActivityRegistryEventType;
  reviewId?: string;
  decisionId?: string;
  coboTxId?: string;
  coboApprovalId?: string;
  txHash?: string;
  result: "pending" | "success" | "failed" | "denied";
  detail?: string;
  data?: Record<string, unknown>;
}

export interface AgentRegistryResponse {
  reviews: ContributionReviewRecord[];
  decisions: DecisionEvent[];
  activityEvents: ActivityRegistryEvent[];
}

export class AgentApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

interface AgentRequestInit extends RequestInit {
  timeoutMs?: number;
}

async function requestAgent<T>(path: string, init?: AgentRequestInit): Promise<T> {
  const { timeoutMs, signal, ...fetchInit } = init ?? {};
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const requestSignal = timeout && signal ? AbortSignal.any([signal, timeout]) : timeout ?? signal;

  try {
    const response = await fetch(`${AGENT_API_URL}${path}`, {
      ...fetchInit,
      signal: requestSignal,
      headers: {
        "content-type": "application/json",
        ...(fetchInit.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = typeof data?.error === "string" ? data.error : response.statusText;
      throw new AgentApiError(response.status, `Agent API ${response.status}: ${message}`);
    }

    return data as T;
  } catch (err) {
    if (err instanceof AgentApiError) throw err;
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new AgentApiError(408, `Agent API 请求超时，请稍后重试。`);
    }
    throw err;
  }
}

export function signContribution(request: SignContributionRequest) {
  return requestAgent<SignedContributionResponse>("/api/sign-contribution", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getContributionReviews(filter: {
  status?: ContributionReviewStatus;
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  contributor?: string;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.projectId !== undefined) params.set("projectId", String(filter.projectId));
  if (filter.roundId !== undefined) params.set("roundId", String(filter.roundId));
  if (filter.contributor) params.set("contributor", filter.contributor);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  const query = params.toString();
  return requestAgent<{ items: ContributionReviewRecord[] }>(`/api/reviews${query ? `?${query}` : ""}`);
}

export function requestMoreEvidence(id: string, input: { reviewer?: string; reviewNote?: string } = {}) {
  return requestAgent<{ item: ContributionReviewRecord }>(
    `/api/reviews/${encodeURIComponent(id)}/needs-more-evidence`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export function submitContribution(request: SubmitContributionRequest) {
  return requestAgent<SubmitContributionResponse>("/api/submit-contribution", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getPending(contributor: string, scope: RoundScopeRequest = {}) {
  const params = new URLSearchParams({ contributor });
  if (scope.projectId !== undefined) params.set("projectId", String(scope.projectId));
  if (scope.roundId !== undefined) params.set("roundId", String(scope.roundId));
  return requestAgent<PendingResponse>(
    `/api/pending?${params.toString()}`
  );
}

export function triggerClaim(request: string | TriggerClaimRequest) {
  const body = typeof request === "string" ? { contributor: request } : request;
  return requestAgent<TriggerClaimResponse>("/api/trigger-claim", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 20_000,
  });
}

export interface AuditItem {
  result: "allowed" | "denied" | "pending" | "error";
  action?: string;
  principal_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface AuditResponse {
  count: number;
  allowed: number;
  denied: number;
  items: AuditItem[];
}

export function getAudit(limit = 20) {
  return requestAgent<AuditResponse>(`/api/audit?limit=${limit}`);
}

export function getDecisions(limit = 30, scope: RoundScopeRequest = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (scope.projectId !== undefined) params.set("projectId", String(scope.projectId));
  if (scope.roundId !== undefined) params.set("roundId", String(scope.roundId));
  return requestAgent<DecisionsResponse>(`/api/decisions?${params.toString()}`);
}

export function getAgentRegistry(filter: RoundScopeRequest & { contributor?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (filter.projectId !== undefined) params.set("projectId", String(filter.projectId));
  if (filter.roundId !== undefined) params.set("roundId", String(filter.roundId));
  if (filter.contributor) params.set("contributor", filter.contributor);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  const query = params.toString();
  return requestAgent<AgentRegistryResponse>(`/api/agent-registry${query ? `?${query}` : ""}`);
}

export function getRounds() {
  return requestAgent<RoundsResponse>("/api/rounds");
}

export function getRound(id: string) {
  return requestAgent<ManagedRound>(`/api/rounds/${encodeURIComponent(id)}`);
}

export function getNextRoundId() {
  return requestAgent<NextRoundIdResponse>("/api/manager/next-round-id");
}

export function checkRoundIdAvailability(scope: RoundScopeRequest & { checkChain?: boolean }) {
  const params = new URLSearchParams();
  if (scope.projectId !== undefined) params.set("projectId", String(scope.projectId));
  if (scope.roundId !== undefined) params.set("roundId", String(scope.roundId));
  if (scope.checkChain) params.set("checkChain", "1");
  return requestAgent<RoundIdAvailabilityResponse>(
    `/api/manager/round-id-availability?${params.toString()}`
  );
}

export function createDraftActivity(request: CreateDraftActivityRequest) {
  return requestAgent<ManagedActivityMutationResponse>("/api/manager/activities/draft", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function markActivityCreated(id: string, request: MarkActivityCreatedRequest) {
  return requestAgent<ManagedActivityMutationResponse>(
    `/api/manager/activities/${encodeURIComponent(id)}/mark-created`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );
}

export function markActivityFinalized(id: string, request: MarkActivityFinalizedRequest) {
  return requestAgent<ManagedActivityMutationResponse>(
    `/api/manager/activities/${encodeURIComponent(id)}/mark-finalized`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );
}

export function getCoboStatus() {
  return requestAgent<import("./cobo-status").CoboStatusResponse>("/api/cobo/status");
}

export function fundRoundFromCoboTreasury(amount: string, scope: RoundScopeRequest = {}) {
  return requestAgent<CoboFundRoundResponse>("/api/cobo/fund-round", {
    method: "POST",
    body: JSON.stringify({ amount, ...scope }),
  });
}

export function payX402WithCobo(paymentRequired: string, requestId?: string) {
  return requestAgent<CoboPayX402Response>("/api/cobo/pay-x402", {
    method: "POST",
    body: JSON.stringify({ paymentRequired, requestId }),
  });
}

export interface GuardDemoResponse {
  blocked: boolean;
  amount: string;
  reason?: string;
  txId?: string;
}

export function triggerSafetyProbe(amount: string) {
  return requestAgent<GuardDemoResponse>("/api/cobo/safety-probe", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function triggerGuardDemo(amount: string) {
  return requestAgent<GuardDemoResponse>("/api/guard-demo", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}
