"use client";

/**
 * Récupération partagée des logs `BetPlaced` d'un marché, triés
 * chronologiquement (le plus ancien en premier).
 *
 * Utilisé à la fois par l'historique des paris (ActivityFeed, qui les
 * affiche inversés) et par le graphique de cotes (OddsChart, qui a besoin
 * de l'ordre chronologique) — même clé react-query dans les deux cas,
 * donc l'appel RPC sous-jacent ne s'exécute qu'une seule fois par marché,
 * quel que soit le nombre de composants qui le consomment.
 *
 * Pourquoi un client dédié au RPC public (et pas le RPC Alchemy déjà
 * configuré dans lib/wagmi.ts) : Arc produit un bloc toutes les ~0,75s,
 * donc même quelques heures d'historique représentent des dizaines de
 * milliers de blocs. Le plan gratuit Alchemy limite eth_getLogs à une
 * plage de 10 BLOCS — inutilisable ici. Le RPC public autorise 10 000
 * blocs par appel ; on pagine donc en arrière par fenêtres de 10 000
 * blocs sur le RPC public, uniquement pour cet appel précis.
 */
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Log } from "viem";
import { arcTestnet } from "./chains";
import { MARKET_ADDRESS, marketAbi } from "./contract";

/** Client dédié, RPC public uniquement — voir l'explication ci-dessus. */
const logsClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network", {
    retryCount: 3,
    retryDelay: 900,
  }),
});

/** Taille max d'une fenêtre eth_getLogs sur le RPC public d'Arc. */
const WINDOW_SIZE = 10_000n;
/** Nombre de fenêtres explorées en arrière (~12h d'historique au rythme
 * de bloc d'Arc) — borne le nombre d'appels RPC et donc la latence. */
const MAX_WINDOWS = 6;
/** Pause entre deux fenêtres successives : le RPC public limite à ~1 req/s. */
const WINDOW_DELAY_MS = 1_100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useBetLogs(marketId: number) {
  return useQuery({
    queryKey: ["betHistory", marketId],
    refetchInterval: 30_000,
    queryFn: async () => {
      try {
        const latest = await logsClient.getBlockNumber();
        const allLogs: Log[] = [];

        let windowEnd = latest;
        for (let i = 0; i < MAX_WINDOWS && windowEnd > 0n; i++) {
          const windowStart = windowEnd > WINDOW_SIZE ? windowEnd - WINDOW_SIZE : 0n;

          if (i > 0) await sleep(WINDOW_DELAY_MS);

          const logs = await logsClient.getContractEvents({
            address: MARKET_ADDRESS,
            abi: marketAbi,
            eventName: "BetPlaced",
            args: { marketId: BigInt(marketId) },
            fromBlock: windowStart,
            toBlock: windowEnd,
          });
          allLogs.push(...logs);

          if (windowStart === 0n) break;
          windowEnd = windowStart - 1n;
        }

        // Ordre chronologique : par bloc, puis par index de log dans le bloc.
        return [...allLogs].sort((a, b) => {
          const blockA = a.blockNumber ?? 0n;
          const blockB = b.blockNumber ?? 0n;
          if (blockA !== blockB) return blockA < blockB ? -1 : 1;
          return (a.logIndex ?? 0) - (b.logIndex ?? 0);
        }) as (Log & {
          args: { marketId: bigint; bettor: `0x${string}`; isYes: boolean; amount: bigint };
        })[];
      } catch {
        // RPC indisponible : on renvoie une liste vide plutôt que de casser la page.
        return [];
      }
    },
  });
}
