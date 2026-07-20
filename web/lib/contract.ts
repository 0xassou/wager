/**
 * Adresses et ABIs des contrats.
 *
 * Après le déploiement (voir README), colle les adresses dans web/.env.local :
 *   NEXT_PUBLIC_MARKET_ADDRESS=0x...
 *   NEXT_PUBLIC_USDC_ADDRESS=0x...
 */
import type { Address } from "viem";

export const MARKET_ADDRESS = (process.env.NEXT_PUBLIC_MARKET_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** true si les adresses ont bien été configurées dans .env.local */
export const isConfigured =
  MARKET_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
  USDC_ADDRESS !== "0x0000000000000000000000000000000000000000";

/** USDC utilise 6 décimales (1 USDC = 1_000_000). */
export const USDC_DECIMALS = 6;

/** Valeurs de l'enum Outcome du contrat Solidity. */
export const OUTCOME = {
  UNRESOLVED: 0,
  YES: 1,
  NO: 2,
} as const;

/**
 * ABI du PredictionMarket — uniquement les fonctions/événements utilisés
 * par le frontend. `as const` permet à viem/wagmi d'inférer tous les types.
 */
export const marketAbi = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" },
      { name: "endTime", type: "uint64" },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "isYes", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "question", type: "string" },
          { name: "endTime", type: "uint64" },
          { name: "resolved", type: "bool" },
          { name: "outcome", type: "uint8" },
          { name: "yesPool", type: "uint256" },
          { name: "noPool", type: "uint256" },
          { name: "betCount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getMarkets",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "page",
        type: "tuple[]",
        components: [
          { name: "creator", type: "address" },
          { name: "question", type: "string" },
          { name: "endTime", type: "uint64" },
          { name: "resolved", type: "bool" },
          { name: "outcome", type: "uint8" },
          { name: "yesPool", type: "uint256" },
          { name: "noPool", type: "uint256" },
          { name: "betCount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "yesAmount", type: "uint256" },
          { name: "noAmount", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "claimableAmount",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "bettor", type: "address", indexed: true },
      { name: "isYes", type: "bool", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

/** ABI minimal ERC-20 pour le USDC (solde, approbation, faucet du mock). */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

/** Type TypeScript d'un marché tel que renvoyé par le contrat. */
export type MarketData = {
  creator: Address;
  question: string;
  endTime: bigint;
  resolved: boolean;
  outcome: number;
  yesPool: bigint;
  noPool: bigint;
  betCount: bigint;
};
