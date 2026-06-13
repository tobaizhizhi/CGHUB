import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { coboErrorMessage } from '../src/cobo-errors.js';

describe('coboErrorMessage', () => {
  it('includes Cobo HTTP status and response reason when available', () => {
    const error = new Error('Request failed with status code 403') as Error & {
      response?: { status: number; data: unknown };
    };
    error.response = {
      status: 403,
      data: {
        error: {
          reason: 'source address is not in wallet',
        },
      },
    };

    assert.equal(coboErrorMessage(error), 'Cobo API 403: source address is not in wallet');
  });

  it('falls back when an error has an empty message', () => {
    const error = new Error('');

    assert.equal(coboErrorMessage(error), 'Unknown Cobo error');
  });
});
