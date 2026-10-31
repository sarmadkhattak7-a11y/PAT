import React, { useState } from 'react';
import { api, useApp, useData, useAction, Link, Tag, Stat, Loading, Err, Modal, fmt, rs, lakh } from '../lib.jsx';
import { statusTag } from './Market.jsx';

export default function Ops() {
  const { user, clock, pricing } = useApp();
  const { data, error } = useData(user && user.role === 'ops' ? '/api/ops' : null);
  const a = useAction();
  const [deliver, setDeliver] = useState(null), [saleWin, setSaleWin] = useState(null);
  if (!user || user.role !== 'ops') return <div className="wrap" style={{ padding: 48 }}><p>Sign in with the Ops account (0300 0000001), or use the Sandbox controls at the bottom right.</p></div>;
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const C = data.cash, cov = data.coverage;
  const act = (e) => {
    const go = (fn, msg) => a.run(fn, msg);
    switch (e.action) {
      case 'close': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/close', {}), 'Market closed')}>Close the market</button>;
      case 'finalize': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/finalize', {}), 'Close finalized: refunds and treasury share booked')}>Finalize close</button>;
      case 'release': return <button className="btn primary small" disabled={a.busy} onClick={() => go(() => api('/api/ops/release', {}), 'Funds released and PAT minted')}>Release funds to growers</button>;
      case 'decide': return <div className="row" style={{ gap: 6 }}><button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/decision', { field: e.field, accept: true }), 'Recorded: accepted')}>Grower accepted</button><button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/decision', { field: e.field, accept: false }), 'Recorded: declined')}>Declined</button></div>;
      case 'visit': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/visit', { field: e.field }), 'Visit scheduled')}>Schedule visit</button>;
      case 'assign': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/report/' + e.report, { status: 'assigned' }), 'Officer assigned')}>Assign officer</button>;
      case 'deliver': return <button className="btn small" onClick={() => setDeliver(data.registry.find((r) => r.id === e.field))}>Record delivery</button>;
      case 'saleApr': return <button className="btn primary small" onClick={() => setSaleWin('apr')}>Run April sale</button>;
      case 'saleSep': return <button className="btn primary small" onClick={() => setSaleWin('sep')}>Run September sale</button>;
      case 'reg': return <button className="btn small" disabled={a.busy} onClick={() => go(() => api('/api/ops/registration/' + e.reg, { status: 'check scheduled' }), 'Field check scheduled')}>Schedule field check</button>;
      default: return null;
    }
  };
  return (
    <div className="wrap stack-l" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div className="between">
        <div className="stack-s"><div className="kicker">Barak ops · {pricing.season}</div><h1>{clock.date} · {clock.phaseLabel}</h1><span className="muted small">Market: {data.market} · Pakistan · first fields in Sahiwal & Okara · {data.investors.real} real investors, {data.investors.simulated} simulated</span></div>
        <Link to="/crop" className="btn">Open crop monitor</Link>
      </div>
      <Err e={a.error} />

      <section className="grid g4">
        <div className="card"><Stat v={lakh(C.deposits)} l="Paid in by investors" sub={C.treasury ? 'plus ' + lakh(C.treasury) + ' Barak treasury' : null} /></div>
        <div className="card"><Stat v={lakh(Math.max(0, C.escrow))} l="In escrow now" sub={C.refunds ? lakh(C.refunds) + ' refunded' : null} /></div>
        <div className="card"><Stat v={lakh(C.released)} l="Released to growers" sub={C.fees ? lakh(C.fees) + ' minting fees' : null} /></div>
        <div className="card"><Stat v={C.payouts ? lakh(C.payouts) : '–'} l="Paid out to holders" sub={C.insurance ? lakh(C.insurance) + ' insurance on shortfall' : null} /></div>
      </section>

      <section className="split">
        <div className="card stack-s">
          <div className="between"><h2>Needs attention</h2><span className="small muted">{data.exceptions.length} item{data.exceptions.length === 1 ? '' : 's'}</span></div>
          {!data.exceptions.length && <p className="muted">Nothing needs attention this week.</p>}
          {data.exceptions.map((e, i) => (
            <div key={i} className="between" style={{ borderBottom: '1px solid var(--divider)', padding: '10px 0', alignItems: 'center' }}>
              <div className="stack-s" style={{ gap: 2, flex: '1 1 300px' }}><span><Tag k={e.level}>{e.level === 'risk' ? 'Act now' : e.level === 'watch' ? 'Today' : 'FYI'}</Tag> <b style={{ fontWeight: 500, marginInlineStart: 6 }}>{e.title}</b></span><span className="small muted">{e.body}</span></div>
              {act(e)}
            </div>
          ))}
        </div>
        <div className="card stack-s">
          <h2>Crop coverage</h2>
          <span className="small muted">Estimated yield ÷ maunds owed, contracted fields</span>
          <div className="huge">{cov.cov.toFixed(2)}×</div>
          <div className="grid g2">
            <Stat v={fmt(cov.est) + ' md'} l={`estimated (${fmt(cov.lo)}–${fmt(cov.hi)})`} />
            <Stat v={fmt(cov.owed) + ' md'} l="owed under contract" />
            <Stat v={fmt(cov.shortfall) + ' md'} l="worst-case shortfall" />
            <Stat v={`${cov.watch} watch · ${cov.risk} risk`} l={`below ${data.thresholds.watch}× / ${data.thresholds.risk}×`} />
          </div>
          <Thresholds th={data.thresholds} />
        </div>
      </section>

      <section className="card stack-s">
        <div className="between"><h2>Registry</h2><span className="small muted">Every field, its funding, contract and delivery</span></div>
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Field</th><th>Grower</th><th className="r">Acres</th><th className="r">Paid at close</th><th>Status</th><th className="r">Coverage</th><th>Delivery</th><th /></tr></thead>
          <tbody>{data.registry.map((r) => (
            <tr key={r.id}><td className="small">{r.id}</td><td>{r.grower}<div className="xs faint">{r.village} · {r.phone}</div></td>
              <td className="r">{r.acresContracted !== r.acres ? `${r.acresContracted} of ${r.acres}` : r.acres}</td>
              <td className="r">{Math.round(r.frac * 100)}%</td><td>{statusTag(r.status)}</td>
              <td className="r">{r.status === 'lapsed' ? '–' : <Tag k={r.risk}>{r.cov.toFixed(2)}×</Tag>}</td>
              <td className="small">{r.delivery ? `${r.delivery.ewr} · ${fmt(r.delivery.kg)} kg` : r.deliveryDay ? 'Booked ' + r.deliveryDay : '–'}</td>
              <td>{r.status === 'paid' && clock.day >= 140 && <button className="btn small" onClick={() => setDeliver(r)}>Record delivery</button>}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s">
          <h2>Investor orders</h2>
          <span className="small muted">Real sign-ups only; simulated investors are excluded.</span>
          {!data.orders.length && <p className="muted small">No real investor orders yet.</p>}
          {data.orders.map((o) => <div key={o.id} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span>{o.name} · {o.phone}<div className="xs faint">{o.id} · {o.date} · {o.pay_ref}</div></span><span>{rs(o.amount)} <Tag k={o.status === 'paid' || o.status === 'tokens' || o.status === 'allotted' ? 'ok' : o.status === 'reserved' ? 'watch' : 'done'}>{o.status}</Tag></span></div>)}
        </div>
        <div className="card stack-s">
          <h2>Growers</h2>
          <b style={{ fontWeight: 500 }}>Problem reports</b>
          {!data.reports.length && <p className="muted small">None.</p>}
          {data.reports.map((r) => <div key={r.id} className="between small"><span>{r.grower}: {r.type}<div className="xs faint">{r.text}</div></span><Tag k={r.status === 'open' ? 'watch' : 'ok'}>{r.status}</Tag></div>)}
          <b style={{ fontWeight: 500, marginTop: 8 }}>Registrations for next season</b>
          {!data.registrations.length && <p className="muted small">None yet. Growers register at <Link to="/join">/join</Link>.</p>}
          {data.registrations.map((r) => <div key={r.id} className="between small"><span>{r.name} · {r.phone}<div className="xs faint">{r.village} · {r.acres} acres · {r.yield} md/acre · {r.date}</div></span><Tag k={r.status === 'new' ? 'info' : 'ok'}>{r.status}</Tag></div>)}
          <b style={{ fontWeight: 500, marginTop: 8 }}>Sale choices</b>
          <span className="small muted">{data.investors.elections.map((e) => `${e.n} chose ${e.win === 'apr' ? 'April' : 'September'}`).join(' · ') || 'None yet'}{data.saleApr ? ` · April sale run at Rs ${fmt(data.saleApr.price)}` : ''}{data.saleSep ? ` · September sale run at Rs ${fmt(data.saleSep.price)}` : ''}</span>
        </div>
      </section>

      {deliver && <DeliveryModal r={deliver} onClose={() => setDeliver(null)} />}
      {saleWin && <SaleModal win={saleWin} price={data.price} onClose={() => setSaleWin(null)} />}
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
  const [kg, setKg] = useState(r.owed * 40), [m, setM] = useState(9.1), [g, setG] = useState('Grade 1');
  return (
    <Modal title={`Warehouse intake · ${r.grower}`} onClose={onClose}>
      <p className="small muted">{r.id} owes {fmt(r.owed)} md ({fmt(r.owed * 40)} kg). Recording intake issues an electronic warehouse receipt and unlocks this field's PAT. Any shortfall is burned against insurance.</p>
      <div className="grid g3">
        <label className="field">Weighed kg<input className="inp" inputMode="numeric" value={kg} onChange={(e) => setKg(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="field">Moisture %<input className="inp" type="number" step="0.1" value={m} onChange={(e) => setM(e.target.value)} /></label>
        <label className="field">Grade<select className="inp" value={g} onChange={(e) => setG(e.target.value)}><option>Grade 1</option><option>Grade 2</option></select></label>
      </div>
      {Number(kg) < r.owed * 40 && <div className="note">Short by {fmt(r.owed * 40 - kg)} kg. Holders are compensated by the crop insurance at cost.</div>}
      <Err e={a.error} />
      <button className="btn primary" disabled={a.busy} onClick={async () => { const x = await a.run(() => api('/api/ops/delivery', { field: r.id, kg: Number(kg), moisture: Number(m), grade: g }), 'Delivery recorded, receipt issued'); if (x) onClose(); }}>Record intake and issue receipt</button>
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
