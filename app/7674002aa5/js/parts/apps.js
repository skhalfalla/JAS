// Shared pieces for the application pages: answering a form question, document summaries and downloads, the
// "finish it yourself" package, and keeping the message and keyboard focus sensible after a change.
import {
  Fragment, html, useEffect, useId, useMemo, useRef, useState,
} from '../lib.js';
import {
  friendly, rows, rpc, sb,
} from '../api.js';
import { docFileName } from '../format.js';
import { href } from '../router.js';
import { flash, refreshCounts } from '../store.js';
import {
  ActionButton, Badge, Checkbox, CopyButton, ExternalLink, FileLink, RadioGroup, TextField,
} from '../ui.js';

/** Applications still being worked on. Their open questions show under "Questions to answer". */
export const ACTIVE = ['preparing', 'needs_you', 'ready_to_send', 'scheduled', 'submitting', 'manual'];

export const SKIPPED = "Skipped. We'll leave that one blank.";

export const DOC_KIND = { resume: 'Résumé', cover_letter: 'Cover letter' };
export const docWord = (kind) => (kind === 'cover_letter' ? 'cover letter' : 'résumé');
const DOC_STATUS = {
  approved: ['Approved', 'ok'],
  needs_review: ['Please check', 'needs'],
  changes_requested: ['Being rewritten', 'info'],
  draft: ['Ready', 'ok'],
  superseded: ['Replaced by a newer version', 'muted'],
};

/** Her name and email from the newest résumé facts (used for download file names). */
export async function loadContact() {
  const found = await rows(sb.from('profile_versions')
    .select('name:data->contact->>name,email:data->contact->>email')
    .order('id', { ascending: false })
    .limit(1));
  return found[0] || {};
}

/** The newest version of each document (résumé, cover letter) that hasn't been replaced. */
export function currentDocs(documents) {
  const out = {};
  (documents || []).forEach((d) => {
    if (d.status !== 'superseded' && (!out[d.kind] || d.version > out[d.kind].version)) out[d.kind] = d;
  });
  return out;
}

export function answerText(answer) {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer);
}

// ---------------------------------------------------------------- messages and focus after a change

/** Show a message in the status area (a repeat is read out again too). */
export const tell = (message) => flash(message);

function focusOn(el) {
  if (!el) return false;
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus();
  return true;
}

/**
 * After a change on this page: reload its data, refresh the header counts, and show a message. If the button she
 * pressed is gone once the page updates, focus goes to `target` (a selector, or a function returning an element),
 * else to `fallback`, so keyboard and screen reader users aren't sent back to the top of the page.
 */
export function useAfterChange(result, fallback = '#page-title') {
  const pending = useRef(null);
  useEffect(() => {
    if (!pending.current || result.loading) return;
    const target = pending.current;
    pending.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const el = typeof target === 'function' ? target() : document.querySelector(target);
    if (!focusOn(el)) focusOn(document.querySelector(fallback) || document.getElementById('page-title'));
  }, [result.data, result.loading]);
  return (message, target) => {
    pending.current = target || fallback;
    result.reload();
    refreshCounts();
    if (message) tell(message);
  };
}

/** The question now in the same place as the one just answered (or the last one left). */
export const nextQuestion = (index) => () => {
  const all = document.querySelectorAll('.question');
  return all.length ? all[Math.min(Math.max(index, 0), all.length - 1)] : null;
};

/** Busy and error state for a form that calls the database. run(event, fn, what) ignores presses while busy. */
export function useSubmit() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const busyRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = async (event, fn, what = 'save') => {
    if (event && event.preventDefault) event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = what;
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (alive.current) setError(friendly(err));
    } finally {
      busyRef.current = null;
      if (alive.current) setBusy(null);
    }
  };
  return { busy, error, run };
}

// ---------------------------------------------------------------- form fields

/** A labelled drop-down list. options: [{ value, label }] */
export function SelectField({
  label, hint, value, onChange, options, ...rest
}) {
  const id = useId();
  return html`
    <div class="field">
      <label for=${id}>${label}${hint && html`<span class="hint" id=${`${id}-hint`}>${hint}</span>`}</label>
      <select id=${id} aria-describedby=${hint ? `${id}-hint` : undefined} onChange=${(e) => onChange(e.target.value)}
        ...${rest}>
        ${options.map((o) => html`
          <option key=${o.value} value=${o.value} selected=${o.value === value}>${o.label}</option>`)}
      </select>
    </div>`;
}

// ---------------------------------------------------------------- one question from an application form

const LINE_TYPES = ['text', 'email', 'tel', 'url', 'number', 'date', 'select', 'radio', 'multiselect'];
const MANY_CHOICES = 15; // longer lists of single choices use a drop-down instead of radio buttons

/** How a question is answered: one choice, several choices, yes or no, a short line, or a longer text. */
function kindOf(field, answer) {
  const f = field || {};
  const type = f.type || 'text';
  const options = Array.isArray(f.options) ? f.options.filter((o) => typeof o === 'string') : [];
  if ((type === 'select' || type === 'radio') && options.length) return ['one', options];
  if ((type === 'multiselect' || type === 'checkbox') && options.length) return ['many', options];
  if (type === 'checkbox') return ['yesno', []];
  const long = !LINE_TYPES.includes(type) || (typeof answer === 'string' && answer.length > 80);
  return [long ? 'long' : 'line', []];
}

function startValue(kind, options, answer) {
  if (kind === 'one') return typeof answer === 'string' && options.includes(answer) ? answer : null;
  if (kind === 'many') return Array.isArray(answer) ? options.filter((o) => answer.includes(o)) : [];
  if (kind === 'yesno') return typeof answer === 'boolean' ? answer : null;
  return typeof answer === 'string' ? answer : '';
}

/**
 * Answer one question from an application form. Calls onDone({ action: 'answered' | 'skipped', status, index })
 * after the database accepts it (status is where the application stands now; index is this question's place
 * on the page). Problems from the database show right here.
 */
const DECLINE = /decline|don['’]t wish|do not wish|prefer not|choose not/i;

/** Who sees a self-identification answer, and how to decline it on this form. */
function privacyNote(options, required) {
  const decline = options.find((o) => DECLINE.test(o));
  let how = '';
  if (decline) how = `You can choose “${decline}.” `;
  else if (!required) how = 'You can skip this question. ';
  return `${how}Only you can see this answer in the dashboard. The employer receives your choice when you apply.`;
}

export function QuestionForm({ q, onDone, tour }) {
  const f = q.field || {};
  const [kind, options] = useMemo(() => kindOf(q.field, q.answer), [q.id]);
  const [value, setValue] = useState(() => startValue(kind, options, q.answer));
  const [remember, setRemember] = useState(true);
  const { busy, error, run } = useSubmit();
  const box = useRef(null);
  const hintId = useId();
  const typed = kind === 'line' || kind === 'long';
  const required = String(f.required) === 'true'; // the same test the database uses
  const max = Number(f.max_length) > 0 ? Math.min(Math.floor(Number(f.max_length)), 5000) : null;

  const send = (event, what) => run(event, async () => {
    const index = [...document.querySelectorAll('.question')].indexOf(box.current);
    const result = what === 'skip'
      ? await rpc('question_skip', { p_question_id: q.id })
      : await rpc('question_answer', { p_question_id: q.id, p_answer: value, p_save_to_bank: remember });
    onDone({ action: what === 'skip' ? 'skipped' : 'answered', status: result && result.application_status, index });
  }, what);

  const notes = [
    q.sensitive && html`<span class="private-note">${privacyNote(options, required)}</span>`,
    typed && q.answer_source === 'draft'
      && 'We drafted this from your résumé facts. Edit it so it sounds like you, then save.',
    f.description,
    typed && max && `Up to ${max} characters.`,
  ].filter(Boolean);
  const hint = notes.length ? html`${notes.map((n, i) => html`${i ? ' ' : ''}${n}`)}` : undefined;
  // On self-identification questions a choice is required, never disclosure: declining is a choice.
  const need = q.sensitive ? 'a choice is required' : 'required';
  const label = required ? html`${q.label} <span class="small">(${need})</span>` : q.label;
  const invalid = error ? 'true' : undefined;

  let field;
  if (kind === 'one' && options.length > MANY_CHOICES) {
    const choices = [{ value: '', label: 'Choose one' }, ...options.map((o) => ({ value: o, label: o }))];
    field = html`<${SelectField} label=${label} hint=${hint} value=${value || ''} onChange=${(v) => setValue(v || null)}
      aria-invalid=${invalid} options=${choices} />`;
  } else if (kind === 'one' || kind === 'yesno') {
    const choices = kind === 'one'
      ? options.map((o) => ({ value: o, label: o }))
      : [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
    field = html`<${RadioGroup} legend=${label} hint=${hint} options=${choices} value=${value} onChange=${setValue} />`;
  } else if (kind === 'many') {
    field = html`
      <fieldset aria-describedby=${hint ? hintId : undefined}>
        <legend>${label}</legend>
        ${hint && html`<p class="hint" id=${hintId}>${hint}</p>`}
        ${options.map((o) => html`<${Checkbox} key=${o} label=${o} checked=${value.includes(o)}
          onChange=${(on) => setValue((now) => options.filter((x) => (x === o ? on : now.includes(x))))} />`)}
      </fieldset>`;
  } else {
    field = html`<${TextField} label=${label} hint=${hint} value=${value} onInput=${setValue} multiline=${kind === 'long'}
      rows=${6} maxlength=${max || undefined} aria-invalid=${invalid} />`;
  }

  const problems = Array.isArray(q.style_problems) ? q.style_problems.filter(Boolean) : [];
  return html`
    <div class="card question" ref=${box} data-tour=${tour}>
      <form onSubmit=${(e) => send(e, 'save')} novalidate>
        <div data-tour=${tour ? `${tour}-field` : undefined}>${field}</div>
        ${problems.length > 0 && html`<p class="small muted">Style notes on the draft: ${problems.join('; ')}</p>`}
        ${(kind === 'one' || typed) && html`
          <${Checkbox} label="Save this answer for next time" checked=${remember} onChange=${setRemember}
            hint="We'll fill it in for you when another form asks the same thing." />`}
        <div class="actions">
          <button type="submit" class="btn" aria-disabled=${busy ? 'true' : undefined}>
            ${busy === 'save' ? 'Saving…' : html`Save answer<span class="visually-hidden"> to the question: ${q.label}</span>`}
          </button>
          ${!required && html`
            <button type="button" class="btn btn-secondary" aria-disabled=${busy ? 'true' : undefined}
              onClick=${(e) => send(e, 'skip')}>
              ${busy === 'skip' ? 'Skipping…' : html`Skip<span class="visually-hidden"> the question: ${q.label}</span>`}
            </button>`}
        </div>
        ${error && html`<p class="inline-error" role="alert">${error}</p>`}
      </form>
    </div>`;
}

// ---------------------------------------------------------------- documents

/** PDF and Word downloads, named like "<her name> - Resume.pdf" ("CV" for UK jobs). */
export function DocDownloads({ doc, fullName, uk }) {
  const word = docWord(doc.kind);
  return html`
    ${doc.pdf_path && html`
      <${FileLink} path=${doc.pdf_path} download=${docFileName(fullName, doc.kind, 'pdf', uk)}>
        Download PDF<span class="visually-hidden"> of your ${word}</span>
      <//>`}
    ${doc.docx_path && html`
      <${FileLink} path=${doc.docx_path} download=${docFileName(fullName, doc.kind, 'docx', uk)}>
        Download Word<span class="visually-hidden"> version of your ${word}</span>
      <//>`}`;
}

/** One document on the application page: where it stands, a link to read it, and downloads. */
export function DocCard({
  doc, fullName, uk, tour,
}) {
  const [label, tone] = DOC_STATUS[doc.status] || [doc.status, 'info'];
  const summary = doc.status === 'needs_review' && doc.checks && doc.checks.summary;
  return html`
    <article class="card doc-card" data-tour=${tour}>
      <h3>${DOC_KIND[doc.kind] || doc.kind} <span class="small muted">(version ${doc.version})</span></h3>
      <p><${Badge} kind=${tone}>${label}<//></p>
      ${summary && html`<p class="small">${summary}</p>`}
      <div class="actions">
        <a class="btn btn-secondary" href=${href(`/documents/${doc.id}`)}>
          Read it and see what changed<span class="visually-hidden"> (${docWord(doc.kind)})</span></a>
        <${DocDownloads} doc=${doc} fullName=${fullName} uk=${uk} />
      </div>
    </article>`;
}

// ---------------------------------------------------------------- answers and the "finish it yourself" package

/** The form's questions with her answers. With `copy`, each answer has its own Copy button. */
export function AnswerList({ questions, copy = false }) {
  return html`
    <dl class="answers">
      ${questions.map((q) => {
        const text = answerText(q.answer);
        return html`<${Fragment} key=${q.id}>
          <dt>${q.label}${q.sensitive && html` <span class="small muted">(only you can see this)</span>`}</dt>
          ${copy && text
            ? html`<dd class="copy-row"><span class="copy-value">${text}</span>
                <${CopyButton} text=${text} what=${`answer to ${q.label}`} /></dd>`
            : html`<dd>${text || html`<span class="muted">Left blank</span>`}</dd>`}
        <//>`;
      })}
    </dl>`;
}

const ACCOUNT_SITES = ['workday', 'taleo', 'icims', 'oracle', 'successfactors'];

/** Everything she needs to send an application herself, step by step, ending with "I've sent it". */
export function FinishPackage({
  job, docs, answered, contact, uk, onSent,
}) {
  const resume = docs.resume;
  const letter = docs.cover_letter;
  const useEmail = contact.email ? ` Use your email, ${contact.email}.` : '';
  return html`
    <section class="finish" data-tour="app-finish">
      <h2>Finish it yourself: step by step</h2>
      <ol class="steps">
        <li data-tour="app-finish-first">
          <strong>Open the application site.</strong>
          <p><${ExternalLink} className="btn btn-secondary" href=${job.apply_url || job.url}>Open the application<//></p>
          ${ACCOUNT_SITES.includes(job.ats) && html`
            <p class="small">This site may ask you to create an account.${useEmail}</p>`}
          ${job.ats === 'usajobs' && html`
            <p class="small">USAJOBS uses login.gov. You can upload the PDF résumé below or build one in USAJOBS.</p>`}
        </li>
        <li>
          <strong>Upload your résumé.</strong>
          ${resume && (resume.pdf_path || resume.docx_path)
            ? html`<div class="file-links"><${DocDownloads} doc=${resume} fullName=${contact.name} uk=${uk} /></div>`
            : html`<p>Your résumé isn't ready yet.</p>`}
        </li>
        ${letter && html`
          <li>
            <strong>Add your cover letter.</strong>
            <p class="small">If the form has a box like “Message to the Hiring Team,” “Cover letter,” or “Why are you
              interested?”, copy the text and paste it there:</p>
            <div class="copy-row">
              <div class="copy-value">${letter.text}</div>
              <${CopyButton} text=${letter.text} label="Copy letter text" />
            </div>
            <p class="small">If it asks you to upload a cover letter instead, use one of these files:</p>
            <div class="file-links"><${DocDownloads} doc=${letter} fullName=${contact.name} uk=${uk} /></div>
          </li>`}
        ${!letter && html`
          <li>
            <strong>Your cover letter.</strong>
            <p class="small">Your letter is being written. It shows up here in a few minutes; if it doesn't, tell
              Shihab.</p>
          </li>`}
        ${answered.length > 0 && html`
          <li>
            <strong>Answer the form's questions.</strong>
            <p class="small">Your answers, ready to copy:</p>
            <${AnswerList} questions=${answered} copy=${true} />
          </li>`}
        <li>
          <strong>When you've sent it, tell us here.</strong>
          <div class="actions">
            <${ActionButton} onAction=${onSent} busyLabel="Saving…"
              confirm="Mark this application as sent? Only do this once you've sent it on the employer's site.">
              I've sent it
            <//>
          </div>
        </li>
      </ol>
    </section>`;
}
