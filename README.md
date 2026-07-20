# 🔮 Wager — Prediction Market MVP sur Arc Testnet

Un marché de prédiction complet (style Polymarket / Kalshi) déployé sur **Arc Testnet** (la blockchain de Circle), avec paris en **USDC de test**.

## ✨ Fonctionnalités

- ✅ **Créer un marché** : n'importe qui peut poser une question + une date de fin
- ✅ **Parier Oui / Non** en USDC de test (système parimutuel)
- ✅ **Cotes en temps réel** : ratio entre les pools Oui et Non
- ✅ **Résolution** par le créateur du marché uniquement, après la date de fin
- ✅ **Claim des gains** : les gagnants récupèrent leur mise + une part proportionnelle du pool perdant
- ✅ **Historique & volume** par marché (événements on-chain)
- ✅ Design dark premium, responsive, animations subtiles

## 🗂 Structure du projet

```
predictionmarket/
├── contracts/          # Smart contracts (Hardhat + Solidity + OpenZeppelin)
│   ├── contracts/
│   │   ├── PredictionMarket.sol   # Le contrat principal
│   │   └── MockUSDC.sol           # USDC de test (plan B si pas de faucet)
│   ├── scripts/deploy.js          # Script de déploiement
│   └── test/                      # Tests (7 tests, tous passants)
└── web/                # Frontend Next.js 14 (App Router)
    ├── app/            # Pages : accueil, /market/[id], /my-markets
    ├── components/     # Cartes, modals, panneau de pari, etc.
    └── lib/            # Config wagmi, chaîne Arc, ABI du contrat
```

**Stack** : Solidity 0.8.24 · OpenZeppelin 5 · Hardhat · Next.js 14 · TypeScript · Tailwind · wagmi + viem + RainbowKit

---

## 🚀 Déploiement pas à pas (débutant friendly)

### Étape 0 — Prérequis

- [Node.js](https://nodejs.org) ≥ 18 installé
- L'extension [MetaMask](https://metamask.io) dans ton navigateur

### Étape 1 — Ajouter Arc Testnet à MetaMask

Dans MetaMask → *Réseaux* → *Ajouter un réseau manuellement* :

| Champ | Valeur |
|---|---|
| Network Name | `Arc Testnet` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Currency Symbol | `USDC` |
| Block Explorer | `https://arcscan.io` |

> 💡 **Particularité d'Arc** : la devise native — celle qui paie le **gas** — est le **USDC**, pas l'ETH. Tu n'as donc pas besoin d'ETH du tout sur ce réseau.
> (RPC vérifié : chain ID `5042002` ✓)

### Étape 2 — Obtenir du USDC de test

1. Va sur [faucet.circle.com](https://faucet.circle.com), choisis le réseau **Arc Testnet**, colle ton adresse. Le USDC reçu sert à la fois à **payer le gas** et à **parier**.
2. L'adresse du contrat USDC sur Arc Testnet est `0x3600000000000000000000000000000000000000` (vérifiée sur [la page officielle Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses) — elle est déjà pré-remplie dans les fichiers `.env` du projet).

> 💡 **Pas de faucet qui marche ?** Laisse `USDC_ADDRESS` vide à l'étape 4 : le script déploiera un **MockUSDC** et tu pourras te minter 1000 USDC de test en appelant sa fonction `faucet()`.

### Étape 3 — Installer les dépendances

```bash
cd contracts && npm install
cd ../web && npm install
```

### Étape 4 — Configurer les secrets du déploiement

```bash
cd contracts
cp .env.example .env
```

Ouvre `contracts/.env` et remplis :

```env
PRIVATE_KEY=ta_clé_privée_metamask     # MetaMask → Détails du compte → Exporter la clé privée
ARC_RPC_URL=https://rpc.testnet.arc.network
USDC_ADDRESS=0x3600000000000000000000000000000000000000   # USDC officiel sur Arc Testnet (ou vide → MockUSDC)
```

> 🔒 **JAMAIS** de clé privée d'un wallet contenant de vrais fonds. Utilise un wallet dédié au testnet. Le fichier `.env` est ignoré par git.
> ⛽ Rappel : le wallet déployeur paie le gas en **USDC natif** (celui du faucet Circle), pas en ETH.

### Étape 5 — Tester puis déployer le contrat

```bash
# Lancer les tests en local (recommandé)
npx hardhat test

# Déployer sur Arc Testnet
npm run deploy:arc
```

Le script affiche à la fin :

```
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

### Étape 6 — Configurer le frontend

```bash
cd ../web
cp .env.example .env.local
```

Colle dans `web/.env.local` les deux adresses affichées par le script de déploiement.

### Étape 7 — Lancer l'application 🎉

```bash
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000), connecte MetaMask (réseau Arc Testnet), et :

1. **Crée un marché** (bouton "Créer un marché")
2. **Parie** : choisis Oui/Non, saisis un montant → *Approve* puis *Bet* (2 transactions, c'est normal pour un ERC-20)
3. Après la date de fin, le **créateur résout** le marché depuis la page du marché
4. Les **gagnants réclament** leurs gains ("Réclamer mes gains")

---

## 🧠 Comment marchent les gains (parimutuel)

Tous les paris "Oui" vont dans un pool, tous les "Non" dans un autre.

```
gain = ta_mise + (ta_mise / pool_gagnant) × pool_perdant
```

**Exemple** : pool Oui = 200 USDC (dont toi : 100), pool Non = 400 USDC. Le résultat est **Oui** → tu récupères `100 + (100/200) × 400 = 300 USDC`.

Cas particulier : si personne n'a parié sur le côté gagnant, tout le monde est remboursé.

## 🔐 Sécurité (MVP)

- `SafeERC20` + `ReentrancyGuard` (OpenZeppelin), pattern *checks-effects-interactions*
- Erreurs personnalisées, pas de fonds bloqués (remboursement si pool gagnant vide)
- ⚠️ Limites connues d'un MVP : la résolution dépend de l'honnêteté du créateur (pas d'oracle ni de période de contestation) — ne pas utiliser en mainnet tel quel.

## 🛠 Commandes utiles

| Où | Commande | Effet |
|---|---|---|
| `contracts/` | `npx hardhat test` | Lance les 7 tests |
| `contracts/` | `npm run compile` | Compile les contrats |
| `contracts/` | `npm run deploy:arc` | Déploie sur Arc Testnet |
| `web/` | `npm run dev` | Serveur de dev (localhost:3000) |
| `web/` | `npm run build` | Build de production |
