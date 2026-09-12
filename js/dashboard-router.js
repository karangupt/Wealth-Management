/* Workspace App — router + Dashboard rendering */

let currentView = 'dashboard';
let editingContext = null; // { moduleKey, id }
let cachedUsdInrRate = null; // set once user clicks "Convert to ₹" on the dashboard
let selectedRows = {}; // { [moduleKey]: Set<rowId> } — checkbox multi-select. Reorder needs exactly 1 checked; bulk delete works with 1+.

/* ---------- Router ---------- */
function navigateTo(view) {
  currentView = view;
  // Remembered per-tab so a mobile browser silently reloading a backgrounded
  // tab (common on Android Chrome to save memory) can resume on whatever
  // page the person was actually looking at, instead of always bouncing
  // them back to the Dashboard — see showApp() in boot.js.
  try { sessionStorage.setItem('workspace_last_view', view); } catch (e) {}
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#viewTitle').textContent = (MODULES[view] && MODULES[view].title)
    || (CUSTOM_VIEWS[view] && CUSTOM_VIEWS[view].title)
    || (PLACEHOLDER_VIEWS[view] && PLACEHOLDER_VIEWS[view].title)
    || (view === 'dashboard' ? 'Dashboard' : view);
  render();
  closeSidebarOnMobile();
}

function render() {
  const root = $('#viewRoot');
  try {
    if (currentView === 'dashboard') { root.innerHTML = renderDashboard(); wireDashboard(); return; }
    if (MODULES[currentView]) { root.innerHTML = renderModuleView(MODULES[currentView], currentView); wireModuleView(currentView); return; }
    if (CUSTOM_VIEWS[currentView]) {
      root.innerHTML = CUSTOM_VIEWS[currentView].render();
      if (CUSTOM_VIEWS[currentView].wire) CUSTOM_VIEWS[currentView].wire();
      return;
    }
    if (PLACEHOLDER_VIEWS[currentView]) { root.innerHTML = renderPlaceholder(PLACEHOLDER_VIEWS[currentView]); return; }
    root.innerHTML = renderPlaceholder({ title: currentView, note: 'This module is on the roadmap.' });
  } catch (err) {
    console.error('Render error for view', currentView, err);
    root.innerHTML = `<div class="empty-state"><div class="glyph"><i data-lucide="alert-triangle"></i></div>Something went wrong loading this view.<br><span style="font-size:11px;">${err.message}</span></div>`;
  } finally {
    // Views are rebuilt via innerHTML every navigation, so any <i data-lucide="...">
    // placeholders need to be (re)converted to inline SVGs each time.
    if (window.lucide) lucide.createIcons();
  }
}

function renderPlaceholder(cfg) {
  return `
  <div class="placeholder-view">
    <h3>${cfg.title}</h3>
    <p>${cfg.note}</p>
  </div>`;
}

/* ---------- Dashboard ---------- */
function monthLabel(monthKey) {
  const d = new Date(monthKey + '-01T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function buildMonthlyTrend() {
  // Quotations are estimates, not sales — excluded from revenue everywhere.
  const incomeSources = [...Store.all('invoices').filter(i => i.docType !== 'Quotation'), ...Store.all('otherIncome')];
  const expenseSources = [...Store.all('expenses')];
  const map = {};
  incomeSources.forEach(e => {
    if (!e.date) return;
    const mk = e.date.slice(0, 7);
    map[mk] = map[mk] || { income: 0, expense: 0 };
    map[mk].income += Number(e.amount || 0);
  });
  expenseSources.forEach(e => {
    if (!e.date) return;
    const mk = e.date.slice(0, 7);
    map[mk] = map[mk] || { income: 0, expense: 0 };
    map[mk].expense += Number(e.amount || 0);
  });
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
}

function renderMonthlyTrend() {
  const rows = buildMonthlyTrend();
  if (!rows.length) return `<div class="empty-state"><div class="glyph"><i data-lucide="wallet"></i></div>No dated income/expense entries yet.</div>`;
  const maxVal = Math.max(1, ...rows.map(([, v]) => Math.max(v.income, v.expense)));
  return `
  <div style="display:flex; flex-direction:column; gap:14px;">
    ${rows.map(([mk, v]) => `
      <div>
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:5px;">
          <span style="font-family:var(--font-disp); color:var(--text); font-weight:600;">${monthLabel(mk)}</span>
          <span>Income ${fmt(v.income)} · Expense ${fmt(v.expense)} · Net <span style="color:${v.income-v.expense>=0?'var(--teal)':'var(--danger)'}">${fmt(v.income-v.expense)}</span></span>
        </div>
        <div style="height:8px; background:var(--panel-2); border-radius:4px; overflow:hidden; margin-bottom:3px;">
          <div style="height:100%; width:${(v.income/maxVal*100).toFixed(1)}%; background:var(--teal);"></div>
        </div>
        <div style="height:8px; background:var(--panel-2); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${(v.expense/maxVal*100).toFixed(1)}%; background:var(--danger);"></div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function wireDashboard() {
  $('#convertUsdBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await convertUsdToInr();
  });
}

async function convertUsdToInr() {
  let rate = null;
  if (SheetsAPI.isConfigured()) {
    const fx = await SheetsAPI.fetchFxRate('USD', 'INR');
    if (fx && fx.ok) rate = fx.rate;
  }
  if (!rate) {
    const manual = prompt('Enter the current USD to INR rate (e.g. 83.5):', cachedUsdInrRate || '');
    if (!manual || isNaN(parseFloat(manual))) return;
    rate = parseFloat(manual);
  }
  cachedUsdInrRate = rate;
  render();
}

function renderDashboard() {
  const bookings = Store.all('bookings');
  // Quotations are estimates, not confirmed sales — excluded from revenue
  // and from the "unpaid invoices" count below.
  const invoices = Store.all('invoices').filter(i => i.docType !== 'Quotation');
  const pendingQuotations = Store.all('invoices').filter(i => i.docType === 'Quotation').length;
  const expenses = Store.all('expenses');
  const equipment = Store.all('equipment');
  const bankAccounts = Store.all('bankAccounts');
  const fdrd = Store.all('fdrd');
  const creditCards = Store.all('creditCards');
  const otherIncome = Store.all('otherIncome');

  // Running month only — not a mix of past/future dated entries.
  const currentMonthKey = todayStr().slice(0, 7);
  const inMonth = d => (d || '').slice(0, 7) === currentMonthKey;

  const monthRevenue = invoices.filter(i => inMonth(i.date)).reduce((s,i) => s + Number(i.amount||0), 0)
    + otherIncome.filter(o => inMonth(o.date)).reduce((s,o) => s + Number(o.amount||0), 0);
  const monthExpense = expenses.filter(e => inMonth(e.date)).reduce((s,e) => s + Number(e.amount||0), 0);
  const monthNet = monthRevenue - monthExpense;

  const activeBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid').length;
  const availableUnits = equipment.reduce((s,e) => s + Number(e.available||0), 0);

  const recentBookings = [...bookings].slice(-5).reverse();

  // Bank balance — Savings + Current only. Sukanya is long-term/locked so it's
  // shown separately and NOT counted as "available" spendable balance.
  // Available Balance excludes any account type in LOCKED_ACCOUNT_TYPES
  // (Sukanya Samriddhi, Minor Account, etc.) — those are long-term /
  // not meant to be withdrawn day-to-day.
  const availableBalance = bankAccounts
    .filter(a => !LOCKED_ACCOUNT_TYPES.includes(a.accType))
    .reduce((s, a) => s + Number(a.balance || 0), 0);
  const lockedTotal = bankAccounts
    .filter(a => LOCKED_ACCOUNT_TYPES.includes(a.accType))
    .reduce((s, a) => s + Number(a.balance || 0), 0);
  const fdTotal = fdrd.filter(f => f.type === 'FD').reduce((s, f) => s + Number(f.principal || 0), 0);
  const rdTotal = fdrd.filter(f => f.type === 'RD').reduce((s, f) => s + Number(f.principal || 0), 0);
  const creditCardDue = creditCards.reduce((s, c) => s + Number(c.dueAmount || 0), 0);
  const investments = Store.all('investments');
  const indiaInvestTotal = investments.filter(i => i.type !== 'US Stock').reduce((s, i) => s + Number(i.current || 0), 0);
  const usInvestTotal = investments.filter(i => i.type === 'US Stock').reduce((s, i) => s + Number(i.current || 0), 0);
  const totalInvestmentValueInr = fdTotal + rdTotal + indiaInvestTotal + (cachedUsdInrRate ? Math.round(usInvestTotal * cachedUsdInrRate) : 0);
  const nearestCardDue = creditCards
    .filter(c => c.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  return `
  <div class="section-head"><h2>${monthLabel(currentMonthKey)} — this month</h2></div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-label">Income This Month</div><div class="kpi-value">${fmt(monthRevenue)}</div><div class="kpi-sub">Business + Other Income</div></div>
    <div class="kpi"><div class="kpi-label">Expenses This Month</div><div class="kpi-value">${fmt(monthExpense)}</div><div class="kpi-sub">Business + Personal</div></div>
    <div class="kpi"><div class="kpi-label">Net This Month</div><div class="kpi-value" style="color:${monthNet>=0?'var(--teal)':'var(--danger)'}">${fmt(monthNet)}</div></div>
    <div class="kpi"><div class="kpi-label">Active Bookings</div><div class="kpi-value">${activeBookings}</div><div class="kpi-sub">${unpaidInvoices} unpaid invoice(s)${pendingQuotations ? ' · ' + pendingQuotations + ' quotation(s) pending' : ''}</div></div>
    <div class="kpi"><div class="kpi-label">Equipment Available</div><div class="kpi-value">${availableUnits}</div><div class="kpi-sub">across ${equipment.length} item types</div></div>
  </div>

  <div class="section-head"><h2>Finance snapshot</h2></div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-label">Available Balance</div><div class="kpi-value">${fmt(availableBalance)}</div><div class="kpi-sub">Savings + Current only</div></div>
    <div class="kpi"><div class="kpi-label">FD Total</div><div class="kpi-value">${fmt(fdTotal)}</div><div class="kpi-sub">${fdrd.filter(f=>f.type==='FD').length} fixed deposit(s)</div></div>
    <div class="kpi"><div class="kpi-label">RD Total</div><div class="kpi-value">${fmt(rdTotal)}</div><div class="kpi-sub">${fdrd.filter(f=>f.type==='RD').length} recurring deposit(s)</div></div>
    <div class="kpi"><div class="kpi-label">India Investments</div><div class="kpi-value">${fmt(indiaInvestTotal)}</div><div class="kpi-sub">Mutual Funds, Indian Stocks, Gold, etc.</div></div>
    <div class="kpi">
      <div class="kpi-label">US Stock Investments</div>
      <div class="kpi-value">$${usInvestTotal.toLocaleString('en-IN')}</div>
      ${cachedUsdInrRate
        ? `<div class="kpi-sub">≈ ${fmt(Math.round(usInvestTotal * cachedUsdInrRate))} @ ₹${cachedUsdInrRate}/$ &nbsp;<a href="#" id="convertUsdBtn" style="color:var(--amber);">refresh rate</a></div>`
        : `<div class="kpi-sub"><a href="#" id="convertUsdBtn" style="color:var(--amber);">Convert to ₹ →</a></div>`}
    </div>
    <div class="kpi" style="border-left-color:var(--teal);">
      <div class="kpi-label">Total Investment Value</div>
      <div class="kpi-value" style="color:var(--teal);">${fmt(totalInvestmentValueInr)}</div>
      <div class="kpi-sub">${cachedUsdInrRate ? 'FD + RD + India + US, all combined' : 'Excludes US stocks — click Convert above'}</div>
    </div>
    <div class="kpi"><div class="kpi-label">Not Available to Use (Sukanya, Minor, Spouse)</div><div class="kpi-value" style="color:var(--muted);">${fmt(lockedTotal)}</div><div class="kpi-sub">Tracked for visibility, not spendable by you</div></div>
    <div class="kpi" style="border-left-color:${creditCardDue > 0 ? 'var(--danger)' : 'var(--amber)'};">
      <div class="kpi-label">Credit Card Due</div>
      <div class="kpi-value" style="color:${creditCardDue > 0 ? 'var(--danger)' : 'inherit'}">${fmt(creditCardDue)}</div>
      <div class="kpi-sub">${nearestCardDue ? 'Next due: ' + fmtDate(nearestCardDue.dueDate) : 'No dues logged'}</div>
    </div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Monthly trend</h2></div>
    ${renderMonthlyTrend()}
    <p style="color:var(--muted); font-size:11.5px; margin-top:14px;"><span style="color:var(--teal);">■</span> Income &nbsp; <span style="color:var(--danger);">■</span> Expense — across every month you have dated entries for, past or future.</p>
  </div>

  <div class="card">
    <div class="section-head"><h2>Recent bookings</h2><button class="btn secondary" onclick="navigateTo('bookingPayments')">View all</button></div>
    ${recentBookings.length ? `
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Item</th><th>Company</th><th>Dates</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
        ${recentBookings.map(b => {
          // Same fallback rule used on the Bookings page itself: a manually
          // typed company name wins, otherwise fall back to the linked
          // Customer record's company name.
          const c = Store.get('customers', b.customerId);
          const companyName = b.companyName || (c && c.companyName) || '—';
          return `<tr>
          <td class="name-cell">${b.item}</td>
          <td>${companyName}</td>
          <td>${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}</td>
          <td>${fmt(b.amount)}</td>
          <td>${tagFor(b.status)}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table></div>` : `<div class="empty-state"><div class="glyph"><i data-lucide="calendar-check"></i></div>No bookings yet.</div>`}
  </div>`;
}
