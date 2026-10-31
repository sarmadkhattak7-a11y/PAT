import React, { useState } from 'react';
import { useApp, useData, Tag, Stat, Loading, Err, Spark, fmt } from '../lib.jsx';

const EV = { mint: ['info', 'Mint'], unlock: ['ok', 'Unlock'], transfer: ['info', 'Transfer'], burn: ['done', 'Burn'], shortfall: ['watch', 'Shortfall'] };
const who = (n) => (!n ? null : n.role === 'treasury' ? 'Barak treasury' : n.bot ? 'Investor ' + n.name.split(' ')[0].slice(0, 1) + '•••' : n.name.split(' ')[0] + ' •••');

export default function Ledger() {
  const { clock } = useApp();
  const { data, error } = useData('/api/ledger');
  const [type, setType] = useState('all');
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const R = data.reserve;
  const ev = data.events.filter((e) => type === 'all' || e.type === type);
  return (
    <div className="wrap stack-l" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div className="stack-s">
        <div className="kicker">{data.token.name} ({data.token.symbol}) · Rabi 2026-27</div>
        <h1>Token ledger</h1>
        <p className="muted">Every kilo of wheat is one token. Follow each mint, transfer and burn, and check that every outstanding token is backed by a Salam contract or by wheat in the certified warehouse.</p>
        <span className="small faint">{data.token.series} · {data.token.unit} · {data.token.network}</span>
      </div>
      <section className="grid g4">
        <div className="card"><Stat v={fmt(data.minted)} l="PAT minted" /></div>
        <div className="card"><Stat v={fmt(data.outstanding)} l="Outstanding" sub={`${fmt(data.locked)} locked · ${fmt(data.unlocked)} unlocked`} /></div>
        <div className="card"><Stat v={fmt(data.burned)} l="Burned at sale" sub={data.shortfall ? fmt(data.shortfall) + ' burned on shortfall' : null} /></div>
        <div className="card"><Stat v={data.valid ? '✓ Intact' : '✗ Broken'} l="Hash chain" sub={`${data.events.length} events re-verified now`} /></div>
      </section>
      <section className="split">
        <div className="card stack-s">
          <h2>Proof of reserve</h2>
          <span className="small muted">As of {R.asOf}</span>
          {data.outstanding === 0 && data.minted > 0 ? <p>All tokens have been burned and holders paid.</p> : data.minted === 0 ? <p className="muted">Nothing minted yet. The first tokens are minted when cash reaches a grower ({clock.dates.mint}).</p> : (
            <>
              <div className="between"><span>Locked PAT</span><b style={{ fontWeight: 500 }}>{fmt(R.locked)}</b></div>
              <div className="between small muted"><span>Wheat owed under Salam contracts, kg</span><span>{fmt(R.owedKg)} {R.owedKg >= R.locked ? '✓' : '✗'}</span></div>
              <hr className="rule" />
              <div className="between"><span>Unlocked PAT</span><b style={{ fontWeight: 500 }}>{fmt(R.unlocked)}</b></div>
              <div className="between small muted"><span>Wheat in certified warehouse (EWR), kg</span><span>{fmt(R.ewrKg)} {R.ewrKg >= R.unlocked ? '✓' : '✗'}</span></div>
            </>
          )}
          <div className="scroll-x"><table className="tbl small" style={{ marginTop: 8 }}>
            <thead><tr><th>Contract</th><th className="r">Minted</th><th className="r">Outstanding</th><th>Backing</th></tr></thead>
            <tbody>{R.fields.filter((f) => f.minted).map((f) => <tr key={f.id}><td>{f.grower}<div className="xs faint">{f.id}</div></td><td className="r">{fmt(f.minted)}</td><td className="r">{fmt(f.outstanding)}</td><td>{f.ewr ? <Tag k="ok">EWR {f.ewr.ewr}</Tag> : f.outstanding ? <Tag k="info">Salam contract</Tag> : <Tag k="done">Settled</Tag>}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="card stack-s">
          <h2>Token lifecycle</h2>
          {[['Minted and locked', 'Only when cash is paid to a verified grower; the amount equals the kg owed. Cannot be transferred.'], ['Backed by the warehouse', 'The warehouse weighs and grades the wheat and issues an electronic receipt. Tokens unlock and can move between KYC-verified holders.'], ['Burned at sale', 'Wheat is sold in April or September; tokens are burned and PKR paid to the holder.'], ['Shortfall', 'If less wheat is delivered, the gap is burned against crop insurance and holders are paid at cost.']].map(([t, b], i) => <div key={t} className="card flat"><b style={{ fontWeight: 500 }}>{i + 1}. {t}</b><span className="small muted">{b}</span></div>)}
          {data.supply.length > 1 && <><span className="small muted">Supply outstanding, PAT</span><Spark data={data.supply.map((p) => p.out)} h={60} /></>}
        </div>
      </section>
      <section className="card stack-s">
        <div className="between"><h2>Events</h2><div className="chips">{['all', 'mint', 'unlock', 'transfer', 'shortfall', 'burn'].map((k) => <button key={k} className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{k === 'all' ? 'All' : EV[k][1]}</button>)}</div></div>
        {!ev.length && <p className="muted">No events yet.</p>}
        {ev.slice(0, 150).map((e) => (
          <div key={e.seq} className="ev">
            <span className="xs faint">#{e.seq} · {e.date}</span>
            <span className="small"><Tag k={EV[e.type][0]}>{EV[e.type][1]}</Tag> <span style={{ marginInlineStart: 6 }}>{e.grower}</span> <span className="muted">{e.fromName ? 'from ' + who(e.fromName) : ''} {e.toName ? 'to ' + who(e.toName) : ''}</span>
              <div className="xs muted">{e.memo}</div><div className="hash">{e.hash}</div></span>
            <span className="small">{fmt(e.pat)} PAT</span>
          </div>
        ))}
        {ev.length > 150 && <span className="small muted">Showing the latest 150 of {ev.length}.</span>}
      </section>
    </div>
  );
}
