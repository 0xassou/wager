import { cn } from "@/lib/utils";

/** Placeholder animé affiché pendant le chargement des données on-chain. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-surface-hover", className)}
    />
  );
}
