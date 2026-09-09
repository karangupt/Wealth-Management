/* Workspace App — generic module table view (list/columns/sort/tabs) shared by every module */

/* ---------- Generic module table view ---------- */
const moduleSearchQuery = {}; // { [moduleKey]: string } — live search box text, per module
const COLUMN_PREFS_KEY = 'workspace_column_prefs_v1';
const COLUMN_WIDTH_KEY = 'workspace_column_width_v1';
migrateLegacyKey('kraa_column_prefs_v1', COLUMN_PREFS_KEY);
migrateLegacyKey('kraa_column_width_v1', COLUMN_WIDTH_KEY);
function getColumnWidth(moduleKey, field) {
  try { return JSON.parse(localStorage.getItem(COLUMN_WIDTH_KEY) || '{}')[moduleKey]?.[field] || null; }
  catch (e) { return null; }
}
function setColumnWidth(moduleKey, field, widthPx) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_WIDTH_KEY) || '{}');
    all[moduleKey] = all[moduleKey] || {};
    all[moduleKey][field] = widthPx;
    localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(all));
  } catch (e) {}
}

function getColumnPrefs(moduleKey) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_PREFS_KEY) || '{}');
    return all[moduleKey] || {};
  } catch (e) { return {}; }
}

function isColumnVisible(moduleKey, field) {
  const prefs = getColumnPrefs(moduleKey);
  return prefs[field] !== false; // visible by default unless explicitly hidden
}

function setColumnVisible(moduleKey, field, visible) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_PREFS_KEY) || '{}');
    all[moduleKey] = all[moduleKey] || {};
    all[moduleKey][field] = visible;
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(all));
  } catch (e) { console.error('Could not save column preference', e); }
}

function sumAll(rows, field = 'amount') {
  return rows.reduce((s, r) => s + Number(r[field] || 0), 0);
}
function sumThisMonth(rows, field = 'amount', dateField = 'date') {
  const mk = todayStr().slice(0, 7);
  return rows.filter(r => (r[dateField] || '').startsWith(mk)).reduce((s, r) => s + Number(r[field] || 0), 0);
}

const MODULE_SUMMARIES = {
  // Expenses has its own This Month / This Year / All Time picker (via
  // dateFilterField) — these three respect whatever period is selected there,
  // and Corporate/Personal are always shown side-by-side regardless of which
  // type-tab is active, so "look at Corporate separately" doesn't require
  // clicking anything.
  expense: [
    { label: 'Total Expenses', compute: rows => fmt(sumAll(rows)) },
    { label: 'Corporate', compute: rows => fmt(rows.filter(r => (r.expenseType || 'Corporate') === 'Corporate').reduce((s, r) => s + Number(r.amount || 0), 0)) },
    { label: 'Personal', compute: rows => fmt(rows.filter(r => r.expenseType === 'Personal').reduce((s, r) => s + Number(r.amount || 0), 0)) }
  ],
  otherIncome: [
    { label: 'Total Income', compute: rows => fmt(sumAll(rows)) }
  ],
  booking: [
    { label: 'Active Bookings', compute: rows => rows.filter(r => r.status === 'confirmed' || r.status === 'pending').length },
    { label: 'Total Booking Value (Completed)', compute: rows => fmt(rows.filter(r => r.status === 'completed').reduce((s,r) => s + Number(r.amount||0), 0)) }
  ],
  invoice: [
    // Quotations are estimates, not sales — excluded from both of these.
    { label: 'Total Invoiced', compute: rows => fmt(rows.filter(r => r.docType !== 'Quotation').reduce((s, r) => s + Number(r.amount || 0), 0)) },
    { label: 'Unpaid Count', compute: rows => rows.filter(r => r.docType !== 'Quotation' && r.status !== 'paid').length },
    { label: 'Quotations Pending', compute: rows => rows.filter(r => r.docType === 'Quotation').length }
  ],
  payments: [
    { label: 'Total Received', compute: rows => fmt(sumAll(rows)) }
  ],
  bank: [
    { label: 'Total Balance (All Accounts)', compute: rows => fmt(sumAll(rows, 'balance')) }
  ],
  fdrd: [
    { label: 'Total FD', compute: rows => fmt(rows.filter(r => r.type === 'FD').reduce((s, r) => s + Number(r.principal || 0), 0)) },
    { label: 'Total RD', compute: rows => fmt(rows.filter(r => r.type === 'RD').reduce((s, r) => s + Number(r.principal || 0), 0)) }
  ],
  creditcards: [
    { label: 'Total Due (All Cards)', compute: rows => fmt(sumAll(rows, 'dueAmount')) },
    { label: 'Total Reward Points', compute: rows => sumAll(rows, 'rewardPoints').toLocaleString('en-IN') }
  ],
  insurance: [
    { label: 'Total Sum Assured', compute: rows => fmt(sumAll(rows, 'sumAssured')) },
    { label: 'Policies', compute: rows => rows.length }
  ],
  assets: [
    { label: 'Total Assets', compute: rows => fmt(rows.filter(r => !(r.type || '').startsWith('Liability')).reduce((s, r) => s + Number(r.value || 0), 0)) },
    { label: 'Total Liabilities', compute: rows => fmt(rows.filter(r => (r.type || '').startsWith('Liability')).reduce((s, r) => s + Number(r.value || 0), 0)) }
  ],
  giftcards: [
    { label: 'Total Balance', compute: rows => fmt(sumAll(rows, 'balance')) }
  ],
  investments: [
    { label: 'India Total', compute: rows => fmt(rows.filter(r => r.type !== 'US Stock').reduce((s, r) => s + Number(r.current || 0), 0)) },
    { label: 'US Stock Total', compute: rows => '$' + rows.filter(r => r.type === 'US Stock').reduce((s, r) => s + Number(r.current || 0), 0).toLocaleString('en-IN') }
  ]
};

// Modules that also get a month-by-month breakdown bar chart above the table.
const MODULE_MONTHLY_BREAKDOWN = ['expense'];

function renderMiniMonthlyBreakdown(rows) {
  const map = {};
  rows.forEach(r => {
    if (!r.date) return;
    const mk = r.date.slice(0, 7);
    map[mk] = (map[mk] || 0) + Number(r.amount || 0);
  });
  const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return '';
  const maxVal = Math.max(1, ...entries.map(([, v]) => v));
  return `
  <div class="card">
    <div class="section-head"><h2>Monthly breakdown</h2></div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${entries.map(([mk, v]) => `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:4px;">
            <span style="font-family:var(--font-disp); color:var(--text); font-weight:600;">${monthLabel(mk)}</span>
            <span>${fmt(v)}</span>
          </div>
          <div style="height:8px; background:var(--panel-2); border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${(v/maxVal*100).toFixed(1)}%; background:var(--amber);"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

// Per-module "hide certain statuses" preference (e.g. hide Completed/Cancelled bookings)
const STATUS_TAB_KEY = 'workspace_status_tab_v1';
migrateLegacyKey('kraa_status_tab_v1', STATUS_TAB_KEY);
function getSelectedTab(moduleKey) {
  try { return JSON.parse(localStorage.getItem(STATUS_TAB_KEY) || '{}')[moduleKey] || 'all'; }
  catch (e) { return 'all'; }
}
function setSelectedTab(moduleKey, tab) {
  try {
    const all = JSON.parse(localStorage.getItem(STATUS_TAB_KEY) || '{}');
    all[moduleKey] = tab;
    localStorage.setItem(STATUS_TAB_KEY, JSON.stringify(all));
  } catch (e) {}
}

// Same idea as the status-tab pair above, but generic on whichever field a
// module's `typeTabs` config points at (e.g. Expenses uses 'expenseType' to
// give a Corporate/Personal "look at this one separately" view).
const TYPE_TAB_KEY = 'workspace_type_tab_v1';
function getSelectedTypeTab(moduleKey) {
  try { return JSON.parse(localStorage.getItem(TYPE_TAB_KEY) || '{}')[moduleKey] || 'all'; }
  catch (e) { return 'all'; }
}
function setSelectedTypeTab(moduleKey, tab) {
  try {
    const all = JSON.parse(localStorage.getItem(TYPE_TAB_KEY) || '{}');
    all[moduleKey] = tab;
    localStorage.setItem(TYPE_TAB_KEY, JSON.stringify(all));
  } catch (e) {}
}

// Per-module date-period filter (This Month / This Year / All Time) — only
// active for modules whose MODULES config sets a `dateFilterField` (e.g.
// Bookings uses 'startDate'). Defaults to "All Time" — these are reference
// lists (Bookings, Invoices, Payments, Expenses...), so opening the page
// should show everything by default, same as before this filter existed.
// Switching to Monthly/This Year is opt-in, not the default. (Reports is a
// separate page with its own period state, and intentionally still
// defaults to the current month — that one really is a "this period"
// summary rather than a full record list.)
// Not persisted to localStorage on purpose: like the search box, it resets
// to "All Time" on reload.
const modulePeriodState = {}; // { [key]: { mode: 'month'|'year'|'all', month: 'YYYY-MM', year: 'YYYY' } }
function getModulePeriod(key) {
  if (!modulePeriodState[key]) {
    modulePeriodState[key] = { mode: 'all', month: todayStr().slice(0, 7), year: todayStr().slice(0, 4) };
  }
  return modulePeriodState[key];
}
function moduleInPeriod(dateStr, period) {
  if (!dateStr) return false;
  if (period.mode === 'all') return true;
  if (period.mode === 'year') return dateStr.startsWith(period.year);
  return dateStr.slice(0, 7) === period.month;
}
function moduleAllYears(cfg, period) {
  const years = [...new Set(Store.all(cfg.collection).map(r => (r[cfg.dateFilterField] || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!years.includes(period.year)) years.unshift(period.year);
  return years;
}
function modulePeriodLabel(period) {
  if (period.mode === 'all') return 'All Time';
  if (period.mode === 'year') return period.year;
  return new Date(period.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const SORT_PREF_KEY = 'workspace_sort_pref_v1';
migrateLegacyKey('kraa_sort_pref_v1', SORT_PREF_KEY);
function getSortPref(moduleKey) {
  try { return JSON.parse(localStorage.getItem(SORT_PREF_KEY) || '{}')[moduleKey] || null; }
  catch (e) { return null; }
}
function setSortPref(moduleKey, field, dir) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_PREF_KEY) || '{}');
    all[moduleKey] = { field, dir };
    localStorage.setItem(SORT_PREF_KEY, JSON.stringify(all));
  } catch (e) {}
}
function clearSortPref(moduleKey) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_PREF_KEY) || '{}');
    delete all[moduleKey];
    localStorage.setItem(SORT_PREF_KEY, JSON.stringify(all));
  } catch (e) {}
}

function renderModuleView(cfg, key) {
  let rows = Store.all(cfg.collection);

  const periodState = cfg.dateFilterField ? getModulePeriod(key) : null;
  if (periodState) {
    rows = rows.filter(r => moduleInPeriod(r[cfg.dateFilterField], periodState));
  }
  // Summaries (the KPI row above the table, e.g. "Total Booking Value") should
  // reflect the selected period — captured here, before status-tab/search
  // filters further narrow `rows` below, so summaries stay tab/search-agnostic
  // like before but now DO respect This Month / This Year / All Time.
  const summaryRows = rows;

  const selectedTab = cfg.statusTabs ? getSelectedTab(key) : 'all';
  if (cfg.statusTabs && selectedTab !== 'all') {
    rows = rows.filter(r => r.status === selectedTab);
  }

  const selectedTypeTab = cfg.typeTabs ? getSelectedTypeTab(key) : 'all';
  if (cfg.typeTabs && selectedTypeTab !== 'all') {
    rows = rows.filter(r => (r[cfg.typeTabs.field] || cfg.typeTabs.defaultValue) === selectedTypeTab);
  }

  const searchQuery = (moduleSearchQuery[key] || '').trim().toLowerCase();
  if (cfg.searchFields && searchQuery) {
    rows = rows.filter(r => cfg.searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(searchQuery)));
  }

  // Sorting: an explicit column-header click (sortPref) always wins; otherwise
  // fall back to the module's default sortField (e.g. Bookings by Start date).
  const sortPref = getSortPref(key);
  const activeSortField = sortPref ? (sortPref.field === '__manual__' ? null : sortPref.field) : cfg.sortField;
  const activeSortDir = sortPref ? sortPref.dir : 'asc';
  if (activeSortField) {
    rows = [...rows].sort((a, b) => {
      const av = a[activeSortField] ?? '';
      const bv = b[activeSortField] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return activeSortDir === 'desc' ? -cmp : cmp;
    });
  }

  const visibleColumns = cfg.columns.filter(c => isColumnVisible(key, c.field));
  const summaryDefs = MODULE_SUMMARIES[key];

  const selCount = selectedRows[key] ? selectedRows[key].size : 0;

  return `
  <div id="moduleWrap_${key}">
  <div class="section-head">
    <h2>${cfg.title}${periodState ? ' — ' + modulePeriodLabel(periodState) : ''}</h2>
    <div style="display:flex; gap:10px; position:relative; flex-wrap:wrap; align-items:center;">
      ${periodState ? `
        <select id="periodMode_${key}" style="width:auto;">
          <option value="month" ${periodState.mode === 'month' ? 'selected' : ''}>Monthly</option>
          <option value="year" ${periodState.mode === 'year' ? 'selected' : ''}>This Year</option>
          <option value="all" ${periodState.mode === 'all' ? 'selected' : ''}>All Time</option>
        </select>
        ${periodState.mode === 'month' ? `<input type="month" id="periodMonth_${key}" value="${periodState.month}" style="width:auto;" title="Pick any month — defaults to the current one">` : ''}
        ${periodState.mode === 'year' ? `<select id="periodYear_${key}" style="width:auto;">${moduleAllYears(cfg, periodState).map(y => `<option value="${y}" ${y === periodState.year ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}
      ` : ''}
      ${rows.length > 1 ? `
        <div style="display:flex; gap:4px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:4px 6px;">
          <span style="font-size:11px; color:var(--muted); margin-right:4px;">Reorder:</span>
          <button class="btn secondary" id="moveTopBtn_${key}" title="Move selected to top" ${selCount !== 1 ? 'disabled' : ''}>⤒</button>
          <button class="btn secondary" id="moveUpBtn_${key}" title="Move selected up" ${selCount !== 1 ? 'disabled' : ''}>↑</button>
          <button class="btn secondary" id="moveDownBtn_${key}" title="Move selected down" ${selCount !== 1 ? 'disabled' : ''}>↓</button>
          <button class="btn secondary" id="moveBottomBtn_${key}" title="Move selected to bottom" ${selCount !== 1 ? 'disabled' : ''}>⤓</button>
        </div>` : ''}
      <button class="btn secondary" id="columnsBtn_${key}">⚙ Columns</button>
      <div class="col-panel" id="columnsPanel_${key}" style="display:none;">
        ${cfg.columns.map(c => `
          <label class="col-panel-item">
            <input type="checkbox" data-col-toggle="${c.field}" ${isColumnVisible(key, c.field) ? 'checked' : ''}>
            ${c.label}
          </label>`).join('')}
      </div>
      ${cfg.extraAction ? `<button class="btn secondary" id="${cfg.extraAction.id}">${cfg.extraAction.label}</button>` : ''}
      ${key === 'invoice' ? `<button class="btn secondary" id="printAnnualList">📋 Print Annual List</button>` : ''}
      ${key === 'invoice' ? `<button class="btn secondary" id="generateNewInvoiceBtn">🖨 Generate New</button>` : ''}
      <button class="btn" data-add="${key}">+ Add</button>
    </div>
  </div>
  ${cfg.searchFields ? `
  <div style="margin-bottom:14px;">
    <input type="text" id="searchBox_${key}" placeholder="Search by ${cfg.searchFields.map(f => f === 'number' ? 'invoice number' : f === 'date' ? 'date' : 'customer name').join(' / ')}..." value="${moduleSearchQuery[key] || ''}" style="width:100%; max-width:360px; background:var(--panel-2); border:1px solid var(--line); color:var(--text); padding:9px 12px; border-radius:8px; font-size:13.5px;">
  </div>` : ''}
  ${selCount > 0 ? `
  <div style="display:flex; align-items:center; gap:10px; background:var(--panel-2); border:1px solid var(--line); border-radius:8px; padding:8px 12px; margin-bottom:12px;">
    <span style="font-size:12.5px; color:var(--muted);">${selCount} selected</span>
    ${selCount === 1 ? `<button class="btn secondary" id="bulkEditBtn_${key}" style="padding:5px 10px; font-size:12px;">Edit</button>` : ''}
    <button class="btn secondary" id="bulkDeleteBtn_${key}" style="padding:5px 10px; font-size:12px; color:var(--danger);">Delete</button>
    <button class="btn secondary" id="bulkClearBtn_${key}" style="padding:5px 10px; font-size:12px; margin-left:auto;">Clear selection</button>
  </div>` : ''}
  ${cfg.statusTabs ? `
  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
    <button class="status-tab ${selectedTab === 'all' ? 'active' : ''}" data-tab="all">All</button>
    ${cfg.statusTabs.map(st => `<button class="status-tab ${selectedTab === st ? 'active' : ''}" data-tab="${st}">${st.charAt(0).toUpperCase() + st.slice(1)}</button>`).join('')}
  </div>` : ''}
  ${cfg.typeTabs ? `
  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
    <button class="status-tab ${selectedTypeTab === 'all' ? 'active' : ''}" data-type-tab="all">All</button>
    ${cfg.typeTabs.values.map(tv => {
      const val = typeof tv === 'object' ? tv.value : tv;
      const lbl = typeof tv === 'object' ? tv.label : tv;
      return `<button class="status-tab ${selectedTypeTab === val ? 'active' : ''}" data-type-tab="${val}">${lbl}</button>`;
    }).join('')}
  </div>` : ''}
  ${summaryDefs ? `
  <div class="kpi-row">
    ${summaryDefs.map(s => `<div class="kpi"><div class="kpi-label">${s.label}${periodState ? ' — ' + modulePeriodLabel(periodState) : ''}</div><div class="kpi-value">${s.compute(summaryRows)}</div></div>`).join('')}
  </div>` : ''}
  ${MODULE_MONTHLY_BREAKDOWN.includes(key) ? renderMiniMonthlyBreakdown(Store.all(cfg.collection)) : ''}
  ${rows.length ? `
  <div class="table-wrap"><table class="ledger">
    <thead><tr>${rows.length > 1 ? '<th style="width:30px;"></th>' : ''}${visibleColumns.map(c => {
      const w = getColumnWidth(key, c.field);
      return `<th class="sortable-th" data-sort-field="${c.field}" style="cursor:pointer; user-select:none; position:relative; ${w ? `width:${w}px; max-width:${w}px; overflow:hidden; text-overflow:ellipsis;` : ''}">${c.label}${activeSortField === c.field ? (activeSortDir === 'asc' ? ' ▲' : ' ▼') : ''}<span class="col-resize-handle" data-resize-field="${c.field}"></span></th>`;
    }).join('')}<th></th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        ${rows.length > 1 ? `<td><input type="checkbox" data-row-check="${key}" value="${r.id}" ${selectedRows[key] && selectedRows[key].has(r.id) ? 'checked' : ''} style="accent-color:var(--amber); width:16px; height:16px;"></td>` : ''}
        ${visibleColumns.map(c => {
          const w = getColumnWidth(key, c.field);
          return `<td class="${c.cls||''}" style="${w ? `max-width:${w}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;` : ''}">${c.render ? c.render(r[c.field], r) : (r[c.field] ?? '')}</td>`;
        }).join('')}
        <td class="row-actions" style="position:relative;">
          ${key === 'invoice' ? `<button data-open-gen="${r.id}">🖨 Open</button>` : ''}
          ${key === 'booking' && r.status === 'completed' ? `<button data-gen-invoice-from-booking="${r.id}">${Store.all('invoices').some(inv => inv.bookingId === r.id) ? '✏️ Edit Invoice' : '🧾 Generate Invoice'}</button>` : ''}
          <button data-row-menu-toggle="${r.id}" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:16px; padding:2px 8px;">⋮</button>
          <div class="row-menu-dropdown" data-row-menu="${r.id}" style="display:none; position:absolute; right:8px; top:100%; z-index:30; background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,.3); min-width:110px;">
            <button data-edit="${key}" data-id="${r.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:var(--text); cursor:pointer; font-size:13px;">Edit</button>
            <button data-del="${key}" data-id="${r.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px;">Delete</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>` : `<div class="empty-state"><div class="glyph"><i data-lucide="${cfg.icon}"></i></div>${selectedTab !== 'all' ? `Nothing with status "${selectedTab}" — try the "All" tab above.` : (selectedTypeTab !== 'all' ? `Nothing tagged "${selectedTypeTab}" — try the "All" tab above.` : (periodState && periodState.mode !== 'all' ? `Nothing for ${modulePeriodLabel(periodState)} — try "All Time" above, or click "+ Add".` : 'No records yet. Click "+ Add" to create the first one.'))}</div>`}
  ${rows.length > 1 ? `<p style="color:var(--muted); font-size:11.5px; margin-top:10px;">Check one row, then use the Reorder ⤒ ↑ ↓ ⤓ controls above to move it — this clears any active column sort so your order shows. Check multiple rows to bulk-delete them.</p>` : ''}
  </div>`;
}

function wireModuleView(key) {
  const root = $('#moduleWrap_' + key) || $('#viewRoot');
  const searchBox = root.querySelector(`#searchBox_${key}`);
  if (searchBox) {
    searchBox.addEventListener('input', () => {
      moduleSearchQuery[key] = searchBox.value;
      const cursorPos = searchBox.selectionStart;
      render();
      // Re-render wipes and rebuilds the DOM, which drops focus — put it
      // back so typing feels continuous instead of needing to re-click.
      const newBox = document.querySelector(`#searchBox_${key}`);
      if (newBox) {
        newBox.focus();
        newBox.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }

  if (MODULES[key] && MODULES[key].dateFilterField) {
    root.querySelector(`#periodMode_${key}`)?.addEventListener('change', (e) => {
      getModulePeriod(key).mode = e.target.value;
      render();
    });
    root.querySelector(`#periodMonth_${key}`)?.addEventListener('change', (e) => {
      if (e.target.value) getModulePeriod(key).month = e.target.value;
      render();
    });
    root.querySelector(`#periodYear_${key}`)?.addEventListener('change', (e) => {
      getModulePeriod(key).year = e.target.value;
      render();
    });
  }

  const addBtn = root.querySelector(`[data-add="${key}"]`);
  if (addBtn) addBtn.addEventListener('click', () => openModal(key, null));
  root.querySelectorAll(`[data-open-gen]`).forEach(b =>
    b.addEventListener('click', () => {
      openInvoiceInGenerator(b.dataset.openGen);
    }));
  const genNewBtn = root.querySelector('#generateNewInvoiceBtn');
  if (genNewBtn) genNewBtn.addEventListener('click', () => {
    resetInvoiceDraft();
    navigateTo('invoiceGen');
  });
  root.querySelectorAll('[data-gen-invoice-from-booking]').forEach(b =>
    b.addEventListener('click', () => {
      generateInvoiceFromBooking(b.dataset.genInvoiceFromBooking);
    }));

  root.querySelectorAll(`[data-edit="${key}"]`).forEach(b =>
    b.addEventListener('click', () => openModal(key, b.dataset.id)));
  root.querySelectorAll(`[data-del="${key}"]`).forEach(b =>
    b.addEventListener('click', () => {
      if (confirm('Delete this record?')) {
        Store.remove(MODULES[key].collection, b.dataset.id);
        if (selectedRows[key]) selectedRows[key].delete(b.dataset.id);
        render();
        syncCollection(key);
      }
    }));

  // Row checkboxes — multi-select. Powers both the Reorder controls
  // (need exactly 1 checked) and bulk actions below (1 or more checked).
  if (!selectedRows[key]) selectedRows[key] = new Set();
  root.querySelectorAll(`[data-row-check="${key}"]`).forEach(cb =>
    cb.addEventListener('change', () => {
      if (cb.checked) selectedRows[key].add(cb.value);
      else selectedRows[key].delete(cb.value);
      render();
    }));

  root.querySelector(`#bulkEditBtn_${key}`)?.addEventListener('click', () => {
    const ids = [...selectedRows[key]];
    if (ids.length === 1) openModal(key, ids[0]);
  });
  root.querySelector(`#bulkDeleteBtn_${key}`)?.addEventListener('click', () => {
    const ids = [...selectedRows[key]];
    if (!ids.length) return;
    if (confirm(`Delete ${ids.length} selected record${ids.length > 1 ? 's' : ''}?`)) {
      ids.forEach(id => Store.remove(MODULES[key].collection, id));
      selectedRows[key].clear();
      render();
      syncCollection(key);
    }
  });
  root.querySelector(`#bulkClearBtn_${key}`)?.addEventListener('click', () => {
    selectedRows[key].clear();
    render();
  });

  // Per-row "⋮" menu (Edit/Delete for that one row) — closes any other
  // open menu first, and closes itself when clicking anywhere else.
  root.querySelectorAll('[data-row-menu-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.rowMenuToggle;
      const dropdown = root.querySelector(`[data-row-menu="${id}"]`);
      const isOpen = dropdown.style.display !== 'none';
      root.querySelectorAll('.row-menu-dropdown').forEach(d => d.style.display = 'none');
      dropdown.style.display = isOpen ? 'none' : '';
    });
  });
  document.addEventListener('click', function closeRowMenus() {
    root.querySelectorAll('.row-menu-dropdown').forEach(d => d.style.display = 'none');
  }, { once: true });

  const doMove = (direction) => {
    const ids = [...selectedRows[key]];
    if (ids.length !== 1) return;
    Store.moveItem(MODULES[key].collection, ids[0], direction);
    setSortPref(key, '__manual__', 'asc'); // reveal manual order immediately
    render();
    syncCollection(key);
  };
  root.querySelector('#moveTopBtn_' + key)?.addEventListener('click', () => doMove('top'));
  root.querySelector('#moveUpBtn_' + key)?.addEventListener('click', () => doMove('up'));
  root.querySelector('#moveDownBtn_' + key)?.addEventListener('click', () => doMove('down'));
  root.querySelector('#moveBottomBtn_' + key)?.addEventListener('click', () => doMove('bottom'));

  let resizeJustHappened = false;
  root.querySelectorAll('.col-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const th = handle.closest('th');
      const field = handle.dataset.resizeField;
      const startX = e.clientX;
      const startWidth = th.offsetWidth;
      let moved = false;

      function onMouseMove(ev) {
        const delta = ev.clientX - startX;
        if (Math.abs(delta) > 3) moved = true;
        const newWidth = Math.max(60, startWidth + delta);
        th.style.width = newWidth + 'px';
        th.style.maxWidth = newWidth + 'px';
      }
      function onMouseUp(ev) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (moved) {
          const delta = ev.clientX - startX;
          const finalWidth = Math.max(60, startWidth + delta);
          setColumnWidth(key, field, finalWidth);
          resizeJustHappened = true;
          render();
        }
      }
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  root.querySelectorAll('.sortable-th').forEach(th => {
    th.addEventListener('click', () => {
      if (resizeJustHappened) { resizeJustHappened = false; return; }
      const field = th.dataset.sortField;
      const current = getSortPref(key);
      if (current && current.field === field) {
        if (current.dir === 'asc') {
          setSortPref(key, field, 'desc');
        } else {
          clearSortPref(key); // third click: back to default order
        }
      } else {
        setSortPref(key, field, 'asc');
      }
      render();
    });
  });

  root.querySelectorAll('.status-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      setSelectedTab(key, tab.dataset.tab);
      render();
    });
  });

  root.querySelectorAll('.status-tab[data-type-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      setSelectedTypeTab(key, tab.dataset.typeTab);
      render();
    });
  });

  const columnsBtn = root.querySelector('#columnsBtn_' + key);
  const columnsPanel = root.querySelector('#columnsPanel_' + key);
  columnsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    columnsPanel.style.display = columnsPanel.style.display === 'none' ? '' : 'none';
  });
  columnsPanel?.querySelectorAll('[data-col-toggle]').forEach(cb => {
    cb.addEventListener('change', () => {
      setColumnVisible(key, cb.dataset.colToggle, cb.checked);
      render();
    });
  });
  // Close the panel when clicking anywhere else on the page.
  document.addEventListener('click', function closeColPanel(e) {
    if (columnsPanel && !columnsPanel.contains(e.target) && e.target !== columnsBtn) {
      columnsPanel.style.display = 'none';
      document.removeEventListener('click', closeColPanel);
    }
  });

  if (key === 'investments') {
    root.querySelector('#refreshPrices')?.addEventListener('click', refreshStockPrices);
  }

  if (key === 'invoice') {
    root.querySelector('#printAnnualList')?.addEventListener('click', printAnnualInvoiceList);
  }
}
