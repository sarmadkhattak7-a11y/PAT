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
  const ops = client(), inv = client(), inv2 = client(), grower = client(), aslam = client(), kashif = client(), asim = client();
  await login(ops, '03000000001');
  await ops.post('/api/ops/clock', { day: -18 });

  // Investor signs up; verification and the key facts come before any reservation.
  const s = await login(inv, '03211234567', 'Test Investor');
  assert.equal(s.user.role, 'investor');
  await assert.rejects(inv.post('/api/orders', { kind: 'pool', pool: 'starter', amount: 100000 }), /verification/);
  await inv.post('/api/kyc/cnic', { cnic: '35202-1234567-1' });
  await inv.post('/api/kyc/bank', { iban: 'PK36SCBL0000001123456702' });
  const k = await inv.post('/api/kyc/suitability', { answers: { lock: true, loss: true, share: true } });
  assert.equal(k.user.limit, 2500000);
  await assert.rejects(inv.post('/api/orders', { kind: 'pool', pool: 'starter', amount: 100000 }), /key facts/);
  await inv.post('/api/kyc/acknowledge', { kfs: true, shariah: true, risk: true });

  // The ledger and crop monitor belong to Barak Control only.
  await assert.rejects(inv.get('/api/ledger'), /Not available/);
  await assert.rejects(inv.get('/api/crop'), /Not available/);

  const m = await inv.get('/api/market');
  assert.equal(m.listings.length, 12);
  assert.ok(m.listings[0].paid > 0, 'others have paid in');

  const q = await inv.post('/api/quote', { kind: 'pool', pool: 'starter', amount: 300000 });
  assert.ok(q.alloc.length >= 5 && Math.abs(q.placed - 300000) < 100);
  const { order } = await inv.post('/api/orders', { kind: 'pool', pool: 'starter', amount: 300000 });
  const paid = await inv.post(`/api/orders/${order.id}/pay`, { method: 'raast' });
  assert.equal(paid.order.status, 'paid');

  // A second paid order is withdrawn in the cooling-off window and refunded in full.
  const o2 = (await inv.post('/api/orders', { kind: 'field', field: 'BRK-0141', amount: 50000 })).order;
  await inv.post(`/api/orders/${o2.id}/pay`, {});
  await inv.post(`/api/orders/${o2.id}/withdraw`);
  let p = await inv.get('/api/portfolio');
  assert.equal(p.orders.find((x) => x.id === o2.id).status, 'withdrawn');
  const inb = await inv.get('/api/inbox');
  assert.ok(inb.some((n) => /withdrawn/i.test(n.title)));

  const sq = await inv.post('/api/quote', { kind: 'field', field: 'BRK-0143', amount: 1500000 });
  assert.ok(sq.split && sq.alloc.length >= 5);

  // Close on 5 Nov.
  await assert.rejects(ops.post('/api/ops/close'), /closes on/);
  await ops.post('/api/ops/clock', { day: 4 });
  await assert.rejects(inv.post(`/api/orders/${order.id}/withdraw`), /closed/);
  await ops.post('/api/ops/close');
  let o = await ops.get('/api/ops');
  assert.equal(o.board.find((b) => b.id === 'BRK-0150').status, 'offer');
  assert.equal(o.board.find((b) => b.id === 'BRK-0152').status, 'offer');
  assert.ok(o.board.filter((b) => b.frac < 0.5).every((b) => b.status === 'lapsed'));
  assert.ok(o.board.filter((b) => b.frac >= 0.8).every((b) => b.status === 'ahead'));
  await assert.rejects(ops.post('/api/ops/finalize'), /decision/);

  await login(grower, '03011000150');
  assert.equal((await grower.get('/api/grower')).field.status, 'offer');
  await grower.post('/api/grower/decision', { accept: true });
  o = await ops.get('/api/ops');
  for (const b of o.board.filter((x) => x.status === 'offer')) await ops.post('/api/ops/decision', { field: b.id, accept: false });

  await ops.post('/api/ops/clock', { day: 6 });
  await ops.post('/api/ops/finalize');
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'signing');
  assert.ok(p.cash.some((c) => c.type === 'refund' && /80%/.test(c.memo)), 'refund for the lapsed field');

  // Salam is made on signing with payment: nothing is paid until a contract is signed.
  await ops.post('/api/ops/clock', { day: 9 });
  await assert.rejects(ops.post('/api/ops/release'), /No signed contracts/);
  // Khalid signs in the app with a one-time code; the rest sign on paper with the field officer.
  const otp = await grower.post('/api/auth/otp', { phone: '03011000150' });
  await assert.rejects(grower.post('/api/grower/sign', { code: '000000' }), /wrong/);
  await grower.post('/api/grower/sign', { code: otp.sandboxCode });
  await ops.post('/api/ops/release');
  let g = await grower.get('/api/grower');
  assert.equal(g.field.status, 'paid');
  assert.ok(g.inbox.some((n) => /Payment sent/.test(n.title)));
  await grower.post('/api/grower/receipt');
  await grower.post('/api/grower/sown');
  o = await ops.get('/api/ops');
  const unsigned = o.exceptions.find((e) => e.action === 'signPaper');
  assert.ok(unsigned && unsigned.fields.length >= 8);
  await ops.post('/api/ops/sign', { fields: unsigned.fields });
  await ops.post('/api/ops/release');
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'held');
  assert.ok(p.pat > 3000 && p.holdings.every((h) => h.locked));

  let L = await ops.get('/api/ledger');
  assert.equal(L.valid, true);
  assert.ok(L.minted > 0 && L.reserve.owedKg === L.locked);

  await login(inv2, '03331112222', 'Second Investor');
  await inv2.post('/api/kyc/cnic', { cnic: '3520212345672' }); await inv2.post('/api/kyc/bank', { iban: 'PK36SCBL0000001123456703' });
  await assert.rejects(inv.post('/api/transfer', { to: '03331112222', field: p.holdings[0].field, pat: 10 }), /locked/);
  await inv.post('/api/election', { win: 'sep', filer: true });

  // April deliveries. One lot is rejected for moisture and redelivered; Bashir is short and refunds the price.
  await ops.post('/api/ops/clock', { day: 170 });
  o = await ops.get('/api/ops');
  const first = o.registry.find((x) => x.status === 'paid');
  const rej = await ops.post('/api/ops/delivery', { field: first.id, kg: first.owed * 40, moisture: 11.5, grade: 'Grade 1' });
  assert.equal(rej.rejected, true);
  for (const r of o.registry.filter((x) => x.status === 'paid')) {
    const kg = r.id === 'BRK-0147' ? r.owed * 40 * 0.8 : r.owed * 40;
    await ops.post('/api/ops/delivery', { field: r.id, kg, moisture: 9.1, grade: 'Grade 1', vehicle: 'LES-1001', slip: 'WB-1', bags: 100 });
  }
  o = await ops.get('/api/ops');
  assert.equal(o.registry.find((x) => x.id === 'BRK-0147').status, 'short');
  await assert.rejects(ops.post('/api/ops/sale', { win: 'apr', price: 4200 }), /owe wheat/);
  await ops.post('/api/ops/shortfall', { field: 'BRK-0147', action: 'extend' });
  await assert.rejects(ops.post('/api/ops/shortfall', { field: 'BRK-0147', action: 'extend' }), /already/);
  await ops.post('/api/ops/shortfall', { field: 'BRK-0147', action: 'refund' });
  o = await ops.get('/api/ops');
  assert.ok(Math.abs(o.cash.escrow) < 5, 'escrow reconciles to zero once every contract is paid out: ' + o.cash.escrow);
  L = await ops.get('/api/ledger');
  assert.equal(L.valid, true);
  assert.equal(L.locked, 0);
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'stored');

  await inv.post('/api/transfer', { to: '03331112222', field: p.holdings[0].field, pat: 25 });

  // Khalid offers surplus; Barak buys it at the market price.
  await grower.post('/api/grower/surplus', { md: 120 });
  o = await ops.get('/api/ops');
  const sp = o.exceptions.find((e) => e.action === 'surplus');
  await ops.post('/api/ops/surplus/' + sp.surplus, { buy: true });
  g = await grower.get('/api/grower');
  assert.equal(g.surplus[0].status, 'bought');
  assert.equal(g.score.tier, 'Gold');

  await ops.post('/api/ops/sale', { win: 'apr', price: 4200 });
  assert.equal((await inv2.get('/api/portfolio')).payouts.length, 1);

  // inv chose September, then sells early in July instead.
  await ops.post('/api/ops/clock', { day: 250 });
  const early = await inv.post('/api/sell-now');
  assert.ok(early.net > 0 && early.storage > 0);
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'paidout');
  assert.equal(p.payouts[0].win, 'early');

  await ops.post('/api/ops/clock', { day: 300 });
  await ops.post('/api/ops/sale', { win: 'sep', price: 4600 });
  L = await ops.get('/api/ledger');
  assert.equal(L.outstanding, 0);
  assert.equal(L.valid, true);

  // The audit log records who did what.
  o = await ops.get('/api/ops');
  assert.ok(o.audit.some((a) => a.action === 'ops/release' && a.role === 'ops'));
  assert.ok(o.audit.some((a) => a.action === 'grower/sign'));
});

test('the Wattoo and Kashif Shabbir pilot runs from proposal to settlement', async () => {
  const ops = client(), kashif = client(), asim = client();
  await login(ops, '03000000001'); await login(kashif, '03001110001'); await login(asim, '03001110002');
  await ops.post('/api/ops/clock', { day: -1 });
  let k = await kashif.get('/api/portfolio');
  assert.equal(k.direct.stage, 'proposal');
  assert.equal(k.direct.dueAtSigning, 27260000);
  assert.equal(Math.round(k.direct.allInMd), 3523);
  await ops.post('/api/ops/clock', { day: 10 });
  let a = await asim.get('/api/grower');
  assert.equal(a.direct.stage, 'growing');
  await asim.post('/api/grower/receipt');
  a = await asim.get('/api/grower');
  assert.ok(a.direct.receipt);
  await ops.post('/api/ops/clock', { day: 175 });
  a = await asim.get('/api/grower');
  assert.equal(a.direct.deliveredMd, 8000);
  assert.ok(a.direct.lots.some((l) => !l.accepted), 'one lot was rejected and redelivered');
  await asim.post('/api/grower/surplus', {});
  await ops.post('/api/ops/pilot/surplus', { buy: false });
  await ops.post('/api/ops/clock', { day: 190 });
  k = await kashif.get('/api/portfolio');
  assert.equal(k.direct.stage, 'settled');
  assert.equal(k.direct.profit, 7816000);
  assert.equal(k.direct.balance, 0);
  await kashif.post('/api/pilot/feedback', { rating: 5, text: 'Clear reporting.' });
  const L = await ops.get('/api/ledger');
  assert.ok(L.pilot.records.length >= 10);
  // Simulated tokens: 320,000 PAT minted at signing, all retired by delivery, nothing left outstanding.
  const T = k.direct.tokens;
  assert.equal(T.simulated, true);
  assert.equal(T.minted, 320000);
  assert.equal(T.burned, 320000);
  assert.equal(T.outstanding, 0);
  assert.equal(T.tx.filter((x) => x.type === 'hold').length, 1);
  assert.equal(L.pilot.tokens.outstanding, 0);
});

test('sandbox autopilot takes a new investor from reservation to payout', async () => {
  const anyone = client(), inv = client();
  await anyone.post('/api/sandbox/reset');
  await anyone.post('/api/sandbox/clock', { day: -10 });
  await login(inv, '03451231234', 'Autopilot Investor');
  await inv.post('/api/kyc/cnic', { cnic: '3520212345673' }); await inv.post('/api/kyc/bank', { iban: 'PK36SCBL0000001123456704' });
  await inv.post('/api/kyc/suitability', { answers: { lock: true, loss: true, share: true } });
  await inv.post('/api/kyc/acknowledge', { kfs: true, shariah: true, risk: true });
  const { order } = await inv.post('/api/orders', { kind: 'pool', pool: 'core', amount: 200000 });
  await inv.post(`/api/orders/${order.id}/pay`, {});
  await anyone.post('/api/sandbox/clock', { day: 70 });
  let p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'held');
  assert.ok(p.updates.length > 0);
  await anyone.post('/api/sandbox/clock', { day: 190 });
  p = await inv.get('/api/portfolio');
  assert.equal(p.stage, 'paidout');
});
