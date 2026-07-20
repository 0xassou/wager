"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arcTestnet } from "./chains";

/**
 * Configuration wagmi + RainbowKit.
 *
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID : crée un projet gratuit sur
 * https://cloud.walletconnect.com pour obtenir un ID. Sans ID, la
 * connexion par extension (MetaMask, Rabby...) fonctionne quand même —
 * seul WalletConnect (mobile) sera indisponible.
 *
 * Transport : le RPC Arc testnet limite le nombre de requêtes par
 * seconde ("request limit reached"). On active donc le batching JSON-RPC
 * de viem : toutes les lectures faites dans une fenêtre de 50 ms sont
 * regroupées en UNE seule requête HTTP, ce qui reste sous la limite.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Wager",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "arc-prediction-market",
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], {
      batch: { wait: 50 }, // regroupe les appels en un batch JSON-RPC
      retryCount: 5, // ré-essaie si le RPC rejette quand même
      retryDelay: 400, // délai (ms) entre les tentatives, doublé à chaque fois
    }),
  },
  ssr: true, // Next.js App Router : évite les erreurs d'hydratation
});
