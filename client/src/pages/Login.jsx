import React, { useState } from 'react';
import { api, useApp, useRouter, Err } from '../lib.jsx';

export function LoginForm({ onDone, title = 'Sign in or create an account' }) {
  const { refresh } = useApp();
  const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [name, setName] = useState('');
  const [sent, setSent] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const send = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { setSent(await api('/api/auth/otp', { phone })); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const verify = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api('/api/auth/verify', { phone, code, name }); refresh(); onDone && onDone(r.user); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="stack">
      <h2>{title}</h2>
      {!sent ? (
        <form className="stack" onSubmit={send}>
          <label className="field">Mobile number<span className="hint">We send a 6-digit code by SMS.</span>
            <input className="inp" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus /></label>
          <Err e={err} />
          <button className="btn primary" disabled={busy}>Send code</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <div className="sandbox">Sandbox: no SMS gateway is connected. Your code is <b>{sent.sandboxCode}</b>.</div>
          <label className="field">6-digit code<input className="inp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
          {!sent.existing && <label className="field">Full name<span className="hint">As it appears on your CNIC.</span><input className="inp" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <Err e={err} />
          <div className="row"><button className="btn primary" disabled={busy}>{sent.existing ? 'Sign in' : 'Create account'}</button><button type="button" className="btn ghost" onClick={() => { setSent(null); setCode(''); }}>Change number</button></div>
        </form>
      )}
    </div>
  );
}

export default function Login() {
  const { path, go } = useRouter();
  const next = new URLSearchParams(path.split('?')[1] || '').get('next') || '/';
  return (
    <div className="wrap" style={{ paddingTop: 48, paddingBottom: 48 }}>
      <div className="card lift pad-l" style={{ maxWidth: 460, margin: '0 auto' }}>
        <LoginForm onDone={(u) => go(u.role === 'ops' ? '/ops' : u.role === 'grower' ? '/grower' : next === '/login' ? '/' : next)} />
        <hr className="rule" />
        <p className="small muted">Demo accounts: Ops <b>0300 0000001</b>, growers <b>0301 1000141</b> to <b>0301 1000152</b>. Any other number creates a new investor account.</p>
      </div>
    </div>
  );
}
