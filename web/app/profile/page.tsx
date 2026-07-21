"use client";

/**
 * PAGE DE PROFIL  —  /profile
 *
 * Tout est calculé à partir de l'état on-chain déjà accessible (marchés
 * + positions de l'utilisateur), sans backend ni indexeur :
 *  - identicon généré localement depuis l'adresse (aucun service externe)
 *  - stats : paris, taux de réussite, gain net cumulé, marchés créés
 *  - badge d'activité purement cosmétique (Débutant / Actif / Expert)
 *  - historique des paris (gagné / perdu / remboursé / en attente)
 *  - historique des marchés créés
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { Check, Copy, Medal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/identicon";
import { StatusBadge } from "@/components/market-card";
import { useFeeRate } from "@/components/fee-badge";
import {
  MARKET_ADDRESS,
  OUTCOME,
  PHASE,
  isConfigured,
  marketAbi,
  type MarketData,
} from "@/lib/contract";
import { parseQuestion } from "@/lib/categories";
import { cn, formatUsdc, shortAddress } from "@/lib/utils";

const MAX_MARKETS = 500n;

/** Résultat d'un pari utilisateur sur un marché. */
type BetStatus = "pending" | "won" | "lost" | "refunded";

interface BetRecord {
  id: number;
  market: MarketData;
  text: string;
  yesAmount: bigint;
  noAmount: bigint;
  invested: bigint;
  status: BetStatus;
  /** Gain (ou perte) net vs mise, uniquement si résolu. Signé. */
  net: bigint;
}

/**
 * Reproduit côté client le calcul de gain du contrat (parimutuel net de
 * frais) pour estimer le résultat de chaque pari résolu.
 */
function computePayout(
  market: MarketData,
  yesAmount: bigint,
  noAmount: bigint,
  feeBps: bigint
): bigint {
  // Filet de sécurité déclenché : remboursement intégral, sans frais.
  if (market.forceRefunded) return yesAmount + noAmount;

  const yesWon = market.outcome === OUTCOME.YES;
  const winningPool = yesWon ? market.yesPool : market.noPool;
  const losingPool = yesWon ? market.noPool : market.yesPool;
  const stakeWin = yesWon ? yesAmount : noAmount;
  const stakeLose = yesWon ? noAmount : yesAmount;

  if (winningPool === 0n) return stakeLose; // remboursement
  if (stakeWin === 0n) return 0n; // perdu

  const winnings = (stakeWin * losingPool) / winningPool;
  const fee = (winnings * feeBps) / 10_000n;
  return stakeWin + winnings - fee;
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const feeRate = useFeeRate(); // % (ex 0.5) ou undefined si ancien contrat
  const [copied, setCopied] = useState(false);

  // Tous les marchés (un seul appel, batché avec le reste par viem).
  const { data: markets, isLoading } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarkets",
    args: [0n, MAX_MARKETS],
    query: { enabled: isConfigured },
  });

  // Ma position sur chaque marché (multicall batché).
  const { data: positions } = useReadContracts({
    contracts: (markets ?? []).map((_, id) => ({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "getPosition",
      args: [BigInt(id), address ?? "0x0000000000000000000000000000000000000000"],
    })),
    query: { enabled: !!address && (markets ?? []).length > 0 },
  });

  // ------------------------------------------------------------------
  //  Calcul des stats et de l'historique
  // ------------------------------------------------------------------
  const { bets, created, stats } = useMemo(() => {
    const feeBps = BigInt(Math.round((feeRate ?? 0) * 100));
    const bets: BetRecord[] = [];
    const created: { id: number; market: MarketData; text: string }[] = [];

    (markets ?? []).forEach((market, id) => {
      const { text } = parseQuestion(market.question);

      if (address && market.creator.toLowerCase() === address.toLowerCase()) {
        created.push({ id, market, text });
      }

      const result = positions?.[id];
      if (result?.status !== "success") return;
      const position = result.result as unknown as {
        yesAmount: bigint;
        noAmount: bigint;
        claimed: boolean;
      };
      const invested = position.yesAmount + position.noAmount;
      if (invested === 0n) return;

      let status: BetStatus = "pending";
      let net = 0n;
      if (market.phase === PHASE.FINALIZED) {
        const payout = computePayout(
          market,
          position.yesAmount,
          position.noAmount,
          feeBps
        );
        net = payout - invested;
        const yesWon = market.outcome === OUTCOME.YES;
        const winningPool = yesWon ? market.yesPool : market.noPool;
        const stakeWin = yesWon ? position.yesAmount : position.noAmount;
        status = market.forceRefunded
          ? "refunded"
          : winningPool === 0n
            ? "refunded"
            : stakeWin > 0n
              ? "won"
              : "lost";
      }

      bets.push({
        id,
        market,
        text,
        yesAmount: position.yesAmount,
        noAmount: position.noAmount,
        invested,
        status,
        net,
      });
    });

    // Les plus récents d'abord.
    bets.reverse();
    created.reverse();

    const won = bets.filter((b) => b.status === "won").length;
    const lost = bets.filter((b) => b.status === "lost").length;
    const netTotal = bets.reduce(
      (sum, b) => (b.status === "pending" ? sum : sum + b.net),
      0n
    );

    return {
      bets,
      created,
      stats: {
        betCount: bets.length,
        winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
        netTotal,
        createdCount: created.length,
      },
    };
  }, [markets, positions, address, feeRate]);

  // Badge d'activité cosmétique, basé sur le nombre de paris.
  const badgeKey =
    stats.betCount >= 10 ? "expert" : stats.betCount >= 3 ? "active" : "rookie";

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ------------------------------------------------------------------
  //  Rendu
  // ------------------------------------------------------------------
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center animate-fade-in">
        <p className="text-lg font-semibold">{t("connectTitle")}</p>
        <p className="max-w-sm text-sm text-muted">{t("connectBody")}</p>
        <ConnectButton />
      </div>
    );
  }

  const netPositive = stats.netTotal >= 0n;

  return (
    <div className="animate-fade-in">
      {/* ---------- En-tête : identicon + adresse + badge ---------- */}
      <Card className="mb-6 flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center">
        <Identicon address={address} size={72} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copyAddress}
              className="group flex items-center gap-2 font-mono text-lg font-bold transition-colors hover:text-primary-light"
              title={address}
            >
              {shortAddress(address)}
              {copied ? (
                <Check className="h-4 w-4 text-yes" />
              ) : (
                <Copy className="h-4 w-4 text-muted group-hover:text-primary-light" />
              )}
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-light/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-light">
              <Medal className="h-3 w-3" />
              {t(`badge_${badgeKey}`)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {copied ? t("copied") : t("copyHint")}
          </p>
        </div>
      </Card>

      {/* ---------- Stats ---------- */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statBets")}
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">
            {stats.betCount}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statWinRate")}
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">
            {stats.winRate === null ? "—" : `${stats.winRate}%`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statNet")}
          </p>
          <p
            className={cn(
              "mt-1.5 text-3xl font-bold tabular-nums",
              netPositive ? "text-yes" : "text-no"
            )}
          >
            {netPositive ? "+" : "−"}
            {formatUsdc(stats.netTotal < 0n ? -stats.netTotal : stats.netTotal)}
            <span className="ms-1 text-sm font-medium text-muted">USDC</span>
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statCreated")}
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">
            {stats.createdCount}
          </p>
        </Card>
      </section>

      {isLoading && <Skeleton className="h-64" />}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Historique des paris ---------- */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("historyTitle")}
          </h2>
          {bets.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted">
              {t("betsEmpty")}
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {bets.map((bet) => (
                <Link
                  key={bet.id}
                  href={`/market/${bet.id}`}
                  className="block p-4 transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-semibold">
                      {bet.text}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        bet.status === "won" && "bg-yes/10 text-yes",
                        bet.status === "lost" && "bg-no/10 text-no",
                        bet.status === "pending" &&
                          "bg-surface-hover text-muted",
                        bet.status === "refunded" &&
                          "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {t(`result_${bet.status}`)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {bet.yesAmount > 0n && (
                      <span>
                        <span className="font-semibold text-yes">
                          {tc("yes")}
                        </span>{" "}
                        · {formatUsdc(bet.yesAmount)} USDC
                      </span>
                    )}
                    {bet.noAmount > 0n && (
                      <span>
                        <span className="font-semibold text-no">
                          {tc("no")}
                        </span>{" "}
                        · {formatUsdc(bet.noAmount)} USDC
                      </span>
                    )}
                    {bet.status !== "pending" && (
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          bet.net >= 0n ? "text-yes" : "text-no"
                        )}
                      >
                        {bet.net >= 0n ? "+" : "−"}
                        {formatUsdc(bet.net < 0n ? -bet.net : bet.net)} USDC
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </section>

        {/* ---------- Marchés créés ---------- */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("createdTitle")}
          </h2>
          {created.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted">
              {t("createdEmpty")}
            </Card>
          ) : (
            <Card className="divide-y divide-border">
              {created.map(({ id, market, text }) => (
                <Link
                  key={id}
                  href={`/market/${id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-hover"
                >
                  <p className="line-clamp-1 text-sm font-semibold">{text}</p>
                  <StatusBadge market={market} />
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
