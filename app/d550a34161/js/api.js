// Talking to Supabase: sign-in, reading data (row-level security decides what each person sees), calling the
// database's dashboard functions (the only way anything changes), and private files through short-lived links.
const cfg = window.JAS_CONFIG || {};
export const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
export const BUCKET = 'jas';

// "Keep me signed in" decides where the session lives: this browser (localStorage) or just this tab.
const REMEMBER = 'jas.remember';
export const remembering = () => localStorage.getItem(REMEMBER) !== '0';
export function setRemember(on) { localStorage.setItem(REMEMBER, on ? '1' : '0'); }
const sessionStore = () => (remembering() ? localStorage : sessionStorage);
const authStorage = {
  getItem: (key) => sessionStore().getItem(key),
  setItem: (key, value) => sessionStore().setItem(key, value),
  removeItem: (key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); },
};

export const sb = configured
  ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: {
      storage: authStorage, storageKey: 'jas-auth', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  : null;

export class UserError extends Error {}

const NETWORK = "Couldn't reach the server. Check your internet connection and try again.";

export function friendly(error) {
  if (!error) return 'Something went wrong. Please try again.';
  if (error instanceof UserError) return error.message;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  if (code === 'P0001' && msg) return msg; // the database's own plain-language messages
  if (code === '42501') return "You're not allowed to do that. Try signing out and signing in again.";
  if (code.startsWith('PGRST3') || /jwt|token/i.test(msg)) return 'Your sign-in has expired. Please sign in again.';
  if (error.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request/i.test(msg)) return NETWORK;
  return 'Something went wrong. Please try again, and tell Shihab if it keeps happening.';
}

/** Call a dashboard function in the database. Throws a UserError with a message that's safe to show. */
export async function rpc(name, args = {}) {
  let result;
  try {
    result = await sb.rpc(name, args);
  } catch (e) {
    throw new UserError(friendly(e));
  }
  if (result.error) throw new UserError(friendly(result.error));
  return result.data;
}

/** Run a read query (a supabase-js query builder) and return its rows. */
export async function rows(query) {
  let result;
  try {
    result = await query;
  } catch (e) {
    throw new UserError(friendly(e));
  }
  if (result.error) throw new UserError(friendly(result.error));
  return result.data;
}

/** Like rows(), plus the total count (use .select(..., { count: 'exact' })). */
export async function counted(query) {
  let result;
  try {
    result = await query;
  } catch (e) {
    throw new UserError(friendly(e));
  }
  if (result.error) throw new UserError(friendly(result.error));
  return { data: result.data, count: result.count ?? 0 };
}

// ---------------------------------------------------------------- sign-in

/** Ask for a 6-digit code. Says nothing about whether the address has an account. */
export async function sendCode(email) {
  let error;
  try {
    ({ error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
  } catch (e) {
    throw new UserError(NETWORK);
  }
  if (!error) return;
  const text = `${error.code || ''} ${error.message || ''}`;
  if (error.status === 429 || /rate.?limit/i.test(text)) {
    throw new UserError('Too many codes were asked for. Please wait a few minutes, then try again.');
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) throw new UserError(NETWORK);
  // Any other answer (for example "this address can't sign in") looks the same as success on purpose.
}

export async function verifyCode(email, code) {
  let result;
  try {
    result = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  } catch (e) {
    throw new UserError(NETWORK);
  }
  if (result.error) {
    if (result.error.status === 429) throw new UserError('Too many tries. Please wait a few minutes, then ask for a new code.');
    throw new UserError("That code didn't work. It may have expired. Check the newest email, or ask for a new code.");
  }
  return result.data.session;
}

export async function verifyLink(tokenHash) {
  let result;
  try {
    result = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  } catch (e) {
    throw new UserError(NETWORK);
  }
  if (result.error) throw new UserError('That sign-in link has expired or was already used. Please ask for a code instead.');
  return result.data.session;
}

export async function signOut() {
  try {
    await sb.auth.signOut({ scope: 'local' });
  } finally {
    authStorage.removeItem('jas-auth');
  }
}

// ---------------------------------------------------------------- links and files

/** Only plain web links are ever put in an href (no javascript:, data:, or other schemes). */
export function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch (e) {
    return null;
  }
}

/** A short-lived link to a private file (only people allowed to see it can get one). */
export async function fileUrl(path, download) {
  if (!path) return null;
  let result;
  try {
    result = await sb.storage.from(BUCKET).createSignedUrl(path, 600, download ? { download } : undefined);
  } catch (e) {
    throw new UserError(NETWORK);
  }
  if (result.error) throw new UserError("That file couldn't be opened. Please try again.");
  return safeUrl(result.data.signedUrl);
}

const SAMPLE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

/** Upload one of her writing samples (PDF, Word, or text). The file is read into text in the background. */
export async function uploadSample(file, title) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!SAMPLE_TYPES[ext]) throw new UserError('Please choose a PDF, a Word (.docx) file, or a text (.txt) file.');
  if (file.size > 15 * 1024 * 1024) throw new UserError('That file is too big (15 MB at most).');
  const base = file.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 ._()-]+/g, '_').trim().slice(0, 100) || 'sample';
  const path = `voice-uploads/${crypto.randomUUID()}/${base}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());
  let result;
  try {
    result = await sb.storage.from(BUCKET).upload(path, body, { contentType: SAMPLE_TYPES[ext], upsert: false });
  } catch (e) {
    throw new UserError(NETWORK);
  }
  if (result.error) throw new UserError("The file couldn't be uploaded. Please try again.");
  return rpc('voice_upload_register', { p_path: path, p_title: title || '' });
}
