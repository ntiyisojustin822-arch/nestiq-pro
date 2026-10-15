/* ═══════════════════════════════
   TENANT COMMUNICATIONS LOG (timeline, auto-log, follow-ups, report)
═══════════════════════════════ */

const NESTIQ_COMM_TYPES=['whatsapp','email','call','sms','in-person','notice','letter','other'];
const NESTIQ_WA_SUBJECTS={
  rentReminder:'Rent reminder',
  overdueNotice:'Overdue notice',
  paymentConfirmation:'Payment confirmation',
  leaseExpiry:'Lease expiry warning',
  welcomeMessage:'Welcome message',
  custom:'Custom WhatsApp',
  lateFeeNotice:'Late fee notice',
  lateFeeWaive:'Late fee waived',
  emergency:'Emergency / urgent',
  renewal:'Renewal offer'
};
const NESTIQ_EMAIL_KIND_LABELS={
  rentReminder:'Rent reminder email',
  paymentReceipt:'Payment receipt email',
  overdueNotice:'Overdue notice email',
  leaseExpiry:'Lease expiry email',
  maintenanceUpdate:'Maintenance update email',
  welcomeTenant:'Welcome email',
  customMessage:'Custom email',
  test:'Email test',
  email:'Email'
};

function nestiqCommEscape(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function nestiqCommTodayYmd(){
  return new Date().toISOString().slice(0,10);
}

function nestiqCommNowTime(){
  const d=new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function nestiqCommAppend(entry){
  if(!Array.isArray(communications)) communications=[];
  const id=communicationNextId++;
  try{ window.communicationNextId=communicationNextId; }catch(_e){}
  const row={
    id,
    tenantId:Number(entry.tenantId)||null,
    tenantName:String(entry.tenantName||''),
    propertyId:entry.propertyId!=null&&Number.isFinite(Number(entry.propertyId))?Number(entry.propertyId):null,
    type:NESTIQ_COMM_TYPES.includes(entry.type)?entry.type:'other',
    direction:entry.direction==='incoming'?'incoming':'outgoing',
    subject:String(entry.subject||'').slice(0,500),
    content:String(entry.content||''),
    date:String(entry.date||nestiqCommTodayYmd()).slice(0,10),
    time:String(entry.time||nestiqCommNowTime()).slice(0,8),
    outcome:String(entry.outcome||''),
    followUpRequired:Boolean(entry.followUpRequired),
    followUpDate:entry.followUpDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(entry.followUpDate))?String(entry.followUpDate).slice(0,10):'',
    followUpCompleted:Boolean(entry.followUpCompleted),
    createdAt:String(entry.createdAt||new Date().toISOString())
  };
  communications.unshift(row);
  saveData();
  nestiqRenderHomeFollowUpsWidget?.();
  renderBell?.();
}

function nestiqAutoLogWhatsApp(meta,messageText){
  const tid=meta?.tenantId;
  if(tid==null||tid==='') return;
  const t=tenantsData?.find(x=>Number(x.id)===Number(tid));
  if(!t) return;
  const subj=NESTIQ_WA_SUBJECTS[meta.type]||String(meta.type||'WhatsApp');
  nestiqCommAppend({
    tenantId:t.id,
    tenantName:t.name,
    propertyId:t.propertyId,
    type:'whatsapp',
    direction:'outgoing',
    subject:subj,
    content:String(messageText||'').slice(0,8000)
  });
}

function nestiqAutoLogEmail(meta,params){
  const tid=meta?.tenantId;
  if(tid==null||tid==='') return;
  const t=tenantsData?.find(x=>Number(x.id)===Number(tid));
  if(!t) return;
  const kind=meta.type||'email';
  const tplName=NESTIQ_EMAIL_KIND_LABELS[kind]||String(kind);
  const subj=String(params?.subject||`Email: ${tplName}`).slice(0,500);
  nestiqCommAppend({
    tenantId:t.id,
    tenantName:t.name,
    propertyId:t.propertyId,
    type:'email',
    direction:'outgoing',
    subject:subj,
    content:tplName
  });
}

function nestiqAutoLogNotice(tenantId,title,message){
  const t=tenantsData?.find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  nestiqCommAppend({
    tenantId:t.id,
    tenantName:t.name,
    propertyId:t.propertyId,
    type:'notice',
    direction:'outgoing',
    subject:String(title||'Notice'),
    content:String(message||'')
  });
}

function nestiqAutoLogPortalMessage(tenantId,messageText){
  const t=tenantsData?.find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  nestiqCommAppend({
    tenantId:t.id,
    tenantName:t.name,
    propertyId:t.propertyId,
    type:'other',
    direction:'incoming',
    subject:'Tenant portal message',
    content:String(messageText||'')
  });
}

function nestiqCommunicationsForTenant(tenantId){
  return (communications||[]).filter(c=>Number(c.tenantId)===Number(tenantId));
}

function nestiqFollowUpsDueList(){
  const today=nestiqCommTodayYmd();
  return (communications||[]).filter(c=>{
    if(!c.followUpRequired||c.followUpCompleted) return false;
    const fd=String(c.followUpDate||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fd)) return false;
    return fd<=today;
  });
}

function nestiqFollowUpsDueCount(){
  return nestiqFollowUpsDueList().length;
}

function openLogCommunicationModal(tenantId){
  const t=tenantsData?.find(x=>Number(x.id)===Number(tenantId));
  if(!t){ nestiqShowNotif('Tenant not found','error'); return; }
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Log communication — ${nestiqCommEscape(t.name)}</h2>
    <p class="modal-sub">${nestiqCommEscape(t.unit||'')} · ${nestiqCommEscape(t.property||'')}</p>
    <div class="form-group"><label>Type</label>
      <select class="form-input" id="comm_log_type">
        ${NESTIQ_COMM_TYPES.map(x=>`<option value="${x}">${x.replace(/-/g,' ')}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Direction</label>
      <div style="display:flex;gap:16px;font-size:0.88rem">
        <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="comm_log_dir" value="outgoing" checked> Outgoing</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="comm_log_dir" value="incoming"> Incoming</label>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label>Date</label><input class="form-input" id="comm_log_date" type="date" value="${nestiqCommTodayYmd()}"></div>
      <div class="form-group"><label>Time</label><input class="form-input" id="comm_log_time" type="time" value="${nestiqCommNowTime()}"></div>
    </div>
    <div class="form-group"><label>Subject <span style="color:var(--rust)">*</span></label><input class="form-input" id="comm_log_subject" placeholder="Short summary"></div>
    <div class="form-group"><label>Content / notes</label><textarea class="form-input" id="comm_log_content" rows="4" placeholder="Details of the interaction"></textarea></div>
    <div class="form-group"><label>Outcome</label><input class="form-input" id="comm_log_outcome" placeholder="What was the result of this interaction?"></div>
    <label class="recurring-toggle-row"><input type="checkbox" id="comm_log_fu" onchange="document.getElementById('comm_log_fu_date_wrap').style.display=this.checked?'block':'none'"> Follow-up required</label>
    <div class="form-group" id="comm_log_fu_date_wrap" style="display:none"><label>Follow-up date</label><input class="form-input" id="comm_log_fu_date" type="date"></div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveManualCommunication(${t.id})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function nestiqSaveManualCommunication(tenantId){
  const t=tenantsData?.find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  const sub=document.getElementById('comm_log_subject')?.value?.trim()||'';
  if(!sub){ nestiqShowNotif('Subject is required','error'); return; }
  const dir=document.querySelector('input[name="comm_log_dir"]:checked')?.value||'outgoing';
  const fu=document.getElementById('comm_log_fu')?.checked;
  const fud=document.getElementById('comm_log_fu_date')?.value||'';
  nestiqCommAppend({
    tenantId:t.id,
    tenantName:t.name,
    propertyId:t.propertyId,
    type:document.getElementById('comm_log_type')?.value||'other',
    direction:dir,
    subject:sub,
    content:document.getElementById('comm_log_content')?.value?.trim()||'',
    date:document.getElementById('comm_log_date')?.value||nestiqCommTodayYmd(),
    time:document.getElementById('comm_log_time')?.value||nestiqCommNowTime(),
    outcome:document.getElementById('comm_log_outcome')?.value?.trim()||'',
    followUpRequired:fu,
    followUpDate:fu&&/^\d{4}-\d{2}-\d{2}$/.test(fud)?fud:'',
    followUpCompleted:false
  });
  nestiqCloseModalAnimated();
  nestiqShowNotif('Communication logged','success');
  nestiqRenderTenantCommsTimeline(Number(tenantId),`vtenant_com_${tenantId}`);
}

function nestiqCommTypeIconClass(type){
  const m={
    whatsapp:'comm-tl-icon comm-ic-wa',
    email:'comm-tl-icon comm-ic-em',
    call:'comm-tl-icon comm-ic-call',
    sms:'comm-tl-icon comm-ic-sms',
    'in-person':'comm-tl-icon comm-ic-ip',
    notice:'comm-tl-icon comm-ic-not',
    letter:'comm-tl-icon comm-ic-let',
    other:'comm-tl-icon comm-ic-oth'
  };
  return m[type]||m.other;
}

function nestiqRenderTenantCommsTimeline(tenantId,hostId){
  const host=document.getElementById(hostId);
  if(!host) return;
  const st=window.__nestiqCommFilter?.[tenantId]||{cat:'all',sort:'desc'};
  let list=nestiqCommunicationsForTenant(tenantId);
  if(st.cat==='out') list=list.filter(c=>c.direction==='outgoing');
  else if(st.cat==='in') list=list.filter(c=>c.direction==='incoming');
  else if(st.cat==='call') list=list.filter(c=>c.type==='call');
  else if(st.cat==='wa') list=list.filter(c=>c.type==='whatsapp');
  else if(st.cat==='em') list=list.filter(c=>c.type==='email');
  list=[...list].sort((a,b)=>{
    const da=`${a.date}T${(a.time||'00:00').slice(0,5)}`;
    const db=`${b.date}T${(b.time||'00:00').slice(0,5)}`;
    return st.sort==='asc'?da.localeCompare(db):db.localeCompare(da);
  });
  const filtBtn=(cat,label)=>`<button type="button" class="btn-outline btn-sm comm-filt ${st.cat===cat?'comm-filt-on':''}" onclick="nestiqSetCommFilter(${tenantId},'${cat}')">${label}</button>`;
  host.innerHTML=`
    <div style="margin-bottom:12px">
      <button type="button" class="btn-outline btn-sm" onclick="openLogCommunicationModal(${tenantId})" style="margin-bottom:10px">Log communication</button>
      <div class="comm-filt-row">${filtBtn('all','All')}${filtBtn('out','Outgoing')}${filtBtn('in','Incoming')}${filtBtn('call','Calls')}${filtBtn('wa','WhatsApp')}${filtBtn('em','Email')}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:10px;font-size:0.82rem">
        <span style="color:var(--muted)">Sort:</span>
        <select class="form-input" style="max-width:200px;padding:6px 10px;font-size:0.82rem" onchange="nestiqSetCommSort(${tenantId},this.value)">
          <option value="desc" ${st.sort==='desc'?'selected':''}>Newest first</option>
          <option value="asc" ${st.sort==='asc'?'selected':''}>Oldest first</option>
        </select>
      </div>
    </div>
    <div class="comm-timeline">${list.length?list.map(c=>{
      const prev=(c.content||'').slice(0,80);
      const more=(c.content||'').length>80;
      const arrow=c.direction==='incoming'?'←':'→';
      return`<div class="comm-tl-item" data-comm-id="${c.id}">
        <div class="comm-tl-left"><div class="comm-tl-dt">${nestiqCommEscape(c.date)}</div><div class="comm-tl-time">${nestiqCommEscape((c.time||'').slice(0,5))}</div></div>
        <div class="${nestiqCommTypeIconClass(c.type)}"></div>
        <div class="comm-tl-body">
          <div class="comm-tl-dir">${arrow} <span class="comm-tl-dir-lbl">${c.direction==='incoming'?'Incoming':'Outgoing'}</span></div>
          <div class="comm-tl-subj">${nestiqCommEscape(c.subject)}</div>
          <div class="comm-tl-preview" id="comm_pr_${c.id}">${nestiqCommEscape(prev)}${more?'…':''}</div>
          ${more?`<button type="button" class="comm-tl-more" data-comm-toggle="${c.id}" onclick="nestiqToggleCommFull(${c.id})">View full</button>`:''}
          <div class="comm-tl-full" id="comm_full_${c.id}" style="display:none;white-space:pre-wrap;font-size:0.84rem;margin-top:6px">${nestiqCommEscape(c.content||'')}</div>
          ${c.outcome?`<div class="comm-tl-out">${nestiqCommEscape(c.outcome)}</div>`:''}
          ${c.followUpRequired&&!c.followUpCompleted?`<span class="comm-fu-badge">Follow-up${c.followUpDate?` · ${nestiqCommEscape(c.followUpDate)}`:''}</span>`:''}
        </div>
      </div>`;
    }).join(''):'<div style="color:var(--muted);font-size:0.88rem">No communications logged yet.</div>'}</div>`;
}

function nestiqToggleCommFull(id){
  const pr=document.getElementById(`comm_pr_${id}`);
  const full=document.getElementById(`comm_full_${id}`);
  const btn=document.querySelector(`[data-comm-toggle="${id}"]`);
  if(!full) return;
  const on=full.style.display!=='block';
  full.style.display=on?'block':'none';
  if(pr) pr.style.display=on?'none':'';
  if(btn) btn.textContent=on?'Show less':'View full';
}

function nestiqSetCommFilter(tenantId,cat){
  window.__nestiqCommFilter=window.__nestiqCommFilter||{};
  window.__nestiqCommFilter[tenantId]={...(window.__nestiqCommFilter[tenantId]||{}),cat};
  nestiqRenderTenantCommsTimeline(tenantId,`vtenant_com_${tenantId}`);
}

function nestiqSetCommSort(tenantId,sort){
  window.__nestiqCommFilter=window.__nestiqCommFilter||{};
  window.__nestiqCommFilter[tenantId]={...(window.__nestiqCommFilter[tenantId]||{}),sort};
  nestiqRenderTenantCommsTimeline(tenantId,`vtenant_com_${tenantId}`);
}

function nestiqViewTenantSwitchTab(tenantId,tab){
  const ov=document.getElementById(`vtenant_ov_${tenantId}`);
  const cm=document.getElementById(`vtenant_com_${tenantId}`);
  if(!ov||!cm) return;
  document.querySelectorAll(`.nest-vt-tab[data-tid="${tenantId}"]`).forEach(b=>{
    b.classList.toggle('comm-tab-active',b.getAttribute('data-tab')===tab);
  });
  if(tab==='com'){
    ov.style.display='none';
    cm.style.display='block';
    nestiqRenderTenantCommsTimeline(tenantId,`vtenant_com_${tenantId}`);
  }else{
    ov.style.display='block';
    cm.style.display='none';
  }
}

function nestiqRenderHomeFollowUpsWidget(){
  const sec=document.getElementById('homeFollowUpsSection');
  const w=document.getElementById('homeFollowUpsWidget');
  if(!sec||!w) return;
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='landlord'){ sec.style.display='none'; return; }
  const list=nestiqFollowUpsDueList();
  if(!list.length){ sec.style.display='none'; return; }
  sec.style.display='block';
  w.innerHTML=`
    <div class="followup-home-card">
      <div class="followup-home-title">Follow-ups due</div>
      <p class="followup-home-sub">Communication follow-ups that need your attention</p>
      <div class="followup-home-list">${list.map(c=>{
        const t=tenantsData?.find(x=>Number(x.id)===Number(c.tenantId));
        const past=c.followUpDate&&c.followUpDate<nestiqCommTodayYmd();
        return`<div class="followup-home-row">
          <div>
            <div class="followup-home-tenant">${nestiqCommEscape(t?.name||c.tenantName||'Tenant')}</div>
            <div class="followup-home-prop">${nestiqCommEscape(t?.property||'')}</div>
            <div class="followup-home-subj">${nestiqCommEscape(c.subject)}</div>
            <div class="followup-home-due ${past?'is-past':''}">Due: ${nestiqCommEscape(c.followUpDate||'—')}</div>
          </div>
          <button type="button" class="btn-primary btn-sm" onclick="nestiqCompleteFollowUp(${c.id})">Complete</button>
        </div>`;
      }).join('')}</div>
    </div>`;
}

function nestiqCompleteFollowUp(commId){
  const c=communications?.find(x=>Number(x.id)===Number(commId));
  if(!c) return;
  if(confirm('Mark this follow-up complete? You can log the outcome as a new communication.')){
    c.followUpRequired=false;
    c.followUpCompleted=true;
    saveData();
    nestiqRenderHomeFollowUpsWidget();
    renderBell?.();
    if(confirm('Open log communication for this tenant now?')){
      openLogCommunicationModal(c.tenantId);
    }
  }
}

function openCommunicationReportModal(){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='landlord'){ nestiqShowNotif('Landlords only','warning'); return; }
  const tenantOpts=(tenantsData||[]).map(t=>`<option value="${t.id}">${nestiqCommEscape(t.name)}</option>`).join('');
  const today=nestiqCommTodayYmd();
  const fd=new Date();
  const firstMonth=`${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-01`;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Communication summary</h2>
    <p class="modal-sub">Filter and export your tenant communication log</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label>From</label><input class="form-input" id="comm_rep_from" type="date" value="${firstMonth}"></div>
      <div class="form-group"><label>To</label><input class="form-input" id="comm_rep_to" type="date" value="${today}"></div>
    </div>
    <div class="form-group"><label>Tenant</label>
      <select class="form-input" id="comm_rep_tenant"><option value="">All tenants</option>${tenantOpts}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label>Type</label>
        <select class="form-input" id="comm_rep_type"><option value="">All</option>${NESTIQ_COMM_TYPES.map(x=>`<option value="${x}">${x}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Direction</label>
        <select class="form-input" id="comm_rep_dir"><option value="">All</option><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqRenderCommunicationReportTable()">Apply filters</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button>
    </div>
    <div id="comm_rep_out" style="margin-top:16px;max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:10px"></div>`;
  nestiqOpenModalAnimated();
  nestiqRenderCommunicationReportTable();
}

function nestiqFilteredCommunicationReportRows(){
  const from=document.getElementById('comm_rep_from')?.value||'';
  const to=document.getElementById('comm_rep_to')?.value||'';
  const tid=document.getElementById('comm_rep_tenant')?.value||'';
  const typ=document.getElementById('comm_rep_type')?.value||'';
  const dir=document.getElementById('comm_rep_dir')?.value||'';
  let rows=[...(communications||[])];
  if(tid) rows=rows.filter(c=>Number(c.tenantId)===Number(tid));
  if(typ) rows=rows.filter(c=>c.type===typ);
  if(dir) rows=rows.filter(c=>c.direction===dir);
  rows=rows.filter(c=>{
    const d=String(c.date||'');
    if(from&&d<from) return false;
    if(to&&d>to) return false;
    return true;
  });
  return rows.sort((a,b)=>`${b.date}T${b.time||''}`.localeCompare(`${a.date}T${a.time||''}`));
}

function nestiqRenderCommunicationReportTable(){
  const out=document.getElementById('comm_rep_out');
  if(!out) return;
  const rows=nestiqFilteredCommunicationReportRows();
  if(!rows.length){ out.innerHTML='<div style="padding:16px;color:var(--muted)">No rows match.</div>'; return; }
  out.innerHTML=`<table class="rentroll-table" style="width:100%;font-size:0.78rem"><thead><tr>
    <th>Date</th><th>Time</th><th>Tenant</th><th>Type</th><th>Dir</th><th>Subject</th><th>Content</th></tr></thead><tbody>
    ${rows.map(c=>`<tr>
      <td>${nestiqCommEscape(c.date)}</td>
      <td>${nestiqCommEscape((c.time||'').slice(0,5))}</td>
      <td>${nestiqCommEscape(c.tenantName||'')}</td>
      <td>${nestiqCommEscape(c.type)}</td>
      <td>${nestiqCommEscape(c.direction)}</td>
      <td>${nestiqCommEscape(c.subject)}</td>
      <td>${nestiqCommEscape((c.content||'').slice(0,120))}</td>
    </tr>`).join('')}
    </tbody></table>`;
}

function nestiqExportCommunicationCSV(){
  const rows=nestiqFilteredCommunicationReportRows();
  const hdr='Date,Time,Tenant,PropertyId,Type,Direction,Subject,Content,Outcome,FollowUpRequired,FollowUpDate';
  const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[hdr,...rows.map(c=>[
    c.date,(c.time||'').slice(0,5),c.tenantName,c.propertyId,c.type,c.direction,c.subject,c.content,c.outcome,c.followUpRequired,c.followUpDate
  ].map(esc).join(','))];
  downloadCSV(lines.join('\n'),'nestiq-communications.csv');
  nestiqShowNotif('CSV exported','success');
}

window.nestiqAutoLogWhatsApp=nestiqAutoLogWhatsApp;
window.nestiqAutoLogEmail=nestiqAutoLogEmail;
window.nestiqAutoLogNotice=nestiqAutoLogNotice;
window.nestiqAutoLogPortalMessage=nestiqAutoLogPortalMessage;
window.openLogCommunicationModal=openLogCommunicationModal;
window.nestiqSaveManualCommunication=nestiqSaveManualCommunication;
window.nestiqViewTenantSwitchTab=nestiqViewTenantSwitchTab;
window.nestiqSetCommFilter=nestiqSetCommFilter;
window.nestiqSetCommSort=nestiqSetCommSort;
window.nestiqToggleCommFull=nestiqToggleCommFull;
window.nestiqRenderHomeFollowUpsWidget=nestiqRenderHomeFollowUpsWidget;
window.nestiqCompleteFollowUp=nestiqCompleteFollowUp;
window.openCommunicationReportModal=openCommunicationReportModal;
window.nestiqRenderCommunicationReportTable=nestiqRenderCommunicationReportTable;
window.nestiqExportCommunicationCSV=nestiqExportCommunicationCSV;
window.nestiqFollowUpsDueCount=nestiqFollowUpsDueCount;
