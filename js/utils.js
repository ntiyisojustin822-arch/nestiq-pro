/** Safe embedding of a value in HTML inline onclick="fn(…)" handlers */
function nestiqHtmlJsArg(v){
  return JSON.stringify(v);
}
window.nestiqHtmlJsArg=nestiqHtmlJsArg;

/** Tenant portal photo URL (https or data:) — empty if none / emoji-only. */
function nestiqTenantPhotoUrl(t){
  const p=t&&t.profilePhoto!=null?String(t.profilePhoto).trim():'';
  if(/^https?:\/\//i.test(p)||p.startsWith('data:image')) return p;
  return '';
}
window.nestiqTenantPhotoUrl=nestiqTenantPhotoUrl;

function nestiqEscAttr(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
window.nestiqEscAttr=nestiqEscAttr;

/** Landlord UI avatar: profile photo when set, else emoji. */
function nestiqTenantAvatarHtml(t, opts){
  opts=opts||{};
  const cls=String(opts.className||'tenant-avatar');
  const photo=nestiqTenantPhotoUrl(t);
  const fallback=String(t&&t.avatar!=null&&String(t.avatar).trim()!==''?t.avatar:'👤');
  if(photo){
    return `<div class="${cls}" aria-hidden="true"><img src="${nestiqEscAttr(photo)}" alt="" loading="lazy"/></div>`;
  }
  return `<div class="${cls}" aria-hidden="true">${fallback}</div>`;
}
window.nestiqTenantAvatarHtml=nestiqTenantAvatarHtml;

/** Compact avatar for titles / inline heads. */
function nestiqTenantAvatarInlineHtml(t, sizePx){
  const size=Number(sizePx)||28;
  const photo=nestiqTenantPhotoUrl(t);
  const fallback=String(t&&t.avatar!=null&&String(t.avatar).trim()!==''?t.avatar:'👤');
  if(photo){
    return `<img class="nestiq-tenant-av-inline" src="${nestiqEscAttr(photo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px" loading="lazy"/>`;
  }
  return `<span class="nestiq-tenant-av-inline" style="margin-right:6px">${fallback}</span>`;
}
window.nestiqTenantAvatarInlineHtml=nestiqTenantAvatarInlineHtml;

/** App root (folder containing the SPA index.html), always ends with /. Fixes …/index.html/?… vs other *.html paths. */
function nestiqAppBaseUrl(){
  let p=String(location.pathname||'/');
  if(/\/index\.html\/*$/i.test(p)||/^index\.html\/*$/i.test(p)){
    p=p.replace(/\/index\.html\/*$/i,'').replace(/^index\.html\/*$/i,'');
    p=p.replace(/\/+$/,'');
    if(!p) p='/';
    return location.origin+p+(p.endsWith('/')?'':'/');
  }
  const i=p.lastIndexOf('/');
  return location.origin+(i>=0?p.slice(0,i+1):'/');
}
try{ window.nestiqAppBaseUrl=nestiqAppBaseUrl; }catch(_e){}

function downloadCSV(content, filename){
  const blob=new Blob([content],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function backupData(){
  const data=JSON.stringify({expenses,tenantsData,maintenanceData,propertiesData,propertyPhotos,maintenancePhotos,applications:typeof applications!=='undefined'?applications:[],version:'nestiq-pro-1.0'},null,2);
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='nestiq-backup-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showNotif('💾 Backup downloaded!','success');
}

function restoreData(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json';
  input.onchange=e=>{
    const file=e.target.files[0];
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        if(d.expenses) expenses=d.expenses;
        if(d.tenantsData) tenantsData=d.tenantsData;
        if(d.maintenanceData) maintenanceData=d.maintenanceData;
        if(d.propertiesData){ propertiesData.splice(0,propertiesData.length,...d.propertiesData); }
        if(d.propertyPhotos && typeof d.propertyPhotos==='object'){ propertyPhotos=d.propertyPhotos; photos=propertyPhotos; }
        if(d.maintenancePhotos && typeof d.maintenancePhotos==='object') maintenancePhotos=d.maintenancePhotos;
        if(Array.isArray(d.applications) && typeof applications!=='undefined'){
          applications.splice(0,applications.length,...d.applications);
          try{ window.applications=applications; }catch(_e){}
          if(typeof normalizeStoredApplications==='function') normalizeStoredApplications();
        }
        saveData();
        showNotif('📂 Data restored successfully!','success');
        renderExpenses(); renderTenants(); renderKanban(); renderProperties();
      }catch(err){showNotif('Invalid backup file','error');}
    };
    reader.readAsText(file);
  };
  input.click();
}

function normalizeZAPhone(raw){
  const digits=String(raw||'').replace(/[^\d]/g,'');
  if(!digits) return '';
  if(digits.startsWith('0')) return '27'+digits.slice(1);
  if(digits.startsWith('27')) return digits;
  if(digits.startsWith('+' )) return digits.replace(/^\+/, '');
  return digits;
}

function formatWhatsAppNumber(phone){
  let cleaned=String(phone||'').replace(/[\s\-\(\)]/g,'');
  cleaned=cleaned.replace(/[^\d+]/g,'');
  if(cleaned.startsWith('+27')) return cleaned.slice(1);
  if(cleaned.startsWith('0')) return '27'+cleaned.slice(1);
  if(cleaned.startsWith('27')) return cleaned;
  return cleaned.replace(/^\+/,'');
}

function whatsappIconSvg(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.07-1.35C8.44 21.51 10.19 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.64 13.27c-.19.54-1.11 1.03-1.52 1.09-.41.06-.42.32-2.65-.57-.89-.21-2.02-.82-2.87-1.59-.76-.7-1.27-1.53-1.42-1.74-.15-.21-.01-.32.11-.43.11-.09.24-.24.36-.36.12-.12.16-.21.24-.35.08-.14.04-.26-.02-.37-.06-.11-.57-1.38-.79-1.88-.2-.48-.41-.42-.57-.43-.15-.01-.32-.01-.49-.01s-.45.06-.68.32c-.23.26-.89.87-.89 2.13s.91 2.47 1.04 2.64c.13.17 1.79 2.72 4.33 3.71.61.26 1.08.42 1.45.53.61.19 1.16.17 1.6.1.49-.08 1.5-.61 1.71-1.2z"/></svg>`;
}

function getTenantDueDateText(tenant){
  const now=new Date();
  const dueDay=Math.max(1,Math.min(28,Number(tenant?.monthlyDueDate||1)));
  return `${dueDay} ${now.toLocaleString('en-ZA',{month:'long'})} ${now.getFullYear()}`;
}

function getTenantDaysOverdue(tenant){
  const now=new Date();
  const dueDay=Math.max(1,Math.min(28,Number(tenant?.monthlyDueDate||1)));
  const dueDate=new Date(now.getFullYear(), now.getMonth(), dueDay);
  if(now<=dueDate) return 0;
  return Math.ceil((now-dueDate)/86400000);
}

function formatPortalPaymentReference(tenant, date=new Date()){
  const fmt=String(landlordSettings?.portal?.paymentReferenceFormat||'[TenantName]-[Month]-[Year]');
  const month=date.toLocaleString('en-ZA',{month:'long'});
  const year=String(date.getFullYear());
  const tname=String(tenant?.name||'Tenant').replace(/\s+/g,'');
  return fmt
    .replace(/\[TenantName\]/gi,tname)
    .replace(/\[Month\]/gi,month)
    .replace(/\[Year\]/gi,year);
}
window.formatPortalPaymentReference=formatPortalPaymentReference;

const whatsappTemplates={
  rentReminder(tenant){
    const base=`Hi ${tenant.name}, this is a friendly reminder that your rent of R${Number(tenant.rent||0).toLocaleString()} for ${tenant.property} - ${tenant.unit} is due on the ${getTenantDueDateText(tenant)} of this month. Please ensure payment is made on time. Thank you.`;
    const po=landlordSettings?.portal||{};
    const ref=formatPortalPaymentReference(tenant);
    const bankLine=(po.bankName||po.accountNumber)
      ? `\nBank: ${po.bankName||'—'} · Acc ${po.accountNumber||'—'} · Branch ${po.branchCode||'—'} · ${po.accountType||'Cheque'} · Ref: ${ref}`
      : `\nSuggested payment reference: ${ref}`;
    return `${base}${bankLine} — NestIQ Pro`;
  },
  overdueNotice(tenant, daysOverdue){
    return `Hi ${tenant.name}, your rent of R${Number(tenant.rent||0).toLocaleString()} for ${tenant.property} - ${tenant.unit} was due ${daysOverdue} days ago and has not been received. Please make payment as soon as possible or contact us to make arrangements. — NestIQ Pro`;
  },
  paymentConfirmation(tenant, payment){
    return `Hi ${tenant.name}, thank you for your payment.\nAmount: R${Number(payment?.amount||tenant.rent||0).toLocaleString()}\nDate: ${isoToPretty(payment?.date||new Date().toISOString())}\nMethod: ${payment?.method||'EFT'}\nReceipt: ${payment?.receiptNo||'N/A'}\nProperty: ${tenant.property} - ${tenant.unit}\nYour account is up to date. — NestIQ Pro`;
  },
  leaseExpiry(tenant, daysRemaining){
    return `Hi ${tenant.name}, your lease for ${tenant.property} - ${tenant.unit} expires in ${daysRemaining} days on ${isoToPretty(tenant.leaseEnd||tenant.lease)}. Please contact us as soon as possible to discuss renewal options. — NestIQ Pro`;
  },
  maintenanceUpdate(tenant, request, newStatus){
    const resolved=String(newStatus).toLowerCase()==='resolved' || String(newStatus).toLowerCase()==='done'
      ? ' The issue has been resolved. Please confirm all is in order.'
      : '';
    return `Hi ${tenant.name}, your maintenance request (${request?.title||'Request'}) has been updated to: ${newStatus}.${resolved} — NestIQ Pro`;
  },
  welcomeMessage(tenant){
    return `Hi ${tenant.name}, welcome to ${tenant.property} - ${tenant.unit}. Your monthly rent of R${Number(tenant.rent||0).toLocaleString()} is due on the ${getTenantDueDateText(tenant)} of each month. Login to your tenant portal at any time to view your lease, payment history and submit maintenance requests. — NestIQ Pro`;
  }
};

function formatDueDateDefault(){
  const now=new Date();
  const due=new Date(now.getFullYear(), now.getMonth(), 1);
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(due);
}

function nestiqCommDefer(fn){
  if(typeof requestIdleCallback==='function') requestIdleCallback(()=>{ try{ fn(); }catch(_e){} },{timeout:1200});
  else setTimeout(()=>{ try{ fn(); }catch(_e){} },0);
}

function buildWhatsAppUrl(phone, message){
  const normalized=formatWhatsAppNumber(phone);
  if(!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function logWhatsAppMessage(entry){
  whatsappLog.unshift(entry);
  if(whatsappLog.length>50) whatsappLog=whatsappLog.slice(0,50);
  saveData();
}

function openWhatsApp(phone, message, meta={}){
  const url=buildWhatsAppUrl(phone, message);
  if(!url){
    showNotif('No valid phone number for WhatsApp','error');
    return;
  }
  logWhatsAppMessage({
    id:Date.now(),
    tenantId:meta.tenantId??null,
    tenantName:meta.tenantName||'—',
    type:meta.type||'custom',
    phone:formatWhatsAppNumber(phone),
    timestamp:new Date().toISOString(),
    message:String(message||'')
  });
  window.open(url,'_blank','noopener');
  nestiqCommDefer(()=>window.nestiqAutoLogWhatsApp?.(meta,String(message||'')));
}

function openWhatsAppChat(phone, message){
  const normalized=formatWhatsAppNumber(phone);
  if(!normalized){ showNotif('No valid phone number for WhatsApp','error'); return; }
  const base=`https://wa.me/${normalized}`;
  const msg=message!=null?String(message).trim():'';
  const url=msg?`${base}?text=${encodeURIComponent(msg)}`:base;
  window.open(url,'_blank','noopener');
}

function fmtMoneyZAR(amount){
  return `R${Number(amount||0).toLocaleString('en-ZA',{maximumFractionDigits:0})}`;
}

function isoToPretty(iso){
  if(!iso) return new Date().toLocaleDateString('en-ZA');
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return String(iso);
  return d.toLocaleDateString('en-ZA');
}

function genReceiptNo(dateIso){
  const d=dateIso?new Date(dateIso):new Date();
  const year=d.getFullYear();
  const seq=String(Math.floor(Math.random()*9000)+1000);
  return `REC-${year}-${seq}`;
}

function getTenantById(id){
  return tenantsData.find(t=>String(t.id)===String(id));
}

function getPropertyByName(name){
  return propertiesData.find(p=>p.name===name);
}

function getPaymentsForTenant(tenantId){
  return (paymentsData||[]).filter(p=>String(p.tenantId)===String(tenantId)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function recordPayment(tenantId, amount, method='EFT', reference='', opts={}){
  const tenant=getTenantById(tenantId);
  if(!tenant){showNotif('Tenant not found','error');return null;}
  const dateIso=(typeof opts.paymentDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(opts.paymentDate))
    ?opts.paymentDate
    :new Date().toISOString().slice(0,10);
  const receiptNo=opts.receiptNo||genReceiptNo(dateIso);
  const payId=Number.isFinite(Number(opts.paymentId))?Number(opts.paymentId):(Date.now()+Math.floor(Math.random()*10000));
  const payment={tenantId,date:dateIso,amount:Number(amount||0),method,reference,receiptNo,status:'PAID'};
  if(opts.source) payment.source=String(opts.source);
  if(opts.statementRef!=null&&opts.statementRef!=='') payment.statementRef=String(opts.statementRef);
  tenant.payments=tenant.payments||[];
  const tp={id:payId,amount:Number(amount||0),date:dateIso,method,receiptNo,status:'paid'};
  if(opts.source) tp.source=String(opts.source);
  tenant.payments.unshift(tp);
  paymentsData.unshift(payment);
  const s=(typeof getSession==='function')?getSession():null;
  if(s?.role==='tenant'){
    notifyLandlordPaymentReceived?.(tenant, payment);
  }
  if(window.nestiqUseFirestore && window.nestiqDb){
    try{
      const uid = (window.currentUser && window.currentUser.uid) ? String(window.currentUser.uid) : null;
      const landlordId = String(tenant.landlordId || uid || '');
      window.nestiqFs.payments(window.nestiqDb, landlordId).add({
        tenantId: String(tenant.id),
        tenantUid: tenant.portalUid || null,
        landlordId,
        propertyId: tenant.propertyId || '',
        amount: Number(amount||0),
        date: dateIso,
        method,
        reference: reference || '',
        receiptNo,
        month: new Date(dateIso).toLocaleString('en-ZA', { month:'long', year:'numeric' }),
        status: 'paid',
        recordedBy: 'landlord',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.error('recordPayment firestore', e));
      window.nestiqFs.tenants(window.nestiqDb, landlordId).doc(String(tenant.id)).update({
        status: 'paid',
        lastPaymentDate: dateIso
      }).catch(e => console.error('tenant status update', e));
    }catch(e){
      console.error('recordPayment fire', e);
    }
  }else{
    saveData();
  }
  if(opts.silent){
    syncTenantStatuses?.();
    renderTenants?.();
    renderHomeStats?.();
    refreshNestiqCalendar?.();
    return payment;
  }
  generateRentReceiptPDF(payment);
  showPaymentSuccessModal(tenant, payment, Boolean(opts.emailReceipt));
  showNotif('✅ Payment recorded. Receipt generated.','success');
  return payment;
}

function updateHomeStats(){
  if(typeof syncTenantStatuses==='function') syncTenantStatuses();
  const occupied=tenantsData.filter(t=>t.status!=='vacant');
  const totalRevenue=occupied.reduce((sum,t)=>sum+(Number(t.rent)||0),0);
  const totalProperties=propertiesData.length;
  const occupiedProperties=propertiesData.filter(p=>p.status==='occupied').length;
  const occupancyRate=totalProperties>0?Math.round(occupiedProperties/totalProperties*100):0;
  const activeTenants=occupied.length;
  const revenueEl=document.getElementById('statRevenue');
  const occupancyEl=document.getElementById('statOccupancy');
  const tenantsEl=document.getElementById('statTenants');
  if(revenueEl) revenueEl.textContent='R'+totalRevenue.toLocaleString('en-ZA');
  if(occupancyEl) occupancyEl.textContent=occupancyRate+'%';
  if(tenantsEl) tenantsEl.textContent=String(activeTenants);
}

function renderHomeStats(){
  updateHomeStats();
  const fuEl=document.getElementById('homeFollowUpsStat');
  const s=typeof getSession==='function'?getSession():null;
  if(fuEl && s?.role==='landlord') fuEl.textContent=String(typeof nestiqFollowUpsDueCount==='function'?nestiqFollowUpsDueCount():0);
  nestiqRenderHomeFollowUpsWidget?.();
}

window.updateHomeStats=updateHomeStats;
window.renderHomeStats=renderHomeStats;

function updateMessageBadge(count){
  const el=document.getElementById('navMessageBadge');
  if(!el) return;
  const n=Math.max(0,Number(count)||0);
  el.textContent=n>99?'99+':String(n);
  el.style.display=n>0?'inline-flex':'none';
}
window.updateMessageBadge=updateMessageBadge;

function renderGettingStarted(){
  const hasProperties=propertiesData.length>0;
  const hasTenants=tenantsData.length>0;
  const hasExpenses=expenses.length>0;
  const hasProfile=String(landlordSettings?.name||'').trim()!=='';
  if(hasProperties && hasTenants){
    const gs=document.getElementById('gettingStarted');
    if(gs) gs.style.display='none';
    return;
  }
  const gsEl=document.getElementById('gettingStarted');
  if(!gsEl) return;
  gsEl.style.display='block';
  const steps=[
    {done:hasProfile,icon:'👤',title:'Set up your profile',desc:'Add your name, company and contact details',action:"showPage('settings')",btnText:'Go to Settings'},
    {done:hasProperties,icon:'🏠',title:'Add your first property',desc:'Enter your rental property details',action:"openModal('addProperty')",btnText:'Add Property'},
    {done:hasTenants,icon:'👥',title:'Add your first tenant',desc:'Add the tenant living in your property',action:"openModal('addTenant')",btnText:'Add Tenant'},
    {done:false,icon:'💳',title:'Record your first payment',desc:'Log a rent payment to start tracking income',action:"showPage('tenants')",btnText:'Go to Tenants'}
  ];
  gsEl.innerHTML=`
    <div style="
      background: var(--card-bg);
      border-radius: var(--radius);
      padding: 36px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      margin-bottom: 32px;
    ">
      <div style="
        font-family: 'Playfair Display', serif;
        font-size: 1.3rem;
        font-weight: 700;
        margin-bottom: 6px;
      ">
        Welcome to NestIQ Pro 👋
      </div>
      <div style="
        font-size: 0.88rem;
        color: var(--muted);
        margin-bottom: 28px;
      ">
        Complete these steps to get started
      </div>
      <div style="
        display: flex;
        flex-direction: column;
        gap: 14px;
      ">
        ${steps.map((step)=>`
          <div style="
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: var(--paper);
            border-radius: 12px;
            border: 1px solid ${step.done?'var(--sage)':'var(--border)'};
            opacity: ${step.done?'0.6':'1'};
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: ${step.done?'rgba(90,122,96,0.15)':'rgba(201,168,76,0.12)'};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.2rem;
              flex-shrink: 0;
            ">
              ${step.done?'✅':step.icon}
            </div>
            <div style="flex: 1">
              <div style="
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--ink);
                ${step.done?'text-decoration: line-through;':''}
              ">
                ${step.title}
              </div>
              <div style="
                font-size: 0.78rem;
                color: var(--muted);
                margin-top: 2px;
              ">
                ${step.desc}
              </div>
            </div>
            ${!step.done?`
              <button
                class="btn-primary btn-sm"
                onclick="${step.action}"
              >
                ${step.btnText}
              </button>
            `:''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
window.renderGettingStarted=renderGettingStarted;

function nestiqRenderHomeDashProps(){
  const host=document.getElementById('homeDashProps');
  if(!host) return;
  const list=(propertiesData||[]).slice(0,3);
  if(!list.length){
    host.innerHTML='<div class="dash-prop-item" style="opacity:.65"><div class="prop-icon-sm" style="background:rgba(14,17,23,0.06)">🏠</div><div style="flex:1"><div class="prop-name-sm">No properties yet</div><div class="prop-addr-sm">Add a property to see it here</div></div><span class="badge badge-amber">—</span></div>';
    return;
  }
  const badgeFor=st=>{
    if(st==='occupied') return 'badge-green';
    if(st==='vacant') return 'badge-red';
    return 'badge-amber';
  };
  const labelFor=st=>{
    if(st==='occupied') return 'Occupied';
    if(st==='vacant') return 'Vacant';
    return 'Due Soon';
  };
  host.innerHTML=list.map(p=>{
    const st=(p?.status in {occupied:1,vacant:1,due:1})?p.status:'vacant';
    const addr=String(p?.addr||'').split(',')[0]||'—';
    const ic=String(p?.icon||'🏠');
    return`<div class="dash-prop-item"><div class="prop-icon-sm" style="background:rgba(201,168,76,0.12)">${ic}</div><div style="flex:1"><div class="prop-name-sm">${String(p?.name||'Property')}</div><div class="prop-addr-sm">${addr}</div></div><span class="badge ${badgeFor(st)}">${labelFor(st)}</span></div>`;
  }).join('');
}
window.nestiqRenderHomeDashProps=nestiqRenderHomeDashProps;

function showPaymentSuccessModal(tenant, payment, shouldEmailReceipt){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Payment Recorded</h2>
    <p class="modal-sub">${tenant.name} · ${fmtMoneyZAR(payment.amount)} · ${payment.receiptNo}</p>
    <div style="font-size:0.84rem;color:var(--muted);margin-top:6px">Email receipt to ${tenant.name}?</div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn-outline btn-sm" onclick="generateRentReceiptPDF(${JSON.stringify(payment).replace(/"/g,'&quot;')})">Download Receipt PDF</button>
      <button class="btn-primary btn-sm" onclick="emailReceiptNow(${JSON.stringify(tenant.id)},'${payment.receiptNo}')">Yes, Email Receipt</button>
      <button class="btn-outline btn-sm" onclick="closeModal()">No thanks</button>
      <button class="btn-outline btn-sm" onclick="closeModal()">Done</button>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  if(shouldEmailReceipt){
    emailReceiptNow(tenant.id, payment.receiptNo);
  }
}

async function emailReceiptNow(tenantId, receiptNo){
  const tenant=getTenantById(tenantId);
    const payment=(paymentsData||[]).find(p=>String(p.tenantId)===String(tenantId) && p.receiptNo===receiptNo);
  if(!tenant||!payment) return;
  if(!isEmailConfigured()){
    showNotif('Configure EmailJS in Settings to enable email notifications','warning');
    return;
  }
  try{
    await sendReceiptEmail(tenant, payment);
    showNotif(`📧 Receipt emailed to ${tenant.name}`,'success');
  }catch(err){
    showNotif(err?.message||'Receipt email failed','error');
  }
}

// Expose for inline buttons / future UI hooks
window.recordPayment=recordPayment;
window.emailReceiptNow=emailReceiptNow;
window.formatWhatsAppNumber=formatWhatsAppNumber;
window.whatsappTemplates=whatsappTemplates;
window.openWhatsAppChat=openWhatsAppChat;
window.getTenantDaysOverdue=getTenantDaysOverdue;
window.whatsappIconSvg=whatsappIconSvg;


