"use client";

/**
 * Bandeau affiché si les adresses de contrat ne sont pas encore
 * configurées dans web/.env.local (avant le premier déploiement).
 */
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { isConfigured } from "@/lib/contract";

export function ConfigWarning() {
  const t = useTranslations("config");
  if (isConfigured) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">
          {t("body")}
        </p>
      </div>
    </div>
  );
}
