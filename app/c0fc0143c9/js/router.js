// Hash routes (#/review, #/jobs/12, ...) so every page has a link that works on GitHub Pages.
import { useEffect, useState } from './lib.js';

export const ROUTES = [
  ['/', 'home'], ['/review', 'review'], ['/jobs/:id', 'job'], ['/browse', 'browse'],
  ['/applying-soon', 'applying_soon'], ['/applications', 'applications'], ['/applications/:id', 'application'],
  ['/documents/:id', 'document'], ['/questions', 'questions'], ['/preferences', 'preferences'],
  ['/profile', 'profile'], ['/writing', 'writing'], ['/answers', 'answers'], ['/setup', 'setup'],
  ['/help', 'help'], ['/add', 'add'], ['/admin', 'admin'], ['/signin', 'signin'],
];

export function parse(hash = window.location.hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = `/${pathPart.replace(/^\/+|\/+$/g, '')}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  for (const [pattern, page] of ROUTES) {
    const keys = [];
    const rx = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([0-9]+)'; })}$`);
    const m = rx.exec(path);
    if (m) {
      const params = Object.fromEntries(keys.map((k, i) => [k, Number(m[i + 1])]));
      return { path, page, params, query };
    }
  }
  return { path, page: 'notfound', params: {}, query };
}

// ---------------------------------------------------------------- leaving with changes that aren't saved

const LEAVE = "You have changes that aren't saved. Leave this page without saving them?";
const unsaved = new Set(); // forms on this page with changes that aren't saved yet
let approved = false; // the next address change is already allowed
let current = window.location.hash;

/** A form reports whether it has changes that aren't saved (see useUnsavedGuard). */
export function markUnsaved(form, dirty) {
  if (dirty) unsaved.add(form); else unsaved.delete(form);
}

/** True when nothing would be lost by leaving now, or she says it's fine (for example before signing out). */
export function mayLeave() {
  return !unsaved.size || window.confirm(LEAVE);
}

// A link inside the dashboard: ask first, and stay if she says no.
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[href^="#/"]') : null;
  if (!link || !unsaved.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
    || event.shiftKey || event.altKey || link.target || link.getAttribute('href') === window.location.hash) return;
  if (mayLeave()) approved = true;
  else event.preventDefault();
}, true);

// Back, Forward, or a typed address. Registered before any page listens, so a "no" keeps the page as it is.
window.addEventListener('hashchange', (event) => {
  const allowed = approved || !unsaved.size || window.location.hash === current || window.confirm(LEAVE);
  approved = false;
  if (allowed) {
    // Leaving the page (she said OK, or nothing was unsaved): its forms no longer count, even before they've been
    // taken down. Otherwise a quick next move could ask again about a page she has already left.
    if (parse(window.location.hash).path !== parse(current).path) unsaved.clear();
    current = window.location.hash;
    return;
  }
  event.stopImmediatePropagation();
  window.history.replaceState(null, '', current);
});

// Closing the tab, reloading, or leaving the site: the browser asks.
window.addEventListener('beforeunload', (event) => {
  if (!unsaved.size) return;
  event.preventDefault();
  event.returnValue = '';
});

export function href(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

// After navigate(..., { keepFocus: true }) the page stays (a sort or filter changed), so focus and scrolling stay too.
// It holds for that page for a moment rather than once, so two quick changes in a row both keep focus.
let keepFocusOn = { path: null, until: 0 };

export function takeKeepFocus(path) {
  return keepFocusOn.path === path && Date.now() < keepFocusOn.until;
}

export function navigate(path, query, { replace = false, keepFocus = false } = {}) {
  const target = href(path, query);
  keepFocusOn = keepFocus ? { path, until: Date.now() + 1500 } : { path: null, until: 0 };
  approved = true; // the dashboard's own moves (after saving, the tour, signing in) never ask
  if (replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse());
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
