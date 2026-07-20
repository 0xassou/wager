"use client";

/**
 * Sélecteur de langue (navbar).
 *
 * Affiche le drapeau de la langue courante ; au clic, ouvre un menu
 * avec les langues disponibles. Le choix est stocké dans le cookie
 * NEXT_LOCale lu par i18n/request.ts, puis la page est rafraîchie
 * pour recharger les traductions côté serveur.
 */
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { locales, localeInfo, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ferme le menu quand on clique ailleurs sur la page.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const selectLocale = (code: Locale) => {
    // Cookie valable 1 an, sur tout le site.
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    router.refresh(); // recharge les traductions serveur
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Language"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
      >
        <span className="text-base leading-none">{localeInfo[locale].flag}</span>
        <span className="hidden text-xs font-semibold uppercase sm:inline">
          {locale}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-50 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-card-hover animate-fade-in">
          {locales.map((code) => (
            <button
              key={code}
              onClick={() => selectLocale(code)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors hover:bg-surface-hover",
                code === locale ? "text-foreground" : "text-muted"
              )}
            >
              <span className="text-base leading-none">
                {localeInfo[code].flag}
              </span>
              <span className="flex-1">{localeInfo[code].name}</span>
              {code === locale && <Check className="h-3.5 w-3.5 text-primary-light" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
