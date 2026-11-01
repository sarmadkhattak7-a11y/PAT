import { get, all, run, tx, setting, setSetting, today, nextSeq, sha, notify } from './db.js';
import { PR, K, DAY, sale, cropAt, priceAt, dateOf } from './domain.js';

export class UserError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const RS = K.RS_PAT;
const floorPat = (rs) => Math.floor(rs / RS + 1e-9);

export const fieldRow = (id) => get('SELECT f.*, u.name AS grower, u.name_ur AS grower_ur, u.phone AS grower_phone FROM fields f JOIN users u ON u.id = f.grower_id WHERE f.id = ?', id);
export const fieldRows = () => all('SELECT f.*, u.name AS grower, u.name_ur AS grower_ur, u.phone AS grower_phone FROM fields f JOIN users u ON u.id = f.grower_id ORDER BY f.idx');
export const target = (f) => f.acres_listed * K.ACRE_KG * RS;           // money a listing raises, mint fee included
export const contractTarget = (f) => f.acres_contracted * K.ACRE_KG * RS;
const holdLive = (o, d) => o.status === 'reserved' && d <= o.reserved_day + K.HOLD_DAYS;

// ── housekeeping run before every read ──
export function sync() {
  const d = today();
  tx(() => {
    if (setting('market') !== 'open') return;
    run("UPDATE orders SET status = 'expired' WHERE status = 'reserved' AND reserved_day + ? < ?", K.HOLD_DAYS, d);
    simulateOthers(Math.min(d, DAY.close)); // catch up to the curve even if the clock jumped past the close
  });
}

// Other investors arrive on a front-loaded curve so the marketplace looks like a live raise.
// They are seeded "bot" accounts, clearly separated from real sign-ups in Ops.
function simulateOthers(d) {
  const p = Math.max(0, Math.min(1, (d - DAY.open) / (DAY.close - DAY.open))), s = 1 - Math.pow(1 - p, 1.7);
  const bots = all("SELECT id FROM users WHERE bot = 1 ORDER BY id");
  fieldRows().forEach((f, fi) => {
    const T = target(f), want = f.sim_frac * T * s;
    const have = get("SELECT COALESCE(SUM(a.amount),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id JOIN users u ON u.id = o.user_id WHERE a.field_id = ? AND u.bot = 1 AND o.status = 'paid'", f.id).v;
    let gap = Math.floor((want - have) / RS) * RS;
    for (let k = 0; gap >= RS * 50 && k < bots.length; k++) {
      const b = bots[(fi * 5 + k + Math.floor(have / 7919)) % bots.length];
      const held = get("SELECT COALESCE(SUM(a.amount),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.user_id = ? AND o.status IN ('paid','reserved')", f.id, b.id).v;
      const amt = Math.floor(Math.min(gap, K.CAP * T - held) / RS) * RS;
      if (amt < RS * 50) continue;
      const id = 'ORD-' + nextSeq('order');
      run("INSERT INTO orders (id, user_id, kind, amount, status, reserved_day, reserved_at, paid_day, method, pay_ref) VALUES (?, ?, 'field', ?, 'paid', ?, ?, ?, 'raast', ?)", id, b.id, amt, d, Date.now(), d, 'BRK-PAY-' + nextSeq('pay'));
      run('INSERT INTO allocations (order_id, field_id, amount) VALUES (?, ?, ?)', id, f.id, amt);
      run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('deposit', ?, ?, ?, ?, ?, 'Raast · escrow')", amt, b.id, f.id, id, d);
      gap -= amt;
    }
  });
}

// ── listings ──
function fundingFor(fieldId, d, userId) {
  const rows = all('SELECT a.amount, a.kept, o.status, o.reserved_day, o.user_id FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ?', fieldId);
  const paid = sum(rows.filter((r) => ['paid', 'allotted', 'tokens', 'refunded'].includes(r.status)), (r) => r.amount);
  const held = sum(rows.filter((r) => holdLive(r, d)), (r) => r.amount);
  const mineRows = rows.filter((r) => r.user_id === userId);
  const mine = sum(mineRows.filter((r) => r.status === 'paid' || holdLive(r, d)), (r) => r.amount);
  const mineKept = sum(mineRows.filter((r) => r.kept != null), (r) => r.kept);
  const backers = new Set(rows.filter((r) => r.status === 'paid' || r.status === 'allotted' || r.status === 'tokens').map((r) => r.user_id)).size;
  return { paid, held, mine, mineKept, backers };
}

export function listing(f, d, userId) {
  const T = target(f), fu = fundingFor(f.id, d, userId), open = setting('market') === 'open' && d < DAY.close;
  const reserved = fu.paid + fu.held, room = open ? Math.max(0, T - reserved) : 0, capLeft = Math.max(0, K.CAP * T - fu.mine);
  const c = cropAt(f, Math.max(d, 0));
  return {
    id: f.id, idx: f.idx, grower: f.grower, grower_ur: f.grower_ur, village: f.village, acres: f.acres_listed, acresContracted: f.acres_contracted,
    grade: f.grade, water: f.water, photo: f.photo, history: JSON.parse(f.history || '[]'), status: f.status, offerAcres: f.offer_acres,
    target: T, kg: T / RS, paid: fu.paid, reserved, room, cap: K.CAP * T, capLeft, myRoom: Math.min(room, capLeft), mine: fu.mine, mineKept: fu.mineKept,
    paidFrac: fu.paid / T, resFrac: reserved / T, backers: fu.backers, open,
    estPerAc: c.perAc, estLo: c.perAcLo, estHi: c.perAcHi, cov: c.cov,
  };
}
export const listings = (d, userId) => fieldRows().map((f) => listing(f, d, userId));

export const POOLS = {
  starter: { fields: ['BRK-0141', 'BRK-0142', 'BRK-0143', 'BRK-0144', 'BRK-0145', 'BRK-0146', 'BRK-0147', 'BRK-0148', 'BRK-0150', 'BRK-0151'], en: 'Starter pool', ur: 'ابتدائی پول', blurb: '10 fields across 4 villages, weighted by field size' },
  core: { fields: ['BRK-0141', 'BRK-0143', 'BRK-0145', 'BRK-0148', 'BRK-0151'], en: 'Large farms pool', ur: 'بڑے کھیتوں کا پول', blurb: '5 of the largest, longest-record fields' },
};
export function pools(d, userId) {
  const L = Object.fromEntries(listings(d, userId).map((x) => [x.id, x]));
  return Object.entries(POOLS).map(([key, P]) => {
    const ls = P.fields.map((id) => L[id]);
    return { key, name: P.en, name_ur: P.ur, blurb: P.blurb, fields: P.fields, room: sum(ls, (x) => x.myRoom), villages: new Set(ls.map((x) => x.village)).size, acres: sum(ls, (x) => x.acres) };
  });
}

// Water-fill an amount across fields, weighted by listing size, never past a field's room or the investor's 20% cap. Whole PAT only.
export function allocate(fieldIds, amount, d, userId) {
  const ls = fieldIds.map((id) => listing(fieldRow(id), d, userId)), av = {}, out = {};
  ls.forEach((l) => { av[l.id] = l.myRoom; out[l.id] = 0; });
  let rem = amount;
  for (let it = 0; it < 12 && rem > 1; it++) {
    const act = ls.filter((l) => av[l.id] - out[l.id] > 1); if (!act.length) break;
    const W = sum(act, (l) => l.target); let given = 0;
    act.forEach((l) => { const g = Math.min(rem * l.target / W, av[l.id] - out[l.id]); out[l.id] += g; given += g; });
    rem -= given; if (given < 1) break;
  }
  const alloc = ls.filter((l) => out[l.id] >= RS).map((l) => [l.id, floorPat(out[l.id]) * RS]);
  let gap = floorPat(Math.min(amount, sum(ls, (l) => av[l.id]))) * RS - sum(alloc, (a) => a[1]);
  for (let k = 0; gap >= RS && k < 2000; k++) {
    const a = alloc.slice().sort((x, y) => (av[y[0]] - y[1]) - (av[x[0]] - x[1]))[0];
    if (!a || av[a[0]] - a[1] < RS) break; a[1] += RS; gap -= RS;
  }
  const placed = sum(alloc, (a) => a[1]);
  return { alloc: alloc.map(([field, amt]) => ({ field, amount: amt, pat: Math.round(amt / RS) })), placed, short: Math.max(0, amount - placed) };
}

export function quote(spec, d, userId) {
  const amount = Math.floor(Number(spec.amount) || 0);
  if (spec.kind === 'pool') {
    const P = POOLS[spec.pool]; if (!P) throw new UserError('Unknown pool');
    return { ...allocate(P.fields, amount, d, userId), amount };
  }
  const f = fieldRow(spec.field); if (!f) throw new UserError('Unknown field');
  const l = listing(f, d, userId);
  if (amount <= l.myRoom) return { ...allocate([f.id], amount, d, userId), amount };
  // Over the 20% cap or the field's room: keep the most allowed here and spread the rest over at least four more fields.
  const first = floorPat(l.myRoom) * RS;
  const others = listings(d, userId).filter((x) => x.id !== f.id && x.myRoom > 1000).sort((a, b) => b.myRoom - a.myRoom);
  const cands = []; let roomSum = 0;
  for (const x of others) { if (cands.length >= 4 && roomSum >= amount - first) break; cands.push(x.id); roomSum += x.myRoom; }
  const rest = allocate(cands, amount - first, d, userId);
  const alloc = (first > 0 ? [{ field: f.id, amount: first, pat: Math.round(first / RS) }] : []).concat(rest.alloc);
  return { alloc, placed: sum(alloc, (a) => a.amount), short: rest.short, split: true, amount };
}

const money = (x) => 'Rs ' + Math.round(x).toLocaleString('en-IN');
const realInvestors = (fieldId) => all("SELECT DISTINCT o.user_id FROM allocations a JOIN orders o ON o.id = a.order_id JOIN users u ON u.id = o.user_id WHERE a.field_id = ? AND u.bot = 0 AND u.role = 'investor' AND o.status IN ('paid','allotted','tokens')", fieldId).map((r) => r.user_id);
export const payoutLabel = (f) => (f.payout_method === 'Bank' ? f.payout_account : `${f.payout_method || 'Bank'} ${f.payout_account || ''}`.trim());
export const deliveredKg = (fieldId) => get("SELECT COALESCE(SUM(kg),0) AS v FROM deliveries WHERE field_id = ? AND grade != 'Rejected'", fieldId).v;
const LOCKED = ['contracted', 'paid', 'short'];

export function userExposure(userId, d) {
  const rows = all('SELECT * FROM orders WHERE user_id = ?', userId);
  return sum(rows.filter((o) => o.status === 'paid' || o.status === 'allotted' || o.status === 'tokens' || holdLive(o, d)), (o) => o.amount);
}

export function reserve(user, spec) {
  const d = today();
  if (setting('market') !== 'open' || d >= DAY.close) throw new UserError('The market for this season has closed.');
  if (d < DAY.open) throw new UserError('The market has not opened yet.');
  if (!user.cnic_ok || !user.bank_ok || !user.season_limit) throw new UserError('Finish verification first: phone, CNIC, bank account and the three questions.');
  if (user.ack_day == null) throw new UserError('Read and accept the key facts before your first reservation.');
  const amount = Math.floor(Number(spec.amount) || 0);
  if (amount < K.MIN) throw new UserError('The minimum is Rs ' + K.MIN.toLocaleString('en-IN') + '.');
  const exp = userExposure(user.id, d);
  if (exp + amount > user.season_limit) throw new UserError(`That takes you past your season limit of Rs ${user.season_limit.toLocaleString('en-IN')}. You can add up to Rs ${Math.max(0, user.season_limit - exp).toLocaleString('en-IN')}.`);
  return tx(() => {
    const q = quote(spec, d, user.id);
    if (q.placed < K.MIN) throw new UserError('Not enough room left on these fields for that amount.');
    const id = 'ORD-' + nextSeq('order'), ref = 'BRK-PAY-' + nextSeq('pay');
    run("INSERT INTO orders (id, user_id, kind, pool, amount, status, reserved_day, reserved_at, method, pay_ref) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, 'raast', ?)",
      id, user.id, spec.kind === 'pool' ? 'pool' : 'field', spec.pool || null, q.placed, d, Date.now(), ref);
    q.alloc.forEach((a) => run('INSERT INTO allocations (order_id, field_id, amount) VALUES (?, ?, ?)', id, a.field, a.amount));
    notify(user.id, d, 'order', [`${money(q.placed)} reserved`, `Pay by ${dateOf(d + 1)} with reference ${ref} to keep your place.`]);
    return get('SELECT * FROM orders WHERE id = ?', id);
  });
}

// Sandbox payment: in production this is the bank's Raast / 1LINK callback into the escrow account.
export function pay(user, orderId, method) {
  const d = today(), o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', orderId, user.id);
  if (!o) throw new UserError('Order not found', 404);
  if (o.status === 'paid') return o;
  if (o.status !== 'reserved' || !holdLive(o, d)) throw new UserError('This reservation has expired. Reserve again to pay.');
  tx(() => {
    run("UPDATE orders SET status = 'paid', paid_day = ?, method = ? WHERE id = ?", d, method || 'raast', o.id);
    all('SELECT * FROM allocations WHERE order_id = ?', o.id).forEach((a) =>
      run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('deposit', ?, ?, ?, ?, ?, ?)", a.amount, user.id, a.field_id, o.id, d, (method === 'card' ? 'Debit card' : method === 'ibft' ? 'Bank transfer' : 'Raast') + ' · escrow'));
    notify(user.id, d, 'money', [`Payment received: ${money(o.amount)}`, `Held in escrow at the bank. You can withdraw it until ${dateOf(DAY.close - 2)}. The market closes on ${dateOf(DAY.close)}.`]);
  });
  return get('SELECT * FROM orders WHERE id = ?', o.id);
}
export function cancel(user, orderId) {
  const o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', orderId, user.id);
  if (!o || o.status !== 'reserved') throw new UserError('Only an unpaid reservation can be cancelled.');
  run("UPDATE orders SET status = 'cancelled' WHERE id = ?", o.id);
}
// Cooling-off: a paid order can be withdrawn for a full refund until two days before the close.
export function withdraw(user, orderId) {
  const d = today(), o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', orderId, user.id);
  if (!o || o.status !== 'paid') throw new UserError('Only a paid order waiting for the close can be withdrawn.');
  if (d > DAY.close - 2 || setting('market') !== 'open') throw new UserError(`Withdrawals closed on ${dateOf(DAY.close - 2)}, two days before the close, so growers can count on the money.`);
  tx(() => {
    all('SELECT * FROM allocations WHERE order_id = ?', o.id).forEach((a) =>
      run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('refund', ?, ?, ?, ?, ?, 'Withdrawn before the close · full refund')", -a.amount, user.id, a.field_id, o.id, d));
    run("UPDATE orders SET status = 'withdrawn' WHERE id = ?", o.id);
    notify(user.id, d, 'money', [`Order withdrawn: ${money(o.amount)} refunded`, 'The full amount goes back to your bank account within 1 working day.']);
  });
}

// ── market close and contract formation ──
export function closeMarket() {
  const d = today();
  if (setting('market') !== 'open') throw new UserError('The market is already closed.');
  if (d < DAY.close) throw new UserError('The market closes on ' + dateOf(DAY.close) + '. Move the clock forward to close it.');
  tx(() => {
    run("UPDATE orders SET status = 'lapsed' WHERE status = 'reserved'");
    fieldRows().forEach((f) => {
      const paid = fundingFor(f.id, d).paid, frac = paid / target(f), pc = Math.round(frac * 100);
      if (frac >= K.PASS) {
        run("UPDATE fields SET status = 'ahead' WHERE id = ?", f.id);
        notify(f.grower_id, d, 'contract', ['Your field is going ahead', `${pc}% was paid by investors. Sign your Salam contract by ${dateOf(DAY.mint)} and you are paid the same day.`], ['آپ کا کھیت منظور ہو گیا', `سرمایہ کاروں نے ${pc}٪ رقم دی۔ ${dateOf(DAY.mint, 'ur')} تک معاہدے پر دستخط کریں، اسی دن ادائیگی ہو گی۔`]);
      } else if (frac >= K.SMALLER_MIN) {
        const offer = Math.min(Math.max(1, Math.floor(paid / (K.ACRE_KG * RS) / K.PASS)), f.acres_listed - 1);
        run("UPDATE fields SET status = 'offer', offer_acres = ? WHERE id = ?", offer, f.id);
        notify(f.grower_id, d, 'contract', ['A smaller contract is offered', `${pc}% was paid. You can take ${offer} of your ${f.acres_listed} acres. Decide by ${dateOf(DAY.decide)}.`], ['چھوٹا معاہدہ پیش ہے', `${pc}٪ رقم آئی۔ آپ ${f.acres_listed} میں سے ${offer} ایکڑ کا معاہدہ لے سکتے ہیں۔ ${dateOf(DAY.decide, 'ur')} تک فیصلہ کریں۔`]);
      } else {
        run("UPDATE fields SET status = 'lapsed' WHERE id = ?", f.id);
        notify(f.grower_id, d, 'contract', ['Not funded this season', 'Your field stayed under half funded, so no contract was formed. You owe nothing and are offered first next season.'], ['اس سیزن رقم پوری نہیں ہوئی', 'کوئی معاہدہ نہیں ہوا، آپ پر کچھ واجب نہیں۔ اگلے سیزن آپ کو پہلا موقع ملے گا۔']);
      }
    });
    all("SELECT DISTINCT o.user_id FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'paid' AND u.bot = 0").forEach((r) => {
      const fs = all("SELECT DISTINCT f.status FROM allocations a JOIN orders o ON o.id = a.order_id JOIN fields f ON f.id = a.field_id WHERE o.user_id = ? AND o.status = 'paid'", r.user_id).map((x) => x.status);
      notify(r.user_id, d, 'close', ['The market has closed', `Your fields: ${fs.filter((s) => s === 'ahead').length ? 'some going ahead' : 'none going ahead yet'}${fs.includes('offer') ? ', some waiting on a grower decision' : ''}${fs.includes('lapsed') ? ', some refunded' : ''}. Refunds reach you by ${dateOf(DAY.refund)}.`]);
    });
    setSetting('market', 'closed'); setSetting('closed_day', d);
  });
}

export function decide(fieldId, accept, note) {
  const d = today(), f = fieldRow(fieldId);
  if (!f || f.status !== 'offer') throw new UserError('No smaller contract is waiting on this field.');
  if (accept) run("UPDATE fields SET status = 'ahead', acres_contracted = offer_acres, decision = 'accepted', decision_note = ? WHERE id = ?", note, f.id);
  else run("UPDATE fields SET status = 'lapsed', decision = 'declined', decision_note = ? WHERE id = ?", note, f.id);
  realInvestors(f.id).forEach((u) => notify(u, d, 'close', [`${f.grower} ${accept ? 'accepted a smaller contract' : 'declined the smaller contract'}`, accept ? `Part of your money on this field is kept; the rest is refunded by ${dateOf(DAY.refund)}.` : `Your money on this field is refunded in full by ${dateOf(DAY.refund)}.`]));
}

export function finalize() {
  const d = today();
  if (setting('market') !== 'closed') throw new UserError('Close the market first.');
  const pending = fieldRows().filter((f) => f.status === 'offer');
  if (pending.length) throw new UserError(`${pending.length} grower decision(s) on a smaller contract are still open.`);
  const treasury = get("SELECT id FROM users WHERE role = 'treasury'");
  tx(() => {
    const fields = Object.fromEntries(fieldRows().map((f) => [f.id, f]));
    const paidBy = {};
    all("SELECT a.*, o.user_id FROM allocations a JOIN orders o ON o.id = a.order_id WHERE o.status = 'paid'").forEach((a) => { paidBy[a.field_id] = (paidBy[a.field_id] || 0) + a.amount; });
    all("SELECT * FROM orders WHERE status = 'paid'").forEach((o) => {
      let kept = 0, refunded = 0;
      all('SELECT * FROM allocations WHERE order_id = ?', o.id).forEach((a) => {
        const f = fields[a.field_id];
        let share = 0;
        if (f.status === 'ahead') { const CT = contractTarget(f); share = paidBy[f.id] > CT ? CT / paidBy[f.id] : 1; }
        const pat = floorPat(a.amount * share), k = pat * RS, refund = a.amount - k;
        run('UPDATE allocations SET kept = ?, pat = ?, refund = ? WHERE order_id = ? AND field_id = ?', k, pat, refund, o.id, a.field_id);
        if (refund > 0.5) run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('refund', ?, ?, ?, ?, ?, ?)", -refund, o.user_id, a.field_id, o.id, DAY.refund,
          f.status === 'ahead' ? 'Smaller contract · part refund' : 'Field stayed under 80% · full refund');
        kept += k; refunded += refund;
      });
      run('UPDATE orders SET status = ? WHERE id = ?', kept > 0 ? 'allotted' : 'refunded', o.id);
      notify(o.user_id, d, 'close', [kept > 0 ? `Allotted: ${money(kept)} of wheat` : 'Refunded in full', `${kept > 0 ? 'Growers sign their Salam contracts next and are paid on signing; your PAT are minted then. ' : ''}${refunded > 0.5 ? money(refunded) + ' refunded by ' + dateOf(DAY.refund) + '.' : ''}`]);
    });
    // Barak treasury buys whatever share of a contract investors did not, so every grower is paid in full.
    Object.values(fields).filter((f) => f.status === 'ahead').forEach((f) => {
      const invPat = get('SELECT COALESCE(SUM(a.pat),0) AS v FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.status = ?', f.id, 'allotted').v;
      const tPat = Math.round(f.acres_contracted * K.ACRE_KG - invPat);
      if (tPat > 0) {
        const id = 'ORD-' + nextSeq('order');
        run("INSERT INTO orders (id, user_id, kind, amount, status, reserved_day, paid_day, method, pay_ref) VALUES (?, ?, 'treasury', ?, 'allotted', ?, ?, 'treasury', 'Treasury top-up')", id, treasury.id, tPat * RS, d, d);
        run('INSERT INTO allocations (order_id, field_id, amount, kept, pat, refund) VALUES (?, ?, ?, ?, ?, 0)', id, f.id, tPat * RS, tPat * RS, tPat);
        run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('treasury', ?, ?, ?, ?, ?, 'Barak treasury takes the unfunded share')", tPat * RS, treasury.id, f.id, id, d);
      }
      run("UPDATE fields SET status = 'contracted' WHERE id = ?", f.id);
      notify(f.grower_id, d, 'contract', ['Sign your Salam contract', `Your advance of ${money(f.acres_contracted * PR.owedMdPerAcre * PR.price)} is paid on the day you sign. Sign in the app or with your field officer.`], ['اپنے سلم معاہدے پر دستخط کریں', `دستخط کے دن ہی ${money(f.acres_contracted * PR.owedMdPerAcre * PR.price)} کی ادائیگی ہو گی۔ ایپ میں یا فیلڈ افسر کے ساتھ دستخط کریں۔`]);
    });
    setSetting('market', 'finalized');
  });
}

// A Salam contract is made when it is signed and the full price paid, so signing comes first and payment the same day.
export function sign(fieldId, method) {
  const d = today(), f = fieldRow(fieldId);
  if (!f || f.status !== 'contracted') throw new UserError('There is no contract waiting for a signature.');
  if (f.signed_day != null) return;
  run('UPDATE fields SET signed_day = ?, sign_method = ? WHERE id = ?', d, method, f.id);
}

function token(type, fieldId, from, to, pat, d, memo) {
  const prev = get('SELECT hash FROM tokens ORDER BY seq DESC LIMIT 1');
  const prevHash = prev ? prev.hash : '0'.repeat(64);
  const hash = sha(JSON.stringify({ prevHash, type, fieldId, from, to, pat, d, memo }));
  run('INSERT INTO tokens (type, field_id, from_user, to_user, pat, day, memo, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', type, fieldId, from, to, pat, d, memo, prevHash, hash);
}

export function release() {
  const d = today(), m = setting('market');
  if (m !== 'finalized') throw new UserError(m === 'released' ? 'Every contract has been paid.' : 'Finalize the close first.');
  const ready = fieldRows().filter((f) => f.status === 'contracted' && f.signed_day != null);
  if (!ready.length) throw new UserError('No signed contracts are waiting for payment. Growers sign in the app, or record a field-officer signature.');
  tx(() => {
    ready.forEach((f) => {
      const advance = f.acres_contracted * PR.owedMdPerAcre * PR.price;
      const allocs = all("SELECT a.*, o.user_id, o.id AS oid FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.status IN ('allotted','tokens') AND a.pat > 0", f.id);
      const kept = sum(allocs, (a) => a.kept);
      run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('release', ?, ?, ?, ?, ?)", -advance, f.grower_id, f.id, d, `Price paid to grower on signing · ${payoutLabel(f)}`);
      run("INSERT INTO cash (type, amount, field_id, day, memo) VALUES ('fee', ?, ?, ?, 'Barak arrangement fee 2.5%')", -(kept - advance), f.id, d);
      const by = {}; allocs.forEach((a) => { by[a.user_id] = (by[a.user_id] || 0) + a.pat; });
      Object.entries(by).forEach(([u, pat]) => token('mint', f.id, null, Number(u), pat, d, 'Minted and locked · backed by a signed, paid Salam contract'));
      run("UPDATE fields SET status = 'paid', paid_day = ? WHERE id = ?", d, f.id);
      notify(f.grower_id, d, 'money', [`Payment sent: ${money(advance)}`, `To ${payoutLabel(f)}. Please confirm when it arrives. Sow by ${dateOf(DAY.sowBy, 'en', true)}.`], [`ادائیگی بھیج دی گئی: ${money(advance)}`, `${payoutLabel(f)} میں۔ رقم ملنے پر تصدیق کریں۔ ${dateOf(DAY.sowBy, 'ur', true)} تک بوائی کریں۔`]);
      Object.keys(by).forEach((u) => notify(Number(u), d, 'token', [`${f.grower} signed and was paid`, `${by[u].toLocaleString('en-IN')} PAT minted to you, locked until the wheat is delivered in April.`]));
    });
    if (!fieldRows().some((f) => f.status === 'contracted')) {
      run("UPDATE orders SET status = 'tokens' WHERE status = 'allotted'");
      setSetting('market', 'released'); setSetting('released_day', d);
    }
  });
}

// ── holdings ──
export function balances(userId) {
  const rows = all('SELECT field_id, SUM(CASE WHEN to_user = ? THEN pat ELSE 0 END) - SUM(CASE WHEN from_user = ? THEN pat ELSE 0 END) AS pat FROM tokens WHERE to_user = ? OR from_user = ? GROUP BY field_id', userId, userId, userId, userId);
  return rows.filter((r) => r.pat > 0).map((r) => { const f = fieldRow(r.field_id); return { field: r.field_id, pat: r.pat, locked: LOCKED.includes(f.status), status: f.status }; });
}
export function holdersOf(fieldId) {
  return all('SELECT u AS user_id, SUM(p) AS pat FROM (SELECT to_user AS u, pat AS p FROM tokens WHERE field_id = ? AND to_user IS NOT NULL UNION ALL SELECT from_user AS u, -pat AS p FROM tokens WHERE field_id = ? AND from_user IS NOT NULL) GROUP BY u HAVING SUM(p) > 0', fieldId, fieldId);
}

// Warehouse intake, one lot at a time. A lot below specification is recorded as rejected and can be redelivered.
export function recordDelivery(fieldId, kg, moisture, grade, extra = {}) {
  const d = today(), f = fieldRow(fieldId);
  if (!f || !['paid', 'short'].includes(f.status)) throw new UserError('This field is not waiting on a delivery.');
  kg = Math.round(Number(kg)); moisture = Number(moisture);
  if (!(kg > 0)) throw new UserError('Enter the weighed kg.');
  const owed = Math.round(f.acres_contracted * K.ACRE_KG);
  return tx(() => {
    if (moisture > 10 || grade !== 'Grade 1') {
      run("INSERT INTO deliveries (field_id, kg, moisture, grade, ewr, day, vehicle, slip, bags, foreign_matter) VALUES (?, ?, ?, 'Rejected', NULL, ?, ?, ?, ?, ?)", fieldId, kg, moisture, d, extra.vehicle || null, extra.slip || null, extra.bags || null, extra.foreign || null);
      notify(f.grower_id, d, 'delivery', ['Lot not accepted', `Moisture ${moisture}% or grade did not meet the specification. Dry or clean it and bring it back; you can ask for a re-test within 48 hours.`], ['لاٹ قبول نہیں ہوا', `نمی ${moisture}٪ یا معیار پورا نہیں تھا۔ خشک یا صاف کر کے دوبارہ لائیں؛ 48 گھنٹے میں دوبارہ جانچ کروا سکتے ہیں۔`]);
      return { rejected: true };
    }
    const before = deliveredKg(fieldId), accepted = Math.min(kg, owed - before);
    const ewr = 'WH-' + nextSeq('ewr');
    run('INSERT INTO deliveries (field_id, kg, moisture, grade, ewr, day, vehicle, slip, bags, foreign_matter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', fieldId, accepted, moisture, grade, ewr, d, extra.vehicle || null, extra.slip || null, extra.bags || null, extra.foreign || null);
    const total = before + accepted;
    if (total >= owed) {
      token('unlock', fieldId, null, null, owed, d, `Delivered in full · ${ewr} · moisture ${moisture}% · ${grade}`);
      run("UPDATE fields SET status = 'delivered', shortfall_kg = 0, resolution = COALESCE(resolution, 'full') WHERE id = ?", fieldId);
      notify(f.grower_id, d, 'delivery', ['Delivered in full. Thank you', `Receipt ${ewr}: ${accepted.toLocaleString('en-IN')} kg, moisture ${moisture}%. Your contract is complete.`], ['مکمل ترسیل۔ شکریہ', `رسید ${ewr}: ${accepted.toLocaleString('en-IN')} کلو، نمی ${moisture}٪۔ آپ کا معاہدہ مکمل۔`]);
      holdersOf(fieldId).forEach((h) => notify(h.user_id, d, 'token', [`${f.grower} delivered in full`, `Your ${h.pat.toLocaleString('en-IN')} PAT are unlocked and backed by graded wheat in the certified warehouse (${ewr}).`]));
    } else {
      run("UPDATE fields SET status = 'short', shortfall_kg = ? WHERE id = ?", owed - total, fieldId);
      notify(f.grower_id, d, 'delivery', ['Part delivered', `Receipt ${ewr}: ${accepted.toLocaleString('en-IN')} kg. ${(owed - total).toLocaleString('en-IN')} kg still due. You may deliver wheat of the same grade from another source.`], ['جزوی ترسیل', `رسید ${ewr}: ${accepted.toLocaleString('en-IN')} کلو۔ ${(owed - total).toLocaleString('en-IN')} کلو باقی ہے۔ آپ کسی دوسرے ذریعے سے اسی معیار کی گندم دے سکتے ہیں۔`]);
      holdersOf(fieldId).forEach((h) => notify(h.user_id, d, 'token', [`${f.grower} delivered part of the wheat`, `${Math.round((owed - total) / owed * 100)}% of this field's wheat is still due, so part of your ${h.pat.toLocaleString('en-IN')} PAT. Barak, as your agent, will extend the delivery or recover the price for the missing wheat with no profit added.`]));
    }
    return { ewr, accepted, total, owed };
  });
}

// Shortfall, as the Master Salam Agreement sets it out: extend delivery (up to 30 days) or the grower refunds the price
// of the undelivered wheat, with no profit added. Barak returns its own 2.5% fee on that quantity.
export function resolveShortfall(fieldId, action) {
  const d = today(), f = fieldRow(fieldId);
  if (!f || f.status !== 'short') throw new UserError('This field has no shortfall to resolve.');
  if (action === 'extend') {
    if (f.extension_until) throw new UserError('Delivery has already been extended once. Recover the price instead.');
    run('UPDATE fields SET extension_until = ? WHERE id = ?', Math.max(d, DAY.deliverBy) + 30, f.id);
    notify(f.grower_id, d, 'delivery', ['Delivery extended by 30 days', `Deliver the remaining ${f.shortfall_kg.toLocaleString('en-IN')} kg by ${dateOf(Math.max(d, DAY.deliverBy) + 30)}. A late-delivery amount, if any, goes to charity, never to Barak or investors.`], ['ترسیل کی مدت 30 دن بڑھا دی گئی', `باقی ${f.shortfall_kg.toLocaleString('en-IN')} کلو ${dateOf(Math.max(d, DAY.deliverBy) + 30, 'ur')} تک دیں۔`]);
    return;
  }
  if (action !== 'refund') throw new UserError('Choose extend or refund.');
  tx(() => {
    const gap = Math.round(f.shortfall_kg), hs = holdersOf(f.id), tot = sum(hs, (h) => h.pat);
    run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('grower_refund', ?, ?, ?, ?, 'Grower refunds the price of undelivered wheat, no profit added')", gap * PR.kg, f.grower_id, f.id, d);
    run("INSERT INTO cash (type, amount, field_id, day, memo) VALUES ('fee_return', ?, ?, ?, 'Barak returns its 2.5% fee on undelivered wheat')", gap * (RS - PR.kg), f.id, d);
    let left = gap;
    hs.forEach((h, i) => {
      const b = i === hs.length - 1 ? left : Math.round(gap * h.pat / tot); left -= b;
      if (b > 0) {
        token('shortfall', f.id, h.user_id, null, b, d, 'Undelivered wheat: price refunded, PAT cancelled');
        run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('refund', ?, ?, ?, ?, 'Price of undelivered wheat refunded, plus Barak fee returned')", -b * RS, h.user_id, f.id, d);
        notify(h.user_id, d, 'money', [`Refund for undelivered wheat: ${money(b * RS)}`, `${b.toLocaleString('en-IN')} PAT from ${f.grower} cancelled and paid back at what you paid. The rest of this holding is unlocked.`]);
      }
    });
    token('unlock', f.id, null, null, deliveredKg(f.id), d, 'Delivered wheat in the warehouse; shortfall settled by refund');
    run("UPDATE fields SET status = 'delivered', resolution = 'refund' WHERE id = ?", f.id);
    notify(f.grower_id, d, 'money', ['Shortfall settled', `Refund of ${money(gap * PR.kg)} for ${gap.toLocaleString('en-IN')} kg not delivered. Nothing more is owed. No interest or penalty is added.`], ['کمی کا تصفیہ', `${gap.toLocaleString('en-IN')} کلو کی کمی پر ${money(gap * PR.kg)} واپس۔ مزید کچھ واجب نہیں، کوئی سود یا جرمانہ نہیں۔`]);
  });
}

export function elect(user, win, filer) {
  const d = today();
  if (!['apr', 'sep'].includes(win)) throw new UserError('Pick April or September.');
  if (d > DAY.electBy) throw new UserError('The sale choice closed on ' + dateOf(DAY.electBy) + '.');
  const pat = sum(balances(user.id), (b) => b.pat);
  if (win === 'sep' && pat < PR.minSep) throw new UserError(`A September sale needs at least ${PR.minSep} PAT. You hold ${pat}.`);
  run('INSERT INTO elections (user_id, win, filer, day) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET win = excluded.win, filer = excluded.filer, day = excluded.day', user.id, win, filer ? 1 : 0, d);
  run('UPDATE users SET filer = ? WHERE id = ?', filer ? 1 : 0, user.id);
}

function sellFor(u, win, px, d, label) {
  const el = get('SELECT * FROM elections WHERE user_id = ?', u.id);
  const bs = balances(u.id).filter((b) => !b.locked); const pat = sum(bs, (b) => b.pat); if (!pat) return null;
  let s;
  if (win === 'early') {
    // Storage is charged for the months actually stored, after delivery.
    const share = Math.max(0, Math.min(1, (d - DAY.deliverBy) / (DAY.settle - DAY.deliverBy)));
    s = sale(pat, 'apr', px, !!(el ? el.filer : u.filer)); s.storage = s.md * PR.carry * share; s.net -= s.storage;
  } else s = sale(pat, win, px, u.role === 'treasury' ? true : !!(el ? el.filer : u.filer));
  bs.forEach((b) => token('burn', b.field, u.id, null, b.pat, d, `Burned · ${label} at Rs ${px.toLocaleString('en-IN')} / 40 kg`));
  run('INSERT INTO payouts (user_id, win, pat, price, gross, fee, storage, tax, net, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', u.id, win, pat, px, s.gross, s.fee, s.storage, s.tax, s.net, d);
  run("INSERT INTO cash (type, amount, user_id, day, memo) VALUES ('payout', ?, ?, ?, ?)", s.net, u.id, d, `${label} proceeds, net of fee, storage and tax`);
  notify(u.id, d, 'money', [`Paid out: ${money(s.net)}`, `${pat.toLocaleString('en-IN')} PAT sold (${label}) at Rs ${px.toLocaleString('en-IN')} per 40 kg. Your statement is ready.`]);
  return s;
}

export function runSale(win, price) {
  const d = today(), px = Math.round(Number(price) || priceAt(d));
  if (setting('sale_' + win)) throw new UserError('The ' + (win === 'apr' ? 'April' : 'September') + ' sale has already run.');
  if (win === 'apr' && d < DAY.deliverBy - 30) throw new UserError('The April sale runs after deliveries. Move the clock to April.');
  if (win === 'sep' && !setting('sale_apr')) throw new UserError('Run the April sale first.');
  if (win === 'sep' && d < DAY.settle - 14) throw new UserError('The September sale runs in September. Move the clock forward.');
  const open = fieldRows().filter((f) => f.status === 'paid' || f.status === 'short');
  if (open.length) throw new UserError(`${open.length} field(s) still owe wheat. Record their deliveries or settle the shortfall first.`);
  tx(() => {
    all("SELECT DISTINCT to_user AS id FROM tokens WHERE to_user IS NOT NULL").map((r) => get('SELECT * FROM users WHERE id = ?', r.id)).forEach((u) => {
      const el = get('SELECT * FROM elections WHERE user_id = ?', u.id), w = el ? el.win : 'apr';
      if (w !== win && win !== 'sep') return;
      sellFor(u, win, px, d, win === 'apr' ? 'April sale' : 'September sale');
    });
    fieldRows().forEach((f) => { if (f.status === 'delivered' && !holdersOf(f.id).length) run("UPDATE fields SET status = 'settled' WHERE id = ?", f.id); });
    setSetting('sale_' + win, { day: d, price: px });
  });
}

// Early exit: once wheat is in the warehouse the holder owns it and may sell at any time; Barak sells as agent at today's price.
export function sellNow(user) {
  const d = today();
  if (!balances(user.id).some((b) => !b.locked)) throw new UserError('Nothing to sell yet. PAT can be sold once the wheat is in the warehouse.');
  let out;
  tx(() => { out = sellFor(user, 'early', priceAt(d), d, 'Early sale'); fieldRows().forEach((f) => { if (f.status === 'delivered' && !holdersOf(f.id).length) run("UPDATE fields SET status = 'settled' WHERE id = ?", f.id); }); });
  return out;
}

export function transfer(user, toPhone, fieldId, pat) {
  const d = today(); pat = Math.floor(Number(pat));
  const to = get("SELECT * FROM users WHERE phone = ? AND role = 'investor' AND bot = 0", String(toPhone || '').replace(/\D/g, ''));
  if (!to) throw new UserError('No verified investor with that phone number.');
  if (to.id === user.id) throw new UserError('You cannot transfer to yourself.');
  if (!to.cnic_ok || !to.bank_ok) throw new UserError('The recipient has not finished verification.');
  const b = balances(user.id).find((x) => x.field === fieldId);
  if (!b) throw new UserError('You hold no PAT from that field.');
  // Salam goods cannot be resold before delivery (AAOIFI Shariah Standard 10), so PAT stay locked until the warehouse receipt.
  if (b.locked) throw new UserError('These PAT are locked until the wheat is in the warehouse. Salam wheat cannot be resold before delivery.');
  if (!(pat > 0) || pat > b.pat) throw new UserError('You hold ' + b.pat + ' PAT from that field.');
  token('transfer', fieldId, user.id, to.id, pat, d, 'Holder to holder · KYC checked');
  notify(to.id, d, 'token', [`${pat.toLocaleString('en-IN')} PAT received`, `From ${user.name}. Backed by wheat in the certified warehouse.`]);
}

export function addReport(user, f, type, text) {
  run('INSERT INTO reports (field_id, user_id, type, text, day) VALUES (?, ?, ?, ?, ?)', f.id, user.id, type, String(text || '').slice(0, 1000), today());
}

// Right of first offer on the grower's surplus, at the prevailing market price (Master Salam Agreement 7.2).
export function offerSurplus(f, md) {
  const d = today(); md = Math.round(Number(md));
  if (!['delivered', 'settled'].includes(f.status)) throw new UserError('You can offer extra wheat once your contract is delivered.');
  if (!(md > 0 && md <= 2000)) throw new UserError('Enter the maunds you want to sell.');
  if (get("SELECT 1 AS x FROM surplus WHERE field_id = ? AND status = 'offered'", f.id)) throw new UserError('Your last offer is still being considered.');
  run('INSERT INTO surplus (field_id, md, price, day) VALUES (?, ?, ?, ?)', f.id, md, mandiPrice(d), d);
}
const mandiPrice = (d) => priceAt(d) - 35;
export function decideSurplus(id, buy) {
  const d = today(), s = get('SELECT * FROM surplus WHERE id = ?', id);
  if (!s || s.status !== 'offered') throw new UserError('That offer is no longer open.');
  const f = fieldRow(s.field_id), px = mandiPrice(d);
  run('UPDATE surplus SET status = ?, price = ?, decided_day = ? WHERE id = ?', buy ? 'bought' : 'passed', px, d, id);
  if (buy) {
    run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('surplus', ?, ?, ?, ?, 'Barak bought surplus wheat at the market price (own account)')", -s.md * px, f.grower_id, f.id, d);
    notify(f.grower_id, d, 'money', [`Barak will buy your ${s.md} maunds`, `At Rs ${px.toLocaleString('en-IN')} a maund, today's market price: ${money(s.md * px)}. Bring it to the warehouse this week; paid on intake.`], [`بارک آپ کی ${s.md} من گندم خریدے گا`, `آج کی منڈی قیمت Rs ${px.toLocaleString('en-IN')} فی من: ${money(s.md * px)}۔ اس ہفتے گودام لائیں، وصولی پر ادائیگی۔`]);
  } else notify(f.grower_id, d, 'money', ['Surplus offer passed', 'Barak will not buy this lot. You are free to sell it anywhere.'], ['اضافی گندم کی پیشکش', 'بارک یہ گندم نہیں خریدے گا۔ آپ کہیں بھی بیچ سکتے ہیں۔']);
}
