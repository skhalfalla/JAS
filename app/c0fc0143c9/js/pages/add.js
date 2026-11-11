// Add a job from a link: she pastes the address of a job she found herself, and her application is prepared for it
// (a tailored résumé and cover letter) just like for the jobs we find.
import { html, useEffect, useState } from '../lib.js';
import { rpc } from '../api.js';
import { MESSAGES } from '../format.js';
import { href } from '../router.js';
import { flash, go, useApp } from '../store.js';
import {
  Badge, ExternalLink, Loaded, Notice, Page, TextField, useLoad,
} from '../ui.js';
import { useSubmit } from '../parts/apps.js';
import { useUnsavedGuard } from '../parts/settings.js';

const STATES = {
  waiting: ['Waiting to be read', 'info'],
  reading: ['Reading the posting now', 'info'],
  done: ['Application started', 'ok'],
  not_paid: ['Not applied to', 'muted'],
  failed: ["Couldn't add it", 'needs'],
};
const POLL_MS = 8000;

function LinkItem({ link }) {
  const [label, tone] = STATES[link.state] || STATES.failed;
  const name = link.title ? `${link.title}${link.organization ? ` at ${link.organization}` : ''}` : 'A job posting';
  return html`
    <li class="card link-item">
      <h3>${name}</h3>
      <p class="small link-url"><${ExternalLink} href=${link.url}>${link.url}<//></p>
      <p><${Badge} kind=${tone}>${label}<//>${link.message && html` <span>${link.message}</span>`}</p>
      ${link.application_id && html`
        <p><a class="btn btn-secondary" href=${href(`/applications/${link.application_id}`)}>
          See the application<span class="visually-hidden"> for ${name}</span></a></p>`}
    </li>`;
}

export default function AddJob() {
  const app = useApp();
  const result = useLoad(() => rpc('job_links'), []);
  const [url, setUrl] = useState('');
  const { busy, error, run } = useSubmit();
  useUnsavedGuard(url.trim() !== '');
  const links = Array.isArray(result.data) ? result.data : [];
  const pending = links.some((l) => l.state === 'waiting' || l.state === 'reading');
  // While a link is being read, check on it every few seconds.
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(result.reload, POLL_MS);
    return () => clearTimeout(timer);
  }, [result.data]);

  const submit = (event) => run(event, async () => {
    const out = await rpc('job_add_link', { p_url: url });
    setUrl('');
    if (out && out.application_id) {
      go(`/applications/${out.application_id}`,
        out.already ? 'We already had this job. Here is its application.' : MESSAGES.applied);
      return;
    }
    flash("Got it. We'll read the posting, then prepare your résumé and cover letter. This usually takes a few minutes.");
    result.reload();
  });

  const macOff = app.worker && app.worker.online === false;
  return html`
    <${Page} title="Add a job from a link">
      <p>Found a job yourself? Paste the link to its posting. We'll read it and prepare your application the same way as
        for the jobs we find: a résumé and cover letter tailored to it, from your résumé facts only.</p>
      <ul class="small">
        <li>It works best with the employer's own posting. For LinkedIn, Indeed, or Glassdoor, open the job there, press
          its Apply button, and copy the link of the employer's page that opens.</li>
        <li>Unpaid jobs and jobs below your pay minimum aren't applied to, as always.</li>
        <li>Nothing is sent to the employer until you've looked it over and approved it.</li>
      </ul>
      ${macOff && html`
        <${Notice} kind="info"><p>Shihab's Mac is offline right now, so links are read once it's back.</p><//>`}
      <form class="add-link" onSubmit=${submit} novalidate>
        <${TextField} label="Link to the job posting" type="url" inputmode="url" autocomplete="off" value=${url}
          onInput=${setUrl} placeholder="https://" maxlength=${2000} aria-invalid=${error ? 'true' : undefined} />
        <div class="actions">
          <button type="submit" class="btn" aria-disabled=${busy ? 'true' : undefined}>
            ${busy ? 'Adding…' : 'Prepare my application'}</button>
        </div>
        ${error && html`<p class="inline-error" role="alert">${error}</p>`}
      </form>

      <h2>Links you've added</h2>
      <${Loaded} result=${result}>${() => (links.length
        ? html`<ul class="plain link-list">${links.map((l) => html`<${LinkItem} key=${l.id} link=${l} />`)}</ul>`
        : html`<p class="muted">None yet.</p>`)}<//>
    <//>`;
}
