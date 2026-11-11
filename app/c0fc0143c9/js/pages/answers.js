// My saved answers: answers we reuse on application forms, grouped by topic. She can change any of them.
import { html, useState } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { MESSAGES } from '../format.js';
import { flash } from '../store.js';
import {
  Badge, Loaded, Page, TextField, useLoad,
} from '../ui.js';
import {
  SaveBar, useReset, useSaver, useUnsavedGuard,
} from '../parts/settings.js';

const GROUPS = [
  ['work_auth', 'Work authorization'],
  ['sponsorship', 'Visa sponsorship'],
  ['education', 'Education'],
  ['salary', 'Pay'],
  ['start_date', 'Start date and notice'],
  ['relocation', 'Location and travel'],
  ['consent', 'Consents'],
  ['custom', 'Other questions'],
  ['eeo', 'Self-identification (optional)'],
];

function groupOf(item) {
  if (item.category === 'eeo') return 'eeo';
  if (item.key.startsWith('q:')) return 'custom';
  return GROUPS.some(([key]) => key === item.category) ? item.category : 'custom';
}

const load = () => rows(sb.from('answer_bank').select('id,key,question,answer,category,approved,sensitive').order('id'));

const isLong = (item) => item.answer.length > 80 || item.question.length > 120 || item.key.startsWith('q:');

function Status({ item, edited }) {
  if (edited) return html`<${Badge} kind="needs">Not saved yet<//>`;
  if (item.answer && item.approved) return html`<${Badge} kind="ok">Saved<//>`;
  if (item.answer) return html`<${Badge} kind="needs">Suggested, please confirm<//>`;
  return html`<${Badge} kind="muted">Not answered yet<//>`;
}

function AnswersForm({ items, onSaved }) {
  const start = () => Object.fromEntries(items.map((item) => [item.id, item.answer]));
  const [values, setValues] = useState(start);
  const saver = useSaver();
  useReset(items, () => { if (!saver.keepEdits()) setValues(start()); });
  const set = (id, value) => { saver.edited(); setValues((v) => ({ ...v, [id]: value })); saver.clearDone(); };
  const edited = (item) => (values[item.id] ?? '').trim() !== (item.answer || '');
  const dirty = items.some(edited);
  useUnsavedGuard(dirty);

  // Changed answers, plus suggested ones she's now confirming (the same rule the database uses).
  const changes = () => Object.fromEntries(items
    .map((item) => [item, (values[item.id] ?? '').trim()])
    .filter(([item, value]) => value !== item.answer || (value !== '' && !item.approved))
    .map(([item, value]) => [String(item.id), value]));

  const submit = (event) => {
    event.preventDefault();
    saver.run(async () => {
      const p = changes();
      if (!Object.keys(p).length) return 'Nothing to save. No answers were changed.';
      await rpc('answers_save', { p_answers: p });
      flash(MESSAGES.answers_saved);
      onSaved();
      return MESSAGES.answers_saved;
    });
  };

  const groups = GROUPS.map(([key, title]) => ({ key, title, items: items.filter((item) => groupOf(item) === key) }))
    .filter((g) => g.items.length);
  const suggested = items.some((item) => item.answer && !item.approved);
  return html`
    <form class="settings-form" onSubmit=${submit}>
      <div data-tour="answers-list">
        ${groups.map((g) => html`
          <section class="answer-group" key=${g.key}>
            <h2>${g.title}</h2>
            ${g.key === 'eeo' && html`<p>Only you can see these in this dashboard. Leave any blank to skip that question on forms. When you apply, the
              employer receives the answers you gave.</p>`}
            ${g.items.map((item) => html`
              <${TextField} key=${item.id} label=${html`${item.question} <${Status} item=${item} edited=${edited(item)} />`}
                hint=${item.sensitive && g.key !== 'eeo' ? 'Only you can see this answer.' : undefined}
                multiline=${isLong(item)} rows=${3} maxlength=${2000} value=${values[item.id]}
                onInput=${(v) => set(item.id, v)} />`)}
          </section>`)}
        ${!groups.length && html`<p>No saved answers yet. They appear here as you answer questions on forms.</p>`}
      </div>
      <${SaveBar} label="Save answers" saver=${saver} dirty=${dirty}
        note=${suggested ? 'Saving also confirms the suggested answers.' : undefined} />
    </form>`;
}

export default function Answers() {
  const result = useLoad(load, []);
  return html`
    <${Page} title="My saved answers">
      <p>Application forms ask the same things again and again. These answers are filled in for you. An empty answer
        means we'll ask you when a form needs it.</p>
      <${Loaded} result=${result}>${(items) => html`<${AnswersForm} items=${items} onSaved=${result.reload} />`}<//>
    <//>`;
}
