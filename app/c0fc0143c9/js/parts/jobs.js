// Pieces shared by the job pages (Jobs to review, a job's details, Saved / Not a match, Applying soon).
import {
  html, useEffect, useRef, useState,
} from '../lib.js';
import { rpc } from '../api.js';
import {
  deadlineNote, levelLabel, niceDate, payText, plainReasons, scoreWords,
} from '../format.js';
import { href } from '../router.js';
import { flash } from '../store.js';
import {
  ActionButton, Badge, ExternalLink,
} from '../ui.js';

/** The columns a job card shows (never the long description). */
export const CARD_COLUMNS = [
  'id', 'title', 'organization', 'source', 'employer_id', 'url', 'location_label', 'location_raw', 'remote', 'metro',
  'pay_min', 'pay_max',
  'pay_currency', 'pay_period', 'pay_status', 'deadline', 'score', 'level', 'score_summary', 'route_reasons', 'flags',
  'score_concerns',
].join(',');

/** The job's application, if it has one (applications.job_id is unique, so the embed is one row or none). */
export function appOf(job) {
  const a = job.applications;
  return (Array.isArray(a) ? a[0] : a) || null;
}

export function locationText(job, remoteNote = true) {
  const place = job.location_label || job.location_raw || '';
  return remoteNote && job.remote && job.metro !== 'remote' ? `${place} (remote option)`.trim() : place;
}

/** "Worth knowing": why it was routed to her, flags, and the scorer's concerns, in plain words and without repeats. */
export function notesFor(job, withFilterReasons = false) {
  return plainReasons([
    ...(withFilterReasons ? job.filter_reasons || [] : []),
    ...(job.route_reasons || []), ...(job.flags || []), ...(job.score_concerns || []),
  ]);
}

/** Show a message on this page (a repeat is read out again too). */
export const say = (message) => flash(message);

export function JobMeta({ job, remoteNote = true, deadline = true }) {
  const place = locationText(job, remoteNote);
  const note = job.deadline ? deadlineNote(job.deadline) : '';
  return html`
    <ul class="meta">
      <li><strong>${job.organization}</strong></li>
      ${place && html`<li>${place}</li>`}
      <li>${payText(job)}</li>
      ${deadline && job.deadline && html`<li>Deadline: <strong>${niceDate(job.deadline)}</strong>${note && ` (${note})`}</li>`}
    </ul>`;
}

export function JobBadges({ job }) {
  return html`
    <p class="badges">
      <${Badge} kind=${(job.score || 0) >= 75 ? 'ok' : 'info'}>${scoreWords(job.score)}<//>
      ${job.level && html`${' '}<${Badge} kind="muted">${levelLabel(job.level)}<//>`}
    </p>`;
}

/**
 * Cards she acts on (skip, save, stop) leave the list straight away. If keyboard focus was on that card, it moves
 * to the heading of the card that took its place (or the one before, or the page heading) instead of getting lost.
 */
export function useRemovable() {
  const [gone, setGone] = useState(() => new Set());
  const focusNext = useRef(null);
  useEffect(() => {
    const ids = focusNext.current;
    if (!ids) return;
    focusNext.current = null;
    const target = ids.map((id) => document.getElementById(id)).find(Boolean) || document.getElementById('page-title');
    if (target) target.focus();
  }, [gone]);
  /** key: the item's id; headingId: its card heading; headingIds: every card heading in the list, in order. */
  const remove = (key, headingId, headingIds) => {
    const heading = document.getElementById(headingId);
    const card = heading && heading.closest('article');
    if (card && card.contains(document.activeElement)) {
      const i = headingIds.indexOf(headingId);
      focusNext.current = [...headingIds.slice(i + 1), ...headingIds.slice(0, Math.max(i, 0)).reverse()];
    }
    setGone((prev) => new Set(prev).add(key));
  };
  return { gone, remove };
}

/**
 * A job to decide on. `onDecided(decision, result)` runs after Apply / Save for later / Skip worked.
 * One decision at a time: a second press while the first is still going is ignored.
 */
/** "Show fewer jobs from this employer", or for one she already sees fewer of, "show them as usual". */
export function FewerButton({ job, fewer, onChanged }) {
  const change = async () => {
    await rpc('employer_show_fewer', { p_organization: job.organization, p_fewer: !fewer });
    onChanged(fewer
      ? `You'll see jobs from ${job.organization} as usual again.`
      : `You'll see fewer jobs from ${job.organization}. To undo this, use Preferences.`);
  };
  return html`
    <p class="fewer-row">
      <${ActionButton} className="btn-link" busyLabel="Saving…" onAction=${change}>
        ${fewer ? `See jobs from ${job.organization} as usual` : `Show fewer jobs from ${job.organization}`}<//>
    </p>`;
}

export function JobCard({
  job, onDecided, tour, actionsTour, fewer = false, onFewer,
}) {
  const deciding = useRef(false);
  const notes = notesFor(job).slice(0, 6);
  const titleId = `job-${job.id}-title`;
  const decide = (decision) => async () => {
    if (deciding.current) return;
    deciding.current = true;
    try {
      const result = await rpc('job_decide', { p_job_id: job.id, p_decision: decision });
      onDecided(decision, result || {});
    } finally {
      deciding.current = false;
    }
  };
  return html`
    <article class="card job-card" aria-labelledby=${titleId} data-tour=${tour}>
      <h2 id=${titleId} tabindex="-1"><a href=${href(`/jobs/${job.id}`)}>${job.title}</a></h2>
      <${JobMeta} job=${job} />
      <${JobBadges} job=${job} />
      ${job.score_summary && html`<p><strong>Why it fits:</strong> ${job.score_summary}</p>`}
      ${notes.length > 0 && html`
        <p class="small worth-knowing"><strong>Worth knowing:</strong></p>
        <ul class="reasons small">${notes.map((r) => html`<li>${r}</li>`)}</ul>`}
      <div class="actions" data-tour=${actionsTour}>
        <${ActionButton} onAction=${decide('apply')}>
          Apply<span class="visually-hidden"> to ${job.title} at ${job.organization}</span><//>
        <${ActionButton} className="btn btn-secondary" onAction=${decide('save')}>
          Save for later<span class="visually-hidden">: ${job.title}</span><//>
        <${ActionButton} className="btn btn-secondary" onAction=${decide('skip')}>
          Skip<span class="visually-hidden"> ${job.title}</span><//>
        <${ExternalLink} href=${job.url} className="posting-link">
          See full posting<span class="visually-hidden"> for ${job.title}</span><//>
      </div>
      ${onFewer && html`<${FewerButton} job=${job} fewer=${fewer} onChanged=${onFewer} />`}
    </article>`;
}
