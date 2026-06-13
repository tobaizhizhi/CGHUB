import type { DecisionEvent } from './types.js';
import { defaultAgentRegistry } from './agent-registry.js';

const MAX_DECISIONS = 100;

export function appendDecision(
  event: Omit<DecisionEvent, 'id' | 'ts'> & Partial<Pick<DecisionEvent, 'id' | 'ts'>>,
): DecisionEvent {
  return defaultAgentRegistry.appendDecision(event);
}

export function listDecisions(limit = 30, scope?: { projectId?: string; roundId?: string }): DecisionEvent[] {
  const safeLimit = Math.max(1, Math.min(MAX_DECISIONS, Math.floor(limit)));
  return defaultAgentRegistry.listDecisions(safeLimit, scope);
}
