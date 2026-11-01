import React, { useState } from 'react';
import { api, useApp, useAction, Tag, Stat, Err, fmt, rs, lakh, pct } from '../lib.jsx';

// Barak Direct: the Rabi 2026-27 pilot. One buyer (Kashif Shabbir), one grower (Wattoo Agri Farming).
const STAGE = {
  proposal: ['Proposal stage', 'watch'], funded: ['Paid in · contract signs 10 Nov', 'info'], growing: ['Contract signed · crop growing', 'ok'],
  harvest: ['Harvest notice given', 'info'], delivering: ['Delivering to the mill', 'info'], delivered: ['Delivered · waiting for mill payment', 'ok'], settled: ['Settled', 'done'],
};
export const crore = (x) => (Math.abs(x) >= 1e7 ? 'Rs ' + (x / 1e7).toFixed(2) + ' crore' : 'Rs ' + (x / 1e5).toFixed(2) + ' lakh');

export function Timeline({ events, limit = 40 }) {
  return (
    <div className="tl">
      {events.slice(0, limit).map((e, i) => (
        <div key={i} className="it"><span className="xs faint">{e.date}</span><span className={'dot ' + e.kind} /><span className="small"><b style={{ fontWeight: 500 }}>{e.title}</b><div className="muted">{e.body}</div><div className="xs faint">{e.who}</div></span></div>
      ))}
    </div>
  );
}

export function Lots({ lots }) {
  if (!lots.length) return <p className="small muted">No lots yet. Delivery window: 1 to 30 April 2027.</p>;
  return (
    <div className="scroll-x"><table className="tbl small">
      <thead><tr><th>Lot</th><th>Date</th><th>Vehicle</th><th>Weighbridge slip</th><th className="r">Net kg</th><th className="r">Maunds</th><th className="r">Moisture</th><th className="r">Foreign</th><th>Result</th></tr></thead>
      <tbody>{lots.map((l) => <tr key={l.lot + l.day}><td>{l.lot}</td><td>{l.date}</td><td>{l.vehicle}</td><td>{l.slip}</td><td className="r">{fmt(l.kg)}</td><td className="r">{fmt(l.md)}</td><td className="r">{l.moisture}%</td><td className="r">{l.foreign}%</td><td>{l.accepted ? <Tag k="ok">Accepted</Tag> : <Tag k="risk">Rejected</Tag>}</td></tr>)}</tbody>
    </table></div>
  );
}

export function Blocks({ blocks }) {
  return (
    <div className="scroll-x"><table className="tbl small">
      <thead><tr><th>Block</th><th className="r">Acres</th><th>Sown</th><th className="r">NDVI</th><th className="r">Est. md/acre</th><th className="r">Est. maunds</th></tr></thead>
      <tbody>{blocks.map((b) => <tr key={b.id}><td>{b.id}</td><td className="r">{b.acres}</td><td>{b.isSown ? b.sownDate : 'Not yet'}</td><td className="r">{b.ndvi ?? '–'}</td><td className="r">{b.perAc.toFixed(1)}</td><td className="r">{fmt(b.est)}</td></tr>)}</tbody>
    </table></div>
  );
}

function Docs({ p }) {
  const d = p.day, D = p.D;
  const rows = [['Forward Purchase Proposal', D.proposal], ['Agency (Wakalah) Agreement', D.agency], ['Master Salam Agreement (copy)', D.agency], ['Mill purchase undertaking, Rs 4,500', D.buyerPaid], ['Grower guarantee and security cheque', D.cp], ['Season Schedule, Rabi 2026-27', D.signed], ['Grower\'s receipt for the price', p.receipt ? p.receipt.day : null], ['Monthly crop reports', 30], ['Delivery receipts (Schedule 4)', D.delivFrom], ['Settlement statement', D.buyerSettled]];
  return <div className="stack-s">{rows.map(([t, day]) => <div key={t} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span>{t}</span>{day != null && d >= day ? <Tag k="ok">On file</Tag> : <Tag k="done">Pending</Tag>}</div>)}</div>;
}

// Token simulation until PVARA approval: nothing is issued; shows the pilot as PAT would record it.
const TX = { mint: ['info', 'Mint'], unlock: ['ok', 'Delivered'], burn: ['done', 'Retired'], hold: ['watch', 'No change'], close: ['done', 'Closed'] };
export function TokenSim({ t, day, staff }) {
  const [all, setAll] = useState(false);
  const status = t.minted === 0 ? 'Not minted yet' : t.outstanding === 0 ? 'All retired' : t.burned ? 'Delivery under way' : 'Locked until delivery';
  const sign = (x) => (x.type === 'mint' ? '+' + fmt(x.pat) : x.type === 'burn' ? '−' + fmt(x.pat) : x.pat ? fmt(x.pat) : '–');
  const rows = all ? t.tx : t.tx.slice(0, 6);
  if (!staff) return (
    <div className="card stack-s">
      <div className="between"><h2>Your PAT tokens</h2><Tag k="watch">Simulation</Tag></div>
      <span className="small">{t.minted === 0 ? `${fmt(t.planned)} PAT to be minted on ${t.mintDate}` : `${fmt(t.outstanding)} PAT held · ${status.toLowerCase()}`}{t.burned ? ` · ${fmt(t.burned)} retired` : ''}</span>
      <span className="xs faint">Not issued until PVARA approval; the signed Season Schedule is the legal record. 1 PAT = 1 kg.</span>
      {t.tx.length > 0 && (
        <details className="small">
          <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Token records ({t.tx.length})</summary>
          {t.tx.map((x) => (
            <div key={x.seq} className="between xs" style={{ gap: 8, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
              <span><span className="faint">{x.date}</span> · {TX[x.type][1]}<div className="hash">{x.hash.slice(0, 16)}…</div></span>
              <span style={{ whiteSpace: 'nowrap' }}>{sign(x)}</span>
            </div>
          ))}
          <div className="xs faint" style={{ marginTop: 6 }}>Series {t.series} · wallet KS-0001</div>
        </details>
      )}
    </div>
  );
  return (
    <section className="card stack-s">
      <div className="between"><h2>{staff ? 'Token simulation' : 'Your PAT tokens'}</h2><Tag k="watch">Simulation · not issued</Tag></div>
      <span className="small muted">How this contract will appear as PAT once PVARA approves (1 PAT = 1 kg of wheat). No tokens exist yet: until then this is a physical Salam and the signed Season Schedule is the legal record.</span>
      {t.minted === 0 ? <p className="small">{fmt(t.planned)} PAT would be minted to {staff ? "Kashif Shabbir's" : 'your'} wallet on {t.mintDate}, when the grower signs and is paid.</p> : (
        <div className="grid g3">
          <Stat v={fmt(t.outstanding)} l={staff ? 'PAT outstanding' : 'PAT held'} sub={status} />
          <Stat v={fmt(t.burned)} l="PAT retired" sub="as wheat is sold to the mill" />
          {t.outstanding ? <Stat v={crore(t.value)} l="value at the mill price" sub="Rs 112.50 a kg" /> : <Stat v={crore(t.burned / 40 * 4500)} l="sold to the mill" sub="Rs 112.50 a kg, before the 3.5% fee" />}
        </div>
      )}
      {t.outstanding > 0 && <div className="between small" style={{ gap: 12 }}><span className="muted">Backing</span><span style={{ textAlign: 'end' }}>{day >= 30 ? `${fmt(t.reserve.inFieldKg)} kg estimated still in the field · ${t.reserve.cover.toFixed(2)}× the PAT outstanding` : 'Grower\'s Salam obligation; crop estimates start 1 Dec'}</span></div>}
      {rows.map((x) => (
        <div key={x.seq} className="ev">
          <span className="xs faint">#{x.seq} · {x.date}</span>
          <span className="small"><Tag k={TX[x.type][0]}>{TX[x.type][1]}</Tag><div className="xs muted" style={{ marginTop: 4 }}>{x.note}</div><div className="hash">{staff ? x.hash : x.hash.slice(0, 24) + '…'}</div></span>
          <span className="small" style={{ whiteSpace: 'nowrap' }}>{sign(x)}</span>
        </div>
      ))}
      {t.tx.length > 6 && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${t.tx.length} records`}</button>}
      <span className="xs faint">Series {t.series} · wallet {t.wallet} · hash-chained like the live PAT ledger</span>
    </section>
  );
}

export function DirectPortfolio({ p }) {
  const a = useAction();
  const [rating, setRating] = useState(5), [text, setText] = useState('');
  const [label, k] = STAGE[p.stage];
  const settled = p.stage === 'settled';
  return (
    <div className="wrap stack-l" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <section className="split">
        <div className="stack">
          <div className="kicker">Barak Direct · {p.season}</div>
          <h1>Your wheat Salam with Wattoo Agri Farming</h1>
          <p className="muted">{fmt(p.md)} maunds from {p.acres} acres in {p.district}, bought at Rs {fmt(p.price)} a maund. Barak acts as your agent (Wakalah) and sells to the mill at harvest. <Tag k={k}>{label}</Tag></p>
          {p.stage === 'proposal' && (
            <div className="card" style={{ boxShadow: '0 0 0 2px var(--watch-fg)' }}>
              <b style={{ fontWeight: 500 }}>Pay {crore(p.dueAtSigning)} by {p.dates.buyerPaid}</b>
              <span className="small muted">To {p.account}: price {crore(p.total)} + arrangement fee {crore(p.arrange)} + crop monitoring {crore(p.monitor)}. If the grower contract is not signed and paid by 10 Nov, everything is refunded within 3 working days.</span>
              <span className="sandbox">Simulation: your payment arrives on 5 Nov. Move the date in Sandbox to see the season play out.</span>
            </div>
          )}
          <div className="grid g3">
            <div className="card"><Stat v={crore(p.dueAtSigning)} l="paid in at signing" sub="price, 2.5% fee, monitoring" /></div>
            <div className="card"><Stat v={'Rs ' + fmt(p.millPrice)} l="mill undertaking, a maund" sub={`today's PMEX Rs ${fmt(p.market.pmex)}`} /></div>
            <div className="card"><Stat v={settled ? crore(p.net) : crore(p.net)} l={settled ? 'paid to you' : 'expected back'} sub={`profit ${crore(p.profit)} · ${(p.profit / (p.dueAtSigning + p.deliveryFee) * 100).toFixed(1)}% on all-in Rs ${fmt(p.allInMd)}/md`} /></div>
          </div>
        </div>
        <div className="card lift pad-l stack-s">
          <div className="kicker">Crop and delivery</div>
          {p.deliveredMd > 0 ? <><div className="huge">{fmt(p.deliveredMd)} md</div><span className="small muted">delivered of {fmt(p.md)} at the mill gate, Haveli Lakha</span></>
            : <><div className="huge">{p.est > 0 && p.day >= 30 ? p.cover.toFixed(2) + '×' : '–'}</div><span className="small muted">{p.day >= 30 ? `cover: estimated ${fmt(p.est)} maunds (${fmt(p.estLo)} to ${fmt(p.estHi)}) against ${fmt(p.md)} owed` : 'Crop estimates start after emergence (first report 1 Dec).'}</span></>}
          <hr className="rule" />
          <div className="between small"><span className="muted">Crop insurance</span><span>Not in place this season</span></div>
          <div className="between small"><span className="muted">If the crop falls short</span><span>Later delivery or price refunded, no profit</span></div>
          <div className="between small"><span className="muted">Token</span><span>Simulated until PVARA approval (below)</span></div>
          <label className="row small" style={{ gap: 8, marginTop: 6 }}><input type="checkbox" checked={!!(p.consent && p.consent.yes)} onChange={(e) => a.run(() => api('/api/pilot/consent', { yes: e.target.checked }), 'Saved')} /> Record my contract as PAT tokens once PVARA approves (Wakalah 9.2)</label>
          <Err e={a.error} />
        </div>
      </section>

      {p.lots.length > 0 && <section className="card stack-s"><div className="between"><h2>Delivery receipts</h2><span className="small muted">Weighed, sampled and tested at the mill gate; title passes to you, then the lot is sold to the mill</span></div><Lots lots={p.lots} /></section>}

      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s"><h2>What has happened</h2><Timeline events={p.events.filter((e) => e.kind !== 'sow')} /></div>
        <div className="stack">
          <div className="card stack-s">
            <h2>Money</h2>
            {p.cash.map((c, i) => <div key={i} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span>{c.t}<div className="xs faint">{c.date}</div></span><span className={c.v > 0 ? '' : 'muted'}>{c.v > 0 ? '+' : '−'}{rs(Math.abs(c.v))}</span></div>)}
            <div className="between small"><b style={{ fontWeight: 500 }}>Held for you now</b><b style={{ fontWeight: 500 }}>{rs(p.balance)}</b></div>
            <span className="xs faint">Held in the Barak client account at Bank Alfalah, separate from Barak's own money. Profit shown before tax; your withholding certificate comes with the statement.</span>
          </div>
          <TokenSim t={p.tokens} day={p.day} />
          <div className="card stack-s"><h2>Documents</h2><Docs p={p} /></div>
          <div className="card stack-s"><h2>Risks still open</h2>{p.risks.map((r) => <span key={r} className="small">• {r}</span>)}</div>
          {settled && (
            <div className="card stack-s">
              <h2>Pilot feedback</h2>
              {p.feedback ? <span className="small">Thank you. You rated the pilot {p.feedback.rating} of 5.</span> : (
                <>
                  <div className="chips">{[1, 2, 3, 4, 5].map((n) => <button key={n} className="chip" aria-pressed={rating === n} onClick={() => setRating(n)}>{n}</button>)}</div>
                  <textarea className="inp" placeholder="What should change for Rabi 2027-28?" value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={() => a.run(() => api('/api/pilot/feedback', { rating, text }), 'Thank you')}>Send feedback</button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function DirectGrower({ p, tab, ur }) {
  const a = useAction();
  const [md, setMd] = useState('');
  const t = (en, u) => (ur ? u : en);
  const done = p.deliveredMd >= p.md;
  if (tab === 'field') return (
    <div className="stack">
      <div className="card stack-s"><div className="between"><h2>{t('Your 400 acres', 'آپ کے 400 ایکڑ')}</h2><span className="small muted">{t('Barak Crop Monitoring with LIMS', 'بارک کراپ مانیٹرنگ اور LIMS')}</span></div><Blocks blocks={p.blocks} />
        <span className="xs faint">{t('Shown as eight 50-acre blocks until the khasra numbers in Schedule 2 are filled in.', 'شیڈول 2 میں خسرہ نمبر آنے تک 50 ایکڑ کے آٹھ بلاک۔')}</span></div>
      <div className="card stack-s"><h2>{t('Advice and alerts', 'مشورے اور انتباہ')}</h2><Timeline events={p.events.filter((e) => ['watch', 'report'].includes(e.kind))} limit={10} /></div>
    </div>
  );
  if (tab === 'money') return (
    <div className="stack">
      <div className="card stack-s">
        <h2>{t('Season Schedule', 'سیزن شیڈول')}</h2>
        {[[t('Contracted quantity', 'معاہدہ شدہ مقدار'), `${fmt(p.md)} md (${fmt(p.md * 40)} kg)`], [t('Price', 'قیمت'), `Rs ${fmt(p.price)} ${t('a maund, fixed', 'فی من، طے شدہ')}`], [t('Total price', 'کل قیمت'), crore(p.total)], [t('Paid on', 'ادائیگی'), p.dates.signed], [t('Delivery window', 'ترسیل کی مدت'), t('1 to 30 April 2027', 'یکم تا 30 اپریل 2027')], [t('Delivery point', 'ترسیل کی جگہ'), p.deliveryPoint], [t('Fees you pay', 'آپ کی فیس'), t('None. Buyers pay Barak\'s fees.', 'کوئی نہیں۔ فیس خریدار دیتے ہیں۔')]].map(([k, v]) => <div key={k} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span className="muted">{k}</span><span>{v}</span></div>)}
      </div>
      <div className="card stack-s"><h2>{t('Security held by Barak', 'بارک کے پاس ضمانت')}</h2>{p.cp.map((c) => <div key={c.t} className="check"><span className={'b' + (c.done ? ' on' : '')}>{c.done ? '✓' : ''}</span><span>{c.t}</span></div>)}<span className="xs faint">{t('Returned once 8,000 maunds are delivered (clause 13.2).', '8,000 من کی ترسیل پر واپس (شق 13.2)۔')}</span></div>
      <div className="card stack-s"><h2>{t('Income record', 'آمدنی کا ریکارڈ')}</h2><span className="small">{t(`Salam sale of ${fmt(p.md)} maunds for ${crore(p.total)}, received ${p.dates.signed}.`, `${fmt(p.md)} من کی سلم فروخت، ${crore(p.total)}۔`)}</span><span className="xs faint">{t('Ushr on your harvest is your own obligation; Barak does not deduct it.', 'فصل پر عشر آپ کی ذمہ داری ہے؛ بارک اسے نہیں کاٹتا۔')}</span></div>
    </div>
  );
  if (tab === 'help') return null;
  return (
    <div className="stack">
      <div className="card lift pad-l stack-s">
        <div className="kicker">{t('Your next step', 'آپ کا اگلا قدم')}</div>
        {p.stage === 'proposal' && <><h2>{t('Contract signs on 10 Nov', 'معاہدہ 10 نومبر کو')}</h2><p className="muted">{t('The buyer pays by 5 Nov. Barak then needs the guarantee, security cheque, board resolution and land records before paying the price.', 'خریدار 5 نومبر تک ادائیگی کرے گا۔ پھر ضمانت، سیکیورٹی چیک، بورڈ قرارداد اور زمین کا ریکارڈ درکار ہے۔')}</p></>}
        {p.stage === 'funded' && <><h2>{t('Sign the Season Schedule on 10 Nov', '10 نومبر کو سیزن شیڈول پر دستخط')}</h2><p className="muted">{t(`The buyer has paid. ${crore(p.total)} reaches your account the day you sign.`, `خریدار ادائیگی کر چکا۔ دستخط کے دن ${crore(p.total)} آپ کے اکاؤنٹ میں۔`)}</p></>}
        {p.stage === 'growing' && !p.receipt && <><h2>{t(`Confirm you received ${crore(p.total)}`, `${crore(p.total)} کی وصولی کی تصدیق کریں`)}</h2><p className="muted">{t('Clause 4.3: a signed receipt completes the Salam contract record.', 'شق 4.3: دستخط شدہ رسید سے معاہدے کا ریکارڈ مکمل ہوتا ہے۔')}</p><button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/receipt', {}), t('Receipt recorded', 'رسید درج'))}>{t('Confirm receipt', 'وصولی کی تصدیق')}</button></>}
        {p.stage === 'growing' && p.receipt && <><h2>{t('Grow and report', 'کاشت اور رپورٹ')}</h2><p className="muted">{t('Report any hail, flood, pest or water problem within 48 hours. Give 7 days\' notice before harvest.', 'اولے، سیلاب، کیڑے یا پانی کا مسئلہ 48 گھنٹے میں بتائیں۔ کٹائی سے 7 دن پہلے اطلاع دیں۔')}</p></>}
        {(p.stage === 'harvest' || p.stage === 'delivering') && <><h2>{t('Deliver to the mill gate', 'مل کے گیٹ پر ترسیل')}</h2><p className="muted">{t(`${fmt(p.deliveredMd)} of ${fmt(p.md)} maunds delivered. Each lot is weighed at the weighbridge and tested in front of your representative. A rejected lot can be re-dried and brought back.`, `${fmt(p.md)} میں سے ${fmt(p.deliveredMd)} من پہنچ گئی۔`)}</p></>}
        {done && !p.surplus && <><h2>{t('Contract delivered in full. Sell your surplus?', 'معاہدہ مکمل۔ اضافی گندم بیچیں؟')}</h2><p className="muted">{t(`About ${fmt(p.surplusMd)} maunds above the contract is yours. Barak has the first offer at the market price (clause 7.2).`, `معاہدے سے زائد تقریباً ${fmt(p.surplusMd)} من آپ کی ہے۔ بارک کو منڈی قیمت پر پہلی پیشکش کا حق ہے۔`)}</p>
          <div className="row"><input className="inp" style={{ maxWidth: 180 }} inputMode="numeric" placeholder={String(p.surplusMd)} value={md} onChange={(e) => setMd(e.target.value.replace(/\D/g, ''))} aria-label={t('Maunds to offer', 'من')} /><button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/surplus', { md: Number(md) || p.surplusMd }), t('Offer sent to Barak', 'پیشکش بھیج دی'))}>{t('Offer to Barak', 'بارک کو پیشکش')}</button></div></>}
        {done && p.surplus && <><h2>{t('Season complete', 'سیزن مکمل')}</h2><p className="muted">{p.surplusDecision ? (p.surplusDecision.buy ? t(`Barak bought ${fmt(p.surplus.md)} maunds at Rs ${fmt(p.surplusDecision.price)}.`, 'بارک نے اضافی گندم خرید لی۔') : t('Barak passed on the surplus. You are free to sell it anywhere.', 'بارک نے اضافی گندم نہیں خریدی۔ آپ کہیں بھی بیچ سکتے ہیں۔')) : t(`Surplus offer of ${fmt(p.surplus.md)} maunds sent. Barak answers within 3 days.`, 'اضافی گندم کی پیشکش بھیج دی گئی۔')}</p>
          {!p.rofr ? <button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/reenroll', {}), t('Saved', 'محفوظ'))}>{t('Confirm interest for Rabi 2027-28', 'ربیع 2027-28 کے لیے دلچسپی')}</button> : <Tag k="ok">{t('Rabi 2027-28: interest confirmed', 'ربیع 2027-28: دلچسپی کی تصدیق')}</Tag>}</>}
        <Err e={a.error} />
      </div>
      <div className="card stack-s"><h2>{t('Your obligations', 'آپ کی ذمہ داریاں')}</h2>{p.obligations.map(([o, ok]) => <div key={o} className="check"><span className={'b' + (ok ? ' on' : '')}>{ok ? '✓' : ''}</span><span>{o}</span></div>)}</div>
      {p.lots.length > 0 && <div className="card stack-s"><h2>{t('Delivery receipts', 'ترسیل کی رسیدیں')}</h2><Lots lots={p.lots} /></div>}
      <div className="card stack-s"><h2>{t('Season so far', 'اب تک')}</h2><Timeline events={p.events} limit={12} /></div>
    </div>
  );
}

export function DirectControl({ p }) {
  const a = useAction();
  return (
    <div className="stack-l">
      <div className="between"><div className="stack-s"><div className="kicker">Pilot · Barak Direct · {p.ref}</div><h1>Wattoo Agri Farming → Kashif Shabbir</h1><span className="small muted">{fmt(p.md)} maunds · {p.acres} acres, {p.district} · Rs {fmt(p.price)} a maund · {p.deliveryPoint}</span></div><Tag k={STAGE[p.stage][1]}>{STAGE[p.stage][0]}</Tag></div>
      <section className="grid g4">
        <div className="card"><Stat v={crore(p.dueAtSigning)} l="buyer paid in" /></div>
        <div className="card"><Stat v={crore(p.total)} l="price to grower" sub={p.dates.signed} /></div>
        <div className="card"><Stat v={crore(p.arrange + p.deliveryFee)} l="Barak fees" sub={`LIMS ${crore(p.monitor)}`} /></div>
        <div className="card"><Stat v={crore(p.balance)} l="client account balance" /></div>
      </section>
      {p.surplus && !p.surplusDecision && (
        <div className="card" style={{ boxShadow: '0 0 0 2px var(--watch-fg)' }}>
          <b style={{ fontWeight: 500 }}>Surplus offer: {fmt(p.surplus.md)} maunds from Wattoo</b>
          <span className="small muted">Right of first offer at the prevailing price (about Rs {fmt(p.market.pmex - 35)}). Answer within 3 days or the grower may sell elsewhere.</span>
          <div className="row"><button className="btn primary small" disabled={a.busy} onClick={() => a.run(() => api('/api/ops/pilot/surplus', { buy: true }), 'Surplus bought')}>Buy for the Barak Invest pool</button><button className="btn small" disabled={a.busy} onClick={() => a.run(() => api('/api/ops/pilot/surplus', { buy: false }), 'Passed')}>Pass</button></div>
          <Err e={a.error} />
        </div>
      )}
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s"><h2>Conditions before payment (13.1)</h2>{p.cp.map((c) => <div key={c.t} className="check"><span className={'b' + (c.done ? ' on' : '')}>{c.done ? '✓' : ''}</span><span>{c.t}</span></div>)}
          <h2 style={{ marginTop: 12 }}>Grower obligations</h2>{p.obligations.map(([o, ok]) => <div key={o} className="check"><span className={'b' + (ok ? ' on' : '')}>{ok ? '✓' : ''}</span><span>{o}</span></div>)}
          <div className="between small" style={{ marginTop: 8 }}><span>Grower receipt for price (4.3)</span>{p.receipt ? <Tag k="ok">{'Confirmed'}</Tag> : <Tag k="watch">Outstanding</Tag>}</div>
          <div className="between small"><span>Buyer consent to tokenise (Wakalah 9.2)</span>{p.consent && p.consent.yes ? <Tag k="ok">Given</Tag> : <Tag k="done">Not given</Tag>}</div>
        </div>
        <div className="card stack-s"><h2>Client account (Bank Alfalah)</h2>{p.cash.map((c, i) => <div key={i} className="between small" style={{ borderBottom: '1px solid var(--divider)', padding: '6px 0' }}><span>{c.t}<div className="xs faint">{c.date}</div></span><span>{c.v > 0 ? '+' : '−'}{rs(Math.abs(c.v))}</span></div>)}
          <div className="between small"><b style={{ fontWeight: 500 }}>Balance</b><b style={{ fontWeight: 500 }}>{rs(p.balance)}</b></div>
          <h2 style={{ marginTop: 12 }}>Open risks</h2>{p.risks.map((r) => <span key={r} className="small">• {r}</span>)}</div>
      </section>
      <section className="card stack-s"><div className="between"><h2>Monitored blocks</h2><span className="small muted">Estimated {fmt(p.est)} md ({fmt(p.estLo)}–{fmt(p.estHi)}) · {p.day >= 30 ? p.cover.toFixed(2) + '× cover' : 'before emergence'}</span></div><Blocks blocks={p.blocks} /></section>
      <section className="card stack-s"><h2>Delivery lots</h2><Lots lots={p.lots} /></section>
      <TokenSim t={p.tokens} day={p.day} staff />
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card stack-s"><h2>Timeline</h2><Timeline events={p.events} limit={60} /></div>
        <div className="card stack-s"><h2>Ledger records</h2><span className="small muted">Physical Salam until PVARA approval: milestones are hash-chained; tokens are simulated above, not issued.</span>
          {p.records.slice().reverse().map((r) => <div key={r.seq} className="ev"><span className="xs faint">#{r.seq} · {r.date}</span><span className="small">{r.title}<div className="hash">{r.hash.slice(0, 32)}…</div></span><span /></div>)}</div>
      </section>
    </div>
  );
}
