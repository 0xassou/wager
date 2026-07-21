# 🔮 Wager — "Every wager tells the future."

A full-featured prediction market (Polymarket / Kalshi style) deployed on **Arc Testnet** (Circle's USDC-native L1), with test-USDC betting and a built-in **optimistic dispute-resolution system** — no paid oracle required.

🌐 **Live app**: [wager-arc.vercel.app](https://wager-arc.vercel.app)
📦 **This repo**: full-stack app (smart contract + Next.js frontend)
🧩 **Standalone contract**: the resolution engine is also published on its own as a reusable building block for other Arc builders — see [Standalone contract repo](#-standalone-contract-repo) below.

## 📍 Current deployment (Arc Testnet)

| | |
|---|---|
| Contract address | [`0x74Cb0cdc0b7608f65C777a46f58CF4cE6ad46C7f`](https://arcscan.io/address/0x74Cb0cdc0b7608f65C777a46f58CF4cE6ad46C7f) |
| USDC (Circle, Arc Testnet) | `0x3600000000000000000000000000000000000000` |
| Chain ID | `5042002` |

## ✨ Features

- ✅ **Create a market**: anyone can post a question + an end date
- ✅ **Bet Yes / No** in test USDC (parimutuel system)
- ✅ **Two-phase optimistic resolution**: creator proposes → 24h dispute window → auto-finalize, or owner arbitration if disputed — see [How resolution works](#-how-resolution-works-optimistic-dispute-system) below
- ✅ **Low protocol fee**: 0.5% on winnings only, owner-configurable, capped at 5%
- ✅ **Discovery**: on-chain categories, search, sort (popular / recent / ending soon), category filters
- ✅ **Profile page**: identicon, on-chain stats (bets, win rate, net P&L, markets created), activity badge, bet/market history
- ✅ **Browser notifications**: follow a market and get alerted when it's closing soon, disputed, or resolved (client-side only — see limitation below)
- ✅ **Dark / light mode**, fully responsive
- ✅ **10 languages** (en/fr/es/ar/pt/de/zh/ja/hi/ru), including right-to-left layout for Arabic
- ✅ Claim winnings, per-market history and volume (on-chain events)

## 🗂 Project structure

```
predictionmarket/
├── contracts/                        # Smart contracts (Hardhat + Solidity + OpenZeppelin)
│   ├── contracts/
│   │   ├── PredictionMarket.sol      # Main contract (parimutuel + optimistic resolution)
│   │   └── MockUSDC.sol              # Test USDC (fallback if no faucet)
│   ├── scripts/deploy.js             # Deployment script
│   └── test/                         # Tests (34 tests, all passing)
└── web/                               # Next.js 14 frontend (App Router)
    ├── app/                          # Pages: home, /market/[id], /my-markets, /profile
    ├── components/                   # Cards, modals, bet panel, resolution panel, logo, etc.
    ├── messages/                     # i18n translations (10 locales)
    └── lib/                          # wagmi config, Arc chain, contract ABI, categories, follow/notifications
```

**Stack**: Solidity 0.8.24 · OpenZeppelin 5 · Hardhat · Next.js 14 · TypeScript · Tailwind · wagmi + viem + RainbowKit · next-intl · next-themes

---

## 🚀 Step-by-step deployment (beginner friendly)

### Step 0 — Prerequisites

- [Node.js](https://nodejs.org) ≥ 18 installed
- The [MetaMask](https://metamask.io) browser extension

### Step 1 — Add Arc Testnet to MetaMask

In MetaMask → *Networks* → *Add network manually*:

| Field | Value |
|---|---|
| Network Name | `Arc Testnet` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Currency Symbol | `USDC` |
| Block Explorer | `https://arcscan.io` |

> 💡 **Arc quirk**: the native currency — the one that pays **gas** — is **USDC**, not ETH. You don't need any ETH on this network at all.

### Step 2 — Get test USDC

1. Go to [faucet.circle.com](https://faucet.circle.com), pick **Arc Testnet**, paste your address. The USDC you receive covers both **gas** and **bets**.
2. The USDC contract address on Arc Testnet is `0x3600000000000000000000000000000000000000` (verified on [Circle's official page](https://developers.circle.com/stablecoins/usdc-contract-addresses) — already pre-filled in the project's `.env` files).

> 💡 **Faucet not working?** Leave `USDC_ADDRESS` empty in step 4: the deploy script will deploy a **MockUSDC** instead, with a `faucet()` function you can call to mint yourself 1000 test USDC.

### Step 3 — Install dependencies

```bash
cd contracts && npm install
cd ../web && npm install
```

### Step 4 — Configure deployment secrets

```bash
cd contracts
cp .env.example .env
```

Open `contracts/.env` and fill in:

```env
PRIVATE_KEY=your_metamask_private_key   # MetaMask → Account details → Export private key
ARC_RPC_URL=https://rpc.testnet.arc.network
USDC_ADDRESS=0x3600000000000000000000000000000000000000   # official USDC on Arc Testnet (or empty → MockUSDC)
TREASURY_ADDRESS=                        # optional: fee treasury address (defaults to the deployer)
```

> 🔒 **NEVER** use a private key from a wallet holding real funds. Use a wallet dedicated to testnets. The `.env` file is git-ignored.
> ⛽ Reminder: the deployer wallet pays gas in **native USDC** (from the Circle faucet), not ETH.

### Step 5 — Test, then deploy the contract

```bash
# Run the tests locally (recommended)
npx hardhat test   # 34 passing

# Deploy to Arc Testnet
npm run deploy:arc
```

The script prints, at the end:

```
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

### Step 6 — Configure the frontend

```bash
cd ../web
cp .env.example .env.local
```

Paste the two addresses printed by the deploy script into `web/.env.local`.

### Step 7 — Run the app 🎉

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect MetaMask (Arc Testnet network), and:

1. **Create a market** ("Open a position" button), optionally picking a category
2. **Bet**: pick Yes/No, enter an amount → *Approve* then *Bet* (2 transactions — normal for an ERC-20)
3. After the end date, the **creator proposes a resolution** — see the next section for what happens after that
4. Once finalized, **winners claim their payout**

---

## 🧠 How payouts work (parimutuel)

All "Yes" bets go into one pool, all "No" bets into another.

```
payout = your stake + (your stake / winning pool) × losing pool − protocol fee
```

The protocol fee (0.5% by default) applies **only to the winnings portion**, never to your refunded stake — see [Protocol fee](#-protocol-fee) below.

**Example**: Yes pool = 200 USDC (100 of it yours), No pool = 400 USDC. The outcome is **Yes** → you get `100 + (100/200) × 400 = 300 USDC`, minus a 0.5% fee on the 200 USDC of winnings (i.e. minus 1 USDC → 299 USDC net).

Special case: if nobody bet on the winning side, everyone is refunded their exact stake — fee-free.

## ⚖️ How resolution works (optimistic dispute system)

Instead of trusting the market creator blindly, resolving a market goes through up to four steps:

```
                    market end date reached
                              │
                              ▼
                        ┌───────────┐
                        │   Open    │  betting allowed
                        └─────┬─────┘
                              │ creator proposes an outcome
                              │ (or the contract owner, after a 7-day grace
                              │  period, if the creator stayed inactive)
                              ▼
                        ┌───────────┐
              ┌─────────┤ Proposed  │  24h dispute window running
              │         └─────┬─────┘
   no dispute │               │ anyone can dispute
   before the │               │ (locks a 5 USDC bond)
   window     │               ▼
   closes     │         ┌───────────┐
              │         │ Disputed  │  awaiting the contract owner's ruling
              │         └─────┬─────┘
              │      ┌────────┼────────────────────┐
              │      │                              │
              │  owner rules                30 days pass with
              │  (bond refunded                no ruling at all
              │   or forfeited)                     │
              │      │                    anyone can trigger a
   anyone finalizes  │                    neutral full refund
              │      │                   (bond returned, no fees,
              ▼      ▼                    nobody favored)
            ┌───────────────────────────────────────────┐
            │                 Finalized                  │
            │        winners claim their payout           │
            └───────────────────────────────────────────┘
```

1. **Propose.** After the end date, the market's **creator** proposes an outcome. If the creator never shows up, the **contract owner** can propose on their behalf once a 7-day grace period has passed, so a market can't be stuck forever.
2. **Dispute window (24h).** Proposing an outcome does *not* finalize it — it opens a 24-hour challenge window. **Anyone** can dispute it during that window by locking a 5 USDC bond.
3. **Finalize or arbitrate.**
   - No dispute → anyone can finalize once the window closes; the proposed outcome becomes final.
   - Disputed → the contract **owner** rules. If the disputer was right, their bond is refunded; if not, it's forfeited to the protocol treasury.
4. **Anti-stuck-funds safety net.** If a disputed market is never ruled on (owner unavailable, lost keys, etc.), **anyone** can trigger a fully neutral refund after 30 days: everyone gets their exact stake back, the disputer gets their bond back, no fees, no side favored.

This reduces reliance on a single honest creator, without needing a paid external oracle. See [Known limitations](#-known-limitations) for what this does *not* protect against.

## 💰 Protocol fee

A small fee (**0.5% by default**, capped at 5%) is taken at claim time, only on the **winnings** portion — never on a refunded stake, and never at all on a full refund. The rate is owner-configurable, and accrued fees are withdrawable to a treasury address.

## 🔔 Following markets & notifications

On any market page, click **"Follow this market"**. If you allow browser notifications when prompted, you'll get an alert when a followed market is closing soon, gets disputed, or is finalized.

> ⚠️ **Limitation**: this is a client-side-only mechanism (Web Notifications API), not a real push/server notification system. It only fires **while the Wager tab is open** (even in the background) — closing the tab means you won't get notified, since there's no backend to deliver alerts when you're gone.

## 🧩 Standalone contract repo

The optimistic-resolution engine used here has been extracted into its own **standalone, forkable repo**, meant as a reusable building block for other Arc projects (prediction markets, conditional-payout escrows, anything that needs "did X happen?" without a paid oracle):

**→ [github.com/0xassou/arc-optimistic-prediction-market](https://github.com/0xassou/arc-optimistic-prediction-market)**

It contains the same contract (generalized, no Wager-specific naming), the same 34 tests, and a self-contained README aimed at developers who've never heard of Wager — including a full function reference and integration guide. This `predictionmarket` repo is where that contract actually gets used, wired up to a full frontend.

## 🔐 Security

- `SafeERC20` + `ReentrancyGuard` (OpenZeppelin), checks-effects-interactions pattern throughout
- Custom errors, no permanently stuck funds (refund paths for an empty winning pool, and for an unruled dispute after 30 days)
- Optimistic dispute window with a bonded challenge mechanism — see [How resolution works](#-how-resolution-works-optimistic-dispute-system)

### ⚠️ Known limitations

- **The dispute system reduces, but does not eliminate, centralized trust.** A dishonest *market creator* can be overridden by disputing their proposal — but the **contract owner remains the final arbiter** for any disputed market, exactly like a real oracle committee of one. This is **not** a decentralized oracle (no UMA-style token-weighted voting, no Reality.eth-style crowd escalation) — it's a lightweight, free alternative that trades some decentralization for simplicity and zero external cost.
- If you need protection against a dishonest *owner* too (not just a dishonest creator), consider deploying with a multisig as the owner, or putting `adminResolve` behind a timelock — see the standalone contract repo's README for details.
- This is a testnet MVP: not audited, not intended for mainnet or real funds as-is.

## 🛠 Useful commands

| Where | Command | Effect |
|---|---|---|
| `contracts/` | `npx hardhat test` | Runs the 34 tests |
| `contracts/` | `npm run compile` | Compiles the contracts |
| `contracts/` | `npm run deploy:arc` | Deploys to Arc Testnet |
| `web/` | `npm run dev` | Dev server (localhost:3000) |
| `web/` | `npm run build` | Production build |
