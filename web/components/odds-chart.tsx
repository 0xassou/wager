"use client";

/**
 * Graphique d'évolution des cotes dans le temps (style Polymarket) —
 * complète la barre de pourcentage instantanée (OddsBar), ne la
 * remplace pas.
 *
 * Une seule ligne = % "Oui" (le % "Non" s'en déduit : 100 − valeur).
 * Ligne de référence pointillée à 50 % comme repère visuel.
 *
 * Si le marché a moins de 2 paris, il n'y a pas assez de points pour
 * qu'un graphique ait du sens : on affiche un état dégradé simple
 * plutôt qu'un graphique qui semblerait cassé (une ligne plate ou un
 * point isolé).
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOddsHistory } from "@/lib/use-odds-history";
import { Skeleton } from "@/components/ui/skeleton";

/** Couleurs résolues par thème — recharts a besoin de valeurs SVG
 * concrètes, les classes Tailwind / variables CSS ne suffisent pas ici. */
const CHART_COLORS = {
  dark: { yes: "#10B981", grid: "#1E3A57", axis: "#8CA2B8" },
  light: { yes: "#059669", grid: "#DCE3EC", axis: "#5C7189" },
};

function formatTick(time: number, locale: string) {
  return new Date(time).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CustomTooltip({
  active,
  payload,
  locale,
  yesLabel,
}: {
  active?: boolean;
  payload?: { value: number; payload: { time: number } }[];
  locale: string;
  yesLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-card-hover">
      <p className="text-sm font-bold text-yes">
        {point.value}% {yesLabel}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {formatTick(point.payload.time, locale)}
      </p>
    </div>
  );
}

export function OddsChart({ marketId }: { marketId: number }) {
  const t = useTranslations("chart");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const { data, isLoading } = useOddsHistory(marketId);

  // Le thème n'est connu qu'après l'hydratation (évite un mismatch SSR).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const colors = mounted && resolvedTheme === "light" ? CHART_COLORS.light : CHART_COLORS.dark;

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  // Pas assez de paris pour qu'une ligne ait du sens : état dégradé.
  if (!data || data.betCount < 2) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-center">
        <p className="text-sm font-medium text-muted">{t("notEnoughData")}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("title")}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => formatTick(v, locale)}
            stroke={colors.axis}
            tick={{ fontSize: 11, fill: colors.axis }}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
            minTickGap={40}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke={colors.axis}
            tick={{ fontSize: 11, fill: colors.axis }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ReferenceLine y={50} stroke={colors.axis} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Tooltip
            content={<CustomTooltip locale={locale} yesLabel={tc("yes")} />}
            cursor={{ stroke: colors.grid }}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke={colors.yes}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
