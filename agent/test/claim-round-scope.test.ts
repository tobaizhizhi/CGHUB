import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

import { loadPoolAbi } from '../src/abi.js';
import { WalletAgent } from '../src/wallet-agent.js';

describe('WalletAgent.claimForContributor', () => {
  it('claims from the round selected by the caller instead of the env default', async () => {
    const contributor = '0x1111111111111111111111111111111111111111';
    const calls: Array<{ contract: string; calldata: string; requestId: string }> = [];
    let waitCalls = 0;
    const agent = new WalletAgent({
      async contractCall(contract, calldata, requestId) {
        calls.push({ contract, calldata, requestId });
        return { txId: 'claim-tx' };
      },
      async waitTx(txId) {
        waitCalls += 1;
        return { status: 'success', hash: `0x${txId}` };
      },
      async ensurePactReady() {
        return 'pact-key';
      },
    });

    await agent.claimForContributor(contributor, { projectId: '42', roundId: '7' });

    const pool = new ethers.Interface(loadPoolAbi());
    const decoded = pool.decodeFunctionData('claimFor', calls[0].calldata);
    assert.match(calls[0].requestId, /^claim-42-7-/);
    assert.equal(decoded[0], 42n);
    assert.equal(decoded[1], 7n);
    assert.equal(decoded[2], contributor);
    assert.equal(waitCalls, 0);
  });

  it('can wait for the Cobo transaction receipt when requested', async () => {
    const contributor = '0x1111111111111111111111111111111111111111';
    let waitCalls = 0;
    const agent = new WalletAgent({
      async contractCall() {
        return { txId: 'claim-tx' };
      },
      async waitTx(txId) {
        waitCalls += 1;
        return { status: 'success', hash: `0x${txId}` };
      },
      async ensurePactReady() {
        return 'pact-key';
      },
    });

    const result = await agent.claimForContributor(contributor, {
      projectId: '42',
      roundId: '7',
      waitForReceipt: true,
    });

    assert.equal(waitCalls, 1);
    assert.deepEqual(result, { txId: 'claim-tx', status: 'success', hash: '0xclaim-tx' });
  });
});
