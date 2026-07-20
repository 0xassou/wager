"use client";

/**
 * Barre de cotes visuelle : proportion Oui (vert) / Non (rouge).
 * La largeur de chaque segment = probabilité implicite du marché.
 */
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface OddsBarProps {
  yesPercent: number; // 0 à 100
  className?: string;
}

export function OddsBar({ yesPercent, className }: OddsBarProps) {
  const t = useTranslations("common");

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-yes">
          {t("yes")} {yesPercent}%
        </span>
        <span className="text-no">
          {t("no")} {100 - yesPercent}%
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="bg-yes transition-all duration-500"
          style={{ width: `${yesPercent}%` }}
        />
        <div
          className="bg-no transition-all duration-500"
          style={{ width: `${100 - yesPercent}%` }}
        />
      </div>
    </div>
  );
}
