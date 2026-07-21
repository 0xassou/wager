"use client";

/**
 * Panneau de résolution — couvre les phases Proposed et Disputed du cycle
 * en plusieurs temps (voir PredictionMarket.sol) :
 *
 *  - Proposed : affiche le résultat proposé + compte à rebours de la
 *    fenêtre de contestation. Bouton "Contester" (avec dépôt requis,
 *    flux approve→dispute en 2 étapes) tant que la fenêtre est ouverte et
 *    que l'utilisateur n'est pas le créateur. Bouton "Finaliser" dès que
 *    la fenêtre est passée (n'importe qui peut l'appeler).
 *  - Disputed : affiche qui a contesté et le dépôt verrouillé. Si le
 *    wallet connecté est le owner, affiche le panneau d'arbitrage
 *    (confirmer ou renverser la proposition). Sinon, affiche un message
 *    d'attente + le bouton de filet de sécurité une fois le délai admin
 *    écoulé (remboursement neutre si le owner ne tranche jamais).
 */
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, Gavel, Scale, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MARKET_ADDRESS,
  USDC_ADDRESS,
  OUTCOME,
  PHASE,
  erc20Abi,
  marketAbi,
  type MarketData,
} from "@/lib/contract";
import { cn, formatDate, formatUsdc, shortAddress, timeLeft } from "@/lib/utils";

interface ResolutionPanelProps {
  marketId: number;
  market: MarketData;
}

export function ResolutionPanel({ marketId, market }: ResolutionPanelProps) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const t = useTranslations("resolution");
  const tc = useTranslations("common");
  const tBet = useTranslations("bet");
  const tTime = useTranslations("time");

  const timeLabels = {
    ended: tTime("ended"),
    d: tTime("d"),
    h: tTime("h"),
    m: tTime("m"),
    s: tTime("s"),
  };

  // Config du système de contestation, lue on-chain.
  const { data: disputeWindow } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "disputeWindow",
  });
  const { data: disputeBond } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "disputeBond",
  });
  const { data: adminTimeout } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "adminTimeout",
  });
  const { data: contractOwner } = useReadContract({
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "owner",
  });

  const isOwner =
    !!address && !!contractOwner && address.toLowerCase() === contractOwner.toLowerCase();
  const isCreator =
    !!address && address.toLowerCase() === market.creator.toLowerCase();

  // --- Transaction générique (dispute / finalize / adminResolve / forceRefund) ---
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
  const busy = isPending || isConfirming;

  // --- Allowance USDC (pour le dépôt de contestation) ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", MARKET_ADDRESS],
    query: { enabled: !!address && market.phase === PHASE.PROPOSED },
  });
  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
      approve.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  const [showArbitration, setShowArbitration] = useState(false);

  if (market.phase !== PHASE.PROPOSED && market.phase !== PHASE.DISPUTED) return null;

  const outcomeLabel = (o: number) => (o === OUTCOME.YES ? tc("yes") : tc("no"));

  // ==================================================================
  //  PHASE.PROPOSED
  // ==================================================================
  if (market.phase === PHASE.PROPOSED) {
    const deadline = market.proposedAt + (disputeWindow ?? 0n);
    const windowOpen = Number(deadline) * 1000 > Date.now();
    const bond = disputeBond ?? 0n;
    const needsApproval = (allowance ?? 0n) < bond;

    return (
      <Card className="border-primary-light/30 bg-primary/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary-light" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary-light">
            {t("proposedTitle")}
          </h3>
        </div>

        <p className="text-sm">
          {t("proposedBody", { outcome: outcomeLabel(market.proposedOutcome) })}
        </p>

        {windowOpen ? (
          <p className="mt-2 text-xs text-muted">
            {t("disputeUntil", {
              time: timeLeft(deadline, timeLabels),
              date: formatDate(deadline, locale),
            })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">{t("windowClosed")}</p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
            {error.message.split("\n")[0]}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {windowOpen && !isCreator && !address && (
            <Button variant="outline" disabled>
              <ShieldAlert className="h-4 w-4" />
              {tBet("connect")}
            </Button>
          )}

          {windowOpen && !isCreator && address && (
            <Button
              variant="outline"
              loading={busy}
              onClick={() =>
                needsApproval
                  ? approve.writeContract({
                      address: USDC_ADDRESS,
                      abi: erc20Abi,
                      functionName: "approve",
                      args: [MARKET_ADDRESS, bond],
                    })
                  : writeContract({
                      address: MARKET_ADDRESS,
                      abi: marketAbi,
                      functionName: "disputeResolution",
                      args: [BigInt(marketId)],
                    })
              }
            >
              <ShieldAlert className="h-4 w-4" />
              {needsApproval
                ? t("approveBond", { amount: formatUsdc(bond) })
                : t("disputeCta", { amount: formatUsdc(bond) })}
            </Button>
          )}

          {!windowOpen && (
            <Button
              loading={busy}
              onClick={() =>
                writeContract({
                  address: MARKET_ADDRESS,
                  abi: marketAbi,
                  functionName: "finalizeResolution",
                  args: [BigInt(marketId)],
                })
              }
            >
              {t("finalizeCta")}
            </Button>
          )}
        </div>

        {windowOpen && !isCreator && (
          <p className="mt-2 text-[11px] text-muted">{t("bondHint")}</p>
        )}
      </Card>
    );
  }

  // ==================================================================
  //  PHASE.DISPUTED
  // ==================================================================
  const forceRefundDeadline = market.disputedAt + (adminTimeout ?? 0n);
  const canForceRefund = Number(forceRefundDeadline) * 1000 <= Date.now();

  return (
    <Card className="border-no/30 bg-no/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-no" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-no">
          {t("disputedTitle")}
        </h3>
      </div>

      <p className="text-sm">
        {t("disputedBody", {
          outcome: outcomeLabel(market.proposedOutcome),
          disputer: shortAddress(market.disputer),
          amount: formatUsdc(market.disputeBondLocked),
        })}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
          {error.message.split("\n")[0]}
        </p>
      )}

      {/* Arbitrage — owner uniquement */}
      {isOwner && !showArbitration && (
        <Button className="mt-4" onClick={() => setShowArbitration(true)}>
          <Gavel className="h-4 w-4" />
          {t("arbitrateCta")}
        </Button>
      )}

      {isOwner && showArbitration && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            loading={busy}
            onClick={() =>
              writeContract({
                address: MARKET_ADDRESS,
                abi: marketAbi,
                functionName: "adminResolve",
                args: [BigInt(marketId), market.proposedOutcome],
              })
            }
          >
            {t("confirmOutcome", { outcome: outcomeLabel(market.proposedOutcome) })}
          </Button>
          <Button
            variant="outline"
            loading={busy}
            onClick={() =>
              writeContract({
                address: MARKET_ADDRESS,
                abi: marketAbi,
                functionName: "adminResolve",
                args: [
                  BigInt(marketId),
                  market.proposedOutcome === OUTCOME.YES ? OUTCOME.NO : OUTCOME.YES,
                ],
              })
            }
          >
            {t("overturnOutcome", {
              outcome: outcomeLabel(
                market.proposedOutcome === OUTCOME.YES ? OUTCOME.NO : OUTCOME.YES
              ),
            })}
          </Button>
        </div>
      )}

      {/* Non-owner : message d'attente + filet de sécurité */}
      {!isOwner && (
        <p className="mt-3 text-xs text-muted">
          {canForceRefund ? t("waitingTimeoutReached") : t("waitingArbitration")}
        </p>
      )}

      {canForceRefund && (
        <Button
          className="mt-3"
          variant="outline"
          loading={busy}
          onClick={() =>
            writeContract({
              address: MARKET_ADDRESS,
              abi: marketAbi,
              functionName: "forceFinalizeDisputeTimeout",
              args: [BigInt(marketId)],
            })
          }
        >
          <ShieldAlert className="h-4 w-4" />
          {t("forceRefundCta")}
        </Button>
      )}
    </Card>
  );
}
