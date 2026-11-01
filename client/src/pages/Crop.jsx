import React, { useState } from 'react';
import { useApp, useData, Tag, Stat, Loading, Err, Spark, fmt } from '../lib.jsx';

const STOPS = { ndvi: [[0.52, 0.17, 30], [0.66, 0.16, 55], [0.84, 0.15, 95], [0.72, 0.17, 135], [0.5, 0.13, 150]], ndmi: [[0.5, 0.08, 55], [0.7, 0.07, 75], [0.9, 0.02, 200], [0.68, 0.1, 235], [0.45, 0.12, 260]] };
const RANGE = { ndvi: [0.15, 0.85], ndmi: [0.05, 0.5] };
function color(v, key) {
  if (v == null) return 'oklch(0.55 0.04 75)';
  const [lo, hi] = RANGE[key], t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))), st = STOPS[key];
  const f = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f)), u = f - i, a = st[i], b = st[i + 1];
  return `oklch(${(a[0] + (b[0] - a[0]) * u + 0.03).toFixed(3)} ${((a[1] + (b[1] - a[1]) * u) * 0.78).toFixed(3)} ${(a[2] + (b[2] - a[2]) * u).toFixed(1)})`;
}
const RISK = { ok: 'oklch(0.7 0.13 145)', watch: 'oklch(0.8 0.13 85)', risk: 'oklch(0.62 0.17 28)' };

export default function Crop() {
  const { user, clock } = useApp();
  const { data, error } = useData('/api/crop');
  const [sel, setSel] = useState(0), [layer, setLayer] = useState('ndvi');
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const f = data.fields[sel];
  const fill = (x) => (!x.active ? 'oklch(0.4 0.02 120)' : layer === 'risk' ? RISK[x.risk] : color(layer === 'ndvi' ? x.ndvi : x.ndmi, layer));
  return (
    <div className="stack-l">
      <div className="between">
        <div className="stack-s"><div className="kicker">Barak Crop Monitoring</div><h1>{data.stage.en} · {clock.date}</h1><span className="small muted">Sentinel-2 indices every 5 days through LIMS, with weather and soil. {data.median != null ? `Area median NDVI ${data.median}.` : 'Crop checks start after germination (late November).'}</span></div>
        <div className="chips" role="group" aria-label="Map layer">{[['ndvi', 'Crop health (NDVI)'], ['ndmi', 'Moisture (NDMI)'], ['risk', 'Delivery risk']].map(([k, l]) => <button key={k} className="chip" aria-pressed={layer === k} onClick={() => setLayer(k)}>{l}</button>)}</div>
      </div>
      <section className="split">
        <div className="card stack-s">
          <svg className="map" viewBox="0 0 600 400" role="group" aria-label="Field map">
            <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.05)" /></pattern></defs>
            <rect width="600" height="400" fill="url(#g)" />
            <path d="M0,250 C120,230 200,270 300,240 S480,200 600,220" fill="none" stroke="oklch(0.6 0.08 230)" strokeWidth="5" opacity="0.7" />
            <text x="440" y="212" fill="oklch(0.85 0.04 230)" fontSize="11">Lower Bari Doab Canal</text>
            {[['Chak 45/5L', 80, 92], ['Chak 88/6R', 330, 50], ['Chak 11/1AL', 470, 300], ['Chak 32/2L', 220, 380]].map(([n, x, y]) => <text key={n} x={x} y={y} fill="rgba(255,255,255,0.7)" fontSize="12">{n}</text>)}
            {data.fields.map((x, i) => (
              <path key={x.id} d={x.path} className={'parcel' + (i === sel ? ' sel' : '')} fill={fill(x)} tabIndex={0} role="button" aria-label={`${x.grower}, ${x.village}`}
                onClick={() => setSel(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(i))}><title>{x.grower}</title></path>
            ))}
            {data.fields.map((x) => x.risk !== 'ok' && x.active && x.ndvi != null && <text key={'t' + x.id} x={x.cx} y={x.cy + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" pointerEvents="none">!</text>)}
          </svg>
          <div className="between xs muted"><span>Grey: not under contract this season. Brown: before emergence or harvested.</span><span>{layer === 'risk' ? `Green ≥ ${data.thresholds.watch}× · amber ≥ ${data.thresholds.risk}× · red below` : 'Low → high'}</span></div>
          <div className="en" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
            {data.weather.map((w) => <div key={w.d} className="small" style={{ padding: '6px 0', borderRadius: 6, background: w.heat ? 'var(--risk-bg)' : 'var(--surface-2)' }}><div className="xs muted">{w.d}</div><b style={{ fontWeight: 500 }}>{w.hi}° / {w.lo}°</b>{w.rain > 0 && <div className="xs" style={{ color: 'oklch(0.75 0.1 240)' }}>{w.rain} mm</div>}</div>)}
          </div>
        </div>
        <aside className="card stack-s">
          <div className="between"><h2>{f.grower}</h2>{f.active ? <Tag k={f.risk}>{f.cov.toFixed(2)}× coverage</Tag> : <Tag k="done">Not contracted</Tag>}</div>
          <span className="small muted">{f.id} · {f.village} · {f.acres} acres · {f.status}</span>
          <div className="grid g3">
            <Stat v={f.ndvi != null ? f.ndvi.toFixed(2) : '–'} l="NDVI" /><Stat v={f.ndre != null ? f.ndre.toFixed(2) : '–'} l="NDRE" /><Stat v={f.ndmi != null ? f.ndmi.toFixed(2) : '–'} l="NDMI" />
          </div>
          <div className="grid g2">
            <Stat v={fmt(f.est) + ' md'} l={`estimated (${fmt(f.estLo)}–${fmt(f.estHi)})`} />
            <Stat v={fmt(f.owed) + ' md'} l="owed" />
          </div>
          {f.series.length > 1 && <><span className="small muted">NDVI by week</span><Spark data={f.series.map((s) => s.ndvi)} min={0.1} max={0.85} h={70} /></>}
          <b style={{ fontWeight: 500 }}>Advice</b>
          {!f.advice.length && <span className="small muted">Nothing to advise yet.</span>}
          {f.advice.map((a) => <div key={a.k} className="card flat" style={{ boxShadow: a.pr === 1 ? '0 0 0 2px var(--watch-fg)' : 'none' }}><b style={{ fontWeight: 500 }}>{a.en[0]}</b><span className="small muted">{a.en[1]}</span></div>)}
          {f.visit && <span className="small"><Tag k="info">Visit {f.visit.status}</Tag></span>}
        </aside>
      </section>
      <section className="card stack-s">
        <h2>All fields</h2>
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Grower</th><th>Village</th><th className="r">NDVI</th><th className="r">Est. md/acre</th><th className="r">Coverage</th><th>Top advice</th></tr></thead>
          <tbody>{data.fields.map((x, i) => (
            <tr key={x.id} className="click" onClick={() => setSel(i)}><td>{x.grower}</td><td className="small muted">{x.village}</td><td className="r">{x.ndvi != null ? x.ndvi.toFixed(2) : '–'}</td><td className="r">{x.perAc.toFixed(1)}</td>
              <td className="r">{x.active ? <Tag k={x.risk}>{x.cov.toFixed(2)}×</Tag> : '–'}</td><td className="small">{x.advice[0] ? x.advice[0].en[0] : '–'}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
