"use client";

/**
 * PAGE DE DÉTAIL D'UN MARCHÉ  —  /market/[id]
 *
 * Colonne principale : question, statut, compte à rebours, cotes,
 * pools Oui/Non, historique des paris.
 * Colonne latérale : panneau de pari (si ouvert), claim (si résolu),
 * bouton "Résoudre" (créateur uniquement, après la fin), ma position.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useTranslations, useLocale } from "next-intl";
import { ArrowLeft, CalendarClock, Gavel, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OddsBar } from "@/components/odds-bar";
import { StatusBadge } from "@/components/market-card";
import { BetPanel } from "@/components/bet-panel";
import { ClaimPanel } from "@/components/claim-panel";
import { ResolveModal } from "@/components/resolve-modal";
import { ActivityFeed } from "@/components/activity-feed";
import { MARKET_ADDRESS, marketAbi, isConfigured } from "@/lib/contract";
import {
  formatDate,
  formatUsdc,
  isOpen,
  shortAddress,
  timeLeft,
  yesPercent,
} from "@/lib/utils";

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const marketId = Number(params.id);
  const { address } = useAccount();
  const t = useTranslations("detail");
  const tTime = useTranslations("time");
  const locale = useLocale();

  // Tick chaque seconde pour rafraîchir le compte à rebours à l'écran.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const [resolveOpen, setResolveOpen] = useState(false);

  // Données du marché.
  const { data: market, isLoading } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarket",
    args: [BigInt(marketId)],
    query: { enabled: isConfigured && Number.isInteger(marketId) },
  });

  // Ma position sur ce marché.
  const { data: position } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getPosition",
    args: [BigInt(marketId), address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address && isConfigured },
  });

  if (isLoading || !market) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const open = isOpen(market);
  const ended = Number(market.endTime) * 1000 <= Date.now();
  const isCreator = address?.toLowerCase() === market.creator.toLowerCase();
  const volume = market.yesPool + market.noPool;
  const pct = yesPercent(market);

  return (
    <div className="animate-fade-in">
      {/* Retour */}
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ================= Colonne principale ================= */}
        <div className="space-y-6">
          <Card className="p-6">
            {/* Statut + méta */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <StatusBadge market={market} />

              <span className="flex items-center gap-1.5 text-xs text-muted">
                <User className="h-3.5 w-3.5" />
                {t("createdBy")}{" "}
                <span className="font-mono">
                  {isCreator ? t("you") : shortAddress(market.creator)}
                </span>
              </span>
            </div>

            {/* Question */}
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">
              {market.question}
            </h1>

            {/* Compte à rebours / date de fin */}
            <div className="mt-4 flex items-center gap-2 text-sm text-muted">
              <CalendarClock className="h-4 w-4" />
              {open ? (
                <>
                  {t("endsIn")}{" "}
                  <span className="font-semibold text-foreground">
                    {timeLeft(market.endTime, {
                      ended: tTime("ended"),
                      d: tTime("d"),
                      h: tTime("h"),
                      m: tTime("m"),
                      s: tTime("s"),
                    })}
                  </span>
                  <span className="text-muted/60">
                    · {formatDate(market.endTime, locale)}
                  </span>
                </>
              ) : (
                <>{t("endedOn", { date: formatDate(market.endTime, locale) })}</>
              )}
            </div>

            {/* Cotes principales */}
            <div className="mt-6">
              <OddsBar yesPercent={pct} />
            </div>

            {/* Pools + volume */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-yes/20 bg-yes/5 p-3.5">
                <p className="text-xs text-muted">{t("poolYes")}</p>
                <p className="mt-0.5 font-bold text-yes">
                  {formatUsdc(market.yesPool)}
                </p>
              </div>
              <div className="rounded-xl border border-no/20 bg-no/5 p-3.5">
                <p className="text-xs text-muted">{t("poolNo")}</p>
                <p className="mt-0.5 font-bold text-no">
                  {formatUsdc(market.noPool)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3.5">
                <p className="text-xs text-muted">{t("volume")}</p>
                <p className="mt-0.5 font-bold">{formatUsdc(volume)}</p>
              </div>
            </div>
          </Card>

          {/* Historique des paris */}
          <ActivityFeed marketId={marketId} />
        </div>

        {/* ================= Colonne latérale ================= */}
        <div className="space-y-4">
          {/* Bouton Résoudre — créateur uniquement, marché terminé non résolu */}
          {isCreator && ended && !market.resolved && (
            <Card className="border-amber-500/30 bg-amber-500/5 p-5">
              <p className="mb-3 text-sm">
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {t("actionRequired")}
                </span>{" "}
                {t("actionBody")}
              </p>
              <Button className="w-full" onClick={() => setResolveOpen(true)}>
                <Gavel className="h-4 w-4" />
                {t("resolveCta")}
              </Button>
            </Card>
          )}

          {/* Panneau de pari (si ouvert) */}
          {open && <BetPanel marketId={marketId} market={market} />}

          {/* Claim (si résolu) */}
          <ClaimPanel marketId={marketId} market={market} />

          {/* Ma position */}
          {position && (position.yesAmount > 0n || position.noAmount > 0n) && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                {t("myPosition")}
              </h3>
              <div className="space-y-2 text-sm">
                {position.yesAmount > 0n && (
                  <div className="flex justify-between">
                    <span className="text-muted">{t("onYes")}</span>
                    <span className="font-semibold text-yes">
                      {formatUsdc(position.yesAmount)} USDC
                    </span>
                  </div>
                )}
                {position.noAmount > 0n && (
                  <div className="flex justify-between">
                    <span className="text-muted">{t("onNo")}</span>
                    <span className="font-semibold text-no">
                      {formatUsdc(position.noAmount)} USDC
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Marché terminé mais pas résolu, et je ne suis pas le créateur */}
          {!open && !market.resolved && !isCreator && (
            <Card className="p-5 text-center text-sm text-muted">
              {t("waiting")}
            </Card>
          )}
        </div>
      </div>

      <ResolveModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        marketId={marketId}
        question={market.question}
      />
    </div>
  );
}
