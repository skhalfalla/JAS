// Header (brand + navigation with counts), the status area for messages, and the footer.
import { html, useEffect, useRef } from './lib.js';
import { signOut } from './api.js';
import { brandName } from './format.js';
import { href, mayLeave } from './router.js';
import { useApp } from './store.js';

function NavLink({ path, current, children, count, countLabel, tour }) {
  const active = current === path || (path !== '/' && current.startsWith(`${path}/`));
  return html`<li><a href=${href(path)} aria-current=${active ? 'page' : undefined} data-tour=${tour}>
    ${children}${count ? html`<span class="count">${count}<span class="visually-hidden"> ${countLabel}</span></span>` : ''}
  </a></li>`;
}

function MoreMenu({ me, counts, path }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  useEffect(() => {
    const close = (e) => { if (ref.current && ref.current.open && !ref.current.contains(e.target)) ref.current.open = false; };
    const esc = (e) => {
      if (e.key === 'Escape' && ref.current && ref.current.open) {
        ref.current.open = false;
        ref.current.querySelector('summary').focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, []);
  const c = counts || {};
  const item = (p, label, n, query) => html`<li><a href=${href(p, query)}>${label}${n ? html` <span class="count">${n}</span>` : ''}</a></li>`;
  return html`
    <li><details ref=${ref} data-tour="more">
      <summary>More</summary>
      <ul>
        ${item('/questions', 'Questions to answer', c.questions)}
        ${item('/applying-soon', 'Applying soon', c.scheduled)}
        ${item('/browse', 'Saved jobs', 0, { view: 'saved' })}
        ${item('/browse', 'Not a match', 0, { view: 'not_a_match' })}
        ${item('/preferences', 'Preferences')}
        ${item('/profile', 'My résumé facts')}
        ${item('/writing', 'Writing style')}
        ${item('/answers', 'My saved answers')}
        ${item('/help', 'How this works')}
        ${me.role === 'admin' && item('/admin', 'Admin')}
        <li><button type="button" class="btn-link" onClick=${() => { if (mayLeave()) signOut(); }}>Sign out</button></li>
      </ul>
    </details></li>`;
}

export function Layout({ path, children }) {
  const app = useApp();
  const me = app.me;
  const c = app.counts || {};
  return html`
    <a class="skip-link btn" href="#main" onClick=${(e) => { e.preventDefault(); document.getElementById('main').focus(); }}>Skip to main content</a>
    <header class="site-header">
      <div class="inner">
        <a class="site-title" href=${href('/')} data-tour="brand">${me ? brandName(me.owner_name) : 'JAS'}</a>
        ${me && html`
          <nav class="main-nav" aria-label="Main">
            <ul>
              <${NavLink} path="/" current=${path} count=${c.needs_you} countLabel="things need you" tour="nav-home">Home<//>
              <${NavLink} path="/review" current=${path} count=${c.review} countLabel="jobs to review" tour="nav-review">Jobs to review<//>
              <${NavLink} path="/applications" current=${path} tour="nav-applications">My applications<//>
              <${MoreMenu} me=${me} counts=${c} path=${path} />
            </ul>
          </nav>`}
      </div>
    </header>
    <main id="main" tabindex="-1">
      <div id="live-status" role="status" aria-live="polite">
        ${app.flash && html`<div class="notice notice-ok" key=${app.flashId}><p>${app.flash}</p></div>`}
      </div>
      <p id="announcer" class="visually-hidden" role="status" aria-live="polite"></p>
      ${children}
    </main>
    <footer class="site-footer">
      <div class="inner">
        ${me
          ? html`<p>Questions or something looks wrong? Email Shihab<${SupportEmail} me=${me} />. Your information is private to you and Shihab.</p>`
          : html`<p>This dashboard is private. Only people who have been invited can sign in.</p>`}
      </div>
    </footer>`;
}

/** " at name@example.com" as a mail link. The address comes from the database after sign-in, never the public site. */
export function SupportEmail({ me }) {
  const email = me && me.support_email;
  return email ? html` at <a href=${`mailto:${email}`}>${email}</a>` : '';
}
