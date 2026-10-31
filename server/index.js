import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensure, get, run, today, newToken } from './db.js';
import { dispatch } from './routes.js';

ensure();
const app = express();
app.use(express.json({ limit: '200kb' }));

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));

app.all(/^\/api\//, (req, res) => {
  const sid = cookies(req).sid;
  const user = sid ? get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', sid) : null;
  const ctx = {
    user, body: req.body,
    login: (uid) => { const t = newToken(); run('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)', t, uid, Date.now()); res.setHeader('Set-Cookie', `sid=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`); },
    logout: () => { if (sid) run('DELETE FROM sessions WHERE token = ?', sid); res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Max-Age=0'); },
  };
  const out = dispatch(req.method, req.path, ctx);
  res.status(out.status).json(out.body);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`Barak platform on http://localhost:${port}  (clock: day ${today()})`));
