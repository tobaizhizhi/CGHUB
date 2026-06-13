import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateContributionReview } from '../src/contribution-review-policy.js';

const thresholds = {
  scoreThreshold: 80,
  contributorRoundScoreThreshold: 120,
  contributorDailySubmissionThreshold: 3,
  lowQualityRejectThreshold: 15,
};

function input(overrides: Partial<Parameters<typeof evaluateContributionReview>[0]> = {}) {
  return {
    projectId: '1',
    roundId: '1',
    contributor: '0x1111111111111111111111111111111111111111',
    score: 20,
    evidenceUrl: 'https://github.com/org/repo/pull/1',
    evidenceId: 'evidence-1',
    currentContributorRoundScore: 0,
    contributorSubmissionCount24h: 1,
    evidenceAlreadyUsed: false,
    ...overrides,
  };
}

describe('evaluateContributionReview', () => {
  it('auto-allows low-risk contributions', () => {
    const decision = evaluateContributionReview(input(), thresholds);

    assert.equal(decision.reviewStatus, 'auto_allowed');
    assert.deepEqual(decision.triggeredRules, []);
  });

  it('requires more evidence when no evidence key exists', () => {
    const decision = evaluateContributionReview(input({ evidenceUrl: '', evidenceId: '' }), thresholds);

    assert.equal(decision.reviewStatus, 'needs_more_evidence');
    assert.deepEqual(decision.triggeredRules, ['missing_evidence']);
  });

  it('allows duplicate evidence to continue through the normal review flow', () => {
    const lowRisk = evaluateContributionReview(input({ score: 20, evidenceAlreadyUsed: true }), thresholds);
    const highScore = evaluateContributionReview(input({ score: 95, evidenceAlreadyUsed: true }), thresholds);

    assert.equal(lowRisk.reviewStatus, 'auto_allowed');
    assert.equal(highScore.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(highScore.triggeredRules, ['score_threshold']);
  });

  it('rejects low-quality junk: very low score with unverifiable evidence', () => {
    const unverified = evaluateContributionReview(input({ score: 12, evidenceStatus: 'unverified' }), thresholds);
    const unavailable = evaluateContributionReview(input({ score: 8, evidenceStatus: 'unavailable' }), thresholds);

    assert.equal(unverified.reviewStatus, 'rejected');
    assert.deepEqual(unverified.triggeredRules, ['low_quality_rejected']);
    assert.equal(unavailable.reviewStatus, 'rejected');
    assert.deepEqual(unavailable.triggeredRules, ['low_quality_rejected']);
  });

  it('does not reject low scores when evidence is verified', () => {
    // 真实但规模小的贡献：分低但证据可验证，不应被低质量拒绝
    const decision = evaluateContributionReview(input({ score: 10, evidenceStatus: 'verified' }), thresholds);

    assert.equal(decision.reviewStatus, 'auto_allowed');
    assert.deepEqual(decision.triggeredRules, []);
  });

  it('does not reject weak evidence when the score clears the low-quality line', () => {
    // 证据未验证但分数 >= 15：不直接拒，仍走后续低置信度/弱证据复核
    const decision = evaluateContributionReview(input({ score: 30, evidenceStatus: 'unverified' }), thresholds);

    assert.notEqual(decision.reviewStatus, 'rejected');
  });

  it('requires Cobo approval only when score is greater than the threshold', () => {
    const atThreshold = evaluateContributionReview(input({ score: 80 }), thresholds);
    const overThreshold = evaluateContributionReview(input({ score: 81 }), thresholds);

    assert.equal(atThreshold.reviewStatus, 'auto_allowed');
    assert.equal(overThreshold.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(overThreshold.triggeredRules, ['score_threshold']);
  });

  it('does not require Cobo approval only because of repeated submissions or accumulated score', () => {
    const decision = evaluateContributionReview(
      input({
        score: 20,
        currentContributorRoundScore: 150,
        contributorSubmissionCount24h: 5,
      }),
      thresholds,
    );

    assert.equal(decision.reviewStatus, 'auto_allowed');
    assert.deepEqual(decision.triggeredRules, []);
  });

  it('keeps score based Cobo approval when a high score is triggered', () => {
    const decision = evaluateContributionReview(
      input({
        score: 85,
        currentContributorRoundScore: 50,
        contributorSubmissionCount24h: 3,
      }),
      thresholds,
    );

    assert.equal(decision.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(decision.triggeredRules, ['score_threshold']);
  });

  it('requires Cobo approval when LLM scoring is unavailable or skipped', () => {
    const disabled = evaluateContributionReview(input({ llmStatus: 'disabled' }), thresholds);
    const skipped = evaluateContributionReview(input({ llmStatus: 'skipped' }), thresholds);

    assert.equal(disabled.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(disabled.triggeredRules, ['llm_unavailable']);
    assert.equal(skipped.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(skipped.triggeredRules, ['llm_skipped']);
  });

  it('requires Cobo approval for low confidence or explicit human review', () => {
    const decision = evaluateContributionReview(
      input({
        scoreConfidence: 0.52,
        needsHumanReview: true,
      }),
      thresholds,
    );

    assert.equal(decision.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(decision.triggeredRules, ['llm_needs_human_review', 'low_score_confidence']);
  });

  it('requires Cobo approval when scoring risk flags are present', () => {
    const decision = evaluateContributionReview(
      input({
        riskFlags: ['llm_rule_score_divergence', 'evidence_unavailable_high_score'],
      }),
      thresholds,
    );

    assert.equal(decision.reviewStatus, 'pending_cobo_approval');
    assert.deepEqual(decision.triggeredRules, [
      'llm_rule_score_divergence',
      'evidence_unavailable_high_score',
    ]);
  });
});
