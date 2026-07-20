"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton réutilisable (pattern shadcn/ui) avec plusieurs variantes :
 *  - primary : action principale (indigo)
 *  - yes / no : boutons de pari (vert / rouge)
 *  - outline / ghost : actions secondaires
 * `loading` affiche un spinner et désactive le bouton.
 */
type Variant = "primary" | "yes" | "no" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  // CTA principal : violet Arc plein, hover légèrement éclairci
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_20px_-8px_rgba(102,58,115,0.6)]",
  yes: "bg-yes/15 text-yes border border-yes/30 hover:bg-yes/25 hover:border-yes/60",
  no: "bg-no/15 text-no border border-no/30 hover:bg-no/25 hover:border-no/60",
  // Secondaire : outline discret qui prend l'accent au hover
  outline:
    "border border-border-strong text-foreground hover:bg-surface-hover hover:border-primary-light/60",
  ghost: "text-muted hover:text-foreground hover:bg-surface-hover",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        // Coins modernes (pas trop ronds), transitions douces
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
        "transition-all duration-200 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
