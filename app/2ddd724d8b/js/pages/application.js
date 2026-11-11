// One application: where it stands, what it needs from her, its documents, and what she can do next.
import { html, useState } from '../lib.js';
import {
  UserError, rows, rpc, sb,
} from '../api.js';
import {
  MESSAGES, OUTCOME_LABELS, deadlineNote, niceDate, niceDateTime, payText, plural, relative, sentMessage, statusText,
} from '../format.js';
import { href } from '../router.js';
import { useApp } from '../store.js';
import {
  ActionButton, ExternalLink, FileLink, Loaded, Page, useLoad,
} from '../ui.js';
import {
  ACTIVE, AnswerList, DocCard, FinishPackage, QuestionForm, SKIPPED, SelectField, currentDocs, loadContact,
  nextQuestion, useAfterChange,
} from '../parts/apps.js';

const NEEDS_HER = ['needs_you', 'ready_to_send', 'manual', 'failed'];
const OUTCOMES = [
  { value: '', label: 'Choose one' },
  ...Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
];

async function load(id) {
  const [found, contact] = await Promise.all([
    rows(sb.from('applications')
      .select(`id,status,auto,needs,submit_after,submitted_at,submit_method,dry_run_ok_at,confirmation_path,
        manual_reason,error,outcome,
        jobs(id,title,organization,url,apply_url,ats,country,location_label,location_raw,deadline,accepts_cover_letter,
          pay_min,pay_max,pay_currency,pay_period,pay_status),
        documents(id,kind,version,status,text,pdf_path,docx_path,checks,checks_passed),
        app_questions(id,label,field,answer,answer_source,status,style_problems,sensitive)`)
      .eq('id', id)),
    loadContact(),
  ]);
  if (!found.length) return null;
  const a = found[0];
  const questions = (a.app_questions || []).slice().sort((x, y) => x.id - y.id);
  return {
    app: a,
    job: a.jobs || {},
    docs: currentDocs(a.documents),
    open: questions.filter((q) => q.status === 'needs_you'),
    answered: questions.filter((q) => q.status === 'answered' || q.status === 'approved'),
    contact,
  };
}

function StatusBox({
  a, sending, admin, onCheck,
}) {
  const [label, words] = statusText(a.status, sending);
  const tone = NEEDS_HER.includes(a.status) ? 'warn' : a.status === 'submitted' ? 'ok' : 'info';
  return html`
    <div id="app-status" class=${`notice notice-${tone} app-status`} data-tour="app-status">
      <p><strong>${label}.</strong> ${words}</p>
      ${a.auto && html`<p>We picked this one for you because it's a strong match on a site we can fill in.</p>`}
      ${a.status === 'scheduled' && !(sending && sending.blocked) && a.submit_after && html`
        <p>${sending && sending.practice ? 'Practice run' : 'Sends'} <strong>${niceDateTime(a.submit_after)}</strong>
          (${relative(a.submit_after)}).</p>`}
      ${a.status === 'submitted' && a.submitted_at && html`
        <p>Sent ${niceDate(a.submitted_at)}${a.submit_method === 'manual' ? ' (by you)' : ''}.</p>`}
      ${a.status === 'manual' && a.manual_reason && html`<p>${a.manual_reason}</p>`}
      ${a.error && (a.status === 'failed' || admin) && html`<p class="small">What went wrong: ${a.error}</p>`}
      ${a.status === 'preparing' && html`
        <p>Check back in a few minutes.</p>
        <p><button type="button" class="btn btn-secondary" onClick=${onCheck}>Check again</button></p>`}
    </div>`;
}

function Actions({ a, act, sending }) {
  const s = a.status;
  const blocked = Boolean(sending && sending.blocked);
  const practice = Boolean(sending && sending.practice);
  let sendLabel = 'Send application';
  let sendConfirm = 'Send this application now?';
  if (blocked) {
    sendLabel = 'Approve for sending';
    sendConfirm = "Approve this application? Sending is paused, so it waits until it's turned back on.";
  } else if (practice) {
    sendLabel = 'Do a practice run';
    sendConfirm = "Practice mode is on: we'll fill in the form to check it, but nothing will be sent. Go ahead?";
  }
  const withdrawWords = s === 'submitted'
    ? "Withdraw this application? We'll mark it as withdrawn here, but we can't tell the employer for you."
    : "Withdraw this application? We'll stop working on it.";
  return html`
    <div class="actions app-actions" data-tour="app-actions">
      ${s === 'ready_to_send' && html`
        <${ActionButton} confirm=${sendConfirm} busyLabel="Saving…"
          onAction=${act('app_send', sentMessage(sending))}>${sendLabel}<//>`}
      ${s === 'scheduled' && !blocked && html`
        <${ActionButton} confirm=${practice ? sendConfirm : 'Send this application now?'} busyLabel="Saving…"
          onAction=${act('app_send_now', sentMessage(sending))}>${practice ? 'Do the practice run now' : 'Send now'}<//>`}
      ${['failed', 'vetoed', 'skipped', 'withdrawn'].includes(s) && html`
        <${ActionButton} busyLabel="Starting…" onAction=${act('app_restart', MESSAGES.restarted)}>
          Try again<span class="visually-hidden"> (start this application again)</span><//>`}
      ${['ready_to_send', 'needs_you', 'failed'].includes(s) && html`
        <${ActionButton} className="btn btn-secondary" busyLabel="Saving…"
          confirm="Mark this application as sent? Only do this if you sent it yourself on the employer's site."
          onAction=${act('app_mark_sent', MESSAGES.marked_sent)}>I sent it myself<//>`}
      ${['scheduled', 'preparing', 'needs_you', 'ready_to_send'].includes(s) && html`
        <${ActionButton} className="btn btn-danger" busyLabel="Stopping…"
          confirm="Stop this application? Nothing will be sent."
          onAction=${act('app_veto', MESSAGES.vetoed)}>Stop, don't apply<//>`}
      ${s !== 'withdrawn' && html`
        <${ActionButton} className="btn btn-secondary" confirm=${withdrawWords} busyLabel="Withdrawing…"
          onAction=${act('app_withdraw', MESSAGES.withdrawn)}>Withdraw<//>`}
    </div>`;
}

function OutcomeForm({ a, after }) {
  const [value, setValue] = useState(a.outcome || '');
  const save = async () => {
    if (!value) throw new UserError('Please choose what happened first.');
    await rpc('app_set_outcome', { p_app_id: a.id, p_outcome: value });
    after(MESSAGES.outcome_saved);
  };
  return html`
    <section class="outcome">
      <h2>What happened?</h2>
      <p>When you hear back, record it here. It helps us learn what works.</p>
      <div class="outcome-row">
        <${SelectField} label="Outcome" value=${value} onChange=${setValue} options=${OUTCOMES} />
        <${ActionButton} busyLabel="Saving…" onAction=${save}>Save outcome<//>
      </div>
    </section>`;
}

function Detail({
  d, store, after, reload,
}) {
  const {
    app: a, job, docs, open, answered, contact,
  } = d;
  const s = a.status;
  const uk = job.country === 'GB';
  const where = job.location_label || job.location_raw;
  const soon = deadlineNote(job.deadline);
  const act = (fn, message) => async () => {
    await rpc(fn, { p_app_id: a.id });
    after(message);
  };
  const onAnswered = ({ action, index }) => (
    after(action === 'skipped' ? SKIPPED : MESSAGES.answered, nextQuestion(index)));
  return html`
    <ul class="meta">
      <li><strong>${job.organization}</strong></li>
      ${where && html`<li>${where}</li>`}
      <li>${payText(job)}</li>
      ${job.deadline && html`<li>Deadline: <strong>${niceDate(job.deadline)}</strong>${soon && ` (${soon})`}</li>`}
    </ul>
    <p class="job-links">
      <a href=${href(`/jobs/${job.id}`)}>See the job details</a>
      <${ExternalLink} href=${job.url}>Original posting<//>
    </p>

    <${StatusBox} a=${a} sending=${store.sending} admin=${store.me && store.me.role === 'admin'} onCheck=${reload} />
    <${Actions} a=${a} act=${act} sending=${store.sending} />

    ${open.length > 0 && ACTIVE.includes(s) && html`
      <section class="app-questions">
        <h2>Questions for you (${open.length})</h2>
        <p>The application form asks these. Your answers are saved so you won't be asked twice.</p>
        ${open.map((q) => html`<${QuestionForm} key=${q.id} q=${q} onDone=${onAnswered} />`)}
      </section>`}

    ${s === 'manual' && html`
      <${FinishPackage} job=${job} docs=${docs} answered=${answered} contact=${contact} uk=${uk}
        onSent=${act('app_mark_sent', MESSAGES.marked_sent)} />`}

    <section class="app-documents" data-tour="app-documents">
      <h2>Your documents</h2>
      ${['resume', 'cover_letter'].filter((k) => docs[k]).map((k, i) => html`
        <${DocCard} key=${k} doc=${docs[k]} fullName=${contact.name} uk=${uk}
          tour=${i === 0 ? 'app-doc-first' : undefined} />`)}
      ${!docs.resume && (s === 'preparing'
        ? html`<p>Your tailored résumé is being written.</p>`
        : !docs.cover_letter && html`<p>There are no documents for this application yet.</p>`)}
      ${job.accepts_cover_letter === false && html`
        <p class="small muted">This application doesn't take a cover letter, so we didn't write one.</p>`}
    </section>

    ${s !== 'manual' && answered.length > 0 && html`
      <section class="app-answers">
        <h2>Answers on the form</h2>
        <details class="more">
          <summary>Show ${plural(answered.length, 'answer')}</summary>
          <${AnswerList} questions=${answered} />
        </details>
      </section>`}

    ${s === 'submitted' && html`<${OutcomeForm} key=${a.id} a=${a} after=${after} />`}

    ${a.confirmation_path && html`
      <p><${FileLink} path=${a.confirmation_path}>
        ${a.dry_run_ok_at && s !== 'submitted' ? 'See the practice-run screenshot' : 'See the confirmation screenshot'}
      <//></p>`}`;
}

function ApplicationPage({ id }) {
  const store = useApp();
  const result = useLoad(() => load(id), [id]);
  const after = useAfterChange(result, '#app-status');
  const d = result.data;
  const title = d === null ? 'Application not found' : d ? d.job.title : 'Application';
  const list = href('/applications');
  return html`
    <${Page} title=${title} back=${{ href: list, label: 'My applications' }}>
      <${Loaded} result=${result}>${(data) => (data
        ? html`<${Detail} d=${data} store=${store} after=${after} reload=${result.reload} />`
        : html`<p>That application isn't here anymore. <a href=${list}>See all your applications</a>.</p>`)}<//>
    <//>`;
}

// A fresh page for each application, so one application's details never show under another's address.
export default function Application({ params }) {
  return html`<${ApplicationPage} key=${params.id} id=${params.id} />`;
}
