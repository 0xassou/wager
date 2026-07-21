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
import { AlertCircle, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketCard } from "@/components/market-card";
import { CreateMarketModal } from "@/components/create-market-modal";
import { ConfigWarning } from "@/components/config-warning";
import { FeeBadge } from "@/components/fee-badge";
import { MARKET_ADDRESS, marketAbi, isConfigured } from "@/lib/contract";
import {
  MARKET_CATEGORIES,
  parseQuestion,
  type MarketCategory,
} from "@/lib/categories";
import { cn, formatUsdc, isOpen } from "@/lib/utils";

/** Modes de tri de la grille des marchés. */
type SortMode = "popular" | "recent" | "ending";

// Limite haute passée à getMarkets(offset, limit) : le contrat clampe déjà
// `limit` au nombre réel de marchés (voir PredictionMarket.sol), donc un
// appel unique suffit — pas besoin de connaître marketCount au préalable.
// Largement au-dessus de ce qu'un MVP crée en pratique.
const MAX_MARKETS = 500n;

export default function HomePage() {
  const t = useTranslations("home");
  const tErr = useTranslations("dataError");
  const tCat = useTranslations("categories");
  const tDisc = useTranslations("discover");
  const [createOpen, setCreateOpen] = useState(false);

  // Découverte : recherche plein texte, filtre catégorie, mode de tri.
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MarketCategory>(
    "all"
  );
  const [sortMode, setSortMode] = useState<SortMode>("popular");

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

  // Filtrage (catégorie + recherche) puis tri, entièrement côté client
  // sur les données déjà chargées — aucun appel RPC supplémentaire.
  const sortedMarkets = useMemo(() => {
    const query = search.trim().toLowerCase();

    const withMeta = (markets ?? []).map((market, id) => ({
      market,
      id,
      ...parseQuestion(market.question),
    }));

    const filtered = withMeta.filter(
      ({ category, text }) =>
        (categoryFilter === "all" || category === categoryFilter) &&
        (query === "" || text.toLowerCase().includes(query))
    );

    switch (sortMode) {
      case "popular":
        // Volume total décroissant.
        return filtered.sort((a, b) =>
          Number(
            b.market.yesPool + b.market.noPool - (a.market.yesPool + a.market.noPool)
          )
        );
      case "ending": {
        // Marchés encore ouverts d'abord, par échéance la plus proche ;
        // les marchés terminés/résolus passent en fin de liste.
        const openMarkets = filtered
          .filter(({ market }) => isOpen(market))
          .sort((a, b) => Number(a.market.endTime - b.market.endTime));
        const closed = filtered.filter(({ market }) => !isOpen(market));
        return [...openMarkets, ...closed];
      }
      case "recent":
      default:
        // L'ID = l'index de création : plus grand = plus récent.
        return filtered.sort((a, b) => b.id - a.id);
    }
  }, [markets, search, categoryFilter, sortMode]);

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
            <span className="bg-gradient-to-r from-primary-light to-foreground bg-clip-text text-transparent">
              {t("title")}
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted">{t("subtitle")}</p>
          {/* Argument frais bas — lu on-chain, masqué si indisponible */}
          <FeeBadge className="mt-4" />
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
            <span className="ms-1.5 text-sm font-medium text-muted">USDC</span>
          </p>
        </div>
      </section>

      {/* ---------- Barre de découverte : recherche, catégories, tri ---------- */}
      <section className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Recherche */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tDisc("search")}
              className="ps-9"
            />
          </div>

          {/* Tri */}
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface p-1">
            {(["popular", "recent", "ending"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  sortMode === mode
                    ? "bg-surface-hover text-foreground shadow-card"
                    : "text-muted hover:text-foreground"
                )}
              >
                {tDisc(`sort_${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Filtres par catégorie */}
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...MARKET_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                categoryFilter === cat
                  ? "border-primary-light/60 bg-primary/15 text-primary-light"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {tCat(cat)}
            </button>
          ))}
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
            {(markets ?? []).length === 0 ? (
              // Aucun marché du tout sur la plateforme.
              <>
                <p className="text-lg font-semibold">{t("emptyTitle")}</p>
                <p className="mt-1 text-sm text-muted">{t("emptySubtitle")}</p>
              </>
            ) : (
              // Des marchés existent mais les filtres/recherche n'en gardent aucun.
              <p className="text-sm text-muted">{tDisc("noResults")}</p>
            )}
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
