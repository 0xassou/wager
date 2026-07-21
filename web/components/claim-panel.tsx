"use client";

/**
 * Panneau "Réclamer mes gains" — affiché quand le marché est résolu.
 * Montre le montant réclamable (calculé on-chain par claimableAmount)
 * et le bouton claim().
 */
import { useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MARKET_ADDRESS, PHASE, marketAbi, type MarketData } from "@/lib/contract";
import { formatUsdc } from "@/lib/utils";

export function ClaimPanel({
  marketId,
  market,
}: {
  marketId: number;
  market: MarketData;
}) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const t = useTranslations("claim");

  // Montant réclamable, calculé directement par le contrat.
  const { data: claimable } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "claimableAmount",
    args: [BigInt(marketId), address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address && market.phase === PHASE.FINALIZED },
  });

  // Position de l'utilisateur (pour savoir s'il a déjà réclamé).
  const { data: position } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "getPosition",
    args: [BigInt(marketId), address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      reset();
    }
  }, [isSuccess, queryClient, reset]);

  if (!address || market.phase !== PHASE.FINALIZED) return null;

  const hasBet =
    position && (position.yesAmount > 0n || position.noAmount > 0n);
  if (!hasBet) return null;

  // Déjà réclamé
  if (position.claimed) {
    return (
      <Card className="border-yes/30 bg-yes/5 p-5 text-center">
        <p className="text-sm font-semibold text-yes">{t("claimed")}</p>
      </Card>
    );
  }

  // A perdu : rien à réclamer
  if (!claimable || claimable === 0n) {
    return (
      <Card className="p-5 text-center">
        <p className="text-sm text-muted">{t("nothing")}</p>
      </Card>
    );
  }

  return (
    <Card className="border-yes/40 bg-gradient-to-br from-yes/10 to-transparent p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yes/15">
          <Trophy className="h-5 w-5 text-yes" />
        </span>
        <div>
          <p className="text-xs text-muted">{t("winnings")}</p>
          <p className="text-xl font-bold text-yes">
            {formatUsdc(claimable)} USDC
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
          {error.message.split("\n")[0]}
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        variant="yes"
        loading={isPending || isConfirming}
        onClick={() =>
          writeContract({
            address: MARKET_ADDRESS,
            abi: marketAbi,
            functionName: "claim",
            args: [BigInt(marketId)],
          })
        }
      >
        {t("cta")}
      </Button>
    </Card>
  );
}
