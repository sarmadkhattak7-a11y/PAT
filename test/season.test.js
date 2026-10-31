// Walks one whole season through the HTTP API: sign-up, KYC, reserve, pay, close, smaller-contract decision,
// finalize, release (mint), delivery with a shortfall, sale election, April and September sales, transfer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
let srv, dir;

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); if (!r.ok) { const e = new Error(j.error); e.status = r.status; throw e; } return j;
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}
async function login(c, phone, name) {
  const o = await c.post('/api/auth/otp', { phone });
  return c.post('/api/auth/verify', { phone, code: o.sandboxCode, name });
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barak-'));
  srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { env: { ...process.env, PORT, BARAK_DATA: dir }, stdio: 'pipe' });
  await new Promise((res, rej) => { srv.stdout.on('data', (d) => String(d).includes('Barak platform') && res()); srv.on('exit', rej); setTimeout(() => rej(new Error('server did not start')), 8000); });
});
after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('a full season, end to end', async () => {
  const ops = client(), inv = client(), inv2 = client(), grower = client();
  await login(ops, '03000000001');
  await ops.post('/api/ops/clock', { day: -18 });

  // Investor signs up and cannot reserve before verification.
  const s = await login(inv, '03211234567', 'Test Investor');
  assert.equal(s.user.role, 'investor');
  await assert.rejects(inv.post('/api/orders', { kind: 'pool', pool: 'starter', amount: 100000 }), /verification/);
  await inv.post('/api/kyc/cnic', { cnic: '35202-1234567-1' });
  await inv.post('/api/kyc/bank', { iban: 'PK36SCBL0000001123456702' });
  const k = await inv.post('/api/kyc/suitability', { answers: { lock: true, loss: true, share: true } });
  assert.equal(k.user.limit, 2500000);

  // Market shows simulated other investors on the funding curve.
  const m = await inv.get('/api/market');
  assert.equal(m.listings.length, 12);
  assert.ok(m.listings[0].paid > 0, 'others have paid in');

  // Quote and reserve across the Starter pool; pay it.
  const q = await inv.post('/api/quote', { kind: 'pool', pool: 'starter', amount: 300000 });
  assert.ok(q.alloc.length >= 5 && Math.abs(q.placed - 300000) < 100);
  const { order } = await inv.post('/api/orders', { kind: 'pool', pool: 'starter', amount: 300000 });
  assert.equal(order.status, 'reserved');
  const paid = await inv.post(`/api/orders/${order.id}/pay`, { method: 'raast' });
  assert.equal(paid.order.status, 'paid');

  // A single-field order over the 20% cap is split across more fields.
  const sq = await inv.post('/api/quote', { kind: 'field', field: 'BRK-0143', amount: 1500000 });
  assert.ok(sq.split && sq.alloc.length >= 5);

  // Close: day 4. Khalid (57%) and Riaz (52%) are offered smaller contracts; under 50% lapses.
  await assert.rejects(ops.post('/api/ops/close'), /closes on/);
  await ops.post('/api/ops/clock', { day: 4 });
  await ops.post('/api/ops/close');
  let o = await ops.get('/api/ops');
  const khalid = o.board.find((b) => b.id === 'BRK-0150');
  assert.equal(khalid.status, 'offer');
  assert.equal(o.board.find((b) => b.id === 'BRK-0152').status, 'offer');
  assert.ok(o.board.filter((b) => b.frac < 0.5).every((b) => b.status === 'lapsed'));
  assert.ok(o.board.filter((b) => b.frac >= 0.8).every((b) => b.status === 'ahead'));
  await assert.rejects(ops.post('/api/ops/finalize'), /decision/);

  // Khalid accepts in the grower app; Riaz declines by phone via Ops.
  await login(grower, '03011000150');
  const gv = await grower.get('/api/grower');
  assert.equal(gv.field.status, 'offer');
  await grower.post('/api/grower/decision', { accept: true });
  o = await ops.get('/api/ops');
  o.board.filter((b) => b.status === 'offer').forEach(() => {});
  for (const b of o.board.filter((x) => x.status === 'offer')) await ops.post('/api/ops/decision', { field: b.id, accept: false });

  await ops.post('/api/ops/clock', { day: 6 });
  await ops.post('/api/ops/finalize');
  let p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'signing');
  assert.ok(p.cash.some((c) => c.type === 'refund'), 'refund for the lapsed field');

  await ops.post('/api/ops/clock', { day: 9 });
  await ops.post('/api/ops/release');
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'held');
  assert.ok(p.pat > 3000, 'holds PAT');
  assert.ok(p.holdings.every((h) => h.locked));

  // Ledger: every grower contract fully tokenised (investors + treasury) and the chain verifies.
  let L = await inv.get('/api/ledger');
  assert.equal(L.valid, true);
  const contracted = o.board.filter((b) => b.status === 'ahead').length;
  assert.ok(L.minted > 0 && L.reserve.owedKg === L.locked);

  // Locked tokens cannot move.
  await login(inv2, '03331112222', 'Second Investor');
  await inv2.post('/api/kyc/cnic', { cnic: '3520212345672' }); await inv2.post('/api/kyc/bank', { iban: 'PK36SCBL0000001123456703' });
  await assert.rejects(inv.post('/api/transfer', { to: '03331112222', field: p.holdings[0].field, pat: 10 }), /locked/);

  // Elect September, then deliveries in April (Bashir short).
  await inv.post('/api/election', { win: 'sep', filer: true });
  await ops.post('/api/ops/clock', { day: 170 });
  o = await ops.get('/api/ops');
  for (const r of o.registry.filter((x) => x.status === 'paid')) {
    const kg = r.id === 'BRK-0147' ? r.owed * 40 * 0.8 : r.owed * 40;
    await ops.post('/api/ops/delivery', { field: r.id, kg, moisture: 9.1, grade: 'Grade 1' });
  }
  L = await inv.get('/api/ledger');
  assert.equal(L.valid, true);
  assert.equal(L.locked, 0);
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'stored');

  // Unlocked tokens transfer between verified holders.
  await inv.post('/api/transfer', { to: '03331112222', field: p.holdings[0].field, pat: 25 });

  // April sale pays the treasury and inv2 (default April); inv keeps September.
  await ops.post('/api/ops/sale', { win: 'apr', price: 4200 });
  const p2 = await inv2.get('/api/portfolio');
  assert.equal(p2.payouts.length, 1);
  p = await inv.get('/api/portfolio');
  assert.equal(p.payouts.length, 0);

  await ops.post('/api/ops/clock', { day: 300 });
  await ops.post('/api/ops/sale', { win: 'sep', price: 4600 });
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'paidout');
  assert.equal(p.payouts[0].win, 'sep');
  L = await inv.get('/api/ledger');
  assert.equal(L.outstanding, 0);
  assert.equal(L.valid, true);
  assert.ok(contracted >= 9);
});
