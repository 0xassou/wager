/**
 * Recrée des marchés de démo sur le nouveau contrat (avec fenêtre de
 * contestation), plus UN marché déjà proposé (phase Proposed) pour
 * vérifier visuellement le ResolutionPanel en live.
 */
const hre = require("hardhat");
const MARKET_ADDRESS = "0x74Cb0cdc0b7608f65C777a46f58CF4cE6ad46C7f";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const USDC = (n) => hre.ethers.parseUnits(n.toString(), 6);

async function main() {
  const market = await hre.ethers.getContractAt("PredictionMarket", MARKET_ADDRESS);
  const usdc = await hre.ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const now = Math.floor(Date.now() / 1000);

  await (await usdc.approve(MARKET_ADDRESS, USDC(30))).wait();
  console.log("✅ Approve 30 USDC");

  const demos = [
    { q: "[crypto] Le BTC dépassera-t-il 150 000 $ avant fin 2026 ?", end: now + 30 * 86400, yes: 3, no: 1 },
    { q: "[tech] Arc mainnet sera-t-il lancé avant octobre 2026 ?", end: now + 60 * 86400, yes: 1, no: 2 },
    { q: "[crypto] L'ETH repassera-t-il au-dessus de 8000 $ ce trimestre ?", end: now + 3 * 86400, yes: 2, no: 0 },
  ];

  const startId = Number(await market.marketCount());
  for (let i = 0; i < demos.length; i++) {
    const { q, end, yes, no } = demos[i];
    await (await market.createMarket(q, end)).wait();
    const id = startId + i;
    if (yes > 0) await (await market.bet(id, true, USDC(yes))).wait();
    if (no > 0) await (await market.bet(id, false, USDC(no))).wait();
    console.log(`✅ Marché ${id} créé + paris (${yes} Oui / ${no} Non)`);
  }

  // Marché déjà terminé + proposé (phase Proposed), pour vérifier
  // visuellement le panneau de résolution avec compte à rebours en direct.
  const proposedId = startId + demos.length;
  await (await market.createMarket("[other] Ce marché de démo servira-t-il à tester l'UI ?", now + 90)).wait();
  await (await market.bet(proposedId, true, USDC(1))).wait();
  console.log(`✅ Marché ${proposedId} créé (fin dans 90s), en attente pour proposer...`);

  // Attend la fin des paris avant de proposer.
  await new Promise((r) => setTimeout(r, 95_000));
  await (await market.proposeResolution(proposedId, 1)).wait(); // 1 = Outcome.Yes
  console.log(`✅ Marché ${proposedId} : résolution "Oui" proposée (phase Proposed)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
