/**
 * Login page behaviour.
 *
 * Three jobs: send someone already signed in straight through, sign someone
 * in, and say something useful when it does not work.
 */

import { signIn, getSession, fetchMe, signOut, describeError, ApiError, isConfigured } from './api.js';
import { safeNext, DASHBOARD_HOME } from './shell.js';
import { $ } from './ui.js';

const form = $('#loginForm');
const emailInput = $('#email');
const passwordInput = $('#password');
const submit = $('#loginSubmit');
const submitText = $('#loginSubmitText');
const errorBox = $('#loginError');
const errorTitle = $('#loginErrorTitle');
const errorText = $('#loginErrorText');
const noticeBox = $('#loginNotice');
const noticeText = $('#loginNoticeText');

const params = new URLSearchParams(window.location.search);
const next = safeNext(params.get('next'));

/* ─── Messaging ─────────────────────────────────────────────────── */

function showError(title, message) {
  noticeBox.hidden = true;
  errorTitle.textContent = title;
  errorText.textContent = message;
  errorBox.hidden = false;
  // Move focus so a screen reader announces the failure rather than leaving
  // the user waiting on a form that silently did nothing.
  errorBox.setAttribute('tabindex', '-1');
  errorBox.focus({ preventScroll: false });
}

function showNotice(message) {
  errorBox.hidden = true;
  noticeText.textContent = message;
  noticeBox.hidden = false;
}

function clearMessages() {
  errorBox.hidden = true;
  noticeBox.hidden = true;
}

/** Why the guard sent them here, if it did. */
const REASONS = {
  expired: 'Your session expired, so we signed you out. Sign in again to pick up where you left off.',
  'signed-out': 'Please sign in to reach that page.'
};

const reason = params.get('reason');
if (reason && REASONS[reason]) showNotice(REASONS[reason]);

if (!isConfigured) {
  showError('Not configured', 'This build has no Supabase URL or key. See DASHBOARD.md for the environment variables to set.');
  submit.disabled = true;
}

/* ─── Already signed in? ────────────────────────────────────────── */

(async function redirectIfSignedIn() {
  if (!isConfigured) return;
  try {
    const session = await getSession();
    if (!session) return;

    // A session alone is not access: the account may have been disabled or
    // expired since the token was issued. Ask the server before redirecting,
    // so a locked-out user lands on a clear message instead of bouncing
    // between the dashboard and this page.
    await fetchMe();
    window.location.replace(next || DASHBOARD_HOME);
  } catch (err) {
    if (err instanceof ApiError && err.isAuthFailure) {
      await signOut();
      return;
    }
    if (err instanceof ApiError && err.isAccessFailure) {
      const { title, message } = describeError(err);
      showError(title, message);
    }
  }
})();

/* ─── Password reveal ───────────────────────────────────────────── */

const EYE = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
const EYE_OFF = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

$('#togglePassword').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!showing));
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  $('svg', button).innerHTML = showing ? EYE : EYE_OFF;
  passwordInput.focus();
});

/* ─── Submit ────────────────────────────────────────────────────── */

let busy = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !isConfigured) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  clearMessages();

  if (!email || !password) {
    showError('Missing details', 'Enter both your email address and your password.');
    (email ? passwordInput : emailInput).focus();
    return;
  }

  busy = true;
  submit.disabled = true;
  submitText.textContent = 'Signing in…';

  try {
    await signIn(email, password);

    // Signing in is not the same as having access. `me` is the gate: it
    // decides whether this account may actually use the platform right now,
    // and returns the specific reason when it may not.
    submitText.textContent = 'Checking access…';
    await fetchMe();

    window.location.replace(next || DASHBOARD_HOME);
  } catch (err) {
    const { title, message } = describeError(err);

    // Authenticated but locked out: end the half-session so a reload does not
    // land them in a redirect loop.
    if (err instanceof ApiError && err.isAccessFailure) await signOut();

    showError(title, message);
    passwordInput.value = '';
    busy = false;
    submit.disabled = false;
    submitText.textContent = 'Sign in';
  }
});
