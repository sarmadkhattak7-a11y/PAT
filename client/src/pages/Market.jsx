import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useData, useRouter, Link, FundBar, Tag, Stat, Loading, Err, Spark, Timeline, fmt, rs, pkr, pct, lakh, phOf } from '../lib.jsx';

const STATUS = {
  listed: ['info', 'Raising'], ahead: ['ok', 'Going ahead'], offer: ['watch', 'Smaller contract offered'], lapsed: ['done', 'Not funded · refunded'],
  contracted: ['info', 'Signing'], paid: ['ok', 'Signed and paid · growing'], short: ['watch', 'Part delivered'], delivered: ['ok', 'In warehouse'], settled: ['done', 'Sold · settled'],
};
export const statusTag = (s) => { const [k, l] = STATUS[s] || ['info', s]; return <Tag k={k}>{l}</Tag>; };

export default function Market() {
  const { clock, pricing, user } = useApp();
  const { data, error } = useData('/api/market');
  const { go } = useRouter();
  const [amount, setAmount] = useState(100000);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('room');
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const open = clock.market === 'open' && clock.day < clock.DAY.close;
  const T = data.totals;
  const P = pricing, RS = P.kgCost;
  const pat = Math.floor(amount / RS), val = (px) => pat * ((px * (1 - P.fee) - P.carry) / 40);
  const bank = amount * (1 + P.rf * 10 / 12);
  let ls = data.listings.filter((l) => filter === 'all' || l.village.includes(filter));
  ls = ls.slice().sort((a, b) => sort === 'room' ? b.room - a.room : sort === 'funded' ? b.paidFrac - a.paidFrac : b.acres - a.acres);

  return (
    <div className="wrap stack-l" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <section className="split">
        <div className="stack">
          <div className="kicker">Salam offering platform · {P.season}</div>
          <h1 className="display">Own real wheat from Rs 25,000.</h1>
          <p style={{ fontSize: 18, color: 'var(--text-2)', maxWidth: 560 }}>You pay a grower now, before sowing. They deliver the wheat to a certified warehouse in April. You cash out in April or September.</p>
          <div className="card stack-s">
            <div className="between"><span className="small muted">This season · today is {clock.date}</span><span className="small">{open ? <Tag k="ok">Raising until {clock.dates.close}</Tag> : <Tag k="done">Raise closed {clock.dates.close}</Tag>}</span></div>
            <Timeline clock={clock} />
            <div className="grid g3" style={{ marginTop: 8 }}>
              <Stat v={lakh(T.paid)} l={`paid of ${lakh(T.target)}`} />
              <Stat v={T.fields + ' fields'} l={`${fmt(T.acres)} acres · Sahiwal & Okara`} />
              <Stat v={fmt(T.backers)} l="investors so far" />
            </div>
          </div>
          <div className="grid g3">
            {[['Pay into escrow', `By ${clock.dates.close}. Barak cannot spend it.`], ['Grower signs and is paid', `By ${clock.dates.mint}, before sowing ends ${clock.dates.sowBy}. PAT minted then.`], ['Wheat delivered, then sold', `By ${clock.dates.deliverBy}. Cash out in April or September.`]].map(([t, b], i) => (
              <div key={t} className="card flat"><div className="kicker">Step {i + 1}</div><b style={{ fontWeight: 500 }}>{t}</b><span className="small muted">{b}</span></div>
            ))}
          </div>
        </div>

        <section className="card lift pad-l" aria-label="What your money becomes">
          <div className="kicker">What your money becomes</div>
          <div className="chips" role="group" aria-label="Amount">
            {[25000, 100000, 500000].map((v) => <button key={v} className="chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>{lakh(v)}</button>)}
          </div>
          <label className="field"><span className="hint">Or type an amount (PKR)</span>
            <input className="inp" inputMode="numeric" value={fmt(amount)} onChange={(e) => setAmount(Math.min(2500000, Number(e.target.value.replace(/\D/g, '')) || 0))} />
          </label>
          <div><div className="huge">{fmt(pat)} kg</div><div className="small muted">{fmt(pat)} PAT · {(pat / 40).toFixed(1)} maund of Grade 1 wheat · Rs {P.kgCost.toFixed(2)} per kg incl. 2.5% fee</div></div>
          <hr className="rule" />
          <div className="between small"><span>Expected in September (at Rs {fmt(P.ref)})</span><span><b style={{ fontWeight: 500 }}>{pkr(val(P.ref))}</b> <span className="up">{pct(val(P.ref) / amount - 1)}</span></span></div>
          <div className="between small muted"><span>Same money at the SBP policy rate, 10 months</span><span>{pkr(bank)}</span></div>
          <details className="small">
            <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>What if prices move?</summary>
            <table className="tbl" style={{ marginTop: 8 }}><tbody>
              {P.scenarios.map((s) => <tr key={s.label}><td>{s.label}</td><td className="r muted">Rs {fmt(s.px)}</td><td className="r">{pkr(val(s.px))}</td><td className={'r ' + (s.ret >= 0 ? 'up' : 'down')}>{pct(val(s.px) / amount - 1)}</td></tr>)}
            </tbody></table>
            <p className="muted xs" style={{ marginTop: 6 }}>After the 3.5% sale fee and Rs {P.carry} per maund storage, before withholding tax. Break-even: Rs {fmt(P.breakeven)} per 40 kg.</p>
          </details>
          {open ? (
            <button className="btn primary block" disabled={amount < 25000} onClick={() => go(`/reserve?kind=pool&pool=starter&amount=${amount}`)}>{amount < 25000 ? 'Minimum Rs 25,000' : `Reserve ${pkr(amount)} in the Starter pool`}</button>
          ) : <button className="btn block" disabled>The raise closed on {clock.dates.close}</button>}
          <div className="xs faint" style={{ textAlign: 'center' }}>Spread over 10 fields. Pay within 24 hours; withdraw for a full refund until {clock.dates.withdrawBy}.</div>
        </section>
      </section>

      <section className="stack">
        <h2>Before you start</h2>
        <div className="grid g3">
          <div className="card"><b style={{ fontWeight: 500 }}>You can lose money</b><span className="small muted">If wheat sells below Rs {fmt(P.breakeven)} per 40 kg, you get back less than you put in. In a 2024-style crash (Rs {fmt(P.stress)}) you would lose about {Math.abs(Math.round(P.stressRet * 100))}%.</span></div>
          <div className="card"><b style={{ fontWeight: 500 }}>Your money is locked until April</b><span className="small muted">PAT cannot move until the wheat is in the warehouse. Only put in what you will not need. Three questions set your season limit.</span></div>
          <div className="card"><b style={{ fontWeight: 500 }}>Protected if a field fails to raise</b><span className="small muted">Money waits in escrow. A field under 80% paid by {clock.dates.close} does not go ahead and you are refunded by {clock.dates.refund}.</span></div>
        </div>
      </section>

      {data.close && <CloseBoard rows={data.close} clock={clock} />}

      <section className="stack">
        <div className="between"><h2>Pools</h2><span className="small muted">One order spread across many fields, never more than 20% of any one field</span></div>
        <div className="grid g2">
          {data.pools.map((p) => (
            <div key={p.key} className="card">
              <div className="between"><h3>{p.name}</h3><span className="small muted">{p.fields.length} fields · {p.villages} villages · {fmt(p.acres)} acres</span></div>
              <span className="small muted">{p.blurb}. Grade A only, verified by Barak Crop Monitoring.</span>
              <div className="between small"><span>Room for you</span><b style={{ fontWeight: 500 }}>{rs(p.room)}</b></div>
              {open && <button className="btn" onClick={() => go(`/reserve?kind=pool&pool=${p.key}&amount=${Math.max(25000, Math.min(amount, Math.floor(p.room)))}`)}>Reserve in this pool</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="between">
          <h2>Fields {open ? 'raising now' : 'this season'}<span className="small muted" style={{ display: 'block', fontWeight: 400 }}>Every field is Grade A and checked by Barak Crop Monitoring</span></h2>
          <div className="row" style={{ gap: 8 }}>
            <div className="chips" role="group" aria-label="District">{['all', 'Sahiwal', 'Okara'].map((f) => <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f}</button>)}</div>
            <select className="inp" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort fields"><option value="room">Most room</option><option value="funded">Most funded</option><option value="acres">Largest</option></select>
          </div>
        </div>
        <div className="grid g3">{ls.map((l) => <FieldCard key={l.id} l={l} open={open} />)}</div>
        <p className="xs faint">Bar: dark green is paid, light green is reserved and awaiting payment, amber is yours. The tick is the 80% line a field must reach to go ahead.</p>
      </section>

      <section className="card stack">
        <h2>How it works under Shariah</h2>
        <div className="grid g3">
          {[['A Salam purchase', `You buy wheat in advance. The full price is paid to the grower the day the contract is signed; quantity, grade, date and place of delivery are fixed. No loan, no interest.`],
            ['Barak is your agent', 'Under a Wakalah agreement Barak signs, monitors, takes delivery and sells for you for fixed fees. It takes no share of your gain or loss.'],
            ['Wheat by grade, not one field', 'The contract is for Grade 1 wheat. Each field is the grower\'s intended source and is monitored, but the grower may deliver the same grade from elsewhere.'],
            ['No resale before delivery', 'Salam goods cannot be sold on before delivery, so PAT stay locked until the wheat is weighed into the warehouse.'],
            ['If wheat is short', 'The grower delivers later (up to 30 days) or refunds the price of the missing part, with no profit added. Late amounts go to charity.'],
            ['Your money, held apart', 'Payments sit in a client account at the bank. Barak cannot spend them; they leave only to a signed, paid grower or back to you.']].map(([t, b]) => <div key={t} className="card flat"><b style={{ fontWeight: 500 }}>{t}</b><span className="small muted">{b}</span></div>)}
        </div>
        <span className="xs faint">Contracts drafted for review by Barak's lawyer and Shariah advisor [to be appointed]. Field monitoring with LIMS. PVARA regulatory sandbox application in preparation.</span>
      </section>

      <PriceRule P={P} />
    </div>
  );
}

function FieldCard({ l, open }) {
  const { go } = useRouter();
  return (
    <button className="card fcard" onClick={() => go('/field/' + l.id)}>
      <div className="ph"><img src={phOf(l.photo)} alt="" loading="lazy" /><span className="illus">Illustrative image · not this field</span></div>
      <div className="body">
        <div className="between"><b style={{ fontSize: 17, fontWeight: 500 }}>{l.grower}</b>{!open && statusTag(l.status)}</div>
        <span className="small muted">{l.village} · {l.acres} acres · Grade {l.grade} · {l.water}</span>
        <FundBar paid={l.paidFrac} res={l.resFrac} mine={(l.mine || l.mineKept) / l.target} />
        <div className="between small muted"><span>{Math.round(l.paidFrac * 100)}% paid</span><span>{open ? (l.room > 0 ? rs(l.room) + ' left' : 'Full') : fmt(l.acresContracted * 800) + ' kg contract'}</span></div>
      </div>
    </button>
  );
}

function CloseBoard({ rows, clock }) {
  const lab = { ahead: 'Going ahead', contracted: 'Contract signed', paid: 'Grower paid', delivered: 'Delivered', settled: 'Settled', offer: 'Smaller contract offered', lapsed: 'Refunded' };
  return (
    <section className="card stack">
      <div className="between"><h2>Market close · {clock.dates.close}</h2><span className="small muted">Only paid money counts. Fields under 80% did not go ahead.</span></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Field</th><th className="r">Paid</th><th>Result</th><th className="r">Contract</th><th className="r">Refunded</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{r.grower} <span className="xs faint">{r.id}</span></td><td className="r">{Math.round(r.frac * 100)}%</td>
            <td>{statusTag(r.status)}{r.decision && <span className="xs faint"> {r.decision}</span>}</td>
            <td className="r">{['lapsed'].includes(r.status) ? '–' : r.status === 'offer' ? `${r.offerAcres} of ${r.acres} ac offered` : `${r.acresContracted} ac`}</td>
            <td className="r">{r.refund > 0 ? rs(r.refund) : '–'}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function PriceRule({ P }) {
  return (
    <section className="card stack">
      <h2>How the price is set</h2>
      <p className="muted">One published rule for every crop and season. Growers are paid Rs {fmt(P.price)} per 40 kg; investors pay Rs {fmt(P.cost, 1)} including Barak's 2.5% fee.</p>
      <div className="grid g3">
        <div className="card flat"><span className="small muted">Hurdle = SBP rate × tenor + season risk premium</span><b style={{ fontWeight: 500 }}>{(P.rf * 100).toFixed(1)}% × {P.tenor} + {(P.premium * 100).toFixed(1)}% = {(P.hurdle * 100).toFixed(1)}%</b></div>
        <div className="card flat"><span className="small muted">Price = (reference × (1 − fee) − carry) ÷ (1 + hurdle)</span><b style={{ fontWeight: 500 }}>({fmt(P.ref)} × 0.965 − {P.carry}) ÷ {(1 + P.hurdle).toFixed(4)} = {fmt(P.raw, 0)} → Rs {fmt(P.price)}</b></div>
        <div className="card flat"><span className="small muted">Guardrails checked before the season opens</span>
          <span className="small">{P.checks.discount ? '✓' : '✗'} Grower discount {Math.round(P.discount * 100)}% ≤ 30%</span>
          <span className="small">{P.checks.stress ? '✓' : '✗'} Stress result {Math.round(P.stressRet * 100)}% ≥ −15%</span>
          <span className="small">{P.checks.advance ? '✓' : '✗'} Advance {rs(P.advance)}/acre ≥ cost of production</span></div>
      </div>
    </section>
  );
}

export function FieldPage({ id }) {
  const { clock, user, pricing } = useApp();
  const { data, error } = useData('/api/fields/' + id);
  const { go } = useRouter();
  const [amount, setAmount] = useState(50000);
  const [q, setQ] = useState(null);
  useEffect(() => { if (!data || !data.listing.open) return; const t = setTimeout(() => api('/api/quote', { kind: 'field', field: id, amount }).then(setQ).catch(() => setQ(null)), 250); return () => clearTimeout(t); }, [amount, data, id]);
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const l = data.listing, c = data.crop;
  const series = c.series.map((s) => s.ndvi);
  return (
    <div className="wrap stack-l" style={{ paddingTop: 24, paddingBottom: 48 }}>
      <Link to="/" className="small">← All fields</Link>
      <div className="split">
        <div className="stack">
          <div className="hero-img" style={{ height: 280 }}><img src={phOf(l.photo)} alt="" /><span className="illus">Illustrative image · not this field</span></div>
          <div className="between"><h1>{l.grower}</h1>{statusTag(l.status)}</div>
          <p className="muted">{l.id} · {l.village} · {l.acres} acres listed · Grade {l.grade} · {l.water}</p>
          <div className="grid g4">
            <Stat v={fmt(l.acres * 20) + ' md'} l="wheat owed if fully funded" sub={fmt(l.acres * 800) + ' kg · ' + fmt(l.acres * 800) + ' PAT'} />
            <Stat v={l.history.join(' · ')} l="past 3 yields, md/acre" />
            <Stat v={c.ndvi != null ? c.cov.toFixed(2) + '×' : fmt(l.estPerAc, 1) + ' md'} l={c.ndvi != null ? 'crop coverage now' : 'expected yield / acre'} sub={'owes 20 md/acre'} />
            <Stat v={rs(pricing.advance * l.acres)} l="advance to the grower" sub={`by ${clock.dates.mint}`} />
          </div>
          {series.length > 1 && (
            <div className="card"><div className="between"><h3>Crop health (NDVI), weekly from satellite</h3><span className="small muted">{c.stage ? '' : ''}{c.ndvi}</span></div><Spark data={series} min={0.1} max={0.85} h={80} /></div>
          )}
          <div className="card flat small">
            <b style={{ fontWeight: 500 }}>Why this field is Grade A</b>
            <span className="muted">Past yields average {(l.history.reduce((a, b) => a + b, 0) / 3).toFixed(1)} md/acre against 20 owed ({(l.history.reduce((a, b) => a + b, 0) / 60).toFixed(2)}× coverage), reliable {l.water.toLowerCase()} water, and a clean delivery record. Every grade pays the same price.</span>
          </div>
        </div>

        <aside className="card lift pad-l stack">
          <div className="kicker">Funding</div>
          <FundBar paid={l.paidFrac} res={l.resFrac} mine={(l.mine || l.mineKept) / l.target} />
          <div className="grid g2">
            <Stat v={Math.round(l.paidFrac * 100) + '%'} l={`paid · ${l.backers} investors`} />
            <Stat v={l.open ? rs(l.room) : '–'} l="room left" />
          </div>
          {l.open ? (
            <>
              <label className="field">Amount (PKR)<span className="hint">You can hold up to 20% of a field: {rs(l.cap)}{l.mine ? `, you have ${rs(l.mine)}` : ''}.</span>
                <input className="inp" inputMode="numeric" value={fmt(amount)} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </label>
              {q && (
                <div className="note">
                  {q.split ? <>Over the 20% cap or this field's room. {rs(q.alloc[0] && q.alloc[0].field === l.id ? q.alloc[0].amount : 0)} goes here and the rest is spread over {q.alloc.length - 1} more Grade A fields.</>
                    : <>{fmt(q.alloc.reduce((s, a) => s + a.pat, 0))} PAT · {(q.alloc.reduce((s, a) => s + a.pat, 0) / 40).toFixed(1)} maund from this field.</>}
                  {q.short > 250 && <> {rs(q.short)} does not fit anywhere.</>}
                </div>
              )}
              <button className="btn primary block" disabled={amount < 25000 || !q || q.placed < 25000} onClick={() => go(`/reserve?kind=field&field=${l.id}&amount=${amount}`)}>{amount < 25000 ? 'Minimum Rs 25,000' : 'Reserve ' + pkr(q ? q.placed : amount)}</button>
              <span className="xs faint">Reserving holds your place for 24 hours. Your money goes to escrow, not to Barak.</span>
            </>
          ) : <p className="small muted">The raise closed on {clock.dates.close}.{l.mineKept ? ` You hold ${fmt(Math.round(l.mineKept / pricing.kgCost))} PAT from this field.` : ''}</p>}
        </aside>
      </div>
    </div>
  );
}
