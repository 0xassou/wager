/**
 * Recrée des marchés de démo sur le nouveau contrat (avec frais), avec
 * des préfixes de catégorie ([crypto], [tech]) pour tester la découverte.
 */
const hre = require("hardhat");
const MARKET_ADDRESS = "0xE52FcCa2ccDc227B11Dcf55dc5E3EA0fcf03218d";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const USDC = (n) => hre.ethers.parseUnits(n.toString(), 6);

async function main() {
  const market = await hre.ethers.getContractAt("PredictionMarket", MARKET_ADDRESS);
  const usdc = await hre.ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const now = Math.floor(Date.now() / 1000);

  const demos = [
    { q: "[crypto] Le BTC dépassera-t-il 150 000 $ avant fin 2026 ?", end: now + 30 * 86400, yes: 3, no: 1 },
    { q: "[tech] Arc mainnet sera-t-il lancé avant octobre 2026 ?", end: now + 60 * 86400, yes: 1, no: 2 },
    { q: "[crypto] L'ETH repassera-t-il au-dessus de 8000 $ ce trimestre ?", end: now + 3 * 86400, yes: 2, no: 0 },
  ];

  await (await usdc.approve(MARKET_ADDRESS, USDC(20))).wait();
  console.log("✅ Approve 20 USDC");

  const startId = Number(await market.marketCount());
  for (let i = 0; i < demos.length; i++) {
    const { q, end, yes, no } = demos[i];
    await (await market.createMarket(q, end)).wait();
    const id = startId + i;
    if (yes > 0) await (await market.bet(id, true, USDC(yes))).wait();
    if (no > 0) await (await market.bet(id, false, USDC(no))).wait();
    console.log(`✅ Marché ${id} créé + paris (${yes} Oui / ${no} Non)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
