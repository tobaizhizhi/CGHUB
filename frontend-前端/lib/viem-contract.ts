import { createPublicClient, http, parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN_ID, POOL_ADDRESS, RPC_URL } from "./contract";

export const poolContractAddress = POOL_ADDRESS as Address;

export const contributionPoolViemAbi = parseAbi([
  "function createRound(uint256 projectId,uint256 roundId,address token)",
  "function fundRound(uint256 projectId,uint256 roundId,uint256 amount)",
  "function finalizeRound(uint256 projectId,uint256 roundId)",
  "function recordContributionBySig((uint256 projectId,uint256 roundId,address contributor,uint256 score,bytes32 proofHash,bytes32 paymentIdHash,uint256 nonce,uint256 deadline) proof, bytes signature)",
]);

export const erc20ViemAbi = parseAbi([
  "function approve(address spender,uint256 value) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
]);

export function getViemPublicClient() {
  if (!RPC_URL) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL. Please configure a Sepolia RPC endpoint.");
  }

  return createPublicClient({
    chain: CHAIN_ID === sepolia.id ? sepolia : undefined,
    transport: http(RPC_URL),
  });
}
