// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ============================================================================
 *  PREDICTION MARKET — Arc Testnet (Circle USDC)
 * ============================================================================
 *
 *  Un marché de prédiction simple de type "parimutuel" :
 *
 *  1. N'importe qui peut CRÉER un marché (une question + une date de fin).
 *  2. N'importe qui peut PARIER "Oui" ou "Non" avec du USDC de test
 *     tant que le marché n'est pas terminé.
 *  3. Tous les paris "Oui" vont dans un pool, tous les paris "Non" dans
 *     un autre. Les cotes (odds) = ratio entre les deux pools.
 *  4. Après la date de fin, SEUL LE CRÉATEUR peut résoudre le marché
 *     (déclarer si la réponse est Oui ou Non).
 *  5. Les gagnants récupèrent leur mise + une part proportionnelle du
 *     pool perdant (système parimutuel, comme aux courses hippiques).
 *  6. Cas particulier : si personne n'a parié sur le côté gagnant,
 *     tout le monde est remboursé de sa mise.
 *
 *  Sécurité :
 *  - SafeERC20  : transferts USDC sûrs (gère les tokens non standards).
 *  - ReentrancyGuard : protège claim() contre les attaques de réentrance.
 *  - Checks-Effects-Interactions : l'état est mis à jour AVANT tout transfert.
 * ============================================================================
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictionMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    //  TYPES
    // ------------------------------------------------------------------

    /// Résultat d'un marché. `Unresolved` tant que le créateur n'a pas tranché.
    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    /// Toutes les données d'un marché.
    struct Market {
        address creator;     // Celui qui a créé le marché (seul à pouvoir résoudre)
        string question;     // La question, ex: "Le BTC dépassera-t-il 100k$ le 31/12 ?"
        uint64 endTime;      // Timestamp Unix après lequel on ne peut plus parier
        bool resolved;       // true une fois que le créateur a résolu
        Outcome outcome;     // Yes ou No après résolution
        uint256 yesPool;     // Total USDC parié sur "Oui" (6 décimales)
        uint256 noPool;      // Total USDC parié sur "Non" (6 décimales)
        uint256 betCount;    // Nombre total de paris placés (pour les stats)
    }

    /// La position d'UN utilisateur sur UN marché.
    struct Position {
        uint256 yesAmount;   // USDC misé sur "Oui" par cet utilisateur
        uint256 noAmount;    // USDC misé sur "Non" par cet utilisateur
        bool claimed;        // true si l'utilisateur a déjà réclamé ses gains
    }

    // ------------------------------------------------------------------
    //  ÉTAT
    // ------------------------------------------------------------------

    /// Le token USDC utilisé pour tous les paris (immutable = fixé au déploiement).
    IERC20 public immutable usdc;

    /// Tous les marchés. L'ID d'un marché = son index dans ce tableau.
    Market[] private _markets;

    /// positions[marketId][utilisateur] => Position
    mapping(uint256 => mapping(address => Position)) public positions;

    // ------------------------------------------------------------------
    //  ÉVÉNEMENTS  (le frontend les écoute pour l'historique)
    // ------------------------------------------------------------------

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        uint64 endTime
    );

    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool isYes,
        uint256 amount
    );

    event MarketResolved(uint256 indexed marketId, Outcome outcome);

    event RewardClaimed(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 amount
    );

    // ------------------------------------------------------------------
    //  ERREURS PERSONNALISÉES  (moins chères en gas que les strings)
    // ------------------------------------------------------------------

    error QuestionEmpty();
    error EndTimeInPast();
    error MarketNotFound();
    error BettingClosed();
    error AmountZero();
    error NotCreator();
    error TooEarlyToResolve();
    error AlreadyResolved();
    error InvalidOutcome();
    error NotResolved();
    error NothingToClaim();
    error AlreadyClaimed();

    // ------------------------------------------------------------------
    //  CONSTRUCTEUR
    // ------------------------------------------------------------------

    /// @param usdcAddress Adresse du token USDC (testnet) sur Arc.
    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC address zero");
        usdc = IERC20(usdcAddress);
    }

    // ------------------------------------------------------------------
    //  1. CRÉER UN MARCHÉ
    // ------------------------------------------------------------------

    /**
     * Crée un nouveau marché de prédiction.
     * @param question La question posée (doit être non vide).
     * @param endTime  Timestamp Unix (secondes) de la fin des paris — doit être dans le futur.
     * @return marketId L'ID du marché créé.
     */
    function createMarket(
        string calldata question,
        uint64 endTime
    ) external returns (uint256 marketId) {
        if (bytes(question).length == 0) revert QuestionEmpty();
        if (endTime <= block.timestamp) revert EndTimeInPast();

        marketId = _markets.length;

        // On ajoute le marché au tableau. Les pools démarrent à 0.
        _markets.push(
            Market({
                creator: msg.sender,
                question: question,
                endTime: endTime,
                resolved: false,
                outcome: Outcome.Unresolved,
                yesPool: 0,
                noPool: 0,
                betCount: 0
            })
        );

        emit MarketCreated(marketId, msg.sender, question, endTime);
    }

    // ------------------------------------------------------------------
    //  2. PARIER
    // ------------------------------------------------------------------

    /**
     * Parie `amount` USDC sur "Oui" ou "Non".
     * L'utilisateur doit d'abord avoir fait `usdc.approve(cetteAdresse, amount)`.
     * @param marketId ID du marché.
     * @param isYes    true = parier "Oui", false = parier "Non".
     * @param amount   Montant en USDC (6 décimales, ex: 10 USDC = 10_000_000).
     */
    function bet(uint256 marketId, bool isYes, uint256 amount) external {
        Market storage market = _getMarket(marketId);

        if (block.timestamp >= market.endTime) revert BettingClosed();
        if (market.resolved) revert AlreadyResolved();
        if (amount == 0) revert AmountZero();

        // --- Effects : on met à jour l'état AVANT le transfert ---
        Position storage position = positions[marketId][msg.sender];
        if (isYes) {
            market.yesPool += amount;
            position.yesAmount += amount;
        } else {
            market.noPool += amount;
            position.noAmount += amount;
        }
        market.betCount += 1;

        // --- Interaction : on tire les USDC du wallet de l'utilisateur ---
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit BetPlaced(marketId, msg.sender, isYes, amount);
    }

    // ------------------------------------------------------------------
    //  3. RÉSOUDRE (créateur uniquement)
    // ------------------------------------------------------------------

    /**
     * Le créateur déclare le résultat après la date de fin.
     * @param marketId ID du marché.
     * @param outcome  Outcome.Yes (1) ou Outcome.No (2).
     */
    function resolve(uint256 marketId, Outcome outcome) external {
        Market storage market = _getMarket(marketId);

        if (msg.sender != market.creator) revert NotCreator();
        if (block.timestamp < market.endTime) revert TooEarlyToResolve();
        if (market.resolved) revert AlreadyResolved();
        if (outcome != Outcome.Yes && outcome != Outcome.No) revert InvalidOutcome();

        market.resolved = true;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    // ------------------------------------------------------------------
    //  4. RÉCLAMER SES GAINS
    // ------------------------------------------------------------------

    /**
     * Réclame les gains après résolution.
     *
     * Calcul parimutuel :
     *   gain = mise_gagnante + (mise_gagnante / pool_gagnant) * pool_perdant
     *
     * Cas particulier : si le pool gagnant est vide (personne n'a parié sur
     * le bon côté), chacun est simplement remboursé de sa mise perdante.
     */
    function claim(uint256 marketId) external nonReentrant {
        Market storage market = _getMarket(marketId);
        if (!market.resolved) revert NotResolved();

        Position storage position = positions[marketId][msg.sender];
        if (position.claimed) revert AlreadyClaimed();

        uint256 payout = _calculatePayout(market, position);
        if (payout == 0) revert NothingToClaim();

        // --- Effects avant Interaction (anti-réentrance) ---
        position.claimed = true;

        usdc.safeTransfer(msg.sender, payout);

        emit RewardClaimed(marketId, msg.sender, payout);
    }

    // ------------------------------------------------------------------
    //  FONCTIONS DE LECTURE (utilisées par le frontend)
    // ------------------------------------------------------------------

    /// Nombre total de marchés créés.
    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    /// Récupère un marché par son ID.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId >= _markets.length) revert MarketNotFound();
        return _markets[marketId];
    }

    /**
     * Récupère une page de marchés (pagination pour la page d'accueil).
     * @param offset Index de départ.
     * @param limit  Nombre maximum de marchés à renvoyer.
     */
    function getMarkets(
        uint256 offset,
        uint256 limit
    ) external view returns (Market[] memory page) {
        uint256 total = _markets.length;
        if (offset >= total) return new Market[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        page = new Market[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _markets[i];
        }
    }

    /// Position d'un utilisateur sur un marché.
    function getPosition(
        uint256 marketId,
        address user
    ) external view returns (Position memory) {
        return positions[marketId][user];
    }

    /// Volume total (Oui + Non) d'un marché, en USDC (6 décimales).
    function getVolume(uint256 marketId) external view returns (uint256) {
        Market storage market = _getMarket(marketId);
        return market.yesPool + market.noPool;
    }

    /**
     * Montant que `user` peut réclamer sur un marché (0 si rien, déjà
     * réclamé, ou marché non résolu). Pratique pour afficher le bouton
     * "Claim" côté frontend sans faire de calcul en TypeScript.
     */
    function claimableAmount(
        uint256 marketId,
        address user
    ) external view returns (uint256) {
        if (marketId >= _markets.length) return 0;
        Market storage market = _markets[marketId];
        if (!market.resolved) return 0;

        Position storage position = positions[marketId][user];
        if (position.claimed) return 0;

        return _calculatePayout(market, position);
    }

    // ------------------------------------------------------------------
    //  FONCTIONS INTERNES
    // ------------------------------------------------------------------

    /// Renvoie le marché ou revert s'il n'existe pas.
    function _getMarket(uint256 marketId) private view returns (Market storage) {
        if (marketId >= _markets.length) revert MarketNotFound();
        return _markets[marketId];
    }

    /// Calcule le gain d'une position sur un marché résolu (voir claim()).
    function _calculatePayout(
        Market storage market,
        Position storage position
    ) private view returns (uint256) {
        bool yesWon = market.outcome == Outcome.Yes;

        uint256 winningPool = yesWon ? market.yesPool : market.noPool;
        uint256 losingPool = yesWon ? market.noPool : market.yesPool;
        uint256 userWinningStake = yesWon ? position.yesAmount : position.noAmount;
        uint256 userLosingStake = yesWon ? position.noAmount : position.yesAmount;

        if (winningPool == 0) {
            // Personne n'a parié sur le côté gagnant : on rembourse tout le monde.
            return userLosingStake;
        }

        if (userWinningStake == 0) {
            // L'utilisateur a perdu : rien à réclamer.
            return 0;
        }

        // Mise + part proportionnelle du pool perdant.
        return userWinningStake + (userWinningStake * losingPool) / winningPool;
    }
}
