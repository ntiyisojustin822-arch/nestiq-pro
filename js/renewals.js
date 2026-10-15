/* ═══════════════════════════════
   LEASE RENEWAL WORKFLOW (landlord + tenant UI hooks)
═══════════════════════════════ */

window.leaseStatus={
  expired:[],
  critical:[],
  warning:[],
  notice:[],
  ok:[]
};

const RENEWAL_CPI_OPTIONS=[3,4,5,6,7,8];
const MO_LANDLORD_KEYS=[
  {k:'noticeWriting',label:'Notice received in writing'},
  {k:'inspectionScheduled',label:'Move out inspection scheduled'},
  {k:'forwardingAddress',label:'Forwarding address received'},
  {k:'keysReturned',label:'Keys and remotes returned'},
  {k:'utilitiesClosed',label:'Utility accounts closed'},
  {k:'meterReadings',label:'Final meter readings taken'},
  {k:'depositCalc',label:'Deposit calculation completed'},
  {k:'depositRefunded',label:'Deposit refunded or claim made'}
];

function renewalTenantInOccupancy(t){
  if(!t) return false;
  if(typeof window.nestiqTenantHasActiveOccupancy==='function') return window.nestiqTenantHasActiveOccupancy(t);
  return t.status!=='vacant';
}

function renewalFindTenant(tenantId){
  return (window.tenantsData||[]).find(x=>String(x.id)===String(tenantId))||null;
}
function renewalIdJs(id){
  return JSON.stringify(String(id??''));
}

function renewalParseLeaseEnd(t){
  if(!renewalTenantInOccupancy(t)) return null;
  const raw=t.leaseEnd||t.lease||'';
  if(/available|^[\s-]*$/i.test(String(raw))) return null;
  const d=new Date(raw);
  if(String(d)==='Invalid Date') return null;
  return d;
}

function renewalLeaseDaysToEnd(t){
  const end=renewalParseLeaseEnd(t);
  if(!end) return null;
  const today=new Date();
  const t0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const e0=new Date(end.getFullYear(),end.getMonth(),end.getDate());
  return Math.ceil((e0-t0)/86400000);
}

function renewalLeaseCategory(t){
  if(!renewalTenantInOccupancy(t)) return null;
  const days=renewalLeaseDaysToEnd(t);
  if(days===null) return null;
  if(days<0) return 'expired';
  if(days<=30) return 'critical';
  if(days<=60) return 'warning';
  if(days<=90) return 'notice';
  return 'ok';
}

function computeLeaseStatus(){
  window.leaseStatus={expired:[],critical:[],warning:[],notice:[],ok:[]};
  (tenantsData||[]).forEach(t=>{
    if(!t) return;
    const cat=renewalLeaseCategory(t);
    if(!cat) return;
    window.leaseStatus[cat].push(t);
  });
  return window.leaseStatus;
}

function renewalBellAllow(key,minMs){
  try{
    const raw=localStorage.getItem('nestiqRenewalBellTs')||'{}';
    const o=JSON.parse(raw);
    if(typeof o!=='object'||!o) return true;
    if(Date.now()-Number(o[key]||0)<minMs) return false;
    o[key]=Date.now();
    localStorage.setItem('nestiqRenewalBellTs',JSON.stringify(o));
    return true;
  }catch(_e){
    return true;
  }
}

function runRenewalInAppBellChecks(){
  if(typeof getSession!=='function') return;
  const s=getSession();
  if(!s||s.role!=='landlord') return;
  computeLeaseStatus();
  const MS_DAY=86400000;
  (tenantsData||[]).forEach(t=>{
    if(!renewalTenantInOccupancy(t)) return;
    const days=renewalLeaseDaysToEnd(t);
    if(days===null) return;
    const st=t.renewalStatus;
    if(st==='renewed'||st==='not-renewing') return;
    if(days<0&&st==null){
      if(renewalBellAllow(`exp-${t.id}`,MS_DAY)){
        addBellNotif('🚨',`EXPIRED LEASE: ${t.name} — ${t.property} lease expired ${Math.abs(days)} days ago.`);
      }
      return;
    }
    if(days>=0&&days<=90&&st==null){
      if(renewalBellAllow(`90-${t.id}`,MS_DAY)){
        addBellNotif('📋',`Lease expiring: ${t.name} — ${t.property} in ${days} days. Start renewal process.`);
      }
    }
    if(st==='offer-sent'&&t.pendingNewLease&&t.pendingNewLease.sentDate){
      const sent=new Date(t.pendingNewLease.sentDate);
      if(String(sent)!=='Invalid Date'){
        const ago=Math.floor((Date.now()-sent)/MS_DAY);
        if(ago>=7&&renewalBellAllow(`offer-${t.id}`,MS_DAY)){
          addBellNotif('⏰',`No response to renewal offer: ${t.name} — sent ${ago} days ago. Follow up required.`);
        }
      }
    }
  });
}

function renewalHasHomeWidgetTenants(){
  const ls=window.leaseStatus||computeLeaseStatus();
  return ls.expired.length+ls.critical.length+ls.warning.length+ls.notice.length>0;
}

function renewalTenantRowHtml(t,kind){
  const days=renewalLeaseDaysToEnd(t);
  const sub=days<0
    ? `Expired ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ago`
    : `Expires in ${days} day${days===1?'':'s'}`;
  const btn=kind==='notice'
    ? `<button type="button" class="btn-outline btn-sm" onclick="showPage('renewals')">View</button>`
    : kind==='warning'
      ? `<button type="button" class="btn-outline btn-sm" onclick='openStartRenewalModal(${renewalIdJs(t.id)})'>Start Renewal</button>`
      : `<button type="button" class="btn-primary btn-sm" onclick='openStartRenewalModal(${renewalIdJs(t.id)})'>Renew Now</button>`;
  return `<div class="renewal-home-row">
    <div><strong>${String(t.name||'').replace(/</g,'')}</strong><div class="renewal-home-muted">${String(t.property||'')} · ${String(t.unit||'')}</div></div>
    <div class="renewal-home-meta">${sub}</div>
    <div>${btn}</div>
  </div>`;
}

function renderHomeLeaseWidget(){
  const section=document.getElementById('homeLeaseRenewalsSection');
  const mount=document.getElementById('homeLeaseRenewalsWidget');
  if(!section||!mount) return;
  const s=typeof getSession==='function'?getSession():null;
  if(!s||s.role!=='landlord'){
    section.style.display='none';
    return;
  }
  computeLeaseStatus();
  const ls=window.leaseStatus;
  if(!renewalHasHomeWidgetTenants()){
    section.style.display='none';
    mount.innerHTML='';
    return;
  }
  section.style.display='block';
  let html='<div class="renewal-home-card"><h3 class="renewal-home-title">Lease Renewals Required</h3>';
  if(ls.expired.length){
    html+=`<div class="renewal-home-block renewal-home-block--expired"><div class="renewal-home-block-h">${ls.expired.length} lease(s) have expired</div>${ls.expired.map(t=>renewalTenantRowHtml(t,'expired')).join('')}</div>`;
  }
  if(ls.critical.length){
    html+=`<div class="renewal-home-block renewal-home-block--critical"><div class="renewal-home-block-h">${ls.critical.length} lease(s) expiring within 30 days</div>${ls.critical.map(t=>renewalTenantRowHtml(t,'critical')).join('')}</div>`;
  }
  if(ls.warning.length){
    html+=`<div class="renewal-home-block renewal-home-block--warning"><div class="renewal-home-block-h">${ls.warning.length} lease(s) expiring in 31–60 days</div>${ls.warning.map(t=>renewalTenantRowHtml(t,'warning')).join('')}</div>`;
  }
  if(ls.notice.length){
    html+=`<div class="renewal-home-block renewal-home-block--notice"><div class="renewal-home-block-h">${ls.notice.length} lease(s) expiring in 61–90 days</div>${ls.notice.map(t=>renewalTenantRowHtml(t,'notice')).join('')}</div>`;
  }
  html+=`<div style="margin-top:14px"><a href="#renewals" class="renewal-home-link" onclick="showPage('renewals');return false;">View All Renewals →</a></div></div>`;
  mount.innerHTML=html;
}

function renewalAddMonths(iso,n){
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return new Date().toISOString().slice(0,10);
  d.setMonth(d.getMonth()+n);
  return d.toISOString().slice(0,10);
}

function renewalDayAfter(iso){
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return new Date().toISOString().slice(0,10);
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}

function renewalLeaseDurationMonths(t){
  const a=new Date(t.leaseStart||'2025-01-01');
  const b=new Date(t.leaseEnd||t.lease||new Date());
  if(String(a)==='Invalid Date'||String(b)==='Invalid Date') return 12;
  return Math.max(1,Math.round((b-a)/(30*86400000)));
}

function renewalCalcNewRent(current,type,opts){
  const base=Number(current||0);
  if(type==='none') return base;
  if(type==='cpi') return Math.round(base*(1+Number(opts.cpi||5)/100));
  if(type==='pct') return Math.round(base*(1+Number(opts.pct||0)/100));
  if(type==='amt') return Math.round(base+Number(opts.amt||0));
  return base;
}

function openStartRenewalModal(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t){
    nestiqShowNotif?.('Could not open renewal — tenant not found. Refresh and try again.','warning');
    return;
  }
  const host=document.getElementById('modalContent');
  if(!host){
    nestiqShowNotif?.('Could not open the renewal form. Refresh the page.','error');
    return;
  }
  const endIso=t.leaseEnd||t.lease;
  const endDate=renewalParseLeaseEnd(t);
  const startDefault=endDate?renewalDayAfter(endIso):new Date().toISOString().slice(0,10);
  const endDefault=renewalAddMonths(startDefault,12);
  const draft=t.renewalDraft||{};
  const curRent=Number(t.rent||0);
  const idJs=renewalIdJs(t.id);
  host.innerHTML=`
    <h2 class="modal-title">Start Lease Renewal — ${String(t.name||'').replace(/</g,'')}</h2>
    <p class="modal-sub">${t.property} · ${t.unit}</p>
    <div style="font-size:0.84rem;margin-bottom:12px;padding:10px;background:var(--cream);border-radius:10px;border:1px solid var(--border)">
      <div><strong>Current end:</strong> ${isoToPretty(endIso)}</div>
      <div><strong>Current rent:</strong> R${curRent.toLocaleString('en-ZA')}</div>
      <div><strong>Duration:</strong> ~${renewalLeaseDurationMonths(t)} months</div>
    </div>
    <div class="form-group"><label>New lease start</label><input type="date" id="ren_start" class="form-input" value="${draft.newStart||startDefault}"></div>
    <div class="form-group"><label>New lease end</label>
      <input type="date" id="ren_end" class="form-input" value="${draft.newEnd||endDefault}">
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <button type="button" class="btn-outline btn-sm" onclick="renewalQuickEndMonths(6)">6 months</button>
        <button type="button" class="btn-outline btn-sm" onclick="renewalQuickEndMonths(12)">12 months</button>
        <button type="button" class="btn-outline btn-sm" onclick="renewalQuickEndMonths(24)">24 months</button>
      </div>
    </div>
    <div class="form-group"><label>Increase type</label>
      <div id="ren_inc_type" style="display:flex;flex-direction:column;gap:6px;font-size:0.86rem">
        <label><input type="radio" name="ren_inc" value="none" ${draft.incType==='none'||!draft.incType?'checked':''}> No increase</label>
        <label><input type="radio" name="ren_inc" value="cpi" ${draft.incType==='cpi'?'checked':''}> CPI linked</label>
        <label><input type="radio" name="ren_inc" value="pct" ${draft.incType==='pct'?'checked':''}> Fixed %</label>
        <label><input type="radio" name="ren_inc" value="amt" ${draft.incType==='amt'?'checked':''}> Fixed amount (R)</label>
      </div>
    </div>
    <div class="form-group" id="ren_cpi_wrap" style="display:none"><label>CPI %</label>
      <select id="ren_cpi" class="form-input">${RENEWAL_CPI_OPTIONS.map(p=>`<option value="${p}" ${Number(draft.cpi)===p?'selected':''}>${p}%</option>`).join('')}</select>
    </div>
    <div class="form-group" id="ren_pct_wrap" style="display:none"><label>Percentage</label><input type="number" id="ren_pct" class="form-input" step="0.1" value="${draft.pct??''}" placeholder="e.g. 8"></div>
    <div class="form-group" id="ren_amt_wrap" style="display:none"><label>Amount (R)</label><input type="number" id="ren_amt" class="form-input" value="${draft.amt??''}"></div>
    <div style="padding:12px;border-radius:10px;border:1px solid var(--gold);background:rgba(201,168,76,0.1);margin-bottom:10px">
      <div style="font-size:0.75rem;color:var(--muted)">New monthly rent</div>
      <div id="ren_new_rent_display" style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--gold)">R${curRent.toLocaleString('en-ZA')}</div>
      <div id="ren_diff_display" style="font-size:0.82rem;color:var(--muted)"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="ren_notes" class="form-input form-textarea" placeholder="Special conditions">${String(draft.notes||'').replace(/</g,'')}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick='submitStartRenewalDiscuss(${idJs})'>Move to Discussing</button>
      <button type="button" class="btn-outline btn-sm" onclick='submitStartRenewalWhatsApp(${idJs})'>Send Renewal Offer via WhatsApp</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
  window.__renModalTenantId=tenantId;
  window.__renModalBaseRent=curRent;
  ['ren_inc_type','ren_cpi','ren_pct','ren_amt','ren_start','ren_end'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change',renewalModalRecalc);
    document.getElementById(id)?.addEventListener('input',renewalModalRecalc);
  });
  document.querySelectorAll('#ren_inc_type input').forEach(r=>r.addEventListener('change',()=>{ renewalToggleIncFields(); renewalModalRecalc(); }));
  renewalToggleIncFields();
  renewalModalRecalc();
}

function renewalToggleIncFields(){
  const v=document.querySelector('#ren_inc_type input[name=ren_inc]:checked')?.value||'none';
  const w=(id,on)=>{const el=document.getElementById(id);if(el)el.style.display=on?'block':'none';};
  w('ren_cpi_wrap',v==='cpi');
  w('ren_pct_wrap',v==='pct');
  w('ren_amt_wrap',v==='amt');
}

function renewalQuickEndMonths(m){
  const s=document.getElementById('ren_start')?.value;
  if(!s) return;
  document.getElementById('ren_end').value=renewalAddMonths(s,m);
  renewalModalRecalc();
}

function renewalReadIncOpts(){
  const v=document.querySelector('#ren_inc_type input[name=ren_inc]:checked')?.value||'none';
  return{
    type:v,
    cpi:Number(document.getElementById('ren_cpi')?.value||5),
    pct:Number(document.getElementById('ren_pct')?.value||0),
    amt:Number(document.getElementById('ren_amt')?.value||0)
  };
}

function renewalModalRecalc(){
  const base=window.__renModalBaseRent||0;
  const o=renewalReadIncOpts();
  const nr=renewalCalcNewRent(base,o.type,o);
  const el=document.getElementById('ren_new_rent_display');
  const d2=document.getElementById('ren_diff_display');
  if(el) el.textContent='R'+nr.toLocaleString('en-ZA');
  if(d2){
    const diff=nr-base;
    const pct=base?((diff/base)*100).toFixed(1):'0';
    d2.textContent=diff===0?'No change':`Increase: R${diff.toLocaleString('en-ZA')} (+${pct}%)`;
  }
}

function renewalCollectDraftFromModal(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t) return null;
  const o=renewalReadIncOpts();
  const base=Number(t.rent||0);
  const newRent=renewalCalcNewRent(base,o.type,o);
  return{
    newStart:document.getElementById('ren_start')?.value||'',
    newEnd:document.getElementById('ren_end')?.value||'',
    incType:o.type,
    cpi:o.cpi,
    pct:o.pct,
    amt:o.amt,
    newRent,
    oldRent:base,
    notes:String(document.getElementById('ren_notes')?.value||'')
  };
}

function submitStartRenewalDiscuss(tenantId){
  const d=renewalCollectDraftFromModal(tenantId);
  if(!d||!d.newStart||!d.newEnd){ nestiqShowNotif('Enter lease dates','warning'); return; }
  const t=renewalFindTenant(tenantId);
  t.renewalDraft=d;
  t.renewalStatus='discussing';
  saveData();
  nestiqCloseModalAnimated();
  nestiqShowNotif('Renewal moved to In Discussion','success');
  computeLeaseStatus();
  renderRenewalsPage();
  renderHomeLeaseWidget();
}

function submitStartRenewalWhatsApp(tenantId){
  const d=renewalCollectDraftFromModal(tenantId);
  if(!d||!d.newStart||!d.newEnd){ nestiqShowNotif('Enter lease dates','warning'); return; }
  const t=renewalFindTenant(tenantId);
  t.renewalDraft=d;
  t.renewalStatus='discussing';
  saveData();
  const endPretty=isoToPretty(t.leaseEnd||t.lease);
  const msg=`Dear ${t.name}, your lease for ${t.property} - ${t.unit} expires on ${endPretty}. We would like to offer you a lease renewal on the following terms:\nNew lease period: ${isoToPretty(d.newStart)} to ${isoToPretty(d.newEnd)}\nNew monthly rent: R${d.newRent.toLocaleString('en-ZA')}\nPlease confirm if you accept these terms or contact us to discuss. — NestIQ Pro`;
  nestiqCloseModalAnimated();
  openWhatsAppChat?.(t.phone,msg);
  nestiqShowNotif('WhatsApp opened — renewal marked as discussing','success');
  computeLeaseStatus();
  renderRenewalsPage();
  renderHomeLeaseWidget();
}

function openSendOfferModal(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.renewalDraft){ nestiqShowNotif('Start renewal first','warning'); return; }
  const d=t.renewalDraft;
  const idJs=renewalIdJs(t.id);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Send Renewal Offer — ${String(t.name||'').replace(/</g,'')}</h2>
    <div style="font-size:0.85rem;line-height:1.5;margin-bottom:12px">
      <div><strong>Period:</strong> ${isoToPretty(d.newStart)} → ${isoToPretty(d.newEnd)}</div>
      <div><strong>New rent:</strong> R${Number(d.newRent||0).toLocaleString('en-ZA')} (was R${Number(d.oldRent||0).toLocaleString('en-ZA')})</div>
      <div><strong>Notes:</strong> ${String(d.notes||'—').replace(/</g,'')}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="btn-primary btn-sm" onclick='renewalGenerateOfferLetter(${idJs})'>Generate Renewal Offer Letter</button>
      <button type="button" class="btn-outline btn-sm" onclick='renewalDownloadOfferPdf(${idJs})'>Download PDF</button>
      <button type="button" class="btn-outline btn-sm" onclick='renewalEmailOffer(${idJs})' ${typeof isEmailConfigured==='function'&&!isEmailConfigured()?'disabled title="Configure EmailJS"':''}>Send via email</button>
      <button type="button" class="btn-gold btn-sm" onclick='renewalMarkOfferSent(${idJs})'>Move to Offer Sent</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function renewalOfferLetterHtml(t,d){
  const ls=landlordSettings||{};
  const deadline=renewalAddMonths(new Date().toISOString().slice(0,10),1);
  const incPct=d.oldRent?(((d.newRent-d.oldRent)/d.oldRent)*100).toFixed(1):'0';
  const incLabel=d.incType==='cpi'?'CPI-linked adjustment':d.incType==='pct'?'agreed percentage':d.incType==='amt'?'fixed amount':'no increase';
  return`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Renewal Offer</title>
  <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:24px;color:#111;line-height:1.5}
  h1{font-size:1.2rem} .sig{margin-top:40px}</style></head><body>
  <h1>LEASE RENEWAL OFFER LETTER</h1>
  <p><strong>${ls.companyName||'Landlord'}</strong><br>${String(ls.physicalAddress||'').replace(/\n/g,'<br>')}</p>
  <p>${new Date().toLocaleDateString('en-ZA')}</p>
  <p>Dear ${String(t.name||'').replace(/</g,'')},</p>
  <p><strong>RE: Lease Renewal — ${String(t.property||'')} Unit ${String(t.unit||'')}</strong></p>
  <p>Your current lease agreement for the above property expires on <strong>${isoToPretty(t.leaseEnd||t.lease)}</strong>.</p>
  <p>We are pleased to offer you a lease renewal on the following terms:</p>
  <p><strong>New Lease Period:</strong><br>From: ${isoToPretty(d.newStart)}<br>To: ${isoToPretty(d.newEnd)}</p>
  <p><strong>Monthly Rental:</strong> R${Number(d.newRent||0).toLocaleString('en-ZA')}<br>
  (Previous rental: R${Number(d.oldRent||0).toLocaleString('en-ZA')} — Increase: ${incPct}% in line with ${incLabel}.)</p>
  <p><strong>Monthly Due Date:</strong> ${Number(t.monthlyDueDate||1)} of each month</p>
  <p>Please indicate your acceptance by signing below and returning this letter by <strong>${isoToPretty(deadline)}</strong>.</p>
  <p>Yours sincerely,<br>${ls.name||'Landlord'}<br>${ls.companyName||''}<br>${ls.phone||''}<br>${ls.email||''}</p>
  <div class="sig"><strong>ACCEPTANCE:</strong><p>I/We accept the above renewal terms.</p>
  <p>Tenant Signature: _______________________<br>Name: ${String(t.name||'')}<br>Date: _______________________</p></div>
  <p style="margin-top:32px"><button onclick="window.print()">Print</button></p>
  </body></html>`;
}

function renewalGenerateOfferLetter(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.renewalDraft) return;
  const w=window.open('','_blank');
  if(!w){ nestiqShowNotif('Allow pop-ups for the offer letter','warning'); return; }
  w.document.write(renewalOfferLetterHtml(t,t.renewalDraft));
  w.document.close();
}

function renewalDownloadOfferPdf(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.renewalDraft) return;
  const {jsPDF}=window.jspdf||{};
  if(!jsPDF){ nestiqShowNotif('PDF library not loaded','error'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const html=renewalOfferLetterHtml(t,t.renewalDraft).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  doc.setFontSize(10);
  const lines=doc.splitTextToSize(html,180);
  doc.text(lines,15,20);
  doc.save(`renewal-offer-${String(t.name||'tenant').replace(/\s+/g,'-')}.pdf`);
}

function renewalEmailOffer(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.email){ nestiqShowNotif('Tenant has no email','warning'); return; }
  if(typeof sendCustomEmail!=='function') return;
  const d=t.renewalDraft;
  const body=`Dear ${t.name},\n\nPlease find below our formal lease renewal offer.\n\nNew period: ${isoToPretty(d.newStart)} to ${isoToPretty(d.newEnd)}\nNew monthly rent: R${d.newRent.toLocaleString('en-ZA')}\n\nKind regards,\n${landlordSettings?.name||'Landlord'}`;
  sendCustomEmail(t,'Lease renewal offer',body).then(()=>nestiqShowNotif('Email sent','success')).catch(()=>{});
}

function renewalMarkOfferSent(tenantId){
  const t=renewalFindTenant(tenantId);
  const d=t?.renewalDraft;
  if(!t||!d){ nestiqShowNotif('Missing draft terms','error'); return; }
  const incPct=d.oldRent?(((d.newRent-d.oldRent)/d.oldRent)*100):0;
  t.renewalStatus='offer-sent';
  t.pendingNewLease={
    startDate:d.newStart,
    endDate:d.newEnd,
    newRent:d.newRent,
    increasePercent:incPct,
    increaseAmount:d.newRent-d.oldRent,
    sentDate:new Date().toISOString().slice(0,10),
    notes:d.notes||''
  };
  saveData();
  nestiqCloseModalAnimated();
  nestiqShowNotif('Offer marked as sent','success');
  renderRenewalsPage();
  renderHomeLeaseWidget();
}

function openConfirmRenewalModal(tenantId){
  const t=renewalFindTenant(tenantId);
  const p=t?.pendingNewLease;
  if(!t||!p){ nestiqShowNotif('No pending offer','warning'); return; }
  const idJs=renewalIdJs(t.id);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Confirm Lease Renewal — ${String(t.name||'').replace(/</g,'')}</h2>
    <div style="font-size:0.86rem;line-height:1.55;margin-bottom:14px">
      <div><strong>New period:</strong> ${isoToPretty(p.startDate)} → ${isoToPretty(p.endDate)}</div>
      <div><strong>New rent:</strong> R${Number(p.newRent||0).toLocaleString('en-ZA')}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="btn-primary btn-sm" onclick='renewalApplyAccepted(${idJs})'>Tenant Accepted — Apply Renewal</button>
      <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick='renewalApplyDeclined(${idJs})'>Tenant Declined — Mark as Not Renewing</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function renewalApplyAccepted(tenantId){
  const t=renewalFindTenant(tenantId);
  const p=t?.pendingNewLease;
  if(!t||!p) return;
  const oldRent=Number(t.rent||0);
  const hist=t.renewalHistory||[];
  hist.push({
    year:new Date().getFullYear(),
    oldRent,
    newRent:Number(p.newRent||0),
    renewalDate:new Date().toISOString().slice(0,10),
    increasePercent:p.increasePercent,
    increaseAmount:p.increaseAmount
  });
  t.renewalHistory=hist;
  t.leaseStart=p.startDate;
  t.leaseEnd=p.endDate;
  t.lease=isoToPretty(p.endDate);
  t.rent=Number(p.newRent||0);
  t.renewalStatus='renewed';
  t.lastRenewalConfirmedAt=new Date().toISOString().slice(0,10);
  t.pendingNewLease=null;
  t.renewalDraft=null;
  t.movingOut=null;
  saveData();
  syncTenantStatuses?.();
  nestiqCloseModalAnimated();
  addBellNotif('✅',`Lease renewed: ${t.name} — ${t.property}`);
  nestiqConfetti?.({ count: 50, spread: 50 });
  nestiqShowNotif('Renewal applied. Lease and rent updated.','success');
  computeLeaseStatus();
  renderRenewalsPage();
  renderHomeLeaseWidget();
  if(typeof renderRentRoll==='function') renderRentRoll();
}

function renewalApplyDeclined(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t) return;
  const end=renewalParseLeaseEnd(t);
  t.renewalStatus='not-renewing';
  t.pendingNewLease=null;
  t.renewalDraft=null;
  t.movingOut={
    confirmDate:new Date().toISOString().slice(0,10),
    expectedMoveOut:end?end.toISOString().slice(0,10):(t.leaseEnd||''),
    depositRefund:typeof nestiqTenantDepositTotalValue==='function'?nestiqTenantDepositTotalValue(t):Number(t.deposit&&typeof t.deposit==='object'?(Number(t.deposit.amount||0)+Number(t.deposit.interestEarned||0)):t.deposit||0),
    checklistComplete:false,
    landlordChecklist:{}
  };
  saveData();
  nestiqCloseModalAnimated();
  addBellNotif('📤',`${t.name} marked as not renewing — vacating workflow`);
  nestiqShowNotif('Tenant marked as not renewing','warning');
  renderRenewalsPage();
  renderHomeLeaseWidget();
}

function renewalSendConfirmationWhatsApp(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t) return;
  const msg=`Dear ${t.name}, we confirm your lease renewal for ${t.property} - ${t.unit}.\nNew lease period: ${isoToPretty(t.leaseStart)} to ${isoToPretty(t.leaseEnd||t.lease)}\nNew monthly rent: R${Number(t.rent||0).toLocaleString('en-ZA')} effective ${isoToPretty(t.leaseStart)}\nThank you for renewing with us. — NestIQ Pro`;
  openWhatsAppChat?.(t.phone,msg);
}

function renewalToggleLandlordCheck(tenantId,key,checked){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.movingOut) return;
  t.movingOut.landlordChecklist=t.movingOut.landlordChecklist||{};
  t.movingOut.landlordChecklist[key]=checked;
  const total=MO_LANDLORD_KEYS.length;
  const done=MO_LANDLORD_KEYS.filter(x=>t.movingOut.landlordChecklist[x.k]).length;
  t.movingOut.checklistComplete=done>=total;
  saveData();
  renderRenewalsPage();
}

async function renewalMarkVacated(tenantId){
  const t=renewalFindTenant(tenantId);
  if(!t||!t.movingOut||!t.movingOut.checklistComplete){ nestiqShowNotif('Complete checklist first','warning'); return; }
  const prop=propertiesData.find(p=>p.name===t.property);
  if(prop) prop.status='vacant';
  t.status='vacant';
  try{ await window.nestiqUnlinkTenantFromUnit?.(t); }catch(_e){}
  try{ await window.nestiqTerminateLeasesForTenant?.(t.id); }catch(_e){}
  try{ await window.nestiqMarkApplicationsTenancyEndedForTenant?.(t); }catch(_e){}
  vacancyRecords.push({
    id:Date.now(),
    propertyId:prop?.id??null,
    propertyName:t.property,
    tenantId:t.id,
    tenantName:t.name,
    vacancyStart:new Date().toISOString().slice(0,10),
    vacatedAt:new Date().toISOString().slice(0,10)
  });
  try{ window.vacancyRecords=vacancyRecords; }catch(_e){}
  saveData();
  syncTenantStatuses?.();
  nestiqShowNotif('Property marked vacant','success');
  computeLeaseStatus();
  renderRenewalsPage();
  renderHomeLeaseWidget();
  if(typeof renderRentRoll==='function') renderRentRoll();
}

function renewalStatusBadge(st){
  const map={
    discussing:{cls:'badge-amber',t:'Discussing'},
    'offer-sent':{cls:'badge-amber',t:'Offer sent'},
    renewed:{cls:'badge-green',t:'Renewed'},
    'not-renewing':{cls:'badge-red',t:'Not renewing'}
  };
  const x=map[st]||{cls:'badge-gray',t:'—'};
  return `<span class="badge ${x.cls}">${x.t}</span>`;
}

function renewalCardHtml(t,col){
  const days=renewalLeaseDaysToEnd(t);
  const dayTxt=days===null?'—':days<0?`${Math.abs(days)}d overdue`:`${days}d left`;
  const draft=t.renewalDraft;
  const pend=t.pendingNewLease;
  let extra='';
  if(col==='renewed'&&t.lastRenewalConfirmedAt){
    extra=`<div class="renewal-card-meta">Confirmed ${isoToPretty(t.lastRenewalConfirmedAt)}</div>`;
  }
  if(col==='offer'&&pend){
    extra=`<div class="renewal-card-meta">Offer: R${Number(pend.newRent||0).toLocaleString('en-ZA')}</div>`;
  }
  let actions='';
  if(col==='attention'){
    actions=`<button type="button" class="btn-primary btn-sm" onclick='openStartRenewalModal(${renewalIdJs(t.id)})'>Start Renewal</button>`;
  }else if(col==='discuss'){
    actions=`<button type="button" class="btn-outline btn-sm" onclick='openSendOfferModal(${renewalIdJs(t.id)})'>Send Offer</button>`;
  }else if(col==='offer'){
    actions=`<button type="button" class="btn-primary btn-sm" onclick='openConfirmRenewalModal(${renewalIdJs(t.id)})'>Confirm Renewal</button>`;
  }else if(col==='renewed'){
    actions=`<button type="button" class="btn-outline btn-sm" onclick='renewalSendConfirmationWhatsApp(${renewalIdJs(t.id)})'>WhatsApp</button>
      <button type="button" class="btn-outline btn-sm" onclick='generateLeaseSummaryPDF(${renewalIdJs(t.id)})'>Lease PDF</button>`;
  }
  return `<div class="renewal-kanban-card">
    <div class="renewal-card-head">${typeof nestiqTenantAvatarHtml==='function'?nestiqTenantAvatarHtml(t,{className:'renewal-card-av'}):`<span class="renewal-card-av">${t.avatar||'👤'}</span>`}<div><strong>${String(t.name||'').replace(/</g,'')}</strong><div class="renewal-card-muted">${String(t.property||'')} · ${String(t.unit||'')}</div></div></div>
    <div class="renewal-card-meta">Lease end: ${isoToPretty(t.leaseEnd||t.lease)} · ${dayTxt}</div>
    <div class="renewal-card-meta">Rent: R${Number(t.rent||0).toLocaleString('en-ZA')}</div>
    ${draft&&col!=='renewed'?`<div class="renewal-card-meta">Draft → R${Number(draft.newRent||0).toLocaleString('en-ZA')}</div>`:''}
    ${extra}
    <div style="margin:8px 0">${renewalStatusBadge(t.renewalStatus)}</div>
    <div class="renewal-card-actions">${actions}</div>
  </div>`;
}

function renewalKanbanColumn(title,cls,cards){
  return `<div class="renewal-col ${cls}"><div class="renewal-col-h">${title}</div><div class="renewal-col-body">${cards.length?cards.join(''):'<div class="renewal-col-empty">No items</div>'}</div></div>`;
}

function renderRenewalsPage(){
  const root=document.getElementById('page-renewals');
  if(!root) return;
  computeLeaseStatus();
  const ls=window.leaseStatus;
  const stat=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=String(v);};
  stat('renewStatExpired',ls.expired.length);
  stat('renewStatCritical',ls.critical.length);
  stat('renewStatWarning',ls.warning.length);
  stat('renewStatNotice',ls.notice.length);

  const attention=[];
  const discuss=[];
  const offer=[];
  const renewed=[];
  (tenantsData||[]).forEach(t=>{
    if(!renewalTenantInOccupancy(t)) return;
    if(t.renewalStatus==='not-renewing') return;
    if(t.renewalStatus==='renewed'){ renewed.push(renewalCardHtml(t,'renewed')); return; }
    if(t.renewalStatus==='offer-sent'){ offer.push(renewalCardHtml(t,'offer')); return; }
    if(t.renewalStatus==='discussing'){ discuss.push(renewalCardHtml(t,'discuss')); return; }
    const cat=renewalLeaseCategory(t);
    if(cat==='expired'||cat==='critical') attention.push(renewalCardHtml(t,'attention'));
  });

  const upcoming=[];
  (tenantsData||[]).forEach(t=>{
    if(!renewalTenantInOccupancy(t)) return;
    if(t.renewalStatus) return;
    const cat=renewalLeaseCategory(t);
    if(cat==='warning'||cat==='notice'){
      const days=renewalLeaseDaysToEnd(t);
      upcoming.push(`<div class="renewal-up-item"><div><strong>${String(t.name||'').replace(/</g,'')}</strong> · ${String(t.property||'')}<div class="renewal-card-muted">${days} days remaining</div></div><button type="button" class="btn-outline btn-sm" onclick='openStartRenewalModal(${renewalIdJs(t.id)})'>Start Renewal</button></div>`);
    }
  });

  const vacWrap=document.getElementById('renewalsVacating');
  const vac=[];
  (tenantsData||[]).forEach(t=>{
    if(!t||t.renewalStatus!=='not-renewing'||!t.movingOut) return;
    const mo=t.movingOut;
    const exp=new Date(mo.expectedMoveOut||'');
    const dLeft=String(exp)==='Invalid Date'?null:Math.ceil((exp-new Date())/86400000);
    const chk=mo.landlordChecklist||{};
    const done=MO_LANDLORD_KEYS.filter(x=>chk[x.k]).length;
    const pct=Math.round((done/MO_LANDLORD_KEYS.length)*100);
    vac.push(`<div class="renewal-vac-card">
      <div class="renewal-vac-head"><strong>${String(t.name||'').replace(/</g,'')}</strong> · ${t.property}<div class="renewal-card-muted">Move out: ${isoToPretty(mo.expectedMoveOut)} · ${dLeft!=null?dLeft+' days left':'—'}</div>
      <div>Deposit held: R${Number(mo.depositRefund||0).toLocaleString('en-ZA')}</div></div>
      <div class="renewal-vac-tasks">${MO_LANDLORD_KEYS.map(x=>`<label class="renewal-chk"><input type="checkbox" ${chk[x.k]?'checked':''} onchange='renewalToggleLandlordCheck(${renewalIdJs(t.id)},${JSON.stringify(x.k)},this.checked)'> ${x.label}</label>`).join('')}</div>
      <div class="lease-bar" style="margin:10px 0"><div class="lease-fill" style="width:${pct}%"></div></div>
      <div style="font-size:0.78rem;color:var(--muted)">${pct}% complete</div>
      <button type="button" class="btn-primary btn-sm" style="margin-top:8px" ${pct<100?'disabled':''} onclick='renewalMarkVacated(${renewalIdJs(t.id)})'>Mark as Vacated</button>
    </div>`);
  });
  if(vacWrap){
    if(!vac.length){ vacWrap.style.display='none'; vacWrap.innerHTML=''; }
    else{
      vacWrap.style.display='block';
      vacWrap.innerHTML=`<h3 class="tax-section-title" style="margin-top:28px">Vacating / move-out</h3>${vac.join('')}`;
    }
  }

  const kan=document.getElementById('renewalsKanban');
  if(kan){
    kan.innerHTML=
      renewalKanbanColumn('Needs attention','renewal-col--danger',attention)+
      renewalKanbanColumn('In discussion','renewal-col--amber',discuss)+
      renewalKanbanColumn('Renewal sent','renewal-col--gold',offer)+
      renewalKanbanColumn('Renewed','renewal-col--ok',renewed);
  }
  const upEl=document.getElementById('renewalsUpcoming');
  if(upEl){
    if(!upcoming.length){ upEl.innerHTML=''; upEl.style.display='none'; }
    else{
      upEl.style.display='block';
      upEl.innerHTML=`<h3 class="tax-section-title" style="margin-top:20px">Upcoming (31–90 days)</h3><div class="renewal-up-strip">${upcoming.join('')}</div>`;
    }
  }

  try{ window.nestiqRenderLeasesPortfolioTable?.(); }catch(_e){}
}

function initRenewalsPage(){
  renderRenewalsPage();
}

function appendTaxRenewalSectionToTax(year){
  const mount=document.getElementById('taxRenewalSection');
  if(!mount) return;
  const y=Number(year)||new Date().getFullYear();
  const rows=[];
  let totalOld=0,totalNew=0;
  (tenantsData||[]).forEach(t=>{
    (t.renewalHistory||[]).forEach(h=>{
      const ry=new Date(h.renewalDate||'').getFullYear();
      if(ry!==y) return;
      const inc=h.newRent-h.oldRent;
      const ip=h.increasePercent!=null?Number(h.increasePercent).toFixed(1):'—';
      rows.push(`<tr><td>${String(t.name||'').replace(/</g,'')}</td><td>${String(t.property||'').replace(/</g,'')}</td><td>R${Number(h.oldRent||0).toLocaleString('en-ZA')}</td><td>R${Number(h.newRent||0).toLocaleString('en-ZA')}</td><td>${ip}%</td><td>${isoToPretty(h.renewalDate)}</td><td>${isoToPretty(t.leaseEnd||t.lease)}</td></tr>`);
      totalOld+=Number(h.oldRent||0);
      totalNew+=Number(h.newRent||0);
    });
  });
  const delta=totalNew-totalOld;
  const pct=totalOld?((delta/totalOld)*100).toFixed(1):'0';
  mount.innerHTML=`
    <div class="tax-section-title">Lease renewals ${y}</div>
    ${rows.length?`<table class="renewal-tax-table"><thead><tr><th>Tenant</th><th>Property</th><th>Old rent</th><th>New rent</th><th>Increase</th><th>Renewal date</th><th>Lease end</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p style="font-size:0.9rem;margin-top:12px"><strong>Portfolio rent increased by R${delta.toLocaleString('en-ZA')} (${pct}%) through renewals in ${y}.</strong></p>`:`<p style="color:var(--muted);font-size:0.86rem">No renewal records for ${y}.</p>`}`;
}

function initLeaseRenewalEngine(){
  computeLeaseStatus();
  runRenewalInAppBellChecks();
  renderHomeLeaseWidget();
  if(window.__leaseRenewalInterval) clearInterval(window.__leaseRenewalInterval);
  window.__leaseRenewalInterval=setInterval(()=>{
    computeLeaseStatus();
    runRenewalInAppBellChecks();
    renderHomeLeaseWidget();
    if(document.getElementById('page-renewals')) renderRenewalsPage();
  },24*60*60*1000);
}

function renderTenantRenewalPortalSection(tenant,days){
  if(!renewalTenantInOccupancy(tenant)) return '';
  if(days>90) return '';
  const st=tenant.renewalStatus;
  const pend=tenant.pendingNewLease;
  let box='';
  if(st==null){
    const head=days<0?`Your lease expired ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ago`:`Your lease expires in ${days} day${days===1?'':'s'}`;
    box=`<div style="background:rgba(201,168,76,0.14);border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:10px;font-size:0.82rem">
      <div style="font-weight:700;margin-bottom:6px">${head}</div>
      <div style="color:var(--muted);margin-bottom:8px">Message your caretaker to discuss renewal.</div>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqTenantOpenChat()">Message caretaker</button>
    </div>`;
  }else if(st==='discussing'){
    box=`<div style="background:rgba(201,168,76,0.2);border:1px solid var(--gold);border-radius:10px;padding:10px;margin-top:10px;font-size:0.82rem">
      <div style="font-weight:700">Your renewal is being discussed</div>
      <div style="color:var(--muted)">Your landlord will send you a formal offer soon.</div>
    </div>`;
  }else if(st==='offer-sent'&&pend){
    box=`<div style="background:rgba(90,122,96,0.12);border:1px solid var(--sage);border-radius:10px;padding:10px;margin-top:10px;font-size:0.82rem">
      <div style="font-weight:700;margin-bottom:6px">You have received a renewal offer</div>
      <div>New period: ${isoToPretty(pend.startDate)} — ${isoToPretty(pend.endDate)}</div>
      <div>New rent: R${Number(pend.newRent||0).toLocaleString('en-ZA')} (Δ R${Number(pend.increaseAmount||0).toLocaleString('en-ZA')})</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn-primary btn-sm" onclick="tenantPortalAcceptRenewalWhatsApp()">Accept — WhatsApp</button>
        <button type="button" class="btn-outline btn-sm" onclick="tenantPortalDeclineRenewalWhatsApp()">Decline — notify landlord</button>
      </div>
    </div>`;
  }else if(st==='renewed'){
    box=`<div style="background:rgba(90,122,96,0.15);border:1px solid var(--sage);border-radius:10px;padding:10px;margin-top:10px;font-size:0.82rem">
      <div style="font-weight:700">✓ Your lease has been renewed</div>
      <div>Lease period: ${isoToPretty(tenant.leaseStart)} — ${isoToPretty(tenant.leaseEnd||tenant.lease)}</div>
      <div>New monthly rent: R${Number(tenant.rent||0).toLocaleString('en-ZA')}</div>
    </div>`;
  }else if(st==='not-renewing'&&tenant.movingOut){
    const mo=tenant.movingOut;
    const tasks=['Give 1 calendar month written notice','Schedule pre-inspection with landlord','Arrange professional cleaning','Repair any damage to walls, fixtures','Return all keys and remotes','Provide forwarding address','Cancel utilities in your name','Take final meter readings'];
    const saved=tenant.moveOutChecklist||{};
    const done=tasks.filter((_,i)=>saved[i]||saved[String(i)]).length;
    const pct=Math.round((done/tasks.length)*100);
    box=`<div style="background:rgba(196,106,58,0.12);border:1px solid var(--rust);border-radius:10px;padding:10px;margin-top:10px;font-size:0.82rem">
      <div style="font-weight:700;color:var(--rust)">Your lease will not be renewed</div>
      <div>Please vacate by ${isoToPretty(mo.expectedMoveOut)}</div>
      <div style="margin-top:8px;font-weight:600">Move-out checklist</div>
      ${tasks.map((tk,i)=>`<label style="display:flex;gap:6px;margin-top:4px;font-size:0.78rem"><input type="checkbox" ${saved[i]||saved[String(i)]?'checked':''} onchange="toggleMoveTask(${i})"> ${tk}</label>`).join('')}
      <div class="lease-bar" style="margin-top:8px"><div class="lease-fill" style="width:${pct}%"></div></div>
    </div>`;
  }
  if(!box) return '';
  return `<div style="margin-top:10px;font-size:0.8rem;color:var(--muted)"><strong>Renewal</strong></div>${box}`;
}

function tenantPortalRenewalTenant(){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='tenant') return null;
  return tenantsData.find(x=>x.id===s.userId)||null;
}

function tenantPortalAcceptRenewalWhatsApp(){
  const t=tenantPortalRenewalTenant();
  if(!t||!landlordSettings?.phone){ nestiqShowNotif('Missing landlord phone','warning'); return; }
  const msg=`Hi, I ${t.name} accept the lease renewal terms offered for ${t.property} - ${t.unit}. Please confirm.`;
  openWhatsAppChat?.(landlordSettings.phone,msg);
}

function tenantPortalDeclineRenewalWhatsApp(){
  const t=tenantPortalRenewalTenant();
  if(!t||!landlordSettings?.phone){ nestiqShowNotif('Missing landlord phone','warning'); return; }
  const msg=`Hi, I ${t.name} need to decline the renewal offer for ${t.property} - ${t.unit}. Please let me know next steps.`;
  openWhatsAppChat?.(landlordSettings.phone,msg);
}

if(!window.__nestiqRenewalsNotifHooked){
  window.__nestiqRenewalsNotifHooked=true;
  const prevInitNotif=window.initNotificationsForSession;
  window.initNotificationsForSession=function(){
    prevInitNotif?.();
    initLeaseRenewalEngine();
  };
}

window.computeLeaseStatus=computeLeaseStatus;
window.initLeaseRenewalEngine=initLeaseRenewalEngine;
window.renderHomeLeaseWidget=renderHomeLeaseWidget;
window.initRenewalsPage=initRenewalsPage;
window.renderRenewalsPage=renderRenewalsPage;
window.openStartRenewalModal=openStartRenewalModal;
window.openSendOfferModal=openSendOfferModal;
window.openConfirmRenewalModal=openConfirmRenewalModal;
window.appendTaxRenewalSectionToTax=appendTaxRenewalSectionToTax;
window.renderTenantRenewalPortalSection=renderTenantRenewalPortalSection;
window.renewalQuickEndMonths=renewalQuickEndMonths;
window.renewalModalRecalc=renewalModalRecalc;
window.renewalToggleIncFields=renewalToggleIncFields;
window.submitStartRenewalDiscuss=submitStartRenewalDiscuss;
window.submitStartRenewalWhatsApp=submitStartRenewalWhatsApp;
window.renewalGenerateOfferLetter=renewalGenerateOfferLetter;
window.renewalDownloadOfferPdf=renewalDownloadOfferPdf;
window.renewalEmailOffer=renewalEmailOffer;
window.renewalMarkOfferSent=renewalMarkOfferSent;
window.renewalApplyAccepted=renewalApplyAccepted;
window.renewalApplyDeclined=renewalApplyDeclined;
window.renewalSendConfirmationWhatsApp=renewalSendConfirmationWhatsApp;
window.renewalToggleLandlordCheck=renewalToggleLandlordCheck;
window.renewalMarkVacated=renewalMarkVacated;
window.tenantPortalAcceptRenewalWhatsApp=tenantPortalAcceptRenewalWhatsApp;
window.tenantPortalDeclineRenewalWhatsApp=tenantPortalDeclineRenewalWhatsApp;
