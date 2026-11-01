import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AppCtx, Router, useRouter, Link, Loading, fmt, asset, LOCAL } from './lib.jsx';
import Market, { FieldPage } from './pages/Market.jsx';
import Reserve from './pages/Reserve.jsx';
import Portfolio, { OrderDoc } from './pages/Portfolio.jsx';
import Account, { InboxPage } from './pages/Account.jsx';
import Grower from './pages/Grower.jsx';
import Join from './pages/Join.jsx';
import Control from './pages/Control.jsx';
import Login from './pages/Login.jsx';

export default function App() { return <Router><Shell /></Router>; }

// Three products share one backend: Barak Invest (public + investors), Barak Kisan (growers), Barak Control (Barak staff).
function appFor(route) {
  if (route.startsWith('/control') || route === '/ops' || route === '/crop' || route === '/ledger') return 'control';
  if (route.startsWith('/grower') || route === '/join') return 'kisan';
  return 'invest';
}

function Shell() {
  const { path, go } = useRouter();
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToast] = useState(null);
  const [langPref, setLangPref] = useState(() => { try { return localStorage.getItem('barak-lang'); } catch { return null; } });
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const toast = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 3200); }, []);
  useEffect(() => { api('/api/state').then(setState).catch(() => setState({ error: true })); }, [version]);
  useEffect(() => { const legacy = { '/ops': '/control', '/crop': '/control/crop', '/ledger': '/control/ledger' }[path]; if (legacy) go(legacy); }, [path]);

  const route = path.split('?')[0];
  const user = state && state.user;
  const app = appFor(route);
  const kisan = app === 'kisan';
  const lang = kisan ? (langPref || (user && user.role === 'grower' ? user.lang || 'ur' : route === '/join' ? 'en' : 'ur')) : 'en';
  const setLang = (l) => { setLangPref(l); try { localStorage.setItem('barak-lang', l); } catch {} };
  const ctx = useMemo(() => ({ ...(state || {}), version, refresh, toast, lang, setLang, ur: lang === 'ur' }), [state, version, lang]);

  if (!state) return <div className="app"><Loading /></div>;
  if (state.error) return (
    <div className="app"><div className="wrap stack" style={{ padding: 48, maxWidth: 560 }}>
      <h1>The demo could not start</h1>
      {LOCAL ? <>
        <p className="muted">Data saved in this browser from an earlier visit could not be opened. Resetting clears it and starts a fresh season.</p>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith('barak-')).forEach((k) => localStorage.removeItem(k)); } catch {} location.reload(); }}>Reset the demo in this browser</button>
      </> : <p className="muted">The Barak server did not answer. Check that it is running (npm start) and reload.</p>}
    </div></div>
  );

  let page;
  const m = (re) => route.match(re);
  if (app === 'control') page = <Control route={route} />;
  else if (route === '/') page = <Market />;
  else if (m(/^\/field\/([\w-]+)$/)) page = <FieldPage id={m(/^\/field\/([\w-]+)$/)[1]} />;
  else if (route === '/reserve') page = <Reserve />;
  else if (route === '/portfolio') page = <Portfolio />;
  else if (route === '/inbox') page = <InboxPage />;
  else if (route === '/account') page = <Account />;
  else if (m(/^\/doc\/([\w-]+)$/)) page = <OrderDoc id={m(/^\/doc\/([\w-]+)$/)[1]} />;
  else if (route.startsWith('/grower')) page = <Grower tab={route.split('/')[2] || 'home'} />;
  else if (route === '/join') page = <Join />;
  else if (route === '/login') page = <Login />;
  else page = <div className="wrap" style={{ padding: 48 }}><h1>Page not found</h1><p><Link to="/">Back to the marketplace</Link></p></div>;

  return (
    <AppCtx.Provider value={ctx}>
      <div className={'app app-' + app + (app === 'control' ? ' theme-dark' : '')} dir={lang === 'ur' ? 'rtl' : 'ltr'} lang={lang}>
        {app === 'invest' && <InvestBar route={route} user={user} />}
        {app === 'kisan' && <KisanBar route={route} user={user} />}
        {app === 'invest' && (route === '/' || route.startsWith('/field') || route === '/reserve') && <div className="banner en">Preview for the PVARA regulatory sandbox. Public investment opens after approval; payments, SMS and identity checks are simulated.</div>}
        {app === 'invest' && route !== '/login' && route !== '/account' && route !== '/inbox' && <Ticker clock={state.clock} />}
        <main style={{ flex: 1 }}>{page}</main>
        {app !== 'control' && <footer className="foot en" dir="ltr"><div className="wrap between"><span>Barak AgriTech (Pvt) Ltd · Rabi 2026-27 wheat Salam</span><span>{app === 'kisan' ? `Salam price Rs ${fmt(state.pricing.price)} a maund` : `1 PAT = 1 kg Grade 1 wheat · Salam price Rs ${fmt(state.pricing.price)} / 40 kg`}</span></div></footer>}
        {app === 'invest' && user && user.role === 'investor' && <BottomNav items={[['/', 'Market', '◫'], ['/portfolio', 'My wheat', '◉'], ['/inbox', 'Inbox', '✉', user.unread], ['/account', 'Account', '☰']]} route={route} />}
        {app === 'kisan' && user && user.role === 'grower' && <BottomNav items={lang === 'ur' ? [['/grower', 'ہوم', '⌂'], ['/grower/field', 'کھیت', '❦'], ['/grower/money', 'رقم', '₨'], ['/grower/help', 'مدد', '✆', user.unread]] : [['/grower', 'Home', '⌂'], ['/grower/field', 'Field', '❦'], ['/grower/money', 'Money', '₨'], ['/grower/help', 'Help', '✆', user.unread]]} route={route} />}
        <Dock />
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </AppCtx.Provider>
  );
}

function BottomNav({ items, route }) {
  return (
    <nav className="bottomnav" aria-label="App">
      {items.map(([to, l, ic, badge]) => (
        <Link key={to} to={to} className={route === to ? 'on' : ''}><span aria-hidden="true" className="ic">{ic}</span><span>{l}</span>{badge > 0 && <b className="badge">{badge}</b>}</Link>
      ))}
    </nav>
  );
}

function useLogout() {
  const { refresh, toast, ur } = React.useContext(AppCtx); const { go } = useRouter();
  return async (to = '/') => { await api('/api/auth/logout', {}); refresh(); toast(ur ? 'آپ سائن آؤٹ ہو گئے' : 'Signed out'); go(to); };
}

function InvestBar({ route, user }) {
  const logout = useLogout();
  const inv = user && user.role === 'investor';
  const items = inv ? [['/', 'Marketplace'], ['/portfolio', 'My wheat'], ['/inbox', 'Inbox' + (user.unread ? ` (${user.unread})` : '')], ['/account', 'Account']] : [['/', 'Marketplace'], ['/join', 'For growers']];
  return (
    <header className="top">
      <div className="wrap">
        <Link to="/" className="brand" dir="ltr"><img src={asset('img/logo.png')} alt="" /><span><b>Barak</b> Invest</span></Link>
        <nav className="nav hide-sm" aria-label="Main">{items.map(([to, l]) => <Link key={to} to={to} className={route === to ? 'on' : ''}>{l}</Link>)}</nav>
        <div style={{ flex: 1 }} />
        {user ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted hide-sm">{user.name}</span>
            {user.role !== 'investor' && <Link to={user.role === 'ops' ? '/control' : '/grower'} className="btn small">{user.role === 'ops' ? 'Open Barak Control' : 'Open Barak Kisan'}</Link>}
            <button className="btn small" onClick={() => logout('/')}>Sign out</button>
          </div>
        ) : route !== '/login' && <Link to={'/login?next=' + encodeURIComponent(route)} className="btn small">Sign in</Link>}
      </div>
    </header>
  );
}

function KisanBar({ route, user }) {
  const { lang, setLang } = React.useContext(AppCtx);
  const logout = useLogout();
  const ur = lang === 'ur';
  return (
    <header className="top">
      <div className="wrap">
        <Link to={user && user.role === 'grower' ? '/grower' : '/join'} className="brand" dir="ltr"><img src={asset('img/logo.png')} alt="" /><span><b>Barak</b> Kisan</span></Link>
        {!user && <nav className="nav" aria-label="Main"><Link to="/">{ur ? 'سرمایہ کاروں کے لیے' : 'For investors'}</Link></nav>}
        <div style={{ flex: 1 }} />
        <div className="chips" role="group" aria-label="Language">
          <button className="chip en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button className="chip ur" aria-pressed={lang === 'ur'} onClick={() => setLang('ur')} style={{ lineHeight: 1 }}>اردو</button>
        </div>
        {user && user.role === 'grower' && <button className="btn small" onClick={() => logout('/join')}>{ur ? 'سائن آؤٹ' : 'Sign out'}</button>}
      </div>
    </header>
  );
}

function Ticker({ clock }) {
  const p = clock.prices, chg = clock.priceHist.length > 1 ? p.pmex - clock.priceHist[clock.priceHist.length - 2] : 0;
  const items = [['PMEX', p.pmex, chg], ['Sahiwal mandi', p.sahiwal], ['Okara mandi', p.okara], ['Support price', p.support]];
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

// Sandbox controls: switch persona and app, and move the season clock (with Barak's steps run automatically).
function Dock() {
  const app = React.useContext(AppCtx); const { go } = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [auto, setAuto] = useState(true), [arm, setArm] = useState(false);
  const as = async (phone, to) => {
    setBusy(true);
    try { const o = await api('/api/auth/otp', { phone }); await api('/api/auth/verify', { phone, code: o.sandboxCode }); app.refresh(); go(to); } finally { setBusy(false); }
  };
  const visitor = async (to) => { setBusy(true); try { await api('/api/auth/logout', {}); app.refresh(); go(to); } finally { setBusy(false); } };
  const jump = async (day) => { setBusy(true); try { await api('/api/sandbox/clock', { day, auto }); app.refresh(); app.toast(auto ? 'Moved the season and ran Barak\'s steps' : 'Clock moved'); } catch (e) { app.toast(e.message); } finally { setBusy(false); } };
  const J = [['14 Oct · raising', -18], ['3 Nov · last day to withdraw', 2], ['5 Nov · close', 4], ['10 Nov · sign & pay', 9], ['Jan · tillering', 70], ['Mar · grain fill', 133], ['Apr · harvest', 160], ['24 Apr · delivered', 175], ['May · April sale', 190], ['Jul · storage', 250], ['Sep · settle', 310]];
  const who = app.user ? `${app.user.name} (${app.user.segment === 'direct' ? 'pilot ' : ''}${app.user.role})` : 'Visitor';
  return (
    <div className="dock">
      {open ? (
        <div className="panel" role="region" aria-label="Sandbox controls">
          <div className="between"><b>Sandbox controls</b><button onClick={() => setOpen(false)} aria-label="Close sandbox controls">×</button></div>
          <div>{app.clock.date} · {app.clock.phaseLabel} · you are <b>{who}</b></div>
          <div className="dock-h">Barak Invest</div>
          <div className="row" style={{ gap: 6 }}>
            <button disabled={busy} onClick={() => visitor('/')}>Visitor</button>
            <button disabled={busy} onClick={() => visitor('/login?next=/')}>New investor</button>
          </div>
          <div className="dock-h">Barak Kisan</div>
          <div className="row" style={{ gap: 6 }}>
            <button disabled={busy} onClick={() => as('03011000141', '/grower')}>Aslam (12 acres)</button>
            <button disabled={busy} onClick={() => as('03011000150', '/grower')}>Khalid (smaller contract)</button>
            <button disabled={busy} onClick={() => as('03011000147', '/grower')}>Bashir (crop stress)</button>
          </div>
          <div className="dock-h">Pilot · Barak Direct</div>
          <div className="row" style={{ gap: 6 }}>
            <button disabled={busy} onClick={() => as('03001110001', '/portfolio')}>Kashif Shabbir · buyer</button>
            <button disabled={busy} onClick={() => as('03001110002', '/grower')}>Asim Wattoo · grower</button>
          </div>
          <div className="dock-h">Barak Control</div>
          <div className="row" style={{ gap: 6 }}><button disabled={busy} onClick={() => as('03000000001', '/control')}>Ops desk</button></div>
          <div className="dock-h">Season date</div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Run Barak's steps on the way</label>
          <div className="row" style={{ gap: 6 }}>
            {J.map(([l, d]) => <button key={d} disabled={busy} onClick={() => jump(d)} style={app.clock.day === d ? { borderColor: 'oklch(0.72 0.15 138)' } : null}>{l}</button>)}
          </div>
          <span style={{ opacity: 0.7 }}>Going back moves the date only; what happened stays. Reset to replay.</span>
          <button disabled={busy} onClick={async () => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 4000); return; } setArm(false); await api('/api/sandbox/reset', {}); app.refresh(); go('/'); }}>{arm ? 'Click again to reset everything' : 'Reset demo data'}</button>
        </div>
      ) : <button className="pill" onClick={() => setOpen(true)}>Sandbox · <b>{app.clock.date}</b></button>}
    </div>
  );
}
