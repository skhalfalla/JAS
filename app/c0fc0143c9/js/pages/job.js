// One job in full: why it fits, what's worth knowing, her decision (with an optional note), and the posting itself.
import { html, useRef, useState } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { MESSAGES, payLocked, statusText } from '../format.js';
import { href } from '../router.js';
import { flash, go, useApp } from '../store.js';
import {
  ActionButton, ExternalLink, Loaded, Notice, Page, TextField, useLoad,
} from '../ui.js';
import {
  appOf, CARD_COLUMNS, FewerButton, JobBadges, JobMeta, notesFor,
} from '../parts/jobs.js';
import { employerListed } from '../parts/jobfilters.js';
import { loadPrefs } from '../parts/settings.js';

const COLUMNS = `${CARD_COLUMNS},description_text,pay_evidence,filter_reasons,route,applications(id,status)`;

async function load(id) {
  const [found, prefs] = await Promise.all([rows(sb.from('jobs').select(COLUMNS).eq('id', id).limit(1)), loadPrefs()]);
  return found[0] ? { ...found[0], fewer: employerListed(found[0].organization, prefs.less_employers) } : null;
}

function Decision({ job }) {
  const [note, setNote] = useState('');
  const deciding = useRef(false);
  const decide = (decision) => async () => {
    if (deciding.current) return;
    deciding.current = true;
    try {
      const result = await rpc('job_decide', { p_job_id: job.id, p_decision: decision, p_reason: note.trim() || null });
      if (decision === 'apply') {
        const appId = result && result.application_id;
        go(appId ? `/applications/${appId}` : '/applications', MESSAGES.applied);
      } else {
        go('/review', decision === 'skip' ? MESSAGES.skipped : MESSAGES.saved);
      }
    } finally {
      deciding.current = false;
    }
  };
  return html`
    <h2>Your decision</h2>
    <${TextField} label="Note (optional)" multiline rows=${2} value=${note} onInput=${setNote}
      hint="For example, why you're skipping it. This helps us find better matches." />
    <div class="actions">
      <${ActionButton} onAction=${decide('apply')}>Apply<//>
      <${ActionButton} className="btn btn-secondary" onAction=${decide('save')}>Save for later<//>
      <${ActionButton} className="btn btn-secondary" onAction=${decide('skip')}>Skip<//>
    </div>`;
}

function JobDetails({ job, onChanged }) {
  const state = useApp();
  const application = appOf(job);
  const notes = notesFor(job, job.route === 'excluded');
  let decision;
  if (application) {
    decision = html`
      <${Notice} kind="info"><p>You already have an application for this job:${' '}
        <a href=${href(`/applications/${application.id}`)}>${statusText(application.status, state.sending)[0]}</a>.</p><//>`;
  } else if (job.route === 'excluded' && payLocked(job)) {
    decision = html`
      <${Notice} kind="warn"><p>This job is unpaid or below your pay minimum, so it can't be applied to here.</p><//>`;
  } else {
    decision = html`<${Decision} job=${job} />`;
  }
  return html`
    <${JobMeta} job=${job} />
    <${JobBadges} job=${job} />
    ${job.score_summary && html`<h2>Why it fits</h2><p>${job.score_summary}</p>`}
    ${notes.length > 0 && html`<h2>Worth knowing</h2><ul>${notes.map((r) => html`<li>${r}</li>`)}</ul>`}
    ${job.pay_evidence && html`<p class="small muted">Pay found in the posting: “${job.pay_evidence}”</p>`}
    <div class="decision" data-tour="job-decision">${decision}</div>
    <${FewerButton} job=${job} fewer=${job.fewer} onChanged=${onChanged} />
    <h2>The posting</h2>
    <p><${ExternalLink} href=${job.url} className="posting-link">Open the original posting<//></p>
    ${job.description_text && html`
      <div class="posting" tabindex="0" role="region" aria-label="Job description">${job.description_text}</div>`}`;
}

function JobPage({ id }) {
  const result = useLoad(() => load(id), [id]);
  const job = result.data;
  let title = 'Job details';
  if (job) title = job.title;
  else if (job === null) title = 'Job not found';
  return html`
    <${Page} title=${title} back=${{ href: href('/review'), label: 'Back to jobs to review' }}>
      <${Loaded} result=${result}>${(found) => (found
        ? html`<${JobDetails} job=${found} onChanged=${(message) => { flash(message); result.reload(); }} />`
        : html`<${Notice} kind="info"><p>That job isn't here anymore.</p><//>`)}<//>
    <//>`;
}

export default function Job({ params }) {
  return html`<${JobPage} key=${params.id} id=${params.id} />`;
}
