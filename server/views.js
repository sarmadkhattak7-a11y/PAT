import { get, all, setting, today, sha } from './db.js';
import { PR, K, DAY, PHASES, dateOf, isoOf, phaseAt, priceAt, mandi, netPerKg, cropAt, stageAt, weather, advice, GEO, poly, sale } from './domain.js';
import { listings, listing, pools, fieldRow, fieldRows, balances, holdersOf, userExposure, target } from './market.js';

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const RS = K.RS_PAT;

export function clock() {
  const d = today(), ph = phaseAt(d);
  return {
    day: d, date: dateOf(d), date_ur: dateOf(d, 'ur'), iso: isoOf(d), phase: ph.k, phaseLabel: ph.en, phaseLabel_ur: ph.ur,
    phases: PHASES.map((p) => ({ ...p, from: dateOf(p.s, 'en', true), to: dateOf(p.e - 1, 'en', true) })),
    market: setting('market'), saleApr: setting('sale_apr'), saleSep: setting('sale_sep'),
    prices: mandi(d), priceHist: Array.from({ length: 13 }, (_, k) => priceAt(d - (12 - k) * 7)),
    dates: Object.fromEntries(Object.entries(DAY).map(([k, v]) => [k, dateOf(v, 'en', true)])),
    dates_ur: Object.fromEntries(Object.entries(DAY).map(([k, v]) => [k, dateOf(v, 'ur', true)])),
    DAY,
  };
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, role: u.role, phone: u.phone, name: u.name, name_ur: u.name_ur, cnicOk: !!u.cnic_ok, bankOk: !!u.bank_ok, iban: u.iban ? u.iban.slice(0, 4) + '…' + u.iban.slice(-4) : null,
    limit: u.season_limit, suitability: u.suitability ? JSON.parse(u.suitability) : null, filer: !!u.filer, lang: u.lang };
}

export function pricing() {
  return { ...PR, K, scenarios: [['Stress (2024 repeat)', PR.stress], ['Low', PR.low], ['Support price', PR.support], ['Barak estimate', PR.ref], ['High', PR.high]].map(([label, px]) => ({ label, px, ret: netPerKg(px) / RS - 1 })) };
}

export function market(user) {
  const d = today(), uid = user ? user.id : -1;
  const ls = listings(d, uid), close = setting('market') !== 'open' ? closeBoard() : null;
  return { listings: ls, pools: pools(d, uid), close, exposure: user ? userExposure(user.id, d) : 0,
    totals: { target: sum(ls, (l) => l.target), paid: sum(ls, (l) => l.paid), acres: sum(ls, (l) => l.acres), fields: ls.length, backers: get("SELECT COUNT(DISTINCT o.user_id) AS n FROM orders o WHERE o.status IN ('paid','allotted','tokens','refunded')").n } };
}

export function closeBoard() {
  return fieldRows().map((f) => {
    const paid = get("SELECT COALESCE(SUM(a.amount),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id JOIN users u ON u.id = o.user_id WHERE a.field_id = ? AND u.role = 'investor' AND o.status IN ('paid','allotted','tokens','refunded')", f.id).v;
    const refund = get("SELECT COALESCE(SUM(a.refund),0) AS v FROM allocations a WHERE a.field_id = ?", f.id).v;
    const treasury = get("SELECT COALESCE(SUM(a.pat),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.kind = 'treasury'", f.id).v;
    return { id: f.id, grower: f.grower, acres: f.acres_listed, acresContracted: f.acres_contracted, status: f.status, offerAcres: f.offer_acres, decision: f.decision, decisionNote: f.decision_note,
      paid, frac: paid / target(f), refund, treasuryPat: treasury, advance: ['contracted', 'paid', 'delivered', 'settled'].includes(f.status) ? f.acres_contracted * PR.owedMdPerAcre * PR.price : 0 };
  });
}

function fieldName(id) { const f = fieldRow(id); return f ? f.grower : id; }

export function portfolio(user) {
  const d = today(), px = priceAt(d);
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY reserved_at DESC', user.id).map((o) => ({
    ...o, expiresDay: o.reserved_day + K.HOLD_DAYS, expires: dateOf(o.reserved_day + K.HOLD_DAYS), reservedDate: dateOf(o.reserved_day), paidDate: o.paid_day != null ? dateOf(o.paid_day) : null,
    lines: all('SELECT a.*, f.village, u.name AS grower, f.status AS fstatus FROM allocations a JOIN fields f ON f.id = a.field_id JOIN users u ON u.id = f.grower_id WHERE a.order_id = ?', o.id),
  }));
  const bal = balances(user.id).map((b) => { const f = fieldRow(b.field), c = cropAt(f, Math.max(0, d)), del = get('SELECT * FROM deliveries WHERE field_id = ?', f.id);
    return { ...b, grower: f.grower, village: f.village, acres: f.acres_contracted, cov: c.cov, ndvi: c.ndvi, est: c.perAc, delivery: del }; });
  const pat = sum(bal, (b) => b.pat);
  const held = orders.filter((o) => ['allotted', 'tokens'].includes(o.status));
  const cost = sum(held, (o) => sum(o.lines, (l) => l.kept || 0));
  const waiting = sum(orders.filter((o) => o.status === 'paid'), (o) => o.amount);
  const payouts = all('SELECT * FROM payouts WHERE user_id = ? ORDER BY day', user.id);
  const cash = all('SELECT MIN(id) AS id, type, SUM(amount) AS amount, order_id, day, memo, COUNT(*) AS n FROM cash WHERE user_id = ? GROUP BY COALESCE(order_id, id), type, day, memo ORDER BY MIN(id) DESC', user.id).map((c) => ({ ...c, date: dateOf(c.day) }));
  const events = all('SELECT * FROM tokens WHERE to_user = ? OR from_user = ? ORDER BY seq DESC', user.id, user.id).map((t) => ({ ...t, date: dateOf(t.day), grower: fieldName(t.field_id) }));
  const election = get('SELECT * FROM elections WHERE user_id = ?', user.id);
  const pendingPat = held.length && !pat ? sum(held, (o) => sum(o.lines, (l) => l.pat || 0)) : 0;
  const valuePat = pat || pendingPat;
  const s = (p) => valuePat * netPerKg(p);
  let stage = 'none';
  if (orders.some((o) => o.status === 'reserved' && d <= o.expiresDay)) stage = 'reserved';
  if (waiting) stage = 'waiting';
  if (held.length && !pat && !payouts.length) stage = 'signing';
  if (pat) stage = bal.every((b) => !b.locked) ? 'stored' : 'held';
  if (payouts.length && !pat) stage = 'paidout';
  if (!held.length && !waiting && orders.some((o) => o.status === 'refunded')) stage = 'refunded';
  return {
    stage, orders, holdings: bal, pat, cost, waiting, payouts, cash, events, election,
    exposure: userExposure(user.id, d), limit: user.season_limit,
    value: valuePat ? { pat: valuePat, cost, markNow: s(px), price: px, retNow: cost ? s(px) / cost - 1 : 0,
      scenarios: [['If 2024 repeats', PR.stress], ['Low', PR.low], ['Support price', PR.support], ['Barak estimate', PR.ref], ['High', PR.high]].map(([label, p]) => ({ label, px: p, value: s(p), ret: cost ? s(p) / cost - 1 : 0 })),
      breakeven: PR.breakeven, sep: sale(valuePat, 'sep', PR.ref, user.filer !== 0), apr: sale(valuePat, 'apr', Math.max(px, PR.support), user.filer !== 0) } : null,
  };
}

export function grower(user) {
  const d = today(), f = get('SELECT * FROM fields WHERE grower_id = ?', user.id);
  if (!f) return { field: null };
  const fr = fieldRow(f.id), c = cropAt(f, Math.max(d, 0)), th = setting('thresholds');
  const all_ = fieldRows().map((x) => cropAt(x, d).ndvi).filter((x) => x != null).sort((a, b) => a - b);
  const med = all_.length ? all_[Math.floor(all_.length / 2)] : null;
  const l = listing(fr, d, -1);
  return {
    field: { ...l, status: f.status, acresContracted: f.acres_contracted, owedMd: f.acres_contracted * PR.owedMdPerAcre, advance: f.acres_contracted * PR.owedMdPerAcre * PR.price, offerAcres: f.offer_acres,
      offerAdvance: f.offer_acres ? f.offer_acres * PR.owedMdPerAcre * PR.price : null, decision: f.decision, deliveryDay: f.delivery_day },
    crop: { ...c, stage: stageAt(d), advice: advice(f, d, med, th), weather: weather(d), checked: dateOf(d - (d % 5)) },
    payments: all("SELECT * FROM cash WHERE field_id = ? AND type = 'release'", f.id).map((p) => ({ ...p, amount: -p.amount, date: dateOf(p.day) })),
    delivery: get('SELECT * FROM deliveries WHERE field_id = ?', f.id),
    reports: all('SELECT * FROM reports WHERE field_id = ? ORDER BY id DESC', f.id).map((r) => ({ ...r, date: dateOf(r.day) })),
    officer: { name: 'Usman Ali', name_ur: 'عثمان علی' },
    mandi: mandi(d).sahiwal, keptMd: Math.max(0, Math.round(f.acres_contracted * (c.perAc - PR.owedMdPerAcre))),
  };
}

export function crop() {
  const d = today(), th = setting('thresholds'), fs = fieldRows();
  const nd = fs.map((f) => cropAt(f, d).ndvi).filter((x) => x != null).sort((a, b) => a - b), med = nd.length ? nd[Math.floor(nd.length / 2)] : null;
  const weeks = []; for (let w = 4; w <= Math.min(Math.floor(d / 7), 30); w++) weeks.push(w);
  return {
    day: d, stage: stageAt(d), weather: weather(d), thresholds: th, median: med,
    fields: fs.map((f, i) => {
      const c = cropAt(f, d), active = !['lapsed', 'listed', 'offer'].includes(f.status) || setting('market') === 'open';
      const owed = f.acres_contracted * PR.owedMdPerAcre;
      return { id: f.id, grower: f.grower, grower_ur: f.grower_ur, village: f.village, acres: f.acres_contracted, status: f.status, active, path: poly(GEO[i]), cx: GEO[i][0], cy: GEO[i][1],
        ...c, owed, est: f.acres_contracted * c.perAc, estLo: f.acres_contracted * c.perAcLo, estHi: f.acres_contracted * c.perAcHi,
        risk: c.cov >= th.watch ? 'ok' : c.cov >= th.risk ? 'watch' : 'risk', advice: advice(f, d, med, th),
        series: weeks.map((w) => ({ w, date: dateOf(w * 7, 'en', true), ndvi: cropAt(f, w * 7).ndvi, perAc: cropAt(f, w * 7).perAc })),
        visit: get("SELECT * FROM visits WHERE field_id = ? ORDER BY id DESC LIMIT 1", f.id) };
    }),
  };
}

export function ledger() {
  const d = today();
  const events = all('SELECT * FROM tokens ORDER BY seq').map((t) => ({ ...t, date: dateOf(t.day), grower: fieldName(t.field_id),
    fromName: t.from_user ? (get('SELECT name, bot, role FROM users WHERE id = ?', t.from_user) || {}) : null, toName: t.to_user ? (get('SELECT name, bot, role FROM users WHERE id = ?', t.to_user) || {}) : null }));
  // Re-derive every hash so anyone can check the chain is unbroken.
  let prev = '0'.repeat(64), valid = true;
  events.forEach((e) => { const h = sha(JSON.stringify({ prevHash: prev, type: e.type, fieldId: e.field_id, from: e.from_user, to: e.to_user, pat: e.pat, d: e.day, memo: e.memo })); if (h !== e.hash || e.prev_hash !== prev) valid = false; prev = e.hash; });
  const minted = sum(events.filter((e) => e.type === 'mint'), (e) => e.pat);
  const burned = sum(events.filter((e) => e.type === 'burn'), (e) => e.pat), short = sum(events.filter((e) => e.type === 'shortfall'), (e) => e.pat);
  const fs = fieldRows();
  const perField = fs.map((f) => { const hs = holdersOf(f.id), out = sum(hs, (h) => h.pat), del = get('SELECT * FROM deliveries WHERE field_id = ?', f.id);
    return { id: f.id, grower: f.grower, status: f.status, outstanding: out, locked: !['delivered', 'settled'].includes(f.status), owedKg: ['paid'].includes(f.status) ? f.acres_contracted * K.ACRE_KG : 0, ewr: del, holders: hs.length,
      minted: sum(events.filter((e) => e.type === 'mint' && e.field_id === f.id), (e) => e.pat) }; });
  const locked = sum(perField.filter((p) => p.locked), (p) => p.outstanding), unlocked = sum(perField.filter((p) => !p.locked), (p) => p.outstanding);
  // Wheat still in the warehouse: delivered kg less what has been sold (burned) from that field.
  const ewrKg = sum(perField.filter((p) => p.ewr), (p) => p.ewr.kg - sum(events.filter((e) => e.type === 'burn' && e.field_id === p.id), (e) => e.pat));
  return {
    token: { name: 'Pakistan Agri Token', symbol: 'PAT', series: 'PAT-2728', unit: '1 PAT = 1 kg Grade 1 wheat', network: 'Barak ledger (hash-chained). Hedera testnet anchoring not yet connected.' },
    events: events.reverse(), valid, minted, burned, shortfall: short, outstanding: minted - burned - short, locked, unlocked,
    reserve: { owedKg: sum(perField, (p) => p.owedKg), ewrKg: Math.max(0, ewrKg), locked, unlocked, fields: perField, asOf: dateOf(d) },
    supply: supplySeries(events.slice().reverse()),
  };
}
function supplySeries(evts) {
  let out = 0; const pts = [];
  evts.forEach((e) => { out += e.type === 'mint' ? e.pat : e.type === 'burn' || e.type === 'shortfall' ? -e.pat : 0; pts.push({ day: e.day, date: e.date, out }); });
  return pts;
}

export function ops() {
  const d = today(), th = setting('thresholds'), c = crop(), board = closeBoard();
  const cashSum = (type) => sum(all('SELECT amount FROM cash WHERE type = ?', type), (r) => r.amount);
  const realOrders = all("SELECT o.*, u.name, u.phone FROM orders o JOIN users u ON u.id = o.user_id WHERE u.bot = 0 AND u.role = 'investor' ORDER BY o.reserved_at DESC LIMIT 40").map((o) => ({ ...o, date: dateOf(o.reserved_day) }));
  const deposits = cashSum('deposit'), treasury = cashSum('treasury'), refunds = cashSum('refund'), released = cashSum('release'), fees = cashSum('fee'), insurance = cashSum('insurance'), payouts = cashSum('payout');
  const escrow = deposits + treasury + refunds + released + fees;
  const reports = all('SELECT r.*, u.name AS grower FROM reports r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC').map((r) => ({ ...r, date: dateOf(r.day) }));
  const regs = all('SELECT * FROM registrations ORDER BY id DESC').map((r) => ({ ...r, date: dateOf(r.day) }));
  const m = setting('market');
  const ex = [];
  if (m === 'open' && d >= DAY.close) ex.push({ level: 'risk', title: 'Market close is due', body: 'The raise ended on ' + dateOf(DAY.close) + '. Close the market to count paid money and form contracts.', action: 'close' });
  board.filter((b) => b.status === 'offer').forEach((b) => ex.push({ level: 'watch', title: `${b.grower}: smaller contract offered`, body: `${Math.round(b.frac * 100)}% paid. Offered ${b.offerAcres} of ${b.acres} acres; grower decides by ${dateOf(DAY.decide)}.`, field: b.id, action: 'decide' }));
  if (m === 'closed' && !board.some((b) => b.status === 'offer')) ex.push({ level: 'watch', title: 'Ready to finalize the close', body: 'All decisions are in. Finalize to compute refunds and the treasury top-up.', action: 'finalize' });
  if (m === 'finalized') ex.push({ level: 'watch', title: 'Release funds to growers', body: 'Contracts are formed. Releasing pays each grower their advance and mints PAT.', action: 'release' });
  c.fields.filter((f) => f.active && d >= 28 && f.risk !== 'ok' && !f.harvested).forEach((f) => ex.push({ level: f.risk, title: `${f.grower}: coverage ${f.cov.toFixed(2)}×`, body: `Estimated ${Math.round(f.est)} md against ${f.owed} md owed. ${f.advice[0] ? f.advice[0].en[0] + '.' : ''}`, field: f.id, action: 'visit' }));
  reports.filter((r) => r.status === 'open').forEach((r) => ex.push({ level: 'watch', title: `${r.grower}: ${r.type}`, body: r.text || 'No details given.', report: r.id, action: 'assign' }));
  fieldRows().filter((f) => f.status === 'paid' && d >= DAY.deliverBy - 40).forEach((f) => ex.push({ level: d > DAY.deliverBy ? 'risk' : 'info', title: `${f.grower}: delivery ${d > DAY.deliverBy ? 'overdue' : 'due'}`, body: `${f.acres_contracted * PR.owedMdPerAcre} md owed by ${dateOf(DAY.deliverBy)}.${f.delivery_day ? ' Booked for ' + f.delivery_day + '.' : ''}`, field: f.id, action: 'deliver' }));
  if (setting('sale_apr') == null && d >= DAY.deliverBy - 30 && fieldRows().every((f) => f.status !== 'paid') && m === 'released') ex.push({ level: 'watch', title: 'Run the April sale', body: 'All wheat is in the warehouse. Holders who chose April are paid out now.', action: 'saleApr' });
  if (setting('sale_apr') && !setting('sale_sep') && d >= DAY.settle - 14) ex.push({ level: 'watch', title: 'Run the September sale', body: 'Sell the stored wheat and pay the remaining holders.', action: 'saleSep' });
  regs.filter((r) => r.status === 'new').forEach((r) => ex.push({ level: 'info', title: `New grower registration: ${r.name}`, body: `${r.acres} acres, ${r.village}. Schedule a field check.`, reg: r.id, action: 'reg' }));
  const act = c.fields.filter((f) => f.active);
  return {
    market: m, exceptions: ex, board, thresholds: th,
    cash: { deposits, treasury, refunds: -refunds, released: -released, fees: -fees, escrow, insurance, payouts },
    coverage: { owed: sum(act, (f) => f.owed), est: sum(act, (f) => f.est), lo: sum(act, (f) => f.estLo), hi: sum(act, (f) => f.estHi), cov: sum(act, (f) => f.est) / Math.max(1, sum(act, (f) => f.owed)), shortfall: sum(act, (f) => Math.max(0, f.owed - f.estLo)), watch: act.filter((f) => f.risk === 'watch').length, risk: act.filter((f) => f.risk === 'risk').length },
    registry: fieldRows().map((f) => { const cf = c.fields.find((x) => x.id === f.id), b = board.find((x) => x.id === f.id), del = get('SELECT * FROM deliveries WHERE field_id = ?', f.id);
      return { id: f.id, grower: f.grower, phone: f.grower_phone, village: f.village, acres: f.acres_listed, acresContracted: f.acres_contracted, status: f.status, frac: b.frac, cov: cf.cov, risk: cf.risk, est: cf.est, owed: cf.owed, deliveryDay: f.delivery_day, delivery: del }; }),
    investors: { real: get("SELECT COUNT(*) AS n FROM users WHERE role = 'investor' AND bot = 0").n, simulated: get("SELECT COUNT(*) AS n FROM users WHERE role = 'investor' AND bot = 1").n,
      elections: all("SELECT win, COUNT(*) AS n FROM elections GROUP BY win") },
    orders: realOrders, reports, registrations: regs, saleApr: setting('sale_apr'), saleSep: setting('sale_sep'), price: priceAt(d),
  };
}
