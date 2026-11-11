// Saved jobs, jobs that weren't a match, skipped jobs, or every job found (50 at a time, newest first).
import { html, useRef } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { MESSAGES, payLocked, plainReason } from '../format.js';
import { href } from '../router.js';
import { go } from '../store.js';
import {
  ActionButton, Loaded, Notice, Page, useLoad,
} from '../ui.js';
import { appOf, JobMeta } from '../parts/jobs.js';
import {
  JobFilters, applyFilters, filtersActive, mixEmployers, readFilters,
} from '../parts/jobfilters.js';

const VIEWS = {
  saved: ['Saved', 'Saved for later'],
  not_a_match: ['Not a match', 'Not a match'],
  skipped: ['Skipped', 'Skipped'],
  all: ['All', 'All jobs found'],
};
const PER_PAGE = 50;
const COLUMNS = 'id,title,organization,location_label,location_raw,pay_min,pay_max,pay_currency,pay_period,pay_status,'
  + 'route,filter_reasons,route_reasons,decision_reason,applications(id),metro,remote,deadline,score,source,employer_id';

async function load(view, page, f) {
  let q = sb.from('jobs').select(COLUMNS);
  if (view === 'saved') q = q.eq('decision', 'save');
  else if (view === 'not_a_match') q = q.in('route', ['hidden', 'excluded']).is('duplicate_of_id', null);
  else if (view === 'skipped') q = q.eq('decision', 'skip');
  const from = (page - 1) * PER_PAGE;
  // One extra row says whether there's a next page.
  const found = await rows(applyFilters(q, f).range(from, from + PER_PAGE));
  const jobs = found.slice(0, PER_PAGE);
  return { jobs: f.sort === 'mix' ? mixEmployers(jobs) : jobs, hasMore: found.length > PER_PAGE };
}

function setAsideReason(job) {
  const filter = job.filter_reasons || [];
  const route = job.route_reasons || [];
  return plainReason((filter.length ? filter : route.length ? route : ['low fit score'])[0]).text;
}

function BrowseCard({ job, view }) {
  const applying = useRef(false);
  const canApply = ['saved', 'not_a_match', 'skipped'].includes(view) && !appOf(job) && !payLocked(job);
  const apply = async () => {
    if (applying.current) return;
    applying.current = true;
    try {
      const result = await rpc('job_decide', { p_job_id: job.id, p_decision: 'apply' });
      const appId = result && result.application_id;
      go(appId ? `/applications/${appId}` : '/applications', MESSAGES.applied);
    } finally {
      applying.current = false;
    }
  };
  const titleId = `job-${job.id}-title`;
  return html`
    <article class="card job-card" aria-labelledby=${titleId}>
      <h2 id=${titleId}><a href=${href(`/jobs/${job.id}`)}>${job.title}</a></h2>
      <${JobMeta} job=${job} remoteNote=${false} deadline=${false} />
      ${['excluded', 'hidden'].includes(job.route) && html`
        <p class="small"><strong>Why it was set aside:</strong> ${setAsideReason(job)}</p>`}
      ${job.decision_reason && html`<p class="small">Your note: ${job.decision_reason}</p>`}
      ${canApply && html`
        <div class="actions">
          <${ActionButton} className="btn btn-secondary" onAction=${apply}>
            ${view === 'saved' ? 'Apply' : 'Apply anyway'}<span class="visually-hidden"> to ${job.title}</span><//>
        </div>`}
    </article>`;
}

function BrowseList({ view, page, f, keep }) {
  const result = useLoad(() => load(view, page, f), [view, page]);
  return html`
    <${Loaded} result=${result}>${(d) => html`
      ${d.jobs.length === 0 && html`<p>${filtersActive(f, 'newest') ? 'No jobs here match these filters.' : 'Nothing here.'}</p>`}
      ${d.jobs.map((job) => html`<${BrowseCard} key=${job.id} job=${job} view=${view} />`)}
      ${(page > 1 || d.hasMore) && html`
        <nav aria-label="Pages" class="actions">
          ${page > 1 && html`
            <a class="btn btn-secondary" href=${href('/browse', { ...keep, page: page > 2 ? page - 1 : undefined })}>Previous page</a>`}
          ${d.hasMore && html`<a class="btn btn-secondary" href=${href('/browse', { ...keep, page: page + 1 })}>Next page</a>`}
        </nav>`}`}<//>`;
}

export default function Browse({ query }) {
  let view = query.view === undefined ? 'saved' : query.view;
  if (!Object.prototype.hasOwnProperty.call(VIEWS, view)) view = 'all';
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const f = readFilters(query, 'newest');
  const keep = {
    view, sort: query.sort, place: query.place, q: query.q, paid: query.paid,
  };
  return html`
    <${Page} title=${VIEWS[view][1]}>
      <ul class="tabs" aria-label="Which jobs to show">
        ${Object.entries(VIEWS).map(([key, [label]]) => html`
          <li><a href=${href('/browse', { view: key })} aria-current=${view === key ? 'page' : undefined}>${label}</a></li>`)}
      </ul>
      ${view === 'not_a_match' && html`
        <p>These were set aside automatically. The reason is listed on each one. Unpaid jobs and jobs below your pay minimum can't be applied to here.</p>`}
      <${JobFilters} path="/browse" query=${query} defaultSort="newest" keep=${{ view }} />
      <${BrowseList} key=${`${view}:${page}:${JSON.stringify(f)}`} view=${view} page=${page} f=${f} keep=${keep} />
    <//>`;
}
