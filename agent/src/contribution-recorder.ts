/**
 * 模块 1：贡献记录 Agent
 * 把一条贡献组织成 ContributionProof，用 agentSigner 私钥做 EIP-712 签名。
 * 注意：这里只签名，不发交易。发交易是 submit-contribution 的事。
 */

import { ethers } from 'ethers';
import { config, EIP712_DOMAIN, EIP712_TYPES } from './config.js';
import { signProofWithMode } from './proof-signer.js';
import type { ContributionInput, ContributionProof, SignedContribution } from './types.js';

const wallet = () => new ethers.Wallet(config.agentPrivateKey);

// proofHash 的盐，以合约侧为准：合约脚本 RecordDemoContribution.s.sol 的 PROOF_SALT 默认 "demo-proof"
const PROOF_SALT_DEFAULT = 'demo-proof';

function selectedProjectId(input: ContributionInput): bigint {
  return input.projectId === undefined ? config.round.projectId : BigInt(input.projectId);
}

function selectedRoundId(input: ContributionInput): bigint {
  return input.roundId === undefined ? config.round.roundId : BigInt(input.roundId);
}

/**
 * proofHash：防重放 key，必须唯一非零。
 * 对齐合约脚本 RecordDemoContribution.s.sol：
 *   keccak256(abi.encodePacked(proofSalt, projectId, roundId, contributor, nonce))
 * 唯一性靠 nonce + contributor。
 */
function buildProofHash(input: ContributionInput, nonce: bigint): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'uint256', 'uint256', 'address', 'uint256'],
    [input.proofSalt ?? PROOF_SALT_DEFAULT, selectedProjectId(input), selectedRoundId(input), input.contributor, nonce],
  );
}

/**
 * paymentIdHash：挂 x402 支付 id，对账锚点。
 * 对齐合约脚本：keccak256(abi.encodePacked(paymentId, projectId, roundId, contributor, nonce))
 */
function buildPaymentIdHash(input: ContributionInput, nonce: bigint): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'uint256', 'uint256', 'address', 'uint256'],
    [input.paymentId, selectedProjectId(input), selectedRoundId(input), input.contributor, nonce],
  );
}

/** 组装 proof（还没签名） */
export function buildProof(input: ContributionInput): ContributionProof {
  const nonce = BigInt(Date.now()); // 最小实现，先用时间戳保唯一；TODO 换成可靠 nonce 源
  return {
    projectId: selectedProjectId(input),
    roundId: selectedRoundId(input),
    contributor: input.contributor,
    score: BigInt(input.score),
    proofHash: buildProofHash(input, nonce),
    paymentIdHash: buildPaymentIdHash(input, nonce),
    nonce,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 小时过期
  };
}

/** 用 agentSigner 私钥签 EIP-712 */
export async function signProof(proof: ContributionProof): Promise<string> {
  return wallet().signTypedData(EIP712_DOMAIN, EIP712_TYPES, proof);
}

/** 链下自检：恢复出来的地址要等于 agentSigner */
export function selfVerify(proof: ContributionProof, signature: string): boolean {
  const recovered = ethers.verifyTypedData(EIP712_DOMAIN, EIP712_TYPES, proof, signature);
  return recovered.toLowerCase() === wallet().address.toLowerCase();
}

/** 一步到位：组装 + 签名 + 自检 */
export async function recordContribution(input: ContributionInput): Promise<SignedContribution> {
  const proof = buildProof(input);
  const signed = await signProofWithMode(proof);
  return {
    proof,
    signature: signed.signature,
    signerMode: signed.signerMode,
    signerAddress: signed.signerAddress,
  };
}
