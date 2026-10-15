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

function nestiqTenantPortalMode(){
  const t=window.currentTenantData;
  if(!t) return 'applicant';
  const st=String(t.status||'').toLowerCase();
  if(st==='unassigned'||st==='vacant') return 'applicant';
  const assigned=String(t.propertyId||'').trim()||String(t.property||'').trim();
  if(!assigned) return 'applicant';
  const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(t.id)
    : null;
  const leaseSt=String(lease?.storedStatus||lease?.status||t.leaseStatus||'').toLowerCase();
  if(leaseSt==='terminated') return 'applicant';
  const leaseActive=leaseSt==='active'||leaseSt==='expired'
    || !!(lease && typeof window.nestiqLeaseIsActiveForRent==='function' && window.nestiqLeaseIsActiveForRent(lease, t));
  if(leaseActive) return 'active';
  if(leaseSt==='awaiting_payment') return 'awaiting_payment';
  if(st==='pending-lease'||leaseSt==='pending_signature'||leaseSt==='draft') return 'lease';
  if(leaseSt && leaseSt!=='active' && leaseSt!=='expired') return 'lease';
  return 'active';
}
window.nestiqTenantPortalMode=nestiqTenantPortalMode;

function nestiqApplyTenantPortalChrome(){
  const mode=nestiqTenantPortalMode();
  const page=document.getElementById('page-tenant-dashboard')||document.querySelector('.tenant-portal-page');
  if(page) page.setAttribute('data-portal-mode', mode);
  const wrap=document.querySelector('.tenant-portal-wrap');
  if(wrap) wrap.setAttribute('data-portal-mode', mode);
  ['payments','maintenance','documents','messages'].forEach(tab=>{
    const btn=document.querySelector(`.tenant-tab-bar .tab-btn[data-tab="${tab}"]`);
    if(!btn) return;
    const show=mode==='active' || (mode==='awaiting_payment' && tab==='payments');
    btn.hidden=!show;
    btn.setAttribute('aria-hidden', show?'false':'true');
    btn.style.display=show?'':'none';
  });
  const appsBtn=document.querySelector('.tenant-tab-bar .tab-btn[data-tab="applications"]');
  if(appsBtn){
    appsBtn.hidden=false;
    appsBtn.style.display='';
    appsBtn.classList.toggle('has-unread', !!(window.__nestiqMyApplicationsCache||[]).some(a=>String(a.status||'')==='info_required'));
  }
}
window.nestiqApplyTenantPortalChrome=nestiqApplyTenantPortalChrome;

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

function nestiqParseTenantLeaseStart(tenant){
  const raw=tenant?.leaseStart;
  if(!raw) return null;
  try{
    if(raw.toDate){
      const d=raw.toDate();
      d.setHours(0,0,0,0);
      return d;
    }
  }catch(_e){}
  if(raw.seconds){
    const d=new Date(raw.seconds*1000);
    if(String(d)!=='Invalid Date'){ d.setHours(0,0,0,0); return d; }
  }
  const iso=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10)+'T12:00:00':raw;
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return null;
  d.setHours(0,0,0,0);
  return d;
}

function nestiqTenantLeaseStartsInFuture(tenant){
  const start=nestiqParseTenantLeaseStart(tenant);
  if(!start) return false;
  const today=new Date();
  today.setHours(0,0,0,0);
  return start.getTime()>today.getTime();
}

function calculateTenantRentStatus(tenant){
  if(typeof window.nestiqCurrentRentObligation==='function'){
    const o=window.nestiqCurrentRentObligation(tenant);
    const portalStatus=o.status==='pending-lease'?'upcoming':o.status;
    return{
      status:portalStatus,
      label:o.label|| (portalStatus==='upcoming'?'UPCOMING':portalStatus==='due'?'DUE TODAY':'RENT DUE'),
      badgeClass:o.badgeClass||'badge-blue',
      message:o.message||'',
      amountDue:o.amountDue,
      dueDate:o.dueDate,
      days:o.daysRemaining,
      daysRemaining:o.daysRemaining,
      daysOverdue:o.daysOverdue,
      payable:!!o.payable,
      lease:o.lease
    };
  }
  const start=nestiqParseTenantLeaseStart(tenant);
  if(start){
    const today0=new Date();
    today0.setHours(0,0,0,0);
    if(start.getTime()>today0.getTime()){
      const pretty=start.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
      return{
        status:'upcoming',
        label:'UPCOMING',
        badgeClass:'badge-blue',
        message:'Lease starts '+pretty,
        amountDue:tenant?.rent,
        leaseStart:start,
        payable:false
      };
    }
  }
  const today=new Date();
  const currentMonth=today.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  const dueDate=tenant.monthlyDueDate||1;
  const payments=window.tenantPayments||[];
  const currentPayment=payments.find(p=>{
    if(typeof window.nestiqPaymentCountsTowardMonthlyRent==='function' && !window.nestiqPaymentCountsTowardMonthlyRent(p)) return false;
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
      receiptNo:currentPayment.receiptNo||'',
      payable:false
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
      amountDue:tenant.rent,
      payable:true
    };
  }
  const daysRemaining=dueDate-today.getDate();
  return{
    status:'due',
    label:'RENT DUE',
    badgeClass:'badge-amber',
    daysRemaining,
    message:'Due in '+daysRemaining+' days',
    amountDue:tenant.rent,
    payable:true
  };
}
window.calculateTenantRentStatus=calculateTenantRentStatus;
window.nestiqTenantLeaseStartsInFuture=nestiqTenantLeaseStartsInFuture;
window.nestiqParseTenantLeaseStart=nestiqParseTenantLeaseStart;

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
      navA.innerHTML=`<img src="${pp}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="" referrerpolicy="no-referrer">`;
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
  if(typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()==='awaiting_payment'){
    const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'?window.nestiqPrimaryLeaseForTenant(tenant.id):null;
    const due=typeof window.nestiqLeaseInitialDue==='function'?window.nestiqLeaseInitialDue(lease, tenant):{total:0,depositDue:0,rentDue:0};
    const el=document.getElementById('tenantPaymentsRentStatus')||document.getElementById('rentStatusCard')||document.getElementById('tenantRentStatus');
    if(!el) return;
    el.className='tenant-section-card nestiq-movein-wrap';
    el.innerHTML=nestiqMoveInPanelHtml(due,{
      variant:'payments',
      unit:tenant.unit,
      property:tenant.property
    });
    return;
  }
  const el=document.getElementById('tenantPaymentsRentStatus')||document.getElementById('rentStatusCard')||document.getElementById('tenantRentStatus');
  if(!el) return;
  const sess=typeof getSession==='function'?getSession():window.__nestiqSession;
  if(window.nestiqUseFirestore && sess?.role==='tenant' && !window.__nestiqTenantPaymentsReady){
    el.className='tenant-section-card';
    el.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">Rent status</div><div class="text-2xl font-bold text-ink" style="font-family:'Playfair Display',serif">Checking…</div><div class="text-sm text-muted mt-1">Confirming this month’s payments</div>`;
    return;
  }
  const today=new Date();
  const currentMonth=today.toLocaleString('en-ZA',{month:'long',year:'numeric'});
  const status=calculateTenantRentStatus(tenant);
  if(!el) return;
  el.className='tenant-section-card';
  const rentAmt=Number(status.amountDue!=null?status.amountDue:tenant.rent||0);
  const duePretty=status.dueDate
    ? (status.dueDate instanceof Date
      ? status.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})
      : String(status.dueDate))
    : '';
  if(status.status==='upcoming'){
    el.innerHTML=`
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(61,107,138,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">📅</div>
    <div style="flex:1">
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:#2d5a7a">${status.label||'UPCOMING'}</div>
      <div style="color:var(--muted);font-size:0.9rem">${rentAmt?('R'+rentAmt.toLocaleString('en-ZA')):'Rent'} ${duePretty?(' · Due: '+duePretty):''}</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:4px">${status.message}</div>
    </div>
  </div>`;
    return;
  }
  if(status.status==='paid'){
    el.innerHTML=`
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(90,122,96,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">✅</div>
    <div style="flex:1">
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--sage)">PAID</div>
      <div style="color:var(--muted);font-size:0.9rem">${currentMonth} · R${Number(tenant.rent||0).toLocaleString('en-ZA')}</div>
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
      <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--gold)">${status.label||'RENT DUE'}</div>
      <div style="color:var(--muted);font-size:0.9rem">${currentMonth} · R${rentAmt.toLocaleString('en-ZA')}</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:4px">${status.message}</div>
    </div>
    <button class="btn-primary" style="min-width:140px" onclick="nestiqShowPayConfirmModal()">Pay Rent</button>
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
    <button class="btn-primary" style="min-width:160px;background:var(--rust);border-color:var(--rust)" onclick="nestiqShowPayConfirmModal()">Pay now</button>
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
  if(status.status==='upcoming'){
    const amt=Number(status.amountDue!=null?status.amountDue:tenant.rent||0);
    const duePretty=status.dueDate
      ? (status.dueDate instanceof Date
        ? status.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})
        : formatDate(status.dueDate))
      : '';
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-ink" style="color:#2d5a7a;font-family:'Playfair Display',serif">📅 ${status.label||'UPCOMING'}</div><div class="text-sm text-muted mt-1">${amt?formatCurrency(amt):''}${duePretty? ' · Due: '+duePretty:''}</div><div class="text-sm text-muted mt-1">${status.message}</div>`;
    return;
  }
  if(status.status==='paid'){
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-ink" style="color:var(--sage);font-family:'Playfair Display',serif">✓ ${t('portal.paid')}</div><div class="text-sm text-muted mt-1">${status.payment.month||new Date(status.payment.date).toLocaleDateString('en-ZA',{month:'long',year:'numeric'})} · ${formatCurrency(status.payment.amount)}</div><div class="text-sm text-muted mt-1">Paid on ${formatDate(status.payment.date)} via ${status.payment.method||'EFT'} · ${status.payment.receiptNo||''}</div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn-outline btn-sm" onclick="printReceiptById(${status.payment.id||0})">${t('common.download')}</button><button class="btn-outline btn-sm" onclick="scrollToTenantCard('tenantPaymentHistory')">${t('portal.paymentHistory')}</button></div>`;
  }else if(status.status==='due'){
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-gold" style="font-family:'Playfair Display',serif">⏰ ${status.label||t('portal.due')}</div><div class="text-sm text-muted mt-1">${formatCurrency(status.amountDue||tenant.rent||0)}${status.dueDate? ' due on '+(status.dueDate instanceof Date?status.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}):formatDate(status.dueDate)):''}</div><div class="text-sm text-muted mt-1">${status.message||t('portal.daysRemaining',{days:status.days||0})}</div><button class="btn-primary" style="width:100%;justify-content:center;margin-top:10px" onclick="nestiqShowPayConfirmModal()">Pay Rent</button>`;
  }else{
    const fee=typeof window.calculateLateFee==='function'?calculateLateFee(tenant,new Date()):0;
    const rentAmt=Number(status.amountDue||tenant.rent||0);
    const total=rentAmt+fee;
    const feeBlock=fee>0
      ?`<div style="font-size:0.86rem;color:var(--rust);margin-top:8px;line-height:1.45">
          <div><strong>Late fee: ${formatCurrency(fee)}</strong></div>
          <div><strong>Total amount owed: ${formatCurrency(total)}</strong></div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:4px">(Including ${formatCurrency(rentAmt)} rent + ${formatCurrency(fee)} late fee)</div>
        </div>`
      :`<div style="font-size:0.82rem;color:var(--muted)">Late fee may apply as per your landlord's policy.</div>`;
    card.innerHTML=`<div class="portal-card-title text-sm text-muted mt-1">${t('portal.rentStatus')}</div><div class="text-2xl font-bold text-ink" style="color:var(--rust);font-family:'Playfair Display',serif">⚠ ${t('portal.overdue')}</div><div class="text-sm text-muted mt-1">${t('portal.daysOverdue',{days:status.days})} · ${formatCurrency(tenant.rent||0)}</div>${feeBlock}<button class="btn-primary" style="width:100%;justify-content:center;margin-top:10px;background:var(--rust);border-color:var(--rust)" onclick="nestiqShowPayConfirmModal()">${t('portal.payNow')}</button>`;
  }
}

function openTenantPayModal(){
  nestiqShowPayConfirmModal();
}
function confirmTenantPayment(){
  return nestiqTenantPayWithPayFast();
}
window.openTenantPayModal=openTenantPayModal;
window.confirmTenantPayment=confirmTenantPayment;

function nestiqTenantPaySession(){
  const sess=window.nestiqTenantSession||{};
  const cur=window.currentUser||{};
  const boot=typeof currentSession==='function'?currentSession():{};
  return {
    landlordId:String(sess.landlordId||cur.landlordId||boot.landlordId||''),
    tenantId:String(sess.tenantId||cur.tenantDocId||boot.tenantDocId||boot.userId||'')
  };
}

function nestiqTenantForPay(){
  const {tenantId}=nestiqTenantPaySession();
  const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  return window.currentTenantData
    || list.find(t=>String(t.id)===String(tenantId))
    || {};
}

function nestiqGetFirebaseProjectId(){
  try{
    return firebase.app().options.projectId
      || window.NESTIQ_FIREBASE_CONFIG?.projectId
      || 'nestiq-pro';
  }catch(_e){
    return window.NESTIQ_FIREBASE_CONFIG?.projectId||'nestiq-pro';
  }
}
window.nestiqGetFirebaseProjectId=nestiqGetFirebaseProjectId;

function nestiqShowPayConfirmModal(){
  if(typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()==='awaiting_payment'){
    nestiqShowMoveInPaymentModal();
    return;
  }
  if(typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()!=='active'){
    nestiqShowNotif('Rent is only available after your lease is signed and you become an active tenant.','info');
    return;
  }
  const session=window.nestiqTenantSession||nestiqTenantPaySession();
  const tenant=nestiqTenantForPay();
  const rentSt=typeof calculateTenantRentStatus==='function'?calculateTenantRentStatus(tenant):null;
  if(rentSt?.status==='paid'){
    nestiqShowNotif(rentSt.message||'Your rent is already paid this month.','info');
    return;
  }
  if(rentSt?.status==='upcoming' || rentSt?.payable===false){
    nestiqShowNotif(rentSt.message||'Nothing is due yet. Rent follows your signed lease.','info');
    return;
  }
  const monthly=typeof window.nestiqTenantMonthlyRent==='function'
    ? Number(window.nestiqTenantMonthlyRent(tenant))
    : Number(tenant.rent||0);
  const lateFee=(rentSt?.status==='overdue' && typeof window.calculateLateFee==='function')
    ? Number(window.calculateLateFee(tenant, new Date())||0)
    : 0;
  const amount=Math.max(0, (Number.isFinite(monthly)&&monthly>0?monthly:Number(rentSt?.amountDue||0)) + (Number.isFinite(lateFee)?lateFee:0));
  const month=new Date().toLocaleString('en-ZA',{ month:'long', year:'numeric' });
  if(!amount||amount<=0){
    nestiqShowNotif('Rent amount not configured. Contact your landlord.','warning');
    return;
  }
  if(typeof nestiqShowInAppPaymentModal!=='function'){
    nestiqShowNotif('Payment form failed to load. Refresh and try again.','error');
    return;
  }

  const lineItems=[{ label:'Monthly rent — '+month, value:'R'+Number(monthly||0).toLocaleString('en-ZA') }];
  if(lateFee>0) lineItems.push({ label:'Late fee', value:'R'+Number(lateFee).toLocaleString('en-ZA') });
  if(tenant.property) lineItems.push({ label:'Property', value:String(tenant.property)+(tenant.unit?(' · '+tenant.unit):'') });

  nestiqShowInAppPaymentModal({
    amount,
    title:'Pay rent',
    description:`Rent — ${tenant.property||''} — ${month}`,
    lineItems,
    onDownloadReceipt:function(){
      const p=tenant._nqLastInAppPayment;
      if(!p){ nestiqShowNotif('Receipt is not ready yet','warning'); return; }
      if(typeof generateReceiptPDF==='function') generateReceiptPDF(tenant,p);
      else nestiqShowNotif('Receipt is not available','warning');
    },
    onSuccess:function(ref){
      const now=new Date();
      const dateIso=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
      const receiptNo=(typeof genReceiptNo==='function'?genReceiptNo(dateIso):('REC-'+now.getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000)));
      let tenantUid='';
      try{ tenantUid=String(firebase.auth().currentUser?.uid||session.uid||tenant.portalUid||''); }catch(_e){}
      const payment={
        id:Date.now(),
        amount,
        date:dateIso,
        method:'In-App Payment',
        reference:ref,
        receiptNo,
        month,
        status:'paid',
        paymentType:'rent',
        tenantId:String(session.tenantId||tenant.id||''),
        tenantUid:tenantUid||undefined,
        source:'tenant-portal'
      };
      tenant._nqLastInAppPayment=payment;
      const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
      const idx=list.findIndex(t=>String(t.id)===String(tenant.id||session.tenantId));
      if(idx!==-1){
        list[idx].status='paid';
        list[idx].payments=Array.isArray(list[idx].payments)?list[idx].payments.slice():[];
        list[idx].payments.unshift(payment);
      }
      tenant.status='paid';
      tenant.payments=Array.isArray(tenant.payments)?tenant.payments.slice():[];
      if(!tenant.payments.some(p=>String(p.receiptNo)===String(receiptNo))) tenant.payments.unshift(payment);
      if(!Array.isArray(window.tenantPayments)) window.tenantPayments=[];
      if(!window.tenantPayments.some(p=>String(p.receiptNo)===String(receiptNo))) window.tenantPayments.unshift(payment);
      if(window.currentTenantData){
        window.currentTenantData.status='paid';
        window.currentTenantData.payments=tenant.payments;
        window.currentTenantData._nqLastInAppPayment=payment;
      }

      const landlordId=String(session.landlordId||'');
      const tenantId=String(session.tenantId||tenant.id||'');

      if(window.nestiqDb && landlordId && tenantId && landlordId!=='demo-landlord'){
        const tref=window.nestiqFs?.tenants?.(window.nestiqDb, landlordId)?.doc(tenantId)
          || window.nestiqDb.collection('landlords').doc(landlordId).collection('tenants').doc(tenantId);
        tref.set({
          lastPaymentDate:dateIso,
          daysOverdue:0
        },{ merge:true }).catch(e=>console.warn('[NestIQ] Payment update error:', e));

        const pref=window.nestiqFs?.payments?.(window.nestiqDb, landlordId)
          || window.nestiqDb.collection('landlords').doc(landlordId).collection('payments');
        pref.add({
          tenantId,
          tenantName:tenant.name,
          tenantUid:tenantUid||undefined,
          amount,
          month,
          method:'In-App Payment',
          reference:ref,
          receiptNo,
          status:'paid',
          paidAt:now.toISOString(),
          date:dateIso,
          source:'tenant-portal',
          paymentType:'rent'
        }).catch(e=>console.warn('[NestIQ] Payment record error:', e));
      }

      nestiqShowNotif('Rent payment recorded — '+receiptNo,'success',5000);
      window._nqPayAfterClose=function(){
        try{ window.nestiqTenantRefreshVisibleSections?.(); }catch(_e){}
        renderTenantHomeStatusBanner?.();
        renderRentStatusCard?.();
        renderPaymentHistoryCard?.();
        renderGettingStartedTenant?.();
        if(typeof nestiqSwitchTenantTab==='function') nestiqSwitchTenantTab('payments');
      };
    }
  });
}
window.nestiqShowPayConfirmModal=nestiqShowPayConfirmModal;

function nestiqShowMoveInPaymentModal(){
  const session=window.nestiqTenantSession||(typeof nestiqTenantPaySession==='function'?nestiqTenantPaySession():null);
  const tenant=window.currentTenantData||(typeof nestiqTenantForPay==='function'?nestiqTenantForPay():null);
  if(!tenant){
    nestiqShowNotif('Tenant session missing','error');
    return;
  }
  const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(tenant.id)
    : null;
  if(!lease){
    nestiqShowNotif('Lease not found','error');
    return;
  }
  const due=typeof window.nestiqLeaseInitialDue==='function'
    ? window.nestiqLeaseInitialDue(lease, tenant)
    : { total:0, depositDue:0, rentDue:0 };
  if(!due.total){
    if(typeof window.nestiqTryActivateLeaseAfterMoney==='function'){
      window.nestiqTryActivateLeaseAfterMoney(lease).then(()=>{
        nestiqShowNotif('No move-in amount due — tenancy is active','success');
        try{ window.renderTenantDashboard?.(); }catch(_e){}
      }).catch(()=>{});
    }
    return;
  }
  if(typeof nestiqShowInAppPaymentModal!=='function'){
    nestiqShowNotif('Payment form failed to load. Refresh and try again.','error');
    return;
  }
  const lineItems=[];
  if(due.depositDue) lineItems.push({ label:'Security deposit', value:'R'+Number(due.depositDue).toLocaleString('en-ZA') });
  if(due.rentDue) lineItems.push({ label:'First month rent', value:'R'+Number(due.rentDue).toLocaleString('en-ZA') });
  if(tenant.property) lineItems.push({ label:'Property', value:String(tenant.property)+(tenant.unit?(' · '+tenant.unit):'') });
  nestiqShowInAppPaymentModal({
    amount:due.total,
    kind:'movein',
    title:'Complete move-in',
    description:'Confirm this amount to occupy the unit. Recurring rent then follows your lease due day.',
    lineItems,
    successHeading:'Move-in confirmed',
    successCopy:'Your payment has been recorded. Occupancy is activating and your tenant tools will unlock.',
    onDownloadReceipt:function(){
      const p=tenant._nqLastInAppPayment;
      if(!p){ nestiqShowNotif('Receipt is not ready yet','warning'); return; }
      if(typeof generateReceiptPDF==='function') generateReceiptPDF(tenant,p);
      else nestiqShowNotif('Receipt is not available','warning');
    },
    onSuccess:function(ref){
      const dateIso=due.rentDue && lease.leaseStart
        ? String(lease.leaseStart).slice(0,10)
        : new Date().toISOString().slice(0,10);
      const receiptNo=(typeof genReceiptNo==='function'?genReceiptNo(dateIso):('REC-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000)));
      const month=new Date((dateIso||'')+'T12:00:00').toLocaleString('en-ZA',{ month:'long', year:'numeric' });
      const paymentType=due.depositDue && due.rentDue ? 'move_in' : (due.depositDue ? 'deposit' : 'rent');
      const payment={
        id:Date.now(),
        amount:due.total,
        date:dateIso,
        method:'In-App Payment',
        reference:ref,
        receiptNo,
        month,
        status:'paid',
        paymentType,
        coversDeposit:due.depositDue>0,
        coversFirstRent:due.rentDue>0
      };
      tenant._nqLastInAppPayment=payment;
      if(due.depositDue>0){
        if(typeof nestiqEnsureTenantDeposit==='function') nestiqEnsureTenantDeposit(tenant);
        else if(!tenant.deposit||typeof tenant.deposit!=='object') tenant.deposit={ amount:due.depositDue };
        tenant.deposit.amount=Number(tenant.deposit.amount||due.depositDue)||due.depositDue;
        tenant.deposit.collected=true;
        tenant.deposit.collectedDate=dateIso;
        tenant.deposit.collectedMethod='In-App Payment';
        tenant.deposit.status='held';
        tenant.depositCollected=true;
      }
      const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
      const idx=list.findIndex(t=>String(t.id)===String(tenant.id||session?.tenantId));
      if(idx!==-1){
        list[idx].payments=Array.isArray(list[idx].payments)?list[idx].payments.slice():[];
        list[idx].payments.unshift(payment);
        if(due.depositDue>0){
          list[idx].deposit=tenant.deposit;
          list[idx].depositCollected=true;
        }
      }
      tenant.payments=Array.isArray(tenant.payments)?tenant.payments.slice():[];
      if(!tenant.payments.some(p=>String(p.receiptNo)===String(receiptNo))) tenant.payments.unshift(payment);
      if(Array.isArray(window.tenantPayments) && !window.tenantPayments.some(p=>String(p.receiptNo)===String(receiptNo))){
        window.tenantPayments.unshift(payment);
      }
      if(window.currentTenantData){
        window.currentTenantData.payments=tenant.payments;
        window.currentTenantData._nqLastInAppPayment=payment;
        if(due.depositDue>0){
          window.currentTenantData.deposit=tenant.deposit;
          window.currentTenantData.depositCollected=true;
        }
      }

      const landlordId=String(session?.landlordId||lease.landlordId||'');
      const tenantId=String(session?.tenantId||tenant.id||'');
      let tenantUid='';
      try{ tenantUid=String(firebase.auth().currentUser?.uid||session?.uid||tenant.portalUid||''); }catch(_e){}

      if(window.nestiqDb && landlordId && tenantId && landlordId!=='demo-landlord'){
        const tref=window.nestiqFs?.tenants?.(window.nestiqDb, landlordId)?.doc(tenantId)
          || window.nestiqDb.collection('landlords').doc(landlordId).collection('tenants').doc(tenantId);
        const tenantPatch={
          lastPaymentDate:dateIso
        };
        if(due.depositDue>0){
          tenantPatch.depositCollected=true;
          tenantPatch.depositAmount=Number(tenant.deposit?.amount||due.depositDue)||due.depositDue;
          tenantPatch.deposit={
            amount:Number(tenant.deposit?.amount||due.depositDue)||due.depositDue,
            collected:true,
            collectedDate:dateIso,
            collectedMethod:'In-App Payment',
            status:'held'
          };
        }
        tref.set(tenantPatch,{ merge:true }).catch(e=>console.warn('[NestIQ] Move-in tenant update:', e));

        const pref=window.nestiqFs?.payments?.(window.nestiqDb, landlordId)
          || window.nestiqDb.collection('landlords').doc(landlordId).collection('payments');
        pref.add({
          tenantId,
          tenantName:tenant.name,
          tenantUid:tenantUid||undefined,
          amount:due.total,
          month,
          method:'In-App Payment',
          reference:ref,
          receiptNo,
          status:'paid',
          paidAt:new Date().toISOString(),
          date:dateIso,
          source:'tenant-portal-move-in',
          paymentType,
          coversDeposit:due.depositDue>0,
          coversFirstRent:due.rentDue>0
        }).catch(e=>console.warn('[NestIQ] Move-in payment record:', e));
      }

      nestiqShowNotif('Move-in payment recorded — '+receiptNo,'success',5000);
      window._nqPayAfterClose=function(){
        if(typeof window.nestiqTryActivateLeaseAfterMoney==='function'){
          window.nestiqTryActivateLeaseAfterMoney(lease).then(()=>{
            try{ window.nestiqApplyTenantPortalChrome?.(); }catch(_e){}
            try{ window.renderTenantDashboard?.(); }catch(_e){}
          }).catch(()=>{
            try{ window.renderTenantDashboard?.(); }catch(_e2){}
          });
        }else{
          try{ window.renderTenantDashboard?.(); }catch(_e){}
        }
      };
    }
  });
}
window.nestiqShowMoveInPaymentModal=nestiqShowMoveInPaymentModal;

function nestiqTenantPayWithPayFast(){
  // Legacy entry point — in-app payment wizard (no external PayFast redirect)
  nestiqShowPayConfirmModal();
}
window.nestiqTenantPayWithPayFast=nestiqTenantPayWithPayFast;


function nestiqCheckPayFastReturn(){
  const params=new URLSearchParams(window.location.search);
  let payment=params.get('payment');
  let ref=params.get('ref');
  let tenantId=params.get('tid');
  let landlordId=params.get('lid');
  const kind=params.get('kind');
  let stored=null;
  try{ stored=JSON.parse(sessionStorage.getItem('nestiq-rent-pay-return')||'null'); }catch(_e){}

  const isRent=kind==='rent'
    || String(ref||'').indexOf('RENT-')===0
    || (stored && String(stored.ref||'').indexOf('RENT-')===0);
  if(!payment && stored && (stored.payment==='success'||stored.payment==='cancelled')) payment=stored.payment;
  if(!payment) return;
  if(!isRent && String(ref||(stored&&stored.ref)||'').indexOf('RENT-')!==0) return;

  if(!ref && stored) ref=stored.ref;
  if(!tenantId && stored) tenantId=stored.tid;
  if(!landlordId && stored) landlordId=stored.lid;
  const sess=nestiqTenantPaySession();
  if(!tenantId) tenantId=sess.tenantId;
  if(!landlordId) landlordId=sess.landlordId;

  if(typeof window.nestiqClearPaymentQueryParam==='function') window.nestiqClearPaymentQueryParam();
  else{
    try{ history.replaceState({}, '', window.location.pathname+(window.location.hash||'#tenant-dashboard')); }catch(_e){}
  }

  if(payment==='success' && ref){
    setTimeout(()=>{
      nestiqShowNotif('🎉 Payment submitted! Your rent status will update shortly.','success',7000);
      if(typeof nestiqConfetti==='function'){
        nestiqConfetti({ count:90, spread:70, origin:{ y:0.65 } });
      }
    },800);

    if(window.nestiqDb && landlordId && tenantId && landlordId!=='demo-landlord'){
      let attempts=0;
      const maxAttempts=20;
      const poll=setInterval(async ()=>{
        attempts++;
        try{
          const tref=window.nestiqFs?.tenants?.(window.nestiqDb, landlordId)?.doc(String(tenantId))
            || window.nestiqDb.collection('landlords').doc(landlordId).collection('tenants').doc(String(tenantId));
          const doc=await tref.get();
          if(doc.exists && String(doc.data()?.status||'').toLowerCase()==='paid'){
            clearInterval(poll);
            try{ sessionStorage.removeItem('nestiq-rent-pay-return'); }catch(_e){}
            const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
            const idx=list.findIndex(t=>String(t.id)===String(tenantId));
            if(idx!==-1) list[idx].status='paid';
            if(window.currentTenantData && String(window.currentTenantData.id)===String(tenantId)){
              window.currentTenantData.status='paid';
            }
            if(typeof nestiqSwitchTenantTab==='function') nestiqSwitchTenantTab('payments');
            renderRentStatusCard?.();
            renderPaymentHistoryCard?.();
            nestiqShowNotif('✅ Rent marked as paid. Thank you!','success',5000);
          }
        }catch(e){
          console.warn('[NestIQ] Poll error:', e);
        }
        if(attempts>=maxAttempts){
          clearInterval(poll);
          nestiqShowNotif('Payment received. Status will update automatically.','info',5000);
        }
      },3000);
    }else{
      setTimeout(()=>{
        const tid=tenantId||window.nestiqTenantSession?.tenantId;
        const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
        const t=list.find(x=>String(x.id)===String(tid))||window.currentTenantData;
        if(t) t.status='paid';
        if(window.currentTenantData) window.currentTenantData.status='paid';
        try{ sessionStorage.removeItem('nestiq-rent-pay-return'); }catch(_e){}
        if(typeof nestiqSwitchTenantTab==='function') nestiqSwitchTenantTab('home');
        renderRentStatusCard?.();
        nestiqShowNotif('✅ Payment complete! Rent status updated.','success',5000);
      },1500);
    }
  }

  if(payment==='cancelled'){
    try{ sessionStorage.removeItem('nestiq-rent-pay-return'); }catch(_e){}
    setTimeout(()=>{
      nestiqShowNotif('Payment was cancelled. Your rent status has not changed.','warning',5000);
    },500);
  }
}
window.nestiqCheckPayFastReturn=nestiqCheckPayFastReturn;

(function nestiqCapturePayFastRentReturn(){
  try{
    const params=new URLSearchParams(window.location.search);
    const payment=params.get('payment');
    const kind=params.get('kind');
    const ref=params.get('ref');
    const tid=params.get('tid');
    const lid=params.get('lid');
    if((kind==='rent' || String(ref||'').indexOf('RENT-')===0) && (payment==='success'||payment==='cancelled')){
      sessionStorage.setItem('nestiq-rent-pay-return', JSON.stringify({
        payment, ref, tid, lid, at:Date.now()
      }));
    }
  }catch(_e){}
})();

function nestiqPayEsc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}
function nestiqPayMaskAcc(n){
  const d=String(n||'').replace(/\D/g,'');
  if(!d) return '—';
  if(d.length<5) return d;
  return '•••• '+d.slice(-4);
}
function nestiqLandlordPayee(){
  const info=window.landlordInfo||{};
  const ls=info.landlordSettings||{};
  const po=(ls.portal&&typeof ls.portal==='object'?ls.portal:null)||info.portal||{};
  const seed=String(window.nestiqTenantSession?.landlordId||info.name||'nestiq');
  let h=2166136261;
  for(let i=0;i<seed.length;i++) h=Math.imul(h^seed.charCodeAt(i),16777619);
  const fallbackAcc=String(1000000000+Math.abs(h)%8999999999).slice(0,10);
  return {
    name:String(info.name||ls.name||'Your landlord'),
    bank:String(po.bankName||ls.bankName||info.bankName||'Standard Bank'),
    account:String(po.accountNumber||ls.accountNumber||info.accountNumber||fallbackAcc).replace(/\s/g,''),
    branch:String(po.branchCode||ls.branchCode||info.branchCode||'051001').replace(/\s/g,''),
    type:String(po.accountType||ls.accountType||info.accountType||'Cheque')
  };
}
function nestiqPayRefFor(tenant){
  const now=new Date();
  const month=now.toLocaleString('en-ZA',{month:'short'}).toUpperCase();
  const name=String(tenant?.name||'TENANT').replace(/[^A-Za-z]/g,'').slice(0,10).toUpperCase()||'TENANT';
  return name+'-'+month+now.getFullYear();
}

function openPayRentModal(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const payee=nestiqLandlordPayee();
  const saved=tenant.payerBank&&typeof tenant.payerBank==='object'?tenant.payerBank:{};
  window.__nestiqPayDraft={
    amount:Number(tenant.rent||0),
    date:new Date().toISOString().slice(0,10),
    reference:nestiqPayRefFor(tenant),
    holder:saved.holder||tenant.name||'',
    bank:saved.bank||'Capitec',
    account:saved.accountNumber||'',
    branch:saved.branchCode||'',
    type:saved.accountType||'Cheque'
  };
  nestiqRenderPayStep(1);
  nestiqOpenModalAnimated();
}
window.openPayRentModal=openPayRentModal;

function nestiqPayReadStep2(){
  const d=window.__nestiqPayDraft||{};
  d.holder=document.getElementById('nestiqPayHolder')?.value.trim()||d.holder;
  d.bank=document.getElementById('nestiqPayBank')?.value||d.bank;
  d.account=String(document.getElementById('nestiqPayAccount')?.value||d.account||'').replace(/\D/g,'');
  d.branch=String(document.getElementById('nestiqPayBranch')?.value||d.branch||'').replace(/\D/g,'');
  d.type=document.getElementById('nestiqPayAccType')?.value||d.type;
  window.__nestiqPayDraft=d;
  return d;
}

function nestiqPayGo(step){
  if(step===3){
    const d=nestiqPayReadStep2();
    if(!d.holder||d.holder.length<2){ nestiqShowNotif('Enter the account holder name','warning'); return; }
    if(!d.account||d.account.length<8){ nestiqShowNotif('Enter a valid account number (8–12 digits)','warning'); return; }
    if(d.branch&&d.branch.length!==6){ nestiqShowNotif('Branch code must be 6 digits','warning'); return; }
  }
  nestiqRenderPayStep(step);
}
window.nestiqPayGo=nestiqPayGo;

function nestiqRenderPayStep(step){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const box=document.getElementById('modalContent');
  if(!box) return;
  const payee=nestiqLandlordPayee();
  const d=window.__nestiqPayDraft||{};
  const amt='R'+Number(d.amount||tenant.rent||0).toLocaleString('en-ZA');
  const banks=['Capitec','FNB','Standard Bank','Absa','Nedbank','TymeBank','Discovery Bank','African Bank','Other'];
  const dots=[1,2,3].map(n=>`<span class="nestiq-pay-dot${n===step?' is-on':''}${n<step?' is-done':''}">${n}</span>`).join('<span class="nestiq-pay-dot-line"></span>');
  let body='';
  if(step===1){
    body=`
      <div class="nestiq-pay-hero">
        <div class="nestiq-pay-hero-lbl">Amount to pay</div>
        <div class="nestiq-pay-hero-amt">${amt}</div>
        <div class="nestiq-pay-hero-sub">${nestiqPayEsc(tenant.property||'')} · ${nestiqPayEsc(tenant.unit||'')} · Due on the ${typeof window.nestiqOrdinalDay==='function'?window.nestiqOrdinalDay(tenant.monthlyDueDate||1):(tenant.monthlyDueDate||1)+'th'}</div>
      </div>
      <div class="nestiq-pay-payee">
        <div class="nestiq-pay-payee-k">Paying to</div>
        <div class="nestiq-pay-payee-name">${nestiqPayEsc(payee.name)}</div>
        <div class="nestiq-pay-row"><span>Bank</span><strong>${nestiqPayEsc(payee.bank)}</strong></div>
        <div class="nestiq-pay-row"><span>Account</span><strong>${nestiqPayEsc(nestiqPayMaskAcc(payee.account))}</strong></div>
        <div class="nestiq-pay-row"><span>Branch</span><strong>${nestiqPayEsc(payee.branch)}</strong></div>
        <div class="nestiq-pay-row"><span>Type</span><strong>${nestiqPayEsc(payee.type)}</strong></div>
        <div class="nestiq-pay-row"><span>Reference</span><strong>${nestiqPayEsc(d.reference)}</strong></div>
      </div>
      <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:16px" onclick="nestiqPayGo(2)">Continue</button>`;
  }else if(step===2){
    body=`
      <p class="nestiq-pay-lead">Pay from your account to your landlord’s account in one Instant EFT.</p>
      <div class="form-group"><label>Account holder</label>
        <input class="form-input" id="nestiqPayHolder" value="${nestiqPayEsc(d.holder)}" autocomplete="name"></div>
      <div class="form-group" style="margin-top:10px"><label>Bank</label>
        <select class="form-input" id="nestiqPayBank">${banks.map(b=>`<option value="${nestiqPayEsc(b)}"${d.bank===b?' selected':''}>${nestiqPayEsc(b)}</option>`).join('')}</select></div>
      <div class="form-group" style="margin-top:10px"><label>Account number</label>
        <input class="form-input" id="nestiqPayAccount" inputmode="numeric" maxlength="12" value="${nestiqPayEsc(d.account)}" placeholder="e.g. 1234567890"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <div class="form-group"><label>Branch code</label>
          <input class="form-input" id="nestiqPayBranch" inputmode="numeric" maxlength="6" value="${nestiqPayEsc(d.branch)}" placeholder="051001"></div>
        <div class="form-group"><label>Account type</label>
          <select class="form-input" id="nestiqPayAccType">
            <option value="Cheque"${d.type!=='Savings'?' selected':''}>Cheque</option>
            <option value="Savings"${d.type==='Savings'?' selected':''}>Savings</option>
          </select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button type="button" class="btn-outline" style="flex:1;justify-content:center" onclick="nestiqPayGo(1)">Back</button>
        <button type="button" class="btn-primary" style="flex:1;justify-content:center" onclick="nestiqPayGo(3)">Review</button>
      </div>`;
  }else if(step===3){
    body=`
      <div class="nestiq-pay-payee">
        <div class="nestiq-pay-payee-k">Confirm Instant EFT</div>
        <div class="nestiq-pay-row"><span>From</span><strong>${nestiqPayEsc(d.holder)} · ${nestiqPayEsc(d.bank)} ${nestiqPayEsc(nestiqPayMaskAcc(d.account))}</strong></div>
        <div class="nestiq-pay-row"><span>To</span><strong>${nestiqPayEsc(payee.name)} · ${nestiqPayEsc(payee.bank)}</strong></div>
        <div class="nestiq-pay-row"><span>Amount</span><strong style="color:var(--gold)">${amt}</strong></div>
        <div class="nestiq-pay-row"><span>Reference</span><strong>${nestiqPayEsc(d.reference)}</strong></div>
      </div>
      <label class="nestiq-pay-auth">
        <input type="checkbox" id="nestiqPayAuth">
        <span>I authorise this transfer of ${amt} to ${nestiqPayEsc(payee.name)}.</span>
      </label>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button type="button" class="btn-outline" style="flex:1;justify-content:center" onclick="nestiqPayGo(2)">Back</button>
        <button type="button" class="btn-primary" style="flex:1;justify-content:center" onclick="nestiqPaySubmit()">Pay ${amt}</button>
      </div>`;
  }else if(step===4){
    body=`
      <div class="nestiq-pay-process" id="nestiqPayProcess">
        <div class="nestiq-pay-spin"></div>
        <div class="nestiq-pay-process-title" id="nestiqPayProcessTitle">Connecting to your bank…</div>
        <div class="nestiq-pay-process-sub" id="nestiqPayProcessSub">Do not close this window.</div>
      </div>`;
  }
  box.innerHTML=`
    <h2 class="modal-title">Pay rent</h2>
    <p class="modal-sub">Instant EFT to your landlord</p>
    <div class="nestiq-pay-steps">${dots}</div>
    ${body}`;
}

async function nestiqPaySubmit(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  nestiqPayReadStep2();
  const d=window.__nestiqPayDraft||{};
  const auth=document.getElementById('nestiqPayAuth');
  if(auth&&!auth.checked){ nestiqShowNotif('Tick the box to authorise the transfer','warning'); return; }
  if(!d.account||d.account.length<8){ nestiqPayGo(2); nestiqShowNotif('Enter your account number','warning'); return; }
  nestiqRenderPayStep(4);
  const stages=[
    [0,'Connecting to your bank…','Secure session starting'],
    [700,'Verifying account…',nestiqPayMaskAcc(d.account)],
    [1500,'Transferring R'+Number(d.amount||0).toLocaleString('en-ZA')+'…','To '+nestiqLandlordPayee().name],
    [2400,'Payment successful','Updating your rent status']
  ];
  stages.forEach(([ms,title,sub])=>{
    setTimeout(()=>{
      const tEl=document.getElementById('nestiqPayProcessTitle');
      const sEl=document.getElementById('nestiqPayProcessSub');
      if(tEl) tEl.textContent=title;
      if(sEl) sEl.textContent=sub;
    },ms);
  });
  await new Promise(r=>setTimeout(r,2800));
  await submitTenantPayment();
}
window.nestiqPaySubmit=nestiqPaySubmit;

async function submitTenantPayment(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const d=window.__nestiqPayDraft||{};
  const method=d.bank?('Instant EFT · '+d.bank):'Instant EFT';
  const date=d.date||new Date().toISOString().slice(0,10);
  const reference=d.reference||nestiqPayRefFor(tenant);
  const db=window.nestiqDb;
  const u=window.currentUser;
  if(!db||!u) return;
  try{
    const receiptNo='REC-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000);
    const ts=window.nestiqTenantSession||{};
    const lid=String(ts.landlordId||u.landlordId||'');
    const tid=String(ts.tenantId||u.tenantDocId||tenant.id||'');
    const tenantUid=firebase.auth().currentUser?.uid||'';
    const payee=nestiqLandlordPayee();
    const payerBank={
      holder:String(d.holder||tenant.name||''),
      bank:String(d.bank||''),
      accountNumber:String(d.account||''),
      accountLast4:String(d.account||'').slice(-4),
      branchCode:String(d.branch||''),
      accountType:String(d.type||'Cheque')
    };
    await window.nestiqFs.payments(db, lid).add({
      tenantId:tid,
      tenantUid,
      landlordId:lid,
      propertyId:tenant.propertyId||'',
      amount:Number(d.amount||tenant.rent||0),
      date,
      method,
      reference,
      receiptNo,
      month:new Date().toLocaleString('en-ZA',{month:'long',year:'numeric'}),
      status:'paid',
      recordedBy:'tenant',
      payerBank:{ ...payerBank, accountNumber:payerBank.accountLast4?('••••'+payerBank.accountLast4):'' },
      payee:{ name:payee.name, bank:payee.bank, accountLast4:String(payee.account).slice(-4) },
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    try{
      await window.nestiqFs.tenants(db, lid).doc(tid).update({
        status:'paid',
        lastPaymentDate:date,
        payerBank
      });
    }catch(_e){
      await window.nestiqFs.tenants(db, lid).doc(tid).update({
        status:'paid',
        lastPaymentDate:date
      });
    }
    if(window.currentTenantData) window.currentTenantData.payerBank=payerBank;
    nestiqCloseModalAnimated();
    nestiqShowNotif('Rent paid — '+receiptNo,'success');
    window.renderRentStatusCard?.();
    window.renderPaymentHistoryCard?.();
    nestiqTenantRefreshVisibleSections?.();
  }catch(error){
    nestiqShowNotif('Payment could not be completed','error');
    console.error('Tenant payment error:',error);
  }
}
window.submitTenantPayment=submitTenantPayment;

function renderTenantLeaseCard(tenant){
  const card=document.getElementById('tenantLeaseCard'); if(!card) return;
  const t=tenant||window.currentTenantData;
  const lease=t&&typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(t.id)
    : null;
  const statusRaw=lease?(lease.storedStatus||lease.status):(t?.leaseStatus||'');
  const statusLabel=typeof window.nestiqLeaseStatusLabel==='function'
    ? window.nestiqLeaseStatusLabel(statusRaw||'active')
    : (statusRaw||'Active');
  const pending=lease && (lease.storedStatus==='pending_signature'||lease.status==='pending_signature');
  const draft=lease && (lease.storedStatus==='draft'||lease.status==='draft');
  const canSign=pending && !!lease.landlordSigned && !lease.tenantSigned;
  const leaseIdJs=lease?JSON.stringify(String(lease.id)):'';
  card.innerHTML=`
    <div class="tenant-section-title">My lease</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span class="badge ${pending?'badge-amber':draft?'badge-gold':(statusRaw==='active'||!statusRaw)?'badge-green':'badge-red'}" id="tenantLeaseStatusBadge">${String(statusLabel).replace(/</g,'&lt;')}</span>
    </div>
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
    <div id="tenantLeaseActions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"></div>
  `;
  const actions=document.getElementById('tenantLeaseActions');
  if(actions && lease){
    const bits=[];
    if(draft || (lease && !lease.landlordSigned)){
      bits.push('<span style="font-size:0.82rem;color:var(--muted)">The landlord signs first. You will be asked to review and sign here after they send the lease.</span>');
    }else{
      bits.push(`<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenLeasePdf(${leaseIdJs},{preview:true})'>View Agreement</button>`);
      bits.push(`<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenLeasePdf(${leaseIdJs},{download:true})'>Download PDF</button>`);
    }
    if(canSign){
      bits.push(`<button type="button" class="btn-gold btn-sm" onclick='nestiqOpenTenantSignLeaseModal(${leaseIdJs})'>Sign Lease</button>`);
    }else if(pending && lease.tenantSigned){
      bits.push('<span style="font-size:0.82rem;color:var(--muted)">You have signed. Waiting for the landlord.</span>');
    }
    actions.innerHTML=bits.join('');
  }
  renderLeaseCard();
  const mo=document.getElementById('tenantMoveOutCard');
  // Move-out card visibility controlled by renderLeaseCard()
  if(mo) mo.style.display='none';
}

function renderLeaseCard(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(tenant.id)
    : null;
  const startIso=lease?.leaseStart||tenant.leaseStart;
  const endIso=lease?.leaseEnd||tenant.leaseEnd||tenant.lease;
  const leaseStart = new Date(startIso || (tenant.createdAt && tenant.createdAt.toDate ? tenant.createdAt.toDate() : new Date()));
  const leaseEnd = new Date(endIso || '2026-12-31');
  const today=new Date();
  const totalDays=(leaseEnd-leaseStart)/(1000*60*60*24);
  const daysElapsed=(today-leaseStart)/(1000*60*60*24);
  const progressPercent=Math.min(100,Math.max(0,Math.round((daysElapsed/Math.max(1,totalDays))*100)));
  const daysRemaining=Math.max(0,Math.round((leaseEnd-today)/(1000*60*60*24)));
  const sEl=document.getElementById('leaseStartDate');
  if(sEl) sEl.textContent=leaseStart.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
  const eEl=document.getElementById('leaseEndDate');
  if(eEl) eEl.textContent=leaseEnd.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
  const rentAmt=typeof window.nestiqTenantMonthlyRent==='function'
    ? window.nestiqTenantMonthlyRent(tenant, lease)
    : Number(lease?.rent!=null?lease.rent:tenant.rent||0);
  const rentAmtEl=document.getElementById('leaseRentAmount');
  if(rentAmtEl) rentAmtEl.textContent='R'+rentAmt.toLocaleString('en-ZA');
  const depAmt=lease?.deposit!=null
    ? Number(lease.deposit)||0
    : (typeof nestiqTenantDepositAmount==='function'
      ? nestiqTenantDepositAmount(tenant)
      : Number(tenant.deposit && typeof tenant.deposit==='object'?tenant.deposit.amount:tenant.deposit || (Number(tenant.rent||0)*2) || 0));
  const depAmtEl=document.getElementById('leaseDepositAmount');
  if(depAmtEl) depAmtEl.textContent='R'+Number(depAmt||0).toLocaleString('en-ZA');
  const bar=document.getElementById('leaseProgressBar');
  if(bar) bar.style.width=progressPercent+'%';
  const pct=document.getElementById('leaseProgressPercent');
  if(pct) pct.textContent=progressPercent+'% complete';
  const dr=document.getElementById('leaseDaysRemaining');
  if(dr) dr.textContent=daysRemaining+' days remaining';
  const warn=document.getElementById('leaseRenewalWarning');
  const active=!(lease && (lease.status==='draft'||lease.status==='pending_signature'));
  if(warn){
    if(active && daysRemaining<90){
      warn.style.display='block';
      warn.textContent='Your lease expires in '+daysRemaining+' days. Message your caretaker to discuss renewal.';
    }else{
      warn.style.display='none';
    }
  }
  const mo=document.getElementById('tenantMoveOutCard');
  if(mo) mo.style.display=(active && daysRemaining<90)?'block':'none';
}
window.renderLeaseCard=renderLeaseCard;
window.renderTenantLeaseCard=renderTenantLeaseCard;

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
        return `<tr><td>${r.month}</td><td>R${Number(r.amount||0).toLocaleString('en-ZA')}</td><td>${datePaid}</td><td>${(()=>{ const methodBadge = String(r.method||'')==='PayFast' || String(r.method||'').toLowerCase().includes('payfast')
          ? `<span style="background:#00A2E0;color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:600">PayFast</span>`
          : `<span style="font-size:0.82rem;color:var(--muted)">${r.method || 'EFT'}</span>`;
          return methodBadge;
        })()}</td><td>${receiptBtn}</td></tr>`;
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
  if(!tenant){ nestiqShowNotif?.('Tenant profile not loaded','warning'); return; }
  const rows=nestiqTenantLast12PaymentRows(tenant).filter(r=>r.status==='paid');
  if(!rows.length){ nestiqShowNotif?.('No paid months to include on a statement','warning'); return; }
  const {jsPDF}=window.jspdf||{};
  if(!jsPDF){ nestiqShowNotif?.('PDF library not loaded','error'); return; }
  try{
    nestiqShowNotif?.('Generating PDF...','info');
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
    nestiqShowNotif?.('Statement downloaded','success');
  }catch(err){
    console.error('Tenant statement PDF',err);
    nestiqShowNotif?.('PDF generation failed','error');
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
  if(!p){nestiqShowNotif('No receipt found','warning');return;}
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
  if(typeof nestiqMaintNormalizePriority==='function') return nestiqMaintNormalizePriority(urgency);
  const map={
    'Emergency — Safety risk':'Emergency',
    'High — Affects daily living':'High',
    'Medium — Needs attention':'Medium',
    'Low — Minor issue':'Low',
    Emergency:'Emergency', High:'High', Medium:'Medium', Low:'Low'
  };
  return map[urgency]||'Medium';
}

function nestiqTenantPriorityRadiosHtml(selected){
  return '';
}

function nestiqTenantMaintStage(r){
  if(r==null) return 'submitted';
  if(typeof r==='string'){
    const st=String(r).toLowerCase();
    if(st==='cancelled'||st==='canceled') return 'cancelled';
    if(st==='done'||st==='resolved'||st==='closed'||st==='completed') return 'completed';
    if(st==='progress'||st==='in progress') return 'progress';
    if(st==='assigned'||st==='accepted'||st==='scheduled') return 'assigned';
    return 'submitted';
  }
  const st=String(r.status||'open').toLowerCase();
  if(st==='cancelled'||st==='canceled') return 'cancelled';
  if(st==='done'||st==='resolved'||st==='closed') return 'completed';
  if(st==='progress'||st==='in progress') return 'progress';
  const stage=typeof nestiqMaintContractorStage==='function'
    ? String(nestiqMaintContractorStage(r)||'')
    : String(r.contractorStage||'').toLowerCase();
  if(stage==='completed') return 'completed';
  if(stage==='progress') return 'progress';
  if(stage==='declined') return 'submitted';
  if(stage==='assigned'||stage==='accepted'||st==='assigned'||st==='scheduled') return 'assigned';
  if(r.vendorName||(r.vendorId!=null&&r.vendorId!=='')) return 'assigned';
  return 'submitted';
}

function nestiqTenantMaintLabel(r){
  const map={submitted:'Submitted',assigned:'Assigned',progress:'In Progress',completed:'Completed',cancelled:'Cancelled'};
  const stage=nestiqTenantMaintStage(r);
  if(stage==='assigned'&&r&&r.scheduledDate) return 'Visit booked';
  return map[stage]||'Submitted';
}

function nestiqTenantMaintPill(r){
  const stage=nestiqTenantMaintStage(r);
  const cls={
    submitted:'nestiq-maint-st-pending',
    assigned:'nestiq-maint-st-assigned',
    progress:'nestiq-maint-st-progress',
    completed:'nestiq-maint-st-done',
    cancelled:'nestiq-maint-st-cancelled'
  }[stage]||'nestiq-maint-st-pending';
  return `<span class="nestiq-maint-status-pill ${cls}">${nestiqTenantMaintLabel(r)}</span>`;
}

function getStatusBadge(status){
  const stage=nestiqTenantMaintStage(status);
  const map={submitted:'badge-gray',assigned:'badge-blue',progress:'badge-amber',completed:'badge-green',cancelled:'badge-red'};
  return map[stage]||'badge-amber';
}

function getStatusLabel(status){
  return nestiqTenantMaintLabel(status);
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
    const stage=nestiqTenantMaintStage(r);
    return stage!=='completed'&&stage!=='cancelled';
  });
  if(!openRequests.length){
    el.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.85rem">No open maintenance requests</div>`;
    return;
  }
  el.innerHTML=openRequests.map(r=>{
    const title=String(r.title||r.issueType||'Maintenance').replace(/</g,'&lt;');
    return `
    <div class="tenant-section-card tenant-maint-card" style="margin-bottom:10px">
      <div class="tenant-maint-card-head">
        <div>
          <div class="tenant-maint-card-title">${title}</div>
          <div class="tenant-maint-card-meta">Submitted ${nestiqFormatMaintSubmittedDate(r)}</div>
        </div>
        ${nestiqTenantMaintPill(r)}
      </div>
      ${typeof window.nestiqMaintVisitBannerHtml==='function'?window.nestiqMaintVisitBannerHtml(r):''}
    </div>`;
  }).join('');
}
window.nestiqRenderTenantOpenRequests=nestiqRenderTenantOpenRequests;

function renderMaintenanceCard(){
  const card=document.getElementById('tenantMaintenanceCard'); 
  if(!card) return;
  card.innerHTML=`<div class="portal-card-title">Maintenance Request</div>
    <div class="form-group"><label>Title</label><input class="form-input" id="portal_maint_title" placeholder="e.g. Leaking kitchen tap"></div>
    <div class="form-group"><label>Description</label><textarea class="form-input form-textarea" id="portal_maint_desc" placeholder="Describe the issue..."></textarea></div>
    <div class="form-group"><label>Photo of the problem</label>${nestiqTenantMaintPhotoUploadHtml()}<span class="nestiq-form-hint">Optional, but a photo helps the caretaker prepare.</span></div>
    <button class="btn-gold btn-sm" style="width:100%;justify-content:center" onclick="submitTenantMaintenance()">Submit request</button>
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

function nestiqTenantInferIssueType(text){
  const s=String(text||'').toLowerCase();
  if(/leak|tap|pipe|drain|toilet|geyser|plumb|sink|shower|blocked/.test(s)) return 'Plumbing';
  if(/electric|light|plug|socket|power|wire|db board|breaker/.test(s)) return 'Electrical';
  if(/crack|wall|roof|ceiling|structur|window|door frame|damp/.test(s)) return 'Structural';
  if(/fridge|stove|oven|washing|appliance|microwave/.test(s)) return 'Appliance';
  if(/pest|rat|roach|termite|ant|cockroach|insect/.test(s)) return 'Pest Control';
  return 'Other';
}

async function submitTenantMaintenance(){
  const tenant=window.currentTenantData;
  if(!tenant){
    nestiqShowNotif('Not signed in','error');
    return false;
  }
  if(typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()!=='active'){
    nestiqShowNotif('Maintenance is available after your lease is signed.','info');
    return false;
  }
  const title=(document.getElementById('portal_maint_title')?.value||'').trim();
  const description=(document.getElementById('portal_maint_desc')?.value||'').trim();
  const issueType=document.getElementById('portal_maint_type')?.value||nestiqTenantInferIssueType(`${title} ${description}`);
  const urgency='Medium';
  const preferredDate='';
  const todayLabel=new Date().toLocaleDateString('en-ZA');
  const resolvedTitle=title||'Maintenance request';
  if(!resolvedTitle){
    nestiqShowNotif('Add a short title for your request','error');
    return false;
  }
  if(!description||description.length<10){
    nestiqShowNotif('Please describe the issue in more detail','error');
    return false;
  }
  if(window.tenantProperty?.maintenanceSettings?.allowTenantReport===false){
    nestiqShowNotif('Your landlord has turned off tenant maintenance reports for this property. Contact them or the caretaker instead.','warning');
    return false;
  }
  const db=window.nestiqDb;
  const u=window.currentUser||{};
  const ts=window.nestiqTenantSession||{};
  const lid=String(ts.landlordId||u.landlordId||tenant.landlordId||'').trim();
  const tid=String(ts.tenantId||u.tenantDocId||tenant.id||'').trim();
  const tenantUid=String(firebase.auth()?.currentUser?.uid||u.uid||ts.uid||'').trim();
  if(!db||!lid||!tid||!tenantUid){
    nestiqShowNotif('Not signed in','error');
    return false;
  }
  const maintCol=window.nestiqFs?.maintenance?.(db, lid);
  if(!maintCol){
    nestiqShowNotif('Could not reach maintenance records. Try again.','error');
    return false;
  }
  try{
    window.showLoading?.('Submitting request...');
    let pendingPhoto='';
    if(typeof getPendingMaintenancePhoto==='function'){
      pendingPhoto=getPendingMaintenancePhoto('tenant')||getPendingMaintenancePhoto('portal')||'';
    }
    const fileEl=document.getElementById('portal_maint_photo');
    if(!pendingPhoto && fileEl?.files?.[0] && typeof compressImage==='function'){
      pendingPhoto=await new Promise(resolve=>{
        compressImage(fileEl.files[0],600,0.7,b64=>resolve(b64||''));
      });
    }
    const row={
      tenantId:tid,
      tenantUid,
      propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
      property:String(tenant.property||window.tenantProperty?.name||''),
      landlordId:lid,
      title:resolvedTitle,
      description,
      tenantName:String(tenant.name||''),
      tenantEmail:String(tenant.email||tenant.portalEmail||'').trim(),
      unit:String(tenant.unit||tenant.unitNumber||'').trim(),
      locationType:String(tenant.unit||tenant.unitNumber||'').trim()?'unit':'common',
      issueType,
      issueCategory:issueType,
      urgency,
      priority:urgencyToPriority(urgency),
      reportedPriority:urgencyToPriority(urgency),
      reportedByRole:'tenant',
      date:todayLabel,
      preferredDate,
      status:'open',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef=maintCol.doc();
    if(pendingPhoto){
      window.showLoading?.('Uploading photo...');
      let url=pendingPhoto;
      if(typeof nestiqMaybeUploadPhoto==='function'){
        try{ url=await nestiqMaybeUploadPhoto(`maintenance/${docRef.id}/photo.jpg`, pendingPhoto); }catch(_e){}
      }
      const persisted=typeof nestiqPhotoUrlForFirestore==='function'
        ? nestiqPhotoUrlForFirestore(url)
        : (String(url||'').startsWith('http')?url:null);
      if(persisted) row.photoUrl=persisted;
      else nestiqShowNotif?.('Request will be sent, but the photo could not be saved. Try a smaller JPG or PNG.','warning');
    }
    await docRef.set(row);
    try{
      if(typeof window.nestiqNotifyMaintenanceSubmitted === 'function'){
        const ls=window.landlordSettings||{};
        window.nestiqNotifyMaintenanceSubmitted(
          { title: resolvedTitle, description, urgency, property: row.property },
          { email: ls.email, firstName: String(ls.name||'').split(/\s+/)[0], tenantName: tenant.name, propertyName: row.property }
        );
      }
    }catch(_notifyErr){}
    window.tenantMaintenance=[{ id:docRef.id, ...row, createdAt:{toDate:()=>new Date()} },...(window.tenantMaintenance||[])];
    window.hideLoading?.();
    const titleEl=document.getElementById('portal_maint_title');
    const descEl=document.getElementById('portal_maint_desc');
    if(titleEl) titleEl.value='';
    if(descEl) descEl.value='';
    if(typeof clearPendingMaintenancePhoto==='function'){
      clearPendingMaintenancePhoto('tenant');
      clearPendingMaintenancePhoto('portal');
    }
    if(fileEl) fileEl.value='';
    const wrap=document.getElementById('tenantMaintUploadWrap');
    if(wrap && typeof nestiqTenantMaintPhotoUploadHtml==='function'){
      wrap.outerHTML=nestiqTenantMaintPhotoUploadHtml();
    }
    nestiqRenderTenantOpenRequests();
    renderTenantMaintList?.();
    nestiqTenantRefreshVisibleSections?.();
    nestiqShowNotif('✅ Request submitted! Your landlord has been notified.','success');
    return true;
  }catch(error){
    window.hideLoading?.();
    console.error('Maintenance submit error:',error);
    const denied=error?.code==='permission-denied'||/permission/i.test(String(error?.message||''));
    nestiqShowNotif(denied
      ? 'Could not submit — sign out and back in, or ask your landlord to resend the portal invite.'
      : 'Failed to submit request. Check your connection and try again.','error');
    return false;
  }
}
window.submitTenantMaintenance=submitTenantMaintenance;

async function runTenantMaintAiAssess(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const desc=document.getElementById('td_desc')?.value?.trim()||'';
  if(desc.length<20){ nestiqShowNotif('Description must be at least 20 characters','warning'); return; }
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
    nestiqShowNotif('AI unavailable, try again','error');
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
  if(!url){ nestiqShowNotif?.('Download link not available','warning'); return; }
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
  if(!url){ nestiqShowNotif('Preview not available','warning'); return; }
  const safe=String(name||'Document').replace(/</g,'&lt;');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${safe}</h2>
    <div style="margin-top:10px;height:70vh;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <iframe src="${url}" style="width:100%;height:100%;border:none" title="${safe}"></iframe>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-outline btn-sm" onclick="downloadTenantPortalDocument('${url.replace(/'/g,"\\'")}','${String(name||'').replace(/'/g,"\\'")}')">Download</button>
      <button type="button" class="btn-primary btn-sm" onclick="nestiqCloseModalAnimated()">Close</button>
    </div>`;
  nestiqOpenModalAnimated();
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
    const items=(grouped[cat.id]||[]).sort((a,b)=>{
      const ag=a.systemGenerated?1:0, bg=b.systemGenerated?1:0;
      if(ag!==bg) return ag-bg;
      return String(b.date||b.uploadedAt||'').localeCompare(String(a.date||a.uploadedAt||''));
    });
    const rows=items.length?items.map(d=>{
      const name=String(d.name||d.fileName||'Document').replace(/</g,'&lt;');
      const sys=d.systemGenerated===true||d.source==='approval';
      const label=sys?`${name} <span class="badge badge-amber" style="font-size:0.65rem;margin-left:6px">System-generated</span>`:name;
      const url=String(d.url||d.downloadUrl||'');
      const unread=nestiqTenantDocUnread(d);
      const idJs=String(d.id).replace(/'/g,"\\'");
      const isReceipt=d._receiptPaymentId!=null;
      const isNotice=d._noticeId!=null;
      const previewClick=isReceipt?`downloadPaymentReceipt('${d._receiptPaymentId}')`:isNotice?`expandNotice('${d._noticeId}')`:url?`openTenantDocumentPreview('${url.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}');markTenantDocumentRead('${idJs}')`:`nestiqShowNotif('No preview available','info')`;
      const dlClick=isReceipt?`downloadPaymentReceipt('${d._receiptPaymentId}')`:url?`downloadTenantPortalDocument('${url.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}')`:`expandNotice('${d._noticeId}')`;
      return `<div class="tenant-doc-row">
        ${unread?'<span class="tenant-doc-unread"></span>':'<span style="width:7px"></span>'}
        <span style="font-size:1.1rem;cursor:pointer" onclick="${previewClick}">📄</span>
        <div style="flex:1;min-width:0;cursor:pointer" onclick="${previewClick}">
          <div style="font-weight:600;font-size:0.84rem">${label}</div>
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
  const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(tenant.id)
    : null;
  if(typeof generateLeasePDF==='function') generateLeasePDF(tenant, prop, lease?.additionalClauses||[], lease, {download:true});
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
    <button type="button" class="btn-primary btn-sm" style="margin-top:18px" onclick="nestiqCloseModalAnimated()">Close</button>`;
  nestiqOpenModalAnimated();
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

function nestiqTenantOpenChat(){
  window.__nestiqTenantChatOpen=true;
  if(typeof nestiqSwitchTenantTab==='function') nestiqSwitchTenantTab('messages');
  else renderMessagesCard();
}
function nestiqTenantChatBack(){
  window.__nestiqTenantChatOpen=false;
  renderMessagesCard();
}
window.nestiqTenantOpenChat=nestiqTenantOpenChat;
window.nestiqTenantChatBack=nestiqTenantChatBack;

function renderMessagesCard(_tenant){
  const all=window.tenantMessages||[];
  const messages=typeof nestiqCaretakerChatThread==='function'?nestiqCaretakerChatThread(all):all.filter(m=>m.fromRole==='tenant'||m.fromRole==='caretaker');
  const card=document.getElementById('tenantMessagesCard');
  if(!card) return;
  const tenant=window.currentTenantData||{};
  const caretaker=typeof nestiqTenantAssignedCaretaker==='function'?nestiqTenantAssignedCaretaker():null;
  const editing=Boolean(document.getElementById('nestiqChatEditBox'));
  if(editing) return;
  const draft=document.getElementById('tenantMessageInput')?.value||'';
  const last=typeof nestiqChatLastInThread==='function'?nestiqChatLastInThread(messages): (messages.slice().pop()||null);
  const unread=typeof nestiqTenantUnreadMsgCount==='function'?nestiqTenantUnreadMsgCount():0;
  const narrow=typeof nestiqChatIsNarrow==='function'?nestiqChatIsNarrow():false;
  const open=!narrow || window.__nestiqTenantChatOpen===true;
  const row=typeof nestiqChatListRowHtml==='function'
    ? nestiqChatListRowHtml({
        person:caretaker||{name:'Caretaker'},
        name:caretaker?(caretaker.name||'Caretaker'):'No caretaker assigned',
        last:caretaker?last:null,
        preview:caretaker?'Tap to start a conversation':'Waiting for a caretaker',
        unread,
        active:open,
        mine:last&&last.fromRole==='tenant',
        attrs:caretaker?'onclick="nestiqTenantOpenChat()"':'disabled'
      })
    : '';
  const threadBody=!caretaker
    ? `<div class="nestiq-chat-empty nestiq-chat-empty-rich"><div class="nestiq-chat-empty-title">Waiting for a caretaker</div><div>Day-to-day messages go to the property caretaker, not the landlord.</div></div>`
    : (!messages.length
      ? `<div class="nestiq-chat-empty nestiq-chat-empty-rich"><div class="nestiq-chat-empty-title">Start the conversation</div><div>Introduce yourself or ask about access, maintenance, or the building.</div></div>`
      : (typeof nestiqChatThreadHtml==='function'?nestiqChatThreadHtml(messages,{mineRole:'tenant',tenant,caretaker}):''));
  card.innerHTML=`
    <div class="nestiq-inbox ${open?'is-thread':'is-list'}">
      <aside class="nestiq-wa-list" aria-label="Chats">${row||'<div class="nestiq-chat-empty">No chats yet.</div>'}</aside>
      <section class="nestiq-inbox-thread">
        <div class="nestiq-chat-head" id="tenantChatHead">
          <button type="button" class="nestiq-wa-back" onclick="nestiqTenantChatBack()" aria-label="Back to chats">‹</button>
          ${caretaker&&typeof nestiqChatAvatarHtml==='function'?nestiqChatAvatarHtml(caretaker,44):''}
          <div class="nestiq-chat-head-meta">
            <div class="nestiq-chat-head-name">${String(caretaker?.name||'No caretaker assigned').replace(/</g,'&lt;')}</div>
            <div class="nestiq-chat-head-sub">${caretaker?'Your property caretaker':'The landlord cannot be messaged here'}</div>
          </div>
        </div>
        <div class="tenant-chat-messages" id="tenantMessages">${threadBody}</div>
        <div class="tenant-chat-input-bar" id="tenantChatInputBar" style="display:${caretaker?'flex':'none'}">
          <input type="file" id="tenantMessageAttach" accept="image/*" hidden>
          <button type="button" class="tenant-chat-attach" onclick="document.getElementById('tenantMessageAttach').click()" title="Attach image">📎</button>
          <textarea id="tenantMessageInput" class="form-input" maxlength="500" placeholder="Message…" rows="1"></textarea>
          <button type="button" class="nestiq-wa-send" onclick="sendTenantMessage()">➤</button>
        </div>
      </section>
    </div>`;
  const attach=document.getElementById('tenantMessageAttach');
  if(attach){
    attach.onchange=()=>{
      const f=attach.files?.[0];
      if(f) sendTenantMessageAttachment(f);
      attach.value='';
    };
  }
  const composer=document.getElementById('tenantMessageInput');
  if(composer){
    if(draft) composer.value=draft;
    nestiqBindComposerEnter?.(composer, ()=>sendTenantMessage());
  }
  const el=document.getElementById('tenantMessages');
  if(el) el.scrollTop=el.scrollHeight;
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
  if(!file||!file.type.startsWith('image/')){ nestiqShowNotif('Images only','warning'); return; }
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
    const cu=window.currentUser||{};
    const lid=String(ts.landlordId||cu.landlordId||'').trim();
    const tenantUid=firebase.auth().currentUser?.uid||'';
    const tenantId=String(tenant.id||ts.tenantId||cu.tenantDocId||'').trim();
    if(!lid||!tenantId) throw new Error('Missing landlord or tenant id');
    const sess=typeof getSession==='function'?getSession():window.__nestiqSession;
    if(sess&&sess.role&&sess.role!=='tenant'){
      nestiqShowNotif?.('Only tenants can send messages in this thread.','warning');
      if(input) input.disabled=false;
      return;
    }
    const caretaker=typeof nestiqTenantAssignedCaretaker==='function'?nestiqTenantAssignedCaretaker():null;
    if(!caretaker){
      nestiqShowNotif?.('No caretaker is assigned to your property yet.','warning');
      if(input) input.disabled=false;
      return;
    }
    const col=window.nestiqFs?.messages(window.nestiqDb, lid);
    if(!col) throw new Error('Messages are not available');
    const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
    const payload={
      tenantId,
      tenantUid,
      landlordId:lid,
      propertyId:String(tenant.propertyId||window.tenantProperty?.id||''),
      fromRole:'tenant',
      fromName:tenant.name,
      toRole:'caretaker',
      toStaffId:caretaker.staffId||caretaker.id||'',
      toUid:caretaker.uid||null,
      message:text||(attachmentBase64?'📷 Photo':''),
      date:new Date().toISOString(),
      read:false
    };
    if(fv) payload.createdAt=fv.serverTimestamp();
    if(attachmentBase64) payload.attachmentUrl=attachmentBase64;
    await col.add(payload);
    if(input){ input.value=''; input.disabled=false; input.focus(); }
    const local={ id:'local-'+Date.now(), ...payload, createdAt:null };
    window.tenantMessages=Array.isArray(window.tenantMessages)?window.tenantMessages:[];
    if(!window.tenantMessages.some(m=>m.message===local.message&&m.fromRole==='tenant'&&Math.abs(new Date(m.date)-new Date(local.date))<2000)){
      window.tenantMessages.push(local);
    }
    try{ renderMessagesCard(); }catch(_e){}
    nestiqShowNotif?.('Message sent','success');
  }catch(error){
    if(input) input.disabled=false;
    nestiqShowNotif('Failed to send message','error');
    console.error('Send message error:', error);
  }
}
window.sendTenantMessage=sendTenantMessage;

async function markLandlordMessagesRead(){
  if(typeof nestiqTenantIsViewingMessages==='function' && !nestiqTenantIsViewingMessages()) return;
  const unread=(window.tenantMessages||[]).filter(m=>m&&m.fromRole==='caretaker'&&!m.read&&!m.deleted&&m.id&&!String(m.id).startsWith('local-'));
  if(!unread.length) return;
  const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
  for(const msg of unread){
    msg.read=true;
    try{
      if(lid) await window.nestiqFs.messages(window.nestiqDb, lid).doc(String(msg.id)).update({ read:true });
    }catch(e){ console.error('Mark read error:', e); }
  }
  try{ nestiqUpdateTenantBadges?.(); }catch(_e){}
}
window.markLandlordMessagesRead=markLandlordMessagesRead;

function nestiqTenantPropertySlideshowHtml(property){
  const gallery=typeof nestiqGetSlideshowPhotos==='function'?nestiqGetSlideshowPhotos(property||{}):[];
  const icon=String(property?.icon||'🏠');
  if(!gallery.length){
    return `<div class="tenant-prop-slideshow-empty">${icon}</div>`;
  }
  const ssKey='tenant-prop-ss';
  window.__nestiqPendingSlideshows=window.__nestiqPendingSlideshows||{};
  window.__nestiqPendingSlideshows[ssKey]=gallery;
  const count=gallery.length>1?`<div class="prop-photo-count">${gallery.length} photos</div>`:'';
  return `<div class="tenant-prop-slideshow-wrap">${count}<div data-nestiq-slideshow data-ss-key="${ssKey}"></div></div>`;
}

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
  const slideHtml=nestiqTenantPropertySlideshowHtml(property);
  card.innerHTML=`
  <div class="portal-card-title">My Property Info</div>
  <div id="tenantPropertyInfoBody">
  ${slideHtml}
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
    if(typeof nestiqInitAllSlideshows==='function') nestiqInitAllSlideshows();
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
  const reading=Number(input?.value||0); if(reading<=0){nestiqShowNotif('Enter a valid reading','error');return;}
  const prev=[...(utilityReadings||[])].filter(r=>r.tenantId===tenant.id&&r.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const usage=prev?Math.max(0,reading-Number(prev.reading||0)):0;
  utilityReadings.unshift({id:Date.now(),tenantId:tenant.id,type,reading,date:new Date().toISOString(),month:new Date().toLocaleDateString('en-ZA',{month:'long',year:'numeric'}),usage});
  saveData(); nestiqShowNotif('Reading submitted','success'); nestiqTenantRefreshVisibleSections?.();
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
  const leaseLike=typeof window.nestiqLeaseLikeFromTenant==='function'?window.nestiqLeaseLikeFromTenant(tenant):null;
  const periods=typeof window.nestiqLeaseSchedulePeriods==='function' && leaseLike
    ? window.nestiqLeaseSchedulePeriods(leaseLike, leaseStart, leaseEnd)
    : null;
  if(periods&&periods.length){
    periods.forEach(p=>{
      const key=`${p.year}-${String(p.month).padStart(2,'0')}`;
      const paid=(tenant.payments||[]).some(pay=>String(pay.date||'').slice(0,7)===key);
      if(!paid){
        const iso=`${p.dueDate.getFullYear()}-${String(p.dueDate.getMonth()+1).padStart(2,'0')}-${String(p.dueDate.getDate()).padStart(2,'0')}`;
        events.push({title:`Rent due R${Number(p.amount||0).toLocaleString('en-ZA')}${p.prorated?' (pro-rata)':''}`,start:iso,allDay:true,color:'#c9a84c',textColor:'#0e1117',extendedProps:{type:'due',amount:p.amount}});
      }
    });
  }else{
    let cur=new Date(leaseStart.getFullYear(),leaseStart.getMonth(),dueDay);
    if(String(leaseStart)!=='Invalid Date' && cur<leaseStart) cur.setMonth(cur.getMonth()+1);
    while(cur<=leaseEnd){
      const key=cur.toISOString().slice(0,7);
      const paid=(tenant.payments||[]).some(p=>String(p.date||'').slice(0,7)===key);
      if(!paid){
        events.push({title:`Rent due R${Number(tenant.rent||0).toLocaleString('en-ZA')}`,start:cur.toISOString().slice(0,10),allDay:true,color:'#c9a84c',textColor:'#0e1117',extendedProps:{type:'due'}});
      }
      cur.setMonth(cur.getMonth()+1);
    }
  }
  (tenant.payments||[]).forEach(p=>events.push({title:`✓ Paid R${Number(p.amount||0).toLocaleString('en-ZA')}`,start:String(p.date).slice(0,10),allDay:true,color:'#5a7a60',textColor:'#fff',extendedProps:{type:'paid'}}));
  const tenantMaintId=String(window.currentUser?.tenantDocId||tenant.id||'');
  const maintForCalendar=[
    ...(window.tenantMaintenance||[]),
    ...(typeof maintenanceData!=='undefined'&&Array.isArray(maintenanceData)?maintenanceData:[])
  ];
  maintForCalendar.filter(r=>String(r.tenantId||'')===tenantMaintId).forEach(r=>{
    const md=new Date(r.scheduledDate||r.preferredDate||r.date);
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
    eventClick:(info)=>{ if(info.event.extendedProps.type==='due') nestiqShowPayConfirmModal(); }
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
  if(finDueEl){
    const st=calculateTenantRentStatus(tenant);
    if(st.status==='upcoming'){
      finDueEl.textContent=st.message;
    }else if(st.dueDate){
      const pretty=st.dueDate instanceof Date
        ? st.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})
        : String(st.dueDate);
      finDueEl.textContent='R'+Number(st.amountDue||tenant.rent||0).toLocaleString('en-ZA')+' due '+pretty;
    }else{
      finDueEl.textContent='R'+Number(tenant.rent||0).toLocaleString('en-ZA')+' due on the '+(tenant.monthlyDueDate||1)+' of next month';
    }
  }
}
window.renderFinancesCard=renderFinancesCard;

function renderGettingStartedTenant(){
  const homeSlot=document.getElementById('tenantHomeWelcome');
  const wrap=homeSlot||document.getElementById('tenantWelcomeBanner');
  if(!wrap) return;
  if(homeSlot){
    const outer=document.getElementById('tenantWelcomeBanner');
    if(outer) outer.innerHTML='';
  }
  const mode=typeof nestiqTenantPortalMode==='function'?nestiqTenantPortalMode():'active';
  if(mode==='applicant'){
    wrap.innerHTML='';
    return;
  }
  const tenant=window.currentTenantData;
  if(!tenant){
    wrap.innerHTML='';
    return;
  }
  const lease=typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(tenant.id)
    : null;
  const pendingSign=lease
    && (lease.storedStatus==='pending_signature'||lease.status==='pending_signature')
    && !!lease.landlordSigned
    && !lease.tenantSigned;
  if(mode==='awaiting_payment'){
    wrap.innerHTML='';
    return;
  }
  if(pendingSign || mode==='lease'){
    const leaseIdJs=lease?JSON.stringify(String(lease.id)):'';
    const waitingLandlord=lease && !lease.landlordSigned;
    wrap.innerHTML=`
      <div class="nestiq-applicant-lease-banner">
        <div>
          <div class="nestiq-applicant-hero-eyebrow">Next step</div>
          <div style="font-weight:700;margin-bottom:4px">${waitingLandlord?'Waiting for the landlord to sign':'Review and sign your lease'}</div>
          <div style="font-size:0.85rem;color:var(--muted);line-height:1.5">
            ${waitingLandlord
              ? 'The landlord signs first — when they approve the application, or from Leases → Sign & send to tenant. You sign after that.'
              : 'Your application was approved. The landlord has signed. Rent, maintenance and unit documents stay locked until you sign.'}
          </div>
        </div>
        ${pendingSign&&leaseIdJs?`<button type="button" class="btn-gold btn-sm" onclick='nestiqOpenTenantSignLeaseModal(${leaseIdJs})'>Sign lease</button>`:''}
      </div>`;
    return;
  }
  if(tenant.firstTenantLogin === false){
    wrap.innerHTML='';
    return;
  }
  const name=String(tenant.name||'there').replace(/</g,'&lt;');
  wrap.innerHTML=`
    <div class="tenant-welcome-card">
      <div class="tenant-welcome-mark" aria-hidden="true" data-nq-icon="sparkles" data-nq-size="18"></div>
      <div class="tenant-welcome-copy">
        <div class="tenant-welcome-kicker">Your home in NestIQ</div>
        <strong>Welcome, ${name}</strong>
        <p>Rent, maintenance and documents for your unit live on this overview. Open a card below, or use the sidebar anytime.</p>
      </div>
      <button type="button" class="btn-gold btn-sm" onclick="ackTenantWelcome()">Got it</button>
    </div>`;
  try{ window.nestiqHydrateIcons?.(wrap); }catch(_e){}
}
window.renderGettingStartedTenant=renderGettingStartedTenant;

async function ackTenantWelcome(){
  try{
    if(window.currentTenantData) window.currentTenantData.firstTenantLogin=false;
    const wrap=document.getElementById('tenantHomeWelcome')||document.getElementById('tenantWelcomeBanner');
    if(wrap){
      wrap.classList.add('is-dismissing');
      setTimeout(()=>{ wrap.innerHTML=''; wrap.classList.remove('is-dismissing'); }, 240);
    }
    const u=window.currentUser;
    const lid=window.nestiqTenantSession?.landlordId||u?.landlordId;
    const tid=window.nestiqTenantSession?.tenantId||u?.tenantDocId;
    if(lid&&tid&&window.nestiqFs&&window.nestiqDb){
      await window.nestiqFs.tenants(window.nestiqDb, lid).doc(String(tid)).update({ firstTenantLogin: false });
    }
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
  card.innerHTML=`<div class="tenant-section-card"><div class="tenant-section-title">Move-out Checklist</div><div style="color:var(--rust);font-weight:700;margin-bottom:8px;font-size:0.88rem">Your lease ends in ${days} days</div>${tasks.map((tk,i)=>`<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px"><input type="checkbox" ${saved[i]||saved[String(i)]?'checked':''} onchange="toggleMoveTask(${i})"><span style="font-size:0.82rem">${tk}</span></label>`).join('')}<div class="lease-bar"><div class="lease-fill" style="width:${pct}%"></div></div><div style="font-size:0.78rem;color:var(--muted)">${pct}% complete</div><button class="btn-outline btn-sm" style="margin-top:8px" onclick="nestiqTenantOpenChat()">Contact Caretaker</button></div>`;
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
  const mode=typeof nestiqTenantPortalMode==='function'?nestiqTenantPortalMode():'active';
  if(mode!=='active' && !(mode==='awaiting_payment' && tab==='payments') && (tab==='payments'||tab==='maintenance'||tab==='documents'||tab==='messages')){
    tab=mode==='awaiting_payment'?'home':'applications';
  }
  nestiqApplyTenantPortalChrome();
  __tenantActiveTab=tab;
  // New portal shell uses `.tenant-tab-page` + `.tenant-tab-bar .tab-btn`
  document.querySelectorAll('.tenant-tab-bar .tab-btn[data-tab]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.tab===tab);
  });
  document.querySelectorAll('.tenant-tab-page').forEach(p=>{
    const on=p.id===('tTab-'+tab);
    p.classList.toggle('active',on);
    if(on){
      p.classList.remove('tab-content-enter');
    }
  });
  const panel=document.getElementById('tTab-'+tab);
  const hasHomeChrome=!!panel?.querySelector('.tenant-home-title,.nestiq-applicant-hero,.nestiq-movein');
  const needsRender=!__tenantTabsLoaded[tab]
    || ((tab==='home'||tab==='profile')&&!hasHomeChrome)
    || (tab!=='home'&&panel&&!String(panel.innerHTML||'').trim());
  if(needsRender){
    renderTenantTab(tab);
    // Home/profile stay unloaded until the heading actually paints (page remounts wipe DOM).
    if(tab==='home'||tab==='profile'){
      __tenantTabsLoaded[tab]=!!document.getElementById('tTab-'+tab)?.querySelector('.tenant-home-title,.nestiq-applicant-hero,.nestiq-movein');
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
  nestiqSafeTenantRender(()=>{
    switch(tab){
      case 'home': nestiqRenderTenantHome(panel); break;
      case 'applications': nestiqRenderTenantApplications(panel); break;
      case 'payments': nestiqRenderTenantPayments(panel); break;
      case 'maintenance': nestiqRenderTenantMaintenance(panel); break;
      case 'documents': nestiqRenderTenantDocuments(panel); break;
      case 'messages': nestiqRenderTenantMessages(panel); break;
      case 'profile': nestiqRenderTenantProfile(panel); break;
    }
  }, tab);
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

function nestiqTenantIsViewingMessages(){
  return __tenantActiveTab==='messages' && !!document.getElementById('tenantMessages');
}
window.nestiqTenantIsViewingMessages=nestiqTenantIsViewingMessages;

function nestiqTenantUnreadMsgCount(){
  return (window.tenantMessages||[]).filter(m=>m&&m.fromRole==='caretaker'&&!m.read&&!m.deleted).length;
}

function nestiqOnTenantMessagesUpdated(){
  const unread=nestiqTenantUnreadMsgCount();
  const prev=Number(window.__nestiqTenantMsgUnread||0);
  nestiqUpdateTenantBadges();
  if(window.__nestiqTenantMsgListenerReady && unread>prev && !nestiqTenantIsViewingMessages()){
    const n=unread-prev;
    nestiqShowNotif?.(n===1?'New message from your caretaker':(n+' new messages from your caretaker'),'info');
  }
  window.__nestiqTenantMsgListenerReady=true;
  window.__nestiqTenantMsgUnread=unread;
  if(nestiqTenantIsViewingMessages()) markLandlordMessagesRead?.();
}
window.nestiqOnTenantMessagesUpdated=nestiqOnTenantMessagesUpdated;

function nestiqUpdateTenantBadges(){
  const unreadMessages=nestiqTenantUnreadMsgCount();
  const msgBadge=document.getElementById('tabBadge-messages');
  if(msgBadge){
    msgBadge.textContent=unreadMessages>99?'99+':String(unreadMessages);
    msgBadge.style.display=unreadMessages?'flex':'none';
  }
  const msgTab=document.querySelector('.tenant-tab-bar .tab-btn[data-tab="messages"]');
  if(msgTab) msgTab.classList.toggle('has-unread', unreadMessages>0);
  const homeMsgBadge=document.getElementById('tenantHomeMsgBadge');
  if(homeMsgBadge){
    homeMsgBadge.textContent=unreadMessages>99?'99+':String(unreadMessages);
    homeMsgBadge.style.display=unreadMessages?'flex':'none';
  }
  const homeStat=document.getElementById('tenantUnreadMsgStatVal');
  if(homeStat) homeStat.textContent=String(unreadMessages);
  nestiqRenderTenantUnreadBanner();
  nestiqPaintCountBadge?.(document.getElementById('navTenantMsgBadge'), unreadMessages);
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
function nestiqRenderTenantUnreadBanner(){
  if(typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()!=='active'){
    const existing=document.getElementById('tenantUnreadMsgBanner');
    if(existing) existing.remove();
    return;
  }
  const host=document.getElementById('tTab-home');
  if(!host) return;
  let bar=document.getElementById('tenantUnreadMsgBanner');
  const n=nestiqTenantUnreadMsgCount();
  if(!n){
    if(bar) bar.remove();
    return;
  }
  if(!bar){
    bar=document.createElement('div');
    bar.id='tenantUnreadMsgBanner';
    bar.className='nestiq-tenant-unread-banner';
    const after=host.querySelector('.tenant-home-header');
    if(after&&after.parentNode) after.parentNode.insertBefore(bar, after.nextSibling);
    else host.insertBefore(bar, host.firstChild);
  }
  const label=n===1?'unread message':'unread messages';
  bar.innerHTML=`<div><strong>${n} ${label}</strong> from your caretaker</div><button type="button" class="btn-primary btn-sm" onclick="nestiqTenantOpenChat()">Open chat</button>`;
}
window.nestiqRenderTenantUnreadBanner=nestiqRenderTenantUnreadBanner;
// Back-compat alias
function updateTenantTabBadges(){ nestiqUpdateTenantBadges(); }
window.updateTenantTabBadges=updateTenantTabBadges;

// Wrapper renderers (keep existing render functions intact)
function nestiqRenderTenantHome(container){
  const mode=nestiqTenantPortalMode();
  if(mode==='applicant'||mode==='lease'||mode==='awaiting_payment'){
    nestiqRenderApplicantHome(container, mode);
    return;
  }
  renderTenantHomeTab(container);
}
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
    if(typeof window.nestiqPaymentCountsTowardMonthlyRent==='function' && !window.nestiqPaymentCountsTowardMonthlyRent(p)) return false;
    const d=new Date(p.date);
    return d.getMonth()===nextDue.getMonth()&&d.getFullYear()===nextDue.getFullYear();
  });
  const leaseStart=nestiqParseTenantLeaseStart(tenant);
  if(leaseStart && leaseStart.getTime()>today.getTime()){
    events.push({date:leaseStart,label:'Lease starts',sub:leaseStart.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}),icon:'file-text'});
  }else if(!paid){
    events.push({date:nextDue,label:'Rent due',sub:'R'+Number(tenant.rent||0).toLocaleString('en-ZA'),icon:'credit-card'});
  }
  const leaseEnd=new Date(tenant.lease||tenant.leaseEnd||'2026-12-31');
  if(String(leaseEnd)!=='Invalid Date') events.push({date:leaseEnd,label:'Lease ends',sub:leaseEnd.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}),icon:'calendar'});
  (window.tenantMaintenance||[]).filter(r=>{
    const stage=nestiqTenantMaintStage(r);
    return stage!=='completed'&&stage!=='cancelled';
  }).forEach(r=>{
    const md=new Date(r.scheduledDate||r.preferredDate||'');
    if(String(md)!=='Invalid Date'&&md>=today){
      events.push({date:md,label:String(r.title||'Maintenance'),sub:typeof window.nestiqMaintVisitLabel==='function'&&window.nestiqMaintVisitLabel(r)?window.nestiqMaintVisitLabel(r):nestiqTenantMaintLabel(r),icon:'wrench'});
    }
  });
  return events.sort((a,b)=>a.date-b.date).slice(0,limit);
}

function nestiqTenantReviewableProperties(){
  const t=window.currentTenantData;
  if(!t) return [];
  const propertyId=String(t.propertyId||'').trim();
  if(!propertyId) return [];
  const landlordId=String(window.nestiqTenantSession?.landlordId||t.landlordId||window.currentUser?.landlordId||'').trim();
  return [{
    propertyId,
    landlordId,
    name:String(t.property||window.tenantProperty?.name||'Your property')
  }];
}

async function renderTenantReviewCard(){
  const el=document.getElementById('tenantReviewCard');
  if(!el) return;
  const linked=nestiqTenantReviewableProperties();
  if(!linked.length){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  el.style.display='';
  const row=linked[0];
  const uid=String(firebase.auth?.()?.currentUser?.uid||window.currentUser?.uid||'').trim();
  el.innerHTML=`<div class="tenant-section-title">Your review</div>
    <p class="tenant-review-card-copy">Share how living at ${String(row.name||'this property').replace(/</g,'&lt;')} has been. Only your first name and last initial appear publicly, unless you opt in to show your profile photo.</p>
    <div id="tenantReviewCardBody" class="tenant-review-card-body">Loading…</div>
    <button type="button" class="btn-gold btn-sm tenant-review-cta" onclick="nestiqOpenTenantReviewModal()">Write a Review</button>`;
  const bodyEl=document.getElementById('tenantReviewCardBody');
  if(!uid||!row.landlordId||typeof window.nestiqFetchMyPropertyReview!=='function'){
    if(bodyEl) bodyEl.textContent='You can publish a verified review for this property.';
    return;
  }
  try{
    const existing=await window.nestiqFetchMyPropertyReview(row.landlordId, row.propertyId, uid);
    const btn=el.querySelector('button');
    if(existing){
      const stars=typeof window.nestiqReviewStarsHtml==='function'?window.nestiqReviewStarsHtml(existing.rating,{hideNumber:true}):'';
      if(bodyEl){
        bodyEl.innerHTML=`<div>${stars}</div>${existing.body?`<p style="margin:8px 0 0">${String(existing.body).replace(/</g,'&lt;')}</p>`:'<p style="margin:8px 0 0;color:var(--muted)">No written comments.</p>'}`;
      }
      if(btn) btn.textContent='Edit your review';
    }else if(bodyEl){
      bodyEl.textContent='You have not reviewed this property yet.';
    }
  }catch(_e){
    if(bodyEl) bodyEl.textContent='You can publish a verified review for this property.';
  }
}

function nestiqSetTenantReviewStars(n){
  const v=Math.max(1, Math.min(5, Number(n)||1));
  window.__nestiqReviewDraftRating=v;
  document.querySelectorAll('#nestiqReviewStarBtns .nestiq-review-star-btn').forEach((btn,i)=>{
    btn.classList.toggle('filled', i<v);
  });
  const hidden=document.getElementById('nestiqReviewRating');
  if(hidden) hidden.value=String(v);
}

async function nestiqOpenTenantReviewModal(){
  const linked=nestiqTenantReviewableProperties();
  if(!linked.length){
    nestiqShowNotif?.('Reviews are only available for a property you rent or used to rent.','warning');
    return;
  }
  const row=linked[0];
  const uid=String(firebase.auth?.()?.currentUser?.uid||'').trim();
  let existing=null;
  if(uid&&row.landlordId&&typeof window.nestiqFetchMyPropertyReview==='function'){
    try{ existing=await window.nestiqFetchMyPropertyReview(row.landlordId, row.propertyId, uid); }catch(_e){}
  }
  const rating=Number(existing?.rating)||5;
  window.__nestiqReviewDraftRating=rating;
  const starBtns=[1,2,3,4,5].map(i=>`<button type="button" class="nestiq-review-star-btn${i<=rating?' filled':''}" onclick="nestiqSetTenantReviewStars(${i})" aria-label="${i} star${i===1?'':'s'}">★</button>`).join('');
  const host=document.getElementById('modalContent');
  if(!host) return;
  host.innerHTML=`
    <h2 class="modal-title">${existing?'Edit your review':'Write a Review'}</h2>
    <p class="modal-sub">${String(row.name||'Your property').replace(/</g,'&lt;')} — published as first name and last initial only, unless you opt in to show your photo.</p>
    <input type="hidden" id="nestiqReviewPropertyId" value="${String(row.propertyId).replace(/"/g,'&quot;')}">
    <input type="hidden" id="nestiqReviewRating" value="${rating}">
    <div class="form-group">
      <label>Rating</label>
      <div class="nestiq-review-stars-input" id="nestiqReviewStarBtns">${starBtns}</div>
    </div>
    <div class="form-group">
      <label>Comments (optional)</label>
      <textarea class="form-input" id="nestiqReviewBody" rows="4" maxlength="2000" placeholder="What was it like living here?">${String(existing?.body||'').replace(/</g,'&lt;')}</textarea>
    </div>
    <label class="nestiq-papp-check" style="display:flex;align-items:flex-start;gap:8px;margin-top:4px">
      <input type="checkbox" id="nestiqReviewShowPhoto" ${existing?.showPhoto?'checked':''}>
      <span>Show my profile photo with this review</span>
    </label>
    <p style="font-size:0.78rem;color:var(--muted);line-height:1.45;margin:6px 0 0">This becomes visible to anyone browsing the public listing — including people with no NestIQ account.</p>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:14px" onclick="nestiqSubmitTenantReviewForm()">Publish review</button>`;
  if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
}
window.nestiqOpenTenantReviewModal=nestiqOpenTenantReviewModal;
window.nestiqSetTenantReviewStars=nestiqSetTenantReviewStars;
window.nestiqTenantReviewableProperties=nestiqTenantReviewableProperties;

async function nestiqSubmitTenantReviewForm(){
  const propertyId=document.getElementById('nestiqReviewPropertyId')?.value||'';
  const rating=Number(document.getElementById('nestiqReviewRating')?.value||window.__nestiqReviewDraftRating||0);
  const body=document.getElementById('nestiqReviewBody')?.value||'';
  const showPhoto=!!document.getElementById('nestiqReviewShowPhoto')?.checked;
  if(!propertyId){ nestiqShowNotif?.('Missing property','error'); return; }
  if(!Number.isFinite(rating)||rating<1||rating>5){ nestiqShowNotif?.('Choose a rating from 1 to 5','error'); return; }
  const btn=document.querySelector('#modalOverlay .btn-gold');
  nestiqSetBtnLoading?.(btn,true,'Publishing…');
  try{
    if(typeof window.nestiqSubmitPropertyReview!=='function'){
      throw new Error('Review service is not loaded');
    }
    await window.nestiqSubmitPropertyReview(propertyId, rating, body, showPhoto);
    nestiqCloseModalAnimated?.();
    nestiqShowNotif?.('Review published on the public listing','success');
    renderTenantReviewCard();
  }catch(err){
    const code=String(err?.code||'');
    const msg=String(err?.message||'Could not publish review');
    const denied=/permission-denied|unauthenticated/i.test(code+' '+msg);
    nestiqShowNotif?.(denied
      ? 'Only verified current or past tenants can review this property.'
      : msg.replace(/^Firebase: /,'').replace(/\s*\([^)]*\)\s*$/,''),
      'error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}
window.nestiqSubmitTenantReviewForm=nestiqSubmitTenantReviewForm;

function renderTenantHomeStatusBanner(){
  const el=document.getElementById('tenantHomeStatusBanner');
  const tenant=window.currentTenantData;
  if(!el||!tenant) return;
  const sess=typeof getSession==='function'?getSession():window.__nestiqSession;
  if(window.nestiqUseFirestore && sess?.role==='tenant' && !window.__nestiqTenantPaymentsReady){
    el.className='tenant-status-banner upcoming';
    el.innerHTML=`
      <div class="tenant-status-banner-body">
        <div class="tenant-status-banner-eyebrow">Payment status</div>
        <div class="tenant-status-banner-title">Checking rent status</div>
        <div class="tenant-status-banner-meta">Confirming this month’s payments…</div>
      </div>`;
    return;
  }
  const status=calculateTenantRentStatus(tenant);
  const rent=Number(status.amountDue!=null?status.amountDue:tenant.rent||0);
  const duePretty=status.dueDate
    ? (status.dueDate instanceof Date
      ? status.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})
      : String(status.dueDate))
    : '';
  const pending=String(status.label||'').toLowerCase().includes('pending') || /sign your lease/i.test(status.message||'');
  const cls=status.status==='paid'?'paid':status.status==='overdue'?'overdue':status.status==='upcoming'?'upcoming':'due';
  const title=status.status==='paid'?'You\'re up to date'
    :status.status==='overdue'?'Rent is overdue'
    :pending?'Sign your lease first'
    :status.status==='upcoming'?'Next rent payment'
    :(status.label||'Rent due');
  const eyebrow=status.status==='paid'?'Payment status':status.status==='overdue'?'Action needed':status.status==='upcoming'?'Upcoming':'Due';
  const dueTxt=status.message || (duePretty?`R${rent.toLocaleString('en-ZA')} · Due: ${duePretty}`:`R${rent.toLocaleString('en-ZA')}`);
  el.className='tenant-status-banner '+cls;
  el.innerHTML=`
    <div class="tenant-status-banner-body">
      <div class="tenant-status-banner-eyebrow">${eyebrow}</div>
      <div class="tenant-status-banner-title">${title}</div>
      <div class="tenant-status-banner-meta">${dueTxt}</div>
    </div>
    ${status.status==='paid'
      ?`<button type="button" class="btn-outline btn-sm" onclick="nestiqSwitchTenantTab('payments')">View history</button>`
      :status.status==='upcoming'
        ?`<button type="button" class="btn-outline btn-sm" onclick="nestiqSwitchTenantTab('documents')">View lease</button>`
        :`<button type="button" class="btn-primary" onclick="nestiqShowPayConfirmModal()">Pay Rent</button>`}`;
}

function renderTenantHomeTab(panel){
  const tenant=window.currentTenantData;
  const first=String(tenant?.name||'Tenant').trim().split(/\s+/)[0]||'Tenant';
  const prop=String(tenant?.property||window.tenantProperty?.name||'Your home').replace(/</g,'&lt;');
  const unit=String(tenant?.unit||'').trim();
  const place=[unit,prop].filter(Boolean).join(' · ');
  const upcoming=tenant && calculateTenantRentStatus(tenant).status==='upcoming';
  const canReview=nestiqTenantReviewableProperties().length;
  const payAction=upcoming
    ? `<button type="button" class="tenant-quick-action" onclick="nestiqSwitchTenantTab('documents')">
        <span class="tenant-quick-action-icon" data-nq-icon="file-text" data-nq-size="18"></span>
        <span class="tenant-quick-action-label">View lease</span>
        <span class="tenant-quick-action-hint">Nothing is due yet</span>
      </button>`
    : `<button type="button" class="tenant-quick-action primary" onclick="nestiqShowPayConfirmModal()">
        <span class="tenant-quick-action-icon" data-nq-icon="credit-card" data-nq-size="18"></span>
        <span class="tenant-quick-action-label">Pay rent</span>
        <span class="tenant-quick-action-hint">Secure in-app payment</span>
      </button>`;
  panel.innerHTML=`
    <div class="tenant-home">
      <header class="tenant-home-header">
        <div>
          <div class="tenant-home-kicker">Overview</div>
          <h1 class="tenant-home-title">Welcome back, ${first.replace(/</g,'&lt;')}</h1>
          <p class="tenant-home-sub">Your rental at a glance — pay, report, and keep documents close.</p>
        </div>
        ${place?`<div class="tenant-home-place"><span data-nq-icon="map-pin" data-nq-size="14"></span>${place}</div>`:''}
      </header>
      <div id="tenantHomeWelcome"></div>
      <div id="tenantHomeStatusBanner"></div>
      <div class="tenant-quick-stats" id="tenantHomeQuickStats"></div>
      <div class="tenant-quick-actions ${canReview?'has-four':''}">
        ${payAction}
        <button type="button" class="tenant-quick-action" onclick="nestiqSwitchTenantTab('maintenance');setTimeout(()=>openTenantReportIssueForm(),100)">
          <span class="tenant-quick-action-icon" data-nq-icon="wrench" data-nq-size="18"></span>
          <span class="tenant-quick-action-label">Report issue</span>
          <span class="tenant-quick-action-hint">Maintenance</span>
        </button>
        <button type="button" class="tenant-quick-action" onclick="nestiqSwitchTenantTab('messages')">
          <span class="tenant-quick-action-icon" data-nq-icon="message-square" data-nq-size="18"></span>
          <span class="tenant-quick-action-label">Message</span>
          <span class="tenant-quick-action-hint">Your caretaker</span>
          <span class="tab-badge" id="tenantHomeMsgBadge" style="display:none">0</span>
        </button>
        ${canReview?`
        <button type="button" class="tenant-quick-action" onclick="nestiqOpenTenantReviewModal()">
          <span class="tenant-quick-action-icon" data-nq-icon="sparkles" data-nq-size="18"></span>
          <span class="tenant-quick-action-label">Write a review</span>
          <span class="tenant-quick-action-hint">Your listing</span>
        </button>`:''}
      </div>
      <div class="tenant-home-grid">
        <div class="tenant-home-col">
          <div class="tenant-section-card tenant-section-card--events">
            <div class="tenant-section-title">Coming up</div>
            <div id="tenantHomeEvents"></div>
          </div>
          <div id="tenantHomeMoveOut"></div>
        </div>
        <div class="tenant-home-col">
          <div class="tenant-section-card" id="tenantLeaseCard"></div>
          <div class="tenant-section-card" id="tenantReviewCard"></div>
        </div>
      </div>
    </div>`;
  renderTenantHomeStatusBanner();
  const statsEl=document.getElementById('tenantHomeQuickStats');
  if(statsEl&&tenant){
    const days=nestiqTenantLeaseDaysRemaining(tenant);
    const openMaint=(window.tenantMaintenance||[]).filter(r=>{
      const stage=nestiqTenantMaintStage(r);
      return stage!=='completed'&&stage!=='cancelled';
    }).length;
    const unreadDocs=nestiqTenantUnreadDocsCount();
    const unreadMsg=nestiqTenantUnreadMsgCount();
    statsEl.innerHTML=`
      <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchTenantTab('documents')">
        <span class="tenant-quick-stat-ico" data-nq-icon="calendar" data-nq-size="16"></span>
        <div class="tenant-quick-stat-val">${days}</div>
        <div class="tenant-quick-stat-lbl">Lease days left</div>
      </button>
      <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchTenantTab('maintenance')">
        <span class="tenant-quick-stat-ico" data-nq-icon="wrench" data-nq-size="16"></span>
        <div class="tenant-quick-stat-val">${openMaint}</div>
        <div class="tenant-quick-stat-lbl">Open requests</div>
      </button>
      <button type="button" class="tenant-quick-stat ${unreadDocs?'has-alert':''}" onclick="nestiqSwitchTenantTab('documents')">
        <span class="tenant-quick-stat-ico" data-nq-icon="folder" data-nq-size="16"></span>
        <div class="tenant-quick-stat-val">${unreadDocs}</div>
        <div class="tenant-quick-stat-lbl">Unread docs</div>
      </button>
      <button type="button" class="tenant-quick-stat ${unreadMsg?'has-alert':''}" onclick="nestiqSwitchTenantTab('messages')">
        <span class="tenant-quick-stat-ico" data-nq-icon="message-square" data-nq-size="16"></span>
        <div class="tenant-quick-stat-val" id="tenantUnreadMsgStatVal">${unreadMsg}</div>
        <div class="tenant-quick-stat-lbl">Unread messages</div>
      </button>`;
  }
  const evEl=document.getElementById('tenantHomeEvents');
  const events=nestiqTenantUpcomingEvents(3);
  if(evEl){
    evEl.innerHTML=events.length?events.map(e=>`
      <div class="tenant-event-row">
        <span class="tenant-event-icon" data-nq-icon="${String(e.icon||'calendar').replace(/"/g,'')}" data-nq-size="16"></span>
        <div class="tenant-event-body">
          <div class="tenant-event-title">${String(e.label||'').replace(/</g,'&lt;')}</div>
          <div class="tenant-event-sub">${String(e.sub||'').replace(/</g,'&lt;')}</div>
        </div>
        <div class="tenant-event-date">${e.date.toLocaleDateString('en-ZA',{day:'numeric',month:'short'})}</div>
      </div>`).join(''):'<div class="tenant-empty-hint">Nothing scheduled. Rent and lease dates appear here as they approach.</div>';
  }
  renderMoveOutChecklist(tenant,nestiqTenantLeaseDaysRemaining(tenant));
  renderTenantLeaseCard(tenant);
  renderTenantReviewCard();
  renderGettingStartedTenant();
  try{ window.nestiqHydrateIcons?.(panel); }catch(_e){}
  try{ nestiqUpdateTenantBadges?.(); }catch(_e){}
}

function renderTenantPaymentsTab(panel){
  const payMode=typeof nestiqTenantPortalMode==='function' && nestiqTenantPortalMode()==='awaiting_payment';
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">${payMode?'Move-in':'Finances'}</div>
      <h1 class="tenant-home-title">${payMode?'Settle to occupy':'Payments'}</h1>
      <p class="tenant-home-sub">${payMode
        ? 'Confirm the amount below. Rent history and maintenance unlock after occupancy is active.'
        : 'Rent status and payment history'}</p>
    </header>
    <div class="tenant-section-card" id="tenantPaymentsRentStatus"></div>
    <div class="tenant-section-card" id="tenantPaymentHistory" ${payMode?'hidden':''}></div>`;
  renderRentStatusCard();
  if(!payMode) renderPaymentHistoryCard();
}

function nestiqMaintTimelineStep(record){
  const stage=nestiqTenantMaintStage(record);
  const steps=['Submitted','Assigned','In Progress','Completed'];
  let idx=0;
  if(stage==='assigned') idx=1;
  else if(stage==='progress') idx=2;
  else if(stage==='completed') idx=3;
  return {steps,idx,stage};
}

function nestiqTenantMaintPhotoUploadHtml(){
  if(typeof uploadAreaHtml==='function'){
    return `<div id="tenantMaintUploadWrap">${uploadAreaHtml({id:'tenantMaintUploadArea',height:100,title:'Add a photo of the problem',sub:'JPG, PNG or WebP — optional, max 2MB',onClick:"pickMaintenancePhoto('tenant')"})}</div>`;
  }
  return `<input class="form-input" type="file" id="portal_maint_photo" accept="image/jpeg,image/png,image/webp,image/*">`;
}

function openTenantReportIssueForm(){
  if(typeof clearPendingMaintenancePhoto==='function') clearPendingMaintenancePhoto('tenant');
  const host=document.getElementById('modalContent');
  if(!host) return;
  host.innerHTML=`
    <div class="nestiq-report-issue">
      <h2 class="modal-title">Report an issue</h2>
      <p class="modal-sub">Tell us what is wrong and add a photo if you can. Your caretaker will review it and keep you updated.</p>
      <div class="form-group">
        <label for="portal_maint_title">Title</label>
        <input class="form-input" id="portal_maint_title" placeholder="e.g. Leaking kitchen tap" autocomplete="off">
      </div>
      <div class="form-group">
        <label for="portal_maint_desc">Description</label>
        <textarea class="form-input form-textarea" id="portal_maint_desc" placeholder="What happened, where it is, and anything that helps us fix it."></textarea>
      </div>
      <div class="form-group">
        <label>Photo of the problem</label>
        ${nestiqTenantMaintPhotoUploadHtml()}
        <span class="nestiq-form-hint">Optional, but a photo helps the caretaker prepare.</span>
      </div>
      <button type="button" class="btn-gold nestiq-report-issue-submit" onclick="nestiqTenantSubmitReportIssue()">Submit request</button>
    </div>`;
  document.querySelector('#modalOverlay .modal')?.classList.add('nestiq-report-issue-modal');
  nestiqOpenModalAnimated();
  setTimeout(()=>document.getElementById('portal_maint_title')?.focus(), 80);
}
window.openTenantReportIssueForm=openTenantReportIssueForm;

async function nestiqTenantSubmitReportIssue(){
  const ok=await submitTenantMaintenance();
  if(ok) nestiqCloseModalAnimated?.();
}
window.nestiqTenantSubmitReportIssue=nestiqTenantSubmitReportIssue;

function setTenantMaintFilter(f,btn){
  __tenantMaintFilter=f;
  document.querySelectorAll('.tenant-maint-filter').forEach(b=>b.classList.toggle('active',b===btn));
  renderTenantMaintList();
}

function renderTenantMaintList(){
  const el=document.getElementById('tenantMaintList');
  if(!el) return;
  let rows=[...(window.tenantMaintenance||[])];
  if(__tenantMaintFilter==='open') rows=rows.filter(r=>nestiqTenantMaintStage(r)==='submitted');
  else if(__tenantMaintFilter==='assigned') rows=rows.filter(r=>nestiqTenantMaintStage(r)==='assigned');
  else if(__tenantMaintFilter==='progress') rows=rows.filter(r=>nestiqTenantMaintStage(r)==='progress');
  else if(__tenantMaintFilter==='resolved') rows=rows.filter(r=>nestiqTenantMaintStage(r)==='completed');
  rows.sort((a,b)=>{
    const ta=new Date(a.createdAt?.toDate?.()||a.assignedAt||a.date||0).getTime()||0;
    const tb=new Date(b.createdAt?.toDate?.()||b.assignedAt||b.date||0).getTime()||0;
    return tb-ta;
  });
  if(!rows.length){
    el.innerHTML=`<div class="tenant-maint-empty"><div class="tenant-maint-empty-icon" aria-hidden="true">🔧</div><div>No requests in this view.</div><div class="tenant-empty-hint">Report an issue and we will keep you updated here.</div></div>`;
    return;
  }
  el.innerHTML=rows.map(r=>{
    const {steps,idx,stage}=nestiqMaintTimelineStep(r);
    const title=String(r.title||r.issueType||'Maintenance').replace(/</g,'&lt;');
    const cat=String(r.issueType||r.issueCategory||'Other').replace(/</g,'&lt;');
    const photo=r.photoUrl||r.photo||'';
    const rated=r.maintenanceRating!=null;
    const resolved=stage==='completed';
    const contractorName=String(r.vendorName||'').replace(/</g,'&lt;');
    const contractor=(stage==='assigned'||stage==='progress')&&contractorName?` · Assigned to ${contractorName}`:'';
    const idJs=String(r.id).replace(/'/g,"\\'");
    return `<div class="tenant-section-card tenant-maint-card">
      <div class="tenant-maint-card-head">
        <div>
          <div class="tenant-maint-card-title">${title}</div>
          <div class="tenant-maint-card-meta">${cat} · Submitted ${nestiqFormatMaintSubmittedDate(r)}${contractor}</div>
        </div>
        ${nestiqTenantMaintPill(r)}
      </div>
      ${typeof window.nestiqMaintVisitBannerHtml==='function'?window.nestiqMaintVisitBannerHtml(r):''}
      ${stage==='cancelled'?'':`<div class="tenant-maint-timeline" role="list">${steps.map((s,i)=>`<div class="tenant-maint-step${i<idx||stage==='completed'?' is-done':''}${i===idx?' active':''}" role="listitem">${s}</div>`).join('')}</div>`}
      ${photo?`<img src="${photo}" class="tenant-maint-photo" alt="">`:''}
      ${resolved&&!rated?`<div style="margin-top:10px"><div style="font-size:0.78rem;margin-bottom:6px">Rate this repair:</div><div>${[1,2,3,4,5].map(n=>`<button type="button" class="btn-outline btn-sm" style="padding:4px 8px;margin-right:4px" onclick="nestiqRateMaintenance('${idJs}',${n})">★${n}</button>`).join('')}</div></div>`:''}
      ${rated?`<div style="font-size:0.78rem;color:var(--gold);margin-top:8px">Rated ${r.maintenanceRating}/5 ★</div>`:''}
      ${resolved&&r.resolved==null?`<div style="margin-top:12px;padding:12px;background:rgba(201,168,76,0.08);border-radius:10px;border:1px solid var(--gold)">
        <div style="font-size:0.86rem;font-weight:600;margin-bottom:8px">Was the problem resolved?</div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn-gold btn-sm" onclick="nestiqTenantConfirmResolved('${idJs}',true)">Yes, it's fixed</button>
          <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick="nestiqTenantConfirmResolved('${idJs}',false)">No, reopen</button>
        </div>
      </div>`:''}
      ${resolved&&r.resolved===true?`<div style="font-size:0.78rem;color:var(--sage);margin-top:8px">You confirmed this issue was resolved.</div>`:''}
      ${r.reopenedCount>0?`<div style="font-size:0.72rem;color:var(--rust);margin-top:4px">Reopened ${r.reopenedCount} time${r.reopenedCount>1?'s':''}</div>`:''}
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
    nestiqShowNotif('Thanks for your feedback!','success');
  }catch(e){ nestiqShowNotif('Could not save rating','error'); }
}
window.nestiqRateMaintenance=nestiqRateMaintenance;

async function nestiqTenantConfirmResolved(id, yes){
  try{
    const lid=window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId;
    const db=window.nestiqDb;
    if(!lid||!db) throw new Error('Not connected');
    const r=(window.tenantMaintenance||[]).find(x=>String(x.id)===String(id));
    if(yes){
      await window.nestiqFs.maintenance(db,lid).doc(String(id)).update({resolved:true});
      if(r) r.resolved=true;
      nestiqShowNotif?.("Thanks for confirming - glad it's fixed!",'success');
    }else{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(db,lid).doc(String(id)).update({
        status:'progress',
        resolved:false,
        reopenedCount:fv.increment(1)
      });
      if(r){
        r.status='progress';
        r.resolved=false;
        r.reopenedCount=(Number(r.reopenedCount)||0)+1;
      }
      nestiqShowNotif?.('Request reopened — the contractor has been notified.','info');
      try{
        sendBrowserNotif?.('Maintenance Reopened',`Tenant reopened: ${r?.title||'maintenance request'}`,{tag:'reopen-'+id});
      }catch(_e){}
    }
    renderTenantMaintList();
  }catch(e){
    console.warn('NestIQ: confirm resolved failed', e);
    nestiqShowNotif?.('Could not update — try again.','error');
  }
}
window.nestiqTenantConfirmResolved=nestiqTenantConfirmResolved;

function renderTenantMaintenanceTab(panel){
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Care</div>
      <h1 class="tenant-home-title">Maintenance</h1>
      <p class="tenant-home-sub">Follow each request from submitted through to completed.</p>
    </header>
    <button type="button" class="tenant-quick-action primary" style="width:100%;margin-bottom:16px" onclick="openTenantReportIssueForm()">
      <span class="tenant-quick-action-icon" data-nq-icon="wrench" data-nq-size="18"></span>
      <span class="tenant-quick-action-label">Report a new issue</span>
      <span class="tenant-quick-action-hint">Average response within 1–2 business days</span>
    </button>
    <div class="tenant-maint-filters">
      <button type="button" class="tenant-maint-filter active" onclick="setTenantMaintFilter('all',this)">All</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('open',this)">Submitted</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('assigned',this)">Assigned</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('progress',this)">In Progress</button>
      <button type="button" class="tenant-maint-filter" onclick="setTenantMaintFilter('resolved',this)">Completed</button>
    </div>
    <div id="tenantMaintList"></div>`;
  renderTenantMaintList();
  try{ window.nestiqHydrateIcons?.(panel); }catch(_e){}
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
      <h1 class="tenant-home-title">Chats</h1>
      <p class="tenant-home-sub">Message your property caretaker. Newest activity appears at the top.</p>
    </header>
    <div id="tenantMessagesCard"></div>`;
  renderMessagesCard();
}

function renderTenantProfileTab(panel){
  const mode=typeof nestiqTenantPortalMode==='function'?nestiqTenantPortalMode():'active';
  const s=typeof getSession==='function'?getSession():null;
  const tenant=window.currentTenantData||{
    name:s?.name||'',
    email:s?.email||'',
    phone:s?.phone||'',
    profilePhoto:s?.profilePhoto||'',
    preferredLanguage:(getCurrentLanguage?.()||'en'),
    preferredTheme:(getThemeName?.()||'gold')
  };
  if(!panel) return;
  const photo=tenant.profilePhoto||tenant.avatar||'';
  const lang=(tenant.preferredLanguage||getCurrentLanguage?.()||'en').toLowerCase();
  const themeName=tenant.preferredTheme||getThemeName?.()||'gold';
  const occupancy=mode==='active';
  panel.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Account</div>
      <h1 class="tenant-home-title">Profile</h1>
      <p class="tenant-home-sub">${occupancy?'Your details and preferences':'Your applicant account. Occupied-unit details appear after your lease is signed.'}</p>
    </header>
    <div class="tenant-section-card" style="text-align:center">
      <div class="tenant-profile-photo-wrap">
        <div class="tenant-profile-photo" id="tenantProfilePhoto">${(photo&&(photo.startsWith('data:')||photo.startsWith('http')))?`<img src="${photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="" referrerpolicy="no-referrer">`:String(tenant.name||'A').slice(0,1)}</div>
        ${window.currentTenantData?`<button type="button" class="tenant-profile-photo-edit" onclick="document.getElementById('tenantProfilePhotoInput').click()">✏</button>
        <input type="file" id="tenantProfilePhotoInput" accept="image/*" hidden>`:''}
      </div>
      <div class="form-group"><label>Name</label><input class="form-input" id="tenantProfName" value="${String(tenant.name||'').replace(/"/g,'&quot;')}" ${window.currentTenantData?'':'disabled'}></div>
      <div class="form-group"><label>Email</label><input class="form-input" id="tenantProfEmail" type="email" value="${String(tenant.email||'').replace(/"/g,'&quot;')}" disabled></div>
      <div class="form-group"><label>Phone</label><input class="form-input" id="tenantProfPhone" value="${String(tenant.phone||'').replace(/"/g,'&quot;')}" ${window.currentTenantData?'':'disabled'}></div>
      ${occupancy?`<div class="form-group"><label>Emergency Contact</label><input class="form-input" id="tenantProfEmergency" value="${String(tenant.emergencyContact||'').replace(/"/g,'&quot;')}" placeholder="Name & phone"></div>`:''}
      ${window.currentTenantData?`<button type="button" class="btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="saveTenantProfileFields()">Save Profile</button>`:''}
    </div>
    <div class="tenant-section-card">
      <div class="tenant-section-title">Preferences</div>
      <div class="form-group"><label>Language</label>
        <select class="form-input" id="tenantProfLang" onchange="setTenantPreferredLanguage(this.value)">
          <option value="en" ${lang==='en'?'selected':''}>${t?.('lang.english')||'English'}</option>
          <option value="af" ${lang==='af'?'selected':''}>${t?.('lang.afrikaans')||'Afrikaans'}</option>
          <option value="zu" ${lang==='zu'?'selected':''}>${t?.('lang.zulu')||'isiZulu'}</option>
          <option value="xh" ${lang==='xh'?'selected':''}>${t?.('lang.xhosa')||'isiXhosa'}</option>
          <option value="st" ${lang==='st'?'selected':''}>${t?.('lang.sotho')||'Sesotho'}</option>
        </select>
      </div>
      <div class="form-group"><label>Theme</label>
        <div class="tenant-theme-picks">
          ${Object.entries(themes||{gold:{name:'Gold',preview:'#c9a84c'}}).map(([k,th])=>`<button type="button" class="tenant-theme-pick ${themeName===k?'is-on':''}" data-theme-pick="${k}" onclick="applyTenantTheme('${k}')"><span class="tenant-theme-swatch" style="background:${th.preview||'#c9a84c'}"></span><span>${th.name||k}</span></button>`).join('')}
        </div>
      </div>
      ${occupancy?`<div class="settings-toggle-row"><span>Rent reminders</span><input type="checkbox" id="tenantNotifRent" ${tenant.notifyRent!==false?'checked':''}></div>
      <div class="settings-toggle-row"><span>Maintenance updates</span><input type="checkbox" id="tenantNotifMaint" ${tenant.notifyMaint!==false?'checked':''}></div>
      <div class="settings-toggle-row"><span>Notices from landlord</span><input type="checkbox" id="tenantNotifNotices" ${tenant.notifyNotices!==false?'checked':''}></div>
      <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:10px" onclick="saveTenantNotificationPrefs()">Save notification preferences</button>`:''}
    </div>
    ${occupancy?`<div class="tenant-section-card" id="tenantUtilitiesCard"></div>
    <div class="tenant-section-card" id="tenantPropertyInfo"></div>
    ${nestiqTenantReviewableProperties().length?`<button type="button" class="btn-gold btn-sm" style="width:100%;margin-bottom:10px;justify-content:center" onclick="nestiqOpenTenantReviewModal()">Write a Review</button>`:''}`:''}
    <button type="button" class="btn-outline btn-sm" style="width:100%;margin-bottom:10px;justify-content:center" onclick="openTenantChangePasswordModal()">Change Password</button>
    <button type="button" class="tenant-logout-btn" onclick="nestiqTenantLogout()">Log Out</button>`;
  document.getElementById('tenantProfilePhotoInput')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];
    if(!f) return;
    compressImage(f,400,0.8,async b64=>{
      try{
        nestiqShowNotif?.('Uploading photo…','info');
        await saveTenantProfilePhoto(b64);
        renderTenantProfileTab(panel);
        nestiqShowNotif?.('Profile photo saved','success');
      }catch(err){
        console.error('Tenant profile photo', err);
        nestiqShowNotif?.('Could not save photo. Try a smaller image.','error');
      }
    });
  });
  if(occupancy){
    renderUtilityCard(tenant);
    renderPropertyInfoCard();
  }
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
  nestiqShowNotif('Profile updated','success');
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
  try{
    const s=typeof getSession==='function'?getSession():window.__nestiqSession;
    if(s&&s.role==='tenant'){
      s.profilePhoto=photoUrl;
      window.__nestiqSession=s;
      sessionStorage.setItem('nestiq-session', JSON.stringify(s));
    }
  }catch(_e){}
  try{ window.syncNavUserUi?.(); }catch(_e){}
  return photoUrl;
}

async function saveTenantNotificationPrefs(){
  const tenant=window.currentTenantData;
  if(!tenant) return;
  tenant.notifyRent=Boolean(document.getElementById('tenantNotifRent')?.checked);
  tenant.notifyMaint=Boolean(document.getElementById('tenantNotifMaint')?.checked);
  tenant.notifyNotices=Boolean(document.getElementById('tenantNotifNotices')?.checked);
  await nestiqPersistTenantProfile(tenant);
  nestiqShowNotif('Notification preferences saved','success');
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
    ${typeof nestiqPasswordGroupHtml==='function'?nestiqPasswordGroupHtml('tenant',{label:'New Password'}):`<div class="form-group"><label>New Password</label><input class="form-input" id="tenantNewPass" type="password" autocomplete="new-password"></div>`}
    <div class="form-group"><label>Confirm Password</label><input class="form-input" id="tenantNewPass2" type="password" autocomplete="new-password" oninput="nestiqRefreshPasswordRulesUi('tenant')">
      <div id="tenant_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
    </div>
    <button class="btn-primary" style="width:100%;margin-top:12px" onclick="submitTenantPasswordChange()">Update Password</button>`;
  nestiqOpenModalAnimated();
}
window.openTenantChangePasswordModal=openTenantChangePasswordModal;

async function submitTenantPasswordChange(){
  const p1=document.getElementById('tenantNewPass')?.value||'';
  const p2=document.getElementById('tenantNewPass2')?.value||'';
  const st=typeof nestiqPasswordStrength==='function'?nestiqPasswordStrength(p1):{ok:false};
  if(!st.ok){ nestiqShowNotif(window.NESTIQ_PW_FAIL||'Please meet all password requirements.','error'); return; }
  if(p1!==p2){ nestiqShowNotif('Passwords do not match','error'); return; }
  const u=firebase.auth?.()?.currentUser;
  if(!u){ nestiqShowNotif('Not signed in','error'); return; }
  try{
    await u.updatePassword(p1);
    nestiqCloseModalAnimated();
    nestiqShowNotif('Password updated','success');
  }catch(e){
    nestiqShowNotif(e?.message||'Could not update password','error');
  }
}
window.submitTenantPasswordChange=submitTenantPasswordChange;

function nestiqTenantRefreshVisibleSections(){
  updateTenantTabBadges();
  const homePanel=document.getElementById('tTab-home');
  if(homePanel && (__tenantActiveTab==='home'||homePanel.classList.contains('active'))
     && !homePanel.querySelector('.tenant-home-title,.nestiq-applicant-hero,.nestiq-movein')){
    __tenantTabsLoaded.home=false;
    nestiqSafeTenantRender(()=>nestiqRenderTenantHome(homePanel), 'home-refresh');
    __tenantTabsLoaded.home=!!homePanel.querySelector('.tenant-home-title,.nestiq-applicant-hero,.nestiq-movein');
  }
  if(document.getElementById('tenantHomeStatusBanner')) renderTenantHomeStatusBanner();
  if(document.getElementById('tenantPaymentsRentStatus')) renderRentStatusCard();
  if(document.getElementById('paymentHistory')) renderPaymentHistoryCard();
  if(document.getElementById('tenantMaintList')) renderTenantMaintList();
  if(document.getElementById('tenantDocumentsCard')) renderDocumentsCard();
  if(document.getElementById('tenantLeaseCard')) renderTenantLeaseCard(window.currentTenantData);
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
  if(!banner) return;
  const unassigned=typeof nestiqTenantSessionIsUnassigned==='function' && nestiqTenantSessionIsUnassigned();
  const inviteCta=unassigned
    ? `<button type="button" class="btn-gold btn-sm" style="margin-top:12px" onclick="location.hash='#listings'">Browse listings</button>`
    : '';
  banner.innerHTML=`<div style="padding:14px;border-radius:12px;border:1px solid rgba(196,106,58,0.45);background:rgba(196,106,58,0.08);font-size:0.88rem;line-height:1.5">${String(message||'Unable to load your portal.').replace(/</g,'&lt;')}</div>
      <button type="button" class="btn-outline btn-sm" style="margin-top:12px" onclick="location.reload()">Retry</button>
      ${inviteCta}
      <button type="button" class="btn-outline btn-sm" style="margin-top:12px;margin-left:8px" onclick="nestiqTenantLogout()">Log out</button>`;
}
window.nestiqShowTenantDashboardError=nestiqShowTenantDashboardError;

function nestiqTenantLogout(){
  if(typeof window.nestiqConfirmSignOut==='function'){
    window.nestiqConfirmSignOut({role:'tenant'});
    return;
  }
  try{ window.logoutSession?.({dest:'tenant'}); }catch(_e){
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

function nestiqZarLabel(n){
  return 'R'+Number(n||0).toLocaleString('en-ZA');
}

function nestiqMoveInPanelHtml(due, opts){
  opts=opts||{};
  const d=due&&typeof due==='object'?due:{total:0,depositDue:0,rentDue:0};
  const variant=String(opts.variant||'full');
  const compact=variant==='compact';
  const unit=String(opts.unit||'').replace(/</g,'&lt;');
  const property=String(opts.property||'').replace(/</g,'&lt;');
  const place=[unit,property].filter(Boolean).join(' · ')||'Your unit';
  const leaseIdJs=opts.leaseIdJs||'';
  const lines=[];
  if(d.depositDue) lines.push({k:'Security deposit',v:nestiqZarLabel(d.depositDue),hint:'Held for the landlord under the Rental Housing Act'});
  if(d.rentDue) lines.push({k:'First month rent',v:nestiqZarLabel(d.rentDue),hint:'Collected now so occupancy can start'});
  const lineHtml=lines.map(r=>`
    <div class="nestiq-movein-line">
      <div>
        <div class="nestiq-movein-line-k">${r.k}</div>
        ${compact?'':`<div class="nestiq-movein-line-h">${r.hint}</div>`}
      </div>
      <div class="nestiq-movein-line-v">${r.v}</div>
    </div>`).join('');
  const rail=`
    <ol class="nestiq-movein-rail" aria-label="Move-in progress">
      <li class="is-done">Applied</li>
      <li class="is-done">Lease signed</li>
      <li class="is-current">Pay to occupy</li>
      <li>Keys &amp; rent cycle</li>
    </ol>`;
  if(compact){
    return `
      <div class="nestiq-movein nestiq-movein--banner">
        <div class="nestiq-movein-copy">
          <div class="nestiq-applicant-hero-eyebrow">Move-in</div>
          <div class="nestiq-movein-banner-title">Pay to activate occupancy</div>
          <div class="nestiq-movein-banner-sub">${place} stays reserved until ${nestiqZarLabel(d.total)} is confirmed.</div>
        </div>
        <div class="nestiq-movein-banner-amt">${nestiqZarLabel(d.total)}</div>
        <button type="button" class="btn-gold" onclick="nestiqShowMoveInPaymentModal()">Pay now</button>
      </div>`;
  }
  return `
    <div class="nestiq-movein nestiq-movein--${variant==='payments'?'payments':'hero'}">
      ${rail}
      <div class="nestiq-movein-body">
        <div class="nestiq-movein-copy">
          <div class="nestiq-applicant-hero-eyebrow">Lease signed</div>
          <h2>${variant==='payments'?'Amount due to occupy':'One payment to occupy'}</h2>
          <p>${place} is reserved for you. Confirm this amount and your tenancy becomes active. Recurring rent then follows the lease due day.</p>
        </div>
        <div class="nestiq-movein-total">
          <div class="nestiq-movein-total-k">Due now</div>
          <div class="nestiq-movein-total-v">${nestiqZarLabel(d.total)}</div>
        </div>
      </div>
      <div class="nestiq-movein-breakdown">${lineHtml||'<div class="nestiq-movein-line"><div class="nestiq-movein-line-k">Nothing outstanding</div></div>'}</div>
      <div class="nestiq-applicant-hero-actions nestiq-movein-actions">
        ${leaseIdJs?`<button type="button" class="btn-outline" onclick='nestiqOpenLeasePdf(${leaseIdJs},{preview:true})'>View lease</button>`:''}
        <button type="button" class="btn-gold" onclick="nestiqShowMoveInPaymentModal()">Pay ${nestiqZarLabel(d.total)}</button>
      </div>
    </div>`;
}
window.nestiqMoveInPanelHtml=nestiqMoveInPanelHtml;

function nestiqApplicantFirstName(){
  const t=window.currentTenantData;
  const s=typeof getSession==='function'?getSession():null;
  const name=String(t?.name||s?.name||s?.email||'there').trim();
  return name.split(/\s+/)[0]||'there';
}

function nestiqRenderApplicantHome(container, mode){
  const host=container||document.getElementById('tTab-home');
  if(!host) return;
  const first=nestiqApplicantFirstName();
  const pay=mode==='awaiting_payment';
  const lease=mode==='lease'||pay;
  const tenant=window.currentTenantData;
  const leaseDoc=tenant&&typeof window.nestiqPrimaryLeaseForTenant==='function'
    ? window.nestiqPrimaryLeaseForTenant(tenant.id)
    : null;
  const leaseIdJs=leaseDoc?JSON.stringify(String(leaseDoc.id)):'';
  const canSign=leaseDoc && (leaseDoc.storedStatus==='pending_signature'||leaseDoc.status==='pending_signature') && !!leaseDoc.landlordSigned && !leaseDoc.tenantSigned;
  const due=pay&&leaseDoc&&typeof window.nestiqLeaseInitialDue==='function'?window.nestiqLeaseInitialDue(leaseDoc, tenant):null;
  host.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">${pay?'Move-in payment':(lease?'Almost there':'Applicant portal')}</div>
      <h1 class="tenant-home-title">${pay?'Pay to activate your tenancy':(lease?'Your application was approved':('Welcome, '+String(first).replace(/</g,'&lt;')))}</h1>
      <p class="tenant-home-sub">${pay
        ? 'You have signed the lease. Pay the required move-in amount. The unit stays reserved until this payment is confirmed.'
        : (lease
        ? 'Review and sign your lease. After you sign, you may need to pay the deposit before the unit is occupied.'
        : 'Browse listings and apply for a vacant unit. You keep this account while you wait — you become a tenant only after a lease is signed.')}</p>
    </header>
    ${pay?nestiqMoveInPanelHtml(due||{total:0},{
        variant:'full',
        unit:tenant?.unit,
        property:tenant?.property,
        leaseIdJs
      }):lease?`<div class="nestiq-applicant-hero nestiq-applicant-hero--approved">
      <div>
        <div class="nestiq-applicant-hero-eyebrow">Application approved</div>
        <h2>Congratulations</h2>
        <p>${String(tenant?.unit||'Your unit').replace(/</g,'&lt;')} at ${String(tenant?.property||'the property').replace(/</g,'&lt;')} is ready for lease.</p>
      </div>
      <div class="nestiq-applicant-hero-actions">
        ${leaseIdJs?`<button type="button" class="btn-gold" onclick='nestiqOpenLeasePdf(${leaseIdJs},{preview:true})'>View Lease</button>`:''}
        ${canSign?`<button type="button" class="btn-outline" onclick='nestiqOpenTenantSignLeaseModal(${leaseIdJs})'>Sign lease</button>`:''}
      </div>
    </div>`:`<div class="nestiq-applicant-hero">
      <div>
        <div class="nestiq-applicant-hero-eyebrow">Looking for a place</div>
        <h2>Find a vacant unit</h2>
        <p>Submitting an application does not occupy the unit. Track every step under My Applications.</p>
      </div>
      <div class="nestiq-applicant-hero-actions">
        <button type="button" class="btn-gold" onclick="location.hash='#listings'">Browse listings</button>
        <button type="button" class="btn-outline" onclick="nestiqSwitchTenantTab('applications')">My Applications</button>
      </div>
    </div>`}
    <div id="nestiqApplicantHomeApps"></div>`;
  nestiqRenderTenantApplications(document.getElementById('nestiqApplicantHomeApps'));
  try{ window.nestiqHydrateIcons?.(host); }catch(_e){}
}

function nestiqPaintMyApplications(host, rows){
  window.__nestiqMyApplicationsCache=Array.isArray(rows)?rows:[];
  nestiqApplyTenantPortalChrome();
  const infoN=(window.__nestiqMyApplicationsCache||[]).filter(a=>String(a.status||'')==='info_required').length;
  const appsBadge=document.getElementById('tabBadge-applications');
  if(appsBadge){
    appsBadge.textContent=infoN>99?'99+':String(infoN);
    appsBadge.style.display=infoN?'flex':'none';
  }
  if(!host) return;
  const nested=host.id==='nestiqApplicantHomeApps';
  const cardFn=typeof nestiqMyApplicationCardHtml==='function'?nestiqMyApplicationCardHtml:null;
  if(!rows.length){
    if(nested){ host.innerHTML=''; return; }
    host.innerHTML=`<div class="nestiq-myapp-empty">
      <div class="nestiq-myapp-empty-icon" aria-hidden="true">🏠</div>
      <h2>No applications yet</h2>
      <p>Browse listings and apply for a vacant unit. You will track the landlord's decision here.</p>
      <button type="button" class="btn-gold" onclick="location.hash='#listings'">Browse listings</button>
    </div>`;
    return;
  }
  const list=`<div class="nestiq-myapp-list">${rows.map(a=>cardFn?cardFn(a):'').join('')}</div>`;
  if(nested){
    host.innerHTML=`<div class="nestiq-myapp-home-label">Your applications</div>${list}`;
    return;
  }
  host.innerHTML=`
    <header class="tenant-home-header">
      <div class="tenant-home-kicker">Applications</div>
      <h1 class="tenant-home-title">My Applications</h1>
      <p class="tenant-home-sub">Follow each application from review to lease. Tenancy tools stay hidden until a lease is signed.</p>
    </header>
    ${list}`;
  try{ window.nestiqHydrateIcons?.(host); }catch(_e){}
}

function nestiqRenderTenantApplications(container){
  const host=container||document.getElementById('tTab-applications');
  if(!host) return;
  if(!host.innerHTML || !host.querySelector('.nestiq-myapp-list,.nestiq-myapp-empty,.nestiq-myapp-card')){
    host.innerHTML=`<div class="nestiq-myapp-empty"><p class="nestiq-papp-muted">Loading your applications…</p></div>`;
  }
  const paint=rows=>nestiqPaintMyApplications(host, rows||[]);
  if(typeof nestiqWatchMyApplications==='function'){
    nestiqWatchMyApplications(paint);
  }else{
    Promise.resolve(typeof nestiqFetchMyApplications==='function'?nestiqFetchMyApplications():[])
      .then(paint)
      .catch(()=>paint([]));
  }
}
window.nestiqRenderTenantApplications=nestiqRenderTenantApplications;
window.nestiqRenderApplicantHome=nestiqRenderApplicantHome;

function nestiqShowUnassignedApplicantPortal(){
  nestiqShowTenantDashboardLoading(false);
  nestiqApplyTenantPortalChrome();
  const greeting=document.getElementById('tenantGreeting');
  if(greeting) greeting.textContent='Hi, '+nestiqApplicantFirstName();
  const banner=document.getElementById('tenantWelcomeBanner');
  if(banner) banner.innerHTML='';
  Object.keys(__tenantTabsLoaded).forEach(k=>{ __tenantTabsLoaded[k]=false; });
  nestiqSwitchTenantTab('home');
}
window.nestiqShowUnassignedApplicantPortal=nestiqShowUnassignedApplicantPortal;

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
    const unassigned=typeof nestiqTenantSessionIsUnassigned==='function' && nestiqTenantSessionIsUnassigned();
    if(unassigned){
      nestiqShowUnassignedApplicantPortal();
      return;
    }
    nestiqShowTenantDashboardLoading(true);
    return;
  }
  nestiqShowTenantDashboardLoading(false);
  nestiqApplyTenantPortalChrome();
  try{ nestiqCheckPayFastReturn?.(); }catch(_e){}
  if(!document.getElementById('tenantTabContent')) return;
  nestiqSafeTenantRender(()=>renderTenantProfile(), 'profile');
  // Set greeting based on time of day
  try{
    const hour=new Date().getHours();
    const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
    const first=String(tenant.name||nestiqApplicantFirstName()||'there').trim().split(/\s+/)[0]||'there';
    const greetingEl=document.getElementById('tenantGreeting');
    if(greetingEl) greetingEl.textContent=greeting+', '+first;
  }catch(_e){}

  nestiqUpdateTenantBadges?.();
  const mode=nestiqTenantPortalMode();
  if(mode!=='active' && (__tenantActiveTab==='payments'||__tenantActiveTab==='maintenance'||__tenantActiveTab==='documents'||__tenantActiveTab==='messages')){
    __tenantActiveTab='home';
  }
  // Always paint the active tab after data (or a page remount) — never leave Home as empty placeholders.
  const tab=__tenantActiveTab||'home';
  __tenantTabsLoaded[tab]=false;
  nestiqSwitchTenantTab(tab);
  setTimeout(()=>{ try{ nestiqUpdateTenantBadges?.(); }catch(_e){} }, 500);
  try{ applyTranslations?.(); }catch(err){ console.error('Tenant dashboard i18n', err); }
}

function setTenantPreferredLanguage(lang){
  const next=nestiqNormalizeLang?.(lang)||String(lang||'en').toLowerCase();
  const tenant=getCurrentTenant()||window.currentTenantData;
  if(tenant){
    tenant.preferredLanguage=next;
    saveData?.();
    nestiqPersistTenantProfile(tenant);
  }
  setLanguage?.(next,{skipTenantPersist:true});
  const sel=document.getElementById('tenantProfLang');
  if(sel) sel.value=next;
  nestiqShowNotif?.(typeof t==='function'?t('notif.languageChanged'):'Language updated','success');
}

window.renderTenantDashboard=renderTenantDashboard;
window.openTenantPayModal=openTenantPayModal;
window.nestiqShowPayConfirmModal=nestiqShowPayConfirmModal;
window.nestiqTenantPayWithPayFast=nestiqTenantPayWithPayFast;
window.nestiqCheckPayFastReturn=nestiqCheckPayFastReturn;
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
