"use client";

/**
 * Historique des paris d'un marché.
 * On lit les événements `BetPlaced` émis par le contrat via le RPC
 * (getLogs), puis on les affiche du plus récent au plus ancien.
 */
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { useBetLogs } from "@/lib/bet-logs";
import { cn, formatUsdc, shortAddress } from "@/lib/utils";

export function ActivityFeed({
  marketId,
  betCount,
}: {
  marketId: number;
  /** Nombre de paris on-chain (market.betCount) — permet au fetch des
   * logs de s'arrêter dès qu'il les a tous trouvés au lieu de toujours
   * scanner 6 fenêtres de blocs. Optionnel : sans lui, scan complet. */
  betCount?: number;
}) {
  const t = useTranslations();

  // Logs BetPlaced (ordre chronologique, partagés avec OddsChart) —
  // on les affiche du plus récent au plus ancien.
  const { data: sortedBets, isLoading } = useBetLogs(marketId, betCount);
  const bets = sortedBets ? [...sortedBets].reverse() : sortedBets;

  return (
    <Card className="p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <History className="h-4 w-4" />
        {t("activity.title")}
      </h3>

      {isLoading && <p className="text-sm text-muted">{t("activity.loading")}</p>}

      {!isLoading && (!bets || bets.length === 0) && (
        <p className="py-4 text-center text-sm text-muted">
          {t("activity.empty")}
        </p>
      )}

      <ul className="divide-y divide-border">
        {(bets ?? []).slice(0, 20).map((log, i) => (
          <li
            key={`${log.transactionHash}-${i}`}
            className="flex items-center justify-between py-2.5 text-sm"
          >
            <span className="font-mono text-xs text-muted">
              {shortAddress(log.args.bettor ?? "0x")}
            </span>
            <span
              className={cn(
                "font-semibold",
                log.args.isYes ? "text-yes" : "text-no"
              )}
            >
              {log.args.isYes ? t("common.yes") : t("common.no")} ·{" "}
              {formatUsdc(log.args.amount ?? 0n)} USDC
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
