# Barak Salam Platform: season journey review

Review of the farmer and investor journeys across one full Rabi season (market open in October to settlement in September), done before the second build. Benchmarks: regulated crowdfunding platforms (key-information documents, cooling-off periods, client money rules), agri-finance operators in South Asia and Africa (field-officer-led onboarding, mobile-money payouts, monitoring), Islamic fintech (AAOIFI Shariah Standard 10 on Salam), and the failures of the farm-crowdfunding platforms of 2016–2021, which collapsed on over-promised returns, mixed client money and weak delivery evidence.

Severity: **Critical** = wrong under Shariah, the contracts or the law, or loses someone money. **High** = a serious trust or usability gap. **Medium** = friction.

---

## 1. Farmer journey

| Stage | Finding | Severity | Change in this build |
|---|---|---|---|
| Sign-up | A web form is the only way in. Most growers will join through a field officer, a call or WhatsApp, not a website. | High | Grower pipeline in Barak Control: registration → field check → verified → pre-approved. Growers who delivered on time re-enrol in one tap and come in pre-approved. |
| Contract | The grower was "contracted" at market close and paid days later. Under Salam the contract is made when it is signed **and** the full price paid. A gap between the two weakens the contract. | Critical | Signing is now a step of its own. The grower signs in Barak Kisan with a one-time code, or on paper with the field officer (thumbprint, witness). Payment goes out only to signed contracts, on the day of signing; Control raises an alarm if a signed contract is unpaid after 2 days. |
| Contract | Terms were shown as numbers, not as the promises the grower makes. | High | Plain-language summary before signing, in Urdu: what you sell, what you are paid, when you deliver, what happens if the crop falls short, and that the land is never security. |
| Payment | No record of where the money goes, and no confirmation it arrived (Master Salam Agreement 4.3 requires a receipt). | High | Payout account (bank, JazzCash or Easypaisa) captured and editable until payment. The grower confirms receipt in the app; outstanding receipts are grouped into one alert for field officers to call. |
| Growing | Advice was one-way. Nobody knew whether it was followed. Sowing date was never reported (clause 5.3). | Medium | "I have sown" report, and "I have done this" on each piece of advice. The grower record uses both. |
| Shortfall | The first build burned undelivered tokens "against insurance". There is no insurance this season, and that is not what the contract says. | Critical | Rebuilt to the contract: the grower may deliver the same grade from another source; Barak may extend delivery once, by up to 30 days; otherwise the grower refunds the price of the missing wheat only, with no profit added, and Barak returns its own 2.5% fee on that part. Late-delivery amounts go to charity. The grower is told plainly that no interest or penalty goes to Barak or investors. |
| Delivery | A date picker with no capacity. Real warehouses queue trolleys for hours. A failed moisture test was an error message rather than an event. | High | Booking against slots of 3 trolleys a day. A lot over 10% moisture or below grade is recorded as rejected, the grower is told to dry it and come back, and can ask for a re-test within 48 hours. Lot records carry vehicle, weighbridge slip, bags and foreign matter (Schedule 4). |
| After delivery | The grower's surplus (often 40–50% of the crop) went back to the arhti. The contract gives Barak a right of first offer (clause 7.2). | High | "Sell your extra wheat to Barak" at the day's market price, paid on intake, no arhti commission. Ops buys or passes within 3 days. |
| Records | Nothing the grower could take to a bank or use next season. | Medium | Grower record (Gold/Silver/Building) from signing on time, confirming payment, reporting sowing and delivering on time and in full. Income statement notes that ushr is the grower's own obligation. |
| Access | Urdu was there, but desktop-first. | Medium | Barak Kisan is phone-first, with bottom tabs (Home, Field, Money, Help), an Urdu inbox and big touch targets. Every message is also marked as sent by SMS and voice note. |

## 2. Investor journey

| Stage | Finding | Severity | Change in this build |
|---|---|---|---|
| Before buying | Risks sat on the marketplace page but were never acknowledged. Regulated platforms require a key-information document and explicit consent. | Critical | One-page key facts statement (product, price, fees, lock-up, exits, what happens if a field fails or wheat is short, main risk with the 2024-crash number, what is not covered), and three acknowledgements (terms, Shariah structure, risk) before the first reservation. Stored and audited. |
| Before close | No way to change one's mind once paid. | High | Cooling-off: a paid order can be withdrawn for a full refund until 3 Nov, two days before the close, so growers can still count on the money. |
| Islamic structure | "Your grower" and "this field" implied the wheat is the produce of one field. AAOIFI Standard 10 does not allow Salam goods to be tied to a specific field's yield; your Master Salam Agreement (2.4) describes the wheat by specification. | Critical | Wording throughout: wheat by grade; each field is the intended source and is monitored. The resale lock before delivery is explained as a Shariah rule, not a product choice. A "How it works under Shariah" section on the marketplace. |
| Waiting (Nov–Apr) | A six-month silence after payment. The Wakalah requires monthly reports. | High | Inbox with a message for every event (payment, close result, signing, minting, delivery, refund, payout), and season updates on the portfolio: one line per milestone across all the investor's growers, naming the ones to watch. |
| Signing | Investors could not see which growers had signed. | Medium | During signing, the portfolio shows each grower as waiting, signed, or signed and paid. |
| Exit | Money was locked until the April or September sale with no exit in between, even after the wheat was in the warehouse and legally sellable. | High | "Sell now" after delivery at the day's price, with storage charged only for months actually stored. Transfers between verified investors remain. |
| Islamic obligations | No help with zakat. | Medium | Zakat estimate on the portfolio (2.5% of today's value of wheat held for trade), with a prompt to confirm with a scholar. |
| Statements | Sales were all labelled April or September. | Medium | Statements show April, September or early sale, with fee, storage and withholding lines. |
| Returning | No reason to come back next season. | Medium | "Tell me first when Rabi 2027-28 opens" preference; returning investors get a week's head start. |
| Separation | Investors could open the full token ledger and the Ops console from the public site. | High | Investors see only their own token records with hashes, plus the weekly reserve statement. The full ledger, crop monitor and Ops live in Barak Control behind a staff login. |

## 3. Across both journeys

- **Client money.** The marketplace escrow now reconciles in Control (deposits + treasury + recoveries − refunds − payments to growers − fees = held), and the season test checks it returns to zero. The pilot has its own client-account ledger.
- **Audit.** Every change by every account is logged with actor, role, action and masked detail. Regulators and Shariah reviewers will ask for this first.
- **Alerts that scale.** Repeated alerts are grouped ("9 growers have not confirmed payment") rather than listed one by one, so the console works with 12 growers or 12,000.
- **Products kept apart.** Barak Invest (public and investors), Barak Kisan (growers) and Barak Control (staff) are separate apps on one backend, each with its own navigation and look.
- **Sandbox.** Kept. It now switches between every persona and app, and moving the date runs Barak's own steps on the way (close, decisions, field-officer signatures, payments, deliveries, shortfall settlement, sales), so any journey can be shown at any date.

## 4. Pilot simulation: Wattoo Agri Farming and Kashif Shabbir

Run as a **Barak Direct** contract, a second channel next to the retail marketplace: one buyer, one corporate grower, bespoke terms. All figures come from the Forward Purchase Proposal, Master Salam Agreement, Wakalah, Chairman Update and the mill-delivery briefing:

- 8,000 maunds from 400 acres in Okara at Rs 3,300 (Rs 2,64,00,000).
- Kashif Shabbir pays Rs 2,72,60,000 by 5 Nov (price, 2.5% arrangement fee, Rs 2 lakh LIMS monitoring) into the Barak client account at Bank Alfalah.
- Conditions before payment on 7 Nov; Season Schedule signed and the full price paid on 10 Nov; grower receipt.
- Sowing reported block by block (8 × 50 acres until Schedule 2 is filled in); five monthly crop reports; a yellow-rust advisory on Block D and a heat advisory.
- 7 days' harvest notice; nine lots to the mill gate at Haveli Lakha (option A), one rejected for 11.4% moisture and redelivered.
- Each lot sold to the mill at the Rs 4,500 undertaking. Mill pays Rs 3,60,00,000; Kashif receives Rs 3,50,76,000 after the 3.5% delivery fee. Profit Rs 78,16,000, 27.7% on the all-in cost of Rs 3,523 a maund. Guarantee and cheque returned; pilot review meeting.
- Interactive along the way: Asim confirms receipt, offers surplus and confirms Rabi 2027-28 interest. Ops buys or passes the surplus. Kashif gives tokenisation consent (Wakalah 9.2) and pilot feedback.
- No tokens are issued (physical Salam until PVARA approval); milestones are hash-chained records in Control. A token simulation replays the contract as PAT (320,000 minted to the buyer's custodial wallet at signing, locked, retired lot by lot as wheat is sold to the mill), clearly labelled as not issued, for Kashif and in Control.

Yields are simulated around 50 maunds an acre, Wattoo's own expectation (about 2.5× cover on the 20 maunds an acre owed, leaving about 12,000 maunds of surplus). Block names, vehicle numbers and lot details are illustrative until real Schedule 2 and Schedule 4 data exist.

## 5. Still to do before real money

1. **Integrations:** NADRA Verisys; Raast / 1LINK payment callbacks into the client account; SMS, WhatsApp and Urdu voice (IVR) gateways; warehouse EWR feed; Hedera anchoring after PVARA approval.
2. **Takaful** for crop risk from Rabi 2027-28, so shortfall stops depending on the grower's ability to refund.
3. **Urdu for Barak Invest.** The investor app is English only. Mass-market investors need Urdu, with the key facts statement translated and legally reviewed, not machine-translated.
4. **Maker-checker** in Control: one person prepares payments to growers and a second approves them, with role-based staff accounts (ops, finance, field officer, compliance, Shariah).
5. **Shariah sign-off** on: mill gate as the delivery point; the charity late amount; Barak returning its fee on shortfall; zakat guidance wording; the treasury top-up.
6. **Data protection:** consent records, data retention, and growers' right to see their own monitoring data.
7. **Security review** of the server build (rate limits on codes, session expiry, secrets) before any public launch.
