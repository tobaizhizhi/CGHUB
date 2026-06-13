/**
 * Submit the Cobo Pacts CGHub needs before a demo.
 *
 * Usage:
 *   npm run prepare:pacts
 *   npm run prepare:pacts -- --wait
 *   npm run prepare:pacts -- --only guard
 *   npm run prepare:pacts -- --only sign
 *   npm run prepare:pacts -- --only fund
 *   npm run prepare:pacts -- --include=fund
 *
 * The script prints Pact IDs only. It never prints API keys.
 */

import {
  Configuration,
  PactsApi,
  type PactSpecInput,
} from '@cobo/agentic-wallet';
import {
  CGHUB_PACT_KINDS,
  defaultPreparePactKinds,
  getCghubPactDefinition,
  type CghubPactKind,
} from './cobo-pacts.js';
import { config } from './config.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waitForActive = process.argv.includes('--wait');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyFlagIndex = process.argv.indexOf('--only');
const onlyValue = onlyArg?.split('=')[1] ?? (onlyFlagIndex >= 0 ? process.argv[onlyFlagIndex + 1] : undefined);
const includeArg = process.argv.find((arg) => arg.startsWith('--include='));
const includeValue = includeArg?.split('=')[1];

function ownerConfig(): Configuration {
  return new Configuration({ apiKey: config.cobo.apiKey, basePath: config.cobo.basePath });
}

function isPactKind(value: string | undefined): value is CghubPactKind {
  return CGHUB_PACT_KINDS.includes(value as CghubPactKind);
}

function resolveRequestedKinds(): CghubPactKind[] {
  if (onlyValue) {
    if (!isPactKind(onlyValue)) {
      throw new Error(`--only 只能是 ${CGHUB_PACT_KINDS.join('、')}，例如 npm run prepare:pacts -- --only=sign`);
    }
    return [onlyValue];
  }

  const kinds = new Set<CghubPactKind>(defaultPreparePactKinds());
  if (includeValue) {
    for (const raw of includeValue.split(',')) {
      const value = raw.trim();
      if (!isPactKind(value)) {
        throw new Error(`--include 只能包含 ${CGHUB_PACT_KINDS.join('、')}，例如 --include=fund`);
      }
      kinds.add(value);
    }
  }
  return [...kinds];
}

async function submitPact(pactsApi: PactsApi, label: string, intent: string, spec: PactSpecInput): Promise<string> {
  const response = await pactsApi.submitPact({
    wallet_id: config.cobo.walletUuid,
    intent,
    spec,
  });
  const pactId = response.data.result.pact_id;
  if (!pactId) throw new Error(`${label} submitPact 响应缺少 pact_id`);
  console.log(`${label}_PACT_ID=${pactId}`);
  return pactId;
}

async function waitUntilActive(pactsApi: PactsApi, label: string, pactId: string): Promise<void> {
  const terminal = new Set(['rejected', 'expired', 'revoked', 'completed', 'withdrawn']);
  for (;;) {
    const pact = (await pactsApi.getPact(pactId)).data.result;
    const status = String(pact.status ?? '').toLowerCase();
    console.log(`${label} status=${status || 'unknown'}`);
    if (status === 'active') return;
    if (terminal.has(status)) throw new Error(`${label} Pact ${pactId} 进入终态: ${status}`);
    await sleep(5000);
  }
}

async function main(): Promise<void> {
  if (!config.cobo.apiKey) throw new Error('缺 AGENT_WALLET_API_KEY');
  if (!config.cobo.walletUuid) throw new Error('缺 AGENT_WALLET_WALLET_UUID');

  console.log('Submitting CGHub Cobo Pacts...');
  console.log(`walletUuid=${config.cobo.walletUuid}`);
  console.log(`chain=${config.caw.chainId}`);
  console.log(`pool=${config.chain.poolAddress}`);
  console.log(`usdc=${config.chain.usdcAddress}`);
  console.log(`guardToken=${config.caw.guardTokenId}`);
  console.log(`claimMaxAmount=${config.caw.claimMaxAmount}`);

  const pactsApi = new PactsApi(ownerConfig());
  const requestedKinds = resolveRequestedKinds();
  const submitted = new Map<CghubPactKind, { label: string; envName: string; pactId: string }>();

  for (const kind of requestedKinds) {
    const pact = getCghubPactDefinition(kind);
    const pactId = await submitPact(pactsApi, pact.label, pact.intent, pact.spec);
    submitted.set(kind, { label: pact.label, envName: pact.envName, pactId });
  }

  console.log('\n把下面几行填进 agent/.env：');
  for (const item of submitted.values()) {
    console.log(`${item.envName}=${item.pactId}`);
  }
  console.log('\n然后去 Cobo Agent Wallet App 里审核并 approve 这些 Pact。');
  console.log('默认 Main Pact 只管 ContributionPool 执行；Sign Pact 管 messageSign；Fund Pact 仅在 --include=fund 或 --only=fund 时生成。');

  if (waitForActive) {
    console.log('\nWaiting for submitted Pacts to become active...');
    await Promise.all([...submitted.values()].map((item) => waitUntilActive(pactsApi, item.label, item.pactId)));
    console.log('Submitted Pacts are active.');
  }
}

main().catch((error) => {
  const err = error as {
    message?: string;
    response?: {
      status?: number;
      data?: unknown;
    };
  };
  if (err.response) {
    console.error(`Request failed with status code ${err.response.status ?? '-'}`);
    console.error(JSON.stringify(err.response.data ?? {}, null, 2));
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
