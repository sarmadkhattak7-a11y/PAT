import React, { useEffect, useState } from 'react';
import { api, useApp, useRouter, useAction, Link, Err, Loading, fmt, rs, pkr } from '../lib.jsx';
import { LoginForm } from './Login.jsx';

export default function Reserve() {
  const { user, clock, pricing, refresh } = useApp();
  const { path, go } = useRouter();
  const qs = new URLSearchParams(path.split('?')[1] || '');
  const spec = { kind: qs.get('kind') || 'pool', pool: qs.get('pool') || 'starter', field: qs.get('field'), amount: Number(qs.get('amount')) || 100000 };
  const [order, setOrder] = useState(null);
  const kycDone = user && user.cnicOk && user.bankOk && user.limit != null;
  const step = !user ? 0 : user.role !== 'investor' ? -1 : !kycDone ? 1 : !user.acked ? 2 : !order ? 3 : order.status === 'paid' ? 5 : 4;
  const labels = ['Account', 'Verify', 'Key facts', 'Confirm', 'Pay', 'Done'];
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 48, maxWidth: 720 }}>
      <div className="stack">
        <Link to={spec.kind === 'field' ? '/field/' + spec.field : '/'} className="small">← Back</Link>
        <div className="steps" aria-label="Progress">{labels.map((l, i) => <span key={l} className={i === step ? 'on' : i < step ? 'done' : ''}>{i + 1}. {l}</span>)}</div>
        <div className="card lift pad-l">
          {step === -1 && <p>Reservations are for investor accounts. You are signed in as {user.role}.</p>}
          {step === 0 && <LoginForm title="Create your investor account" />}
          {step === 1 && <Kyc user={user} />}
          {step === 2 && <KeyFacts />}
          {step === 3 && <Confirm spec={spec} user={user} onReserved={setOrder} />}
          {step === 4 && <Pay order={order} onPaid={setOrder} />}
          {step === 5 && (
            <div className="stack">
              <div className="kicker">Payment received</div>
              <h2>{pkr(order.amount)} is in escrow</h2>
              <p className="muted">Reference {order.pay_ref}. Your place is confirmed. You can still withdraw for a full refund until {clock.dates.withdrawBy}. On {clock.dates.close} the market closes; fields at 80% or more go ahead, growers sign their Salam contracts and are paid on signing, and your PAT are minted then. If a field does not go ahead, that part is refunded by {clock.dates.refund}.</p>
              <div className="row"><button className="btn primary" onClick={() => go('/portfolio')}>See my wheat</button><button className="btn" onClick={() => go('/')}>Back to the marketplace</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kyc({ user }) {
  const a = useAction();
  const [cnic, setCnic] = useState(''), [iban, setIban] = useState(''), [ans, setAns] = useState({});
  const Q = [['lock', 'Can you leave this money untouched until at least April 2027?'], ['loss', 'Could you cope if you got back 15% less than you put in?'], ['share', 'Is this less than a tenth of your savings?']];
  return (
    <div className="stack">
      <h2>Verify your identity</h2>
      <p className="muted small">Required by the regulator before any money moves. Takes about two minutes.</p>
      <div className="sandbox">Sandbox: NADRA and bank-title checks are simulated. Any well-formed CNIC and IBAN are accepted.</div>
      <form className="stack-s" onSubmit={(e) => { e.preventDefault(); a.run(() => api('/api/kyc/cnic', { cnic })); }}>
        <label className="field">1 · CNIC number {user.cnicOk && <span className="tag ok">Verified</span>}
          {!user.cnicOk && <input className="inp" inputMode="numeric" placeholder="35202-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} />}</label>
        {!user.cnicOk && <button className="btn" disabled={a.busy}>Check with NADRA</button>}
      </form>
      {user.cnicOk && (
        <form className="stack-s" onSubmit={(e) => { e.preventDefault(); a.run(() => api('/api/kyc/bank', { iban })); }}>
          <label className="field">2 · Bank account (IBAN) {user.bankOk && <span className="tag ok">{user.iban}</span>}<span className="hint">Refunds and sale proceeds are paid here, in your name only.</span>
            {!user.bankOk && <input className="inp" placeholder="PK36 SCBL 0000 0011 2345 6702" value={iban} onChange={(e) => setIban(e.target.value)} />}</label>
          {!user.bankOk && <button className="btn" disabled={a.busy}>Verify account title</button>}
        </form>
      )}
      {user.cnicOk && user.bankOk && (
        <form className="stack-s" onSubmit={(e) => { e.preventDefault(); a.run(() => api('/api/kyc/suitability', { answers: ans })); }}>
          <b style={{ fontWeight: 500 }}>3 · Three questions set your season limit</b>
          {Q.map(([k, q]) => (
            <fieldset key={k} className="card flat" style={{ border: 0, margin: 0 }}>
              <legend className="small" style={{ padding: 0, marginBottom: 6 }}>{q}</legend>
              <div className="chips">{[true, false].map((v) => <button type="button" key={String(v)} className="chip" aria-pressed={ans[k] === v} onClick={() => setAns({ ...ans, [k]: v })}>{v ? 'Yes' : 'No'}</button>)}</div>
            </fieldset>
          ))}
          {user.limit === 0 && <div className="note">This product is not suitable if you may need the money before April. Nothing has been charged.</div>}
          <button className="btn primary" disabled={a.busy || Object.keys(ans).length < 3}>Set my limit</button>
        </form>
      )}
      <Err e={a.error} />
    </div>
  );
}

// Key facts statement: one page, plain words, before any money moves. Modelled on the key-information documents
// regulated crowdfunding platforms must show, with the Shariah structure stated plainly.
function KeyFacts() {
  const { pricing: P, clock } = useApp();
  const a = useAction();
  const [t, setT] = useState({ kfs: false, shariah: false, risk: false });
  const R = (k, v) => <tr><td className="muted" style={{ width: '40%' }}>{k}</td><td>{v}</td></tr>;
  return (
    <div className="stack">
      <div className="kicker">Key facts · Rabi 2026-27 wheat Salam</div>
      <h2>Read this before you buy</h2>
      <table className="tbl small"><tbody>
        {R('What you buy', `Grade 1 wheat, bought in advance under Salam. 1 PAT = 1 kg. You own the wheat once it is delivered to the certified warehouse.`)}
        {R('Price', `Rs ${fmt(P.price)} a maund (40 kg) to the grower, paid in full when the contract is signed.`)}
        {R('Barak fees', `2.5% at purchase (in the Rs ${P.kgCost.toFixed(2)} per kg you pay). 3.5% of sale proceeds when sold. Storage Rs ${P.carry} a maund if you hold to September.`)}
        {R('When you get money back', `April (at harvest) or September (after storage), your choice by ${clock.dates.electBy}. After delivery you can also sell early at that day's price.`)}
        {R('Lock-up', `From ${clock.dates.close} until the wheat is delivered in April. Salam wheat cannot be resold before delivery.`)}
        {R('Change your mind', `Cancel an unpaid reservation any time. Withdraw a paid order for a full refund until ${clock.dates.withdrawBy}.`)}
        {R('If a field does not raise 80%', `No contract is formed; your money is refunded in full by ${clock.dates.refund}.`)}
        {R('If wheat is not delivered', `The grower delivers later (up to 30 days) or refunds the price with no profit added; Barak returns its fee on that part.`)}
        {R('Main risk', `Wheat prices. Below Rs ${fmt(P.breakeven)} per 40 kg you get back less than you paid. A 2024-style crash (Rs ${fmt(P.stress)}) would mean a loss of about ${Math.abs(Math.round(P.stressRet * 100))}%.`)}
        {R('Not covered', 'This is not a bank deposit and is not guaranteed by Barak, the bank or the government. Crop insurance (takaful) is not in place this season.')}
      </tbody></table>
      {[['kfs', 'I have read the key facts and the Salam and agency terms.'], ['shariah', 'I understand this is a Salam purchase through Barak as my agent, not a loan, and no interest is involved.'], ['risk', 'I understand I can lose money and my money is locked until the wheat is delivered.']].map(([k, l]) => (
        <label key={k} className="row small" style={{ gap: 10, alignItems: 'flex-start', minHeight: 32 }}><input type="checkbox" checked={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.checked })} style={{ marginTop: 3 }} /> {l}</label>
      ))}
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy || !(t.kfs && t.shariah && t.risk)} onClick={() => a.run(() => api('/api/kyc/acknowledge', t))}>Continue</button>
    </div>
  );
}

function Confirm({ spec, user, onReserved }) {
  const { clock, pricing } = useApp();
  const [amount, setAmount] = useState(spec.amount);
  const [q, setQ] = useState(null), [mkt, setMkt] = useState(null);
  const a = useAction();
  useEffect(() => { api('/api/market').then(setMkt); }, []);
  useEffect(() => { const t = setTimeout(() => api('/api/quote', { ...spec, amount }).then(setQ).catch((e) => a.setError(e.message)), 200); return () => clearTimeout(t); }, [amount]);
  if (user.limit === 0) return <p>Your answers show this product is not suitable for you this season.</p>;
  if (!mkt || !q) return <p className="muted">Working out where your money goes…</p>;
  const byId = Object.fromEntries(mkt.listings.map((l) => [l.id, l]));
  const pat = q.alloc.reduce((s, x) => s + x.pat, 0), left = user.limit - mkt.exposure;
  const name = spec.kind === 'pool' ? mkt.pools.find((p) => p.key === spec.pool).name : byId[spec.field].grower;
  return (
    <div className="stack">
      <div className="kicker">Confirm your reservation</div>
      <h2>{name}</h2>
      <label className="field">Amount (PKR)<span className="hint">Season limit {rs(user.limit)}; you can add up to {rs(Math.max(0, left))}.</span>
        <input className="inp" inputMode="numeric" value={fmt(amount)} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} /></label>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Field</th><th className="r">Amount</th><th className="r">PAT (kg)</th><th className="r">Field paid</th></tr></thead>
        <tbody>{q.alloc.map((x) => <tr key={x.field}><td>{byId[x.field].grower}<div className="xs faint">{byId[x.field].village}</div></td><td className="r">{rs(x.amount)}</td><td className="r">{fmt(x.pat)}</td><td className="r">{Math.round(byId[x.field].paidFrac * 100)}%</td></tr>)}</tbody>
        <tfoot><tr><td><b style={{ fontWeight: 500 }}>Total</b></td><td className="r"><b style={{ fontWeight: 500 }}>{rs(q.placed)}</b></td><td className="r"><b style={{ fontWeight: 500 }}>{fmt(pat)}</b></td><td /></tr></tfoot>
      </table></div>
      {q.split && <div className="note">One investor can hold at most 20% of a field, so the rest is spread across more A-rated fields.</div>}
      {q.short > 250 && <div className="note">{rs(q.short)} did not fit in the room left on these fields.</div>}
      <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
        <li>Price: Rs {pricing.kgCost.toFixed(2)} per PAT (Rs {fmt(pricing.price)} per 40 kg to the grower, plus 2.5% Barak fee). Amounts are rounded down to whole PAT.</li>
        <li>Pay within 24 hours or the reservation lapses. Money is held in escrow at the bank.</li>
        <li>Fields under 80% paid on {clock.dates.close} do not go ahead; that part is refunded by {clock.dates.refund}.</li>
        <li>This is a Salam purchase under AAOIFI Shariah Standard 10, not a deposit. You can lose money if wheat prices fall.</li>
      </ul>
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy || q.placed < 25000} onClick={async () => { const r = await a.run(() => api('/api/orders', { ...spec, amount })); if (r) onReserved(r.order); }}>Reserve {pkr(q.placed)}</button>
    </div>
  );
}

function Pay({ order, onPaid }) {
  const [method, setMethod] = useState('raast');
  const a = useAction();
  const M = { raast: ['Raast', 'Instant from any bank app, free'], ibft: ['Bank transfer (IBFT)', 'Usually within minutes'], card: ['Debit card', '1LINK / PayPak'] };
  return (
    <div className="stack">
      <div className="kicker">Reserved · pay by {order.expires || 'tomorrow'}</div>
      <h2>Pay {pkr(order.amount)} into escrow</h2>
      <div className="chips" role="group" aria-label="Payment method">{Object.entries(M).map(([k, [l]]) => <button key={k} className="chip" aria-pressed={method === k} onClick={() => setMethod(k)}>{l}</button>)}</div>
      <div className="card flat stack-s">
        <div className="between small"><span className="muted">Pay to</span><b style={{ fontWeight: 500 }}>Barak Salam escrow · Bank Alfalah Islamic</b></div>
        <div className="between small"><span className="muted">IBAN</span><span className="hash" style={{ color: 'var(--text)' }}>PK00 ALFH 0000 0000 0000 0001</span></div>
        <div className="between small"><span className="muted">Reference (must match)</span><b style={{ fontWeight: 500 }}>{order.pay_ref}</b></div>
        <div className="between small"><span className="muted">Amount</span><b style={{ fontWeight: 500 }}>{pkr(order.amount)}</b></div>
        <span className="xs faint">{M[method][1]}</span>
      </div>
      <div className="sandbox">Sandbox: no bank is connected. The button below stands in for the bank's payment confirmation.</div>
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy} onClick={async () => { const r = await a.run(() => api(`/api/orders/${order.id}/pay`, { method }), 'Payment received'); if (r) onPaid(r.order); }}>Simulate bank confirmation</button>
    </div>
  );
}
