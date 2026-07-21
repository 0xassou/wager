import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "./providers";
import { Navbar } from "@/components/navbar";
import { NotificationWatcher } from "@/components/notification-watcher";
import { rtlLocales, type Locale } from "@/i18n/config";
import "./globals.css";

// Police Inter chargée par Next.js (auto-hébergée, pas de requête externe).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

/** Métadonnées traduites dans la langue active. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Langue active (lue depuis le cookie NEXT_LOCALE, anglais par défaut).
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("footer");

  // L'arabe s'écrit de droite à gauche : on inverse tout le layout.
  const dir = rtlLocales.includes(locale as Locale) ? "rtl" : "ltr";

  return (
    // suppressHydrationWarning : next-themes modifie la classe de <html>
    // côté client avant l'hydratation (c'est attendu).
    <html
      lang={locale}
      dir={dir}
      className={inter.variable}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {/* Alerte sur les marchés suivis (clôture proche / résolution) */}
            <NotificationWatcher />
            <Navbar />
            <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
              {children}
            </main>
            <footer className="border-t border-border py-6 text-center text-xs text-muted">
              {t("disclaimer")}
            </footer>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
