// The guided tour: a short walk through the dashboard. It opens by itself once, on her first visit (whichever page she
// arrives on), and any time from "How this works". It's a modal dialog: the page behind can't be used while it's open, and each step opens
// its page and outlines the part it talks about (or carries on without the outline if that part isn't there).
import {
  html, render, useEffect, useLayoutEffect, useRef, useState,
} from './lib.js';
import { rows, rpc, sb } from './api.js';
import { navigate, parse } from './router.js';
import { app, update, useApp } from './store.js';

const GAP = 16; // px kept free between the outlined part (with its rings), the window's top, and the dialog
const RING = 12; // px the outline and its contrast ring reach beyond the part
const WAIT_MS = 3000; // how long a step looks for its part of the page
const SETTLE_MS = 400; // a page counts as loaded once it has shown no "Loading" for this long
const POLL_MS = 100;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let running = false; // a tour is open right now
let autoStarted = false; // it opens by itself at most once per visit

// targets: this page's parts, best first. fallback: parts anywhere (the header) when the page has none of them.
// compact: smaller key parts inside the targets, outlined instead when a target doesn't fit above the dialog.
const STEPS = [
  {
    id: 'welcome',
    path: '/',
    title: (me) => (me.name ? `Welcome, ${me.name}!` : 'Welcome!'),
    body: () => [
      'This dashboard is where your job search comes together. We find paid jobs that fit you, prepare tailored '
        + 'applications, and keep track of everything.',
      'This tour takes about 2 minutes. You can leave any time, and start it again from “How this works” in the More '
        + 'menu.',
    ],
  },
  {
    id: 'todo',
    path: '/',
    targets: ['home-todo'],
    compact: ['home-todo-first'],
    title: () => 'What needs you',
    body: () => [
      "This list shows what's waiting for you: jobs to look at, questions to answer, documents to check, and "
        + 'applications to send.',
      "The number on each one tells you how many. When they're all zero, you're all caught up.",
    ],
  },
  {
    id: 'auto',
    path: '/',
    targets: ['home-auto'],
    title: () => 'What happens on its own',
    body: () => [
      'Here you can see the work we do for you automatically.',
      'Nothing is sent to an employer while sending is paused. When sending is on, strong matches are sent only after '
        + 'a waiting time, so you can always stop one first.',
    ],
  },
  {
    id: 'review',
    path: '/review',
    targets: ['review-card'],
    compact: ['review-actions'],
    fallback: ['nav-review'],
    title: () => 'Jobs to review',
    body: () => [
      'New jobs that fit you come here, one at a time.',
      "Press Apply and we'll prepare the application. Save for later keeps it for another day. Skip means you won't "
        + 'see it again.',
    ],
  },
  {
    id: 'questions',
    path: '/questions',
    targets: ['question-form'],
    compact: ['question-form-field'],
    title: () => 'Questions to answer',
    body: () => [
      "Some application forms ask things we don't know yet. Answer once and it's saved for next time.",
      'Self-identification questions (like gender or ethnicity) are always optional, and only you can see your answers.',
    ],
  },
  {
    id: 'applications',
    path: '/applications',
    targets: ['app-list', 'app-tabs'],
    compact: ['app-tabs'],
    title: () => 'My applications',
    body: () => [
      'Every application is here, from the ones being prepared to the ones already sent.',
      "The tabs show what's active, what's sent, and what's closed.",
    ],
  },
  {
    id: 'application',
    path: null, // set to one of her applications when the tour starts (this step is left out if she has none)
    targets: ['app-finish', 'app-documents'],
    compact: ['app-finish-first', 'app-doc-first'],
    title: () => 'One application up close',
    body: () => [
      'Each application has its own page. Check your tailored résumé and cover letter here before anything goes out.',
      'Some sites need your own account. For those, “Finish it yourself” has everything ready: the link, your '
        + 'documents, and answers to copy.',
    ],
  },
  {
    id: 'soon',
    path: '/applying-soon',
    targets: ['soon-list'],
    compact: ['soon-stop'],
    title: () => 'Applying soon',
    body: () => [
      'These strong matches will be sent automatically at the time shown.',
      "Changed your mind? Press “Stop, don't apply” and nothing will be sent for that job.",
    ],
  },
  {
    id: 'preferences',
    path: '/preferences',
    targets: ['prefs-locations'],
    compact: ['prefs-locations-add'],
    title: () => 'Your preferences',
    body: () => [
      "Choose where you'd like to work and the kinds of jobs you want. You can add your own places, job titles, and "
        + 'topics too.',
    ],
  },
  {
    id: 'profile',
    path: '/profile',
    targets: ['profile-roles'],
    compact: ['profile-role-first'],
    title: () => 'Your résumé facts',
    body: () => [
      'These are the true facts about your work and studies. Your résumés and letters are written only from these '
        + 'facts, and nothing is ever invented.',
      'If something is missing or out of date, you can fix it here.',
    ],
  },
  {
    id: 'writing',
    path: '/writing',
    targets: ['writing-samples'],
    compact: ['writing-samples-intro'],
    title: () => 'Your writing style',
    body: () => [
      'Cover letters learn from your own writing, so they sound like you. Adding letters you wrote yourself helps.',
    ],
  },
  {
    id: 'help',
    path: '/help',
    targets: ['help-tour'],
    title: () => 'Help is always here',
    body: () => [
      '“How this works” explains everything in more detail. You can take this tour again from there any time.',
      'If something looks wrong or you have a question, email Shihab.',
    ],
  },
  {
    id: 'finish',
    path: '/',
    title: () => "You're all set",
    body: (me, setup) => [setup
      ? "That's the tour! The next step is a short setup (about 10 minutes), so we can fill in application forms for you."
      : "That's the tour! Come back to Home any time to see what needs you."],
  },
];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function shown(scope, name) {
  const el = scope.querySelector(`[data-tour="${name}"]`);
  return el && el.getClientRects().length > 0 ? el : null;
}

/** The band of the window above the dialog, measured (the dialog's height changes with each step's text). */
function freeBand(box) {
  const dialogTop = box ? box.getBoundingClientRect().top : window.innerHeight;
  return { top: GAP + RING, bottom: Math.max(GAP + RING, dialogTop - GAP - RING) };
}

const fits = (el, band) => el.getBoundingClientRect().height <= band.bottom - band.top;

/** A tall part would be half hidden by the dialog: outline its smaller key part instead. */
function bestFit(step, el, band) {
  if (!step.compact || fits(el, band)) return el;
  return step.compact.map((name) => shown(el, name) || shown(document, name)).find(Boolean) || el;
}

/** Scroll the outlined part into the band above the dialog: centered when it fits, else its top, so it's clear what
 * it is. (The scroll margins mark the band; `tour-open` adds room at the end of the page to scroll into.) */
function bringIntoView(el, band) {
  el.style.scrollMarginTop = `${band.top}px`;
  el.style.scrollMarginBottom = `${window.innerHeight - band.bottom}px`;
  el.scrollIntoView({ block: fits(el, band) ? 'center' : 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** Wait for the step's page, then find the part to outline. Gives up after a few seconds (null: no outline). */
async function findTarget(step, alive) {
  const [best, ...others] = step.targets || [];
  const until = Date.now() + WAIT_MS;
  let calmSince = null;
  while (alive()) {
    const timeUp = Date.now() >= until;
    const page = document.querySelector(`[data-path="${step.path}"]`);
    if (page) {
      const found = best && shown(page, best);
      if (found) return found;
      const busy = !page.querySelector('#page-title') || page.querySelector('.loading');
      calmSince = busy ? null : calmSince ?? Date.now();
      if (timeUp || (calmSince !== null && Date.now() - calmSince >= SETTLE_MS)) {
        const other = others.map((name) => shown(page, name)).find(Boolean)
          || (step.fallback || []).map((name) => shown(document, name)).find(Boolean);
        if (other) return other;
      }
    }
    if (timeUp) return null;
    await sleep(POLL_MS);
  }
  return null;
}

/** Keep Tab and Shift+Tab inside the dialog. */
function trapTab(event, box) {
  const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const end = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !items.includes(active))) {
    event.preventDefault();
    end.focus();
  } else if (!event.shiftKey && (active === end || !box.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function Tour({ steps, onClose }) {
  const state = useApp();
  const me = state.me || {};
  const [index, setIndex] = useState(0);
  const box = useRef(null);
  const heading = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const step = steps[index];
  const last = index === steps.length - 1;
  const setup = me.role === 'owner' && !me.onboarded;

  // While the tour is open, the page behind can't be used, and Tab and Escape stay with the tour. (`tour-open` adds
  // room at the end of the page, so a part near the bottom can still scroll up above the dialog.)
  useLayoutEffect(() => {
    const page = document.getElementById('app');
    if (page) page.setAttribute('inert', '');
    document.documentElement.classList.add('tour-open');
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab' && box.current) {
        trapTab(event, box.current);
      }
    };
    const onFocus = (event) => {
      if (box.current && heading.current && !box.current.contains(event.target)) heading.current.focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      document.documentElement.classList.remove('tour-open');
      if (page) page.removeAttribute('inert');
    };
  }, []);

  // Every step: focus its heading (in the same task that shows the step, so a quick key press can't get lost).
  useLayoutEffect(() => {
    if (heading.current) heading.current.focus();
  }, [step]);

  // Every step: open its page, and outline its part of the page once it shows up.
  useEffect(() => {
    let alive = true;
    let lit = null;
    if (parse().path !== step.path) navigate(step.path, undefined, { replace: true });
    if (step.targets || step.fallback) {
      findTarget(step, () => alive).then((found) => {
        if (!alive || !found) return;
        const band = freeBand(box.current);
        const el = bestFit(step, found, band);
        lit = el;
        el.classList.add('tour-highlight');
        bringIntoView(el, band);
      });
    }
    return () => {
      alive = false;
      if (lit) {
        lit.classList.remove('tour-highlight');
        lit.style.scrollMarginTop = '';
        lit.style.scrollMarginBottom = '';
      }
    };
  }, [step]);

  return html`
    <div class="tour-backdrop" onMouseDown=${(event) => event.preventDefault()}></div>
    <div class="tour-dialog" ref=${box} role="dialog" aria-modal="true" aria-labelledby="tour-title"
      aria-describedby="tour-body">
      <p class="tour-step">Step ${index + 1} of ${steps.length}</p>
      <h2 id="tour-title" tabindex="-1" ref=${heading}>${step.title(me)}</h2>
      <div id="tour-body">${step.body(me, setup).map((text) => html`<p>${text}</p>`)}</div>
      <div class="actions">
        ${index > 0 && html`<button type="button" class="btn btn-secondary" onClick=${() => setIndex(index - 1)}>Back</button>`}
        ${!last && html`<button type="button" class="btn" onClick=${() => setIndex(index + 1)}>Next</button>`}
        ${last && setup && html`<button type="button" class="btn" onClick=${() => close.current('/setup')}>Start setup</button>`}
        ${last && html`<button type="button" class=${setup ? 'btn btn-secondary' : 'btn'}
          onClick=${() => close.current()}>${setup ? 'Done' : 'Finish'}</button>`}
        ${!last && html`<button type="button" class="btn-link" onClick=${() => close.current()}>Leave the tour</button>`}
      </div>
    </div>`;
}

/** One of her applications for the "up close" step: one she finishes herself if there is one. */
async function pickApplication() {
  try {
    const list = await Promise.race([
      rows(sb.from('applications').select('id,status').order('id')),
      sleep(WAIT_MS).then(() => []),
    ]);
    const pick = list.find((a) => a.status === 'manual') || list[0];
    return pick ? pick.id : null;
  } catch (e) {
    return null;
  }
}

function finish(root, to) {
  if (!running) return;
  running = false;
  render(null, root);
  document.getElementById('app')?.removeAttribute('inert');
  (document.getElementById('page-title') || document.getElementById('main'))?.focus();
  // Remember it, so it doesn't open by itself again. If that fails, it simply opens again next time.
  rpc('tour_complete').then(() => {
    if (app.me) update({ me: { ...app.me, tour_completed: true } });
  }, () => {});
  if (typeof to === 'string') navigate(to);
  else if (to) navigate(to.path, to.query);
}

/** Start the tour (the "Take the tour again" button on Help). Works for anyone who's signed in. `then`: the page
 * ({ path, query }) to return to when it ends, unless she chooses "Start setup". */
export async function startTour(then = null) {
  if (running) return;
  running = true;
  autoStarted = true;
  const appId = await pickApplication();
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  const steps = STEPS.filter((s) => s.id !== 'application' || appId)
    .map((s) => (s.id === 'application' ? { ...s, path: `/applications/${appId}` } : s));
  render(html`<${Tour} steps=${steps} onClose=${(path) => finish(root, path || then)} />`, root);
}

/** Her first visit: open the tour once, unless she has already finished or left it. If she arrived on another page
 * (a link from an email, say), she's taken back there when it ends. */
export function maybeStartTour(me) {
  if (autoStarted || running || !me || me.role !== 'owner' || me.tour_completed) return;
  const { path, query } = parse();
  startTour(path !== '/' && path !== '/signin' ? { path, query } : null);
}
