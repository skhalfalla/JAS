// Admin (Shihab only): the sending locks, the Mac worker, the task queue, job sources, AI use, and recent activity.
import {
  html, useEffect, useId, useRef, useState,
} from '../lib.js';
import { rpc } from '../api.js';
import { plural, relative } from '../format.js';
import { href } from '../router.js';
import { flash, refreshStatus, useApp } from '../store.js';
import {
  ActionButton, Badge, Loaded, Notice, Page, RadioGroup, useLoad,
} from '../ui.js';

const LIVE_CONFIRM = 'Turn on live sending? Applications will really be sent to employers.';
const RESUME_LIVE_CONFIRM = 'Resume sending? The sending mode is Live, so applications will really be sent to employers.';
const MODE_NAMES = { off: 'Off', dry_run: 'Practice', live: 'Live' };
const MODES = [
  { value: 'off', label: 'Off: never send', hint: 'Nothing is filled in or sent.' },
  {
    value: 'dry_run',
    label: "Practice: fill forms but don't send",
    hint: 'Forms are filled in on the real site and a screenshot is saved, but nothing is submitted. The application '
      + 'then becomes “Finish it yourself”.',
  },
  { value: 'live', label: 'Live: really send', hint: 'Strong matches are sent to employers after the waiting time.' },
];
const RUN_STATUS = {
  ok: ['OK', 'ok'], error: ['Error', 'needs'], skipped: ['Skipped', 'muted'], running: ['Running', 'info'],
};
const COMMANDS = [
  ['A one-time sign-in link', 'login-link --email ADDRESS', "Leave out --email for the owner's link."],
  ['Import résumé facts', 'import-profile PATH.yaml'],
  ['Import the dashboard photo', 'import-photo PATH.jpg'],
  ['Import writing samples', 'import-voice-samples FOLDER', 'A folder of PDF, Word, or text files.'],
  ['Load the employer list', 'sync-employers'],
  ['Back up the database now', 'backup', 'The worker also does this every night.'],
];

const number = (value) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value))
  ? null : Number(value));
const amount = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const dollars = (credits) => `$${(Number(credits) / 100).toFixed(2)}`;
const excerpt = (text, max = 300) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

function When({ at, none = '' }) {
  if (!at) return none;
  return html`<time datetime=${at}>${relative(at)}</time>`;
}

/** A table with a caption. On a phone it scrolls sideways (the scroll area can be reached with the keyboard). */
function Table({
  caption, head, foot, wide, children,
}) {
  const id = useId();
  return html`
    <div class="table-wrap" role="region" aria-labelledby=${id} tabindex="0">
      <table class=${wide ? 'simple wide' : 'simple'}>
        <caption id=${id}>${caption}</caption>
        <thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
        <tbody>${children}</tbody>
        ${foot && html`<tfoot>${foot}</tfoot>`}
      </table>
    </div>`;
}

// ---------------------------------------------------------------- sending

function ModeChoice({ mode, changed }) {
  const [choice, setChoice] = useState(mode);
  useEffect(() => { setChoice(mode); }, [mode]);
  const save = async () => {
    const was = MODE_NAMES[mode] || 'Off';
    if (choice === mode) {
      flash(`The sending mode is already ${was}.`);
      return;
    }
    if (choice === 'live' && !window.confirm(LIVE_CONFIRM)) {
      setChoice(mode);
      flash(`Live sending was not turned on. The sending mode is still ${was}.`);
      return;
    }
    await rpc('admin_set_submit_mode', { p_mode: choice });
    changed(`The sending mode is now ${MODE_NAMES[choice]}.`);
  };
  return html`
    <${RadioGroup} legend="Sending mode" options=${MODES} value=${choice} onChange=${setChoice}
      hint="Practice and Live only work while the pause is off." />
    <div class="actions"><${ActionButton} onAction=${save}>Save sending mode<//></div>`;
}

function Sending({
  paused, mode, macMode, done,
}) {
  const macBrake = macMode === 'off' || macMode === 'dry_run' ? macMode : null;
  const blocked = paused || !['dry_run', 'live'].includes(mode) || macBrake === 'off';
  const name = MODE_NAMES[mode] || 'Off';
  const changed = (message) => {
    done(message);
    refreshStatus();
  };
  const setPause = (on) => async () => {
    await rpc('admin_set_pause', { p_paused: on });
    changed(on ? 'Paused. Nothing will be sent.' : `Resumed. Sending now follows the sending mode (${name}).`);
  };
  let status = 'Sending is OFF: nothing will be sent to employers.';
  if (!blocked && mode === 'dry_run') status = 'Practice mode: forms are filled in, but nothing is sent to employers.';
  if (!blocked && mode === 'live') {
    status = macBrake === 'dry_run'
      ? 'Practice mode: the Mac has an emergency brake set, so forms are filled in but nothing is sent.'
      : 'Sending is LIVE: applications are really sent to employers.';
  }
  const pauseButton = paused
    ? html`<${ActionButton} onAction=${setPause(false)} confirm=${mode === 'live' ? RESUME_LIVE_CONFIRM : undefined}>Resume everything<//>`
    : html`<${ActionButton} className="btn btn-danger" onAction=${setPause(true)}>Pause all automatic sending<//>`;
  return html`
    <h2>Sending</h2>
    <${Notice} kind=${blocked ? 'info' : 'warn'}><p><strong>${status}</strong></p><//>
    <p>Both of these are controlled here. Nothing is sent unless the pause is off and the sending mode allows it:</p>
    <ol class="locks">
      <li><strong>The pause</strong> is ${paused ? 'on, so nothing is sent.' : 'off.'}</li>
      <li><strong>The sending mode</strong> is ${name}.</li>
    </ol>
    <p class="small muted">The Mac follows these switches within a minute or two. Nothing needs changing on the Mac.</p>
    ${macBrake && html`
      <${Notice} kind="warn"><p><strong>The Mac has an emergency brake set</strong>
        (<code>WORKER_SUBMIT_MODE=${macBrake}</code>), so it ${macBrake === 'off' ? 'never sends' : 'only does practice runs'},
        whatever is chosen here. To let this page decide again, remove that line from <code>~/.jas-worker.env</code> on
        the Mac and restart the worker.</p><//>`}
    <div class="actions">${pauseButton}</div>
    <${ModeChoice} mode=${mode} changed=${changed} />`;
}

// ---------------------------------------------------------------- the Mac worker

function credits(info) {
  const used = number(info.ai_credits_used_this_month);
  const budget = number(info.ai_credit_budget);
  if (used === null) return 'Not reported yet';
  if (budget === null || budget <= 0) return `${amount(used)} credits (about ${dollars(used)})`;
  const text = `${amount(used)} of ${amount(budget)} credits (${Math.round((used / budget) * 100)}%)`;
  return used >= budget ? `${text}. The budget is used up, so AI work waits until next month.` : text;
}

function Worker({ worker: w }) {
  const info = w.info || {};
  return html`
    <div class="card worker">
      <h3>${w.name}</h3>
      <p class="worker-state">
        <span class=${`status-dot ${w.online ? 'on' : 'off'}`} aria-hidden="true"></span>
        <strong>${w.online ? 'Online' : 'Offline'}</strong>
        ${!w.online && html`<span class="muted"> (it hasn't checked in for over 3 minutes)</span>`}
      </p>
      <dl class="facts">
        <dt>Last seen</dt><dd><${When} at=${w.last_seen_at} none="Never" /></dd>
        <dt>Version</dt><dd>${w.version || 'Unknown'}</dd>
        <dt>AI credits this month</dt><dd>${credits(info)}</dd>
        <dt>Last backup</dt><dd><${When} at=${info.last_backup_at} none="No backup yet" /></dd>
      </dl>
    </div>`;
}

function Workers({ workers }) {
  return html`
    <h2>The Mac worker</h2>
    ${workers.length === 0 && html`<${Notice} kind="warn"><p>The worker has never connected.</p><//>`}
    ${workers.map((w) => html`<${Worker} key=${w.name} worker=${w} />`)}`;
}

// ---------------------------------------------------------------- tasks

function payloadText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return Object.entries(payload)
    .map(([k, v]) => `${k} ${v !== null && typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
}

function Waiting({ tasks }) {
  if (!tasks.length) return html`<p>Nothing is waiting.</p>`;
  return html`<ul class="task-list">${tasks.map((t) => html`
    <li key=${t.id}>
      <p><strong>#${t.id} ${t.type}</strong></p>
      <p class="small break">${t.reason}</p>
      <p class="small muted">${new Date(t.run_after).getTime() > Date.now()
        ? html`Tries again <${When} at=${t.run_after} />` : 'Ready to run'}</p>
    </li>`)}</ul>`;
}

function Failed({ tasks, retry }) {
  if (!tasks.length) return html`<p>No failed tasks.</p>`;
  return html`<ul class="task-list">${tasks.map((t) => html`
    <li key=${t.id}>
      <p><strong>#${t.id} ${t.type}</strong> <span class="small muted">${payloadText(t.payload)}</span></p>
      <p class="small break">${t.error ? excerpt(t.error) : 'No error message was saved.'}</p>
      <p class="small muted">Failed <${When} at=${t.updated_at} /></p>
      <${ActionButton} className="btn btn-secondary" onAction=${retry(t)}>Retry<span class="visually-hidden"> task #${t.id} (${t.type})</span><//>
    </li>`)}</ul>`;
}

function Tasks({ data, done, refocus }) {
  const counts = data.task_counts || [];
  const requeue = async () => {
    const n = await rpc('admin_requeue_stuck');
    done(n ? `Requeued ${plural(n, 'stuck task')}.` : 'No stuck tasks were found.');
  };
  const retry = (task) => async () => {
    await rpc('admin_retry_task', { p_task_id: task.id });
    refocus.current = 'failed-tasks';
    done(`Task #${task.id} will be tried again.`);
  };
  return html`
    <h2>Tasks</h2>
    ${counts.length === 0 && html`<p>No tasks yet.</p>`}
    ${counts.length > 0 && html`
      <${Table} caption="Tasks by type and status" head=${['Type', 'Status', 'Count']}>
        ${counts.map((c) => html`<tr key=${`${c.type}/${c.status}`}><td>${c.type}</td><td>${c.status}</td><td>${c.n}</td></tr>`)}
      <//>`}
    <div class="actions"><${ActionButton} className="btn btn-secondary" onAction=${requeue}>Requeue stuck tasks<//></div>
    <p class="hint">Puts back tasks the Mac stopped working on partway (for example after a restart), so they run again.</p>
    <h3>Waiting</h3>
    <p class="hint">Queued tasks that left a note, for example because the model they need isn't turned on yet.</p>
    <${Waiting} tasks=${data.waiting || []} />
    <h3 id="failed-tasks" tabindex="-1">Failed tasks</h3>
    <${Failed} tasks=${data.failed || []} retry=${retry} />`;
}

// ---------------------------------------------------------------- job sources, AI use, activity

function SourceRow({ run: r }) {
  const [label, kind] = RUN_STATUS[r.status] || [r.status, 'muted'];
  return html`<tr>
    <th scope="row">${r.source}</th>
    <td><${When} at=${r.started_at} /></td>
    <td><${Badge} kind=${kind}>${label}<//></td>
    <td>${r.fetched}</td>
    <td>${r.new_jobs}</td>
    <td class="break">${r.error || html`<span class="muted">None</span>`}</td>
  </tr>`;
}

function Sources({ runs }) {
  return html`
    <h2>Job sources</h2>
    ${runs.length === 0 && html`<p>No job searches have run yet.</p>`}
    ${runs.length > 0 && html`
      <${Table} caption="Latest run for each source" head=${['Source', 'Last run', 'Status', 'Fetched', 'New', 'Problem']} wide>
        ${runs.map((r) => html`<${SourceRow} key=${r.source} run=${r} />`)}
      <//>`}
    <p><strong>Run a job search now:</strong> on GitHub, open the private code repository, then Actions, Job search,
      and press “Run workflow”.</p>
    <p class="hint">Job searches also run on their own every 6 hours.</p>`;
}

function Usage({ usage, employers }) {
  const prompts = usage.reduce((sum, u) => sum + (number(u.prompts) || 0), 0);
  const total = usage.reduce((sum, u) => sum + (number(u.credits) || 0), 0);
  const foot = html`<tr><th scope="row">Total</th><td>${prompts}</td><td>${amount(total)}</td><td>${dollars(total)}</td></tr>`;
  return html`
    <h2>Copilot usage this month</h2>
    <p class="hint">GitHub AI Credits used by this service (1 credit = $0.01). Your plan's monthly allowance is shared
      with your own Copilot use.</p>
    ${usage.length === 0 && html`<p>No AI use yet this month.</p>`}
    ${usage.length > 0 && html`
      <${Table} caption="AI use by model this month" head=${['Model', 'Prompts', 'AI credits', 'About']} foot=${foot}>
        ${usage.map((u) => html`<tr key=${u.model}>
          <th scope="row">${u.model}</th><td>${u.prompts}</td><td>${amount(u.credits || 0)}</td><td>${dollars(u.credits || 0)}</td>
        </tr>`)}
      <//>`}
    <p>Employers in the registry: <strong>${employers ?? 0}</strong></p>`;
}

function Activity({ audit }) {
  const what = (a) => [a.action, a.entity, a.entity_id ? `#${a.entity_id}` : ''].filter(Boolean).join(' ');
  return html`
    <h2>Recent activity</h2>
    ${audit.length === 0 && html`<p>Nothing has happened yet.</p>`}
    ${audit.length > 0 && html`
      <${Table} caption="The latest changes, newest first" head=${['When', 'Who', 'What']} wide>
        ${audit.map((a) => html`<tr><td><${When} at=${a.at} /></td><td>${a.actor}</td><td>${what(a)}</td></tr>`)}
      <//>`}`;
}

function CommandLine() {
  return html`
    <h2>Command-line only</h2>
    <p>These are done in Terminal on the Mac, in the project folder:</p>
    <dl class="commands">
      ${COMMANDS.map(([what, args, note]) => html`
        <dt>${what}</dt>
        <dd><code>.venv/bin/python -m app.cli ${args}</code>${note && html`<span class="hint">${note}</span>`}</dd>`)}
    </dl>`;
}

// ---------------------------------------------------------------- the page

function Overview() {
  const app = useApp();
  const result = useLoad(() => rpc('admin_overview'), []);
  const refocus = useRef(null);
  useEffect(() => {
    // A retried task leaves its list: keep keyboard focus nearby instead of losing it.
    const id = refocus.current;
    refocus.current = null;
    const active = document.activeElement;
    if (id && (!active || active === document.body)) document.getElementById(id)?.focus();
  }, [result.data]);
  const done = (message) => {
    flash(message);
    result.reload();
  };
  return html`
    <${Page} title="Admin" className="admin">
      <${Loaded} result=${result}>${(d) => html`
        <${Sending} paused=${d.paused} mode=${d.mode} macMode=${app.worker && app.worker.mac_mode} done=${done} />
        <${Workers} workers=${d.workers || []} />
        <${Tasks} data=${d} done=${done} refocus=${refocus} />
        <${Sources} runs=${d.runs || []} />
        <${Usage} usage=${d.usage || []} employers=${d.employers} />
        <${Activity} audit=${d.audit || []} />
        <${CommandLine} />`}<//>
    <//>`;
}

export default function Admin() {
  const app = useApp();
  if (!app.me || app.me.role !== 'admin') {
    return html`<${Page} title="Admin">
      <p>Only Shihab can see this page.</p>
      <p><a href=${href('/')}>Go to Home</a></p>
    <//>`;
  }
  return html`<${Overview} />`;
}
