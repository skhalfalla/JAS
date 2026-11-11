// How this works: what happens on its own, what comes to her, documents, emails, tips, the tour, and who to ask.
import { html, useState } from '../lib.js';
import { SupportEmail } from '../layout.js';
import { href } from '../router.js';
import { useApp } from '../store.js';
import { Page } from '../ui.js';

export default function Help() {
  const { me } = useApp();
  const [error, setError] = useState('');
  const startTour = () => {
    setError('');
    import('../tour.js').then((tour) => tour.startTour())
      .catch(() => setError("The tour couldn't start. Please check your connection and try again."));
  };
  return html`
    <${Page} title="How this works">
      <h2>What happens on its own</h2>
      <ul>
        <li>Several times a day, we check job sites and over a hundred organizations' career pages
          for <strong>paid</strong> roles in your focus areas and locations.</li>
        <li>Unpaid roles, volunteer roles, and jobs below your pay minimum are never included.</li>
        <li>Each job gets a fit score from your real experience. Weak matches are set aside (you can still see them
          under <a href=${href('/browse', { view: 'not_a_match' })}>Not a match</a>).</li>
        <li>Strong matches on simple application sites are prepared and sent automatically after a waiting period.
          You'll see them under <a href=${href('/applying-soon')}>Applying soon</a>, and you can stop any of them.</li>
      </ul>

      <h2>What comes to you</h2>
      <ul>
        <li><strong>Jobs to review:</strong> good fits that need your yes or no (for example London roles, senior roles,
          or when pay isn't listed).</li>
        <li><strong>Questions to answer:</strong> things a form asks that we don't know yet. You answer once; we
          remember.</li>
        <li><strong>Documents to check:</strong> when a tailored letter didn't pass our quality checks, or after you ask
          for a change.</li>
        <li><strong>Finish it yourself:</strong> some sites (like Workday, USAJOBS, or UN careers) need your own account.
          We prepare everything: the link, your tailored résumé, your letter, and every answer with a copy button.</li>
      </ul>

      <h2>Your documents</h2>
      <ul>
        <li>Résumés and letters are tailored for each job using only your résumé facts. They can be reworded and
          expanded, but nothing is ever invented.</li>
        <li>On every document, “What changed” shows exactly how it differs from your master résumé.</li>
        <li>Not happy with something? Press “Ask for a change” and say what you want in your own words.</li>
        <li>To add something new about yourself (a new job, certificate, or detail), use <a
          href=${href('/profile')}>My résumé facts</a>.</li>
      </ul>

      <h2>Emails you'll get</h2>
      <ul>
        <li>A short summary each morning when something needs you.</li>
        <li>An alert when a deadline is less than 2 days away.</li>
        <li>Employers contact you directly at your own email and phone, as usual.</li>
      </ul>

      <h2>Tips</h2>
      <ul>
        <li>On your phone, use “Add to Home Screen” to open this like an app.</li>
        <li>You can pause all automatic applying any time in <a href=${href('/preferences')}>Preferences</a>.</li>
      </ul>

      <h2>The guided tour</h2>
      <p>A short walk through the main pages that points out where things are.</p>
      <p><button type="button" class="btn" data-tour="help-tour" onClick=${startTour}>Take the tour again</button></p>
      ${error && html`<p class="inline-error" role="alert">${error}</p>`}

      <section data-tour="help-contact">
        <h2>Questions?</h2>
        <p>Email Shihab<${SupportEmail} me=${me} /> if you have a question or something looks wrong. He set this up and is happy to help.</p>
      </section>
    <//>`;
}
