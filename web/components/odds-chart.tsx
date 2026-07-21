"use client";

/**
 * Graphique d'évolution des cotes dans le temps (style Polymarket) —
 * complète la barre de pourcentage instantanée (OddsBar), ne la
 * remplace pas.
 *
 * Deux lignes : % "Oui" (vert) et % "Non" (rouge, = 100 − % Oui, pas
 * de recalcul séparé depuis les logs). Ligne de référence pointillée
 * à 50 % comme repère visuel.
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
 * concrètes, les classes Tailwind / variables CSS ne suffisent pas ici.
 * Reprennent exactement les teintes yes/no déjà utilisées ailleurs
 * (voir app/globals.css --yes / --no). */
const CHART_COLORS = {
  dark: { yes: "#10B981", no: "#F43F5E", grid: "#1E3A57", axis: "#8CA2B8" },
  light: { yes: "#059669", no: "#E11D48", grid: "#DCE3EC", axis: "#5C7189" },
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
  noLabel,
  colors,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; payload: { time: number } }[];
  locale: string;
  yesLabel: string;
  noLabel: string;
  colors: { yes: string; no: string };
}) {
  if (!active || !payload || payload.length === 0) return null;
  const time = payload[0].payload.time;
  const yesPoint = payload.find((p) => p.dataKey === "pct");
  const noPoint = payload.find((p) => p.dataKey === "noPct");

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-card-hover">
      {yesPoint && (
        <p className="text-sm font-bold" style={{ color: colors.yes }}>
          {yesPoint.value}% {yesLabel}
        </p>
      )}
      {noPoint && (
        <p className="text-sm font-bold" style={{ color: colors.no }}>
          {noPoint.value}% {noLabel}
        </p>
      )}
      <p className="mt-0.5 text-xs text-muted">{formatTick(time, locale)}</p>
    </div>
  );
}

/** Légende compacte Oui/Non — couleurs alignées sur les lignes du graphique. */
function ChartLegend({
  yesLabel,
  noLabel,
  colors,
}: {
  yesLabel: string;
  noLabel: string;
  colors: { yes: string; no: string };
}) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: colors.yes }} />
        <span style={{ color: colors.yes }}>{yesLabel}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: colors.no }} />
        <span style={{ color: colors.no }}>{noLabel}</span>
      </span>
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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("title")}
        </p>
        <ChartLegend yesLabel={tc("yes")} noLabel={tc("no")} colors={colors} />
      </div>
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
            content={
              <CustomTooltip
                locale={locale}
                yesLabel={tc("yes")}
                noLabel={tc("no")}
                colors={colors}
              />
            }
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
          <Line
            type="monotone"
            dataKey="noPct"
            stroke={colors.no}
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
