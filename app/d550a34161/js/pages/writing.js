// Writing style: her own writing samples (letters learn her voice from them) and her own rules for letters.
import { html, useId, useRef, useState } from '../lib.js';
import {
  UserError, rows, rpc, sb, uploadSample,
} from '../api.js';
import { MESSAGES, niceDate } from '../format.js';
import { flash } from '../store.js';
import {
  ActionButton, Loaded, Notice, Page, TextField, useLoad,
} from '../ui.js';
import {
  OwnList, SaveBar, focusLater, loadPrefs, useReset, useSaver, useUnsavedGuard,
} from '../parts/settings.js';

async function load() {
  const [prefs, samples] = await Promise.all([
    loadPrefs(),
    rows(sb.from('voice_samples').select('id,kind,title,status,error,created_at').order('id', { ascending: false })),
  ]);
  return { writing: prefs.writing, samples };
}

const sampleTitle = (s) => s.title || 'Writing sample';

function Sample({ sample, onRemoved }) {
  const remove = async () => {
    await rpc('voice_sample_delete', { p_id: sample.id });
    flash("Sample removed. Future letters won't learn from it.");
    onRemoved();
    focusLater('writing-samples-heading');
  };
  return html`
    <li class="card sample-card">
      <h3>${sampleTitle(sample)}</h3>
      <ul class="meta">
        <li>${sample.kind === 'edit' ? 'Your edited letter' : 'Your letter'}</li>
        <li>Added ${niceDate(sample.created_at)}</li>
      </ul>
      ${sample.status === 'pending' && html`<p><span class="badge badge-info">Reading this file…</span></p>`}
      ${sample.status === 'failed' && html`
        <p class="inline-error">${sample.error || "We couldn't read this file. Try a Word or text version, or paste the text."}</p>`}
      <div class="actions">
        <${ActionButton} className="btn btn-secondary" busyLabel="Removing…" onAction=${remove}
          confirm="Remove this sample? Future letters won't learn from it.">
          Remove<span class="visually-hidden"> ${sampleTitle(sample)}</span>
        <//>
      </div>
    </li>`;
}

function AddSample({ onAdded }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const paste = async () => {
    await rpc('voice_sample_add', { p_title: title, p_text: text });
    setTitle('');
    setText('');
    flash(MESSAGES.sample_added);
    onAdded();
  };
  const upload = async () => {
    if (!file) throw new UserError('Please choose a file first.');
    await uploadSample(file, title);
    setTitle('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    flash("Got it. We'll read your file in a few minutes.");
    onAdded();
  };
  return html`
    <div class="card add-sample">
      <h3>Add a sample</h3>
      <${TextField} label="Name for this sample (optional)" placeholder="e.g. Cover letter for UNICEF, 2025" value=${title}
        maxlength=${200} onInput=${setTitle} />
      <${TextField} label="Paste the text" hint="A full letter or statement you wrote, a few paragraphs long." multiline
        rows=${8} value=${text} onInput=${setText} />
      <div class="actions">
        <${ActionButton} busyLabel="Adding…" onAction=${paste}>Add pasted text<//>
      </div>
      <div class="field upload-field">
        <label for=${`${id}-file`}>Or upload a file<span class="hint" id=${`${id}-hint`}>A PDF, Word (.docx), or text (.txt)
          file, up to 15 MB. We read it in the background, which takes a few minutes.</span></label>
        <input id=${`${id}-file`} ref=${fileRef} type="file" accept=".pdf,.docx,.txt" aria-describedby=${`${id}-hint`}
          onChange=${(e) => setFile((e.target.files && e.target.files[0]) || null)} />
      </div>
      <div class="actions">
        <${ActionButton} busyLabel="Uploading…" onAction=${upload}>Upload file<//>
      </div>
    </div>`;
}

function RulesForm({ writing, onSaved }) {
  const start = () => ({
    banned: Array.isArray(writing.banned_phrases) ? writing.banned_phrases : [],
    mention: Array.isArray(writing.always_mention) ? writing.always_mention : [],
    notes: typeof writing.notes === 'string' ? writing.notes : '',
  });
  const [form, setForm] = useState(start);
  // Start fresh only when the saved rules changed (adding a sample reloads the page too).
  const round = useReset(JSON.stringify(writing), () => setForm(start()));
  const saver = useSaver();
  const dirty = JSON.stringify(form) !== JSON.stringify(start());
  useUnsavedGuard(dirty);
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); saver.clearDone(); };
  const submit = (event) => {
    event.preventDefault();
    saver.run(async () => {
      await rpc('writing_rules_save', { p_banned: form.banned, p_mention: form.mention, p_notes: form.notes });
      flash(MESSAGES.writing_saved);
      onSaved();
      return MESSAGES.writing_saved;
    });
  };
  return html`
    <form class="settings-form" onSubmit=${submit}>
      <${OwnList} key=${`banned-${round}`} legend="Words and phrases to never use"
        hint="Letters and written answers will never use these. Untick one to allow it again."
        custom=${form.banned} onCustom=${(v) => set({ banned: v })} saveNote="Save your writing rules to keep it." inputLabel="Add a word or phrase"
        placeholder="e.g. synergy" maxItems=${50} maxLength=${80} />
      <${OwnList} key=${`mention-${round}`} legend="Things to mention when they fit"
        hint="For example: my Arabic fluency for Middle East and North Africa roles."
        custom=${form.mention} onCustom=${(v) => set({ mention: v })} saveNote="Save your writing rules to keep it." inputLabel="Add something to mention"
        maxItems=${30} maxLength=${200} />
      <${TextField} label="Anything else about how you like to write" multiline rows=${4} maxlength=${2000}
        value=${form.notes} onInput=${(v) => set({ notes: v })} />
      <${SaveBar} label="Save writing rules" saver=${saver} dirty=${dirty} />
    </form>`;
}

export default function Writing() {
  const result = useLoad(load, []);
  return html`
    <${Page} title="Writing style">
      <p>Cover letters and written answers should sound like you, not like a computer. They follow these rules:</p>
      <ul>
        <li>Plain, warm, direct words. A few contractions like “I've” are fine.</li>
        <li>No dashes used as punctuation, and no filler like “honestly” or “I am writing to express my interest.”</li>
        <li>No clichés like “passionate about,” “leverage,” or “perfect fit.”</li>
        <li>Specific, true examples from your résumé facts. Nothing is ever made up.</li>
        <li>250 to 350 words for cover letters.</li>
      </ul>
      <p>Anything that doesn't pass these checks comes to you instead of being sent.</p>
      <${Loaded} result=${result}>${(d) => html`
        <section data-tour="writing-samples">
          <div data-tour="writing-samples-intro">
            <h2 id="writing-samples-heading" tabindex="-1">Your writing samples</h2>
            <p>Add past cover letters or personal statements you wrote yourself. Letters learn your voice from these,
              so they sound more like you.</p>
          </div>
          ${d.samples.length
            ? html`<ul class="plain sample-list">
                ${d.samples.map((s) => html`<${Sample} key=${s.id} sample=${s} onRemoved=${result.reload} />`)}
              </ul>`
            : html`<${Notice} kind="info"><p>No samples yet. Adding 2 or 3 makes a big difference.</p><//>`}
          <${AddSample} onAdded=${result.reload} />
        </section>
        <section data-tour="writing-rules">
          <h2>Your own rules</h2>
          <${RulesForm} writing=${d.writing} onSaved=${result.reload} />
        </section>`}<//>
    <//>`;
}
