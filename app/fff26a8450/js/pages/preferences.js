// Preferences: which jobs we look for (pay, places, kinds of roles, topics) and what happens automatically.
import { html, useId, useState } from '../lib.js';
import { UserError, rpc } from '../api.js';
import {
  FOCUS_LABELS, LEVELS, LEVEL_LABELS, METRO_LABELS,
} from '../constants.js';
import { MESSAGES } from '../format.js';
import { flash, useApp } from '../store.js';
import {
  Checkbox, ChecklistWithAdd, Loaded, Page, RadioGroup, TextField, useLoad,
} from '../ui.js';
import {
  OwnList, SaveBar, SelectField, loadPrefs, useReset, useSaver, useUnsavedGuard, wholeNumber, withCommas,
} from '../parts/settings.js';

const choices = (labels, keys = Object.keys(labels)) => keys.map((value) => ({ value, label: labels[value] || value }));
const METROS = choices(METRO_LABELS);
const KINDS = choices(LEVEL_LABELS, LEVELS);
const FOCUS = choices(FOCUS_LABELS);
const WAIT = [
  { value: 0, label: 'Send right away' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours (recommended)' },
  { value: 24, label: '1 day' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
];
const CITIZEN = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
  { value: null, label: 'Prefer not to say', hint: 'Jobs that need US citizenship come to you to decide.' },
];
const ADMIN_FIELDS = [
  ['auto_threshold', 'Auto-apply fit score (0 to 100)'],
  ['review_threshold', 'Show-for-review fit score (0 to 100)'],
  ['employer_cap_per_30_days', 'Most applications per employer in 30 days (1 to 50)'],
];
// Which box a database message is about, so the message also shows next to that box.
const FIELD_OF = [
  [/^The US minimum salary/, 'usd'], [/^The UK minimum salary/, 'gbp'], [/^The auto-apply score/, 'auto_threshold'],
  [/^The review score/, 'review_threshold'], [/^The per-employer limit/, 'employer_cap_per_30_days'],
];

const SAVE_NOTE = 'Save your preferences to keep it.';
const known = (list, allowed) => (Array.isArray(list) ? list.filter((v) => allowed.includes(v)) : []);
const texts = (list) => (Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);

function toForm(p) {
  return {
    usd: withCommas(p.salary_floor_usd),
    gbp: withCommas(p.salary_floor_gbp),
    metros: known(p.metros, Object.keys(METRO_LABELS)),
    include_other_us: Boolean(p.include_other_us),
    custom_locations: texts(p.custom_locations),
    levels: known(p.levels, LEVELS),
    custom_roles: texts(p.custom_roles),
    focus_areas: known(p.focus_areas, Object.keys(FOCUS_LABELS)),
    custom_focus: texts(p.custom_focus),
    blocked_employers: texts(p.blocked_employers),
    search_keywords: texts(p.search_keywords),
    auto_submit_paused: Boolean(p.auto_submit_paused),
    veto_window_hours: p.veto_window_hours ?? 12,
    us_citizen: typeof p.us_citizen === 'boolean' ? p.us_citizen : null,
    has_uk_right_to_work: Boolean(p.has_uk_right_to_work),
    auto_threshold: withCommas(p.auto_threshold),
    review_threshold: withCommas(p.review_threshold),
    employer_cap_per_30_days: withCommas(p.employer_cap_per_30_days),
  };
}

/** Only the preferences she can change (plus the admin-only ones for Shihab). */
function toPrefs(f, admin) {
  const prefs = {
    salary_floor_usd: wholeNumber(f.usd),
    salary_floor_gbp: wholeNumber(f.gbp),
    metros: f.metros,
    include_other_us: f.include_other_us,
    custom_locations: f.custom_locations,
    levels: f.levels,
    custom_roles: f.custom_roles,
    focus_areas: f.focus_areas,
    custom_focus: f.custom_focus,
    blocked_employers: f.blocked_employers,
    search_keywords: f.search_keywords,
    auto_submit_paused: f.auto_submit_paused,
    veto_window_hours: Number(f.veto_window_hours),
    us_citizen: f.us_citizen,
    has_uk_right_to_work: f.has_uk_right_to_work,
  };
  if (admin) ADMIN_FIELDS.forEach(([key]) => { prefs[key] = wholeNumber(f[key]); });
  return prefs;
}

function PrefsForm({ prefs, admin, onSaved }) {
  const id = useId();
  const [form, setForm] = useState(() => toForm(prefs));
  const saver = useSaver();
  const round = useReset(prefs, () => { if (!saver.keepEdits()) setForm(toForm(prefs)); });
  const set = (patch) => { saver.edited(); setForm((f) => ({ ...f, ...patch })); saver.clearDone(); };
  const dirty = JSON.stringify(toPrefs(form, admin)) !== JSON.stringify(toPrefs(toForm(prefs), admin));
  useUnsavedGuard(dirty);
  const fieldError = (name) => (saver.error && FIELD_OF.some(([rx, f]) => f === name && rx.test(saver.error))
    ? saver.error : undefined);

  const submit = (event) => {
    event.preventDefault();
    saver.run(async () => {
      if (!form.search_keywords.length) {
        throw new UserError('Please keep at least one search word, so we can keep looking for jobs.');
      }
      await rpc('prefs_save', { p_prefs: toPrefs(form, admin) });
      flash(MESSAGES.prefs_saved);
      onSaved();
      return MESSAGES.prefs_saved;
    });
  };

  return html`
    <form class="settings-form" onSubmit=${submit}>
      <fieldset aria-describedby=${`${id}-pay`}>
        <legend>Minimum pay</legend>
        <p class="hint" id=${`${id}-pay`}>Paid internships and fellowships don't need to meet this, but they must say they're paid.</p>
        <${TextField} label="US jobs: minimum yearly salary (US dollars)" inputmode="numeric" autocomplete="off"
          value=${form.usd} onInput=${(v) => set({ usd: v })} error=${fieldError('usd')} />
        <${TextField} label="UK jobs: minimum yearly salary (pounds)" inputmode="numeric" autocomplete="off"
          value=${form.gbp} onInput=${(v) => set({ gbp: v })} error=${fieldError('gbp')} />
      </fieldset>

      <fieldset class="prefs-group">
        <legend>Where you'd like to work</legend>
        <${ChecklistWithAdd} key=${`places-${round}`} tourId="prefs-locations" legend="Places"
          hint="Places you add count as preferred locations. Places outside the US and UK come to you to decide, because you may need permission to work there."
          options=${METROS} selected=${form.metros} onSelected=${(v) => set({ metros: v })}
          custom=${form.custom_locations} onCustom=${(v) => set({ custom_locations: v })}
          saveNote=${SAVE_NOTE} inputLabel="Add a place" placeholder="e.g. Boston, MA" maxItems=${30} maxLength=${80} />
        <${Checkbox} label="Also show jobs in other US cities (lower priority)" checked=${form.include_other_us}
          onChange=${(v) => set({ include_other_us: v })} />
      </fieldset>

      <${ChecklistWithAdd} key=${`roles-${round}`} tourId="prefs-roles" legend="Kinds of roles"
        hint="Titles you add count as roles you want. If a title is usually outside your field, the job comes to you to decide. Senior roles always come to you for review, and unpaid roles are never included."
        options=${KINDS} selected=${form.levels} onSelected=${(v) => set({ levels: v })}
        custom=${form.custom_roles} onCustom=${(v) => set({ custom_roles: v })}
        saveNote=${SAVE_NOTE} inputLabel="Add a job title" placeholder="e.g. Community Health Worker" maxItems=${30} maxLength=${80} />

      <${ChecklistWithAdd} key=${`focus-${round}`} tourId="prefs-focus" legend="Focus areas"
        hint="Topics you add count as focus areas too."
        options=${FOCUS} selected=${form.focus_areas} onSelected=${(v) => set({ focus_areas: v })}
        custom=${form.custom_focus} onCustom=${(v) => set({ custom_focus: v })}
        saveNote=${SAVE_NOTE} inputLabel="Add a topic" placeholder="e.g. Food security" maxItems=${30} maxLength=${80} />

      <${OwnList} key=${`blocked-${round}`} legend="Employers to never apply to"
        hint="We never apply to an employer whose name includes what you add here. Untick one to allow it again."
        custom=${form.blocked_employers} onCustom=${(v) => set({ blocked_employers: v })}
        saveNote=${SAVE_NOTE} inputLabel="Add an employer" maxItems=${100} maxLength=${120} />

      <details class="more disclosure">
        <summary>Search words (advanced)</summary>
        <${OwnList} key=${`search-${round}`} legend="Search words"
          hint="Each one is a search we run on job sites. Job titles and topics you add above are searched too. Untick one to stop using it."
          custom=${form.search_keywords} onCustom=${(v) => set({ search_keywords: v })}
          saveNote=${SAVE_NOTE} inputLabel="Add a search" placeholder="e.g. refugee mental health" maxItems=${60} maxLength=${100} />
      </details>

      <fieldset>
        <legend>Automatic applying</legend>
        <${Checkbox} label="Pause automatic applying" hint="Everything will come to you for review instead."
          checked=${form.auto_submit_paused} onChange=${(v) => set({ auto_submit_paused: v })} />
        <${SelectField} label="How long before an automatic application is sent" hint="Time you have to stop it."
          value=${form.veto_window_hours} options=${WAIT} onChange=${(v) => set({ veto_window_hours: Number(v) })} />
      </fieldset>

      <fieldset>
        <legend>Work authorization</legend>
        <${RadioGroup} legend="Are you a US citizen?" hint="Some government jobs require US citizenship."
          options=${CITIZEN} value=${form.us_citizen} onChange=${(v) => set({ us_citizen: v })} />
        <${Checkbox} label="I have the right to work in the UK"
          hint="For example, with a UK visa. If not, UK jobs only come to you when the employer can sponsor a visa."
          checked=${form.has_uk_right_to_work} onChange=${(v) => set({ has_uk_right_to_work: v })} />
      </fieldset>

      ${admin && html`
        <fieldset aria-describedby=${`${id}-admin`}>
          <legend>Admin settings</legend>
          <p class="hint" id=${`${id}-admin`}>Only admins can see and change these.</p>
          ${ADMIN_FIELDS.map(([key, label]) => html`
            <${TextField} key=${key} label=${label} inputmode="numeric" autocomplete="off" value=${form[key]}
              onInput=${(v) => set({ [key]: v })} error=${fieldError(key)} />`)}
        </fieldset>`}

      <${SaveBar} label="Save preferences" saver=${saver} tour="prefs-save" dirty=${dirty} />
    </form>`;
}

export default function Preferences() {
  const app = useApp();
  const result = useLoad(loadPrefs, []);
  const admin = Boolean(app.me && app.me.role === 'admin');
  return html`
    <${Page} title="Preferences">
      <p>These decide which jobs we look for and what happens automatically. Changes apply to new jobs from now on.</p>
      <${Loaded} result=${result}>${(prefs) => html`
        <${PrefsForm} prefs=${prefs} admin=${admin} onSaved=${result.reload} />`}<//>
    <//>`;
}
