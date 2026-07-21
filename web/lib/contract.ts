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
 * Valeurs de l'enum Phase du contrat Solidity — cycle de résolution en
 * plusieurs temps (voir PredictionMarket.sol pour le détail complet).
 */
export const PHASE = {
  OPEN: 0, // paris possibles, aucune résolution proposée
  PROPOSED: 1, // résultat proposé, fenêtre de contestation en cours
  DISPUTED: 2, // contesté, en attente d'arbitrage par le owner
  FINALIZED: 3, // résultat définitif, claims ouverts
} as const;

/**
 * ABI du PredictionMarket — uniquement les fonctions/événements utilisés
 * par le frontend. `as const` permet à viem/wagmi d'inférer tous les types.
 */
const marketTupleComponents = [
  { name: "creator", type: "address" },
  { name: "question", type: "string" },
  { name: "endTime", type: "uint64" },
  { name: "phase", type: "uint8" },
  { name: "outcome", type: "uint8" },
  { name: "proposedOutcome", type: "uint8" },
  { name: "proposedAt", type: "uint64" },
  { name: "disputedAt", type: "uint64" },
  { name: "disputer", type: "address" },
  { name: "disputeBondLocked", type: "uint256" },
  { name: "forceRefunded", type: "bool" },
  { name: "yesPool", type: "uint256" },
  { name: "noPool", type: "uint256" },
  { name: "betCount", type: "uint256" },
] as const;

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
    name: "proposeResolution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "adminProposeResolution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disputeResolution",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeResolution",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "adminResolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "finalOutcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "forceFinalizeDisputeTimeout",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
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
    // Taux de frais protocolaire en basis points (50 = 0,50 %).
    // N'existe que sur le contrat avec frais : sur l'ancien contrat,
    // la lecture échoue et le frontend masque simplement l'info.
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "disputeWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "disputeBond",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "proposalGracePeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "adminTimeout",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: marketTupleComponents }],
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
      { name: "page", type: "tuple[]", components: marketTupleComponents },
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
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "endTime", type: "uint64", indexed: false },
    ],
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
  {
    type: "event",
    name: "ResolutionProposed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "proposer", type: "address", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "disputeDeadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResolutionDisputed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "disputer", type: "address", indexed: true },
      { name: "bondAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MarketFinalized",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "wasDisputed", type: "bool", indexed: false },
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
  phase: number;
  outcome: number;
  proposedOutcome: number;
  proposedAt: bigint;
  disputedAt: bigint;
  disputer: Address;
  disputeBondLocked: bigint;
  forceRefunded: boolean;
  yesPool: bigint;
  noPool: bigint;
  betCount: bigint;
};
