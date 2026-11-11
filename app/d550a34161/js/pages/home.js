// Home: what needs her, deadlines in the next 2 days, and what's happening automatically.
import { html } from '../lib.js';
import { rows, rpc, sb } from '../api.js';
import { niceDate, plural, statusText } from '../format.js';
import { href } from '../router.js';
import { update, useApp } from '../store.js';
import {
  Loaded, Notice, Page, useFileUrl, useLoad,
} from '../ui.js';

async function loadPhoto() {
  const found = await rows(sb.from('settings').select('value').eq('key', 'photo_path'));
  return found.length && typeof found[0].value === 'string' ? found[0].value : null;
}

async function load() {
  const [counts, due, profile] = await Promise.all([
    rpc('dashboard_counts'),
    rpc('due_soon'),
    rows(sb.from('profile_versions').select('id').limit(1)),
  ]);
  update({ counts });
  return { counts, due, hasProfile: profile.length > 0 };
}

function Avatar({ path }) {
  const { url } = useFileUrl(path);
  return url ? html`<img class="avatar" src=${url} alt="" />` : null;
}

const TODO = [
  ['/review', 'review', 'Jobs to look at', 'Say yes, no, or save for later'],
  ['/questions', 'questions', 'Questions to answer', 'Answers are saved so you only answer once'],
  ['/applications', 'documents', 'Documents to check', 'Tailored résumés and letters that need a look'],
  ['/applications', 'ready', 'Ready to send', 'Look over and press Send'],
  ['/applications', 'manual', 'Finish it yourself', 'Sites that need your own account. Everything is prepared.'],
];

export default function Home() {
  const app = useApp();
  const result = useLoad(load, []);
  const photo = useLoad(loadPhoto, []);
  const me = app.me || {};
  return html`
    <${Page} title=${`Hi ${me.name || ''}`.trim()} lead=${photo.data && html`<${Avatar} path=${photo.data} />`}>
      <${Loaded} result=${result}>${(d) => {
        const c = d.counts;
        return html`
          ${me.role === 'owner' && !me.onboarded && html`
            <${Notice} kind="info">
              <p><strong>Finish setting up (about 10 minutes).</strong> A few answers let us fill in application forms for you.</p>
              <p><a class="btn" href=${href('/setup')}>Start setup</a></p>
            <//>`}
          ${!d.hasProfile && html`<${Notice} kind="warn"><p>Your résumé facts haven't been loaded yet. Shihab will do this for you.</p><//>`}
          ${app.worker && !app.worker.online && c.preparing > 0 && html`
            <${Notice} kind="info"><p>Shihab's Mac is offline right now, so documents will be prepared when it's back.</p><//>`}

          <h2>Needs you</h2>
          <ul class="todo-list" data-tour="home-todo">
            ${TODO.map(([path, key, label, hint], i) => html`
              <li data-tour=${i === 0 ? 'home-todo-first' : undefined}><a class=${`todo ${c[key] ? '' : 'zero'}`} href=${href(path)}>
                <span><strong>${label}</strong><br /><span class="small muted">${hint}</span></span>
                <span class="num">${c[key] || 0}</span>
              </a></li>`)}
          </ul>
          ${c.needs_you === 0 && html`<p class="notice notice-ok">You're all caught up. New jobs are checked several times a day.</p>`}

          ${d.due.length > 0 && html`
            <h2>Deadlines in the next 2 days</h2>
            <ul>
              ${d.due.map((item) => (item.kind === 'application'
                ? html`<li><a href=${href(`/applications/${item.id}`)}>${item.title} at ${item.organization}</a>: due ${niceDate(item.deadline)} (${statusText(item.status, app.sending)[0]})</li>`
                : html`<li><a href=${href(`/jobs/${item.id}`)}>${item.title} at ${item.organization}</a>: due ${niceDate(item.deadline)} (not decided yet)</li>`))}
            </ul>`}

          <h2>Happening automatically</h2>
          <div data-tour="home-auto">
            ${app.sending && app.sending.blocked && html`
              <${Notice} kind="info"><p><strong>Automatic sending is paused.</strong> Nothing will be sent to any employer
                until Shihab turns it back on. Jobs that would have been sent automatically come to you for review instead.</p><//>`}
            ${app.sending && app.sending.practice && html`
              <${Notice} kind="info"><p><strong>Practice mode is on.</strong> Application forms are filled in to check them,
                but nothing is sent to employers. Each one then comes back to you to send yourself.</p><//>`}
            <ul>
              <li><a href=${href('/applying-soon')}>${plural(c.scheduled || 0, 'application')} ${
                app.sending && app.sending.blocked ? 'waiting to send' : app.sending && app.sending.practice
                  ? 'waiting for a practice run' : 'sending soon'}</a>. You can stop any of them.</li>
              <li>${plural(c.preparing || 0, 'application')} being prepared right now.</li>
              <li><a href=${href('/applications', { tab: 'sent' })}>${plural(c.sent || 0, 'application')} sent so far</a>.</li>
            </ul>
          </div>`;
      }}<//>
    <//>`;
}
