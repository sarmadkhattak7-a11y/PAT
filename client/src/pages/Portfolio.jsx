import React, { useState } from 'react';
import { api, useApp, useData, useRouter, useAction, Link, Tag, Stat, Loading, Err, Timeline, fmt, rs, pkr, pct, lakh, Spark } from '../lib.jsx';
import { LOCAL } from '../lib.jsx';
import { LoginForm } from './Login.jsx';
import { DirectPortfolio } from './Direct.jsx';

const ORDER = { reserved: ['watch', 'Reserved · unpaid'], paid: ['info', 'Paid · in escrow'], expired: ['done', 'Expired'], cancelled: ['done', 'Cancelled'], lapsed: ['done', 'Lapsed unpaid'], allotted: ['ok', 'Allotted'], refunded: ['done', 'Refunded'], tokens: ['ok', 'PAT minted'], withdrawn: ['done', 'Withdrawn · refunded'] };
const EV = { mint: 'Minted · locked', unlock: 'Unlocked · in warehouse', transfer: 'Transfer', burn: 'Burned · sold', shortfall: 'Undelivered · price refunded' };

export default function Portfolio() {
  const { user, clock, pricing } = useApp();
  const { data, error } = useData(user && user.role === 'investor' ? '/api/portfolio' : null);
  const { go } = useRouter();
  if (!user) return <div className="wrap" style={{ paddingTop: 48 }}><div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}><LoginForm /></div></div>;
  if (user.role !== 'investor') return <div className="wrap" style={{ padding: 48 }}><p>This page is for investor accounts.</p></div>;
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  if (data.direct) return <DirectPortfolio p={data.direct} />;
  const v = data.value;
  const got = data.payouts.reduce((s, p) => s + p.net, 0) + data.cash.filter((c) => c.type === 'refund' && /undelivered/.test(c.memo)).reduce((s, c) => s - c.amount, 0);
  const HEAD = {
    none: ['No wheat yet', 'Pick a pool or a field in the marketplace to start.'],
    reserved: ['Reserved, waiting for payment', 'Pay within 24 hours to keep your place.'],
    waiting: ['Paid and waiting for the close', `Your money is in escrow. You can withdraw it until ${clock.dates.withdrawBy}. The market closes on ${clock.dates.close}.`],
    signing: ['Growers are signing their contracts', 'Each grower is paid the day they sign, and your PAT for that field are minted then.'],
    held: ['Your wheat is growing', 'Tokens are locked until the wheat is weighed into the warehouse in April. Season updates arrive below and in your inbox.'],
    short: ['Some wheat is still due', 'A grower delivered less than owed. Barak, as your agent, is extending the delivery or recovering the price for the missing part.'],
    stored: ['Your wheat is in the warehouse', 'Every PAT is backed by graded wheat under an electronic warehouse receipt. You can sell early or wait for your chosen sale.'],
    paidout: ['Paid out', 'Your wheat has been sold and the proceeds sent to your bank account.'],
    refunded: ['Refunded', 'The fields you backed did not go ahead, or you withdrew. Your money has been returned.'],
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
          {data.stage === 'signing' && (
            <div className="card stack-s">
              <b style={{ fontWeight: 500 }}>Contract signing</b>
              {data.signing.map((s) => <div key={s.grower} className="between small"><span>{s.grower}</span>{s.paid ? <Tag k="ok">Signed and paid</Tag> : s.signed ? <Tag k="info">Signed · payment today</Tag> : <Tag k="watch">Waiting to sign</Tag>}</div>)}
              <span className="xs faint">Under Salam the full price is paid when the contract is made, so nothing is released to a grower who has not signed.</span>
            </div>
          )}
        </div>
        <div className="card lift pad-l">
          {v ? (
            <>
              <div className="kicker">{data.stage === 'paidout' ? 'Paid out' : 'Value today'}</div>
              {data.stage === 'paidout' ? (
                <><div className="huge">{pkr(got)}</div><div className="small muted">net, from {pkr(v.cost)} put in · <span className={got >= v.cost ? 'up' : 'down'}>{pct(got / v.cost - 1)}</span></div></>
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
            <thead><tr><th>Grower</th><th className="r">PAT (kg)</th><th>Status</th><th className="r">Crop cover</th><th>Delivery</th></tr></thead>
            <tbody>{data.holdings.map((h) => (
              <tr key={h.field}><td>{h.grower}<div className="xs faint">{h.field} · {h.village}</div></td><td className="r">{fmt(h.pat)}</td>
                <td>{h.status === 'short' ? <Tag k="watch">Part delivered</Tag> : h.locked ? <Tag k="info">Locked · growing</Tag> : <Tag k="ok">In warehouse</Tag>}</td>
                <td className="r">{h.ndvi != null && h.locked ? <Tag k={h.cov >= 1.3 ? 'ok' : h.cov >= 1.1 ? 'watch' : 'risk'}>{h.cov.toFixed(2)}×</Tag> : '–'}</td>
                <td className="small">{h.status === 'short' ? `${fmt(h.deliveredKg)} of ${fmt(h.owedKg)} kg${h.extension ? ' · rest due ' + h.extension : ''}` : h.delivery ? `${h.delivery.ewr} · moisture ${h.delivery.moisture}%` : <span className="muted">Due by {clock.dates.deliverBy}</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="xs faint">Crop cover is the field's estimated yield divided by the wheat it owes. 1.5× means it should grow 50% more than it has to deliver.</p>
        </section>
      )}

      {data.updates.length > 0 && (
        <section className="card stack-s">
          <div className="between"><h2>Season updates</h2><span className="small muted">From satellite checks and field officer visits</span></div>
          <div className="tl">{data.updates.slice(0, 8).map((u, i) => <div key={i} className="it"><span className="xs faint">{u.date}</span><span className={'dot ' + (u.k === 'ok' ? '' : 'watch')} /><span className="small"><b style={{ fontWeight: 500 }}>{u.t}.</b> <span className="muted">{u.b}</span></span></div>)}</div>
        </section>
      )}

      {data.canSellNow && <SellNow data={data} />}
      {(data.pat > 0 || data.stage === 'signing') && !clock.saleSep && clock.day <= clock.DAY.electBy && <Election data={data} />}
      {data.holdings.some((h) => !h.locked) && <Transfer data={data} />}
      {data.payouts.length > 0 && <Statement data={data} />}

      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s">
          <h2>Orders and documents</h2>
          {!data.orders.length && <p className="muted small">None yet.</p>}
          {data.orders.map((o) => <OrderRow key={o.id} o={o} />)}
        </div>
        <div className="stack">
          {data.zakat && (
            <div className="card stack-s">
              <h2>Zakat estimate</h2>
              <div className="big">{rs(data.zakat.due)}</div>
              <span className="small muted">2.5% of {rs(data.zakat.base)}, today's value of your wheat held for trade. Use the value on your own zakat date and ask your scholar about your situation.</span>
            </div>
          )}
          <div className="card stack-s">
            <h2>Money and token record</h2>
            {[...data.cash.map((c) => ({ k: 'c' + c.id, day: c.day, date: c.date, t: c.memo + (c.n > 1 ? ' · ' + c.n + ' fields' : ''), v: (c.amount < 0 && c.type !== 'refund' ? '−' : '') + rs(Math.abs(c.amount)), cls: c.type === 'deposit' ? '' : 'up' })),
              ...Object.values(data.events.reduce((g, e) => { const key = e.type + e.day + (e.to_user === user.id); (g[key] = g[key] || []).push(e); return g; }, {})).map((es) => ({ k: 't' + es[0].seq, day: es[0].day, date: es[0].date, t: `${EV[es[0].type]} · ${es.length > 1 ? es.length + ' growers' : es[0].grower}`, v: (es[0].to_user === user.id ? '+' : '−') + fmt(es.reduce((s, e) => s + e.pat, 0)) + ' PAT', cls: 'muted', hash: es[0].hash }))]
              .sort((a, b) => b.day - a.day).slice(0, 30).map((r) => (
                <div key={r.k} className="ev"><span className="xs faint">{r.date}</span><span className="small">{r.t}{r.hash && <div className="hash">{r.hash.slice(0, 16)}…</div>}</span><span className={'small ' + r.cls}>{r.v}</span></div>
              ))}
            {!data.cash.length && <p className="muted small">Nothing yet.</p>}
            <span className="xs faint">Each token event carries a hash linked to the one before, so a changed record shows. Barak publishes a reserve check each week: tokens outstanding against wheat owed or in the warehouse.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderRow({ o }) {
  const a = useAction(); const { clock } = useApp();
  const [k, l] = ORDER[o.status] || ['info', o.status];
  return (
    <div className="stack-s" style={{ borderBottom: '1px solid var(--divider)', paddingBottom: 10 }}>
      <div className="between"><b style={{ fontWeight: 500 }}>{o.kind === 'pool' ? (o.pool === 'core' ? 'Large farms pool' : 'Starter pool') : o.lines[0] && o.lines[0].grower} · {pkr(o.amount)}</b><Tag k={k}>{l}</Tag></div>
      <span className="xs faint">{o.id} · reserved {o.reservedDate}{o.paidDate ? ' · paid ' + o.paidDate + ' by ' + o.method : ''} · {o.lines.length} field{o.lines.length > 1 ? 's' : ''}</span>
      <div className="row" style={{ gap: 8 }}>
        {['paid', 'allotted', 'tokens', 'refunded'].includes(o.status) && <Link to={'/doc/' + o.id} className="small">Purchase note and Salam terms →</Link>}
        {o.withdrawable && <button className="btn small" disabled={a.busy} onClick={() => a.run(() => api(`/api/orders/${o.id}/withdraw`, {}), 'Withdrawn. Full refund on its way.')}>Withdraw (until {clock.dates.withdrawBy})</button>}
      </div>
      <Err e={a.error} />
    </div>
  );
}

function SellNow({ data }) {
  const a = useAction(); const { clock } = useApp();
  const [arm, setArm] = useState(false);
  const e = data.value && data.value.early;
  if (!e) return null;
  return (
    <section className="card stack-s">
      <div className="between"><h2>Sell now</h2><span className="small muted">Your wheat is in the warehouse, so it is yours to sell</span></div>
      <p className="small muted">Barak sells it for you today at Rs {fmt(clock.prices.pmex)} per 40 kg. Storage is charged only for the months it was stored.</p>
      <div className="grid g4">
        <div><div className="small muted">Gross</div><b style={{ fontWeight: 500 }}>{rs(e.gross)}</b></div>
        <div><div className="small muted">Fee 3.5%</div>{rs(e.fee)}</div>
        <div><div className="small muted">Storage + tax</div>{rs(e.storage + e.tax)}</div>
        <div><div className="small muted">You receive</div><b style={{ fontWeight: 500 }}>{rs(e.net)}</b></div>
      </div>
      <Err e={a.error} />
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={() => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 5000); return; } a.run(() => api('/api/sell-now', {}), 'Sold. Proceeds on their way to your bank.'); }}>{arm ? 'Tap again to sell all at today\'s price' : 'Sell all my wheat now'}</button>
    </section>
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
        <tbody>{data.payouts.map((p) => <tr key={p.id}><td>{p.win === 'apr' ? 'April' : p.win === 'early' ? 'Early sale' : 'September'}</td><td className="r">{fmt(p.pat)}</td><td className="r">{fmt(p.price)}</td><td className="r">{rs(p.gross)}</td><td className="r">{rs(p.fee)}</td><td className="r">{rs(p.storage)}</td><td className="r">{rs(p.tax)}</td><td className="r"><b style={{ fontWeight: 500 }}>{rs(p.net)}</b></td></tr>)}</tbody>
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
          <li>Each PAT represents 1 kg of the wheat owed. The wheat is described by grade, not as the crop of one field; the listed field is the grower's intended source and is monitored. PAT cannot be resold until the warehouse receipt is issued (no sale of Salam goods before delivery).</li>
          <li>Shortfall: the grower delivers the missing wheat later (up to 30 days), from any source of the same grade, or refunds its price with no profit added. Barak returns its fee on that part. A late-delivery amount, if any, goes to charity.</li>
          <li>Sale: in April or September at the buyer's election; Barak sells as agent and pays proceeds less a 3.5% fee, storage and withholding tax.</li>
          <li>Funds are held in escrow at the bank. A field under 80% paid at close does not go ahead and is refunded in full.</li>
        </ol>
      </article>
    </div>
  );
}
