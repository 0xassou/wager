"use client";

/**
 * Providers globaux de l'application :
 *  - ThemeProvider      : dark / light mode (next-themes, persisté en
 *                         localStorage, suit prefers-color-scheme par défaut)
 *  - WagmiProvider      : connexion blockchain (lecture/écriture de contrats)
 *  - QueryClientProvider : cache des données on-chain (re-fetch auto)
 *  - RainbowKitProvider : UI de connexion wallet, thème synchronisé
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { ThemeProvider, useTheme } from "next-themes";
import { wagmiConfig } from "@/lib/wagmi";
import { useEffect, useState, type ReactNode } from "react";

import "@rainbow-me/rainbowkit/styles.css";

/** Options RainbowKit partagées entre les deux thèmes. */
const rainbowKitOptions = {
  accentColor: "#663A73", // violet Arc
  accentColorForeground: "white",
  borderRadius: "medium",
  overlayBlur: "small",
} as const;

/**
 * Sous-composant : choisit le thème RainbowKit selon le thème actif.
 * (doit être DANS le ThemeProvider pour pouvoir lire useTheme)
 */
function RainbowKitWithTheme({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  // Avant l'hydratation, resolvedTheme est undefined : on attend le mount
  // pour éviter un mismatch serveur/client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const theme =
    mounted && resolvedTheme === "light"
      ? lightTheme(rainbowKitOptions)
      : darkTheme(rainbowKitOptions);

  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  // useState garantit une seule instance de QueryClient côté client.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Re-fetch les données on-chain toutes les 30 secondes.
            // (le RPC Arc testnet limite les requêtes : on reste léger)
            refetchInterval: 30_000,
            // Le transport viem (lib/wagmi.ts) retente déjà 5 fois avec
            // backoff exponentiel sur chaque appel RPC. Laisser react-query
            // retenter PAR-DESSUS multiplierait inutilement le temps avant
            // un échec définitif — on désactive ce second niveau de retry.
            retry: false,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWithTheme>{children}</RainbowKitWithTheme>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
