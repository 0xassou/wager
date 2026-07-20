"use client";

/**
 * Barre de navigation :
 *  - logo / nom de l'app (+ badge TESTNET)
 *  - liens (Marchés, Mes marchés) — traduits
 *  - sélecteur de langue, toggle de thème, bouton wallet RainbowKit
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const links = [
    { href: "/", label: t("markets") },
    { href: "/my-markets", label: t("myMarkets") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary border border-primary-hover shadow-[0_2px_8px_-2px_rgba(102,58,115,0.6)]">
            <TrendingUp className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Wa<span className="text-primary-light">ger</span>
          </span>
          <span className="hidden rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted sm:inline">
            Testnet
          </span>
        </Link>

        {/* Liens de navigation — séparés dans un pill central discret */}
        <nav className="flex items-center gap-1 rounded-lg border border-border bg-surface/60 p-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-surface-hover text-foreground shadow-card"
                  : "text-muted hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Langue + thème + connexion wallet */}
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          />
        </div>
      </div>
    </header>
  );
}
