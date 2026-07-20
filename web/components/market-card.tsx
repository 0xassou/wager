"use client";

/**
 * Carte d'un marché sur la page d'accueil.
 * Affiche : statut, question, probabilité "Oui" en gros chiffre,
 * cotes, volume, nombre de paris, temps restant.
 * Cliquer ouvre la page de détail /market/[id].
 */
import Link from "next/link";
import { Clock, Users, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OddsBar } from "@/components/odds-bar";
import { OUTCOME, type MarketData } from "@/lib/contract";
import { formatUsdc, isOpen, timeLeft, yesPercent } from "@/lib/utils";

interface MarketCardProps {
  market: MarketData;
  marketId: number;
}

/** Badge de statut selon l'état du marché (libellés traduits). */
export function StatusBadge({ market }: { market: MarketData }) {
  const t = useTranslations("status");

  if (market.resolved) {
    return market.outcome === OUTCOME.YES ? (
      <Badge variant="yes">{t("resolvedYes")}</Badge>
    ) : (
      <Badge variant="no">{t("resolvedNo")}</Badge>
    );
  }
  if (isOpen(market)) return <Badge variant="open">{t("open")}</Badge>;
  return <Badge variant="pending">{t("pending")}</Badge>;
}

export function MarketCard({ market, marketId }: MarketCardProps) {
  const t = useTranslations();
  const volume = market.yesPool + market.noPool;
  const pct = yesPercent(market);

  const timeLabels = {
    ended: t("time.ended"),
    d: t("time.d"),
    h: t("time.h"),
    m: t("time.m"),
    s: t("time.s"),
  };

  return (
    <Link href={`/market/${marketId}`} className="block">
      <Card hover className="flex h-full flex-col gap-4 p-5">
        {/* En-tête : statut + temps restant */}
        <div className="flex items-center justify-between">
          <StatusBadge market={market} />
          {!market.resolved && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" />
              {timeLeft(market.endTime, timeLabels)}
            </span>
          )}
        </div>

        {/* Question + probabilité "Oui" en gros chiffre (style Polymarket) */}
        <div className="flex flex-1 items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">
            {market.question}
          </h3>
          <div className="shrink-0 text-end">
            <p className="text-2xl font-bold tabular-nums leading-none text-yes">
              {pct}%
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {t("common.yes")}
            </p>
          </div>
        </div>

        {/* Cotes */}
        <OddsBar yesPercent={pct} />

        {/* Stats : volume + nombre de paris */}
        <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="font-semibold tabular-nums text-foreground/80">
              {formatUsdc(volume)}
            </span>
            USDC
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t("card.bets", { count: Number(market.betCount) })}
          </span>
        </div>
      </Card>
    </Link>
  );
}
