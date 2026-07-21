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
 *     tant que le marché est ouvert (avant la date de fin).
 *  3. Tous les paris "Oui" vont dans un pool, tous les paris "Non" dans
 *     un autre. Les cotes (odds) = ratio entre les deux pools.
 *  5. Les gagnants récupèrent leur mise + une part proportionnelle du
 *     pool perdant (système parimutuel, comme aux courses hippiques).
 *  6. Cas particulier : si personne n'a parié sur le côté gagnant,
 *     tout le monde est remboursé de sa mise.
 *
 *  Résolution en deux temps (fenêtre de contestation) :
 *  - "Optimistic oracle" maison, sans dépendance à un oracle externe payant.
 *  - Après la fin, le CRÉATEUR propose un résultat (proposeResolution).
 *    Si le créateur reste inactif au-delà de `proposalGracePeriod`, le OWNER
 *    peut proposer à sa place (adminProposeResolution) — évite qu'un marché
 *    reste bloqué indéfiniment faute de créateur disponible.
 *  - S'ouvre alors une fenêtre de contestation (`disputeWindow`, 24h par
 *    défaut). N'IMPORTE QUI peut contester (disputeResolution) en verrouillant
 *    un dépôt en USDC (`disputeBond`).
 *  - Sans contestation à l'expiration de la fenêtre : n'importe qui peut
 *    finaliser (finalizeResolution) — la proposition devient définitive.
 *  - En cas de contestation : le marché passe en état Disputed et SEUL LE
 *    OWNER peut trancher manuellement (adminResolve). Si le contestataire
 *    avait raison, son dépôt lui est remboursé ; sinon il est perdu et
 *    rejoint les frais accumulés (accruedFees), retirables vers la trésorerie.
 *  - Filet de sécurité : si le owner ne tranche jamais un marché contesté
 *    (clé perdue, indisponibilité...), n'importe qui peut, après un délai
 *    long (`adminTimeout`, 30 jours par défaut à partir de la contestation),
 *    déclencher un remboursement NEUTRE intégral (forceFinalizeDisputeTimeout) :
 *    toutes les mises et le dépôt du contestataire sont rendus, sans frais,
 *    sans qu'aucun camp ne soit favorisé — on admet juste qu'on n'a pas pu
 *    trancher plutôt que de geler les fonds pour toujours.
 *
 *  Important : ce mécanisme protège contre un CRÉATEUR malhonnête. Il ne
 *  protège PAS contre un OWNER malhonnête, qui reste l'arbitre de dernier
 *  recours pour les marchés contestés (comme il l'est déjà pour les frais).
 *
 *  Frais protocolaires :
 *  - Un frais très bas (0,50 % par défaut — bien en-dessous des ~2 % des
 *    grandes plateformes) est prélevé au moment du claim, UNIQUEMENT sur
 *    la part de GAINS (la part du pool perdant) — jamais sur la mise
 *    remboursée, et aucun frais en cas de remboursement.
 *  - Le taux est configurable par le owner (plafonné à MAX_FEE_BPS pour
 *    protéger les utilisateurs), et les frais accumulés sont retirables
 *    par le owner vers l'adresse de trésorerie.
 *
 *  Sécurité :
 *  - SafeERC20  : transferts USDC sûrs (gère les tokens non standards).
 *  - ReentrancyGuard : protège claim() et les fonctions d'arbitrage.
 *  - Ownable : fonctions d'administration réservées au déployeur.
 *  - Checks-Effects-Interactions : l'état est mis à jour AVANT tout transfert.
 * ============================================================================
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionMarket is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    //  TYPES
    // ------------------------------------------------------------------

    /// Résultat d'un marché. `Unresolved` tant qu'aucun résultat n'est figé
    /// (aussi la valeur finale d'un marché remboursé neutralement, voir
    /// `forceFinalizeDisputeTimeout`).
    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    /// Où en est un marché dans le cycle de résolution.
    enum Phase {
        Open, // paris possibles, aucune résolution proposée
        Proposed, // résultat proposé, fenêtre de contestation en cours
        Disputed, // contesté, en attente d'arbitrage par le owner
        Finalized // résultat définitif, claims ouverts
    }

    /// Toutes les données d'un marché.
    struct Market {
        address creator; // Celui qui a créé le marché (peut proposer un résultat)
        string question; // La question, ex: "Le BTC dépassera-t-il 100k$ le 31/12 ?"
        uint64 endTime; // Timestamp Unix après lequel on ne peut plus parier
        Phase phase; // État courant du cycle de résolution
        Outcome outcome; // Résultat définitif une fois Finalized (Unresolved si remboursement neutre)
        Outcome proposedOutcome; // Résultat proposé (conservé même après finalisation, pour référence)
        uint64 proposedAt; // Timestamp de la proposition (0 tant qu'aucune)
        uint64 disputedAt; // Timestamp de la contestation (0 si jamais contesté)
        address disputer; // Adresse du contestataire (address(0) si aucun)
        uint256 disputeBondLocked; // Dépôt verrouillé, figé au moment de la contestation
        bool forceRefunded; // true si finalisé via le filet de sécurité (remboursement neutre)
        uint256 yesPool; // Total USDC parié sur "Oui" (6 décimales)
        uint256 noPool; // Total USDC parié sur "Non" (6 décimales)
        uint256 betCount; // Nombre total de paris placés (pour les stats)
    }

    /// La position d'UN utilisateur sur UN marché.
    struct Position {
        uint256 yesAmount; // USDC misé sur "Oui" par cet utilisateur
        uint256 noAmount; // USDC misé sur "Non" par cet utilisateur
        bool claimed; // true si l'utilisateur a déjà réclamé ses gains
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
    //  RÉSOLUTION & CONTESTATION
    // ------------------------------------------------------------------

    /// Durée de la fenêtre de contestation après une proposition. Défaut : 24h.
    uint64 public disputeWindow;

    /// Dépôt en USDC requis pour contester une proposition (6 décimales).
    /// Défaut : 5 USDC. Perdu si la contestation est rejetée par le owner.
    uint256 public disputeBond;

    /// Délai après `endTime` au-delà duquel le owner peut proposer un
    /// résultat à la place d'un créateur resté inactif. Défaut : 7 jours.
    uint64 public proposalGracePeriod;

    /// Délai après une contestation au-delà duquel, si le owner n'a toujours
    /// pas tranché, n'importe qui peut déclencher un remboursement neutre
    /// (filet de sécurité anti-blocage). Défaut : 30 jours.
    uint64 public adminTimeout;

    // ------------------------------------------------------------------
    //  FRAIS PROTOCOLAIRES
    // ------------------------------------------------------------------

    /// Plafond absolu du taux de frais : 5 % (500 basis points).
    /// Le owner ne peut JAMAIS dépasser ce plafond — protection des parieurs.
    uint16 public constant MAX_FEE_BPS = 500;

    /// Taux de frais en basis points (1 bps = 0,01 %). Défaut : 50 = 0,50 %.
    /// Appliqué uniquement sur la part de GAINS au moment du claim.
    uint16 public feeBps = 50;

    /// Adresse qui reçoit les frais lors de withdrawFees() (et les dépôts
    /// de contestation perdus, qui rejoignent le même pot).
    address public treasury;

    /// Frais + dépôts de contestation perdus, accumulés et pas encore
    /// retirés vers la trésorerie.
    uint256 public accruedFees;

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

    /// @param proposer Le créateur, ou le owner si le créateur était inactif.
    /// @param disputeDeadline Timestamp après lequel la fenêtre de contestation se ferme.
    event ResolutionProposed(
        uint256 indexed marketId,
        address indexed proposer,
        Outcome outcome,
        uint64 disputeDeadline
    );

    event ResolutionDisputed(
        uint256 indexed marketId,
        address indexed disputer,
        uint256 bondAmount
    );

    /// @param wasDisputed true si le marché est passé par l'arbitrage du owner
    /// (ou par le filet de sécurité neutre — auquel cas `outcome` = Unresolved).
    event MarketFinalized(uint256 indexed marketId, Outcome outcome, bool wasDisputed);

    event RewardClaimed(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 amount
    );

    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event FeesWithdrawn(address indexed to, uint256 amount);

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
    error InvalidOutcome();
    error NothingToClaim();
    error AlreadyClaimed();
    error FeeTooHigh();
    error TreasuryZero();
    error NoFeesToWithdraw();
    error AlreadyProposed();
    error NotProposed();
    error NotDisputed();
    error NotFinalized();
    error DisputeWindowClosed();
    error DisputeWindowOpen();
    error CreatorCannotDispute();
    error GracePeriodNotElapsed();
    error TimeoutNotReached();
    error InvalidConfig();

    // ------------------------------------------------------------------
    //  CONSTRUCTEUR
    // ------------------------------------------------------------------

    /// @param usdcAddress     Adresse du token USDC (testnet) sur Arc.
    /// @param treasuryAddress Adresse qui recevra les frais protocolaires.
    constructor(
        address usdcAddress,
        address treasuryAddress
    ) Ownable(msg.sender) {
        require(usdcAddress != address(0), "USDC address zero");
        if (treasuryAddress == address(0)) revert TreasuryZero();
        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;

        disputeWindow = 24 hours;
        disputeBond = 5_000_000; // 5 USDC (6 décimales)
        proposalGracePeriod = 7 days;
        adminTimeout = 30 days;
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

        // On ajoute le marché au tableau. Les pools démarrent à 0, phase Open.
        _markets.push(
            Market({
                creator: msg.sender,
                question: question,
                endTime: endTime,
                phase: Phase.Open,
                outcome: Outcome.Unresolved,
                proposedOutcome: Outcome.Unresolved,
                proposedAt: 0,
                disputedAt: 0,
                disputer: address(0),
                disputeBondLocked: 0,
                forceRefunded: false,
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

        if (market.phase != Phase.Open) revert BettingClosed();
        if (block.timestamp >= market.endTime) revert BettingClosed();
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
    //  3. RÉSOLUTION EN DEUX TEMPS (proposition → contestation → finalisation)
    // ------------------------------------------------------------------

    /**
     * Le créateur propose un résultat après la date de fin. N'importe qui
     * peut ensuite contester pendant `disputeWindow`.
     */
    function proposeResolution(uint256 marketId, Outcome outcome) external {
        Market storage market = _getMarket(marketId);

        if (msg.sender != market.creator) revert NotCreator();
        if (block.timestamp < market.endTime) revert TooEarlyToResolve();
        if (market.phase != Phase.Open) revert AlreadyProposed();

        _propose(market, marketId, outcome);
    }

    /**
     * Filet de sécurité : si le créateur reste inactif plus de
     * `proposalGracePeriod` après la fin des paris, le owner peut proposer
     * un résultat à sa place — évite qu'un marché reste bloqué faute de
     * créateur disponible. Passe par la même fenêtre de contestation.
     */
    function adminProposeResolution(uint256 marketId, Outcome outcome) external onlyOwner {
        Market storage market = _getMarket(marketId);

        if (market.phase != Phase.Open) revert AlreadyProposed();
        if (block.timestamp < uint256(market.endTime) + proposalGracePeriod) {
            revert GracePeriodNotElapsed();
        }

        _propose(market, marketId, outcome);
    }

    /// Logique commune à proposeResolution / adminProposeResolution.
    function _propose(Market storage market, uint256 marketId, Outcome outcome) private {
        if (outcome != Outcome.Yes && outcome != Outcome.No) revert InvalidOutcome();

        market.phase = Phase.Proposed;
        market.proposedOutcome = outcome;
        market.proposedAt = uint64(block.timestamp);

        emit ResolutionProposed(
            marketId,
            msg.sender,
            outcome,
            uint64(block.timestamp) + disputeWindow
        );
    }

    /**
     * Conteste la proposition en cours, en verrouillant `disputeBond` USDC.
     * Le créateur ne peut pas contester son propre marché. Doit être appelé
     * pendant la fenêtre de contestation.
     */
    function disputeResolution(uint256 marketId) external nonReentrant {
        Market storage market = _getMarket(marketId);

        if (market.phase != Phase.Proposed) revert NotProposed();
        if (block.timestamp > uint256(market.proposedAt) + disputeWindow) {
            revert DisputeWindowClosed();
        }
        if (msg.sender == market.creator) revert CreatorCannotDispute();

        uint256 bond = disputeBond;

        // --- Effects avant Interaction ---
        market.phase = Phase.Disputed;
        market.disputer = msg.sender;
        market.disputeBondLocked = bond;
        market.disputedAt = uint64(block.timestamp);

        usdc.safeTransferFrom(msg.sender, address(this), bond);

        emit ResolutionDisputed(marketId, msg.sender, bond);
    }

    /**
     * Finalise une proposition non contestée après expiration de la fenêtre.
     * N'importe qui peut l'appeler (ne fait qu'entériner un résultat déjà
     * verrouillé, sans transfert de fonds ni privilège particulier).
     */
    function finalizeResolution(uint256 marketId) external {
        Market storage market = _getMarket(marketId);

        if (market.phase != Phase.Proposed) revert NotProposed();
        if (block.timestamp <= uint256(market.proposedAt) + disputeWindow) {
            revert DisputeWindowOpen();
        }

        market.phase = Phase.Finalized;
        market.outcome = market.proposedOutcome;

        emit MarketFinalized(marketId, market.proposedOutcome, false);
    }

    /**
     * Arbitrage du owner sur un marché contesté.
     * - Si `finalOutcome` confirme la proposition initiale : le contestataire
     *   avait tort, son dépôt est perdu et rejoint les frais accumulés.
     * - Sinon : le contestataire avait raison, son dépôt lui est remboursé.
     */
    function adminResolve(uint256 marketId, Outcome finalOutcome) external onlyOwner nonReentrant {
        Market storage market = _getMarket(marketId);

        if (market.phase != Phase.Disputed) revert NotDisputed();
        if (finalOutcome != Outcome.Yes && finalOutcome != Outcome.No) revert InvalidOutcome();

        bool disputeUpheld = finalOutcome != market.proposedOutcome;
        uint256 bond = market.disputeBondLocked;
        address disputerAddress = market.disputer;

        // --- Effects avant Interaction ---
        market.phase = Phase.Finalized;
        market.outcome = finalOutcome;
        if (!disputeUpheld) {
            accruedFees += bond;
        }

        if (disputeUpheld) {
            usdc.safeTransfer(disputerAddress, bond);
        }

        emit MarketFinalized(marketId, finalOutcome, true);
    }

    /**
     * Filet de sécurité anti-blocage : si un marché contesté n'a toujours
     * pas été tranché par le owner après `adminTimeout` (30 jours par
     * défaut) à partir de la contestation, N'IMPORTE QUI peut déclencher un
     * remboursement neutre — personne n'est favorisé, tout le monde
     * récupère sa mise (et le contestataire son dépôt), sans frais.
     */
    function forceFinalizeDisputeTimeout(uint256 marketId) external nonReentrant {
        Market storage market = _getMarket(marketId);

        if (market.phase != Phase.Disputed) revert NotDisputed();
        if (block.timestamp <= uint256(market.disputedAt) + adminTimeout) {
            revert TimeoutNotReached();
        }

        uint256 bond = market.disputeBondLocked;
        address disputerAddress = market.disputer;

        // --- Effects avant Interaction ---
        market.phase = Phase.Finalized;
        market.forceRefunded = true;
        // outcome reste Unresolved : _calculatePayout court-circuite via forceRefunded.

        usdc.safeTransfer(disputerAddress, bond);

        emit MarketFinalized(marketId, Outcome.Unresolved, true);
    }

    // ------------------------------------------------------------------
    //  4. RÉCLAMER SES GAINS
    // ------------------------------------------------------------------

    /**
     * Réclame les gains après finalisation.
     *
     * Calcul parimutuel :
     *   gain brut = mise_gagnante + (mise_gagnante / pool_gagnant) * pool_perdant
     *
     * Frais : feeBps est appliqué UNIQUEMENT sur la part de gains (la part
     * du pool perdant), jamais sur la mise remboursée. Le net est versé au
     * parieur, le frais s'accumule dans accruedFees.
     *
     * Cas particuliers (sans frais) :
     *  - Pool gagnant vide : chacun est remboursé de sa mise.
     *  - Marché remboursé neutralement (filet de sécurité) : chacun récupère
     *    l'intégralité de ce qu'il a misé sur les deux côtés.
     */
    function claim(uint256 marketId) external nonReentrant {
        Market storage market = _getMarket(marketId);
        if (market.phase != Phase.Finalized) revert NotFinalized();

        Position storage position = positions[marketId][msg.sender];
        if (position.claimed) revert AlreadyClaimed();

        (uint256 netPayout, uint256 fee) = _calculatePayout(market, position);
        if (netPayout == 0) revert NothingToClaim();

        // --- Effects avant Interaction (anti-réentrance) ---
        position.claimed = true;
        accruedFees += fee;

        usdc.safeTransfer(msg.sender, netPayout);

        emit RewardClaimed(marketId, msg.sender, netPayout);
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
     * Montant NET (après frais) que `user` peut réclamer sur un marché
     * (0 si rien, déjà réclamé, ou marché non finalisé). Pratique pour
     * afficher le bouton "Claim" côté frontend sans calcul TypeScript.
     */
    function claimableAmount(
        uint256 marketId,
        address user
    ) external view returns (uint256) {
        if (marketId >= _markets.length) return 0;
        Market storage market = _markets[marketId];
        if (market.phase != Phase.Finalized) return 0;

        Position storage position = positions[marketId][user];
        if (position.claimed) return 0;

        (uint256 netPayout, ) = _calculatePayout(market, position);
        return netPayout;
    }

    // ------------------------------------------------------------------
    //  FONCTIONS INTERNES
    // ------------------------------------------------------------------

    /// Renvoie le marché ou revert s'il n'existe pas.
    function _getMarket(uint256 marketId) private view returns (Market storage) {
        if (marketId >= _markets.length) revert MarketNotFound();
        return _markets[marketId];
    }

    /**
     * Calcule le gain NET d'une position sur un marché finalisé, ainsi que
     * le frais protocolaire correspondant (voir claim()).
     * @return netPayout Montant versé au parieur (mise + gains − frais).
     * @return fee       Frais prélevé (0 en cas de remboursement ou perte).
     */
    function _calculatePayout(
        Market storage market,
        Position storage position
    ) private view returns (uint256 netPayout, uint256 fee) {
        if (market.forceRefunded) {
            // Filet de sécurité : personne n'a "gagné", chacun récupère
            // l'intégralité de sa mise sur les deux côtés, sans frais.
            return (position.yesAmount + position.noAmount, 0);
        }

        bool yesWon = market.outcome == Outcome.Yes;

        uint256 winningPool = yesWon ? market.yesPool : market.noPool;
        uint256 losingPool = yesWon ? market.noPool : market.yesPool;
        uint256 userWinningStake = yesWon ? position.yesAmount : position.noAmount;
        uint256 userLosingStake = yesWon ? position.noAmount : position.yesAmount;

        if (winningPool == 0) {
            // Personne n'a parié sur le côté gagnant : remboursement, sans frais.
            return (userLosingStake, 0);
        }

        if (userWinningStake == 0) {
            // L'utilisateur a perdu : rien à réclamer.
            return (0, 0);
        }

        // Part proportionnelle du pool perdant = les "gains" purs.
        uint256 winnings = (userWinningStake * losingPool) / winningPool;

        // Frais uniquement sur les gains — jamais sur la mise remboursée.
        fee = (winnings * feeBps) / 10_000;
        netPayout = userWinningStake + winnings - fee;
    }

    // ------------------------------------------------------------------
    //  ADMINISTRATION (owner uniquement)
    // ------------------------------------------------------------------

    /// Modifie le taux de frais (plafonné à MAX_FEE_BPS = 5 %).
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /// Change l'adresse de trésorerie qui reçoit les frais.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert TreasuryZero();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// Envoie les frais accumulés vers la trésorerie.
    function withdrawFees() external onlyOwner {
        uint256 amount = accruedFees;
        if (amount == 0) revert NoFeesToWithdraw();

        // Effects avant Interaction.
        accruedFees = 0;
        usdc.safeTransfer(treasury, amount);

        emit FeesWithdrawn(treasury, amount);
    }

    /// Modifie la durée de la fenêtre de contestation.
    function setDisputeWindow(uint64 newWindow) external onlyOwner {
        if (newWindow == 0) revert InvalidConfig();
        disputeWindow = newWindow;
    }

    /// Modifie le montant du dépôt de contestation requis.
    function setDisputeBond(uint256 newBond) external onlyOwner {
        disputeBond = newBond;
    }

    /// Modifie le délai de grâce avant qu'un créateur soit considéré inactif.
    function setProposalGracePeriod(uint64 newPeriod) external onlyOwner {
        proposalGracePeriod = newPeriod;
    }

    /// Modifie le délai du filet de sécurité anti-blocage (doit rester
    /// strictement supérieur à la fenêtre de contestation, sans quoi il
    /// pourrait expirer avant même qu'une contestation soit possible).
    function setAdminTimeout(uint64 newTimeout) external onlyOwner {
        if (newTimeout <= disputeWindow) revert InvalidConfig();
        adminTimeout = newTimeout;
    }
}
