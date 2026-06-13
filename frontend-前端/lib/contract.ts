import { ethers } from "ethers";
import ContributionPoolABI from "./abi/ContributionPool.json";

export const CONTRIBUTION_POOL_ABI = [
  ...ContributionPoolABI,
  "function createRound(uint256 projectId,uint256 roundId,address token)",
  "function fundRound(uint256 projectId,uint256 roundId,uint256 amount)",
  "function finalizeRound(uint256 projectId,uint256 roundId)",
  "function owner() view returns (address)",
  "function agentSigner() view returns (address)",
  "event RoundFunded(uint256 indexed projectId,uint256 indexed roundId,uint256 amount)",
  "event ContributionRecorded(uint256 indexed projectId,uint256 indexed roundId,address indexed contributor,uint256 score,bytes32 proofHash,bytes32 paymentIdHash)",
  "event RoundFinalized(uint256 indexed projectId,uint256 indexed roundId)",
  "event Claimed(uint256 indexed projectId,uint256 indexed roundId,address indexed contributor,uint256 amount)",
];

export const POOL_ADDRESS =
  process.env.NEXT_PUBLIC_POOL_ADDRESS ||
  "0x876A0741223EDdaE081Ef22beA513E92335B1Bd5";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "11155111");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

export function getProvider() {
  if (!RPC_URL) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL. Please configure a Sepolia RPC endpoint.");
  }
  return new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
}

export function getPoolReadOnly() {
  return new ethers.Contract(POOL_ADDRESS, CONTRIBUTION_POOL_ABI, getProvider());
}
