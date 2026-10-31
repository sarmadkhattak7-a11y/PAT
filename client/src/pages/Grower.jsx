import React, { useState } from 'react';
import { api, useApp, useData, useAction, Tag, Loading, Err, FundBar, fmt, rs } from '../lib.jsx';
import { LoginForm } from './Login.jsx';

export default function Grower() {
  const { user, ur, clock, pricing } = useApp();
  const t = (en, u) => (ur ? u : en);
  const { data, error } = useData(user && user.role === 'grower' ? '/api/grower' : null);
  if (!user) return <div className="wrap phone" style={{ paddingTop: 32 }}><div className="card lift pad-l en" dir="ltr"><LoginForm title="Grower sign in" /></div></div>;
  if (user.role !== 'grower') return <div className="wrap" style={{ padding: 48 }}><p>{t('This page is for growers.', 'یہ صفحہ کاشتکاروں کے لیے ہے۔')}</p></div>;
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const f = data.field, c = data.crop, d = clock.day;
  const N = (x) => <span className="en" style={{ fontWeight: 500 }}>{x}</span>;
  return (
    <div className="wrap phone stack" style={{ paddingTop: 20, paddingBottom: 48 }}>
      <div className="stack-s">
        <div className="kicker">{t('Your season with Barak', 'بارک کے ساتھ آپ کا سیزن')} · {ur ? clock.date_ur : clock.date}</div>
        <h1 style={{ fontSize: ur ? 28 : 30, lineHeight: ur ? 1.8 : 1.15 }}>{t('Salaam, ' + user.name, 'السلام علیکم، ' + (user.name_ur || user.name))}</h1>
        <p className="muted">{t('Paid in advance. No loan, no interest, no forced sale.', 'پیشگی ادائیگی۔ نہ قرض، نہ سود، نہ زبردستی فروخت۔')}</p>
      </div>
      <NextStep data={data} t={t} N={N} />
      <section className="card stack-s">
        <div className="between"><h2>{t('Salam contract', 'سلم معاہدہ')}</h2><span className="xs faint en">{f.id}</span></div>
        {[[t('Acres', 'ایکڑ'), N(f.acresContracted + (f.status === 'listed' || f.status === 'offer' ? '' : ''))],
          [t('Wheat you deliver', 'دینی گندم'), <>{N(fmt(f.owedMd))} {t('maund', 'من')} <span className="faint xs en">({fmt(f.owedMd * 40)} kg)</span></>],
          [t('Price', 'قیمت'), <>{N('Rs ' + fmt(pricing.price))} {t('a maund, fixed', 'فی من، طے شدہ')}</>],
          [t('Advance', 'پیشگی رقم'), N('Rs ' + fmt(f.advance))],
          [t('Paid by', 'ادائیگی'), ur ? clock.dates_ur.mint : clock.dates.mint],
          [t('Deliver by', 'ترسیل'), ur ? clock.dates_ur.deliverBy : clock.dates.deliverBy],
          [t('Quality', 'معیار'), t('Grade 1, moisture 10% or less', 'درجہ 1، نمی 10٪ یا کم')]].map(([k, v], i) => (
          <div key={i} className="between" style={{ borderBottom: '1px solid var(--divider)', paddingBottom: 6 }}><span className="muted">{k}</span><span>{v}</span></div>
        ))}
        <span className="small faint">{t('If the crop fails from hail, flood, heat or disease: deliver later, no penalty. Insurance covers the gap.', 'اگر اولے، سیلاب، گرمی یا بیماری سے فصل خراب ہو: بعد میں ترسیل، کوئی جرمانہ نہیں۔ انشورنس کمی پوری کرتی ہے۔')}</span>
      </section>
      {data.payments.length > 0 && (
        <section className="card stack-s">
          <h2>{t('Payments', 'ادائیگیاں')}</h2>
          {data.payments.map((p) => <div key={p.id} className="between"><span>{t('Advance received', 'پیشگی رقم موصول')} · <span className="en small faint">{p.date}</span></span>{N('Rs ' + fmt(p.amount))}</div>)}
          <span className="small faint">{t('A record of your Salam sale for your own tax affairs. Barak does not file returns on your behalf.', 'آپ کے ٹیکس کے لیے سلم فروخت کا ریکارڈ۔')}</span>
        </section>
      )}
      {['paid'].includes(f.status) && d >= 0 && <Advice c={c} t={t} ur={ur} />}
      {f.status === 'paid' && d >= 140 && (
        <section className="card stack-s">
          <h2>{t('Before you deliver in April', 'اپریل میں ترسیل سے پہلے')}</h2>
          <div className="between"><span className="muted">{t('Sahiwal mandi today', 'ساہیوال منڈی آج')}</span>{N('Rs ' + fmt(data.mandi))}</div>
          <div className="between"><span className="muted">{t('Your remaining wheat, about', 'آپ کی باقی گندم، تقریباً')}</span><span>{N(fmt(data.keptMd))} {t('maund', 'من')}</span></div>
          <span className="small faint">{t('The rest of your crop is yours. Prices usually rise after harvest; you can also store it in the warehouse and borrow against the receipt.', 'باقی فصل آپ کی ہے۔ کٹائی کے بعد قیمت عموماً بڑھتی ہے۔')}</span>
        </section>
      )}
      <Report data={data} t={t} />
      <section className="card flat stack-s">
        <b style={{ fontWeight: 500 }}>{t('Your field officer', 'آپ کے فیلڈ افسر')}: {ur ? data.officer.name_ur : data.officer.name}</b>
        <span className="small muted">{t('We answer in Urdu and Punjabi, 8am to 8pm.', 'ہم اردو اور پنجابی میں صبح 8 سے رات 8 بجے تک جواب دیتے ہیں۔')} <span className="tag done plain en">{t('Helpline number to follow', 'ہیلپ لائن نمبر جلد')}</span></span>
      </section>
    </div>
  );
}

function NextStep({ data, t, N }) {
  const { clock, ur, pricing } = useApp();
  const a = useAction();
  const f = data.field, d = clock.day;
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(f.deliveryDay || '2027-04-15');
  const box = (k, title, body, extra) => (
    <section className="card lift pad-l stack-s">
      <div className="kicker">{t('Your next step', 'آپ کا اگلا قدم')}</div>
      <h2 style={{ lineHeight: ur ? 1.8 : 1.25 }}>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {extra}
      <Err e={a.error} />
    </section>
  );
  if (f.status === 'listed') return box('listed', t('Your field is on the marketplace', 'آپ کا کھیت مارکیٹ میں ہے'),
    t(`Investors are funding your field until ${clock.dates.close}. At 80% it goes ahead and you are paid by ${clock.dates.mint}.`, `سرمایہ کار ${clock.dates_ur.close} تک آپ کے کھیت کے لیے رقم دے رہے ہیں۔ 80٪ پر معاہدہ ہو گا اور ${clock.dates_ur.mint} تک ادائیگی۔`),
    <><FundBar paid={f.paidFrac} res={f.resFrac} /><div className="between small muted"><span>{N(Math.round(f.paidFrac * 100) + '%')} {t('paid', 'ادا شدہ')}</span><span>{N('Rs ' + fmt(f.advance))} {t('advance if fully funded', 'مکمل رقم پر پیشگی')}</span></div></>);
  if (f.status === 'offer') return box('offer', t('Investors funded part of your field', 'سرمایہ کاروں نے آپ کے کھیت کا کچھ حصہ دیا'),
    t(`${Math.round(f.paidFrac * 100)}% was paid by the close. You can take a smaller contract: ${f.offerAcres} acres instead of ${f.acres}. Decide by ${clock.dates.decide}.`, `بندش تک ${Math.round(f.paidFrac * 100)}٪ رقم آئی۔ آپ چھوٹا معاہدہ لے سکتے ہیں: ${f.acres} کی بجائے ${f.offerAcres} ایکڑ۔ ${clock.dates_ur.decide} تک فیصلہ کریں۔`),
    <>
      <div className="grid g2">
        <div className="card flat"><span className="small muted">{t('Advance', 'پیشگی رقم')}</span>{N('Rs ' + fmt(f.offerAdvance))}</div>
        <div className="card flat"><span className="small muted">{t('You deliver', 'آپ دیں گے')}</span><span>{N(fmt(f.offerAcres * 20))} {t('maund', 'من')}</span></div>
      </div>
      <button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/decision', { accept: true }), t('Accepted. Barak will call to sign.', 'منظور۔ بارک دستخط کے لیے کال کرے گا۔'))}>{t('Accept the smaller contract', 'چھوٹا معاہدہ منظور کریں')}</button>
      <input className="inp" placeholder={t('Reason, if you decline (optional)', 'انکار کی وجہ (اختیاری)')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/decision', { accept: false, reason }), t('Declined. Investors will be refunded.', 'انکار درج۔ سرمایہ کاروں کو رقم واپس ہو گی۔'))}>{t('Decline', 'انکار')}</button>
    </>);
  if (f.status === 'lapsed') return box('lapsed', t('Not funded this season', 'اس سیزن رقم پوری نہیں ہوئی'),
    t('Your field stayed under 80%, so no contract was formed and you owe nothing. Your field stays on our list for Rabi 2027-28, offered first.', 'آپ کا کھیت 80٪ سے کم رہا، اس لیے کوئی معاہدہ نہیں اور آپ پر کچھ واجب نہیں۔ ربیع 2027-28 میں آپ کو پہلے موقع ملے گا۔'));
  if (f.status === 'ahead' || f.status === 'contracted') return box('signing', t('Your contract is going ahead', 'آپ کا معاہدہ طے ہو گیا'),
    t(`Sign with your field officer. Your advance of Rs ${fmt(f.advance)} is paid by ${clock.dates.mint}.`, `فیلڈ افسر کے ساتھ دستخط کریں۔ آپ کی پیشگی رقم Rs ${fmt(f.advance)} ${clock.dates_ur.mint} تک ادا ہو گی۔`));
  if (f.status === 'paid' && d < 140) return box('grow', d < 19 ? t('Sow by 20 November', '20 نومبر تک بوائی کریں') : t('Grow your wheat', 'اپنی گندم اگائیں'),
    d < 19 ? t('Your advance is paid. Sow by 20 November for the best yield. Recommended seed: Akbar-2019.', 'آپ کی پیشگی رقم ادا ہو گئی۔ بہترین پیداوار کے لیے 20 نومبر تک بوائی کریں۔ تجویز کردہ بیج: اکبر-2019۔')
      : t('Keep irrigating through March. We check your field by satellite every 5 days and send a voice message before any heat wave.', 'مارچ تک پانی دیتے رہیں۔ ہم ہر 5 دن سیٹلائٹ سے آپ کا کھیت دیکھتے ہیں اور گرمی سے پہلے پیغام بھیجتے ہیں۔'));
  if (f.status === 'paid') return box('deliver', t('Pick a delivery day', 'ترسیل کا دن چنیں'),
    t(`Deliver ${fmt(f.owedMd)} maund to the certified warehouse on Faisalabad Road by ${clock.dates.deliverBy}. Open 7am–6pm. Barak pays for the trolley.`, `${fmt(f.owedMd)} من فیصل آباد روڈ کے منظور شدہ گودام میں ${clock.dates_ur.deliverBy} تک پہنچائیں۔ صبح 7 سے شام 6۔ ٹرالی کا کرایہ بارک دے گا۔`),
    <>
      <label className="field">{t('Delivery day', 'ترسیل کا دن')}<input className="inp en" type="date" min="2027-03-20" max="2027-04-30" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/delivery-day', { date }), t('Delivery day booked', 'ترسیل کا دن بُک ہو گیا'))}>{f.deliveryDay ? t('Change delivery day', 'دن تبدیل کریں') : t('Confirm delivery day', 'دن کی تصدیق کریں')}</button>
      {f.deliveryDay && <span className="small"><Tag k="ok">{t('Booked', 'بُک')}</Tag> <span className="en">{f.deliveryDay}</span></span>}
      <div className="stack-s small"><b style={{ fontWeight: 500 }}>{t('Check before you load', 'لوڈ کرنے سے پہلے')}</b>
        {[t('Moisture 10% or less (ask the officer to test)', 'نمی 10٪ یا کم (افسر سے جانچ کروائیں)'), t('No stones, straw or dust', 'پتھر، بھوسا یا مٹی نہیں'), t('Clean bags, no fertiliser bags', 'صاف بوریاں، کھاد کی بوریاں نہیں'), t('Bring your CNIC', 'شناختی کارڈ ساتھ لائیں')].map((x) => <span key={x}>✓ {x}</span>)}</div>
    </>);
  if (f.status === 'delivered') return box('done', t('Delivered. Thank you', 'ترسیل مکمل۔ شکریہ'),
    t('Your warehouse receipt is ready. Growers who deliver on time get first place next season.', 'آپ کی گودام رسید تیار ہے۔ وقت پر ترسیل کرنے والوں کو اگلے سیزن پہلا موقع ملتا ہے۔'),
    data.delivery && <div className="card flat en small" dir="ltr"><b style={{ fontWeight: 500 }}>Receipt {data.delivery.ewr}</b><span>{fmt(data.delivery.kg)} kg · moisture {data.delivery.moisture}% · {data.delivery.grade} · {clock.date}</span></div>);
  return box('complete', t('Contract complete', 'معاہدہ مکمل'), t('Register your acres for Rabi 2027-28 by 15 September. Your price is offered first.', 'ربیع 2027-28 کے لیے 15 ستمبر تک اندراج کریں۔ آپ کو قیمت پہلے پیش کی جائے گی۔'));
}

function Advice({ c, t, ur }) {
  if (c.harvested) return null;
  return (
    <section className="card stack-s">
      <div className="between"><h2>{t('Advice for your field', 'آپ کے کھیت کے لیے مشورہ')}</h2><span className="small faint">{ur ? c.stage.ur : c.stage.en}</span></div>
      {c.advice.length === 0 && <p className="muted small">{t('Crop checks start after germination.', 'اگاؤ کے بعد فصل کی جانچ شروع ہو گی۔')}</p>}
      {c.advice.map((a) => (
        <div key={a.k} className="card flat" style={{ boxShadow: a.pr === 1 ? '0 0 0 2px var(--watch-fg)' : 'none' }}>
          <b style={{ fontWeight: 500 }}>{(ur ? a.ur : a.en)[0]}</b><span className="small muted">{(ur ? a.ur : a.en)[1]}</span>
        </div>
      ))}
      <div className="en" dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {c.weather.map((w) => <div key={w.d} className="small" style={{ padding: '6px 0', borderRadius: 6, background: w.heat ? 'var(--risk-bg)' : 'var(--surface-2)' }}><div className="xs muted">{w.d}</div><b style={{ fontWeight: 500 }}>{w.hi}°</b>{w.rain > 0 && <div className="xs" style={{ color: 'oklch(0.5 0.12 240)' }}>{w.rain}mm</div>}</div>)}
      </div>
      {c.ndvi != null && <span className="xs faint en" dir="ltr">Checked by satellite on {c.checked} · NDVI {c.ndvi} · coverage {c.cov.toFixed(2)}×</span>}
    </section>
  );
}

function Report({ data, t }) {
  const a = useAction();
  const [open, setOpen] = useState(false), [type, setType] = useState(null), [text, setText] = useState('');
  const TYPES = [['Crop damage', t('Crop damage', 'فصل کا نقصان'), t('What happened, and roughly how much of the field?', 'کیا ہوا، اور کھیت کا کتنا حصہ؟')], ['Weight dispute', t('Weight dispute', 'وزن کا تنازعہ'), t('What weight did you expect, and what did the slip say?', 'آپ کا وزن کیا تھا اور پرچی پر کیا لکھا تھا؟')], ['Grade rejected', t('Grade or moisture rejected', 'معیار یا نمی پر انکار'), t('What reason did the warehouse give?', 'گودام نے کیا وجہ بتائی؟')], ['Payment', t('Payment not received', 'رقم نہیں ملی'), t('When did you sign?', 'آپ نے کب دستخط کیے؟')]];
  const cur = TYPES.find((x) => x[0] === type);
  return (
    <section className="card stack-s">
      <div className="between"><h2>{t('Report a problem', 'مسئلہ درج کریں')}</h2>{!open && <button className="btn small" onClick={() => setOpen(true)}>{t('Report', 'درج کریں')}</button>}</div>
      {open && (
        <>
          <div className="chips">{TYPES.map(([k, l]) => <button key={k} className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>)}</div>
          {cur && <label className="field">{cur[2]}<textarea className="inp" value={text} onChange={(e) => setText(e.target.value)} /></label>}
          <Err e={a.error} />
          <div className="row"><button className="btn primary" disabled={!type || a.busy} onClick={async () => { const r = await a.run(() => api('/api/grower/report', { type, text }), t('Sent. Your field officer will call within 24 hours.', 'بھیج دیا۔ فیلڈ افسر 24 گھنٹے میں کال کریں گے۔')); if (r) { setOpen(false); setType(null); setText(''); } }}>{t('Send to Barak', 'بارک کو بھیجیں')}</button><button className="btn ghost" onClick={() => setOpen(false)}>{t('Cancel', 'منسوخ')}</button></div>
        </>
      )}
      {data.reports.map((r) => <div key={r.id} className="between small"><span>{r.type} · <span className="en faint">{r.date}</span></span>{r.status === 'open' ? <Tag k="watch">{t('Sent', 'بھیجا گیا')}</Tag> : <Tag k="ok">{t('Officer assigned: ' + r.officer, 'افسر مقرر: ' + r.officer)}</Tag>}</div>)}
    </section>
  );
}
