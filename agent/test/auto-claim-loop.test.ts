import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAutoClaimLoopRunner, runAutoClaimOnce } from '../src/auto-claim-loop.js';
import type { DecisionEvent } from '../src/types.js';
import type { RoundScope } from '../src/wallet-agent.js';

describe('runAutoClaimOnce', () => {
  async function flushMicrotasks() {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it('claims contributors with pending funds and records guard/claim decisions', async () => {
    const decisions: Array<Omit<DecisionEvent, 'id' | 'ts'> & { id?: string; ts?: number }> = [];
    const claimed: string[] = [];

    const result = await runAutoClaimOnce({
      contributors: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ],
      minPending: 1n,
      walletAgent: {
        async checkPending(contributor: string) {
          return contributor.endsWith('1111') ? 10n : 0n;
        },
        async claimForContributor(contributor: string) {
          claimed.push(contributor);
          return { txId: 'tx-1', status: 'success', hash: '0xhash' };
        },
      },
      appendDecision(event) {
        decisions.push(event);
      },
    });

    assert.deepEqual(claimed, ['0x1111111111111111111111111111111111111111']);
    assert.equal(result.claimed, 1);
    assert.equal(result.skipped, 1);
    assert.equal(decisions[0].stage, 'guard');
    assert.equal(decisions[0].result, 'allowed');
    assert.equal(decisions[1].stage, 'claim');
    assert.equal(decisions[1].result, 'allowed');
    assert.equal(decisions[1].amount, '10');
    assert.equal(decisions[1].gasless, true);
  });

  it('checks and claims against the selected round scope', async () => {
    const contributor = '0x1111111111111111111111111111111111111111';
    const calls: Array<{ action: string; contributor: string; projectId?: string; roundId?: string }> = [];
    const decisions: Array<Omit<DecisionEvent, 'id' | 'ts'> & { id?: string; ts?: number }> = [];

    await runAutoClaimOnce({
      contributors: [contributor],
      minPending: 1n,
      scope: { projectId: '42', roundId: '7' },
      walletAgent: {
        async checkPending(contributorAddress: string, scope?: RoundScope) {
          calls.push({
            action: 'checkPending',
            contributor: contributorAddress,
            projectId: scope?.projectId?.toString(),
            roundId: scope?.roundId?.toString(),
          });
          return 10n;
        },
        async claimForContributor(contributorAddress: string, scope?: RoundScope) {
          calls.push({
            action: 'claimForContributor',
            contributor: contributorAddress,
            projectId: scope?.projectId?.toString(),
            roundId: scope?.roundId?.toString(),
          });
          return { txId: 'tx-1', status: 'success', hash: '0xhash' };
        },
      },
      appendDecision(event) {
        decisions.push(event);
      },
    });

    assert.deepEqual(calls, [
      { action: 'checkPending', contributor, projectId: '42', roundId: '7' },
      { action: 'claimForContributor', contributor, projectId: '42', roundId: '7' },
    ]);
    assert.equal(decisions[0].projectId, '42');
    assert.equal(decisions[0].roundId, '7');
    assert.equal(decisions[1].projectId, '42');
    assert.equal(decisions[1].roundId, '7');
  });

  it('does not start a new auto-claim pass while the previous one is still running', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = createAutoClaimLoopRunner({
      contributors: ['0x1111111111111111111111111111111111111111'],
      async runOnce() {
        const id = started.length + 1;
        started.push(id);
        await gate;
        finished.push(id);
        return {
          checked: 1,
          claimed: 0,
          skipped: 1,
          denied: 0,
          errors: 0,
        };
      },
      log() {},
    });

    run();
    run();
    await flushMicrotasks();
    assert.deepEqual(started, [1]);

    release();
    await gate;
    await flushMicrotasks();
    assert.deepEqual(finished, [1]);

    run();
    await flushMicrotasks();
    assert.deepEqual(started, [1, 2]);
  });
});
