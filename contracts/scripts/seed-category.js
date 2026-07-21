/** Crée un marché de démo avec préfixe de catégorie [crypto] + un pari. */
const hre = require("hardhat");
const MARKET_ADDRESS = "0x4f42433B552673fD46626b9cA951250941BA7D11";
const USDC = (n) => hre.ethers.parseUnits(n.toString(), 6);

async function main() {
  const market = await hre.ethers.getContractAt("PredictionMarket", MARKET_ADDRESS);
  const usdc = await hre.ethers.getContractAt("MockUSDC", "0x3600000000000000000000000000000000000000");
  const now = Math.floor(Date.now() / 1000);

  const id = Number(await market.marketCount());
  await (await market.createMarket("[crypto] L'ETH repassera-t-il au-dessus de 8000 $ ce trimestre ?", now + 3 * 86400)).wait();
  console.log("✅ Marché créé, id:", id);

  await (await usdc.approve(MARKET_ADDRESS, USDC(2))).wait();
  await (await market.bet(id, true, USDC(2))).wait();
  console.log("✅ Pari 2 USDC sur Oui placé");
}
main().catch((e) => { console.error(e); process.exit(1); });
