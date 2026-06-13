import { ethers } from 'ethers';
import { config, EIP712_DOMAIN, EIP712_TYPES } from './config.js';
import { CoboMessageSigner, type CoboTypedDataSigner } from './cobo-message-signer.js';
import type { ContributionProof } from './types.js';

export type ProofSignerMode = 'local' | 'cobo';

export interface SignProofWithModeOptions {
  mode?: ProofSignerMode;
  coboSigner?: CoboTypedDataSigner;
  expectedSignerAddress?: string;
}

export interface ProofSignatureResult {
  signature: string;
  signerMode: ProofSignerMode;
  signerAddress: string;
}

const localWallet = () => new ethers.Wallet(config.agentPrivateKey);

function typedData(proof: ContributionProof) {
  return {
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'ContributionProof',
    message: proof,
  };
}

export function typedDataForCoboProof(proof: ContributionProof) {
  return {
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'ContributionProof',
    message: {
      projectId: proof.projectId.toString(),
      roundId: proof.roundId.toString(),
      contributor: proof.contributor,
      score: proof.score.toString(),
      proofHash: proof.proofHash,
      paymentIdHash: proof.paymentIdHash,
      nonce: proof.nonce.toString(),
      deadline: proof.deadline.toString(),
    },
  };
}

export function verifyProofSignature(proof: ContributionProof, signature: string, expectedSignerAddress: string): string {
  const recovered = ethers.verifyTypedData(EIP712_DOMAIN, EIP712_TYPES, proof, signature);
  if (recovered.toLowerCase() !== expectedSignerAddress.toLowerCase()) {
    throw new Error(`自检失败：签名恢复地址 ${recovered} != 期望 signer ${expectedSignerAddress}`);
  }
  return recovered;
}

export async function signProofWithMode(
  proof: ContributionProof,
  opts: SignProofWithModeOptions = {},
): Promise<ProofSignatureResult> {
  const mode = opts.mode ?? config.signerMode;
  let signature: string;
  let expectedSignerAddress: string;

  if (mode === 'cobo') {
    const signer = opts.coboSigner ?? new CoboMessageSigner();
    signature = await signer.signTypedData(typedDataForCoboProof(proof));
    expectedSignerAddress = opts.expectedSignerAddress ?? config.caw.srcAddress;
    if (!expectedSignerAddress) throw new Error('缺 CAW_SRC_ADDRESS，无法自检 Cobo signer 地址');
  } else {
    const wallet = localWallet();
    signature = await wallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, proof);
    expectedSignerAddress = wallet.address;
  }

  const recovered = verifyProofSignature(proof, signature, expectedSignerAddress);

  return {
    signature,
    signerMode: mode,
    signerAddress: recovered,
  };
}
