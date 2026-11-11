// Jobs to review: good fits that need her call. Apply, save for later, or skip, right from each card.
import { html } from '../lib.js';
import { rows, sb } from '../api.js';
import { MESSAGES } from '../format.js';
import { href } from '../router.js';
import { go, refreshCounts } from '../store.js';
import { Loaded, Notice, Page, useLoad } from '../ui.js';
import {
  CARD_COLUMNS, JobCard, say, useRemovable,
} from '../parts/jobs.js';
import {
  JobFilters, applyFilters, employerListed, filtersActive, mixEmployers, readFilters,
} from '../parts/jobfilters.js';
import { loadPrefs } from '../parts/settings.js';

const DEFAULT_SORT = 'mix';

/** After the list reloads, focus the first of these card headings that's there (or the page heading). */
function focusSoon(ids, tries = 20) {
  setTimeout(() => {
    const el = ids.map((id) => document.getElementById(id)).find((e) => e && e.getClientRects().length > 0);
    if (el) el.focus();
    else if (tries > 0) focusSoon(ids, tries - 1);
    else document.getElementById('page-title')?.focus();
  }, 100);
}

async function load(f) {
  const [jobs, prefs] = await Promise.all([
    rows(applyFilters(sb.from('jobs').select(CARD_COLUMNS)
      .eq('route', 'review').is('decision', null).eq('closed', false), f)
      .limit(f.sort === 'mix' ? 300 : 100)),
    loadPrefs(),
  ]);
  return { jobs, fewer: prefs.less_employers || [] };
}

export default function Review({ query }) {
  const f = readFilters(query, DEFAULT_SORT);
  const key = JSON.stringify(f);
  const result = useLoad(() => load(f), [key]);
  const { gone, remove } = useRemovable();
  const shownCount = result.data ? result.data.jobs.filter((j) => !gone.has(j.id)).length : undefined;
  return html`
    <${Page} title="Jobs to review">
      <p>These look like good fits but need your call. Press <strong>Apply</strong> and we'll tailor your résumé and prepare the application.</p>
      <p class="small">Found a job somewhere else? <a href=${href('/add')}>Add it from a link</a> and we'll prepare your
        application for it too.</p>
      <${JobFilters} path="/review" query=${query} defaultSort=${DEFAULT_SORT} count=${shownCount} />
      <${Loaded} result=${result}>${({ jobs, fewer }) => {
        const all = jobs.filter((j) => !gone.has(j.id));
        const fewerJobs = all.filter((j) => employerListed(j.organization, fewer));
        let shown = all.filter((j) => !employerListed(j.organization, fewer));
        if (f.sort === 'mix') shown = mixEmployers(shown);
        const headingIds = [...shown, ...fewerJobs].map((j) => `job-${j.id}-title`);
        const filtered = filtersActive(f, DEFAULT_SORT);
        const onDecided = (job) => (decision, res) => {
          if (decision === 'apply') {
            go(res.application_id ? `/applications/${res.application_id}` : '/applications', MESSAGES.applied);
            return;
          }
          remove(job.id, `job-${job.id}-title`, headingIds);
          result.reload();
          refreshCounts();
          say(decision === 'skip' ? MESSAGES.skipped : MESSAGES.saved);
        };
        const onFewer = (job) => (message) => {
          // Every card from that employer moves (to the end, or back into the list): keep focus on a nearby card
          // that stays where it is, instead of losing it.
          const order = [...shown, ...fewerJobs];
          const i = order.indexOf(job);
          const next = [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0)).reverse()]
            .filter((j) => j.organization !== job.organization).map((j) => `job-${j.id}-title`);
          result.reload();
          say(message);
          focusSoon(next);
        };
        const card = (job, i, isFewer) => html`
          <${JobCard} key=${job.id} job=${job} onDecided=${onDecided(job)} fewer=${isFewer} onFewer=${onFewer(job)}
            tour=${!isFewer && i === 0 ? 'review-card' : undefined}
            actionsTour=${!isFewer && i === 0 ? 'review-actions' : undefined} />`;
        const names = [...new Set(fewerJobs.map((j) => j.organization))];
        return html`
          ${shown.length === 0 && (filtered
            ? html`<p>No jobs to review match these filters.</p>`
            : html`<${Notice} kind="ok"><p>Nothing to review right now. New jobs are checked several times a day.</p><//>`)}
          ${shown.map((job, i) => card(job, i, false))}
          ${fewerJobs.length > 0 && html`
            <section class="fewer-section" aria-labelledby="fewer-heading">
              <h2 id="fewer-heading">From employers you see fewer jobs from</h2>
              <p>You chose to see fewer jobs from ${names.join(', ')}. Their jobs only come here when they fit you
                clearly better, and they're never sent automatically. You can change this in
                <a href=${href('/preferences')}>Preferences</a>.</p>
              <details class="more">
                <summary>Show ${fewerJobs.length === 1 ? 'this job' : `these ${fewerJobs.length} jobs`}</summary>
                ${fewerJobs.map((job, i) => card(job, i, true))}
              </details>
            </section>`}`;
      }}<//>
      <ul class="more-links">
        <li><a href=${href('/browse', { view: 'saved' })}>Saved jobs</a></li>
        <li><a href=${href('/browse', { view: 'not_a_match' })}>Jobs that weren't a match</a></li>
        <li><a href=${href('/add')}>Add a job from a link</a></li>
      </ul>
    <//>`;
}
