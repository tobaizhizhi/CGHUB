/**
 * 环境变量 + EIP-712 domain/types 常量。集中放，别散在各文件。
 */

import type { ethers } from 'ethers';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const config = {
  // Cobo
  cobo: {
    basePath: env('AGENT_WALLET_API_URL', 'https://api.agenticwallet.cobo.com'),
    apiKey: env('AGENT_WALLET_API_KEY', ''),
    walletUuid: env('AGENT_WALLET_WALLET_UUID', ''),
    chainId: env('COBO_CHAIN_ID', 'SETH'),
  },
  // 链 / 合约
  chain: {
    poolAddress: env('POOL_ADDRESS', '0x876A0741223EDdaE081Ef22beA513E92335B1Bd5'),
    usdcAddress: env('USDC_ADDRESS', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    chainId: Number(env('CHAIN_ID', '11155111')),
    rpcUrl: env('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com'),
  },
  round: {
    projectId: BigInt(env('PROJECT_ID', '1')),
    roundId: BigInt(env('ROUND_ID', '1')),
  },
  // agentSigner 私钥（链下签 EIP-712 proof）
  agentPrivateKey: env('AGENT_PRIVATE_KEY', ''),       // 必须等于链上 agentSigner()
  signerMode: env('SIGNER_MODE', 'local').toLowerCase() as 'local' | 'cobo',
  review: {
    scoreThreshold: Number(env('SCORE_REVIEW_THRESHOLD', '80')),
    contributorRoundScoreThreshold: Number(env('CONTRIBUTOR_ROUND_SCORE_REVIEW_THRESHOLD', '120')),
    contributorDailySubmissionThreshold: Number(env('CONTRIBUTOR_DAILY_SUBMISSION_REVIEW_THRESHOLD', '3')),
    lowQualityRejectThreshold: Number(env('LOW_QUALITY_REJECT_THRESHOLD', '15')),
  },
  // CAW：用 Cobo SDK 提交链上交易；本地 cobo-tss-node signer 需在线完成钱包签名
  caw: {
    pactId: env('CAW_PACT_ID', ''),
    signPactId: env('CAW_SIGN_PACT_ID', ''),
    fundPactId: env('CAW_FUND_PACT_ID', ''),
    legacyCombinedPact: /^(1|true|yes)$/i.test(env('CAW_LEGACY_COMBINED_PACT', 'false')),
    srcAddress: env('CAW_SRC_ADDRESS', ''), // CAW 钱包 EVM 地址
    chainId: env('COBO_CHAIN_ID', 'SETH'),
    claimMaxAmount: env('CLAIM_MAX_AMOUNT', '100'), // Policy 单次演示限额(USDC)
    guardPactId: env('CAW_GUARD_PACT_ID', ''), // 可选：transfer 护栏演示专用 pact
    guardTokenId: env('CAW_GUARD_TOKEN_ID', 'SETH_USDC'), // Cobo token_id，不是 ERC20 合约地址
    guardDestination: env('CAW_GUARD_DESTINATION', ''), // 为空则 guard-demo 回转到 CAW_SRC_ADDRESS
  },
  autoClaim: {
    enabled: /^(1|true|yes)$/i.test(env('AUTO_CLAIM_ENABLED', 'false')),
    intervalMs: Number(env('AUTO_CLAIM_INTERVAL_MS', '10000')),
    contributors: env('AUTO_CLAIM_CONTRIBUTORS', '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean),
    minPending: BigInt(env('AUTO_CLAIM_MIN_PENDING', '1')),
  },
};

/** EIP-712 domain（白织说明 9.1） */
export const EIP712_DOMAIN = {
  name: 'CGHubContributionPool',
  version: '1',
  chainId: config.chain.chainId,
  verifyingContract: config.chain.poolAddress,
};

/** EIP-712 types，字段顺序锁死，跟合约 CONTRIBUTION_TYPEHASH 一致 */
export const EIP712_TYPES: Record<string, ethers.TypedDataField[]> = {
  ContributionProof: [
    { name: 'projectId', type: 'uint256' },
    { name: 'roundId', type: 'uint256' },
    { name: 'contributor', type: 'address' },
    { name: 'score', type: 'uint256' },
    { name: 'proofHash', type: 'bytes32' },
    { name: 'paymentIdHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
