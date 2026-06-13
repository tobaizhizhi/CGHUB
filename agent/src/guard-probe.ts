import { coboErrorMessage, isPolicyDenied } from './cobo-errors.js';
import { config } from './config.js';
import { appendDecision } from './decision-log.js';
import { WalletAgent } from './wallet-agent.js';

const GUARD_PROBE_CONTRIBUTOR = '0x0000000000000000000000000000000000000000';
let probePromise: Promise<GuardProbeResult> | undefined;

export interface GuardProbeResult {
  attempted: boolean;
  blocked?: boolean;
  amount?: string;
  reason?: string;
  txId?: string;
}

export function guardProbeEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.GUARD_PROBE_ENABLED ?? '');
}

export function guardProbeAmount(): string {
  const configured = String(process.env.GUARD_PROBE_AMOUNT ?? '').trim();
  if (configured) return configured;

  const max = Number(config.caw.claimMaxAmount);
  if (!Number.isFinite(max) || max <= 0) return '101';
  return String(max + 1);
}

export async function runGuardProbe(): Promise<GuardProbeResult> {
  const amount = guardProbeAmount();

  try {
    const txId = await new WalletAgent().guardDemo(amount);
    appendDecision({
      stage: 'guard',
      contributor: GUARD_PROBE_CONTRIBUTOR,
      result: 'error',
      amount,
      reason: `guard probe was not blocked; transfer txId=${txId}`,
    });
    return { attempted: true, blocked: false, amount, txId };
  } catch (e) {
    const reason = coboErrorMessage(e);
    if (isPolicyDenied(e)) {
      appendDecision({
        stage: 'guard',
        contributor: GUARD_PROBE_CONTRIBUTOR,
        result: 'denied',
        amount,
        reason,
      });
      return { attempted: true, blocked: true, amount, reason };
    }

    appendDecision({
      stage: 'guard',
      contributor: GUARD_PROBE_CONTRIBUTOR,
      result: 'error',
      amount,
      reason,
    });
    throw e;
  }
}

export function startGuardProbeOnce(): Promise<GuardProbeResult> {
  if (!probePromise) probePromise = runGuardProbe();
  return probePromise;
}
