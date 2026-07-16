let tdMiniCalendar=null;

// Tenant portal live session state (Firestore-driven)
window.currentUser = window.currentUser || null;
window.currentTenantData = window.currentTenantData || null;
window.tenantPayments = window.tenantPayments || [];
window.tenantMaintenance = window.tenantMaintenance || [];
window.tenantUploadedDocuments = window.tenantUploadedDocuments || [];
window.tenantNotices = window.tenantNotices || [];
window.tenantMessages = window.tenantMessages || [];
window.landlordInfo = window.landlordInfo || null;
window.tenantProperty = window.tenantProperty || null;

function currentSession(){
  try{
    if(window.__nestiqSession) return window.__nestiqSession;
    return JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
  }catch(_err){return null;}
}
function getCurrentTenant(){ return window.currentTenantData || null; }

function tenantIssueToCategory(issue){
  const map={Plumbing:'Plumbing',Electrical:'Electrical',Structural:'Structural',Appliance:'Appliance','Pest Control':'Pest Control',Damp:'Other',Security:'Other',Other:'Other'};
  return map[issue]||'Other';
}

function nestiqTenantMaintCompletedIso(r){
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(r.completedDate||''))) return r.completedDate;
  const d=new Date(r.date);
  return String(d)==='Invalid Date'?'':d.toISOString().slice(0,10);
}

function nestiqTenantOpenMaintWarrantyNote(m, tenant){
  if(!tenant||m.status==='done') return '';
  const cat=m.issueCategory||'Other';
  const past=(maintenanceData||[]).filter(x=>x.tenantId===tenant.id&&x.status==='done'&&(x.issueCategory||'Other')===cat);
  for(const r of past){
    const iso=nestiqTenantMaintCompletedIso(r);
    const end=typeof nestiqParseWarrantyEnd==='function'?nestiqParseWarrantyEnd(iso,r.warrantyPeriod):null;
    if(end&&new Date()<=end){
      return `<div style="font-size:0.72rem;color:var(--rust);background:rgba(201,168,76,0.14);border-radius:6px;padding:6px;margin-top:6px;border:1px solid var(--gold)">This issue may still be under warranty from the repair on ${formatDate(iso)}.</div>`;
    }
  }
  return '';
}
function formatDate(iso){ return formatDateLang?.(iso,getCurrentLanguage?.()) || String(iso||''); }

function formatPaymentMonth(iso){
  if(!iso) return '—';
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return String(iso||'—');
  return d.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
}

function nestiqTenantLast12PaymentRows(tenant){
  if(!tenant) return [];
  const payments=window.tenantPayments||[];
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const rent=Number(tenant.rent||0);
  const today=new Date();
  today.setHours(0,0,0,0);
  const rows=[];
  for(let i=11;i>=0;i--){
    const monthStart=new Date(today.getFullYear(),today.getMonth()-i,1);
    const monthEnd=new Date(monthStart.getFullYear(),monthStart.getMonth()+1,0);
    const monthLabel=monthStart.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
    const payment=payments.find(p=>{
      const pd=new Date(p.date);
      return pd.getFullYear()===monthStart.getFullYear()&&pd.getMonth()===monthStart.getMonth();
    });
    if(payment){
      rows.push({
        month:monthLabel,
        amount:Number(payment.amount||rent),
        datePaid:payment.date,
        status:'paid',
        paymentId:payment.id,
        receiptNo:payment.receiptNo||'',
        method:payment.method||'EFT'
      });
      continue;
    }
    const dueDate=new Date(monthStart.getFullYear(),monthStart.getMonth(),dueDay);
    const isPastMonth=monthEnd<today;
    const isCurrentMonth=monthStart.getFullYear()===today.getFullYear()&&monthStart.getMonth()===today.getMonth();
    const overdue=isPastMonth||(isCurrentMonth&&today>dueDate);
    rows.push({
      month:monthLabel,
      amount:rent,
      datePaid:null,
      status:overdue?'overdue':'upcoming'
    });
  }
  return rows;
}

function paymentStatusBadgeHtml(status){
  if(status==='paid') return '<span class="badge badge-green">Paid</span>';
  if(status==='overdue') return '<span class="badge badge-red">Overdue</span>';
  return '<span class="badge badge-amber">Upcoming</span>';
}

function calculateTenantRentStatus(tenant){
  const today=new Date();
  const currentMonth=today.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  const dueDate=tenant.monthlyDueDate||1;
  const payments=window.tenantPayments||[];
  const currentPayment=payments.find(p=>{
    const d=new Date(p.date);
    return d.getMonth()===today.getMonth()&&d.getFullYear()===today.getFullYear();
  });
  if(currentPayment){
    return{
      status:'paid',
      label:'PAID',
      badgeClass:'badge-green',
      payment:currentPayment,
      message:'Paid on '+currentPayment.date+' via '+(currentPayment.method||'EFT'),
      receiptNo:currentPayment.receiptNo||''
    };
  }
  if(today.getDate()>dueDate){
    const daysOverdue=today.getDate()-dueDate;
    return{
      status:'overdue',
      label:'OVERDUE',
      badgeClass:'badge-red',
      daysOverdue,
      message:daysOverdue+' days overdue',
      amountDue:tenant.rent
    };
  }
  const daysRemaining=dueDate-today.getDate();
  return{
    status:'due',
    label:'RENT DUE',
    badgeClass:'badge-amber',
    daysRemaining,
    message:'Due in '+daysRemaining+' days',
    amountDue:tenant.rent
  };
}
window.calculateTenantRentStatus=calculateTenantRentStatus;

function renderTenantProfile(){
  const tenant=window.currentTenantData;
  if(!tenant){
    const nameEl=document.getElementById('portalTenantName');
    if(nameEl) nameEl.textContent='Loading...';
    return;
  }
  const property=window.tenantProperty||null;
  const leaseTxt=tenant.lease||tenant.leaseEnd||'—';
  const propertyLine=(tenant.unit||'')+' — '+(tenant.property||property?.name||'')+' · Lease active until '+leaseTxt;

  const heroName=document.getElementById('portalTenantName');
  if(heroName) heroName.textContent=tenant.name||'Tenant';
  const heroInfo=document.getElementById('portalPropertyInfo');
  if(heroInfo) heroInfo.textContent=propertyLine;

  const avatar=document.getElementById('portalAvatar');
  if(avatar) avatar.textContent=tenant.avatar||'👤';
  const sbName=document.getElementById('portalSidebarName');
  if(sbName) sbName.textContent=tenant.name||'Tenant';
  const sbUnit=document.getElementById('portalSidebarUnit');
  if(sbUnit) sbUnit.textContent=(tenant.unit||'')+' · '+(tenant.property||property?.name||'');
  const sbRent=document.getElementById('portalSidebarRent');
  if(sbRent) sbRent.textContent='R'+Number(tenant.rent||0).toLocaleString('en-ZA');
  const sbStatus=document.getElementById('portalSidebarStatus');
  if(sbStatus){
    const st=calculateTenantRentStatus(tenant);
    sbStatus.textContent=st.label;
    sbStatus.className='badge '+st.badgeClass;
  }

  const navA=document.getElementById('tenantNavAvatar');
  if(navA){
    const pp=tenant.profilePhoto;
    if(pp&&(String(pp).startsWith('data:')||String(pp).startsWith('http'))){
      navA.innerHTML=`<img src="${pp}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`;
    }else{
      navA.textContent=String(tenant.name||'T').trim().slice(0,1).toUpperCase();
    }
  }
  const navN=document.getElementById('tenantNavName');
  if(navN) navN.textContent=tenant.name||'Tenant';
  const title=document.getElementById('tenantDashTitle');
  if(title) title.textContent='Welcome back, '+(tenant.name||'Tenant');
  const sub=document.getElementById('tenantDashSub');
  if(sub) sub.textContent=propertyLine;
}
window.renderTenantProfile=renderTenantProfile;

function renderRentStatusCard(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const today=new Date();
  const currentMonth=today.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  const status=calculateTenantRentStatus(tenant);
  const el=document.getElementById('tenantPaymentsRentStatus')||document.getElementById('rentStatusCard')||document.getElementById('tenantRentStatus');
  if(!el) return;
  const rentAmt=Number(tenant.rent||0);
  if(status.status==='paid'){
    el.innerHTML=`
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(90,122,96,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">✅</div>
    <div style="flex:1">
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--sage)">PAID</div>
      <div style="color:var(--muted);font-size:0.9rem">${currentMonth} · R${rentAmt.toLocaleString('en-ZA')}</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:4px">${status.message}</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">Receipt: ${status.receiptNo||''}</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-outline btn-sm" onclick="downloadLatestReceipt()">Download Receipt</button>
      <button class="btn-outline btn-sm" onclick="scrollToTenantCard('tenantPaymentHistory')">View History</button>
    </div>
  </div>`;
    return;
  }
  if(status.status==='due'){
    el.innerHTML=`
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(201,168,76,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">⏰</div>
    <div style="flex:1">
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--gold)">RENT DUE</div>
      <div style="color:var(--muted);font-size:0.9rem">${currentMonth} · R${rentAmt.toLocaleString('en-ZA')}</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:4px">${status.message}</div>
    </div>
    <button class="btn-primary" style="min-width:140px" onclick="openTenantPayModal()">Pay Rent →</button>
  </div>`;
    return;
  }
  el.innerHTML=`
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(196,106,58,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">⚠️</div>
    <div style="flex:1">
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--rust)">OVERDUE</div>
      <div style="color:var(--muted);font-size:0.9rem">${currentMonth} · R${rentAmt.toLocaleString('en-ZA')}</div>
      <div style="font-size:0.85rem;color:var(--rust);margin-top:4px">${status.message}</div>
    </div>
    <button class="btn-primary" style="min-width:160px;background:var(--rust);border-color:var(--rust)" onclick="openTenantPayModal()">Pay Now →</button>
  </div>`;
}
window.renderRentStatusCard=renderRentStatusCard;

function nextReceiptNo(){
  const all=[...(paymentsData||[]), ...(Array.isArray(tenantsData)?tenantsData:[]).flatMap(t=>t.payments||[])];
  const nums=all.map(p=>String(p.receiptNo||'').match(/REC-\d{4}-(\d+)/)?.[1]).filter(Boolean).map(Number);
  const seq=String((nums.length?Math.max(...nums):0)+1).padStart(4,'0');
  return `REC-${new Date().getFullYear()}-${seq}`;
}

function openPrintWindow(html,title='Document'){
  const w=window.open('','_blank');
  if(!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:DM Sans,Arial;padding:22px;color:#0e1117}h1,h2{font-family:Playfair Display,serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}.print-btn{position:fixed;right:14px;top:10px}</style></head><body><button class="print-btn" onclick="window.print()">Print</button>${html}<script>window.print()</script></body></html>`);
  w.document.close();
}

function renderTenantRentStatus(tenant, status){
  const card=document.getElementById('tenantRentStatus'); if(!card) return;
  if(status.status==='paid'){
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-ink" style="color:var(--sage);font-family:'Playfair Display',serif">✓ ${t('portal.paid')}</div><div class="text-sm text-muted mt-1">${status.payment.month||new Date(status.payment.date).toLocaleDateString('en-ZA',{month:'long',year:'numeric'})} · ${formatCurrency(status.payment.amount)}</div><div class="text-sm text-muted mt-1">Paid on ${formatDate(status.payment.date)} via ${status.payment.method||'EFT'} · ${status.payment.receiptNo||''}</div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn-outline btn-sm" onclick="printReceiptById(${status.payment.id||0})">${t('common.download')}</button><button class="btn-outline btn-sm" onclick="scrollToTenantCard('tenantPaymentHistory')">${t('portal.paymentHistory')}</button></div>`;
  }else if(status.status==='due'){
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-gold" style="font-family:'Playfair Display',serif">⏰ ${t('portal.due')}</div><div class="text-sm text-muted mt-1">${formatCurrency(tenant.rent||0)} due on ${formatDate(status.dueDate)}</div><div class="text-sm text-muted mt-1">${t('portal.daysRemaining',{days:status.days})}</div><button class="btn-primary" style="width:100%;justify-content:center;margin-top:10px" onclick="openTenantPayModal()">${t('portal.payNow')}</button>`;
  }else{
    const fee=typeof window.calculateLateFee==='function'?calculateLateFee(tenant,new Date()):0;
    const rentAmt=Number(tenant.rent||0);
    const total=rentAmt+fee;
    const feeBlock=fee>0
      ?`<div style="font-size:0.86rem;color:var(--rust);margin-top:8px;line-height:1.45">
          <div><strong>Late fee: ${formatCurrency(fee)}</strong></div>
          <div><strong>Total amount owed: ${formatCurrency(total)}</strong></div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:4px">(Including ${formatCurrency(rentAmt)} rent + ${formatCurrency(fee)} late fee)</div>
        </div>`
      :`<div style="font-size:0.82rem;color:var(--muted)">Late fee may apply as per your landlord's policy.</div>`;
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-ink" style="color:var(--rust);font-family:'Playfair Display',serif">⚠ ${t('portal.overdue')}</div><div class="text-sm text-muted mt-1">${t('portal.daysOverdue',{days:status.days})} · ${formatCurrency(tenant.rent||0)}</div>${feeBlock}<button class="btn-primary" style="width:100%;justify-content:center;margin-top:10px;background:var(--rust);border-color:var(--rust)" onclick="openTenantPayModal()">${t('portal.payNow')}</button>`;
  }
}

function openTenantPayModal(){
  openPayRentModal();
}
function confirmTenantPayment(){
  return submitTenantPayment();
}
window.openTenantPayModal=openTenantPayModal;
window.confirmTenantPayment=confirmTenantPayment;

function openPayRentModal(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  document.getElementById('modalContent').innerHTML=`
  <h2 class="modal-title">Pay Rent</h2>
  <p class="modal-sub">
    ${tenant.property} —
    ${tenant.unit}
  </p>

  <div style="background:var(--paper);
    border-radius:12px;padding:20px;
    border:1px solid var(--border);
    margin-bottom:20px;text-align:center">
    <div style="font-size:0.78rem;
      color:var(--muted);margin-bottom:4px">
      AMOUNT DUE
    </div>
    <div style="font-family:'Playfair Display',serif;
      font-size:2rem;font-weight:700;
      color:var(--gold)">
      R${Number(tenant.rent||0).toLocaleString('en-ZA')}
    </div>
    <div style="font-size:0.78rem;
      color:var(--muted);margin-top:4px">
      Due on the ${tenant.monthlyDueDate||1} of each month
    </div>
  </div>

  <div class="form-group">
    <label style="font-size:.8rem;font-weight:600;
      display:block;margin-bottom:6px">
      Payment Method
    </label>
    <select class="form-input" id="payMethod">
      <option value="EFT">EFT / Bank Transfer</option>
      <option value="Cash">Cash</option>
      <option value="Card">Card</option>
      <option value="SnapScan">SnapScan</option>
      <option value="PayShap">PayShap</option>
    </select>
  </div>

  <div class="form-group" style="margin-top:12px">
    <label style="font-size:.8rem;font-weight:600;
      display:block;margin-bottom:6px">
      Payment Date
    </label>
    <input class="form-input"
      id="payDate"
      type="date"
      value="${new Date().toISOString().split('T')[0]}">
  </div>

  <div class="form-group" style="margin-top:12px">
    <label style="font-size:.8rem;font-weight:600;
      display:block;margin-bottom:6px">
      Reference Number (optional)
    </label>
    <input class="form-input"
      id="payReference"
      type="text"
      placeholder="Your bank reference">
  </div>

  <button class="btn-primary"
    style="width:100%;justify-content:center;
      margin-top:20px"
    onclick="submitTenantPayment()">
    Confirm Payment →
  </button>
`;
  document.getElementById('modalOverlay').classList.add('open');
}
window.openPayRentModal=openPayRentModal;

async function submitTenantPayment(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const method=document.getElementById('payMethod')?.value;
  const date=document.getElementById('payDate')?.value;
  const reference=document.getElementById('payReference')?.value.trim();
  const db=window.nestiqDb;
  const u=window.currentUser;
  if(!db||!u) return;
  try{
    window.showLoading?.('Recording payment...');
    const receiptNo='REC-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000);
    const ts=window.nestiqTenantSession||{};
    const lid=String(ts.landlordId||u.landlordId||'');
    const tid=String(ts.tenantId||u.tenantDocId||'');
    const tenantUid=firebase.auth().currentUser?.uid||'';
    await window.nestiqFs.payments(db, lid).add({
      tenantId:tid,
      tenantUid,
      landlordId:lid,
      propertyId:tenant.propertyId||'',
      amount:Number(tenant.rent||0),
      date:date,
      method:method,
      reference:reference||'',
      receiptNo:receiptNo,
      month:new Date().toLocaleString('en-ZA',{month:'long',year:'numeric'}),
      status:'paid',
      recordedBy:'tenant',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    await window.nestiqFs.tenants(db, lid).doc(tid).update({
      status:'paid',
      lastPaymentDate:date
    });
    window.hideLoading?.();
    closeModal();
    showNotif('✅ Payment recorded! Receipt: '+receiptNo,'success');
    window.renderRentStatusCard?.();
    window.renderPaymentHistoryCard?.();
    nestiqTenantRefreshVisibleSections?.();
  }catch(error){
    window.hideLoading?.();
    showNotif('Failed to record payment','error');
    console.error('Tenant payment error:',error);
  }
}
window.submitTenantPayment=submitTenantPayment;

function renderTenantLeaseCard(tenant){
  const card=document.getElementById('tenantLeaseCard'); if(!card) return;
  // Part 7 — real lease rendering with ids
  card.innerHTML=`
    <div class="portal-card-title">My Lease</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">Lease Start</div><div class="tenant-meta-val" id="leaseStartDate">—</div></div>
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">Lease End</div><div class="tenant-meta-val" id="leaseEndDate">—</div></div>
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">Monthly Rent</div><div class="tenant-meta-val" id="leaseRentAmount" style="color:var(--gold)">—</div></div>
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">Deposit Held</div><div class="tenant-meta-val" id="leaseDepositAmount">—</div></div>
    </div>
    <div style="margin-top:10px;display:flex;justify-content:space-between;font-size:0.78rem;color:var(--muted)">
      <span>Progress</span>
      <span id="leaseProgressPercent">—</span>
    </div>
    <div class="lease-bar"><div class="lease-fill" id="leaseProgressBar" style="width:0%"></div></div>
    <div style="font-size:0.82rem;color:var(--muted);margin-top:6px" id="leaseDaysRemaining">—</div>
    <div style="display:none;margin-top:10px;font-size:0.82rem;color:var(--rust)" id="leaseRenewalWarning"></div>
  `;
  renderLeaseCard();
  const mo=document.getElementById('tenantMoveOutCard');
  // Move-out card visibility controlled by renderLeaseCard()
  if(mo) mo.style.display='none';
}

function renderLeaseCard(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const leaseStart = new Date(tenant.leaseStart || (tenant.createdAt && tenant.createdAt.toDate ? tenant.createdAt.toDate() : new Date()));
  const leaseEnd = new Date(tenant.lease || tenant.leaseEnd || '2026-12-31');
  const today=new Date();
  const totalDays=(leaseEnd-leaseStart)/(1000*60*60*24);
  const daysElapsed=(today-leaseStart)/(1000*60*60*24);
  const progressPercent=Math.min(100,Math.max(0,Math.round((daysElapsed/Math.max(1,totalDays))*100)));
  const daysRemaining=Math.max(0,Math.round((leaseEnd-today)/(1000*60*60*24)));
  const sEl=document.getElementById('leaseStartDate');
  if(sEl) sEl.textContent=leaseStart.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
  const eEl=document.getElementById('leaseEndDate');
  if(eEl) eEl.textContent=leaseEnd.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
  const rentAmtEl=document.getElementById('leaseRentAmount');
  if(rentAmtEl) rentAmtEl.textContent='R'+Number(tenant.rent||0).toLocaleString('en-ZA');
  const depAmtEl=document.getElementById('leaseDepositAmount');
  if(depAmtEl) depAmtEl.textContent='R'+Number(tenant.deposit || (Number(tenant.rent||0)*2) || 0).toLocaleString('en-ZA');
  const bar=document.getElementById('leaseProgressBar');
  if(bar) bar.style.width=progressPercent+'%';
  const pct=document.getElementById('leaseProgressPercent');
  if(pct) pct.textContent=progressPercent+'% complete';
  const dr=document.getElementById('leaseDaysRemaining');
  if(dr) dr.textContent=daysRemaining+' days remaining';
  const warn=document.getElementById('leaseRenewalWarning');
  if(warn){
    if(daysRemaining<90){
      warn.style.display='block';
      warn.textContent='Your lease expires in '+daysRemaining+' days. Contact your landlord to discuss renewal.';
    }else{
      warn.style.display='none';
    }
  }
  const mo=document.getElementById('tenantMoveOutCard');
  if(mo) mo.style.display=daysRemaining<90?'block':'none';
}
window.renderLeaseCard=renderLeaseCard;

function tenantStatementRows(){
  return [...(window.tenantPayments||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

function renderPaymentHistoryCard(){
  const tenant=window.currentTenantData;
  const card=document.getElementById('tenantPaymentHistory');
  if(!card) return;
  if(!card.querySelector('#paymentHistory')&&!card.querySelector('#tenantPaymentsChart')){
    card.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="portal-card-title" style="margin:0">Payment History</div>
      <button type="button" class="btn-outline btn-sm" onclick="downloadTenantPaymentStatementPdf()">Download Statement</button>
    </div>
    <div class="tenant-payments-chart-wrap"><canvas id="tenantPaymentsChart"></canvas></div>
    <div id="paymentHistory"></div>
    <div id="tenantLateFeesSection"></div>`;
  }
  renderTenantPaymentsChart();
  renderTenantPaymentsTable();
  renderTenantLateFeesSection();
}
window.renderPaymentHistoryCard=renderPaymentHistoryCard;

let __tenantPaymentsChartInst=null;

function renderTenantPaymentsChart(){
  const tenant=window.currentTenantData;
  const canvas=document.getElementById('tenantPaymentsChart');
  if(!canvas||!tenant||typeof Chart==='undefined') return;
  const rows=nestiqTenantLast12PaymentRows(tenant);
  const labels=rows.map(r=>String(r.month||'').split(' ')[0].slice(0,3));
  const colors=rows.map(r=>r.status==='paid'?'#5a7a60':r.status==='overdue'?'#c46a3a':'#bbb');
  if(__tenantPaymentsChartInst){ __tenantPaymentsChartInst.destroy(); __tenantPaymentsChartInst=null; }
  __tenantPaymentsChartInst=new Chart(canvas,{
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'Rent',
        data:rows.map(r=>Number(r.amount||0)),
        backgroundColor:colors,
        borderRadius:6,
        maxBarThickness:36
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        y:{ beginAtZero:true, ticks:{ callback:v=>'R'+Number(v).toLocaleString('en-ZA') } },
        x:{ grid:{ display:false } }
      }
    }
  });
}

function renderTenantPaymentsTable(){
  const tenant=window.currentTenantData;
  const host=document.getElementById('paymentHistory');
  if(!host||!tenant) return;
  const rows=nestiqTenantLast12PaymentRows(tenant);
  const hasPaid=rows.some(r=>r.status==='paid');
  if(!hasPaid&&!(window.tenantPayments||[]).length){
    host.innerHTML=`<div style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:2rem;margin-bottom:12px">💳</div><div style="font-weight:600;color:var(--ink);margin-bottom:6px">No payments yet</div></div>`;
    return;
  }
  host.innerHTML=`
    <table class="tenant-payments-table">
      <thead><tr><th>Month</th><th>Amount</th><th>Date Paid</th><th>Method</th><th>Receipt</th></tr></thead>
      <tbody>${rows.map(r=>{
        const datePaid=r.datePaid?new Date(r.datePaid).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'—';
        const receiptBtn=r.status==='paid'&&r.paymentId!=null?`<button class="btn-outline btn-sm" style="padding:4px 10px;font-size:0.72rem" onclick="downloadPaymentReceipt('${String(r.paymentId).replace(/'/g,"\\'")}')">Download</button>`:'—';
        return `<tr><td>${r.month}</td><td>R${Number(r.amount||0).toLocaleString('en-ZA')}</td><td>${datePaid}</td><td>${r.method||'—'}</td><td>${receiptBtn}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
}

function renderTenantLateFeesSection(){
  const tenant=window.currentTenantData;
  const el=document.getElementById('tenantLateFeesSection');
  if(!el||!tenant) return;
  const fee=typeof window.calculateLateFee==='function'?calculateLateFee(tenant,new Date()):0;
  const ledger=(window.lateFees||[]).filter(f=>String(f.tenantId)===String(tenant.id)&&!f.waived);
  if(!fee&&!ledger.length){ el.innerHTML=''; return; }
  el.innerHTML=`
    <div class="tenant-section-card" style="margin-top:14px;border-color:rgba(196,106,58,0.35)">
      <div class="tenant-section-title" style="color:var(--rust)">Outstanding Late Fees</div>
      ${fee?`<div style="font-size:0.88rem;margin-bottom:8px">Current late fee: <strong>R${Number(fee).toLocaleString('en-ZA')}</strong></div>`:''}
      ${ledger.length?ledger.map(f=>`<div style="font-size:0.8rem;color:var(--muted);padding:4px 0">${f.month||''}: R${Number(f.amount||0).toLocaleString('en-ZA')}</div>`).join(''):''}
    </div>`;
}

function downloadTenantPaymentStatementPdf(){
  const tenant=window.currentTenantData;
  if(!tenant){ showNotif?.('Tenant profile not loaded','warning'); return; }
  const rows=nestiqTenantLast12PaymentRows(tenant).filter(r=>r.status==='paid');
  if(!rows.length){ showNotif?.('No paid months to include on a statement','warning'); return; }
  const {jsPDF}=window.jspdf||{};
  if(!jsPDF){ showNotif?.('PDF library not loaded','error'); return; }
  try{
    showNotif?.('Generating PDF...','info');
    const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    const prop=window.tenantProperty||{};
    let y=pdfGenerator.addHeader(doc,'RENT PAYMENT STATEMENT');
    const w=doc.internal.pageSize.getWidth()-(pdfGenerator.marginX*2);
    doc.setFontSize(10);
    doc.setTextColor(...pdfGenerator.colors.dark);
    doc.text(`Tenant: ${tenant.name||'—'}`,pdfGenerator.marginX,y);
    y+=6;
    doc.text(`Property: ${tenant.property||prop.name||'—'}`,pdfGenerator.marginX,y);
    y+=6;
    doc.text(`Unit: ${tenant.unit||'—'}`,pdfGenerator.marginX,y);
    y+=10;
    const tableRows=rows.map(r=>[
      r.month,
      r.datePaid?formatDate(r.datePaid):'—',
      `R${Number(r.amount||0).toLocaleString('en-ZA')}`,
      String(r.status||'paid').toUpperCase()
    ]);
    y=pdfGenerator.addTable(doc,y,['Month','Date paid','Amount','Status'],tableRows,{colRatios:[1.4,1.1,1,0.8],repeatTitle:'RENT PAYMENT STATEMENT'});
    const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
    doc.setFont('helvetica','bold');
    doc.text(`Total paid (last 12 months): R${total.toLocaleString('en-ZA')}`,pdfGenerator.marginX,y);
    finalizePdf(doc,`statement-${String(tenant.name||'tenant').replace(/\s+/g,'-')}.pdf`);
    showNotif?.('Statement downloaded','success');
  }catch(err){
    console.error('Tenant statement PDF',err);
    showNotif?.('PDF generation failed','error');
  }
}
window.downloadTenantPaymentStatementPdf=downloadTenantPaymentStatementPdf;

function printTenantStatement(){
  const t=getCurrentTenant(); if(!t) return;
  generateStatementPDF(t,new Date().getFullYear());
}

function printReceiptById(paymentId){
  const t=getCurrentTenant(); if(!t) return;
  const p=(t.payments||[]).find(x=>x.id===paymentId) || tenantStatementRows()[0];
  if(!p){showNotif('No receipt found','warning');return;}
  generateReceiptPDF(t,p);
}

function downloadTenantStatementCSV(){
  const t=getCurrentTenant(); if(!t) return;
  const rows=tenantStatementRows();
  const hdr='Month,Date,Amount,Method,Receipt No,Status';
  const body=rows.map(p=>`"${p.month}","${formatDate(p.date)}",${p.amount},"${p.method}","${p.receiptNo}","${p.status}"`);
  downloadCSV([hdr,...body].join('\n'),`${t.name.replace(/\s+/g,'-')}-statement-${new Date().getFullYear()}.csv`);
}

function urgencyToPriority(urgency){
  const map={
    'Emergency — Safety risk':'High',
    'High — Affects daily living':'High',
    'Medium — Needs attention':'Medium',
    'Low — Minor issue':'Low'
  };
  return map[urgency]||'Medium';
}

function getStatusBadge(status){
  const map={open:'badge-red',progress:'badge-amber',done:'badge-green'};
  return map[status]||'badge-amber';
}

function getStatusLabel(status){
  const st=String(status||'open').toLowerCase();
  const map={open:'Open',progress:'In Progress',done:'Resolved',resolved:'Resolved',closed:'Closed'};
  return map[st]||status;
}

function nestiqFormatMaintSubmittedDate(r){
  if(r.createdAt?.toDate) return r.createdAt.toDate().toLocaleDateString('en-ZA');
  if(r.date) return r.date;
  return new Date().toLocaleDateString('en-ZA');
}

function nestiqRenderTenantOpenRequests(){
  const el=document.getElementById('tenantOpenRequests');
  if(!el) return;
  const openRequests=(window.tenantMaintenance||[]).filter(r=>{
    const st=String(r.status||'open').toLowerCase();
    return st!=='done'&&st!=='resolved'&&st!=='closed';
  });
  if(!openRequests.length){
    el.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.85rem">No open maintenance requests</div>`;
    return;
  }
  el.innerHTML=openRequests.map(r=>{
    const title=String(r.title||r.issueType||'Maintenance').replace(/</g,'&lt;');
    const urg=r.urgency?`<div style="font-size:0.72rem;color:var(--muted);margin-top:4px">${String(r.urgency).replace(/</g,'&lt;')}</div>`:'';
    return `
    <div style="background:var(--paper);border-radius:10px;padding:14px;border:1px solid var(--border);margin-bottom:10px;display:flex;gap:12px;align-items:flex-start">
      <div style="width:36px;height:36px;background:rgba(201,168,76,0.12);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">🔧</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:0.87rem">${title}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:3px">Submitted ${nestiqFormatMaintSubmittedDate(r)}</div>
        ${urg}
      </div>
      <span class="badge ${getStatusBadge(r.status)}">${getStatusLabel(r.status)}</span>
    </div>`;
  }).join('');
}
window.nestiqRenderTenantOpenRequests=nestiqRenderTenantOpenRequests;

function renderMaintenanceCard(){
  const card=document.getElementById('tenantMaintenanceCard'); 
  if(!card) return;
  const today=new Date().toISOString().slice(0,10);
  card.innerHTML=`<div class="portal-card-title">Maintenance Request</div>
    <div class="form-group"><label>Title</label><input class="form-input" id="portal_maint_title" placeholder="e.g. Leaking kitchen tap"></div>
    <div class="form-row">
      <div class="form-group"><label>Issue Type</label>
        <select class="form-input" id="portal_maint_type"><option>Plumbing</option><option>Electrical</option><option>Structural</option><option>Appliance</option><option>Pest Control</option><option>Other</option></select>
      </div>
      <div class="form-group"><label>Urgency</label>
        <select class="form-input" id="portal_maint_urgency"><option>Emergency — Safety risk</option><option>High — Affects daily living</option><option>Medium — Needs attention</option><option>Low — Minor issue</option></select>
      </div>
    </div>
    <div class="form-group"><label>Description</label><textarea class="form-input form-textarea" id="portal_maint_desc" placeholder="Describe the issue..."></textarea></div>
    <div class="form-group"><label>Preferred date</label><input class="form-input" id="portal_maint_date" type="date" min="${today}"></div>
    <button class="btn-primary btn-sm" onclick="submitTenantMaintenance()">Submit</button>
    <div style="margin-top:12px">
      <div style="font-weight:700;margin-bottom:8px">Open Requests</div>
      <div id="tenantOpenRequests"></div>
    </div>`;
  nestiqRenderTenantOpenRequests();
}
window.renderMaintenanceCard=renderMaintenanceCard;

function updateMaintCharCount(){
  const t=document.getElementById('td_desc');
  const c=document.getElementById('td_char');
  if(t&&c) c.textContent=`${t.value.length}/500`;
}

async function submitTenantMaintenance(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const title=document.getElementById('portal_maint_title')?.value.trim();
  const issueType=document.getElementById('portal_maint_type')?.value;
  const urgency=document.getElementById('portal_maint_urgency')?.value;
  const description=document.getElementById('portal_maint_desc')?.value.trim();
  const preferredDate=document.getElementById('portal_maint_date')?.value;
  const resolvedTitle=title||(`${issueType} issue`).trim();
  if(!resolvedTitle){
    showNotif('Add a short title for your request','error');
    return;
  }
  if(!description||description.length<10){
    showNotif('Please describe the issue in more detail','error');
    return;
  }
  const db=window.nestiqDb;
  const u=window.currentUser;
  if(!db||!u?.tenantDocId){
    showNotif('Not signed in','error');
    return;
  }
  try{
    window.showLoading?.('Submitting request...');
    const ts=window.nestiqTenantSession||{};
    const lid=String(ts.landlordId||u.landlordId||tenant.landlordId||'');
    const tid=String(ts.tenantId||u.tenantDocId||'');
    const tenantUid=firebase.auth().currentUser?.uid||'';
    const row={
      tenantId:tid,
      tenantUid,
      propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
      landlordId:lid,
      title:resolvedTitle,
      description,
      issueType,
      urgency,
      preferredDate:preferredDate||'',
      status:'open',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef=await window.nestiqFs.maintenance(db, lid).add(row);
    if(typeof window.nestiqNotifyMaintenanceSubmitted === 'function'){
      const ls=window.landlordSettings||{};
      window.nestiqNotifyMaintenanceSubmitted(
        { title: resolvedTitle, description, urgency, property: tenant.property },
        { email: ls.email, firstName: String(ls.name||'').split(/\s+/)[0], tenantName: tenant.name, propertyName: tenant.property }
      );
    }
    const localReq={
      id:docRef.id,
      ...row,
      createdAt:{toDate:()=>new Date()},
      date:new Date().toLocaleDateString('en-ZA')
    };
    window.tenantMaintenance=[localReq,...(window.tenantMaintenance||[])];
    window.hideLoading?.();
    document.getElementById('portal_maint_title').value='';
    document.getElementById('portal_maint_desc').value='';
    document.getElementById('portal_maint_date').value='';
    nestiqRenderTenantOpenRequests();
    nestiqTenantRefreshVisibleSections?.();
    showNotif('✅ Request submitted! Your landlord has been notified.','success');
  }catch(error){
    window.hideLoading?.();
    showNotif('Failed to submit request','error');
    console.error('Maintenance submit error:',error);
  }
}
window.submitTenantMaintenance=submitTenantMaintenance;

async function runTenantMaintAiAssess(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const desc=document.getElementById('td_desc')?.value?.trim()||'';
  if(desc.length<20){ showNotif('Description must be at least 20 characters','warning'); return; }
  const loading=document.getElementById('tdAiLoading');
  const out=document.getElementById('tdAiResult');
  if(loading) loading.style.display='inline';
  try{
    const tenant=getCurrentTenant();
    const prop=propertiesData.find(p=>p.id===tenant?.propertyId)||{};
    const city=(String(prop.addr||'').split(',').pop()||'').trim()||'South Africa';
    const parsed=await assessMaintenanceIssueAI({description:desc,type:prop.type||'Property',city});
    if(!parsed?.ok){ if(out) out.innerHTML=aiRawFallbackCard(parsed?.raw||'No AI response'); return; }
    const d=parsed.data||{};
    window.__tenantMaintAiAssessment=d;
    const urg=String(d.urgency||'Medium');
    const pri=document.getElementById('td_urg');
    if(pri){
      if(/emergency|high/i.test(urg)) pri.value='High — Affects daily living';
      else if(/low/i.test(urg)) pri.value='Low — Minor issue';
      else pri.value='Medium — Needs attention';
    }
    if(out){
      out.innerHTML=`<div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
        <div style="font-size:0.82rem"><strong>Urgency:</strong> ${urg}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Likely Cause:</strong> ${d.cause||'—'}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Estimated Cost:</strong> R${Number(d.costMin||0).toLocaleString()} — R${Number(d.costMax||0).toLocaleString()}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Trade Required:</strong> ${d.tradeRequired||'—'}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Fix Timeframe:</strong> ${d.timeframe||'—'}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Landlord Action:</strong> ${d.landlordAction||'—'}</div>
        <div style="font-size:0.82rem;margin-top:4px"><strong>Tenant Action:</strong> ${d.tenantAction||'—'}</div>
        ${aiAttribution()}
      </div>`;
    }
  }catch(_err){
    showNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

function nestiqTenantDocumentTypeLabel(type){
  const map={
    lease:'Lease agreement',
    receipt:'Receipt',
    inspection:'Inspection report',
    leaseAgreement:'Lease agreement',
    inspectionReport:'Inspection report'
  };
  return map[String(type||'').toLowerCase()]||String(type||'Document');
}

function downloadTenantPortalDocument(url,name){
  if(!url){ showNotif?.('Download link not available','warning'); return; }
  const a=document.createElement('a');
  a.href=url;
  a.target='_blank';
  a.rel='noopener';
  if(name) a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
window.downloadTenantPortalDocument=downloadTenantPortalDocument;

function nestiqTenantDocCategory(type){
  const t=String(type||'').toLowerCase();
  if(t.includes('lease')) return 'lease';
  if(t.includes('receipt')||t==='payment') return 'receipts';
  if(t.includes('inspect')) return 'inspections';
  if(t.includes('notice')) return 'notices';
  return 'other';
}

const NESTIQ_TENANT_DOC_CATS=[
  {id:'lease',label:'📁 Lease Agreement'},
  {id:'receipts',label:'📁 Payment Receipts'},
  {id:'inspections',label:'📁 Inspection Reports'},
  {id:'notices',label:'📁 Notices from Landlord'},
  {id:'other',label:'📁 Other Documents'}
];

function nestiqTenantDocDate(d){
  if(d.uploadedAt?.toDate) return d.uploadedAt.toDate().toLocaleDateString('en-ZA');
  if(d.date) return d.date;
  return '';
}

function nestiqTenantDocUnread(d){
  const tid=String(window.currentUser?.tenantDocId||window.currentTenantData?.id||'');
  return tid&&!(d.readBy||[]).map(String).includes(tid);
}

function toggleTenantDocCategory(id){
  const body=document.getElementById('tenantDocCat_'+id);
  const chev=document.getElementById('tenantDocChev_'+id);
  if(!body) return;
  const open=!body.classList.contains('open');
  body.classList.toggle('open',open);
  if(chev) chev.textContent=open?'▼':'▶';
}

function openTenantDocumentPreview(url,name){
  if(!url){ showNotif('Preview not available','warning'); return; }
  const safe=String(name||'Document').replace(/</g,'&lt;');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${safe}</h2>
    <div style="margin-top:10px;height:70vh;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <iframe src="${url}" style="width:100%;height:100%;border:none" title="${safe}"></iframe>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-outline btn-sm" onclick="downloadTenantPortalDocument('${url.replace(/'/g,"\\'")}','${String(name||'').replace(/'/g,"\\'")}')">Download</button>
      <button type="button" class="btn-primary btn-sm" onclick="closeModal()">Close</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function markTenantDocumentRead(docId){
  const tid=String(window.currentUser?.tenantDocId||'');
  if(!tid||!docId) return;
  try{
    const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
    if(lid&&window.nestiqFs?.documents){
      await window.nestiqFs.documents(window.nestiqDb,lid).doc(String(docId)).update({
        readBy: firebase.firestore.FieldValue.arrayUnion(tid)
      });
    }
    const d=(window.tenantUploadedDocuments||[]).find(x=>String(x.id)===String(docId));
    if(d){ d.readBy=[...(d.readBy||[]),tid]; renderDocumentsCard(); updateTenantTabBadges(); }
  }catch(e){ console.warn('mark doc read',e); }
}

function renderDocumentsCard(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const card=document.getElementById('tenantDocumentsCard');
  if(!card) return;
  const tid=String(window.currentUser?.tenantDocId||tenant.id||'');
  const docs=(window.tenantUploadedDocuments||[]).slice();
  const grouped=Object.fromEntries(NESTIQ_TENANT_DOC_CATS.map(c=>[c.id,[]]));
  docs.forEach(d=>{
    const cat=nestiqTenantDocCategory(d.type);
    (grouped[cat]||grouped.other).push(d);
  });
  (window.tenantPayments||[]).forEach(p=>{
    grouped.receipts.push({
      id:'receipt-'+p.id,
      name:`Receipt ${p.receiptNo||formatPaymentMonth(p.date)}`,
      type:'receipt',
      date:p.date,
      _receiptPaymentId:p.id,
      readBy:[tid]
    });
  });
  (window.tenantNotices||[]).forEach(n=>{
    grouped.notices.push({
      id:'notice-'+n.id,
      name:n.title||'Notice',
      type:'notice',
      date:nestiqNoticeDisplayDate(n),
      _noticeId:n.id,
      readBy:n.readBy||[]
    });
  });
  card.innerHTML=NESTIQ_TENANT_DOC_CATS.map(cat=>{
    const items=(grouped[cat.id]||[]).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const rows=items.length?items.map(d=>{
      const name=String(d.name||d.fileName||'Document').replace(/</g,'&lt;');
      const url=String(d.url||d.downloadUrl||'');
      const unread=nestiqTenantDocUnread(d);
      const idJs=String(d.id).replace(/'/g,"\\'");
      const isReceipt=d._receiptPaymentId!=null;
      const isNotice=d._noticeId!=null;
      const previewClick=isReceipt?`downloadPaymentReceipt('${d._receiptPaymentId}')`:isNotice?`expandNotice('${d._noticeId}')`:url?`openTenantDocumentPreview('${url.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}');markTenantDocumentRead('${idJs}')`:`showNotif('No preview available','info')`;
      const dlClick=isReceipt?`downloadPaymentReceipt('${d._receiptPaymentId}')`:url?`downloadTenantPortalDocument('${url.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}')`:`expandNotice('${d._noticeId}')`;
      return `<div class="tenant-doc-row">
        ${unread?'<span class="tenant-doc-unread"></span>':'<span style="width:7px"></span>'}
        <span style="font-size:1.1rem;cursor:pointer" onclick="${previewClick}">📄</span>
        <div style="flex:1;min-width:0;cursor:pointer" onclick="${previewClick}">
          <div style="font-weight:600;font-size:0.84rem">${name}</div>
          <div style="font-size:0.72rem;color:var(--muted)">${nestiqTenantDocDate(d)}</div>
        </div>
        <button type="button" class="btn-outline btn-sm" onclick="event.stopPropagation();${dlClick}">Download</button>
      </div>`;
    }).join(''):'<div style="font-size:0.82rem;color:var(--muted);padding:8px 0">No documents in this category</div>';
    return `<div class="tenant-doc-category">
      <div class="tenant-doc-cat-header" onclick="toggleTenantDocCategory('${cat.id}')">
        <span>${cat.label}</span>
        <span id="tenantDocChev_${cat.id}">▶</span>
      </div>
      <div class="tenant-doc-cat-body" id="tenantDocCat_${cat.id}">${rows}</div>
    </div>`;
  }).join('');
  updateTenantTabBadges?.();
}
window.renderDocumentsCard=renderDocumentsCard;
window.openTenantDocumentPreview=openTenantDocumentPreview;
window.toggleTenantDocCategory=toggleTenantDocCategory;
window.markTenantDocumentRead=markTenantDocumentRead;

function downloadLatestReceipt(){
  const payments=window.tenantPayments||[];
  if(!payments.length) return;
  downloadPaymentReceipt(payments[0].id);
}
window.downloadLatestReceipt=downloadLatestReceipt;

function downloadPaymentReceipt(paymentId){
  const payment=(window.tenantPayments||[]).find(p=>String(p.id)===String(paymentId));
  if(!payment) return;
  const tenant=window.currentTenantData;
  const landlord=window.landlordInfo||{};
  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt ${payment.receiptNo||''}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
        .header { color: #c9a84c; font-size: 24px; font-weight: bold; margin-bottom: 4px; }
        .title { font-size: 18px; margin-bottom: 30px; color: #666; }
        .receipt-no { font-size: 14px; color: #c9a84c; margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 3px; }
        .value { font-size: 14px; font-weight: 600; }
        .amount { font-size: 32px; font-weight: bold; color: #c9a84c; margin: 20px 0; }
        .paid-stamp { color: #5a7a60; font-size: 36px; font-weight: bold; border: 4px solid #5a7a60; display: inline-block; padding: 4px 16px; border-radius: 4px; transform: rotate(-15deg); margin: 20px 0; }
        .divider { border-top: 1px solid #eee; margin: 20px 0; }
        .footer { font-size: 11px; color: #999; margin-top: 40px; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom:20px">
        <button onclick="window.print()" style="background:#c9a84c;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print Receipt</button>
      </div>
      <div class="header">NestIQ Pro</div>
      <div class="title">RENT RECEIPT</div>
      <div class="receipt-no">${payment.receiptNo||''}</div>
      <div class="section">
        <div class="label">Tenant</div>
        <div class="value">${tenant?.name||''}</div>
        <div style="color:#888;font-size:13px">${tenant?.unit||''} — ${tenant?.property||''}</div>
      </div>
      <div class="section">
        <div class="label">Landlord</div>
        <div class="value">${landlord?.name||'NestIQ Admin'}</div>
        <div style="color:#888;font-size:13px">${landlord?.phone||''}</div>
      </div>
      <div class="divider"></div>
      <div class="amount">R${Number(payment.amount||0).toLocaleString('en-ZA')}</div>
      <div class="section"><div class="label">For</div><div class="value">${payment.month||formatPaymentMonth(payment.date)}</div></div>
      <div class="section"><div class="label">Date Paid</div><div class="value">${new Date(payment.date).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})}</div></div>
      <div class="section"><div class="label">Payment Method</div><div class="value">${payment.method||''}</div></div>
      ${payment.reference ? `<div class="section"><div class="label">Reference</div><div class="value">${payment.reference}</div></div>` : ''}
      <div class="paid-stamp">PAID</div>
      <div class="divider"></div>
      <div class="footer">
        Generated by NestIQ Pro · ${new Date().toLocaleDateString('en-ZA')}<br>
        This receipt is valid proof of payment.
      </div>
    </body>
    </html>
  `;
  const win=window.open('','_blank');
  if(!win) return;
  win.document.write(receiptHTML);
  win.document.close();
}
window.downloadPaymentReceipt=downloadPaymentReceipt;

function downloadTenantStatement(){
  const payments=window.tenantPayments||[];
  const tenant=window.currentTenantData;
  const year=new Date().getFullYear();
  const yearPayments=payments.filter(p=>new Date(p.date).getFullYear()===year);
  const total=yearPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  const rows=yearPayments.map(p=>`\"${p.month||formatPaymentMonth(p.date)}\",\"${p.date}\",\"R${Number(p.amount||0).toLocaleString('en-ZA')}\",\"${p.method||''}\",\"${p.receiptNo||''}\",\"${p.status||''}\"`);
  const csv=[
    'NestIQ Pro — Payment Statement',
    'Tenant: '+(tenant?.name||''),
    'Property: '+(tenant?.property||''),
    'Unit: '+(tenant?.unit||''),
    'Year: '+year,
    '',
    'Month,Date,Amount,Method,Receipt,Status',
    ...rows,
    '',
    'Total Paid,,,,,R'+total.toLocaleString('en-ZA')
  ].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(tenant?.name||'tenant').replace(/ /g,'-')+'-statement-'+year+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
window.downloadTenantStatement=downloadTenantStatement;
window.downloadTenantPaymentStatementPdf=downloadTenantPaymentStatementPdf;

function generateTenantLeasePDF(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const prop=window.tenantProperty||{};
  if(typeof generateLeasePDF==='function') generateLeasePDF(tenant, prop);
}
window.generateTenantLeasePDF=generateTenantLeasePDF;

function renderTenantNotices(_tenant){
  renderNoticesCard();
}
function nestiqNoticeDisplayDate(n){
  if(n.createdAt?.toDate) return n.createdAt.toDate().toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'});
  return n.date||'';
}

function expandNotice(noticeId){
  const n=(window.tenantNotices||[]).find(x=>String(x.id)===String(noticeId));
  if(!n) return;
  const body=String(n.message||n.body||'').replace(/</g,'&lt;').replace(/\n/g,'<br>');
  const title=String(n.title||'Notice').replace(/</g,'&lt;');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${title}</h2>
    <p class="modal-sub" style="margin-bottom:12px">${nestiqNoticeDisplayDate(n)}</p>
    <div style="font-size:0.9rem;line-height:1.65;color:var(--ink)">${body}</div>
    <button type="button" class="btn-primary btn-sm" style="margin-top:18px" onclick="closeModal()">Close</button>`;
  document.getElementById('modalOverlay').classList.add('open');
  void markNoticeRead(noticeId);
}

function renderNoticesCard(){
  const notices=window.tenantNotices||[];
  const card=document.getElementById('tenantNoticesCard');
  if(!card) return;
  card.innerHTML=`<div class="portal-card-title" id="noticesBadge">Notices</div><div id="tenantNoticesList"></div>`;
  const el=document.getElementById('tenantNoticesList');
  if(!el) return;
  if(!notices.length){
    el.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.85rem">No notices from your landlord</div>`;
    updateNoticesBadge();
    return;
  }
  const tid=String(window.currentUser?.tenantDocId||'');
  el.innerHTML=notices.map(n=>{
    const isUnread=!(n.readBy||[]).map(String).includes(tid);
    const idJs=String(n.id).replace(/'/g,"\\'");
    const title=String(n.title||'').replace(/</g,'&lt;');
    const preview=String(n.message||n.body||'').replace(/</g,'&lt;').slice(0,120);
    return `<button type="button" onclick="expandNotice('${idJs}')" style="width:100%;text-align:left;background:var(--paper);border-radius:10px;padding:16px;border:1px solid var(--border);border-left:3px solid ${isUnread?'var(--gold)':'var(--border)'};margin-bottom:10px;opacity:${isUnread?'1':'0.75'};cursor:pointer"><div style="display:flex;justify-content:space-between;gap:10px"><div style="font-weight:600;font-size:0.88rem;color:var(--ink)">${title}${isUnread?'<span style="width:7px;height:7px;background:var(--rust);border-radius:50%;display:inline-block;margin-left:6px"></span>':''}</div><div style="font-size:0.72rem;color:var(--muted)">${nestiqNoticeDisplayDate(n)}</div></div><div style="font-size:0.83rem;color:var(--muted);margin-top:6px">${preview}${(n.message||n.body||'').length>120?'…':''}</div></button>`;
  }).join('');
  updateNoticesBadge();
}
window.renderNoticesCard=renderNoticesCard;

async function markNoticeRead(noticeId){
  const tid=String(window.currentUser?.tenantDocId||'');
  if(!tid||!noticeId) return;
  const n=(window.tenantNotices||[]).find(x=>String(x.id)===String(noticeId));
  if(n&&(n.readBy||[]).map(String).includes(tid)) return;
  try{
    const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
    if(!lid) return;
    await window.nestiqFs.notices(window.nestiqDb, lid).doc(String(noticeId)).update({
      readBy: firebase.firestore.FieldValue.arrayUnion(tid)
    });
    if(n){
      n.readBy=[...(n.readBy||[]),tid];
      renderNoticesCard();
      updateNoticesBadge();
      updateTenantTabBadges?.();
    }
  }catch(error){
    console.error('Mark notice read error:', error);
  }
}
window.markNoticeRead=markNoticeRead;

function updateNoticesBadge(){
  const tid=String(window.currentUser?.tenantDocId||'');
  const unreadCount=(window.tenantNotices||[]).filter(n=>!(n.readBy||[]).map(String).includes(tid)).length;
  const el=document.getElementById('noticesBadge');
  if(el) el.textContent=unreadCount>0?`Notices (${unreadCount} unread)`:'Notices';
}
window.updateNoticesBadge=updateNoticesBadge;

function renderMessagesCard(_tenant){
  const messages=window.tenantMessages||[];
  const card=document.getElementById('tenantMessagesCard');
  if(!card) return;
  card.innerHTML=`
    <div class="tenant-chat-full">
      <div class="tenant-chat-messages" id="tenantMessages"></div>
      <div class="tenant-chat-input-bar">
        <input type="file" id="tenantMessageAttach" accept="image/*" hidden>
        <button type="button" class="tenant-chat-attach" onclick="document.getElementById('tenantMessageAttach').click()" title="Attach image">📎</button>
        <textarea id="tenantMessageInput" class="form-input" maxlength="500" placeholder="Type a message..." rows="1"></textarea>
        <button type="button" class="btn-primary btn-sm" onclick="sendTenantMessage()">Send</button>
      </div>
    </div>`;
  const attach=document.getElementById('tenantMessageAttach');
  if(attach){
    attach.onchange=()=>{
      const f=attach.files?.[0];
      if(f) sendTenantMessageAttachment(f);
      attach.value='';
    };
  }
  const el=document.getElementById('tenantMessages');
  if(!el) return;
  if(!messages.length){
    el.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)"><div style="font-size:1.5rem;margin-bottom:10px">💬</div><div style="font-size:0.85rem">No messages yet. Say hello to your landlord.</div></div>`;
    return;
  }
  let lastDay='';
  el.innerHTML=messages.map(m=>{
    const isFromTenant=m.fromRole==='tenant';
    const dt=new Date(m.date||m.createdAt?.toDate?.()||Date.now());
    const dayKey=dt.toDateString();
    let sep='';
    if(dayKey!==lastDay){
      lastDay=dayKey;
      sep=`<div class="tenant-chat-date-sep">${nestiqChatDateLabel(dt)}</div>`;
    }
    const time=dt.toLocaleString('en-ZA',{hour:'2-digit',minute:'2-digit'});
    const ticks=isFromTenant?(m.read?'✓✓':'✓'):'';
    const img=m.attachmentUrl?`<img src="${m.attachmentUrl}" style="max-width:100%;border-radius:8px;margin-top:6px" alt="">`:'';
    return `${sep}
      <div class="tenant-chat-bubble-wrap ${isFromTenant?'tenant':'landlord'}">
        <div class="tenant-chat-bubble">${String(m.message||'').replace(/</g,'&lt;')}${img}</div>
        <div class="tenant-chat-meta">${time} ${ticks}</div>
      </div>`;
  }).join('');
  el.scrollTop=el.scrollHeight;
  updateTenantTabBadges?.();
}
window.renderMessagesCard=renderMessagesCard;

function nestiqChatDateLabel(dt){
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(dt); d.setHours(0,0,0,0);
  const diff=Math.round((today-d)/86400000);
  if(diff===0) return 'Today';
  if(diff===1) return 'Yesterday';
  return dt.toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
}

async function sendTenantMessageAttachment(file){
  if(!file||!file.type.startsWith('image/')){ showNotif('Images only','warning'); return; }
  compressImage(file,800,0.75,async b64=>{
    await sendTenantMessage(b64);
  });
}

async function sendTenantMessage(attachmentBase64){
  const input=document.getElementById('tenantMessageInput');
  const text=attachmentBase64?'':(input?.value.trim()||'');
  if(!text&&!attachmentBase64) return;
  const tenant=window.currentTenantData;
  if(!tenant) return;
  try{
    if(input) input.disabled=true;
    const ts=window.nestiqTenantSession||{};
    const lid=String(ts.landlordId||currentUser.landlordId||'');
    const tenantUid=firebase.auth().currentUser?.uid||'';
    const payload={
      tenantId:String(ts.tenantId||currentUser.tenantDocId),
      tenantUid,
      landlordId:lid,
      fromRole:'tenant',
      fromName:tenant.name,
      message:text||(attachmentBase64?'📷 Photo':''),
      date:new Date().toISOString(),
      read:false,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    if(attachmentBase64) payload.attachmentUrl=attachmentBase64;
    await window.nestiqFs.messages(window.nestiqDb, lid).add(payload);
    if(input){ input.value=''; input.disabled=false; input.focus(); }
  }catch(error){
    if(input) input.disabled=false;
    showNotif('Failed to send message','error');
    console.error('Send message error:', error);
  }
}
window.sendTenantMessage=sendTenantMessage;

async function markLandlordMessagesRead(){
  const unread=(window.tenantMessages||[]).filter(m=>m.fromRole==='landlord'&&!m.read);
  for(const msg of unread){
    try{
      const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
      if(lid) await window.nestiqFs.messages(window.nestiqDb, lid).doc(String(msg.id)).update({ read:true });
    }catch(e){ console.error('Mark read error:', e); }
  }
}
window.markLandlordMessagesRead=markLandlordMessagesRead;

function renderPropertyInfoCard(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const card=document.getElementById('tenantPropertyInfo');
  if(!card) return;
  const property=window.tenantProperty||null;
  const landlord=window.landlordInfo||{};
  const landlordName=landlord.name||landlord.landlordSettings?.name||'Your Landlord';
  const landlordPhone=landlord.phone||landlord.landlordSettings?.phone||'';
  const propertyName=property?.name||tenant.property||'';
  const propertyAddr=property?.addr||'';
  const unitLabel=String(tenant.unit||'').trim();
  const bedrooms=property?.bedrooms!=null&&property.bedrooms!==''?property.bedrooms:'—';
  const missingProperty=!property&&!propertyName;
  const photo=property?.photoUrl||property?.photoURL||null;
  card.innerHTML=`
  <div class="portal-card-title">My Property Info</div>
  <div id="tenantPropertyInfoBody">
  ${photo ? `
    <div style="width:100%;height:180px;border-radius:10px;overflow:hidden;margin-bottom:16px">
      <img src="${photo}" style="width:100%;height:100%;object-fit:cover" alt="${property?.name||''}">
    </div>
  ` : `
    <div style="width:100%;height:120px;background:linear-gradient(135deg,rgba(201,168,76,0.12),rgba(58,107,138,0.15));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:3rem;margin-bottom:16px">
      ${property?.icon||'🏠'}
    </div>
  `}
  <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:600;margin-bottom:4px">
    ${propertyName||'Property details pending'}
  </div>
  <div style="font-size:0.82rem;color:var(--muted);margin-bottom:16px">
    📍 ${propertyAddr||(missingProperty?'Address will appear once your landlord links your unit to a property':'—')}
  </div>
  ${missingProperty?`<div style="font-size:0.78rem;color:var(--muted);margin:-8px 0 14px;padding:10px;background:var(--paper);border-radius:8px;border:1px solid var(--border-soft)">Your landlord still needs to assign this tenancy to a property with address and unit in NestIQ.</div>`:''}
  <div style="margin-bottom:16px">
    <div style="font-size:0.78rem;font-weight:600;margin-bottom:8px">Property location</div>
    <div id="tenantPropertyMap"></div>
    <button type="button" class="btn-outline btn-sm" style="margin-top:8px" onclick="showPage('map')">Open full map</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
    <div style="background:var(--paper);border-radius:8px;padding:10px;border:1px solid var(--border-soft)">
      <div style="font-size:0.68rem;color:var(--muted)">UNIT</div>
      <div style="font-weight:600;font-size:0.85rem">${unitLabel||'—'}</div>
    </div>
    <div style="background:var(--paper);border-radius:8px;padding:10px;border:1px solid var(--border-soft)">
      <div style="font-size:0.68rem;color:var(--muted)">BEDROOMS</div>
      <div style="font-weight:600;font-size:0.85rem">${bedrooms}</div>
    </div>
  </div>
  <div style="padding-top:14px;border-top:1px solid var(--border-soft)">
    <div style="font-size:0.78rem;font-weight:600;margin-bottom:10px">Landlord Contact</div>
    <div style="font-size:0.85rem;font-weight:600;margin-bottom:4px">${landlordName}</div>
    ${landlordPhone ? `
      <div style="display:flex;gap:8px;margin-top:8px">
        <a href="tel:${landlordPhone}" class="btn-outline btn-sm" style="flex:1;text-align:center;text-decoration:none">📞 Call</a>
        <a href="https://wa.me/${formatWhatsAppNumber(landlordPhone)}" target="_blank" class="btn-sm" style="flex:1;text-align:center;text-decoration:none;background:#25D366;color:white;border-radius:30px;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:600">WhatsApp</a>
      </div>
    ` : '<div style="font-size:0.78rem;color:var(--muted)">Phone number not on file yet.</div>'}
  </div>
  </div>
  `;
  setTimeout(()=>{
    if(typeof initTenantPropertyMap==='function') initTenantPropertyMap(tenant,'tenantPropertyMap');
  },80);
}
window.renderPropertyInfoCard=renderPropertyInfoCard;
function reportUrgentIssue(){
  const t=getCurrentTenant(); if(!t) return;
  const msg=`URGENT MAINTENANCE: Hi, I am ${t.name} from ${t.property} - ${t.unit}. I have an emergency: `;
  openWhatsApp(landlordSettings.phone, msg, {tenantId:t.id,tenantName:t.name,type:'emergency'});
}

function renderUtilityCard(tenant){
  const card=document.getElementById('tenantUtilitiesCard'); if(!card) return;
  const month=new Date().toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
  const getPrev=(type)=>[...(utilityReadings||[])].filter(r=>r.tenantId===tenant.id&&r.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const pe=getPrev('electricity'); const pw=getPrev('water');
  card.innerHTML=`<div class="portal-card-title">Utility Readings</div><div class="form-row"><div><div style="font-weight:700;margin-bottom:6px">Electricity</div><input class="form-input" id="ur_elec" type="number" placeholder="Current reading"><div style="font-size:0.74rem;color:var(--muted)">Previous: ${pe?pe.reading:'—'} · Usage: <span id="ur_elec_usage">0</span></div><button class="btn-outline btn-sm" style="margin-top:6px" onclick="submitUtilityReading('electricity')">Submit reading</button></div><div><div style="font-weight:700;margin-bottom:6px">Water</div><input class="form-input" id="ur_water" type="number" placeholder="Current reading"><div style="font-size:0.74rem;color:var(--muted)">Previous: ${pw?pw.reading:'—'} · Usage: <span id="ur_water_usage">0</span></div><button class="btn-outline btn-sm" style="margin-top:6px" onclick="submitUtilityReading('water')">Submit reading</button></div></div><div style="margin-top:10px;font-size:0.78rem;color:var(--muted)">Month: ${month}</div><div id="ur_table" style="margin-top:8px">${renderUtilityTable(tenant.id)}</div>`;
}
function renderUtilityTable(tenantId){
  const rows=[...(utilityReadings||[])].filter(r=>r.tenantId===tenantId).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  if(!rows.length) return `<div style="color:var(--muted)">No readings yet.</div>`;
  return rows.map(r=>`<div class="payment-item"><div>${r.month}</div><div>${r.type}</div><div>${r.reading}</div><div>Usage ${r.usage}</div></div>`).join('');
}
function submitUtilityReading(type){
  const tenant=getCurrentTenant(); if(!tenant) return;
  const input=document.getElementById(type==='electricity'?'ur_elec':'ur_water');
  const reading=Number(input?.value||0); if(reading<=0){showNotif('Enter a valid reading','error');return;}
  const prev=[...(utilityReadings||[])].filter(r=>r.tenantId===tenant.id&&r.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const usage=prev?Math.max(0,reading-Number(prev.reading||0)):0;
  utilityReadings.unshift({id:Date.now(),tenantId:tenant.id,type,reading,date:new Date().toISOString(),month:new Date().toLocaleDateString('en-ZA',{month:'long',year:'numeric'}),usage});
  saveData(); showNotif('Reading submitted','success'); nestiqTenantRefreshVisibleSections?.();
}

function renderMiniCalendarCard(tenant){
  const card=document.getElementById('tenantCalendarCard'); if(!card) return;
  card.innerHTML=`<div class="portal-card-title">My Calendar</div><div id="tenantMiniCalendar" class="tenant-mini-calendar"></div>`;
  const el=document.getElementById('tenantMiniCalendar');
  if(!el || !window.FullCalendar) return;
  if(tdMiniCalendar){ tdMiniCalendar.destroy(); tdMiniCalendar=null; }
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const leaseStart=new Date(tenant.leaseStart||new Date());
  const leaseEnd=new Date(tenant.leaseEnd||tenant.lease||new Date());
  const events=[];
  let cur=new Date(leaseStart.getFullYear(),leaseStart.getMonth(),dueDay);
  while(cur<=leaseEnd){
    const key=cur.toISOString().slice(0,7);
    const paid=(tenant.payments||[]).some(p=>String(p.date||'').slice(0,7)===key);
    if(!paid){
      events.push({title:`Rent due R${Number(tenant.rent||0).toLocaleString('en-ZA')}`,start:cur.toISOString().slice(0,10),allDay:true,color:'#c9a84c',textColor:'#0e1117',extendedProps:{type:'due'}});
    }
    cur.setMonth(cur.getMonth()+1);
  }
  (tenant.payments||[]).forEach(p=>events.push({title:`✓ Paid R${Number(p.amount||0).toLocaleString('en-ZA')}`,start:String(p.date).slice(0,10),allDay:true,color:'#5a7a60',textColor:'#fff',extendedProps:{type:'paid'}}));
  const tenantMaintId=String(window.currentUser?.tenantDocId||tenant.id||'');
  const maintForCalendar=[
    ...(window.tenantMaintenance||[]),
    ...(typeof maintenanceData!=='undefined'&&Array.isArray(maintenanceData)?maintenanceData:[])
  ];
  maintForCalendar.filter(r=>String(r.tenantId||'')===tenantMaintId).forEach(r=>{
    const md=new Date(r.preferredDate||r.date);
    if(String(md)==='Invalid Date') return;
    events.push({title:`🔧 ${String(r.title||'Maintenance').slice(0,20)}`,start:md.toISOString().slice(0,10),allDay:true,color:'#7c5cbf',textColor:'#fff',extendedProps:{type:'maintenance'}});
  });
  if(String(leaseStart)!=='Invalid Date') events.push({title:'Lease starts',start:leaseStart.toISOString().slice(0,10),allDay:true,color:'#3a6b8a',textColor:'#fff',extendedProps:{type:'lease-start'}});
  if(String(leaseEnd)!=='Invalid Date') events.push({title:'Lease ends',start:leaseEnd.toISOString().slice(0,10),allDay:true,color:'#c46a3a',textColor:'#fff',extendedProps:{type:'lease-end'}});
  tdMiniCalendar=new FullCalendar.Calendar(el,{
    initialView:'dayGridMonth',
    headerToolbar:{left:'prev,next',center:'title',right:''},
    height:'auto',
    firstDay:1,
    locale:'en-ZA',
    events,
    eventClick:(info)=>{ if(info.event.extendedProps.type==='due') openTenantPayModal(); }
  });
  tdMiniCalendar.render();
}

function renderFinanceCard(tenant){
  const card=document.getElementById('tenantFinanceCard'); if(!card) return;
  card.innerHTML=`<div class="portal-card-title">Finances Summary</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">Total paid this year</div><div class="tenant-meta-val" id="finTotalYear">—</div></div>
      <div class="tenant-meta-item"><div class="tenant-meta-lbl">All time paid</div><div class="tenant-meta-val" id="finTotalAllTime">—</div></div>
    </div>
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--muted)">
        <span id="finPaymentCount">—</span>
        <span id="finOnTimePercent">—</span>
      </div>
      <div class="lease-bar" style="margin-top:6px"><div class="lease-fill" id="finOnTimeBar" style="width:0%"></div></div>
      <div style="font-size:0.78rem;color:var(--muted);margin-top:6px" id="finNextDue">—</div>
    </div>`;
  renderFinancesCard();
}

function renderFinancesCard(){
  const payments=window.tenantPayments||[];
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const currentYear=new Date().getFullYear();
  const yearPayments=payments.filter(p=>new Date(p.date).getFullYear()===currentYear);
  const totalThisYear=yearPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  const totalAllTime=payments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  const onTimeCount=payments.filter(p=>{
    const payDay=new Date(p.date).getDate();
    return payDay <= (tenant.monthlyDueDate||1);
  }).length;
  const onTimePercent=payments.length?Math.round(onTimeCount/payments.length*100):0;
  const finYearEl=document.getElementById('finTotalYear');
  if(finYearEl) finYearEl.textContent='R'+totalThisYear.toLocaleString('en-ZA');
  const finAllEl=document.getElementById('finTotalAllTime');
  if(finAllEl) finAllEl.textContent='R'+totalAllTime.toLocaleString('en-ZA');
  const finCountEl=document.getElementById('finPaymentCount');
  if(finCountEl) finCountEl.textContent=payments.length+' payments';
  const finPctEl=document.getElementById('finOnTimePercent');
  if(finPctEl) finPctEl.textContent=onTimePercent+'%';
  const bar=document.getElementById('finOnTimeBar');
  if(bar) bar.style.width=onTimePercent+'%';
  const finDueEl=document.getElementById('finNextDue');
  if(finDueEl) finDueEl.textContent='R'+Number(tenant.rent||0).toLocaleString('en-ZA')+' due on the '+(tenant.monthlyDueDate||1)+' of next month';
}
window.renderFinancesCard=renderFinancesCard;

function renderGettingStartedTenant(){
  const tenant=window.currentTenantData;
  const wrap=document.getElementById('tenantWelcomeBanner');
  if(!wrap) return;
  if(!tenant){
    wrap.innerHTML='';
    return;
  }
  if(tenant.firstTenantLogin === false){
    wrap.innerHTML='';
    return;
  }
  wrap.innerHTML=`
    <div style="margin-top:14px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.28);border-radius:12px;padding:14px;display:flex;align-items:flex-start;gap:12px">
      <div style="font-size:1.2rem;line-height:1">👋</div>
      <div style="flex:1">
        <div style="font-weight:700;margin-bottom:4px">
          Welcome to your portal, ${tenant.name || 'there'}!
        </div>
        <div style="font-size:0.85rem;color:var(--muted);line-height:1.5">
          This is where you can check your rent status, submit maintenance requests and download your documents.
        </div>
      </div>
      <button class="btn-outline btn-sm" onclick="ackTenantWelcome()">Got it</button>
    </div>
  `;
}
window.renderGettingStartedTenant=renderGettingStartedTenant;

async function ackTenantWelcome(){
  try{
    const u=window.currentUser;
    if(!u?.tenantDocId) return;
    const lid=window.nestiqTenantSession?.landlordId||u.landlordId;
    const tid=window.nestiqTenantSession?.tenantId||u.tenantDocId;
    if(lid&&tid) await window.nestiqFs.tenants(window.nestiqDb, lid).doc(String(tid)).update({ firstTenantLogin: false });
  }catch(e){
    console.error('ackTenantWelcome', e);
  }
}
window.ackTenantWelcome=ackTenantWelcome;

function renderMoveOutChecklist(tenant, days){
  const card=document.getElementById('tenantHomeMoveOut')||document.getElementById('tenantMoveOutCard');
  if(!card||days>=90){ if(card) card.innerHTML=''; return; }
  const key=`nestiq-moveout-${tenant.id}`;
  const tasks=['Give 1 calendar month written notice','Schedule pre-inspection with landlord','Arrange professional cleaning','Repair any damage to walls, fixtures','Return all keys and remotes','Provide forwarding address','Cancel utilities in your name','Take final meter readings'];
  const saved=JSON.parse(localStorage.getItem(key)||'{}');
  const done=tasks.filter((_,i)=>saved[i]||saved[String(i)]).length;
  const pct=Math.round((done/tasks.length)*100);
  card.innerHTML=`<div class="tenant-section-card"><div class="tenant-section-title">Move-out Checklist</div><div style="color:var(--rust);font-weight:700;margin-bottom:8px;font-size:0.88rem">Your lease ends in ${days} days</div>${tasks.map((tk,i)=>`<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px"><input type="checkbox" ${saved[i]||saved[String(i)]?'checked':''} onchange="toggleMoveTask(${i})"><span style="font-size:0.82rem">${tk}</span></label>`).join('')}<div class="lease-bar"><div class="lease-fill" style="width:${pct}%"></div></div><div style="font-size:0.78rem;color:var(--muted)">${pct}% complete</div><button class="btn-outline btn-sm" style="margin-top:8px" onclick="nestiqSwitchTenantTab('messages')">Contact Landlord</button></div>`;
}

function toggleMoveTask(idx){
  const t=getCurrentTenant(); if(!t) return;
  if(window.nestiqUseFirestore){
    const row=tenantsData.find(x=>x.id===t.id);
    if(!row) return;
    const mo={...(row.moveOutChecklist&&typeof row.moveOutChecklist==='object'?row.moveOutChecklist:{})};
    const cur=!!mo[idx]||!!mo[String(idx)];
    mo[String(idx)]=!cur;
    row.moveOutChecklist=mo;
    saveData();
    nestiqTenantRefreshVisibleSections();
    return;
  }
  const key=`nestiq-moveout-${t.id}`;
  const saved=JSON.parse(localStorage.getItem(key)||'{}');
  saved[idx]=!saved[idx];
  localStorage.setItem(key, JSON.stringify(saved));
  nestiqTenantRefreshVisibleSections();
}

/* ══ Tab navigation ══ */
let __tenantActiveTab='home';
const __tenantTabsLoaded={};
let __tenantMaintFilter='all';

function nestiqSwitchTenantTab(tab){
  __tenantActiveTab=tab;
  // New portal shell uses `.tenant-tab-page` + `.tenant-tab-bar .tab-btn`
  document.querySelectorAll('.tenant-tab-bar .tab-btn[data-tab]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.tab===tab);
  });
  document.querySelectorAll('.tenant-tab-page').forEach(p=>{
    const on=p.id===('tTab-'+tab);
    p.classList.toggle('active',on);
    if(on){
      p.style.animation='none';
      void p.offsetWidth;
      p.style.animation='';
    }
  });
  const panel=document.getElementById('tTab-'+tab);
  const needsRender=!__tenantTabsLoaded[tab]
    || (tab==='profile'&&panel&&!panel.querySelector('.tenant-home-title'))
    || (tab!=='home'&&panel&&!String(panel.innerHTML||'').trim());
  if(needsRender){
    renderTenantTab(tab);
    // Only mark loaded when profile (or other tabs) actually got data — avoid permanent blank Profile.
    if(tab==='profile'){
      __tenantTabsLoaded[tab]=Boolean(window.currentTenantData&&panel?.querySelector('.tenant-home-title'));
    }else{
      __tenantTabsLoaded[tab]=true;
    }
  }
  if(tab==='messages'){
    setTimeout(()=>{
      renderMessagesCard();
      markLandlordMessagesRead?.();
      document.getElementById('tenantMessages')?.scrollTo({top:99999,behavior:'smooth'});
    },50);
  }
  const wrap=document.querySelector('.tenant-tab-content-wrap');
  if(wrap) wrap.scrollTo({top:0,behavior:'smooth'});
  try{ applyTranslations?.(); }catch(_e){}
}
window.nestiqSwitchTenantTab=nestiqSwitchTenantTab;

function renderTenantTab(tab){
  const panel=document.getElementById('tTab-'+tab);
  if(!panel) return;
  switch(tab){
    case 'home': nestiqRenderTenantHome(panel); break;
    case 'payments': nestiqRenderTenantPayments(panel); break;
    case 'maintenance': nestiqRenderTenantMaintenance(panel); break;
    case 'documents': nestiqRenderTenantDocuments(panel); break;
    case 'messages': nestiqRenderTenantMessages(panel); break;
    case 'profile': nestiqRenderTenantProfile(panel); break;
  }
}

function nestiqTenantLeaseDaysRemaining(tenant){
  const leaseEnd=new Date(tenant.lease||tenant.leaseEnd||'2026-12-31');
  const today=new Date();
  return Math.max(0,Math.round((leaseEnd-today)/86400000));
}

function nestiqTenantUnreadDocsCount(){
  const tid=String(window.currentUser?.tenantDocId||'');
  return (window.tenantUploadedDocuments||[]).filter(d=>nestiqTenantDocUnread(d)).length;
}

function nestiqTenantUnreadMsgCount(){
  return (window.tenantMessages||[]).filter(m=>m.fromRole==='landlord'&&!m.read).length;
}

function nestiqUpdateTenantBadges(){
  // Unread messages
  const unreadMessages=(window.tenantMessages||[]).filter(m=>m&&m.fromRole==='landlord'&&!m.read).length||0;
  const msgBadge=document.getElementById('tabBadge-messages');
  if(msgBadge){
    msgBadge.textContent=unreadMessages>99?'99+':String(unreadMessages);
    msgBadge.style.display=unreadMessages?'flex':'none';
  }
  // Unread documents
  const unreadDocs=(window.tenantUploadedDocuments||[]).filter(d=>nestiqTenantDocUnread?.(d)).length||0;
  const docBadge=document.getElementById('tabBadge-documents');
  if(docBadge){
    docBadge.textContent=unreadDocs>99?'99+':String(unreadDocs);
    docBadge.style.display=unreadDocs?'flex':'none';
  }
  // Open maintenance
  const openMaint=(window.tenantMaintenance||[]).filter(m=>{
    const st=String(m?.status||'').toLowerCase();
    return st==='open'||st==='in-progress'||st==='progress';
  }).length||0;
  const maintBadge=document.getElementById('tabBadge-maintenance');
  if(maintBadge){
    maintBadge.textContent=openMaint>99?'99+':String(openMaint);
    maintBadge.style.display=openMaint?'flex':'none';
  }
  // Overdue payments
  const tenant=getCurrentTenant();
  const rentStatus=tenant?calculateTenantRentStatus(tenant):null;
  const isOverdue=rentStatus?.status==='overdue';
  const payBadge=document.getElementById('tabBadge-payments');
  if(payBadge){
    payBadge.textContent=isOverdue?'!':'';
    payBadge.style.display=isOverdue?'flex':'none';
  }
}
window.nestiqUpdateTenantBadges=nestiqUpdateTenantBadges;
// Back-compat alias
function updateTenantTabBadges(){ nestiqUpdateTenantBadges(); }
window.updateTenantTabBadges=updateTenantTabBadges;

// Wrapper renderers (keep existing render functions intact)
function nestiqRenderTenantHome(container){ renderTenantHomeTab(container); }
function nestiqRenderTenantPayments(container){ renderTenantPaymentsTab(container); }
function nestiqRenderTenantMaintenance(container){ renderTenantMaintenanceTab(container); }
function nestiqRenderTenantDocuments(container){ renderTenantDocumentsTab(container); }
function nestiqRenderTenantMessages(container){ renderTenantMessagesTab(container); }
function nestiqRenderTenantProfile(container){ renderTenantProfileTab(container); }
window.nestiqRenderTenantHome=nestiqRenderTenantHome;
window.nestiqRenderTenantPayments=nestiqRenderTenantPayments;
window.nestiqRenderTenantMaintenance=nestiqRenderTenantMaintenance;
window.nestiqRenderTenantDocuments=nestiqRenderTenantDocuments;
window.nestiqRenderTenantMessages=nestiqRenderTenantMessages;
window.nestiqRenderTenantProfile=nestiqRenderTenantProfile;

function nestiqTenantUpcomingEvents(limit=3){
  const tenant=window.currentTenantData;
  if(!tenant) return [];
  const events=[];
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const today=new Date(); today.setHours(0,0,0,0);
  const nextDue=new Date(today.getFullYear(),today.getMonth(),dueDay);
  if(nextDue<today) nextDue.setMonth(nextDue.getMonth()+1);
  const paid=(window.tenantPayments||[]).some(p=>{
    const d=new Date(p.date);
    return d.getMonth()===nextDue.getMonth()&&d.getFullYear()===nextDue.getFullYear();
  });
  if(!paid) events.push({date:nextDue,label:'Rent due',sub:'R'+Number(tenant.rent||0).toLocaleString('en-ZA'),icon:'💳'});
  const leaseEnd=new Date(tenant.lease||tenant.leaseEnd||'2026-12-31');
  if(String(leaseEnd)!=='Invalid Date') events.push({date:leaseEnd,label:'Lease ends',sub:leaseEnd.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}),icon:'📋'});
  (window.tenantMaintenance||[]).filter(r=>{
    const st=String(r.status||'').toLowerCase();
    return st!=='done'&&st!=='resolved';
  }).forEach(r=>{
    const md=new Date(r.preferredDate||r.scheduledDate||'');
    if(String(md)!=='Invalid Date'&&md>=today){
      events.push({date:md,label:String(r.title||'Maintenance'),sub:getStatusLabel(r.status),icon:'🔧'});
    }
  });
  return events.sort((a,b)=>a.date-b.date).slice(0,limit);
}

function renderTenantHomeStatusBanner(){
  const el=document.getElementById('tenantHomeStatusBanner');
  const tenant=window.currentTenantData;
  if(!el||!tenant) return;
  const status=calculateTenantRentStatus(tenant);
  const dueDay=tenant.monthlyDueDate||1;
  const rent=Number(tenant.rent||0);
  const cls=status.status==='paid'?'paid':status.status==='overdue'?'overdue':'due';
  const title=status.status==='paid'?'You\'re up to date':status.status==='overdue'?'Rent is overdue':'Rent due soon';
  const eyebrow=status.status==='paid'?'Payment status':status.status==='overdue'?'Action needed':'Upcoming';
  const dueTxt=status.status==='paid'
    ?(status.message||'Thank you — this month\'s rent is settled.')
    :`R${rent.toLocaleString('en-ZA')} · Due on the ${dueDay}${dueDay===1?'st':dueDay===2?'nd':dueDay===3?'rd':'th'}`;
  el.className='tenant-status-banner '+cls;
  el.innerHTML=`
    <div class="tenant-status-banner-body">
      <div class="tenant-status-banner-eyebrow">${eyebrow}</div>
      <div class="tenant-status-banner-title">${title}</div>
      <div class="tenant-status-banner-meta">${dueTxt}</div>
    </div>
    ${status.status!=='paid'
      ?`<button type="button" class="btn-primary" onclick="openTenantPayModal()">Pay rent</button>`
      :`<button type="button" class="btn-outline btn-sm" onclick="nestiqSwitchTenantTab('payments')">View history</button>`}`;
}

function renderTenantHomeTab(panel){
  const tenant=window.currentTenantData;
  const first=String(tenant?.name||'Tenant').trim().split(/\s+/)[0]||'Tenant';
  const prop=String(tenant?.property||window.tenantProperty?.name||'Your home').replace(/</g,'&lt;');
  const unit=String(tenant?.unit||'').trim();
  const place=[unit,prop].filter(Boolean).join(' · ');
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Tenant portal</div>
      <h1 class="tenant-home-title">Welcome back, ${first.replace(/</g,'&lt;')}</h1>
      <p class="tenant-home-sub">${place||'Your rental overview'}</p>
    </header>
    <div id="tenantHomeStatusBanner"></div>
    <div class="tenant-quick-stats" id="tenantHomeQuickStats"></div>
    <div class="tenant-quick-actions">
      <button type="button" class="tenant-quick-action primary" onclick="openTenantPayModal()">
        <span class="tenant-quick-action-icon" aria-hidden="true">💳</span>
        <span class="tenant-quick-action-label">Pay rent</span>
        <span class="tenant-quick-action-hint">Secure checkout</span>
      </button>
      <button type="button" class="tenant-quick-action" onclick="nestiqSwitchTenantTab('maintenance');setTimeout(()=>openTenantReportIssueForm(),100)">
        <span class="tenant-quick-action-icon" aria-hidden="true">🔧</span>
        <span class="tenant-quick-action-label">Report issue</span>
        <span class="tenant-quick-action-hint">Maintenance</span>
      </button>
      <button type="button" class="tenant-quick-action" onclick="nestiqSwitchTenantTab('messages')">
        <span class="tenant-quick-action-icon" aria-hidden="true">✉️</span>
        <span class="tenant-quick-action-label">Message</span>
        <span class="tenant-quick-action-hint">Your landlord</span>
      </button>
    </div>
    <div class="tenant-section-card">
      <div class="tenant-section-title">Coming up</div>
      <div id="tenantHomeEvents"></div>
    </div>
    <div id="tenantHomeMoveOut"></div>`;
  renderTenantHomeStatusBanner();
  const statsEl=document.getElementById('tenantHomeQuickStats');
  if(statsEl&&tenant){
    const days=nestiqTenantLeaseDaysRemaining(tenant);
    const openMaint=(window.tenantMaintenance||[]).filter(r=>{
      const st=String(r.status||'open').toLowerCase();
      return st!=='done'&&st!=='resolved'&&st!=='closed';
    }).length;
    statsEl.innerHTML=`
      <div class="tenant-quick-stat"><div class="tenant-quick-stat-val">${days}</div><div class="tenant-quick-stat-lbl">Lease days left</div></div>
      <div class="tenant-quick-stat"><div class="tenant-quick-stat-val">${openMaint}</div><div class="tenant-quick-stat-lbl">Open requests</div></div>
      <div class="tenant-quick-stat"><div class="tenant-quick-stat-val">${nestiqTenantUnreadDocsCount()}</div><div class="tenant-quick-stat-lbl">Unread docs</div></div>
      <div class="tenant-quick-stat"><div class="tenant-quick-stat-val">${nestiqTenantUnreadMsgCount()}</div><div class="tenant-quick-stat-lbl">Unread messages</div></div>`;
  }
  const evEl=document.getElementById('tenantHomeEvents');
  const events=nestiqTenantUpcomingEvents(3);
  if(evEl){
    evEl.innerHTML=events.length?events.map(e=>`
      <div class="tenant-event-row">
        <span class="tenant-event-icon" aria-hidden="true">${e.icon}</span>
        <div style="flex:1;min-width:0">
          <div class="tenant-event-title">${String(e.label||'').replace(/</g,'&lt;')}</div>
          <div class="tenant-event-sub">${String(e.sub||'').replace(/</g,'&lt;')}</div>
        </div>
        <div class="tenant-event-date">${e.date.toLocaleDateString('en-ZA',{day:'numeric',month:'short'})}</div>
      </div>`).join(''):'<div class="tenant-empty-hint">Nothing scheduled right now.</div>';
  }
  renderMoveOutChecklist(tenant,nestiqTenantLeaseDaysRemaining(tenant));
  renderGettingStartedTenant();
}

function renderTenantPaymentsTab(panel){
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Finances</div>
      <h1 class="tenant-home-title">Payments</h1>
      <p class="tenant-home-sub">Rent status and payment history</p>
    </header>
    <div class="tenant-section-card" id="tenantPaymentsRentStatus"></div>
    <div class="tenant-section-card" id="tenantPaymentHistory"></div>`;
  renderRentStatusCard();
  renderPaymentHistoryCard();
}

function nestiqMaintTimelineStep(status){
  const st=String(status||'open').toLowerCase();
  const steps=['Submitted','Received','Assigned','Scheduled','In Progress','Resolved'];
  let idx=0;
  if(st==='open') idx=1;
  else if(st==='assigned') idx=2;
  else if(st==='scheduled') idx=3;
  else if(st==='progress'||st==='in progress') idx=4;
  else if(st==='done'||st==='resolved'||st==='closed') idx=5;
  return {steps,idx};
}

function openTenantReportIssueForm(){
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Report New Issue</h2>
    <div class="form-group"><label>Title</label><input class="form-input" id="portal_maint_title" placeholder="e.g. Leaking kitchen tap"></div>
    <div class="form-row">
      <div class="form-group"><label>Issue Type</label><select class="form-input" id="portal_maint_type"><option>Plumbing</option><option>Electrical</option><option>Structural</option><option>Appliance</option><option>Pest Control</option><option>Other</option></select></div>
      <div class="form-group"><label>Urgency</label><select class="form-input" id="portal_maint_urgency"><option>Medium — Needs attention</option><option>High — Affects daily living</option><option>Emergency — Safety risk</option><option>Low — Minor issue</option></select></div>
    </div>
    <div class="form-group"><label>Description</label><textarea class="form-input form-textarea" id="portal_maint_desc" placeholder="Describe the issue..."></textarea></div>
    <div class="form-group"><label>Preferred date</label><input class="form-input" id="portal_maint_date" type="date" min="${today}"></div>
    <button class="btn-primary" style="width:100%;justify-content:center;margin-top:12px" onclick="submitTenantMaintenance();closeModal()">Submit Request</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}
window.openTenantReportIssueForm=openTenantReportIssueForm;

function setTenantMaintFilter(f,btn){
  __tenantMaintFilter=f;
  document.querySelectorAll('.tenant-maint-filter').forEach(b=>b.classList.toggle('active',b===btn));
  renderTenantMaintList();
}

function renderTenantMaintList(){
  const el=document.getElementById('tenantMaintList');
  if(!el) return;
  let rows=[...(window.tenantMaintenance||[])];
  if(__tenantMaintFilter==='open') rows=rows.filter(r=>['open','assigned','scheduled'].includes(String(r.status||'').toLowerCase()));
  else if(__tenantMaintFilter==='progress') rows=rows.filter(r=>['progress','in progress'].includes(String(r.status||'').toLowerCase()));
  else if(__tenantMaintFilter==='resolved') rows=rows.filter(r=>['done','resolved','closed'].includes(String(r.status||'').toLowerCase()));
  if(!rows.length){
    el.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)"><div style="font-size:2rem;margin-bottom:10px">🔧</div><div>No maintenance requests yet. Tap + to report an issue.</div></div>`;
    return;
  }
  el.innerHTML=rows.map(r=>{
    const {steps,idx}=nestiqMaintTimelineStep(r.status);
    const title=String(r.title||r.issueType||'Maintenance').replace(/</g,'&lt;');
    const cat=String(r.issueType||r.issueCategory||'Other').replace(/</g,'&lt;');
    const photo=r.photoUrl||r.photo||'';
    const rated=r.maintenanceRating!=null;
    const resolved=['done','resolved','closed'].includes(String(r.status||'').toLowerCase());
    const idJs=String(r.id).replace(/'/g,"\\'");
    return `<div class="tenant-section-card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-weight:700">${title}</div><div style="font-size:0.78rem;color:var(--muted)">${cat} · Submitted ${nestiqFormatMaintSubmittedDate(r)}</div></div>
        <span class="badge ${getStatusBadge(r.status)}">${getStatusLabel(r.status)}</span>
      </div>
      <div class="tenant-maint-timeline">${steps.map((s,i)=>`<div class="tenant-maint-step${i===idx?' active':''}">${s}</div>`).join('')}</div>
      ${photo?`<img src="${photo}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-top:8px" alt="">`:''}
      ${resolved&&!rated?`<div style="margin-top:10px"><div style="font-size:0.78rem;margin-bottom:6px">Rate this repair:</div><div>${[1,2,3,4,5].map(n=>`<button type="button" class="btn-outline btn-sm" style="padding:4px 8px;margin-right:4px" onclick="nestiqRateMaintenance('${idJs}',${n})">★${n}</button>`).join('')}</div></div>`:''}
      ${rated?`<div style="font-size:0.78rem;color:var(--gold);margin-top:8px">Rated ${r.maintenanceRating}/5 ★</div>`:''}
    </div>`;
  }).join('');
}

async function nestiqRateMaintenance(id,stars){
  try{
    const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
    if(lid) await window.nestiqFs.maintenance(window.nestiqDb,lid).doc(String(id)).update({maintenanceRating:stars});
    const r=(window.tenantMaintenance||[]).find(x=>String(x.id)===String(id));
    if(r) r.maintenanceRating=stars;
    renderTenantMaintList();
    showNotif('Thanks for your feedback!','success');
  }catch(e){ showNotif('Could not save rating','error'); }
}
window.nestiqRateMaintenance=nestiqRateMaintenance;

function renderTenantMaintenanceTab(panel){
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Care</div>
      <h1 class="tenant-home-title">Maintenance</h1>
      <p class="tenant-home-sub">Track requests and report new issues</p>
    </header>
    <button type="button" class="tenant-quick-action primary" style="width:100%;margin-bottom:16px" onclick="openTenantReportIssueForm()">
      <span class="tenant-quick-action-icon" aria-hidden="true">🔧</span>
      <span class="tenant-quick-action-label">Report a new issue</span>
      <span class="tenant-quick-action-hint">Average response within 1–2 business days</span>
    </button>
    <div class="tenant-maint-filters">
      <button type="button" class="tenant-maint-filter active" onclick="setTenantMaintFilter('all',this)">All</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('open',this)">Open</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('progress',this)">In Progress</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('resolved',this)">Resolved</button>
    </div>
    <div id="tenantMaintList"></div>`;
  renderTenantMaintList();
}

function renderTenantDocumentsTab(panel){
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Files</div>
      <h1 class="tenant-home-title">Documents</h1>
      <p class="tenant-home-sub">Lease, receipts and shared files</p>
    </header>
    <div id="tenantDocumentsCard"></div>`;
  renderDocumentsCard();
}

function renderTenantMessagesTab(panel){
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Inbox</div>
      <h1 class="tenant-home-title">Messages</h1>
      <p class="tenant-home-sub">Chat with your landlord</p>
    </header>
    <div id="tenantMessagesCard"></div>`;
  renderMessagesCard();
}

function renderTenantProfileTab(panel){
  const tenant=window.currentTenantData;
  if(!panel) return;
  if(!tenant){
    panel.innerHTML=`
      <header class="tenant-home-header">
        <div class="tenant-home-kicker">Account</div>
        <h1 class="tenant-home-title">Profile</h1>
        <p class="tenant-home-sub">Loading your details…</p>
      </header>
      <div class="tenant-section-card" style="color:var(--muted);font-size:0.9rem;line-height:1.5">
        Your profile will appear here in a moment. If this stays empty, refresh the page or ask your landlord to confirm your portal invite.
      </div>`;
    return;
  }
  const photo=tenant.profilePhoto||tenant.avatar||'';
  const lang=(tenant.preferredLanguage||getCurrentLanguage?.()||'en').toLowerCase();
  const themeName=tenant.preferredTheme||getThemeName?.()||'gold';
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Account</div>
      <h1 class="tenant-home-title">Profile</h1>
      <p class="tenant-home-sub">Your details and preferences</p>
    </header>
    <div class="tenant-section-card" style="text-align:center">
      <div class="tenant-profile-photo-wrap">
        <div class="tenant-profile-photo" id="tenantProfilePhoto">${(photo&&(photo.startsWith('data:')||photo.startsWith('http')))?`<img src="${photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`:String(tenant.name||'T').slice(0,1)}</div>
        <button type="button" class="tenant-profile-photo-edit" onclick="document.getElementById('tenantProfilePhotoInput').click()">✏</button>
        <input type="file" id="tenantProfilePhotoInput" accept="image/*" hidden>
      </div>
      <div class="form-group"><label>Name</label><input class="form-input" id="tenantProfName" value="${String(tenant.name||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label>Email</label><input class="form-input" id="tenantProfEmail" type="email" value="${String(tenant.email||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label>Phone</label><input class="form-input" id="tenantProfPhone" value="${String(tenant.phone||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label>Emergency Contact</label><input class="form-input" id="tenantProfEmergency" value="${String(tenant.emergencyContact||'').replace(/"/g,'&quot;')}" placeholder="Name & phone"></div>
      <button type="button" class="btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="saveTenantProfileFields()">Save Profile</button>
    </div>
    <div class="tenant-section-card">
      <div class="tenant-section-title">Preferences</div>
      <div class="form-group"><label>Language</label>
        <select class="form-input" id="tenantProfLang" onchange="setTenantPreferredLanguage(this.value)">
          ${['en','af','zu','xh','st'].map(l=>`<option value="${l}" ${lang===l?'selected':''}>${l.toUpperCase()}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Theme</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
          ${Object.keys(themes||{gold:{}}).map(k=>`<button type="button" class="theme-mini-dot" style="background:${themes[k]?.preview||'#c9a84c'};width:28px;height:28px;border-radius:50%;border:${themeName===k?'2px solid var(--ink)':'1px solid var(--border)'}" onclick="applyTenantTheme('${k}')"></button>`).join('')}
        </div>
      </div>
      <div class="settings-toggle-row"><span>Rent reminders</span><input type="checkbox" id="tenantNotifRent" ${tenant.notifyRent!==false?'checked':''}></div>
      <div class="settings-toggle-row"><span>Maintenance updates</span><input type="checkbox" id="tenantNotifMaint" ${tenant.notifyMaint!==false?'checked':''}></div>
      <div class="settings-toggle-row"><span>Notices from landlord</span><input type="checkbox" id="tenantNotifNotices" ${tenant.notifyNotices!==false?'checked':''}></div>
      <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:10px" onclick="saveTenantNotificationPrefs()">Save notification preferences</button>
    </div>
    <div class="tenant-section-card" id="tenantUtilitiesCard"></div>
    <div class="tenant-section-card" id="tenantPropertyInfo"></div>
    <button type="button" class="btn-outline btn-sm" style="width:100%;margin-bottom:10px" onclick="openTenantChangePasswordModal()">Change Password</button>
    <button type="button" class="btn-sm" style="width:100%;background:var(--rust);color:#fff;border:none;border-radius:30px;padding:12px;font-weight:600;cursor:pointer" onclick="nestiqTenantLogout()">Log Out</button>`;
  document.getElementById('tenantProfilePhotoInput')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];
    if(!f) return;
    compressImage(f,400,0.8,async b64=>{
      try{
        showNotif?.('Uploading photo…','info');
        await saveTenantProfilePhoto(b64);
        renderTenantProfileTab(panel);
        showNotif?.('Profile photo saved','success');
      }catch(err){
        console.error('Tenant profile photo', err);
        showNotif?.('Could not save photo. Try a smaller image.','error');
      }
    });
  });
  renderUtilityCard(tenant);
  renderPropertyInfoCard();
}

async function saveTenantProfileFields(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  tenant.name=document.getElementById('tenantProfName')?.value?.trim()||tenant.name;
  tenant.email=document.getElementById('tenantProfEmail')?.value?.trim()||tenant.email;
  tenant.phone=document.getElementById('tenantProfPhone')?.value?.trim()||'';
  tenant.emergencyContact=document.getElementById('tenantProfEmergency')?.value?.trim()||'';
  await nestiqPersistTenantProfile(tenant);
  renderTenantProfile();
  showNotif('Profile updated','success');
}

async function saveTenantProfilePhoto(b64){
  const tenant=window.currentTenantData;
  if(!tenant) throw new Error('No tenant');
  const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
  const tid=window.nestiqTenantSession?.tenantId||window.currentUser?.tenantDocId||tenant.id;
  if(!lid||!tid) throw new Error('Missing landlord/tenant id');

  let photoUrl=String(b64||'');
  // Prefer Storage URL — base64 in Firestore often fails (doc size) and does not survive refresh.
  if(photoUrl.startsWith('data:') && window.nestiqUseFirestore && typeof window.uploadNestiqFile==='function'){
    const path=`tenants/${lid}/${tid}/profile_${Date.now()}.jpg`;
    photoUrl=await window.uploadNestiqFile(path, photoUrl, 'image/jpeg');
  }
  if(!photoUrl) throw new Error('Empty photo');

  tenant.profilePhoto=photoUrl;
  await nestiqPersistTenantProfile(tenant,{ profilePhoto:photoUrl });
  return photoUrl;
}

async function saveTenantNotificationPrefs(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  tenant.notifyRent=Boolean(document.getElementById('tenantNotifRent')?.checked);
  tenant.notifyMaint=Boolean(document.getElementById('tenantNotifMaint')?.checked);
  tenant.notifyNotices=Boolean(document.getElementById('tenantNotifNotices')?.checked);
  await nestiqPersistTenantProfile(tenant);
  showNotif('Notification preferences saved','success');
}

async function nestiqPersistTenantProfile(tenant, extra){
  extra=extra||{};
  try{
    const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
    const tid=window.nestiqTenantSession?.tenantId||window.currentUser?.tenantDocId||tenant?.id;
    if(lid&&tid&&window.nestiqFs?.tenants&&window.nestiqDb){
      const payload={
        name:tenant.name,
        email:tenant.email,
        phone:tenant.phone||'',
        emergencyContact:tenant.emergencyContact||'',
        preferredLanguage:tenant.preferredLanguage||null,
        preferredTheme:tenant.preferredTheme||null,
        notifyRent:tenant.notifyRent!==false,
        notifyMaint:tenant.notifyMaint!==false,
        notifyNotices:tenant.notifyNotices!==false
      };
      const photo=extra.profilePhoto!=null?extra.profilePhoto:tenant.profilePhoto;
      // Only persist http(s) URLs — never store large data: URLs in Firestore.
      if(photo&&/^https?:\/\//i.test(String(photo))){
        payload.profilePhoto=String(photo);
      }else if(photo&&String(photo).startsWith('data:')){
        console.warn('NestIQ: skipped persisting base64 profilePhoto to Firestore');
      }
      Object.keys(payload).forEach(k=>{ if(payload[k]==null) delete payload[k]; });
      await window.nestiqFs.tenants(window.nestiqDb,lid).doc(String(tid)).set(payload,{merge:true});
      if(window.currentTenantData&&String(window.currentTenantData.id)===String(tid)){
        Object.assign(window.currentTenantData, payload);
      }
    }
    saveData?.();
  }catch(e){
    console.error('persist profile',e);
    throw e;
  }
}

function openTenantChangePasswordModal(){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Change Password</h2>
    <div class="form-group"><label>New Password</label><input class="form-input" id="tenantNewPass" type="password" minlength="6"></div>
    <div class="form-group"><label>Confirm Password</label><input class="form-input" id="tenantNewPass2" type="password"></div>
    <button class="btn-primary" style="width:100%;margin-top:12px" onclick="submitTenantPasswordChange()">Update Password</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}
window.openTenantChangePasswordModal=openTenantChangePasswordModal;

async function submitTenantPasswordChange(){
  const p1=document.getElementById('tenantNewPass')?.value||'';
  const p2=document.getElementById('tenantNewPass2')?.value||'';
  if(p1.length<6){ showNotif('Password must be at least 6 characters','error'); return; }
  if(p1!==p2){ showNotif('Passwords do not match','error'); return; }
  const u=firebase.auth?.()?.currentUser;
  if(!u){ showNotif('Not signed in','error'); return; }
  try{
    await u.updatePassword(p1);
    closeModal();
    showNotif('Password updated','success');
  }catch(e){
    showNotif(e?.message||'Could not update password','error');
  }
}
window.submitTenantPasswordChange=submitTenantPasswordChange;

function nestiqTenantRefreshVisibleSections(){
  updateTenantTabBadges();
  if(document.getElementById('tenantHomeStatusBanner')) renderTenantHomeStatusBanner();
  if(document.getElementById('tenantPaymentsRentStatus')) renderRentStatusCard();
  if(document.getElementById('paymentHistory')) renderPaymentHistoryCard();
  if(document.getElementById('tenantMaintList')) renderTenantMaintList();
  if(document.getElementById('tenantDocumentsCard')) renderDocumentsCard();
  if(document.getElementById('tenantMessagesCard')) renderMessagesCard();
  // Re-fill Profile if it was opened before tenant data arrived (was blank forever).
  try{
    const profilePanel=document.getElementById('tTab-profile');
    if(profilePanel&&(__tenantActiveTab==='profile'||!profilePanel.querySelector('#tenantProfName'))){
      if(window.currentTenantData){
        renderTenantProfileTab(profilePanel);
        __tenantTabsLoaded.profile=true;
      }
    }
  }catch(_e){}
  renderGettingStartedTenant();
}

function scrollToTenantCard(id){
  const map={
    tenantPaymentHistory:'payments',
    tenantMaintenanceCard:'maintenance',
    tenantDocumentsCard:'documents',
    tenantMessagesCard:'messages'
  };
  const tab=map[id]||'home';
  nestiqSwitchTenantTab(tab);
}

function nestiqShowTenantDashboardLoading(show){
  const banner=document.getElementById('tenantWelcomeBanner');
  if(banner){
    banner.innerHTML=show?'<p style="color:var(--muted);font-size:0.88rem;margin:8px 0 0">Loading your portal…</p>':'';
  }
  document.querySelectorAll('.tenant-tab-page').forEach(p=>{
    p.style.opacity=show?'0.55':'';
    p.style.pointerEvents=show?'none':'';
  });
}
window.nestiqShowTenantDashboardLoading=nestiqShowTenantDashboardLoading;

function nestiqShowTenantDashboardError(message){
  nestiqShowTenantDashboardLoading(false);
  const banner=document.getElementById('tenantWelcomeBanner');
  if(banner){
    banner.innerHTML=`<div style="padding:14px;border-radius:12px;border:1px solid rgba(196,106,58,0.45);background:rgba(196,106,58,0.08);font-size:0.88rem;line-height:1.5">${String(message||'Unable to load your portal.').replace(/</g,'&lt;')}</div>
      <button type="button" class="btn-outline btn-sm" style="margin-top:12px" onclick="location.reload()">Retry</button>
      <button type="button" class="btn-outline btn-sm" style="margin-top:12px;margin-left:8px" onclick="nestiqTenantLogout()">Log out</button>`;
  }
}
window.nestiqShowTenantDashboardError=nestiqShowTenantDashboardError;

function nestiqTenantLogout(){
  try{ window.logoutSession?.(); }catch(_e){
    try{
      sessionStorage.removeItem('nestiq-session');
      window.__nestiqSession=null;
      location.href='index.html';
    }catch(_e2){}
  }
}
window.nestiqTenantLogout=nestiqTenantLogout;

function nestiqSafeTenantRender(fn, label){
  try{ fn(); }
  catch(err){ console.error('Tenant dashboard section failed:', label, err); }
}

function renderTenantDashboard(){
  try{
    const s=typeof getSession==='function'?getSession():window.__nestiqSession;
    if(s&&s.role==='landlord'){
      nestiqShowTenantDashboardLoading(false);
      if(location.hash!=='#home') location.hash='#home';
      else if(typeof showPage==='function') showPage('home');
      return;
    }
  }catch(_e){}
  let tenant=getCurrentTenant();
  if(!tenant&&typeof window.nestiqBootstrapTenantFromLocalCache==='function'){
    tenant=window.nestiqBootstrapTenantFromLocalCache();
  }
  if(!tenant){
    nestiqShowTenantDashboardLoading(true);
    return;
  }
  nestiqShowTenantDashboardLoading(false);
  if(!document.getElementById('tenantTabContent')) return;
  nestiqSafeTenantRender(()=>renderTenantProfile(), 'profile');
  // Set greeting based on time of day
  try{
    const hour=new Date().getHours();
    const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
    const first=String(tenant.name||'Tenant').trim().split(/\s+/)[0]||'Tenant';
    const greetingEl=document.getElementById('tenantGreeting');
    if(greetingEl) greetingEl.textContent=greeting+', '+first;
  }catch(_e){}

  nestiqUpdateTenantBadges?.();
  // Always refresh the active tab once data is present.
  if(__tenantActiveTab&&__tenantActiveTab!=='home'){
    __tenantTabsLoaded[__tenantActiveTab]=false;
    nestiqSwitchTenantTab(__tenantActiveTab);
  }else if(!__tenantTabsLoaded.home){
    nestiqSwitchTenantTab('home');
  }else{
    nestiqTenantRefreshVisibleSections();
  }
  setTimeout(()=>{ try{ nestiqUpdateTenantBadges?.(); }catch(_e){} }, 500);
  try{ applyTranslations?.(); }catch(err){ console.error('Tenant dashboard i18n', err); }
}

function setTenantPreferredLanguage(lang){
  const tenant=getCurrentTenant(); if(!tenant) return;
  tenant.preferredLanguage=lang;
  saveData();
  setLanguage?.(lang,{skipTenantPersist:true});
  nestiqPersistTenantProfile(tenant);
  const sel=document.getElementById('tenantProfLang');
  if(sel) sel.value=lang;
  renderTenantDashboard();
}

window.renderTenantDashboard=renderTenantDashboard;
window.openTenantPayModal=openTenantPayModal;
window.confirmTenantPayment=confirmTenantPayment;
window.downloadTenantStatementCSV=downloadTenantStatementCSV;
window.printTenantStatement=printTenantStatement;
window.printReceiptById=printReceiptById;
window.submitTenantMaintenance=submitTenantMaintenance;
window.updateMaintCharCount=updateMaintCharCount;
window.sendTenantMessage=sendTenantMessage;
window.expandNotice=expandNotice;
window.markNoticeRead=markNoticeRead;
window.submitUtilityReading=submitUtilityReading;
window.toggleMoveTask=toggleMoveTask;
window.scrollToTenantCard=scrollToTenantCard;
window.printTenantLeaseSummary=printTenantLeaseSummary;
window.printLatestTenantReceipt=printLatestTenantReceipt;
window.printHouseRules=printHouseRules;
window.printMoveInInspection=printMoveInInspection;
window.runTenantMaintAiAssess=runTenantMaintAiAssess;
window.setTenantPreferredLanguage=setTenantPreferredLanguage;
window.updateTenantTabBadges=updateTenantTabBadges;
window.nestiqTenantRefreshVisibleSections=nestiqTenantRefreshVisibleSections;
window.setTenantMaintFilter=setTenantMaintFilter;
window.saveTenantProfileFields=saveTenantProfileFields;
window.saveTenantNotificationPrefs=saveTenantNotificationPrefs;
