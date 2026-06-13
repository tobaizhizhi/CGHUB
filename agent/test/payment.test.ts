import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WalletAgent } from '../src/wallet-agent.js';

describe('WalletAgent.payX402', () => {
  it('uses CAW payment and returns retry headers for the original request', async () => {
    const agent = new WalletAgent({
      async payment(request) {
        assert.equal(request.protocol, 'x402');
        assert.equal(request.x402_payment_required, 'challenge-base64');
        assert.equal(request.request_id, 'payment-1');
        return {
          id: 'payment-id',
          status: 'completed',
          retry_headers: { 'PAYMENT-SIGNATURE': 'sig' },
        };
      },
    });

    const result = await agent.payX402({
      paymentRequired: 'challenge-base64',
      requestId: 'payment-1',
    });

    assert.equal(result.id, 'payment-id');
    assert.equal(result.status, 'completed');
    assert.equal(result.retryHeaders['PAYMENT-SIGNATURE'], 'sig');
  });
});
