// App-wide state: who's signed in, the "needs you" counts, sending status, and one-time messages.
import { useEffect, useState } from './lib.js';
import { rows, rpc, sb } from './api.js';

export const app = {
  me: null,          // whoami(): { role, email, name, owner_name, support_email, onboarded, tour_completed }
  counts: null,      // dashboard_counts()
  sending: null,     // { paused, mode, blocked }
  worker: null,      // worker_status(): { online, last_seen_at }
  flash: null,       // a message shown on the current page (in the status area)
  flashId: 0,        // changes with every message, so the same message twice is read out twice
  nextFlash: null,   // a message to show on the next page (set by go())
};
const listeners = new Set();

export function update(patch) {
  Object.assign(app, patch);
  listeners.forEach((fn) => fn());
}

export function useApp() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return app;
}

/** Show a message in the status area of the current page (screen readers hear it, even if it's a repeat). */
export const flash = (message) => update({ flash: message, flashId: app.flashId + 1 });

/** Go to another page and show a message there. */
export function go(path, message, query) {
  update({ nextFlash: message || null });
  import('./router.js').then(({ navigate }) => navigate(path, query));
}

/** Called by the layout on every page change. */
export function pageChanged() {
  update({ flash: app.nextFlash, flashId: app.flashId + 1, nextFlash: null });
}

export async function refreshCounts() {
  try {
    update({ counts: await rpc('dashboard_counts') });
  } catch (e) { /* the header just keeps its old numbers */ }
}

export async function refreshStatus() {
  try {
    const [settings, worker] = await Promise.all([
      rows(sb.from('settings').select('key,value').in('key', ['global_pause', 'auto_submit_mode'])),
      rpc('worker_status'),
    ]);
    const get = (k) => (settings.find((s) => s.key === k) || {}).value;
    const paused = get('global_pause') !== false;
    const mode = get('auto_submit_mode') || 'off';
    const mac = worker && worker.mac_mode; // the Mac's own switch (the third lock), when it has reported it
    const blocked = paused || !['dry_run', 'live'].includes(mode) || mac === 'off';
    const practice = !blocked && (mode === 'dry_run' || mac === 'dry_run');
    update({ sending: { paused, mode, blocked, practice }, worker });
  } catch (e) { /* leave as unknown */ }
}

export function resetApp() {
  update({ me: null, counts: null, sending: null, worker: null, flash: null, nextFlash: null });
}
