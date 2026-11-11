// One tailored document: read it, see what changed, then approve it, ask for a change, or edit a letter yourself.
import { html, useState } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { MESSAGES, docFileName } from '../format.js';
import { href } from '../router.js';
import { go } from '../store.js';
import {
  ActionButton, Badge, FileLink, Loaded, Loading, Notice, Page, TextField, useFileUrl, useLoad,
} from '../ui.js';
import {
  ACTIVE, DOC_KIND, docWord, loadContact, useAfterChange, useSubmit,
} from '../parts/apps.js';

async function load(id) {
  const [found, contact] = await Promise.all([
    rows(sb.from('documents')
      .select(`id,application_id,kind,version,status,text,changes,pdf_path,docx_path,checks,checks_passed,
        applications(id,status,jobs(id,title,organization,country))`)
      .eq('id', id)),
    loadContact(),
  ]);
  if (!found.length || !found[0].applications) return null;
  const doc = found[0];
  return {
    doc, app: doc.applications, job: doc.applications.jobs || {}, contact,
  };
}

/** One change from her master résumé, as a plain sentence. */
function Change({ ch }) {
  if (ch.type === 'summary') return html`Added a short summary at the top: “${ch.after}”`;
  if (ch.type === 'reworded') return html`Reworded “${ch.before}” as “${ch.after}”`;
  if (ch.type === 'removed') return html`Left out “${ch.before}” so it fits on the page.`;
  if (ch.type === 'reordered') return html`${/[.!?]$/.test(ch.after || '') ? ch.after : `${ch.after}.`}`;
  return html`${ch.note || ch.after || ch.before || ''}`;
}

/** The files first: opening the PDF in its own tab works everywhere, unlike a preview inside the page. */
function Files({
  doc, word, uk, fullName,
}) {
  if (!doc.pdf_path) return html`<p data-tour="doc-preview">The PDF isn't ready yet. You can read the text below.</p>`;
  return html`
    <div class="file-links doc-files" data-tour="doc-preview">
      <${FileLink} path=${doc.pdf_path}>Open the PDF<span class="visually-hidden"> of your ${word}</span><//>
      ${doc.docx_path && html`
        <${FileLink} path=${doc.docx_path} download=${docFileName(fullName, doc.kind, 'docx', uk)}>
          Download the Word version<span class="visually-hidden"> of your ${word}</span>
        <//>`}
    </div>`;
}

function PreviewFrame({ path, word }) {
  const { url, error } = useFileUrl(path);
  if (error) return html`<p class="inline-error">${error}</p>`;
  if (!url) return html`<${Loading} label="Loading the preview…" />`;
  return html`
    <iframe class="doc-preview" title=${`Preview of your ${word}`} src=${url}></iframe>
    <p class="small muted">If the preview stays blank, use “Open the PDF” above. Some phones can't show a PDF inside a
      page.</p>`;
}

/** The PDF inside the page, only when she asks for it (it loads then), after the text she reads. */
function Preview({ doc, word }) {
  const [open, setOpen] = useState(false);
  if (!doc.pdf_path) return null;
  return html`
    <details class="more doc-preview-box" onToggle=${(event) => setOpen(event.currentTarget.open)}>
      <summary>See how the PDF looks<span class="visually-hidden"> (your ${word})</span></summary>
      ${open && html`<${PreviewFrame} path=${doc.pdf_path} word=${word} />`}
    </details>`;
}

function ChangeForm({ doc, after }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useSubmit();
  const submit = (event) => run(event, async () => {
    await rpc('doc_request_change', { p_doc_id: doc.id, p_feedback: text });
    after(MESSAGES.change_requested, '#doc-status');
  });
  return html`
    <form class="doc-change" onSubmit=${submit} novalidate>
      <h3>Ask for a change</h3>
      <${TextField} label="What would you like changed?" multiline rows=${4} value=${text} onInput=${setText}
        hint="Use your own words, for example: “Mention my language skills earlier” or “Less about my first job”."
        aria-invalid=${error ? 'true' : undefined} />
      <div class="actions">
        <button class="btn" type="submit" aria-disabled=${busy ? 'true' : undefined}>
          ${busy ? 'Sending…' : 'Rewrite it'}</button>
      </div>
      ${error && html`<p class="inline-error" role="alert">${error}</p>`}
    </form>`;
}

function EditForm({ doc, after }) {
  const [text, setText] = useState(doc.text || '');
  const { busy, error, run } = useSubmit();
  const submit = (event) => run(event, async () => {
    await rpc('doc_save_edit', { p_doc_id: doc.id, p_text: text });
    after(MESSAGES.edited, '#doc-status');
  });
  return html`
    <div class="doc-edit">
      <h3>Edit it yourself</h3>
      <details class="more">
        <summary>Edit the letter text</summary>
        <form onSubmit=${submit} novalidate>
          <${TextField} label="Letter text" multiline rows=${16} value=${text} onInput=${setText}
            hint="Your edit is used as-is, and future letters learn from it." aria-invalid=${error ? 'true' : undefined} />
          <div class="actions">
            <button class="btn" type="submit" aria-disabled=${busy ? 'true' : undefined}>
              ${busy ? 'Saving…' : 'Save my version'}</button>
          </div>
          ${error && html`<p class="inline-error" role="alert">${error}</p>`}
        </form>
      </details>
    </div>`;
}

function Detail({ d, after }) {
  const {
    doc, app, job, contact,
  } = d;
  const word = docWord(doc.kind);
  const uk = job.country === 'GB';
  const checks = doc.checks || {};
  const problems = Array.isArray(checks.problems) ? checks.problems : [];
  const unsupported = (checks.unsupported || (checks.review && checks.review.unsupported_claims) || []).length > 0;
  const changes = Array.isArray(doc.changes) ? doc.changes : [];
  const old = doc.status === 'superseded';
  const rewriting = doc.status === 'changes_requested';
  const inProgress = ACTIVE.includes(app.status) && app.status !== 'submitting';
  const sent = app.status === 'submitted' || app.status === 'submitting';
  const readOnly = `${sent ? 'This application has been sent' : "This application isn't in progress"}, so this ${
    word} can't be changed now.`;
  const appLink = href(`/applications/${app.id}`);
  const factsLink = html`<a href=${href('/profile')}>your résumé facts</a>`;
  const approve = async () => {
    await rpc('doc_approve', { p_doc_id: doc.id });
    go(`/applications/${app.id}`, MESSAGES.approved);
  };
  return html`
    <p class="muted">Version ${doc.version}. Written only from your résumé facts. Nothing is made up.</p>
    ${old && html`
      <${Notice} kind="info">
        <p>There's a newer version of this ${word}. <a href=${appLink}>See the newest version on the application page</a>.</p>
      <//>`}
    ${rewriting && html`
      <div id="doc-status" class="notice notice-info"><p>We're rewriting it now. Check back in a few minutes.</p></div>`}
    ${!doc.checks_passed && problems.length > 0 && html`
      <div class="problems">
        <p><strong>Things to double-check:</strong></p>
        <ul>${problems.map((p, i) => html`<li key=${i}>${p}</li>`)}</ul>
        ${unsupported && html`
          <p class="small">If something flagged is true, add it to ${factsLink} so we can use it next time.</p>`}
      </div>`}

    <h2>Read it</h2>
    <${Files} doc=${doc} word=${word} uk=${uk} fullName=${contact.name} />
    <div class="doc-text" role="region" aria-label=${`${DOC_KIND[doc.kind] || 'Document'} text`}>${doc.text}</div>
    <${Preview} doc=${doc} word=${word} />

    ${changes.length > 0 && html`
      <h2>${doc.kind === 'resume' ? 'What changed from your master résumé' : 'What changed'}</h2>
      <ul class="changes">${changes.map((ch, i) => html`<li key=${i}><${Change} ch=${ch} /></li>`)}</ul>`}

    ${!old && !rewriting && !inProgress && html`<p class="muted">${readOnly}</p>`}
    ${!old && !rewriting && inProgress && html`
      <section class="doc-actions" data-tour="doc-actions">
        <h2>Happy with it?</h2>
        ${doc.status === 'approved'
          ? html`<p><${Badge} kind="ok">Approved<//> This version is approved. You can still ask for a change.</p>`
          : html`<div class="actions">
              <${ActionButton} busyLabel="Approving…" onAction=${approve}>Looks good, approve<//>
            </div>`}
        <${ChangeForm} key=${`c${doc.id}`} doc=${doc} after=${after} />
        ${doc.kind === 'cover_letter' && html`<${EditForm} key=${`e${doc.id}`} doc=${doc} after=${after} />`}
      </section>`}`;
}

function DocumentPage({ id }) {
  const result = useLoad(() => load(id), [id]);
  const after = useAfterChange(result, '#doc-status');
  const d = result.data;
  let title = 'Document';
  if (d === null) title = 'Document not found';
  else if (d) title = `${DOC_KIND[d.doc.kind] || 'Document'} for ${d.job.organization}`;
  const back = d ? { href: href(`/applications/${d.app.id}`), label: `Back to ${d.job.title}` }
    : { href: href('/applications'), label: 'My applications' };
  return html`
    <${Page} title=${title} back=${back}>
      <${Loaded} result=${result}>${(data) => (data
        ? html`<${Detail} d=${data} after=${after} />`
        : html`<p>That document isn't here anymore. <a href=${href('/applications')}>See all your applications</a>.</p>`)}<//>
    <//>`;
}

// A fresh page for each document, so one document never shows under another's address.
export default function Document({ params }) {
  return html`<${DocumentPage} key=${params.id} id=${params.id} />`;
}
