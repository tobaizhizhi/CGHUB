import type { AiScoringTrace } from './types.js';
import {
  assessEvidenceWithRubricLlm,
  type AiFetch,
  type AssessEvidenceWithRubricLlmInput,
  type LlmRubricScorerDeps,
} from './llm-rubric-scorer.js';

export type { AiFetch };

export type AssessEvidenceWithAiInput = AssessEvidenceWithRubricLlmInput;
export type AiEvidenceScorerDeps = LlmRubricScorerDeps;

export async function assessEvidenceWithAi(
  input: AssessEvidenceWithAiInput,
  deps: AiEvidenceScorerDeps = {},
): Promise<AiScoringTrace> {
  return assessEvidenceWithRubricLlm(input, deps);
}
