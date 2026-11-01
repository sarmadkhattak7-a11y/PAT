# Barak AgriTech · Salam offering platform (working prototype)

Three products on one backend:

- **Barak Invest** (`/`): marketplace, reservations, key facts, portfolio, inbox, account. Investors only see their own token records.
- **Barak Kisan** (`/grower`, `/join`): phone-first, Urdu-first grower app: sign the Salam contract, confirm payment, report sowing, field advice, delivery slots, surplus offers, grower record.
- **Barak Control** (`/control`): staff console: exceptions, contracts, the Rabi 2026-27 pilot desk, crop monitor, token ledger, grower pipeline, escrow reconciliation, audit log.

The Rabi 2026-27 pilot (Wattoo Agri Farming → Kashif Shabbir, 8,000 maunds at Rs 3,300) runs as a Barak Direct contract from the close to settlement. See `docs/JOURNEY-REVIEW.md` for the farmer and investor journey review behind this build, and `docs/DEMO-SCRIPT.md` for a 15-minute presentation walk-through.

A working version of the "Barak AgriTech Prototype v3" design. Every action is real server-side state (SQLite), not a simulation slider: investors sign up, verify, reserve and pay into escrow; Ops closes the market, forms contracts, releases advances and mints PAT; growers decide on smaller contracts, book delivery and report problems; the warehouse intake unlocks tokens; sales burn them and pay holders.

## Run it

Needs Node 22.5 or newer (uses the built-in `node:sqlite`).

```bash
npm install
```

```bash
npm run build && npm start
```

Open http://localhost:8787. For live-reload development use `npm run dev` (API on 8787, Vite on 5173).

```bash
npm test
```

runs a whole season through the HTTP API (sign-up to September payout) against a throwaway database.

## Browser-only version (no server)

```bash
npm run build:static
```

builds `client/dist-local`: the same app, with the server's code and SQLite (compiled to JavaScript) running inside the browser. Data is kept in the visitor's own browser, so each visitor gets a private copy of the demo. Host the folder on any static host (GitHub Pages, Netlify, a claude.ai artifact).

## Demo accounts

Sign-in is by phone and one-time code. No SMS gateway is connected, so the code is shown on screen.

| Role | Phone |
| --- | --- |
| Barak Ops | 0300 0000001 |
| Growers | 0301 1000141 to 0301 1000152 (Aslam is 141, Khalid is 150) |
| Investor | any other mobile number creates a new account |

The **Sandbox** button (bottom right) signs in as any persona (visitor, new investor, growers Aslam, Khalid and Bashir, pilot buyer Kashif Shabbir, pilot grower Asim Wattoo, Ops) and moves the season date. With "Run Barak's steps" ticked, moving the date also does what Ops would do on the way (close, decisions, field-officer signatures, payments, deliveries, shortfall settlement, sales). The clock starts on today's date; Ops can jump it to the close, payment day, growing season, April delivery and September settlement. "Reset demo data" reseeds everything.

## A season, step by step

1. **Marketplace** (`/`): 12 Grade A fields in Sahiwal and Okara, two pools, a calculator, risks, and the published pricing rule. Other investors arrive on a front-loaded curve; they are seeded "simulated" accounts that Ops sees separately.
2. **Reserve** (`/reserve`): account, CNIC, IBAN, three suitability questions (season limit Rs 25 lakh, Rs 5 lakh, or not suitable), confirm the allocation (water-filled across fields, whole PAT, 20% per-field cap, split if over), then pay. Unpaid reservations lapse after 24 hours.
3. **Close** (Ops, 5 Nov): only paid money counts. 80% or more goes ahead; 50 to 80% gets a smaller-contract offer the grower accepts or declines in their app (or Ops records it); under 50% is refunded.
4. **Finalize** (7 Nov): refunds booked; Barak treasury buys the unfunded share of each going-ahead contract so every grower is paid in full.
5. **Release** (10 Nov): advances paid to growers, 2.5% fee booked, PAT minted and locked, one per kg owed.
6. **Growing**: crop monitor with satellite indices, coverage, risk thresholds, advice and weather; growers get advice in Urdu.
7. **Delivery** (April): Ops records warehouse intake (Grade 1, 10% moisture or less), an EWR is issued, the field's PAT unlock. Shortfalls are burned against insurance and holders are paid at cost. Unlocked PAT can be transferred between verified investors.
8. **Sale**: investors choose April or September by 15 March (September needs 500 PAT). Ops runs each sale at the achieved price; PAT are burned and holders get a settlement statement (3.5% fee, storage, s.153 withholding).

The **Token ledger** (`/ledger`) is public: every mint, unlock, transfer, shortfall and burn, a SHA-256 hash chain re-verified on each load, and proof of reserve (locked PAT against wheat owed; unlocked PAT against wheat in the warehouse).

## What is simulated

- SMS one-time codes, NADRA CNIC checks, bank-title checks and payments (the "Simulate bank confirmation" button stands in for the Raast/1LINK callback).
- Other investors' funding (seeded accounts, labelled in Ops).
- Satellite indices, yield estimates, weather and the wheat price path come from the design's season model, not live feeds.
- The token ledger is a hash-chained database table; Hedera anchoring is not connected.

## Layout

```
server/domain.js   pricing rule, season dates, price path, crop model (ported from the design)
server/db.js       schema, seed data, demo clock
server/market.js   reservations, allocation, close, finalize, release, delivery, sales, transfers
server/views.js    read models for each screen
server/index.js    HTTP API and static hosting
client/src/        React app: Market, Reserve, Portfolio, Grower, Join, Ops, Crop, Ledger
test/              end-to-end season test
```
