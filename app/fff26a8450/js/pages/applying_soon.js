// Applying soon: applications that will be sent automatically at the time shown, unless she stops them.
import { html } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import {
  MESSAGES, niceDateTime, payText, relative,
} from '../format.js';
import { href } from '../router.js';
import { refreshCounts, useApp } from '../store.js';
import {
  ActionButton, Badge, Loaded, Notice, Page, useLoad,
} from '../ui.js';
import { locationText, say, useRemovable } from '../parts/jobs.js';

const COLUMNS = 'id,status,submit_after,jobs(id,title,organization,location_label,location_raw,pay_min,pay_max,'
  + 'pay_currency,pay_period,pay_status,score_summary)';

function load() {
  return rows(sb.from('applications').select(COLUMNS).in('status', ['scheduled', 'submitting'])
    .order('submit_after', { ascending: true }));
}

function SoonCard({
  app, onStop, actionsTour, sending,
}) {
  const job = app.jobs || {};
  const titleId = `app-${app.id}-title`;
  const place = locationText(job, false);
  const when = `${sending && sending.practice ? 'Practice run' : 'Sends'} ${niceDateTime(app.submit_after)}`;
  return html`
    <article class="card highlight soon-card" aria-labelledby=${titleId}>
      <h2 id=${titleId} tabindex="-1"><a href=${href(`/applications/${app.id}`)}>${job.title}</a></h2>
      <ul class="meta">
        <li><strong>${job.organization}</strong></li>
        ${place && html`<li>${place}</li>`}
        <li>${payText(job)}</li>
      </ul>
      ${app.status === 'submitting' && html`<p><${Badge} kind="info">Sending now<//></p>`}
      ${app.status !== 'submitting' && sending && sending.blocked && html`
        <p><strong>Waiting while sending is paused.</strong> It won't go out until sending is turned back on.</p>`}
      ${app.status !== 'submitting' && !(sending && sending.blocked) && html`
        <p><strong>${when}</strong> (${relative(app.submit_after)})</p>`}
      ${job.score_summary && html`<p class="small">${job.score_summary}</p>`}
      <div class="actions" data-tour=${actionsTour}>
        <a class="btn btn-secondary" href=${href(`/applications/${app.id}`)}>
          Look at documents<span class="visually-hidden"> for ${job.title}</span></a>
        ${app.status === 'scheduled' && html`
          <${ActionButton} className="btn btn-danger" confirm="Stop this application? Nothing will be sent."
            onAction=${onStop}>Stop, don't apply<span class="visually-hidden"> to ${job.title}</span><//>`}
      </div>
    </article>`;
}

export default function ApplyingSoon() {
  const state = useApp();
  const result = useLoad(load, []);
  const { gone, remove } = useRemovable();
  return html`
    <${Page} title="Applying soon">
      ${state.sending && state.sending.blocked && html`
        <${Notice} kind="info"><p><strong>Automatic sending is paused.</strong> Nothing listed here will be sent until Shihab turns sending back on.</p><//>`}
      ${state.sending && state.sending.practice && html`
        <${Notice} kind="info"><p><strong>Practice mode is on.</strong> At the time shown we fill in the form to check it,
          but nothing is sent. Each one then comes back to you to send yourself.</p><//>`}
      <p>${state.sending && state.sending.blocked
        ? "These are strong matches on sites we can fill in for you. They're waiting while sending is paused, and you can stop any of them."
        : 'These are strong matches on sites we can fill in for you. Each one goes ahead at the time shown unless you stop it.'}</p>
      <${Loaded} result=${result}>${(apps) => {
        const shown = apps.filter((a) => !gone.has(a.id));
        const headingIds = shown.map((a) => `app-${a.id}-title`);
        const stop = (a) => async () => {
          await rpc('app_veto', { p_app_id: a.id });
          remove(a.id, `app-${a.id}-title`, headingIds);
          result.reload();
          refreshCounts();
          say(MESSAGES.vetoed);
        };
        return html`
          <div data-tour="soon-list">
            ${shown.length === 0 && html`<${Notice} kind="ok"><p>Nothing is scheduled right now.</p><//>`}
            ${shown.map((a, i) => html`
              <${SoonCard} key=${a.id} app=${a} onStop=${stop(a)} sending=${state.sending}
                actionsTour=${i === 0 ? 'soon-stop' : undefined} />`)}
          </div>`;
      }}<//>
    <//>`;
}
