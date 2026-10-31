// Every API route, shared by the Express server (server/index.js) and the in-browser build (client/src/local/api.js).
// A handler gets ctx = { body, params, user, login(userId), logout() } and returns JSON-able data.
import { seed, get, run, setting, setSetting, today } from './db.js';
import { K, DAY, dayOfDate } from './domain.js';
import * as M from './market.js';
import * as V from './views.js';

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
r('GET', '/api/ledger', null, () => V.ledger());
r('GET', '/api/crop', null, () => V.crop());
r('POST', '/api/join', null, ({ body: b }) => {
  const phone = normPhone(b.phone);
  if (!String(b.name || '').trim()) throw E('Enter your name.');
  if (!/^03\d{9}$/.test(phone)) throw E('Enter a mobile number like 0300 1234567.');
  const acres = Number(b.acres); if (!(acres >= 1 && acres <= 500)) throw E('Enter your wheat acres.');
  run('INSERT INTO registrations (name, phone, cnic, village, acres, yield, day) VALUES (?, ?, ?, ?, ?, ?, ?)', String(b.name).slice(0, 80), phone, String(b.cnic || '').replace(/\D/g, '').slice(0, 13), String(b.village || '').slice(0, 80), acres, Number(b.yield) || null, today());
});

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
r('POST', '/api/orders', I, (ctx) => ({ order: M.reserve(me(ctx), ctx.body) }));
r('POST', '/api/orders/:id/pay', I, (ctx) => ({ order: M.pay(me(ctx), ctx.params.id, ctx.body.method) }));
r('POST', '/api/orders/:id/cancel', I, (ctx) => M.cancel(me(ctx), ctx.params.id));
r('GET', '/api/portfolio', I, (ctx) => V.portfolio(me(ctx)));
r('POST', '/api/election', I, (ctx) => M.elect(me(ctx), ctx.body.win, ctx.body.filer !== false));
r('POST', '/api/transfer', I, (ctx) => M.transfer(me(ctx), normPhone(ctx.body.to), ctx.body.field, ctx.body.pat));

// ── grower ──
const G = ['grower'];
const myField = (ctx) => get('SELECT * FROM fields WHERE grower_id = ?', ctx.user.id);
r('GET', '/api/grower', G, (ctx) => V.grower(me(ctx)));
r('POST', '/api/grower/decision', G, (ctx) => M.decide(myField(ctx).id, !!ctx.body.accept, ctx.body.accept ? 'Accepted by grower in app' : (ctx.body.reason || 'Declined by grower in app')));
r('POST', '/api/grower/delivery-day', G, (ctx) => {
  const f = myField(ctx);
  if (f.status !== 'paid') throw E('Delivery days open once your advance is paid.');
  const d = dayOfDate(new Date(String(ctx.body.date) + 'T00:00:00Z'));
  if (isNaN(d) || d < 140 || d > DAY.deliverBy) throw E('Pick a day between 20 March and 30 April.');
  run('UPDATE fields SET delivery_day = ? WHERE id = ?', String(ctx.body.date), f.id);
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
r('POST', '/api/ops/delivery', O, ({ body }) => M.recordDelivery(body.field, body.kg, body.moisture, body.grade || 'Grade 1'));
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
      return { status: 200, body: out ?? { ok: true } };
    } catch (e) {
      if (e instanceof M.UserError) return { status: e.code, body: { error: e.message } };
      console.error(e); return { status: 500, body: { error: 'Something went wrong on our side.' } };
    }
  }
  return { status: 404, body: { error: 'Not found' } };
}
