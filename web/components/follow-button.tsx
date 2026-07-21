"use client";

/**
 * Bouton "Suivre ce marché" (page de détail).
 *
 * L'état de suivi vit en localStorage (aucun backend). Au premier suivi,
 * on demande la permission de notifications navigateur — c'est elle qui
 * permet ensuite au NotificationWatcher d'alerter sur la clôture
 * imminente ou la résolution des marchés suivis.
 */
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ensureNotificationPermission,
  isFollowed,
  toggleFollow,
} from "@/lib/follow";
import { cn } from "@/lib/utils";

export function FollowButton({ marketId }: { marketId: number }) {
  const t = useTranslations("follow");

  // localStorage n'existe qu'après le mount (SSR-safe).
  const [mounted, setMounted] = useState(false);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    setMounted(true);
    setFollowing(isFollowed(marketId));
  }, [marketId]);

  if (!mounted) return null;

  const handleToggle = async () => {
    const nowFollowing = toggleFollow(marketId);
    setFollowing(nowFollowing);
    if (nowFollowing) {
      // Demande la permission au moment où elle devient utile.
      await ensureNotificationPermission();
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
        following
          ? "border-primary-light/50 bg-primary/15 text-primary-light"
          : "border-border text-muted hover:border-border-strong hover:text-foreground"
      )}
    >
      {following ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {following ? t("following") : t("follow")}
    </button>
  );
}
