// Starts the dashboard: sign-in state, who's signed in, and which page to show.
import { html, render, useEffect, useRef, useState } from './lib.js';
import { configured, rpc, sb } from './api.js';
import { Layout } from './layout.js';
import {
  navigate, parse, takeKeepFocus, useRoute,
} from './router.js';
import {
  pageChanged, refreshCounts, refreshStatus, resetApp, update, useApp,
} from './store.js';
import { ErrorNotice, Loading, Page } from './ui.js';

const pages = {};
const FOCUS_WAIT_MS = 10000; // how long a new page's heading is waited for before focus goes to the main area

/** Where to go after signing in: the page she was trying to open, or Home. */
function takeNext() {
  const next = sessionStorage.getItem('jas.next');
  sessionStorage.removeItem('jas.next');
  return next && next.startsWith('#/') && !next.startsWith('#/signin') ? next.slice(1) : '/';
}

function usePage(name) {
  const [loaded, setLoaded] = useState(() => ({ name, mod: pages[name] }));
  useEffect(() => {
    if (pages[name]) { setLoaded({ name, mod: pages[name] }); return undefined; }
    let alive = true;
    import(`./pages/${name}.js`).then((m) => { pages[name] = m; if (alive) setLoaded({ name, mod: m }); },
      () => { if (alive) setLoaded({ name, mod: { failed: true } }); });
    return () => { alive = false; };
  }, [name]);
  // Never render the previous page's module under the new address while the new one loads.
  return loaded.name === name ? loaded.mod : pages[name];
}

function NotAllowed() {
  return html`<${Page} title="This account can't use the dashboard">
    <p>You're signed in, but this email address isn't set up for this dashboard. If you think it should be, ask Shihab.</p>
    <p><button type="button" class="btn" onClick=${() => sb.auth.signOut({ scope: 'local' })}>Sign out</button></p>
  <//>`;
}

function Shell() {
  const route = useRoute();
  const state = useApp();
  const [session, setSession] = useState(undefined);
  const [meError, setMeError] = useState(null);
  const first = useRef(true);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session || null), () => setSession(null));
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next || null);
      if (!next) resetApp();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session && session.user ? session.user.id : null;
  useEffect(() => {
    if (!userId) return;
    setMeError(null);
    rpc('whoami').then((me) => update({ me: me || false }), (e) => setMeError(e.message));
  }, [userId]);

  // Her first sign-in: the guided tour starts once, whichever page she arrived on (it brings her back there after).
  useEffect(() => {
    const me = state.me;
    if (me && me.role === 'owner' && !me.tour_completed && route.page !== 'signin') {
      import('./tour.js').then((tour) => tour.maybeStartTour(me), () => {});
    }
  }, [state.me && state.me.tour_completed, state.me && state.me.role, route.page]);

  // Every page change: refresh the counts, show any message for the new page, and put focus on its heading once it
  // has loaded (a page seen for the first time loads its code first). Focus stays put if she has moved it meanwhile,
  // and while the tour is open (it keeps focus in its dialog).
  useEffect(() => {
    pageChanged();
    if (userId) { refreshCounts(); refreshStatus(); }
    if (first.current) { first.current = false; return undefined; }
    if (takeKeepFocus(route.path)) return undefined; // a sort or filter changed on the same page
    window.scrollTo(0, 0);
    const from = document.activeElement;
    const until = Date.now() + FOCUS_WAIT_MS;
    let timer;
    const focusHeading = () => {
      const now = document.activeElement;
      if (document.documentElement.classList.contains('tour-open') || (now !== from && now !== document.body)) return;
      const h1 = document.querySelector(`[data-path="${CSS.escape(route.path)}"] #page-title`);
      if (h1) h1.focus();
      else if (Date.now() < until) timer = setTimeout(focusHeading, 50);
      else document.getElementById('main')?.focus();
    };
    timer = setTimeout(focusHeading, 0);
    return () => clearTimeout(timer);
  }, [route.path, route.query && JSON.stringify(route.query), userId]);

  const signedOut = session === null;
  const pageName = signedOut ? 'signin' : route.page === 'signin' ? 'home' : route.page;
  useEffect(() => {
    // Read the live location: this effect can run after a newer navigation already happened.
    const now = parse();
    if (signedOut && now.page !== 'signin') {
      sessionStorage.setItem('jas.next', window.location.hash || '#/');
      navigate('/signin', undefined, { replace: true });
    } else if (session && now.page === 'signin') {
      const [path, qs] = takeNext().split('?');
      navigate(path, qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined, { replace: true });
    }
  }, [signedOut, route.page]);

  const mod = usePage(pageName);
  let content;
  if (session === undefined || (session && state.me === null && !meError)) content = html`<${Loading} />`;
  else if (meError) content = html`<${ErrorNotice} error=${meError} onRetry=${() => window.location.reload()} />`;
  else if (session && state.me === false) content = html`<${NotAllowed} />`;
  else if (mod === undefined) content = html`<${Loading} />`;
  else if (mod.failed) content = html`<${ErrorNotice} error="This page couldn't load. Check your connection and try again." onRetry=${() => window.location.reload()} />`;
  else content = html`<div data-page=${pageName} data-path=${route.path}><${mod.default} params=${route.params} query=${route.query} /></div>`;

  return html`<${Layout} path=${route.path}>${content}<//>`;
}

function boot() {
  const root = document.getElementById('app');
  if (window.top !== window.self) {
    // Never show the dashboard inside another site's frame (clickjacking).
    render(html`<main><h1>JAS</h1><p><a href=${window.location.href} target="_top">Open JAS in its own tab</a></p></main>`, root);
    return;
  }
  if (!configured) {
    render(html`<main><h1>JAS</h1><p>This site isn't connected yet (config.js is missing its settings).</p></main>`, root);
    return;
  }
  root.textContent = '';
  render(html`<${Shell} />`, root);
}

boot();
