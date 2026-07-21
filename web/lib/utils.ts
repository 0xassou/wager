import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits } from "viem";
import { PHASE, USDC_DECIMALS, type MarketData } from "./contract";

/** Fusionne des classes Tailwind sans conflits (pattern shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant USDC (bigint 6 décimales) → "1,234.50". */
export function formatUsdc(amount: bigint, maxDecimals = 2): string {
  const value = Number(formatUnits(amount, USDC_DECIMALS));
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Cote implicite du "Oui" en pourcentage (0-100).
 * odds = yesPool / (yesPool + noPool). Si aucun pari : 50/50.
 */
export function yesPercent(market: Pick<MarketData, "yesPool" | "noPool">): number {
  const total = market.yesPool + market.noPool;
  if (total === 0n) return 50;
  return Math.round((Number(market.yesPool) / Number(total)) * 100);
}

/**
 * Multiplicateur de gain potentiel si on parie 1 USDC maintenant.
 * Ex: pool Oui = 100, pool Non = 300 → parier Oui rapporte ~x4 ( (100+300+1)/101 ).
 * Simplifié : (total + mise) / (poolChoisi + mise).
 */
export function payoutMultiplier(
  market: Pick<MarketData, "yesPool" | "noPool">,
  isYes: boolean,
  betAmount: bigint
): number {
  const chosen = (isYes ? market.yesPool : market.noPool) + betAmount;
  const total = market.yesPool + market.noPool + betAmount;
  if (chosen === 0n) return 1;
  return Number(total) / Number(chosen);
}

/** Libellés localisés des unités de temps (fournis par les traductions). */
export type TimeLabels = {
  ended: string; // "Terminé" / "Ended" / ...
  d: string; // jour
  h: string; // heure
  m: string; // minute
  s: string; // seconde
};

/** "2d 4h", "3h 12m", "Ended"... temps restant avant endTime (secondes Unix). */
export function timeLeft(endTime: bigint, labels: TimeLabels): string {
  const seconds = Number(endTime) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return labels.ended;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}${labels.d} ${hours}${labels.h}`;
  if (hours > 0) return `${hours}${labels.h} ${minutes}${labels.m}`;
  if (minutes > 0) return `${minutes}${labels.m}`;
  return `${seconds}${labels.s}`;
}

/** Date lisible dans la langue active : "15 août 2026, 18:00". */
export function formatDate(endTime: bigint, locale: string): string {
  return new Date(Number(endTime) * 1000).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Raccourcit une adresse : 0x1234...abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** true si le marché est encore ouvert aux paris. */
export function isOpen(market: Pick<MarketData, "endTime" | "phase">): boolean {
  return market.phase === PHASE.OPEN && Number(market.endTime) * 1000 > Date.now();
}
