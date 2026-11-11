// Pieces shared by the settings pages: loading her preferences, a labelled drop-down, an editable list,
// the Save area (button, "saved" note, and any problem right below it), and small text helpers.
import {
  html, useEffect, useId, useRef, useState,
} from '../lib.js';
import { friendly, rows, sb } from '../api.js';
import { DEFAULT_PREFS } from '../constants.js';
import { markUnsaved } from '../router.js';
import { ChecklistWithAdd, TextField, announce } from '../ui.js';

// ---------------------------------------------------------------- preferences

/** Her saved preferences, with the defaults filled in for anything that was never saved. */
export function mergePrefs(value) {
  const saved = value && typeof value === 'object' ? value : {};
  return { ...DEFAULT_PREFS, ...saved, writing: { ...DEFAULT_PREFS.writing, ...(saved.writing || {}) } };
}

export async function loadPrefs() {
  const found = await rows(sb.from('settings').select('value').eq('key', 'preferences'));
  return mergePrefs(found.length ? found[0].value : null);
}

// ---------------------------------------------------------------- text helpers

/** Trim and collapse runs of spaces and line breaks into one space. */
export const tidy = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Tidy every item and drop the blank ones. */
export const tidyList = (list) => (list || []).map(tidy).filter(Boolean);

/** "70000" -> "70,000" for showing a number in a text box. */
export function withCommas(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : String(value ?? '');
}

/**
 * What she typed in a number box, ready for the database: "70,000" or "$70000" -> 70000. Anything that isn't a
 * number is passed on as typed, so the database answers with its own plain-language message.
 */
export function wholeNumber(text) {
  const clean = String(text ?? '').replace(/[\s,$£]/g, '');
  if (clean === '') return null;
  return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : clean;
}

export function randomHex(length = 4) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/** "City Health Dept." -> "city-health-dept" (30 characters at most). */
export function slugify(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
    .replace(/-+$/, '');
}

/** Move focus once the page has updated (for example to a field that was just added). */
export function focusLater(find) {
  setTimeout(() => {
    const el = typeof find === 'function' ? find() : document.getElementById(find);
    if (el && typeof el.focus === 'function') el.focus();
  }, 0);
}

// ---------------------------------------------------------------- state helpers

/**
 * Calls reset() whenever the page data is reloaded (not on the first load) and returns how many times that
 * happened. Use the number as a `key` to start lists fresh, for example so unticked items disappear after saving.
 */
export function useReset(data, reset) {
  const [round, setRound] = useState(0);
  const seen = useRef(data);
  useEffect(() => {
    if (seen.current === data) return;
    seen.current = data;
    reset();
    setRound((r) => r + 1);
  }, [data]);
  return round;
}

/**
 * Busy / problem / done state for a Save button. run(fn) ignores clicks while saving; whatever fn returns is
 * shown as the "saved" note, and a problem is shown in plain language.
 */
export function useSaver() {
  const [state, setState] = useState({ busy: false, error: null, done: null });
  const busy = useRef(false);
  const alive = useRef(true);
  const racing = useRef(false); // from the moment a save starts until the page has reloaded what was saved
  const typed = useRef(false); // she changed something in that time
  useEffect(() => () => { alive.current = false; }, []);
  const run = async (fn) => {
    if (busy.current) return;
    busy.current = true;
    racing.current = true;
    typed.current = false;
    setState({ busy: true, error: null, done: null });
    try {
      const done = await fn();
      setTimeout(() => { racing.current = false; }, 8000); // in case nothing reloads
      if (alive.current) setState({ busy: false, error: null, done: done || null });
    } catch (err) {
      racing.current = false;
      if (alive.current) setState({ busy: false, error: friendly(err), done: null });
    } finally {
      busy.current = false;
    }
  };
  const clearDone = () => { if (state.done) setState((s) => ({ ...s, done: null })); };
  /** Call on every edit: remembers a change made while a save is still going through. */
  const edited = () => { if (racing.current) typed.current = true; };
  /** Call when saved data reloads: true if she changed something meanwhile, so the form must keep her newer edits. */
  const keepEdits = () => {
    const keep = typed.current;
    typed.current = false;
    racing.current = false;
    return keep;
  };
  return {
    ...state, run, clearDone, edited, keepEdits,
  };
}

// ---------------------------------------------------------------- fields

/** A labelled drop-down. options: [{ value, label }] (values are compared as text). */
export function SelectField({
  label, hint, value, onChange, options, ...rest
}) {
  const id = useId();
  return html`
    <div class="field">
      <label for=${id}>${label}${hint && html`<span class="hint" id=${`${id}-hint`}>${hint}</span>`}</label>
      <select id=${id} value=${String(value ?? '')} aria-describedby=${hint ? `${id}-hint` : undefined}
        onChange=${(e) => onChange(e.target.value)} ...${rest}>
        ${options.map((o) => html`<option value=${String(o.value)}>${o.label}</option>`)}
      </select>
    </div>`;
}

/**
 * The Save area: the button, a short note once saved, and any problem (announced) right below it.
 * Inside a <form> the button submits it; pass onSave to use it without a form.
 */
/** Tell the dashboard whether this form has changes that aren't saved, so leaving the page asks first. */
export function useUnsavedGuard(dirty) {
  const form = useRef({});
  useEffect(() => { markUnsaved(form.current, dirty); }, [dirty]);
  useEffect(() => () => markUnsaved(form.current, false), []);
}

/** The Save area. With `dirty`, it says there are changes that aren't saved and stays in view at the bottom. */
export function SaveBar({
  label, busyLabel = 'Saving…', saver, onSave, tour, note, dirty = false,
}) {
  const bar = useRef(null);
  // While the bar sticks to the bottom of the screen, a field she tabs to must scroll above it, not behind it.
  useEffect(() => {
    const root = document.documentElement;
    if (!dirty || !bar.current) { root.style.removeProperty('--save-bar-height'); return undefined; }
    const measure = () => { if (bar.current) root.style.setProperty('--save-bar-height', `${bar.current.offsetHeight}px`); };
    measure();
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (watcher) watcher.observe(bar.current);
    window.addEventListener('resize', measure);
    return () => {
      if (watcher) watcher.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--save-bar-height');
    };
  }, [dirty]);
  return html`
    <div class=${dirty ? 'save-bar dirty' : 'save-bar'} data-tour=${tour} ref=${bar}>
      ${note && html`<p class="hint">${note}</p>`}
      ${dirty && html`<p class="unsaved-note">You have changes that aren't saved yet.</p>`}
      <div class="actions">
        <button type=${onSave ? 'button' : 'submit'} class="btn" onClick=${onSave}
          aria-disabled=${saver.busy ? 'true' : undefined}>${saver.busy ? busyLabel : label}</button>
        ${saver.done && html`<span class="saved-note">✓ ${saver.done}</span>`}
      </div>
      ${saver.error && html`<p class="inline-error" role="alert">${saver.error}</p>`}
    </div>`;
}

/** ChecklistWithAdd for lists that are all hers (no built-in choices), such as blocked employers. */
export function OwnList(props) {
  return html`<div class="own-list"><${ChecklistWithAdd} ...${props} options=${[]} selected=${[]}
    onSelected=${() => {}} /></div>`;
}

/**
 * An editable list of short texts (facts, skills). Each item is its own box with a Remove button; "Add" puts a new
 * empty box at the end and moves focus into it. Empty boxes are left out when saving.
 */
export function ListEditor({
  legend, hint, items, onChange, itemLabel, addLabel, maxItems, maxLength, multiline = false, rows: lines = 3,
}) {
  const id = useId();
  const [error, setError] = useState('');
  const box = useRef(null);
  const inputs = () => (box.current ? [...box.current.querySelectorAll('.list-item input, .list-item textarea')] : []);
  const set = (i, value) => onChange(items.map((item, j) => (j === i ? value : item)));
  const remove = (i) => {
    const what = itemLabel(i).toLowerCase();
    onChange(items.filter((_, j) => j !== i));
    setError('');
    announce(`Removed ${what}.`);
    focusLater(() => box.current && box.current.querySelector('.list-add'));
  };
  const add = () => {
    if (items.length >= maxItems) { setError(`You can have up to ${maxItems}.`); return; }
    setError('');
    onChange([...items, '']);
    focusLater(() => inputs().pop());
  };
  return html`
    <fieldset class="list-editor" ref=${box} aria-describedby=${hint ? `${id}-hint` : undefined}>
      <legend>${legend}</legend>
      ${hint && html`<p class="hint" id=${`${id}-hint`}>${hint}</p>`}
      ${items.length > 0
        ? html`<ol class=${multiline ? 'list-items' : 'list-items compact'}>
            ${items.map((item, i) => html`
              <li class="list-item">
                <${TextField} label=${itemLabel(i)} value=${item} onInput=${(v) => set(i, v)} multiline=${multiline}
                  rows=${lines} maxlength=${maxLength} />
                <button type="button" class="btn btn-secondary" onClick=${() => remove(i)}>
                  Remove<span class="visually-hidden"> ${itemLabel(i).toLowerCase()}</span>
                </button>
              </li>`)}
          </ol>`
        : html`<p class="muted small">Nothing here yet.</p>`}
      <div class="actions">
        <button type="button" class="btn btn-secondary list-add" onClick=${add}>${addLabel}</button>
      </div>
      ${error && html`<p class="inline-error" role="alert">${error}</p>`}
    </fieldset>`;
}
