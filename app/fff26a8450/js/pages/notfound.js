import { html } from '../lib.js';
import { href } from '../router.js';
import { Page } from '../ui.js';

export default function NotFound() {
  return html`<${Page} title="Page not found">
    <p>That page doesn't exist. It may have moved.</p>
    <p><a class="btn" href=${href('/')}>Go to Home</a></p>
  <//>`;
}
