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
  JobFilters, applyFilters, filtersActive, readFilters,
} from '../parts/jobfilters.js';

function load(f) {
  return rows(applyFilters(sb.from('jobs').select(CARD_COLUMNS)
    .eq('route', 'review').is('decision', null).eq('closed', false), f)
    .limit(100));
}

export default function Review({ query }) {
  const f = readFilters(query, 'deadline');
  const key = JSON.stringify(f);
  const result = useLoad(() => load(f), [key]);
  const { gone, remove } = useRemovable();
  return html`
    <${Page} title="Jobs to review">
      <p>These look like good fits but need your call. Press <strong>Apply</strong> and we'll tailor your résumé and prepare the application.</p>
      <${JobFilters} path="/review" query=${query} defaultSort="deadline"
        count=${result.data ? result.data.filter((j) => !gone.has(j.id)).length : undefined} />
      <${Loaded} result=${result}>${(jobs) => {
        const shown = jobs.filter((j) => !gone.has(j.id));
        const filtered = filtersActive(f, 'deadline');
        const headingIds = shown.map((j) => `job-${j.id}-title`);
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
        return html`
          ${shown.length === 0 && (filtered
            ? html`<p>No jobs to review match these filters.</p>`
            : html`<${Notice} kind="ok"><p>Nothing to review right now. New jobs are checked several times a day.</p><//>`)}
          ${shown.map((job, i) => html`
            <${JobCard} key=${job.id} job=${job} onDecided=${onDecided(job)}
              tour=${i === 0 ? 'review-card' : undefined} actionsTour=${i === 0 ? 'review-actions' : undefined} />`)}`;
      }}<//>
      <ul class="more-links">
        <li><a href=${href('/browse', { view: 'saved' })}>Saved jobs</a></li>
        <li><a href=${href('/browse', { view: 'not_a_match' })}>Jobs that weren't a match</a></li>
      </ul>
    <//>`;
}
