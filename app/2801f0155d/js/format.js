// Plain-language labels and small formatting helpers (same wording as before).
import { FOCUS_LABELS, LEVEL_LABELS, METRO_LABELS } from './constants.js';

export const APP_STATUS = {
  preparing: ['Getting ready', "We're tailoring your documents and reading the application form."],
  needs_you: ['Needs you', 'Something needs your answer or approval before this can go out.'],
  ready_to_send: ['Ready to send', 'Your documents are ready. Look them over and press Send.'],
  scheduled: ['Sending soon', 'This will be sent automatically unless you stop it.'],
  submitting: ['Sending now', "We're filling in the application form right now."],
  submitted: ['Sent', 'Your application was sent.'],
  manual: ['Finish it yourself', 'This site needs you. Everything you need is prepared below.'],
  vetoed: ['Stopped', 'You stopped this application. Nothing was sent.'],
  skipped: ['Skipped', 'You skipped this job.'],
  withdrawn: ['Withdrawn', 'You withdrew this application.'],
  failed: ['Problem', 'Something went wrong preparing this. Shihab has been notified.'],
};
/**
 * A status as she should read it right now. While sending is paused nothing claims it will be sent, and in practice
 * mode it says that forms are only filled in to check them.
 */
export function statusText(status, sending) {
  const blocked = Boolean(sending && sending.blocked);
  const practice = Boolean(sending && sending.practice);
  if (status === 'scheduled' && blocked) {
    return ['Waiting to send', "Sending is paused, so this waits until it's turned back on. You can still stop it."];
  }
  if (status === 'scheduled' && practice) {
    return ['Practice run soon', "We'll fill in the form to check it, but nothing will be sent. Then you send it yourself."];
  }
  if (status === 'ready_to_send' && blocked) {
    return ['Ready to send', "Your documents are ready. Sending is paused, so if you approve it, it waits until it's turned back on."];
  }
  if (status === 'ready_to_send' && practice) {
    return ['Ready to send', "Your documents are ready. Practice mode is on, so we'll fill in the form to check it, but nothing will be sent."];
  }
  return APP_STATUS[status] || [status, ''];
}

/** What to say after she presses Send (or Send now). */
export function sentMessage(sending) {
  if (sending && sending.blocked) return "Approved. It will be sent once sending is turned back on.";
  if (sending && sending.practice) return "Got it. We'll do a practice run shortly. Nothing will be sent.";
  return "Sending now. You'll see it under Sent shortly.";
}

export const STATUS_BADGE = {
  needs_you: 'badge-needs', ready_to_send: 'badge-needs', manual: 'badge-needs', failed: 'badge-needs',
  submitted: 'badge-ok', scheduled: 'badge-info', submitting: 'badge-info', preparing: 'badge-info',
  vetoed: 'badge-muted', skipped: 'badge-muted', withdrawn: 'badge-muted',
};
export const OUTCOME_LABELS = {
  interview: 'Interview', offer: 'Offer', rejected: 'Not selected', no_response: 'No response', withdrawn: 'Withdrawn',
};
export const PAY_STATUS = {
  meets_floor: 'Pay meets your minimum',
  explicit_intern_pay: 'Paid (stipend or wage listed)',
  trusted_unlisted: 'Pay not listed (employer known to pay well)',
  unlisted: 'Pay not listed',
  below_floor: 'Below your minimum',
  unknown: 'Pay unknown',
};
export const MESSAGES = {
  applied: "Got it. We're preparing this application.",
  skipped: "Skipped. You won't see this job again.",
  saved: 'Saved for later.',
  vetoed: 'Stopped. Nothing will be sent for this job.',
  sent: "Sending now. You'll see it under Sent shortly.",
  approved: 'Approved.',
  change_requested: "Got it. We're rewriting it now. Check back in a few minutes.",
  answered: 'Answer saved.',
  prefs_saved: 'Your preferences are saved.',
  profile_saved: 'Your résumé facts are saved.',
  writing_saved: 'Your writing preferences are saved.',
  sample_added: 'Writing sample added. Future letters will learn from it.',
  marked_sent: 'Marked as sent. Good luck!',
  outcome_saved: 'Outcome saved.',
  onboarded: 'All set! You can change any of this later.',
  answers_saved: 'Your saved answers are updated.',
  edited: 'Your edit is saved.',
  withdrawn: 'Withdrawn.',
  restarted: "Got it. We're preparing this application again.",
};

/** "<her first name>'s Job Search" (just "Job Search" until the name is known). The name comes from the database. */
export function brandName(ownerName) {
  const name = (ownerName || '').trim();
  return name ? `${name}'s Job Search` : 'Job Search';
}

export function money(amount, currency) {
  if (amount === null || amount === undefined) return '';
  const symbol = { USD: '$', GBP: '£', EUR: '€' }[currency || 'USD'] ?? `${currency} `;
  const digits = amount < 1000 && amount % 1 !== 0 ? 2 : 0;
  return symbol + Number(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function payText(job) {
  if (job.pay_min == null && job.pay_max == null) return PAY_STATUS[job.pay_status] || 'Pay not listed';
  const period = { year: 'a year', hour: 'an hour', month: 'a month', week: 'a week', day: 'a day', lump: 'total' }[job.pay_period] || '';
  const lo = money(job.pay_min, job.pay_currency);
  const hi = money(job.pay_max, job.pay_currency);
  const range = lo === hi || !hi ? lo || hi : `${lo} to ${hi}`;
  return `${range} ${period}`.trim();
}

/** "2026-11-12" -> a local date (no timezone shift). */
export function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

export function niceDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export function niceDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function relative(value) {
  if (!value) return '';
  const secs = (new Date(value).getTime() - Date.now()) / 1000;
  const future = secs > 0;
  const a = Math.abs(secs);
  let text;
  if (a < 90) text = 'a minute';
  else if (a < 3600) text = `${Math.floor(a / 60)} minutes`;
  else if (a < 172800) { const h = Math.floor(a / 3600); text = `${h} hour${h === 1 ? '' : 's'}`; }
  else text = `${Math.floor(a / 86400)} days`;
  return future ? `in ${text}` : `${text} ago`;
}

export function daysLeft(value) {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function deadlineNote(value) {
  const d = daysLeft(value);
  if (d === null || d > 3 || d < 0) return '';
  return d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} left`;
}

export function scoreWords(score) {
  if (score === null || score === undefined) return 'Not scored yet';
  if (score >= 85) return `Excellent match (${score}/100)`;
  if (score >= 75) return `Strong match (${score}/100)`;
  if (score >= 60) return `Good match (${score}/100)`;
  if (score >= 55) return `Possible match (${score}/100)`;
  return `Weak match (${score}/100)`;
}

// On a job card the level is only the kind of role. Whether it's paid comes from the posting and is shown with the pay.
const JOB_LEVELS = { intern: 'Internship', fellow: 'Fellowship' };
export const levelLabel = (level) => JOB_LEVELS[level] || LEVEL_LABELS[level] || level || '';
export const metroLabel = (metro) => METRO_LABELS[metro] || metro || '';
export function focusLabel(tag) {
  if (!tag) return '';
  return tag.startsWith('custom:') ? tag.slice(7) : FOCUS_LABELS[tag] || tag;
}

/** Unpaid jobs and jobs below her pay minimum can't be applied to here (the database enforces this too). */
export function payLocked(job) {
  return (job.filter_reasons || []).some((r) => /^(unpaid|pay below|internship\/fellowship without)/i.test(r));
}

// ---------------------------------------------------------------- reasons in plain words

const MONEY = { USD: '$', GBP: '£' };
const amountIn = (currency, amount) => (MONEY[currency] ? `${MONEY[currency]}${amount}` : `${amount}${currency ? ` ${currency}` : ''}`);

const withStop = (text) => (/[.!?]["”’]?$/.test(text) ? text : `${text}.`);

/** Capital first letter and a full stop, for text that arrives as a fragment. */
export function sentence(text) {
  const t = String(text || '').trim();
  return t ? withStop(t[0].toUpperCase() + t.slice(1)) : '';
}

/*
 * The filters and the router store short internal reasons, and the database matches some of them (unpaid, pay below),
 * so they're stored as they are and only reworded here. Each pattern gives the plain sentence she reads and a topic:
 * two ways of saying the same thing (the filter's reason and the router's summary of it) show once, the first one.
 */
const REASONS = [
  [/^employer (['"])(.+)\1 is on her blocked list$/i, (m) => `${m[2]} is on your list of employers to never apply to.`, 'blocked'],
  [/^application deadline passed/i, () => 'The application deadline has passed.', 'deadline'],
  [/^(role type outside her target|role type isn't one she's looking for)/i,
    () => "It isn't one of the kinds of roles you're looking for.", 'role'],
  [/^(no focus-area match|not in her focus areas)/i, () => "It doesn't match your focus areas.", 'focus'],
  [/^director-level or above/i, () => "It's director level or above, more senior than the roles you chose.", 'level'],
  [/^job level .* is not one of her chosen levels$/i, () => "It's a level of role you didn't choose in Preferences.", 'level'],
  [/^unpaid: title indicates a volunteer role/i, () => "The job title says it's a volunteer role.", 'unpaid'],
  [/^unpaid:/i, () => "The posting says it's unpaid.", 'unpaid'],
  [/^internship\/fellowship without explicitly stated pay/i,
    () => "It's an internship or fellowship that doesn't say it's paid.", 'unpaid'],
  [/^possible unpaid signal \((['"])(.+)\1\)$/i, (m) => `The posting mentions “${m[2]},” so check that it's paid.`, 'pay-signal'],
  [/^pay below her minimum \(\s*(?:([A-Z]{3})\s+)?([\d,.]+)\/yr vs ([\d,.]+)\)$/,
    (m) => `The highest listed pay is ${amountIn(m[1], m[2])} a year. Your minimum is ${amountIn(m[1], m[3])}.`, 'pay-low'],
  [/^pay below her minimum/i, () => 'The listed pay is below your minimum.', 'pay-low'],
  [/^pay listed in ([A-Z]{3})/, (m) => `Pay is listed in ${m[1]}. Check it against your minimum.`, 'pay-check'],
  [/^pay amount found but period unclear/i,
    () => "Pay is listed, but it doesn't say whether that's per year, month, or hour.", 'pay-check'],
  [/^pay not listed \(employer known to pay well\)/i, () => "Pay isn't listed, but this employer is known to pay well.", 'pay-check'],
  [/^pay not listed$/i, () => "The posting doesn't list pay.", 'pay-check'],
  [/^pay needs your judgment/i, () => 'Check the pay before you decide.', 'pay-check'],
  [/^bottom of the pay range is below her minimum/i, () => 'The bottom of the pay range is below your minimum.', 'pay-range'],
  [/^location outside her targets/i, () => "It's outside the places you chose.", 'place'],
  [/^(.+) is not one of her chosen locations$/i, (m) => `${m[1]} isn't one of the places you chose.`, 'place'],
  [/^other US cities are turned off/i, () => 'Other US cities are turned off in your Preferences.', 'place'],
  [/^lower-priority location/i, () => "It's in another US city, which is lower priority for you.", 'place'],
  [/^(.+) is outside the US and UK, so you decide/i,
    (m) => `${m[1]} is outside the US and UK, so you decide. You may need permission to work there.`, 'abroad'],
  [/^UK role that does not offer visa sponsorship/i, () => "It's in the UK and doesn't offer visa sponsorship.", 'uk'],
  [/^UK employer is not a licensed visa sponsor/i, () => "It's in the UK, and the employer isn't a licensed visa sponsor.", 'uk'],
  [/^UK role: needs visa sponsorship/i, () => "It's in the UK and needs visa sponsorship, so you decide.", 'uk'],
  [/^UK role/i, () => "It's in the UK, so you'd need visa sponsorship.", 'uk'],
  [/^requires US citizenship \(/i, () => 'It requires US citizenship. You can confirm yours in Preferences.', 'citizen'],
  [/^requires US citizenship/i, () => 'It requires US citizenship.', 'citizen'],
  [/^requires a security clearance/i, () => 'It requires a security clearance.', 'clearance'],
  [/^senior role/i, () => "It's a senior role, so it would be a stretch.", 'stretch'],
  [/^matches a job title you added \("(.+)"\)/i, (m) => `It matches a job title you added (“${m[1]}”), so you decide.`, 'custom-role'],
  [/^duplicate of job #/i, () => "It's a copy of another posting for the same job.", 'duplicate'],
  [/^fit score (\d+) is below/i, (m) => `It's a weak match for you (${m[1]} out of 100).`, 'score'],
  [/^low fit score$/i, () => "It's a weak match for you.", 'score'],
  [/^a good match, but not strong enough/i, () => 'A good match, but not strong enough to send without your OK.', 'score'],
  [/^strong match on a supported application site/i, () => 'A strong match on a site we can fill in for you.', 'score'],
  [/^this employer's application site needs you/i, () => "You'd apply on this employer's site yourself.", 'site'],
  [/^found on a job board/i, () => "We found it on a job board, not the employer's own site.", 'board'],
  [/^possible dealbreaker: (.+)$/i, (m) => `Possible dealbreaker: ${withStop(m[1].trim())}`, 'dealbreaker'],
  [/^you paused automatic applying/i, () => 'You paused automatic applying, so it comes to you first.', 'sending'],
  [/^automatic applying is turned off/i, () => 'Automatic sending is off right now, so it comes to you first.', 'sending'],
  [/^already applied to (\d+)\+ roles at (.+) in the last 30 days/i,
    (m) => `You've applied to ${m[1]} or more roles at ${m[2]} in the last 30 days.`, 'cap'],
  [/^mission-aligned employer/i, () => "The employer's mission matches your focus areas.", 'mission'],
  [/^part-time$/i, () => "It's part-time.", 'hours'],
  [/^(contract|temporary)$/i, (m) => `It's a ${m[1].toLowerCase()} role.`, 'term'],
];

/** One stored reason as a plain sentence to her, and its topic. Anything unknown (like the scorer's notes) is kept. */
export function plainReason(raw) {
  const text = String(raw || '').trim();
  for (const [pattern, say, topic] of REASONS) {
    const m = text.match(pattern);
    if (m) return { text: say(m), topic };
  }
  return { text: sentence(text), topic: `text:${text.toLowerCase().replace(/[\s.!?]+$/, '')}` };
}

/** Reasons in plain words, one per topic (the first, most specific one wins), without blanks. */
export function plainReasons(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((raw) => {
    const { text, topic } = plainReason(raw);
    if (!text || seen.has(topic)) return;
    seen.add(topic);
    out.push(text);
  });
  return out;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

/** Download names like "<her name> - Resume.pdf" (the name comes from her résumé facts after sign-in). */
export function docFileName(name, kind, ext, uk = false) {
  const label = kind === 'cover_letter' ? 'Cover Letter' : uk ? 'CV' : 'Resume';
  return `${(name || 'Applicant').replace(/[\\/:*?"<>|]+/g, ' ').trim()} - ${label}.${ext}`;
}
