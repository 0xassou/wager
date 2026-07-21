"use client";

/**
 * Affichage du taux de frais protocolaire — argument marketing "moins
 * cher que la concurrence" (Polymarket & co prennent ~2 % des gains).
 *
 * Le taux est lu on-chain (feeBps). Sur un contrat sans frais (ancienne
 * version), la lecture échoue et le composant ne rend rien.
 */
import { useReadContract } from "wagmi";
import { useTranslations } from "next-intl";
import { BadgePercent } from "lucide-react";
import { MARKET_ADDRESS, marketAbi, isConfigured } from "@/lib/contract";
import { cn } from "@/lib/utils";

/** Hook partagé : taux de frais en % (ex: 0.5), ou undefined si indispo. */
export function useFeeRate(): number | undefined {
  const { data: feeBps } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "feeBps",
    query: { enabled: isConfigured },
  });
  return feeBps === undefined ? undefined : feeBps / 100;
}

/** Formate le taux sans zéros inutiles : 0.5 → "0.5", 1 → "1". */
function formatRate(rate: number): string {
  return rate.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Badge pour la page d'accueil (sous le sous-titre du hero). */
export function FeeBadge({ className }: { className?: string }) {
  const t = useTranslations("fees");
  const rate = useFeeRate();
  if (rate === undefined) return null;

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-yes/30 bg-yes/10 px-3 py-1.5 text-xs font-semibold text-yes",
        className
      )}
    >
      <BadgePercent className="h-3.5 w-3.5" />
      {t("badge", { rate: formatRate(rate) })}
    </p>
  );
}

/** Note discrète pour le panneau de pari (page de détail). */
export function FeeNote() {
  const t = useTranslations("fees");
  const rate = useFeeRate();
  if (rate === undefined) return null;

  return (
    <p className="mt-2 text-center text-[11px] text-muted">
      {t("note", { rate: formatRate(rate) })}
    </p>
  );
}
