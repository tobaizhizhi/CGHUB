import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCoboMessageSignRecord } from '../src/cobo-message-signer.js';

const signature = `0x${'11'.repeat(65)}`;

describe('Cobo message sign status normalization', () => {
  it('reads a signature from executed pending operation results', () => {
    const status = normalizeCoboMessageSignRecord(
      {
        id: 'cobo-sign-tx',
        status: 100,
        status_display: 'pending_approval',
        approval_id: 'approval-1',
        data: {},
      },
      {
        id: 'approval-1',
        status: 'executed',
        execution_result: {
          result: {
            signature,
          },
        },
      },
    );

    assert.equal(status.state, 'signed');
    assert.equal(status.signature, signature);
    assert.equal(status.txId, 'cobo-sign-tx');
    assert.equal(status.approvalId, 'approval-1');
    assert.equal(status.approvalStatus, 'executed');
  });

  it('treats rejected pending operations as rejected', () => {
    const status = normalizeCoboMessageSignRecord(
      {
        id: 'cobo-sign-tx',
        status: 100,
        status_display: 'pending_approval',
        approval_id: 'approval-1',
        data: {},
      },
      {
        id: 'approval-1',
        status: 'rejected',
        last_error: 'owner rejected',
      },
    );

    assert.equal(status.state, 'rejected');
    assert.equal(status.failedReason, 'owner rejected');
  });
});
