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

function load() {
  return rows(sb.from('jobs').select(CARD_COLUMNS)
    .eq('route', 'review').is('decision', null).eq('closed', false)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('score', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(100));
}

export default function Review() {
  const result = useLoad(load, []);
  const { gone, remove } = useRemovable();
  return html`
    <${Page} title="Jobs to review">
      <p>These look like good fits but need your call. Press <strong>Apply</strong> and we'll tailor your résumé and prepare the application.</p>
      <${Loaded} result=${result}>${(jobs) => {
        const shown = jobs.filter((j) => !gone.has(j.id));
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
          ${shown.length === 0 && html`
            <${Notice} kind="ok"><p>Nothing to review right now. New jobs are checked several times a day.</p><//>`}
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
