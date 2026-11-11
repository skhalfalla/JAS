// Questions to answer: every open question from her active applications, grouped by job.
import { html } from '../lib.js';
import { rows, sb } from '../api.js';
import { MESSAGES } from '../format.js';
import { href } from '../router.js';
import {
  Loaded, Notice, Page, useLoad,
} from '../ui.js';
import {
  ACTIVE, QuestionForm, SKIPPED, nextQuestion, useAfterChange,
} from '../parts/apps.js';

async function load() {
  const found = await rows(sb.from('app_questions')
    .select(`id,application_id,label,field,answer,answer_source,status,style_problems,sensitive,
      applications!inner(id,status,jobs(id,title,organization))`)
    .eq('status', 'needs_you')
    .in('applications.status', ACTIVE)
    .order('application_id', { ascending: true })
    .order('id', { ascending: true }));
  const groups = [];
  found.forEach((q) => {
    const last = groups[groups.length - 1];
    if (last && last.app.id === q.application_id) last.questions.push(q);
    else groups.push({ app: q.applications, questions: [q] });
  });
  return groups;
}

export default function Questions() {
  const result = useLoad(load, []);
  const after = useAfterChange(result, '#page-title');
  const onDone = ({ action, index }) => after(action === 'skipped' ? SKIPPED : MESSAGES.answered, nextQuestion(index));
  return html`
    <${Page} title="Questions to answer">
      <p>Application forms ask these. Answer once, and we'll reuse your answer next time a form asks the same thing.</p>
      <${Loaded} result=${result}>${(groups) => (groups.length === 0
        ? html`<${Notice} kind="ok"><p>No questions right now.</p><//>`
        : groups.map((g, gi) => {
          const job = g.app.jobs || {};
          return html`
            <section key=${g.app.id} class="question-group">
              <h2><a href=${href(`/applications/${g.app.id}`)}>${job.title} at ${job.organization}</a></h2>
              ${g.questions.map((q, qi) => html`
                <${QuestionForm} key=${q.id} q=${q} onDone=${onDone}
                  tour=${gi === 0 && qi === 0 ? 'question-form' : undefined} />`)}
            </section>`;
        }))}<//>
    <//>`;
}
