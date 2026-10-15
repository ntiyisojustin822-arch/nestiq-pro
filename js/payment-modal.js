/* NestIQ Pro — in-app multi-step payment wizard (shared by tenant rent + landlord billing) */
(function () {
  'use strict';

  function nqPayEscHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nqOpenPaymentModalHtml(html) {
    const box = document.getElementById('modalContent');
    if (!box) {
      console.warn('[NestIQ] modalContent missing — cannot open payment modal');
      return false;
    }
    box.innerHTML = html;
    if (typeof nestiqOpenModalAnimated === 'function') nestiqOpenModalAnimated();
    else {
      const o = document.getElementById('modalOverlay');
      if (o) o.classList.add('open');
    }
    return true;
  }

  function nqClosePaymentModal() {
    const after = window._nqPayAfterClose;
    window._nqPayAfterClose = null;
    if (typeof nestiqCloseModalAnimated === 'function') nestiqCloseModalAnimated();
    else if (typeof closeModal === 'function') closeModal();
    else {
      const o = document.getElementById('modalOverlay');
      if (o) o.classList.remove('open');
    }
    if (typeof after === 'function') {
      setTimeout(function () {
        try { after(); } catch (_e) {}
      }, 280);
    }
  }

  function nqPayInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '•';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function nestiqShowInAppPaymentModal(opts) {
    opts = opts || {};
    const amount = Number(opts.amount || 0);
    const description = String(opts.description || 'Payment');
    const onSuccess = opts.onSuccess || function () {};
    const onCancel = opts.onCancel || function () {};
    const title = String(opts.title || 'Secure Payment');
    const icon = String(opts.icon || '🏦');
    const payeeName = String(opts.payeeName || '').trim();
    const payeeBank = String(opts.payeeBank || '').trim();
    const isPayout = String(opts.kind || '').toLowerCase() === 'payout' || !!payeeName;
    const onDownloadReceipt = typeof opts.onDownloadReceipt === 'function' ? opts.onDownloadReceipt : null;
    const hasReceipt = !!onDownloadReceipt;
    const descEsc = nqPayEscHtml(description);
    const isMoveIn = String(opts.kind || '').toLowerCase() === 'movein' || String(opts.kind || '').toLowerCase() === 'move_in';
    const amountLbl = amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateLbl = new Date().toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const payeeCard = payeeName ? `
        <div class="nq-pay-payee">
          <div class="nq-pay-payee-av" aria-hidden="true">${nqPayEscHtml(nqPayInitials(payeeName))}</div>
          <div>
            <div class="nq-pay-payee-kicker">Paying to</div>
            <div class="nq-pay-payee-name">${nqPayEscHtml(payeeName)}</div>
            ${payeeBank ? `<div class="nq-pay-payee-bank">${nqPayEscHtml(payeeBank)}</div>` : '<div class="nq-pay-payee-bank">Bank details will appear on the receipt</div>'}
          </div>
        </div>` : '';
    const continueLbl = isPayout ? 'Continue to payout' : (isMoveIn ? 'Continue' : 'Continue to payment');
    const payNowLbl = isPayout ? `Pay ${nqPayEscHtml(payeeName || 'contractor')} R${amountLbl}` : `Pay R${amountLbl}`;
    const successHeading = String(opts.successHeading || (isPayout ? 'Payment sent' : isMoveIn ? 'Move-in confirmed' : 'Payment successful'));
    const successCopy = opts.successCopy
      ? String(opts.successCopy)
      : (isPayout
        ? `Your payout of <strong>R${amountLbl}</strong>${payeeName ? ` to <strong>${nqPayEscHtml(payeeName)}</strong>` : ''} has been processed.`
        : isMoveIn
          ? `Your payment of <strong>R${amountLbl}</strong> has been recorded. Occupancy is activating.`
          : `Your payment of <strong>R${amountLbl}</strong> has been processed successfully.`);
    const lineItems = Array.isArray(opts.lineItems) ? opts.lineItems : [];
    const linesHtml = (lineItems.length ? lineItems : [{ label: 'Description', value: description }]).map(function (row) {
      return `<div class="nq-pay-summary-row"><span>${nqPayEscHtml(row.label || '')}</span><span>${nqPayEscHtml(row.value || '')}</span></div>`;
    }).join('');
    const wizardKind = isMoveIn ? 'movein' : (isPayout ? 'payout' : 'pay');

    document.querySelector('#modalOverlay .modal')?.classList.remove('modal-wide', 'modal-xwide');

    const ok = nqOpenPaymentModalHtml(`
    <div id="nqPaymentWizard" class="nq-pay-wizard nq-pay-wizard--${wizardKind}">

      <div id="nqPayStep1" class="nq-pay-step nq-pay-step--in">
        <div class="nq-pay-head">
          <div class="nq-pay-mark ${isMoveIn?'nq-pay-mark--movein':(isPayout?'nq-pay-mark--payout':'')}" aria-hidden="true"></div>
          <h2 class="modal-title">${nqPayEscHtml(title)}</h2>
          <p class="nq-pay-lead">${descEsc}</p>
        </div>

        ${payeeCard}

        <div class="nq-pay-summary">
          ${linesHtml}
          <div class="nq-pay-summary-total">
            <span>Total due</span>
            <span>R${amountLbl}</span>
          </div>
        </div>

        <div class="nq-pay-actions">
          <button type="button" class="btn-outline" onclick="nqCancelInAppPayment()">Cancel</button>
          <button type="button" class="btn-gold" onclick="nqPayGoToStep2()">${continueLbl}</button>
        </div>
        <p class="nq-pay-secure">Simulated gateway · 256-bit SSL · PCI DSS</p>
      </div>

      <!-- Step 2: Card / Banking details -->
      <div id="nqPayStep2" class="nq-pay-step" style="display:none">
        <div class="nq-pay-step2-head">
          <button type="button" class="nq-pay-back" onclick="nqPayGoToStep1()" aria-label="Back">←</button>
          <div>
            <h2 class="modal-title" style="margin:0;font-size:1.12rem">Payment details</h2>
            <p class="nq-pay-lead" style="margin:2px 0 0">Encrypted in transit. Nothing is stored on NestIQ.</p>
          </div>
        </div>

        <div class="nq-pay-tabs" role="tablist">
          <button type="button" role="tab" id="nqTabCard" class="nq-pay-tab is-on" onclick="nqPaySelectTab('card')">Card</button>
          <button type="button" role="tab" id="nqTabEFT" class="nq-pay-tab" onclick="nqPaySelectTab('eft')">EFT</button>
        </div>

        <div id="nqCardForm">
          <div class="form-group" style="margin-bottom:14px">
            <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
              Card Number
            </label>
            <div style="position:relative">
              <input id="nqCardNumber" type="text" class="form-input" inputmode="numeric" autocomplete="cc-number"
                placeholder="0000 0000 0000 0000"
                maxlength="19"
                oninput="nqFormatCardNumber(this)"
                style="letter-spacing:0.08em;padding-right:48px;font-size:1rem">
              <span id="nqCardBrand" class="nq-pay-brand">Card</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="form-group">
              <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
                Expiry Date
              </label>
              <input id="nqCardExpiry" type="text" class="form-input" inputmode="numeric" autocomplete="cc-exp"
                placeholder="MM / YY" maxlength="7"
                oninput="nqFormatExpiry(this)">
            </div>
            <div class="form-group">
              <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
                CVV
              </label>
              <div style="position:relative">
                <input id="nqCardCVV" type="password" class="form-input" inputmode="numeric" autocomplete="cc-csc"
                  placeholder="•••" maxlength="4"
                  oninput="nqValidateCVV(this)">
                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
                             font-size:0.75rem;color:var(--muted);cursor:help" title="3 or 4 digits on back of card">?</span>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:18px">
            <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
              Cardholder Name
            </label>
            <input id="nqCardName" type="text" class="form-input" autocomplete="cc-name"
              placeholder="Name as it appears on your card"
              style="text-transform:uppercase">
          </div>
        </div>

        <div id="nqEFTForm" style="display:none">
          ${payeeCard}
          <div class="form-group" style="margin-bottom:14px">
            <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
              Select Your Bank
            </label>
            <select id="nqEFTBank" class="form-input">
              <option value="">— Choose your bank —</option>
              <option value="absa">ABSA</option>
              <option value="fnb">FNB / First National Bank</option>
              <option value="standard">Standard Bank</option>
              <option value="nedbank">Nedbank</option>
              <option value="capitec">Capitec Bank</option>
              <option value="investec">Investec</option>
              <option value="tyme">TymeBank</option>
              <option value="discovery">Discovery Bank</option>
              <option value="african">African Bank</option>
              <option value="bidvest">Bidvest Bank</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
              Account Number
            </label>
            <input id="nqEFTAccount" type="text" class="form-input" inputmode="numeric"
              placeholder="Enter your account number"
              maxlength="16" oninput="this.value=this.value.replace(/\\D/g,'')">
          </div>
          <div class="form-group" style="margin-bottom:18px">
            <label style="font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:6px;display:block">
              Online Banking PIN / Password
            </label>
            <input id="nqEFTPin" type="password" class="form-input"
              placeholder="Enter your online banking password" autocomplete="off">
          </div>

          <div class="nq-pay-ssl">
            Banking details authenticate this simulated transfer only. NestIQ does not store them.
          </div>
        </div>

        <div id="nqPayError" class="nq-pay-error" hidden></div>

        <button type="button" id="nqPayNowBtn" class="btn-gold nq-pay-now" onclick="nqProcessPayment()">
          ${payNowLbl}
        </button>

        <p class="nq-pay-secure">256-bit SSL · Simulated PayFast · PCI DSS</p>
      </div>

      <div id="nqPayStep3" class="nq-pay-step nq-pay-process" style="display:none">
        <div class="nq-pay-spinner" aria-hidden="true"></div>
        <h3>Processing</h3>
        <p id="nqProcessMsg">Connecting to the gateway…</p>
        <div class="nq-pay-progress"><div id="nqProgressBar"></div></div>
      </div>

      <div id="nqPayStep4" class="nq-pay-step nq-pay-done" style="display:none">
        <div class="nq-pay-success-mark" aria-hidden="true"></div>
        <h2>${nqPayEscHtml(successHeading)}</h2>
        <p class="nq-pay-lead">${successCopy}</p>
        <div class="nq-pay-receipt-card">
          ${payeeName ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;gap:12px">
            <span style="font-size:0.82rem;color:var(--muted)">Paid to</span>
            <span style="font-weight:700;font-size:0.82rem;text-align:right">${nqPayEscHtml(payeeName)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:0.82rem;color:var(--muted)">Amount paid</span>
            <span style="font-weight:700;color:#16A34A">R${amountLbl}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:0.82rem;color:var(--muted)">Reference</span>
            <span style="font-weight:600;font-size:0.82rem" id="nqPayRef"></span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:0.82rem;color:var(--muted)">Date</span>
            <span style="font-weight:600;font-size:0.82rem">${nqPayEscHtml(dateLbl)}</span>
          </div>
        </div>
        <div class="nq-pay-success-actions">
          ${hasReceipt ? `<button type="button" id="nqPayReceiptBtn" class="btn-outline" style="width:100%;justify-content:center" onclick="nqDownloadPaymentReceipt()">Download receipt</button>` : ''}
          <button type="button" class="btn-gold" style="width:100%" onclick="nqClosePaymentModal()">
            Done
          </button>
        </div>
      </div>

    </div>
  `);

    if (!ok) return;

    window._nqPayOnSuccess = onSuccess;
    window._nqPayOnCancel = onCancel;
    window._nqPayOnDownloadReceipt = onDownloadReceipt;
    window._nqPayAmount = amount;
    window._nqPayKind = isMoveIn ? 'movein' : (isPayout ? 'payout' : 'payment');
    window._nqPayeeName = payeeName;
    window._nqPayLastRef = '';
  }

  function nqCancelInAppPayment() {
    if (typeof window._nqPayOnCancel === 'function') {
      try { window._nqPayOnCancel(); } catch (_e) {}
    }
    nqClosePaymentModal();
  }

  function nqRevealPayStep(id) {
    ['nqPayStep1', 'nqPayStep2', 'nqPayStep3', 'nqPayStep4'].forEach(function (sid) {
      const el = document.getElementById(sid);
      if (!el) return;
      const on = sid === id;
      el.style.display = on ? 'block' : 'none';
      el.classList.toggle('nq-pay-step--in', on);
    });
  }

  function nqPayGoToStep1() {
    nqRevealPayStep('nqPayStep1');
  }

  function nqPayGoToStep2() {
    nqRevealPayStep('nqPayStep2');
    setTimeout(() => document.getElementById('nqCardNumber')?.focus(), 80);
  }

  function nqPaySelectTab(tab) {
    const isCard = tab === 'card';
    const cardForm = document.getElementById('nqCardForm');
    const eftForm = document.getElementById('nqEFTForm');
    const tabCard = document.getElementById('nqTabCard');
    const tabEft = document.getElementById('nqTabEFT');
    if (cardForm) cardForm.style.display = isCard ? 'block' : 'none';
    if (eftForm) eftForm.style.display = isCard ? 'none' : 'block';
    tabCard?.classList.toggle('is-on', isCard);
    tabEft?.classList.toggle('is-on', !isCard);
  }

  function nqFormatCardNumber(input) {
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 16);
    input.value = (digits.match(/.{1,4}/g) || []).join(' ');
    const brand = document.getElementById('nqCardBrand');
    if (!brand) return;
    if (val.startsWith('4')) brand.textContent = 'Visa';
    else if (val.startsWith('5')) brand.textContent = 'Mastercard';
    else if (val.startsWith('3')) brand.textContent = 'Amex';
    else brand.textContent = 'Card';
  }

  function nqFormatExpiry(input) {
    let val = input.value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 2) val = val.substring(0, 2) + ' / ' + val.substring(2);
    input.value = val;
  }

  function nqValidateCVV(input) {
    input.value = input.value.replace(/\D/g, '').substring(0, 4);
  }

  function nqPayShowError(msg) {
    const el = document.getElementById('nqPayError');
    if (!el) return;
    el.hidden = false;
    el.style.display = 'block';
    el.textContent = msg;
    el.classList.add('nq-shake');
    setTimeout(() => el.classList.remove('nq-shake'), 500);
  }

  function nqValidateCardForm() {
    const num = (document.getElementById('nqCardNumber')?.value || '').replace(/\s/g, '');
    const expiry = (document.getElementById('nqCardExpiry')?.value || '').replace(/\s/g, '');
    const cvv = document.getElementById('nqCardCVV')?.value || '';
    const name = (document.getElementById('nqCardName')?.value || '').trim();

    if (num.length < 16) { nqPayShowError('Please enter a valid 16-digit card number.'); return false; }
    if (expiry.replace('/', '').length < 4) { nqPayShowError('Please enter a valid expiry date (MM/YY).'); return false; }
    if (cvv.length < 3) { nqPayShowError('Please enter your CVV (3 or 4 digits).'); return false; }
    if (name.length < 2) { nqPayShowError('Please enter the cardholder name.'); return false; }

    const parts = expiry.replace(/ /g, '').split('/');
    const expMonth = parseInt(parts[0], 10);
    const expYear = parseInt('20' + parts[parts.length - 1], 10);
    const now = new Date();
    if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      nqPayShowError('This card has expired. Please use a valid card.');
      return false;
    }
    return true;
  }

  function nqValidateEFTForm() {
    const bank = document.getElementById('nqEFTBank')?.value || '';
    const account = document.getElementById('nqEFTAccount')?.value || '';
    const pin = document.getElementById('nqEFTPin')?.value || '';

    if (!bank) { nqPayShowError('Please select your bank.'); return false; }
    if (account.length < 6) { nqPayShowError('Please enter a valid account number.'); return false; }
    if (pin.length < 4) { nqPayShowError('Please enter your online banking password.'); return false; }
    return true;
  }

  function nqProcessPayment() {
    const error = document.getElementById('nqPayError');
    if (error) { error.style.display = 'none'; error.hidden = true; }

    const isCard = document.getElementById('nqCardForm')?.style.display !== 'none';
    const valid = isCard ? nqValidateCardForm() : nqValidateEFTForm();
    if (!valid) return;

    const btn = document.getElementById('nqPayNowBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }

    nqRevealPayStep('nqPayStep3');

    const payee = String(window._nqPayeeName || '').trim();
    const kind = window._nqPayKind;
    const steps = kind === 'payout' ? [
      { msg: 'Connecting to the gateway…', progress: 18, delay: 0 },
      { msg: payee ? `Preparing payout to ${payee}…` : 'Preparing payout…', progress: 38, delay: 800 },
      { msg: 'Authorising transfer…', progress: 58, delay: 1700 },
      { msg: 'Sending funds…', progress: 78, delay: 2800 },
      { msg: 'Confirming payout…', progress: 92, delay: 3900 },
      { msg: 'Approved', progress: 100, delay: 5000 }
    ] : kind === 'movein' ? [
      { msg: 'Connecting to the gateway…', progress: 16, delay: 0 },
      { msg: 'Confirming deposit…', progress: 40, delay: 850 },
      { msg: 'Recording move-in payment…', progress: 64, delay: 1800 },
      { msg: 'Activating occupancy…', progress: 84, delay: 2900 },
      { msg: 'Approved', progress: 100, delay: 4100 }
    ] : [
      { msg: 'Connecting to the gateway…', progress: 15, delay: 0 },
      { msg: 'Verifying payment details…', progress: 35, delay: 900 },
      { msg: 'Authenticating…', progress: 55, delay: 1900 },
      { msg: 'Processing…', progress: 75, delay: 3000 },
      { msg: 'Confirming…', progress: 90, delay: 4200 },
      { msg: 'Approved', progress: 100, delay: 5200 }
    ];
    const doneAt = kind === 'movein' ? 5000 : 6200;

    steps.forEach(step => {
      setTimeout(() => {
        const msgEl = document.getElementById('nqProcessMsg');
        const barEl = document.getElementById('nqProgressBar');
        if (msgEl) msgEl.textContent = step.msg;
        if (barEl) barEl.style.width = step.progress + '%';
      }, step.delay);
    });

    setTimeout(() => {
      const ref = 'PAY-' + Date.now().toString(36).toUpperCase() + '-' +
        Math.random().toString(36).substr(2, 4).toUpperCase();

      nqRevealPayStep('nqPayStep4');

      window._nqPayLastRef = ref;
      const refEl = document.getElementById('nqPayRef');
      if (refEl) refEl.textContent = ref;

      if (typeof nestiqConfetti === 'function') {
        nestiqConfetti(window._nqPayKind === 'movein'
          ? { count: 42, spread: 48, origin: { y: 0.62 } }
          : { count: 90, spread: 70, origin: { y: 0.65 } });
      }

      if (typeof window._nqPayOnSuccess === 'function') {
        try { window._nqPayOnSuccess(ref); } catch (e) { console.warn('[NestIQ] payment onSuccess', e); }
      }
    }, doneAt);
  }

  function nqDownloadPaymentReceipt() {
    const ref = window._nqPayLastRef || document.getElementById('nqPayRef')?.textContent || '';
    const fn = window._nqPayOnDownloadReceipt;
    if (typeof fn !== 'function') {
      if (typeof nestiqShowNotif === 'function') nestiqShowNotif('Receipt is not available for this payment', 'warning');
      return;
    }
    try { fn(ref); } catch (e) {
      console.warn('[NestIQ] payment receipt', e);
      if (typeof nestiqShowNotif === 'function') nestiqShowNotif('Could not generate receipt', 'error');
    }
  }

  window.nestiqShowInAppPaymentModal = nestiqShowInAppPaymentModal;
  window.nqClosePaymentModal = nqClosePaymentModal;
  window.nqCancelInAppPayment = nqCancelInAppPayment;
  window.nqDownloadPaymentReceipt = nqDownloadPaymentReceipt;
  window.nqPayGoToStep1 = nqPayGoToStep1;
  window.nqPayGoToStep2 = nqPayGoToStep2;
  window.nqPaySelectTab = nqPaySelectTab;
  window.nqFormatCardNumber = nqFormatCardNumber;
  window.nqFormatExpiry = nqFormatExpiry;
  window.nqValidateCVV = nqValidateCVV;
  window.nqProcessPayment = nqProcessPayment;
})();
