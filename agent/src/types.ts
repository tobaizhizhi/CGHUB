/**
 * 共享类型。字段顺序跟合约 EIP-712 一字不能错（白织说明 9.2）。
 */

/** 合约要的贡献证明结构，签名和上链都用这个 */
export interface ContributionProof {
  projectId: bigint;
  roundId: bigint;
  contributor: string;     // 收款地址，不能零地址
  score: bigint;           // 分数权重，必须 > 0
  proofHash: string;       // bytes32，防重放 key，唯一且非零
  paymentIdHash: string;   // bytes32，挂业务支付 id，对账用
  nonce: bigint;           // 参与签名，建议唯一
  deadline: bigint;        // proof 过期时间，unix 秒
}

/** 签好的一条记录，交给执行方上链 */
export interface SignedContribution {
  proof: ContributionProof;
  signature: string;       // 65 bytes EIP-712 签名
  signerMode?: 'local' | 'cobo';
  signerAddress?: string;
}

/** 组装 proof 的业务入参（score 由 Agent 评分模块生成） */
export interface ContributionInput {
  projectId?: string | number | bigint;
  roundId?: string | number | bigint;
  contributor: string;
  score: number;
  source: string;          // 贡献来源，如 github
  evidenceId: string;      // 证据 id，如 pr-123
  paymentId: string;       // 业务支付 id，进 paymentIdHash
  proofSalt?: string;      // proofHash 的盐，不传用默认；需与合约侧约定一致
}

export type ContributionReviewStatus =
  | 'auto_allowed'
  | 'pending_cobo_approval'
  | 'cobo_approved'
  | 'cobo_rejected'
  | 'rejected'
  | 'needs_more_evidence';

export interface ContributionReviewDecision {
  reviewStatus: ContributionReviewStatus;
  reasons: string[];
  triggeredRules: string[];
}

export type EvidenceType =
  | 'github_pull_request'
  | 'github_issue'
  | 'github_commit'
  | 'github_repo'
  | 'url'
  | 'text'
  | 'unknown';

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
  status: 'verified' | 'partial' | 'unverified' | 'unavailable';
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
    | 'verifiable_output'
    | 'project_impact'
    | 'project_relevance'
    | 'completion_quality'
    | 'claim_match'
    | 'time_reasonableness';
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
  source?: 'llm' | 'rule_fallback';
  fallbackScore?: number;
  sanityFlags?: string[];
  needsHumanReview?: boolean;
}

export interface AiScoringTrace {
  enabled: boolean;
  provider?: string;
  model?: string;
  status: 'disabled' | 'success' | 'failed' | 'skipped' | 'schema_invalid';
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

export interface ReviewableContributionSubmission {
  projectId: string;
  roundId: string;
  contributor: string;
  title: string;
  description: string;
  contributionType?: string;
  evidenceUrl?: string;
  impactScale?: string;
  occurredAt?: string;
  source: string;
  evidenceId: string;
  paymentId: string;
  score: number;
  scoreReason: string;
}

export interface ContributionReviewRecord extends ReviewableContributionSubmission {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: ContributionReviewStatus;
  reasons: string[];
  triggeredRules: string[];
  reviewer?: string;
  reviewNote?: string;
  coboSignTxId?: string;
  coboApprovalId?: string;
  coboApprovalKind?: 'contribution_proof' | 'risk_approval';
  coboSignStatus?: 'pending' | 'signed' | 'rejected';
  coboStatusDisplay?: string;
  signature?: string;
  proof?: Record<string, string>;
  signerMode?: 'local' | 'cobo';
  signerAddress?: string;
  recorded?: boolean;
  recordTxId?: string;
  txHash?: string;
  evidenceSnapshot?: EvidenceSnapshot;
  scoreBreakdown?: ScoreBreakdown;
  aiScoring?: AiScoringTrace;
}

export type DecisionStage =
  | 'received'
  | 'score'
  | 'review'
  | 'cobo_approval'
  | 'signed'
  | 'recorded'
  | 'guard'
  | 'claim'
  | 'fund'
  | 'payment';
export type DecisionResult = 'allowed' | 'denied' | 'pending' | 'error';

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

export interface CoboPactSummary {
  id: string;
  name?: string;
  status?: string;
  activatedAt?: string;
  expiresAt?: string;
  progressTxCount?: number;
  progressUsdSpent?: string;
  policies?: unknown[];
}

export interface CoboStatusResponse {
  walletId: string;
  srcAddress: string;
  chainId: string;
  tokenId: string;
  mainPact?: CoboPactSummary;
  signPact?: CoboPactSummary;
  fundPact?: CoboPactSummary;
  guardPact?: CoboPactSummary;
  pactStats?: {
    totalPacts?: number;
    activePacts?: number;
    txCount?: number;
    volumeUsd?: string;
  };
  balances: Array<{
    tokenId?: string;
    chainId?: string;
    address?: string;
    balance?: string;
    symbol?: string;
  }>;
  pendingOperations: Array<{
    id?: string;
    status?: string;
    action?: string;
    createdAt?: string;
  }>;
}
