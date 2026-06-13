import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUBRIC_DIMENSION_KEYS,
  RUBRIC_TOTAL_POINTS,
  SCORING_RUBRIC,
  maxPointsForDimension,
  rubricPromptText,
} from '../src/scoring-rubric.js';

describe('scoring rubric', () => {
  it('defines exactly six dimensions worth 100 points', () => {
    assert.equal(SCORING_RUBRIC.length, 6);
    assert.equal(RUBRIC_DIMENSION_KEYS.length, 6);
    assert.equal(RUBRIC_TOTAL_POINTS, 100);
    assert.equal(maxPointsForDimension('verifiable_output'), 30);
    assert.match(rubricPromptText(), /verifiable_output/);
  });
});
