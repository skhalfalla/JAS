// Getting set up: the first-time questions. Answers go to "My saved answers" and are reused on application forms.
import { html, useState } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { MESSAGES } from '../format.js';
import { href } from '../router.js';
import { go, update, useApp } from '../store.js';
import {
  Loaded, Page, RadioGroup, TextField, useLoad,
} from '../ui.js';
import {
  SaveBar, loadPrefs, useSaver, useUnsavedGuard,
} from '../parts/settings.js';

const YES_NO = ['Yes', 'No'];
const NO_ANSWER = "I don't wish to answer";
const choice = (key, options, hint) => ({ key, options, hint });
const text = (key, hint) => ({ key, hint });

// Each question is an answer_bank row (by key); questions without a row are left out.
const STEPS = [
  {
    title: 'Work and visas',
    fields: [choice('us_citizen', YES_NO, 'Some government jobs require US citizenship.')],
    alreadySaved: ['work_auth_us', 'sponsorship_us', 'work_auth_uk', 'sponsorship_uk'],
  },
  {
    title: 'Pay and timing',
    fields: [
      text('salary_expectation', 'What to say when a form asks. For example: “$75,000 to $85,000, open to discussion”.'),
      text('start_date', 'For example: “Two weeks after an offer”.'),
      text('notice_period', 'For example: “Two weeks”.'),
    ],
  },
  {
    title: 'Moving and travel',
    fields: ['relocate_nyc', 'relocate_chicago', 'relocate_sf', 'relocate_london', 'relocate_other', 'onsite_ok', 'travel_ok']
      .map((key) => choice(key, YES_NO)),
  },
  {
    title: 'Background',
    fields: [
      text('years_experience', 'A number, for example “2”.'),
      text('references', 'For example: “Yes, available on request”.'),
      choice('background_check', YES_NO),
      choice('previously_employed', ['No', 'Yes'], "Most forms ask this. We'll check with you if you've worked somewhere before."),
      choice('consent_privacy', YES_NO,
        'Many forms require ticking “I have read the privacy notice”. Choose Yes to let us tick it for you.'),
    ],
  },
  {
    title: 'Optional self-identification',
    intro: "These questions are always voluntary. Only you can answer them. Leave them blank and we'll leave optional questions blank.",
    fields: [
      choice('eeo_gender', ['Woman', 'Man', 'Non-binary', NO_ANSWER]),
      text('eeo_race', `For example “Black or African American”, or “${NO_ANSWER}”.`),
      choice('eeo_hispanic', ['No', 'Yes', NO_ANSWER]),
      choice('eeo_veteran', ['I am not a protected veteran', NO_ANSWER]),
      choice('eeo_disability', ["No, I don't have a disability", 'Yes, I have a disability', NO_ANSWER]),
    ],
  },
];

async function load() {
  const [bank, prefs] = await Promise.all([
    rows(sb.from('answer_bank').select('id,key,question,answer')),
    loadPrefs(),
  ]);
  return { items: Object.fromEntries(bank.map((item) => [item.key, item])), prefs };
}

const CITIZEN = { Yes: true, No: false };

function SetupForm({ items, prefs }) {
  const app = useApp();
  const [initial] = useState(() => {
    const start = Object.fromEntries(Object.values(items).map((item) => [item.key, item.answer || '']));
    if (!start.us_citizen && typeof prefs.us_citizen === 'boolean') start.us_citizen = prefs.us_citizen ? 'Yes' : 'No';
    return start;
  });
  const [values, setValues] = useState(initial);
  const saver = useSaver();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedGuard(dirty);
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const steps = STEPS.map((s) => ({ ...s, fields: s.fields.filter((f) => items[f.key]) })).filter((s) => s.fields.length);

  const finish = () => saver.run(async () => {
    const answers = {};
    steps.forEach((s) => s.fields.forEach((f) => { answers[String(items[f.key].id)] = (values[f.key] || '').trim(); }));
    const citizen = CITIZEN[values.us_citizen];
    if (items.us_citizen && citizen !== undefined && citizen !== prefs.us_citizen) {
      await rpc('prefs_save', { p_prefs: { us_citizen: citizen } });
    }
    await rpc('onboarding_finish', { p_answers: answers });
    update({ me: { ...app.me, onboarded: true } });
    go('/', MESSAGES.onboarded);
  });

  const field = (f) => {
    const item = items[f.key];
    if (f.options) {
      return html`<${RadioGroup} key=${f.key} legend=${item.question} hint=${f.hint}
        options=${f.options.map((o) => ({ value: o, label: o }))} value=${values[f.key]} onChange=${(v) => set(f.key, v)} />`;
    }
    return html`<${TextField} key=${f.key} label=${item.question} hint=${f.hint} maxlength=${2000} value=${values[f.key]}
      onInput=${(v) => set(f.key, v)} />`;
  };
  const saved = (keys) => (keys || []).map((key) => items[key]).filter((item) => item && item.answer);

  return html`
    ${steps.map((s, i) => html`
      <section class="setup-step" key=${s.title}>
        <h2>${i + 1}. ${s.title}</h2>
        ${s.intro && html`<p>${s.intro}</p>`}
        ${s.fields.map(field)}
        ${saved(s.alreadySaved).length > 0 && html`
          <p class="small muted">Already saved. If anything changes (for example, you get a UK visa), change these
            under <a href=${href('/answers')}>My saved answers</a>.</p>
          <ul class="small muted">
            ${saved(s.alreadySaved).map((item) => html`<li key=${item.key}>${item.question} <strong>${item.answer}</strong></li>`)}
          </ul>`}
      </section>`)}
    <section class="setup-step">
      <h2>${steps.length + 1}. Your writing</h2>
      <p>After saving, please add 2 or 3 cover letters or personal statements you wrote yourself on
        the <a href=${href('/writing')}>Writing style</a> page. Letters will sound much more like you.</p>
    </section>
    <${SaveBar} label="Save and finish setup" saver=${saver} onSave=${finish} dirty=${dirty} />`;
}

export default function Setup() {
  const result = useLoad(load, []);
  return html`
    <${Page} title="Getting set up">
      <p>Here's how this works:</p>
      <ol>
        <li>We look for paid jobs that fit you, several times a day.</li>
        <li>Strong matches on simple application sites are sent automatically, after a waiting period so you can stop
          any of them.</li>
        <li>Everything else comes to you: jobs to review, questions to answer, and sites where you finish the
          application yourself (with everything prepared).</li>
        <li>Every résumé and cover letter is tailored from your real experience. Nothing is ever made up.</li>
      </ol>
      <p>Your answers below are reused on application forms, so you only answer once. You can change them any time
        under “My saved answers”.</p>
      <${Loaded} result=${result}>${(d) => html`<${SetupForm} items=${d.items} prefs=${d.prefs} />`}<//>
    <//>`;
}
