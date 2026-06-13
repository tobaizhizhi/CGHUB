import { coboErrorMessage, isPolicyDenied } from './cobo-errors.js';
import { config } from './config.js';
import { appendDecision as appendDecisionDefault } from './decision-log.js';
import { WalletAgent, type RoundScope } from './wallet-agent.js';
import type { DecisionEvent } from './types.js';

type DecisionInput = Omit<DecisionEvent, 'id' | 'ts'> & { id?: string; ts?: number };

interface AutoClaimWalletAgent {
  checkPending(contributor: string, scope?: RoundScope): Promise<bigint>;
  claimForContributor(contributor: string, scope?: RoundScope): Promise<{ txId: string; status: string; hash?: string }>;
}

export interface RunAutoClaimOnceOptions {
  contributors: string[];
  minPending?: bigint;
  scope?: RoundScope;
  walletAgent?: AutoClaimWalletAgent;
  appendDecision?: (event: DecisionInput) => void;
}

export interface AutoClaimOnceResult {
  checked: number;
  claimed: number;
  skipped: number;
  denied: number;
  errors: number;
}

interface AutoClaimLoopRunnerOptions {
  contributors?: string[];
  runOnce?: (opts: RunAutoClaimOnceOptions) => Promise<AutoClaimOnceResult>;
  log?: (message: string) => void;
}

export async function runAutoClaimOnce(opts: RunAutoClaimOnceOptions): Promise<AutoClaimOnceResult> {
  const walletAgent = opts.walletAgent ?? new WalletAgent();
  const appendDecision = opts.appendDecision ?? appendDecisionDefault;
  const minPending = opts.minPending ?? config.autoClaim.minPending;
  const scope = opts.scope ?? config.round;
  const decisionScope = { projectId: String(scope.projectId), roundId: String(scope.roundId) };
  const result: AutoClaimOnceResult = {
    checked: 0,
    claimed: 0,
    skipped: 0,
    denied: 0,
    errors: 0,
  };

  for (const contributor of opts.contributors) {
    result.checked += 1;
    try {
      const pending = await walletAgent.checkPending(contributor, scope);
      if (pending < minPending) {
        result.skipped += 1;
        continue;
      }

      const tx = await walletAgent.claimForContributor(contributor, scope);
      appendDecision({
        stage: 'guard',
        ...decisionScope,
        contributor,
        result: 'allowed',
        reason: 'Pact contract_call allowed by auto-claim',
      });
      appendDecision({
        stage: 'claim',
        ...decisionScope,
        contributor,
        result: 'allowed',
        amount: pending.toString(),
        txHash: tx.hash,
        gasless: true,
      });
      result.claimed += 1;
    } catch (e) {
      const reason = coboErrorMessage(e);
      if (isPolicyDenied(e)) {
        appendDecision({
          stage: 'guard',
          ...decisionScope,
          contributor,
          result: 'denied',
          reason,
        });
        result.denied += 1;
      } else {
        appendDecision({
          stage: 'claim',
          ...decisionScope,
          contributor,
          result: 'error',
          reason,
        });
        result.errors += 1;
      }
    }
  }

  return result;
}

export function createAutoClaimLoopRunner(options: AutoClaimLoopRunnerOptions = {}): () => void {
  const contributors = options.contributors ?? config.autoClaim.contributors;
  const runOnce = options.runOnce ?? runAutoClaimOnce;
  const log = options.log ?? console.error;
  let running = false;

  return () => {
    if (running) return;
    running = true;

    runOnce({ contributors })
      .then((result) => {
        log(
          `[auto-claim] checked=${result.checked} claimed=${result.claimed} skipped=${result.skipped} denied=${result.denied} errors=${result.errors}`,
        );
      })
      .catch((e) => {
        log(`[auto-claim] failed: ${coboErrorMessage(e)}`);
      })
      .finally(() => {
        running = false;
      });
  };
}

export function startAutoClaimLoop(): NodeJS.Timeout | undefined {
  if (!config.autoClaim.enabled || config.autoClaim.contributors.length === 0) return undefined;

  const intervalMs = Number.isFinite(config.autoClaim.intervalMs)
    ? Math.max(3000, config.autoClaim.intervalMs)
    : 10000;
  const run = createAutoClaimLoopRunner();

  run();
  return setInterval(run, intervalMs);
}
