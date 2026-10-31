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
  const step = !user ? 0 : user.role !== 'investor' ? -1 : !kycDone ? 1 : !order ? 2 : order.status === 'paid' ? 4 : 3;
  const labels = ['Account', 'Verify', 'Confirm', 'Pay', 'Done'];
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 48, maxWidth: 720 }}>
      <div className="stack">
        <Link to={spec.kind === 'field' ? '/field/' + spec.field : '/'} className="small">← Back</Link>
        <div className="steps" aria-label="Progress">{labels.map((l, i) => <span key={l} className={i === step ? 'on' : i < step ? 'done' : ''}>{i + 1}. {l}</span>)}</div>
        <div className="card lift pad-l">
          {step === -1 && <p>Reservations are for investor accounts. You are signed in as {user.role}.</p>}
          {step === 0 && <LoginForm title="Create your investor account" />}
          {step === 1 && <Kyc user={user} />}
          {step === 2 && <Confirm spec={spec} user={user} onReserved={setOrder} />}
          {step === 3 && <Pay order={order} onPaid={setOrder} />}
          {step === 4 && (
            <div className="stack">
              <div className="kicker">Payment received</div>
              <h2>{pkr(order.amount)} is in escrow</h2>
              <p className="muted">Reference {order.pay_ref}. Your place is confirmed. On {clock.dates.close} the market closes; fields at 80% or more go ahead and growers are paid on {clock.dates.mint}, when your PAT are minted. If a field does not go ahead, that part is refunded by {clock.dates.refund}.</p>
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
      {q.split && <div className="note">One investor can hold at most 20% of a field, so the rest is spread across more Grade A fields.</div>}
      {q.short > 250 && <div className="note">{rs(q.short)} did not fit in the room left on these fields.</div>}
      <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
        <li>Price: Rs {pricing.kgCost.toFixed(4)} per PAT (Rs {fmt(pricing.price)} per 40 kg to the grower, plus 2.5% Barak fee).</li>
        <li>Pay within 24 hours or the reservation lapses. Money is held in escrow at the bank.</li>
        <li>Fields under 80% paid on {clock.dates.close} do not go ahead; that part is refunded by {clock.dates.refund}.</li>
        <li>This is a Shariah-compliant Salam purchase, not a deposit. You can lose money if wheat prices fall.</li>
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
        <div className="between small"><span className="muted">Pay to</span><b style={{ fontWeight: 500 }}>Barak Salam Escrow · Bank Islami</b></div>
        <div className="between small"><span className="muted">{method === 'raast' ? 'Raast ID' : 'IBAN'}</span><span className="hash" style={{ color: 'var(--text)' }}>{method === 'raast' ? 'barak.escrow@raast' : 'PK89BKIP0000000000000000'}</span></div>
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
