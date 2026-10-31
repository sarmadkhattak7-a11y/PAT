import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AppCtx, Router, useRouter, Link, Loading, fmt } from './lib.jsx';
import Market, { FieldPage } from './pages/Market.jsx';
import Reserve from './pages/Reserve.jsx';
import Portfolio, { OrderDoc } from './pages/Portfolio.jsx';
import Grower from './pages/Grower.jsx';
import Join from './pages/Join.jsx';
import Ops from './pages/Ops.jsx';
import Crop from './pages/Crop.jsx';
import Ledger from './pages/Ledger.jsx';
import Login from './pages/Login.jsx';

export default function App() { return <Router><Shell /></Router>; }

function Shell() {
  const { path, go } = useRouter();
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToast] = useState(null);
  const [langPref, setLangPref] = useState(() => { try { return localStorage.getItem('barak-lang'); } catch { return null; } });
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const toast = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 3200); }, []);
  useEffect(() => { api('/api/state').then(setState).catch(() => setState({ error: true })); }, [version]);

  const route = path.split('?')[0];
  const user = state && state.user;
  const urPage = route === '/grower' || route === '/join';
  const lang = urPage ? (langPref || (route === '/grower' ? 'ur' : 'en')) : 'en';
  const setLang = (l) => { setLangPref(l); try { localStorage.setItem('barak-lang', l); } catch {} };
  const dark = route === '/ops' || route === '/crop';
  const ctx = useMemo(() => ({ ...(state || {}), version, refresh, toast, lang, setLang, ur: lang === 'ur' }), [state, version, lang]);

  if (!state) return <div className="app"><Loading /></div>;
  if (state.error) return <div className="app"><div className="wrap" style={{ padding: 48 }}><p>Cannot reach the Barak server. Is it running?</p></div></div>;

  let page;
  const m = (re) => route.match(re);
  if (route === '/') page = <Market />;
  else if (m(/^\/field\/([\w-]+)$/)) page = <FieldPage id={m(/^\/field\/([\w-]+)$/)[1]} />;
  else if (route === '/reserve') page = <Reserve />;
  else if (route === '/portfolio') page = <Portfolio />;
  else if (m(/^\/doc\/([\w-]+)$/)) page = <OrderDoc id={m(/^\/doc\/([\w-]+)$/)[1]} />;
  else if (route === '/grower') page = <Grower />;
  else if (route === '/join') page = <Join />;
  else if (route === '/ops') page = <Ops />;
  else if (route === '/crop') page = <Crop />;
  else if (route === '/ledger') page = <Ledger />;
  else if (route === '/login') page = <Login />;
  else page = <div className="wrap" style={{ padding: 48 }}><h1>Page not found</h1><p><Link to="/">Back to the marketplace</Link></p></div>;

  const showTicker = route !== '/grower' && route !== '/join' && route !== '/login';
  return (
    <AppCtx.Provider value={ctx}>
      <div className={'app' + (dark ? ' theme-dark' : '')} dir={lang === 'ur' ? 'rtl' : 'ltr'} lang={lang}>
        <TopBar route={route} user={user} urPage={urPage} />
        {(route === '/' || route.startsWith('/field') || route === '/reserve') && <div className="banner en">Salam offering platform · Preview. Outside funding opens after PVARA approval. Payments, SMS and identity checks run in sandbox mode.</div>}
        {showTicker && <Ticker clock={state.clock} />}
        <main style={{ flex: 1 }}>{page}</main>
        <footer className="foot en" dir="ltr"><div className="wrap between"><span>Barak AgriTech (Pvt) Ltd · Rabi 2026-27 wheat Salam · working prototype</span><span>1 PAT = 1 kg Grade 1 wheat · Salam price Rs {fmt(state.pricing.price)} / 40 kg</span></div></footer>
        <Dock />
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </AppCtx.Provider>
  );
}

function TopBar({ route, user, urPage }) {
  const { lang, setLang, refresh, toast } = useAppSafe();
  const { go } = useRouter();
  const ur = lang === 'ur';
  const role = user ? user.role : null;
  const items = role === 'ops' ? [['/ops', 'Ops'], ['/crop', 'Crop monitor'], ['/', 'Marketplace'], ['/ledger', 'Token ledger']]
    : role === 'grower' ? [['/grower', ur ? 'میرا کھیت' : 'My field']]
    : role === 'investor' ? [['/', 'Marketplace'], ['/portfolio', 'My wheat'], ['/ledger', 'Token ledger']]
    : [['/', 'Marketplace'], ['/ledger', 'Token ledger'], ['/join', ur ? 'کاشتکاروں کے لیے' : 'For growers']];
  const logout = async () => { await api('/api/auth/logout', {}); refresh(); toast(ur ? 'آپ سائن آؤٹ ہو گئے' : 'Signed out'); go('/'); };
  return (
    <header className="top">
      <div className="wrap">
        <Link to={role === 'grower' ? '/grower' : role === 'ops' ? '/ops' : '/'} className="brand" dir="ltr"><img src="/img/logo.png" alt="" /><span><b>Barak</b> AgriTech</span></Link>
        <nav className="nav" aria-label="Main">{items.map(([to, l]) => <Link key={to} to={to} className={route === to ? 'on' : ''}>{l}</Link>)}</nav>
        <div style={{ flex: 1 }} />
        {urPage && (
          <div className="chips" role="group" aria-label="Language">
            <button className="chip en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            <button className="chip ur" aria-pressed={lang === 'ur'} onClick={() => setLang('ur')} style={{ lineHeight: 1 }}>اردو</button>
          </div>
        )}
        {user ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted">{ur && user.name_ur ? user.name_ur : user.name}</span>
            <button className="btn small" onClick={logout}>{ur ? 'سائن آؤٹ' : 'Sign out'}</button>
          </div>
        ) : route !== '/login' && <Link to={'/login?next=' + encodeURIComponent(route)} className="btn small">{ur ? 'سائن ان' : 'Sign in'}</Link>}
      </div>
    </header>
  );
}
function useAppSafe() { return React.useContext(AppCtx); }

function Ticker({ clock }) {
  const p = clock.prices, chg = clock.priceHist.length > 1 ? p.pmex - clock.priceHist[clock.priceHist.length - 2] : 0;
  const items = [['PMEX', p.pmex, chg], ['Sahiwal mandi', p.sahiwal], ['Okara mandi', p.okara], ['Govt support (expected)', p.support]];
  return (
    <div className="ticker en" dir="ltr">
      <div className="wrap">
        <span className="kicker" style={{ color: 'var(--muted)' }}>Wheat, Rs / 40 kg</span>
        {items.map(([n, v, c]) => <span key={n}><span className="muted">{n}</span> <b style={{ fontWeight: 500 }}>{fmt(v)}</b> {c != null && <span className={c >= 0 ? 'up' : 'down'}>{c >= 0 ? '▲' : '▼'} {Math.abs(c)}</span>}</span>)}
        <span className="muted" style={{ marginInlineStart: 'auto' }}>As of {clock.date} · {clock.phaseLabel}</span>
      </div>
    </div>
  );
}

// Sandbox controls: quick sign-in as each role, and the season clock (Ops only).
function Dock() {
  const app = useAppSafe(); const { go } = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOps = app.user && app.user.role === 'ops';
  const as = async (phone, to) => {
    setBusy(true);
    try { const o = await api('/api/auth/otp', { phone }); await api('/api/auth/verify', { phone, code: o.sandboxCode }); app.refresh(); go(to); } finally { setBusy(false); }
  };
  const jump = async (day) => { setBusy(true); try { await api('/api/ops/clock', { day }); app.refresh(); app.toast('Clock moved'); } catch (e) { app.toast(e.message); } finally { setBusy(false); } };
  const J = [['14 Oct · raising', -18], ['5 Nov · close', 4], ['7 Nov · refunds', 6], ['10 Nov · pay growers', 9], ['Jan · tillering', 70], ['Mar · grain fill', 133], ['Apr · deliver', 170], ['May · April sale', 186], ['Sep · settle', 308]];
  return (
    <div className="dock">
      {open ? (
        <div className="panel" role="region" aria-label="Sandbox controls">
          <div className="between"><b>Sandbox controls</b><button onClick={() => setOpen(false)} aria-label="Close sandbox controls">×</button></div>
          <div>Season date: <b>{app.clock.date}</b> · {app.clock.phaseLabel} · market {app.clock.market}</div>
          <div style={{ opacity: 0.75 }}>Sign in as</div>
          <div className="row" style={{ gap: 6 }}>
            <button disabled={busy} onClick={() => as('03000000001', '/ops')}>Barak Ops</button>
            <button disabled={busy} onClick={() => as('03011000141', '/grower')}>Grower: Aslam</button>
            <button disabled={busy} onClick={() => as('03011000150', '/grower')}>Grower: Khalid</button>
            <button disabled={busy} onClick={() => go('/login?next=/')}>New investor</button>
          </div>
          <div style={{ opacity: 0.75 }}>Move the season clock {isOps ? '' : '(sign in as Ops)'}</div>
          <div className="row" style={{ gap: 6 }}>
            {J.map(([l, d]) => <button key={d} disabled={busy || !isOps} onClick={() => jump(d)} style={app.clock.day === d ? { borderColor: 'oklch(0.72 0.15 138)' } : null}>{l}</button>)}
          </div>
          {isOps && <button disabled={busy} onClick={async () => { if (confirm('Reset all demo data to the start of the season?')) { await api('/api/ops/reset', {}); app.refresh(); go('/'); } }}>Reset demo data</button>}
        </div>
      ) : <button className="pill" onClick={() => setOpen(true)}>Sandbox · <b>{app.clock.date}</b></button>}
    </div>
  );
}
