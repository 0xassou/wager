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
 *
 * IMPORTANT — le RPC public ne supporte PAS les appels en parallèle :
 * testé empiriquement, envoyer plusieurs requêtes eth_getLogs en même
 * temps en fait échouer la plupart (5 sur 6 en parallèle total, la
 * moitié même à seulement 2 en même temps). Paralléliser silencieusement
 * ferait donc perdre des paris (fenêtres en échec = considérées vides).
 * On reste séquentiel, mais on réduit drastiquement le NOMBRE d'appels :
 *  - Premier chargement : on s'arrête dès qu'on a trouvé autant de paris
 *    que `betCount` on-chain (typiquement 1 seule fenêtre au lieu de 6).
 *  - Rafraîchissements suivants (30s) : on ne relit que les blocs depuis
 *    le dernier bloc scanné, pas tout l'historique (typiquement ~40
 *    blocs en 30s au rythme d'Arc — un seul appel rapide).
 */
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
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
/** Plafond de sécurité si on ne connaît pas betCount ou qu'on ne l'atteint
 * jamais (marché avec un historique inhabituellement dispersé). */
const MAX_WINDOWS = 6;
/** Pause entre deux fenêtres successives : le RPC public limite à ~1 req/s. */
const WINDOW_DELAY_MS = 1_100;

type BetLog = Log & {
  args: { marketId: bigint; bettor: `0x${string}`; isYes: boolean; amount: bigint };
};

interface BetLogsState {
  logs: BetLog[];
  lastScannedBlock: bigint;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sortLogs(logs: BetLog[]): BetLog[] {
  return [...logs].sort((a, b) => {
    const blockA = a.blockNumber ?? 0n;
    const blockB = b.blockNumber ?? 0n;
    if (blockA !== blockB) return blockA < blockB ? -1 : 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });
}

function fetchWindow(marketId: number, fromBlock: bigint, toBlock: bigint) {
  return logsClient.getContractEvents({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    eventName: "BetPlaced",
    args: { marketId: BigInt(marketId) },
    fromBlock,
    toBlock,
  }) as Promise<BetLog[]>;
}

/** Recherche en arrière par fenêtres de 10k blocs, séquentielle (le RPC
 * public ne tolère pas le parallélisme — voir le commentaire en tête de
 * fichier), avec arrêt dès que `expectedCount` paris ont été trouvés. */
async function fullScan(
  marketId: number,
  latest: bigint,
  expectedCount: number | undefined
): Promise<BetLogsState> {
  const allLogs: BetLog[] = [];
  let windowEnd = latest;

  for (let i = 0; i < MAX_WINDOWS && windowEnd > 0n; i++) {
    if (i > 0) await sleep(WINDOW_DELAY_MS);

    const windowStart = windowEnd > WINDOW_SIZE ? windowEnd - WINDOW_SIZE : 0n;
    const logs = await fetchWindow(marketId, windowStart, windowEnd);
    allLogs.push(...logs);

    if (expectedCount !== undefined && allLogs.length >= expectedCount) break;
    if (windowStart === 0n) break;
    windowEnd = windowStart - 1n;
  }

  return { logs: sortLogs(allLogs), lastScannedBlock: latest };
}

export function useBetLogs(marketId: number, expectedCount?: number) {
  const queryClient = useQueryClient();
  const queryKey: QueryKey = ["betHistory", marketId];

  return useQuery({
    queryKey,
    refetchInterval: 30_000,
    queryFn: async (): Promise<BetLogsState> => {
      const previous = queryClient.getQueryData<BetLogsState>(queryKey);

      try {
        const latest = await logsClient.getBlockNumber();

        if (previous) {
          if (latest <= previous.lastScannedBlock) {
            return previous; // rien de nouveau depuis le dernier scan
          }
          // Rafraîchissement incrémental : uniquement les blocs récents.
          // Fenêtre bornée à WINDOW_SIZE par sécurité (ex: onglet resté
          // longtemps en arrière-plan) — un seul appel dans l'immense
          // majorité des cas (~40 blocs pour 30s à ~0,75s/bloc sur Arc).
          const from =
            latest - previous.lastScannedBlock > WINDOW_SIZE
              ? latest - WINDOW_SIZE
              : previous.lastScannedBlock + 1n;
          const newLogs = await fetchWindow(marketId, from, latest);
          return {
            logs: sortLogs([...previous.logs, ...newLogs]),
            lastScannedBlock: latest,
          };
        }

        // Premier chargement : scan complet avec arrêt anticipé.
        return await fullScan(marketId, latest, expectedCount);
      } catch {
        // RPC indisponible : on garde les données précédentes si on en a,
        // sinon une liste vide plutôt que de casser la page.
        return previous ?? { logs: [], lastScannedBlock: 0n };
      }
    },
    select: (state) => state.logs,
  });
}
