"use client";

/**
 * Veilleur de notifications — 100 % côté client, sans backend.
 *
 * À chaque chargement de page (puis toutes les 60 s tant que l'onglet
 * est ouvert), il vérifie les marchés SUIVIS (localStorage) :
 *  - clôture dans moins d'une heure  → notification "ferme bientôt"
 *  - marché résolu                   → notification "résolu"
 * Chaque alerte n'est émise qu'une seule fois par marché (drapeau en
 * localStorage). Ne fait rien si l'utilisateur n'a pas autorisé les
 * notifications navigateur.
 *
 * Limite assumée : ce n'est PAS un vrai système de notifications
 * serveur — l'utilisateur doit avoir le site ouvert pour être alerté.
 */
import { useEffect } from "react";
import { useReadContract } from "wagmi";
import { useTranslations } from "next-intl";
import { MARKET_ADDRESS, PHASE, marketAbi, isConfigured } from "@/lib/contract";
import { parseQuestion } from "@/lib/categories";
import {
  getFollowedMarkets,
  markNotified,
  notify,
  wasNotified,
} from "@/lib/follow";

const MAX_MARKETS = 500n;
/** Seuil "clôture bientôt" : 1 heure. */
const CLOSING_SOON_MS = 60 * 60 * 1000;

export function NotificationWatcher() {
  const t = useTranslations("notifications");

  // Même lecture que la page d'accueil → partage le cache react-query,
  // aucun appel RPC supplémentaire quand l'accueil est déjà chargé.
  const { data: markets } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getMarkets",
    args: [0n, MAX_MARKETS],
    query: { enabled: isConfigured },
  });

  useEffect(() => {
    if (!markets) return;

    const check = () => {
      // Sans permission, on ne consomme PAS les drapeaux "déjà notifié" :
      // si l'utilisateur accorde la permission plus tard, il recevra
      // quand même les alertes encore pertinentes.
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      const followed = getFollowedMarkets();
      const now = Date.now();

      for (const id of followed) {
        const market = markets[id];
        if (!market) continue;
        const { text } = parseQuestion(market.question);
        const endMs = Number(market.endTime) * 1000;

        // Finalisé → une seule alerte, prioritaire sur les autres.
        if (market.phase === PHASE.FINALIZED && !wasNotified(id, "resolved")) {
          markNotified(id, "resolved");
          notify(t("resolvedTitle"), t("resolvedBody", { question: text }));
          continue;
        }

        // Contesté → alerte dédiée (arbitrage à venir).
        if (market.phase === PHASE.DISPUTED && !wasNotified(id, "disputed")) {
          markNotified(id, "disputed");
          notify(t("disputedTitle"), t("disputedBody", { question: text }));
          continue;
        }

        // Clôture dans moins d'une heure (et pas encore passée).
        if (
          market.phase === PHASE.OPEN &&
          endMs - now > 0 &&
          endMs - now <= CLOSING_SOON_MS &&
          !wasNotified(id, "closing")
        ) {
          markNotified(id, "closing");
          notify(t("closingTitle"), t("closingBody", { question: text }));
        }
      }
    };

    check(); // au chargement
    const interval = setInterval(check, 60_000); // puis toutes les 60 s
    return () => clearInterval(interval);
  }, [markets, t]);

  return null; // composant invisible
}
