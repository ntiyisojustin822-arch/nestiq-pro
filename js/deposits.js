/* ═══════════════════════════════
   DEPOSIT TRACKING (Rental Housing Act)
   Loaded before data.js — nestiqNormalizeTenantDeposit must exist at tenant map time.
═══════════════════════════════ */

const NESTIQ_DEPOSIT_STATUSES = new Set(['pending', 'held', 'partially-refunded', 'refunded', 'claimed', 'disputed']);

function nestiqDepEsc(s){
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function nestiqDepWaDigits(p){
  return String(p || '').replace(/\D/g, '');
}

function nestiqLandlordDisplayName(){
  try{
    return String(typeof landlordName !== 'undefined' && landlordName ? landlordName : landlordSettings?.name || 'Landlord');
  }catch(_e){
    return 'Landlord';
  }
}

function nestiqNormalizeDeductionRow(d, idx){
  const o = d && typeof d === 'object' ? d : {};
  return {
    id: Number(o.id) || idx + 1,
    description: String(o.description || ''),
    amount: Math.max(0, Number(o.amount) || 0),
    date: String(o.date || new Date().toISOString().slice(0, 10)),
    linkedInspectionItem: o.linkedInspectionItem != null && o.linkedInspectionItem !== '' ? String(o.linkedInspectionItem) : null,
    receipt: o.receipt ? String(o.receipt) : null
  };
}

function nestiqNormalizeTenantDeposit(raw, rent){
  const defaultAmt = Math.max(0, Number(rent || 0) * 2);
  const isObj = raw && typeof raw === 'object' && !Array.isArray(raw);
  const legacyNum = Number.isFinite(Number(raw)) ? Number(raw) : null;
  const base = isObj ? raw : {};
  let amount = Number(base.amount);
  if (!Number.isFinite(amount)) amount = legacyNum != null ? legacyNum : defaultAmt;
  amount = Math.max(0, amount);
  const collected = base.collected === true;
  const statusIn = String(base.status || '').trim();
  let status = NESTIQ_DEPOSIT_STATUSES.has(statusIn) ? statusIn : collected ? 'held' : 'pending';
  const deductions = Array.isArray(base.deductions) ? base.deductions.map(nestiqNormalizeDeductionRow) : [];
  const rate = Number(base.interestRate);
  return {
    amount,
    collected,
    collectedDate: String(base.collectedDate || ''),
    collectedMethod: String(base.collectedMethod || ''),
    bankName: String(base.bankName || ''),
    accountNumber: String(base.accountNumber || ''),
    interestRate: Number.isFinite(rate) && rate > 0 ? rate : 3.5,
    interestEarned: Math.max(0, Number(base.interestEarned) || 0),
    lastInterestCalculated: String(base.lastInterestCalculated || ''),
    status,
    refundAmount: Math.max(0, Number(base.refundAmount) || 0),
    refundDate: String(base.refundDate || ''),
    refundMethod: String(base.refundMethod || ''),
    refundReference: String(base.refundReference || ''),
    refundNotes: String(base.refundNotes || base.notesRefund || ''),
    tenantRefundBankName: String(base.tenantRefundBankName || ''),
    tenantRefundAccountNumber: String(base.tenantRefundAccountNumber || ''),
    deductions,
    notes: String(base.notes || ''),
    investmentProof: base.investmentProof ? String(base.investmentProof) : null,
    receiptIssued: base.receiptIssued === true,
    receiptDate: String(base.receiptDate || ''),
    claimType: base.claimType === 'partial' ? 'partial' : base.claimType === 'full' ? 'full' : '',
    claimReasons: Array.isArray(base.claimReasons) ? base.claimReasons.map(String) : [],
    claimDate: String(base.claimDate || ''),
    claimNotes: String(base.claimNotes || ''),
    tenantOwingAmount: Math.max(0, Number(base.tenantOwingAmount) || 0)
  };
}

function nestiqEnsureTenantDeposit(t){
  if (!t || typeof t !== 'object') return;
  t.deposit = nestiqNormalizeTenantDeposit(t.deposit, t.rent);
}

function nestiqTenantDepositAmount(t){
  nestiqEnsureTenantDeposit(t);
  return Number(t.deposit?.amount) || 0;
}

function nestiqTenantDepositInterest(t){
  nestiqEnsureTenantDeposit(t);
  return Number(t.deposit?.interestEarned) || 0;
}

function nestiqTenantDepositTotalValue(t){
  return nestiqTenantDepositAmount(t) + nestiqTenantDepositInterest(t);
}

function nestiqTenantDeductionsSum(t){
  nestiqEnsureTenantDeposit(t);
  return (t.deposit.deductions || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

function nestiqTenantNetRefundBeforeClamp(t){
  return nestiqTenantDepositTotalValue(t) - nestiqTenantDeductionsSum(t);
}

function nestiqTenantDisplayRefund(t){
  const n = nestiqTenantNetRefundBeforeClamp(t);
  return Math.max(0, n);
}

function nestiqTenantOwingIfOverDeducted(t){
  const n = nestiqTenantNetRefundBeforeClamp(t);
  return n < 0 ? Math.abs(n) : 0;
}

function nestiqDepositStatusLabel(st){
  const m = {
    pending: 'PENDING',
    held: 'HELD',
    'partially-refunded': 'PARTIAL REFUND',
    refunded: 'REFUNDED',
    claimed: 'CLAIMED',
    disputed: 'DISPUTED'
  };
  return m[st] || String(st || '').toUpperCase();
}

function nestiqDepositStatusBadgeClass(st){
  if (st === 'pending') return 'badge-amber';
  if (st === 'held') return 'badge-green';
  if (st === 'partially-refunded') return 'badge-blue';
  if (st === 'refunded') return 'badge-gray';
  if (st === 'claimed') return 'badge-red';
  if (st === 'disputed') return 'badge-orange';
  return 'badge-amber';
}

function nestiqNextDeductionId(d){
  const ids = (d.deductions || []).map(x => Number(x.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

function nestiqMoveOutInspectionItemOptions(tenantId){
  try{
    const list = (inspections || []).filter(
      i => i.status === 'completed' && i.type === 'move-out' && Number(i.tenantId) === Number(tenantId)
    );
    const opts = [];
    list.forEach(insp => {
      (insp.rooms || []).forEach(r => {
        (r.items || []).forEach(it => {
          opts.push({
            value: `${insp.id}|${encodeURIComponent(r.name || '')}|${encodeURIComponent(it.name || '')}`,
            label: `${r.name}: ${it.name}`
          });
        });
      });
    });
    return opts;
  }catch(_e){
    return [];
  }
}

function calculateDepositInterest(){
  if (!Array.isArray(tenantsData)) return;
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  tenantsData.forEach(t => {
    nestiqEnsureTenantDeposit(t);
    const d = t.deposit;
    if (d.status !== 'held' || !d.collected) return;
    const principal = Number(d.amount) || 0;
    if (principal <= 0) return;
    const rate = Number(d.interestRate) || 3.5;
    const monthlyRate = rate / 12 / 100;
    const last = d.lastInterestCalculated || d.collectedDate || '';
    if (!last) return;
    const start = new Date(last + 'T12:00:00');
    const end = new Date(today + 'T12:00:00');
    if (String(start) === 'Invalid Date') return;
    const days = Math.floor((end - start) / 86400000);
    if (days < 30) return;
    const months = Math.floor(days / 30);
    if (months < 1) return;
    let added = 0;
    for (let i = 0; i < months; i++) added += principal * monthlyRate;
    d.interestEarned = (Number(d.interestEarned) || 0) + added;
    const nd = new Date(start);
    nd.setDate(nd.getDate() + months * 30);
    d.lastInterestCalculated = nd.toISOString().slice(0, 10);
    changed = true;
    try{
      addBellNotif('🏦', `Interest calculated: ${t.name} deposit earned R${added.toFixed(2)} interest`);
    }catch(_e){}
  });
  if (changed && typeof saveData === 'function') saveData();
}

function nestiqDepositShowRefundReminderHtml(t){
  const days = typeof getTenantLeaseDaysRemaining === 'function' ? getTenantLeaseDaysRemaining(t) : 999;
  const end = String(t.leaseEnd || '').slice(0, 10);
  const endD = new Date(end + 'T12:00:00');
  if (String(endD) === 'Invalid Date') return '';
  const deadline = new Date(endD);
  deadline.setDate(deadline.getDate() + 14);
  const dl = deadline.toISOString().slice(0, 10);
  if (days > 90) return '';
  return `<div style="font-size:0.78rem;color:var(--rust);background:rgba(196,106,58,0.1);border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:8px">
    <strong>Rental Housing Act:</strong> Refund or claim documentation should be completed within <strong>14 days</strong> of lease end (${nestiqDepEsc(end)}). Target deadline: <strong>${nestiqDepEsc(dl)}</strong>.
  </div>`;
}

function nestiqDepositComplianceForTenant(t){
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const items = [];
  if (d.status === 'held'){
    if (!d.bankName || !d.accountNumber) items.push({ ok: false, text: 'Investment account not fully recorded' });
    else items.push({ ok: true, text: 'Deposit invested (bank details on file)' });
    if (!d.receiptIssued) items.push({ ok: false, text: 'Receipt not marked as issued' });
    else items.push({ ok: true, text: 'Receipt issued to tenant' });
    if (!d.investmentProof) items.push({ ok: false, text: 'Investment proof not uploaded' });
    else items.push({ ok: true, text: 'Investment proof on file' });
  } else if (d.collected){
    items.push({ ok: true, text: 'Collection recorded' });
  }
  const end = typeof getTenantLeaseDaysRemaining === 'function' ? getTenantLeaseDaysRemaining(t) : 999;
  const leaseEnded = end < 0;
  const needProcess = ['held', 'disputed'].includes(d.status) && leaseEnded;
  if (needProcess && !d.refundDate && d.status !== 'disputed') items.push({ ok: false, text: 'Lease ended — process refund or claim within 14 days' });
  return items;
}

function nestiqRenderDepositsPage(){
  normalizeDataModel?.();
  const statsEl = document.getElementById('nestiqDepositsStats');
  const compEl = document.getElementById('nestiqDepositsCompliance');
  const tblEl = document.getElementById('nestiqDepositsTable');
  const searchEl = document.getElementById('nestiqDepositsSearch');
  if (!statsEl || !tblEl) return;
  const q = (searchEl && searchEl.value ? searchEl.value : '').toLowerCase().trim();
  const rows = (tenantsData || []).filter(t => t && t.status !== 'vacant');
  const filtered = !q
    ? rows
    : rows.filter(
        t =>
          String(t.name || '').toLowerCase().includes(q) ||
          String(t.property || '').toLowerCase().includes(q) ||
          String(t.unit || '').toLowerCase().includes(q)
      );

  const heldSum = rows.reduce((s, t) => {
    nestiqEnsureTenantDeposit(t);
    return s + (t.deposit.status === 'held' ? nestiqTenantDepositAmount(t) : 0);
  }, 0);
  const pendingCount = rows.filter(t => {
    nestiqEnsureTenantDeposit(t);
    return !t.deposit.collected;
  }).length;
  const interestSum = rows.reduce((s, t) => s + nestiqTenantDepositInterest(t), 0);
  const ym = new Date().toISOString().slice(0, 7);
  const processedThisMonth = rows.filter(t => {
    nestiqEnsureTenantDeposit(t);
    const d = t.deposit;
    const rd = String(d.refundDate || '').slice(0, 7);
    const cd = String(d.claimDate || '').slice(0, 7);
    if (['refunded', 'partially-refunded'].includes(d.status) && rd === ym) return true;
    if (d.status === 'claimed' && cd === ym) return true;
    return false;
  }).length;

  statsEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">
      <div class="settings-card" style="margin:0;border-left:4px solid var(--gold)">
        <div style="font-size:0.72rem;color:var(--muted)">Total Deposits Held</div>
        <div style="font-size:1.35rem;font-weight:700;color:var(--gold)">R${heldSum.toLocaleString('en-ZA')}</div>
      </div>
      <div class="settings-card" style="margin:0;border-left:4px solid #d4a017">
        <div style="font-size:0.72rem;color:var(--muted)">Pending Collection</div>
        <div style="font-size:1.35rem;font-weight:700;color:#b8860b">${pendingCount}</div>
      </div>
      <div class="settings-card" style="margin:0;border-left:4px solid var(--sage)">
        <div style="font-size:0.72rem;color:var(--muted)">Total Interest Earned</div>
        <div style="font-size:1.35rem;font-weight:700;color:var(--sage)">R${interestSum.toLocaleString('en-ZA')}</div>
      </div>
      <div class="settings-card" style="margin:0;border-left:4px solid #3d6b8a">
        <div style="font-size:0.72rem;color:var(--muted)">Processed This Month</div>
        <div style="font-size:1.35rem;font-weight:700;color:#3d6b8a">${processedThisMonth}</div>
        <div style="font-size:0.68rem;color:var(--muted)">Refunded / claimed</div>
      </div>
    </div>`;

  if (compEl){
    const issues = [];
    rows.forEach(t => {
      nestiqEnsureTenantDeposit(t);
      nestiqDepositComplianceForTenant(t).forEach(it => {
        if (!it.ok) issues.push({ tenant: t.name, text: it.text });
      });
    });
    const daysLines = rows
      .map(t => {
        const dleft = typeof getTenantLeaseDaysRemaining === 'function' ? getTenantLeaseDaysRemaining(t) : 999;
        if (dleft > 60 || dleft < 0) return null;
        const end = String(t.leaseEnd || '').slice(0, 10);
        const deadline = new Date(end + 'T12:00:00');
        if (String(deadline) === 'Invalid Date') return null;
        deadline.setDate(deadline.getDate() + 14);
        return `<li><strong>${nestiqDepEsc(t.name)}</strong>: lease ends in ${dleft} days — deposit deadline <strong>${deadline.toISOString().slice(0, 10)}</strong></li>`;
      })
      .filter(Boolean);
    compEl.innerHTML = `
      <div class="settings-card" style="margin-bottom:20px">
        <h3 class="settings-card-title">Rental Housing Act Compliance</h3>
        <ul style="font-size:0.84rem;line-height:1.55;margin:0;padding-left:18px;color:var(--muted)">
          <li>Deposit invested in an interest-bearing account</li>
          <li>Receipt issued to tenant promptly after collection</li>
          <li>Investment proof kept on file</li>
          <li>Refund or claim within 14 days of lease end</li>
        </ul>
        ${issues.length ? `<div style="margin-top:12px;font-size:0.82rem;color:var(--rust)"><strong>Attention:</strong><ul style="margin:6px 0 0;padding-left:18px">${issues.map(i => `<li>${nestiqDepEsc(i.tenant)}: ${nestiqDepEsc(i.text)}</li>`).join('')}</ul></div>` : '<div style="margin-top:10px;font-size:0.82rem;color:var(--sage)">No compliance flags for current rules.</div>'}
        ${daysLines.length ? `<div style="margin-top:12px;font-size:0.82rem"><strong>Important dates</strong><ul style="margin:6px 0 0;padding-left:18px">${daysLines.join('')}</ul></div>` : ''}
      </div>`;
  }

  tblEl.innerHTML = `
    <div class="settings-card" style="margin:0;overflow:auto">
      <table class="settings-email-table" style="font-size:0.82rem;min-width:920px">
        <thead>
          <tr>
            <th>Tenant</th><th>Property</th><th>Unit</th><th>Deposit</th><th>Collected</th><th>Interest</th><th>Bank</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length ? filtered.map(t => {
            nestiqEnsureTenantDeposit(t);
            const d = t.deposit;
            const canRefund =
              d.status === 'held' &&
              (typeof getTenantLeaseDaysRemaining === 'function'
                ? getTenantLeaseDaysRemaining(t) <= 90 || getTenantLeaseDaysRemaining(t) < 0 || Boolean(t.movingOut)
                : true);
            return `<tr>
              <td>${nestiqDepEsc(t.name)}</td>
              <td>${nestiqDepEsc(t.property || '')}</td>
              <td>${nestiqDepEsc(t.unit || '')}</td>
              <td>R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</td>
              <td>${d.collected ? nestiqDepEsc(String(d.collectedDate || '').slice(0, 10)) : '—'}</td>
              <td>R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}</td>
              <td>${nestiqDepEsc(d.bankName ? d.bankName.slice(0, 18) + (d.bankName.length > 18 ? '…' : '') : '—')}</td>
              <td><span class="badge ${nestiqDepositStatusBadgeClass(d.status)}">${nestiqDepositStatusLabel(d.status)}</span></td>
              <td style="white-space:nowrap">
                ${!d.collected ? `<button type="button" class="btn-outline btn-sm" onclick="nestiqOpenDepositCollectionModal(${t.id})">Record Collection</button> ` : ''}
                <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenDepositDetailModal(${t.id})">View Details</button>
                ${canRefund ? ` <button type="button" class="btn-primary btn-sm" onclick="nestiqOpenDepositRefundModal(${t.id})">Process Refund</button>` : ''}
                ${d.status === 'held' ? ` <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenDepositClaimModal(${t.id})">Record Claim</button>` : ''}
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="9" style="color:var(--muted)">No active tenants.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(tblEl, 40);
}

function nestiqOnDepositsSearchInput(){
  nestiqRenderDepositsPage();
}

function nestiqOpenDepositCollectionModal(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Record Deposit Collection — ${nestiqDepEsc(t.name)}</h2>
    <p class="modal-sub">${nestiqDepEsc(t.property || '')} · ${nestiqDepEsc(t.unit || '')}</p>
    <p style="font-size:0.84rem;color:var(--muted)">Expected deposit: <strong>R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</strong> (editable below)</p>
    <div class="form-group"><label>Amount Received (R) *</label><input class="form-input" id="ndc_amt" type="number" step="0.01" min="0" value="${nestiqTenantDepositAmount(t)}"></div>
    <div class="form-group"><label>Date Collected *</label><input class="form-input" id="ndc_date" type="date" value="${today}"></div>
    <div class="form-group"><label>Payment Method *</label>
      <select class="form-input" id="ndc_method"><option>EFT</option><option>Cash</option><option>Card</option></select></div>
    <div class="form-group"><label>Reference Number</label><input class="form-input" id="ndc_ref" placeholder="Optional"></div>
    <div style="font-size:0.82rem;color:var(--muted);margin:12px 0 8px;padding:10px;background:var(--cream);border-radius:8px;border:1px solid var(--border)">
      Deposits must be invested in an interest-bearing account per the <strong>Rental Housing Act</strong>.
    </div>
    <div class="form-group"><label>Bank Name *</label><input class="form-input" id="ndc_bank" placeholder="e.g. Capitec"></div>
    <div class="form-group"><label>Account Number *</label><input class="form-input" id="ndc_acc"></div>
    <div class="form-group"><label>Interest Rate (% p.a.)</label><input class="form-input" id="ndc_rate" type="number" step="0.01" min="0" value="3.5"></div>
    <div class="form-group"><label>Upload investment proof (optional)</label><input class="form-input" type="file" id="ndc_file" accept="image/*,.pdf"></div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick='nestiqSubmitDepositCollection(${JSON.stringify(String(t.id))})'>Record Collection</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function nestiqSubmitDepositCollection(tenantId){
  const t = (tenantsData || []).find(x => String(x.id) === String(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const amt = Number(document.getElementById('ndc_amt')?.value);
  const date = document.getElementById('ndc_date')?.value || '';
  const method = document.getElementById('ndc_method')?.value || 'EFT';
  const ref = document.getElementById('ndc_ref')?.value?.trim() || '';
  const bank = document.getElementById('ndc_bank')?.value?.trim() || '';
  const acc = document.getElementById('ndc_acc')?.value?.trim() || '';
  const rate = Number(document.getElementById('ndc_rate')?.value) || 3.5;
  if (!Number.isFinite(amt) || amt <= 0){
    nestiqShowNotif('Enter a valid amount received', 'error');
    return;
  }
  if (!bank || !acc){
    nestiqShowNotif('Bank name and account number are required', 'error');
    return;
  }
  const fileEl = document.getElementById('ndc_file');
  const finish = proof => {
    const d = t.deposit;
    d.amount = amt;
    d.collected = true;
    d.collectedDate = date || new Date().toISOString().slice(0, 10);
    d.collectedMethod = method;
    d.bankName = bank;
    d.accountNumber = acc;
    d.interestRate = rate;
    d.status = 'held';
    d.interestEarned = 0;
    d.lastInterestCalculated = d.collectedDate;
    if (proof) d.investmentProof = proof;
    saveData?.();
    normalizeDataModel?.();
    nestiqCloseModalAnimated();
    nestiqShowNotif(`Deposit collection recorded for ${t.name}`, 'success');
    nestiqPrintDepositReceipt(t, { reference: ref });
    d.receiptIssued = true;
    d.receiptDate = new Date().toISOString().slice(0, 10);
    t.depositCollected = true;
    const after = async () => {
      try{
        if(window.nestiqUseFirestore && typeof window.nestiqPersistSingleTenantToFirestore==='function'){
          await window.nestiqPersistSingleTenantToFirestore(t);
        }else{
          saveData?.();
        }
      }catch(_e){
        saveData?.();
      }
      try{
        const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
          ? window.nestiqPrimaryLeaseForTenant(t.id)
          : null;
        if(lease && typeof window.nestiqTryActivateLeaseAfterMoney==='function'){
          await window.nestiqTryActivateLeaseAfterMoney(lease);
        }
      }catch(err){
        console.warn('NestIQ: activate after deposit collection', err);
      }
      nestiqRenderDepositsPage?.();
      renderTenants?.();
    };
    void after();
  };
  if (fileEl && fileEl.files && fileEl.files[0]){
    const r = new FileReader();
    r.onload = () => finish(String(r.result || ''));
    r.readAsDataURL(fileEl.files[0]);
  } else finish(null);
}

function nestiqDepositReceiptHtml(t, extra){
  const d = t.deposit;
  const ref = extra?.reference || '—';
  return `
    <div style="max-width:560px;margin:0 auto;font-family:DM Sans,system-ui">
      <h1 style="font-family:'Playfair Display',serif;font-size:1.5rem">DEPOSIT RECEIPT</h1>
      <div style="color:var(--muted);font-size:0.85rem;margin-bottom:16px">NestIQ Pro</div>
      <p><strong>Tenant:</strong> ${nestiqDepEsc(t.name)}</p>
      <p><strong>Property:</strong> ${nestiqDepEsc(t.property || '')}, ${nestiqDepEsc(t.unit || '')}</p>
      <p><strong>Deposit Amount:</strong> R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</p>
      <p><strong>Received:</strong> ${nestiqDepEsc(d.collectedDate || '')}</p>
      <p><strong>Method:</strong> ${nestiqDepEsc(d.collectedMethod || '')}</p>
      <p><strong>Reference:</strong> ${nestiqDepEsc(ref)}</p>
      <p style="margin-top:18px;font-size:0.88rem;line-height:1.5">This deposit will be invested in an interest-bearing account as required by the <strong>Rental Housing Act 50 of 1999</strong>.</p>
      <p style="margin-top:24px"><strong>Landlord:</strong> ${nestiqDepEsc(nestiqLandlordDisplayName())}</p>
      <p>Signature: ___________________________</p>
      <p>Date: ${nestiqDepEsc(new Date().toISOString().slice(0, 10))}</p>
    </div>`;
}

function nestiqOpenPrintableDoc(html, title){
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${nestiqDepEsc(title)}</title>
    <style>body{font-family:DM Sans,system-ui;padding:24px;color:#111}</style></head><body>
    ${html}
    <div style="margin-top:28px">
      <button type="button" style="padding:8px 14px;cursor:pointer" onclick="window.print()">Print</button>
      <span style="margin-left:10px;font-size:0.85rem;color:#666">Tip: choose “Save as PDF” in the print dialog for a PDF.</span>
    </div>
    </body></html>`);
  w.document.close();
}

function nestiqPrintDepositReceipt(t, extra){
  nestiqOpenPrintableDoc(nestiqDepositReceiptHtml(t, extra), 'Deposit Receipt');
}

function nestiqDepositDetailSummaryHtml(t){
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const col = d.collectedDate ? new Date(d.collectedDate + 'T12:00:00') : null;
  const daysHeld =
    col && String(col) !== 'Invalid Date' ? Math.max(0, Math.floor((Date.now() - col) / 86400000)) : '—';
  const total = nestiqTenantDepositTotalValue(t);
  const minRef = total;
  const proofBtn =
    d.investmentProof ?
      `<button type="button" class="btn-outline btn-sm" onclick="nestiqViewDepositProof(${t.id})">View investment proof</button>` :
      '';
  return `
    <div class="settings-card" style="margin:0 0 12px">
      <h3 class="settings-card-title">Deposit summary</h3>
      <div style="font-size:0.88rem;line-height:1.55">
        <div>Deposit amount: <strong>R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</strong></div>
        <div>Date collected: ${d.collected ? nestiqDepEsc(d.collectedDate || '—') : '—'}</div>
        <div>Method: ${nestiqDepEsc(d.collectedMethod || '—')}</div>
        <div style="margin-top:8px"><span class="badge ${nestiqDepositStatusBadgeClass(d.status)}">${nestiqDepositStatusLabel(d.status)}</span></div>
        <div style="margin-top:8px">Days held: <strong>${daysHeld}</strong></div>
        <div>Interest earned: <strong>R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}</strong></div>
        <div>Current total value: <strong>R${total.toLocaleString('en-ZA')}</strong></div>
        <div>Minimum refund required (incl. interest): <strong>R${minRef.toLocaleString('en-ZA')}</strong></div>
      </div>
      <div style="margin-top:12px;font-size:0.84rem">
        <div><strong>Investment</strong></div>
        <div>Bank: ${nestiqDepEsc(d.bankName || '—')}</div>
        <div>Account: ${nestiqDepEsc(d.accountNumber || '—')}</div>
        <div>Interest rate: ${Number(d.interestRate || 0).toFixed(2)}% p.a.</div>
        ${proofBtn}
      </div>
    </div>`;
}

function nestiqViewDepositProof(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t?.deposit?.investmentProof) return;
  const w = window.open('', '_blank');
  if (!w) return;
  const src = t.deposit.investmentProof;
  if (src.startsWith('data:image')){
    w.document.write(`<html><body style="margin:0;text-align:center"><img src="${src}" style="max-width:100%"/></body></html>`);
  } else {
    w.document.write(`<html><body><a href="${src}">Open file</a></body></html>`);
  }
  w.document.close();
}

function nestiqOpenDepositDetailModal(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const ded = d.deductions || [];
  const dedSum = nestiqTenantDeductionsSum(t);
  const total = nestiqTenantDepositTotalValue(t);
  const net = nestiqTenantDisplayRefund(t);
  const owe = nestiqTenantOwingIfOverDeducted(t);
  const opts = nestiqMoveOutInspectionItemOptions(t.id);
  const optHtml =
    opts.length ?
      opts.map(o => `<option value="${nestiqDepEsc(o.value)}">${nestiqDepEsc(o.label)}</option>`).join('') :
      '<option value="">— No move-out inspection items —</option>';
  const canRefund =
    d.status === 'held' &&
    (typeof getTenantLeaseDaysRemaining === 'function'
      ? getTenantLeaseDaysRemaining(t) <= 90 || getTenantLeaseDaysRemaining(t) < 0 || Boolean(t.movingOut)
      : true);

  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">${nestiqDepEsc(t.name)} — Deposit Details</h2>
    <div style="max-height:72vh;overflow:auto;padding-right:6px">
      ${nestiqDepositDetailSummaryHtml(t)}
      ${nestiqDepositShowRefundReminderHtml(t)}
      <div class="settings-card" style="margin:0 0 12px">
        <h3 class="settings-card-title">Damage deductions</h3>
        <table class="settings-email-table" style="font-size:0.78rem">
          <thead><tr><th>Description</th><th>Amount</th><th>Date</th><th>Receipt</th><th></th></tr></thead>
          <tbody>
            ${ded.length ? ded.map(r => `<tr>
              <td>${nestiqDepEsc(r.description)}</td>
              <td>R${(Number(r.amount) || 0).toLocaleString('en-ZA')}</td>
              <td>${nestiqDepEsc(r.date)}</td>
              <td>${r.receipt ? '<a href="#" onclick="nestiqViewDeductionReceipt(' + t.id + ',' + r.id + ');return false">View</a>' : '—'}</td>
              <td><button type="button" class="btn-outline btn-sm" onclick="nestiqRemoveDeduction(${t.id},${r.id})">Remove</button></td>
            </tr>`).join('') : '<tr><td colspan="5" style="color:var(--muted)">No deductions yet.</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:10px;font-size:0.82rem;display:grid;gap:6px">
          <div class="form-group"><label>Add — Description *</label><input class="form-input" id="ndd_desc" placeholder="e.g. Broken window"></div>
          <div class="form-group"><label>Amount (R)</label><input class="form-input" id="ndd_amt" type="number" step="0.01" min="0"></div>
          <div class="form-group"><label>Date</label><input class="form-input" id="ndd_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-group"><label>Linked inspection item</label><select class="form-input" id="ndd_link"><option value="">—</option>${optHtml}</select></div>
          <div class="form-group"><label>Receipt (optional)</label><input class="form-input" type="file" id="ndd_file" accept="image/*"></div>
          <button type="button" class="btn-outline btn-sm" onclick="nestiqAddDeduction(${t.id})">Add Deduction</button>
        </div>
        <div style="margin-top:12px;font-size:0.88rem">
          <div>Total deductions: <strong>R${dedSum.toLocaleString('en-ZA')}</strong></div>
          <div>Remaining refund: <strong>R${net.toLocaleString('en-ZA')}</strong></div>
          ${owe > 0 ? `<div style="color:var(--rust);margin-top:8px"><strong>Deductions exceed deposit + interest.</strong> Tenant may owe <strong>R${owe.toLocaleString('en-ZA')}</strong>.</div>` : ''}
        </div>
      </div>
      <div class="settings-card" style="margin:0 0 12px;background:var(--cream)">
        <h3 class="settings-card-title">Refund calculation</h3>
        <div style="font-family:monospace;font-size:0.88rem;line-height:1.7">
          <div>Deposit held:          R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</div>
          <div>Interest earned:       R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}</div>
          <div>Total available:       R${total.toLocaleString('en-ZA')}</div>
          <div>Less deductions:      (R${dedSum.toLocaleString('en-ZA')})</div>
          <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px">Amount to refund:      R${net.toLocaleString('en-ZA')}</div>
        </div>
        ${net <= 0 && owe > 0 ? `<div style="margin-top:8px;color:var(--rust)">Amount owed by tenant: R${owe.toLocaleString('en-ZA')}</div>` : ''}
      </div>
      <div class="settings-card" style="margin:0">
        <h3 class="settings-card-title">Notes</h3>
        <textarea class="form-input" id="nd_notes" rows="2" placeholder="Internal notes">${nestiqDepEsc(d.notes || '')}</textarea>
        <button type="button" class="btn-outline btn-sm" style="margin-top:8px" onclick="nestiqSaveDepositNotes(${t.id})">Save notes</button>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
          ${canRefund ? `<button type="button" class="btn-primary btn-sm" onclick="nestiqCloseModalAnimated();nestiqOpenDepositRefundModal(${t.id})">Process Refund</button>` : ''}
          ${d.status === 'held' ? `<button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated();nestiqOpenDepositClaimModal(${t.id})">Record Claim</button>` : ''}
          <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenDepositDispute(${t.id})">Open Dispute</button>
        </div>
      </div>
    </div>
    <div style="margin-top:12px"><button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button></div>`;
  nestiqOpenModalAnimated();
}

function nestiqViewDeductionReceipt(tenantId, dedId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const r = (t.deposit.deductions || []).find(x => Number(x.id) === Number(dedId));
  if (!r?.receipt) return;
  nestiqViewDepositProofStyle(r.receipt);
}

function nestiqViewDepositProofStyle(src){
  const w = window.open('', '_blank');
  if (!w) return;
  if (String(src).startsWith('data:image')){
    w.document.write(`<html><body style="margin:0"><img src="${src}" style="max-width:100%"/></body></html>`);
  } else {
    w.document.write(`<html><body><p><a href="${src}">Open</a></p></body></html>`);
  }
  w.document.close();
}

function nestiqSaveDepositNotes(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  t.deposit.notes = document.getElementById('nd_notes')?.value || '';
  saveData?.();
  nestiqShowNotif('Notes saved', 'success');
}

function nestiqAddDeduction(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const desc = document.getElementById('ndd_desc')?.value?.trim() || '';
  if (!desc){
    nestiqShowNotif('Description is required', 'error');
    return;
  }
  const amt = Number(document.getElementById('ndd_amt')?.value) || 0;
  const date = document.getElementById('ndd_date')?.value || new Date().toISOString().slice(0, 10);
  const link = document.getElementById('ndd_link')?.value || '';
  const fileEl = document.getElementById('ndd_file');
  const addRow = rec => {
    t.deposit.deductions.push(rec);
    const owe = nestiqTenantOwingIfOverDeducted(t);
    t.deposit.tenantOwingAmount = owe;
    saveData?.();
    nestiqOpenDepositDetailModal(t.id);
  };
  const base = {
    id: nestiqNextDeductionId(t.deposit),
    description: desc,
    amount: amt,
    date,
    linkedInspectionItem: link || null,
    receipt: null
  };
  if (fileEl && fileEl.files && fileEl.files[0]){
    const r = new FileReader();
    r.onload = () => addRow({ ...base, receipt: String(r.result || '') });
    r.readAsDataURL(fileEl.files[0]);
  } else addRow(base);
}

function nestiqRemoveDeduction(tenantId, dedId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  t.deposit.deductions = (t.deposit.deductions || []).filter(x => Number(x.id) !== Number(dedId));
  t.deposit.tenantOwingAmount = nestiqTenantOwingIfOverDeducted(t);
  saveData?.();
  nestiqOpenDepositDetailModal(t.id);
}

function nestiqOpenDepositRefundModal(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  if (d.status !== 'held'){
    nestiqShowNotif('Refund is only available while deposit is held', 'warning');
    return;
  }
  const suggested = nestiqTenantDisplayRefund(t);
  const today = new Date().toISOString().slice(0, 10);
  const end = String(t.leaseEnd || '').slice(0, 10);
  const endD = new Date(end + 'T12:00:00');
  let deadlineLine = '';
  if (String(endD) !== 'Invalid Date'){
    const dl = new Date(endD);
    dl.setDate(dl.getDate() + 14);
    deadlineLine = `<div style="font-size:0.82rem;color:var(--rust);margin-bottom:10px">Rental Housing Act: refund should be made within <strong>14 days</strong> of lease end (${nestiqDepEsc(end)}). Target: <strong>${dl.toISOString().slice(0, 10)}</strong>.</div>`;
  }
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Process Deposit Refund — ${nestiqDepEsc(t.name)}</h2>
    ${deadlineLine}
    <div class="settings-card" style="margin-bottom:12px;font-size:0.84rem">
      <div>Deposit: R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')} · Interest: R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')} · Deductions: R${nestiqTenantDeductionsSum(t).toLocaleString('en-ZA')}</div>
      <div style="margin-top:6px"><strong>Suggested refund: R${suggested.toLocaleString('en-ZA')}</strong> (never negative)</div>
    </div>
    <div class="form-group"><label>Refund Amount (R) *</label><input class="form-input" id="ndr_amt" type="number" step="0.01" min="0" value="${suggested}"></div>
    <div class="form-group"><label>Refund Date *</label><input class="form-input" id="ndr_date" type="date" value="${today}"></div>
    <div class="form-group"><label>Refund Method *</label>
      <select class="form-input" id="ndr_method" onchange="nestiqToggleRefundBankFields()"><option>EFT</option><option>Cash</option><option>Card</option></select></div>
    <div id="ndr_bank_wrap" class="form-group"><label>Tenant bank name</label><input class="form-input" id="ndr_tbank" value="${nestiqDepEsc(d.tenantRefundBankName || '')}"></div>
    <div id="ndr_acc_wrap" class="form-group"><label>Tenant account number</label><input class="form-input" id="ndr_tacc" value="${nestiqDepEsc(d.tenantRefundAccountNumber || '')}"></div>
    <div class="form-group"><label>Reference Number</label><input class="form-input" id="ndr_ref"></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="ndr_notes" rows="2">${nestiqDepEsc(d.refundNotes || '')}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitDepositRefund(${t.id})">Process Refund</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
  nestiqToggleRefundBankFields();
}

function nestiqToggleRefundBankFields(){
  const m = document.getElementById('ndr_method')?.value || 'EFT';
  const show = m === 'EFT';
  const b = document.getElementById('ndr_bank_wrap');
  const a = document.getElementById('ndr_acc_wrap');
  if (b) b.style.display = show ? 'block' : 'none';
  if (a) a.style.display = show ? 'block' : 'none';
}

function nestiqSubmitDepositRefund(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  let amt = Number(document.getElementById('ndr_amt')?.value);
  if (!Number.isFinite(amt) || amt < 0){
    nestiqShowNotif('Refund must be zero or greater', 'error');
    return;
  }
  const maxRef = nestiqTenantDisplayRefund(t);
  if (amt > maxRef + 0.0001){
    nestiqShowNotif(`Refund cannot exceed available R${maxRef.toLocaleString('en-ZA')}`, 'error');
    return;
  }
  const suggested = maxRef;
  d.refundAmount = amt;
  d.refundDate = document.getElementById('ndr_date')?.value || new Date().toISOString().slice(0, 10);
  d.refundMethod = document.getElementById('ndr_method')?.value || 'EFT';
  d.refundReference = document.getElementById('ndr_ref')?.value?.trim() || '';
  d.refundNotes = document.getElementById('ndr_notes')?.value?.trim() || '';
  d.tenantRefundBankName = document.getElementById('ndr_tbank')?.value?.trim() || '';
  d.tenantRefundAccountNumber = document.getElementById('ndr_tacc')?.value?.trim() || '';
  if (amt >= suggested - 0.01 && suggested > 0) d.status = 'refunded';
  else if (amt > 0 && amt < suggested) d.status = 'partially-refunded';
  else d.status = 'refunded';
  saveData?.();
  normalizeDataModel?.();
  nestiqCloseModalAnimated();
  nestiqShowNotif('Refund recorded', 'success');
  nestiqPrintRefundReceipt(t);
  const wa = nestiqDepWaDigits(t.phone);
  if (wa && confirm('Send WhatsApp message to tenant with refund details?')){
    const L = nestiqLandlordDisplayName();
    const msg =
      `Dear ${t.name}, your deposit refund of R${amt.toLocaleString('en-ZA')} for ${t.property} - ${t.unit} has been processed.\n` +
      `Deposit: R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}\n` +
      `Interest: R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}\n` +
      `Deductions: R${nestiqTenantDeductionsSum(t).toLocaleString('en-ZA')}\n` +
      `Total refunded: R${amt.toLocaleString('en-ZA')}\n` +
      `Method: ${d.refundMethod}\n` +
      `Reference: ${d.refundReference || '—'}\n` +
      `Please allow 1-3 business days for EFT deposits. — ${L}`;
    openWhatsAppChat?.(t.phone, msg);
  }
  nestiqRenderDepositsPage?.();
  renderTenants?.();
}

function nestiqPrintRefundReceipt(t){
  const d = t.deposit;
  const html = `
    <div style="max-width:560px;margin:0 auto">
      <h1 style="font-family:'Playfair Display',serif">DEPOSIT REFUND RECEIPT</h1>
      <p><strong>Tenant:</strong> ${nestiqDepEsc(t.name)}</p>
      <p><strong>Property:</strong> ${nestiqDepEsc(t.property || '')}</p>
      <p><strong>Original Deposit:</strong> R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</p>
      <p><strong>Interest Earned:</strong> R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}</p>
      <p><strong>Less Deductions:</strong> R${nestiqTenantDeductionsSum(t).toLocaleString('en-ZA')}</p>
      <p><strong>Amount Refunded:</strong> R${(Number(d.refundAmount) || 0).toLocaleString('en-ZA')}</p>
      <p><strong>Refund Date:</strong> ${nestiqDepEsc(d.refundDate || '')}</p>
      <p><strong>Method:</strong> ${nestiqDepEsc(d.refundMethod || '')}</p>
      <p><strong>Reference:</strong> ${nestiqDepEsc(d.refundReference || '')}</p>
      <p style="margin-top:28px">Signed: ___________________________</p>
    </div>`;
  nestiqOpenPrintableDoc(html, 'Deposit Refund Receipt');
}

function nestiqOpenDepositClaimModal(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const total = nestiqTenantDepositTotalValue(t);
  const ded = nestiqTenantDeductionsSum(t);
  const net = nestiqTenantDisplayRefund(t);
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Record Deposit Claim — ${nestiqDepEsc(t.name)}</h2>
    <p class="modal-sub">Available: R${total.toLocaleString('en-ZA')} · Deductions: R${ded.toLocaleString('en-ZA')} · Net: R${net.toLocaleString('en-ZA')}</p>
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px">List of deductions must be provided to the tenant within 14 days of lease end (Rental Housing Act).</div>
    <div class="form-group"><label>Claim type</label>
      <select class="form-input" id="ndc_type"><option value="full">Full claim (entire deposit)</option><option value="partial">Partial claim (refund remainder)</option></select></div>
    <div class="form-group"><label>Reasons (tick all that apply)</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Unpaid rent"> Unpaid rent</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Damage"> Property damage beyond fair wear and tear</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Cleaning"> Cleaning costs</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Missing items"> Missing items</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Early termination"> Early termination penalty</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:0.84rem"><input type="checkbox" class="ndc_r" value="Other"> Other</label>
    </div>
    <div class="form-group"><label>Amount claimed (R)</label><input class="form-input" id="ndc_claim_amt" type="number" step="0.01" min="0" value="${ded > 0 ? ded : total}"></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="ndc_claim_notes" rows="2"></textarea></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitDepositClaim(${t.id})">Record Claim</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function nestiqSubmitDepositClaim(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const type = document.getElementById('ndc_type')?.value || 'full';
  const reasons = [...document.querySelectorAll('.ndc_r:checked')].map(el => el.value);
  const claimAmt = Number(document.getElementById('ndc_claim_amt')?.value) || 0;
  const total = nestiqTenantDepositTotalValue(t);
  if (claimAmt > total + 0.01){
    nestiqShowNotif('Claim exceeds deposit + interest', 'warning');
  }
  d.claimType = type;
  d.claimReasons = reasons;
  d.claimNotes = document.getElementById('ndc_claim_notes')?.value?.trim() || '';
  d.claimDate = new Date().toISOString().slice(0, 10);
  d.status = 'claimed';
  const tot = nestiqTenantDepositTotalValue(t);
  if (type === 'full') d.refundAmount = 0;
  else d.refundAmount = Math.max(0, tot - claimAmt);
  saveData?.();
  nestiqCloseModalAnimated();
  nestiqShowNotif('Claim recorded', 'success');
  nestiqPrintClaimLetter(t, claimAmt);
  nestiqRenderDepositsPage?.();
  renderTenants?.();
}

function nestiqPrintClaimLetter(t, claimAmt){
  const d = t.deposit;
  const dedRows = (d.deductions || [])
    .map(
      r =>
        `<tr><td>${nestiqDepEsc(r.description)}</td><td>R${(Number(r.amount) || 0).toLocaleString('en-ZA')}</td><td>${nestiqDepEsc(r.date)}</td></tr>`
    )
    .join('');
  const balance = Math.max(0, nestiqTenantDepositTotalValue(t) - claimAmt);
  const html = `
    <div style="max-width:600px;margin:0 auto;font-size:0.9rem;line-height:1.5">
      <h1 style="font-family:'Playfair Display',serif">DEPOSIT CLAIM NOTICE</h1>
      <p>Dear ${nestiqDepEsc(t.name)},</p>
      <p>With reference to your lease for <strong>${nestiqDepEsc(t.property || '')}</strong> which ended on <strong>${nestiqDepEsc(String(t.leaseEnd || '').slice(0, 10))}</strong>, please be advised that we are retaining your deposit as follows:</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:0.85rem">
        <thead><tr><th style="border:1px solid #ccc;padding:6px;text-align:left">Description</th><th style="border:1px solid #ccc;padding:6px">Amount</th><th style="border:1px solid #ccc;padding:6px">Date</th></tr></thead>
        <tbody>${dedRows || '<tr><td colspan="3">See attached breakdown / deductions above</td></tr>'}</tbody>
      </table>
      <p><strong>Total claimed:</strong> R${(Number(claimAmt) || 0).toLocaleString('en-ZA')}</p>
      <p><strong>Balance refunded (if any):</strong> R${balance.toLocaleString('en-ZA')}</p>
      <p>Reasons: ${nestiqDepEsc((d.claimReasons || []).join(', ') || '—')}</p>
      <p style="margin-top:24px">${nestiqDepEsc(nestiqLandlordDisplayName())}</p>
    </div>`;
  nestiqOpenPrintableDoc(html, 'Deposit Claim Notice');
}

function nestiqOpenDepositDispute(tenantId){
  const t = (tenantsData || []).find(x => Number(x.id) === Number(tenantId));
  if (!t) return;
  nestiqEnsureTenantDeposit(t);
  t.deposit.status = 'disputed';
  saveData?.();
  nestiqShowNotif('Deposit marked as disputed', 'warning');
  nestiqCloseModalAnimated();
  nestiqRenderDepositsPage?.();
}

function nestiqTenantDetailDepositSection(t){
  nestiqEnsureTenantDeposit(t);
  const d = t.deposit;
  const total = nestiqTenantDepositTotalValue(t);
  return `
    <div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">Security deposit</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">
        <div><span style="color:var(--muted)">Principal</span><br><strong>R${nestiqTenantDepositAmount(t).toLocaleString('en-ZA')}</strong></div>
        <div><span style="color:var(--muted)">Interest earned</span><br><strong>R${nestiqTenantDepositInterest(t).toLocaleString('en-ZA')}</strong></div>
        <div><span style="color:var(--muted)">Total value</span><br><strong>R${total.toLocaleString('en-ZA')}</strong></div>
        <div><span style="color:var(--muted)">Status</span><br><span class="badge ${nestiqDepositStatusBadgeClass(d.status)}">${nestiqDepositStatusLabel(d.status)}</span></div>
      </div>
      <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="nestiqCloseModalAnimated();showPage('deposits');setTimeout(function(){nestiqOpenDepositDetailModal(${t.id})},400)">Manage deposit</button>
    </div>`;
}

function nestiqRenderTenantDepositCard(tenant){
  const el = document.getElementById('tenantDepositCard');
  if (!el || !tenant) return;
  nestiqEnsureTenantDeposit(tenant);
  const d = tenant.deposit;
  const total = nestiqTenantDepositTotalValue(tenant);
  const ded = nestiqTenantDeductionsSum(tenant);
  const net = nestiqTenantDisplayRefund(tenant);
  const days = typeof getTenantLeaseDaysRemaining === 'function' ? getTenantLeaseDaysRemaining(tenant) : 999;
  const leaseNote =
    days <= 90 && days >= 0 ?
      `<div style="font-size:0.78rem;color:var(--muted);margin-top:8px">Your lease ends in <strong>${days}</strong> days. Your deposit will be processed within <strong>14 days</strong> of your lease end date.</div>` :
      '';
  const dedBlock =
    (d.deductions || []).length ?
      `<div style="margin-top:10px;font-size:0.82rem">
        <div style="font-weight:600;margin-bottom:4px">Deductions</div>
        ${(d.deductions || [])
          .map(
            r =>
              `<div style="display:flex;justify-content:space-between;border-bottom:1px dashed var(--border);padding:4px 0"><span>${nestiqDepEsc(r.description)}</span><span>R${(Number(r.amount) || 0).toLocaleString('en-ZA')}</span></div>`
          )
          .join('')}
        <div style="margin-top:8px"><strong>Net after deductions:</strong> R${net.toLocaleString('en-ZA')}</div>
      </div>` :
      '';
  el.innerHTML = `
    <div class="portal-card-title">Security deposit</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.84rem">
      <div><div class="tenant-meta-lbl">Deposit amount</div><div class="tenant-meta-val">R${nestiqTenantDepositAmount(tenant).toLocaleString('en-ZA')}</div></div>
      <div><div class="tenant-meta-lbl">Date collected</div><div class="tenant-meta-val">${d.collected ? nestiqDepEsc(String(d.collectedDate || '').slice(0, 10)) : 'Pending'}</div></div>
      <div><div class="tenant-meta-lbl">Status</div><div class="tenant-meta-val"><span class="badge ${nestiqDepositStatusBadgeClass(d.status)}">${nestiqDepositStatusLabel(d.status)}</span></div></div>
      <div><div class="tenant-meta-lbl">Interest earned</div><div class="tenant-meta-val">R${nestiqTenantDepositInterest(tenant).toLocaleString('en-ZA')}</div></div>
    </div>
    <div style="margin-top:10px;font-size:0.84rem"><strong>Current value:</strong> R${total.toLocaleString('en-ZA')}</div>
    <div style="font-size:0.78rem;color:var(--muted);margin-top:8px">Expected breakdown (before damage): Deposit R${nestiqTenantDepositAmount(tenant).toLocaleString('en-ZA')} + Interest R${nestiqTenantDepositInterest(tenant).toLocaleString('en-ZA')} = R${total.toLocaleString('en-ZA')}</div>
    ${leaseNote}
    ${dedBlock}`;
}

window.nestiqNormalizeTenantDeposit = nestiqNormalizeTenantDeposit;
window.calculateDepositInterest = calculateDepositInterest;
window.nestiqRenderDepositsPage = nestiqRenderDepositsPage;
window.nestiqOnDepositsSearchInput = nestiqOnDepositsSearchInput;
window.nestiqOpenDepositCollectionModal = nestiqOpenDepositCollectionModal;
window.nestiqSubmitDepositCollection = nestiqSubmitDepositCollection;
window.nestiqOpenDepositDetailModal = nestiqOpenDepositDetailModal;
window.nestiqOpenDepositRefundModal = nestiqOpenDepositRefundModal;
window.nestiqToggleRefundBankFields = nestiqToggleRefundBankFields;
window.nestiqSubmitDepositRefund = nestiqSubmitDepositRefund;
window.nestiqOpenDepositClaimModal = nestiqOpenDepositClaimModal;
window.nestiqSubmitDepositClaim = nestiqSubmitDepositClaim;
window.nestiqAddDeduction = nestiqAddDeduction;
window.nestiqRemoveDeduction = nestiqRemoveDeduction;
window.nestiqSaveDepositNotes = nestiqSaveDepositNotes;
window.nestiqViewDepositProof = nestiqViewDepositProof;
window.nestiqViewDeductionReceipt = nestiqViewDeductionReceipt;
window.nestiqOpenDepositDispute = nestiqOpenDepositDispute;
window.nestiqTenantDepositAmount = nestiqTenantDepositAmount;
window.nestiqTenantDepositTotalValue = nestiqTenantDepositTotalValue;
window.nestiqTenantDetailDepositSection = nestiqTenantDetailDepositSection;
window.nestiqRenderTenantDepositCard = nestiqRenderTenantDepositCard;
