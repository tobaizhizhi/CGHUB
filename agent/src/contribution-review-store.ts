import type {
  ContributionReviewRecord,
  ContributionReviewStatus,
} from './types.js';
import {
  defaultAgentRegistry,
  type AgentRegistryWriter,
} from './agent-registry.js';

export interface ContributionReviewStore {
  create(record: Omit<ContributionReviewRecord, 'id' | 'createdAt' | 'updatedAt'>): ContributionReviewRecord;
  list(filter?: {
    status?: ContributionReviewStatus;
    projectId?: string;
    roundId?: string;
    contributor?: string;
    limit?: number;
  }): ContributionReviewRecord[];
  get(id: string): ContributionReviewRecord | undefined;
  updateStatus(
    id: string,
    input: {
      status: 'cobo_approved' | 'cobo_rejected' | 'rejected' | 'needs_more_evidence';
      reviewer?: string;
      reviewNote?: string;
    },
  ): ContributionReviewRecord;
  attachCoboSignRequest(
    id: string,
    input: {
      proof: Record<string, string>;
      coboSignTxId?: string;
      coboApprovalId?: string;
      coboApprovalKind?: 'contribution_proof' | 'risk_approval';
      coboSignStatus: 'pending' | 'signed' | 'rejected';
      coboStatusDisplay?: string;
    },
  ): ContributionReviewRecord;
  attachSignedProof(
    id: string,
    signed: {
      proof: Record<string, string>;
      signature: string;
      signerMode?: 'local' | 'cobo';
      signerAddress?: string;
    },
  ): ContributionReviewRecord;
  attachTxHash(id: string, input: { txHash?: string; recordTxId?: string }): ContributionReviewRecord;
  statsForContributor(input: {
    projectId: string;
    roundId: string;
    contributor: string;
    now?: number;
  }): {
    currentContributorRoundScore: number;
    contributorSubmissionCount24h: number;
  };
  evidenceAlreadyUsed(evidenceKey: string): boolean;
  findByProofHash(proofHash: string): ContributionReviewRecord | undefined;
  clear(): void;
}

export class AgentRegistryContributionReviewStore implements ContributionReviewStore {
  constructor(private readonly registry: AgentRegistryWriter = defaultAgentRegistry) {}

  create(record: Omit<ContributionReviewRecord, 'id' | 'createdAt' | 'updatedAt'>): ContributionReviewRecord {
    return this.registry.createReview(record);
  }

  list(filter: {
    status?: ContributionReviewStatus;
    projectId?: string;
    roundId?: string;
    contributor?: string;
    limit?: number;
  } = {}): ContributionReviewRecord[] {
    return this.registry.listReviews(filter);
  }

  get(id: string): ContributionReviewRecord | undefined {
    return this.registry.getReview(id);
  }

  updateStatus(
    id: string,
    input: {
      status: 'cobo_approved' | 'cobo_rejected' | 'rejected' | 'needs_more_evidence';
      reviewer?: string;
      reviewNote?: string;
    },
  ): ContributionReviewRecord {
    return this.registry.updateReviewStatus(id, input);
  }

  attachCoboSignRequest(
    id: string,
    input: {
      proof: Record<string, string>;
      coboSignTxId?: string;
      coboApprovalId?: string;
      coboApprovalKind?: 'contribution_proof' | 'risk_approval';
      coboSignStatus: 'pending' | 'signed' | 'rejected';
      coboStatusDisplay?: string;
    },
  ): ContributionReviewRecord {
    return this.registry.attachCoboSignRequest(id, input);
  }

  attachSignedProof(
    id: string,
    signed: {
      proof: Record<string, string>;
      signature: string;
      signerMode?: 'local' | 'cobo';
      signerAddress?: string;
    },
  ): ContributionReviewRecord {
    return this.registry.attachSignedProof(id, signed);
  }

  attachTxHash(id: string, input: { txHash?: string; recordTxId?: string }): ContributionReviewRecord {
    return this.registry.attachTxHash(id, input);
  }

  statsForContributor(input: {
    projectId: string;
    roundId: string;
    contributor: string;
    now?: number;
  }): {
    currentContributorRoundScore: number;
    contributorSubmissionCount24h: number;
  } {
    return this.registry.statsForContributor(input);
  }

  evidenceAlreadyUsed(evidenceKey: string): boolean {
    return this.registry.evidenceAlreadyUsed(evidenceKey);
  }

  findByProofHash(proofHash: string): ContributionReviewRecord | undefined {
    return this.registry.findReviewByProofHash(proofHash);
  }

  clear(): void {
    this.registry.clear();
  }
}

export function publicContributionReviewRecord(record: ContributionReviewRecord) {
  const {
    proof: _proof,
    signature: _signature,
    ...safe
  } = record;
  return safe;
}

export const contributionReviewStore: ContributionReviewStore = new AgentRegistryContributionReviewStore();
