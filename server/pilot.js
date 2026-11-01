// Rabi 2026-27 pilot, run as a "Barak Direct" contract: one buyer (Kashif Shabbir), one corporate grower
// (Wattoo Agri Farming, signatory Asim Wattoo). Terms come from the Forward Purchase Proposal (21 Oct 2026),
// the Master Salam Agreement and Wakalah drafts, the Chairman Update (24 Oct) and the mill-delivery briefing (30 Oct).
// The season plays out from the clock; the few choices people make (receipt, surplus offer, consents) are stored.
import { get, all, run, sha } from './db.js';
import { dateOf, priceAt, cropAt, stageAt } from './domain.js';

export const P = {
  ref: 'BRK-D-2627-001', season: 'Rabi 2026-27 (pilot)',
  grower: 'Wattoo Agri Farming (Pvt) Ltd', signatory: 'Asim Wattoo', district: 'Okara',
  buyer: 'Kashif Shabbir', agent: 'Barak AgriTech (Pvt) Ltd, as agent (Wakalah)',
  acres: 400, md: 8000, price: 3300, total: 26400000,
  arrangePct: 0.025, monitorPerAcre: 500, deliveryPct: 0.035,
  millPrice: 4500, mill: 'Flour mill near Haveli Lakha, Okara',
  account: 'Barak client account, Bank Alfalah (held for the buyer)',
  deliveryPoint: 'Mill gate, Haveli Lakha',
  spec: 'Wheat of the Rabi 2026-27 crop: sound, dry, clean, fit for human consumption (Schedule 3; limits aligned with Punjab Food Department 2027 specification)',
  insured: false, tokenised: false,
};
P.arrange = P.total * P.arrangePct;                 // 6,60,000
P.monitor = P.acres * P.monitorPerAcre;             // 2,00,000
P.dueAtSigning = P.total + P.arrange + P.monitor;   // 2,72,60,000
P.deliveryFee = P.total * P.deliveryPct;            // 9,24,000
P.allInMd = (P.dueAtSigning + P.deliveryFee) / P.md; // 3,523
P.gross = P.md * P.millPrice;                       // 3,60,00,000
P.net = P.gross - P.deliveryFee;                    // 3,50,76,000
P.profit = P.net - P.dueAtSigning;                  // 78,16,000

const D = { proposal: -11, visit: -7, agency: 3, buyerPaid: 4, cp: 6, signed: 9, sowFrom: 4, sowTo: 17, harvestNotice: 156, delivFrom: 163, delivTo: 174, millPaid: 181, buyerSettled: 183, review: 205, rofr: 303 };
P.D = D;
P.dates = Object.fromEntries(Object.entries(D).map(([k, v]) => [k, dateOf(v)]));

// 400 acres as eight 50-acre blocks until Schedule 2 (khasra numbers) is filled in.
// Wattoo expects about 50 maunds an acre (well above the Punjab average of about 30), so the 8,000 maunds owed
// (20 an acre) are covered about 2.5 times. LIFT raises the district crop model to that level; the offsets are
// block-to-block variation, kept small so crop health (NDVI) stays realistic.
const LIFT = 14.6;
export const BLOCKS = [0.6, -0.4, 1.0, -0.9, 0.8, -0.3, 0.3, -0.6].map((off, i) => ({
  id: 'Block ' + 'ABCDEFGH'[i], acres: 50, sown: D.sowFrom + Math.round(i * 1.8), harvest_week: 23.5 + (i % 3) * 0.3,
  yield_offset: off, crop_event: i === 3 ? 'rust' : null,
  geo: [80 + (i % 4) * 120, 110 + Math.floor(i / 4) * 150, 100, 110, (i % 2 ? 4 : -5)],
}));
const LOTS = [[163, 900], [164, 950], [166, 1000], [167, 980], [168, 1000, 'reject'], [169, 1000], [170, 1020], [172, 1050], [174, 1100]];
const PLATES = ['LES-4417', 'OKA-2290', 'LEA-8802', 'OKA-1176', 'LES-9033', 'LES-9033', 'OKA-3348', 'LEB-5521', 'OKA-6604'];

const kv = (k) => { const r = get('SELECT value, day FROM pilot WHERE key = ?', k); return r ? { ...JSON.parse(r.value), day: r.day } : null; };
export function setKv(k, v, d) { run('INSERT INTO pilot (key, value, day) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, day = excluded.day', k, JSON.stringify(v), d); }

function blockCrop(b, d) {
  const c = cropAt({ yield_offset: b.yield_offset, crop_event: null, harvest_week: b.harvest_week }, d);
  // Block D: yellow rust found on scouting in February, sprayed within 3 days; a small yield cost remains.
  const rust = b.crop_event === 'rust' && d >= 100 ? (d >= 104 ? 0.8 : 2.5) : 0;
  return { ...c, perAc: c.perAc + LIFT - rust, perAcLo: c.perAcLo + LIFT - rust, perAcHi: c.perAcHi + LIFT - rust, ndvi: c.ndvi != null && b.crop_event === 'rust' && d >= 96 && d < 112 ? +(c.ndvi - 0.05).toFixed(2) : c.ndvi };
}

export function lotsUpTo(d) {
  return LOTS.map(([day, md, flag], i) => {
    const kg = md * 40, tare = 7400 + (i * 137) % 900, moisture = flag === 'reject' ? 11.4 : +(8.9 + ((i * 7) % 9) / 10).toFixed(1);
    return { lot: 'L-' + String(i + 1).padStart(2, '0'), day, date: dateOf(day), md, kg, vehicle: PLATES[i], slip: 'WB-' + (55120 + i * 13), gross: kg + tare, tare, bags: Math.round(kg / 50),
      moisture, foreign: +(0.4 + (i % 4) * 0.15).toFixed(2), broken: +(1.1 + (i % 3) * 0.2).toFixed(1), accepted: flag !== 'reject',
      note: flag === 'reject' ? 'Rejected: moisture 11.4% above the limit. Grower re-dried and redelivered the next day (clause 9.4).' : 'Accepted. Title passed to the buyer at the mill gate and the lot was sold to the mill at Rs 4,500 a maund.',
      fee: flag === 'reject' ? 0 : md * P.price * P.deliveryPct, sale: flag === 'reject' ? 0 : md * P.millPrice };
  }).filter((l) => l.day <= d);
}

export function pilot(d) {
  const delivered = lotsUpTo(d).filter((l) => l.accepted);
  const deliveredMd = delivered.reduce((s, l) => s + l.md, 0);
  const blocks = BLOCKS.map((b) => { const c = blockCrop(b, d); const isSown = d >= b.sown;
    const status = !isSown ? 'unsown' : c.harvested || d >= D.delivFrom ? 'harvested' : b.crop_event === 'rust' && d >= 96 && d < 112 ? (d >= 103 ? 'treated' : 'watch') : 'good';
    return { ...b, ...c, sownDay: b.sown, sownDate: dateOf(b.sown), isSown, status, est: b.acres * c.perAc, estLo: b.acres * c.perAcLo, estHi: b.acres * c.perAcHi }; });
  const est = blocks.reduce((s, b) => s + b.est, 0), estLo = blocks.reduce((s, b) => s + b.estLo, 0), estHi = blocks.reduce((s, b) => s + b.estHi, 0);
  const receipt = kv('receipt'), surplus = kv('surplus_offer'), surplusDecision = kv('surplus_decision'), consent = kv('token_consent'), feedback = kv('feedback'), rofr = kv('rofr');
  const stage = d < D.buyerPaid ? 'proposal' : d < D.signed ? 'funded' : d < D.harvestNotice ? 'growing' : d < D.delivFrom ? 'harvest' : deliveredMd < P.md ? 'delivering' : d < D.buyerSettled ? 'delivered' : 'settled';
  const ev = [];
  const e = (day, who, title, body, kind = 'info', ur) => { if (day <= d) ev.push({ day, date: dateOf(day), who, title, body, kind, ur }); };
  e(D.proposal, 'Barak', 'Forward Purchase Proposal sent to Kashif Shabbir', '8,000 maunds from 400 acres at Rs 3,300; all-in cost Rs 3,523 a maund.');
  e(D.visit, 'Barak agronomist', 'Farm visit: land, water and sowing readiness checked', 'Wattoo Agri Farming, Okara.');
  e(D.agency, 'Kashif Shabbir', 'Agency (Wakalah) Agreement signed; identity and source of funds verified', 'CNIC, NTN and source-of-funds declaration on file.');
  e(D.buyerPaid, 'Kashif Shabbir', 'Rs 2,72,60,000 received in the Barak client account', 'Price Rs 2,64,00,000 + arrangement fee Rs 6,60,000 + crop monitoring Rs 2,00,000. Held for the buyer at Bank Alfalah, apart from Barak\'s own money.', 'money');
  e(D.buyerPaid, 'Mill', 'Mill purchase undertaking signed: Rs 4,500 a maund, fixed', 'The mill near Haveli Lakha commits to buy the 8,000 maunds at harvest.');
  e(D.cp, 'Wattoo Agri Farming', 'Conditions before payment met (clause 13.1)', 'Personal guarantee from Asim Wattoo, security cheque, board resolution, land records for 400 acres, SECP and tax documents, and a written disclosure of no existing crop financing.');
  e(D.signed, 'Barak and Wattoo Agri Farming', 'Season Schedule signed and the full price paid to the grower', 'Rs 2,64,00,000 transferred on 10 Nov 2026, the day the Salam contract was made. Recorded on the Barak ledger.', 'money', ['سیزن شیڈول پر دستخط اور مکمل قیمت ادا', '10 نومبر 2026 کو 2,64,00,000 روپے منتقل کیے گئے۔']);
  if (d >= D.signed) e(receipt ? receipt.day : 99999, 'Asim Wattoo', 'Grower confirmed receipt of the price (clause 4.3)', 'Signed receipt issued in the app.');
  blocks.forEach((b) => e(b.sown + 2, 'Asim Wattoo', `${b.id} sown and reported`, `${b.acres} acres sown on ${dateOf(b.sown, 'en', true)} with an approved variety, reported within 3 days (clause 5.3).`, 'sow'));
  e(D.sowTo + 2, 'Asim Wattoo', 'All 400 acres sown by 18 Nov', 'Inside the sowing window, with an approved variety; every block reported within 3 days.', 'ok');
  [[30, 'December'], [61, 'January'], [92, 'February'], [120, 'March'], [151, 'April']].forEach(([day, m]) => {
    const bs = BLOCKS.map((b) => blockCrop(b, day)), es = bs.reduce((s, c) => s + 50 * c.perAc, 0), lo = bs.reduce((s, c) => s + 50 * c.perAcLo, 0), hi = bs.reduce((s, c) => s + 50 * c.perAcHi, 0);
    const nd = bs.map((c) => c.ndvi).filter((x) => x != null);
    e(day, 'Barak Crop Monitoring + LIMS', `Monthly crop report: ${m}`, `Estimated ${Math.round(es).toLocaleString('en-IN')} maunds (${Math.round(lo).toLocaleString('en-IN')} to ${Math.round(hi).toLocaleString('en-IN')}) against 8,000 owed: ${(es / P.md).toFixed(2)}× cover.${nd.length ? ' Average crop health (NDVI) ' + (nd.reduce((a, b) => a + b, 0) / nd.length).toFixed(2) + '.' : ' Crop emerging.'}`, 'report');
  });
  e(100, 'LIMS', 'Advisory: scout Block D for yellow rust', 'Uneven canopy on the west edge and cool nights. Field team to check within 48 hours.', 'watch');
  e(103, 'Asim Wattoo', 'Block D sprayed', 'Rust confirmed on about 6 acres; registered fungicide applied at label rate. Barak told the buyer within 48 hours (Wakalah 6).', 'watch');
  e(140, 'Barak Crop Monitoring', 'Heat advisory during grain fill', 'Up to 36°C forecast. Light evening irrigation advised; grower confirmed.', 'watch');
  e(D.harvestNotice, 'Asim Wattoo', 'Harvest notice: cutting starts 13 Apr', 'Seven days\' notice for sampling and testing (clause 8.3). Barak gave the buyer five days\' notice of delivery (Wakalah 7.1).');
  lotsUpTo(d).forEach((l) => e(l.day, 'Mill gate, Haveli Lakha', `${l.lot}: ${l.accepted ? fmt(l.md) + ' maunds delivered and accepted' : fmt(l.md) + ' maunds rejected'}`, `${l.vehicle} · weighbridge slip ${l.slip} · moisture ${l.moisture}% · foreign matter ${l.foreign}%. ${l.note}`, l.accepted ? 'money' : 'watch'));
  if (deliveredMd >= P.md) e(D.delivTo, 'Barak', 'Contract fulfilled: 8,000 maunds delivered', 'The grower has met the Salam obligation in full, inside the delivery window.', 'ok');
  if (surplus) e(surplus.day, 'Asim Wattoo', `Surplus offered to Barak: ${fmt(surplus.md)} maunds`, 'Right of first offer at the prevailing market price (clause 7.2).');
  if (surplusDecision) e(surplusDecision.day, 'Barak', surplusDecision.buy ? `Surplus bought: ${fmt(surplus.md)} maunds at Rs ${fmt(surplusDecision.price)}` : 'Surplus offer passed', surplusDecision.buy ? 'Paid to the grower at today\'s mill price.' : 'The grower is free to sell it elsewhere.');
  e(D.millPaid, 'Mill', 'Mill paid Rs 3,60,00,000 into the Barak client account', '8,000 maunds at Rs 4,500.', 'money');
  e(D.buyerSettled, 'Barak', 'Kashif Shabbir paid Rs 3,50,76,000', 'Sale proceeds less the 3.5% delivery fee (Rs 9,24,000). Profit Rs 78,16,000 on Rs 2,72,60,000 paid in.', 'money');
  e(D.buyerSettled, 'Barak', 'Guarantee released and security cheque returned (clause 13.2)', 'Contract closed.', 'ok');
  e(D.review, 'Barak, Wattoo Agri Farming, Kashif Shabbir', 'Pilot review meeting', 'Results reviewed and changes agreed for Rabi 2027-28 (clause 19.2).');
  const cash = [
    [D.buyerPaid, 'Kashif Shabbir paid in', P.dueAtSigning],
    [D.signed, 'Price paid to Wattoo Agri Farming', -P.total],
    [D.signed, 'Barak arrangement fee (2.5%)', -P.arrange],
    [D.signed, 'Crop monitoring fee, passed to LIMS', -P.monitor],
    ...(d >= D.millPaid ? [[D.millPaid, 'Mill paid for 8,000 maunds at Rs 4,500', P.gross]] : []),
    ...(d >= D.buyerSettled ? [[D.buyerSettled, 'Barak delivery fee (3.5% of price)', -P.deliveryFee], [D.buyerSettled, 'Paid to Kashif Shabbir', -P.net]] : []),
  ].filter((c) => c[0] <= d).map(([day, t, v]) => ({ day, date: dateOf(day), t, v }));
  const px = priceAt(d);
  const records = recordChain(ev.filter((x) => ['money', 'ok', 'sow'].includes(x.kind) || /signed/.test(x.title)));
  const tokens = tokenSim(d, est, deliveredMd);
  const latest = ev.filter((x) => ['watch', 'report'].includes(x.kind) && !/^L-\d/.test(x.title)).sort((a, b) => b.day - a.day)[0];
  const next = MILESTONES.find(([day, t]) => day > d && !(/deadline/.test(t) && deliveredMd >= P.md));
  const nd = blocks.map((b) => b.ndvi).filter((x) => x != null && x > 0.2);
  const crop = {
    stage: cropStage(d), sownAcres: blocks.filter((b) => b.isSown).reduce((s, b) => s + b.acres, 0),
    ndvi: nd.length ? +(nd.reduce((a, b) => a + b, 0) / nd.length).toFixed(2) : null,
    latest: latest ? { date: latest.date, title: latest.title } : null, next: next ? { date: dateOf(next[0]), title: next[1] } : null,
  };
  return {
    ...P, stage, day: d, events: ev.sort((a, b) => b.day - a.day), blocks, est, estLo, estHi, cover: est / P.md, deliveredMd, lots: lotsUpTo(d), cash, records, tokens, crop,
    balance: cash.reduce((s, c) => s + c.v, 0),
    market: { pmex: px, mill: P.millPrice, mtm: P.md * px - P.deliveryFee },
    receipt, surplus, surplusDecision, consent, feedback, rofr,
    surplusMd: Math.max(0, Math.round(blocks.reduce((s, b) => s + b.acres * b.perAc, 0) - P.md)),
    cp: [['Personal guarantee from Asim Wattoo', D.cp], ['Security cheque for the full price', D.cp], ['Grower board resolution', D.cp], ['Land records (fard) or leases for 400 acres', D.cp], ['SECP incorporation documents, NTN, CNICs', D.cp], ['Disclosure of existing crop financing (none)', D.cp]].map(([t, day]) => ({ t, done: d >= day, date: dateOf(day) })),
    risks: ['Emergency movement ban by Punjab during procurement', 'Stock freeze on wheat declared at the mill', 'Directed sale under the Foodgrains Licensing Control Order 1957', 'Mill does not honour the undertaking: fall back to sale at market', 'Crop not insured this season: shortfall is delivered later or the price refunded with no profit'],
    obligations: [
      ['Sow 400 acres with an approved variety by 20 Nov', d >= D.sowTo], ['Report each field\'s sowing within 3 days', d >= D.sowTo + 2],
      ['Tell Barak within 48 hours of any crop damage', true], ['Give 7 days\' notice of harvest', d >= D.harvestNotice],
      ['Deliver 8,000 maunds to specification by 30 Apr', deliveredMd >= P.md], ['Do not sell or pledge the contracted crop to anyone else', true],
    ],
  };
}
const fmt = (x) => Math.round(x).toLocaleString('en-IN');

// Growth stages for wheat sown in the first half of November in central Punjab.
function cropStage(d) {
  return d < D.sowFrom ? 'Before sowing' : d < D.sowTo ? 'Sowing' : d >= D.delivFrom ? (d <= D.delivTo ? 'Harvest and delivery' : 'Harvested') : stageAt(d).en;
}
const MILESTONES = [[D.sowFrom, 'Sowing starts'], [D.sowTo + 2, 'All 400 acres sown and reported'], [30, 'First crop report'], [61, 'January crop report'], [92, 'February crop report'],
  [120, 'March crop report'], [151, 'April crop report'], [D.harvestNotice, 'Harvest notice, 7 days ahead'], [D.delivFrom, 'Deliveries start at the mill gate'], [180, 'Delivery deadline for all 8,000 maunds'],
  [D.millPaid, 'Mill pays for the wheat'], [D.buyerSettled, 'You are paid']];

// Physical Salam until PVARA approval: no tokens, but each milestone is a hash-chained record.
function recordChain(evs) {
  let prev = '0'.repeat(64);
  return evs.slice().sort((a, b) => a.day - b.day).map((x, i) => { const hash = sha(prev + '|' + x.day + '|' + x.title); const r = { seq: i + 1, date: x.date, title: x.title, prev, hash }; prev = hash; return r; });
}

// Token simulation until PVARA approval. Nothing is issued: this replays the pilot as PAT would record it
// (1 PAT = 1 kg), so the buyer and Ops can see the token flow before it is switched on. Minted to the buyer's
// custodial wallet when the contract is signed and paid, locked while the wheat is owed, retired lot by lot
// as accepted wheat is sold to the mill at the gate. A rejected lot moves nothing.
export const TOKEN = { series: 'PAT-D-2627-001', wallet: 'KS-0001 (custodial, held by Barak for Kashif Shabbir)', kgPerMd: 40 };
function tokenSim(d, estMd, deliveredMd) {
  const tx = [];
  const add = (day, type, pat, note) => { if (day <= d) tx.push({ day, date: dateOf(day), type, pat, note }); };
  add(D.signed, 'mint', P.md * TOKEN.kgPerMd, `Season Schedule signed and Rs ${fmt(P.total)} paid to Wattoo Agri Farming. Minted to wallet KS-0001 and locked: Salam goods cannot be sold before delivery.`);
  lotsUpTo(d).forEach((l) => {
    if (!l.accepted) return add(l.day, 'hold', 0, `${l.lot} rejected at ${l.moisture}% moisture. No tokens move until it is redelivered.`);
    add(l.day, 'unlock', l.kg, `${l.lot}: ${fmt(l.kg)} kg weighed in at the mill gate (slip ${l.slip}). These PAT are now backed by delivered wheat.`);
    add(l.day, 'burn', l.kg, `${l.lot} sold to the mill at Rs ${fmt(P.millPrice)} a maund (Rs ${(P.millPrice / TOKEN.kgPerMd).toFixed(2)} a kg). Tokens retired.`);
  });
  add(D.buyerSettled, 'close', 0, `Rs ${fmt(P.net)} paid to Kashif Shabbir. Series closed with no tokens outstanding.`);
  let prev = '0'.repeat(64), minted = 0, burned = 0;
  const chain = tx.map((t, i) => {
    if (t.type === 'mint') minted += t.pat; if (t.type === 'burn') burned += t.pat;
    const hash = sha([prev, i + 1, t.day, t.type, t.pat].join('|'));
    const r = { seq: i + 1, ...t, outstanding: minted - burned, prev, hash }; prev = hash; return r;
  });
  const outstanding = minted - burned, inFieldKg = Math.max(0, estMd - deliveredMd) * TOKEN.kgPerMd;
  return {
    ...TOKEN, simulated: true, planned: P.md * TOKEN.kgPerMd, minted, burned, outstanding, mintDate: dateOf(D.signed),
    value: outstanding / TOKEN.kgPerMd * P.millPrice,
    reserve: { owedKg: P.md * TOKEN.kgPerMd - deliveredMd * TOKEN.kgPerMd, inFieldKg, cover: outstanding ? inFieldKg / outstanding : null },
    tx: chain.reverse(),
  };
}
