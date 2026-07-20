"use client";

/**
 * Panneau de pari (page de détail d'un marché).
 *
 * Flux en 2 étapes (standard ERC-20) :
 *  1. APPROVE : autoriser le contrat à prélever le montant en USDC.
 *  2. BET     : appeler bet(marketId, isYes, amount).
 * Le panneau détecte automatiquement si l'allowance est suffisante et
 * n'affiche l'étape "Approve" que si nécessaire.
 */
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  MARKET_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  erc20Abi,
  marketAbi,
  type MarketData,
} from "@/lib/contract";
import { cn, formatUsdc, payoutMultiplier } from "@/lib/utils";

interface BetPanelProps {
  marketId: number;
  market: MarketData;
}

export function BetPanel({ marketId, market }: BetPanelProps) {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const t = useTranslations("bet");
  const tc = useTranslations("common");

  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amountInput, setAmountInput] = useState("");

  // Montant saisi converti en unités USDC (6 décimales). 0n si invalide.
  const amount = useMemo(() => {
    try {
      const parsed = parseUnits(amountInput || "0", USDC_DECIMALS);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput]);

  // Solde USDC de l'utilisateur.
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  // Allowance actuelle : combien le contrat peut déjà prélever.
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      MARKET_ADDRESS,
    ],
    query: { enabled: !!address },
  });

  const needsApproval = amount > 0n && (allowance ?? 0n) < amount;

  // --- Transaction APPROVE ---
  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });

  // --- Transaction BET ---
  const betTx = useWriteContract();
  const betReceipt = useWaitForTransactionReceipt({ hash: betTx.data });

  // Après l'approve confirmé : re-vérifier l'allowance.
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
      approve.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  // Après le pari confirmé : rafraîchir toutes les données + vider le champ.
  useEffect(() => {
    if (betReceipt.isSuccess) {
      queryClient.invalidateQueries();
      setAmountInput("");
      betTx.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betReceipt.isSuccess]);

  const handleApprove = () => {
    approve.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [MARKET_ADDRESS, amount],
    });
  };

  const handleBet = () => {
    betTx.writeContract({
      address: MARKET_ADDRESS,
      abi: marketAbi,
      functionName: "bet",
      args: [BigInt(marketId), side === "yes", amount],
    });
  };

  // Gain potentiel si ce pari gagne (estimation avec les pools actuels).
  const multiplier = amount > 0n ? payoutMultiplier(market, side === "yes", amount) : 0;
  const potentialWin = amount > 0n ? Number(amountInput) * multiplier : 0;

  const busy =
    approve.isPending ||
    approveReceipt.isLoading ||
    betTx.isPending ||
    betReceipt.isLoading;

  const error = approve.error || betTx.error;

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
        {t("title")}
      </h3>

      {/* Choix du côté : Oui / Non */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("yes")}
          className={cn(
            "rounded-xl border py-3 text-sm font-bold transition-all",
            side === "yes"
              ? "border-yes bg-yes/20 text-yes shadow-[0_0_16px_-4px] shadow-yes/40"
              : "border-border text-muted hover:border-yes/40 hover:text-yes"
          )}
        >
          {tc("yes")}
        </button>
        <button
          onClick={() => setSide("no")}
          className={cn(
            "rounded-xl border py-3 text-sm font-bold transition-all",
            side === "no"
              ? "border-no bg-no/20 text-no shadow-[0_0_16px_-4px] shadow-no/40"
              : "border-border text-muted hover:border-no/40 hover:text-no"
          )}
        >
          {tc("no")}
        </button>
      </div>

      {/* Montant */}
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>{t("amount")}</span>
        {balance !== undefined && (
          <button
            className="transition-colors hover:text-foreground"
            onClick={() =>
              setAmountInput((Number(balance) / 10 ** USDC_DECIMALS).toString())
            }
          >
            {t("balanceMax", { balance: formatUsdc(balance) })}
          </button>
        )}
      </div>
      <Input
        type="number"
        min="0"
        step="any"
        placeholder="0.00"
        value={amountInput}
        onChange={(e) => setAmountInput(e.target.value)}
      />

      {/* Gain potentiel */}
      {amount > 0n && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5 text-sm">
          <span className="text-muted">{t("potential")}</span>
          <span className={cn("font-bold", side === "yes" ? "text-yes" : "text-no")}>
            ≈ {potentialWin.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
            USDC{" "}
            <span className="text-xs font-medium text-muted">
              (x{multiplier.toFixed(2)})
            </span>
          </span>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <p className="mt-3 rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
          {error.message.split("\n")[0]}
        </p>
      )}

      {/* Bouton principal : Approve OU Parier selon l'allowance */}
      <div className="mt-4">
        {!isConnected ? (
          <Button className="w-full" size="lg" disabled>
            {t("connect")}
          </Button>
        ) : needsApproval ? (
          <Button className="w-full" size="lg" loading={busy} onClick={handleApprove}>
            {t("approve", { amount: amountInput })}
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            variant={side === "yes" ? "yes" : "no"}
            loading={busy}
            disabled={amount === 0n}
            onClick={handleBet}
          >
            {t("betOn", {
              amount: amountInput || "0",
              side: side === "yes" ? tc("yes") : tc("no"),
            })}
          </Button>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted">{t("steps")}</p>
    </Card>
  );
}
