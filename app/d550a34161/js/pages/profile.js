// My résumé facts: the master copy every résumé and letter is built from. Only true facts; nothing is ever added.
import {
  html, useMemo, useRef, useState,
} from '../lib.js';
import {
  UserError, rows, rpc, sb,
} from '../api.js';
import { SECTION_TITLES } from '../constants.js';
import { MESSAGES } from '../format.js';
import { flash } from '../store.js';
import {
  ActionButton, Loaded, Notice, Page, TextField, announce, useLoad,
} from '../ui.js';
import {
  ListEditor, SaveBar, SelectField, focusLater, randomHex, slugify, tidy, tidyList, useReset, useSaver, useUnsavedGuard,
} from '../parts/settings.js';

const SECTIONS = ['professional', 'research', 'leadership'];
const SECTION_OPTIONS = SECTIONS.map((value) => ({ value, label: SECTION_TITLES[value] }));
const IMPORTANCE = [
  { value: 1, label: 'Always include' },
  { value: 2, label: 'Usually include' },
  { value: 3, label: "Include if there's room" },
];
// key, label, hint, autocomplete, input type, longest allowed
const CONTACT = [
  ['name', 'Full name', '', 'name', 'text', 120],
  ['email', 'Email', '', 'email', 'email', 200],
  ['phone', 'Phone', '', 'tel', 'tel', 60],
  ['city', 'City', '', 'address-level2', 'text', 120],
  ['linkedin', 'LinkedIn (optional)', '', 'url', 'text', 200],
  ['credentials', 'Letters after your name (optional)', 'For example: MPH. Added after your name when letters are signed.',
    'off', 'text', 40],
];

async function load() {
  const [versions, found] = await Promise.all([
    rows(sb.from('profile_versions').select('id,data').order('id', { ascending: false }).limit(1)),
    rows(sb.from('settings').select('value').eq('key', 'profile_suggestions')),
  ]);
  const suggestions = found.length && Array.isArray(found[0].value) ? found[0].value : [];
  return { version: versions[0] || null, suggestions };
}

// ---------------------------------------------------------------- the profile <-> the editor

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const importance = (v) => ([1, 2, 3].includes(v) ? v : 2);
const strings = (list) => (Array.isArray(list) ? list.map(text) : []);

function toEditor(data) {
  const c = data.contact || {};
  return {
    contact: Object.fromEntries(CONTACT.map(([key]) => [key, text(c[key])])),
    education: (Array.isArray(data.education) ? data.education : []).map((ed) => ({
      id: text(ed.id),
      degree: text(ed.degree),
      institution: text(ed.institution),
      location: text(ed.location),
      date: text(ed.date),
      details: strings(ed.details),
    })),
    experiences: (data.experiences || []).map((e) => ({
      id: text(e.id),
      section: SECTIONS.includes(e.section) ? e.section : 'professional',
      organization: text(e.organization),
      title: text(e.title),
      location: text(e.location),
      start: text(e.start),
      end: text(e.end),
      priority: importance(e.priority),
      bullets: (e.bullets || []).map((b) => ({
        id: text(b.id), text: text(b.text), tags: strings(b.tags), priority: importance(b.priority),
      })),
      details: strings(e.details),
    })),
    skills: (data.skills || []).map((g) => ({ label: text(g.label), items: strings(g.items) })),
    summary_facts: strings(data.summary_facts),
  };
}

/** The editor's contents in exactly the shape the database checks (only the allowed fields). */
function toProfile(f) {
  const optional = (v) => tidy(v) || null;
  return {
    contact: {
      name: tidy(f.contact.name),
      email: tidy(f.contact.email),
      phone: tidy(f.contact.phone),
      city: tidy(f.contact.city),
      linkedin: optional(f.contact.linkedin),
      credentials: optional(f.contact.credentials),
    },
    education: f.education.map((ed) => ({
      id: ed.id,
      institution: tidy(ed.institution),
      location: tidy(ed.location),
      degree: tidy(ed.degree),
      details: tidyList(ed.details),
      date: tidy(ed.date),
    })).filter((ed) => ed.institution || ed.degree || ed.details.length),
    experiences: f.experiences.map((e) => ({
      id: e.id,
      section: e.section,
      organization: tidy(e.organization),
      title: tidy(e.title),
      location: tidy(e.location),
      start: tidy(e.start),
      end: tidy(e.end),
      priority: e.priority,
      bullets: e.bullets.map((b) => ({ id: b.id, text: tidy(b.text), tags: b.tags, priority: b.priority }))
        .filter((b) => b.text),
      details: tidyList(e.details),
    })),
    skills: f.skills.map((g) => ({ label: tidy(g.label), items: tidyList(g.items) })).filter((g) => g.items.length),
    summary_facts: tidyList(f.summary_facts),
  };
}

const roleName = (e) => `${tidy(e.title) || 'New role'}${tidy(e.organization) ? `, ${tidy(e.organization)}` : ''}`;
const roleDates = (e) => [tidy(e.start), tidy(e.end)].filter(Boolean).join(' to ');
const bulletIds = (f) => new Set(f.experiences.flatMap((e) => e.bullets.map((b) => b.id)));

function newBulletId(roleId, taken) {
  let id;
  do { id = `${roleId.slice(0, 75)}-${randomHex(4)}`; } while (taken.has(id));
  taken.add(id);
  return id;
}

function findBullet(f, bulletId) {
  for (const e of f.experiences) {
    const b = e.bullets.find((x) => x.id === bulletId);
    if (b) return { role: e, bullet: b };
  }
  return null;
}

/** A suggestion still applies while its bullet contains the words it would change. */
const applies = (f, s) => Boolean(s && typeof s.find === 'string' && s.find && typeof s.replace === 'string'
  && findBullet(f, s.bullet_id)?.bullet.text.includes(s.find));

function withFix(f, s) {
  return {
    ...f,
    experiences: f.experiences.map((e) => ({
      ...e,
      bullets: e.bullets.map((b) => (b.id === s.bullet_id ? { ...b, text: b.text.split(s.find).join(s.replace) } : b)),
    })),
  };
}

// ---------------------------------------------------------------- one role

function RoleCard({
  role, open, moved, onChange, onRemove, takenBulletIds, tour,
}) {
  const box = useRef(null);
  const [error, setError] = useState('');
  const name = roleName(role);
  const dates = roleDates(role);
  const setBullet = (i, patch) => onChange({ bullets: role.bullets.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addBullet = () => {
    if (role.bullets.length >= 20) { setError('A role can have up to 20 bullet points.'); return; }
    setError('');
    onChange({ bullets: [...role.bullets, { id: newBulletId(role.id, takenBulletIds()), text: '', tags: [], priority: 2 }] });
    focusLater(() => box.current && [...box.current.querySelectorAll('.bullet-item textarea')].pop());
  };
  const removeBullet = (i) => {
    onChange({ bullets: role.bullets.filter((_, j) => j !== i) });
    setError('');
    announce(`Removed bullet point ${i + 1}.`);
    focusLater(() => box.current && box.current.querySelector('.add-bullet'));
  };
  const remove = () => {
    if (window.confirm(`Remove "${name}" from your résumé facts? It's gone for good once you save.`)) onRemove(role.id);
  };
  return html`
    <details class="card role-card" open=${open} ref=${box}>
      <summary data-tour=${tour}><span>${name}</span>${dates && html` <span class="role-dates">${dates}</span>`}</summary>
      <fieldset class="role-fields">
        <legend class="visually-hidden">${name}</legend>
        <div class="field-grid">
          <${TextField} label="Organization" value=${role.organization} maxlength=${200}
            onInput=${(v) => onChange({ organization: v })} />
          <${TextField} label="Your title" value=${role.title} maxlength=${200} onInput=${(v) => onChange({ title: v })} />
          <${TextField} label="Location" value=${role.location} maxlength=${120}
            onInput=${(v) => onChange({ location: v })} />
          <${TextField} label="Start" hint="For example: August 2025" value=${role.start} maxlength=${40}
            onInput=${(v) => onChange({ start: v })} />
          <${TextField} label="End" hint="For example: Present" value=${role.end} maxlength=${40}
            onInput=${(v) => onChange({ end: v })} />
        </div>
        <div class="field-grid">
          <${SelectField} label="Section" value=${role.section} options=${SECTION_OPTIONS}
            hint=${moved ? `Moves to ${SECTION_TITLES[role.section]} when you save.` : undefined}
            onChange=${(v) => onChange({ section: v })} />
          <${SelectField} label="How important is this role?" value=${role.priority} options=${IMPORTANCE}
            onChange=${(v) => onChange({ priority: Number(v) })} />
        </div>

        <fieldset class="bullets">
          <legend>Bullet points</legend>
          <p class="hint">These are printed on your résumé, reworded to fit each job. To remove one, press Remove or clear its text.</p>
          ${role.bullets.length > 0 && html`
            <ol class="bullet-list">
              ${role.bullets.map((b, i) => html`
                <li class="bullet-item" key=${b.id}>
                  <${TextField} label=${`Bullet point ${i + 1}`} multiline rows=${3} maxlength=${600} value=${b.text}
                    onInput=${(v) => setBullet(i, { text: v })} />
                  <div class="bullet-tools">
                    <${SelectField} label=${html`Importance<span class="visually-hidden"> of bullet point ${i + 1}</span>`}
                      value=${b.priority} options=${IMPORTANCE} onChange=${(v) => setBullet(i, { priority: Number(v) })} />
                    <button type="button" class="btn btn-secondary" onClick=${() => removeBullet(i)}>
                      Remove<span class="visually-hidden"> bullet point ${i + 1}</span>
                    </button>
                  </div>
                </li>`)}
            </ol>`}
          <div class="actions">
            <button type="button" class="btn btn-secondary add-bullet" onClick=${addBullet}>Add a bullet point</button>
          </div>
          ${error && html`<p class="inline-error" role="alert">${error}</p>`}
        </fieldset>

        <${ListEditor} legend="More true facts about this role" items=${role.details}
          hint="They aren't printed, but letters may use them. For example: numbers, people served, tools, or results."
          onChange=${(details) => onChange({ details })} itemLabel=${(i) => `Fact ${i + 1}`} addLabel="Add a fact"
          maxItems=${30} maxLength=${600} multiline />

        <div class="actions role-remove">
          <button type="button" class="btn btn-danger" onClick=${remove}>
            Remove this role<span class="visually-hidden">: ${name}</span>
          </button>
        </div>
      </fieldset>
    </details>`;
}

// ---------------------------------------------------------------- education

const eduName = (ed) => tidy(ed.degree) || tidy(ed.institution) || 'New degree or certificate';

function EducationCard({ ed, onChange, onRemove }) {
  const name = eduName(ed);
  const remove = () => {
    const empty = !tidy(ed.degree) && !tidy(ed.institution) && !tidyList(ed.details).length;
    if (empty || window.confirm(`Remove "${name}" from your résumé facts? It's gone for good once you save.`)) {
      onRemove(ed.id);
    }
  };
  return html`
    <fieldset class="card edu-card">
      <legend>${name}</legend>
      <div class="field-grid">
        <${TextField} label="Degree or certificate" hint="For example: Master of Public Health (MPH)" value=${ed.degree}
          maxlength=${200} onInput=${(v) => onChange({ degree: v })} />
        <${TextField} label="School" value=${ed.institution} maxlength=${200}
          onInput=${(v) => onChange({ institution: v })} />
        <${TextField} label="Location" value=${ed.location} maxlength=${120} onInput=${(v) => onChange({ location: v })} />
        <${TextField} label="Date" hint="For example: May 2025" value=${ed.date} maxlength=${60}
          onInput=${(v) => onChange({ date: v })} />
      </div>
      <${ListEditor} legend="Details" items=${ed.details} onChange=${(details) => onChange({ details })}
        hint="Printed under the degree. For example: a certificate, your department, or a focus area."
        itemLabel=${(i) => `Detail ${i + 1}`} maxItems=${10} maxLength=${200}
        addLabel=${html`Add a detail<span class="visually-hidden"> to ${name}</span>`} />
      <div class="actions">
        <button type="button" class="btn btn-danger" onClick=${remove}>
          Remove<span class="visually-hidden"> ${name}</span>
        </button>
      </div>
    </fieldset>`;
}

// ---------------------------------------------------------------- adding a role

const BLANK_ROLE = {
  section: 'professional', organization: '', title: '', location: '', start: '', end: '', bullets: '',
};

function AddRole({ onAdd }) {
  const [v, setV] = useState(BLANK_ROLE);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (key) => (value) => { setV((x) => ({ ...x, [key]: value })); setDone(''); };
  const submit = (event) => {
    event.preventDefault();
    const problem = !tidy(v.organization) || !tidy(v.title)
      ? 'Please add at least the organization and your title.' : onAdd(v);
    setError(problem || '');
    if (problem) return;
    const message = `Added ${tidy(v.title)} at the top of ${SECTION_TITLES[v.section]}. Press Save my résumé facts to keep it.`;
    setV(BLANK_ROLE);
    setDone(message);
    announce(message);
  };
  return html`
    <form class="card add-role" onSubmit=${submit}>
      <h3>Add a role</h3>
      <${SelectField} label="Section" value=${v.section} options=${SECTION_OPTIONS} onChange=${set('section')} />
      <div class="field-grid">
        <${TextField} label="Organization" value=${v.organization} maxlength=${200} onInput=${set('organization')} />
        <${TextField} label="Your title" value=${v.title} maxlength=${200} onInput=${set('title')} />
        <${TextField} label="Location" value=${v.location} maxlength=${120} onInput=${set('location')} />
        <${TextField} label="Start" hint="For example: January 2026" value=${v.start} maxlength=${40}
          onInput=${set('start')} />
        <${TextField} label="End" hint="Leave blank if you still work there." value=${v.end} maxlength=${40}
          onInput=${set('end')} />
      </div>
      <${TextField} label="What you did (optional)" hint="One bullet point per line. You can add more later." multiline
        rows=${4} value=${v.bullets} onInput=${set('bullets')} />
      <div class="actions"><button type="submit" class="btn btn-secondary">Add role</button></div>
      ${error && html`<p class="inline-error" role="alert">${error}</p>`}
      ${done && html`<p class="saved-note">${done}</p>`}
    </form>`;
}

// ---------------------------------------------------------------- the editor

function Editor({ version, suggestions, onSaved }) {
  const [form, setForm] = useState(() => toEditor(version.data));
  // Roles stay under the heading they were loaded with until saved, so nothing jumps while she edits.
  const [shownIn, setShownIn] = useState(() => Object.fromEntries(form.experiences.map((e) => [e.id, e.section])));
  const [opened] = useState(() => new Set(form.experiences.slice(0, 1).map((e) => e.id)));
  const [note, setNote] = useState('');
  const [groupError, setGroupError] = useState('');
  const [eduError, setEduError] = useState('');
  const saver = useSaver();
  useReset(version, () => {
    const next = toEditor(version.data);
    setForm(next);
    setShownIn(Object.fromEntries(next.experiences.map((e) => [e.id, e.section])));
    setNote('');
  });
  const savedProfile = useMemo(() => JSON.stringify(toProfile(toEditor(version.data))), [version]);
  const dirty = JSON.stringify(toProfile(form)) !== savedProfile;
  useUnsavedGuard(dirty);
  const change = (fn) => { setForm(fn); saver.clearDone(); };
  const setContact = (key, value) => change((f) => ({ ...f, contact: { ...f.contact, [key]: value } }));
  const setRole = (id, patch) => change((f) => ({
    ...f, experiences: f.experiences.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
  const removeRole = (id) => {
    change((f) => ({ ...f, experiences: f.experiences.filter((e) => e.id !== id) }));
    announce('Removed the role. Save to make it permanent.');
    focusLater('profile-roles-heading');
  };
  const setEducation = (id, patch) => change((f) => ({
    ...f, education: f.education.map((ed) => (ed.id === id ? { ...ed, ...patch } : ed)),
  }));
  const removeEducation = (id) => {
    change((f) => ({ ...f, education: f.education.filter((ed) => ed.id !== id) }));
    setEduError('');
    announce('Removed it. Save to make it permanent.');
    focusLater('profile-education-add');
  };
  const addEducation = () => {
    if (form.education.length >= 10) { setEduError('You can have up to 10.'); return; }
    setEduError('');
    const ids = new Set(form.education.map((ed) => ed.id));
    let id;
    do { id = `edu-${randomHex(6)}`; } while (ids.has(id));
    change((f) => ({
      ...f, education: [...f.education, { id, degree: '', institution: '', location: '', date: '', details: [] }],
    }));
    focusLater(() => [...document.querySelectorAll('.edu-card')].pop()?.querySelector('input'));
  };
  const setGroup = (i, patch) => change((f) => ({ ...f, skills: f.skills.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const addGroup = () => {
    if (form.skills.length >= 20) { setGroupError('You can have up to 20 groups.'); return; }
    setGroupError('');
    change((f) => ({ ...f, skills: [...f.skills, { label: '', items: [] }] }));
    focusLater(() => [...document.querySelectorAll('.skill-group .group-name input')].pop());
  };

  const addRole = (v) => {
    if (form.experiences.length >= 40) return 'You can have up to 40 roles.';
    const lines = String(v.bullets || '').split('\n').map(tidy).filter(Boolean);
    if (lines.length > 20) return 'A role can have up to 20 bullet points.';
    if (lines.some((line) => line.length > 600)) return 'A bullet point is too long (600 characters at most).';
    const ids = new Set(form.experiences.map((e) => e.id));
    let id;
    do { id = `exp-${slugify(v.organization) || 'role'}-${randomHex(4)}`; } while (ids.has(id));
    const taken = bulletIds(form);
    const role = {
      id,
      section: v.section,
      organization: tidy(v.organization),
      title: tidy(v.title),
      location: tidy(v.location),
      start: tidy(v.start),
      end: tidy(v.end) || 'Present',
      priority: 1,
      bullets: lines.map((line) => ({ id: newBulletId(id, taken), text: line, tags: [], priority: 2 })),
      details: [],
    };
    change((f) => {
      const experiences = [...f.experiences];
      const at = experiences.findIndex((e) => e.section === v.section);
      experiences.splice(at === -1 ? experiences.length : at, 0, role);
      return { ...f, experiences };
    });
    setShownIn((s) => ({ ...s, [id]: v.section }));
    opened.add(id);
    return null;
  };

  const save = () => saver.run(async () => {
    const profile = toProfile(form);
    if (profile.education.some((ed) => !ed.degree || !ed.institution)) {
      throw new UserError('Each degree or certificate needs both its name and the school. Fill in the missing one, '
        + 'or remove it.');
    }
    await rpc('profile_save', { p_profile: profile, p_note: tidy(note) || 'edited in dashboard' });
    flash(MESSAGES.profile_saved);
    onSaved();
    return MESSAGES.profile_saved;
  });

  const accept = async (s) => {
    const next = withFix(form, s);
    await rpc('profile_save', { p_profile: toProfile(next), p_note: `accepted suggestion: ${tidy(s.why)}`.slice(0, 300) });
    setForm(next);
    flash(MESSAGES.profile_saved);
    onSaved();
    focusLater(() => document.getElementById('profile-suggestions') || document.getElementById('page-title'));
  };

  const live = suggestions.filter((s) => applies(form, s));
  return html`
    ${live.length > 0 && html`
      <section class="suggestions">
        <h2 id="profile-suggestions" tabindex="-1">Suggested fixes</h2>
        ${live.map((s) => {
          const found = findBullet(form, s.bullet_id);
          return html`
            <div class="card" key=${`${s.bullet_id}:${s.find}`}>
              <p>${s.why}</p>
              <p class="small">Change “${s.find}” to “${s.replace}” in ${roleName(found.role)}.</p>
              <${ActionButton} className="btn btn-secondary" busyLabel="Saving…" onAction=${() => accept(s)}>
                Accept this fix<span class="visually-hidden">: ${s.why}</span>
              <//>
            </div>`;
        })}
      </section>`}

    <h2>Contact details</h2>
    <div class="field-grid">
      ${CONTACT.map(([key, label, hint, autocomplete, type, max]) => html`
        <${TextField} key=${key} label=${label} hint=${hint || undefined} type=${type} autocomplete=${autocomplete}
          maxlength=${max} value=${form.contact[key]} onInput=${(v) => setContact(key, v)} />`)}
    </div>

    <section class="education" aria-labelledby="profile-education-heading">
      <h2 id="profile-education-heading">Education</h2>
      <p>Your degrees and certificates, as they appear on your résumé.</p>
      ${form.education.length === 0 && html`<p class="muted">Nothing here yet.</p>`}
      ${form.education.map((ed) => html`
        <${EducationCard} key=${ed.id} ed=${ed} onChange=${(patch) => setEducation(ed.id, patch)}
          onRemove=${removeEducation} />`)}
      <div class="actions">
        <button type="button" class="btn btn-secondary" id="profile-education-add" onClick=${addEducation}>
          Add a degree or certificate</button>
      </div>
      ${eduError && html`<p class="inline-error" role="alert">${eduError}</p>`}
    </section>

    <section class="roles" data-tour="profile-roles">
      <h2 id="profile-roles-heading" tabindex="-1">Your roles</h2>
      <p>Open a role to change it. <strong>Tip:</strong> the more true detail you add under “More true facts about this
        role”, the richer your applications can be.</p>
      ${SECTIONS.map((section) => {
        const list = form.experiences.filter((e) => (shownIn[e.id] || e.section) === section);
        const firstRole = section === SECTIONS.find((s) => form.experiences.some((e) => (shownIn[e.id] || e.section) === s));
        return html`
          <h3>${SECTION_TITLES[section]}</h3>
          ${list.length
            ? list.map((e) => html`
              <${RoleCard} key=${e.id} role=${e} open=${opened.has(e.id)} moved=${(shownIn[e.id] || e.section) !== e.section}
                onChange=${(patch) => setRole(e.id, patch)} onRemove=${removeRole} takenBulletIds=${() => bulletIds(form)}
                tour=${firstRole && e === list[0] ? 'profile-role-first' : undefined} />`)
            : html`<p class="muted">No roles here yet.</p>`}`;
      })}
      <${AddRole} onAdd=${addRole} />
    </section>

    <h2>Skills, certifications, and honors</h2>
    <p class="hint">Groups with nothing in them aren't saved.</p>
    ${form.skills.map((g, i) => html`
      <fieldset class="card skill-group" key=${i}>
        <legend>${tidy(g.label) || `Group ${i + 1}`}</legend>
        <div class="group-name">
          <${TextField} label="Group name" hint="For example: Awards" value=${g.label} maxlength=${60}
            onInput=${(v) => setGroup(i, { label: v })} />
        </div>
        <${ListEditor} legend="Items" items=${g.items} onChange=${(items) => setGroup(i, { items })}
          itemLabel=${(j) => `Item ${j + 1}`} maxItems=${40} maxLength=${200}
          addLabel=${html`Add an item<span class="visually-hidden"> to ${tidy(g.label) || `group ${i + 1}`}</span>`} />
      </fieldset>`)}
    <div class="actions">
      <button type="button" class="btn btn-secondary" onClick=${addGroup}>Add a group</button>
    </div>
    ${groupError && html`<p class="inline-error" role="alert">${groupError}</p>`}

    <h2>Other true facts about you</h2>
    <${ListEditor} legend="Other true facts" hint="Facts your summary and letters may use." items=${form.summary_facts}
      onChange=${(summary_facts) => change((f) => ({ ...f, summary_facts }))} itemLabel=${(i) => `Fact ${i + 1}`}
      addLabel="Add a fact" maxItems=${40} maxLength=${600} multiline />

    <h2>Save your changes</h2>
    <${TextField} label="Note about this change (optional)" hint="For example: added my new job. This helps Shihab see what changed."
      value=${note} maxlength=${300} onInput=${(v) => { setNote(v); saver.clearDone(); }} />
    <${SaveBar} label="Save my résumé facts" saver=${saver} onSave=${save} tour="profile-save" dirty=${dirty} />`;
}

export default function Profile() {
  const result = useLoad(load, []);
  return html`
    <${Page} title="My résumé facts">
      <p>This is the master copy everything is built from. Tailored résumés and letters only ever use what's here.
        They can reword it, but never add to it.</p>
      <${Notice} kind="info">
        <p><strong>Only true facts go here.</strong> The writer never adds anything that isn't on this page, so if
          something is missing, add it here first.</p>
      <//>
      <${Loaded} result=${result}>${(d) => (d.version
        ? html`<${Editor} version=${d.version} suggestions=${d.suggestions} onSaved=${result.reload} />`
        : html`<${Notice} kind="warn"><p>Your résumé facts haven't been loaded yet. Shihab will do this for you.</p><//>`)}<//>
    <//>`;
}
