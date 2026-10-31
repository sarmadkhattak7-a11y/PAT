import React, { useEffect } from 'react';
import { api, useApp, useData, useAction, Tag, Loading, Err, fmt, rs } from '../lib.jsx';
import { LoginForm } from './Login.jsx';

const KIND = { order: '◷', money: '₨', close: '⚑', token: '◈', contract: '✎', delivery: '⛟' };

export function InboxList({ items, ur }) {
  const { refresh } = useApp();
  useEffect(() => { if (items.some((n) => !n.read)) api('/api/inbox/read', {}).then(() => setTimeout(refresh, 1500)).catch(() => {}); }, [items.length]);
  if (!items.length) return <p className="muted">{ur ? 'ابھی کوئی پیغام نہیں۔' : 'No messages yet. Every payment, decision and crop update lands here and by SMS.'}</p>;
  return (
    <div className="stack-s">
      {items.map((n) => (
        <div key={n.id} className="card" style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', boxShadow: n.read ? 'var(--shadow)' : '0 0 0 2px var(--accent)' }}>
          <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{KIND[n.kind] || '•'}</span>
          <div className="stack-s" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="between"><b style={{ fontWeight: 500 }}>{ur && n.title_ur ? n.title_ur : n.title}</b><span className="xs faint en">{ur ? n.date_ur : n.date}</span></div>
            <span className="small muted">{ur && n.body_ur ? n.body_ur : n.body}</span>
            <span className="xs faint">{ur ? 'ایس ایم ایس اور صوتی پیغام بھی بھیجا گیا' : 'Also sent by ' + (n.channel || 'SMS')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InboxPage() {
  const { user } = useApp();
  const { data } = useData(user ? '/api/inbox' : null);
  if (!user) return <div className="wrap" style={{ paddingTop: 48 }}><div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}><LoginForm /></div></div>;
  return (
    <div className="wrap stack" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 760 }}>
      <div className="kicker">Inbox</div><h1>Messages</h1>
      {data ? <InboxList items={data} /> : <Loading />}
    </div>
  );
}

export default function Account() {
  const { user, pricing, clock } = useApp();
  const a = useAction();
  if (!user) return <div className="wrap" style={{ paddingTop: 48 }}><div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}><LoginForm /></div></div>;
  const p = user.prefs || {};
  const row = (k, v) => <div className="between" style={{ borderBottom: '1px solid var(--divider)', padding: '8px 0' }}><span className="muted">{k}</span><span>{v}</span></div>;
  return (
    <div className="wrap stack-l" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 880 }}>
      <div className="stack-s"><div className="kicker">Account</div><h1>{user.name}</h1><span className="muted small">{user.phone}{user.segment === 'direct' ? ' · Barak Direct buyer' : ''}</span></div>
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Verification</h2>
          {row('Mobile number', <Tag k="ok">Verified by code</Tag>)}
          {row('CNIC (NADRA)', user.cnicOk ? <Tag k="ok">Verified</Tag> : <Tag k="watch">Needed</Tag>)}
          {row('Bank account', user.bankOk ? <Tag k="ok">{user.iban || 'On file'}</Tag> : <Tag k="watch">Needed</Tag>)}
          {row('Season limit', user.segment === 'direct' ? 'Set by your agency agreement' : user.limit != null ? rs(user.limit) : 'Answer three questions')}
          {row('Key facts accepted', user.acked ? <Tag k="ok">Yes</Tag> : <Tag k="watch">Before first order</Tag>)}
          {row('Tax status', user.filer ? 'Active taxpayer (5.5% withholding)' : 'Not on the active list (11%)')}
        </div>
        <div className="card">
          <h2>Notifications</h2>
          <span className="small muted">Every payment, decision and crop update goes to your inbox and by SMS.</span>
          {[['whatsapp', 'Also send to WhatsApp'], ['reinvest', `Tell me first when Rabi 2027-28 opens (fields are offered to returning investors a week early)`]].map(([k, l]) => (
            <label key={k} className="row small" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={!!p[k]} onChange={(e) => a.run(() => api('/api/prefs', { [k]: e.target.checked }), 'Saved')} /> {l}</label>
          ))}
          <Err e={a.error} />
        </div>
      </section>
      <section className="card stack-s">
        <h2>How your money is handled</h2>
        <div className="grid g2">
          {[['Escrow at the bank', 'Your money sits in a client account Barak cannot spend. It leaves only to a grower who has signed and been paid on the same day, or back to you.'],
            ['Salam, not a loan', `You buy wheat in advance at Rs ${fmt(pricing.price)} a maund. No interest is charged or paid anywhere in the chain.`],
            ['Barak is your agent (Wakalah)', 'Barak signs, monitors, takes delivery and sells for you for fixed fees: 2.5% at purchase and 3.5% at sale. It takes no share of your gain or loss.'],
            ['If wheat is not delivered', 'The grower delivers later (up to 30 days) or refunds the price with no profit added. Barak returns its fee on that part. Late-delivery amounts go to charity, never to Barak or you.'],
            ['No resale before delivery', 'Salam wheat cannot be sold on before it is delivered, so PAT stay locked until the warehouse receipt is issued.'],
            ['Zakat and tax', 'Your statement shows an estimate of zakat on the market value of your wheat, and the withholding tax taken at sale with a certificate.']].map(([t, b]) => <div key={t} className="card flat"><b style={{ fontWeight: 500 }}>{t}</b><span className="small muted">{b}</span></div>)}
        </div>
        <span className="xs faint">Shariah review of the contracts: [Barak's Shariah advisor, to be appointed]. Complaints: Barak support first; then the regulator once licensed.</span>
      </section>
    </div>
  );
}
