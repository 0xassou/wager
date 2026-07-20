import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge de statut :
 *  - open : marché ouvert aux paris (vert pulsant)
 *  - pending : terminé, en attente de résolution (orange)
 *  - yes / no : résolu Oui / Non
 */
type BadgeVariant = "open" | "pending" | "yes" | "no";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  open: "bg-yes/10 text-yes border-yes/25",
  pending:
    "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400 dark:border-amber-500/25",
  yes: "bg-yes/10 text-yes border-yes/25",
  no: "bg-no/10 text-no border-no/25",
};

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {variant === "open" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yes opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yes" />
        </span>
      )}
      {children}
    </span>
  );
}
