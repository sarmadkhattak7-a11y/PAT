// Storage layer shared by the Node server and the in-browser build.
// A driver supplies prepare(sql) -> { get, all, run } and exec(sql); see server/db.js and client/src/local/db.js.
import { dayOfDate, K, PR } from './domain.js';

export let db = null;
let hash = null, rand = null;
export function setDriver(driver, { sha256, randomHex }) { db = driver; hash = sha256; rand = randomHex; }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, role TEXT NOT NULL, phone TEXT UNIQUE, name TEXT, name_ur TEXT,
  cnic TEXT, cnic_ok INTEGER DEFAULT 0, iban TEXT, bank_ok INTEGER DEFAULT 0,
  suitability TEXT, season_limit INTEGER, filer INTEGER DEFAULT 1, bot INTEGER DEFAULT 0,
  lang TEXT DEFAULT 'en', created_day INTEGER);
CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, created INTEGER);
CREATE TABLE IF NOT EXISTS fields (
  id TEXT PRIMARY KEY, idx INTEGER, grower_id INTEGER REFERENCES users(id), village TEXT,
  acres_listed REAL, acres_contracted REAL, grade TEXT, yield_offset REAL, crop_event TEXT, harvest_week REAL,
  sim_frac REAL, status TEXT DEFAULT 'listed', offer_acres REAL, decision TEXT, decision_note TEXT,
  delivery_day TEXT, photo INTEGER, water TEXT, history TEXT);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), kind TEXT, pool TEXT, amount REAL,
  status TEXT, reserved_day INTEGER, reserved_at INTEGER, paid_day INTEGER, method TEXT, pay_ref TEXT);
CREATE TABLE IF NOT EXISTS allocations (
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE, field_id TEXT REFERENCES fields(id),
  amount REAL, kept REAL, pat INTEGER, refund REAL, PRIMARY KEY (order_id, field_id));
CREATE TABLE IF NOT EXISTS cash (
  id INTEGER PRIMARY KEY, type TEXT, amount REAL, user_id INTEGER, field_id TEXT, order_id TEXT, day INTEGER, memo TEXT);
CREATE TABLE IF NOT EXISTS tokens (
  seq INTEGER PRIMARY KEY, type TEXT, field_id TEXT, from_user INTEGER, to_user INTEGER, pat INTEGER,
  day INTEGER, memo TEXT, prev_hash TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS deliveries (
  field_id TEXT PRIMARY KEY, kg REAL, moisture REAL, grade TEXT, ewr TEXT, day INTEGER);
CREATE TABLE IF NOT EXISTS elections (user_id INTEGER PRIMARY KEY, win TEXT, filer INTEGER, day INTEGER);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY, user_id INTEGER, win TEXT, pat INTEGER, price REAL, gross REAL, fee REAL, storage REAL, tax REAL, net REAL, day INTEGER);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, field_id TEXT, user_id INTEGER, type TEXT, text TEXT, status TEXT DEFAULT 'open', day INTEGER, officer TEXT);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY, name TEXT, phone TEXT, cnic TEXT, village TEXT, acres REAL, yield REAL, status TEXT DEFAULT 'new', day INTEGER);
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, field_id TEXT, day INTEGER, note TEXT, status TEXT DEFAULT 'scheduled');
`;

const GROWERS = [
  ['BRK-0141', 'Muhammad Aslam', 'محمد اسلم', 'Chak 45/5L, Sahiwal', 12, 0.5, null, null, 0.86, 'Canal + tubewell'],
  ['BRK-0142', 'Ghulam Rasool', 'غلام رسول', 'Chak 88/6R, Sahiwal', 8, -0.4, null, null, 0.82, 'Canal'],
  ['BRK-0143', 'Rana Tariq', 'رانا طارق', 'Chak 11/1AL, Okara', 15, 1.2, null, null, 0.90, 'Tubewell'],
  ['BRK-0144', 'Allah Ditta', 'اللہ دتہ', 'Chak 45/5L, Sahiwal', 6, 0, null, null, 0.81, 'Canal'],
  ['BRK-0145', 'Shahid Iqbal', 'شاہد اقبال', 'Chak 88/6R, Sahiwal', 10, 0.3, null, null, 0.84, 'Canal + tubewell'],
  ['BRK-0146', 'Nazir Ahmad', 'نذیر احمد', 'Chak 11/1AL, Okara', 9, -0.8, null, null, 0.80, 'Tubewell'],
  ['BRK-0147', 'Bashir Joiya', 'بشیر جوئیہ', 'Chak 45/5L, Sahiwal', 7, 0, 'blight', null, 0.83, 'Canal'],
  ['BRK-0148', 'Zafar Watto', 'ظفر وٹو', 'Chak 32/2L, Okara', 11, 0.8, null, null, 0.88, 'Canal + tubewell'],
  ['BRK-0149', 'Imran Sial', 'عمران سیال', 'Chak 32/2L, Okara', 5, -1, 'irrigation', null, 0.80, 'Tubewell'],
  ['BRK-0150', 'Khalid Mahmood', 'خالد محمود', 'Chak 88/6R, Sahiwal', 8, 0.2, null, null, 0.57, 'Canal'],
  ['BRK-0151', 'Sajid Dogar', 'ساجد ڈوگر', 'Chak 45/5L, Sahiwal', 4, 1.5, null, null, 0.46, 'Canal + tubewell'],
  ['BRK-0152', 'Riaz Hussain', 'ریاض حسین', 'Chak 32/2L, Okara', 5, -1.3, null, null, 0.52, 'Tubewell'],
];
const BOT_NAMES = ['Ayesha R.', 'Bilal K.', 'Fatima Z.', 'Hamza S.', 'Kiran A.', 'Omar F.', 'Sana M.', 'Usman T.', 'Zainab H.', 'Faisal N.', 'Mehwish Q.', 'Adeel J.',
  'Nida P.', 'Saad L.', 'Rabia I.', 'Talha W.', 'Hira D.', 'Junaid B.', 'Maryam C.', 'Imtiaz G.', 'Sobia V.', 'Waqas E.', 'Amna Y.', 'Danish U.'];

export const get = (sql, ...a) => db.prepare(sql).get(...a);
export const all = (sql, ...a) => db.prepare(sql).all(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);
export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export const setting = (k, d = null) => { const r = get('SELECT value FROM settings WHERE key = ?', k); return r ? JSON.parse(r.value) : d; };
export const setSetting = (k, v) => run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));

// The demo clock: real calendar day plus an offset ops can move. Starts on today's date.
export function today() { return dayOfDate(new Date()) + (setting('clock_offset', 0) || 0); }

export function seed() {
  const tables = ['visits', 'registrations', 'reports', 'payouts', 'elections', 'deliveries', 'tokens', 'cash', 'allocations', 'orders', 'fields', 'sessions', 'otps', 'users', 'settings'];
  db.exec(SCHEMA);
  tx(() => {
    tables.forEach((t) => db.exec(`DELETE FROM ${t}`));
    const d0 = dayOfDate(new Date());
    // Before the market opens there is nothing to show, so a clock earlier than mid-October is moved to 14 Oct.
    setSetting('clock_offset', d0 < -18 ? -18 - d0 : d0 > 3 ? -18 - d0 : 0);
    setSetting('market', 'open');
    setSetting('thresholds', { watch: 1.3, risk: 1.1, moist: 0.04, below: 0.08 });
    setSetting('seq', { order: 1040, pay: 26410, ewr: 2700 });
    run("INSERT INTO users (role, phone, name, created_day) VALUES ('ops', '03000000001', 'Barak Ops desk', -60)");
    run("INSERT INTO users (role, phone, name, created_day, cnic_ok, bank_ok) VALUES ('treasury', 'treasury', 'Barak treasury', -60, 1, 1)");
    GROWERS.forEach((g, i) => {
      const phone = '0301' + String(1000141 + i);
      const u = run("INSERT INTO users (role, phone, name, name_ur, lang, cnic_ok, bank_ok, created_day) VALUES ('grower', ?, ?, ?, 'ur', 1, 1, -75)", phone, g[1], g[2]);
      const b = 38 + g[5];
      const hist = [b - 2.5 + ((i * 7) % 3) * 0.5, b - 1 + ((i * 5) % 2), b + 0.5].map((x) => Math.round(x * 2) / 2);
      run(`INSERT INTO fields (id, idx, grower_id, village, acres_listed, acres_contracted, grade, yield_offset, crop_event, harvest_week, sim_frac, photo, water, history)
           VALUES (?, ?, ?, ?, ?, ?, 'A', ?, ?, ?, ?, ?, ?, ?)`,
        g[0], i, Number(u.lastInsertRowid), g[3], g[4], g[4], g[5], g[6], i === 0 ? 23 : 21 + (i % 4), g[8], (i % 5) + 1, g[9], JSON.stringify(hist));
    });
    BOT_NAMES.forEach((n, i) => run("INSERT INTO users (role, phone, name, bot, cnic_ok, bank_ok, season_limit, created_day) VALUES ('investor', ?, ?, 1, 1, 1, ?, -40)", 'bot' + i, n, K.LIMIT));
  });
}

export function ensure() {
  db.exec(SCHEMA);
  if (!get("SELECT 1 AS x FROM users WHERE role = 'ops'")) seed();
}

export function nextSeq(kind) {
  const s = setting('seq'); s[kind] += kind === 'pay' ? 37 : 1; setSetting('seq', s); return s[kind];
}
export const newToken = () => rand(24);
export const sha = (s) => hash(s);
export { PR };
