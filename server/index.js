import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensure, seed, get, run, setting, setSetting, today, newToken } from './db.js';
import { K, DAY, dayOfDate } from './domain.js';
import * as M from './market.js';
import * as V from './views.js';

ensure();
const app = express();
app.use(express.json({ limit: '200kb' }));

// ── auth ──
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0])); }
app.use((req, res, next) => {
  const sid = cookies(req).sid;
  if (sid) { const s = get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', sid); if (s) req.user = s; }
  next();
});
const need = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not available for this account.' });
  next();
};
const h = (fn) => (req, res) => {
  try { M.sync(); const out = fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); }
  catch (e) { if (e instanceof M.UserError) res.status(e.code).json({ error: e.message }); else { console.error(e); res.status(500).json({ error: 'Something went wrong on our side.' }); } }
};
const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^92/, '0');
const me = (req) => get('SELECT * FROM users WHERE id = ?', req.user.id);

app.post('/api/auth/otp', h((req) => {
  const phone = normPhone(req.body.phone);
  if (!/^03\d{9}$/.test(phone)) throw new M.UserError('Enter a Pakistani mobile number, like 0300 1234567.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  run('INSERT INTO otps (phone, code, expires) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires = excluded.expires', phone, code, Date.now() + 10 * 60e3);
  const u = get('SELECT role, name FROM users WHERE phone = ?', phone);
  // Sandbox: no SMS gateway is connected, so the code is returned to the screen.
  return { sent: true, sandboxCode: code, existing: !!u, role: u ? u.role : 'investor' };
}));
app.post('/api/auth/verify', h((req, res) => {
  const phone = normPhone(req.body.phone), o = get('SELECT * FROM otps WHERE phone = ?', phone);
  if (!o || o.code !== String(req.body.code || '').trim() || o.expires < Date.now()) throw new M.UserError('That code is wrong or has expired.');
  run('DELETE FROM otps WHERE phone = ?', phone);
  let u = get('SELECT * FROM users WHERE phone = ?', phone);
  if (!u) {
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) throw new M.UserError('Enter your name as it appears on your CNIC.');
    run("INSERT INTO users (role, phone, name, created_day) VALUES ('investor', ?, ?, ?)", phone, name, today());
    u = get('SELECT * FROM users WHERE phone = ?', phone);
  }
  const t = newToken();
  run('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)', t, u.id, Date.now());
  res.setHeader('Set-Cookie', `sid=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
  return { user: V.publicUser(u) };
}));
app.post('/api/auth/logout', h((req, res) => {
  const sid = cookies(req).sid; if (sid) run('DELETE FROM sessions WHERE token = ?', sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Max-Age=0');
}));

// ── shared ──
app.get('/api/state', h((req) => ({ clock: V.clock(), user: V.publicUser(req.user ? me(req) : null), pricing: V.pricing() })));
app.get('/api/market', h((req) => V.market(req.user ? me(req) : null)));
app.get('/api/fields/:id', h((req) => {
  const f = M.fieldRow(req.params.id); if (!f) throw new M.UserError('Field not found', 404);
  const c = V.crop().fields.find((x) => x.id === f.id);
  return { listing: M.listing(f, today(), req.user ? req.user.id : -1), crop: c };
}));
app.post('/api/quote', h((req) => M.quote(req.body, today(), req.user ? req.user.id : -1)));
app.get('/api/ledger', h(() => V.ledger()));
app.get('/api/crop', h(() => V.crop()));
app.post('/api/join', h((req) => {
  const b = req.body, phone = normPhone(b.phone);
  if (!String(b.name || '').trim()) throw new M.UserError('Enter your name.');
  if (!/^03\d{9}$/.test(phone)) throw new M.UserError('Enter a mobile number like 0300 1234567.');
  const acres = Number(b.acres); if (!(acres >= 1 && acres <= 500)) throw new M.UserError('Enter your wheat acres.');
  run('INSERT INTO registrations (name, phone, cnic, village, acres, yield, day) VALUES (?, ?, ?, ?, ?, ?, ?)', String(b.name).slice(0, 80), phone, String(b.cnic || '').replace(/\D/g, '').slice(0, 13), String(b.village || '').slice(0, 80), acres, Number(b.yield) || null, today());
}));

// ── investor ──
app.post('/api/kyc/cnic', need('investor'), h((req) => {
  const cnic = String(req.body.cnic || '').replace(/\D/g, '');
  if (cnic.length !== 13) throw new M.UserError('A CNIC has 13 digits.');
  // Sandbox: NADRA Verisys is not connected; a well-formed CNIC is accepted.
  run('UPDATE users SET cnic = ?, cnic_ok = 1 WHERE id = ?', cnic, req.user.id);
  return { user: V.publicUser(me(req)) };
}));
app.post('/api/kyc/bank', need('investor'), h((req) => {
  const iban = String(req.body.iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) throw new M.UserError('A Pakistani IBAN is 24 characters, starting PK, like PK36SCBL0000001123456702.');
  run('UPDATE users SET iban = ?, bank_ok = 1 WHERE id = ?', iban, req.user.id);
  return { user: V.publicUser(me(req)) };
}));
app.post('/api/kyc/suitability', need('investor'), h((req) => {
  const q = req.body.answers || {};
  if (!['lock', 'loss', 'share'].every((k) => typeof q[k] === 'boolean')) throw new M.UserError('Answer all three questions.');
  const limit = !q.lock ? 0 : q.loss && q.share ? K.LIMIT : K.LIMIT_LOW;
  run('UPDATE users SET suitability = ?, season_limit = ? WHERE id = ?', JSON.stringify(q), limit, req.user.id);
  return { user: V.publicUser(me(req)) };
}));
app.post('/api/orders', need('investor'), h((req) => ({ order: M.reserve(me(req), req.body) })));
app.post('/api/orders/:id/pay', need('investor'), h((req) => ({ order: M.pay(me(req), req.params.id, req.body.method) })));
app.post('/api/orders/:id/cancel', need('investor'), h((req) => M.cancel(me(req), req.params.id)));
app.get('/api/portfolio', need('investor'), h((req) => V.portfolio(me(req))));
app.post('/api/election', need('investor'), h((req) => M.elect(me(req), req.body.win, req.body.filer !== false)));
app.post('/api/transfer', need('investor'), h((req) => M.transfer(me(req), normPhone(req.body.to), req.body.field, req.body.pat)));

// ── grower ──
app.get('/api/grower', need('grower'), h((req) => V.grower(me(req))));
app.post('/api/grower/decision', need('grower'), h((req) => {
  const f = get('SELECT id FROM fields WHERE grower_id = ?', req.user.id);
  M.decide(f.id, !!req.body.accept, req.body.accept ? 'Accepted by grower in app' : (req.body.reason || 'Declined by grower in app'));
}));
app.post('/api/grower/delivery-day', need('grower'), h((req) => {
  const f = get('SELECT * FROM fields WHERE grower_id = ?', req.user.id);
  if (f.status !== 'paid') throw new M.UserError('Delivery days open once your advance is paid.');
  const dt = new Date(String(req.body.date) + 'T00:00:00Z'), d = dayOfDate(dt);
  if (isNaN(d) || d < 140 || d > DAY.deliverBy) throw new M.UserError('Pick a day between 20 March and 30 April.');
  run('UPDATE fields SET delivery_day = ? WHERE id = ?', String(req.body.date), f.id);
}));
app.post('/api/grower/report', need('grower'), h((req) => {
  const f = get('SELECT * FROM fields WHERE grower_id = ?', req.user.id);
  M.addReport(req.user, f, String(req.body.type || 'Problem').slice(0, 60), req.body.text);
}));

// ── ops ──
const O = need('ops');
app.get('/api/ops', O, h(() => V.ops()));
app.post('/api/ops/clock', O, h((req) => {
  const target = Math.round(Number(req.body.day));
  if (!(target >= -31 && target <= 335)) throw new M.UserError('Pick a day in the season.');
  setSetting('clock_offset', target - dayOfDate(new Date()));
  return V.clock();
}));
app.post('/api/ops/close', O, h(() => M.closeMarket()));
app.post('/api/ops/decision', O, h((req) => M.decide(req.body.field, !!req.body.accept, (req.body.accept ? 'Accepted' : 'Declined') + ' by phone, recorded by Ops')));
app.post('/api/ops/finalize', O, h(() => M.finalize()));
app.post('/api/ops/release', O, h(() => M.release()));
app.post('/api/ops/delivery', O, h((req) => M.recordDelivery(req.body.field, req.body.kg, req.body.moisture, req.body.grade || 'Grade 1')));
app.post('/api/ops/sale', O, h((req) => M.runSale(req.body.win, req.body.price)));
app.post('/api/ops/thresholds', O, h((req) => {
  const t = setting('thresholds'), b = req.body;
  ['watch', 'risk', 'moist', 'below'].forEach((k) => { if (b[k] != null && isFinite(b[k])) t[k] = Number(b[k]); });
  if (t.risk >= t.watch) throw new M.UserError('The risk level must be below the watch level.');
  setSetting('thresholds', t); return t;
}));
app.post('/api/ops/report/:id', O, h((req) => run("UPDATE reports SET status = ?, officer = 'Usman Ali' WHERE id = ?", req.body.status || 'assigned', req.params.id) && null));
app.post('/api/ops/registration/:id', O, h((req) => run('UPDATE registrations SET status = ? WHERE id = ?', String(req.body.status || 'check scheduled'), req.params.id) && null));
app.post('/api/ops/visit', O, h((req) => run('INSERT INTO visits (field_id, day, note) VALUES (?, ?, ?)', req.body.field, today() + 2, 'Field officer visit') && null));
app.post('/api/ops/reset', O, h((req, res) => { seed(); res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); }));

// ── client ──
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`Barak platform on http://localhost:${port}  (clock: day ${today()})`));
