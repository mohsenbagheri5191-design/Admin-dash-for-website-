/**
 * ═══════════════════════════════════════════════════════════════
 * ADMINISTRATION
 * ═══════════════════════════════════════════════════════════════
 *
 * Everything the extension's admin panel can do: list users, create one, set
 * or reset a password, set quota and access expiry, disable or re-enable,
 * delete, read usage, flip the global kill switch, and read the audit trail.
 *
 * Authorisation is not in this file. Every call goes to admin-users or
 * admin-usage, both of which re-read the caller's role from the database on
 * every request. Hiding the nav link and gating the route are conveniences;
 * a non-admin who types the URL or crafts a fetch by hand gets a 403 with
 * code `not_admin` from the server, and the guard in shell.js renders that
 * as a locked page.
 */

import { admin } from '../api.js';
import { mountDashboard, handleViewError } from '../shell.js';
import {
  $, esc, icon, num, pct, dateOnly, dateTime, relativeTime, skeletonRows, skeletonKpis,
  stateBlock, toast, openModal, confirmDialog, generatePassword, downloadCsv, debounce
} from '../ui.js';
import { line, barsH, destroyAllCharts } from '../charts.js';

const state = {
  session: null,
  users: [],
  settings: null,
  usage: null,
  filter: '',
  statusFilter: 'all',
  usageDays: 30
};

/* ─── Users ─────────────────────────────────────────────────────── */

const STATUS_TONE = { active: 'is-success', disabled: 'is-danger', expired: 'is-warning' };

function visibleUsers() {
  const needle = state.filter.trim().toLowerCase();
  return state.users.filter((u) => {
    const status = u.effective_status || u.status;
    if (state.statusFilter !== 'all' && status !== state.statusFilter) return false;
    if (!needle) return true;
    return `${u.email} ${u.full_name ?? ''} ${u.notes ?? ''}`.toLowerCase().includes(needle);
  });
}

function userRow(user) {
  const status = user.effective_status || user.status;
  const used = Number(user.month_usage) || 0;
  const limit = Number(user.monthly_request_quota) || 0;
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const isSelf = user.id === state.session.profile.id;

  return `<tr data-user="${esc(user.id)}">
    <td>
      <div><b>${esc(user.full_name || user.email)}</b>${isSelf ? ' <span class="badge is-accent">You</span>' : ''}</div>
      <div class="cell-mono" style="color:var(--muted-text);font-size:11px">${esc(user.email)}</div>
    </td>
    <td><span class="badge ${user.role === 'admin' ? 'is-accent' : ''}">${esc(user.role)}</span></td>
    <td><span class="badge ${STATUS_TONE[status] || ''}">${esc(status)}</span></td>
    <td class="is-num">
      <div>${num(used)} / ${num(limit)}</div>
      <div class="quota-track" style="margin-top:5px">
        <div class="quota-fill ${ratio >= 1 ? 'is-danger' : ratio >= 0.85 ? 'is-warning' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></div>
      </div>
    </td>
    <td>${user.access_expires_at ? esc(dateOnly(user.access_expires_at)) : 'No expiry'}</td>
    <td>${esc(relativeTime(user.last_active_at))}</td>
    <td class="is-actions">
      <div class="row-actions">
        <button type="button" class="btn-sm btn-icon" data-act="edit" title="Edit ${esc(user.email)}" aria-label="Edit ${esc(user.email)}">${icon('edit', 14)}</button>
        <button type="button" class="btn-sm btn-icon" data-act="password" title="Set a new password" aria-label="Set a new password for ${esc(user.email)}">${icon('key', 14)}</button>
        <button type="button" class="btn-sm btn-icon ${status === 'disabled' ? '' : 'is-danger'}"
                data-act="toggle" ${isSelf ? 'disabled' : ''}
                title="${status === 'disabled' ? 'Re-enable' : 'Disable'} ${esc(user.email)}"
                aria-label="${status === 'disabled' ? 'Re-enable' : 'Disable'} ${esc(user.email)}">${icon('power', 14)}</button>
        <button type="button" class="btn-sm btn-icon is-danger" data-act="delete" ${isSelf ? 'disabled' : ''}
                title="Delete ${esc(user.email)}" aria-label="Delete ${esc(user.email)}">${icon('trash', 14)}</button>
      </div>
    </td>
  </tr>`;
}

function renderUserTable() {
  const rows = visibleUsers();
  const host = $('#userTable');
  const count = $('#userCount');
  if (count) count.textContent = `${num(rows.length)} of ${num(state.users.length)}`;

  host.innerHTML = rows.length
    ? `<table class="data-table">
        <caption class="sr-only">User accounts</caption>
        <thead><tr>
          <th scope="col">Account</th>
          <th scope="col">Role</th>
          <th scope="col">Status</th>
          <th scope="col" class="is-num">Quota</th>
          <th scope="col">Expires</th>
          <th scope="col">Active</th>
          <th scope="col" class="is-actions"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>${rows.map(userRow).join('')}</tbody>
      </table>`
    : stateBlock({ title: 'No accounts match', text: 'Adjust the search or the status filter.' });

  host.querySelectorAll('[data-act]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.closest('[data-user]').dataset.user;
      const user = state.users.find((u) => u.id === id);
      if (!user) return;
      const act = button.dataset.act;
      if (act === 'edit') editUser(user);
      if (act === 'password') resetPassword(user);
      if (act === 'toggle') toggleUser(user);
      if (act === 'delete') deleteUser(user);
    });
  });
}

/* ─── User actions ──────────────────────────────────────────────── */

function userFormBody(user, { withPassword }) {
  const expiry = user?.access_expires_at ? String(user.access_expires_at).slice(0, 10) : '';
  return `
    <div class="form-group">
      <label class="form-label" for="fEmail">Email</label>
      <input class="form-input" id="fEmail" type="email" required autocomplete="off"
             value="${esc(user?.email || '')}" ${user ? 'disabled' : ''}>
      ${user ? '<p class="form-hint">The sign-in email cannot be changed. Delete and re-create to move an account.</p>' : ''}
    </div>

    <div class="form-group">
      <label class="form-label" for="fName">Full name</label>
      <input class="form-input" id="fName" type="text" autocomplete="off" value="${esc(user?.full_name || '')}">
    </div>

    ${withPassword ? `
    <div class="form-group">
      <label class="form-label" for="fPassword">Temporary password</label>
      <div class="field-with-action">
        <input class="form-input" id="fPassword" type="text" required minlength="12"
               value="${esc(generatePassword())}" autocomplete="off" spellcheck="false">
        <button type="button" class="field-action" id="fRegen" aria-label="Generate a new password">${icon('refresh', 16)}</button>
      </div>
      <p class="form-hint">At least 12 characters. Copy it now — hand it to the user directly; there is no invite email.</p>
    </div>` : ''}

    <div class="form-group">
      <label class="form-label" for="fRole">Role</label>
      <select class="form-select" id="fRole">
        <option value="user" ${user?.role !== 'admin' ? 'selected' : ''}>Member — dashboards only</option>
        <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrator — dashboards plus this page</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" for="fQuota">Monthly request quota</label>
      <input class="form-input" id="fQuota" type="number" min="0" max="1000000" step="50"
             value="${user ? Number(user.monthly_request_quota) : Number(state.settings?.default_monthly_quota ?? 1000)}">
      <p class="form-hint">Billable API calls per UTC calendar month. 0 blocks the account entirely.</p>
    </div>

    <div class="form-group">
      <label class="form-label" for="fExpiry">Access expires</label>
      <input class="form-input" id="fExpiry" type="date" value="${esc(expiry)}">
      <p class="form-hint">Leave blank for no expiry. Enforced live on every request.</p>
    </div>

    <div class="form-group">
      <label class="form-label" for="fNotes">Notes</label>
      <textarea class="form-textarea" id="fNotes" rows="2">${esc(user?.notes || '')}</textarea>
    </div>

    <div class="alert" id="fError" hidden>${icon('alert', 16)}<span></span></div>`;
}

function readUserForm(root, { withPassword }) {
  return {
    email: $('#fEmail', root).value.trim(),
    fullName: $('#fName', root).value.trim() || null,
    password: withPassword ? $('#fPassword', root).value : undefined,
    role: $('#fRole', root).value,
    quota: Number($('#fQuota', root).value),
    accessExpiresAt: $('#fExpiry', root).value ? new Date(`${$('#fExpiry', root).value}T23:59:59Z`).toISOString() : null,
    notes: $('#fNotes', root).value.trim() || null
  };
}

function showFormError(root, message) {
  const box = $('#fError', root);
  box.hidden = false;
  box.className = 'alert alert-error';
  $('span', box).textContent = message;
}

async function createUser() {
  const created = await openModal({
    title: 'Invite an account',
    note: 'There is no public signup. Accounts exist only because an administrator creates them here.',
    body: userFormBody(null, { withPassword: true }),
    footer: `<button type="button" class="btn-sm" data-act="cancel">Cancel</button>
             <button type="button" class="btn-sm is-solid" data-act="save">Create account</button>`,
    onMount(root, close) {
      $('#fRegen', root).addEventListener('click', () => {
        $('#fPassword', root).value = generatePassword();
      });
      $('[data-act="cancel"]', root).addEventListener('click', () => close(null));
      $('[data-act="save"]', root).addEventListener('click', async () => {
        const button = $('[data-act="save"]', root);
        const input = readUserForm(root, { withPassword: true });

        if (!input.email) return showFormError(root, 'An email address is required.');
        if (input.password.length < 12) return showFormError(root, 'The password must be at least 12 characters.');

        button.disabled = true;
        button.textContent = 'Creating…';
        try {
          await admin.createUser(input);
          close({ email: input.email, password: input.password });
        } catch (err) {
          button.disabled = false;
          button.textContent = 'Create account';
          showFormError(root, err.message || 'That account could not be created.');
        }
      });
    }
  });

  if (!created) return;
  toast(`Created ${created.email}. Give them the password now — it is not stored anywhere readable.`, 'success', 9000);
  await refreshUsers();
}

async function editUser(user) {
  const saved = await openModal({
    title: 'Edit account',
    note: user.email,
    body: userFormBody(user, { withPassword: false }),
    footer: `<button type="button" class="btn-sm" data-act="cancel">Cancel</button>
             <button type="button" class="btn-sm is-solid" data-act="save">Save changes</button>`,
    onMount(root, close) {
      $('[data-act="cancel"]', root).addEventListener('click', () => close(false));
      $('[data-act="save"]', root).addEventListener('click', async () => {
        const button = $('[data-act="save"]', root);
        const input = readUserForm(root, { withPassword: false });

        button.disabled = true;
        button.textContent = 'Saving…';
        try {
          await admin.updateUser(user.id, {
            fullName: input.fullName,
            role: input.role,
            quota: input.quota,
            accessExpiresAt: input.accessExpiresAt,
            notes: input.notes
          });
          close(true);
        } catch (err) {
          button.disabled = false;
          button.textContent = 'Save changes';
          showFormError(root, err.message || 'Those changes could not be saved.');
        }
      });
    }
  });

  if (!saved) return;
  toast('Account updated.', 'success');
  await refreshUsers();
}

async function resetPassword(user) {
  const done = await openModal({
    title: 'Set a new password',
    note: `${user.email} — they will be signed out of the website and the extension the next time their token refreshes.`,
    body: `
      <div class="form-group">
        <label class="form-label" for="pwNew">New password</label>
        <div class="field-with-action">
          <input class="form-input" id="pwNew" type="text" value="${esc(generatePassword())}" minlength="12" spellcheck="false" autocomplete="off">
          <button type="button" class="field-action" id="pwRegen" aria-label="Generate a new password">${icon('refresh', 16)}</button>
        </div>
        <p class="form-hint">At least 12 characters. Copy it before you save.</p>
      </div>
      <div class="alert" id="fError" hidden>${icon('alert', 16)}<span></span></div>`,
    footer: `<button type="button" class="btn-sm" data-act="cancel">Cancel</button>
             <button type="button" class="btn-sm is-solid" data-act="save">Set password</button>`,
    onMount(root, close) {
      $('#pwRegen', root).addEventListener('click', () => {
        $('#pwNew', root).value = generatePassword();
      });
      $('[data-act="cancel"]', root).addEventListener('click', () => close(null));
      $('[data-act="save"]', root).addEventListener('click', async () => {
        const button = $('[data-act="save"]', root);
        const password = $('#pwNew', root).value;
        if (password.length < 12) return showFormError(root, 'The password must be at least 12 characters.');

        button.disabled = true;
        button.textContent = 'Saving…';
        try {
          await admin.resetPassword(user.id, password);
          close(password);
        } catch (err) {
          button.disabled = false;
          button.textContent = 'Set password';
          showFormError(root, err.message || 'The password could not be set.');
        }
      });
    }
  });

  if (done) toast(`Password set for ${user.email}. Hand it over now.`, 'success', 9000);
}

async function toggleUser(user) {
  const status = user.effective_status || user.status;
  const disabling = status !== 'disabled';

  const ok = await confirmDialog({
    title: disabling ? `Disable ${user.email}?` : `Re-enable ${user.email}?`,
    note: disabling
      ? 'Their very next request from the website or the extension fails — access is re-read on every call, so there is no wait for a token to expire.'
      : 'They regain access immediately, with their existing password.',
    confirmLabel: disabling ? 'Disable access' : 'Re-enable',
    danger: disabling
  });
  if (!ok) return;

  try {
    await admin.setEnabled(user.id, !disabling);
    toast(disabling ? 'Access disabled.' : 'Access restored.', 'success');
    await refreshUsers();
  } catch (err) {
    toast(err.message || 'That did not work.', 'error');
  }
}

async function deleteUser(user) {
  const ok = await confirmDialog({
    title: `Delete ${user.email}?`,
    note: 'The account, its profile and its usage history are removed permanently. The audit trail keeps a record of the deletion. This cannot be undone.',
    confirmLabel: 'Delete permanently',
    danger: true
  });
  if (!ok) return;

  try {
    await admin.deleteUser(user.id);
    toast('Account deleted.', 'success');
    await refreshUsers();
  } catch (err) {
    toast(err.message || 'That account could not be deleted.', 'error');
  }
}

/* ─── Kill switch & settings ────────────────────────────────────── */

function settingsPanel() {
  const s = state.settings || {};
  const on = Boolean(s.kill_switch);

  return `<section class="panel">
    <div class="panel-head"><div class="grow">
      <h2 class="panel-title">Platform controls</h2>
      <p class="panel-note">Applies to every caller at once — the website and the extension both.</p>
    </div></div>

    <div class="stack">
      <div class="admin-switch ${on ? 'is-armed' : ''}" id="killSwitchRow">
        <div class="switch-copy">
          <h3>${icon('power', 15)} Global kill switch</h3>
          <p>${on
            ? 'ON — every research call is refused with a 503 and the maintenance message below. Administration stays reachable so you can turn it back off.'
            : 'OFF — the platform is serving requests normally.'}</p>
        </div>
        <button type="button" class="switch" id="killSwitch" role="switch"
                aria-checked="${on}" aria-label="Global kill switch"></button>
      </div>

      <div class="form-group" style="margin:0">
        <label class="form-label" for="killMessage">Maintenance message</label>
        <textarea class="form-textarea" id="killMessage" rows="2">${esc(s.kill_switch_message || '')}</textarea>
        <p class="form-hint">Shown to every user while the switch is on.</p>
      </div>

      <div class="form-group" style="margin:0">
        <label class="form-label" for="defaultQuota">Default monthly quota for new accounts</label>
        <input class="form-input" id="defaultQuota" type="number" min="0" max="1000000" step="50"
               value="${Number(s.default_monthly_quota ?? 1000)}">
      </div>

      <div class="row">
        <button type="button" class="btn-sm is-solid" id="saveSettings">${icon('check', 14)} Save settings</button>
        <span class="count-note">${s.updated_at ? `Last changed ${esc(dateTime(s.updated_at))}` : ''}</span>
      </div>

      <div class="alert">
        ${icon('info', 16)}
        <div>
          <strong>CORS allowlist</strong>
          Origins permitted to call the API: <span class="cell-mono">${esc(s.allowed_origins || '(none set)')}</span>.
          This site's origin must appear here or every request is refused with <span class="cell-mono">origin_not_allowed</span>.
          It is changed with SQL or in the Supabase dashboard — see DASHBOARD.md.
        </div>
      </div>
    </div>
  </section>`;
}

function wireSettings() {
  const toggle = $('#killSwitch');

  toggle.addEventListener('click', async () => {
    const turningOn = toggle.getAttribute('aria-checked') !== 'true';

    if (turningOn) {
      const ok = await confirmDialog({
        title: 'Turn the kill switch on?',
        note: 'Every research call from every account — website and extension — starts failing immediately. Administration stays available so you can turn it back off.',
        confirmLabel: 'Turn it on',
        danger: true
      });
      if (!ok) return;
    }

    try {
      await admin.updateSettings({ killSwitch: turningOn });
      toast(turningOn ? 'Kill switch ON — the platform is closed.' : 'Kill switch OFF — the platform is open.', turningOn ? 'error' : 'success');
      await refreshSettings();
    } catch (err) {
      toast(err.message || 'The kill switch did not change.', 'error');
    }
  });

  $('#saveSettings').addEventListener('click', async () => {
    const button = $('#saveSettings');
    button.disabled = true;
    try {
      await admin.updateSettings({
        killSwitchMessage: $('#killMessage').value.trim(),
        defaultQuota: Number($('#defaultQuota').value)
      });
      toast('Settings saved.', 'success');
      await refreshSettings();
    } catch (err) {
      toast(err.message || 'Those settings could not be saved.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}

/* ─── Usage ─────────────────────────────────────────────────────── */

function usagePanel() {
  const summary = state.usage?.summary;
  if (!summary) return '';

  const t = summary.totals || {};
  const tiles = [
    { icon: 'activity', label: 'Total Calls', value: num(t.total_calls), sub: `Last ${state.usageDays} days` },
    { icon: 'bank', label: 'Billable Calls', value: num(t.billable_calls), sub: 'Counted against quota' },
    { icon: 'users', label: 'Active Accounts', value: num(t.active_users), sub: 'Made at least one call' },
    { icon: 'box', label: 'Items Processed', value: num(t.total_items), sub: 'Listings scored' },
    { icon: 'clock', label: 'Avg. Duration', value: `${num(t.avg_duration_ms)} ms`, sub: 'Server time per call' },
    { icon: 'alert', label: 'Failed Calls', value: num(t.failed_calls), sub: t.total_calls ? `${pct((Number(t.failed_calls) / Number(t.total_calls)) * 100)} of traffic` : 'No traffic yet' }
  ];

  return `
    <div class="kpi-grid">${tiles.map((x) => `
      <article class="kpi">
        <p class="kpi-label">${icon(x.icon, 13, 1.8)}${esc(x.label)}</p>
        <p class="kpi-value">${x.value}</p>
        <p class="kpi-sub">${esc(x.sub)}</p>
      </article>`).join('')}</div>

    <div class="chart-grid">
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Calls per day</h2>
          <p class="panel-note">Every request, billable or not.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartUsageDay" role="img" aria-label="Line chart of API calls per day"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Calls by endpoint</h2>
          <p class="panel-note">Which parts of the API are carrying the load.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartUsageEndpoint" role="img" aria-label="Bar chart of calls by endpoint"></canvas></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div class="grow">
          <h2 class="panel-title">Usage by account</h2>
          <p class="panel-note">Who is using the platform over the selected window.</p>
        </div>
        <div class="panel-actions">
          <button type="button" class="btn-sm" id="exportUsage">${icon('download', 14)} Export CSV</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <caption class="sr-only">Usage by account</caption>
          <thead><tr>
            <th scope="col">Account</th>
            <th scope="col" class="is-num">Calls</th>
            <th scope="col" class="is-num">Billable</th>
            <th scope="col">Last call</th>
          </tr></thead>
          <tbody>${(summary.perUser || []).map((u) => `
            <tr>
              <td><b>${esc(u.fullName || u.email)}</b>
                  <div class="cell-mono" style="color:var(--muted-text);font-size:11px">${esc(u.email)}</div></td>
              <td class="is-num">${num(u.calls)}</td>
              <td class="is-num">${num(u.billable)}</td>
              <td>${esc(relativeTime(u.lastCall))}</td>
            </tr>`).join('') || '<tr><td colspan="4">No calls in this window.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

function drawUsageCharts() {
  const summary = state.usage?.summary;
  if (!summary) return;

  const perDay = summary.perDay || [];
  line('chartUsageDay', {
    labels: perDay.map((d) => String(d.day).slice(5)),
    values: perDay.map((d) => Number(d.calls) || 0),
    yTitle: 'Calls'
  });

  const perEndpoint = summary.perEndpoint || [];
  barsH('chartUsageEndpoint', {
    labels: perEndpoint.map((e) => e.endpoint),
    values: perEndpoint.map((e) => Number(e.calls) || 0),
    axisTitle: 'Calls'
  });
}

/* ─── Audit ─────────────────────────────────────────────────────── */

async function showAudit() {
  await openModal({
    title: 'Audit trail',
    note: 'Every administrative action, newest first. Entries survive account deletion.',
    body: `<div id="auditBody">${skeletonRows(6)}</div>`,
    footer: '<button type="button" class="btn-sm is-solid" data-act="close">Close</button>',
    async onMount(root, close) {
      $('[data-act="close"]', root).addEventListener('click', () => close(null));
      try {
        const { entries } = await admin.auditLog(150);
        $('#auditBody', root).innerHTML = entries.length
          ? `<div class="table-scroll"><table class="data-table" style="min-width:480px">
              <thead><tr>
                <th scope="col">When</th><th scope="col">Action</th>
                <th scope="col">Actor</th><th scope="col">Target</th>
              </tr></thead>
              <tbody>${entries.map((e) => `
                <tr>
                  <td style="white-space:nowrap">${esc(dateTime(e.created_at))}</td>
                  <td><span class="badge">${esc(e.action)}</span></td>
                  <td>${esc(e.actor_email || '—')}</td>
                  <td>${esc(e.target_email || '—')}</td>
                </tr>`).join('')}</tbody></table></div>`
          : stateBlock({ title: 'Nothing recorded yet', text: 'Administrative actions will appear here as they happen.' });
      } catch (err) {
        $('#auditBody', root).innerHTML = stateBlock({ tone: 'error', title: 'Could not load the trail', text: err.message || 'Try again shortly.' });
      }
    }
  });
}

/* ─── Data loading ──────────────────────────────────────────────── */

async function refreshUsers() {
  const { users } = await admin.listUsers();
  state.users = users || [];
  renderUserTable();
}

async function refreshSettings() {
  const { settings } = await admin.getSettings();
  state.settings = settings;
  $('#settingsRoot').innerHTML = settingsPanel();
  wireSettings();
}

async function refreshUsage() {
  destroyAllCharts();
  $('#usageRoot').innerHTML = skeletonKpis(6);
  state.usage = await admin.usage(state.usageDays, 0);
  $('#usageRoot').innerHTML = usagePanel();
  drawUsageCharts();

  const exportButton = $('#exportUsage');
  if (exportButton) {
    exportButton.addEventListener('click', () =>
      downloadCsv(
        `northleaf-usage-${state.usageDays}d.csv`,
        ['Email', 'Full name', 'Calls', 'Billable', 'Last call'],
        (state.usage.summary.perUser || []).map((u) => [u.email, u.fullName ?? '', u.calls, u.billable, u.lastCall])
      ));
  }
}

/* ─── Render ────────────────────────────────────────────────────── */

function shell() {
  return `
    <section class="panel">
      <div class="panel-head">
        <div class="grow">
          <h2 class="panel-title">Accounts</h2>
          <p class="panel-note">
            Invite-only. One account works on both the website and the Chrome
            extension, and disabling it here closes both on the next request.
          </p>
        </div>
        <div class="panel-actions">
          <button type="button" class="btn-sm" id="viewAudit">${icon('file', 14)} Audit trail</button>
          <button type="button" class="btn-sm is-solid" id="newUser">${icon('plus', 14)} Invite account</button>
        </div>
      </div>

      <div class="filter-bar">
        <label class="sr-only" for="userSearch">Search accounts</label>
        <input type="search" class="form-input" id="userSearch" placeholder="Search email, name or notes">
        <label class="sr-only" for="statusFilter">Filter by status</label>
        <select class="form-select" id="statusFilter">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="expired">Expired</option>
        </select>
        <span class="count-note" id="userCount"></span>
      </div>

      <div class="table-scroll"><div id="userTable">${skeletonRows(5)}</div></div>
    </section>

    <div id="settingsRoot"></div>

    <section class="panel">
      <div class="panel-head">
        <div class="grow">
          <h2 class="panel-title">Usage</h2>
          <p class="panel-note">Aggregated by the admin_usage_summary function, server-side.</p>
        </div>
        <div class="panel-actions">
          <div class="seg" role="group" aria-label="Usage window">
            ${[7, 30, 90].map((d) => `
              <button type="button" data-days="${d}" aria-pressed="${d === state.usageDays}">${d} days</button>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <div id="usageRoot"></div>`;
}

/* ─── Boot ──────────────────────────────────────────────────────── */

export async function boot() {
  const session = await mountDashboard({ active: 'admin', requireAdmin: true });
  state.session = session;

  const root = $('#viewRoot');
  root.innerHTML = shell();

  $('#newUser').addEventListener('click', createUser);
  $('#viewAudit').addEventListener('click', showAudit);

  $('#userSearch').addEventListener('input', debounce((event) => {
    state.filter = event.target.value;
    renderUserTable();
  }, 200));

  $('#statusFilter').addEventListener('change', (event) => {
    state.statusFilter = event.target.value;
    renderUserTable();
  });

  document.querySelectorAll('[data-days]').forEach((button) => {
    button.addEventListener('click', () => {
      state.usageDays = Number(button.dataset.days);
      document.querySelectorAll('[data-days]').forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.days) === state.usageDays)));
      refreshUsage().catch((err) => handleViewError(err, $('#usageRoot')));
    });
  });

  try {
    // Settings first: the create-user form reads default_monthly_quota from it.
    await refreshSettings();
    await refreshUsers();
    await refreshUsage();
  } catch (err) {
    handleViewError(err, root, () => window.location.reload());
  }
}
