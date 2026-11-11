// Sign in with a 6-digit code sent by email (or a one-time link from Shihab). Shows only "JAS": no names.
import { html, useEffect, useRef, useState } from '../lib.js';
import {
  remembering, sendCode, setRemember, verifyCode, verifyLink,
} from '../api.js';
import { Checkbox, ErrorNotice, Loading, Page, TextField } from '../ui.js';

// After a successful sign-in the app shell takes her to the page she was opening (or Home).

export default function SignIn({ query }) {
  const [step, setStep] = useState(query.token_hash ? 'link' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRem] = useState(remembering());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const codeRef = useRef(null);

  useEffect(() => {
    if (!query.token_hash) return;
    setRemember(true);
    verifyLink(query.token_hash).catch((e) => { setError(e.message); setStep('email'); });
  }, [query.token_hash]);

  const ask = async (event) => {
    if (event) event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Please type your full email address.'); return; }
    setBusy(true);
    setError(null);
    try {
      setRemember(remember);
      await sendCode(clean);
      setEmail(clean);
      setStep('code');
      setTimeout(() => codeRef.current && codeRef.current.focus(), 50);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const check = async (event) => {
    event.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { setError('The code has 6 numbers.'); return; }
    setBusy(true);
    setError(null);
    try {
      setRemember(remember);
      await verifyCode(email, digits);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (step === 'link') return html`<${Page} title="Signing you in"><${Loading} label="Checking your sign-in link…" /><//>`;

  return html`
    <${Page} title="Sign in" className="signin">
      <p class="brand-mark" aria-hidden="true">JAS</p>
      <${ErrorNotice} error=${error} />
      ${step === 'email' ? html`
        <p>Type your email address and we'll send you a 6-digit code.</p>
        <form onSubmit=${ask} novalidate>
          <${TextField} label="Email address" type="email" value=${email} onInput=${setEmail}
            autocomplete="email" inputmode="email" spellcheck="false" required />
          <${Checkbox} label="Keep me signed in on this device" hint="Untick this on a shared computer."
            checked=${remember} onChange=${setRem} />
          <div class="actions"><button class="btn" type="submit" aria-disabled=${busy ? 'true' : undefined}>
            ${busy ? 'Sending…' : 'Send me a code'}</button></div>
        </form>` : html`
        <div class="notice notice-info"><p>If that email can use this dashboard, a 6-digit code is on its way
          to <strong>${email}</strong>. Check your inbox (and spam). The code works for 1 hour.</p></div>
        <form onSubmit=${check} novalidate>
          <${TextField} label="6-digit code" value=${code} onInput=${setCode} inputRef=${codeRef}
            autocomplete="one-time-code" inputmode="numeric" maxlength="7" class="code" required />
          <div class="actions">
            <button class="btn" type="submit" aria-disabled=${busy ? 'true' : undefined}>${busy ? 'Checking…' : 'Sign in'}</button>
            <button class="btn btn-secondary" type="button" onClick=${() => ask()}>Send a new code</button>
            <button class="btn-link" type="button" onClick=${() => { setStep('email'); setCode(''); setError(null); }}>
              Use a different email</button>
          </div>
        </form>`}
    <//>`;
}
