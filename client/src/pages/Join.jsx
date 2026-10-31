import React, { useState } from 'react';
import { api, useApp, useAction, Err, fmt, asset } from '../lib.jsx';

export default function Join() {
  const { ur, pricing, clock } = useApp();
  const t = (en, u) => (ur ? u : en);
  const [acres, setAcres] = useState(12), [yld, setYld] = useState(38);
  const [form, setForm] = useState({ name: '', phone: '', cnic: '', village: '' });
  const [done, setDone] = useState(false);
  const a = useAction();
  const owed = acres * 20, N = (x) => <span className="en" style={{ fontWeight: 500 }}>{x}</span>;
  const step = (v, set, lo, hi, label) => (
    <div className="row en" dir="ltr" style={{ gap: 10 }}>
      <button className="btn" style={{ width: 48, borderRadius: '50%', padding: 0 }} aria-label={label + ' −'} onClick={() => set(Math.max(lo, v - 1))}>−</button>
      <span style={{ fontSize: 22, fontWeight: 500, minWidth: 36, textAlign: 'center' }}>{v}</span>
      <button className="btn" style={{ width: 48, borderRadius: '50%', padding: 0 }} aria-label={label + ' +'} onClick={() => set(Math.min(hi, v + 1))}>+</button>
    </div>
  );
  return (
    <div className="wrap stack-l" style={{ paddingTop: 24, paddingBottom: 48 }}>
      <section className="split">
        <div className="stack">
          <div className="hero-img" style={{ height: 260 }}><img src={asset('img/field2.jpg')} alt="" /><span className="illus">{t('Illustrative image', 'تمثیلی تصویر')}</span></div>
          <div className="kicker">{t('For wheat growers · first fields in Sahiwal & Okara', 'گندم کے کاشتکاروں کے لیے · ساہیوال و اوکاڑہ')}</div>
          <h1 className={ur ? '' : 'display'} style={ur ? { fontSize: 32, lineHeight: 1.8 } : null}>{t('Get paid for your wheat before you sow.', 'گندم کی قیمت بوائی سے پہلے، 10 نومبر تک')}</h1>
          <p className="muted" style={{ fontSize: 17 }}>{t('Sell part of your harvest at a fixed price under a Salam contract. Paid in advance. No loan, no interest, no forced sale. You deliver to the certified warehouse in April and keep the rest of your harvest.', 'سلم معاہدے کے تحت اپنی فصل کا کچھ حصہ طے شدہ قیمت پر بیچیں۔ پیشگی ادائیگی۔ نہ قرض، نہ سود، نہ زبردستی فروخت۔ اپریل میں گودام میں ترسیل، باقی فصل آپ کی۔')}</p>
        </div>
        <section className="card lift pad-l stack">
          <div className="kicker">{t('What your acres would bring', 'آپ کے ایکڑ کتنا لائیں گے')}</div>
          <div className="between"><span>{t('Acres of wheat', 'گندم کے ایکڑ')}</span>{step(acres, setAcres, 1, 100, t('Acres', 'ایکڑ'))}</div>
          <div className="between"><span>{t('Usual yield, maund per acre', 'عام پیداوار، من فی ایکڑ')}</span>{step(yld, setYld, 21, 60, t('Yield', 'پیداوار'))}</div>
          <hr className="rule" />
          <span className="muted">{t('Paid to you by 10 Nov', '10 نومبر تک آپ کو ملیں گے')}</span>
          <div className="huge en" dir="ltr" style={{ textAlign: ur ? 'right' : 'left' }}>PKR {fmt(owed * pricing.price)}</div>
          <div className="grid g2">
            <div className="card flat"><span className="small muted">{t('You deliver by 30 Apr', '30 اپریل تک دینی ہے')}</span><span>{N(fmt(owed))} {t('maund', 'من')}</span></div>
            <div className="card flat" style={{ background: 'var(--accent-soft)' }}><span className="small muted">{t('Stays yours to sell', 'باقی آپ کی اپنی')}</span><span>{t('about', 'تقریباً')} {N(fmt(acres * (yld - 20)))} {t('maund', 'من')}</span></div>
          </div>
          <span className="small faint">{t(`Every contract is 20 maund an acre at Rs ${fmt(pricing.price)} a maund. The final amount depends on your field check and how much investors fund by 5 Nov.`, `ہر معاہدہ 20 من فی ایکڑ، Rs ${fmt(pricing.price)} فی من۔`)}</span>
        </section>
      </section>

      <section className="stack">
        <h2>{t('Why growers join', 'کاشتکار کیوں شامل ہوتے ہیں')}</h2>
        <div className="grid g3">
          {[[t('Cash when you need it', 'موسم کے لیے نقد رقم'), t('Paid in full by 10 Nov, before you sow: for seed, DAP and diesel.', '10 نومبر تک پوری رقم، بوائی سے پہلے: بیج، ڈی اے پی اور ڈیزل کے لیے۔')],
            [t('Your price is fixed before you sow', 'قیمت پہلے سے طے'), t(`Rs ${fmt(pricing.price)} a maund for this season, the same for every field. No haggling at the mandi.`, `اس سیزن کے لیے Rs ${fmt(pricing.price)} فی من، ہر کھیت یکساں۔ منڈی میں بھاؤ تاؤ نہیں۔`)],
            [t('Not a loan', 'یہ قرض نہیں'), t('It is a sale paid in advance. No interest, and you repay in wheat, not cash.', 'پیشگی فروخت ہے۔ سود نہیں، ادائیگی گندم میں۔')],
            [t('Grow more, keep more', 'زیادہ اگائیں، زیادہ رکھیں'), t('20 maund an acre. Whatever you grow above that is yours, at April prices.', '20 من فی ایکڑ۔ اس سے زیادہ پیداوار آپ کی، اپریل کی قیمت پر۔')],
            [t('Help through the season', 'پورے سیزن مدد'), t('Satellite checks on your field, a field officer, and a voice message before any heat wave.', 'سیٹلائٹ سے کھیت کی نگرانی، فیلڈ افسر، اور گرمی سے پہلے صوتی پیغام۔')],
            [t('Delivery made easy', 'آسان ترسیل'), t('One certified warehouse near your fields. Barak pays for the trolley.', 'قریب ایک منظور شدہ گودام۔ ٹرالی کا کرایہ بارک دے گا۔')]].map(([h, b]) => <div key={h} className="card"><b style={{ fontWeight: 500 }}>{h}</b><span className="small muted">{b}</span></div>)}
        </div>
      </section>

      <section className="card lift pad-l stack" style={{ maxWidth: 640 }}>
        <h2>{t('Register your acres', 'اپنے ایکڑ رجسٹر کریں')}</h2>
        {done ? (
          <p>{t('Registered. A field officer will call you within 2 days to book your field check.', 'رجسٹر ہو گیا۔ فیلڈ افسر 2 دن میں فیلڈ چیک کے لیے کال کریں گے۔')}</p>
        ) : (
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await a.run(() => api('/api/join', { ...form, acres, yield: yld })); if (r) setDone(true); }}>
            <div className="grid g2">
              <label className="field">{t('Name', 'نام')}<input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="field">{t('Mobile', 'موبائل')}<input className="inp en" dir="ltr" inputMode="tel" placeholder="0300 1234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="field">{t('CNIC (optional now)', 'شناختی کارڈ (اختیاری)')}<input className="inp en" dir="ltr" inputMode="numeric" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></label>
              <label className="field">{t('Village / Chak', 'گاؤں / چک')}<input className="inp" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} /></label>
            </div>
            <span className="small muted">{t(`${acres} acres, usual yield ${yld} maund an acre (from the calculator above).`, `${acres} ایکڑ، عام پیداوار ${yld} من فی ایکڑ۔`)}</span>
            <Err e={a.error} />
            <button className="btn primary" disabled={a.busy}>{t('Register', 'رجسٹر کریں')}</button>
          </form>
        )}
      </section>
    </div>
  );
}
