import { coboErrorMessage } from './cobo-errors.js';
import {
  contributionReviewStore,
  type ContributionReviewStore,
} from './contribution-review-store.js';
import { syncCoboApprovalAndRecordContributionReview } from './contribution-review-executor.js';
import { appendDecision as appendDecisionDefault } from './decision-log.js';
import type { DecisionEvent } from './types.js';

const COBO_APPROVAL_SYNC_INTERVAL_MS = 5000;
const COBO_APPROVAL_SYNC_RETRY_BASE_MS = 30_000;
const COBO_APPROVAL_SYNC_RETRY_MAX_MS = 5 * 60_000;

type DecisionInput = Omit<DecisionEvent, 'id' | 'ts'> & { id?: string; ts?: number };

interface ReviewRetryState {
  attempts: number;
  nextAttemptAt: number;
}

function coboApprovalSyncEnabled(): boolean {
  return !/^(0|false|no)$/i.test(process.env.COBO_APPROVAL_SYNC_ENABLED ?? 'true');
}

export interface RunCoboApprovalSyncOnceOptions {
  store?: ContributionReviewStore;
  syncReview?: typeof syncCoboApprovalAndRecordContributionReview;
  appendDecision?: (event: DecisionInput) => void;
  now?: number;
  retryState?: Map<string, ReviewRetryState>;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface CoboApprovalSyncOnceResult {
  checked: number;
  pending: number;
  recorded: number;
  rejected: number;
  errors: number;
}

export async function runCoboApprovalSyncOnce(
  opts: RunCoboApprovalSyncOnceOptions = {},
): Promise<CoboApprovalSyncOnceResult> {
  const store = opts.store ?? contributionReviewStore;
  const syncReview = opts.syncReview ?? syncCoboApprovalAndRecordContributionReview;
  const appendDecision = opts.appendDecision ?? appendDecisionDefault;
  const now = opts.now ?? Date.now();
  const retryState = opts.retryState;
  const retryBaseMs = normalizeRetryDelay(opts.retryBaseMs, COBO_APPROVAL_SYNC_RETRY_BASE_MS);
  const retryMaxMs = normalizeRetryDelay(opts.retryMaxMs, COBO_APPROVAL_SYNC_RETRY_MAX_MS);
  const reviews = store.list({ status: 'pending_cobo_approval', limit: 200 });
  const result: CoboApprovalSyncOnceResult = {
    checked: 0,
    pending: 0,
    recorded: 0,
    rejected: 0,
    errors: 0,
  };

  for (const review of reviews) {
    const retry = retryState?.get(review.id);
    if (retry && retry.nextAttemptAt > now) continue;

    result.checked += 1;
    try {
      const synced = await syncReview(review, { store });
      retryState?.delete(review.id);
      if (synced.coboPending) {
        result.pending += 1;
        continue;
      }

      appendDecision({
        stage: 'cobo_approval',
        projectId: synced.review.projectId,
        roundId: synced.review.roundId,
        contributor: synced.review.contributor,
        result: synced.coboRejected ? 'denied' : 'allowed',
        score: synced.review.score,
        reason: synced.coboRejected
          ? 'Cobo App 拒绝评分 proof'
          : 'Cobo App 审批通过并返回 signature',
        reviewStatus: synced.review.status,
        triggeredRules: synced.review.triggeredRules,
        reviewId: synced.review.id,
      });

      if (synced.coboRejected) {
        result.rejected += 1;
        continue;
      }

      if (synced.review.signerAddress) {
        appendDecision({
          stage: 'signed',
          projectId: synced.review.projectId,
          roundId: synced.review.roundId,
          contributor: synced.review.contributor,
          result: 'allowed',
          reason: 'Cobo App 审批后 EIP-712 签名完成',
          signerAddress: synced.review.signerAddress,
          reviewStatus: synced.review.status,
          reviewId: synced.review.id,
        });
      }

      if (synced.txHash) {
        appendDecision({
          stage: 'recorded',
          projectId: synced.review.projectId,
          roundId: synced.review.roundId,
          contributor: synced.review.contributor,
          result: 'allowed',
          reason: 'Cobo 审批通过后 CAW Main Pact 自动写入 recordContributionBySig',
          txHash: synced.txHash,
          reviewStatus: synced.review.status,
          reviewId: synced.review.id,
        });
        result.recorded += 1;
      }
    } catch (e) {
      result.errors += 1;
      if (retryState) {
        const attempts = (retry?.attempts ?? 0) + 1;
        const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** (attempts - 1));
        retryState.set(review.id, {
          attempts,
          nextAttemptAt: now + delay,
        });
      }
      appendDecision({
        stage: 'cobo_approval',
        projectId: review.projectId,
        roundId: review.roundId,
        contributor: review.contributor,
        result: 'error',
        score: review.score,
        reason: coboErrorMessage(e),
        reviewStatus: review.status,
        triggeredRules: review.triggeredRules,
        reviewId: review.id,
      });
    }
  }

  return result;
}

interface CoboApprovalSyncRunnerOptions {
  runOnce?: (opts?: RunCoboApprovalSyncOnceOptions) => Promise<CoboApprovalSyncOnceResult>;
  log?: (message: string) => void;
}

export function createCoboApprovalSyncRunner(options: CoboApprovalSyncRunnerOptions = {}): () => void {
  const runOnce = options.runOnce ?? runCoboApprovalSyncOnce;
  const log = options.log ?? console.error;
  const retryState = new Map<string, ReviewRetryState>();
  let running = false;

  return () => {
    if (running) return;
    running = true;

    runOnce({ retryState })
      .then((result) => {
        if (result.checked > 0) {
          log(
            `[cobo-approval-sync] checked=${result.checked} pending=${result.pending} recorded=${result.recorded} rejected=${result.rejected} errors=${result.errors}`,
          );
        }
      })
      .catch((e) => {
        log(`[cobo-approval-sync] failed: ${coboErrorMessage(e)}`);
      })
      .finally(() => {
        running = false;
      });
  };
}

export function startCoboApprovalSyncLoop(): NodeJS.Timeout | undefined {
  if (!coboApprovalSyncEnabled()) return undefined;
  const run = createCoboApprovalSyncRunner();
  const timer = setInterval(run, COBO_APPROVAL_SYNC_INTERVAL_MS);
  setTimeout(run, COBO_APPROVAL_SYNC_INTERVAL_MS);
  return timer;
}

function normalizeRetryDelay(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return fallback;
  return Math.floor(value as number);
}
