import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

import { WalletAgent } from '../src/wallet-agent.js';
import { loadPoolAbi } from '../src/abi.js';

describe('WalletAgent.fundRoundFromTreasury', () => {
  it('approves USDC and funds the round through CAW contract calls', async () => {
    const calls: Array<{ contract: string; calldata: string; requestId: string; pactKey?: string }> = [];
    const agent = new WalletAgent({
      async contractCall(contract, calldata, requestId, pactKey) {
        calls.push({ contract, calldata, requestId, pactKey });
        return { txId: `tx-${calls.length}` };
      },
      async waitTx(txId) {
        return { status: 'success', hash: `0x${txId}` };
      },
      async ensurePactReady() {
        throw new Error('funding must not use the main Pact');
      },
      async ensureFundPactReady() {
        return 'fund-pact-key';
      },
    });

    const result = await agent.fundRoundFromTreasury('100');

    assert.equal(result.approve.txId, 'tx-1');
    assert.equal(result.fund.txId, 'tx-2');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].pactKey, 'fund-pact-key');
    assert.equal(calls[1].pactKey, 'fund-pact-key');
    assert.match(calls[0].requestId, /^approve-1-1-/);
    assert.match(calls[1].requestId, /^fund-1-1-/);
    assert.notEqual(calls[0].calldata, calls[1].calldata);
  });

  it('funds the round selected by the caller instead of the env default', async () => {
    const calls: Array<{ contract: string; calldata: string; requestId: string; pactKey?: string }> = [];
    const agent = new WalletAgent({
      async contractCall(contract, calldata, requestId, pactKey) {
        calls.push({ contract, calldata, requestId, pactKey });
        return { txId: `tx-${calls.length}` };
      },
      async waitTx(txId) {
        return { status: 'success', hash: `0x${txId}` };
      },
      async ensurePactReady() {
        throw new Error('funding must not use the main Pact');
      },
      async ensureFundPactReady() {
        return 'fund-pact-key';
      },
    });

    await agent.fundRoundFromTreasury('25', { projectId: '42', roundId: '7' });

    const pool = new ethers.Interface(loadPoolAbi());
    const decoded = pool.decodeFunctionData('fundRound', calls[1].calldata);
    assert.match(calls[0].requestId, /^approve-42-7-/);
    assert.match(calls[1].requestId, /^fund-42-7-/);
    assert.equal(calls[0].pactKey, 'fund-pact-key');
    assert.equal(calls[1].pactKey, 'fund-pact-key');
    assert.equal(decoded[0], 42n);
    assert.equal(decoded[1], 7n);
    assert.equal(decoded[2], 25_000_000n);
  });
});
