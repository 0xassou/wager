import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Carte de base : fond légèrement surélevé, bordure subtile, coins arrondis.
 * `hover` ajoute l'effet de survol (utilisé pour les cartes de marché cliquables).
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover, ...props }: CardProps) {
  return (
    <div
      className={cn(
        // Style de carte unique pour toute l'app : navy, bordure subtile,
        // ombre légère, coins modernes (pas trop ronds)
        "rounded-xl border border-border bg-surface shadow-card",
        hover &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover hover:shadow-card-hover",
        className
      )}
      {...props}
    />
  );
}
