import { get, all, setting, today, sha } from './db.js';
import { PR, K, DAY, PHASES, dateOf, isoOf, phaseAt, priceAt, mandi, netPerKg, cropAt, stageAt, weather, advice, GEO, poly, sale } from './domain.js';
import { listings, listing, pools, fieldRow, fieldRows, balances, holdersOf, userExposure, target, deliveredKg, payoutLabel } from './market.js';
import { pilot, BLOCKS } from './pilot.js';

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const RS = K.RS_PAT;
const lots = (fieldId) => all('SELECT * FROM deliveries WHERE field_id = ? ORDER BY id', fieldId).map((l) => ({ ...l, date: dateOf(l.day) }));
const lastEwr = (fieldId) => get("SELECT * FROM deliveries WHERE field_id = ? AND grade != 'Rejected' ORDER BY id DESC LIMIT 1", fieldId);

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
  const unread = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0 AND day <= ?', u.id, today()).n;
  return { id: u.id, role: u.role, phone: u.phone, name: u.name, name_ur: u.name_ur, cnicOk: !!u.cnic_ok, bankOk: !!u.bank_ok, iban: u.iban ? u.iban.slice(0, 4) + '…' + u.iban.slice(-4) : null,
    limit: u.season_limit, suitability: u.suitability ? JSON.parse(u.suitability) : null, filer: !!u.filer, lang: u.lang, segment: u.segment, acked: u.ack_day != null,
    prefs: u.prefs ? JSON.parse(u.prefs) : {}, unread };
}

export function pricing() {
  return { ...PR, K, scenarios: [['Stress (2024 repeat)', PR.stress], ['Low', PR.low], ['At the support price', PR.support], ['September estimate', PR.ref], ['High', PR.high]].map(([label, px]) => ({ label, px, ret: netPerKg(px) / RS - 1 })) };
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
    const refund = get('SELECT COALESCE(SUM(a.refund),0) AS v FROM allocations a WHERE a.field_id = ?', f.id).v;
    const treasury = get("SELECT COALESCE(SUM(a.pat),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.kind = 'treasury'", f.id).v;
    return { id: f.id, grower: f.grower, acres: f.acres_listed, acresContracted: f.acres_contracted, status: f.status, offerAcres: f.offer_acres, decision: f.decision, decisionNote: f.decision_note,
      signed: f.signed_day != null, paid, frac: paid / target(f), refund, treasuryPat: treasury, advance: ['contracted', 'paid', 'short', 'delivered', 'settled'].includes(f.status) ? f.acres_contracted * PR.owedMdPerAcre * PR.price : 0 };
  });
}

function fieldName(id) { const f = fieldRow(id); return f ? f.grower : id; }

export function inbox(user) {
  const d = today();
  const rows = all('SELECT * FROM notifications WHERE user_id = ? AND day <= ? ORDER BY day DESC, id DESC LIMIT 200', user.id, d);
  // Same-day token events across many growers read as one message, so the inbox stays readable at scale.
  const groups = [[/ delivered in full$/, /Your ([\d,]+) PAT/, (n, pat) => [`${n} growers delivered in full`, `${pat} of your PAT are unlocked and backed by graded wheat in the certified warehouse.`]],
    [/ signed and was paid$/, /([\d,]+) PAT minted/, (n, pat) => [`${n} growers signed and were paid`, `${pat} PAT minted to you, locked until the wheat is delivered in April.`]]];
  const out = [];
  rows.forEach((n) => {
    const g = n.kind === 'token' && groups.find(([re]) => re.test(n.title));
    if (!g) return out.push(n);
    const prev = out.find((x) => x.day === n.day && x.group === g);
    if (prev) { prev.members.push(n); return; }
    out.push({ ...n, group: g, members: [n] });
  });
  return out.slice(0, 100).map(({ group, members, ...n }) => {
    if (group && members.length > 2) {
      const pat = members.reduce((s, m) => s + Number(((m.body.match(group[1]) || [])[1] || '0').replace(/,/g, '')), 0);
      const [title, body] = group[2](members.length, pat.toLocaleString('en-IN'));
      n = { ...n, title, body: body + ' ' + members.map((m) => m.title.replace(group[0], '')).join(', ') + '.', read: members.every((m) => m.read) ? 1 : 0 };
    } else if (group && members.length > 1) return members.map((m) => ({ ...m, date: dateOf(m.day), date_ur: dateOf(m.day, 'ur') }));
    return { ...n, date: dateOf(n.day), date_ur: dateOf(n.day, 'ur') };
  }).flat();
}

// Season updates for an investor's holdings: one line per milestone across all their growers, flagging the ones to watch.
function updatesFor(fieldIds, d, userId) {
  const out = [], fs = fieldIds.map((id) => fieldRow(id)).filter((f) => f.paid_day != null);
  if (!fs.length) return out;
  const avg = (day) => fs.reduce((s, f) => s + cropAt(f, day).cov, 0) / fs.length;
  const weak = (day) => fs.filter((f) => cropAt(f, day).cov < 1.3).map((f) => `${f.grower} (${cropAt(f, day).cov.toFixed(2)}×)`);
  [[19, 'Sowing finished', 'All your fields were sown before the 20 November cut-off.'], [35, 'Crop up and even', 'Emergence checked by satellite.'], [70, 'Tillering', 'The crop is building its stems.'], [133, 'Grain filling', 'The weeks that decide yield.']].forEach(([day, t, b]) => {
    if (d < day) return;
    const w = weak(day);
    out.push({ day, date: dateOf(day), t, b: `${b} Average cover across your ${fs.length} growers ${avg(day).toFixed(2)}×.${w.length ? ' Watching: ' + w.join(', ') + '.' : ''}`, k: w.length ? 'watch' : 'ok' });
  });
  fs.filter((f) => f.crop_event === 'blight' && d >= 84).forEach((f) => out.push({ day: 84, date: dateOf(84), t: `${f.grower}: crop under stress`, b: 'Crop health fell below nearby fields. A field officer visited and the grower is treating it. Delivery is still the grower\'s obligation.', k: 'watch' }));
  fs.filter((f) => f.crop_event === 'irrigation' && d >= 112).forEach((f) => out.push({ day: 112, date: dateOf(112), t: `${f.grower}: water stress`, b: 'Tubewell breakdown during jointing. Irrigation restored; estimate lowered.', k: 'watch' }));
  const lotsIn = fs.map((f) => get("SELECT MAX(day) AS day FROM deliveries WHERE field_id = ? AND grade != 'Rejected'", f.id).day).filter((x) => x != null && x <= d);
  if (lotsIn.length) { const done = fs.filter((f) => ['delivered', 'settled'].includes(f.status) && (f.resolution || 'full') === 'full').length; out.push({ day: Math.max(...lotsIn), date: dateOf(Math.max(...lotsIn)), t: 'Deliveries', b: `${done} of ${fs.length} growers delivered in full to the certified warehouse.${fs.some((f) => f.status === 'short') ? ' Still due: ' + fs.filter((f) => f.status === 'short').map((f) => f.grower).join(', ') + '.' : ''}${fs.some((f) => f.resolution === 'refund') ? ' Missing wheat from ' + fs.filter((f) => f.resolution === 'refund').map((f) => f.grower).join(', ') + ' was settled by refunding its price.' : ''}`, k: done === fs.length ? 'ok' : 'watch' }); }
  all('SELECT * FROM payouts WHERE user_id = ? AND day <= ?', userId, d).forEach((p) => out.push({ day: p.day, date: dateOf(p.day), t: p.win === 'apr' ? 'Sold at the April sale' : p.win === 'early' ? 'Sold early at your request' : 'Sold at the September sale', b: `${p.pat.toLocaleString('en-IN')} PAT at Rs ${Math.round(p.price).toLocaleString('en-IN')} per 40 kg. Net Rs ${Math.round(p.net).toLocaleString('en-IN')} sent to your bank.`, k: 'ok' }));
  return out.sort((a, b) => b.day - a.day);
}

export function portfolio(user) {
  const d = today(), px = priceAt(d);
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY reserved_at DESC', user.id).map((o) => ({
    ...o, expiresDay: o.reserved_day + K.HOLD_DAYS, expires: dateOf(o.reserved_day + K.HOLD_DAYS), reservedDate: dateOf(o.reserved_day), paidDate: o.paid_day != null ? dateOf(o.paid_day) : null,
    withdrawable: o.status === 'paid' && d <= DAY.close - 2 && setting('market') === 'open',
    lines: all('SELECT a.*, f.village, u.name AS grower, f.status AS fstatus FROM allocations a JOIN fields f ON f.id = a.field_id JOIN users u ON u.id = f.grower_id WHERE a.order_id = ?', o.id),
  }));
  const bal = balances(user.id).map((b) => { const f = fieldRow(b.field), c = cropAt(f, Math.max(0, d));
    return { ...b, grower: f.grower, village: f.village, acres: f.acres_contracted, cov: c.cov, ndvi: c.ndvi, est: c.perAc, delivery: lastEwr(f.id), deliveredKg: deliveredKg(f.id), owedKg: f.acres_contracted * K.ACRE_KG, shortfallKg: f.shortfall_kg, extension: f.extension_until != null ? dateOf(f.extension_until) : null }; });
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
  if (pat) stage = bal.some((b) => b.status === 'short') ? 'short' : bal.every((b) => !b.locked) ? 'stored' : 'held';
  if (payouts.length && !pat) stage = 'paidout';
  if (!held.length && !waiting && orders.some((o) => o.status === 'refunded' || o.status === 'withdrawn')) stage = 'refunded';
  const fieldsHeld = [...new Set(held.flatMap((o) => o.lines.filter((l) => l.pat > 0).map((l) => l.field_id)))];
  const signing = fieldsHeld.map((id) => fieldRow(id)).map((f) => ({ grower: f.grower, signed: f.signed_day != null, paid: f.paid_day != null, status: f.status }));
  const zakatBase = pat ? pat * netPerKg(px) : waiting;
  const realised = sum(payouts, (p) => p.net) + sum(cash.filter((c) => c.type === 'refund' && /undelivered/.test(c.memo)), (c) => -c.amount);
  return {
    stage, orders, holdings: bal, pat, cost, waiting, payouts, cash, events, election, signing,
    exposure: userExposure(user.id, d), limit: user.season_limit,
    updates: updatesFor(fieldsHeld, d, user.id),
    canSellNow: bal.some((b) => !b.locked),
    zakat: zakatBase ? { base: zakatBase, due: zakatBase * 0.025 } : null,
    realised,
    direct: user.segment === 'direct' ? directView(d) : null,
    value: valuePat ? { pat: valuePat, cost, markNow: s(px), price: px, retNow: cost ? s(px) / cost - 1 : 0,
      scenarios: [['If 2024 repeats', PR.stress], ['Low', PR.low], ['At the support price', PR.support], ['September estimate', PR.ref], ['High', PR.high]].map(([label, p]) => ({ label, px: p, value: s(p), ret: cost ? s(p) / cost - 1 : 0 })),
      breakeven: PR.breakeven, sep: sale(valuePat, 'sep', PR.ref, user.filer !== 0), apr: sale(valuePat, 'apr', Math.max(px, PR.support), user.filer !== 0),
      early: (() => { const e = sale(valuePat, 'apr', px, user.filer !== 0); const share = Math.max(0, Math.min(1, (d - DAY.deliverBy) / (DAY.settle - DAY.deliverBy))); e.storage = e.md * PR.carry * share; e.net -= e.storage; return e; })() } : null,
  };
}

function directView(d) {
  const p = pilot(d);
  return { ...p, blocks: p.blocks.map(({ geo, ...b }) => b) };
}

// Grower record: what a buyer or a lender would want to know next season.
function growerScore(f, d) {
  const items = [
    ['Signed on time|وقت پر دستخط', f.signed_day != null && f.signed_day <= DAY.mint, f.signed_day != null],
    ['Confirmed payment|ادائیگی کی تصدیق', f.receipt_day != null, f.paid_day != null],
    ['Reported sowing within 3 days|3 دن میں بوائی کی اطلاع', f.sown_day != null, d >= DAY.sowBy && f.paid_day != null],
    ['Delivered by 30 April|30 اپریل تک ترسیل', ['delivered', 'settled'].includes(f.status) && (lastEwr(f.id) || {}).day <= DAY.deliverBy, d >= DAY.deliverBy || ['delivered', 'settled'].includes(f.status)],
    ['Delivered in full|مکمل ترسیل', ['delivered', 'settled'].includes(f.status) && f.resolution !== 'refund', ['delivered', 'settled'].includes(f.status)],
  ];
  const scored = items.filter((i) => i[2]), points = scored.filter((i) => i[1]).length;
  return { items: items.map(([t, ok, due]) => ({ t: t.split('|')[0], t_ur: t.split('|')[1], ok, due })), points, of: scored.length, tier: !scored.length ? null : points === scored.length ? 'Gold' : points >= scored.length - 1 ? 'Silver' : 'Building' };
}

export function grower(user) {
  const d = today();
  if (user.segment === 'direct') return { direct: directView(d), inbox: inbox(user) };
  const f = get('SELECT * FROM fields WHERE grower_id = ?', user.id);
  if (!f) return { field: null };
  const fr = fieldRow(f.id), c = cropAt(f, Math.max(d, 0)), th = setting('thresholds');
  const nds = fieldRows().map((x) => cropAt(x, d).ndvi).filter((x) => x != null).sort((a, b) => a - b);
  const med = nds.length ? nds[Math.floor(nds.length / 2)] : null;
  const l = listing(fr, d, -1);
  const done = Object.fromEntries(all('SELECT key, day FROM tasks WHERE field_id = ?', f.id).map((t) => [t.key, dateOf(t.day)]));
  const booked = Object.fromEntries(all('SELECT delivery_day, COUNT(*) AS n FROM fields WHERE delivery_day IS NOT NULL GROUP BY delivery_day').map((r) => [r.delivery_day, r.n]));
  const slots = []; for (let day = 150; day <= DAY.deliverBy; day++) { const iso = isoOf(day); slots.push({ iso, date: dateOf(day, 'en', true), date_ur: dateOf(day, 'ur', true), left: Math.max(0, 3 - (booked[iso] || 0) + (f.delivery_day === iso ? 1 : 0)) }); }
  return {
    field: { ...l, status: f.status, acresContracted: f.acres_contracted, owedMd: f.acres_contracted * PR.owedMdPerAcre, advance: f.acres_contracted * PR.owedMdPerAcre * PR.price, offerAcres: f.offer_acres,
      offerAdvance: f.offer_acres ? f.offer_acres * PR.owedMdPerAcre * PR.price : null, decision: f.decision, deliveryDay: f.delivery_day,
      signedDay: f.signed_day, signedDate: f.signed_day != null ? dateOf(f.signed_day) : null, signedDateUr: f.signed_day != null ? dateOf(f.signed_day, 'ur') : null, paidDate: f.paid_day != null ? dateOf(f.paid_day) : null, paidDateUr: f.paid_day != null ? dateOf(f.paid_day, 'ur') : null, receiptDate: f.receipt_day != null ? dateOf(f.receipt_day) : null,
      payoutMethod: f.payout_method, payoutAccount: f.payout_account, payoutLabel: payoutLabel(f), sownDate: f.sown_day != null ? dateOf(f.sown_day) : null, sownDateUr: f.sown_day != null ? dateOf(f.sown_day, 'ur') : null,
      deliveredKg: deliveredKg(f.id), shortfallKg: f.shortfall_kg, extension: f.extension_until != null ? dateOf(f.extension_until) : null, resolution: f.resolution },
    crop: { ...c, stage: stageAt(d), advice: advice(f, d, med, th).map((a) => ({ ...a, done: done[a.k] || null })), weather: weather(d), checked: dateOf(d - (d % 5)) },
    payments: all("SELECT * FROM cash WHERE field_id = ? AND type IN ('release','surplus')", f.id).map((p) => ({ ...p, amount: -p.amount, date: dateOf(p.day) })),
    refunds: all("SELECT * FROM cash WHERE field_id = ? AND type = 'grower_refund'", f.id).map((p) => ({ ...p, date: dateOf(p.day) })),
    lots: lots(f.id), slots,
    surplus: all('SELECT * FROM surplus WHERE field_id = ? ORDER BY id DESC', f.id).map((s) => ({ ...s, date: dateOf(s.day) })),
    reports: all('SELECT * FROM reports WHERE field_id = ? ORDER BY id DESC', f.id).map((r) => ({ ...r, date: dateOf(r.day) })),
    officer: { name: 'Usman Ali', name_ur: 'عثمان علی' },
    mandi: mandi(d).sahiwal, keptMd: Math.max(0, Math.round(f.acres_contracted * (c.perAc - PR.owedMdPerAcre))),
    score: growerScore(f, d), nextSeason: get("SELECT * FROM registrations WHERE phone = ? AND status = 'pre-approved'", user.phone) != null,
    inbox: inbox(user),
  };
}

export function crop() {
  const d = today(), th = setting('thresholds'), fs = fieldRows();
  const nd = fs.map((f) => cropAt(f, d).ndvi).filter((x) => x != null).sort((a, b) => a - b), med = nd.length ? nd[Math.floor(nd.length / 2)] : null;
  const weeks = []; for (let w = 4; w <= Math.min(Math.floor(d / 7), 30); w++) weeks.push(w);
  const p = pilot(d);
  return {
    day: d, stage: stageAt(d), weather: weather(d), thresholds: th, median: med,
    fields: fs.map((f, i) => {
      const c = cropAt(f, d), active = !['lapsed', 'listed', 'offer'].includes(f.status) || setting('market') === 'open';
      const owed = f.acres_contracted * PR.owedMdPerAcre;
      return { id: f.id, grower: f.grower, grower_ur: f.grower_ur, village: f.village, acres: f.acres_contracted, status: f.status, active, path: poly(GEO[i]), cx: GEO[i][0], cy: GEO[i][1],
        ...c, owed, est: f.acres_contracted * c.perAc, estLo: f.acres_contracted * c.perAcLo, estHi: f.acres_contracted * c.perAcHi,
        risk: c.cov >= th.watch ? 'ok' : c.cov >= th.risk ? 'watch' : 'risk', advice: advice(f, d, med, th),
        series: weeks.map((w) => ({ w, date: dateOf(w * 7, 'en', true), ndvi: cropAt(f, w * 7).ndvi, perAc: cropAt(f, w * 7).perAc })),
        visit: get('SELECT * FROM visits WHERE field_id = ? ORDER BY id DESC LIMIT 1', f.id) };
    }),
    pilot: { name: p.grower, acres: p.acres, owed: p.md, est: p.est, cover: p.cover, blocks: p.blocks.map((b, i) => ({ id: b.id, acres: b.acres, ndvi: b.ndvi, perAc: b.perAc, est: b.est, path: poly(BLOCKS[i].geo), cx: BLOCKS[i].geo[0], cy: BLOCKS[i].geo[1], sown: b.isSown, harvested: b.harvested })) },
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
  const perField = fieldRows().map((f) => { const hs = holdersOf(f.id), out = sum(hs, (h) => h.pat), del = lastEwr(f.id);
    return { id: f.id, grower: f.grower, status: f.status, outstanding: out, locked: ['contracted', 'paid', 'short'].includes(f.status), owedKg: ['paid', 'short'].includes(f.status) ? f.acres_contracted * K.ACRE_KG : 0, ewr: del, deliveredKg: deliveredKg(f.id), holders: hs.length,
      minted: sum(events.filter((e) => e.type === 'mint' && e.field_id === f.id), (e) => e.pat) }; });
  const locked = sum(perField.filter((p) => p.locked), (p) => p.outstanding), unlocked = sum(perField.filter((p) => !p.locked), (p) => p.outstanding);
  const ewrKg = sum(perField.filter((p) => !p.locked && p.ewr), (p) => p.deliveredKg - sum(events.filter((e) => e.type === 'burn' && e.field_id === p.id), (e) => e.pat));
  const pl = pilot(d);
  return {
    token: { name: 'Pakistan Agri Token', symbol: 'PAT', series: 'PAT-2627', unit: '1 PAT = 1 kg Grade 1 wheat', network: 'Barak ledger (hash-chained). Hedera anchoring follows PVARA approval.' },
    events: events.reverse(), valid, minted, burned, shortfall: short, outstanding: minted - burned - short, locked, unlocked,
    reserve: { owedKg: sum(perField, (p) => p.owedKg), ewrKg: Math.max(0, ewrKg), locked, unlocked, fields: perField, asOf: dateOf(d) },
    supply: supplySeries(events.slice().reverse()),
    pilot: { ref: pl.ref, records: pl.records.slice().reverse(), tokens: pl.tokens, note: 'Physical Salam until PVARA approval: milestones are recorded and tokens are simulated, not issued.' },
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
  const C = { deposits: cashSum('deposit'), treasury: cashSum('treasury'), refunds: -cashSum('refund'), released: -cashSum('release'), fees: -cashSum('fee'), growerRefunds: cashSum('grower_refund'), feeReturns: cashSum('fee_return'), payouts: cashSum('payout'), surplus: -cashSum('surplus') };
  // Escrow reconciliation: every rupee in is matched by a rupee out or still held.
  C.escrow = C.deposits + C.treasury + C.growerRefunds + C.feeReturns - C.refunds - C.released - C.fees;
  const reports = all('SELECT r.*, u.name AS grower FROM reports r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC').map((r) => ({ ...r, date: dateOf(r.day) }));
  const regs = all('SELECT * FROM registrations ORDER BY id DESC').map((r) => ({ ...r, date: dateOf(r.day) }));
  const m = setting('market'), fs = fieldRows();
  const ex = [];
  if (m === 'open' && d >= DAY.close) ex.push({ level: 'risk', title: 'Market close is due', body: 'The raise ended on ' + dateOf(DAY.close) + '. Close the market to count paid money and form contracts.', action: 'close' });
  board.filter((b) => b.status === 'offer').forEach((b) => ex.push({ level: 'watch', title: `${b.grower}: smaller contract offered`, body: `${Math.round(b.frac * 100)}% paid. Offered ${b.offerAcres} of ${b.acres} acres; grower decides by ${dateOf(DAY.decide)}.`, field: b.id, action: 'decide' }));
  if (m === 'closed' && !board.some((b) => b.status === 'offer')) ex.push({ level: 'watch', title: 'Ready to finalize the close', body: 'All decisions are in. Finalize to compute refunds and the treasury share.', action: 'finalize' });
  const unsigned = fs.filter((f) => f.status === 'contracted' && f.signed_day == null), signedUnpaid = fs.filter((f) => f.status === 'contracted' && f.signed_day != null);
  if (m === 'finalized' && unsigned.length) ex.push({ level: d > DAY.mint ? 'risk' : 'watch', title: `${unsigned.length} grower${unsigned.length > 1 ? 's have' : ' has'} not signed yet`, body: `${unsigned.map((f) => f.grower).join(', ')}. Growers sign in the app; the field officer can sign on paper with a thumbprint and witness.`, action: 'signPaper', fields: unsigned.map((f) => f.id) });
  if (signedUnpaid.length) ex.push({ level: signedUnpaid.some((f) => d - f.signed_day >= 2) ? 'risk' : 'watch', title: `Pay ${signedUnpaid.length} signed contract${signedUnpaid.length > 1 ? 's' : ''}`, body: 'Salam needs the full price paid when the contract is made. Pay on the day of signing; never later than 3 days.', action: 'release' });
  const noReceipt = fs.filter((f) => f.paid_day != null && f.receipt_day == null && d - f.paid_day >= 3);
  if (noReceipt.length) ex.push({ level: 'info', title: `${noReceipt.length} grower${noReceipt.length > 1 ? 's have' : ' has'} not confirmed payment`, body: `${noReceipt.slice(0, 6).map((f) => f.grower).join(', ')}${noReceipt.length > 6 ? ' and ' + (noReceipt.length - 6) + ' more' : ''}. Field officers call to confirm the money arrived.`, action: 'call' });
  c.fields.filter((f) => f.active && d >= 28 && f.risk !== 'ok' && !f.harvested && f.status === 'paid').forEach((f) => ex.push({ level: f.risk, title: `${f.grower}: coverage ${f.cov.toFixed(2)}×`, body: `Estimated ${Math.round(f.est)} md against ${f.owed} md owed. ${f.advice[0] ? f.advice[0].en[0] + '.' : ''}`, field: f.id, action: 'visit' }));
  reports.filter((r) => r.status === 'open').forEach((r) => ex.push({ level: 'watch', title: `${r.grower}: ${r.type}`, body: r.text || 'No details given.', report: r.id, action: 'assign' }));
  fs.filter((f) => f.status === 'short').forEach((f) => ex.push({ level: 'risk', title: `${f.grower}: ${Math.round(f.shortfall_kg).toLocaleString('en-IN')} kg short`, body: f.extension_until ? `Extended to ${dateOf(f.extension_until)}. Record the rest when it arrives, or recover the price.` : 'Extend delivery by up to 30 days, or have the grower refund the price of the missing wheat with no profit added.', field: f.id, action: 'shortfall', extended: !!f.extension_until }));
  fs.filter((f) => f.status === 'paid' && d >= DAY.deliverBy - 40).forEach((f) => ex.push({ level: d > DAY.deliverBy ? 'risk' : 'info', title: `${f.grower}: delivery ${d > DAY.deliverBy ? 'overdue' : 'due'}`, body: `${f.acres_contracted * PR.owedMdPerAcre} md owed by ${dateOf(DAY.deliverBy)}.${f.delivery_day ? ' Booked for ' + f.delivery_day + '.' : ' No delivery day booked.'}`, field: f.id, action: 'deliver' }));
  all("SELECT s.*, u.name AS grower FROM surplus s JOIN fields f ON f.id = s.field_id JOIN users u ON u.id = f.grower_id WHERE s.status = 'offered'").forEach((s) => ex.push({ level: 'watch', title: `${s.grower} offers ${s.md} maunds of surplus`, body: `Right of first offer at today's market price (about Rs ${Math.round(priceAt(d) - 35).toLocaleString('en-IN')}). Answer within 3 days.`, surplus: s.id, action: 'surplus' }));
  if (setting('sale_apr') == null && d >= DAY.deliverBy - 30 && fs.every((f) => !['paid', 'short', 'contracted'].includes(f.status)) && m === 'released') ex.push({ level: 'watch', title: 'Run the April sale', body: 'All wheat is in the warehouse. Holders who chose April are paid out now.', action: 'saleApr' });
  if (setting('sale_apr') && !setting('sale_sep') && d >= DAY.settle - 14) ex.push({ level: 'watch', title: 'Run the September sale', body: 'Sell the stored wheat and pay the remaining holders.', action: 'saleSep' });
  regs.filter((r) => r.status === 'new').forEach((r) => ex.push({ level: 'info', title: `New grower registration: ${r.name}`, body: `${r.acres} acres, ${r.village}. Schedule a field check.`, reg: r.id, action: 'reg' }));
  const pl = pilot(d);
  if (pl.stage !== 'proposal' && d >= pl.D.signed + 3 && !pl.receipt) ex.push({ level: 'info', title: 'Pilot: Wattoo Agri Farming has not confirmed receipt', body: 'Clause 4.3 needs a signed receipt for the Rs 2,64,00,000 price.', action: 'pilot' });
  if (pl.surplus && !pl.surplusDecision) ex.push({ level: 'watch', title: `Pilot: Wattoo offers ${pl.surplus.md.toLocaleString('en-IN')} maunds of surplus`, body: 'Right of first offer at the prevailing price; answer within 3 days (clause 7.2).', action: 'pilot' });
  const act = c.fields.filter((f) => f.active);
  return {
    market: m, exceptions: ex, board, thresholds: th, cash: C,
    coverage: { owed: sum(act, (f) => f.owed), est: sum(act, (f) => f.est), lo: sum(act, (f) => f.estLo), hi: sum(act, (f) => f.estHi), cov: sum(act, (f) => f.est) / Math.max(1, sum(act, (f) => f.owed)), shortfall: sum(act, (f) => Math.max(0, f.owed - f.estLo)), watch: act.filter((f) => f.risk === 'watch').length, risk: act.filter((f) => f.risk === 'risk').length },
    registry: fs.map((f) => { const cf = c.fields.find((x) => x.id === f.id), b = board.find((x) => x.id === f.id);
      return { id: f.id, grower: f.grower, phone: f.grower_phone, village: f.village, acres: f.acres_listed, acresContracted: f.acres_contracted, status: f.status, frac: b.frac, cov: cf.cov, risk: cf.risk, est: cf.est, owed: cf.owed,
        deliveryDay: f.delivery_day, delivered: deliveredKg(f.id), lots: lots(f.id), signed: f.signed_day != null, signMethod: f.sign_method, receipt: f.receipt_day != null, payout: payoutLabel(f), shortfall: f.shortfall_kg, extension: f.extension_until != null ? dateOf(f.extension_until) : null, resolution: f.resolution }; }),
    investors: { real: get("SELECT COUNT(*) AS n FROM users WHERE role = 'investor' AND bot = 0 AND segment = 'retail'").n, simulated: get("SELECT COUNT(*) AS n FROM users WHERE role = 'investor' AND bot = 1").n,
      direct: get("SELECT COUNT(*) AS n FROM users WHERE role = 'investor' AND segment = 'direct'").n, elections: all('SELECT win, COUNT(*) AS n FROM elections GROUP BY win') },
    orders: realOrders, reports, registrations: regs, saleApr: setting('sale_apr'), saleSep: setting('sale_sep'), price: priceAt(d),
    surplus: all('SELECT s.*, u.name AS grower FROM surplus s JOIN fields f ON f.id = s.field_id JOIN users u ON u.id = f.grower_id ORDER BY s.id DESC').map((s) => ({ ...s, date: dateOf(s.day) })),
    audit: all('SELECT * FROM audit ORDER BY id DESC LIMIT 200').map((a) => ({ ...a, date: dateOf(a.day) })),
    pilot: directView(d),
  };
}
