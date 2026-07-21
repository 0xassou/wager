"use client";

/**
 * Modal de proposition de résolution — première étape du cycle en
 * plusieurs temps (voir PredictionMarket.sol). Le choix confirmé ici
 * n'est PAS définitif : il ouvre une fenêtre de contestation avant de
 * pouvoir être finalisé (voir ResolutionPanel).
 *
 * `asAdmin` : true quand c'est le owner qui propose à la place d'un
 * créateur resté inactif (adminProposeResolution au lieu de
 * proposeResolution) — même UI, fonction de contrat différente.
 */
import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MARKET_ADDRESS, marketAbi, OUTCOME } from "@/lib/contract";
import { cn } from "@/lib/utils";

interface ProposeResolutionModalProps {
  open: boolean;
  onClose: () => void;
  marketId: number;
  question: string;
  asAdmin?: boolean;
}

export function ProposeResolutionModal({
  open,
  onClose,
  marketId,
  question,
  asAdmin = false,
}: ProposeResolutionModalProps) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const t = useTranslations("resolve");
  const tc = useTranslations("common");

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      reset();
      onClose();
    }
  }, [isSuccess, onClose, queryClient, reset]);

  const handlePropose = () => {
    if (!choice) return;
    writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: asAdmin ? "adminProposeResolution" : "proposeResolution",
      args: [BigInt(marketId), choice === "yes" ? OUTCOME.YES : OUTCOME.NO],
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("title")}>
      <div className="space-y-4">
        <p className="rounded-xl bg-background p-3.5 text-sm font-medium">
          {question}
        </p>

        <p className="text-xs text-muted">
          {asAdmin ? t("warningAdmin") : t("warning")}
        </p>

        {/* Choix du résultat proposé */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setChoice("yes")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border py-5 transition-all",
              choice === "yes"
                ? "border-yes bg-yes/15 shadow-[0_0_20px_-6px] shadow-yes/50"
                : "border-border hover:border-yes/40"
            )}
          >
            <CheckCircle2
              className={cn("h-7 w-7", choice === "yes" ? "text-yes" : "text-muted")}
            />
            <span
              className={cn(
                "text-sm font-bold",
                choice === "yes" ? "text-yes" : "text-muted"
              )}
            >
              {tc("yes")}
            </span>
          </button>

          <button
            onClick={() => setChoice("no")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border py-5 transition-all",
              choice === "no"
                ? "border-no bg-no/15 shadow-[0_0_20px_-6px] shadow-no/50"
                : "border-border hover:border-no/40"
            )}
          >
            <XCircle
              className={cn("h-7 w-7", choice === "no" ? "text-no" : "text-muted")}
            />
            <span
              className={cn(
                "text-sm font-bold",
                choice === "no" ? "text-no" : "text-muted"
              )}
            >
              {tc("no")}
            </span>
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
            {error.message.split("\n")[0]}
          </p>
        )}

        <Button
          className="w-full"
          size="lg"
          loading={isPending || isConfirming}
          disabled={!choice}
          onClick={handlePropose}
        >
          {isConfirming
            ? t("confirming")
            : choice
              ? t("confirm", { side: choice === "yes" ? tc("yes") : tc("no") })
              : t("choose")}
        </Button>
      </div>
    </Dialog>
  );
}
