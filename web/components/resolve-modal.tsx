"use client";

/**
 * Modal de résolution — visible UNIQUEMENT par le créateur du marché,
 * une fois la date de fin passée. Le créateur choisit le résultat
 * (Oui ou Non) puis confirme la transaction resolve().
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

interface ResolveModalProps {
  open: boolean;
  onClose: () => void;
  marketId: number;
  question: string;
}

export function ResolveModal({ open, onClose, marketId, question }: ResolveModalProps) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const t = useTranslations("resolve");
  const tc = useTranslations("common");

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Transaction confirmée : rafraîchir et fermer.
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      reset();
      onClose();
    }
  }, [isSuccess, onClose, queryClient, reset]);

  const handleResolve = () => {
    if (!choice) return;
    writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "resolve",
      args: [BigInt(marketId), choice === "yes" ? OUTCOME.YES : OUTCOME.NO],
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("title")}>
      <div className="space-y-4">
        <p className="rounded-xl bg-background p-3.5 text-sm font-medium">
          {question}
        </p>

        <p className="text-xs text-muted">{t("warning")}</p>

        {/* Choix du résultat */}
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
          onClick={handleResolve}
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
