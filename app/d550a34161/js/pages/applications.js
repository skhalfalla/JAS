// My applications: what's in progress, what's been sent (and what happened), and what was stopped or withdrawn.
import { html } from '../lib.js';
import { rows, sb } from '../api.js';
import {
  OUTCOME_LABELS, STATUS_BADGE, niceDate, relative, statusText,
} from '../format.js';
import { href } from '../router.js';
import { useApp } from '../store.js';
import { Loaded, Page, useLoad } from '../ui.js';

const TABS = {
  active: ['In progress', ['preparing', 'needs_you', 'ready_to_send', 'scheduled', 'submitting', 'manual', 'failed']],
  sent: ['Sent', ['submitted']],
  closed: ['Stopped or withdrawn', ['vetoed', 'skipped', 'withdrawn']],
};

async function load(tab) {
  const [apps, outcomes] = await Promise.all([
    rows(sb.from('applications')
      .select(`id,status,needs,submit_after,submitted_at,submit_method,outcome,updated_at,
        jobs(id,title,organization,location_label,location_raw,deadline)`)
      .in('status', TABS[tab][1])
      .order('updated_at', { ascending: false })
      .limit(200)),
    tab === 'sent' ? rows(sb.from('applications').select('outcome').not('outcome', 'is', null)) : [],
  ]);
  const counts = {};
  outcomes.forEach((o) => { counts[o.outcome] = (counts[o.outcome] || 0) + 1; });
  return { apps, counts };
}

function When({ a, sending }) {
  if (a.status === 'submitted' && a.submitted_at) {
    const byHer = a.submit_method === 'manual' ? ' (by you)' : '';
    return html`<span class="small muted">Sent ${niceDate(a.submitted_at)}${byHer}</span>`;
  }
  if (a.status === 'scheduled') {
    if (sending && sending.blocked) return html`<span class="small">Waiting while sending is paused</span>`;
    if (sending && sending.practice) return html`<span class="small">Practice run ${relative(a.submit_after)}</span>`;
    return html`<span class="small">Sends ${relative(a.submit_after)}</span>`;
  }
  return html`<span class="small muted">Updated ${relative(a.updated_at)}</span>`;
}

function AppCard({ a, sending }) {
  const job = a.jobs || {};
  const needs = Array.isArray(a.needs) ? a.needs : [];
  const where = job.location_label || job.location_raw;
  const status = statusText(a.status, sending)[0];
  return html`
    <article class="card app-card">
      <h2><a href=${href(`/applications/${a.id}`)}>${job.title}</a></h2>
      <ul class="meta">
        <li><strong>${job.organization}</strong></li>
        ${where && html`<li>${where}</li>`}
        ${job.deadline && html`<li>Deadline ${niceDate(job.deadline)}</li>`}
      </ul>
      <p class="status-line">
        <span class=${`badge ${STATUS_BADGE[a.status] || 'badge-info'}`}>
          <span class="visually-hidden">Status: </span>${status}</span>
        ${a.outcome && html`
          <span class="badge badge-muted">
            <span class="visually-hidden">What happened: </span>${OUTCOME_LABELS[a.outcome] || a.outcome}</span>`}
        <${When} a=${a} sending=${sending} />
      </p>
      ${a.status === 'needs_you' && (needs.includes('questions') || needs.includes('document_review')) && html`
        <p class="small app-needs">
          ${needs.includes('questions') && 'Has questions for you. '}
          ${needs.includes('document_review') && 'A document needs your look.'}
        </p>`}
    </article>`;
}

function AppList({ tab, sending }) {
  const result = useLoad(() => load(tab), [tab]);
  return html`
    <${Loaded} result=${result}>${({ apps, counts }) => {
      const outcomes = Object.keys(OUTCOME_LABELS).filter((k) => counts[k]);
      return html`
        ${tab === 'sent' && outcomes.length > 0 && html`
          <p class="outcome-summary">So far: ${outcomes.map((k, i) => html`
            ${i ? ', ' : ''}${OUTCOME_LABELS[k]}: <strong>${counts[k]}</strong>`)}.</p>`}
        ${apps.length === 0 && html`<p>Nothing here yet.</p>`}
        ${apps.map((a) => html`<${AppCard} key=${a.id} a=${a} sending=${sending} />`)}`;
    }}<//>`;
}

export default function Applications({ query }) {
  const store = useApp();
  const tab = TABS[query.tab] ? query.tab : 'active';
  return html`
    <${Page} title="My applications">
      <nav aria-label="Which applications to show">
        <ul class="tabs" data-tour="app-tabs">
          ${Object.entries(TABS).map(([key, [label]]) => html`
            <li key=${key}>
              <a href=${href('/applications', { tab: key })} aria-current=${tab === key ? 'page' : undefined}>${label}</a>
            </li>`)}
        </ul>
      </nav>
      <div class="app-list" data-tour="app-list">
        <${AppList} key=${tab} tab=${tab} sending=${store.sending} />
      </div>
    <//>`;
}
