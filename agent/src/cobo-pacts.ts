import type { InlinePolicyCreate, PactSpecInput } from '@cobo/agentic-wallet';
import { config } from './config.js';

export const CGHUB_PACT_KINDS = ['main', 'sign', 'fund', 'guard'] as const;
export type CghubPactKind = (typeof CGHUB_PACT_KINDS)[number];

export interface CghubPactDefinition {
  kind: CghubPactKind;
  label: string;
  cacheLabel: string;
  envName: 'CAW_PACT_ID' | 'CAW_SIGN_PACT_ID' | 'CAW_FUND_PACT_ID' | 'CAW_GUARD_PACT_ID';
  configuredPactId: string;
  intent: string;
  spec: PactSpecInput;
}

const poolTarget = { chain_id: config.caw.chainId, contract_addr: config.chain.poolAddress };
const usdcTarget = { chain_id: config.caw.chainId, contract_addr: config.chain.usdcAddress };

export const CGHUB_POOL_EXECUTION_POLICY: InlinePolicyCreate = {
  name: 'cghub-pool-execution-scope',
  type: 'contract_call',
  rules: {
    effect: 'allow',
    when: {
      chain_in: [config.caw.chainId],
      target_in: [poolTarget],
    },
  },
};

export const CGHUB_MESSAGE_SIGN_POLICY: InlinePolicyCreate = {
  name: 'cghub-score-threshold-review',
  type: 'message_sign',
  rules: {
    effect: 'allow',
    when: {
      chain_in: [config.caw.chainId],
      primary_type_in: ['ContributionProof'],
    },
    review_if: {
      message_match: [
        {
          param_name: 'score',
          op: 'gt',
          value: config.review.scoreThreshold,
        },
      ],
    },
  },
};

export const CGHUB_REVIEW_APPROVAL_POLICY: InlinePolicyCreate = {
  name: 'cghub-risk-approval-review',
  type: 'message_sign',
  rules: {
    effect: 'allow',
    when: {
      chain_in: [config.caw.chainId],
      primary_type_in: ['ContributionReviewApproval'],
    },
    review_if: {
      message_match: [
        {
          param_name: 'requiresApproval',
          op: 'gt',
          value: 0,
        },
      ],
    },
  },
};

export const CGHUB_FUNDING_POLICY: InlinePolicyCreate = {
  name: 'cghub-treasury-funding-scope',
  type: 'contract_call',
  rules: {
    effect: 'allow',
    when: {
      chain_in: [config.caw.chainId],
      target_in: [poolTarget, usdcTarget],
    },
  },
};

export const CGHUB_TRANSFER_GUARD_POLICY: InlinePolicyCreate = {
  name: 'cghub-transfer-guard-demo',
  type: 'transfer',
  rules: {
    effect: 'allow',
    when: {
      chain_in: [config.caw.chainId],
      token_in: [{ chain_id: config.caw.chainId, token_id: config.caw.guardTokenId }],
    },
    deny_if: { amount_gt: config.caw.claimMaxAmount },
  },
};

export const CGHUB_MAIN_PACT_SPEC: PactSpecInput = {
  policies: [CGHUB_POOL_EXECUTION_POLICY],
  completion_conditions: [{ type: 'time_elapsed', threshold: '86400' }],
  execution_plan: [
    '# Summary',
    'CGHub Agent executes approved ContributionPool actions through Cobo Agent Wallet.',
    '# Contract Operations',
    `Allowed target on ${config.caw.chainId}: ContributionPool ${config.chain.poolAddress}.`,
    'Expected calls: recordContributionBySig for approved contribution proofs, and claimFor for mechanical contributor payouts.',
    '# Out Of Scope',
    'EIP-712 proof signing uses the Sign Pact. Optional CAW treasury funding uses the Fund Pact. Direct token transfers are not part of this Pact.',
    '# Risk Controls',
    'CGHub gates AI scores before requesting a Cobo signature; ContributionPool verifies the CAW signer before accepting score records.',
  ].join('\n\n'),
};

export const CGHUB_SIGN_PACT_SPEC: PactSpecInput = {
  policies: [CGHUB_MESSAGE_SIGN_POLICY, CGHUB_REVIEW_APPROVAL_POLICY],
  completion_conditions: [{ type: 'time_elapsed', threshold: '86400' }],
  execution_plan: [
    '# Summary',
    'CGHub Agent requests Cobo Agent Wallet to sign EIP-712 ContributionProof messages and high-risk ContributionReviewApproval messages.',
    '# Signing Operations',
    `Expected EIP-712 domain: CGHubContributionPool on ${config.caw.chainId}.`,
    `ContributionPool verifying contract: ${config.chain.poolAddress}.`,
    `Cobo App approval is required when ContributionProof.score > ${config.review.scoreThreshold}.`,
    `Cobo App approval is also required from contribution number ${config.review.contributorDailySubmissionThreshold} submitted by the same contributor in the same round within 24 hours. The Agent submits a ContributionReviewApproval message for that cross-request risk before signing the real ContributionProof.`,
    '# Risk Controls',
    'The Sign Pact limits signing to ContributionProof and ContributionReviewApproval. Score risk is checked directly by Cobo Policy. Frequency and cumulative-score risk are calculated by the CGHub Agent, then forced through a ContributionReviewApproval pending approval before the real proof is signed. The backend records only ContributionProof signatures that recover to CAW_SRC_ADDRESS.',
  ].join('\n\n'),
};

export const CGHUB_FUND_PACT_SPEC: PactSpecInput = {
  policies: [CGHUB_FUNDING_POLICY],
  completion_conditions: [{ type: 'time_elapsed', threshold: '86400' }],
  execution_plan: [
    '# Summary',
    'Optional CAW treasury funding for CGHub rounds.',
    '# Contract Operations',
    `Allowed targets on ${config.caw.chainId}:`,
    `- USDC ${config.chain.usdcAddress} for approve(pool, amount).`,
    `- ContributionPool ${config.chain.poolAddress} for fundRound(projectId, roundId, amount).`,
    '# Risk Controls',
    'This Pact is separate from proof signing and payout execution so treasury funding can be approved, rotated, or omitted independently.',
  ].join('\n\n'),
};

export const CGHUB_GUARD_PACT_SPEC: PactSpecInput = {
  policies: [CGHUB_TRANSFER_GUARD_POLICY],
  completion_conditions: [{ type: 'time_elapsed', threshold: '86400' }],
  execution_plan: [
    '# Summary',
    'CGHub guardrail demo uses Cobo native transfer policy so amount_gt is visible to Policy.',
    '# Transfer Guard',
    `Token: ${config.caw.guardTokenId} on ${config.caw.chainId}.`,
    `Deny if amount is greater than ${config.caw.claimMaxAmount}.`,
  ].join('\n\n'),
};

export function getCghubPactDefinition(kind: CghubPactKind): CghubPactDefinition {
  if (kind === 'main') {
    return {
      kind,
      label: 'MAIN',
      cacheLabel: 'cghub-main-pact',
      envName: 'CAW_PACT_ID',
      configuredPactId: config.caw.pactId,
      intent: 'CGHub Agent 主线执行：记录已授权贡献 proof，并代触发 claimFor',
      spec: CGHUB_MAIN_PACT_SPEC,
    };
  }

  if (kind === 'sign') {
    return {
      kind,
      label: 'SIGN',
      cacheLabel: 'cghub-sign-pact',
      envName: 'CAW_SIGN_PACT_ID',
      configuredPactId: config.caw.signPactId,
      intent: `CGHub Agent 签名权限：只为 ContributionProof 请求 Cobo messageSign；高分或同一贡献者 24 小时第 ${config.review.contributorDailySubmissionThreshold} 次起需 Cobo App 审批`,
      spec: CGHUB_SIGN_PACT_SPEC,
    };
  }

  if (kind === 'fund') {
    return {
      kind,
      label: 'FUND',
      cacheLabel: 'cghub-fund-pact',
      envName: 'CAW_FUND_PACT_ID',
      configuredPactId: config.caw.fundPactId,
      intent: 'CGHub Agent 可选 CAW treasury 注资：USDC approve + fundRound',
      spec: CGHUB_FUND_PACT_SPEC,
    };
  }

  return {
    kind,
    label: 'GUARD',
    cacheLabel: 'cghub-guard-pact',
    envName: 'CAW_GUARD_PACT_ID',
    configuredPactId: config.caw.guardPactId,
    intent: 'CGHub Agent 安全探针：超额转账必须被 Cobo Policy 拦截',
    spec: CGHUB_GUARD_PACT_SPEC,
  };
}

export function defaultPreparePactKinds(): CghubPactKind[] {
  return ['main', 'sign', 'guard'];
}
