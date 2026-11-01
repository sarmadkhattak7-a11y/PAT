// Every API route, shared by the Express server (server/index.js) and the in-browser build (client/src/local/api.js).
// A handler gets ctx = { body, params, user, login(userId), logout() } and returns JSON-able data.
import { seed, get, run, setting, setSetting, today } from './db.js';
import { K, DAY, dayOfDate } from './domain.js';
import * as M from './market.js';
import * as V from './views.js';
import { pilot, setKv } from './pilot.js';
import { advance } from './sandbox.js';

const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^92/, '0');
const me = (ctx) => get('SELECT * FROM users WHERE id = ?', ctx.user.id);
const E = (m) => new M.UserError(m);

export const routes = [];
const r = (method, path, roles, fn) => routes.push({ method, path, roles, fn, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });

// ── auth ──
r('POST', '/api/auth/otp', null, ({ body }) => {
  const phone = normPhone(body.phone);
  if (!/^03\d{9}$/.test(phone)) throw E('Enter a Pakistani mobile number, like 0300 1234567.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  run('INSERT INTO otps (phone, code, expires) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires = excluded.expires', phone, code, Date.now() + 10 * 60e3);
  const u = get('SELECT role FROM users WHERE phone = ?', phone);
  // Sandbox: no SMS gateway is connected, so the code is returned to the screen.
  return { sent: true, sandboxCode: code, existing: !!u, role: u ? u.role : 'investor' };
});
r('POST', '/api/auth/verify', null, (ctx) => {
  const phone = normPhone(ctx.body.phone), o = get('SELECT * FROM otps WHERE phone = ?', phone);
  if (!o || o.code !== String(ctx.body.code || '').trim() || o.expires < Date.now()) throw E('That code is wrong or has expired.');
  run('DELETE FROM otps WHERE phone = ?', phone);
  let u = get('SELECT * FROM users WHERE phone = ?', phone);
  if (!u) {
    const name = String(ctx.body.name || '').trim().slice(0, 80);
    if (!name) throw E('Enter your name as it appears on your CNIC.');
    run("INSERT INTO users (role, phone, name, created_day) VALUES ('investor', ?, ?, ?)", phone, name, today());
    u = get('SELECT * FROM users WHERE phone = ?', phone);
  }
  ctx.login(u.id);
  return { user: V.publicUser(u) };
});
r('POST', '/api/auth/logout', null, (ctx) => ctx.logout());

// ── shared ──
r('GET', '/api/state', null, (ctx) => ({ clock: V.clock(), user: V.publicUser(ctx.user ? me(ctx) : null), pricing: V.pricing() }));
r('GET', '/api/market', null, (ctx) => V.market(ctx.user ? me(ctx) : null));
r('GET', '/api/fields/:id', null, (ctx) => {
  const f = M.fieldRow(ctx.params.id); if (!f) throw new M.UserError('Field not found', 404);
  return { listing: M.listing(f, today(), ctx.user ? ctx.user.id : -1), crop: V.crop().fields.find((x) => x.id === f.id) };
});
r('POST', '/api/quote', null, (ctx) => M.quote(ctx.body, today(), ctx.user ? ctx.user.id : -1));
r('GET', '/api/inbox', ['investor', 'grower', 'ops'], (ctx) => V.inbox(ctx.user));
r('POST', '/api/inbox/read', ['investor', 'grower', 'ops'], (ctx) => { run('UPDATE notifications SET read = 1 WHERE user_id = ? AND day <= ?', ctx.user.id, today()); });
r('POST', '/api/prefs', ['investor', 'grower'], (ctx) => {
  const u = me(ctx), p = u.prefs ? JSON.parse(u.prefs) : {};
  ['reinvest', 'whatsapp', 'voice'].forEach((k) => { if (typeof ctx.body[k] === 'boolean') p[k] = ctx.body[k]; });
  run('UPDATE users SET prefs = ? WHERE id = ?', JSON.stringify(p), u.id); return { prefs: p };
});
r('POST', '/api/join', null, ({ body: b }) => {
  const phone = normPhone(b.phone);
  if (!String(b.name || '').trim()) throw E('Enter your name.');
  if (!/^03\d{9}$/.test(phone)) throw E('Enter a mobile number like 0300 1234567.');
  const acres = Number(b.acres); if (!(acres >= 1 && acres <= 500)) throw E('Enter your wheat acres.');
  run('INSERT INTO registrations (name, phone, cnic, village, acres, yield, day) VALUES (?, ?, ?, ?, ?, ?, ?)', String(b.name).slice(0, 80), phone, String(b.cnic || '').replace(/\D/g, '').slice(0, 13), String(b.village || '').slice(0, 80), acres, Number(b.yield) || null, today());
});

// ── sandbox (demo only): anyone can move the clock or reset, so every persona can be walked through the season ──
r('POST', '/api/sandbox/clock', null, ({ body }) => { advance(body.day, body.auto !== false); return V.clock(); });
r('POST', '/api/sandbox/reset', null, (ctx) => { seed(); ctx.logout(); });

// ── investor ──
const I = ['investor'];
r('POST', '/api/kyc/cnic', I, (ctx) => {
  const cnic = String(ctx.body.cnic || '').replace(/\D/g, '');
  if (cnic.length !== 13) throw E('A CNIC has 13 digits.');
  // Sandbox: NADRA Verisys is not connected; a well-formed CNIC is accepted.
  run('UPDATE users SET cnic = ?, cnic_ok = 1 WHERE id = ?', cnic, ctx.user.id);
  return { user: V.publicUser(me(ctx)) };
});
r('POST', '/api/kyc/bank', I, (ctx) => {
  const iban = String(ctx.body.iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) throw E('A Pakistani IBAN is 24 characters, starting PK, like PK36SCBL0000001123456702.');
  run('UPDATE users SET iban = ?, bank_ok = 1 WHERE id = ?', iban, ctx.user.id);
  return { user: V.publicUser(me(ctx)) };
});
r('POST', '/api/kyc/suitability', I, (ctx) => {
  const q = ctx.body.answers || {};
  if (!['lock', 'loss', 'share'].every((k) => typeof q[k] === 'boolean')) throw E('Answer all three questions.');
  const limit = !q.lock ? 0 : q.loss && q.share ? K.LIMIT : K.LIMIT_LOW;
  run('UPDATE users SET suitability = ?, season_limit = ? WHERE id = ?', JSON.stringify(q), limit, ctx.user.id);
  return { user: V.publicUser(me(ctx)) };
});
r('POST', '/api/kyc/acknowledge', I, (ctx) => {
  if (!ctx.body.kfs || !ctx.body.shariah || !ctx.body.risk) throw E('Tick all three boxes to continue.');
  run('UPDATE users SET ack_day = ? WHERE id = ?', today(), ctx.user.id); return { user: V.publicUser(me(ctx)) };
});
r('POST', '/api/orders', I, (ctx) => ({ order: M.reserve(me(ctx), ctx.body) }));
r('POST', '/api/orders/:id/withdraw', I, (ctx) => M.withdraw(me(ctx), ctx.params.id));
r('POST', '/api/sell-now', I, (ctx) => M.sellNow(me(ctx)));
r('POST', '/api/pilot/consent', I, (ctx) => { if (me(ctx).segment !== 'direct') throw E('Not available.'); setKv('token_consent', { yes: !!ctx.body.yes }, today()); });
r('POST', '/api/pilot/feedback', I, (ctx) => { if (me(ctx).segment !== 'direct') throw E('Not available.'); const n = Number(ctx.body.rating); if (!(n >= 1 && n <= 5)) throw E('Pick a rating from 1 to 5.'); setKv('feedback', { rating: n, text: String(ctx.body.text || '').slice(0, 1000) }, today()); });
r('POST', '/api/orders/:id/pay', I, (ctx) => ({ order: M.pay(me(ctx), ctx.params.id, ctx.body.method) }));
r('POST', '/api/orders/:id/cancel', I, (ctx) => M.cancel(me(ctx), ctx.params.id));
r('GET', '/api/portfolio', I, (ctx) => V.portfolio(me(ctx)));
r('POST', '/api/election', I, (ctx) => M.elect(me(ctx), ctx.body.win, ctx.body.filer !== false));
r('POST', '/api/transfer', I, (ctx) => M.transfer(me(ctx), normPhone(ctx.body.to), ctx.body.field, ctx.body.pat));

// ── grower ──
const G = ['grower'];
const myField = (ctx) => { const f = get('SELECT * FROM fields WHERE grower_id = ?', ctx.user.id); if (!f) throw E('No field is linked to this account.'); return f; };
const isDirect = (ctx) => me(ctx).segment === 'direct';
r('GET', '/api/grower', G, (ctx) => V.grower(me(ctx)));
r('POST', '/api/grower/decision', G, (ctx) => M.decide(myField(ctx).id, !!ctx.body.accept, ctx.body.accept ? 'Accepted by grower in app' : (ctx.body.reason || 'Declined by grower in app')));
r('POST', '/api/grower/delivery-day', G, (ctx) => {
  const f = myField(ctx);
  if (f.status !== 'paid') throw E('Delivery days open once your advance is paid.');
  const iso = String(ctx.body.date), d = dayOfDate(new Date(iso + 'T00:00:00Z'));
  if (isNaN(d) || d < 150 || d > DAY.deliverBy) throw E('Pick a day between 30 March and 30 April.');
  // Three trolleys a day at the warehouse, so nobody waits in a queue for hours.
  const n = get('SELECT COUNT(*) AS n FROM fields WHERE delivery_day = ? AND id != ?', iso, f.id).n;
  if (n >= 3) throw E('That day is full. Pick another day.');
  run('UPDATE fields SET delivery_day = ? WHERE id = ?', iso, f.id);
});
r('POST', '/api/grower/sign', G, (ctx) => {
  const f = myField(ctx), o = get('SELECT * FROM otps WHERE phone = ?', ctx.user.phone);
  if (!o || o.code !== String(ctx.body.code || '').trim() || o.expires < Date.now()) throw E('That code is wrong or has expired.');
  run('DELETE FROM otps WHERE phone = ?', ctx.user.phone);
  M.sign(f.id, 'In app, one-time code to ' + ctx.user.phone);
});
r('POST', '/api/grower/receipt', G, (ctx) => {
  if (isDirect(ctx)) { setKv('receipt', { yes: true }, today()); return; }
  const f = myField(ctx); if (f.paid_day == null) throw E('Your payment has not been sent yet.');
  run('UPDATE fields SET receipt_day = ? WHERE id = ?', today(), f.id);
});
r('POST', '/api/grower/payout', G, (ctx) => {
  const f = myField(ctx), m = String(ctx.body.method || ''), a = String(ctx.body.account || '').trim();
  if (!['Bank', 'JazzCash', 'Easypaisa'].includes(m)) throw E('Pick bank, JazzCash or Easypaisa.');
  if (m === 'Bank' ? !/^PK\d{2}[A-Z]{4}\d{16}$/.test(a.replace(/\s/g, '').toUpperCase()) : !/^03\d{9}$/.test(a.replace(/\D/g, ''))) throw E(m === 'Bank' ? 'Enter a 24-character IBAN starting PK.' : 'Enter the mobile number of the wallet.');
  if (f.paid_day != null) throw E('Your payment has already been sent.');
  const masked = m === 'Bank' ? a.replace(/\s/g, '').toUpperCase().slice(0, 8) + '••••' + a.slice(-4) : a.replace(/\D/g, '').slice(0, 4) + '-•••' + a.slice(-4);
  run('UPDATE fields SET payout_method = ?, payout_account = ? WHERE id = ?', m, masked, f.id);
});
r('POST', '/api/grower/sown', G, (ctx) => { const f = myField(ctx); if (f.paid_day == null) throw E('Sowing is reported after your contract is paid.'); run('UPDATE fields SET sown_day = ? WHERE id = ?', today(), f.id); });
r('POST', '/api/grower/task', G, (ctx) => { const f = myField(ctx); run('INSERT INTO tasks (field_id, key, day) VALUES (?, ?, ?) ON CONFLICT(field_id, key) DO UPDATE SET day = excluded.day', f.id, String(ctx.body.key).slice(0, 20), today()); });
r('POST', '/api/grower/surplus', G, (ctx) => {
  if (isDirect(ctx)) { const p = pilot(today()); if (p.deliveredMd < p.md) throw E('Surplus can be offered once the 8,000 maunds are delivered.'); setKv('surplus_offer', { md: Math.round(Number(ctx.body.md)) || p.surplusMd }, today()); return; }
  M.offerSurplus(myField(ctx), ctx.body.md);
});
r('POST', '/api/grower/reenroll', G, (ctx) => {
  const u = me(ctx);
  if (isDirect(ctx)) { setKv('rofr', { yes: true }, today()); return; }
  const f = myField(ctx);
  if (get("SELECT 1 AS x FROM registrations WHERE phone = ? AND status = 'pre-approved'", u.phone)) return;
  run("INSERT INTO registrations (name, phone, village, acres, yield, status, day) VALUES (?, ?, ?, ?, ?, 'pre-approved', ?)", u.name, u.phone, f.village, f.acres_listed, null, today());
});
r('POST', '/api/grower/report', G, (ctx) => M.addReport(ctx.user, myField(ctx), String(ctx.body.type || 'Problem').slice(0, 60), ctx.body.text));

// ── ops ──
const O = ['ops'];
r('GET', '/api/ops', O, () => V.ops());
r('POST', '/api/ops/clock', O, ({ body }) => {
  const target = Math.round(Number(body.day));
  if (!(target >= -31 && target <= 335)) throw E('Pick a day in the season.');
  setSetting('clock_offset', target - dayOfDate(new Date()));
  return V.clock();
});
r('POST', '/api/ops/close', O, () => M.closeMarket());
r('POST', '/api/ops/decision', O, ({ body }) => M.decide(body.field, !!body.accept, (body.accept ? 'Accepted' : 'Declined') + ' by phone, recorded by Ops'));
r('POST', '/api/ops/finalize', O, () => M.finalize());
r('POST', '/api/ops/release', O, () => M.release());
r('POST', '/api/ops/delivery', O, ({ body }) => M.recordDelivery(body.field, body.kg, body.moisture, body.grade || 'Grade 1', { vehicle: body.vehicle, slip: body.slip, bags: Number(body.bags) || null, foreign: Number(body.foreign) || null }));
r('POST', '/api/ops/sign', O, ({ body }) => { (body.fields || []).forEach((id) => M.sign(id, 'On paper with the field officer (thumbprint, witnessed)')); });
r('POST', '/api/ops/shortfall', O, ({ body }) => M.resolveShortfall(body.field, body.action));
r('POST', '/api/ops/surplus/:id', O, ({ body, params }) => M.decideSurplus(Number(params.id), !!body.buy));
r('POST', '/api/ops/pilot/surplus', O, ({ body }) => { const p = pilot(today()); if (!p.surplus) throw E('No surplus has been offered.'); setKv('surplus_decision', { buy: !!body.buy, price: p.market.pmex - 35 }, today()); });
r('GET', '/api/ledger', O, () => V.ledger());
r('GET', '/api/crop', O, () => V.crop());
r('POST', '/api/ops/sale', O, ({ body }) => M.runSale(body.win, body.price));
r('POST', '/api/ops/thresholds', O, ({ body: b }) => {
  const t = setting('thresholds');
  ['watch', 'risk', 'moist', 'below'].forEach((k) => { if (b[k] != null && isFinite(b[k])) t[k] = Number(b[k]); });
  if (t.risk >= t.watch) throw E('The risk level must be below the watch level.');
  setSetting('thresholds', t); return t;
});
r('POST', '/api/ops/report/:id', O, ({ body, params }) => { run("UPDATE reports SET status = ?, officer = 'Usman Ali' WHERE id = ?", body.status || 'assigned', params.id); });
r('POST', '/api/ops/registration/:id', O, ({ body, params }) => { run('UPDATE registrations SET status = ? WHERE id = ?', String(body.status || 'check scheduled'), params.id); });
r('POST', '/api/ops/visit', O, ({ body }) => { run('INSERT INTO visits (field_id, day, note) VALUES (?, ?, ?)', body.field, today() + 2, 'Field officer visit'); });
r('POST', '/api/ops/reset', O, (ctx) => { seed(); ctx.logout(); });

// Every change is written to the audit log: who, when, what. Codes and account numbers are masked.
function audit(ctx, path, body) {
  const u = (path === '/api/auth/verify' ? get('SELECT * FROM users WHERE phone = ?', normPhone(body.phone)) : null) || ctx.user;
  const safe = Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, /code|cnic|iban|account/i.test(k) ? '•••' : /phone/i.test(k) && typeof v === 'string' ? v.replace(/\D/g, '').replace(/^(\d{4})\d+(\d{3})$/, '$1•••$2') : v]));
  run('INSERT INTO audit (day, ts, user_id, actor, role, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)', today(), Date.now(), u ? u.id : null, u ? u.name : 'Visitor', u ? u.role : 'public', path.replace('/api/', ''), JSON.stringify(safe).slice(0, 300));
}

// Resolve and run a route. Returns { status, body }.
export function dispatch(method, path, ctx) {
  for (const rt of routes) {
    if (rt.method !== method) continue;
    const m = path.match(rt.re); if (!m) continue;
    if (rt.roles && !ctx.user) return { status: 401, body: { error: 'Please sign in.' } };
    if (rt.roles && !rt.roles.includes(ctx.user.role)) return { status: 403, body: { error: 'Not available for this account.' } };
    try {
      M.sync();
      const out = rt.fn({ ...ctx, params: m.groups || {}, body: ctx.body || {} });
      if (method !== 'GET' && !/^\/api\/(auth\/otp|inbox\/read|quote)/.test(path)) audit(ctx, path, ctx.body);
      return { status: 200, body: out ?? { ok: true } };
    } catch (e) {
      if (e instanceof M.UserError) return { status: e.code, body: { error: e.message } };
      console.error(e); return { status: 500, body: { error: 'Something went wrong on our side.' } };
    }
  }
  return { status: 404, body: { error: 'Not found' } };
}
