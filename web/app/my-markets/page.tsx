"use client";

/**
 * PAGE "MES MARCHÉS"  —  /my-markets
 *
 * Deux onglets :
 *  - "Créés"    : les marchés dont je suis le créateur (avec alerte si
 *                 une résolution est en attente).
 *  - "Mes paris" : les marchés sur lesquels j'ai une position.
 *
 * MVP : on lit tous les marchés puis on filtre côté client. Pour de gros
 * volumes, on utiliserait un indexeur (The Graph, Ponder...).
 */
import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { ConfigWarning } from "@/components/config-warning";
import { MARKET_ADDRESS, marketAbi, isConfigured } from "@/lib/contract";
import { cn } from "@/lib/utils";

type Tab = "created" | "bets";

// Cf. app/page.tsx : le contrat clampe déjà `limit` au nombre réel de
// marchés, donc un seul appel getMarkets suffit sans dépendre de
// marketCount au préalable.
const MAX_MARKETS = 500n;

export default function MyMarketsPage() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("created");
  const t = useTranslations("myMarkets");
  const tErr = useTranslations("dataError");

  // Tous les marchés — indépendant de marketCount (cf. app/page.tsx pour
  // le détail : ça évite d'enchaîner deux lectures RPC vulnérables au
  // rate limiting strict du RPC Arc testnet).
  const {
    data: markets,
    isLoading,
    error: marketsError,
    refetch: refetchMarkets,
  } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarkets",
    args: [0n, MAX_MARKETS],
    query: { enabled: isConfigured },
  });

  // Uniquement utilisé ailleurs si besoin d'affichage — pas de dépendance
  // avec la lecture des marchés ci-dessus.
  const { error: countError, refetch: refetchCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "marketCount",
    query: { enabled: isConfigured },
  });

  // Distinguer un échec de lecture RPC d'une liste réellement vide. On ne
  // bloque que sur l'échec de getMarkets, qui est la seule lecture dont
  // cette page a réellement besoin pour s'afficher.
  const hasError = !!marketsError;
  const handleRetry = async () => {
    // Le RPC Arc testnet rejette une requête arrivant trop vite après la
    // précédente ("request limit reached") — on espace donc les appels.
    await refetchMarkets();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (countError) refetchCount();
  };

  // Ma position sur CHAQUE marché (lecture en batch avec multicall).
  const { data: positions } = useReadContracts({
    contracts: (markets ?? []).map((_, id) => ({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "getPosition",
      args: [BigInt(id), address ?? "0x0000000000000000000000000000000000000000"],
    })),
    query: { enabled: !!address && (markets ?? []).length > 0 },
  });

  // Marchés que J'AI créés.
  const createdMarkets = useMemo(
    () =>
      (markets ?? [])
        .map((market, id) => ({ market, id }))
        .filter(
          ({ market }) =>
            market.creator.toLowerCase() === address?.toLowerCase()
        )
        .reverse(),
    [markets, address]
  );

  // Marchés où J'AI parié.
  const betMarkets = useMemo(
    () =>
      (markets ?? [])
        .map((market, id) => ({ market, id }))
        .filter(({ id }) => {
          const result = positions?.[id];
          if (result?.status !== "success") return false;
          // wagmi ne peut pas inférer le type exact ici (tableau dynamique
          // de contrats), on caste donc manuellement le résultat.
          const position = result.result as unknown as {
            yesAmount: bigint;
            noAmount: bigint;
          };
          return position.yesAmount > 0n || position.noAmount > 0n;
        })
        .reverse(),
    [markets, positions]
  );

  // Marchés créés terminés mais non résolus → action requise.
  const pendingResolution = createdMarkets.filter(
    ({ market }) =>
      !market.resolved && Number(market.endTime) * 1000 <= Date.now()
  ).length;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center animate-fade-in">
        <p className="text-lg font-semibold">{t("connectTitle")}</p>
        <p className="max-w-sm text-sm text-muted">{t("connectBody")}</p>
        <ConnectButton />
      </div>
    );
  }

  const shown = tab === "created" ? createdMarkets : betMarkets;

  return (
    <div className="animate-fade-in">
      <ConfigWarning />

      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t("title")}</h1>

      {/* Alerte : résolutions en attente */}
      {pendingResolution > 0 && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {t("pendingAlert", { count: pendingResolution })}
          </span>{" "}
          {t("pendingHint")}
        </Card>
      )}

      {/* Onglets */}
      <div className="mb-6 inline-flex rounded-xl border border-border bg-surface p-1">
        {(
          [
            {
              key: "created",
              label: t("tabCreated", { count: createdMarkets.length }),
            },
            { key: "bets", label: t("tabBets", { count: betMarkets.length }) },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              tab === key
                ? "bg-primary text-white shadow"
                : "text-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grille */}
      {isLoading && !hasError ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : hasError ? (
        <div className="rounded-2xl border border-dashed border-no/40 bg-no/5 py-20 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-no" />
          <p className="mt-3 font-semibold">{tErr("title")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {tErr("body")}
          </p>
          <Button className="mt-4" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {tErr("retry")}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong py-20 text-center">
          <p className="font-semibold">
            {tab === "created" ? t("emptyCreated") : t("emptyBets")}
          </p>
          <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ market, id }) => (
            <MarketCard key={id} market={market} marketId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
