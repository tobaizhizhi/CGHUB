import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

import { EIP712_DOMAIN, EIP712_TYPES } from '../src/config.js';
import { signProofWithMode } from '../src/proof-signer.js';
import type { ContributionProof } from '../src/types.js';

const proof: ContributionProof = {
  projectId: 1n,
  roundId: 1n,
  contributor: '0x1111111111111111111111111111111111111111',
  score: 42n,
  proofHash: '0x' + '11'.repeat(32),
  paymentIdHash: '0x' + '22'.repeat(32),
  nonce: 123n,
  deadline: 9999999999n,
};

describe('signProofWithMode', () => {
  it('uses Cobo messageSign and returns the recovered CAW signer address', async () => {
    const cawWallet = ethers.Wallet.createRandom();

    const signed = await signProofWithMode(proof, {
      mode: 'cobo',
      coboSigner: {
        async signTypedData(typedData) {
          assert.equal(typedData.primaryType, 'ContributionProof');
          assert.equal(typedData.domain.name, EIP712_DOMAIN.name);
          assert.equal(typeof typedData.message.projectId, 'string');
          assert.equal(typeof typedData.message.roundId, 'string');
          assert.equal(typeof typedData.message.score, 'string');
          assert.equal(typeof typedData.message.nonce, 'string');
          assert.equal(typeof typedData.message.deadline, 'string');
          assert.doesNotThrow(() => JSON.stringify(typedData));
          return cawWallet.signTypedData(
            typedData.domain,
            typedData.types,
            typedData.message,
          );
        },
      },
      expectedSignerAddress: cawWallet.address,
    });

    assert.equal(signed.signerMode, 'cobo');
    assert.equal(signed.signerAddress.toLowerCase(), cawWallet.address.toLowerCase());
    assert.equal(
      ethers.verifyTypedData(EIP712_DOMAIN, EIP712_TYPES, proof, signed.signature).toLowerCase(),
      cawWallet.address.toLowerCase(),
    );
  });
});
