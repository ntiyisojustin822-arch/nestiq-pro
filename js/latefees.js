/* ═══════════════════════════════
   LATE FEE POLICY, CALCULATION & TRACKING
═══════════════════════════════ */

function getLateFeePolicy(){
  const d={
    type:'fixed',
    fixedAmount:250,
    percentage:10,
    graceDays:3,
    maxEnabled:true,
    maxAmount:1000,
    compoundEnabled:false,
    compoundDays:7
  };
  const p=landlordSettings?.lateFeePolicy;
  if(!p||typeof p!=='object') return d;
  return{
    type:p.type==='percentage'?'percentage':'fixed',
    fixedAmount:Math.max(0,Number(p.fixedAmount??250)),
    percentage:Math.max(0,Number(p.percentage??10)),
    graceDays:Math.max(0,Number(p.graceDays??3)),
    maxEnabled:p.maxEnabled!==false,
    maxAmount:Math.max(0,Number(p.maxAmount??1000)),
    compoundEnabled:Boolean(p.compoundEnabled),
    compoundDays:Math.max(1,Number(p.compoundDays??7))
  };
}

function lfMonthKey(d){
  const x=new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
}

function lfTenantPaidMonth(tenant,ym){
  return (tenant.payments||[]).some(p=>String(p.date||'').slice(0,7)===ym)
    ||(paymentsData||[]).some(p=>p.tenantId===tenant.id&&String(p.date||'').slice(0,7)===ym);
}

function lfIsWaivedForMonth(tenantId,ym){
  return(lateFees||[]).some(x=>Number(x.tenantId)===Number(tenantId)&&x.month===ym&&x.waived);
}

function lfReferenceDateForMonth(y,m){
  const now=new Date();
  const cy=now.getFullYear(),cm=now.getMonth()+1;
  if(y>cy||(y===cy&&m>cm)) return null;
  if(y===cy&&m===cm) return now;
  return new Date(y,m,0);
}

function calculateLateFee(tenant,date=new Date()){
  if(!tenant||tenant.status==='vacant') return 0;
  const pol=getLateFeePolicy();
  const d=new Date(date);
  const y=d.getFullYear(),mo=d.getMonth();
  const ym=lfMonthKey(d);
  if(lfTenantPaidMonth(tenant,ym)) return 0;
  if(lfIsWaivedForMonth(tenant.id,ym)) return 0;
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const dueDate=new Date(y,mo,dueDay);
  const graceEnd=new Date(dueDate);
  graceEnd.setDate(graceEnd.getDate()+Number(pol.graceDays));
  const today0=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const grace0=new Date(graceEnd.getFullYear(),graceEnd.getMonth(),graceEnd.getDate());
  if(today0<=grace0) return 0;
  const daysPastGrace=Math.ceil((today0-grace0)/86400000);
  const base=pol.type==='percentage'
    ?Math.round(Number(tenant.rent||0)*(Number(pol.percentage)/100))
    :Math.round(Number(pol.fixedAmount));
  let additionalFees=0;
  if(pol.compoundEnabled&&pol.compoundDays>0){
    additionalFees=Math.floor(daysPastGrace/pol.compoundDays);
  }
  let fee=base*(1+additionalFees);
  if(pol.maxEnabled) fee=Math.min(fee,Number(pol.maxAmount));
  return Math.max(0,fee);
}

function getLateFeeBreakdown(tenant,date=new Date()){
  const pol=getLateFeePolicy();
  const d=new Date(date);
  const y=d.getFullYear(),mo=d.getMonth();
  const ym=lfMonthKey(d);
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const dueDate=new Date(y,mo,dueDay);
  const graceEnd=new Date(dueDate);
  graceEnd.setDate(graceEnd.getDate()+Number(pol.graceDays));
  const today0=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const grace0=new Date(graceEnd.getFullYear(),graceEnd.getMonth(),graceEnd.getDate());
  const daysFromDue=Math.ceil((today0-new Date(y,mo,dueDay))/86400000);
  const daysPastGrace=today0>grace0?Math.ceil((today0-grace0)/86400000):0;
  const fee=(tenant.status==='vacant'||lfTenantPaidMonth(tenant,ym)||lfIsWaivedForMonth(tenant.id,ym))
    ?0
    :calculateLateFee(tenant,date);
  const rent=Number(tenant.rent||0);
  return{
    ym,
    dueDate,
    graceDays:pol.graceDays,
    daysOverdue:Math.max(0,daysFromDue),
    daysPastGrace,
    fee,
    rent,
    total:rent+fee,
    graceEnd:grace0
  };
}

function lateFeeShowForTenant(tenant){
  if(!tenant||tenant.status!=='overdue') return false;
  const fee=calculateLateFee(tenant,new Date());
  return fee>0;
}

function lateFeeDisplayAmount(tenant){
  return lateFeeShowForTenant(tenant)?calculateLateFee(tenant,new Date()):0;
}

function lateFeeRentRollAmount(r,y,m){
  const ref=lfReferenceDateForMonth(y,m);
  if(!ref||r.status==='VACANT'||!r.tenant) return 0;
  if(r.status==='PAID') return 0;
  return calculateLateFee(r.tenant,ref);
}

function lateFeeRentRollCell(r,y,m){
  const n=lateFeeRentRollAmount(r,y,m);
  return n>0?`<span class="rentroll-money rentroll-out">R${n.toLocaleString('en-ZA')}</span>`:'—';
}

function lateFeeNoticeWhatsApp(tenant){
  const b=getLateFeeBreakdown(tenant,new Date());
  const duePretty=`${Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)))} ${new Date().toLocaleString('en-ZA',{month:'long',year:'numeric'})}`;
  return `Dear ${tenant.name}, your rent of R${Number(tenant.rent||0).toLocaleString()} for ${tenant.property} - ${tenant.unit} was due on ${duePretty} and remains unpaid. A late fee of R${b.fee.toLocaleString()} has been applied. Total amount now due: R${b.total.toLocaleString()}. Please make payment immediately to avoid additional charges. — NestIQ Pro`;
}

function lateFeeSendNotice(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const phone=typeof ensureTenantPhoneOrEdit==='function'?ensureTenantPhoneOrEdit(t):formatWhatsAppNumber(t.phone||'');
  if(!phone) return;
  openWhatsApp(t.phone,lateFeeNoticeWhatsApp(t),{tenantId:t.id,tenantName:t.name,type:'lateFeeNotice'});
}

function lfUpsertOpenRecord(tenant,ym,feeAmount,daysOverdue){
  let row=(lateFees||[]).find(x=>String(x.tenantId)===String(tenant.id)&&x.month===ym&&!x.collected&&!x.waived);
  const today=new Date().toISOString().slice(0,10);
  if(!row){
    row={
      id:Date.now()+Math.floor(Math.random()*999),
      tenantId:tenant.id,
      tenantName:tenant.name,
      propertyId:tenant.propertyId??null,
      propertyName:tenant.property,
      month:ym,
      rentAmount:Number(tenant.rent||0),
      lateFeeAmount:feeAmount,
      daysOverdue,
      rentDueDate:ym+'-'+String(Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)))).padStart(2,'0'),
      appliedOn:today,
      status:'outstanding',
      collected:false,
      collectedDate:null,
      waived:false,
      waivedDate:null,
      waivedReason:''
    };
    lateFees.unshift(row);
  }else{
    row.lateFeeAmount=feeAmount;
    row.daysOverdue=daysOverdue;
    row.rentAmount=Number(tenant.rent||0);
    if(!row.appliedOn) row.appliedOn=today;
    if(!row.rentDueDate){
      row.rentDueDate=ym+'-'+String(Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)))).padStart(2,'0');
    }
  }
  return row;
}

function lfMarkCollected(tenant,ym,feeAmount,daysOverdue){
  if((lateFees||[]).some(x=>Number(x.tenantId)===Number(tenant.id)&&x.month===ym&&x.collected)) return;
  const row=lfUpsertOpenRecord(tenant,ym,feeAmount,daysOverdue);
  row.collected=true;
  row.collectedDate=new Date().toISOString().slice(0,10);
  row.lateFeeAmount=feeAmount;
  row.waived=false;
  row.status='paid';
  const monthLbl=new Date(ym+'-01').toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
  expenses.unshift({
    id:typeof expNextId==='number'?expNextId++:Date.now(),
    cat:'Late Fee',
    desc:`Late fee — ${tenant.name} — ${monthLbl}`,
    amount:feeAmount,
    prop:tenant.property,
    date:new Date().toISOString().slice(0,10),
    tenantId:tenant.id,
    isIncome:true,
    color:(typeof catColors!=='undefined'&&catColors['Late Fee'])||'#c9a84c'
  });
  saveData();
}

function lfMarkWaived(tenant,ym,reason){
  let row=(lateFees||[]).find(x=>Number(x.tenantId)===Number(tenant.id)&&x.month===ym);
  if(!row){
    row={
      id:Date.now(),
      tenantId:tenant.id,
      tenantName:tenant.name,
      propertyId:tenant.propertyId??null,
      propertyName:tenant.property,
      month:ym,
      rentAmount:Number(tenant.rent||0),
      lateFeeAmount:calculateLateFee(tenant,new Date()),
      daysOverdue:typeof getTenantDaysOverdue==='function'?getTenantDaysOverdue(tenant):0,
      status:'waived',
      collected:false,
      collectedDate:null,
      waived:true,
      waivedDate:new Date().toISOString().slice(0,10),
      waivedReason:String(reason||'')
    };
    lateFees.unshift(row);
  }else{
    row.waived=true;
    row.waivedDate=new Date().toISOString().slice(0,10);
    row.waivedReason=String(reason||'');
    row.collected=false;
    row.status='waived';
  }
  saveData();
}

function openLateFeeWaiveModal(tenantId,opts){
  opts=opts||{};
  const t=tenantsData.find(x=>String(x.id)===String(tenantId));
  if(!t) return;
  const fee=calculateLateFee(t,new Date());
  const ym=lfMonthKey(new Date());
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Waive late fee</h2>
    <p class="modal-sub">Are you sure you want to waive the late fee of R${fee.toLocaleString('en-ZA')} for ${String(t.name||'').replace(/</g,'')}?</p>
    <div class="form-group"><label>Reason (optional)</label><textarea id="lf_waive_reason" class="form-input form-textarea" placeholder="e.g. Payment plan agreed"></textarea></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-top:8px">
      <input type="checkbox" id="lf_waive_wa"> Send WhatsApp to tenant
    </label>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button type="button" class="btn-primary btn-sm" onclick='confirmLateFeeWaive(${JSON.stringify(tenantId)},${JSON.stringify(ym)})'>Waive Fee</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  window.__lfWaiveOpts=opts;
}

function confirmLateFeeWaive(tenantId,ym){
  const t=tenantsData.find(x=>String(x.id)===String(tenantId));
  if(!t) return;
  const fee=calculateLateFee(t,new Date());
  const reason=document.getElementById('lf_waive_reason')?.value?.trim()||'';
  const sendWa=Boolean(document.getElementById('lf_waive_wa')?.checked);
  lfMarkWaived(t,ym,reason);
  if(sendWa&&t.phone){
    const monthLbl=new Date(ym+'-01').toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
    const msg=`Dear ${t.name}, as a gesture of goodwill the late fee of R${fee.toLocaleString()} for ${monthLbl} has been waived. Please ensure your rent of R${Number(t.rent||0).toLocaleString()} is paid immediately. — NestIQ Pro`;
    openWhatsApp(t.phone,msg,{tenantId:t.id,tenantName:t.name,type:'lateFeeWaive'});
  }
  closeModal();
  const o=window.__lfWaiveOpts||{};
  window.__lfWaiveOpts=null;
  if(o.reopenTenant) viewTenant(tenantId);
  showNotif('Late fee waived','success');
  renderTenants?.();
  renderRentRoll?.();
  if(document.getElementById('lateFeeTableBody')) nestiqRenderLateFeesPage?.();
}

function lateFeeEnhancePaymentModal(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t||t.status!=='overdue') return;
  const fee=calculateLateFee(t,new Date());
  if(fee<=0) return;
  const b=getLateFeeBreakdown(t,new Date());
  const rent=Number(t.rent||0);
  const total=rent+fee;
  const mc=document.getElementById('modalContent');
  if(!mc||!document.getElementById('pay_amount')) return;
  const box=document.createElement('div');
  box.id='lf_pay_box';
  box.style.cssText='margin-bottom:14px;padding:12px;border-radius:10px;border:1px solid var(--rust);background:rgba(196,106,58,0.08);font-size:0.84rem';
  box.innerHTML=`
    <div style="font-weight:700;margin-bottom:8px;color:var(--rust)">Late fee applies</div>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer">
      <input type="radio" name="lf_pay_mode" value="full" checked>
      <span><strong>Full payment with late fee</strong> — R${total.toLocaleString('en-ZA')} (rent + fee)</span>
    </label>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer">
      <input type="radio" name="lf_pay_mode" value="rent">
      <span><strong>Rent only (waive late fee)</strong> — R${rent.toLocaleString('en-ZA')}. Late fee of R${fee.toLocaleString('en-ZA')} will be waived.</span>
    </label>
    <button type="button" class="btn-outline btn-sm" style="margin-top:6px" onclick="openLateFeeWaiveModal(${tenantId},{reopenTenant:false})">Waive late fee only</button>`;
  const first=mc.querySelector('.form-group');
  if(first) first.parentNode.insertBefore(box,first);
  document.querySelectorAll('input[name="lf_pay_mode"]').forEach(r=>{
    r.addEventListener('change',()=>{
      const v=document.querySelector('input[name="lf_pay_mode"]:checked')?.value;
      const pa=document.getElementById('pay_amount');
      if(pa) pa.value=v==='full'?String(total):String(rent);
    });
  });
  const pa0=document.getElementById('pay_amount');
  if(pa0) pa0.value=String(total);
}

function lateFeeSubmitPaymentWrapper(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t) return;
  const mode=document.querySelector('input[name="lf_pay_mode"]:checked')?.value;
  const amount=Number(document.getElementById('pay_amount')?.value||0);
  const method=document.getElementById('pay_method')?.value||'EFT';
  const reference=document.getElementById('pay_ref')?.value||'';
  const emailReceipt=Boolean(document.getElementById('pay_email_receipt')?.checked);
  const payDateRaw=document.getElementById('pay_date')?.value?.trim()||'';
  if(amount<=0){ showNotif('Enter a valid payment amount','error'); return; }
  const extra=window.__nestiqPaymentModalExtra||{};
  window.__nestiqPaymentModalExtra={};
  const fee=calculateLateFee(t,new Date());
  const rent=Number(t.rent||0);
  const ym=lfMonthKey(new Date());
  if(mode==='rent'&&fee>0){
    lfMarkWaived(t,ym,'Rent-only payment recorded');
  }
  const payment=recordPayment(tenantId,amount,method,reference,{
    emailReceipt,
    paymentDate:/^\d{4}-\d{2}-\d{2}$/.test(payDateRaw)?payDateRaw:undefined
  });
  if(payment&&mode==='full'&&fee>0&&amount>=rent+fee-0.01){
    lfMarkCollected(t,ym,fee,getTenantDaysOverdue(t));
  }
  if(payment&&typeof extra.onRecorded==='function') extra.onRecorded();
}

function lateFeesEnhanceTenantGrid(){
  const grid=document.getElementById('tenantsGrid');
  if(!grid) return;
  syncTenantStatuses?.();
  const list=(tenantsData||[]).filter(t=>t&&t.id!=null);
  const cards=grid.querySelectorAll('.tenant-card');
  list.forEach((t,i)=>{
    const fee=lateFeeDisplayAmount(t);
    const wrap=cards[i]?.querySelector('.tenant-tag');
    if(!wrap) return;
    const statusBadge=wrap.querySelector('.badge');
    if(fee>0&&statusBadge&&!wrap.querySelector('.late-fee-badge')){
      statusBadge.insertAdjacentHTML('afterend',`<span class="badge badge-red late-fee-badge">Late fee: R${fee.toLocaleString('en-ZA')}</span>`);
    }
    const wam=wrap.querySelector(`#waDrop_${t.id} .wa-menu`);
    if(wam&&t.status==='overdue'&&fee>0&&!wam.querySelector('[data-lf-notice-btn]')){
      wam.insertAdjacentHTML('beforeend',`<button type="button" class="wa-item" data-lf-notice-btn="1" onclick="event.stopPropagation();lateFeeSendNotice(${t.id})">Send Late Fee Notice</button>`);
    }
  });
}

function lateFeeDetailHtml(t){
  if(t.status!=='overdue') return '';
  const b=getLateFeeBreakdown(t,new Date());
  const waivedMo=lfIsWaivedForMonth(t.id,b.ym);
  if(b.fee<=0&&!waivedMo) return '';
  const title=waivedMo&&!b.fee?'Late fee waived (this month)':'Late fee applicable';
  const hist=(lateFees||[]).filter(x=>Number(x.tenantId)===Number(t.id)).slice(0,12);
  const histRows=hist.map(h=>`<tr>
    <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${h.month}</td>
    <td style="padding:6px;border-bottom:1px solid var(--border-soft)">R${Number(h.lateFeeAmount||0).toLocaleString('en-ZA')}</td>
    <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${h.collected?'Collected':h.waived?'Waived':'Open'}</td>
    <td style="padding:6px;border-bottom:1px solid var(--border-soft)">${h.collectedDate||h.waivedDate||'—'}</td>
  </tr>`).join('');
  const feeLines=b.fee>0?`
        <div>Days overdue (from due date): ${b.daysOverdue}</div>
        <div>Grace period: ${b.graceDays} days</div>
        <div>Days past grace period: ${b.daysPastGrace}</div>
        <div>Late fee: <strong>R${b.fee.toLocaleString('en-ZA')}</strong></div>
        <div>Total amount owed: R${b.rent.toLocaleString('en-ZA')} + R${b.fee.toLocaleString('en-ZA')} = <strong>R${b.total.toLocaleString('en-ZA')}</strong></div>`
    :`<div style="font-size:0.82rem;color:var(--muted)">No late fee is currently charged for this month (waived).</div>`;
  return `
    <div style="margin-top:14px;border:1px solid var(--rust);border-radius:10px;padding:12px;background:rgba(196,106,58,0.06)">
      <div style="font-weight:700;margin-bottom:8px;color:var(--rust)">${title}</div>
      <div style="font-size:0.82rem;line-height:1.55">
        ${feeLines}
      </div>
      ${b.fee>0?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="btn-whatsapp btn-sm" onclick="lateFeeSendNotice(${t.id})">${typeof whatsappIconSvg==='function'?whatsappIconSvg():'📱'} Send Late Fee Notice</button>
        <button type="button" class="btn-outline btn-sm" onclick="openLateFeeWaiveModal(${t.id},{reopenTenant:true})">Waive late fee</button>
      </div>`:''}
    </div>
    ${hist.length?`<div style="margin-top:12px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:8px">Late Fee History</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.78rem">
        <thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border-soft)">Month</th><th style="text-align:left;padding:6px">Amount</th><th style="text-align:left;padding:6px">Status</th><th style="text-align:left;padding:6px">Date</th></tr></thead>
        <tbody>${histRows}</tbody>
      </table>
    </div>`:''}`;
}

function lateFeeEnhanceViewTenantModal(id){
  const mc=document.getElementById('modalContent');
  if(!mc||mc.querySelector('.lf-detail-injected')) return;
  const t=tenantsData.find(x=>x.id===id);
  if(!t) return;
  const html=lateFeeDetailHtml(t);
  if(!html) return;
  const foot=document.getElementById('tenantDetailFooter');
  if(foot) foot.insertAdjacentHTML('beforebegin',`<div class="lf-detail-injected">${html}</div>`);
}

function lateFeeSyncSettingsForm(){
  const p=getLateFeePolicy();
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  const chk=(id,v)=>{const el=document.getElementById(id);if(el)el.checked=Boolean(v);};
  const type=document.querySelector(`input[name="lf_pol_type"][value="${p.type}"]`);
  if(type) type.checked=true;
  set('lf_fixed_amt',p.fixedAmount);
  set('lf_pct',p.percentage);
  set('lf_grace',p.graceDays);
  chk('lf_max_en',p.maxEnabled);
  set('lf_max_amt',p.maxAmount);
  chk('lf_compound',p.compoundEnabled);
  set('lf_compound_days',p.compoundDays);
  lateFeeToggleSettingsFields();
}

function lateFeeToggleSettingsFields(){
  const t=document.querySelector('input[name="lf_pol_type"]:checked')?.value||'fixed';
  const fw=document.getElementById('lf_fixed_wrap');
  const pw=document.getElementById('lf_pct_wrap');
  if(fw) fw.style.display=t==='fixed'?'block':'none';
  if(pw) pw.style.display=t==='percentage'?'block':'none';
  const me=document.getElementById('lf_max_amt');
  if(me) me.disabled=!document.getElementById('lf_max_en')?.checked;
}

function saveLateFeePolicyFromForm(){
  landlordSettings.lateFeePolicy={
    type:document.querySelector('input[name="lf_pol_type"]:checked')?.value==='percentage'?'percentage':'fixed',
    fixedAmount:Number(document.getElementById('lf_fixed_amt')?.value||250),
    percentage:Number(document.getElementById('lf_pct')?.value||10),
    graceDays:Number(document.getElementById('lf_grace')?.value||3),
    maxEnabled:Boolean(document.getElementById('lf_max_en')?.checked),
    maxAmount:Number(document.getElementById('lf_max_amt')?.value||1000),
    compoundEnabled:Boolean(document.getElementById('lf_compound')?.checked),
    compoundDays:Number(document.getElementById('lf_compound_days')?.value||7)
  };
  saveData();
  showNotif('Late fee policy saved','success');
}

function getLateFeesCollectedForYear(year){
  return(lateFees||[]).filter(h=>h.collected&&String(h.collectedDate||'').startsWith(String(year)))
    .reduce((s,h)=>s+Number(h.lateFeeAmount||0),0);
}

function lateFeeTaxAppend(year){
  const el=document.getElementById('taxLateFeeSection');
  if(!el) return;
  const y=Number(year)||new Date().getFullYear();
  const amt=getLateFeesCollectedForYear(y);
  el.innerHTML=`<div class="tax-section-title">Late fees collected (${y})</div>
    <div class="tax-row"><span>Late fee income</span><span class="tax-val income">R${amt.toLocaleString('en-ZA')}</span></div>
    <div style="font-size:0.78rem;color:var(--muted);margin-top:8px">Recorded when full payments including late fees are saved from the payment modal.</div>`;
}

function lateFeeRunBellChecks(){
  if(typeof getSession!=='function') return;
  const s=getSession();
  if(s?.role!=='landlord') return;
  const now=new Date();
  const ym=lfMonthKey(now);
  (tenantsData||[]).forEach(t=>{
    if(!t||t.status!=='overdue') return;
    const fee=calculateLateFee(t,now);
    if(fee<=0) return;
    const key=`lf-bell-${t.id}-${ym}`;
    try{
      const o=JSON.parse(localStorage.getItem('nestiqRenewalBellTs')||'{}');
      if(Date.now()-Number(o[key]||0)<12*3600000) return;
      o[key]=Date.now();
      localStorage.setItem('nestiqRenewalBellTs',JSON.stringify(o));
    }catch(_e){}
    addBellNotif('💰',`Late fee applicable: ${t.name} — R${fee.toLocaleString('en-ZA')} — ${getTenantDaysOverdue(t)} days overdue`);
  });
}

function lateFeePatchChartStats(){
  const row=document.getElementById('chartStatsRow');
  if(!row||row.querySelector('[data-lf-ytd]')) return;
  const y=new Date().getFullYear();
  const amt=getLateFeesCollectedForYear(y);
  const div=document.createElement('div');
  div.className='chart-stat';
  div.dataset.lfYtd='1';
  div.innerHTML=`<div class="chart-stat-val">R${amt.toLocaleString('en-ZA')}</div><div class="chart-stat-lbl">Late fee income (${y})</div><div class="chart-stat-trend trend-up">YTD</div>`;
  row.appendChild(div);
}

function lateFeeRentRollExtraActions(r,y,m){
  if(r.status==='VACANT'||!r.tenant||r.status==='PAID') return '';
  const ref=lfReferenceDateForMonth(y,m);
  if(!ref) return '';
  const fee=calculateLateFee(r.tenant,ref);
  if(fee<=0) return '';
  const tid=r.tenant.id;
  return `<button type="button" class="rentroll-icon-btn" title="Late fee notice" onclick="lateFeeSendNotice(${tid})">📣</button>
    <button type="button" class="rentroll-icon-btn" title="Waive late fee" onclick="openLateFeeWaiveModal(${tid},{})">✋</button>`;
}

function lateFeeWrapRenderTenants(){
  const o=renderTenants;
  window.renderTenants=function(){ o(); lateFeesEnhanceTenantGrid(); };
}

function lateFeeWrapViewTenant(){
  const o=viewTenant;
  window.viewTenant=function(id){ o(id); setTimeout(()=>lateFeeEnhanceViewTenantModal(id),0); };
}

function lateFeeWrapOpenPayment(){
  const o=openPaymentModal;
  window.openPaymentModal=function(tenantId,extra){ o(tenantId,extra); setTimeout(()=>lateFeeEnhancePaymentModal(tenantId),0); };
}

function lateFeeWrapSubmitPayment(){
  const o=submitPaymentModal;
  window.submitPaymentModal=function(tenantId){
    if(document.getElementById('lf_pay_box')) return lateFeeSubmitPaymentWrapper(tenantId);
    return o(tenantId);
  };
}

function lateFeeWrapBuildWa(){
  if(typeof buildTenantWhatsAppMessage!=='function') return;
  const inner=buildTenantWhatsAppMessage;
  const wrapped=function(tenant,type){
    if(type==='lateFeeNotice') return lateFeeNoticeWhatsApp(tenant);
    return inner(tenant,type);
  };
  window.buildTenantWhatsAppMessage=wrapped;
  try{ buildTenantWhatsAppMessage=wrapped; }catch(_e){}
}

function lateFeeWrapRenderSettings(){
  const o=renderSettings;
  window.renderSettings=function(){ o(); lateFeeSyncSettingsForm(); };
}

function lateFeeWrapInitCharts(){
  const o=initCharts;
  window.initCharts=function(){ o(); lateFeePatchChartStats(); };
}

function lateFeeWrapRenderTax(){
  const o=renderTaxReport;
  window.renderTaxReport=function(){ o(); lateFeeTaxAppend(parseInt(document.getElementById('taxYear')?.value,10)||new Date().getFullYear()); };
}

if(!window.__nestiqLateFeesWrapped){
  window.__nestiqLateFeesWrapped=true;
  lateFeeWrapRenderTenants();
  lateFeeWrapViewTenant();
  lateFeeWrapOpenPayment();
  lateFeeWrapSubmitPayment();
  lateFeeWrapBuildWa();
  lateFeeWrapRenderSettings();
  lateFeeWrapInitCharts();
  lateFeeWrapRenderTax();
  const prevNotif=window.initNotificationsForSession;
  window.initNotificationsForSession=function(){
    prevNotif?.();
    lateFeeRunBellChecks();
    if(!window.__nestiqLateFeeHourly){
      window.__nestiqLateFeeHourly=setInterval(lateFeeRunBellChecks,60*60*1000);
    }
  };
}

function nestiqLateFeeRowStatus(h){
  const s=String(h?.status||'').toLowerCase();
  if(s==='paid'||h?.collected) return 'paid';
  if(s==='waived'||h?.waived) return 'waived';
  return 'outstanding';
}

function nestiqLateFeeLedgerRows(){
  return Array.isArray(lateFees)?lateFees.slice():[];
}

function nestiqLateFeeMonthPrefix(d){
  return lfMonthKey(d instanceof Date?d:new Date());
}

function nestiqLateFeeInMonth(iso,ym){
  return String(iso||'').startsWith(String(ym));
}

function nestiqRenderLateFeePolicySummary(){
  const host=document.getElementById('lateFeePolicySummary');
  if(!host) return;
  const pol=getLateFeePolicy();
  const typeLbl=pol.type==='percentage'
    ?`Percentage <strong>${Number(pol.percentage)}%</strong>`
    :`Fixed <strong>R${Number(pol.fixedAmount).toLocaleString('en-ZA')}</strong>`;
  const maxLbl=pol.maxEnabled
    ?`Maximum fee cap <strong>R${Number(pol.maxAmount).toLocaleString('en-ZA')}</strong>`
    :`Maximum fee cap <strong>Off</strong>`;
  const compoundLbl=pol.compoundEnabled
    ?`Compound <strong>On</strong> (every ${Number(pol.compoundDays)} days)`
    :`Compound <strong>Off</strong>`;
  host.innerHTML=`
    <div style="padding:16px 18px;border:1px solid var(--border);border-radius:14px;background:var(--card-bg);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">
      <div style="font-size:0.9rem;line-height:1.55;color:var(--muted);max-width:72ch">
        <div style="font-weight:700;color:var(--ink);margin-bottom:4px">Active late fee policy</div>
        ${typeLbl}
        · Grace period <strong>${Number(pol.graceDays)} days</strong>
        · ${maxLbl}
        · ${compoundLbl}
      </div>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenLateFeeSettingsModal()">Edit policy</button>
    </div>`;
}

function nestiqRenderLateFeeStats(){
  const host=document.getElementById('lateFeeStatsRow');
  if(!host) return;
  const rows=nestiqLateFeeLedgerRows();
  const ym=nestiqLateFeeMonthPrefix(new Date());
  const outstandingAmt=rows
    .filter(r=>nestiqLateFeeRowStatus(r)==='outstanding')
    .reduce((s,r)=>s+Number(r.lateFeeAmount||0),0);
  const appliedThisMonth=rows.filter(r=>nestiqLateFeeInMonth(r.appliedOn,ym)||(r.month===ym&&!r.collected&&!r.waived&&r.status!=='paid'&&r.status!=='waived')).length;
  const waivedThisMonth=rows.filter(r=>nestiqLateFeeRowStatus(r)==='waived'&&(nestiqLateFeeInMonth(r.waivedDate,ym)||r.month===ym)).length;
  const collectedThisMonth=rows
    .filter(r=>nestiqLateFeeRowStatus(r)==='paid'&&nestiqLateFeeInMonth(r.collectedDate||r.appliedOn,ym))
    .reduce((s,r)=>s+Number(r.lateFeeAmount||0),0);
  host.innerHTML=`
    <div class="nestiq-app-stat-card nestiq-app-stat-amber"><div class="nestiq-app-stat-val">R${outstandingAmt.toLocaleString('en-ZA')}</div><div class="nestiq-app-stat-lbl">Total Outstanding Fees</div></div>
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${appliedThisMonth}</div><div class="nestiq-app-stat-lbl">Fees Applied This Month</div></div>
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${waivedThisMonth}</div><div class="nestiq-app-stat-lbl">Fees Waived This Month</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-green"><div class="nestiq-app-stat-val">R${collectedThisMonth.toLocaleString('en-ZA')}</div><div class="nestiq-app-stat-lbl">Fees Collected This Month</div></div>`;
}

function nestiqFilterLateFeeLedger(){
  const body=document.getElementById('lateFeeTableBody');
  if(!body) return;
  const all=nestiqLateFeeLedgerRows();
  if(!all.length){
    body.innerHTML=`<tr><td colspan="8" style="padding:0;border:none">
      <div style="text-align:center;padding:48px 20px;border:1px dashed var(--border);border-radius:14px;background:var(--paper);margin:4px 0">
        <div style="font-size:2.2rem;margin-bottom:10px">💸</div>
        <div style="font-weight:600;margin-bottom:8px;color:var(--ink)">No late fees recorded</div>
        <p style="color:var(--muted);font-size:0.88rem;max-width:44ch;margin:0 auto;line-height:1.5">Late fees are automatically applied to overdue tenants based on your policy.</p>
      </div>
    </td></tr>`;
    return;
  }
  const statusFilter=String(document.getElementById('lateFeeStatusFilter')?.value||'all');
  const showWaived=Boolean(document.getElementById('showWaivedFees')?.checked);
  let rows=all.slice();
  if(statusFilter!=='all'){
    rows=rows.filter(r=>nestiqLateFeeRowStatus(r)===statusFilter);
  }else if(!showWaived){
    rows=rows.filter(r=>nestiqLateFeeRowStatus(r)!=='waived');
  }
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">No late fees match this filter.</td></tr>`;
    return;
  }
  body.innerHTML=rows.map(h=>{
    const tenant=(tenantsData||[]).find(x=>String(x.id)===String(h.tenantId));
    const name=String(tenant?.name||h.tenantName||'Tenant').replace(/</g,'&lt;');
    const prop=String(tenant?.property||h.propertyName||'—').replace(/</g,'&lt;');
    const st=nestiqLateFeeRowStatus(h);
    const badge=st==='paid'?'badge-green':st==='waived'?'badge-amber':'badge-red';
    const label=st==='paid'?'Paid':st==='waived'?'Waived':'Outstanding';
    const due=String(h.rentDueDate||(h.month?h.month+'-01':'—'));
    const applied=String(h.appliedOn||h.collectedDate||h.waivedDate||'—');
    const idJson=JSON.stringify(h.id);
    const actions=st==='outstanding'
      ?`<button type="button" class="btn-gold btn-sm" onclick='nestiqMarkLateFeePaid(${idJson})'>Mark Paid</button>
         <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenLateFeeWaiveModal(${idJson})'>Waive</button>`
      :'—';
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">${name}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">${prop}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">R${Number(h.lateFeeAmount||0).toLocaleString('en-ZA')}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">${due}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">${Number(h.daysOverdue||0)}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)">${applied}</td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)"><span class="badge ${badge}">${label}</span></td>
      <td style="padding:10px 12px;border-top:1px solid var(--border-soft)"><div style="display:flex;gap:6px;flex-wrap:wrap">${actions}</div></td>
    </tr>`;
  }).join('');
}

function nestiqMarkLateFeePaid(feeId){
  const row=(lateFees||[]).find(x=>String(x.id)===String(feeId));
  if(!row||nestiqLateFeeRowStatus(row)!=='outstanding') return;
  const t=(tenantsData||[]).find(x=>String(x.id)===String(row.tenantId));
  if(t){
    lfMarkCollected(t,row.month||lfMonthKey(new Date()),Number(row.lateFeeAmount||0),Number(row.daysOverdue||0));
  }
  row.collected=true;
  row.waived=false;
  row.status='paid';
  row.collectedDate=row.collectedDate||new Date().toISOString().slice(0,10);
  saveData?.();
  showNotif?.('Late fee marked as paid','success');
  nestiqRenderLateFeesPage();
}

function nestiqOpenLateFeeWaiveModal(feeId){
  const row=(lateFees||[]).find(x=>String(x.id)===String(feeId));
  if(!row||nestiqLateFeeRowStatus(row)!=='outstanding') return;
  const name=String(row.tenantName||'tenant').replace(/</g,'&lt;');
  const amt=Number(row.lateFeeAmount||0).toLocaleString('en-ZA');
  const idJson=JSON.stringify(row.id);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Waive late fee</h2>
    <p class="modal-sub">Waive the late fee of <strong>R${amt}</strong> for ${name}?</p>
    <div class="form-group">
      <label>Waiver reason</label>
      <textarea id="lf_ledger_waive_reason" class="form-input form-textarea" placeholder="e.g. Payment plan agreed, goodwill gesture"></textarea>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick='nestiqConfirmLateFeeWaive(${idJson})'>Waive Fee</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqConfirmLateFeeWaive(feeId){
  const row=(lateFees||[]).find(x=>String(x.id)===String(feeId));
  if(!row||nestiqLateFeeRowStatus(row)!=='outstanding') return;
  const reason=document.getElementById('lf_ledger_waive_reason')?.value?.trim()||'';
  row.waived=true;
  row.collected=false;
  row.status='waived';
  row.waivedDate=new Date().toISOString().slice(0,10);
  row.waivedReason=reason;
  saveData?.();
  closeModal?.();
  showNotif?.('Late fee waived','success');
  nestiqRenderLateFeesPage();
}

function nestiqApplyAllLateFees(){
  normalizeDataModel?.();
  syncTenantStatuses?.();
  if(!Array.isArray(lateFees)) lateFees=[];
  const now=new Date();
  const ym=lfMonthKey(now);
  let applied=0;
  (tenantsData||[]).forEach(t=>{
    if(!t||t.status==='vacant') return;
    const fee=calculateLateFee(t,now);
    if(fee<=0) return;
    const days=typeof getTenantDaysOverdue==='function'?getTenantDaysOverdue(t):getLateFeeBreakdown(t,now).daysOverdue;
    const row=lfUpsertOpenRecord(t,ym,fee,days);
    if(row) row.status=row.status||'outstanding';
    applied++;
  });
  saveData?.();
  showNotif?.(applied?`Applied late fees for ${applied} overdue tenant${applied===1?'':'s'}`:'No overdue late fees to apply right now.','success');
  nestiqRenderLateFeesPage();
}

function nestiqOpenLateFeeSettingsModal(){
  const p=getLateFeePolicy();
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Late fee policy</h2>
    <p class="modal-sub">Saved to your landlord settings and used for automatic fee calculations.</p>
    <div class="form-group"><label style="font-weight:600">Fee type</label>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="lf_pol_type" value="fixed" ${p.type==='fixed'?'checked':''} onchange="lateFeeToggleSettingsFields()"> Fixed amount</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="lf_pol_type" value="percentage" ${p.type==='percentage'?'checked':''} onchange="lateFeeToggleSettingsFields()"> Percentage of rent</label>
      </div>
    </div>
    <div id="lf_fixed_wrap" class="form-group" style="${p.type==='percentage'?'display:none':''}">
      <label>Fixed late fee (R)</label>
      <input class="form-input" type="number" id="lf_fixed_amt" min="0" step="1" value="${Number(p.fixedAmount)||0}">
    </div>
    <div id="lf_pct_wrap" class="form-group" style="${p.type==='percentage'?'':'display:none'}">
      <label>Percentage of rent (%)</label>
      <input class="form-input" type="number" id="lf_pct" min="0" step="0.1" value="${Number(p.percentage)||0}">
    </div>
    <div class="form-group">
      <label>Grace days after rent due date</label>
      <input class="form-input" type="number" id="lf_grace" min="0" step="1" value="${Number(p.graceDays)||0}">
    </div>
    <label class="settings-toggle-row"><span>Maximum late fee cap</span><input type="checkbox" id="lf_max_en" ${p.maxEnabled?'checked':''} onchange="lateFeeToggleSettingsFields()"></label>
    <div class="form-group">
      <label>Maximum amount (R)</label>
      <input class="form-input" type="number" id="lf_max_amt" min="0" step="1" value="${Number(p.maxAmount)||0}">
    </div>
    <label class="settings-toggle-row"><span>Compound late fees</span><input type="checkbox" id="lf_compound" ${p.compoundEnabled?'checked':''} onchange="lateFeeToggleSettingsFields()"></label>
    <div class="form-group">
      <label>Compound every (days)</label>
      <input class="form-input" type="number" id="lf_compound_days" min="1" step="1" value="${Number(p.compoundDays)||7}">
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-gold btn-sm" onclick="nestiqSaveLateFeePolicyFromModal()">Save policy</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  lateFeeToggleSettingsFields();
}

function nestiqSaveLateFeePolicyFromModal(){
  if(!landlordSettings||typeof landlordSettings!=='object') landlordSettings={};
  saveLateFeePolicyFromForm();
  closeModal?.();
  nestiqRenderLateFeesPage();
}

function nestiqExportLateFeesCSV(){
  const rows=[['Tenant','Property','Fee Amount','Month','Rent Due Date','Days Late','Applied On','Status','Waived Reason']];
  nestiqLateFeeLedgerRows().forEach(h=>{
    const tenant=(tenantsData||[]).find(x=>String(x.id)===String(h.tenantId));
    rows.push([
      tenant?.name||h.tenantName||'',
      tenant?.property||h.propertyName||'',
      String(h.lateFeeAmount||0),
      String(h.month||''),
      String(h.rentDueDate||''),
      String(h.daysOverdue||0),
      String(h.appliedOn||h.collectedDate||h.waivedDate||''),
      nestiqLateFeeRowStatus(h),
      String(h.waivedReason||'')
    ]);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  if(typeof downloadCSV==='function') downloadCSV(csv,'nestiq-late-fees.csv');
  else{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='nestiq-late-fees.csv';
    a.click();
  }
  showNotif?.('Late fees CSV exported','success');
}

function nestiqRenderLateFeesPage(){
  normalizeDataModel?.();
  syncTenantStatuses?.();
  nestiqRenderLateFeePolicySummary();
  nestiqRenderLateFeeStats();
  nestiqFilterLateFeeLedger();
}
window.nestiqRenderLateFeesPage=nestiqRenderLateFeesPage;
window.nestiqFilterLateFeeLedger=nestiqFilterLateFeeLedger;
window.nestiqApplyAllLateFees=nestiqApplyAllLateFees;
window.nestiqOpenLateFeeSettingsModal=nestiqOpenLateFeeSettingsModal;
window.nestiqSaveLateFeePolicyFromModal=nestiqSaveLateFeePolicyFromModal;
window.nestiqExportLateFeesCSV=nestiqExportLateFeesCSV;
window.nestiqMarkLateFeePaid=nestiqMarkLateFeePaid;
window.nestiqOpenLateFeeWaiveModal=nestiqOpenLateFeeWaiveModal;
window.nestiqConfirmLateFeeWaive=nestiqConfirmLateFeeWaive;

window.calculateLateFee=calculateLateFee;
window.getLateFeeBreakdown=getLateFeeBreakdown;
window.lateFeeRentRollCell=lateFeeRentRollCell;
window.lateFeeRentRollAmount=lateFeeRentRollAmount;
window.lateFeeRentRollExtraActions=lateFeeRentRollExtraActions;
window.lateFeeSendNotice=lateFeeSendNotice;
window.openLateFeeWaiveModal=openLateFeeWaiveModal;
window.confirmLateFeeWaive=confirmLateFeeWaive;
window.saveLateFeePolicyFromForm=saveLateFeePolicyFromForm;
window.lateFeeToggleSettingsFields=lateFeeToggleSettingsFields;
window.getLateFeesCollectedForYear=getLateFeesCollectedForYear;
