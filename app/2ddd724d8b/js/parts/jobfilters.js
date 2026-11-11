// Sort and filter for job lists (Jobs to review, Saved, Not a match, ...). The choices live in the page address, so
// Back, Forward, and links keep them; changing one keeps focus where it is.
import { html, useEffect, useId, useState } from '../lib.js';
import { METRO_LABELS } from '../constants.js';
import { navigate } from '../router.js';

export const SORTS = {
  deadline: ['Deadline (soonest first)', [['deadline', true], ['score', false]]],
  score: ['Best fit first', [['score', false], ['deadline', true]]],
  newest: ['Newest first', [['id', false]]],
  pay: ['Highest pay first', [['pay_annual_max', false], ['score', false]]],
};
const PLACES = {
  ...METRO_LABELS,
  custom: 'Places you added',
  other_us: 'Other US cities',
};
const LISTED_PAY = ['meets_floor', 'explicit_intern_pay'];

/** The filters from the page address (anything unknown is ignored). */
export function readFilters(query, defaultSort) {
  const q = query || {};
  return {
    sort: SORTS[q.sort] ? q.sort : defaultSort,
    place: PLACES[q.place] ? q.place : '',
    words: String(q.q || '').slice(0, 80),
    paid: q.paid === '1',
  };
}

export const filtersActive = (f, defaultSort) => Boolean(f.place || f.words.trim() || f.paid || f.sort !== defaultSort);

/** Add the filters and the sort order to a Supabase query of public.jobs. */
export function applyFilters(q, f) {
  let out = q;
  if (f.place === 'other_us') out = out.eq('location_tier', 2);
  else if (f.place === 'remote') out = out.or('metro.eq.remote,remote.is.true');
  else if (f.place) out = out.eq('metro', f.place);
  // Only letters, numbers, spaces and simple punctuation reach the query (commas and brackets have meaning there).
  const words = f.words.replace(/[^\p{L}\p{N}\s'&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (words) out = out.or(`title.ilike.*${words}*,organization.ilike.*${words}*`);
  if (f.paid) out = out.in('pay_status', LISTED_PAY);
  SORTS[f.sort][1].forEach(([column, ascending]) => { out = out.order(column, { ascending, nullsFirst: false }); });
  return out.order('id', { ascending: false });
}

export function JobFilters({
  path, query, defaultSort, keep = {}, count,
}) {
  const id = useId();
  const f = readFilters(query, defaultSort);
  const [words, setWords] = useState(f.words);
  useEffect(() => setWords(f.words), [f.words]);
  const go = (patch) => {
    const next = { ...f, ...patch };
    navigate(path, {
      ...keep,
      sort: next.sort !== defaultSort ? next.sort : undefined,
      place: next.place || undefined,
      q: next.words.trim() || undefined,
      paid: next.paid ? '1' : undefined,
    }, { keepFocus: true });
  };
  const active = filtersActive(f, defaultSort);
  return html`
    <form class="job-filters" role="search" aria-label="Sort and filter jobs"
      onSubmit=${(e) => { e.preventDefault(); go({ words }); }}>
      <div class="filter-row">
        <div class="field">
          <label for=${`${id}-sort`}>Sort by</label>
          <select id=${`${id}-sort`} value=${f.sort} onChange=${(e) => go({ sort: e.target.value })}>
            ${Object.entries(SORTS).map(([key, [label]]) => html`<option value=${key}>${label}</option>`)}
          </select>
        </div>
        <div class="field">
          <label for=${`${id}-place`}>Place</label>
          <select id=${`${id}-place`} value=${f.place} onChange=${(e) => go({ place: e.target.value })}>
            <option value="">Anywhere</option>
            ${Object.entries(PLACES).map(([key, label]) => html`<option value=${key}>${label}</option>`)}
          </select>
        </div>
        <div class="field filter-words">
          <label for=${`${id}-q`}>Job title or organization</label>
          <div class="search-row">
            <input id=${`${id}-q`} type="search" value=${words} maxlength="80" placeholder="e.g. refugee or UNICEF"
              onInput=${(e) => setWords(e.target.value)} />
            <button type="submit" class="btn btn-secondary">Search</button>
          </div>
        </div>
      </div>
      <label class="choice" for=${`${id}-paid`}>
        <input id=${`${id}-paid`} type="checkbox" checked=${f.paid} onChange=${(e) => go({ paid: e.target.checked })} />
        <span>Only jobs that list their pay</span>
      </label>
      <p class="filter-status" role="status">${active && html`
        ${typeof count === 'number' ? `${count} ${count === 1 ? 'job matches' : 'jobs match'}.` : ''}
        <button type="button" class="btn-link" onClick=${() => { setWords(''); go({
          sort: defaultSort, place: '', words: '', paid: false,
        }); }}>Clear filters</button>`}</p>
    </form>`;
}
