// Shared, accessible building blocks. Every page uses these so behavior and wording stay consistent.
import {
  html, useEffect, useId, useRef, useState,
} from './lib.js';
import { fileUrl, friendly, safeUrl } from './api.js';
import { app, update } from './store.js';
import { brandName } from './format.js';

// ---------------------------------------------------------------- announcements (screen readers)

let announceTimer;
/** Say something politely to screen readers (e.g. "Copied", "Added Boston"). */
export function announce(message) {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = message; }, 60);
}

// ---------------------------------------------------------------- page frame

/** Every page: sets the browser tab title and renders the page heading (focused after navigation). */
export function Page({
  title, back, children, className, lead,
}) {
  const shownTitle = useRef(title);
  useEffect(() => {
    document.title = `${title} · ${app.me ? brandName(app.me.owner_name) : 'JAS'}`;
    // A heading that changes after the page loads (e.g. "Job details" -> the job's title) while it has focus would
    // otherwise go unheard by screen readers.
    const h1 = document.getElementById('page-title');
    if (shownTitle.current !== title && h1 && document.activeElement === h1) announce(title);
    shownTitle.current = title;
  }, [title, app.me && app.me.owner_name]);
  return html`
    <div class=${className || ''}>
      ${back && html`<p><a class="back-link" href=${back.href}>← ${back.label}</a></p>`}
      <div class=${lead ? 'greeting' : 'page-head'}>
        ${lead || null}<h1 id="page-title" tabindex="-1">${title}</h1>
      </div>
      ${children}
    </div>`;
}

export function Notice({ kind = 'info', children, role }) {
  return html`<div class=${`notice notice-${kind}`} role=${role}>${children}</div>`;
}

export function Badge({ kind = 'info', children }) {
  return html`<span class=${`badge badge-${kind}`}>${children}</span>`;
}

export function Loading({ label = 'Loading…' }) {
  return html`<p class="loading" role="status">${label}</p>`;
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return html`
    <div class="notice notice-error" role="alert">
      <p>${typeof error === 'string' ? error : friendly(error)}</p>
      ${onRetry && html`<p><button type="button" class="btn btn-secondary" onClick=${onRetry}>Try again</button></p>`}
    </div>`;
}

/** Load data for a page: { data, error, loading, reload }. Keeps the old data on screen while reloading. */
export function useLoad(load, deps = []) {
  const [state, setState] = useState({ loading: true, data: undefined, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(load)
      .then((data) => { if (alive) setState({ loading: false, data, error: null }); },
        (err) => { if (alive) setState((s) => ({ ...s, loading: false, error: friendly(err) })); });
    return () => { alive = false; };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Renders loading / error / content for a useLoad() result. */
export function Loaded({ result, children, label }) {
  if (result.error && result.data === undefined) return html`<${ErrorNotice} error=${result.error} onRetry=${result.reload} />`;
  if (result.data === undefined) return html`<${Loading} label=${label} />`;
  return html`${result.error && html`<${ErrorNotice} error=${result.error} onRetry=${result.reload} />`}${children(result.data)}`;
}

// ---------------------------------------------------------------- buttons and links

/**
 * A button that runs an async action. While it runs, the button says so and ignores clicks (it stays
 * focusable). Problems show right next to it. `confirm` asks first ("Stop this application?").
 */
export function ActionButton({ onAction, confirm, className = 'btn', busyLabel = 'Working…', children, ...rest }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const click = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    try {
      await onAction();
    } catch (err) {
      if (alive.current) setError(friendly(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return html`
    <span class="action">
      <button type="button" class=${className} onClick=${click} aria-disabled=${busy ? 'true' : undefined} ...${rest}>
        ${busy ? busyLabel : children}
      </button>
      ${error && html`<span class="inline-error" role="alert"> ${error}</span>`}
    </span>`;
}

export function CopyButton({ text, label = 'Copy', what = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || '');
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = text || '';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    announce('Copied to the clipboard.');
    setTimeout(() => setCopied(false), 2500);
  };
  return html`<button type="button" class="btn btn-secondary" onClick=${copy}>
    ${copied ? 'Copied ✓' : label}${what && html`<span class="visually-hidden"> ${what}</span>`}
  </button>`;
}

/** A link to another website. Only http(s) links are ever rendered; others show as plain text. */
export function ExternalLink({ href: url, children, className }) {
  const safe = safeUrl(url);
  if (!safe) return html`<span>${children}</span>`;
  return html`<a class=${className} href=${safe} target="_blank" rel="noopener noreferrer">${children}<span class="visually-hidden"> (opens a new tab)</span></a>`;
}

/** A fresh, short-lived link to a private file (renewed every few minutes while the page is open). */
export function useFileUrl(path, download) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    const get = () => fileUrl(path, download).then((u) => { if (alive) setUrl(u); }, (e) => { if (alive) setError(friendly(e)); });
    get();
    const timer = setInterval(get, 8 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [path, download]);
  return { url, error };
}

export function FileLink({ path, download, children, className = 'btn btn-secondary' }) {
  const { url, error } = useFileUrl(path, download);
  if (!path) return null;
  if (error) return html`<span class="inline-error">${error}</span>`;
  if (!url) return html`<span class=${className} aria-disabled="true">${children}</span>`;
  return html`<a class=${className} href=${url} target="_blank" rel="noopener noreferrer" download=${download || undefined}>
    ${children}<span class="visually-hidden"> (opens a new tab)</span></a>`;
}

// ---------------------------------------------------------------- form fields

export function TextField({
  label, hint, error, value, onInput, type = 'text', multiline = false, rows = 4, inputRef, ...rest
}) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const props = {
    id, ref: inputRef, value: value ?? '', 'aria-describedby': described, 'aria-invalid': error ? 'true' : undefined,
    onInput: (e) => onInput(e.target.value), ...rest,
  };
  return html`
    <div class="field">
      <label for=${id}>${label}${hint && html`<span class="hint" id=${`${id}-hint`}>${hint}</span>`}</label>
      ${multiline ? html`<textarea rows=${rows} ...${props}></textarea>` : html`<input type=${type} ...${props} />`}
      ${error && html`<p class="inline-error" id=${`${id}-error`}>${error}</p>`}
    </div>`;
}

export function Checkbox({ label, hint, checked, onChange, ...rest }) {
  const id = useId();
  return html`
    <label class="choice" for=${id}>
      <input id=${id} type="checkbox" checked=${Boolean(checked)} onChange=${(e) => onChange(e.target.checked)}
        aria-describedby=${hint ? `${id}-hint` : undefined} ...${rest} />
      <span>${label}${hint && html`<span class="hint" id=${`${id}-hint`}>${hint}</span>`}</span>
    </label>`;
}

/** Radio buttons in a fieldset. options: [{ value, label, hint? }] */
export function RadioGroup({ legend, hint, options, value, onChange, name }) {
  const id = useId();
  return html`
    <fieldset aria-describedby=${hint ? `${id}-hint` : undefined}>
      <legend>${legend}</legend>
      ${hint && html`<p class="hint" id=${`${id}-hint`}>${hint}</p>`}
      ${options.map((o, i) => html`
        <label class="choice" for=${`${id}-${i}`}>
          <input id=${`${id}-${i}`} type="radio" name=${name || id} checked=${value === o.value}
            onChange=${() => onChange(o.value)} />
          <span>${o.label}${o.hint && html`<span class="hint">${o.hint}</span>`}</span>
        </label>`)}
    </fieldset>`;
}

/**
 * A checklist she can add her own items to (places, job titles, topics, words...).
 *   options:  the built-in choices [{ value, label }]; `selected` holds the checked values
 *   custom:   the items she added (all checked); unticking one removes it when she saves
 * Added items appear in the same list as checked boxes, so it reads as one checklist.
 */
export function ChecklistWithAdd({
  legend, hint, options = [], selected = [], onSelected, custom = [], onCustom, inputLabel, addLabel = 'Add',
  placeholder, maxItems = 30, maxLength = 80, addedNote = 'you added this', tourId, saveNote = 'Save to keep it.',
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const [shown, setShown] = useState(() => [...custom]);
  const inputRef = useRef(null);
  useEffect(() => {
    setShown((prev) => [...prev, ...custom.filter((c) => !prev.includes(c))]);
  }, [custom.join('\n')]);

  const toggleOption = (value, on) => {
    const next = new Set(selected);
    if (on) next.add(value); else next.delete(value);
    onSelected(options.map((o) => o.value).filter((v) => next.has(v)));
  };
  const toggleCustom = (item, on) => {
    onCustom(on ? shown.filter((s) => s === item || custom.includes(s)) : custom.filter((c) => c !== item));
  };
  const add = () => {
    const clean = text.replace(/[ \t\n\r\f\v]+/g, ' ').trim();
    if (!clean) { setError('Type something first.'); return; }
    if (clean.length > maxLength) { setError(`That's too long (${maxLength} characters at most).`); return; }
    const taken = [...options.map((o) => o.label), ...custom].some((v) => v.toLowerCase() === clean.toLowerCase());
    if (taken) { setError(`"${clean}" is already in the list.`); return; }
    if (custom.length >= maxItems) { setError(`You can add up to ${maxItems}.`); return; }
    setShown((prev) => [...prev.filter((p) => p.toLowerCase() !== clean.toLowerCase()), clean]);
    onCustom([...custom, clean]);
    setText('');
    setError('');
    setAdded(`Added ${clean}. ${saveNote}`);
    announce(`Added ${clean}. ${saveNote}`);
    if (inputRef.current) inputRef.current.focus();
  };

  return html`
    <fieldset class="checklist" data-tour=${tourId} aria-describedby=${hint ? `${id}-hint` : undefined}>
      <legend>${legend}</legend>
      ${hint && html`<p class="hint" id=${`${id}-hint`}>${hint}</p>`}
      ${options.map((o, i) => html`
        <label class="choice" for=${`${id}-o${i}`}>
          <input id=${`${id}-o${i}`} type="checkbox" checked=${selected.includes(o.value)}
            onChange=${(e) => toggleOption(o.value, e.target.checked)} />
          <span>${o.label}</span>
        </label>`)}
      ${shown.map((item, i) => html`
        <label class="choice" for=${`${id}-c${i}`}>
          <input id=${`${id}-c${i}`} type="checkbox" checked=${custom.includes(item)}
            onChange=${(e) => toggleCustom(item, e.target.checked)} />
          <span>${item} <span class="muted small">(${addedNote})</span></span>
        </label>`)}
      <div class="add-row" data-tour=${tourId ? `${tourId}-add` : undefined}>
        <div class="add-input">
          <label for=${`${id}-add`}>${inputLabel}</label>
          <input id=${`${id}-add`} ref=${inputRef} type="text" value=${text} maxlength=${maxLength}
            placeholder=${placeholder} aria-invalid=${error ? 'true' : undefined}
            aria-describedby=${error ? `${id}-err` : undefined}
            onInput=${(e) => { setText(e.target.value); setAdded(''); if (error) setError(''); }}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        </div>
        <button type="button" class="btn btn-secondary" onClick=${add}>${addLabel}<span class="visually-hidden"> to ${legend}</span></button>
      </div>
      ${error && html`<p class="inline-error" id=${`${id}-err`} role="alert">${error}</p>`}
      ${added && !error && html`<p class="add-note">${added}</p>`}
    </fieldset>`;
}

export { update };
