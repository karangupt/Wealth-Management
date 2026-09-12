/* Workspace App — MODULES config: drives generic table + form rendering for every module */

const MODULES = {
  customer: {
    title: 'Customers', collection: 'customers', icon: 'users',
    columns: [
      { label: 'Company', field: 'companyName', cls: 'name-cell' },
      { label: 'Contact Name', field: 'name' },
      { label: 'Contact Number', field: 'phone' },
      { label: 'Email', field: 'email' },
      { label: 'GST No.', field: 'gst' }
    ],
    fields: [
      { name: 'companyName', label: 'Company name', type: 'text' },
      { name: 'companyAddress', label: 'Company address (used on invoices)', type: 'text' },
      { name: 'name', label: 'Contact Name', type: 'text', required: true },
      { name: 'phone', label: 'Contact Number', type: 'text' },
      { name: 'additionalContacts', label: 'Additional contacts at this company (optional)', type: 'contacts-list' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'gst', label: 'GST number', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'text' }
    ]
  },
  booking: {
    title: 'Bookings', collection: 'bookings', icon: 'calendar-check',
    statusTabs: ['pending', 'confirmed', 'completed', 'cancelled'],
    sortField: 'startDate',
    dateFilterField: 'startDate', // enables the This Month / This Year / All Time picker on the Bookings list
    columns: [
      { label: 'Item', field: 'item', cls: 'name-cell' },
      { label: 'Client', field: 'clientName' },
      { label: 'Company', field: 'companyName', render: (v, row) => {
          if (v) return v; // manually typed on this booking wins
          const c = Store.get('customers', row.customerId);
          return (c && c.companyName) || '—';
        } },
      { label: 'Location', field: 'location' },
      { label: 'Start', field: 'startDate', render: fmtDate },
      { label: 'End', field: 'endDate', render: fmtDate },
      { label: 'Amount', field: 'amount', render: v => fmt(v) },
      { label: 'Status', field: 'status', render: v => tagFor(v) }
    ],
    fields: [
      { name: 'item', label: 'Equipment / item', type: 'text', required: true },
      { name: 'clientName', label: 'Client name', type: 'text' },
      { name: 'companyName', label: 'Company name', type: 'text' },
      { name: 'companyAddress', label: 'Company address (for invoice billing address)', type: 'text' },
      { name: 'location', label: 'Location / venue (delivery address)', type: 'text' },
      { name: 'customerId', label: 'Linked customer record (optional)', type: 'select', source: 'customers', optLabel: 'name' },
      { name: 'startDate', label: 'Start date', type: 'date', default: 'today' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'amount', label: 'Amount (₹) — total for the whole booking', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ['pending','confirmed','completed','cancelled'] }
    ],
    onSave: (saved) => {
      // If a client name was typed but not linked to an existing Customer
      // record, auto-create (or match) one — avoids typing the same
      // person into both Bookings and Customers separately.
      if (!saved.clientName) return;
      if (saved.customerId && Store.get('customers', saved.customerId)) return; // already linked

      const nameLower = saved.clientName.trim().toLowerCase();
      const match = Store.all('customers').find(c => (c.name || '').trim().toLowerCase() === nameLower);
      let customerId;
      if (match) {
        customerId = match.id;
      } else {
        const created = Store.add('customers', {
          name: saved.clientName,
          companyName: saved.companyName || '',
          companyAddress: saved.companyAddress || ''
        });
        customerId = created.id;
        syncCollection('customer');
      }
      Store.update('bookings', saved.id, { customerId });
    }
  },
  inventory: {
    title: 'Equipment Inventory', collection: 'equipment', icon: 'projector',
    columns: [
      { label: 'Equipment', field: 'name', cls: 'name-cell' },
      { label: 'Category', field: 'category' },
      { label: 'Total Qty', field: 'qty' },
      { label: 'Available', field: 'available' },
      { label: 'Rate/day', field: 'rate', render: v => fmt(v) }
    ],
    fields: [
      { name: 'name', label: 'Equipment name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'qty', label: 'Total quantity', type: 'number' },
      { name: 'available', label: 'Available now', type: 'number' },
      { name: 'rate', label: 'Rental rate / day (₹)', type: 'number' }
    ]
  },
  expense: {
    title: 'Expenses', collection: 'expenses', icon: 'receipt',
    sortField: 'date',
    dateFilterField: 'date', // enables the This Month / This Year / All Time picker
    // "All / Corporate / Personal" tabs, same idea as Bookings' status tabs
    // but keyed to expenseType instead of status. A blank expenseType is
    // treated as Corporate, matching how the Type column already displays it.
    typeTabs: { field: 'expenseType', values: ['Corporate', 'Personal'], defaultValue: 'Corporate' },
    columns: [
      { label: 'Date', field: 'date', render: fmtDate },
      { label: 'Type', field: 'expenseType', render: v => v || 'Corporate' },
      { label: 'Category', field: 'category', render: (v, row) => v === 'Grocery' && Array.isArray(row.subCategory) && row.subCategory.length ? `Grocery — ${row.subCategory.join(', ')}` : (v || '—') },
      { label: 'Description', field: 'desc', cls: 'name-cell' },
      { label: 'Paid Via', field: 'paymentMode', render: (v, row) => {
          if (v !== 'Credit Card') return v || '—';
          const card = Store.get('creditCards', row.creditCardId);
          return `Credit Card${card ? ' — ' + card.cardName : ''}`;
        } },
      { label: 'Amount', field: 'amount', render: v => fmt(v) }
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { name: 'expenseType', label: 'Personal or Corporate?', type: 'select', options: ['Corporate','Personal'], required: true },
      // Cleaned up — 'Vegetable' and 'Milk & Dairy' used to sit here as their
      // own top-level categories even though they're groceries; they're now
      // Grocery sub-categories below. The old 'Utilities (Electricity/Water/
      // Internet)' umbrella overlapped with the granular Electricity/Internet
      // Recharge items right next to it, so it's gone too — replaced with a
      // standalone 'Water Bill' to cover the one thing it had that nothing
      // else did.
      { name: 'category', label: 'Category', type: 'select', options: [
        'Grocery', 'LPG Cylinder', 'Water Bill', 'Electricity', 'Internet Recharge', 'Mobile Recharge', 'Fuel', 'Clothing', 'Footwear', 'Medical & Health', 'Food & Dining',
        'Rent', 'Society Maintenance', 'Property Tax',
        'Equipment Maintenance', 'Equipment Purchase', 'Vendor Outsourcing / Subcontracting', 'Salaries & Wages', 'Marketing & Advertising', 'Office Supplies', 'Hardware & Tools', 'Transport & Delivery', 'Insurance Premium',
        'Travel', 'Education', 'Entertainment', 'Loan / EMI', 'Miscellaneous'
      ] },
      // Only shown when Category = Grocery — same conditional pattern already
      // used below for "Which credit card?". Multi-select so one entry can
      // cover several sub-categories at once (e.g. a trip that had both
      // vegetables and dairy).
      { name: 'subCategory', label: 'Grocery Sub-Category (pick as many as apply)', type: 'multi-select', showIf: { field: 'category', equals: 'Grocery' }, options: [
        'Fruits & Vegetables', 'Milk & Dairy', 'Grains, Atta & Rice', 'Pulses & Dals', 'Spices & Masalas',
        'Cooking Oil & Ghee', 'Bakery & Bread', 'Snacks & Namkeen', 'Beverages (Tea/Coffee/Juices)',
        'Meat, Fish & Eggs', 'Frozen & Ready-to-Eat', 'Personal Care & Toiletries', 'Cleaning & Household Supplies', 'Other Grocery'
      ] },
      { name: 'desc', label: 'Description', type: 'text' },
      { name: 'paymentMode', label: 'Paid via', type: 'select', options: ['Cash','UPI','Credit Card'] },
      { name: 'creditCardId', label: 'Which credit card?', type: 'select', source: 'creditCards', optLabel: 'cardName', showIf: { field: 'paymentMode', equals: 'Credit Card' } },
      { name: 'amount', label: 'Amount (₹)', type: 'number' }
    ]
  },
  invoice: {
    title: 'Invoices', collection: 'invoices', icon: 'file-text',
    searchFields: ['number', 'customerName', 'date'],
    dateFilterField: 'date',
    // All / Invoice / Provisional Invoice / Quotation — a dedicated way to
    // pull up just the Quotations (or just Provisional Invoices) as their
    // own list, separate from real invoiced revenue.
    typeTabs: { field: 'docType', defaultValue: 'Tax Invoice', values: [
      { value: 'Tax Invoice', label: 'Invoice' },
      { value: 'Provisional Invoice', label: 'Provisional Invoice' },
      { value: 'Quotation', label: 'Quotation' }
    ] },
    columns: [
      { label: 'Number', field: 'number', cls: 'name-cell' },
      { label: 'Type', field: 'docType', render: v => v === 'Tax Invoice' ? 'Invoice' : (v || 'Invoice') },
      { label: 'Company', field: 'companyName', render: (v, row) => {
          // Most invoices come from Invoice Generator, which only ever
          // saves a plain 'customerName' (no customerId link) — in this
          // rental business the "customer" is almost always itself a
          // company/organisation (e.g. "Vikram Studios"), so that name
          // doubles as the company name when nothing more specific is set.
          if (v) return v; // manually typed directly on this invoice wins
          if (row.customerName) return row.customerName;
          const c = Store.get('customers', row.customerId);
          return (c && c.companyName) || '—';
        } },
      { label: 'Date', field: 'date', render: fmtDate },
      { label: 'Amount', field: 'amount', render: v => fmt(v) },
      { label: 'Status', field: 'status', render: v => tagFor(v) },
      { label: 'Paid', field: '_paid', render: (v, row) => {
          if (row.status === 'paid') return fmt(row.amount);
          if (row.status === 'unpaid') return fmt(0);
          return fmt(invoicePaidSoFar(row.id)); // partial
        } },
      { label: 'Pending', field: '_pending', render: (v, row) => {
          if (row.status === 'paid') return fmt(0);
          if (row.status === 'unpaid') return fmt(row.amount);
          const pending = Number(row.amount || 0) - invoicePaidSoFar(row.id);
          return fmt(pending > 0 ? pending : 0);
        } }
    ],
    fields: [
      { name: 'number', label: 'Invoice number', type: 'text', required: true },
      { name: 'customerId', label: 'Customer', type: 'select', source: 'customers', optLabel: 'name' },
      { name: 'companyName', label: 'Company name', type: 'text' },
      { name: 'date', label: 'Date', type: 'date', default: 'today' },
      { name: 'amount', label: 'Amount (₹)', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ['unpaid','partial','paid'] },
      { name: 'paidAmount', label: 'Amount paid so far (₹)', type: 'number', showIf: { field: 'status', equals: 'partial' } }
    ],
    onSave: (saved, previous) => {
      const wasAlreadyPaid = previous && previous.status === 'paid';
      if (saved.status === 'paid' && !wasAlreadyPaid) {
        const alreadyPaid = invoicePaidSoFar(saved.id);
        const remaining = Number(saved.amount || 0) - alreadyPaid;
        if (remaining > 0) {
          Store.add('payments', { invoiceId: saved.id, date: todayStr(), amount: remaining, mode: 'Bank Transfer' });
          syncCollection('payments');
        }
      } else if (saved.status === 'partial' && saved.paidAmount) {
        const alreadyPaid = invoicePaidSoFar(saved.id);
        const diff = Number(saved.paidAmount || 0) - alreadyPaid;
        if (diff > 0) {
          Store.add('payments', { invoiceId: saved.id, date: todayStr(), amount: diff, mode: 'Bank Transfer' });
          syncCollection('payments');
        }
      }
    }
  },
  payments: {
    title: 'Payments', collection: 'payments', icon: 'banknote',
    dateFilterField: 'date',
    columns: [
      { label: 'Date', field: 'date', render: fmtDate },
      { label: 'Invoice', field: 'invoiceId', render: v => {
          if (!v) return '—';
          const inv = Store.get('invoices', v);
          return inv ? inv.number : '—';
        } },
      { label: 'Company', field: 'companyName', render: (v, row) => {
          if (v) return v; // manually typed on this payment wins
          const inv = Store.get('invoices', row.invoiceId);
          if (!inv) return '—';
          if (inv.companyName) return inv.companyName;
          if (inv.customerName) return inv.customerName; // Invoice Generator only ever saves this
          const c = Store.get('customers', inv.customerId);
          return (c && c.companyName) || '—';
        } },
      { label: 'Amount', field: 'amount', render: v => fmt(v) },
      { label: 'Mode', field: 'mode' }
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { name: 'invoiceId', label: 'Invoice', type: 'select', source: 'invoices', optLabel: 'number' },
      { name: 'companyName', label: 'Company name', type: 'text' },
      { name: 'amount', label: 'Amount (₹)', type: 'number' },
      { name: 'mode', label: 'Mode', type: 'select', options: ['Cash','UPI','Bank Transfer','Cheque'] }
    ]
  },
  staff: {
    title: 'Staff', collection: 'staff', icon: 'user-cog',
    columns: [
      { label: 'Name', field: 'name', cls: 'name-cell' },
      { label: 'Role', field: 'role' },
      { label: 'Phone', field: 'phone' },
      { label: 'Salary', field: 'salary', render: v => fmt(v) }
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'salary', label: 'Monthly salary (₹)', type: 'number' }
    ]
  },
  bank: {
    title: 'Bank Accounts', collection: 'bankAccounts', icon: 'landmark',
    columns: [
      { label: 'Bank', field: 'bank', cls: 'name-cell' },
      { label: 'Type', field: 'accType', render: v => LOCKED_ACCOUNT_TYPES.includes(v) ? `${v} <span class="tag due" style="margin-left:6px;">Locked</span>` : (v || '—') },
      { label: 'Account No.', field: 'number' },
      { label: 'UPI ID', field: 'upiId' },
      { label: 'IFSC Code', field: 'ifscCode' },
      { label: 'Branch', field: 'branch' },
      { label: 'Balance', field: 'balance', render: v => fmt(v) }
    ],
    fields: [
      { name: 'bank', label: 'Bank name', type: 'text', required: true },
      { name: 'accType', label: 'Account type', type: 'select', options: ['Savings','Current','Sukanya Samriddhi','Minor Account','Spouse Account'] },
      { name: 'number', label: 'Account number (masked)', type: 'text' },
      { name: 'upiId', label: 'UPI ID (GPay / PhonePe / Paytm etc.)', type: 'text' },
      { name: 'customerId', label: 'Customer ID / CIF number', type: 'text' },
      { name: 'branch', label: 'Branch name', type: 'text' },
      { name: 'ifscCode', label: 'IFSC code', type: 'text' },
      { name: 'customerCare', label: 'Customer care number', type: 'text' },
      { name: 'balance', label: 'Balance (₹)', type: 'number' }
    ]
  },
  fdrd: {
    title: 'FD / RD', collection: 'fdrd', icon: 'piggy-bank',
    columns: [
      { label: 'Type', field: 'type' },
      { label: 'Bank', field: 'bank', cls: 'name-cell' },
      { label: 'Principal', field: 'principal', render: v => fmt(v) },
      { label: 'Rate %', field: 'rate' },
      { label: 'Maturity', field: 'maturity' }
    ],
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['FD','RD'] },
      { name: 'bank', label: 'Bank', type: 'text', required: true },
      { name: 'principal', label: 'Principal (₹)', type: 'number' },
      { name: 'rate', label: 'Interest rate (%)', type: 'number' },
      { name: 'maturity', label: 'Maturity date', type: 'date' }
    ]
  },
  investments: {
    title: 'Investments', collection: 'investments', icon: 'trending-up',
    extraAction: { id: 'refreshPrices', label: '↻ Refresh Prices' },
    columns: [
      { label: 'Type', field: 'type' },
      { label: 'Name', field: 'name', cls: 'name-cell' },
      { label: 'Ticker', field: 'ticker' },
      { label: 'Broker', field: 'broker' },
      { label: 'Qty', field: 'qty' },
      { label: 'Invested', field: 'invested', render: (v, row) => fmtByType(v, row.type) },
      { label: 'Current value', field: 'current', render: (v, row) => fmtByType(v, row.type) }
    ],
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Mutual Fund','Indian Stock','US Stock','Bonds','Gold','Silver','Crypto'] },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'ticker', label: 'Ticker symbol (for stocks, e.g. AAPL)', type: 'text' },
      { name: 'broker', label: 'Broker name (e.g. Zerodha, Groww, Robinhood)', type: 'text' },
      { name: 'brokerAccountNumber', label: 'Broker / Demat account number', type: 'text' },
      { name: 'routingNumber', label: 'Routing number (US bank, for US Stock brokerage)', type: 'text' },
      { name: 'qty', label: 'Quantity / units held', type: 'number' },
      { name: 'invested', label: 'Amount invested (₹, or $ for US Stock)', type: 'number' },
      { name: 'current', label: 'Current value (₹, or $ for US Stock) — or click Refresh Prices', type: 'number' }
    ]
  },
  vendor: {
    title: 'Vendors', collection: 'vendors', icon: 'truck',
    columns: [
      { label: 'Vendor', field: 'name', cls: 'name-cell' },
      { label: 'Company', field: 'companyName' },
      { label: 'Contact person', field: 'contactPerson' },
      { label: 'Phone', field: 'phone' },
      { label: 'Email', field: 'email' },
      { label: 'Category', field: 'category' }
    ],
    fields: [
      { name: 'name', label: 'Vendor name', type: 'text', required: true },
      { name: 'companyName', label: 'Registered company name (if different)', type: 'text' },
      { name: 'contactPerson', label: 'Contact person', type: 'text' },
      { name: 'phone', label: 'Contact Number', type: 'text' },
      { name: 'additionalContacts', label: 'Additional contacts at this company (optional)', type: 'contacts-list' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'category', label: 'Category (e.g. Equipment Supplier)', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'text' }
    ]
  },
  creditcards: {
    title: 'Credit Cards', collection: 'creditCards', icon: 'credit-card',
    columns: [
      { label: 'Card', field: 'cardName', cls: 'name-cell' },
      { label: 'Bank', field: 'bank' },
      { label: 'Due Amount', field: 'dueAmount', render: v => fmt(v) },
      { label: 'Due Date', field: 'dueDate', render: fmtDate },
      { label: 'Tracked Spend', field: '_spend', render: (v, row) => fmt(Store.all('expenses').filter(e => e.paymentMode === 'Credit Card' && e.creditCardId === row.id).reduce((s, e) => s + Number(e.amount || 0), 0)) },
      { label: 'Reward Points', field: 'rewardPoints' }
    ],
    fields: [
      { name: 'cardName', label: 'Card name (e.g. HDFC Regalia)', type: 'text', required: true },
      { name: 'bank', label: 'Bank', type: 'text' },
      { name: 'last4', label: 'Last 4 digits', type: 'text' },
      { name: 'creditLimit', label: 'Credit limit (₹)', type: 'number' },
      { name: 'dueAmount', label: 'Current due amount (₹)', type: 'number' },
      { name: 'dueDate', label: 'Payment due date', type: 'date' },
      { name: 'rewardPoints', label: 'Reward points (update manually from statement/app)', type: 'number' }
    ]
  },
  giftcards: {
    title: 'Gift Cards & Wallets', collection: 'giftCards', icon: 'gift',
    columns: [
      { label: 'Platform', field: 'platform', cls: 'name-cell' },
      { label: 'Balance', field: 'balance', render: v => fmt(v) },
      { label: 'Last Updated', field: 'lastUpdated', render: fmtDate }
    ],
    fields: [
      { name: 'platform', label: 'Platform', type: 'select', options: ['Amazon Pay Balance','Flipkart Gift Card','Amazon Gift Card','Paytm Wallet','Other'] },
      { name: 'balance', label: 'Balance (₹) — check the app and update here', type: 'number' },
      { name: 'lastUpdated', label: 'Last checked on', type: 'date', default: 'today' },
      { name: 'notes', label: 'Notes (e.g. card code, expiry)', type: 'text' }
    ]
  },
  assets: {
    title: 'Assets & Liabilities', collection: 'assets', icon: 'scale',
    columns: [
      { label: 'Type', field: 'type' },
      { label: 'Name', field: 'name', cls: 'name-cell' },
      { label: 'Value', field: 'value', render: v => fmt(v) }
    ],
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Property','Vehicle','Gold','Liability - Loan','Liability - Credit Card','Other'] },
      { name: 'name', label: 'Description', type: 'text', required: true },
      { name: 'value', label: 'Value (₹)', type: 'number' }
    ]
  },
  otherIncome: {
    title: 'Other Income', collection: 'otherIncome', icon: 'wallet',
    dateFilterField: 'date',
    columns: [
      { label: 'Date', field: 'date', render: fmtDate },
      { label: 'Source', field: 'type', cls: 'name-cell' },
      { label: 'Description', field: 'description' },
      { label: 'Amount', field: 'amount', render: v => fmt(v) }
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { name: 'type', label: 'Income source', type: 'select', options: ['Interest','Dividend','Rent from Property','Sale Commission','Other'], required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'amount', label: 'Amount (₹)', type: 'number' }
    ]
  },
  insurance: {
    title: 'Insurance', collection: 'insurance', icon: 'shield-check',
    columns: [
      { label: 'Type', field: 'type' },
      { label: 'Company', field: 'insuranceCompany', cls: 'name-cell' },
      { label: 'Policy No.', field: 'policyNumber' },
      { label: 'Sum Assured', field: 'sumAssured', render: v => fmt(v) },
      { label: 'Renewal Date', field: 'renewalDate', render: fmtDate },
      { label: 'Maturity Date', field: 'maturityDate', render: fmtDate }
    ],
    fields: [
      { name: 'type', label: 'Insurance type', type: 'select', options: ['Term Plan','Life Insurance','Health Insurance','Car Insurance','Scooter Insurance','Other'], required: true },
      { name: 'insuranceCompany', label: 'Insurance company name', type: 'text', required: true },
      { name: 'policyNumber', label: 'Policy number', type: 'text', required: true },
      { name: 'insuredName', label: 'Name (policyholder)', type: 'text' },
      { name: 'nominee', label: 'Nominee', type: 'text' },
      { name: 'sumAssured', label: 'Sum assured (₹)', type: 'number' },
      { name: 'agentName', label: 'Agent name', type: 'text' },
      { name: 'agentNumber', label: 'Agent phone number', type: 'text' },
      { name: 'customerCare', label: 'Customer care number', type: 'text' },
      { name: 'email', label: 'Insurer email ID', type: 'text' },
      { name: 'renewalDate', label: 'Renewal date', type: 'date' },
      { name: 'maturityDate', label: 'Maturity date (leave blank for Health/Car/Scooter — usually no maturity)', type: 'date' },
      { name: 'remarks', label: 'Remarks', type: 'text' }
    ]
  },
  documents: {
    title: 'Document Vault', collection: 'documents', icon: 'folder-lock',
    columns: [
      { label: 'Family Member', field: 'familyMember', cls: 'name-cell' },
      { label: 'Category', field: 'category' },
      { label: 'Title', field: 'title' },
      { label: 'Link', field: 'driveLink', render: v => v ? `<a href="${v}" target="_blank" rel="noopener" style="color:var(--amber);">Open ↗</a>` : '—' },
      { label: 'Added On', field: 'dateAdded', render: fmtDate }
    ],
    fields: [
      { name: 'familyMember', label: 'Family member', type: 'select', options: ['Karan Gupta','Rukmini Gupta','Aahana Gupta','Aarav Gupta','Shared / Family'], required: true },
      { name: 'category', label: 'Document category', type: 'select', options: ['Property Document','Equipment Invoice','Gold Invoice','Aadhar Card','PAN Card','Passport','Other ID','Education Certificate','Other'], required: true },
      { name: 'title', label: 'Title / description', type: 'text', required: true },
      { name: 'driveLink', label: 'Google Drive link (upload the file to Drive, paste the shareable link here)', type: 'text' },
      { name: 'dateAdded', label: 'Date added', type: 'date', default: 'today' },
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ]
  },
  familyNotes: {
    title: 'Family Notes', collection: 'familyNotes', icon: 'notebook-pen',
    columns: [
      { label: 'Title', field: 'title', cls: 'name-cell' },
      { label: 'For', field: 'forWhom' },
      { label: 'Date', field: 'dateAdded', render: fmtDate }
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'forWhom', label: 'For', type: 'select', options: ['Everyone','Karan Gupta','Rukmini Gupta','Aahana Gupta','Aarav Gupta'] },
      { name: 'dateAdded', label: 'Date', type: 'date', default: 'today' },
      { name: 'message', label: 'Message', type: 'textarea', required: true }
    ]
  }
};
