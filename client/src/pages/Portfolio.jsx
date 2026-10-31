import React, { useState } from 'react';
import { api, useApp, useData, useRouter, useAction, Link, Tag, Stat, Loading, Err, Timeline, fmt, rs, pkr, pct, Spark } from '../lib.jsx';
import { LOCAL } from '../lib.jsx';
import { LoginForm } from './Login.jsx';

const ORDER = { reserved: ['watch', 'Reserved · unpaid'], paid: ['info', 'Paid · in escrow'], expired: ['done', 'Expired'], cancelled: ['done', 'Cancelled'], lapsed: ['done', 'Lapsed unpaid'], allotted: ['ok', 'Allotted'], refunded: ['done', 'Refunded'], tokens: ['ok', 'PAT minted'] };
const EV = { mint: 'Minted · locked', unlock: 'Unlocked · in warehouse', transfer: 'Transfer', burn: 'Burned · sold', shortfall: 'Shortfall · insured' };

export default function Portfolio() {
  const { user, clock, pricing } = useApp();
  const { data, error } = useData(user && user.role === 'investor' ? '/api/portfolio' : null);
  const { go } = useRouter();
  if (!user) return <div className="wrap" style={{ paddingTop: 48 }}><div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}><LoginForm /></div></div>;
  if (user.role !== 'investor') return <div className="wrap" style={{ padding: 48 }}><p>This page is for investor accounts.</p></div>;
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const v = data.value;
  const got = data.payouts.reduce((s, p) => s + p.net, 0) + data.cash.filter((c) => c.type === 'insurance').reduce((s, c) => s + c.amount, 0);
  const HEAD = {
    none: ['No wheat yet', 'Pick a pool or a field in the marketplace to start.'],
    reserved: ['Reserved, waiting for payment', 'Pay within 24 hours to keep your place.'],
    waiting: ['Paid and waiting for the close', `Your money is in escrow. The market closes on ${clock.dates.close}.`],
    signing: ['Contracts signed', `Growers are paid on ${clock.dates.mint}, when your PAT are minted.`],
    held: ['Your wheat is growing', 'Tokens are locked until the wheat is weighed into the warehouse in April.'],
    stored: ['Your wheat is in the warehouse', 'Every PAT is backed by graded wheat under an electronic warehouse receipt.'],
    paidout: ['Paid out', 'Your wheat has been sold and the proceeds sent to your bank account.'],
    refunded: ['Refunded', 'The fields you backed did not go ahead. Your money has been returned.'],
  }[data.stage];
  return (
    <div className="wrap stack-l" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <section className="split">
        <div className="stack">
          <div className="kicker">My wheat · {pricing.season}</div>
          <h1>{HEAD[0]}</h1>
          <p className="muted">{HEAD[1]}</p>
          <div className="card"><div className="between small muted"><span>Season</span><span>{clock.date}</span></div><Timeline clock={clock} /></div>
          {data.orders.filter((o) => o.status === 'reserved' && clock.day <= o.expiresDay).map((o) => <PayNow key={o.id} o={o} />)}
        </div>
        <div className="card lift pad-l">
          {v ? (
            <>
              <div className="kicker">{data.stage === 'paidout' ? 'Paid out' : 'Value today'}</div>
              {data.stage === 'paidout' ? (
                <><div className="huge">{pkr(got)}</div><div className="small muted">net sale proceeds plus insurance, from {pkr(v.cost)} put in · <span className={got >= v.cost ? 'up' : 'down'}>{pct(got / v.cost - 1)}</span></div></>
              ) : (
                <><div className="huge">{pkr(v.markNow)}</div><div className="small muted">{fmt(v.pat)} PAT ({(v.pat / 40).toFixed(1)} maund) at today's PMEX Rs {fmt(v.price)}, after fee and storage · <span className={v.retNow >= 0 ? 'up' : 'down'}>{pct(v.retNow)}</span> on {pkr(v.cost)}</div></>
              )}
              {data.stage !== 'paidout' && <><hr className="rule" />
              <table className="tbl small"><tbody>{v.scenarios.map((s) => <tr key={s.label}><td>{s.label}</td><td className="r muted">Rs {fmt(s.px)}</td><td className="r">{pkr(s.value)}</td><td className={'r ' + (s.ret >= 0 ? 'up' : 'down')}>{pct(s.ret)}</td></tr>)}</tbody></table>
              <span className="xs faint">Break-even Rs {fmt(v.breakeven)} per 40 kg. Before withholding tax.</span></>}
            </>
          ) : data.waiting ? (
            <><div className="kicker">In escrow</div><div className="huge">{pkr(data.waiting)}</div><div className="small muted">becomes about {fmt(Math.floor(data.waiting / pricing.kgCost))} PAT if every field goes ahead</div></>
          ) : (
            <div className="stack-s"><div className="kicker">Start</div><p className="muted">Your season limit is {rs(user.limit || 0)}.</p><button className="btn primary" onClick={() => go('/')}>Go to the marketplace</button></div>
          )}
        </div>
      </section>

      {data.holdings.length > 0 && (
        <section className="stack">
          <h2>Your growers</h2>
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Grower</th><th className="r">PAT (kg)</th><th>Status</th><th className="r">Crop coverage</th><th>Warehouse receipt</th></tr></thead>
            <tbody>{data.holdings.map((h) => (
              <tr key={h.field}><td>{h.grower}<div className="xs faint">{h.field} · {h.village}</div></td><td className="r">{fmt(h.pat)}</td>
                <td>{h.locked ? <Tag k="info">Locked · growing</Tag> : <Tag k="ok">Unlocked · in warehouse</Tag>}</td>
                <td className="r">{h.ndvi != null && !h.delivery ? <Tag k={h.cov >= 1.3 ? 'ok' : h.cov >= 1.1 ? 'watch' : 'risk'}>{h.cov.toFixed(2)}×</Tag> : '–'}</td>
                <td>{h.delivery ? <span className="small">{h.delivery.ewr} · {fmt(h.delivery.kg)} kg · {h.delivery.moisture}%</span> : <span className="small muted">Due by {clock.dates.deliverBy}</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="xs faint">Coverage is the field's estimated yield divided by the wheat it owes. 1.5× means it should grow 50% more than it has to deliver.</p>
        </section>
      )}

      {(data.pat > 0 || data.stage === 'signing') && !clock.saleSep && <Election data={data} />}
      {data.holdings.some((h) => !h.locked) && <Transfer data={data} />}
      {data.payouts.length > 0 && <Statement data={data} />}

      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s">
          <h2>Orders and documents</h2>
          {!data.orders.length && <p className="muted small">None yet.</p>}
          {data.orders.map((o) => {
            const [k, l] = ORDER[o.status] || ['info', o.status];
            return (
              <div key={o.id} className="stack-s" style={{ borderBottom: '1px solid var(--divider)', paddingBottom: 10 }}>
                <div className="between"><b style={{ fontWeight: 500 }}>{o.kind === 'pool' ? (o.pool === 'core' ? 'Large farms pool' : 'Starter pool') : o.lines[0] && o.lines[0].grower} · {pkr(o.amount)}</b><Tag k={k}>{l}</Tag></div>
                <span className="xs faint">{o.id} · reserved {o.reservedDate}{o.paidDate ? ' · paid ' + o.paidDate + ' by ' + o.method : ''} · {o.lines.length} field{o.lines.length > 1 ? 's' : ''}</span>
                {['paid', 'allotted', 'tokens', 'refunded'].includes(o.status) && <Link to={'/doc/' + o.id} className="small">Purchase note and Salam terms →</Link>}
              </div>
            );
          })}
        </div>
        <div className="card stack-s">
          <h2>Money and token record</h2>
          {[...data.cash.map((c) => ({ k: 'c' + c.id, day: c.day, date: c.date, t: c.memo + (c.n > 1 ? ' · ' + c.n + ' fields' : ''), v: (c.type === 'refund' ? '' : c.amount < 0 ? '−' : '') + rs(Math.abs(c.amount)), cls: c.type === 'deposit' ? '' : 'up' })),
            ...data.events.map((e) => ({ k: 't' + e.seq, day: e.day, date: e.date, t: `${EV[e.type]} · ${e.grower}`, v: (e.to_user === user.id ? '+' : '−') + fmt(e.pat) + ' PAT', cls: 'muted', hash: e.hash }))]
            .sort((a, b) => b.day - a.day).slice(0, 30).map((r) => (
              <div key={r.k} className="ev" style={{ gridTemplateColumns: '90px minmax(0,1fr) auto' }}><span className="xs faint">{r.date}</span><span className="small">{r.t}{r.hash && <div className="hash">{r.hash.slice(0, 16)}…</div>}</span><span className={'small ' + r.cls}>{r.v}</span></div>
            ))}
          {!data.cash.length && <p className="muted small">Nothing yet.</p>}
          <Link to="/ledger" className="small">Check every token on the public ledger →</Link>
        </div>
      </section>
    </div>
  );
}

function PayNow({ o }) {
  const a = useAction();
  return (
    <div className="card" style={{ boxShadow: '0 0 0 2px var(--watch-fg)' }}>
      <div className="between"><b style={{ fontWeight: 500 }}>{pkr(o.amount)} reserved · pay by {o.expires}</b><Tag k="watch">Unpaid</Tag></div>
      <span className="small muted">Reference {o.pay_ref} · Raast ID barak.escrow@raast</span>
      <div className="sandbox">Sandbox: the button stands in for the bank's payment confirmation.</div>
      <Err e={a.error} />
      <div className="row"><button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api(`/api/orders/${o.id}/pay`, { method: 'raast' }), 'Payment received')}>Simulate bank confirmation</button>
        <button className="btn ghost" disabled={a.busy} onClick={() => a.run(() => api(`/api/orders/${o.id}/cancel`, {}), 'Reservation cancelled')}>Cancel</button></div>
    </div>
  );
}

function Election({ data }) {
  const { clock, pricing, user } = useApp();
  const a = useAction();
  const cur = data.election;
  const [win, setWin] = useState(cur ? cur.win : 'apr'), [filer, setFiler] = useState(cur ? !!cur.filer : user.filer);
  const v = data.value;
  const got = data.payouts.reduce((s, p) => s + p.net, 0) + data.cash.filter((c) => c.type === 'insurance').reduce((s, c) => s + c.amount, 0); if (!v) return null;
  const closed = clock.day > clock.DAY.electBy;
  const tooSmall = v.pat < pricing.minSep;
  return (
    <section className="card stack">
      <div className="between"><h2>When do you want to sell?</h2><span className="small muted">{closed ? 'Choice closed ' + clock.dates.electBy : 'Choose by ' + clock.dates.electBy + (cur ? ' · saved' : ' · April if you do not choose')}</span></div>
      <div className="grid g2">
        {[['apr', 'April, at harvest', 'Sold as it is delivered. No storage charge. Prices are usually lowest at harvest.', v.apr, `at about Rs ${fmt(Math.max(clock.prices.pmex, pricing.support))}`],
          ['sep', 'September, after storage', `Stored in the certified warehouse until September. Rs ${pricing.carry} per maund storage. Needs at least ${pricing.minSep} PAT.`, v.sep, `at the Rs ${fmt(pricing.ref)} estimate`]].map(([k, t, b, s, at]) => (
          <button key={k} className="card" aria-pressed={win === k} disabled={closed || (k === 'sep' && tooSmall)} onClick={() => setWin(k)} style={{ textAlign: 'start', cursor: 'pointer', border: 0, boxShadow: win === k ? '0 0 0 2px var(--accent)' : 'var(--shadow)', opacity: k === 'sep' && tooSmall ? 0.5 : 1 }}>
            <b style={{ fontWeight: 500 }}>{t}</b><span className="small muted">{b}</span>
            <span className="small">Estimate {pkr(s.net)} net {at}</span>
            <span className="xs faint">Gross {rs(s.gross)} − fee {rs(s.fee)} − storage {rs(s.storage)} − tax {rs(s.tax)}</span>
          </button>
        ))}
      </div>
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={filer} disabled={closed} onChange={(e) => setFiler(e.target.checked)} /> I am on FBR's Active Taxpayer List (withholding {filer ? '5.5%' : '11%'} instead of {filer ? '11%' : '5.5%'})</label>
      <Err e={a.error} />
      {!closed && <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={() => a.run(() => api('/api/election', { win, filer }), 'Sale choice saved')}>Save my choice</button>}
    </section>
  );
}

function Transfer({ data }) {
  const a = useAction();
  const ul = data.holdings.filter((h) => !h.locked);
  const [field, setField] = useState(ul[0].field), [to, setTo] = useState(''), [pat, setPat] = useState('');
  return (
    <section className="card stack">
      <h2>Transfer PAT</h2>
      <p className="small muted">Unlocked PAT can move to another verified investor. The ledger checks both sides' KYC.</p>
      <div className="grid g3">
        <label className="field">From grower<select className="inp" value={field} onChange={(e) => setField(e.target.value)}>{ul.map((h) => <option key={h.field} value={h.field}>{h.grower} ({fmt(h.pat)} PAT)</option>)}</select></label>
        <label className="field">Recipient mobile<input className="inp" inputMode="tel" placeholder="0300 1234567" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field">PAT<input className="inp" inputMode="numeric" value={pat} onChange={(e) => setPat(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <Err e={a.error} />
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={a.busy || !to || !pat} onClick={() => a.run(() => api('/api/transfer', { to, field, pat: Number(pat) }), 'Transferred')}>Transfer</button>
    </section>
  );
}

function Statement({ data }) {
  return (
    <section className="card stack">
      <h2>Settlement statement</h2>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Sale</th><th className="r">PAT</th><th className="r">Price / 40 kg</th><th className="r">Gross</th><th className="r">Fee 3.5%</th><th className="r">Storage</th><th className="r">Tax withheld</th><th className="r">Net paid</th></tr></thead>
        <tbody>{data.payouts.map((p) => <tr key={p.id}><td>{p.win === 'apr' ? 'April' : 'September'}</td><td className="r">{fmt(p.pat)}</td><td className="r">{fmt(p.price)}</td><td className="r">{rs(p.gross)}</td><td className="r">{rs(p.fee)}</td><td className="r">{rs(p.storage)}</td><td className="r">{rs(p.tax)}</td><td className="r"><b style={{ fontWeight: 500 }}>{rs(p.net)}</b></td></tr>)}</tbody>
      </table></div>
      <span className="xs faint">Withholding under s.153 is shown at the estimated TY2027 rate until confirmed by Barak's tax adviser. Keep this statement for your return.</span>
    </section>
  );
}

export function OrderDoc({ id }) {
  const { user, pricing, clock } = useApp();
  const { data } = useData(user && user.role === 'investor' ? '/api/portfolio' : null);
  if (!data) return <Loading />;
  const o = data.orders.find((x) => x.id === id);
  if (!o) return <div className="wrap" style={{ padding: 48 }}>Not found.</div>;
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 48, maxWidth: 820 }}>
      <div className="row" style={{ marginBottom: 12 }}><Link to="/portfolio" className="small">← My wheat</Link><div style={{ flex: 1 }} />{!LOCAL && <button className="btn small" onClick={() => print()}>Print or save as PDF</button>}</div>
      <article className="card pad-l stack">
        <div className="kicker">Purchase note · Salam</div>
        <h1>{o.id}</h1>
        <p className="muted small">Buyer: {user.name} ({user.phone}) · Agent: Barak AgriTech (Pvt) Ltd under the Wakalah agreement · Season {pricing.season}</p>
        <table className="tbl"><thead><tr><th>Seller (grower)</th><th className="r">Paid</th><th className="r">Kept</th><th className="r">PAT (kg)</th><th className="r">Refunded</th></tr></thead>
          <tbody>{o.lines.map((l) => <tr key={l.field_id}><td>{l.grower} · {l.field_id}<div className="xs faint">{l.village}</div></td><td className="r">{rs(l.amount)}</td><td className="r">{l.kept != null ? rs(l.kept) : 'at close'}</td><td className="r">{l.pat != null ? fmt(l.pat) : 'at close'}</td><td className="r">{l.refund ? rs(l.refund) : '–'}</td></tr>)}</tbody></table>
        <h3>Terms</h3>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Subject matter: wheat, Grade 1 (moisture 10% or less, no foreign matter, under 2% broken grain), 20 maund per contracted acre.</li>
          <li>Price: Rs {fmt(pricing.price)} per 40 kg, paid in full to the grower at contract on or before {clock.dates.mint}. Barak's purchase fee of 2.5% is added to the buyer's price.</li>
          <li>Delivery: to the certified warehouse by {clock.dates.deliverBy}. An electronic warehouse receipt is issued on intake.</li>
          <li>Each PAT represents 1 kg of the wheat owed. PAT are non-transferable until the warehouse receipt is issued.</li>
          <li>Shortfall: if less wheat is delivered, the gap is covered by crop insurance or later delivery, never by the grower's land or cash.</li>
          <li>Sale: in April or September at the buyer's election; Barak sells as agent and pays proceeds less a 3.5% fee, storage and withholding tax.</li>
          <li>Funds are held in escrow at the bank. A field under 80% paid at close does not go ahead and is refunded in full.</li>
        </ol>
        <p className="xs faint">Generated by the working prototype from the platform's records. Not a binding contract.</p>
      </article>
    </div>
  );
}
