import { buildProof, recordContribution } from './contribution-recorder.js';
import {
  contributionReviewStore,
  type ContributionReviewStore,
} from './contribution-review-store.js';
import type { ContributionReviewRecord, ContributionProof } from './types.js';
import { submitContributionTool } from '../tools/submit-contribution.js';
import {
  readCoboMessageSignStatus,
  submitCoboTypedDataForSignature,
  type CoboMessageSignStatus,
} from './cobo-message-signer.js';
import {
  signProofWithMode,
  typedDataForCoboProof,
  verifyProofSignature,
  type ProofSignatureResult,
} from './proof-signer.js';
import { config, EIP712_DOMAIN } from './config.js';

export interface RecordedContributionReview {
  review: ContributionReviewRecord;
  recordTxId?: string;
  txHash?: string;
  status?: string;
  coboPending?: boolean;
  coboRejected?: boolean;
}

export interface SignAndRecordContributionReviewDeps {
  store?: ContributionReviewStore;
  submitContribution?: typeof submitContributionTool.handler;
  submitCoboTypedData?: typeof submitCoboTypedDataForSignature;
  readCoboMessageSign?: typeof readCoboMessageSignStatus;
  signContributionProof?: (proof: ContributionProof) => Promise<ProofSignatureResult>;
}

export async function signAndRecordContributionReview(
  review: ContributionReviewRecord,
  deps: SignAndRecordContributionReviewDeps = {},
): Promise<RecordedContributionReview> {
  const store = deps.store ?? contributionReviewStore;
  const submitContribution = deps.submitContribution ?? submitContributionTool.handler;
  const signed = await recordContribution({
    projectId: review.projectId,
    roundId: review.roundId,
    contributor: review.contributor,
    score: review.score,
    source: review.source,
    evidenceId: review.evidenceId,
    paymentId: review.paymentId,
  });
  const proof = serializeProof(signed.proof);
  store.attachSignedProof(review.id, {
    proof,
    signature: signed.signature,
    signerMode: signed.signerMode,
    signerAddress: signed.signerAddress,
  });

  const submitted = await submitContribution({ proof, signature: signed.signature });
  const recorded = store.attachTxHash(review.id, {
    txHash: submitted.txHash,
    recordTxId: submitted.txId,
  });

  return {
    review: recorded,
    recordTxId: submitted.txId,
    txHash: submitted.txHash,
    status: submitted.status,
  };
}

export async function requestCoboApprovalForContributionReview(
  review: ContributionReviewRecord,
  deps: SignAndRecordContributionReviewDeps = {},
): Promise<RecordedContributionReview> {
  const store = deps.store ?? contributionReviewStore;
  const submitCoboTypedData = deps.submitCoboTypedData ?? submitCoboTypedDataForSignature;
  const proof = buildProof(contributionInputFromReview(review));
  const serializedProof = serializeProof(proof);
  const coboApprovalKind = coboApprovalKindForReview(review);
  const submitted = await submitCoboTypedData(coboApprovalTypedData(review, proof, coboApprovalKind), {
    sync: false,
    description: coboApprovalDescription(review, coboApprovalKind),
    requestId: `approval-${proof.proofHash.slice(2, 18)}`,
  });

  let updated = store.attachCoboSignRequest(review.id, {
    proof: serializedProof,
    coboSignTxId: submitted.txId,
    coboApprovalId: submitted.approvalId,
    coboApprovalKind,
    coboSignStatus: submitted.state === 'signed' ? 'signed' : submitted.state === 'rejected' ? 'rejected' : 'pending',
    coboStatusDisplay: submitted.statusDisplay,
  });

  if (submitted.state === 'rejected') {
    updated = store.updateStatus(review.id, {
      status: 'cobo_rejected',
      reviewNote: submitted.failedReason ?? submitted.statusDisplay,
    });
    return { review: updated, coboRejected: true };
  }

  if (submitted.signature) {
    throw new Error(
      `Cobo Sign Pact 未触发人工审批：review ${review.id} 命中 ${review.triggeredRules.join(',') || 'risk'}，请重新生成并 approve 新 Sign Pact`,
    );
  }

  return {
    review: updated,
    coboPending: true,
    status: submitted.statusDisplay,
  };
}

export async function syncCoboApprovalAndRecordContributionReview(
  review: ContributionReviewRecord,
  deps: SignAndRecordContributionReviewDeps = {},
): Promise<RecordedContributionReview> {
  const store = deps.store ?? contributionReviewStore;
  const readCoboMessageSign = deps.readCoboMessageSign ?? readCoboMessageSignStatus;

  if (review.recorded) return { review };
  if (review.signature) return recordCoboSignedContributionReview(review, review.signature, deps);
  if (!review.proof?.proofHash) throw new Error('review 缺少 Cobo 待审批 proof');
  if (!review.coboSignTxId) throw new Error('review 缺少 coboSignTxId，无法同步 Cobo 审批');

  const status = await readCoboMessageSign(review.coboSignTxId);
  let updated = store.attachCoboSignRequest(review.id, {
    proof: review.proof,
    coboSignTxId: status.txId ?? review.coboSignTxId,
    coboApprovalId: status.approvalId ?? review.coboApprovalId,
    coboApprovalKind: review.coboApprovalKind ?? 'contribution_proof',
    coboSignStatus: status.state === 'signed' ? 'signed' : status.state === 'rejected' ? 'rejected' : 'pending',
    coboStatusDisplay: status.statusDisplay,
  });

  if (status.state === 'rejected') {
    updated = store.updateStatus(review.id, {
      status: 'cobo_rejected',
      reviewNote: status.failedReason ?? status.statusDisplay,
    });
    return { review: updated, coboRejected: true };
  }

  if (!status.signature) {
    return { review: updated, coboPending: true, status: status.statusDisplay };
  }

  if ((updated.coboApprovalKind ?? 'contribution_proof') === 'risk_approval') {
    return signStoredCoboProofAndRecordContributionReview(updated, deps);
  }

  return recordCoboSignedContributionReview(updated, status.signature, deps);
}

async function signStoredCoboProofAndRecordContributionReview(
  review: ContributionReviewRecord,
  deps: SignAndRecordContributionReviewDeps = {},
): Promise<RecordedContributionReview> {
  const store = deps.store ?? contributionReviewStore;
  const submitContribution = deps.submitContribution ?? submitContributionTool.handler;
  const signContributionProof = deps.signContributionProof ?? ((proof: ContributionProof) => signProofWithMode(proof, { mode: 'cobo' }));
  if (!review.proof) throw new Error('review 缺少 proof，无法在 Cobo 审批后签名上链');

  const proof = deserializeProof(review.proof);
  const signed = await signContributionProof(proof);
  store.updateStatus(review.id, { status: 'cobo_approved' });
  store.attachSignedProof(review.id, {
    proof: review.proof,
    signature: signed.signature,
    signerMode: signed.signerMode,
    signerAddress: signed.signerAddress,
  });

  const submitted = await submitContribution({ proof: review.proof, signature: signed.signature });
  const recorded = store.attachTxHash(review.id, {
    txHash: submitted.txHash,
    recordTxId: submitted.txId,
  });

  return {
    review: recorded,
    recordTxId: submitted.txId,
    txHash: submitted.txHash,
    status: submitted.status,
  };
}

async function recordCoboSignedContributionReview(
  review: ContributionReviewRecord,
  signature: string,
  deps: SignAndRecordContributionReviewDeps = {},
): Promise<RecordedContributionReview> {
  const store = deps.store ?? contributionReviewStore;
  const submitContribution = deps.submitContribution ?? submitContributionTool.handler;
  if (!review.proof) throw new Error('review 缺少 proof，无法记录 Cobo 签名');
  if (!config.caw.srcAddress) throw new Error('缺 CAW_SRC_ADDRESS，无法自检 Cobo signer 地址');

  const proof = deserializeProof(review.proof);
  const signerAddress = verifyProofSignature(proof, signature, config.caw.srcAddress);
  store.updateStatus(review.id, { status: 'cobo_approved' });
  store.attachSignedProof(review.id, {
    proof: review.proof,
    signature,
    signerMode: 'cobo',
    signerAddress,
  });

  const submitted = await submitContribution({ proof: review.proof, signature });
  const recorded = store.attachTxHash(review.id, {
    txHash: submitted.txHash,
    recordTxId: submitted.txId,
  });

  return {
    review: recorded,
    recordTxId: submitted.txId,
    txHash: submitted.txHash,
    status: submitted.status,
  };
}

export function serializeProof(proof: ContributionProof): Record<string, string> {
  return Object.fromEntries(
    Object.entries(proof).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : String(value)]),
  );
}

function deserializeProof(proof: Record<string, string>): ContributionProof {
  return {
    projectId: BigInt(proof.projectId),
    roundId: BigInt(proof.roundId),
    contributor: proof.contributor,
    score: BigInt(proof.score),
    proofHash: proof.proofHash,
    paymentIdHash: proof.paymentIdHash,
    nonce: BigInt(proof.nonce),
    deadline: BigInt(proof.deadline),
  };
}

function contributionInputFromReview(review: ContributionReviewRecord) {
  return {
    projectId: review.projectId,
    roundId: review.roundId,
    contributor: review.contributor,
    score: review.score,
    source: review.source,
    evidenceId: review.evidenceId,
    paymentId: review.paymentId,
  };
}

function coboApprovalKindForReview(review: ContributionReviewRecord): 'contribution_proof' | 'risk_approval' {
  if (review.triggeredRules.includes('score_threshold')) return 'contribution_proof';
  return 'risk_approval';
}

function coboApprovalTypedData(
  review: ContributionReviewRecord,
  proof: ContributionProof,
  kind: 'contribution_proof' | 'risk_approval',
) {
  if (kind === 'contribution_proof') return typedDataForCoboProof(proof);
  return typedDataForCoboReviewApproval(review, proof);
}

function typedDataForCoboReviewApproval(review: ContributionReviewRecord, proof: ContributionProof) {
  return {
    domain: EIP712_DOMAIN,
    types: {
      ContributionReviewApproval: [
        { name: 'projectId', type: 'uint256' },
        { name: 'roundId', type: 'uint256' },
        { name: 'contributor', type: 'address' },
        { name: 'score', type: 'uint256' },
        { name: 'proofHash', type: 'bytes32' },
        { name: 'paymentIdHash', type: 'bytes32' },
        { name: 'requiresApproval', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'ContributionReviewApproval',
    message: {
      projectId: proof.projectId.toString(),
      roundId: proof.roundId.toString(),
      contributor: proof.contributor,
      score: proof.score.toString(),
      proofHash: proof.proofHash,
      paymentIdHash: proof.paymentIdHash,
      requiresApproval: '1',
      deadline: proof.deadline.toString(),
    },
  };
}

function coboApprovalDescription(
  review: ContributionReviewRecord,
  kind: 'contribution_proof' | 'risk_approval',
): string {
  const evidence = review.evidenceSnapshot
    ? `${review.evidenceSnapshot.type} ${review.evidenceSnapshot.status}${review.evidenceSnapshot.github?.merged ? ' merged' : ''}`
    : review.evidenceId;
  const summary = review.evidenceSnapshot?.summary ?? review.scoreReason;
  const breakdown = review.scoreBreakdown?.dimensions
    .slice(0, 3)
    .map((item) => `${item.label} ${item.points}/${item.maxPoints}`)
    .join(', ');
  const riskFlags = review.scoreBreakdown?.riskFlags?.slice(0, 4).join(',');
  const rules = review.triggeredRules.slice(0, 4).join(',');
  return truncateDescription([
    kind === 'risk_approval' ? 'CGHub contribution risk approval' : 'CGHub high-score contribution proof',
    `p=${review.projectId}`,
    `r=${review.roundId}`,
    `score=${review.score}`,
    review.scoreBreakdown?.confidence !== undefined ? `conf=${review.scoreBreakdown.confidence}` : undefined,
    review.scoreBreakdown?.source ? `src=${review.scoreBreakdown.source}` : undefined,
    review.aiScoring?.status ? `llm=${review.aiScoring.status}` : undefined,
    `contributor=${shortAddress(review.contributor)}`,
    `evidence=${evidence}`,
    `summary=${truncateText(summary, 96)}`,
    breakdown ? `breakdown=${breakdown}` : undefined,
    riskFlags ? `risk=${riskFlags}` : undefined,
    `rules=${rules || '-'}`,
  ].filter(Boolean).join(' | '));
}

function truncateDescription(value: string): string {
  return truncateText(value, 512);
}

function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
