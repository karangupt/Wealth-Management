/* Workspace App — Invoice Generator (printable invoice/quotation builder) */

/* ---------- Invoice Generator ---------- */
// Base (pre-GST) amount for one item — area-based (sq.ft × rate/sqft) if
// both are filled in, otherwise Qty × Days × Rate.
function invoiceItemBaseAmount(it) {
  const sqft = Number(it.sqft) || 0;
  const ratePerSqft = Number(it.ratePerSqft) || 0;
  if (sqft > 0 && ratePerSqft > 0) return sqft * ratePerSqft;
  return (Number(it.qty) || 0) * (Number(it.days) || 1) * (Number(it.rate) || 0);
}

function invoiceItemsTotal() {
  return invoiceDraft.items.reduce((s, it) => s + invoiceItemBaseAmount(it), 0);
}

function invoiceItemsGstTotal() {
  return invoiceDraft.items.reduce((s, it) => s + invoiceItemBaseAmount(it) * (Number(it.gstRate) || 0) / 100, 0);
}

function invoiceDiscountAmount() {
  const val = Number(invoiceDraft.discountValue) || 0;
  if (val <= 0) return 0;
  const subtotal = invoiceItemsTotal();
  return invoiceDraft.discountType === 'percent' ? subtotal * val / 100 : Math.min(val, subtotal);
}

function invoiceGrandTotal() {
  return invoiceItemsTotal() + invoiceItemsGstTotal() - invoiceDiscountAmount();
}

function openInvoiceInGenerator(invoiceId) {
  const rec = Store.get('invoices', invoiceId);
  if (!rec) return;

  if (rec.fullDataJson) {
    try {
      invoiceDraft = JSON.parse(rec.fullDataJson);
    } catch (e) {
      console.error('Could not parse saved invoice data, rebuilding a basic draft instead', e);
    }
  }

  if (!rec.fullDataJson) {
    // Older entry created before this feature existed, or added manually —
    // build a best-effort starting draft from whatever fields it does have.
    const customer = rec.customerId ? Store.get('customers', rec.customerId) : null;
    invoiceDraft = {
      docType: rec.docType || 'Tax Invoice',
      invoiceNo: rec.number || '',
      date: rec.date || todayStr(),
      deliveryDate: '',
      duration: '1 Day Only (Four hours only)',
      customerName: rec.customerName || (customer ? customer.name : ''),
      customerAddress: customer ? (customer.companyName || '') : '',
      deliveryAddress: '',
      sameAsCustomer: true,
      customerGST: customer ? (customer.gst || '') : '',
      customerEmail: customer ? (customer.email || '') : '',
      contactPersonName: '',
      contactPersonNumber: customer ? (customer.phone || '') : '',
      poNumber: '',
      items: [{ desc: 'Rental charges', qty: 1, rate: Number(rec.amount || 0) }],
      paid: rec.status === 'paid',
      paymentMode: 'Cash',
      txnId: '',
      paymentDate: ''
    };
  }

  navigateTo('invoiceGen');
}

// "🧾 Generate Invoice" button on a completed Booking row — pre-fills the
// Invoice Generator with that booking's details so it just needs a review
// and Save, instead of retyping everything from scratch.
// If this booking already has a generated invoice (tracked via bookingId
// on the invoice record), that EXISTING invoice is opened for editing
// instead of creating a fresh duplicate with a new number/date.
function generateInvoiceFromBooking(bookingId) {
  const alreadyGenerated = Store.all('invoices').find(inv => inv.bookingId === bookingId);
  if (alreadyGenerated) {
    openInvoiceInGenerator(alreadyGenerated.id);
    return;
  }

  const booking = Store.get('bookings', bookingId);
  if (!booking) return;
  const customer = booking.customerId ? Store.get('customers', booking.customerId) : null;

  let days = 1;
  if (booking.startDate && booking.endDate) {
    const ms = new Date(booking.endDate) - new Date(booking.startDate);
    if (ms >= 0) days = Math.round(ms / 86400000) + 1;
  }
  // booking.amount is the TOTAL for the whole booking — divide by days to
  // get the per-day rate, since the invoice multiplies qty × days × rate.
  const perDayRate = days > 0 ? Number(booking.amount || 0) / days : Number(booking.amount || 0);

  invoiceDraft = {
    docType: 'Tax Invoice',
    invoiceNo: generateNextInvoiceNo(),
    date: todayStr(),
    sourceBookingId: bookingId,
    deliveryDate: booking.endDate || booking.startDate || '',
    duration: days === 1 ? '1 Day Only (Four hours only)' : `${days} Days`,
    customerName: (customer && customer.name) || booking.clientName || '',
    customerAddress: (customer && customer.companyAddress) || booking.companyAddress || (customer && customer.companyName) || booking.companyName || '',
    customerGST: customer ? (customer.gst || '') : '',
    customerPAN: '',
    customerEmail: customer ? (customer.email || '') : '',
    contactPersonName: '',
    contactPersonNumber: customer ? (customer.phone || '') : '',
    poNumber: '',
    deliveryAddress: booking.location || '',
    sameAsCustomer: !booking.location,
    placeOfSupply: 'Maharashtra (27)',
    quotationCategory: 'Rental',
    rentalSubType: 'Projector',
    items: [{
      desc: booking.item || 'Rental charges', qty: 1, days, rate: perDayRate,
      gstRate: 0, longDesc: '', size: '', hsnSac: '', unit: '', sqft: '', ratePerSqft: '', vendorId: '', vendorCost: ''
    }],
    discountType: 'amount',
    discountValue: 0,
    paid: false,
    paymentMode: 'Cash',
    txnId: '',
    paymentDate: ''
  };
  navigateTo('invoiceGen');
}

function renderInvoiceGen() {
  const total = invoiceItemsTotal();
  return `
  <div id="invoiceGenControls">
    <div class="card">
      <div class="section-head"><h2>1. Document details</h2></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px;">
        <div class="field"><label>Document type</label>
          <select id="ig_docType">
            <option value="Quotation" ${invoiceDraft.docType==='Quotation'?'selected':''}>Quotation</option>
            <option value="Provisional Invoice" ${invoiceDraft.docType==='Provisional Invoice'?'selected':''}>Provisional Invoice</option>
            <option value="Tax Invoice" ${invoiceDraft.docType==='Tax Invoice'?'selected':''}>Invoice</option>
          </select>
        </div>
        <div class="field"><label>Invoice number</label><input type="text" id="ig_invoiceNo" value="${invoiceDraft.invoiceNo}" placeholder="e.g. PS/2026/068"></div>
        <div class="field"><label>Date</label><input type="date" id="ig_date" value="${invoiceDraft.date}"></div>
        <div class="field"><label>${invoiceDraft.docType === 'Quotation' ? 'Valid until' : 'Delivery date'}</label><input type="date" id="ig_deliveryDate" value="${invoiceDraft.deliveryDate}"></div>
        <div class="field"><label>Duration</label><input type="text" id="ig_duration" value="${invoiceDraft.duration}"></div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><h2>2. Customer &amp; delivery</h2></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px;">
        <div class="field"><label>Customer name</label><input type="text" id="ig_customerName" value="${invoiceDraft.customerName}"></div>
        <div class="field"><label>Customer address</label><textarea id="ig_customerAddress" rows="3" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:9px 10px; border-radius:7px; font-size:13.5px; font-family:inherit;">${invoiceDraft.customerAddress}</textarea></div>
        <div class="field"><label>Customer GST number</label><input type="text" id="ig_customerGST" value="${invoiceDraft.customerGST}" placeholder="e.g. 27AAACL0582H1ZM"></div>
        <div class="field"><label>Customer email</label><input type="text" id="ig_customerEmail" value="${invoiceDraft.customerEmail}"></div>
        <div class="field"><label>Contact person name</label><input type="text" id="ig_contactPersonName" value="${invoiceDraft.contactPersonName}"></div>
        <div class="field"><label>Contact person number</label><input type="text" id="ig_contactPersonNumber" value="${invoiceDraft.contactPersonNumber}"></div>
        <div class="field"><label>PO / Reference number (optional)</label><input type="text" id="ig_poNumber" value="${invoiceDraft.poNumber}" placeholder="Customer's purchase order no."></div>
        ${invoiceDraft.docType === 'Quotation' ? `
        <div class="field"><label>Customer PAN</label><input type="text" id="ig_customerPAN" value="${invoiceDraft.customerPAN || ''}" placeholder="e.g. AANCR3989D"></div>
        <div class="field"><label>Place of Supply</label><input type="text" id="ig_placeOfSupply" value="${invoiceDraft.placeOfSupply || ''}" placeholder="e.g. Maharashtra (27)"></div>
        ` : ''}
        ${invoiceDraft.docType === 'Quotation' ? `
        <div class="field"><label>Quotation Category</label>
          <select id="ig_quotationCategory">
            <option value="Rental" ${invoiceDraft.quotationCategory === 'Rental' ? 'selected' : ''}>Rental</option>
            <option value="Sale" ${invoiceDraft.quotationCategory === 'Sale' ? 'selected' : ''}>Sale (equipment sold, not rented)</option>
          </select>
        </div>
        ` : ''}
        ${invoiceDraft.docType !== 'Quotation' || invoiceDraft.quotationCategory === 'Rental' ? `
        <div class="field"><label>Rental Type</label>
          <select id="ig_rentalSubType">
            <option value="Projector" ${invoiceDraft.rentalSubType === 'Projector' ? 'selected' : ''}>Projector Rental</option>
            <option value="LEDScreen" ${invoiceDraft.rentalSubType === 'LEDScreen' ? 'selected' : ''}>LED Screen Rental</option>
            <option value="TV" ${invoiceDraft.rentalSubType === 'TV' ? 'selected' : ''}>TV Rental</option>
            <option value="Sound" ${invoiceDraft.rentalSubType === 'Sound' ? 'selected' : ''}>Sound Rental</option>
          </select>
        </div>
        ` : ''}
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12.5px; color:var(--muted); cursor:pointer;">
        <input type="checkbox" id="ig_sameAddr" ${invoiceDraft.sameAsCustomer ? 'checked' : ''} style="accent-color:var(--amber);">
        Delivery address same as customer address
      </label>
      <div class="field" id="ig_deliveryAddrField" style="margin-top:10px; ${invoiceDraft.sameAsCustomer ? 'display:none;' : ''}">
        <label>Delivery address</label>
        <textarea id="ig_deliveryAddress" rows="3" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:9px 10px; border-radius:7px; font-size:13.5px; font-family:inherit;">${invoiceDraft.deliveryAddress}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><h2>3. Items</h2><button class="btn secondary" id="ig_addItem">+ Add item</button></div>
      <datalist id="itemDescPresets">
        <option value="Transportation and Installation">
        <option value="Projector">
        <option value="LED Screen">
        <option value="55&quot; TV with Stand">
        <option value="65&quot; TV with Stand">
        <option value="Speaker + 1 Cordless Mic">
        <option value="Sound System">
        <option value="Screen (8x6 ft)">
        <option value="Screen (10x8 ft)">
        <option value="Laptop">
        <option value="Extension Cable / Power Backup">
      </datalist>
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Description</th><th style="width:70px;">Qty</th><th style="width:70px;">Days</th><th style="width:120px;">Rate</th>${invoiceDraft.docType === 'Quotation' ? '<th style="width:90px;">GST %</th>' : ''}<th style="width:120px;">Amount</th><th></th></tr></thead>
        <tbody>
          ${invoiceDraft.items.map((it, i) => `<tr>
            <td><input type="text" list="itemDescPresets" data-item-field="desc" data-item-idx="${i}" value="${it.desc}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></td>
            <td><input type="number" data-item-field="qty" data-item-idx="${i}" value="${it.qty}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></td>
            <td><input type="number" data-item-field="days" data-item-idx="${i}" value="${it.days != null ? it.days : 1}" min="1" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></td>
            <td><input type="number" data-item-field="rate" data-item-idx="${i}" value="${it.rate}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></td>
            ${invoiceDraft.docType === 'Quotation' ? `<td><input type="number" data-item-field="gstRate" data-item-idx="${i}" value="${it.gstRate != null ? it.gstRate : 18}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></td>` : ''}
            <td class="name-cell" data-item-amount="${i}">${fmt(invoiceItemBaseAmount(it))}</td>
            <td><button data-remove-item="${i}" style="background:none; border:none; color:var(--danger); cursor:pointer; display:flex; align-items:center;"><i data-lucide="x" style="width:14px;height:14px;"></i></button></td>
          </tr>
          <tr><td colspan="${invoiceDraft.docType === 'Quotation' ? 7 : 6}" style="padding-top:0; padding-bottom:12px;">
            <details style="font-size:12px;">
              <summary style="cursor:pointer; color:var(--muted);">+ Extra fields (Size, HSN/SAC, Unit, Sq.Ft pricing, Outsourced vendor) — only filled-in ones show on the printed document</summary>
              <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-top:8px;">
                <div><label style="font-size:11px; color:var(--muted);">Size</label><input type="text" data-item-field="size" data-item-idx="${i}" value="${it.size || ''}" placeholder="e.g. 55 inch" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
                <div><label style="font-size:11px; color:var(--muted);">HSN/SAC</label><input type="text" data-item-field="hsnSac" data-item-idx="${i}" value="${it.hsnSac || ''}" placeholder="e.g. 8528" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
                <div><label style="font-size:11px; color:var(--muted);">Unit</label><input type="text" data-item-field="unit" data-item-idx="${i}" value="${it.unit || ''}" placeholder="e.g. Sq.Ft / Nos" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
                <div><label style="font-size:11px; color:var(--muted);">Total Sq.Ft</label><input type="number" data-item-field="sqft" data-item-idx="${i}" value="${it.sqft || ''}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
                <div><label style="font-size:11px; color:var(--muted);">Rate / Sq.Ft (₹)</label><input type="number" data-item-field="ratePerSqft" data-item-idx="${i}" value="${it.ratePerSqft || ''}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-top:8px; border-top:1px dashed var(--line); padding-top:8px;">
                <div>
                  <label style="font-size:11px; color:var(--muted);">Outsourced to vendor (never shown to customer)</label>
                  <select data-item-field="vendorId" data-item-idx="${i}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;">
                    <option value="">— Not outsourced —</option>
                    ${Store.all('vendors').map(v => `<option value="${v.id}" ${it.vendorId === v.id ? 'selected' : ''}>${v.name}</option>`).join('')}
                  </select>
                </div>
                <div><label style="font-size:11px; color:var(--muted);">What you pay that vendor (₹)</label><input type="number" data-item-field="vendorCost" data-item-idx="${i}" value="${it.vendorCost || ''}" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:13px;"></div>
              </div>
              <p style="color:var(--muted); font-size:11px; margin-top:6px;">Fill Total Sq.Ft + Rate/Sq.Ft to price this item by area instead of Qty×Days×Rate. If outsourced, saving this invoice auto-logs the vendor cost as a Corporate expense — your Reports profit reflects only your actual commission.</p>
            </details>
          </td></tr>
          ${invoiceDraft.docType === 'Quotation' ? `<tr><td colspan="7" style="padding-top:0;">
            <textarea data-item-field="longDesc" data-item-idx="${i}" rows="2" placeholder="Detailed product description for this item (optional)..." style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); padding:6px 8px; border-radius:6px; font-size:12.5px; font-family:inherit;">${it.longDesc || ''}</textarea>
          </td></tr>` : ''}`).join('')}
        </tbody>
      </table></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; align-items:center; margin-top:12px;">
        <label style="font-size:12.5px; color:var(--muted);">Discount</label>
        <select id="ig_discountType" style="width:auto;">
          <option value="amount" ${invoiceDraft.discountType === 'amount' ? 'selected' : ''}>₹</option>
          <option value="percent" ${invoiceDraft.discountType === 'percent' ? 'selected' : ''}>%</option>
        </select>
        <input type="number" id="ig_discountValue" value="${invoiceDraft.discountValue || 0}" min="0" style="width:100px;">
      </div>
      ${invoiceDraft.docType === 'Provisional Invoice' ? `
      <div style="display:flex; justify-content:flex-end; gap:10px; align-items:center; margin-top:10px;">
        <label style="font-size:12.5px; color:var(--muted);">Advance Received (₹)</label>
        <input type="number" id="ig_advanceAmount" value="${invoiceDraft.advanceAmount || 0}" min="0" style="width:120px;">
      </div>
      ` : ''}
      <p id="ig_subtotalLine" style="text-align:right; margin-top:6px; font-size:12.5px; color:var(--muted);">Subtotal: ${fmt(total)}${invoiceDiscountAmount() > 0 ? ` &nbsp;·&nbsp; Discount: −${fmt(invoiceDiscountAmount())}` : ''}</p>
      <p style="text-align:right; margin-top:2px; font-family:var(--font-mono); font-size:15px;">Total: <strong id="ig_totalAmount" style="color:var(--amber);">${fmt(invoiceGrandTotal())}</strong></p>
      ${invoiceDraft.docType === 'Provisional Invoice' && Number(invoiceDraft.advanceAmount) > 0 ? `
      <p id="ig_balanceLine" style="text-align:right; margin-top:2px; font-size:12.5px; color:var(--muted);">Advance: ${fmt(invoiceDraft.advanceAmount)} &nbsp;·&nbsp; Balance Due: <strong style="color:var(--text);">${fmt(invoiceGrandTotal() - Number(invoiceDraft.advanceAmount))}</strong></p>
      ` : ''}
    </div>

    ${invoiceDraft.docType !== 'Quotation' ? `
    <div class="card">
      <div class="section-head"><h2>4. Payment</h2></div>
      <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--muted); cursor:pointer;">
        <input type="checkbox" id="ig_paid" ${invoiceDraft.paid ? 'checked' : ''} style="accent-color:var(--amber);">
        Mark as PAID (adds a payment confirmation block + stamp)
      </label>
      <div id="ig_paidFields" style="display:${invoiceDraft.paid ? '' : 'none'}; margin-top:14px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px;">
          <div class="field"><label>Payment mode</label>
            <select id="ig_paymentMode">
              ${['Cash','UPI','Bank Transfer','Cheque','Credit Card'].map(m => `<option value="${m}" ${invoiceDraft.paymentMode===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Payment received on</label><input type="date" id="ig_paymentDate" value="${invoiceDraft.paymentDate}"></div>
          <div class="field" id="ig_txnIdField" style="${invoiceDraft.paymentMode === 'Cash' ? 'display:none;' : ''}">
            <label>Transaction ID / Reference No.</label>
            <input type="text" id="ig_txnId" value="${invoiceDraft.txnId || ''}" placeholder="UTR / UPI Ref / Cheque No.">
          </div>
        </div>
      </div>
    </div>` : ''}

    <div style="display:flex; gap:10px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="btn" id="ig_generate">Generate preview</button>
      <button class="btn secondary" id="ig_print">🖨 Print / Save as PDF</button>
      <button class="btn secondary" id="ig_saveRecord">💾 Save to Invoice records</button>
    </div>
    <p id="ig_saveStatus" style="color:var(--muted); font-size:12px; margin-top:-14px; margin-bottom:24px;"></p>
  </div>

  <div id="invoicePrintArea">${renderInvoicePrintable()}</div>`;
}

function renderInvoicePrintable() {
  if (invoiceDraft.docType === 'Quotation') return renderQuotationDocument();

  const total = invoiceItemsTotal(); // pre-tax subtotal (base amounts only)
  const itemsGstTotal = invoiceItemsGstTotal();
  const discount = invoiceDiscountAmount();
  const grandTotal = invoiceGrandTotal();
  const deliveryAddr = invoiceDraft.sameAsCustomer ? invoiceDraft.customerAddress : invoiceDraft.deliveryAddress;
  const title = invoiceDraft.docType === 'Quotation' ? 'QUOTATION'
    : invoiceDraft.docType === 'Provisional Invoice' ? 'PROVISIONAL INVOICE – CUM – DELIVERY CHALLAN'
    : 'INVOICE';

  // UPI payment QR — scanning it opens the customer's UPI app (GPay/PhonePe/
  // etc.) with the payee, amount, and invoice number already filled in.
  // Not shown on Quotations, since there's nothing to pay yet.
  const upiUri = `upi://pay?pa=${encodeURIComponent(COMPANY_INFO.upiId)}&pn=${encodeURIComponent(COMPANY_INFO.name)}&am=${encodeURIComponent(grandTotal)}&cu=INR&tn=${encodeURIComponent('Invoice ' + (invoiceDraft.invoiceNo || ''))}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUri)}`;

  return `
  <div class="invoice-sheet">
    <div class="invoice-title">${title}</div>
    <div class="invoice-header-row">
      <div class="invoice-company">
        <div class="invoice-company-name">${COMPANY_INFO.name}</div>
        <div>${COMPANY_INFO.tagline}</div>
        ${COMPANY_INFO.addressLines.map(l => `<div>${l}</div>`).join('')}
        <div>Mobile: ${COMPANY_INFO.mobile}</div>
        <div>Email: ${COMPANY_INFO.email}</div>
        <div style="margin-top:6px;">(MSME) Udyam Registration No.: ${COMPANY_INFO.udyam}</div>
        <div>PAN: ${COMPANY_INFO.pan}</div>
        <div>GSTIN: ${COMPANY_INFO.gstNote}</div>
      </div>
      <div class="invoice-meta">
        <img src="${LOGO_IMG}" alt="Projector Solutions" style="width:90px; display:block; margin-bottom:8px; margin-left:auto;">
        <table>
          <tr><td>Invoice No:</td><td>${invoiceDraft.invoiceNo || '—'}</td></tr>
          <tr><td>Dated:</td><td>${fmtDate(invoiceDraft.date)}</td></tr>
          <tr><td>${invoiceDraft.docType === 'Quotation' ? 'Valid Until:' : 'Delivery Dated:'}</td><td>${fmtDate(invoiceDraft.deliveryDate)}</td></tr>
          <tr><td>Duration:</td><td>${invoiceDraft.duration}</td></tr>
        </table>
      </div>
    </div>

    <div class="invoice-addr-row">
      <div><strong>Customer Details / Bill To:</strong><br><strong>${invoiceDraft.customerName}</strong><br>${(invoiceDraft.customerAddress||'').replace(/\n/g,'<br>')}
        ${invoiceDraft.customerGST ? `<br>GSTIN: ${invoiceDraft.customerGST}` : ''}
        ${invoiceDraft.customerEmail ? `<br>Email: ${invoiceDraft.customerEmail}` : ''}
        ${invoiceDraft.contactPersonName ? `<br>Contact: ${invoiceDraft.contactPersonName}${invoiceDraft.contactPersonNumber ? ' (' + invoiceDraft.contactPersonNumber + ')' : ''}` : ''}
        ${!invoiceDraft.contactPersonName && invoiceDraft.contactPersonNumber ? `<br>Contact No.: ${invoiceDraft.contactPersonNumber}` : ''}
        ${invoiceDraft.poNumber ? `<br>PO/Ref No.: ${invoiceDraft.poNumber}` : ''}
      </div>
      <div><strong>${invoiceDraft.docType === 'Quotation' ? 'Site / Venue Address:' : 'Delivery Address:'}</strong><br>${(deliveryAddr||'').replace(/\n/g,'<br>')}</div>
    </div>

    ${(() => {
      const items = invoiceDraft.items;
      const has = f => items.some(it => it[f] !== '' && it[f] != null && it[f] !== 0);
      const showSize = has('size'), showHsn = has('hsnSac'), showUnit = has('unit'),
            showSqft = has('sqft') && has('ratePerSqft'), showGst = has('gstRate');
      const cols = [
        { key: 'si', label: 'SI No' },
        { key: 'desc', label: 'Description of Goods' },
        ...(showSize ? [{ key: 'size', label: 'Size' }] : []),
        ...(showHsn ? [{ key: 'hsnSac', label: 'HSN/SAC' }] : []),
        { key: 'qty', label: 'Quantity' },
        { key: 'days', label: 'Days' },
        ...(showUnit ? [{ key: 'unit', label: 'Unit' }] : []),
        ...(showSqft ? [{ key: 'sqft', label: 'Total Sq.Ft' }, { key: 'ratePerSqft', label: 'Rate/Sq.Ft' }] : []),
        { key: 'rate', label: 'Rate' },
        ...(showGst ? [{ key: 'taxable', label: 'Taxable Amount' }, { key: 'gst', label: 'GST' }] : []),
        { key: 'amount', label: 'Amount' }
      ];
      const cellFor = (it, key) => {
        const base = invoiceItemBaseAmount(it);
        const gstAmt = base * (Number(it.gstRate) || 0) / 100;
        switch (key) {
          case 'si': return '';
          case 'desc': return it.desc || '';
          case 'size': return it.size || '';
          case 'hsnSac': return it.hsnSac || '';
          case 'qty': return it.qty;
          case 'days': return it.days || 1;
          case 'unit': return it.unit || '';
          case 'sqft': return it.sqft || '';
          case 'ratePerSqft': return it.ratePerSqft ? fmt(it.ratePerSqft) : '';
          case 'rate': return it.rate ? fmt(it.rate) : '';
          case 'taxable': return fmt(base);
          case 'gst': return it.gstRate ? `${fmt(gstAmt)} (${it.gstRate}%)` : fmt(0);
          case 'amount': return fmt(base + gstAmt);
        }
      };
      return `
    <table class="invoice-items">
      <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${items.map((it, i) => `<tr>${cols.map(c => `<td>${c.key === 'si' ? i + 1 : cellFor(it, c.key)}</td>`).join('')}</tr>`).join('')}
        ${Array.from({length: Math.max(0, 6 - items.length)}).map(() => `<tr>${cols.map(() => '<td>&nbsp;</td>').join('')}</tr>`).join('')}
        ${invoiceDraft.paid && invoiceDraft.docType !== 'Quotation' ? `<tr><td colspan="${cols.length}" style="padding-top:16px;">
          <strong>Payment Confirmation</strong><br>
          This is to confirm that payment against the below invoice has been successfully received.<br><br>
          <em>Invoice No.: ${invoiceDraft.invoiceNo}<br>
          Invoice Amount: ${fmt(grandTotal)}<br>
          Payment Mode: ${invoiceDraft.paymentMode}<br>
          Payment Received On: ${fmtDate(invoiceDraft.paymentDate)}<br>
          ${invoiceDraft.paymentMode !== 'Cash' && invoiceDraft.txnId ? `Transaction ID: ${invoiceDraft.txnId}<br>` : ''}
          Status: PAID</em>
        </td></tr>` : ''}
      </tbody>
      <tfoot>
        ${(itemsGstTotal > 0 || discount > 0) ? `<tr><td colspan="${cols.length - 1}" style="text-align:right;">Subtotal</td><td>${fmt(total)}</td></tr>` : ''}
        ${itemsGstTotal > 0 ? `<tr><td colspan="${cols.length - 1}" style="text-align:right;">GST Total</td><td>${fmt(itemsGstTotal)}</td></tr>` : ''}
        ${discount > 0 ? `<tr><td colspan="${cols.length - 1}" style="text-align:right;">Discount</td><td>−${fmt(discount)}</td></tr>` : ''}
        <tr><td colspan="${cols.length - 1}" style="text-align:right;"><strong>Total</strong></td><td><strong>${fmt(grandTotal)}</strong></td></tr>
        ${invoiceDraft.docType === 'Provisional Invoice' && Number(invoiceDraft.advanceAmount) > 0 ? `
        <tr><td colspan="${cols.length - 1}" style="text-align:right;">Advance Received</td><td>−${fmt(invoiceDraft.advanceAmount)}</td></tr>
        <tr><td colspan="${cols.length - 1}" style="text-align:right;"><strong>Balance Due</strong></td><td><strong>${fmt(grandTotal - Number(invoiceDraft.advanceAmount))}</strong></td></tr>
        ` : ''}
      </tfoot>
    </table>`;
    })()}

    <div class="invoice-words-row">
      <div>Amount Chargeable (in words)<br><strong>Indian Rupees: ${numToWordsIndian(grandTotal)} Only</strong></div>
      <div style="text-align:right;">E. &amp; O.E</div>
    </div>

    <div class="invoice-terms">
      ${invoiceDraft.docType === 'Provisional Invoice' || invoiceDraft.docType === 'Tax Invoice' ? `
      <strong>Terms &amp; Conditions:</strong>
      <ol>${RENTAL_TERMS[invoiceDraft.rentalSubType || 'Projector'].map(t => `<li>${t}</li>`).join('')}</ol>
      ` : ''}
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <strong>Mode of Payment: Only Digital Payments Accepted (Bank Transfer / UPI / NEFT / RTGS). Cash Payment Not Accepted.</strong><br>
          GPay: UPI ID: ${COMPANY_INFO.upiId}<br>
          Online Payment Link: <a href="${COMPANY_INFO.paymentLink}">${COMPANY_INFO.paymentLink}</a><br>
          *If payment is made using a Credit Card, an additional 2.5% processing charge will be applicable
        </div>
        <div style="text-align:center; flex-shrink:0;">
          <img src="${qrImgUrl}" alt="Scan to Pay via UPI" style="width:100px; height:100px;">
          <div style="font-size:9px; color:#666; margin-top:2px;">Scan to Pay via UPI</div>
        </div>
      </div>
    </div>

    <div class="invoice-bank-sign">
      <div>
        <strong>Bank Details: (For Cheque Payment / NEFT / RTGS Transfer)</strong><br>
        Bank Name: ${COMPANY_INFO.bankName}<br>
        A/c No.: ${COMPANY_INFO.bankAccNo}<br>
        A/c Name: ${COMPANY_INFO.bankAccName}<br>
        Branch &amp; IFS Code: ${COMPANY_INFO.bankBranchIfsc}
      </div>
      <div style="text-align:center; position:relative;">
        ${invoiceDraft.paid && invoiceDraft.docType !== 'Quotation' ? `<img src="${PAID_STAMP_IMG}" alt="Paid" style="position:absolute; width:120px; height:120px; left:-90px; top:-8px; opacity:0.88; z-index:2;">` : ''}
        <div>For ${COMPANY_INFO.name}</div>
        <img src="${SIGNATURE_IMG}" alt="Signature" style="height:45px; margin-top:6px;">
        <div style="margin-top:6px;">Authorised Signatory</div>
      </div>
    </div>
  </div>`;
}

// A separate, GST-style quotation layout (purple header, per-item GST/CGST/
// SGST columns, detailed product descriptions) — used only when Document
// type = Quotation. Invoices and Provisional Invoices keep the regular
// layout above.
function renderQuotationDocument() {
  const isInvoice = invoiceDraft.docType === 'Tax Invoice';
  const validTill = invoiceDraft.deliveryDate ? fmtDate(invoiceDraft.deliveryDate) : '—';
  let subTotal = 0, cgstTotal = 0, sgstTotal = 0;
  const rows = invoiceDraft.items.map((it, i) => {
    const qty = Number(it.qty) || 0;
    const days = Number(it.days) || 1;
    const rate = Number(it.rate) || 0;
    const gstRate = it.gstRate != null ? Number(it.gstRate) : 18;
    const amount = invoiceItemBaseAmount(it);
    const cgst = amount * gstRate / 200;
    const sgst = amount * gstRate / 200;
    const rowTotal = amount + cgst + sgst;
    subTotal += amount; cgstTotal += cgst; sgstTotal += sgst;
    return `
      <tr>
        <td style="width:26px;">${i + 1}.</td>
        <td>${it.desc || ''}</td>
        <td style="text-align:center;">${gstRate}%</td>
        <td style="text-align:center;">${qty}</td>
        <td style="text-align:center;">${days}</td>
        <td style="text-align:right;">${fmt(rate)}</td>
        <td style="text-align:right;">${fmt(amount)}</td>
        <td style="text-align:right;">${fmt(cgst)}</td>
        <td style="text-align:right;">${fmt(sgst)}</td>
        <td style="text-align:right;">${fmt(rowTotal)}</td>
      </tr>
      ${it.longDesc ? `<tr><td></td><td colspan="9" style="font-size:10.5px; color:#444; padding-top:0;">${it.longDesc.replace(/\n/g, '<br>')}</td></tr>` : ''}
    `;
  }).join('');
  const discount = invoiceDiscountAmount();
  const grandTotal = subTotal + cgstTotal + sgstTotal - discount;

  // UPI payment QR — only relevant for an actual Invoice, not a Quotation
  // (nothing to pay yet at quotation stage).
  const upiUri = `upi://pay?pa=${encodeURIComponent(COMPANY_INFO.upiId)}&pn=${encodeURIComponent(COMPANY_INFO.name)}&am=${encodeURIComponent(grandTotal)}&cu=INR&tn=${encodeURIComponent('Invoice ' + (invoiceDraft.invoiceNo || ''))}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(upiUri)}`;

  return `
  <div class="invoice-sheet q-sheet">
    <div class="q-header-row">
      <div>
        <div class="q-title">${isInvoice ? 'Invoice' : 'Quotation'}</div>
        <table class="q-meta-table">
          <tr><td>${isInvoice ? 'Invoice No' : 'Quotation No'}</td><td><strong>${invoiceDraft.invoiceNo || '—'}</strong></td></tr>
          <tr><td>${isInvoice ? 'Invoice Date' : 'Quotation Date'}</td><td>${fmtDate(invoiceDraft.date)}</td></tr>
          ${isInvoice ? `<tr><td>Delivery Date</td><td>${validTill}</td></tr>` : `<tr><td>Valid Till Date</td><td>${validTill}</td></tr>`}
        </table>
      </div>
      <div class="q-logo-box">
        <img src="${LOGO_IMG}" alt="Projector Solutions" style="width:120px; display:block;">
      </div>
    </div>

    <div class="q-addr-row">
      <div class="q-addr-box">
        <div class="q-addr-heading">${isInvoice ? "Invoice From" : "Quotation From"}</div>
        <strong>${COMPANY_INFO.name}</strong><br>
        ${COMPANY_INFO.addressLines.join('<br>')}<br>
        (MSME) Udyam Registration No.: ${COMPANY_INFO.udyam}<br>
        PAN: ${COMPANY_INFO.pan}<br>
        Phone: ${COMPANY_INFO.mobile}
      </div>
      <div class="q-addr-box">
        <div class="q-addr-heading">${isInvoice ? "Bill To" : "Quotation For"}</div>
        <strong>${invoiceDraft.customerName || '—'}</strong><br>
        ${(invoiceDraft.customerAddress || '').replace(/\n/g, '<br>')}<br>
        ${invoiceDraft.customerGST ? `GSTIN: ${invoiceDraft.customerGST}<br>` : ''}
        ${invoiceDraft.customerPAN ? `PAN: ${invoiceDraft.customerPAN}<br>` : ''}
        ${invoiceDraft.customerEmail ? `Email: ${invoiceDraft.customerEmail}` : ''}
      </div>
    </div>

    <div class="q-supply-row">
      <div><strong>Country of Supply:</strong> India</div>
      <div><strong>Place of Supply:</strong> ${invoiceDraft.placeOfSupply || '—'}</div>
    </div>

    <table class="q-items-table">
      <thead>
        <tr>
          <th></th><th>Item</th><th>GST Rate</th><th>Quantity</th><th>Days</th><th>Rate</th><th>Amount</th><th>CGST</th><th>SGST</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="q-totals-box">
      <table>
        <tr><td>Amount</td><td>${fmt(subTotal)}</td></tr>
        <tr><td>CGST</td><td>${fmt(cgstTotal)}</td></tr>
        <tr><td>SGST</td><td>${fmt(sgstTotal)}</td></tr>
        ${discount > 0 ? `<tr><td>Discount</td><td>−${fmt(discount)}</td></tr>` : ''}
        <tr class="q-grand-total"><td>Total (INR)</td><td>${fmt(grandTotal)}</td></tr>
      </table>
    </div>

    <p style="margin-top:10px; font-size:11px;">Amount Chargeable (in words): <strong>Indian Rupees ${numToWordsIndian(Math.round(grandTotal))} Only</strong></p>

    ${isInvoice ? `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-top:16px; border-top:1px solid #ddd; padding-top:12px;">
      <div style="font-size:11px;">
        <strong>Mode of Payment: Only Digital Payments Accepted (Bank Transfer / UPI / NEFT / RTGS). Cash Payment Not Accepted.</strong><br>
        GPay: UPI ID: ${COMPANY_INFO.upiId}<br>
        Online Payment Link: <a href="${COMPANY_INFO.paymentLink}">${COMPANY_INFO.paymentLink}</a><br>
        *If payment is made using a Credit Card, an additional 2.5% processing charge will be applicable
        ${invoiceDraft.paid ? `
        <div style="margin-top:10px;">
          <strong>Payment Confirmation</strong><br>
          This is to confirm that payment against the below invoice has been successfully received.<br>
          Invoice No.: ${invoiceDraft.invoiceNo}<br>
          Invoice Amount: ${fmt(grandTotal)}<br>
          Payment Mode: ${invoiceDraft.paymentMode}<br>
          Payment Received On: ${fmtDate(invoiceDraft.paymentDate)}<br>
          ${invoiceDraft.paymentMode !== 'Cash' && invoiceDraft.txnId ? `Transaction ID: ${invoiceDraft.txnId}<br>` : ''}
          Status: PAID
        </div>` : ''}
      </div>
      <div style="text-align:center; flex-shrink:0;">
        <img src="${qrImgUrl}" alt="Scan to Pay via UPI" style="width:100px; height:100px;">
        <div style="font-size:9px; color:#666; margin-top:2px;">Scan to Pay via UPI</div>
      </div>
    </div>

    <div style="margin-top:14px; font-size:10px; line-height:1.5;">
      <strong>Bank Details: (For Cheque Payment / NEFT / RTGS Transfer)</strong><br>
      Bank Name: ${COMPANY_INFO.bankName} · A/c No.: ${COMPANY_INFO.bankAccNo} · A/c Name: ${COMPANY_INFO.bankAccName} · Branch &amp; IFSC: ${COMPANY_INFO.bankBranchIfsc}
    </div>
    ` : ''}

    ${!isInvoice && invoiceDraft.quotationCategory === 'Rental' ? `
    <div class="invoice-terms" style="margin-top:14px;">
      <strong>Terms &amp; Conditions:</strong>
      <ol>${RENTAL_TERMS[invoiceDraft.rentalSubType || 'Projector'].map(t => `<li>${t}</li>`).join('')}</ol>
    </div>
    ` : ''}

    <div class="q-footer">
      This is an electronically generated document, no signature is required.<br>
      For any enquiry, reach out via email at ${COMPANY_INFO.email} / call on ${COMPANY_INFO.mobile}
    </div>
  </div>`;
}

function wireInvoiceGen() {
  const root = $('#viewRoot');
  const bind = (id, prop, evt = 'input') => {
    root.querySelector('#' + id)?.addEventListener(evt, (e) => {
      invoiceDraft[prop] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      wireInvoiceGenRefresh();
    });
  };
  root.querySelector('#ig_docType')?.addEventListener('change', (e) => {
    invoiceDraft.docType = e.target.value;
    render();
  });
  bind('ig_invoiceNo', 'invoiceNo');
  bind('ig_date', 'date');
  bind('ig_deliveryDate', 'deliveryDate');
  bind('ig_duration', 'duration');
  bind('ig_customerName', 'customerName');
  bind('ig_customerAddress', 'customerAddress');
  bind('ig_customerGST', 'customerGST');
  bind('ig_customerPAN', 'customerPAN');
  bind('ig_placeOfSupply', 'placeOfSupply');
  bind('ig_discountType', 'discountType', 'change');
  bind('ig_discountValue', 'discountValue');
  bind('ig_advanceAmount', 'advanceAmount');

  root.querySelector('#ig_quotationCategory')?.addEventListener('change', (e) => {
    invoiceDraft.quotationCategory = e.target.value;
    render();
  });
  root.querySelector('#ig_rentalSubType')?.addEventListener('change', (e) => {
    invoiceDraft.rentalSubType = e.target.value;
  });
  bind('ig_customerEmail', 'customerEmail');
  bind('ig_contactPersonName', 'contactPersonName');
  bind('ig_contactPersonNumber', 'contactPersonNumber');
  bind('ig_poNumber', 'poNumber');
  bind('ig_deliveryAddress', 'deliveryAddress');
  bind('ig_paymentMode', 'paymentMode', 'change');
  bind('ig_paymentDate', 'paymentDate');
  bind('ig_txnId', 'txnId');

  root.querySelector('#ig_paymentMode')?.addEventListener('change', (e) => {
    const txnField = root.querySelector('#ig_txnIdField');
    if (txnField) txnField.style.display = e.target.value === 'Cash' ? 'none' : '';
  });

  root.querySelector('#ig_sameAddr')?.addEventListener('change', (e) => {
    invoiceDraft.sameAsCustomer = e.target.checked;
    render();
  });
  root.querySelector('#ig_paid')?.addEventListener('change', (e) => {
    invoiceDraft.paid = e.target.checked;
    render();
  });

  root.querySelectorAll('[data-item-field]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.itemIdx);
      const field = input.dataset.itemField;
      invoiceDraft.items[idx][field] = (field === 'desc' || field === 'longDesc' || field === 'size' || field === 'hsnSac' || field === 'unit' || field === 'vendorId') ? input.value : Number(input.value);
      if (field === 'days') {
        // Keep the Duration text in sync automatically — no more manually
        // typing "3 Days" separately from the Days column.
        const maxDays = Math.max(1, ...invoiceDraft.items.map(it => Number(it.days) || 1));
        invoiceDraft.duration = maxDays === 1 ? '1 Day Only (Four hours only)' : `${maxDays} Days`;
        const durationInput = root.querySelector('#ig_duration');
        if (durationInput) durationInput.value = invoiceDraft.duration;
      }
      // Live-update just this row's Amount cell (not the whole table), so
      // typing Qty/Days/Rate/Sq.Ft shows the new amount immediately instead
      // of only after Save.
      if (['qty', 'days', 'rate', 'sqft', 'ratePerSqft'].includes(field)) {
        const amountCell = root.querySelector(`[data-item-amount="${idx}"]`);
        if (amountCell) amountCell.textContent = fmt(invoiceItemBaseAmount(invoiceDraft.items[idx]));
      }
      wireInvoiceGenRefresh();
    });
  });

  root.querySelector('#ig_addItem')?.addEventListener('click', () => {
    invoiceDraft.items.push({ desc: '', qty: 1, days: 1, rate: 0, gstRate: 0, longDesc: '', size: '', hsnSac: '', unit: '', sqft: '', ratePerSqft: '' });
    render();
  });

  root.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeItem);
      if (invoiceDraft.items.length > 1) invoiceDraft.items.splice(idx, 1);
      render();
    });
  });

  root.querySelector('#ig_saveRecord')?.addEventListener('click', () => {
    const status = $('#ig_saveStatus');
    if (!invoiceDraft.invoiceNo) {
      status.style.color = 'var(--danger)';
      status.textContent = 'Add an Invoice Number first — it\'s used to find/update the record.';
      return;
    }
    const total = invoiceGrandTotal();
    const cleanInvoiceNo = invoiceDraft.invoiceNo.trim();
    const existing = Store.all('invoices').find(inv => (inv.number || '').trim() === cleanInvoiceNo);
    // Store both the flat summary fields (used by Dashboard/Reports revenue
    // calculations) AND the full snapshot as JSON, so this exact invoice can
    // be reopened, edited, reprinted, or resent to the customer anytime —
    // nothing is lost after you close this page.
    const record = {
      number: cleanInvoiceNo,
      date: invoiceDraft.date,
      amount: total,
      status: invoiceDraft.paid ? 'paid' : 'unpaid',
      customerName: invoiceDraft.customerName,
      docType: invoiceDraft.docType,
      bookingId: invoiceDraft.sourceBookingId || null,
      fullDataJson: JSON.stringify(invoiceDraft)
    };
    if (existing) {
      Store.update('invoices', existing.id, record);
    } else {
      Store.add('invoices', record);
    }
    const savedId = existing ? existing.id : Store.all('invoices').find(inv => (inv.number || '').trim() === cleanInvoiceNo).id;

    // Auto-create a matching Payments entry the moment an invoice is marked
    // paid — so it shows up in Payments without a separate manual entry.
    const wasAlreadyPaid = existing && existing.status === 'paid';
    if (invoiceDraft.paid && !wasAlreadyPaid) {
      const alreadyLogged = invoicePaidSoFar(savedId);
      const remaining = total - alreadyLogged;
      if (remaining > 0) {
        Store.add('payments', {
          invoiceId: savedId,
          date: invoiceDraft.paymentDate || todayStr(),
          amount: remaining,
          mode: invoiceDraft.paymentMode || 'Bank Transfer'
        });
        syncCollection('payments');
      }
    }

    syncCollection('invoice');

    // Outsourced equipment: any item with a vendor + cost filled in gets
    // logged as a Corporate expense automatically. Old auto-logged expenses
    // for this invoice are cleared first so editing/re-saving doesn't pile
    // up duplicates — Reports' profit then reflects your real commission
    // (full invoice amount as revenue, vendor cost as an expense), while
    // the customer's printed invoice never shows any of this.
    Store.all('expenses')
      .filter(e => e.sourceInvoiceId === savedId)
      .forEach(e => Store.remove('expenses', e.id));
    let vendorExpenseCount = 0;
    invoiceDraft.items.forEach(it => {
      const cost = Number(it.vendorCost) || 0;
      if (it.vendorId && cost > 0) {
        const vendor = Store.get('vendors', it.vendorId);
        Store.add('expenses', {
          date: invoiceDraft.date,
          category: 'Vendor Outsourcing / Subcontracting',
          expenseType: 'Corporate',
          desc: `${it.desc || 'Item'} — outsourced to ${vendor ? vendor.name : 'vendor'} (Invoice ${cleanInvoiceNo})`,
          paymentMode: 'Bank Transfer',
          amount: cost,
          sourceInvoiceId: savedId
        });
        vendorExpenseCount++;
      }
    });
    if (vendorExpenseCount > 0) syncCollection('expense');

    status.style.color = 'var(--teal)';
    status.textContent = `Saved (${existing ? 'updated' : 'new'}). Find it anytime in "Quotation & Invoice" — click "Open" on that row to reprint or resend it.`;
  });

  root.querySelector('#ig_generate')?.addEventListener('click', () => {
    $('#invoicePrintArea').innerHTML = renderInvoicePrintable();
    $('#invoicePrintArea').scrollIntoView({ behavior: 'smooth' });
  });

  root.querySelector('#ig_print')?.addEventListener('click', () => {
    $('#invoicePrintArea').innerHTML = renderInvoicePrintable();
    const originalTitle = document.title;
    const cleanName = (invoiceDraft.customerName || 'Invoice').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Invoice';
    document.title = `${cleanName} - ${invoiceDraft.invoiceNo || 'Invoice'}`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 500);
  });
}

// Lightweight refresh: just updates the live total/preview without a full
// re-render, so the form doesn't lose focus while typing.
function wireInvoiceGenRefresh() {
  const subtotalEl = document.querySelector('#ig_subtotalLine');
  const totalEl = document.querySelector('#ig_totalAmount');
  const balanceEl = document.querySelector('#ig_balanceLine');
  const subtotal = invoiceItemsTotal();
  const discount = invoiceDiscountAmount();
  if (subtotalEl) subtotalEl.innerHTML = `Subtotal: ${fmt(subtotal)}${discount > 0 ? ` &nbsp;·&nbsp; Discount: −${fmt(discount)}` : ''}`;
  if (totalEl) totalEl.textContent = fmt(invoiceGrandTotal());
  if (balanceEl && Number(invoiceDraft.advanceAmount) > 0) {
    balanceEl.innerHTML = `Advance: ${fmt(invoiceDraft.advanceAmount)} &nbsp;·&nbsp; Balance Due: <strong style="color:var(--text);">${fmt(invoiceGrandTotal() - Number(invoiceDraft.advanceAmount))}</strong>`;
  }
}
