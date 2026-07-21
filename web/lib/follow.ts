/**
 * Suivi de marchés — 100 % côté client, stocké en localStorage.
 *
 * Pas de backend : la liste des marchés suivis et les drapeaux
 * "déjà notifié" vivent dans le navigateur de l'utilisateur.
 */

const FOLLOW_KEY = "wager:followed-markets";
const NOTIFIED_KEY = "wager:notified"; // wager:notified:<id>:<type>

/** IDs des marchés suivis par l'utilisateur. */
export function getFollowedMarkets(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FOLLOW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function isFollowed(marketId: number): boolean {
  return getFollowedMarkets().includes(marketId);
}

/** Suit / ne suit plus un marché. Renvoie le nouvel état (true = suivi). */
export function toggleFollow(marketId: number): boolean {
  const current = getFollowedMarkets();
  const next = current.includes(marketId)
    ? current.filter((id) => id !== marketId)
    : [...current, marketId];
  window.localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
  return next.includes(marketId);
}

/** Types d'alertes émises une seule fois par marché. */
export type NotificationKind = "closing" | "disputed" | "resolved";

export function wasNotified(marketId: number, kind: NotificationKind): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(`${NOTIFIED_KEY}:${marketId}:${kind}`) === "1";
}

export function markNotified(marketId: number, kind: NotificationKind): void {
  window.localStorage.setItem(`${NOTIFIED_KEY}:${marketId}:${kind}`, "1");
}

/**
 * Demande la permission de notification si pas encore tranchée.
 * Renvoie true si les notifications sont autorisées.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Émet une notification navigateur (silencieux si non autorisé). */
export function notify(title: string, body: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // Certains navigateurs mobiles interdisent le constructeur : on ignore.
  }
}
