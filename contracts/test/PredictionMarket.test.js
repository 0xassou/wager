/**
 * Tests du PredictionMarket — s'exécutent sur le réseau local Hardhat.
 *
 * Usage :  npx hardhat test
 *
 * Couvre :
 *  - création de marché → paris Oui/Non
 *  - résolution en deux temps : proposition → fenêtre de contestation →
 *    finalisation (sans contestation), arbitrage owner (contestation
 *    confirmée ou renversée), filet de sécurité anti-blocage
 *  - frais protocolaires : 0,50 % par défaut sur les GAINS uniquement
 *  - impossibilité de parier/claim tant que le marché n'est pas finalisé
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// 1 USDC = 1_000_000 (6 décimales)
const USDC = (n) => ethers.parseUnits(n.toString(), 6);

// Valeurs des enums dans le contrat
const OUTCOME_UNRESOLVED = 0;
const OUTCOME_YES = 1;
const OUTCOME_NO = 2;
const PHASE_OPEN = 0;
const PHASE_PROPOSED = 1;
const PHASE_DISPUTED = 2;
const PHASE_FINALIZED = 3;

const DISPUTE_WINDOW = 24 * 3600;
const DISPUTE_BOND = USDC(5);

describe("PredictionMarket", function () {
  let usdc, market, creator, alice, bob, treasury;

  beforeEach(async function () {
    // `creator` déploie le contrat → il est aussi le owner.
    [creator, alice, bob, treasury] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    for (const user of [creator, alice, bob]) {
      await usdc.mint(user.address, USDC(1000));
    }

    const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    market = await PredictionMarket.deploy(
      await usdc.getAddress(),
      treasury.address
    );

    for (const user of [creator, alice, bob]) {
      await usdc.connect(user).approve(await market.getAddress(), USDC(1000));
    }
  });

  /// Crée un marché qui se termine dans 1 heure et renvoie son ID (0).
  async function createTestMarket() {
    const endTime = (await time.latest()) + 3600;
    await market.createMarket("Le BTC dépassera-t-il 100k$ ?", endTime);
    return { marketId: 0, endTime };
  }

  /// Appelle proposeResolution et renvoie le timestamp exact du bloc miné
  /// (évite de deviner le timestamp — plus robuste que de le calculer à
  /// l'avance, puisque chaque transaction avance l'horloge d'au moins 1s).
  async function proposeAndGetTimestamp(marketId, outcome) {
    const tx = await market.proposeResolution(marketId, outcome);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    return block.timestamp;
  }

  /// Crée un marché, place des paris, avance le temps jusqu'après la fin,
  /// et propose une résolution Oui. Renvoie le timestamp de la proposition.
  async function marketWithProposal() {
    const { endTime } = await createTestMarket();
    await market.connect(alice).bet(0, true, USDC(100));
    await market.connect(bob).bet(0, false, USDC(400));
    await time.increaseTo(endTime + 1);
    await market.proposeResolution(0, OUTCOME_YES);
    return endTime;
  }

  // ==================================================================
  //  Cycle de vie de base
  // ==================================================================

  it("crée un marché avec les bonnes données", async function () {
    const { endTime } = await createTestMarket();
    const m = await market.getMarket(0);

    expect(m.creator).to.equal(creator.address);
    expect(m.question).to.equal("Le BTC dépassera-t-il 100k$ ?");
    expect(m.endTime).to.equal(endTime);
    expect(m.phase).to.equal(PHASE_OPEN);
    expect(await market.marketCount()).to.equal(1);
  });

  it("refuse une date de fin dans le passé", async function () {
    const past = (await time.latest()) - 10;
    await expect(
      market.createMarket("Question ?", past)
    ).to.be.revertedWithCustomError(market, "EndTimeInPast");
  });

  it("accepte les paris et met à jour les pools", async function () {
    await createTestMarket();

    await market.connect(alice).bet(0, true, USDC(100));
    await market.connect(bob).bet(0, false, USDC(300));

    const m = await market.getMarket(0);
    expect(m.yesPool).to.equal(USDC(100));
    expect(m.noPool).to.equal(USDC(300));
    expect(m.betCount).to.equal(2);
    expect(await market.getVolume(0)).to.equal(USDC(400));
  });

  it("refuse les paris après la date de fin", async function () {
    const { endTime } = await createTestMarket();
    await time.increaseTo(endTime + 1);

    await expect(
      market.connect(alice).bet(0, true, USDC(10))
    ).to.be.revertedWithCustomError(market, "BettingClosed");
  });

  it("refuse de parier une fois qu'une résolution a été proposée", async function () {
    await marketWithProposal();
    await expect(
      market.connect(alice).bet(0, true, USDC(10))
    ).to.be.revertedWithCustomError(market, "BettingClosed");
  });

  // ==================================================================
  //  Proposition de résolution
  // ==================================================================

  describe("proposeResolution", function () {
    it("seul le créateur peut proposer, et seulement après la fin", async function () {
      const { endTime } = await createTestMarket();

      await expect(
        market.proposeResolution(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "TooEarlyToResolve");

      await time.increaseTo(endTime + 1);

      await expect(
        market.connect(alice).proposeResolution(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "NotCreator");

      const proposedAt = await proposeAndGetTimestamp(0, OUTCOME_YES);
      const filter = market.filters.ResolutionProposed(0);
      const [event] = await market.queryFilter(filter);
      expect(event.args.proposer).to.equal(creator.address);
      expect(event.args.outcome).to.equal(OUTCOME_YES);
      expect(event.args.disputeDeadline).to.equal(BigInt(proposedAt) + BigInt(DISPUTE_WINDOW));

      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_PROPOSED);
      expect(m.proposedOutcome).to.equal(OUTCOME_YES);
    });

    it("refuse une double proposition", async function () {
      await marketWithProposal();
      await expect(
        market.proposeResolution(0, OUTCOME_NO)
      ).to.be.revertedWithCustomError(market, "AlreadyProposed");
    });

    it("le owner peut proposer à la place d'un créateur inactif après le délai de grâce", async function () {
      const { endTime } = await createTestMarket();
      await time.increaseTo(endTime + 1);

      // Trop tôt : le délai de grâce (7 jours) n'est pas écoulé.
      await expect(
        market.adminProposeResolution(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "GracePeriodNotElapsed");

      await time.increase(7 * 86400 + 1);

      const tx = await market.adminProposeResolution(0, OUTCOME_YES);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const [event] = await market.queryFilter(market.filters.ResolutionProposed(0));
      expect(event.args.proposer).to.equal(creator.address);
      expect(event.args.disputeDeadline).to.equal(BigInt(block.timestamp) + BigInt(DISPUTE_WINDOW));

      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_PROPOSED);
    });

    it("un non-owner ne peut pas proposer à la place du créateur", async function () {
      const { endTime } = await createTestMarket();
      await time.increaseTo(endTime + 7 * 86400 + 2);
      await expect(
        market.connect(alice).adminProposeResolution(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });
  });

  // ==================================================================
  //  Finalisation sans contestation
  // ==================================================================

  describe("finalisation sans contestation", function () {
    it("refuse la finalisation avant l'expiration de la fenêtre", async function () {
      await marketWithProposal();
      await expect(
        market.finalizeResolution(0)
      ).to.be.revertedWithCustomError(market, "DisputeWindowOpen");
    });

    it("n'importe qui peut finaliser après expiration de la fenêtre, et les claims s'ouvrent", async function () {
      await marketWithProposal();
      await time.increase(DISPUTE_WINDOW + 1);

      await expect(market.connect(bob).finalizeResolution(0))
        .to.emit(market, "MarketFinalized")
        .withArgs(0, OUTCOME_YES, false);

      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_FINALIZED);
      expect(m.outcome).to.equal(OUTCOME_YES);

      // Alice (100 sur Oui) gagne : pool gagnant 100, pool perdant 400,
      // gains purs = 400, frais 0,5% = 2, net = 100 + 400 - 2 = 498.
      expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(498));
      await market.connect(alice).claim(0);
    });
  });

  // ==================================================================
  //  Contestation
  // ==================================================================

  describe("disputeResolution", function () {
    it("verrouille le dépôt et passe le marché en Disputed", async function () {
      await marketWithProposal();

      const before = await usdc.balanceOf(bob.address);
      await expect(market.connect(bob).disputeResolution(0))
        .to.emit(market, "ResolutionDisputed")
        .withArgs(0, bob.address, DISPUTE_BOND);
      const after = await usdc.balanceOf(bob.address);

      expect(before - after).to.equal(DISPUTE_BOND);
      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_DISPUTED);
      expect(m.disputer).to.equal(bob.address);
      expect(m.disputeBondLocked).to.equal(DISPUTE_BOND);
    });

    it("le créateur ne peut pas contester son propre marché", async function () {
      await marketWithProposal();
      await expect(
        market.connect(creator).disputeResolution(0)
      ).to.be.revertedWithCustomError(market, "CreatorCannotDispute");
    });

    it("refuse la contestation après expiration de la fenêtre", async function () {
      await marketWithProposal();
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(
        market.connect(bob).disputeResolution(0)
      ).to.be.revertedWithCustomError(market, "DisputeWindowClosed");
    });

    it("refuse une seconde contestation (déjà Disputed)", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await expect(
        market.connect(alice).disputeResolution(0)
      ).to.be.revertedWithCustomError(market, "NotProposed");
    });

    it("bloque finalizeResolution une fois contesté", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(
        market.finalizeResolution(0)
      ).to.be.revertedWithCustomError(market, "NotProposed");
    });

    it("bloque le claim tant que le marché est Disputed", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await expect(
        market.connect(alice).claim(0)
      ).to.be.revertedWithCustomError(market, "NotFinalized");
    });
  });

  // ==================================================================
  //  Arbitrage (adminResolve)
  // ==================================================================

  describe("adminResolve", function () {
    it("confirme la proposition initiale : le dépôt du contestataire est perdu", async function () {
      await marketWithProposal(); // Alice 100 Oui, Bob 400 Non, proposé Oui
      await market.connect(bob).disputeResolution(0); // Bob conteste (pense que c'est Non)

      await expect(market.adminResolve(0, OUTCOME_YES))
        .to.emit(market, "MarketFinalized")
        .withArgs(0, OUTCOME_YES, true);

      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_FINALIZED);
      expect(m.outcome).to.equal(OUTCOME_YES);

      // Le dépôt de Bob (5 USDC) rejoint les frais accumulés.
      expect(await market.accruedFees()).to.equal(DISPUTE_BOND);

      // Alice peut toujours réclamer normalement.
      expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(498));
    });

    it("renverse la proposition initiale : le dépôt du contestataire est remboursé", async function () {
      await marketWithProposal(); // proposé Oui par le créateur
      const before = await usdc.balanceOf(bob.address);
      await market.connect(bob).disputeResolution(0);

      await expect(market.adminResolve(0, OUTCOME_NO))
        .to.emit(market, "MarketFinalized")
        .withArgs(0, OUTCOME_NO, true);

      const after = await usdc.balanceOf(bob.address);
      // Bob récupère intégralement son dépôt (pas de bonus, comme choisi).
      expect(after - before).to.equal(0);

      expect(await market.accruedFees()).to.equal(0);

      const m = await market.getMarket(0);
      expect(m.outcome).to.equal(OUTCOME_NO);

      // Bob (400 sur Non) gagne désormais : pool gagnant 400, perdant 100,
      // gains purs = 100, frais 0,5% = 0.5 -> arrondi entier = 0 (troncature).
      const claimable = await market.claimableAmount(0, bob.address);
      expect(claimable).to.be.gt(USDC(400)); // mise + gains, net de frais
    });

    it("seul le owner peut arbitrer", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await expect(
        market.connect(alice).adminResolve(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });

    it("refuse d'arbitrer un marché non contesté", async function () {
      await marketWithProposal();
      await expect(
        market.adminResolve(0, OUTCOME_YES)
      ).to.be.revertedWithCustomError(market, "NotDisputed");
    });
  });

  // ==================================================================
  //  Filet de sécurité anti-blocage
  // ==================================================================

  describe("forceFinalizeDisputeTimeout", function () {
    it("refuse avant l'expiration du délai admin", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await expect(
        market.forceFinalizeDisputeTimeout(0)
      ).to.be.revertedWithCustomError(market, "TimeoutNotReached");
    });

    it("rembourse tout le monde neutralement si le owner ne tranche jamais", async function () {
      await marketWithProposal(); // Alice 100 Oui, Bob 400 Non
      await market.connect(bob).disputeResolution(0);

      await time.increase(30 * 86400 + 1); // adminTimeout par défaut

      const bobBefore = await usdc.balanceOf(bob.address);
      await expect(market.connect(alice).forceFinalizeDisputeTimeout(0))
        .to.emit(market, "MarketFinalized")
        .withArgs(0, OUTCOME_UNRESOLVED, true);
      const bobAfter = await usdc.balanceOf(bob.address);

      // Bob récupère son dépôt de contestation immédiatement.
      expect(bobAfter - bobBefore).to.equal(DISPUTE_BOND);

      const m = await market.getMarket(0);
      expect(m.phase).to.equal(PHASE_FINALIZED);
      expect(m.forceRefunded).to.equal(true);

      // Alice et Bob récupèrent CHACUN l'intégralité de leur mise, sans frais.
      expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(100));
      expect(await market.claimableAmount(0, bob.address)).to.equal(USDC(400));

      await market.connect(alice).claim(0);
      await market.connect(bob).claim(0);
      expect(await market.accruedFees()).to.equal(0);
    });

    it("refuse si le marché n'est pas Disputed", async function () {
      await marketWithProposal();
      await expect(
        market.forceFinalizeDisputeTimeout(0)
      ).to.be.revertedWithCustomError(market, "NotDisputed");
    });
  });

  // ==================================================================
  //  Claims
  // ==================================================================

  describe("claim", function () {
    it("distribue les gains proportionnellement, net de frais (parimutuel)", async function () {
      await marketWithProposal(); // Alice 100 Oui, Bob 400 Non, proposé Oui
      await time.increase(DISPUTE_WINDOW + 1);
      await market.finalizeResolution(0);

      expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(498));

      const before = await usdc.balanceOf(alice.address);
      await market.connect(alice).claim(0);
      const after = await usdc.balanceOf(alice.address);
      expect(after - before).to.equal(USDC(498));

      expect(await market.claimableAmount(0, bob.address)).to.equal(0);
      await expect(market.connect(bob).claim(0)).to.be.revertedWithCustomError(
        market,
        "NothingToClaim"
      );

      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(
        market,
        "AlreadyClaimed"
      );
    });

    it("rembourse tout le monde si personne n'a parié sur le côté gagnant (sans frais)", async function () {
      const { endTime } = await createTestMarket();
      await market.connect(alice).bet(0, false, USDC(50));
      await market.connect(bob).bet(0, false, USDC(150));
      await time.increaseTo(endTime + 1);
      await market.proposeResolution(0, OUTCOME_YES);
      await time.increase(DISPUTE_WINDOW + 1);
      await market.finalizeResolution(0);

      expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(50));
      const before = await usdc.balanceOf(alice.address);
      await market.connect(alice).claim(0);
      expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(50));
      expect(await market.accruedFees()).to.equal(0);
    });

    it("refuse tout claim tant que le marché n'est pas finalisé", async function () {
      const { endTime } = await createTestMarket();
      await market.connect(alice).bet(0, true, USDC(10));
      await expect(
        market.connect(alice).claim(0)
      ).to.be.revertedWithCustomError(market, "NotFinalized");

      await time.increaseTo(endTime + 1);
      await expect(
        market.connect(alice).claim(0)
      ).to.be.revertedWithCustomError(market, "NotFinalized");

      await market.proposeResolution(0, OUTCOME_YES);
      await expect(
        market.connect(alice).claim(0)
      ).to.be.revertedWithCustomError(market, "NotFinalized");
    });
  });

  // ==================================================================
  //  Frais protocolaires (fonctions d'administration existantes)
  // ==================================================================

  describe("frais protocolaires", function () {
    it("a les bons paramètres par défaut", async function () {
      expect(await market.feeBps()).to.equal(50);
      expect(await market.MAX_FEE_BPS()).to.equal(500);
      expect(await market.treasury()).to.equal(treasury.address);
      expect(await market.owner()).to.equal(creator.address);
      expect(await market.disputeWindow()).to.equal(DISPUTE_WINDOW);
      expect(await market.disputeBond()).to.equal(DISPUTE_BOND);
    });

    it("le owner peut retirer les frais (dont dépôts perdus) vers la trésorerie", async function () {
      await marketWithProposal();
      await market.connect(bob).disputeResolution(0);
      await market.adminResolve(0, OUTCOME_YES); // confirme -> dépôt de Bob perdu (5 USDC)
      await market.connect(alice).claim(0); // + frais de claim (2 USDC sur 400 de gains)

      const expected = await market.accruedFees();
      expect(expected).to.equal(USDC(7)); // 5 (dépôt perdu) + 2 (frais de claim)

      const before = await usdc.balanceOf(treasury.address);
      await market.withdrawFees();
      const after = await usdc.balanceOf(treasury.address);
      expect(after - before).to.equal(expected);
      expect(await market.accruedFees()).to.equal(0);
    });

    it("le owner peut changer le taux, plafonné à 5 %", async function () {
      await expect(market.setFeeBps(501)).to.be.revertedWithCustomError(
        market,
        "FeeTooHigh"
      );
      await expect(
        market.connect(alice).setFeeBps(100)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });
  });

  // ==================================================================
  //  Configuration du système de contestation
  // ==================================================================

  describe("configuration owner", function () {
    it("permet d'ajuster disputeWindow, disputeBond et proposalGracePeriod", async function () {
      await market.setDisputeWindow(3600);
      expect(await market.disputeWindow()).to.equal(3600);

      await market.setDisputeBond(USDC(10));
      expect(await market.disputeBond()).to.equal(USDC(10));

      await market.setProposalGracePeriod(86400);
      expect(await market.proposalGracePeriod()).to.equal(86400);
    });

    it("refuse une fenêtre de contestation nulle", async function () {
      await expect(market.setDisputeWindow(0)).to.be.revertedWithCustomError(
        market,
        "InvalidConfig"
      );
    });

    it("refuse un adminTimeout inférieur ou égal à disputeWindow", async function () {
      const currentWindow = await market.disputeWindow();
      await expect(
        market.setAdminTimeout(currentWindow)
      ).to.be.revertedWithCustomError(market, "InvalidConfig");
    });

    it("seul le owner peut modifier la configuration", async function () {
      await expect(
        market.connect(alice).setDisputeWindow(3600)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
      await expect(
        market.connect(alice).setDisputeBond(USDC(1))
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });
  });
});
