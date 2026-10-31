import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ── api ──
export const LOCAL = !!import.meta.env.VITE_LOCAL;
export const asset = (p) => import.meta.env.BASE_URL + p.replace(/^\//, '');
export async function api(url, body, method) {
  if (LOCAL) { const { localApi } = await import('./local/api.js'); return localApi(url, body, method); }
  const r = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// ── tiny router (history API) ──
const RouterCtx = createContext(null);
export function Router({ children }) {
  // The browser-only build keeps the current page in memory: its host does not carry paths in the URL.
  const [path, setPath] = useState(() => (LOCAL ? '/' : location.pathname + location.search));
  useEffect(() => { if (LOCAL) return; const f = () => setPath(location.pathname + location.search); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  const go = useCallback((to) => { setPath((p) => { if (to === p) return p; if (!LOCAL) history.pushState(null, '', to); scrollTo(0, 0); return to; }); }, []);
  return <RouterCtx.Provider value={{ path, go }}>{children}</RouterCtx.Provider>;
}
export const useRouter = () => useContext(RouterCtx);
export function Link({ to, children, className, ...rest }) {
  const { go } = useRouter();
  return <a href={LOCAL ? '#' : to} className={className} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>;
}

// ── app state ──
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// Load an endpoint and reload whenever the app's version bumps (after any action or clock change).
export function useData(url) {
  const { version } = useApp();
  const [s, set] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    if (!url) { set({ data: null, error: null, loading: false }); return; }
    api(url).then((data) => live && set({ data, error: null, loading: false })).catch((e) => live && set({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [url, version]);
  return s;
}

// ── formatting ──
export const fmt = (x, d = 0) => (x == null || isNaN(x) ? '–' : Number(x).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const rs = (x) => 'Rs ' + fmt(Math.round(x));
export const pkr = (x) => 'PKR ' + fmt(Math.round(x));
export const pct = (x, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
export const lakh = (x) => (x >= 1e7 ? 'Rs ' + (x / 1e7).toFixed(2) + ' crore' : x >= 1e5 ? 'Rs ' + (x / 1e5).toFixed(x % 1e5 ? 1 : 0) + ' lakh' : rs(x));
export const phOf = (n) => asset(`img/field${((n - 1) % 5) + 1}.jpg`);

// ── small components ──
export function FundBar({ paid, res = 0, mine = 0, label }) {
  const c = (v) => Math.max(0, Math.min(100, v * 100)) + '%';
  return (
    <div className="fbar" role="img" aria-label={label || `${Math.round(paid * 100)}% paid`}>
      <i className="res" style={{ width: c(res) }} />
      <i className="paid" style={{ width: c(paid) }} />
      {mine > 0 && <i className="mine" style={{ width: c(mine), insetInlineStart: c(paid - mine > 0 ? paid - mine : 0) }} />}
      <span className="tick" title="80% line" />
    </div>
  );
}
export function Tag({ k = 'info', children }) { return <span className={'tag ' + k}>{children}</span>; }
export function Stat({ v, l, sub }) { return <div className="stat"><div className="v">{v}</div><div className="l">{l}</div>{sub && <div className="xs faint">{sub}</div>}</div>; }
export function Err({ e }) { return e ? <div className="err" role="alert">{e}</div> : null; }
export function Loading() { return <div className="wrap" style={{ padding: '48px 24px' }}><p className="muted">Loading…</p></div>; }

export function Spark({ data, w = 300, h = 60, stroke = 'var(--accent)', min, max, fill = true }) {
  const v = data.filter((x) => x != null);
  if (v.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const lo = min ?? Math.min(...v), hi = max ?? Math.max(...v), r = hi - lo || 1;
  const pts = data.map((y, i) => [i / (data.length - 1) * w, h - 4 - ((y ?? lo) - lo) / r * (h - 8)]);
  const d = 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {fill && <path d={d + ` L${w},${h} L0,${h} Z`} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={stroke} />
    </svg>
  );
}

export function Timeline({ clock, ur }) {
  const d = clock.day;
  const ph = clock.phases;
  return (
    <div className="tline" aria-label={ur ? 'سیزن' : 'Season timeline'}>
      {ph.map((p) => {
        const done = d >= p.e, cur = d >= p.s && d < p.e, prog = cur ? ((d - p.s) / (p.e - p.s)) * 100 : 0;
        return (
          <div key={p.k} className={'seg' + (done ? ' done' : cur ? ' cur' : '')} style={{ '--p': prog + '%', flexGrow: Math.max(1, Math.sqrt(p.e - p.s)) }}>
            <div className="b" />
            <span>{ur ? p.ur : p.en}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ alignItems: 'flex-start' }}><h2 style={{ flex: 1 }}>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

// Button that runs an async action, shows errors, and refreshes app data.
export function useAction() {
  const { refresh, toast } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true); setError(null);
    try { const r = await fn(); refresh(); if (okMsg) toast(okMsg); return r; } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }, [refresh, toast]);
  return { busy, error, run, setError };
}
