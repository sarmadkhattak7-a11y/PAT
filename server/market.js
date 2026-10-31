import { db, get, all, run, tx, setting, setSetting, today, nextSeq, sha } from './db.js';
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

export function userExposure(userId, d) {
  const rows = all('SELECT * FROM orders WHERE user_id = ?', userId);
  return sum(rows.filter((o) => o.status === 'paid' || o.status === 'allotted' || o.status === 'tokens' || holdLive(o, d)), (o) => o.amount);
}

export function reserve(user, spec) {
  const d = today();
  if (setting('market') !== 'open' || d >= DAY.close) throw new UserError('The market for this season has closed.');
  if (d < DAY.open) throw new UserError('The market has not opened yet.');
  if (!user.cnic_ok || !user.bank_ok || !user.season_limit) throw new UserError('Finish verification first: phone, CNIC, bank account and the three questions.');
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
  });
  return get('SELECT * FROM orders WHERE id = ?', o.id);
}
export function cancel(user, orderId) {
  const o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', orderId, user.id);
  if (!o || o.status !== 'reserved') throw new UserError('Only an unpaid reservation can be cancelled.');
  run("UPDATE orders SET status = 'cancelled' WHERE id = ?", o.id);
}

// ── market close and contract formation ──
export function closeMarket() {
  const d = today();
  if (setting('market') !== 'open') throw new UserError('The market is already closed.');
  if (d < DAY.close) throw new UserError('The market closes on ' + dateOf(DAY.close) + '. Move the clock forward to close it.');
  tx(() => {
    run("UPDATE orders SET status = 'lapsed' WHERE status = 'reserved'");
    fieldRows().forEach((f) => {
      const paid = fundingFor(f.id, d).paid, frac = paid / target(f);
      if (frac >= K.PASS) run("UPDATE fields SET status = 'ahead' WHERE id = ?", f.id);
      else if (frac >= K.SMALLER_MIN) {
        const offer = Math.max(1, Math.floor(paid / (K.ACRE_KG * RS) / K.PASS));
        run("UPDATE fields SET status = 'offer', offer_acres = ? WHERE id = ?", Math.min(offer, f.acres_listed - 1), f.id);
      } else run("UPDATE fields SET status = 'lapsed' WHERE id = ?", f.id);
    });
    setSetting('market', 'closed'); setSetting('closed_day', d);
  });
}

export function decide(fieldId, accept, note, by) {
  const f = fieldRow(fieldId);
  if (!f || f.status !== 'offer') throw new UserError('No smaller contract is waiting on this field.');
  if (accept) run("UPDATE fields SET status = 'ahead', acres_contracted = offer_acres, decision = 'accepted', decision_note = ? WHERE id = ?", note || by, f.id);
  else run("UPDATE fields SET status = 'lapsed', decision = 'declined', decision_note = ? WHERE id = ?", note || by, f.id);
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
    const orders = all("SELECT * FROM orders WHERE status = 'paid'");
    orders.forEach((o) => {
      let kept = 0;
      all('SELECT * FROM allocations WHERE order_id = ?', o.id).forEach((a) => {
        const f = fields[a.field_id];
        let share = 0;
        if (f.status === 'ahead') { const CT = contractTarget(f); share = paidBy[f.id] > CT ? CT / paidBy[f.id] : 1; }
        const pat = floorPat(a.amount * share), k = pat * RS, refund = a.amount - k;
        run('UPDATE allocations SET kept = ?, pat = ?, refund = ? WHERE order_id = ? AND field_id = ?', k, pat, refund, o.id, a.field_id);
        if (refund > 0.5) run("INSERT INTO cash (type, amount, user_id, field_id, order_id, day, memo) VALUES ('refund', ?, ?, ?, ?, ?, ?)", -refund, o.user_id, a.field_id, o.id, DAY.refund,
          f.status === 'ahead' ? 'Smaller contract · part refund' : 'Field stayed under 80% · full refund');
        kept += k;
      });
      run('UPDATE orders SET status = ? WHERE id = ?', kept > 0 ? 'allotted' : 'refunded', o.id);
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
    });
    setSetting('market', 'finalized');
  });
}

function token(type, fieldId, from, to, pat, d, memo) {
  const prev = get('SELECT hash FROM tokens ORDER BY seq DESC LIMIT 1');
  const prevHash = prev ? prev.hash : '0'.repeat(64);
  const hash = sha(JSON.stringify({ prevHash, type, fieldId, from, to, pat, d, memo }));
  run('INSERT INTO tokens (type, field_id, from_user, to_user, pat, day, memo, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', type, fieldId, from, to, pat, d, memo, prevHash, hash);
}

export function release() {
  const d = today();
  if (setting('market') !== 'finalized') throw new UserError('Finalize the close first.');
  tx(() => {
    fieldRows().filter((f) => f.status === 'contracted').forEach((f) => {
      const advance = f.acres_contracted * PR.owedMdPerAcre * PR.price;
      const allocs = all("SELECT a.*, o.user_id, o.id AS oid FROM allocations a JOIN orders o ON o.id = a.order_id WHERE a.field_id = ? AND o.status = 'allotted' AND a.pat > 0", f.id);
      const kept = sum(allocs, (a) => a.kept);
      run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('release', ?, ?, ?, ?, 'Advance to grower · Salam contract signed')", -advance, f.grower_id, f.id, d);
      run("INSERT INTO cash (type, amount, field_id, day, memo) VALUES ('fee', ?, ?, ?, 'Barak minting fee 2.5%')", -(kept - advance), f.id, d);
      const by = {}; allocs.forEach((a) => { by[a.user_id] = (by[a.user_id] || 0) + a.pat; });
      Object.entries(by).forEach(([u, pat]) => token('mint', f.id, null, Number(u), pat, d, 'Minted and locked · backed by Salam contract'));
      run("UPDATE fields SET status = 'paid' WHERE id = ?", f.id);
    });
    run("UPDATE orders SET status = 'tokens' WHERE status = 'allotted'");
    setSetting('market', 'released'); setSetting('released_day', d);
  });
}

// ── holdings ──
export function balances(userId) {
  const rows = all('SELECT field_id, SUM(CASE WHEN to_user = ? THEN pat ELSE 0 END) - SUM(CASE WHEN from_user = ? THEN pat ELSE 0 END) AS pat FROM tokens WHERE to_user = ? OR from_user = ? GROUP BY field_id', userId, userId, userId, userId);
  return rows.filter((r) => r.pat > 0).map((r) => { const f = fieldRow(r.field_id); return { field: r.field_id, pat: r.pat, locked: !['delivered', 'settled'].includes(f.status), status: f.status }; });
}
export function holdersOf(fieldId) {
  return all('SELECT u AS user_id, SUM(p) AS pat FROM (SELECT to_user AS u, pat AS p FROM tokens WHERE field_id = ? AND to_user IS NOT NULL UNION ALL SELECT from_user AS u, -pat AS p FROM tokens WHERE field_id = ? AND from_user IS NOT NULL) GROUP BY u HAVING SUM(p) > 0', fieldId, fieldId);
}

export function recordDelivery(fieldId, kg, moisture, grade) {
  const d = today(), f = fieldRow(fieldId);
  if (!f || f.status !== 'paid') throw new UserError('This field is not waiting on a delivery.');
  kg = Math.round(Number(kg)); moisture = Number(moisture);
  if (!(kg > 0)) throw new UserError('Enter the weighed kg.');
  if (moisture > 10 || grade !== 'Grade 1') throw new UserError('Only Grade 1 wheat at 10% moisture or less is accepted into the warehouse. Record a re-test instead.');
  const owed = Math.round(f.acres_contracted * K.ACRE_KG), accepted = Math.min(kg, owed);
  tx(() => {
    const ewr = 'WH-' + nextSeq('ewr');
    run('INSERT INTO deliveries (field_id, kg, moisture, grade, ewr, day) VALUES (?, ?, ?, ?, ?, ?)', fieldId, accepted, moisture, grade, ewr, d);
    if (accepted < owed) {
      // Shortfall: burned pro rata against the crop insurance claim; holders get the insured value in PKR.
      const gap = owed - accepted, hs = holdersOf(fieldId), tot = sum(hs, (h) => h.pat);
      let left = gap;
      hs.forEach((h, i) => {
        const b = i === hs.length - 1 ? left : Math.round(gap * h.pat / tot); left -= b;
        if (b > 0) { token('shortfall', fieldId, h.user_id, null, b, d, 'Shortfall burned against insurance'); run("INSERT INTO cash (type, amount, user_id, field_id, day, memo) VALUES ('insurance', ?, ?, ?, ?, 'Insurance on shortfall, at cost')", b * RS, h.user_id, fieldId, d); }
      });
    }
    token('unlock', fieldId, null, null, accepted, d, 'Delivered · EWR ' + ewr + ' · moisture ' + moisture + '% · ' + grade);
    run("UPDATE fields SET status = 'delivered' WHERE id = ?", fieldId);
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

export function runSale(win, price) {
  const d = today(), px = Math.round(Number(price) || priceAt(d));
  if (setting('sale_' + win)) throw new UserError('The ' + (win === 'apr' ? 'April' : 'September') + ' sale has already run.');
  if (win === 'apr' && d < DAY.deliverBy - 30) throw new UserError('The April sale runs after deliveries. Move the clock to April.');
  if (win === 'sep' && !setting('sale_apr')) throw new UserError('Run the April sale first.');
  if (win === 'sep' && d < DAY.settle - 14) throw new UserError('The September sale runs in September. Move the clock forward.');
  const undelivered = fieldRows().filter((f) => f.status === 'paid');
  if (undelivered.length) throw new UserError(`${undelivered.length} field(s) have not delivered yet. Record their deliveries first.`);
  tx(() => {
    const users = all("SELECT DISTINCT to_user AS id FROM tokens WHERE to_user IS NOT NULL").map((r) => get('SELECT * FROM users WHERE id = ?', r.id));
    users.forEach((u) => {
      const el = get('SELECT * FROM elections WHERE user_id = ?', u.id), w = el ? el.win : 'apr';
      if (w !== win && win !== 'sep') return;
      const bs = balances(u.id).filter((b) => !b.locked); const pat = sum(bs, (b) => b.pat); if (!pat) return;
      const s = sale(pat, win, px, u.role === 'treasury' ? true : !!(el ? el.filer : u.filer));
      bs.forEach((b) => token('burn', b.field, u.id, null, b.pat, d, `Burned · ${win === 'apr' ? 'April' : 'September'} sale at Rs ${px.toLocaleString('en-IN')} / 40 kg`));
      run('INSERT INTO payouts (user_id, win, pat, price, gross, fee, storage, tax, net, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', u.id, win, pat, px, s.gross, s.fee, s.storage, s.tax, s.net, d);
      run("INSERT INTO cash (type, amount, user_id, day, memo) VALUES ('payout', ?, ?, ?, ?)", s.net, u.id, d, (win === 'apr' ? 'April' : 'September') + ' sale proceeds, net of fee, storage and tax');
    });
    fieldRows().forEach((f) => { if (f.status === 'delivered' && !holdersOf(f.id).length) run("UPDATE fields SET status = 'settled' WHERE id = ?", f.id); });
    setSetting('sale_' + win, { day: d, price: px });
  });
}

export function transfer(user, toPhone, fieldId, pat) {
  const d = today(); pat = Math.floor(Number(pat));
  const to = get("SELECT * FROM users WHERE phone = ? AND role = 'investor' AND bot = 0", String(toPhone || '').replace(/\D/g, ''));
  if (!to) throw new UserError('No verified investor with that phone number.');
  if (to.id === user.id) throw new UserError('You cannot transfer to yourself.');
  if (!to.cnic_ok || !to.bank_ok) throw new UserError('The recipient has not finished verification.');
  const b = balances(user.id).find((x) => x.field === fieldId);
  if (!b) throw new UserError('You hold no PAT from that field.');
  if (b.locked) throw new UserError('These PAT are locked until the wheat is in the warehouse.');
  if (!(pat > 0) || pat > b.pat) throw new UserError('You hold ' + b.pat + ' PAT from that field.');
  token('transfer', fieldId, user.id, to.id, pat, d, 'Holder to holder · KYC checked');
}

export function addReport(user, f, type, text) {
  run('INSERT INTO reports (field_id, user_id, type, text, day) VALUES (?, ?, ?, ?, ?)', f.id, user.id, type, String(text || '').slice(0, 1000), today());
}
