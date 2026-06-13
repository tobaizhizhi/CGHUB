import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkPendingTool } from '../tools/check-pending.js';

describe('checkPendingTool', () => {
  it('reads pending, scores, and claimed from the selected round', async () => {
    const calls: Array<{ fn: string; projectId: bigint; roundId: bigint; contributor: string }> = [];
    const contributor = '0x1111111111111111111111111111111111111111';
    const pool = {
      async pending(projectId: bigint, roundId: bigint, contributorAddress: string) {
        calls.push({ fn: 'pending', projectId, roundId, contributor: contributorAddress });
        return 100n;
      },
      async scores(projectId: bigint, roundId: bigint, contributorAddress: string) {
        calls.push({ fn: 'scores', projectId, roundId, contributor: contributorAddress });
        return 25n;
      },
      async claimed(projectId: bigint, roundId: bigint, contributorAddress: string) {
        calls.push({ fn: 'claimed', projectId, roundId, contributor: contributorAddress });
        return 5n;
      },
    };

    const result = await checkPendingTool.handler(
      { contributor, projectId: '42', roundId: '7' },
      { pool },
    );

    assert.deepEqual(result, { pending: '100', score: '25', claimed: '5' });
    assert.deepEqual(calls, [
      { fn: 'pending', projectId: 42n, roundId: 7n, contributor },
      { fn: 'scores', projectId: 42n, roundId: 7n, contributor },
      { fn: 'claimed', projectId: 42n, roundId: 7n, contributor },
    ]);
  });
});
