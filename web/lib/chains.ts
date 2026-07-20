import { defineChain } from "viem";

/**
 * Définition du réseau Arc Testnet (Circle).
 *
 * Particularité d'Arc : la devise NATIVE (celle qui paie le gas) est le
 * USDC, pas l'ETH. Au niveau natif elle a 18 décimales (le token ERC-20
 * USDC, lui, en a 6).
 *
 * RPC vérifié : https://rpc.testnet.arc.network → chain ID 5042002.
 *
 * Le RPC public partagé applique un rate limit très strict (~1 req/s,
 * erreur -32011 "request limit reached"). Un RPC dédié Alchemy
 * (NEXT_PUBLIC_ARC_RPC_URL_ALCHEMY, voir web/.env.example) est donc
 * utilisé en priorité s'il est configuré ; sinon on retombe sur
 * NEXT_PUBLIC_ARC_RPC_URL, puis sur le RPC public par défaut. Le système
 * de retry/erreur (lib/wagmi.ts, app/page.tsx) reste actif dans tous les
 * cas comme filet de sécurité, même avec Alchemy.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ARC_RPC_URL_ALCHEMY ||
          process.env.NEXT_PUBLIC_ARC_RPC_URL ||
          "https://rpc.testnet.arc.network",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://arcscan.io",
    },
  },
  testnet: true,
});
