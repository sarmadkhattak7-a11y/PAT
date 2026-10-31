// Stands in for the HTTP server: routes each api() call to the shared route table, in the browser.
import { ensure, get, persist } from './db.js';
import { dispatch } from '../../../server/routes.js';

ensure(); persist();
const SKEY = 'barak-local-session';
let mem = null;
const sess = { get: () => { try { return localStorage.getItem(SKEY); } catch { return mem; } }, set: (v) => { mem = v; try { v == null ? localStorage.removeItem(SKEY) : localStorage.setItem(SKEY, v); } catch {} } };

export async function localApi(url, body, method) {
  const m = method || (body ? 'POST' : 'GET');
  const uid = sess.get();
  const user = uid ? get('SELECT * FROM users WHERE id = ?', Number(uid)) : null;
  const ctx = { user, body: body ? JSON.parse(JSON.stringify(body)) : {}, login: (id) => sess.set(String(id)), logout: () => sess.set(null) };
  const out = dispatch(m, url.split('?')[0], ctx);
  persist(); // reads can also write (expiries, simulated investors)
  await new Promise((r) => setTimeout(r, 0));
  if (out.status !== 200) throw new Error(out.body.error || 'Request failed');
  return JSON.parse(JSON.stringify(out.body));
}
