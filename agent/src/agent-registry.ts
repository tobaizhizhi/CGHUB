import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ContributionReviewRecord,
  ContributionReviewStatus,
  DecisionEvent,
} from './types.js';

export type ActivityRegistryEventType =
  | 'round_draft_created'
  | 'round_created'
  | 'round_funded'
  | 'contribution_submitted'
  | 'contribution_scored'
  | 'contribution_reviewed'
  | 'contribution_recorded'
  | 'round_finalized'
  | 'claim_triggered'
  | 'claim_recorded';

export type ActivityRegistryEventResult = 'pending' | 'success' | 'failed' | 'denied';

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
  result: ActivityRegistryEventResult;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface AgentRegistryFile {
  version: 1;
  reviews: ContributionReviewRecord[];
  decisions: DecisionEvent[];
  activityEvents: ActivityRegistryEvent[];
}

export interface ContributionReviewListFilter {
  status?: ContributionReviewStatus;
  projectId?: string;
  roundId?: string;
  contributor?: string;
  limit?: number;
}

export interface ActivityEventListFilter {
  projectId?: string;
  roundId?: string;
  contributor?: string;
  reviewId?: string;
  type?: ActivityRegistryEventType;
  limit?: number;
}

export interface CoboSignAttachment {
  proof: Record<string, string>;
  coboSignTxId?: string;
  coboApprovalId?: string;
  coboApprovalKind?: 'contribution_proof' | 'risk_approval';
  coboSignStatus: 'pending' | 'signed' | 'rejected';
  coboStatusDisplay?: string;
}

export interface SignedProofAttachment {
  proof: Record<string, string>;
  signature: string;
  signerMode?: 'local' | 'cobo';
  signerAddress?: string;
}

export interface ContributorStatsInput {
  projectId: string;
  roundId: string;
  contributor: string;
  now?: number;
}

export interface ContributorStats {
  currentContributorRoundScore: number;
  contributorSubmissionCount24h: number;
}

export type DecisionInput = Omit<DecisionEvent, 'id' | 'ts'> & Partial<Pick<DecisionEvent, 'id' | 'ts'>>;
export type ActivityEventInput = Omit<ActivityRegistryEvent, 'id' | 'ts'> & Partial<Pick<ActivityRegistryEvent, 'id' | 'ts'>>;

export interface AgentRegistryReader {
  listReviews(filter?: ContributionReviewListFilter): ContributionReviewRecord[];
  getReview(id: string): ContributionReviewRecord | undefined;
  findReviewByProofHash(proofHash: string): ContributionReviewRecord | undefined;
  listDecisions(limit?: number, scope?: { projectId?: string; roundId?: string }): DecisionEvent[];
  listActivityEvents(filter?: ActivityEventListFilter): ActivityRegistryEvent[];
}

export interface AgentRegistryWriter extends AgentRegistryReader {
  createReview(record: Omit<ContributionReviewRecord, 'id' | 'createdAt' | 'updatedAt'>): ContributionReviewRecord;
  updateReviewStatus(
    id: string,
    input: {
      status: 'cobo_approved' | 'cobo_rejected' | 'rejected' | 'needs_more_evidence';
      reviewer?: string;
      reviewNote?: string;
    },
  ): ContributionReviewRecord;
  attachCoboSignRequest(id: string, input: CoboSignAttachment): ContributionReviewRecord;
  attachSignedProof(id: string, input: SignedProofAttachment): ContributionReviewRecord;
  attachTxHash(id: string, input: { txHash?: string; recordTxId?: string }): ContributionReviewRecord;
  statsForContributor(input: ContributorStatsInput): ContributorStats;
  evidenceAlreadyUsed(evidenceKey: string): boolean;
  appendDecision(event: DecisionInput): DecisionEvent;
  appendActivityEvent(event: ActivityEventInput): ActivityRegistryEvent;
  clear(): void;
}

const DEFAULT_AGENT_REGISTRY_PATH = fileURLToPath(new URL('../data/agent-registry.json', import.meta.url));
const DEFAULT_DECISION_LIMIT = 30;
const MAX_DECISION_LIMIT = 1000;
const DEFAULT_ACTIVITY_EVENT_LIMIT = 200;
const MAX_ACTIVITY_EVENT_LIMIT = 1000;
const DEFAULT_REVIEW_LIMIT = 50;
const MAX_REVIEW_LIMIT = 200;
const scoreCountedStatuses = new Set<ContributionReviewStatus>(['auto_allowed', 'cobo_approved']);

export class JsonAgentRegistry implements AgentRegistryWriter {
  private cache?: AgentRegistryFile;
  private cacheMtimeMs?: number;

  constructor(private readonly path = process.env.AGENT_REGISTRY_PATH || DEFAULT_AGENT_REGISTRY_PATH) {}

  createReview(record: Omit<ContributionReviewRecord, 'id' | 'createdAt' | 'updatedAt'>): ContributionReviewRecord {
    return this.update((file) => {
      const now = Date.now();
      const next: ContributionReviewRecord = {
        ...record,
        id: `review-${now}-${randomSuffix()}`,
        createdAt: now,
        updatedAt: now,
      };
      file.reviews.push(next);
      file.activityEvents.push(newActivityEvent({
        type: 'contribution_submitted',
        projectId: next.projectId,
        roundId: next.roundId,
        contributor: next.contributor,
        reviewId: next.id,
        result: next.status === 'rejected' ? 'denied' : 'pending',
        detail: next.title,
        data: {
          score: next.score,
          status: next.status,
          triggeredRules: next.triggeredRules,
          ...scoringActivityData(next),
        },
      }));
      return next;
    });
  }

  listReviews(filter: ContributionReviewListFilter = {}): ContributionReviewRecord[] {
    const file = this.readFile();
    const limit = safeLimit(filter.limit, DEFAULT_REVIEW_LIMIT, MAX_REVIEW_LIMIT);
    return file.reviews
      .filter((record) => !filter.status || record.status === filter.status)
      .filter((record) => !filter.projectId || record.projectId === filter.projectId)
      .filter((record) => !filter.roundId || record.roundId === filter.roundId)
      .filter((record) => !filter.contributor || record.contributor.toLowerCase() === filter.contributor.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getReview(id: string): ContributionReviewRecord | undefined {
    return this.readFile().reviews.find((record) => record.id === id);
  }

  updateReviewStatus(
    id: string,
    input: {
      status: 'cobo_approved' | 'cobo_rejected' | 'rejected' | 'needs_more_evidence';
      reviewer?: string;
      reviewNote?: string;
    },
  ): ContributionReviewRecord {
    return this.updateReview(id, (record) => ({
      ...record,
      status: input.status,
      reviewer: input.reviewer,
      reviewNote: input.reviewNote,
      updatedAt: Date.now(),
    }), (file, next) => {
      file.activityEvents.push(newActivityEvent({
        type: 'contribution_reviewed',
        projectId: next.projectId,
        roundId: next.roundId,
        contributor: next.contributor,
        reviewId: next.id,
        coboApprovalId: next.coboApprovalId,
        coboTxId: next.coboSignTxId,
        result: reviewStatusToActivityResult(next.status),
        detail: input.reviewNote ?? next.reasons.join('；') ?? next.status,
        data: {
          status: next.status,
          triggeredRules: next.triggeredRules,
          ...scoringActivityData(next),
        },
      }));
    });
  }

  attachCoboSignRequest(id: string, input: CoboSignAttachment): ContributionReviewRecord {
    return this.updateReview(id, (record) => ({
      ...record,
      proof: input.proof,
      coboSignTxId: input.coboSignTxId,
      coboApprovalId: input.coboApprovalId,
      coboApprovalKind: input.coboApprovalKind ?? record.coboApprovalKind,
      coboSignStatus: input.coboSignStatus,
      coboStatusDisplay: input.coboStatusDisplay,
      updatedAt: Date.now(),
    }), (file, next) => {
      file.activityEvents.push(newActivityEvent({
        type: 'contribution_reviewed',
        projectId: next.projectId,
        roundId: next.roundId,
        contributor: next.contributor,
        reviewId: next.id,
        coboTxId: next.coboSignTxId,
        coboApprovalId: next.coboApprovalId,
        result: coboSignStatusToActivityResult(next.coboSignStatus),
        detail: next.coboStatusDisplay ?? next.coboSignStatus,
        data: {
          coboApprovalKind: next.coboApprovalKind,
          coboSignStatus: next.coboSignStatus,
          proofHash: next.proof?.proofHash,
          ...scoringActivityData(next),
        },
      }));
    });
  }

  attachSignedProof(id: string, signed: SignedProofAttachment): ContributionReviewRecord {
    return this.updateReview(id, (record) => ({
      ...record,
      proof: signed.proof,
      signature: signed.signature,
      signerMode: signed.signerMode,
      signerAddress: signed.signerAddress,
      coboSignStatus: signed.signerMode === 'cobo' ? 'signed' : record.coboSignStatus,
      updatedAt: Date.now(),
    }));
  }

  attachTxHash(id: string, input: { txHash?: string; recordTxId?: string }): ContributionReviewRecord {
    return this.updateReview(id, (record) => ({
      ...record,
      recorded: true,
      txHash: input.txHash,
      recordTxId: input.recordTxId,
      updatedAt: Date.now(),
    }), (file, next) => {
      file.activityEvents.push(newActivityEvent({
        type: 'contribution_recorded',
        projectId: next.projectId,
        roundId: next.roundId,
        contributor: next.contributor,
        reviewId: next.id,
        coboTxId: input.recordTxId,
        txHash: input.txHash,
        result: 'success',
        detail: `score=${next.score}`,
        data: {
          proofHash: next.proof?.proofHash,
          score: next.score,
          ...scoringActivityData(next),
        },
      }));
    });
  }

  statsForContributor(input: ContributorStatsInput): ContributorStats {
    const now = input.now ?? Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    const contributor = input.contributor.toLowerCase();
    const records = this.readFile().reviews.filter((record) =>
      record.projectId === input.projectId &&
      record.roundId === input.roundId &&
      record.contributor.toLowerCase() === contributor
    );

    return {
      currentContributorRoundScore: records
        .filter((record) => scoreCountedStatuses.has(record.status) || Boolean(record.signature) || Boolean(record.recorded))
        .reduce((sum, record) => sum + record.score, 0),
      contributorSubmissionCount24h: records.filter((record) => record.createdAt >= since).length,
    };
  }

  evidenceAlreadyUsed(evidenceKey: string): boolean {
    const key = normalizeEvidenceKey(evidenceKey);
    if (!key) return false;
    return this.readFile().reviews.some((record) =>
      (
        normalizeEvidenceKey(record.evidenceSnapshot?.evidenceKey) === key ||
        normalizeEvidenceKey(record.evidenceUrl || record.evidenceId) === key
      ) &&
      record.status !== 'rejected'
    );
  }

  findReviewByProofHash(proofHash: string): ContributionReviewRecord | undefined {
    const normalized = proofHash.toLowerCase();
    return this.readFile().reviews.find((record) => record.proof?.proofHash?.toLowerCase() === normalized);
  }

  appendDecision(event: DecisionInput): DecisionEvent {
    return this.update((file) => {
      const ts = event.ts ?? Date.now();
      const next: DecisionEvent = {
        ...event,
        id: event.id ?? `${event.stage}-${event.contributor}-${ts}-${randomSuffix()}`,
        ts,
      };
      file.decisions.push(next);
      file.activityEvents.push(activityEventFromDecision(next));
      return next;
    });
  }

  listDecisions(limit = DEFAULT_DECISION_LIMIT, scope?: { projectId?: string; roundId?: string }): DecisionEvent[] {
    const safe = safeLimit(limit, DEFAULT_DECISION_LIMIT, MAX_DECISION_LIMIT);
    return this.readFile().decisions
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => !scope?.projectId || event.projectId === scope.projectId)
      .filter(({ event }) => !scope?.roundId || event.roundId === scope.roundId)
      .sort((a, b) => b.event.ts - a.event.ts || b.index - a.index)
      .map(({ event }) => event)
      .slice(0, safe);
  }

  appendActivityEvent(event: ActivityEventInput): ActivityRegistryEvent {
    return this.update((file) => {
      const next = newActivityEvent(event);
      file.activityEvents.push(next);
      return next;
    });
  }

  listActivityEvents(filter: ActivityEventListFilter = {}): ActivityRegistryEvent[] {
    const limit = safeLimit(filter.limit, DEFAULT_ACTIVITY_EVENT_LIMIT, MAX_ACTIVITY_EVENT_LIMIT);
    return this.readFile().activityEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => !filter.projectId || event.projectId === filter.projectId)
      .filter(({ event }) => !filter.roundId || event.roundId === filter.roundId)
      .filter(({ event }) => !filter.contributor || event.contributor?.toLowerCase() === filter.contributor.toLowerCase())
      .filter(({ event }) => !filter.reviewId || event.reviewId === filter.reviewId)
      .filter(({ event }) => !filter.type || event.type === filter.type)
      .sort((a, b) => b.event.ts - a.event.ts || b.index - a.index)
      .map(({ event }) => event)
      .slice(0, limit);
  }

  clear(): void {
    this.writeFile(emptyRegistryFile());
  }

  snapshot(filter: {
    projectId?: string;
    roundId?: string;
    contributor?: string;
    limit?: number;
  } = {}): Pick<AgentRegistryFile, 'reviews' | 'decisions' | 'activityEvents'> {
    const decisionLimit = safeLimit(filter.limit, DEFAULT_DECISION_LIMIT, MAX_DECISION_LIMIT);
    const reviewLimit = safeLimit(filter.limit, DEFAULT_REVIEW_LIMIT, MAX_REVIEW_LIMIT);
    const eventLimit = safeLimit(filter.limit, DEFAULT_ACTIVITY_EVENT_LIMIT, MAX_ACTIVITY_EVENT_LIMIT);
    return {
      reviews: this.listReviews({
        projectId: filter.projectId,
        roundId: filter.roundId,
        contributor: filter.contributor,
        limit: reviewLimit,
      }),
      decisions: this.listDecisions(decisionLimit, {
        projectId: filter.projectId,
        roundId: filter.roundId,
      }),
      activityEvents: this.listActivityEvents({
        projectId: filter.projectId,
        roundId: filter.roundId,
        contributor: filter.contributor,
        limit: eventLimit,
      }),
    };
  }

  private updateReview(
    id: string,
    updateRecord: (record: ContributionReviewRecord) => ContributionReviewRecord,
    afterUpdate?: (file: AgentRegistryFile, record: ContributionReviewRecord) => void,
  ): ContributionReviewRecord {
    return this.update((file) => {
      const index = file.reviews.findIndex((record) => record.id === id);
      if (index < 0) throw new Error(`无此贡献审批记录: ${id}`);
      const next = updateRecord(file.reviews[index]);
      file.reviews[index] = next;
      afterUpdate?.(file, next);
      return next;
    });
  }

  private update<T>(mutate: (file: AgentRegistryFile) => T): T {
    const file = this.readFile();
    const result = mutate(file);
    this.writeFile(file);
    return result;
  }

  private readFile(): AgentRegistryFile {
    if (!existsSync(this.path)) return emptyRegistryFile();
    const mtimeMs = statSync(this.path).mtimeMs;
    if (this.cache && this.cacheMtimeMs === mtimeMs) {
      return this.cache;
    }
    const text = readFileSync(this.path, 'utf8');
    const normalized = normalizeRegistryFile(JSON.parse(text));
    this.cache = normalized;
    this.cacheMtimeMs = mtimeMs;
    return normalized;
  }

  private writeFile(file: AgentRegistryFile): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmpPath = `${this.path}.tmp`;
    const normalized = normalizeRegistryFile(file);
    writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    renameSync(tmpPath, this.path);
    this.cache = normalized;
    this.cacheMtimeMs = statSync(this.path).mtimeMs;
  }
}

export function normalizeRegistryFile(input: unknown): AgentRegistryFile {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    version: 1,
    reviews: Array.isArray(value.reviews) ? value.reviews.map(normalizeReviewRecord).filter(Boolean) as ContributionReviewRecord[] : [],
    decisions: Array.isArray(value.decisions) ? value.decisions.map(normalizeDecisionEvent).filter(Boolean) as DecisionEvent[] : [],
    activityEvents: Array.isArray(value.activityEvents) ? value.activityEvents.map(normalizeActivityEvent).filter(Boolean) as ActivityRegistryEvent[] : [],
  };
}

function normalizeReviewRecord(input: unknown): ContributionReviewRecord | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  if (!record.id || !record.projectId || !record.roundId || !record.contributor) return undefined;
  return {
    ...record,
    id: String(record.id),
    projectId: String(record.projectId),
    roundId: String(record.roundId),
    contributor: String(record.contributor),
    title: String(record.title ?? ''),
    description: String(record.description ?? ''),
    source: String(record.source ?? 'unknown'),
    evidenceId: String(record.evidenceId ?? ''),
    paymentId: String(record.paymentId ?? ''),
    score: Number(record.score ?? 0),
    scoreReason: String(record.scoreReason ?? ''),
    status: normalizeReviewStatus(record.status),
    reasons: arrayOfStrings(record.reasons),
    triggeredRules: arrayOfStrings(record.triggeredRules),
    createdAt: Number(record.createdAt ?? Date.now()),
    updatedAt: Number(record.updatedAt ?? record.createdAt ?? Date.now()),
  } as ContributionReviewRecord;
}

function normalizeDecisionEvent(input: unknown): DecisionEvent | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const event = input as Record<string, unknown>;
  if (!event.id || !event.stage || !event.contributor) return undefined;
  return {
    ...event,
    id: String(event.id),
    ts: Number(event.ts ?? Date.now()),
    contributor: String(event.contributor),
    stage: event.stage as DecisionEvent['stage'],
    result: event.result as DecisionEvent['result'] ?? 'pending',
  } as DecisionEvent;
}

function normalizeActivityEvent(input: unknown): ActivityRegistryEvent | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const event = input as Record<string, unknown>;
  if (!event.id || !event.type) return undefined;
  return {
    ...event,
    id: String(event.id),
    ts: Number(event.ts ?? Date.now()),
    type: event.type as ActivityRegistryEventType,
    result: event.result as ActivityRegistryEventResult ?? 'pending',
  } as ActivityRegistryEvent;
}

function emptyRegistryFile(): AgentRegistryFile {
  return {
    version: 1,
    reviews: [],
    decisions: [],
    activityEvents: [],
  };
}

function newActivityEvent(event: ActivityEventInput): ActivityRegistryEvent {
  const ts = event.ts ?? Date.now();
  return {
    ...event,
    id: event.id ?? `activity-${ts}-${randomSuffix()}`,
    ts,
  };
}

function activityEventFromDecision(decision: DecisionEvent): ActivityRegistryEvent {
  return newActivityEvent({
    type: activityTypeFromDecisionStage(decision.stage),
    projectId: decision.projectId,
    roundId: decision.roundId,
    roundRegistryId: decision.roundRegistryId,
    contributor: decision.contributor,
    reviewId: decision.reviewId,
    decisionId: decision.id,
    txHash: decision.txHash,
    result: decisionResultToActivityResult(decision.result),
    detail: decision.reason,
    data: {
      stage: decision.stage,
      score: decision.score,
      amount: decision.amount,
      reviewStatus: decision.reviewStatus,
      triggeredRules: decision.triggeredRules,
    },
  });
}

function activityTypeFromDecisionStage(stage: DecisionEvent['stage']): ActivityRegistryEventType {
  if (stage === 'score') return 'contribution_scored';
  if (stage === 'review' || stage === 'cobo_approval' || stage === 'signed') return 'contribution_reviewed';
  if (stage === 'recorded') return 'contribution_recorded';
  if (stage === 'fund') return 'round_funded';
  if (stage === 'claim') return 'claim_recorded';
  return 'contribution_submitted';
}

function decisionResultToActivityResult(result: DecisionEvent['result']): ActivityRegistryEventResult {
  if (result === 'allowed') return 'success';
  if (result === 'denied') return 'denied';
  if (result === 'error') return 'failed';
  return 'pending';
}

function reviewStatusToActivityResult(status: ContributionReviewStatus): ActivityRegistryEventResult {
  if (status === 'cobo_approved' || status === 'auto_allowed') return 'success';
  if (status === 'rejected' || status === 'cobo_rejected') return 'denied';
  return 'pending';
}

function coboSignStatusToActivityResult(status: ContributionReviewRecord['coboSignStatus']): ActivityRegistryEventResult {
  if (status === 'signed') return 'success';
  if (status === 'rejected') return 'denied';
  return 'pending';
}

function scoringActivityData(record: ContributionReviewRecord): Record<string, unknown> {
  return {
    evidenceType: record.evidenceSnapshot?.type,
    evidenceStatus: record.evidenceSnapshot?.status,
    scoreConfidence: record.scoreBreakdown?.confidence,
    scoringSource: record.scoreBreakdown?.source,
    fallbackScore: record.scoreBreakdown?.fallbackScore,
    llmStatus: record.aiScoring?.status,
    needsHumanReview: record.scoreBreakdown?.needsHumanReview,
    riskFlags: record.scoreBreakdown?.riskFlags,
    sanityFlags: record.scoreBreakdown?.sanityFlags,
  };
}

function normalizeReviewStatus(value: unknown): ContributionReviewStatus {
  const text = String(value ?? 'needs_more_evidence');
  if (
    text === 'auto_allowed' ||
    text === 'pending_cobo_approval' ||
    text === 'cobo_approved' ||
    text === 'cobo_rejected' ||
    text === 'rejected' ||
    text === 'needs_more_evidence'
  ) {
    return text;
  }
  return 'needs_more_evidence';
}

function safeLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeEvidenceKey(value: string | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export const defaultAgentRegistry = new JsonAgentRegistry();
