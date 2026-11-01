import React, { useState } from 'react';
import { api, useApp, useData, useAction, useRouter, Tag, Loading, Err, FundBar, fmt, rs } from '../lib.jsx';
import { LoginForm } from './Login.jsx';
import { InboxList } from './Account.jsx';
import { DirectGrower } from './Direct.jsx';

export default function Grower({ tab = 'home' }) {
  const { user, ur, clock } = useApp();
  const t = (en, u) => (ur ? u : en);
  const { data, error } = useData(user && user.role === 'grower' ? '/api/grower' : null);
  if (!user) return <div className="wrap phone" style={{ paddingTop: 32 }}><div className="card lift pad-l en" dir="ltr"><LoginForm title="Grower sign in" /></div></div>;
  if (user.role !== 'grower') return <div className="wrap" style={{ padding: 48 }}><p>{t('This app is for growers.', 'یہ ایپ کاشتکاروں کے لیے ہے۔')}</p></div>;
  if (error) return <div className="wrap" style={{ padding: 32 }}><Err e={error} /></div>;
  if (!data) return <Loading />;
  const head = (
    <div className="stack-s">
      <div className="kicker">{data.direct ? t('Barak Direct pilot · Wattoo Agri Farming', 'بارک ڈائریکٹ پائلٹ · وٹو ایگری فارمنگ') : t('Your season with Barak', 'بارک کے ساتھ آپ کا سیزن')} · {ur ? clock.date_ur : clock.date}</div>
      <h1 style={{ fontSize: ur ? 28 : 30, lineHeight: ur ? 1.8 : 1.15 }}>{t('Salaam, ' + user.name, 'السلام علیکم، ' + (user.name_ur || user.name))}</h1>
      {tab === 'home' && <p className="muted">{t('Paid in advance. No loan, no interest, no forced sale.', 'پیشگی ادائیگی۔ نہ قرض، نہ سود، نہ زبردستی فروخت۔')}</p>}
    </div>
  );
  const TabLinks = <GrowerTabs tab={tab} t={t} unread={user.unread} />;
  if (data.direct) return (
    <div className="wrap stack" style={{ paddingTop: 20, paddingBottom: 48, maxWidth: 900 }}>
      {head}{TabLinks}
      {tab === 'help' ? <Help data={data} t={t} ur={ur} direct /> : <DirectGrower p={data.direct} tab={tab} ur={ur} />}
    </div>
  );
  return (
    <div className="wrap phone stack" style={{ paddingTop: 20, paddingBottom: 48 }}>
      {head}{TabLinks}
      {tab === 'home' && <><NextStep data={data} t={t} /><Score s={data.score} t={t} /></>}
      {tab === 'field' && <Field data={data} t={t} ur={ur} />}
      {tab === 'money' && <Money data={data} t={t} />}
      {tab === 'help' && <Help data={data} t={t} ur={ur} />}
    </div>
  );
}

function GrowerTabs({ tab, t, unread }) {
  const { go } = useRouter();
  const T = [['home', t('Home', 'ہوم')], ['field', t('Field', 'کھیت')], ['money', t('Money', 'رقم')], ['help', t('Help', 'مدد') + (unread ? ` (${unread})` : '')]];
  return <div className="tabs hide-sm" role="tablist">{T.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k === 'home' ? '/grower' : '/grower/' + k)}>{l}</button>)}</div>;
}

const N = (x) => <span className="en" style={{ fontWeight: 500 }}>{x}</span>;

function NextStep({ data, t }) {
  const { clock, ur, pricing, user } = useApp();
  const a = useAction();
  const f = data.field, d = clock.day;
  const [reason, setReason] = useState(''), [code, setCode] = useState(null), [typed, setTyped] = useState('');
  const [md, setMd] = useState(''), [acct, setAcct] = useState({ method: f.payoutMethod || 'JazzCash', account: '' }), [editAcct, setEditAcct] = useState(false);
  const box = (title, body, extra) => (
    <section className="card lift pad-l stack-s">
      <div className="kicker">{t('Your next step', 'آپ کا اگلا قدم')}</div>
      <h2 style={{ lineHeight: ur ? 1.8 : 1.25 }}>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {extra}
      <Err e={a.error} />
    </section>
  );
  const payout = (
    <div className="card flat stack-s">
      <div className="between small"><span className="muted">{t('Paid to', 'ادائیگی')}</span><span className="en">{f.payoutLabel}</span></div>
      {f.paidDate == null && (!editAcct ? <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setEditAcct(true)}>{t('Change account', 'اکاؤنٹ تبدیل کریں')}</button> : (
        <div className="stack-s">
          <div className="chips">{['JazzCash', 'Easypaisa', 'Bank'].map((m) => <button key={m} className="chip en" aria-pressed={acct.method === m} onClick={() => setAcct({ ...acct, method: m })}>{m}</button>)}</div>
          <input className="inp en" dir="ltr" placeholder={acct.method === 'Bank' ? 'PK36 SCBL 0000 0011 2345 6702' : '0300 1234567'} value={acct.account} onChange={(e) => setAcct({ ...acct, account: e.target.value })} aria-label={t('Account', 'اکاؤنٹ')} />
          <button className="btn small" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={async () => { const r = await a.run(() => api('/api/grower/payout', acct), t('Account saved', 'اکاؤنٹ محفوظ')); if (r) setEditAcct(false); }}>{t('Save', 'محفوظ کریں')}</button>
        </div>
      ))}
    </div>
  );
  if (f.status === 'listed') return box(t('Your field is on the marketplace', 'آپ کا کھیت مارکیٹ میں ہے'),
    t(`Investors are funding your field until ${clock.dates.close}. At 80% it goes ahead; you sign and are paid the same day, by ${clock.dates.mint}.`, `سرمایہ کار ${clock.dates_ur.close} تک رقم دے رہے ہیں۔ 80٪ پر معاہدہ ہو گا؛ دستخط کے دن ہی ${clock.dates_ur.mint} تک ادائیگی۔`),
    <><FundBar paid={f.paidFrac} res={f.resFrac} /><div className="between small muted"><span>{N(Math.round(f.paidFrac * 100) + '%')} {t('paid', 'ادا شدہ')}</span><span>{N('Rs ' + fmt(f.advance))} {t('if fully funded', 'مکمل رقم پر')}</span></div>{payout}</>);
  if (f.status === 'offer') return box(t('Investors funded part of your field', 'سرمایہ کاروں نے آپ کے کھیت کا کچھ حصہ دیا'),
    t(`${Math.round(f.paidFrac * 100)}% was paid. You can take a smaller contract: ${f.offerAcres} acres instead of ${f.acres}. Decide by ${clock.dates.decide}.`, `${Math.round(f.paidFrac * 100)}٪ رقم آئی۔ آپ ${f.acres} کی بجائے ${f.offerAcres} ایکڑ کا معاہدہ لے سکتے ہیں۔ ${clock.dates_ur.decide} تک فیصلہ کریں۔`),
    <>
      <div className="grid g2">
        <div className="card flat"><span className="small muted">{t('You are paid', 'آپ کو ملیں گے')}</span>{N('Rs ' + fmt(f.offerAdvance))}</div>
        <div className="card flat"><span className="small muted">{t('You deliver', 'آپ دیں گے')}</span><span>{N(fmt(f.offerAcres * 20))} {t('maund', 'من')}</span></div>
      </div>
      <button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/decision', { accept: true }), t('Accepted. Sign next.', 'منظور۔ اب دستخط کریں۔'))}>{t('Accept the smaller contract', 'چھوٹا معاہدہ منظور کریں')}</button>
      <input className="inp" placeholder={t('Reason, if you decline (optional)', 'انکار کی وجہ (اختیاری)')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/decision', { accept: false, reason }), t('Declined. Investors will be refunded.', 'انکار درج۔'))}>{t('Decline', 'انکار')}</button>
    </>);
  if (f.status === 'lapsed') return box(t('Not funded this season', 'اس سیزن رقم پوری نہیں ہوئی'),
    t('Your field stayed under the line, so no contract was formed and you owe nothing. You are offered first for Rabi 2027-28.', 'کوئی معاہدہ نہیں ہوا اور آپ پر کچھ واجب نہیں۔ ربیع 2027-28 میں آپ کو پہلا موقع ملے گا۔'), <NextSeason data={data} t={t} a={a} />);
  if (f.status === 'ahead') return box(t('Your field is going ahead', 'آپ کا کھیت منظور ہو گیا'), t('Barak is counting the money. Your contract will be ready to sign in a day or two.', 'بارک رقم کا حساب کر رہا ہے۔ ایک دو دن میں معاہدہ دستخط کے لیے تیار ہو گا۔'));
  if (f.status === 'contracted') return box(f.signedDate ? t('Signed. Payment is being sent today', 'دستخط ہو گئے۔ آج ادائیگی بھیجی جا رہی ہے') : t('Sign your Salam contract', 'اپنے سلم معاہدے پر دستخط کریں'),
    f.signedDate ? t(`Signed on ${f.signedDate}. Under Salam the full price is paid when the contract is made.`, `${f.signedDateUr || f.signedDate} کو دستخط ہوئے۔ سلم میں پوری قیمت معاہدے کے وقت ادا ہوتی ہے۔`) : t('Read the terms below. When you sign, the full price is paid to you the same day.', 'نیچے شرائط پڑھیں۔ دستخط کے دن ہی پوری قیمت آپ کو مل جائے گی۔'),
    !f.signedDate && <>
      <div className="card flat stack-s small">
        {[[t('You sell', 'آپ بیچتے ہیں'), `${fmt(f.owedMd)} ${t('maund of Grade 1 wheat', 'من درجہ 1 گندم')}`], [t('You are paid now', 'ابھی ادائیگی'), 'Rs ' + fmt(f.advance)], [t('You deliver', 'ترسیل'), t(`by ${clock.dates.deliverBy} to the certified warehouse`, `${clock.dates_ur.deliverBy} تک منظور شدہ گودام`)], [t('If your crop falls short', 'اگر فصل کم ہو'), t('deliver later or from another source, or return the price for the missing part. No interest, no penalty to Barak.', 'بعد میں یا کسی اور ذریعے سے دیں، یا کمی کی قیمت واپس کریں۔ نہ سود، نہ جرمانہ۔')], [t('Your land', 'آپ کی زمین'), t('is never security for this contract.', 'اس معاہدے کی ضمانت نہیں۔')]].map(([k, v]) => <div key={k} className="between" style={{ gap: 12 }}><span className="muted">{k}</span><span style={{ textAlign: 'end' }}>{v}</span></div>)}
      </div>
      {payout}
      {code ? <>
        <div className="sandbox en" dir="ltr">Sandbox: no SMS gateway. Your signing code is <b>{code}</b>.</div>
        <input className="inp en" dir="ltr" inputMode="numeric" placeholder="6-digit code" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('Signing code', 'دستخطی کوڈ')} />
        <button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/sign', { code: typed }), t('Signed. You will be paid today.', 'دستخط ہو گئے۔ آج ادائیگی ہو گی۔'))}>{t('Sign the contract', 'معاہدے پر دستخط')}</button>
      </> : <button className="btn primary" disabled={a.busy} onClick={async () => { const r = await a.run(() => api('/api/auth/otp', { phone: user.phone })); if (r) setCode(r.sandboxCode); }}>{t('Send me a signing code', 'دستخطی کوڈ بھیجیں')}</button>}
      <span className="small faint">{t('Prefer paper? Your field officer can sign with you with a thumbprint and a witness.', 'کاغذ پر؟ فیلڈ افسر انگوٹھے اور گواہ کے ساتھ دستخط کروا سکتے ہیں۔')}</span>
    </>);
  if (f.status === 'paid' && !f.receiptDate) return box(t(`Did you receive Rs ${fmt(f.advance)}?`, `کیا آپ کو ${fmt(f.advance)} روپے ملے؟`),
    t(`Sent on ${f.paidDate} to ${f.payoutLabel}. Confirm so your receipt is on record.`, `${f.paidDateUr || f.paidDate} کو ${f.payoutLabel} پر بھیجے گئے۔ تصدیق کریں۔`),
    <><button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/receipt', {}), t('Thank you. Receipt recorded.', 'شکریہ۔ رسید درج۔'))}>{t('Yes, I received it', 'ہاں، مل گئے')}</button>
      <button className="btn" onClick={() => a.run(() => api('/api/grower/report', { type: 'Payment', text: 'Payment not received' }), t('Your field officer will call you today.', 'فیلڈ افسر آج کال کریں گے۔'))}>{t('Not yet', 'ابھی نہیں')}</button></>);
  if (f.status === 'paid' && d < 150) return box(!f.sownDate ? t('Sow and tell us', 'بوائی کریں اور بتائیں') : t('Grow your wheat', 'اپنی گندم اگائیں'),
    !f.sownDate ? t(`Sow by ${clock.dates.sowBy} for the best yield. Tap once you have sown so monitoring starts on the right day.`, `بہترین پیداوار کے لیے ${clock.dates_ur.sowBy} تک بوائی کریں۔ بوائی کے بعد بتائیں۔`) : t(`Sown on ${f.sownDate}. Advice for your field is on the Field tab; we send a voice message before any heat wave.`, `${f.sownDateUr || f.sownDate} کو بوائی ہوئی۔ مشورے کھیت والے حصے میں ہیں۔`),
    !f.sownDate && <button className="btn primary" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/sown', {}), t('Sowing recorded', 'بوائی درج'))}>{t('I have sown my wheat', 'میں نے بوائی کر لی')}</button>);
  if (f.status === 'paid') return box(t('Book your delivery day', 'ترسیل کا دن بُک کریں'),
    t(`Deliver ${fmt(f.owedMd)} maund to the certified warehouse by ${clock.dates.deliverBy}. Three trolleys a day, so no long queue. Barak pays the trolley fare.`, `${fmt(f.owedMd)} من ${clock.dates_ur.deliverBy} تک گودام پہنچائیں۔ روزانہ تین ٹرالیاں، لمبی قطار نہیں۔ کرایہ بارک دے گا۔`),
    <><Slots data={data} t={t} a={a} />
      <div className="stack-s small"><b style={{ fontWeight: 500 }}>{t('Check before you load', 'لوڈ کرنے سے پہلے')}</b>
        {[t('Moisture 10% or less (ask the officer to test)', 'نمی 10٪ یا کم (افسر سے جانچ کروائیں)'), t('No stones, straw or dust', 'پتھر، بھوسا یا مٹی نہیں'), t('Clean bags, no fertiliser bags', 'صاف بوریاں، کھاد کی بوریاں نہیں'), t('Bring your CNIC and the trolley slip', 'شناختی کارڈ اور ٹرالی پرچی ساتھ لائیں')].map((x) => <span key={x}>✓ {x}</span>)}</div>
      {data.lots.some((l) => l.grade === 'Rejected') && <div className="note">{t('Your last lot was not accepted. Dry or clean it and bring it back; you can ask for a re-test within 48 hours.', 'آپ کا پچھلا لاٹ قبول نہیں ہوا۔ خشک یا صاف کر کے دوبارہ لائیں۔')}</div>}</>);
  if (f.status === 'short') return box(t('Part of your wheat is still due', 'آپ کی کچھ گندم ابھی باقی ہے'),
    t(`${fmt(f.deliveredKg)} kg delivered, ${fmt(f.shortfallKg)} kg still due.${f.extension ? ' You have until ' + f.extension + '.' : ''} You may bring wheat of the same grade from another source. If you cannot, you return the price of the missing part only, with no interest and no penalty.`, `${fmt(f.deliveredKg)} کلو پہنچ گئی، ${fmt(f.shortfallKg)} کلو باقی۔ آپ کسی اور ذریعے سے اسی معیار کی گندم دے سکتے ہیں۔ ورنہ صرف کمی کی قیمت واپس، نہ سود نہ جرمانہ۔`));
  // delivered or settled
  return box(t('Contract complete. Thank you', 'معاہدہ مکمل۔ شکریہ'),
    f.resolution === 'refund' ? t('The missing part was settled by returning its price. Nothing more is owed.', 'کمی کی قیمت واپس ہو گئی۔ مزید کچھ واجب نہیں۔') : t('Your warehouse receipt is on the Money tab. On-time growers are offered first next season.', 'گودام رسید رقم والے حصے میں ہے۔ وقت پر ترسیل والوں کو اگلے سیزن پہلا موقع۔'),
    <>
      <div className="card flat stack-s">
        <b style={{ fontWeight: 500 }}>{t('Sell your extra wheat to Barak?', 'اضافی گندم بارک کو بیچیں؟')}</b>
        <span className="small muted">{t(`About ${fmt(data.keptMd)} maund above your contract is yours. Barak buys at the day's market price (Sahiwal mandi Rs ${fmt(data.mandi)}), paid on intake. No arhti commission.`, `معاہدے سے زائد تقریباً ${fmt(data.keptMd)} من آپ کی ہے۔ بارک آج کی منڈی قیمت پر خریدتا ہے، وصولی پر ادائیگی۔ آڑھتی کمیشن نہیں۔`)}</span>
        {data.surplus[0] ? <span className="small">{data.surplus[0].status === 'offered' ? <Tag k="watch">{t('Offer sent', 'پیشکش بھیج دی')}</Tag> : data.surplus[0].status === 'bought' ? <Tag k="ok">{t(`Barak buys ${data.surplus[0].md} maund at Rs ${fmt(data.surplus[0].price)}`, `بارک ${data.surplus[0].md} من خریدے گا`)}</Tag> : <Tag k="done">{t('Barak passed; sell anywhere', 'بارک نے نہیں خریدی')}</Tag>}</span> : (
          <div className="row"><input className="inp en" dir="ltr" style={{ maxWidth: 140 }} inputMode="numeric" placeholder={String(Math.min(data.keptMd, 200))} value={md} onChange={(e) => setMd(e.target.value.replace(/\D/g, ''))} aria-label={t('Maund', 'من')} />
            <button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/api/grower/surplus', { md: Number(md) || Math.min(data.keptMd, 200) }), t('Offer sent to Barak', 'پیشکش بھیج دی'))}>{t('Offer to Barak', 'بارک کو پیشکش')}</button></div>
        )}
      </div>
      <NextSeason data={data} t={t} a={a} />
    </>);
}

function NextSeason({ data, t, a }) {
  return data.nextSeason ? <Tag k="ok">{t('Rabi 2027-28: you are pre-approved', 'ربیع 2027-28: آپ پیشگی منظور ہیں')}</Tag>
    : <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={() => a.run(() => api('/api/grower/reenroll', {}), t('You are on the list for Rabi 2027-28', 'آپ ربیع 2027-28 کی فہرست میں ہیں'))}>{t('Join Rabi 2027-28 now', 'ربیع 2027-28 میں ابھی شامل ہوں')}</button>;
}

function Slots({ data, t, a }) {
  const { ur } = useApp();
  const [show, setShow] = useState(false);
  const f = data.field, list = data.slots.filter((s) => s.left > 0 || s.iso === f.deliveryDay);
  return (
    <div className="stack-s">
      {f.deliveryDay && <span><Tag k="ok">{t('Booked', 'بُک')}</Tag> <span className="en">{data.slots.find((s) => s.iso === f.deliveryDay)?.date}</span></span>}
      {(!f.deliveryDay || show) ? (
        <div className="en" dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
          {list.slice(0, 24).map((s) => <button key={s.iso} className="chip" aria-pressed={f.deliveryDay === s.iso} disabled={a.busy} onClick={async () => { await a.run(() => api('/api/grower/delivery-day', { date: s.iso }), t('Delivery day booked', 'ترسیل کا دن بُک')); setShow(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 52 }}><span>{s.date}</span><span className="xs muted">{s.left} {ur ? 'جگہ' : 'left'}</span></button>)}
        </div>
      ) : <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShow(true)}>{t('Change day', 'دن تبدیل کریں')}</button>}
    </div>
  );
}

function Score({ s, t }) {
  if (!s.of) return null;
  return (
    <section className="card stack-s">
      <div className="between"><h2>{t('Your grower record', 'آپ کا ریکارڈ')}</h2><Tag k={s.tier === 'Gold' ? 'ok' : s.tier === 'Silver' ? 'info' : 'watch'}>{t(s.tier, { Gold: 'گولڈ', Silver: 'سلور', Building: 'بن رہا ہے' }[s.tier] || s.tier)} · {t(`${s.points} of ${s.of} done`, `${s.of} میں سے ${s.points}`)}</Tag></div>
      {s.items.filter((i) => i.due).map((i) => <div key={i.t} className="check"><span className={'b' + (i.ok ? ' on' : '')}>{i.ok ? '✓' : ''}</span><span>{t(i.t, i.t_ur)}</span></div>)}
      <span className="small faint">{t('A good record means first place next season, a larger contract, and a history you can show a bank.', 'اچھا ریکارڈ: اگلے سیزن پہلا موقع، بڑا معاہدہ، اور بینک کو دکھانے کے لیے تاریخ۔')}</span>
    </section>
  );
}

function Field({ data, t, ur }) {
  const a = useAction();
  const c = data.crop;
  if (data.field.status !== 'paid' && data.field.status !== 'short') return <div className="card"><p className="muted">{t('Field advice starts once your contract is paid.', 'معاہدے کی ادائیگی کے بعد مشورے شروع ہوں گے۔')}</p></div>;
  return (
    <section className="card stack-s">
      <div className="between"><h2>{t('Advice for your field', 'آپ کے کھیت کے لیے مشورہ')}</h2><span className="small faint">{ur ? c.stage.ur : c.stage.en}</span></div>
      {c.harvested ? <p className="muted small">{t('Harvested.', 'کٹائی ہو گئی۔')}</p> : c.advice.length === 0 && <p className="muted small">{t('Crop checks start after germination.', 'اگاؤ کے بعد جانچ شروع ہو گی۔')}</p>}
      {!c.harvested && c.advice.map((x) => (
        <div key={x.k} className="card flat" style={{ boxShadow: x.pr === 1 && !x.done ? '0 0 0 2px var(--watch-fg)' : 'none' }}>
          <b style={{ fontWeight: 500 }}>{(ur ? x.ur : x.en)[0]}</b><span className="small muted">{(ur ? x.ur : x.en)[1]}</span>
          {x.k !== 'ok' && (x.done ? <span className="small"><Tag k="ok">{t('Done ' + x.done, 'مکمل ' + x.done)}</Tag></span> : <button className="btn small" style={{ alignSelf: 'flex-start' }} disabled={a.busy} onClick={() => a.run(() => api('/api/grower/task', { key: x.k }), t('Marked done', 'مکمل'))}>{t('I have done this', 'یہ کر لیا')}</button>)}
        </div>
      ))}
      <div className="en" dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {c.weather.map((w) => <div key={w.d} className="small" style={{ padding: '6px 0', borderRadius: 6, background: w.heat ? 'var(--risk-bg)' : 'var(--surface-2)' }}><div className="xs muted">{w.d}</div><b style={{ fontWeight: 500 }}>{w.hi}°</b>{w.rain > 0 && <div className="xs" style={{ color: 'oklch(0.5 0.12 240)' }}>{w.rain}mm</div>}</div>)}
      </div>
      {c.ndvi != null && <span className="xs faint en" dir="ltr">Checked by satellite on {c.checked} · NDVI {c.ndvi} · cover {c.cov.toFixed(2)}×{data.field.sownDate ? ' · sown ' + data.field.sownDate : ''}</span>}
      <Err e={a.error} />
    </section>
  );
}

function Money({ data, t }) {
  const { clock, pricing } = useApp();
  const f = data.field;
  return (
    <div className="stack">
      <section className="card stack-s">
        <div className="between"><h2>{t('Salam contract', 'سلم معاہدہ')}</h2><span className="xs faint en">{f.id}</span></div>
        {[[t('Acres', 'ایکڑ'), N(f.acresContracted)], [t('Wheat you deliver', 'دینی گندم'), <>{N(fmt(f.owedMd))} {t('maund', 'من')}</>], [t('Price', 'قیمت'), <>{N('Rs ' + fmt(pricing.price))} {t('a maund, fixed', 'فی من، طے شدہ')}</>], [t('Price paid to you', 'آپ کو ادائیگی'), N('Rs ' + fmt(f.advance))],
          [t('Signed', 'دستخط'), f.signedDate || t('Not yet', 'ابھی نہیں')], [t('Deliver by', 'ترسیل'), clock.dates.deliverBy], [t('Quality', 'معیار'), t('Grade 1, moisture 10% or less', 'درجہ 1، نمی 10٪ یا کم')], [t('Fees you pay', 'آپ کی فیس'), t('None', 'کوئی نہیں')]].map(([k, v], i) => (
          <div key={i} className="between" style={{ borderBottom: '1px solid var(--divider)', paddingBottom: 6 }}><span className="muted">{k}</span><span>{v}</span></div>
        ))}
      </section>
      <section className="card stack-s">
        <h2>{t('Payments', 'ادائیگیاں')}</h2>
        {!data.payments.length && <span className="small muted">{t('Nothing paid yet.', 'ابھی کوئی ادائیگی نہیں۔')}</span>}
        {data.payments.map((p) => <div key={p.id} className="between"><span>{p.type === 'surplus' ? t('Surplus wheat bought by Barak', 'اضافی گندم') : t('Price received', 'قیمت موصول')} · <span className="en small faint">{p.date}</span></span>{N('Rs ' + fmt(p.amount))}</div>)}
        {data.refunds.map((p) => <div key={p.id} className="between"><span>{t('Price returned for undelivered wheat', 'کمی کی قیمت واپس')} · <span className="en small faint">{p.date}</span></span>{N('− Rs ' + fmt(p.amount))}</div>)}
        {f.receiptDate && <span className="small"><Tag k="ok">{t('Receipt confirmed ' + f.receiptDate, 'رسید ' + f.receiptDate)}</Tag></span>}
      </section>
      {data.lots.length > 0 && (
        <section className="card stack-s">
          <h2>{t('Warehouse receipts', 'گودام رسیدیں')}</h2>
          {data.lots.map((l) => <div key={l.id} className="between small en" dir="ltr"><span>{l.ewr || 'Rejected'} · {l.date}{l.vehicle ? ' · ' + l.vehicle : ''}</span><span>{fmt(l.kg)} kg · {l.moisture}%</span></div>)}
        </section>
      )}
      <section className="card flat stack-s small">
        <b style={{ fontWeight: 500 }}>{t('Salam income statement', 'سلم آمدنی کا گوشوارہ')}</b>
        <span className="muted">{t('A record of your Salam sale for your own tax affairs. Ushr on your harvest is your own obligation; Barak does not deduct it.', 'آپ کے ٹیکس کے لیے سلم فروخت کا ریکارڈ۔ فصل پر عشر آپ کی ذمہ داری ہے؛ بارک اسے نہیں کاٹتا۔')}</span>
      </section>
    </div>
  );
}

function Help({ data, t, ur, direct }) {
  const a = useAction();
  const [open, setOpen] = useState(false), [type, setType] = useState(null), [text, setText] = useState('');
  const TYPES = [['Crop damage', t('Crop damage', 'فصل کا نقصان'), t('What happened, and roughly how much of the field?', 'کیا ہوا، اور کھیت کا کتنا حصہ؟')], ['Weight dispute', t('Weight dispute', 'وزن کا تنازعہ'), t('What weight did you expect, and what did the slip say?', 'آپ کا وزن کیا تھا اور پرچی پر کیا لکھا تھا؟')], ['Grade rejected', t('Grade or moisture rejected', 'معیار یا نمی پر انکار'), t('What reason did the warehouse give?', 'گودام نے کیا وجہ بتائی؟')], ['Payment', t('Payment not received', 'رقم نہیں ملی'), t('When did you sign?', 'آپ نے کب دستخط کیے؟')]];
  const cur = TYPES.find((x) => x[0] === type);
  return (
    <div className="stack">
      <section className="card flat stack-s">
        <b style={{ fontWeight: 500 }}>{t('Your field officer', 'آپ کے فیلڈ افسر')}: {ur ? 'عثمان علی' : 'Usman Ali'}</b>
        <span className="small muted">{t('We answer in Urdu and Punjabi, 8am to 8pm. Report crop damage within 48 hours.', 'ہم اردو اور پنجابی میں صبح 8 سے رات 8 بجے تک جواب دیتے ہیں۔ فصل کا نقصان 48 گھنٹے میں بتائیں۔')} <span className="tag done plain en">{t('Helpline number to follow', 'ہیلپ لائن نمبر جلد')}</span></span>
      </section>
      {!direct && (
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
          {(data.reports || []).map((r) => <div key={r.id} className="between small"><span>{r.type} · <span className="en faint">{r.date}</span></span>{r.status === 'open' ? <Tag k="watch">{t('Sent', 'بھیجا گیا')}</Tag> : <Tag k="ok">{t('Officer assigned', 'افسر مقرر')}</Tag>}</div>)}
        </section>
      )}
      <section className="stack-s"><h2>{t('Messages', 'پیغامات')}</h2><InboxList items={data.inbox || []} ur={ur} /></section>
    </div>
  );
}
