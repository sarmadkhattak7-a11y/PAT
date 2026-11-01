import React, { useState } from 'react';
import { useApp, useData, Tag, Stat, Loading, Err, Spark, fmt } from '../lib.jsx';

const EV = { mint: ['info', 'Mint'], unlock: ['ok', 'Unlock'], transfer: ['info', 'Transfer'], burn: ['done', 'Burn'], shortfall: ['watch', 'Cancelled · refunded'] };
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
    <div className="stack-l">
      <div className="stack-s">
        <div className="kicker">{data.token.name} ({data.token.symbol}) · Rabi 2026-27</div>
        <h1>Token ledger</h1>
        <p className="muted">Barak Control view. Every kilo of wheat is one token. Follow each mint, transfer and burn, and check that every outstanding token is backed by a signed, paid Salam contract or by wheat in the certified warehouse. Investors see their own token records in Barak Invest; Barak publishes the reserve check weekly.</p>
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
          {[['Minted and locked', 'Only when cash is paid to a verified grower; the amount equals the kg owed. Cannot be transferred.'], ['Backed by the warehouse', 'The warehouse weighs and grades the wheat and issues an electronic receipt. Tokens unlock and can move between KYC-verified holders.'], ['Burned at sale', 'Wheat is sold in April or September; tokens are burned and the rupees paid to the holder.'], ['Shortfall', 'If wheat is not delivered after any extension, the grower refunds its price with no profit added; those PAT are cancelled and holders are paid back what they paid.']].map(([t, b], i) => <div key={t} className="card flat"><b style={{ fontWeight: 500 }}>{i + 1}. {t}</b><span className="small muted">{b}</span></div>)}
          {data.supply.length > 1 && <><span className="small muted">Supply outstanding, PAT</span><Spark data={data.supply.map((p) => p.out)} h={60} /></>}
        </div>
      </section>
      <section className="card stack-s">
        <div className="between"><h2>Investor and token controls</h2><span className="small muted">What the PVARA sandbox would supervise</span></div>
        <div className="scroll-x"><table className="tbl small"><thead><tr><th>Control</th><th>How it works</th><th>In this build</th></tr></thead><tbody>
          {[['Identity and bank title', 'CNIC checked with NADRA Verisys; payouts only to an account in the investor\'s own name.', 'Simulated'],
            ['Suitability and limits', 'Three questions set a season limit; no one holds more than 20% of a field.', 'Working'],
            ['Key facts and consent', 'One-page key facts and three acknowledgements before the first reservation, stored with a date.', 'Working'],
            ['Cooling-off', 'A paid order can be withdrawn for a full refund until two days before the close.', 'Working'],
            ['Client money held apart', 'Escrow at the bank, reconciled on the Money desk: deposits, refunds, payments to growers and fees. It returns to zero at season end.', 'Working'],
            ['Mint only against a paid contract', 'Tokens are minted when the full price reaches a signed grower, one per kg owed.', 'Working'],
            ['No resale before delivery', 'Tokens stay locked until the warehouse receipt is issued; then they move only between verified holders.', 'Working'],
            ['Proof of reserve', 'Outstanding tokens against wheat owed under contract or held under warehouse receipts, published weekly.', 'Working'],
            ['Tamper evidence and audit', 'Every token event is hash-chained and re-verified; every staff and user action is logged with personal data masked.', 'Working'],
            ['Public anchoring', 'Ledger hashes anchored on Hedera.', 'After approval']].map(([c, h, s]) => <tr key={c}><td style={{ fontWeight: 500 }}>{c}</td><td className="muted">{h}</td><td><Tag k={s === 'Working' ? 'ok' : s === 'Simulated' ? 'info' : 'done'}>{s}</Tag></td></tr>)}
        </tbody></table></div>
      </section>
      <section className="card stack-s">
        <div className="between"><h2>Pilot contract records · {data.pilot.ref}</h2><span className="small muted">{data.pilot.note}</span></div>
        {data.pilot.tokens && <div className="between small" style={{ gap: 12, flexWrap: 'wrap' }}><span><Tag k="watch">Simulation · not issued</Tag> <span style={{ marginInlineStart: 6 }}>Series {data.pilot.tokens.series}</span></span><span className="muted">{data.pilot.tokens.minted ? `${fmt(data.pilot.tokens.minted)} PAT minted · ${fmt(data.pilot.tokens.outstanding)} outstanding · ${fmt(data.pilot.tokens.burned)} retired` : `Mints on ${data.pilot.tokens.mintDate}`}</span></div>}
        {!data.pilot.records.length && <p className="muted small">No records yet.</p>}
        {data.pilot.records.slice(0, 12).map((r) => <div key={r.seq} className="ev"><span className="xs faint">#{r.seq} · {r.date}</span><span className="small">{r.title}<div className="hash">{r.hash}</div></span><span /></div>)}
      </section>
      <section className="card stack-s">
        <div className="between"><h2>Token events</h2><div className="chips">{['all', 'mint', 'unlock', 'transfer', 'shortfall', 'burn'].map((k) => <button key={k} className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{k === 'all' ? 'All' : EV[k][1]}</button>)}</div></div>
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
