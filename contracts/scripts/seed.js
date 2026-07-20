/**
 * Script de "seed" : crée quelques marchés de démonstration avec des
 * paris, pour que l'interface ait du contenu à afficher.
 *
 * Usage :  npx hardhat run scripts/seed.js --network arcTestnet
 *
 * Nécessite MARKET_ADDRESS (ci-dessous) + le .env déjà configuré.
 */
const hre = require("hardhat");

const MARKET_ADDRESS = "0x4f42433B552673fD46626b9cA951250941BA7D11";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

const USDC = (n) => hre.ethers.parseUnits(n.toString(), 6);

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Wallet :", signer.address);

  const market = await hre.ethers.getContractAt("PredictionMarket", MARKET_ADDRESS);
  const usdc = await hre.ethers.getContractAt("MockUSDC", USDC_ADDRESS); // interface ERC-20 suffisante

  const balance = await usdc.balanceOf(signer.address);
  console.log("Solde USDC (ERC-20) :", hre.ethers.formatUnits(balance, 6));

  // ------------------------------------------------------------------
  // 1. Créer deux marchés de démo
  // ------------------------------------------------------------------
  const now = Math.floor(Date.now() / 1000);
  const demos = [
    { question: "Le BTC dépassera-t-il 150 000 $ avant fin 2026 ?", end: now + 30 * 86400 },
    { question: "Arc mainnet sera-t-il lancé avant octobre 2026 ?", end: now + 60 * 86400 },
  ];

  const startId = Number(await market.marketCount());
  for (const demo of demos) {
    const tx = await market.createMarket(demo.question, demo.end);
    await tx.wait();
    console.log("✅ Marché créé :", demo.question);
  }

  // ------------------------------------------------------------------
  // 2. Placer quelques petits paris pour donner des cotes réalistes
  // ------------------------------------------------------------------
  const approveTx = await usdc.approve(MARKET_ADDRESS, USDC(10));
  await approveTx.wait();
  console.log("✅ Approve 10 USDC");

  // Marché 1 : 3 USDC sur Oui, 1 sur Non  → ~75% Oui
  await (await market.bet(startId, true, USDC(3))).wait();
  await (await market.bet(startId, false, USDC(1))).wait();
  // Marché 2 : 1 USDC sur Oui, 2 sur Non  → ~33% Oui
  await (await market.bet(startId + 1, true, USDC(1))).wait();
  await (await market.bet(startId + 1, false, USDC(2))).wait();
  console.log("✅ Paris de démo placés (7 USDC au total)");

  console.log("\nTerminé — recharge la page d'accueil.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
