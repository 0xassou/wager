"use client";

/**
 * Modal "Créer un marché" :
 *  1. L'utilisateur saisit une question et une date/heure de fin.
 *  2. On appelle createMarket(question, endTime) sur le contrat.
 *  3. À la confirmation de la transaction, on ferme le modal et la
 *     liste des marchés se rafraîchit automatiquement (react-query).
 */
import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MARKET_ADDRESS, marketAbi } from "@/lib/contract";

interface CreateMarketModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateMarketModal({ open, onClose }: CreateMarketModalProps) {
  const t = useTranslations("create");
  const { isConnected } = useAccount();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState("");
  const [endDate, setEndDate] = useState(""); // format datetime-local

  // Hook wagmi pour envoyer la transaction.
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  // Attend que la transaction soit minée.
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Quand la transaction est confirmée : fermer + rafraîchir les données.
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      setQuestion("");
      setEndDate("");
      reset();
      onClose();
    }
  }, [isSuccess, onClose, queryClient, reset]);

  const handleSubmit = () => {
    if (!question.trim() || !endDate) return;
    // datetime-local → timestamp Unix (secondes)
    const endTime = BigInt(Math.floor(new Date(endDate).getTime() / 1000));

    writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "createMarket",
      args: [question.trim(), endTime],
    });
  };

  // La date minimum sélectionnable = maintenant (format datetime-local).
  const minDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const busy = isPending || isConfirming;

  return (
    <Dialog open={open} onClose={onClose} title={t("title")}>
      <div className="space-y-4">
        {/* Question */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("question")}
          </label>
          <Input
            placeholder={t("placeholder")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={200}
          />
          <p className="text-right text-[11px] text-muted">
            {question.length}/200
          </p>
        </div>

        {/* Date de fin */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("endLabel")}
          </label>
          <Input
            type="datetime-local"
            value={endDate}
            min={minDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <p className="text-[11px] text-muted">{t("endHelp")}</p>
        </div>

        {/* Erreur éventuelle (transaction rejetée, etc.) */}
        {error && (
          <p className="rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
            {error.message.split("\n")[0]}
          </p>
        )}

        <Button
          className="w-full"
          size="lg"
          loading={busy}
          disabled={!isConnected || !question.trim() || !endDate}
          onClick={handleSubmit}
        >
          {!isConnected
            ? t("connect")
            : isConfirming
              ? t("confirming")
              : t("cta")}
        </Button>
      </div>
    </Dialog>
  );
}
