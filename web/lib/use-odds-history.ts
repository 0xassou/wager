"use client";

/**
 * Série temporelle du % "Oui" d'un marché, calculée à partir des logs
 * BetPlaced déjà récupérés par useBetLogs (même cache, aucun appel RPC
 * en double pour les logs eux-mêmes).
 *
 * Chaque point correspond au ratio cumulé Oui / (Oui + Non) juste après
 * un pari donné. Le tout premier point est synthétique : 50 % (neutre),
 * placé une minute avant le premier pari trouvé — purement pour donner
 * un point de départ visuel à la ligne, pas un événement on-chain réel.
 *
 * Appel RPC supplémentaire : un batch de getBlock (un par bloc distinct
 * impliqué) pour convertir les numéros de bloc en timestamps — le
 * transport viem déjà configuré (lib/wagmi.ts) regroupe automatiquement
 * les appels lancés dans la même fenêtre de 50 ms en une seule requête
 * HTTP (voir `batch: { wait: 50 }`).
 */
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useBetLogs } from "./bet-logs";

export interface OddsPoint {
  time: number; // timestamp en millisecondes
  pct: number; // % "Oui", de 0 à 100
  noPct: number; // % "Non" = 100 - pct (pas de recalcul depuis les logs, simple complément)
}

/** Décalage (ms) du point de départ synthétique avant le premier pari. */
const SYNTHETIC_START_OFFSET_MS = 60_000;

export function useOddsHistory(marketId: number) {
  const publicClient = usePublicClient();
  const { data: bets } = useBetLogs(marketId); // cache partagé avec ActivityFeed

  return useQuery({
    queryKey: ["oddsHistory", marketId, bets?.length ?? 0],
    enabled: !!publicClient && !!bets,
    // Recalcule périodiquement sans reload complet, cohérent avec le
    // reste du site (useBetLogs se rafraîchit déjà toutes les 30s ;
    // dès que de nouveaux paris arrivent, la clé ci-dessus change et
    // ce recalcul les intègre).
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ points: OddsPoint[]; betCount: number }> => {
      if (!bets || bets.length === 0) return { points: [], betCount: 0 };

      try {
        // Blocs distincts impliqués (déduplication avant fetch).
        const blockNumbers = Array.from(
          new Set<bigint>(bets.map((log) => log.blockNumber ?? 0n))
        );
        const blocks = await Promise.all(
          blockNumbers.map((bn) => publicClient!.getBlock({ blockNumber: bn }))
        );
        const timeByBlock = new Map(
          blocks.map((b) => [b.number, Number(b.timestamp) * 1000])
        );

        const firstBetTime = timeByBlock.get(bets[0].blockNumber ?? 0n) ?? Date.now();
        const points: OddsPoint[] = [
          { time: firstBetTime - SYNTHETIC_START_OFFSET_MS, pct: 50, noPct: 50 },
        ];

        let yes = 0n;
        let no = 0n;
        for (const log of bets) {
          if (log.args.isYes) yes += log.args.amount ?? 0n;
          else no += log.args.amount ?? 0n;

          const total = yes + no;
          const pct = total === 0n ? 50 : Math.round((Number(yes) / Number(total)) * 100);
          points.push({
            time: timeByBlock.get(log.blockNumber ?? 0n) ?? firstBetTime,
            pct,
            noPct: 100 - pct,
          });
        }

        return { points, betCount: bets.length };
      } catch {
        // RPC indisponible pour les timestamps de bloc : pas de graphique,
        // mais le reste de la page continue de fonctionner.
        return { points: [], betCount: bets.length };
      }
    },
  });
}
