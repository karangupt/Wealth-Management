/* Workspace App — boot sequence: chrome, login, Sheets sync, app startup */

/* ---------- Chrome: nav, sidebar, modal close, date chip ---------- */
function closeSidebarOnMobile() {
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('show');
}

// Guards against initChrome() ever running twice in the same page load. On
// some mobile browsers (Chrome/Android especially), a backgrounded tab can
// get silently reloaded/resumed by the OS to save memory; if that resume
// path re-ran this function, every listener below — most noticeably the
// hamburger button — would end up bound TWICE. A single tap would then fire
// the toggle twice in a row (open, then immediately closed again), which
// looks exactly like "the button stopped responding".
let chromeInitialized = false;
function initChrome() {
  if (chromeInitialized) return;
  chromeInitialized = true;
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));
  $('#hamburger').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    $('#backdrop').classList.toggle('show');
  });
  $('#backdrop').addEventListener('click', closeSidebarOnMobile);
  $('#modalClose').addEventListener('click', closeModal);
  $('#todayChip').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

async function showApp() {
  if (SheetsAPI.isConfigured()) {
    const sub = document.querySelector('#loginScreen .login-card .login-sub, #loginScreen p');
    if (sub) sub.textContent = 'Syncing your data from Google Sheets...';
    await pullFromSheetsIntoStore();
  }
  if (typeof SupabaseSync !== 'undefined') {
    await pullFromSupabaseIntoStore();
  }
  await applyRoleBasedNav();

  $('#loginScreen').style.display = 'none';
  $('#appRoot').style.display = '';
  initChrome();
  checkSyncStatus();
  navigateTo(getRestoreView());
}

// Picks up wherever the person actually was (Invoices, Bookings, etc.)
// instead of always resetting to Dashboard — needed because mobile browsers
// (Chrome/Android in particular) can silently reload a backgrounded tab to
// save memory, which re-runs this whole boot sequence as if it were a fresh
// login. Falls back to 'dashboard' if nothing was saved yet, or if the saved
// view no longer exists (e.g. after a role/module change).
function getRestoreView() {
  let saved = null;
  try { saved = sessionStorage.getItem('workspace_last_view'); } catch (e) {}
  if (saved && (saved === 'dashboard' || MODULES[saved] || CUSTOM_VIEWS[saved] || PLACEHOLDER_VIEWS[saved])) {
    return saved;
  }
  return 'dashboard';
}

// Hides sidebar sections the current role has no access to (the actual
// data access is already enforced by Supabase RLS — this just keeps
// people from seeing menu items that would only ever show empty anyway).
async function applyRoleBasedNav() {
  if (typeof SupaAuth === 'undefined') return;
  try {
    const profile = await SupaAuth.getProfile();
    const role = profile ? profile.role : 'owner'; // fail-open to owner if profile lookup fails, so no one gets locked out of their own sidebar by a glitch
    $$('.nav-group').forEach(group => {
      const allowed = (group.dataset.roles || '').split(',').map(s => s.trim());
      group.style.display = allowed.includes(role) ? '' : 'none';
    });
  } catch (e) {
    console.error('Could not apply role-based nav, showing everything', e);
  }
}

// Defense-in-depth against Google Sheets auto-converting date-like text into
// real Date cells: if a value comes back as an ISO timestamp (e.g. from a
// backend that hasn't been redeployed with the fix yet), trim it back to
// a plain YYYY-MM-DD so date filtering/grouping across the app keeps working.
function sanitizeIsoDates(record) {
  const clean = { ...record };
  Object.keys(clean).forEach(k => {
    const v = clean[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      // This is a UTC timestamp that started life as a plain date (e.g.
      // "2026-07-14") which Sheets auto-converted into a Date cell at IST
      // midnight. Naively slicing the UTC string shifts the date by a day
      // — convert back to the IST calendar date properly instead.
      try {
        const d = new Date(v);
        clean[k] = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA -> YYYY-MM-DD
      } catch (e) {
        clean[k] = v.slice(0, 10); // fallback, better than nothing
      }
    }
  });
  return clean;
}

async function pullFromSheetsIntoStore() {
  const result = await SheetsAPI.pullAll();
  if (result && result.ok && result.data) {
    try {
      // Only overwrite collections that actually came back from the Sheet,
      // so anything not yet pushed anywhere stays untouched locally.
      const current = JSON.parse(Store.exportJSON());
      Object.keys(result.data).forEach(col => {
        if (Array.isArray(result.data[col])) {
          current[col] = result.data[col].map(sanitizeIsoDates);
        }
      });
      Store.importJSON(JSON.stringify(current));
    } catch (e) {
      console.error('Could not merge Sheets data into local store', e);
    }
  }
}

// Supabase is now the authoritative source for every collection this
// logged-in user is allowed to see (RBAC/RLS decides that server-side).
// We overwrite EVERY known collection — including with an empty array
// when the user has no access or there's genuinely no data — otherwise
// a collection the user can't see would keep showing whatever demo/seed
// data this fresh browser started with, instead of correctly showing empty.
async function pullFromSupabaseIntoStore() {
  const result = await SupabaseSync.pullAll();
  if (result && result.ok && result.data) {
    try {
      const current = JSON.parse(Store.exportJSON());
      const allCollections = [...new Set(Object.values(MODULES).map(m => m.collection))];
      allCollections.forEach(col => {
        current[col] = Array.isArray(result.data[col]) ? result.data[col] : [];
      });
      Store.importJSON(JSON.stringify(current));
    } catch (e) {
      console.error('Could not merge Supabase data into local store', e);
    }
  }
}

function initLogin() {
  const logoEl = document.getElementById('loginLogo');
  if (logoEl && typeof LOGO_IMG_WHITE !== 'undefined') logoEl.src = LOGO_IMG_WHITE;
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen && typeof LOGIN_BG_IMG !== 'undefined') {
    loginScreen.style.backgroundImage =
      `linear-gradient(rgba(15,20,23,.72), rgba(15,20,23,.72)), url('${LOGIN_BG_IMG}')`;
  }
  wireLoginForm();
}

function wireLoginForm() {
  const form = $('#loginForm');
  const errorBox = $('#loginError');
  const btn = $('#loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Checking...';
    const email = $('#loginEmail').value.trim();
    const pw = $('#loginPassword').value;
    try {
      const result = await SupaAuth.login(email, pw);
      if (result.ok) {
        await showApp();
      } else {
        errorBox.textContent = result.error || 'Incorrect email or password.';
        $('#loginPassword').value = '';
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    } catch (err) {
      errorBox.textContent = 'Could not sign in. Check your connection.';
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}

function showBootError(err) {
  console.error('Workspace boot error:', err);
  const screen = document.getElementById('loginScreen');
  if (screen) {
    screen.style.display = 'flex';
    screen.innerHTML = `
      <div class="login-card">
        <div class="login-tag">Projector Solutions</div>
        <h2>Something didn't load</h2>
        <p class="login-sub">
          The app hit an error while starting up. This usually means one of the
          js/ files is missing or out of date on this deployment.<br><br>
          Open the browser console (F12 → Console tab) for details, and check
          that all files in <code>js/</code> (store.js, supabase-client.js,
          supabase-auth.js, sheets-api.js, helpers.js, modules-data.js,
          module-table.js, dashboard-router.js, reports.js,
          invoice-generator.js, settings.js, views-custom.js, modal.js,
          boot.js) are all
          present and up to date in the repo.
        </p>
        <p class="login-error" style="margin:0;">${(err && err.message) ? err.message : String(err)}</p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initLogin();
    document.getElementById('logoutBtn')?.addEventListener('click', () => SupaAuth.logout());
    const session = await SupaAuth.getSession();
    if (session) {
      await showApp();
    }
    // else: login screen stays visible until submitted
  } catch (err) {
    showBootError(err);
  }
});
