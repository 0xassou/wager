/**
 * Script de déploiement du PredictionMarket sur Arc Testnet.
 *
 * Usage :
 *   npx hardhat run scripts/deploy.js --network arcTestnet
 *
 * Prérequis :
 *   1. Fichier .env rempli (PRIVATE_KEY + USDC_ADDRESS).
 *   2. Du USDC de test sur Arc pour payer le gas (sur Arc, le gas se
 *      paie en USDC, la devise native — pas en ETH).
 *
 * Si USDC_ADDRESS n'est pas défini, le script déploie d'abord un MockUSDC
 * (token de test) et l'utilise — pratique pour tester sans le faucet Circle.
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Déploiement avec le wallet :", deployer.address);

  // Sur Arc, la devise native (qui paie le gas) est le USDC (18 décimales
  // au niveau natif) — formatEther convertit donc correctement.
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Solde natif (gas) :", hre.ethers.formatEther(balance), "USDC\n");

  // ------------------------------------------------------------------
  // 1. Déterminer l'adresse USDC
  // ------------------------------------------------------------------
  let usdcAddress = process.env.USDC_ADDRESS;

  if (!usdcAddress) {
    console.log("⚠️  USDC_ADDRESS non défini dans .env");
    console.log("→ Déploiement d'un MockUSDC (token de test)...");
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log("✅ MockUSDC déployé à :", usdcAddress);
    console.log("   (appelle faucet() dessus pour obtenir 1000 USDC de test)\n");
  } else {
    console.log("USDC utilisé :", usdcAddress, "\n");
  }

  // ------------------------------------------------------------------
  // 2. Déployer le PredictionMarket
  // ------------------------------------------------------------------
  // Trésorerie des frais : TREASURY_ADDRESS du .env, sinon le déployeur.
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("→ Déploiement du PredictionMarket...");
  console.log("   Trésorerie des frais :", treasuryAddress);
  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  const market = await PredictionMarket.deploy(usdcAddress, treasuryAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();

  console.log("✅ PredictionMarket déployé à :", marketAddress);

  // ------------------------------------------------------------------
  // 3. Récapitulatif — à copier dans web/.env.local
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("Copie ces lignes dans web/.env.local :");
  console.log("========================================================");
  console.log(`NEXT_PUBLIC_MARKET_ADDRESS=${marketAddress}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log("========================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
