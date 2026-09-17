/* Workspace App — Add/Edit modal (generic form for every module) */

/* ---------- Modal / form ---------- */
function openModal(moduleKey, id) {
  const cfg = MODULES[moduleKey];
  editingContext = { moduleKey, id };
  const record = id ? Store.get(cfg.collection, id) : {};

  $('#modalTitle').textContent = (id ? 'Edit ' : 'Add ') + cfg.title.replace(/s$/, '');

  const form = $('#modalForm');
  // Holds the live array for any "contacts-list" fields (extra contact
  // people for a Customer/Vendor) — kept outside FormData since it's a
  // dynamic repeatable list, not a single input.
  const listFieldState = {};

  form.innerHTML = cfg.fields.map(f => {
    // A field can opt into defaulting to today's date when adding a brand
    // new record (never on edit — an existing record's saved date always
    // wins) — still a plain editable input, just pre-filled as a convenience.
    const val = record[f.name] ?? (f.type === 'date' && !id && f.default === 'today' ? todayStr() : '');
    const wrapAttrs = f.showIf ? `data-showif-field="${f.showIf.field}" data-showif-equals="${f.showIf.equals}"` : '';
    let inner;
    if (f.type === 'contacts-list') {
      listFieldState[f.name] = Array.isArray(record[f.name]) ? structuredClone(record[f.name]) : [];
      inner = `<label>${f.label}</label>
        <div class="contacts-list-rows" data-contacts-field="${f.name}"></div>
        <button type="button" class="btn secondary" data-add-contact="${f.name}" style="margin-top:6px; font-size:12px; padding:6px 10px;">+ Add another contact</button>`;
    } else if (f.type === 'select') {
      const opts = f.source ? Store.all(f.source).map(o => ({ value: o.id, label: o[f.optLabel] }))
                             : f.options.map(o => ({ value: o, label: o }));
      inner = `<label>${f.label}</label>
        <select name="${f.name}">
          <option value="">—</option>
          ${opts.map(o => `<option value="${o.value}" ${o.value===val?'selected':''}>${o.label}</option>`).join('')}
        </select>`;
    } else if (f.type === 'multi-select') {
      const existing = Array.isArray(record[f.name]) ? record[f.name] : [];
      inner = `<label>${f.label}</label>
        <div class="multiselect-options" data-multiselect-field="${f.name}" style="display:flex; flex-direction:column; gap:2px; border:1px solid var(--line); border-radius:7px; padding:8px 10px; max-height:220px; overflow-y:auto;">
          ${f.options.map(o => `<label style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:13.5px; font-weight:400; text-transform:none; letter-spacing:normal; color:var(--text); cursor:pointer;">
            <input type="checkbox" value="${o}" ${existing.includes(o) ? 'checked' : ''} style="accent-color:var(--amber); width:15px; height:15px; flex-shrink:0;">
            ${o}
          </label>`).join('')}
        </div>`;
    } else if (f.type === 'textarea') {
      inner = `<label>${f.label}</label>
        <textarea name="${f.name}" rows="5" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:9px 10px; border-radius:7px; font-size:13.5px; font-family:inherit; resize:vertical;" ${f.required?'required':''}>${val}</textarea>`;
    } else {
      inner = `<label>${f.label}</label>
      <input type="${f.type}" name="${f.name}" value="${val}" ${f.type === 'number' ? 'step="any"' : ''} ${f.required?'required':''}>`;
    }
    return `<div class="field" ${wrapAttrs}>${inner}</div>`;
  }).join('') + `
    <div class="modal-actions">
      <button type="submit" class="btn">Save</button>
      <button type="button" class="btn secondary" id="cancelModal">Cancel</button>
    </div>`;

  // Render + wire each contacts-list field's rows. Re-drawn in place
  // whenever a contact is added/removed/edited, without touching the
  // rest of the form (so other fields the person is mid-typing stay put).
  function renderContactsRows(fieldName) {
    const container = form.querySelector(`.contacts-list-rows[data-contacts-field="${fieldName}"]`);
    const list = listFieldState[fieldName];
    container.innerHTML = list.map((c, i) => `
      <div style="display:flex; gap:8px; margin-bottom:6px;">
        <input type="text" placeholder="Contact name" data-contact-idx="${i}" data-contact-part="name" value="${c.name || ''}" style="flex:1;">
        <input type="text" placeholder="Contact number" data-contact-idx="${i}" data-contact-part="phone" value="${c.phone || ''}" style="flex:1;">
        <button type="button" data-remove-contact="${i}" style="background:none; border:none; color:var(--danger); cursor:pointer; display:flex; align-items:center;"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
      </div>
    `).join('') || `<p style="color:var(--muted); font-size:12px;">No additional contacts yet.</p>`;

    container.querySelectorAll('[data-contact-idx]').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.contactIdx);
        listFieldState[fieldName][idx][input.dataset.contactPart] = input.value;
      });
    });
    container.querySelectorAll('[data-remove-contact]').forEach(btn => {
      btn.addEventListener('click', () => {
        listFieldState[fieldName].splice(Number(btn.dataset.removeContact), 1);
        renderContactsRows(fieldName);
        if (window.lucide) lucide.createIcons();
      });
    });
    if (window.lucide) lucide.createIcons();
  }
  Object.keys(listFieldState).forEach(renderContactsRows);
  form.querySelectorAll('[data-add-contact]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldName = btn.dataset.addContact;
      listFieldState[fieldName].push({ name: '', phone: '' });
      renderContactsRows(fieldName);
    });
  });

  // Conditional fields: hide/show based on another field's current value,
  // e.g. "Which credit card?" only appears when Payment Mode = Credit Card.
  const conditionalWraps = form.querySelectorAll('[data-showif-field]');
  function applyConditionalVisibility() {
    conditionalWraps.forEach(wrap => {
      const controllerName = wrap.dataset.showifField;
      const expected = wrap.dataset.showifEquals;
      const controller = form.querySelector(`[name="${controllerName}"]`);
      const match = controller && controller.value === expected;
      wrap.style.display = match ? '' : 'none';
    });
  }
  const controllerNames = new Set(Array.from(conditionalWraps).map(w => w.dataset.showifField));
  controllerNames.forEach(name => {
    const controller = form.querySelector(`[name="${name}"]`);
    controller?.addEventListener('change', applyConditionalVisibility);
  });
  applyConditionalVisibility();

  // Prevent Enter from silently submitting/closing the form while typing —
  // a very easy accidental keypress. Save still works via the button click.
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  form.querySelector('#cancelModal').addEventListener('click', closeModal);
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(listFieldState).forEach(fieldName => {
      data[fieldName] = listFieldState[fieldName].filter(c => c.name || c.phone);
    });
    // multi-select checkboxes aren't part of FormData in a usable form
    // (same-name checkboxes collide), so read the checked ones directly.
    form.querySelectorAll('[data-multiselect-field]').forEach(container => {
      const fieldName = container.dataset.multiselectField;
      data[fieldName] = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    });
    const previousRecord = id ? Store.get(cfg.collection, id) : null;
    const saved = id ? Store.update(cfg.collection, id, data) : Store.add(cfg.collection, data);
    if (cfg.onSave) cfg.onSave(saved, previousRecord);
    closeModal();
    render();
    syncCollection(moduleKey);
  };

  $('#modalBackdrop').classList.add('show');
}

// Read-only "letter" view for modules that opt in via `viewable: true` (see
// module-table.js's ⋮ menu). Reuses the same modal shell as Add/Edit but
// never touches editingContext, never writes to Store, and has no Save
// button — purely a nicer way to read an existing record, so there's zero
// risk to existing data from adding this.
function openViewModal(moduleKey, id) {
  const cfg = MODULES[moduleKey];
  const record = Store.get(cfg.collection, id);
  if (!record) return;

  $('#modalTitle').textContent = record.title || cfg.title.replace(/s$/, '');
  const form = $('#modalForm');
  const content = cfg.viewRenderer
    ? cfg.viewRenderer(record)
    : `<div style="white-space:pre-wrap;">${JSON.stringify(record, null, 2)}</div>`;
  form.innerHTML = `
    ${content}
    <div class="modal-actions">
      <button type="button" class="btn secondary" id="closeViewBtn" style="width:100%;">Close</button>
    </div>`;
  form.onsubmit = (e) => e.preventDefault(); // read-only — this form never saves anything
  form.querySelector('#closeViewBtn').addEventListener('click', closeModal);

  $('#modalBackdrop').classList.add('show');
}

function closeModal() {
  $('#modalBackdrop').classList.remove('show');
  editingContext = null;
}

/* ---------- Cloud sync (Sheets + Supabase, best-effort, silent if not configured) ---------- */
async function syncCollection(moduleKey) {
  const cfg = MODULES[moduleKey];
  if (!cfg) return;
  const records = Store.all(cfg.collection);
  if (SheetsAPI.isConfigured()) {
    await SheetsAPI.pushCollection(cfg.collection, records);
  }
  if (typeof SupabaseSync !== 'undefined') {
    await SupabaseSync.pushCollection(cfg.collection, records);
  }
}

async function checkSyncStatus() {
  const dot = $('#syncDot'), title = $('#syncTitle'), sub = $('#syncSub');
  if (!SheetsAPI.isConfigured()) {
    dot.classList.remove('on'); title.textContent = 'Local storage mode'; sub.textContent = 'Sheets not connected';
    return;
  }
  const ok = await SheetsAPI.ping();
  dot.classList.toggle('on', ok);
  title.textContent = ok ? 'Connected to Google Sheets' : 'Sheets connection failed';
  sub.textContent = ok ? 'Cloud backup active' : 'Check Apps Script deployment';
}
