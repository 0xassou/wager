"use client";

/**
 * PAGE D'ACCUEIL
 * - Hero avec le titre et le bouton "Créer un marché"
 * - Stats globales (volume total, nombre de marchés)
 * - Grille des marchés (les plus récents d'abord)
 */
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketCard } from "@/components/market-card";
import { CreateMarketModal } from "@/components/create-market-modal";
import { ConfigWarning } from "@/components/config-warning";
import { MARKET_ADDRESS, marketAbi, isConfigured } from "@/lib/contract";
import { formatUsdc } from "@/lib/utils";

// Limite haute passée à getMarkets(offset, limit) : le contrat clampe déjà
// `limit` au nombre réel de marchés (voir PredictionMarket.sol), donc un
// appel unique suffit — pas besoin de connaître marketCount au préalable.
// Largement au-dessus de ce qu'un MVP crée en pratique.
const MAX_MARKETS = 500n;

export default function HomePage() {
  const t = useTranslations("home");
  const tErr = useTranslations("dataError");
  const [createOpen, setCreateOpen] = useState(false);

  // Tous les marchés — un seul appel RPC, indépendant de marketCount
  // (voir MAX_MARKETS ci-dessus). Découpler les deux lectures évite que
  // l'échec de l'une bloque l'autre : avant, getMarkets ne se déclenchait
  // QUE si marketCount avait déjà réussi, ce qui les enchaînait inutilement
  // et les rendait vulnérables au rate limiting strict du RPC Arc testnet
  // ("request limit reached" — cf. lib/wagmi.ts).
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

  // Nombre total de marchés on-chain — uniquement pour la stat affichée,
  // ne conditionne plus la lecture des marchés eux-mêmes.
  const {
    data: count,
    error: countError,
    refetch: refetchCount,
  } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "marketCount",
    query: { enabled: isConfigured },
  });

  // Un échec de lecture RPC (ex: rate limiting du RPC Arc testnet) ne doit
  // JAMAIS être confondu avec "aucun marché" — sinon l'utilisateur voit un
  // faux résultat vide au lieu d'une erreur explicite avec possibilité de
  // réessayer. On ne bloque la grille que sur l'échec de getMarkets : la
  // stat marketCount est secondaire et affiche juste "—" si elle échoue.
  const hasError = !!marketsError;
  const handleRetry = async () => {
    // Le RPC Arc testnet rejette une requête qui arrive trop vite après la
    // précédente ("request limit reached"), qu'elle soit batchée ou non —
    // on espace donc explicitement les deux appels au lieu de les
    // enchaîner immédiatement.
    await refetchMarkets();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (countError) refetchCount();
  };

  // Volume total de la plateforme (somme des pools de tous les marchés).
  const totalVolume = useMemo(
    () =>
      (markets ?? []).reduce(
        (sum, market) => sum + market.yesPool + market.noPool,
        0n
      ),
    [markets]
  );

  // Les plus récents d'abord (l'ID = l'index de création).
  const sortedMarkets = useMemo(
    () =>
      (markets ?? [])
        .map((market, id) => ({ market, id }))
        .reverse(),
    [markets]
  );

  return (
    <div className="animate-fade-in">
      <ConfigWarning />

      {/* ---------- Hero ---------- */}
      <section className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary-light">
            <Sparkles className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title1")}
            <br />
            <span className="bg-gradient-to-r from-primary-light to-foreground bg-clip-text text-transparent">
              {t("title2")}
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted">{t("subtitle")}</p>
        </div>

        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("cta")}
        </Button>
      </section>

      {/* ---------- Stats globales — gros chiffres, style dashboard ---------- */}
      <section className="mb-8 grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statMarkets")}
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">
            {count !== undefined ? count.toString() : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("statVolume")}
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums">
            {formatUsdc(totalVolume)}
            <span className="ml-1.5 text-sm font-medium text-muted">USDC</span>
          </p>
        </div>
      </section>

      {/* ---------- Grille des marchés ---------- */}
      <section>
        {isLoading && !hasError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        )}

        {!isLoading && hasError && (
          <div className="rounded-xl border border-dashed border-no/40 bg-no/5 py-20 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-no" />
            <p className="mt-3 text-lg font-semibold">{tErr("title")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {tErr("body")}
            </p>
            <Button className="mt-4" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              {tErr("retry")}
            </Button>
          </div>
        )}

        {!isLoading && !hasError && sortedMarkets.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-strong py-20 text-center">
            <p className="text-lg font-semibold">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("emptySubtitle")}</p>
          </div>
        )}

        {!hasError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMarkets.map(({ market, id }) => (
              <MarketCard key={id} market={market} marketId={id} />
            ))}
          </div>
        )}
      </section>

      <CreateMarketModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
