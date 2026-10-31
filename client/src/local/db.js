// In-browser storage driver: SQLite compiled to JavaScript (sql.js), saved to localStorage after each change.
// The Vite "local" build aliases the server's './db.js' to this file, so the server's market logic runs unchanged.
// The asm.js build (no WebAssembly) so the demo also runs on hosts whose security policy blocks wasm.
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { sha256 } from 'js-sha256';
import { setDriver } from '../../../server/store.js';

const KEY = 'barak-local-db-v1';
const SQL = await initSqlJs();
function load() {
  try { const b64 = localStorage.getItem(KEY); if (b64) return new SQL.Database(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return new SQL.Database();
}
const sqldb = load();
sqldb.exec('PRAGMA foreign_keys = ON;');

export function persist() {
  try {
    const bytes = sqldb.export(); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    localStorage.setItem(KEY, btoa(s));
  } catch (e) { /* storage blocked: the demo keeps working in memory for this visit */ }
  sqldb.exec('PRAGMA foreign_keys = ON;');
}

const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
setDriver({
  exec: (sql) => sqldb.exec(sql),
  prepare: (sql) => ({
    get: (...a) => { const st = sqldb.prepare(sql); try { st.bind(norm(a)); return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
    all: (...a) => { const st = sqldb.prepare(sql), out = []; try { st.bind(norm(a)); while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); } },
    run: (...a) => { sqldb.run(sql, norm(a)); return { changes: sqldb.getRowsModified(), lastInsertRowid: sqldb.exec('SELECT last_insert_rowid()')[0].values[0][0] }; },
  }),
}, {
  sha256: (s) => sha256(s),
  randomHex: (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join(''),
});
export * from '../../../server/store.js';
