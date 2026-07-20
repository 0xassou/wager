/**
 * Tests du PredictionMarket — s'exécutent sur le réseau local Hardhat.
 *
 * Usage :  npx hardhat test
 *
 * Scénario testé de bout en bout :
 *   création de marché → paris Oui/Non → résolution → réclamation des gains.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// 1 USDC = 1_000_000 (6 décimales)
const USDC = (n) => ethers.parseUnits(n.toString(), 6);

// Valeurs de l'enum Outcome dans le contrat
const OUTCOME_YES = 1;
const OUTCOME_NO = 2;

describe("PredictionMarket", function () {
  let usdc, market, creator, alice, bob;

  beforeEach(async function () {
    [creator, alice, bob] = await ethers.getSigners();

    // Déploie le MockUSDC et distribue 1000 USDC à chacun.
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    for (const user of [creator, alice, bob]) {
      await usdc.mint(user.address, USDC(1000));
    }

    // Déploie le PredictionMarket.
    const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    market = await PredictionMarket.deploy(await usdc.getAddress());

    // Chaque utilisateur autorise le contrat à prélever ses USDC.
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

  it("crée un marché avec les bonnes données", async function () {
    const { endTime } = await createTestMarket();
    const m = await market.getMarket(0);

    expect(m.creator).to.equal(creator.address);
    expect(m.question).to.equal("Le BTC dépassera-t-il 100k$ ?");
    expect(m.endTime).to.equal(endTime);
    expect(m.resolved).to.equal(false);
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

    await market.connect(alice).bet(0, true, USDC(100)); // Alice parie Oui
    await market.connect(bob).bet(0, false, USDC(300)); // Bob parie Non

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

  it("seul le créateur peut résoudre, et seulement après la fin", async function () {
    const { endTime } = await createTestMarket();

    // Trop tôt
    await expect(market.resolve(0, OUTCOME_YES)).to.be.revertedWithCustomError(
      market,
      "TooEarlyToResolve"
    );

    await time.increaseTo(endTime + 1);

    // Pas le créateur
    await expect(
      market.connect(alice).resolve(0, OUTCOME_YES)
    ).to.be.revertedWithCustomError(market, "NotCreator");

    // Le créateur résout
    await market.resolve(0, OUTCOME_YES);
    const m = await market.getMarket(0);
    expect(m.resolved).to.equal(true);
    expect(m.outcome).to.equal(OUTCOME_YES);
  });

  it("distribue les gains proportionnellement (parimutuel)", async function () {
    const { endTime } = await createTestMarket();

    // Alice : 100 sur Oui. Creator : 100 sur Oui. Bob : 400 sur Non.
    await market.connect(alice).bet(0, true, USDC(100));
    await market.connect(creator).bet(0, true, USDC(100));
    await market.connect(bob).bet(0, false, USDC(400));

    await time.increaseTo(endTime + 1);
    await market.resolve(0, OUTCOME_YES);

    // Pool gagnant (Oui) = 200, pool perdant (Non) = 400.
    // Alice a 50% du pool gagnant → 100 + 200 = 300 USDC.
    expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(300));

    const before = await usdc.balanceOf(alice.address);
    await market.connect(alice).claim(0);
    const after = await usdc.balanceOf(alice.address);
    expect(after - before).to.equal(USDC(300));

    // Bob a perdu : rien à réclamer.
    expect(await market.claimableAmount(0, bob.address)).to.equal(0);
    await expect(market.connect(bob).claim(0)).to.be.revertedWithCustomError(
      market,
      "NothingToClaim"
    );

    // Double claim interdit.
    await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(
      market,
      "AlreadyClaimed"
    );
  });

  it("rembourse tout le monde si personne n'a parié sur le côté gagnant", async function () {
    const { endTime } = await createTestMarket();

    // Tout le monde parie Non... mais le résultat est Oui.
    await market.connect(alice).bet(0, false, USDC(50));
    await market.connect(bob).bet(0, false, USDC(150));

    await time.increaseTo(endTime + 1);
    await market.resolve(0, OUTCOME_YES);

    // Pool gagnant vide → remboursement des mises.
    expect(await market.claimableAmount(0, alice.address)).to.equal(USDC(50));
    expect(await market.claimableAmount(0, bob.address)).to.equal(USDC(150));

    const before = await usdc.balanceOf(alice.address);
    await market.connect(alice).claim(0);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(50));
  });
});
