import React, { useState } from 'react';
import { api, useApp, useData, useAction, Link, Tag, Stat, Loading, Err, Modal, fmt, rs, lakh, asset } from '../lib.jsx';
import { statusTag } from './Market.jsx';
import { LoginForm } from './Login.jsx';
import { DirectControl } from './Direct.jsx';
import Crop from './Crop.jsx';
import Ledger from './Ledger.jsx';

// Barak Control: the staff console. Kept apart from Barak Invest and Barak Kisan; needs an Ops account.
export default function Control({ route }) {
  const { user, clock, pricing } = useApp();
  const sec = route.split('/')[2] || 'overview';
  const { data, error } = useData(user && user.role === 'ops' ? '/api/ops' : null);
  if (!user || user.role !== 'ops') return (
    <div className="wrap" style={{ paddingTop: 48 }}><div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="brand" dir="ltr" style={{ marginBottom: 8 }}><img src={asset('img/logo.png')} alt="" /><span><b>Barak</b> Control</span></div>
      <LoginForm title="Staff sign in" /><hr className="rule" /><p className="small muted">Sandbox staff account: 0300 0000001. Or use Sandbox → Ops desk.</p>
    </div></div>
  );
  const S = [['overview', 'Overview', data ? data.exceptions.filter((e) => e.level !== 'info').length : 0], ['contracts', 'Contracts'], ['pilot', 'Pilot · Direct'], ['crop', 'Crop monitor'], ['ledger', 'Token ledger'], ['growers', 'Growers'], ['money', 'Money'], ['audit', 'Audit log']];
  return (
    <div className="ctl">
      <aside className="ctl-side">
        <div className="brand-wrap" style={{ padding: '4px 12px 16px' }}><div className="brand" dir="ltr"><img src={asset('img/logo.png')} alt="" /><span><b>Barak</b> Control</span></div><div className="xs faint" style={{ marginTop: 6 }}>{clock.date} · {clock.phaseLabel}</div></div>
        {S.map(([k, l, n]) => <Link key={k} to={k === 'overview' ? '/control' : '/control/' + k} className={sec === k ? 'on' : ''}><span>{l}</span>{n > 0 && <span className="badge">{n}</span>}</Link>)}
        <div style={{ flex: 1 }} />
        <span className="xs faint" style={{ padding: '12px' }}>{user.name}</span>
      </aside>
      <div className="ctl-main">
        {error && <Err e={error} />}
        {sec === 'crop' ? <Crop /> : sec === 'ledger' ? <Ledger /> : !data ? <Loading /> :
          sec === 'overview' ? <Overview data={data} /> : sec === 'contracts' ? <Contracts data={data} /> : sec === 'pilot' ? <DirectControl p={data.pilot} /> :
          sec === 'growers' ? <Growers data={data} /> : sec === 'money' ? <Money data={data} /> : sec === 'audit' ? <Audit data={data} /> : null}
      </div>
    </div>
  );
}

function Overview({ data }) {
  const { clock, pricing } = useApp();
  const a = useAction();
  const [deliver, setDeliver] = useState(null), [saleWin, setSaleWin] = useState(null);
  const C = data.cash, cov = data.coverage;
  const act = (e) => {
    const go = (fn, msg) => a.run(fn, msg);
    switch (e.action) {
      case 'close': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/close', {}), 'Market closed')}>Close the market</button>;
      case 'finalize': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/finalize', {}), 'Close finalized: refunds and treasury share booked')}>Finalize close</button>;
      case 'release': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/release', {}), 'Signed contracts paid and PAT minted')}>Pay signed contracts</button>;
      case 'signPaper': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/sign', { fields: e.fields }), 'Paper signatures recorded')}>Record field-officer signatures</button>;
      case 'decide': return <div className="row" style={{ gap: 6 }}><button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/decision', { field: e.field, accept: true }), 'Recorded: accepted')}>Grower accepted</button><button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/decision', { field: e.field, accept: false }), 'Recorded: declined')}>Declined</button></div>;
      case 'visit': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/visit', { field: e.field }), 'Visit scheduled')}>Schedule visit</button>;
      case 'assign': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/report/' + e.report, { status: 'assigned' }), 'Officer assigned')}>Assign officer</button>;
      case 'deliver': return <button className="btn small" onClick={() => setDeliver(data.registry.find((r) => r.id === e.field))}>Record intake</button>;
      case 'shortfall': return <div className="row" style={{ gap: 6 }}>{!e.extended && <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/shortfall', { field: e.field, action: 'extend' }), 'Extended 30 days')}>Extend 30 days</button>}<button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/shortfall', { field: e.field, action: 'refund' }), 'Price recovered and refunded')}>Recover price</button><button className="btn ghost small" onClick={() => setDeliver(data.registry.find((r) => r.id === e.field))}>Record more</button></div>;
      case 'surplus': return <div className="row" style={{ gap: 6 }}><button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/surplus/' + e.surplus, { buy: true }), 'Surplus bought')}>Buy</button><button className="btn ghost small" disabled={a.busy} onClick={() => go(() => api('/api/ops/surplus/' + e.surplus, { buy: false }), 'Passed')}>Pass</button></div>;
      case 'saleApr': return <button className="btn primary small" onClick={() => setSaleWin('apr')}>Run April sale</button>;
      case 'saleSep': return <button className="btn primary small" onClick={() => setSaleWin('sep')}>Run September sale</button>;
      case 'reg': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/registration/' + e.reg, { status: 'check scheduled' }), 'Field check scheduled')}>Schedule field check</button>;
      case 'pilot': return <Link to="/control/pilot" className="btn small">Open pilot</Link>;
      case 'call': return <span className="small muted">Officer to call</span>;
      default: return null;
    }
  };
  return (
    <div className="stack-l">
      <div className="stack-s"><div className="kicker">Barak Control · {pricing.season}</div><h1>{clock.date} · {clock.phaseLabel}</h1><span className="muted small">Market: {data.market} · {data.investors.real} retail investor{data.investors.real === 1 ? '' : 's'}, {data.investors.direct} Direct buyer{data.investors.direct === 1 ? '' : 's'}, {data.investors.simulated} simulated</span></div>
      <Err e={a.error} />
      <section className="grid g4">
        <div className="card"><Stat v={lakh(C.deposits)} l="Paid in by investors" sub={C.treasury ? 'plus ' + lakh(C.treasury) + ' Barak treasury' : null} /></div>
        <div className="card"><Stat v={lakh(Math.max(0, C.escrow))} l="In escrow now" sub={C.refunds ? lakh(C.refunds) + ' refunded' : null} /></div>
        <div className="card"><Stat v={lakh(C.released)} l="Paid to growers" sub={C.fees ? lakh(C.fees) + ' arrangement fees' : null} /></div>
        <div className="card"><Stat v={C.payouts ? lakh(C.payouts) : '–'} l="Paid out to holders" sub={C.growerRefunds ? lakh(C.growerRefunds) + ' recovered on shortfall' : null} /></div>
      </section>
      <section className="split">
        <div className="card stack-s">
          <div className="between"><h2>Needs attention</h2><span className="small muted">{data.exceptions.length} item{data.exceptions.length === 1 ? '' : 's'}</span></div>
          {!data.exceptions.length && <p className="muted">Nothing needs attention today.</p>}
          {data.exceptions.map((e, i) => (
            <div key={i} className="between" style={{ borderBottom: '1px solid var(--divider)', padding: '10px 0', alignItems: 'center' }}>
              <div className="stack-s" style={{ gap: 2, flex: '1 1 300px' }}><span><Tag k={e.level}>{e.level === 'risk' ? 'Act now' : e.level === 'watch' ? 'Today' : 'FYI'}</Tag> <b style={{ fontWeight: 500, marginInlineStart: 6 }}>{e.title}</b></span><span className="small muted">{e.body}</span></div>
              {act(e)}
            </div>
          ))}
        </div>
        <div className="card stack-s">
          <h2>Crop cover</h2>
          <span className="small muted">Estimated yield ÷ maunds owed, marketplace contracts</span>
          <div className="huge">{cov.cov.toFixed(2)}×</div>
          <div className="grid g2">
            <Stat v={fmt(cov.est) + ' md'} l={Math.round(cov.lo) === Math.round(cov.hi) ? 'estimated, final before cutting' : `estimated (${fmt(cov.lo)}–${fmt(cov.hi)})`} />
            <Stat v={fmt(cov.owed) + ' md'} l="owed under contract" />
            <Stat v={fmt(cov.shortfall) + ' md'} l="worst-case shortfall" />
            <Stat v={`${cov.watch} watch · ${cov.risk} risk`} l={`below ${data.thresholds.watch}× / ${data.thresholds.risk}×`} />
          </div>
          <div className="card flat small"><b style={{ fontWeight: 500 }}>Pilot: {data.pilot.grower}</b><span className="muted">{fmt(data.pilot.md)} md · {data.pilot.day >= 30 ? data.pilot.cover.toFixed(2) + '× cover' : 'before emergence'} · {fmt(data.pilot.deliveredMd)} md delivered</span><Link to="/control/pilot">Open the pilot desk →</Link></div>
          <Thresholds th={data.thresholds} />
        </div>
      </section>
      {deliver && <DeliveryModal r={deliver} onClose={() => setDeliver(null)} />}
      {saleWin && <SaleModal win={saleWin} price={data.price} onClose={() => setSaleWin(null)} />}
    </div>
  );
}

function Contracts({ data }) {
  const { clock } = useApp();
  const [deliver, setDeliver] = useState(null), [q, setQ] = useState('');
  const rows = data.registry.filter((r) => !q || (r.grower + r.id + r.village + r.status).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="between"><div><div className="kicker">Marketplace contracts</div><h1>Registry</h1></div><input className="inp" style={{ maxWidth: 280 }} placeholder="Search grower, field, village, status" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contracts" /></div>
      <div className="card"><div className="scroll-x"><table className="tbl">
        <thead><tr><th>Field</th><th>Grower</th><th className="r">Acres</th><th className="r">Paid</th><th>Status</th><th>Signed</th><th>Payout</th><th className="r">Cover</th><th>Delivery</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="small">{r.id}</td><td>{r.grower}<div className="xs faint">{r.village} · {r.phone}</div></td>
            <td className="r">{r.acresContracted !== r.acres ? `${r.acresContracted} of ${r.acres}` : r.acres}</td><td className="r">{Math.round(r.frac * 100)}%</td><td>{statusTag(r.status)}</td>
            <td className="small">{r.signed ? (/paper/.test(r.signMethod) ? 'Paper' : 'App') : '–'}</td><td className="small">{r.payout}{r.receipt ? ' ✓' : ''}</td>
            <td className="r">{r.status === 'lapsed' ? '–' : <Tag k={r.risk}>{r.cov.toFixed(2)}×</Tag>}</td>
            <td className="small">{r.delivered ? `${fmt(r.delivered)} / ${fmt(r.owed * 40)} kg` : r.deliveryDay ? 'Booked ' + r.deliveryDay : '–'}{r.resolution === 'refund' ? ' · price refunded' : ''}{r.extension ? ' · ext. ' + r.extension : ''}</td>
            <td>{['paid', 'short'].includes(r.status) && clock.day >= 140 && <button className="btn small" onClick={() => setDeliver(r)}>Record intake</button>}</td></tr>
        ))}</tbody>
      </table></div></div>
      {deliver && <DeliveryModal r={deliver} onClose={() => setDeliver(null)} />}
    </div>
  );
}

function Growers({ data }) {
  const a = useAction();
  const PIPE = ['new', 'check scheduled', 'verified', 'pre-approved'];
  return (
    <div className="stack-l">
      <div><div className="kicker">Growers</div><h1>Pipeline and support</h1></div>
      <section className="card stack-s">
        <h2>Registrations for Rabi 2027-28</h2>
        <span className="small muted">New → field check → verified (grade set) → pre-approved. Returning growers who delivered on time come in pre-approved.</span>
        {!data.registrations.length && <p className="muted small">None yet. Growers register on the <Link to="/join">Barak Kisan sign-up page</Link> or re-enrol from the app.</p>}
        {data.registrations.map((r) => {
          const i = PIPE.indexOf(r.status), next = PIPE[i + 1];
          return <div key={r.id} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '8px 0' }}><span>{r.name} · {r.phone}<div className="xs faint">{r.village} · {r.acres} acres{r.yield ? ' · ' + r.yield + ' md/acre' : ''} · {r.date}</div></span>
            <span className="row" style={{ gap: 6 }}><Tag k={r.status === 'pre-approved' ? 'ok' : 'info'}>{r.status}</Tag>{next && <button className="btn small" disabled={a.busy} onClick={() => a.run(() => api('/api/ops/registration/' + r.id, { status: next }), 'Moved to ' + next)}>Move to {next}</button>}</span></div>;
        })}
        <Err e={a.error} />
      </section>
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s"><h2>Problem reports</h2>{!data.reports.length && <p className="muted small">None.</p>}{data.reports.map((r) => <div key={r.id} className="between small"><span>{r.grower}: {r.type}<div className="xs faint">{r.text} · {r.date}</div></span><Tag k={r.status === 'open' ? 'watch' : 'ok'}>{r.status}</Tag></div>)}</div>
        <div className="card stack-s"><h2>Surplus offers</h2>{!data.surplus.length && <p className="muted small">None.</p>}{data.surplus.map((s) => <div key={s.id} className="between small"><span>{s.grower}: {s.md} md<div className="xs faint">{s.date}{s.status === 'bought' ? ' · Rs ' + fmt(s.price) : ''}</div></span><Tag k={s.status === 'bought' ? 'ok' : s.status === 'offered' ? 'watch' : 'done'}>{s.status}</Tag></div>)}</div>
      </section>
    </div>
  );
}

function Money({ data }) {
  const C = data.cash;
  const R = (l, v, sign = '') => <tr><td>{l}</td><td className="r">{sign}{rs(v)}</td></tr>;
  return (
    <div className="stack-l">
      <div><div className="kicker">Money</div><h1>Escrow reconciliation</h1><span className="small muted">Marketplace client account. Every rupee in is matched by a rupee out or still held. The pilot has its own client account on the pilot desk.</span></div>
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><table className="tbl"><tbody>
          {R('Investor deposits', C.deposits, '+ ')}{R('Barak treasury share', C.treasury, '+ ')}{R('Grower refunds on shortfall', C.growerRefunds, '+ ')}{R('Barak fee returned on shortfall', C.feeReturns, '+ ')}
          {R('Refunds to investors', C.refunds, '− ')}{R('Price paid to growers', C.released, '− ')}{R('Barak arrangement fees', C.fees, '− ')}
          <tr><td><b style={{ fontWeight: 500 }}>Held in escrow</b></td><td className="r"><b style={{ fontWeight: 500 }}>{rs(C.escrow)}</b></td></tr>
        </tbody></table></div>
        <div className="card stack-s"><h2>After delivery</h2><table className="tbl"><tbody>{R('Paid out to holders (sales, net)', C.payouts)}{R('Surplus bought from growers (Barak own account)', C.surplus)}</tbody></table>
          <span className="xs faint">Sale proceeds pass through the agency account the same day; withholding tax certificates go to each holder.</span></div>
      </section>
      <section className="card stack-s"><h2>Retail investor orders</h2>
        {!data.orders.length && <p className="muted small">No real investor orders yet.</p>}
        {data.orders.map((o) => <div key={o.id} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span>{o.name} · {o.phone}<div className="xs faint">{o.id} · {o.date} · {o.pay_ref}</div></span><span>{rs(o.amount)} <Tag k={['paid', 'tokens', 'allotted'].includes(o.status) ? 'ok' : o.status === 'reserved' ? 'watch' : 'done'}>{o.status}</Tag></span></div>)}
      </section>
    </div>
  );
}

function Audit({ data }) {
  return (
    <div className="stack">
      <div><div className="kicker">Audit log</div><h1>Who did what</h1><span className="small muted">Every change by every account. Codes, CNICs and account numbers are masked.</span></div>
      <div className="card"><div className="scroll-x"><table className="tbl small">
        <thead><tr><th>Date</th><th>Who</th><th>Role</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{data.audit.map((a) => <tr key={a.id}><td>{a.date}</td><td>{a.actor}</td><td>{a.role}</td><td className="hash" style={{ color: 'var(--text)' }}>{a.action}</td><td className="hash">{a.detail === '{}' ? '' : a.detail}</td></tr>)}</tbody>
      </table></div></div>
    </div>
  );
}

function Thresholds({ th }) {
  const a = useAction();
  const [w, setW] = useState(th.watch), [r, setR] = useState(th.risk);
  return (
    <details className="small"><summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Alert levels</summary>
      <div className="row" style={{ marginTop: 8 }}>
        <label className="field">Watch below<input className="inp" type="number" step="0.05" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 100 }} /></label>
        <label className="field">Risk below<input className="inp" type="number" step="0.05" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 100 }} /></label>
        <button className="btn small" style={{ alignSelf: 'flex-end' }} disabled={a.busy} onClick={() => a.run(() => api('/api/ops/thresholds', { watch: Number(w), risk: Number(r) }), 'Alert levels saved')}>Save</button>
      </div>
      <Err e={a.error} />
    </details>
  );
}

function DeliveryModal({ r, onClose }) {
  const a = useAction();
  const due = r.owed * 40 - (r.delivered || 0);
  const [f, setF] = useState({ kg: due, moisture: 9.1, grade: 'Grade 1', vehicle: '', slip: '', bags: Math.round(due / 50), foreign: 0.5 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={`Warehouse intake · ${r.grower}`} onClose={onClose}>
      <p className="small muted">{r.id} owes {fmt(r.owed * 40)} kg; {fmt(due)} kg still due. An accepted lot gets an electronic warehouse receipt. A lot over 10% moisture or below grade is recorded as rejected and can be redelivered.</p>
      <div className="grid g3">
        <label className="field">Net kg<input className="inp" inputMode="numeric" value={f.kg} onChange={set('kg')} /></label>
        <label className="field">Moisture %<input className="inp" type="number" step="0.1" value={f.moisture} onChange={set('moisture')} /></label>
        <label className="field">Grade<select className="inp" value={f.grade} onChange={set('grade')}><option>Grade 1</option><option>Grade 2</option></select></label>
        <label className="field">Vehicle<input className="inp" placeholder="OKA-1234" value={f.vehicle} onChange={set('vehicle')} /></label>
        <label className="field">Weighbridge slip<input className="inp" placeholder="WB-55120" value={f.slip} onChange={set('slip')} /></label>
        <label className="field">Bags<input className="inp" inputMode="numeric" value={f.bags} onChange={set('bags')} /></label>
      </div>
      {Number(f.kg) < due && Number(f.moisture) <= 10 && <div className="note">Short by {fmt(due - f.kg)} kg. The field moves to "part delivered": extend by up to 30 days or recover the price of the missing wheat.</div>}
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy} onClick={async () => { const x = await a.run(() => api('/api/ops/delivery', { field: r.id, ...f, kg: Number(f.kg), moisture: Number(f.moisture) }), Number(f.moisture) > 10 ? 'Lot recorded as rejected' : 'Lot recorded, receipt issued'); if (x) onClose(); }}>Record lot</button>
    </Modal>
  );
}

function SaleModal({ win, price, onClose }) {
  const a = useAction();
  const [px, setPx] = useState(price);
  return (
    <Modal title={win === 'apr' ? 'April sale' : 'September sale'} onClose={onClose}>
      <p className="small muted">{win === 'apr' ? 'Sells the wheat of every holder who chose April (and anyone who did not choose), plus Barak treasury’s share.' : 'Sells all remaining stored wheat.'} Tokens are burned and net proceeds paid to each holder’s bank account.</p>
      <label className="field">Achieved price, Rs per 40 kg<input className="inp" inputMode="numeric" value={px} onChange={(e) => setPx(e.target.value.replace(/\D/g, ''))} /></label>
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy} onClick={async () => { const x = await a.run(() => api('/api/ops/sale', { win, price: Number(px) }), 'Sale run and holders paid'); if (x) onClose(); }}>Run sale and pay holders</button>
    </Modal>
  );
}
