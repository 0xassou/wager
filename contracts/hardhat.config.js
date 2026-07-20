/**
 * Configuration Hardhat pour le déploiement sur Arc Testnet (Circle).
 *
 * Les secrets (clé privée) sont lus depuis le fichier .env — copie
 * .env.example vers .env et remplis tes valeurs. Ne commite JAMAIS ton .env.
 */
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Clé privée du wallet déployeur (SANS le préfixe 0x ou avec, les deux marchent).
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// RPC Arc Testnet (vérifié : chain ID 5042002).
// Le RPC public a un rate limit très strict (~1 req/s) — un RPC dédié
// Alchemy (ARC_RPC_URL_ALCHEMY, voir .env.example) est utilisé en
// priorité s'il est renseigné, sinon repli sur ARC_RPC_URL / le RPC public.
const ARC_RPC_URL =
  process.env.ARC_RPC_URL_ALCHEMY ||
  process.env.ARC_RPC_URL ||
  "https://rpc.testnet.arc.network";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Réseau local Hardhat (pour les tests) — rien à configurer.
    hardhat: {},

    // Arc Testnet de Circle.
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: 5042002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
