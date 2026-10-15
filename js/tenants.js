function computeTenantPaymentStatus(tenant){
  if(!tenant||typeof tenant!=='object') return 'vacant';
  if(tenant.status==='vacant') return 'vacant';
  if(typeof window.nestiqCurrentRentObligation==='function'){
    const o=window.nestiqCurrentRentObligation(tenant);
    if(o.status==='vacant') return 'vacant';
    if(o.status==='pending-lease'||o.status==='upcoming') return 'pending-lease';
    if(o.status==='paid') return 'paid';
    if(o.status==='overdue') return 'overdue';
    if(o.status==='due') return 'due';
  }
  const raw=tenant.leaseStart;
  if(raw){
    try{
      const iso=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10)+'T12:00:00':raw;
      const start=raw.toDate?raw.toDate():(raw.seconds?new Date(raw.seconds*1000):new Date(iso));
      if(String(start)!=='Invalid Date'){
        start.setHours(0,0,0,0);
        const today=new Date(); today.setHours(0,0,0,0);
        if(start.getTime()>today.getTime()) return 'pending-lease';
      }
    }catch(_e){}
  }
  if(typeof nestiqTenantLeaseStartsInFuture==='function' && nestiqTenantLeaseStartsInFuture(tenant)){
    return 'pending-lease';
  }
  const ls=String(tenant.leaseStatus||'').toLowerCase();
  if(ls && ls!=='active' && ls!=='expired') return tenant.status==='vacant'?'vacant':'pending-lease';
  const now=new Date();
  const ym=now.toISOString().slice(0,7);
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const dueDate=new Date(now.getFullYear(), now.getMonth(), dueDay);
  const hasPaid=(tenant.payments||[]).some(p=>{
    if(typeof window.nestiqPaymentCountsTowardMonthlyRent==='function' && !window.nestiqPaymentCountsTowardMonthlyRent(p)) return false;
    return String(p.date||'').slice(0,7)===ym;
  }) || (paymentsData||[]).some(p=>{
    if(String(p.tenantId)!==String(tenant.id)) return false;
    if(typeof window.nestiqPaymentCountsTowardMonthlyRent==='function' && !window.nestiqPaymentCountsTowardMonthlyRent(p)) return false;
    return String(p.date||'').slice(0,7)===ym;
  });
  if(hasPaid) return 'paid';
  return now>dueDate?'overdue':'due';
}

function syncTenantStatuses(){
  if(!Array.isArray(tenantsData)) tenantsData=[];
  // Mutate in place so window.tenantsData stays the same array reference as the module global.
  for(let i=0;i<tenantsData.length;i++){
    const t=tenantsData[i];
    if(!t||typeof t!=='object') continue;
    t.status=computeTenantPaymentStatus(t);
  }
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
}

function getTenantLeaseDaysRemaining(tenant){
  const end=new Date(tenant.leaseEnd||tenant.lease||'2026-12-31');
  if(String(end)==='Invalid Date') return 9999;
  return Math.ceil((end-new Date())/86400000);
}

function getTenantCurrentMonthPayment(tenant){
  const ym=new Date().toISOString().slice(0,7);
  return (tenant.payments||[]).find(p=>String(p.date||'').slice(0,7)===ym) || null;
}

function toggleTenantWaMenu(id){
  document.querySelectorAll('.wa-dropdown').forEach(el=>el.classList.remove('open'));
  document.getElementById(`waDrop_${id}`)?.classList.toggle('open');
}

function ensureTenantPhoneOrEdit(tenant){
  const formatted=formatWhatsAppNumber(tenant?.phone||'');
  if(formatted) return formatted;
  nestiqShowNotif('No phone number on record for this tenant','warning');
  openTenantPhoneEditModal(tenant.id);
  return '';
}

function openTenantPhoneEditModal(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Update Tenant Phone</h2>
    <p class="modal-sub">${t.name}</p>
    <div class="form-group"><label>Phone Number</label><input id="edit_tenant_phone" class="form-input" value="${t.phone||''}" placeholder="071 234 5678"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-primary btn-sm" onclick="saveTenantPhone(${tenantId})">Save</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

function saveTenantPhone(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  t.phone=document.getElementById('edit_tenant_phone')?.value?.trim()||'';
  saveData();
  nestiqCloseModalAnimated();
  renderTenants();
  nestiqShowNotif('Tenant phone updated','success');
}

function buildTenantWhatsAppMessage(tenant, type){
  if(type==='rentReminder') return whatsappTemplates.rentReminder(tenant);
  if(type==='overdueNotice') return whatsappTemplates.overdueNotice(tenant, getTenantDaysOverdue(tenant));
  if(type==='paymentConfirmation') return whatsappTemplates.paymentConfirmation(tenant, getTenantCurrentMonthPayment(tenant)||{});
  if(type==='leaseExpiry') return whatsappTemplates.leaseExpiry(tenant, Math.max(0,getTenantLeaseDaysRemaining(tenant)));
  if(type==='welcomeMessage') return whatsappTemplates.welcomeMessage(tenant);
  return '';
}

function sendTenantWhatsAppTemplate(tenantId, type){
  const tenant=tenantsData.find(t=>t.id===tenantId);
  if(!tenant) return;
  const phone=ensureTenantPhoneOrEdit(tenant);
  if(!phone) return;
  const msg=buildTenantWhatsAppMessage(tenant, type);
  if(!msg) return;
  openWhatsApp(tenant.phone, msg, {tenantId:tenant.id,tenantName:tenant.name,type});
}

function openTenantCustomWhatsAppModal(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Custom WhatsApp Message</h2>
    <p class="modal-sub">${t.name}</p>
    <div class="form-group"><label>Message</label><textarea id="wa_custom_msg" class="form-input form-textarea" placeholder="Type your message..."></textarea></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-whatsapp btn-sm" onclick="sendTenantCustomWhatsApp(${tenantId})">Send via WhatsApp</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

function sendTenantCustomWhatsApp(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const msg=document.getElementById('wa_custom_msg')?.value?.trim()||'';
  if(!msg){nestiqShowNotif('Type a custom message','warning');return;}
  const phone=ensureTenantPhoneOrEdit(t);
  if(!phone) return;
  openWhatsApp(t.phone, msg, {tenantId:t.id,tenantName:t.name,type:'custom'});
  nestiqCloseModalAnimated();
}

function openTenantDirectWhatsAppChat(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const phone=ensureTenantPhoneOrEdit(t);
  if(!phone) return;
  openWhatsAppChat(t.phone);
}

function renderTenants(){
  syncTenantStatuses();
  const grid=document.getElementById('tenantsGrid');
  if(!grid) return;
  const list=Array.isArray(tenantsData)?tenantsData.filter(t=>t&&typeof t==='object'&&t.id!=null):[];
  if(window.nestiqTenantsLoading){
    nestiqShowSkeleton(grid, 'row', 5);
    return;
  }
  if(!list.length){
    nestiqShowEmptyState(grid, { icon:'👥', title:'No tenants yet', message:'Profiles appear here after you approve an application. Applicants apply from Browse listings.', action:{ label:'Open Applications', fn:'nestiqGoToApplications' } });
    return;
  }
  const statusMap={paid:'badge-green',vacant:'badge-red',due:'badge-amber','due-soon':'badge-amber',overdue:'badge-red','pending-lease':'badge-gold'};
  const labelMap={paid:'✓ Paid',vacant:'Vacant',due:'Due soon','due-soon':'Due soon',overdue:'Overdue','pending-lease':'Lease pending'};
  const msgList=(Array.isArray(window.messages)?window.messages:(Array.isArray(messages)?messages:[])).filter(m=>m&&typeof m==='object');
  grid.innerHTML=list.map(t=>{
    const rent=Number(t.rent||0);
    const st=(t.status in labelMap)?t.status:'vacant';
    const unread=typeof nestiqLandlordUnreadForTenant==='function'?nestiqLandlordUnreadForTenant(t.id):msgList.filter(m=>String(m.tenantId)===String(t.id)&&m.fromRole==='tenant'&&!m.read&&!m.deleted).length;
    const avatarHtml=typeof nestiqTenantAvatarHtml==='function'?nestiqTenantAvatarHtml(t):`<div class="tenant-avatar">${String(t.avatar||'👤')}</div>`;
    const name=String(t.name||'Tenant');
    const unit=String(t.unit||'—');
    const prop=String(t.property||'—');
    const leaseLbl=String(t.lease||t.leaseEnd||'—');
    const tidArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(t.id):JSON.stringify(t.id);
    return `
    <div class="tenant-card${unread?' has-unread':''}" onclick="viewTenant(${nestiqHtmlJsArg(t.id)})">
      <button type="button" class="card-edit-pencil" title="Edit" aria-label="Edit" data-nq-tip="Edit" onclick="event.stopPropagation();openEditTenantModal(${nestiqHtmlJsArg(t.id)})">✏</button>
      <div class="tenant-avatar-wrap">${avatarHtml}${unread?`<span class="nestiq-unread-dot" title="${unread} unread message${unread===1?'':'s'}"></span>`:''}</div>
      <div class="tenant-name">${name}</div>
      <div class="tenant-unit">${unit} · ${prop}</div>
      <div class="tenant-meta">
        <div class="tenant-meta-item"><div class="tenant-meta-val">R${rent.toLocaleString()}</div><div class="tenant-meta-lbl">Monthly Rent</div></div>
        <div class="tenant-meta-item"><div class="tenant-meta-val" style="font-size:0.75rem">${leaseLbl}</div><div class="tenant-meta-lbl">Lease End</div></div>
      </div>
      <div class="tenant-tag">
        <span class="badge ${statusMap[st]||statusMap.vacant}">${labelMap[st]||labelMap.vacant}</span>
        ${unread?`<button type="button" class="badge badge-gold tenant-unread-chip" onclick="event.stopPropagation();openLandlordTenantMessages(${tidArg})">Caretaker thread</button>`:''}
        <span class="tenant-card-hint">Open for details</span>
      </div>
    </div>`;
  }).join('');
  try{ window.nestiqRenderInvitationsTable?.(); }catch(_e){}
  try{ nestiqRenderTenantsUnreadBanner?.(); }catch(_e){}
  try{ window.updateMessageBadge?.(); }catch(_e){}
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(document.getElementById('tenantsList') || document.getElementById('tenantsGrid') || grid, 50);
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
  if(typeof nestiqInitLazyImages==='function') nestiqInitLazyImages();
}

function nestiqRenderTenantsUnreadBanner(){
  const grid=document.getElementById('tenantsGrid');
  if(!grid||!grid.parentNode) return;
  let bar=document.getElementById('tenantsUnreadBar');
  const unread=typeof nestiqLandlordUnreadMessages==='function'?nestiqLandlordUnreadMessages():[];
  if(!unread.length){
    if(bar) bar.remove();
    return;
  }
  if(!bar){
    bar=document.createElement('div');
    bar.id='tenantsUnreadBar';
    bar.className='nestiq-tenants-unread-bar';
    grid.parentNode.insertBefore(bar, grid);
  }
  const n=unread.length;
  const tenants=new Set(unread.map(m=>String(m.tenantId||'')).filter(Boolean));
  bar.innerHTML=`<strong>${n} new ${n===1?'message':'messages'}</strong> in caretaker threads for ${tenants.size} ${tenants.size===1?'tenant':'tenants'}. You can view them — only the caretaker can reply.`;
}
window.nestiqRenderTenantsUnreadBanner=nestiqRenderTenantsUnreadBanner;

function nestiqOpenRecordPaymentModal(tenantId){
  syncTenantStatuses();
  const t=tenantsData.find(x=>String(x.id)===String(tenantId));
  if(!t){ nestiqShowNotif?.('Tenant not found','error'); return; }
  const prop=propertiesData.find(p=>String(p.id)===String(t.propertyId)) || propertiesData.find(p=>p.name===t.property) || null;
  const today=new Date().toISOString().slice(0,10);
  const rent=Number(t.rent||0);
  const methods=['EFT','Cash','Card','Stop Order','Other'];
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Record Payment — ${String(t.name||'Tenant').replace(/</g,'&lt;')}</h2>
    <p class="modal-sub">${String(t.property||prop?.name||'').replace(/</g,'&lt;')}</p>
    <div class="form-group"><label>Amount (R)</label><input id="nestiqPayAmt" class="form-input" type="number" min="0" step="1" value="${rent}"></div>
    <div class="form-group"><label>Payment date</label><input id="nestiqPayDate" class="form-input" type="date" value="${today}"></div>
    <div class="form-group"><label>Payment method</label>
      <select id="nestiqPayMethod" class="form-input">${methods.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Reference number (optional)</label><input id="nestiqPayRef" class="form-input" placeholder="e.g. EFT-12345"></div>
    <div class="form-group"><label>Notes (optional)</label><textarea id="nestiqPayNotes" class="form-input form-textarea" placeholder="Optional notes..."></textarea></div>
    <label style="display:flex;align-items:center;gap:10px;font-size:0.86rem;margin-top:10px;cursor:pointer">
      <input id="nestiqPayReceipt" type="checkbox" checked>
      Generate Receipt (PDF)
    </label>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button type="button" class="btn-gold" style="width:100%;justify-content:center" onclick="nestiqSavePaymentFromModal(${Number(tenantId)})">Save Payment</button>
      <button type="button" class="btn-outline" style="width:100%;justify-content:center" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

async function nestiqSavePaymentFromModal(tenantId){
  const btn=nestiqBtnFromEvent?.()||document.querySelector('#modalOverlay .btn-gold');
  nestiqSetBtnLoading?.(btn,true,'Saving...');
  try{
    const amount=Number(document.getElementById('nestiqPayAmt')?.value||0);
    const date=document.getElementById('nestiqPayDate')?.value?.trim()||'';
    const method=document.getElementById('nestiqPayMethod')?.value||'EFT';
    const reference=document.getElementById('nestiqPayRef')?.value?.trim()||'';
    const notes=document.getElementById('nestiqPayNotes')?.value?.trim()||'';
    const genReceipt=Boolean(document.getElementById('nestiqPayReceipt')?.checked);
    const ok=await nestiqSavePayment(tenantId,{amount,date,method,reference,notes,generateReceipt:genReceipt});
    if(ok) nestiqConfetti?.({ count: 50, spread: 45, origin: { y: 0.8 } });
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}

async function nestiqSavePayment(tenantId, paymentData){
  const t=tenantsData.find(x=>String(x.id)===String(tenantId));
  if(!t){ nestiqShowNotif?.('Tenant not found','error'); return false; }
  const amount=Number(paymentData?.amount||0);
  const date=String(paymentData?.date||'').trim();
  if(!(amount>0)){ nestiqShowNotif?.('Amount must be greater than 0','error'); return false; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ nestiqShowNotif?.('Select a valid payment date','error'); return false; }
  const method=String(paymentData?.method||'EFT');
  const reference=String(paymentData?.reference||'');
  const notes=String(paymentData?.notes||'');
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const paymentId=`PAY-${Date.now()}`;
  const propId=t.propertyId!=null?String(t.propertyId):'';
  const record={
    id:paymentId,
    landlordId: lid||String(t.landlordId||''),
    tenantId: String(t.id),
    propertyId: propId,
    amount,
    date,
    method,
    reference,
    notes,
    createdAt: new Date().toISOString()
  };
  const generateReceipt=paymentData?.generateReceipt!==false;

  // Persist (Firestore when available).
  if(window.nestiqUseFirestore && window.nestiqDb && lid && window.nestiqFs?.payments){
    try{
      await window.nestiqFs.payments(window.nestiqDb, lid).doc(paymentId).set({
        ...record,
        tenantUid: t.portalUid || null,
        month: new Date(date).toLocaleString('en-ZA', { month:'long', year:'numeric' }),
        status: 'paid',
        recordedBy: 'landlord',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
      await window.nestiqFs.tenants(window.nestiqDb, lid).doc(String(t._fireId||t.id)).set({
        status:'paid',
        lastPaymentDate: date,
        daysOverdue: 0
      }, { merge:true });
    }catch(e){
      console.warn('Record payment Firestore', e);
      // Fall through to local update so UI stays responsive.
    }
  }

  // Local in-memory update.
  t.lastPaymentDate=date;
  t.daysOverdue=0;
  t.status='paid';
  t.payments=t.payments||[];
  t.payments.unshift({
    id: paymentId,
    amount,
    date,
    method,
    receiptNo: `REC-${Date.now()}`,
    status: 'paid',
    reference,
    notes
  });
  paymentsData = Array.isArray(paymentsData)?paymentsData:[];
  paymentsData.unshift({
    id: paymentId,
    landlordId: record.landlordId,
    tenantId: String(t.id),
    propertyId: propId,
    amount,
    method,
    reference,
    date,
    month: new Date(date).toLocaleString('en-ZA', { month:'long', year:'numeric' }),
    status: 'paid',
    notes
  });

  try{ saveData?.(); }catch(_e){}
  try{ syncTenantStatuses?.(); }catch(_e){}
  try{ renderTenants?.(); }catch(_e){}
  try{ renderHomeStats?.(); }catch(_e){}

  if(generateReceipt){
    try{ nestiqGenerateReceipt(tenantId, record); }catch(_e){}
  }
  nestiqShowNotif?.('Payment recorded for ' + (t.name||'tenant'), 'success');
  closeModal?.();
  return true;
}

function nestiqGenerateReceipt(tenantId, paymentData){
  const t=tenantsData.find(x=>String(x.id)===String(tenantId));
  if(!t) return;
  const prop=propertiesData.find(p=>String(p.id)===String(t.propertyId)) || propertiesData.find(p=>p.name===t.property) || {};
  const jsPDF = window.jspdf?.jsPDF;
  if(!jsPDF){ nestiqShowNotif?.('PDF library not loaded','warning'); return; }
  const doc=new jsPDF({unit:'pt',format:'a4'});
  const gold=[196,106,58];
  const ink=[14,17,23];
  const muted=[107,114,128];
  const pad=48;
  const w=doc.internal.pageSize.getWidth();

  doc.setFillColor(...gold);
  doc.rect(0,0,w,80,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(20);
  doc.text('NestIQ Pro', pad, 50);

  doc.setTextColor(...ink);
  doc.setFontSize(16);
  doc.text('PAYMENT RECEIPT', pad, 120);
  const recNo=`REC-${Date.now()}`;
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Receipt number: ${recNo}`, pad, 140);

  const landlord=String(landlordSettings?.name||landlordName||'Landlord');
  const landlordEmail=String(landlordSettings?.email||landlordEmail||'');
  const landlordPhone=String(landlordSettings?.phone||'');
  const addr=String(prop.addr||'');
  const y0=170;
  doc.setTextColor(...ink);
  doc.setFont('helvetica','bold');
  doc.text('Landlord', pad, y0);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text(landlord, pad, y0+16);
  if(landlordEmail) doc.text(landlordEmail, pad, y0+32);
  if(landlordPhone) doc.text(landlordPhone, pad, y0+48);

  const rightX=w/2+10;
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('Tenant', rightX, y0);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text(String(t.name||'Tenant'), rightX, y0+16);
  doc.text(String(t.property||prop.name||''), rightX, y0+32);
  if(addr) doc.text(addr, rightX, y0+48, {maxWidth: w-rightX-pad});

  // Payment table
  const tableY=y0+90;
  doc.setDrawColor(220);
  doc.setFillColor(245,240,232);
  doc.rect(pad, tableY, w-pad*2, 24, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica','bold');
  doc.text('Amount', pad+10, tableY+16);
  doc.text('Date', pad+150, tableY+16);
  doc.text('Method', pad+260, tableY+16);
  doc.text('Reference', pad+360, tableY+16);
  doc.setFont('helvetica','normal');
  const rowY=tableY+44;
  const amt=`R${Math.round(Number(paymentData.amount||0)).toLocaleString('en-ZA')}`;
  doc.text(amt, pad+10, rowY);
  doc.text(String(paymentData.date||''), pad+150, rowY);
  doc.text(String(paymentData.method||''), pad+260, rowY);
  doc.text(String(paymentData.reference||'—'), pad+360, rowY, {maxWidth: w-pad*2-360});

  doc.setTextColor(...muted);
  doc.setFontSize(10);
  doc.text('Thank you for your payment. This receipt was generated by NestIQ Pro.', pad, rowY+80, {maxWidth:w-pad*2});

  const safeName=String(t.name||'tenant').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'tenant';
  const safeDate=String(paymentData.date||'').slice(0,10)||new Date().toISOString().slice(0,10);
  doc.save(`receipt-${safeName}-${safeDate}.pdf`);
}

function nestiqOpenBulkRecordPaymentsModal(){
  syncTenantStatuses();
  const dueList=(tenantsData||[]).filter(t=>t&&t.status!=='vacant'&&(t.status==='overdue'||t.status==='due'||t.status==='due-soon'));
  if(!dueList.length){ nestiqShowNotif?.('No overdue or due-soon tenants','info'); return; }
  const today=new Date().toISOString().slice(0,10);
  const methods=['EFT','Cash','Card','Stop Order','Other'];
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">💳 Bulk Record Payments</h2>
    <p class="modal-sub">Select tenants to mark as paid.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div class="form-group" style="flex:1;min-width:200px"><label>Payment date</label><input id="bulkPayDate" class="form-input" type="date" value="${today}"></div>
      <div class="form-group" style="flex:1;min-width:200px"><label>Method</label><select id="bulkPayMethod" class="form-input">${methods.map(m=>`<option value="${m}">${m}</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:10px;max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--paper)">
      ${dueList.map(t=>{
        const rent=Number(t.rent||0);
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border-soft);cursor:pointer">
          <input type="checkbox" class="bulkPayChk" data-tenant-id="${String(t.id).replace(/"/g,'&quot;')}" checked>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700">${String(t.name||'Tenant').replace(/</g,'&lt;')}</div>
            <div style="font-size:0.8rem;color:var(--muted)">${String(t.property||'—').replace(/</g,'&lt;')}</div>
          </div>
          <div style="font-weight:700;color:var(--gold)">R${rent.toLocaleString('en-ZA')}</div>
        </label>`;
      }).join('')}
    </div>
    <div id="bulkPayProgress" style="font-size:0.86rem;color:var(--muted);margin-top:10px;min-height:20px"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button type="button" class="btn-gold" style="flex:1;justify-content:center" onclick="nestiqBulkRecordPaymentsRun()">Record All Selected Payments</button>
      <button type="button" class="btn-outline" style="flex:1;justify-content:center" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

async function nestiqBulkRecordPaymentsRun(){
  const progress=document.getElementById('bulkPayProgress');
  const date=document.getElementById('bulkPayDate')?.value?.trim()||'';
  const method=document.getElementById('bulkPayMethod')?.value||'EFT';
  const ids=[...document.querySelectorAll('.bulkPayChk:checked')].map(x=>x.getAttribute('data-tenant-id')).filter(Boolean);
  if(!ids.length){ if(progress) progress.textContent='Select at least one tenant.'; return; }
  let ok=0;
  for(let i=0;i<ids.length;i++){
    if(progress) progress.textContent=`Recording ${i+1} of ${ids.length} payments...`;
    const tid=ids[i];
    const t=tenantsData.find(x=>String(x.id)===String(tid));
    const amount=Number(t?.rent||0);
    const success=await nestiqSavePayment(tid,{amount,date,method,reference:'',notes:'',generateReceipt:false});
    if(success) ok++;
  }
  if(progress) progress.textContent=`✅ ${ok} payment${ok===1?'':'s'} recorded successfully`;
  setTimeout(()=>{ try{ nestiqCloseModalAnimated(); }catch(_e){} }, 700);
}

window.nestiqOpenRecordPaymentModal=nestiqOpenRecordPaymentModal;
window.nestiqSavePaymentFromModal=nestiqSavePaymentFromModal;
window.nestiqSavePayment=nestiqSavePayment;
window.nestiqGenerateReceipt=nestiqGenerateReceipt;
window.nestiqOpenBulkRecordPaymentsModal=nestiqOpenBulkRecordPaymentsModal;
window.nestiqBulkRecordPaymentsRun=nestiqBulkRecordPaymentsRun;

function sendTenantWhatsApp(tenantId, type){
  const mapped=type==='overdue'?'overdueNotice':type==='reminder'?'rentReminder':'paymentConfirmation';
  sendTenantWhatsAppTemplate(tenantId,mapped);
}

function viewTenant(id){
  syncTenantStatuses();
  const t=tenantsData.find(x=>String(x.id)===String(id));
  if(!t) return;
  window.__nestiqViewingTenantId=id;
  const tidArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(t.id):JSON.stringify(String(t.id)).replace(/"/g,'&quot;');
  const wa=typeof whatsappIconSvg==='function'?whatsappIconSvg():'';
  const rentDisp=Number(t.rent||0).toLocaleString();
  const history=(rentIncreases||[]).filter(r=>r&&String(r.tenantId)===String(t.id)).sort((a,b)=>String(b.appliedDate||'').localeCompare(String(a.appliedDate||'')));
  const titleAv=typeof nestiqTenantAvatarInlineHtml==='function'?nestiqTenantAvatarInlineHtml(t,32):String(t.avatar||'👤');
  document.getElementById('modalContent').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px">
      <div>
    <h2 class="modal-title" style="margin-bottom:4px;display:flex;align-items:center;gap:4px">${titleAv}<span>${String(t.name||'Tenant').replace(/</g,'&lt;')}</span></h2>
    <p class="modal-sub" style="margin-bottom:0">${t.unit||'—'} · ${t.property||'—'}</p>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button type="button" class="btn-outline btn-sm nest-vt-tab comm-tab-active" data-tab="ov" data-tid="${String(t.id).replace(/"/g,'&quot;')}" onclick="nestiqViewTenantSwitchTab(${tidArg},'ov')">Overview</button>
      <button type="button" class="btn-outline btn-sm nest-vt-tab" data-tab="com" data-tid="${String(t.id).replace(/"/g,'&quot;')}" onclick="nestiqViewTenantSwitchTab(${tidArg},'com')">Communication history</button>
    </div>
    <div id="vtenant_ov_${t.id}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">RENT</div><div style="font-weight:700;color:var(--gold)">R${rentDisp}/mo</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">LEASE END</div><div style="font-weight:600;font-size:0.88rem">${t.lease||t.leaseEnd||'—'}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">PHONE</div><div style="font-weight:600;font-size:0.88rem">${t.phone||'—'}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">EMAIL</div><div style="font-weight:600;font-size:0.82rem;word-break:break-all">${t.email||'—'}</div></div>
    </div>
    ${typeof nestiqTenantDetailDepositSection==='function'?nestiqTenantDetailDepositSection(t):''}
    ${t.notes?`<div style="background:rgba(201,168,76,0.08);border-radius:9px;padding:12px;border:1px solid var(--border);font-size:0.85rem;color:var(--muted)">📝 ${t.notes}</div>`:''}
    <div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">Email</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:0.82rem;margin-bottom:8px">
        <span>✉️ ${t.email||'No email saved'}</span>
        <button class="btn-outline btn-sm" onclick="navigator.clipboard?.writeText('${t.email||''}');nestiqShowNotif('Email copied','success')">Copy</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline btn-sm" onclick="sendTenantEmailAction(${tidArg},'rentReminder')">Rent Reminder</button>
        ${t.status==='overdue'?`<button class="btn-outline btn-sm" onclick="sendTenantEmailAction(${tidArg},'overdueNotice')">Overdue Notice</button>`:''}
        ${getTenantCurrentMonthPayment(t)?`<button class="btn-outline btn-sm" onclick="sendTenantEmailAction(${tidArg},'paymentReceipt')">Payment Receipt</button>`:''}
        ${getTenantLeaseDaysRemaining(t)<90?`<button class="btn-outline btn-sm" onclick="sendTenantEmailAction(${tidArg},'leaseExpiry')">Lease Expiry</button>`:''}
        <button class="btn-outline btn-sm" onclick="sendTenantEmailAction(${tidArg},'welcomeTenant')">Welcome Email</button>
        <button class="btn-outline btn-sm" onclick="openTenantCustomEmailModal(${tidArg})">Custom Message</button>
      </div>
    </div>
    <div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">WhatsApp</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:0.82rem;margin-bottom:8px">
        <span>📱 ${t.phone||'No phone saved'}</span>
        <button class="btn-outline btn-sm" onclick="navigator.clipboard?.writeText('${t.phone||''}');nestiqShowNotif('Phone copied','success')">Copy</button>
        <button class="btn-whatsapp btn-sm" onclick="openTenantDirectWhatsAppChat(${tidArg})">${wa} Open WhatsApp Chat</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tidArg},'rentReminder')">${wa} Rent Reminder</button>
        <button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tidArg},'paymentConfirmation')">${wa} Payment Confirmation</button>
        <button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tidArg},'welcomeMessage')">${wa} Welcome</button>
        ${t.status==='overdue'?`<button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tidArg},'overdueNotice')">${wa} Overdue Notice</button>`:''}
        ${getTenantLeaseDaysRemaining(t)<90?`<button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tidArg},'leaseExpiry')">${wa} Lease Expiry</button>`:''}
      </div>
    </div>
    <div style="margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">Portal documents</div>
      <p style="font-size:0.78rem;color:var(--muted);margin-bottom:8px">Lease agreements, receipts, and inspection reports appear in the tenant portal.</p>
      <button type="button" class="btn-outline btn-sm" onclick="event.stopPropagation();nestiqUploadTenantPortalDocument(${tidArg})">Upload document for tenant</button>
    </div>
    <div style="margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">Rent History</div>
      ${history.length?`
        <div style="overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">Date</th>
                <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">Old Rent</th>
                <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">New Rent</th>
                <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">Increase</th>
                <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">Type</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h=>`<tr>
                <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${String(h.appliedDate||h.effectiveDate||'').slice(0,10)}</td>
                <td style="padding:6px;border-bottom:1px solid var(--border-soft)">R${Number(h.oldRent||0).toLocaleString('en-ZA')}</td>
                <td style="padding:6px;border-bottom:1px solid var(--border-soft)">R${Number(h.newRent||0).toLocaleString('en-ZA')}</td>
                <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${Number(h.increasePercent||0).toFixed(2)}%</td>
                <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${h.type||'—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `:'<div style="font-size:.8rem;color:var(--muted)">No rent increases recorded yet.</div>'}
    </div>
    </div>
    <div id="vtenant_com_${t.id}" style="display:none"></div>
    <div id="tenantDetailFooter" class="tenant-detail-actions">
      <button class="btn-primary btn-sm" onclick="sendTenantReminderEmail(${tidArg})">Send Reminder</button>
      <button class="btn-outline btn-sm" onclick="openLandlordTenantMessages(${tidArg})">Caretaker thread <span id="tenantDetailMsgBadge" class="nav-item-badge" style="display:none">0</span></button>
      <button class="btn-outline btn-sm" onclick="sendTenantStatementEmail(${tidArg})">Email Statement</button>
      <button class="btn-outline btn-sm" onclick="openPaymentModal(${tidArg})">Record Payment</button>
      <button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsApp(${tidArg},'confirm')">WhatsApp</button>
      <button class="btn-outline btn-sm" onclick="generatePaymentStatementPDF(${tidArg})">⬇ Statement PDF</button>
      <button class="btn-outline btn-sm" onclick="generateLeaseSummaryPDF(${tidArg})" title="Download PDF" data-nq-tip="Download PDF">⬇ Lease PDF</button>
      <button class="btn-outline btn-sm" onclick="openLeaseClauseGenerator(${tidArg})" title="AI Powered" data-nq-tip="AI Powered">AI Generate Clauses</button>
      ${t.status==='due'||t.status==='overdue'
        ? `<button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsApp(${tidArg},'overdue')">Send Reminder</button>`
        : ``}
      <button class="btn-outline btn-sm" onclick="openEditTenantModal(${tidArg})">Edit</button>
      <button class="btn-outline btn-sm" onclick="deleteTenant(${tidArg})">Remove</button>
    </div>`;
  nestiqOpenModalAnimated();
  renderTenantLoginShareQr?.(t.id);
  try{ window.updateMessageBadge?.(); }catch(_e){}
}

async function sendTenantReminderEmail(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  if(!isEmailConfigured()){
    nestiqShowNotif('Configure EmailJS in Settings to enable emails','warning');
    return;
  }
  await sendRentReminderEmail(t, formatDueDateDefault(), {scope:monthKey(new Date())});
}

async function sendTenantStatementEmail(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  if(!isEmailConfigured()){
    nestiqShowNotif('Configure EmailJS in Settings to enable emails','warning');
    return;
  }
  await sendRentReminderEmail(t, formatDueDateDefault(), {scope:`statement-${Date.now()}`});
}

function toggleTenantEmailMenu(id){
  document.querySelectorAll('[id^="emDrop_"]').forEach(el=>el.classList.remove('open'));
  document.getElementById(`emDrop_${id}`)?.classList.toggle('open');
}

async function sendTenantEmailAction(tenantId, type){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  if(type==='rentReminder') return sendRentReminderEmail(t, getTenantDueDateText(t), {scope:monthKey(new Date())});
  if(type==='overdueNotice') return sendOverdueEmail(t, getTenantDaysOverdue(t));
  if(type==='paymentReceipt'){
    const p=getTenantCurrentMonthPayment(t)||((t.payments||[])[0]);
    if(!p){ nestiqShowNotif('No payment found for receipt email','warning'); return; }
    return sendReceiptEmail(t,p);
  }
  if(type==='leaseExpiry') return sendLeaseExpiryEmail(t, Math.max(0,getTenantLeaseDaysRemaining(t)));
  if(type==='welcomeTenant') return sendWelcomeEmail(t);
}

function openTenantCustomEmailModal(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Custom Email Message</h2>
    <p class="modal-sub">${t.name} · ${t.email||'No email'}</p>
    <div class="form-group"><label>Subject</label><input id="cust_email_subj" class="form-input" placeholder="Subject"></div>
    <div class="form-group" style="margin-top:10px"><label>Message</label><textarea id="cust_email_msg" class="form-input form-textarea" placeholder="Type your message..."></textarea></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-primary btn-sm" onclick="sendTenantCustomEmail(${tenantId})">Send</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

async function sendTenantCustomEmail(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const subject=document.getElementById('cust_email_subj')?.value?.trim()||'Message from landlord';
  const message=document.getElementById('cust_email_msg')?.value?.trim()||'';
  if(!message){ nestiqShowNotif('Type a message first','warning'); return; }
  const ok=await sendCustomEmail(t,subject,message);
  if(ok) nestiqCloseModalAnimated();
}

function openPaymentModal(tenantId, extra){
  window.__nestiqPaymentModalExtra=(extra&&typeof extra==='object')?extra:{};
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const ex=window.__nestiqPaymentModalExtra;
  const payDate=(ex.defaultDate&&String(ex.defaultDate).slice(0,10))||new Date().toISOString().slice(0,10);
  const amt=ex.defaultAmount!=null?Number(ex.defaultAmount):Number(t.rent||0);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">💳 Record Payment</h2>
    <p class="modal-sub">${t.name} · ${t.property}</p>
    <div class="form-group"><label>Amount (R)</label><input id="pay_amount" class="form-input" type="number" value="${amt}"></div>
    <div class="form-group"><label>Payment date</label><input id="pay_date" class="form-input" type="date" value="${payDate}"></div>
    <div class="form-group"><label>Method</label>
      <select id="pay_method" class="form-input">
        <option>EFT</option><option>Cash</option><option>Card</option>
      </select>
    </div>
    <div class="form-group"><label>Reference</label><input id="pay_ref" class="form-input" placeholder="Reference"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-top:8px">
      <input id="pay_email_receipt" type="checkbox" checked>
      Email Receipt
    </label>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn-primary btn-sm" onclick="submitPaymentModal(${tenantId})">Save Payment</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

function submitPaymentModal(tenantId){
  const amount=Number(document.getElementById('pay_amount')?.value||0);
  const method=document.getElementById('pay_method')?.value||'EFT';
  const reference=document.getElementById('pay_ref')?.value||'';
  const emailReceipt=Boolean(document.getElementById('pay_email_receipt')?.checked);
  const payDateRaw=document.getElementById('pay_date')?.value?.trim()||'';
  if(amount<=0){
    nestiqShowNotif('Enter a valid payment amount','error');
    return;
  }
  const extra=window.__nestiqPaymentModalExtra||{};
  window.__nestiqPaymentModalExtra={};
  const payment=recordPayment(tenantId, amount, method, reference, {
    emailReceipt,
    paymentDate:/^\d{4}-\d{2}-\d{2}$/.test(payDateRaw)?payDateRaw:undefined
  });
  if(payment&&typeof extra.onRecorded==='function') extra.onRecorded();
}

window.sendTenantReminderEmail=sendTenantReminderEmail;
window.sendTenantStatementEmail=sendTenantStatementEmail;
window.toggleTenantEmailMenu=toggleTenantEmailMenu;
window.sendTenantEmailAction=sendTenantEmailAction;
window.openTenantCustomEmailModal=openTenantCustomEmailModal;
window.sendTenantCustomEmail=sendTenantCustomEmail;
window.openPaymentModal=openPaymentModal;
window.submitPaymentModal=submitPaymentModal;
window.toggleTenantWaMenu=toggleTenantWaMenu;
window.sendTenantWhatsAppTemplate=sendTenantWhatsAppTemplate;
window.openTenantCustomWhatsAppModal=openTenantCustomWhatsAppModal;
window.sendTenantCustomWhatsApp=sendTenantCustomWhatsApp;
window.openTenantPhoneEditModal=openTenantPhoneEditModal;
window.saveTenantPhone=saveTenantPhone;
window.openTenantDirectWhatsAppChat=openTenantDirectWhatsAppChat;
window.nestiqGoToApplications=function(){ if(typeof showPage==='function') showPage('applications'); };
window.nestiqGoToListings=function(){ if(typeof showPage==='function') showPage('listings'); };

async function openLeaseClauseGenerator(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="openLeaseClauseGenerator"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Generating...');
  const p=propertiesData.find(x=>x.name===t.property);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Generate AI Clauses</h2>
    <p class="modal-sub">${t.name} · ${t.property}</p>
    <div id="leaseAiLoading" style="font-size:0.82rem;color:var(--muted)">Thinking...</div>
    <div id="leaseAiList" style="max-height:340px;overflow:auto;margin-top:10px"></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn-primary btn-sm" onclick="applySelectedLeaseAiClauses(${tenantId})">Add Selected Clauses to Lease PDF</button>
    </div>
  `;
  nestiqOpenModalAnimated();
  try{
    const city=(String(p?.addr||'').split(',').pop()||'').trim()||'South Africa';
    const list=await generateLeaseClausesAI({
      type:p?.type||'apartment',
      city,
      amount:t.rent,
      name:t.name,
      leaseStart:t.leaseStart,
      leaseEnd:t.leaseEnd,
      furnished:'unfurnished',
      deposit:typeof nestiqTenantDepositAmount==='function'?nestiqTenantDepositAmount(t):Number(t.deposit&&typeof t.deposit==='object'?t.deposit.amount:t.deposit||0)
    });
    if(!list?.ok){
      const wrap=document.getElementById('leaseAiList');
      if(wrap) wrap.innerHTML=aiRawFallbackCard(list?.raw||'No AI response');
      return;
    }
    const rows=Array.isArray(list.data)?list.data:[];
    const wrap=document.getElementById('leaseAiList');
    if(wrap){
      wrap.innerHTML=rows.map((item,idx)=>`
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--paper)">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lease_clause_chk_${idx}" checked><div style="font-weight:700">${item.title||`Clause ${idx+1}`}</div></label>
          <div id="lease_clause_${idx}" style="font-size:0.82rem;color:var(--muted);margin-top:6px">${item.clause||''}</div>
          <button class="btn-outline btn-sm" style="margin-top:8px" onclick="copyLeaseClause(${idx})">Copy</button>
        </div>
      `).join('');
      wrap.innerHTML += aiAttribution();
      window.__leaseAiRows=rows;
    }
  }catch(_err){
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    const loading=document.getElementById('leaseAiLoading');
    if(loading) loading.style.display='none';
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

function applySelectedLeaseAiClauses(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const prop=propertiesData.find(x=>x.id===t.propertyId)||propertiesData.find(x=>x.name===t.property)||{};
  const rows=window.__leaseAiRows||[];
  const selected=rows.filter((_,idx)=>document.getElementById(`lease_clause_chk_${idx}`)?.checked).map(r=>r.clause).filter(Boolean);
  generateLeasePDF(t,prop,selected, typeof nestiqPrimaryLeaseForTenant==='function'?nestiqPrimaryLeaseForTenant(t.id):null);
}

function copyLeaseClause(idx){
  const txt=document.getElementById(`lease_clause_${idx}`)?.innerText||'';
  if(!txt) return;
  navigator.clipboard?.writeText(txt);
  nestiqShowNotif('Clause copied','success');
}

window.openLeaseClauseGenerator=openLeaseClauseGenerator;
window.copyLeaseClause=copyLeaseClause;
window.applySelectedLeaseAiClauses=applySelectedLeaseAiClauses;

function openPostNoticeModal(){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Post Notice</h2>
    <div class="form-group"><label>Title</label><input id="notice_title" class="form-input"></div>
    <div class="form-group" style="margin-top:10px"><label>Message</label><textarea id="notice_message" class="form-input form-textarea"></textarea></div>
    <div class="form-group" style="margin-top:10px"><label>Send to</label>
      <select id="notice_target" class="form-input">
        <option value="">All Tenants</option>
        ${tenantsData.filter(t=>t.status!=='vacant').map(t=>`<option value="${String(t.id).replace(/"/g,'&quot;')}">${String(t.name||'').replace(/</g,'&lt;')}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary btn-sm" onclick="saveNoticePost()">Post</button><button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button></div>
  `;
  nestiqOpenModalAnimated();
}

function nestiqNoticePropertyIdForTarget(targetRaw){
  if(!targetRaw) return null;
  const t=(tenantsData||[]).find(x=>String(x.id)===String(targetRaw));
  if(!t||t.propertyId==null||String(t.propertyId).trim()==='') return null;
  return String(t.propertyId);
}

async function nestiqUploadTenantPortalDocument(tenantId){
  const t=(tenantsData||[]).find(x=>Number(x.id)===Number(tenantId)||String(x.id)===String(tenantId));
  if(!t){ nestiqShowNotif('Tenant not found','error'); return; }
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  if(!window.nestiqDb||!lid){ nestiqShowNotif('Firestore not available','warning'); return; }
  const tenantDocId=String(t._fireId||t.id||'');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Upload tenant document</h2>
    <p class="modal-sub">${String(t.name||'Tenant')} · ${String(t.property||'')}</p>
    <div class="form-group"><label>Document name</label><input class="form-input" id="tdoc_name" placeholder="e.g. Signed lease agreement"></div>
    <div class="form-group" style="margin-top:10px"><label>Type</label>
      <select class="form-input" id="tdoc_type">
        <option value="lease">Lease agreement</option>
        <option value="receipt">Receipt</option>
        <option value="inspection">Inspection report</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="form-group" style="margin-top:10px"><label>File URL</label><input class="form-input" id="tdoc_url" placeholder="https://... (from Storage or external link)"></div>
    <p style="font-size:0.78rem;color:var(--muted);margin-top:8px">Paste a download link after uploading the file to Firebase Storage or your document host.</p>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveTenantPortalDocument(${Number(t.id)})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

async function nestiqSaveTenantPortalDocument(tenantId){
  const t=(tenantsData||[]).find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  const name=document.getElementById('tdoc_name')?.value?.trim();
  const type=document.getElementById('tdoc_type')?.value||'other';
  const url=document.getElementById('tdoc_url')?.value?.trim();
  if(!name||!url){ nestiqShowNotif('Name and file URL are required','error'); return; }
  const lid=window.nestiqCurrentLandlordUid?.();
  if(!lid||!window.nestiqDb) return;
  try{
    await window.nestiqFs.documents(window.nestiqDb, lid).add({
      tenantId:String(t._fireId||t.id),
      tenantUid:t.portalUid||null,
      propertyId:t.propertyId!=null?String(t.propertyId):'',
      landlordId:lid,
      name,
      type,
      url,
      uploadedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    nestiqCloseModalAnimated();
    nestiqShowNotif('Document shared with tenant','success');
  }catch(e){
    nestiqShowNotif('Could not save document','error');
    console.error(e);
  }
}

async function saveNoticePost(){
  const title=document.getElementById('notice_title')?.value?.trim();
  const message=document.getElementById('notice_message')?.value?.trim();
  const targetRaw=document.getElementById('notice_target')?.value||'';
  if(!title||!message){nestiqShowNotif('Add title and message','error');return;}
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const postedBy=String(landlordSettings?.name||'Admin');
  const propertyId=nestiqNoticePropertyIdForTarget(targetRaw);
  if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
    try{
      const row={
        title,
        message,
        body:message,
        date:new Date().toISOString().split('T')[0],
        postedBy,
        targetTenantId:targetRaw||null,
        propertyId:propertyId||'',
        readBy:[],
        landlordId:lid
      };
      if(fv) row.createdAt=fv.serverTimestamp();
      const docRef=await window.nestiqFs.notices(window.nestiqDb, lid).add(row);
      if(targetRaw) nestiqCommDefer(()=>window.nestiqAutoLogNotice?.(targetRaw,title,message));
      notifyTenantNewNotice?.({ id:docRef.id, ...row });
      nestiqCloseModalAnimated();
      nestiqShowNotif('📢 Notice posted!','success');
      return;
    }catch(err){
      nestiqShowNotif('Failed to post notice','error');
      return;
    }
  }
  notices.unshift({
    id:Date.now(),
    title,
    message,
    body:message,
    date:new Date().toISOString().split('T')[0],
    postedBy,
    targetTenantId:targetRaw||null,
    propertyId:propertyId||'',
    readBy:[]
  });
  saveData();
  if(targetRaw) nestiqCommDefer(()=>window.nestiqAutoLogNotice?.(targetRaw,title,message));
  notifyTenantNewNotice?.(notices[0]);
  nestiqCloseModalAnimated();
  nestiqShowNotif('Notice posted','success');
}

window.openPostNoticeModal=openPostNoticeModal;
window.saveNoticePost=saveNoticePost;
window.nestiqUploadTenantPortalDocument=nestiqUploadTenantPortalDocument;
window.nestiqSaveTenantPortalDocument=nestiqSaveTenantPortalDocument;

function openMessageAllOverdueModal(){
  syncTenantStatuses();
  const list=tenantsData.filter(t=>t.status==='overdue');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Message All Overdue Tenants</h2>
    <div style="font-size:0.84rem;color:var(--muted);margin-bottom:10px">${list.length} overdue tenant(s)</div>
    <div style="max-height:220px;overflow:auto">${list.map(t=>`<div style="padding:8px 0;border-bottom:1px solid var(--border-soft)">${t.name} · ${t.property}</div>`).join('')||'<div style="color:var(--muted)">No overdue tenants</div>'}</div>
    <div id="waBulkCounter" style="font-size:0.82rem;color:var(--muted);margin-top:10px"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-whatsapp btn-sm" onclick="sendOverdueWhatsAppToAll()">Send to All</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button>
    </div>
  `;
  nestiqOpenModalAnimated();
}

async function sendOverdueWhatsAppToAll(){
  syncTenantStatuses();
  const list=tenantsData.filter(t=>t.status==='overdue');
  for(let i=0;i<list.length;i++){
    const t=list[i];
    const c=document.getElementById('waBulkCounter');
    if(c) c.textContent=`Sending ${i+1} of ${list.length}...`;
    sendTenantWhatsAppTemplate(t.id,'overdueNotice');
    await new Promise(r=>setTimeout(r,1000));
  }
  const c=document.getElementById('waBulkCounter');
  if(c) c.textContent='Done';
}

window.openMessageAllOverdueModal=openMessageAllOverdueModal;
window.sendOverdueWhatsAppToAll=sendOverdueWhatsAppToAll;

function openLandlordTenantMessages(tenantId, opts){
  opts=opts||{};
  const tenant=(tenantsData||[]).find(t=>String(t.id)===String(tenantId));
  if(!tenant) return;
  window.__nestiqOpenChatTenantId=tenantId;
  if(document.getElementById('nestiqChatEditBox')&&opts.skipOpen) return;
  const src=Array.isArray(window.messages)?window.messages:(Array.isArray(messages)?messages:[]);
  const scoped=src.filter(m=>String(m.tenantId)===String(tenantId));
  const thread=(typeof nestiqCaretakerChatThread==='function'?nestiqCaretakerChatThread(scoped):scoped.filter(m=>m.fromRole==='tenant'||m.fromRole==='caretaker'))
    .slice()
    .sort((a,b)=>new Date(a.date||0)-new Date(b.date||0));
  const caretakerName=(()=>{
    const p=(window.propertiesData||[]).find(x=>String(x.id)===String(tenant.propertyId||''));
    return String(p?.caretakerName||'Assigned caretaker');
  })();
  const caretaker={name:caretakerName};
  const headAv=typeof nestiqChatAvatarHtml==='function'?nestiqChatAvatarHtml(tenant,44):'';
  const threadHtml=typeof nestiqChatThreadHtml==='function'
    ? nestiqChatThreadHtml(thread,{mineRole:'landlord',observer:true,tenant,caretaker})
    : `<div style="color:var(--muted)">No messages yet.</div>`;
  document.getElementById('modalContent').innerHTML=`
    <div class="nestiq-chat-head nestiq-chat-head-modal">
      ${headAv}
      <div class="nestiq-chat-head-meta">
        <div class="nestiq-chat-head-name">${String(tenant.name||'Tenant').replace(/</g,'&lt;')}</div>
        <div class="nestiq-chat-head-sub">${String(tenant.unit||'—').replace(/</g,'&lt;')} · ${String(tenant.property||'—').replace(/</g,'&lt;')}</div>
      </div>
      <span class="nestiq-viewonly-pill">View only</span>
    </div>
    <div class="nestiq-chat-viewonly">Tenants speak with <strong>${String(caretakerName).replace(/</g,'&lt;')}</strong> — the caretaker for this property. You cannot send messages in this thread.</div>
    <div class="tenant-chat nestiq-landlord-thread" id="lmThread">${thread.length?threadHtml:`<div class="nestiq-chat-empty">No caretaker conversation yet.</div>`}</div>
  `;
  if(!opts.skipOpen) nestiqOpenModalAnimated();
  const th=document.getElementById('lmThread'); if(th) th.scrollTop=th.scrollHeight;
}

async function sendLandlordReply(){
  nestiqShowNotif?.('Only the property caretaker can message tenants in-app. Use email or WhatsApp for official notices.','info');
}

window.openLandlordTenantMessages=openLandlordTenantMessages;
window.sendLandlordReply=sendLandlordReply;

async function deleteTenant(id){
  const tid=String(id??'').trim();
  if(!tid){
    nestiqShowNotif?.('Could not remove tenant — missing id.','error');
    return;
  }
  const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  const tenant=list.find(t=>String(t.id)===tid);
  const name=String(tenant?.name||'this tenant');
  if(!confirm(`Remove ${name} from your tenants list? This cannot be undone.`)) return;
  if(tenant && typeof nestiqUnlinkTenantFromUnit==='function'){
    try{ await nestiqUnlinkTenantFromUnit(tenant); }catch(_e){}
  }
  try{ await window.nestiqTerminateLeasesForTenant?.(tid); }catch(_e){}
  try{ await window.nestiqMarkApplicationsTenancyEndedForTenant?.(tenant); }catch(_e){}
  const portalUid=String(tenant?.portalUid||tenant?.tenantUid||'').trim();
  if(portalUid && typeof window.nestiqReleaseTenantAccount==='function'){
    try{ await window.nestiqReleaseTenantAccount(portalUid); }catch(_e){}
  }
  const kept=list.filter(t=>String(t.id)!==tid);
  if(Array.isArray(tenantsData)){
    tenantsData.length=0;
    kept.forEach(t=>tenantsData.push(t));
  }
  window.tenantsData=Array.isArray(tenantsData)?tenantsData:kept;
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  try{
    const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
    const db=window.nestiqDb;
    if(window.nestiqUseFirestore&&db&&lid){
      const col=window.nestiqFs?.tenants?.(db,lid);
      if(col) await col.doc(tid).delete();
      try{ await window.nestiqFs?.caretakerTenants?.(db,lid)?.doc(tid)?.delete?.(); }catch(_e){}
    }else{
      saveData();
    }
  }catch(err){
    console.warn('[NestIQ] deleteTenant cloud', err);
    nestiqShowNotif?.('Could not remove tenant from the cloud. They may reappear until this succeeds.','error');
    renderTenants();
    return;
  }
  nestiqCloseModalAnimated?.();
  renderTenants();
  renderProperties?.();
  nestiqShowNotif('Tenant removed','warning');
}
window.deleteTenant=deleteTenant;

function exportTenantsCSV(){
  const hdr='Name,Unit,Property,Rent,Status,Lease End,Phone,Email';
  const rows=tenantsData.map(t=>`"${t.name}","${t.unit}","${t.property}",${t.rent},"${t.status}","${t.lease}","${t.phone}","${t.email}"`);
  downloadCSV([hdr,...rows].join('\n'),'nestiq-tenants.csv');
  nestiqShowNotif('📥 Tenants exported!','success');
}

window.updateTenantPaymentStatuses=syncTenantStatuses;

