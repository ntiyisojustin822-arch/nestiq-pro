function nestiqMaintTradeTypes(){
  return(Array.isArray(window.NESTIQ_TRADE_TYPES)&&window.NESTIQ_TRADE_TYPES.length)?window.NESTIQ_TRADE_TYPES:['Plumber','Electrician','General Handyman','Painter','Pest Control','Locksmith','Structural Engineer','Other'];
}
const NESTIQ_MAINT_ISSUE_CATS=[
  'Plumbing','Electrical','General Handyman','Painter','Pest Control','Locksmith','Structural Engineer','Structural','Appliance','Other'
];
window.NESTIQ_MAINT_ISSUE_CATS=NESTIQ_MAINT_ISSUE_CATS;

function nestiqMaintReporterLabel(m){
  if(String(m?.reportedBy||m?.loggedBy||'')==='caretaker'){
    const name=String(m.loggedByName||m.caretakerName||'').trim();
    return name?`${name} (Caretaker)`:'Caretaker';
  }
  return String(m?.tenantName||'').trim();
}
window.nestiqMaintReporterLabel=nestiqMaintReporterLabel;

function nestiqMaintAttachTenantEmail(row){
  if(!row||String(row.tenantEmail||'').trim()) return row;
  const tid=row.tenantId!=null&&row.tenantId!==''?String(row.tenantId):'';
  if(!tid) return row;
  const list=(typeof tenantsData!=='undefined'&&Array.isArray(tenantsData))?tenantsData:(Array.isArray(window.tenantsData)?window.tenantsData:[]);
  const t=list.find(x=>String(x.id)===tid);
  const email=String(t?.email||t?.portalEmail||'').trim();
  if(email) row.tenantEmail=email;
  return row;
}
window.nestiqMaintAttachTenantEmail=nestiqMaintAttachTenantEmail;

function nestiqMaintVisitWindows(){
  return [
    {id:'morning', label:'Morning', hint:'08:00–12:00'},
    {id:'afternoon', label:'Afternoon', hint:'12:00–17:00'},
    {id:'anytime', label:'Anytime', hint:'During the day'}
  ];
}
window.nestiqMaintVisitWindows=nestiqMaintVisitWindows;

function nestiqMaintTodayIso(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
window.nestiqMaintTodayIso=nestiqMaintTodayIso;

function nestiqMaintVisitDateIso(record){
  const raw=String(record?.scheduledDate||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d=new Date(raw);
  if(String(d)==='Invalid Date') return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
window.nestiqMaintVisitDateIso=nestiqMaintVisitDateIso;

function nestiqMaintVisitWindowMeta(id){
  const key=String(id||'anytime').toLowerCase();
  return nestiqMaintVisitWindows().find(w=>w.id===key)||nestiqMaintVisitWindows()[2];
}
window.nestiqMaintVisitWindowMeta=nestiqMaintVisitWindowMeta;

function nestiqMaintVisitLabel(record){
  const iso=nestiqMaintVisitDateIso(record);
  if(!iso) return '';
  const d=new Date(iso+'T12:00:00');
  const dateTxt=String(d)==='Invalid Date'?iso:d.toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const win=nestiqMaintVisitWindowMeta(record?.scheduledWindow);
  return `${dateTxt} · ${win.label} (${win.hint})`;
}
window.nestiqMaintVisitLabel=nestiqMaintVisitLabel;

function nestiqMaintVisitBannerHtml(record){
  const label=nestiqMaintVisitLabel(record);
  if(!label) return '';
  const who=String(record?.vendorName||'Contractor').trim()||'Contractor';
  return `<div class="nestiq-visit-banner" role="status">
    <div class="nestiq-visit-banner-kicker">Scheduled visit</div>
    <div class="nestiq-visit-banner-when">${maintEsc(label)}</div>
    <div class="nestiq-visit-banner-who">${maintEsc(who)} will come on this day</div>
  </div>`;
}
window.nestiqMaintVisitBannerHtml=nestiqMaintVisitBannerHtml;

async function nestiqAddMaintenanceRecord(row){
  const lid=row?.landlordId || (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
  if(!window.nestiqFs?.maintenance||!window.nestiqDb||!lid){
    const err=new Error('Cloud sync required');
    err.code='nestiq/no-cloud';
    throw err;
  }
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  nestiqMaintAttachTenantEmail(row);
  const payload={ ...row, landlordId:lid, status:row.status||'open' };
  if(fv&&payload.createdAt==null) payload.createdAt=fv.serverTimestamp();
  return window.nestiqFs.maintenance(window.nestiqDb, lid).add(payload);
}
window.nestiqAddMaintenanceRecord=nestiqAddMaintenanceRecord;

function nestiqMaintHasVendor(record){
  return !!String(record?.vendorName||'').trim();
}

function nestiqMaintVendorList(){
  const primary=(typeof vendors!=='undefined'&&Array.isArray(vendors))?vendors:[];
  if(primary.length) return primary;
  if(Array.isArray(window.vendors)&&window.vendors.length) return window.vendors;
  return [];
}

function nestiqMaintFindVendor(record){
  const vid=record?.vendorId!=null&&record.vendorId!==''?String(record.vendorId):'';
  if(!vid) return null;
  const fromList=nestiqMaintVendorList().find(x=>String(x.id)===vid);
  if(fromList) return fromList;
  const staff=(window.caretakerStaff||[]).find(x=>
    String(x.id)===vid || String(x.vendorId||'')===vid || String(x.sourceId||'')===vid || String(x.linkedVendorId||'')===vid
  );
  return staff||null;
}

/** True when a portal-enabled contractor owns this open job (landlord cannot move status). */
function nestiqMaintIsContractorLocked(record){
  const st=String(record?.status||'open');
  if(st==='done'||st==='cancelled') return false;
  if(record?.vendorId==null||record.vendorId==='') return false;
  const v=nestiqMaintFindVendor(record);
  return String(v?.accountStatus||'')==='active';
}
window.nestiqMaintIsContractorLocked=nestiqMaintIsContractorLocked;

function nestiqMaintIsApprovalLocked(record){
  return !!record?.pendingLandlordApproval;
}
window.nestiqMaintIsApprovalLocked=nestiqMaintIsApprovalLocked;

function nestiqMaintIsLandlordLocked(record){
  return nestiqMaintIsContractorLocked(record) || nestiqMaintIsApprovalLocked(record);
}
window.nestiqMaintIsLandlordLocked=nestiqMaintIsLandlordLocked;

function nestiqMaintContractorLockMeta(record){
  const vendorName=String(record?.vendorName||nestiqMaintFindVendor(record)?.name||'').trim()||'the contractor';
  const locked=nestiqMaintIsContractorLocked(record);
  return {
    locked,
    vendorName,
    label: locked?`Awaiting ${vendorName}`:'',
    message: locked?`This job is being handled by ${vendorName} — only they can update its status.`:'',
    reason: locked?'contractor':null
  };
}
window.nestiqMaintContractorLockMeta=nestiqMaintContractorLockMeta;

function nestiqMaintLandlordLockMeta(record){
  if(nestiqMaintIsApprovalLocked(record)){
    const vendorName=String(record?.proposedVendorName||record?.vendorName||nestiqMaintFindVendor(record)?.name||'').trim()||'the contractor';
    return {
      locked:true,
      reason:'approval',
      vendorName,
      label:'Pending landlord approval',
      message:"Approve or reject the caretaker's proposed contractor before changing status."
    };
  }
  const contractor=nestiqMaintContractorLockMeta(record);
  if(contractor.locked) return contractor;
  return { locked:false, reason:null, vendorName:contractor.vendorName, label:'', message:'' };
}
window.nestiqMaintLandlordLockMeta=nestiqMaintLandlordLockMeta;

/** Landlord-side gate. Cancel and contractor-dashboard callers are never blocked. */
function nestiqMaintLandlordStatusBlocked(record, newStatus, opts){
  if(opts===true||opts?.fromContractor||opts?.source==='contractor') return null;
  if(String(newStatus||'')==='cancelled') return null;
  if(String(record?.status||'')===String(newStatus||'')) return null;
  const lock=nestiqMaintLandlordLockMeta(record);
  return lock.locked?lock.message:null;
}
window.nestiqMaintLandlordStatusBlocked=nestiqMaintLandlordStatusBlocked;

function nestiqMaintAwaitingHtml(record){
  const lock=nestiqMaintLandlordLockMeta(record);
  if(!lock.locked) return '';
  return `<span class="nestiq-maint-awaiting">${maintEsc(lock.label)}</span>`;
}

/** Display-only status. Never persist `assigned` — that is open + vendorName. */
function nestiqMaintStatusMeta(record){
  const st=String(record?.status||'open');
  const vendor=nestiqMaintHasVendor(record);
  const lock=nestiqMaintLandlordLockMeta(record);
  const extra={ locked:lock.locked, lockReason:lock.reason, vendorName:lock.vendorName, awaitingLabel:lock.label, lockMessage:lock.message };
  if(record?.pendingLandlordApproval) return {cls:'nestiq-maint-st-pending', label:'Pending Landlord Approval', ...extra};
  if(st==='cancelled') return {cls:'nestiq-maint-st-cancelled', label:'Cancelled', ...extra};
  if(st==='done') return {cls:'nestiq-maint-st-done', label:'Completed', ...extra};
  if(st==='progress') return {cls:'nestiq-maint-st-progress', label:'In Progress', ...extra};
  if((st==='open'||st==='assigned')&&vendor){
    if(nestiqMaintContractorStage(record)==='accepted') return {cls:'nestiq-maint-st-accepted', label:'Accepted', ...extra};
    return {cls:'nestiq-maint-st-assigned', label:'Assigned', ...extra};
  }
  return {cls:'nestiq-maint-st-pending', label:'Pending', ...extra};
}
window.nestiqMaintStatusMeta=nestiqMaintStatusMeta;

function nestiqMaintToDate(v){
  if(v==null||v==='') return null;
  if(typeof v.toDate==='function'){
    try{ return v.toDate(); }catch(_e){}
  }
  if(typeof v.seconds==='number') return new Date(v.seconds*1000);
  const d=new Date(v);
  return Number.isNaN(d.getTime())?null:d;
}
window.nestiqMaintToDate=nestiqMaintToDate;

function nestiqMaintFormatStamp(v){
  const d=nestiqMaintToDate(v);
  if(!d){
    const s=String(v||'').trim();
    return s;
  }
  try{
    return d.toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }catch(_e){
    return d.toISOString();
  }
}
window.nestiqMaintFormatStamp=nestiqMaintFormatStamp;

function nestiqMaintNowIso(){
  return new Date().toISOString();
}
window.nestiqMaintNowIso=nestiqMaintNowIso;

function nestiqMaintLocationMeta(record){
  const loc=String(record?.locationType||'').toLowerCase().replace(/[_-]+/g,' ');
  const unit=String(record?.unit||record?.unitNumber||'').trim();
  const common=loc==='common'||loc==='common area'||!unit||/^(common|common area|n\/a|-|—)$/i.test(unit);
  if(common) return {kind:'common', label:'Common Area', field:'Location', value:'Common Area'};
  return {kind:'unit', label:unit, field:'Unit', value:unit};
}
window.nestiqMaintLocationMeta=nestiqMaintLocationMeta;

function nestiqMaintContractorStage(record){
  const st=String(record?.status||'open');
  if(st==='done') return 'completed';
  if(st==='cancelled') return 'cancelled';
  if(st==='progress') return 'progress';
  const stage=String(record?.contractorStage||'').toLowerCase();
  if(stage==='accepted'||record?.contractorAcceptedAt) return 'accepted';
  if(stage==='declined'||record?.contractorDeclinedAt) return 'declined';
  if(nestiqMaintHasVendor(record)||(record?.vendorId!=null&&record.vendorId!=='')) return 'assigned';
  return 'open';
}
window.nestiqMaintContractorStage=nestiqMaintContractorStage;

function nestiqMaintAppendActivity(record, action, detail, actor){
  const log=Array.isArray(record?.activityLog)?record.activityLog.slice():[];
  log.push({
    at:nestiqMaintNowIso(),
    action:String(action||''),
    detail:String(detail||''),
    actor:String(actor||'')
  });
  return log;
}
window.nestiqMaintAppendActivity=nestiqMaintAppendActivity;

function nestiqMaintActivityLabel(entry){
  const action=String(entry?.action||'').toLowerCase();
  const map={
    reported:'Request logged',
    assigned:'Job assigned',
    accepted:'Contractor accepted job',
    started:'Work started',
    completed:'Contractor marked job completed',
    declined:'Contractor declined job',
    rescheduled:'Visit date updated',
    paid:'Contractor payment sent'
  };
  return entry?.detail||map[action]||action||'Update';
}

function nestiqMaintActivityRows(record){
  const log=Array.isArray(record?.activityLog)?record.activityLog.slice():[];
  if(log.length){
    return log.slice().sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  }
  const rows=[];
  if(record?.createdAt||record?.date) rows.push({at:record.createdAt||record.date, action:'reported', detail:'Request logged'});
  if(record?.assignedAt) rows.push({at:record.assignedAt, action:'assigned', detail:record.vendorName?`Job assigned to ${record.vendorName}`:'Job assigned'});
  if(record?.contractorAcceptedAt) rows.push({at:record.contractorAcceptedAt, action:'accepted', detail:'Contractor accepted job'});
  if(record?.contractorStartedAt) rows.push({at:record.contractorStartedAt, action:'started', detail:'Work started'});
  if(record?.contractorCompletedAt||record?.completedDate) rows.push({at:record.contractorCompletedAt||record.completedDate, action:'completed', detail:'Job completed'});
  if(record?.contractorPaidAt) rows.push({at:record.contractorPaidAt, action:'paid', detail:record.contractorPaidAmount!=null?`Payment sent — R${Number(record.contractorPaidAmount).toLocaleString('en-ZA')}`:'Payment sent'});
  if(record?.contractorDeclinedAt) rows.push({at:record.contractorDeclinedAt, action:'declined', detail:record.declineReason?`Declined: ${record.declineReason}`:'Contractor declined job'});
  return rows;
}
window.nestiqMaintActivityRows=nestiqMaintActivityRows;

function nestiqMaintActivityHtml(record){
  const rows=nestiqMaintActivityRows(record);
  if(!rows.length) return '';
  return `<div class="nestiq-job-section">
    <div class="nestiq-job-section-title">Activity</div>
    ${rows.map(e=>`<div class="nestiq-activity-row">${maintEsc(nestiqMaintFormatStamp(e.at)||'—')} — ${maintEsc(nestiqMaintActivityLabel(e))}${e.actor?` <span style="color:var(--muted)">(${maintEsc(e.actor)})</span>`:''}</div>`).join('')}
  </div>`;
}
window.nestiqMaintActivityHtml=nestiqMaintActivityHtml;

function nestiqMaintTimelineHtml(record){
  const items=[
    ['Reported', record?.createdAt||record?.date],
    ['Assigned', record?.assignedAt],
    ['Accepted', record?.contractorAcceptedAt],
    ['Started', record?.contractorStartedAt],
    ['Completed', record?.contractorCompletedAt||(record?.status==='done'?record?.completedDate:'')],
    ['Paid', record?.contractorPaidAt]
  ].filter(([,v])=>v);
  if(!items.length) return '';
  return `<div class="nestiq-job-section">
    <div class="nestiq-job-section-title">Timeline</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.86rem">
      ${items.map(([label,v])=>`<div><span style="color:var(--muted)">${maintEsc(label)}:</span> ${maintEsc(nestiqMaintFormatStamp(v)||'—')}</div>`).join('')}
    </div>
  </div>`;
}
window.nestiqMaintTimelineHtml=nestiqMaintTimelineHtml;

function nestiqMaintPriorityOptionsHtml(selected){
  const cur=nestiqMaintNormalizePriority(selected);
  return ['Low','Medium','High','Emergency'].map(p=>`<option value="${p}" ${cur===p?'selected':''}>${p}</option>`).join('');
}
window.nestiqMaintPriorityOptionsHtml=nestiqMaintPriorityOptionsHtml;

function nestiqMaintNormalizePriority(v){
  const s=String(v||'').trim();
  if(!s) return 'Medium';
  const low=s.toLowerCase();
  if(low==='emergency'||low.includes('emergency')) return 'Emergency';
  if(low==='high'||low.includes('high')||low.includes('urgent')) return 'High';
  if(low==='low'||low.includes('low')) return 'Low';
  if(low==='medium'||low.includes('medium')) return 'Medium';
  return 'Medium';
}
window.nestiqMaintNormalizePriority=nestiqMaintNormalizePriority;

function nestiqMaintOfficialPriority(m){
  return nestiqMaintNormalizePriority(m?.priority||m?.reportedPriority||m?.urgency);
}
window.nestiqMaintOfficialPriority=nestiqMaintOfficialPriority;

function nestiqMaintReportedPriority(m){
  return nestiqMaintNormalizePriority(m?.reportedPriority||m?.urgency||m?.priority);
}
window.nestiqMaintReportedPriority=nestiqMaintReportedPriority;

function nestiqMaintReporterRoleLabel(m){
  const role=String(m?.reportedByRole||m?.reportedBy||m?.loggedBy||'').toLowerCase();
  if(role==='caretaker') return 'Caretaker';
  if(role==='landlord') return 'Landlord';
  return 'Tenant';
}

function nestiqMaintPriorityRadiosHtml(selected, name){
  const cur=nestiqMaintNormalizePriority(selected);
  const nm=name||'mt_priority';
  return `<div class="nestiq-priority-radios" role="radiogroup" aria-label="Priority / Urgency">
    ${['Low','Medium','High','Emergency'].map(p=>`
      <label class="nestiq-priority-radio${cur===p?' is-on':''}">
        <input type="radio" name="${maintEsc(nm)}" value="${p}" ${cur===p?'checked':''} onchange="nestiqMaintPriorityRadioChanged('${maintEsc(nm)}')">
        <span>${p}</span>
      </label>`).join('')}
  </div>`;
}
window.nestiqMaintPriorityRadiosHtml=nestiqMaintPriorityRadiosHtml;

function nestiqMaintPriorityRadioChanged(name){
  document.querySelectorAll(`input[name="${name}"]`).forEach(inp=>{
    inp.closest('.nestiq-priority-radio')?.classList.toggle('is-on', !!inp.checked);
  });
}
window.nestiqMaintPriorityRadioChanged=nestiqMaintPriorityRadioChanged;

function nestiqMaintReadPriorityInput(name){
  const checked=document.querySelector(`input[name="${CSS&&CSS.escape?CSS.escape(name):name}"]:checked`);
  if(checked) return nestiqMaintNormalizePriority(checked.value);
  const el=document.getElementById(name);
  return nestiqMaintNormalizePriority(el?.value);
}
window.nestiqMaintReadPriorityInput=nestiqMaintReadPriorityInput;

function nestiqMaintSetPriorityInput(name, value){
  const v=nestiqMaintNormalizePriority(value);
  const radios=document.querySelectorAll(`input[name="${name}"]`);
  if(radios.length){
    radios.forEach(inp=>{
      inp.checked=inp.value===v;
      inp.closest('.nestiq-priority-radio')?.classList.toggle('is-on', inp.checked);
    });
    return;
  }
  const el=document.getElementById(name);
  if(el) el.value=v;
}
window.nestiqMaintSetPriorityInput=nestiqMaintSetPriorityInput;

function nestiqMaintPriorityReviewNoteHtml(m){
  const official=nestiqMaintOfficialPriority(m);
  const reported=nestiqMaintReportedPriority(m);
  const who=nestiqMaintReporterRoleLabel(m);
  if(!m) return '';
  if(reported===official){
    return `<div class="nestiq-priority-reported">${maintEsc(who)} reported ${maintEsc(reported)}</div>`;
  }
  return `<div class="nestiq-priority-reported">${maintEsc(who)} reported: <strong>${maintEsc(reported)}</strong> · Official: <strong>${maintEsc(official)}</strong></div>`;
}
window.nestiqMaintPriorityReviewNoteHtml=nestiqMaintPriorityReviewNoteHtml;

function nestiqMaintApplyOfficialPriority(record, next, actorName, actorRole){
  const official=nestiqMaintNormalizePriority(next);
  if(!record.reportedPriority){
    record.reportedPriority=nestiqMaintReportedPriority(record);
  }
  const prev=nestiqMaintOfficialPriority(record);
  record.priority=official;
  record.urgency=official;
  if(prev!==official){
    record.priorityReviewedBy=actorName||'';
    record.priorityReviewedByRole=actorRole||'';
    record.priorityReviewedAt=typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString();
    record.activityLog=nestiqMaintAppendActivity(record, 'priority', `${actorName||'Manager'} set priority to ${official} (reported ${record.reportedPriority})`, actorName||'');
  }
  return record;
}
window.nestiqMaintApplyOfficialPriority=nestiqMaintApplyOfficialPriority;

function nestiqMaintTenantsForProperty(prop){
  const list=typeof tenantsData!=='undefined'&&Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  const pid=prop&&prop.id!=null?String(prop.id):'';
  const name=String(prop?.name||'');
  return list.filter(t=> (pid&&String(t.propertyId||'')===pid) || (name&&t.property===name));
}

function nestiqMaintAddLocationInnerHtml(propName, draft){
  const prop=(typeof propertiesData!=='undefined'?propertiesData:[]).find(p=>p.name===propName);
  const units=typeof nestiqUnitsForProperty==='function'&&prop?nestiqUnitsForProperty(prop.id):[];
  const tenants=nestiqMaintTenantsForProperty(prop||{name:propName});
  const loc=String(draft?.locationType||'common');
  const unit=String(draft?.unit||'');
  const tenantId=String(draft?.tenantId||'');
  const unitOpts=`<option value="">Select unit</option>`+(units.length
    ? units.map(u=>{
        const val=String(u.unitNumber||u.label||'');
        return `<option value="${maintEsc(val)}" ${val===unit?'selected':''}>${maintEsc(val||'Unit')}</option>`;
      }).join('')
    : tenants.map(t=>t.unit?`<option value="${maintEsc(t.unit)}" ${t.unit===unit?'selected':''}>${maintEsc(t.unit)}</option>`:'').join(''));
  const tenantOpts=`<option value="">None — common area / no tenant</option>`+tenants.map(t=>{
    const id=String(t.id||t.tenantId||'');
    return `<option value="${maintEsc(id)}" ${id===tenantId?'selected':''}>${maintEsc(t.name||'Tenant')}${t.unit?` (${maintEsc(t.unit)})`:''}</option>`;
  }).join('');
  return `
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Location</label>
      <select class="form-input" id="mt_location_type" onchange="nestiqMaintOnAddLocationTypeChange()">
        <option value="common" ${loc!=='unit'?'selected':''}>Common Area</option>
        <option value="unit" ${loc==='unit'?'selected':''}>Specific unit</option>
      </select>
    </div>
    <div id="mt_unit_wrap" style="display:${loc==='unit'?'block':'none'};margin-top:12px">
      <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Unit</label>
        <select class="form-input" id="mt_unit">${unitOpts}</select>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Tenant (optional)</label>
      <select class="form-input" id="mt_tenant">${tenantOpts}</select>
    </div>`;
}

function nestiqMaintRefreshAddLocationFields(){
  const propName=document.getElementById('mt_prop')?.value||'';
  const wrap=document.getElementById('mt_location_wrap');
  if(!wrap) return;
  const draft={
    locationType:document.getElementById('mt_location_type')?.value||'common',
    unit:document.getElementById('mt_unit')?.value||'',
    tenantId:document.getElementById('mt_tenant')?.value||''
  };
  wrap.innerHTML=nestiqMaintAddLocationInnerHtml(propName, draft);
}
window.nestiqMaintRefreshAddLocationFields=nestiqMaintRefreshAddLocationFields;

function nestiqMaintOnAddLocationTypeChange(){
  const type=document.getElementById('mt_location_type')?.value||'common';
  const wrap=document.getElementById('mt_unit_wrap');
  if(wrap) wrap.style.display=type==='unit'?'block':'none';
}
window.nestiqMaintOnAddLocationTypeChange=nestiqMaintOnAddLocationTypeChange;

function nestiqMaintReadAddLocationFields(){
  const locType=document.getElementById('mt_location_type')?.value||'common';
  const unit=(document.getElementById('mt_unit')?.value||'').trim();
  const tenantId=document.getElementById('mt_tenant')?.value||'';
  const list=typeof tenantsData!=='undefined'&&Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  const tenant=tenantId?list.find(t=>String(t.id||t.tenantId||'')===String(tenantId)):null;
  const isUnit=locType==='unit'&&!!unit;
  return {
    locationType:isUnit?'unit':'common',
    unit:isUnit?unit:'',
    tenantId:tenant?String(tenant.id||tenant.tenantId||''):null,
    tenantName:tenant?String(tenant.name||''):null
  };
}

function nestiqMaintCatMeta(category){
  const c=String(category||'').trim().toLowerCase();
  const map={
    plumbing:'🔧',
    electrical:'⚡',
    'general handyman':'🛠️',
    painter:'🎨',
    'pest control':'🐜',
    locksmith:'🔑',
    structural:'🏗️',
    'structural engineer':'🏗️',
    appliance:'🔌'
  };
  return {ic: map[c]||'🧰'};
}
window.nestiqMaintCatMeta=nestiqMaintCatMeta;

function nestiqMaintStatusPillHtml(record){
  const meta=nestiqMaintStatusMeta(record);
  return `<span class="nestiq-maint-status-pill ${meta.cls}">${maintEsc(meta.label)}</span>`;
}

function nestiqFindMaint(id){
  const key=String(id??'');
  return (maintenanceData||[]).find(x=>String(x.id)===key || String(x._id||'')===key);
}

function nestiqMaintInitials(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}

function nestiqMaintTrunc(s,n){
  const t=String(s||'').replace(/\s+/g,' ').trim();
  if(!t) return '—';
  const max=Number(n)||80;
  return t.length>max ? t.slice(0,max-1)+'…' : t;
}

function nestiqMaintPhotoUrl(m){
  if(!m) return '';
  const fromRec=String(m.photoUrl||m.photoURL||'').trim();
  if(fromRec) return fromRec;
  const map=window.maintenancePhotos;
  if(map&&map[String(m.id)]) return String(map[String(m.id)]);
  return '';
}

function nestiqMaintJobAmount(m){
  const actual=Number(m?.actualCost);
  if(Number.isFinite(actual)&&actual>0) return actual;
  return (Number(m?.partsCost)||0)+(Number(m?.labourCost)||0);
}
window.nestiqMaintJobAmount=nestiqMaintJobAmount;

function nestiqMaintContractorIsPaid(m){
  if(!m) return false;
  if(String(m.contractorPaymentStatus||'').toLowerCase()==='paid') return true;
  return !!m.contractorPaidAt;
}
window.nestiqMaintContractorIsPaid=nestiqMaintContractorIsPaid;

function nestiqMaintMaskAccount(n){
  const d=String(n||'').replace(/\s+/g,'');
  if(!d) return '';
  if(d.length<=4) return d;
  return '•••• '+d.slice(-4);
}

function nestiqMaintPayeeMeta(m){
  const found=typeof nestiqMaintFindVendor==='function'?nestiqMaintFindVendor(m):null;
  const list=nestiqMaintVendorList();
  const v=found||list.find(x=>String(x.id)===String(m?.vendorId||''));
  const byName=(!v||!(v.bankName||v.accountNumber))?list.find(x=>String(x.name||'').trim().toLowerCase()===String(m?.vendorName||v?.name||'').trim().toLowerCase()):null;
  const bankSrc=v||byName||{};
  return {
    name:String(m?.vendorName||v?.name||'Contractor').trim()||'Contractor',
    bankName:String(bankSrc.bankName||'').trim(),
    accountNumber:String(bankSrc.accountNumber||'').trim(),
    branchCode:String(bankSrc.branchCode||'').trim(),
    accountType:String(bankSrc.accountType||'').trim()
  };
}
window.nestiqMaintPayeeMeta=nestiqMaintPayeeMeta;

function nestiqMaintFormatZar(amount){
  const n=Number(amount)||0;
  return 'R'+n.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function nestiqMaintPayChipHtml(m){
  if(String(m?.status||'')!=='done'||!nestiqMaintHasVendor(m)) return '';
  if(nestiqMaintContractorIsPaid(m)) return '<span class="nestiq-pay-chip nestiq-pay-chip--paid">Paid</span>';
  if(nestiqMaintJobAmount(m)>0) return '<span class="nestiq-pay-chip nestiq-pay-chip--due">Awaiting payment</span>';
  return '';
}
window.nestiqMaintPayChipHtml=nestiqMaintPayChipHtml;

function nestiqMaintPayoutCardHtml(m, opts){
  const o=opts||{};
  const amount=nestiqMaintJobAmount(m);
  const paid=nestiqMaintContractorIsPaid(m);
  const payee=nestiqMaintPayeeMeta(m);
  const canPay=!!o.canPay && !paid && amount>0 && String(m?.status||'')==='done' && nestiqMaintHasVendor(m);
  const payId=o.payId!=null?o.payId:m?.id;
  const acc=nestiqMaintMaskAccount(payee.accountNumber);
  const bankLine=[payee.bankName, acc, payee.accountType].filter(Boolean).join(' · ');
  const av=nestiqMaintInitials(payee.name);
  if(paid){
    return `<div class="nestiq-payout-card nestiq-payout-card--paid">
      <div class="nestiq-payout-head">
        <div class="nestiq-payout-icon" aria-hidden="true">✓</div>
        <div>
          <div class="nestiq-payout-kicker">Contractor payout</div>
          <div class="nestiq-payout-title">Payment sent</div>
        </div>
      </div>
      <div class="nestiq-payout-amount">${maintEsc(nestiqMaintFormatZar(m.contractorPaidAmount!=null?m.contractorPaidAmount:amount))}</div>
      <div class="nestiq-payout-payee">
        <div class="nestiq-payout-av">${maintEsc(av)}</div>
        <div>
          <div class="nestiq-payout-payee-name">${maintEsc(payee.name)}</div>
          ${bankLine?`<div class="nestiq-payout-payee-bank">${maintEsc(bankLine)}</div>`:''}
        </div>
      </div>
      <div class="nestiq-payout-meta">
        ${m.contractorPaidRef?`<div><span>Reference</span><strong>${maintEsc(m.contractorPaidRef)}</strong></div>`:''}
        ${m.contractorPaidAt?`<div><span>Paid</span><strong>${maintEsc(nestiqMaintFormatStamp(m.contractorPaidAt))}</strong></div>`:''}
        ${m.contractorPaidBy?`<div><span>By</span><strong>${maintEsc(m.contractorPaidBy)}</strong></div>`:''}
      </div>
      <button type="button" class="btn-outline nestiq-payout-pay-btn" onclick="event.stopPropagation();nestiqMaintDownloadPayoutReceipt(${typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(payId):JSON.stringify(String(payId))})">Download receipt</button>
    </div>`;
  }
  return `<div class="nestiq-payout-card ${canPay?'nestiq-payout-card--due':''}">
    <div class="nestiq-payout-head">
      <div class="nestiq-payout-icon" aria-hidden="true">${amount>0?'💸':'🧾'}</div>
      <div>
        <div class="nestiq-payout-kicker">Contractor payout</div>
        <div class="nestiq-payout-title">${amount>0?'Awaiting payment':'No invoice amount'}</div>
      </div>
    </div>
    <div class="nestiq-payout-amount">${maintEsc(nestiqMaintFormatZar(amount))}</div>
    <div class="nestiq-payout-payee">
      <div class="nestiq-payout-av">${maintEsc(av)}</div>
      <div>
        <div class="nestiq-payout-payee-name">${maintEsc(payee.name)}</div>
        <div class="nestiq-payout-payee-bank">${bankLine?maintEsc(bankLine):'Add bank details on the vendor profile to show them here'}</div>
      </div>
    </div>
    ${canPay?`<button type="button" class="btn-gold nestiq-payout-pay-btn" onclick="nestiqMaintPayContractor(${typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(payId):JSON.stringify(String(payId))})">Pay ${maintEsc(payee.name)} ${maintEsc(nestiqMaintFormatZar(amount))}</button>
    <p class="nestiq-payout-secure">Secure in-app payment · A reference is issued when the transfer completes</p>`:''}
  </div>`;
}
window.nestiqMaintPayoutCardHtml=nestiqMaintPayoutCardHtml;

function nestiqMaintFindJobRecord(maintId){
  return nestiqFindMaint(maintId)
    || (window.caretakerMaintenance||[]).find(x=>String(x.id)===String(maintId)||String(x._id||'')===String(maintId))
    || (window.contractorJobs||[]).find(x=>String(x.id)===String(maintId)||String(x._id||'')===String(maintId))
    || null;
}

async function nestiqMaintPayContractor(maintId){
  const m=nestiqMaintFindJobRecord(maintId);
  if(!m){
    nestiqShowNotif?.('Job not found','error');
    return;
  }
  if(String(m.status||'')!=='done'){
    nestiqShowNotif?.('Pay the contractor after the job is completed','warning');
    return;
  }
  if(nestiqMaintContractorIsPaid(m)){
    nestiqShowNotif?.('This job is already marked as paid','info');
    return;
  }
  const amount=nestiqMaintJobAmount(m);
  if(!(amount>0)){
    nestiqShowNotif?.('This job has no amount to pay','warning');
    return;
  }
  if(typeof nestiqShowInAppPaymentModal!=='function'){
    nestiqShowNotif?.('Payment form failed to load. Refresh and try again.','error');
    return;
  }
  const payee=nestiqMaintPayeeMeta(m);
  const acc=nestiqMaintMaskAccount(payee.accountNumber);
  const loc=typeof nestiqMaintLocationMeta==='function'?nestiqMaintLocationMeta(m):{value:m.unit||'Common Area'};
  const locBit=loc.value?(loc.kind==='unit'?`Unit ${loc.value}`:loc.value):'';
  const desc=`${m.title||'Maintenance'} · ${m.property||''}${locBit?` · ${locBit}`:''}`;
  const role=window.__nestiqSession?.role==='caretaker'?'caretaker':'landlord';
  nestiqShowInAppPaymentModal({
    amount,
    kind:'payout',
    title:'Pay contractor',
    icon:'🛠️',
    description:desc,
    payeeName:payee.name,
    payeeBank:[payee.bankName, acc, payee.accountType].filter(Boolean).join(' · '),
    onDownloadReceipt:function(){
      if(typeof generateContractorPayoutPDF==='function') generateContractorPayoutPDF(m);
      else nestiqShowNotif?.('Receipt is not available','warning');
    },
    onSuccess:async function(ref){
      const actor=typeof landlordName!=='undefined'&&landlordName?String(landlordName):(window.__nestiqSession?.name||'Landlord');
      const now=typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString();
      m.contractorPaymentStatus='paid';
      m.contractorPaidAt=now;
      m.contractorPaidAmount=amount;
      m.contractorPaidRef=ref;
      m.contractorReceiptNo=(typeof genReceiptNo==='function'?genReceiptNo():('REC-'+new Date().getFullYear()+'-'+String(Math.floor(Math.random()*9000)+1000)));
      m.contractorPaidBy=actor;
      m.contractorPaidByRole=role;
      m.activityLog=nestiqMaintAppendActivity(m, 'paid', `${actor} paid ${payee.name} ${nestiqMaintFormatZar(amount)}`, actor);
      window._nqPayAfterClose=function(){
        if(role==='caretaker' && typeof renderCaretakerDashboard==='function'){
          try{ renderCaretakerDashboard(); }catch(_e){}
          return;
        }
        if(nestiqFindMaint(maintId)) nestiqOpenMaintDetail(maintId);
      };
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():(window.__nestiqSession?.landlordId||null);
      const db=window.nestiqDb;
      const docId=String(m._id||m.id);
      if(db&&lid){
        try{
          const fv=firebase.firestore.FieldValue;
          await window.nestiqFs.maintenance(db, lid).doc(docId).set({
            contractorPaymentStatus:'paid',
            contractorPaidAt:now,
            contractorPaidAmount:amount,
            contractorPaidRef:ref,
            contractorReceiptNo:m.contractorReceiptNo,
            contractorPaidBy:actor,
            contractorPaidByRole:role,
            activityLog:m.activityLog,
            updatedAt:fv.serverTimestamp()
          },{ merge:true });
        }catch(err){
          console.warn('NestIQ: contractor payout save', err);
          nestiqShowNotif?.('Payment recorded locally, but cloud save failed','warning');
        }
      }
      nestiqAfterCoreDataEdit?.();
      if(typeof renderKanban==='function'){
        try{ renderKanban(); }catch(_e){}
      }
      nestiqShowNotif?.(`Payment sent to ${payee.name}`,'success');
    }
  });
}
window.nestiqMaintPayContractor=nestiqMaintPayContractor;

function nestiqMaintDownloadPayoutReceipt(maintId){
  const m=nestiqMaintFindJobRecord(maintId);
  if(!m||!nestiqMaintContractorIsPaid(m)){
    nestiqShowNotif?.('No payout receipt yet','warning');
    return;
  }
  if(typeof generateContractorPayoutPDF==='function') generateContractorPayoutPDF(m);
  else nestiqShowNotif?.('Receipt is not available','warning');
}
window.nestiqMaintDownloadPayoutReceipt=nestiqMaintDownloadPayoutReceipt;

function maintEsc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function nestiqNewMaintCostDefaults(){
  return{
    estimatedCost:0,
    actualCost:0,
    vendorName:'',
    vendorPhone:'',
    vendorType:'',
    invoiceNumber:'',
    costLinkedExpenseId:null,
    quotedDate:'',
    completedDate:'',
    warrantyPeriod:'',
    vendorId:null,
    issueCategory:'Other',
    notes:''
  };
}

function nestiqKanbanCostHtml(m,colStatus){
  const est=Number(m.estimatedCost)||0;
  const act=nestiqMaintJobAmount(m);
  const chip=colStatus==='done'?nestiqMaintPayChipHtml(m):'';
  if(colStatus==='done'&&act>0){
    return `<div class="nestiq-kanban-cost">${chip}<span>Cost: ${nestiqMaintFormatZar(act)}</span></div>`;
  }
  if((colStatus==='open'||colStatus==='progress')&&est>0){
    return `<div class="nestiq-kanban-cost nestiq-kanban-cost--est"><span>Est: R${est.toLocaleString('en-ZA')}</span></div>`;
  }
  return chip?`<div class="nestiq-kanban-cost">${chip}</div>`:'';
}

function renderKanban(){
  const board=document.getElementById('kanbanBoard');
  if(!board) return;
  const colIds={open:'kanbanOpen',progress:'kanbanProgress',done:'kanbanDone'};
  if(window.nestiqMaintenanceLoading){
    board.innerHTML=Object.entries(maintCols).map(([status,col])=>`
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-title" style="color:${col.color}">${col.label}</div>
        <div id="${colIds[status]||''}"></div>
      </div>`).join('');
    nestiqShowSkeleton?.('kanbanOpen','card',2);
    nestiqShowSkeleton?.('kanbanProgress','card',1);
    nestiqShowSkeleton?.('kanbanDone','card',2);
    return;
  }
  board.innerHTML=Object.entries(maintCols).map(([status,col])=>{
    const cards=maintenanceData.filter(m=>m.status===status);
    const cardHtml=cards.length?cards.map(m=>{
      const mid=nestiqHtmlJsArg(m.id);
      const lock=nestiqMaintLandlordLockMeta(m);
      const locked=lock.locked;
      const statusBtns=locked
        ? nestiqMaintAwaitingHtml(m)
        : `<div style="display:flex;gap:6px">
              ${status!=='open'?`<button type="button" class="btn-outline btn-sm" style="padding:4px 10px;font-size:0.72rem" onclick="event.stopPropagation();moveMaint(${mid},'open')">← Back</button>`:''}
              ${status!=='done'?`<button type="button" class="btn-primary btn-sm" style="padding:4px 10px;font-size:0.72rem" onclick="event.stopPropagation();moveMaint(${mid},'${status==='open'?'progress':'done'}')">
                ${status==='open'?'Start →':'Resolve ✓'}</button>`:''}
            </div>`;
      return `
        <div class="kanban-card${locked?' is-contractor-locked is-landlord-locked':''}" draggable="${locked?'false':'true'}" data-maint-id="${maintEsc(String(m.id))}" data-status="${status}" data-landlord-locked="${locked?'1':'0'}" data-contractor-locked="${nestiqMaintIsContractorLocked(m)?'1':'0'}" style="cursor:pointer" title="${locked?maintEsc(lock.message):'Click to assign contractor / view details'}">
          <button type="button" class="card-edit-pencil card-edit-pencil--kanban" title="Edit" aria-label="Edit" data-nq-tip="Edit" onclick="event.stopPropagation();openEditMaintenanceModal(${mid})">✏</button>
          <div class="kanban-card-title">${m.title}</div>
          <div class="kanban-card-meta">📍 ${m.property}${(()=>{const loc=nestiqMaintLocationMeta(m); return loc.kind==='unit'?` · Unit ${loc.label}`:' · Common Area';})()} · ${m.date}</div>
          ${nestiqKanbanCostHtml(m,status)}
          ${maintenancePhotos[String(m.id)] ? `<div style="display:flex;justify-content:flex-end;margin-top:8px"><img src="${maintenancePhotos[String(m.id)]}" alt="Maintenance photo" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--border);cursor:pointer" onclick="event.stopPropagation();openPhotoLightbox(maintenancePhotos['${String(m.id)}'],'Maintenance Photo','${m.property} - ${m.title.replace(/'/g,"&#39;")}')"></div>` : ``}
          <div style="display:flex;justify-content:flex-end;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap">
            ${statusBtns}
          </div>
        </div>`;
    }).join(''):'';
    return `<div class="kanban-col" data-status="${status}">
      <div class="kanban-col-title" style="color:${col.color}">${col.label} <span class="kanban-count">${cards.length}</span></div>
      <div id="${colIds[status]||''}">${cardHtml}</div>
      <button class="kanban-add" onclick="openAddMaintModal('${status}')">+ Add card</button>
    </div>`;
  }).join('');
  const openCards=(maintenanceData||[]).filter(m=>m.status==='open');
  if(!openCards.length){
    nestiqShowEmptyState?.('kanbanOpen', { icon:'✅', title:'All clear!', message:'No open maintenance requests. Great news.' });
  }
  if(typeof nestiqStaggerChildren==='function'){
    board.querySelectorAll('.kanban-col').forEach(columnEl=>{
      nestiqStaggerChildren(columnEl, 45);
    });
  }
  nestiqBindKanbanDrag(board);
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
  if(window.__nestiqMaintView==='table') nestiqRenderMaintTable?.();
}

function nestiqBindKanbanDrag(board){
  if(!board) return;
  board.querySelectorAll('.kanban-card').forEach(el=>{
    const locked=el.getAttribute('data-landlord-locked')==='1'||el.getAttribute('data-contractor-locked')==='1'||el.getAttribute('draggable')==='false';
    if(!locked){
      el.addEventListener('dragstart', e=>{
        if(e.target.closest('button,a,input,select,textarea')){
          e.preventDefault();
          return;
        }
        el.classList.add('nq-dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain', el.getAttribute('data-maint-id')||'');
      });
      el.addEventListener('dragend', ()=>{
        el.classList.remove('nq-dragging');
        board.querySelectorAll('.kanban-col.drag-over').forEach(c=>c.classList.remove('drag-over'));
      });
    }else{
      el.addEventListener('dragstart', e=>{
        e.preventDefault();
      });
    }
    el.addEventListener('click', e=>{
      if(e.target.closest('button,a,input,select,textarea,img')) return;
      nestiqOpenMaintDetail(el.getAttribute('data-maint-id'));
    });
  });
  board.querySelectorAll('.kanban-col').forEach(col=>{
    col.addEventListener('dragover', e=>{
      e.preventDefault();
      col.classList.add('drag-over');
      if(e.dataTransfer) e.dataTransfer.dropEffect='move';
    });
    col.addEventListener('dragleave', e=>{
      if(col.contains(e.relatedTarget)) return;
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', e=>{
      e.preventDefault();
      col.classList.remove('drag-over');
      const id=e.dataTransfer?.getData('text/plain');
      const next=col.getAttribute('data-status');
      const card=board.querySelector(`.kanban-card[data-maint-id="${id}"]`);
      document.querySelectorAll('.kanban-card.nq-dragging').forEach(c=>c.classList.remove('nq-dragging'));
      if(card?.getAttribute('data-landlord-locked')==='1'||card?.getAttribute('data-contractor-locked')==='1') return;
      if(id && next && card?.getAttribute('data-status')!==next) moveMaint(id, next);
    });
  });
}

async function moveMaint(id, newStatus, opts){
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const labels={open:'Open',progress:'In Progress',done:'Resolved',cancelled:'Cancelled'};
  const prev=nestiqFindMaint(id);
  const blocked=nestiqMaintLandlordStatusBlocked(prev, newStatus, opts);
  if(blocked){
    nestiqShowNotif(blocked,'warning');
    return false;
  }
  const todayIso=new Date().toISOString().slice(0,10);
  if(window.nestiqUseFirestore&&window.nestiqDb){
    try{
      const patch={ status:newStatus };
      if(fv) patch.updatedAt=fv.serverTimestamp();
      if(newStatus==='done') patch.completedDate=new Date().toISOString().slice(0,10);
      const lid=window.nestiqCurrentLandlordUid?.();
      await window.nestiqFs.maintenance(window.nestiqDb, lid).doc(String(id)).update(patch);
      // Optimistically update the local board too, so the UI responds even if the
      // snapshot listener is a bit slow to reflect the remote write.
      maintenanceData=maintenanceData.map(m=>{
        if(String(m.id)!==String(id)) return m;
        const u={...m,status:newStatus};
        if(newStatus==='done'&&!String(u.completedDate||'').trim()) u.completedDate=todayIso;
        return u;
      });
      renderKanban();
      nestiqShowNotif(`🔧 Moved to ${labels[newStatus]||newStatus}`,'success');
      addBellNotif('🔧',`Maintenance updated to ${labels[newStatus]||newStatus}`);
      return true;
    }catch(err){
      console.warn('NestIQ: move maintenance failed', err);
      nestiqShowNotif(`Failed to update status${err?.message?`: ${err.message}`:''}`,'error');
      return false;
    }
  }
  maintenanceData=maintenanceData.map(m=>{
    if(String(m.id)!==String(id)) return m;
    const u={...m,status:newStatus};
    if(newStatus==='done'&&!String(u.completedDate||'').trim()) u.completedDate=todayIso;
    return u;
  });
  saveData();
  const updated=maintenanceData.find(m=>String(m.id)===String(id));
  if(updated) notifyTenantMaintenanceUpdate?.(updated);
  if(updated?.tenantId){
    const tenant=tenantsData.find(t=>t.id===updated.tenantId);
    const ask=confirm('Email tenant about maintenance update?');
    if(ask && tenant) sendMaintenanceUpdateEmail?.(tenant, updated, prev?.status||'', newStatus);
  }
  renderKanban();
  nestiqShowNotif(`🔧 Moved to ${labels[newStatus]||newStatus}`,'success');
  addBellNotif('🔧',`Maintenance updated to ${labels[newStatus]||newStatus}`);
  if(newStatus==='done'&&updated?.vendorId&&!(Number(updated.vendorRating)>=1&&Number(updated.vendorRating)<=5)){
    const vn=(vendors||[]).find(x=>Number(x.id)===Number(updated.vendorId))?.name||updated.vendorName||'vendor';
    addBellNotif('⭐',`Rate ${vn} for: ${updated.title}`, `nestiqOpenVendorRatingModal(${updated.id})`);
  }
  return true;
}
window.moveMaint=moveMaint;

function openAddMaintModal(status='open'){
  clearPendingMaintenancePhoto('landlord');
  document.getElementById('modalContent').innerHTML=`
    <div class="nestiq-report-issue">
      <h2 class="modal-title">New maintenance request</h2>
      <p class="modal-sub">Log the issue and attach a photo if you have one. Assign a contractor from the request details after it is created.</p>
      <div class="form-group"><label for="mt_title">Issue title</label><input class="form-input" id="mt_title" placeholder="e.g. Broken window"></div>
      <div class="form-group"><label for="mt_prop">Property</label>
        <select class="form-input" id="mt_prop" onchange="nestiqMaintRefreshAddLocationFields()">${propertiesData.map(p=>`<option>${p.name}</option>`).join('')}</select></div>
      <div id="mt_location_wrap">${nestiqMaintAddLocationInnerHtml(propertiesData[0]?.name||'', {locationType:'common'})}</div>
      <div class="form-group"><label for="mt_desc">Description</label><textarea class="form-input form-textarea" id="mt_desc" placeholder="Describe the issue..."></textarea></div>
      <div class="form-group"><label>Photo of the issue</label>
        <div id="maintUploadWrap">${uploadAreaHtml({id:'maintUploadArea',height:100,title:'Click to upload issue photo',sub:'JPG, PNG or WebP — optional, max 2MB',onClick:`pickMaintenancePhoto('landlord')`})}</div>
        <span class="nestiq-form-hint">Optional, but a photo helps the contractor prepare.</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn-outline btn-sm" onclick="runMaintAiAssess()" title="AI Powered" data-nq-tip="AI Powered">AI Assess</button>
        <span id="mtAiLoading" style="font-size:0.8rem;color:var(--muted);display:none">Thinking...</span>
      </div>
      <div id="mtAiResult" style="margin-top:8px"></div>
      ${typeof nestiqNewMaintVendorFieldsHtml==='function'?nestiqNewMaintVendorFieldsHtml():''}
      <button type="button" class="btn-gold nestiq-report-issue-submit" onclick="addMaintCard('${status}')">Add request</button>
    </div>`;
  document.querySelector('#modalOverlay .modal')?.classList.add('nestiq-report-issue-modal');
  nestiqOpenModalAnimated();
}

async function addMaintCard(status){
  const title=document.getElementById('mt_title').value.trim();
  if(!title){nestiqShowNotif('Enter a title','error');return;}
  const propName=document.getElementById('mt_prop').value;
  const prop=propertiesData.find(p=>p.name===propName);
  const vidRaw=document.getElementById('mt_vendor')?.value;
  const vid=vidRaw?String(vidRaw):'';
  const vPick=vid?(vendors||[]).find(x=>String(x.id)===vid):null;
  const base=nestiqNewMaintCostDefaults();
  if(vPick){
    base.vendorId=String(vPick.id);
    base.vendorName=vPick.name;
    base.vendorPhone=vPick.phone||'';
    base.vendorType=vPick.type||'';
  }
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const loc=nestiqMaintReadAddLocationFields();
  const actor=typeof landlordName!=='undefined'&&landlordName?String(landlordName):'Landlord';
  const row={
    title,
    property:propName,
    propertyId:prop?.id??null,
    tenantId:loc.tenantId,
    tenantName:loc.tenantName,
    locationType:loc.locationType,
    unit:loc.unit,
    priority:'Medium',
    reportedPriority:'Medium',
    urgency:'Medium',
    reportedBy:'landlord',
    reportedByRole:'landlord',
    status:status||'open',
    date:new Date().toLocaleDateString('en-ZA'),
    aiAssessment: window.__maintAiAssessment||null,
    landlordId:lid||undefined,
    ...base
  };
  if(fv) row.createdAt=fv.serverTimestamp();
  if(row.vendorId||row.vendorName){
    row.assignedAt=nestiqMaintNowIso();
    row.contractorStage='assigned';
    row.activityLog=nestiqMaintAppendActivity(row, 'assigned', `${actor} assigned job to ${row.vendorName||'contractor'}`, actor);
  }

  if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
    try{
      const lid=window.nestiqCurrentLandlordUid?.();
      const docRef=await nestiqAddMaintenanceRecord({ ...row, landlordId: lid });
      const id=docRef.id;
      if(typeof window.nestiqNotifyMaintenanceSubmitted === 'function'){
        window.nestiqNotifyMaintenanceSubmitted({ ...row, title, property: propName, priority: row.priority, description: title });
      }
      const photo=getPendingMaintenancePhoto('landlord');
      if(photo){
        let url=photo;
        if(typeof nestiqMaybeUploadPhoto==='function'){
          try{ url=await nestiqMaybeUploadPhoto(`maintenance/${id}/photo.jpg`,photo); }catch(_e){}
        }
        const persisted=typeof nestiqPhotoUrlForFirestore==='function'
          ? nestiqPhotoUrlForFirestore(url)
          : (String(url).startsWith('http') ? url : null);
        if(persisted){
          await docRef.set({ photoUrl:persisted }, { merge:true });
        }
        clearPendingMaintenancePhoto('landlord');
      }
      nestiqCloseModalAnimated();
      nestiqShowNotif('🔧 Request added!','success');
      addBellNotif('🔧',`New maintenance: ${title}`);
      return;
    }catch(err){
      console.error('Add maintenance',err);
      nestiqShowNotif('Failed to add request','error');
      return;
    }
  }

  const id=maintNextId++;
  maintenanceData.unshift({ ...row, id });
  const photo=getPendingMaintenancePhoto('landlord');
  if(photo){
    let url=photo;
    if(typeof nestiqMaybeUploadPhoto==='function'){
      try{ url=await nestiqMaybeUploadPhoto(`maintenance/${id}/photo.jpg`,photo); }catch(_e){}
    }
    maintenancePhotos[String(id)]=url;
    const pv=typeof nestiqPhotoUrlForFirestore==='function' ? nestiqPhotoUrlForFirestore(url) : (String(url).startsWith('http') ? url : null);
    if(pv) maintenanceData[0].photoUrl=pv;
    clearPendingMaintenancePhoto('landlord');
  }
  notifyLandlordMaintenanceRequest?.(maintenanceData[0]);
  saveData();
  nestiqCloseModalAnimated();
  renderKanban();
  nestiqShowNotif('🔧 Maintenance request added!','success');
  addBellNotif('🔧',`New maintenance: ${title}`);
}

async function runMaintAiAssess(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const desc=document.getElementById('mt_desc')?.value?.trim()||'';
  if(desc.length<20){ nestiqShowNotif('Description must be at least 20 characters','warning'); return; }
  const loading=document.getElementById('mtAiLoading');
  const out=document.getElementById('mtAiResult');
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="runMaintAiAssess"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Diagnosing...');
  if(loading) loading.style.display='inline';
  try{
    const propName=document.getElementById('mt_prop')?.value||'Property';
    const prop=propertiesData.find(p=>p.name===propName);
    const city=(String(prop?.addr||'').split(',').pop()||'').trim()||'South Africa';
    const data=await assessMaintenanceIssueAI({description:desc,type:prop?.type||'Property',city});
    if(!data?.ok){
      if(out) out.innerHTML=aiRawFallbackCard(data?.raw||'No AI response');
      return;
    }
    const v=data.data||{};
    window.__maintAiAssessment=v;
    if(out){
      out.innerHTML=`
        <div class="nestiq-maint-ai-card">
          <div style="font-size:0.82rem"><strong>Likely cause:</strong> ${v.cause||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Estimated cost:</strong> R${Number(v.costMin||0).toLocaleString()} - R${Number(v.costMax||0).toLocaleString()}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Trade required:</strong> ${v.tradeRequired||'None'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Fix timeframe:</strong> ${v.timeframe||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Landlord action:</strong> ${v.landlordAction||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Tenant action:</strong> ${v.tenantAction||'—'}</div>
          <div style="margin-top:10px"><button type="button" class="btn-gold btn-sm" onclick="addMaintCard('open')">Submit with AI assessment</button></div>
          ${aiAttribution()}
        </div>
      `;
    }
  }catch(_err){
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

window.runMaintAiAssess=runMaintAiAssess;

function nestiqMaintCostEditHtml(m){
  const catOpts=NESTIQ_MAINT_ISSUE_CATS.map(c=>`<option value="${maintEsc(c)}" ${(m.issueCategory||'Other')===c?'selected':''}>${maintEsc(c)}</option>`).join('');
  const assignHead=typeof nestiqVendorAssignmentHtml==='function'?nestiqVendorAssignmentHtml(m):`<div class="form-group"><label>Assigned vendor</label><select class="form-input" id="edit_m_vendor" onchange="nestiqOnMaintVendorPick()"><option value="">— Custom / none —</option>${(vendors||[]).filter(v=>v.active!==false).map(v=>`<option value="${v.id}" ${Number(m.vendorId)===Number(v.id)?'selected':''}>${maintEsc(v.name)} (${maintEsc(v.type)})</option>`).join('')}</select></div>`;
  const typeOpts=nestiqMaintTradeTypes().map(t=>`<option value="${maintEsc(t)}" ${(m.vendorType||'')===t?'selected':''}>${maintEsc(t)}</option>`).join('');
  const linked=m.costLinkedExpenseId?(expenses||[]).find(e=>String(e.id)===String(m.costLinkedExpenseId)):null;
  const linkLine=linked
    ? `<div style="font-size:0.8rem;color:var(--sage);margin-top:6px">Expense already linked — R${Number(linked.amount||0).toLocaleString('en-ZA')}</div>`
    : `<div style="font-size:0.8rem;color:var(--muted);margin-top:6px" id="edit_m_exp_link_hint">Link optional — creates a Maintenance expense from actual cost.</div>`;
  const toIso=v=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return v; const d=new Date(v); return String(d)==='Invalid Date'?'':d.toISOString().slice(0,10); };
  const qd=toIso(m.quotedDate);
  const cd=toIso(m.completedDate);
  return `
    <div class="form-group"><label>Issue category (reports)</label>
      <select class="form-input" id="edit_m_issue_cat">${catOpts}</select>
    </div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-weight:700;margin-bottom:10px">Cost tracking</div>
      ${assignHead}
      <div class="form-group"><label>Or vendor name (custom)</label>
        <input class="form-input" id="edit_m_vendor_custom" placeholder="Type if not in list" value="${maintEsc(m.vendorName||'')}">
      </div>
      <div class="form-group"><label>Vendor phone</label>
        <input class="form-input" id="edit_m_vendor_phone" value="${maintEsc(m.vendorPhone||'')}" placeholder="0xx xxx xxxx">
      </div>
      <div class="form-group"><label>Vendor type</label>
        <select class="form-input" id="edit_m_vendor_type">${typeOpts}</select>
      </div>
      <div class="form-group" id="edit_m_est_wrap"><label>Estimated cost (R)</label>
        <input class="form-input" id="edit_m_est" type="number" step="1" min="0" value="${Number(m.estimatedCost)||0}">
      </div>
      <div class="form-group" id="edit_m_actual_wrap" style="display:none"><label>Actual cost (R)</label>
        <input class="form-input" id="edit_m_actual" type="number" step="1" min="0" value="${Number(m.actualCost)||0}">
      </div>
      <div class="form-group"><label>Invoice number</label>
        <input class="form-input" id="edit_m_invoice" value="${maintEsc(m.invoiceNumber||'')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label>Quoted date</label>
          <input class="form-input" id="edit_m_quoted" type="date" value="${maintEsc(qd)}">
        </div>
        <div class="form-group" id="edit_m_completed_wrap" style="display:none"><label>Completed date</label>
          <input class="form-input" id="edit_m_completed" type="date" value="${maintEsc(cd)}">
        </div>
      </div>
      <div class="form-group" id="edit_m_warranty_wrap" style="display:none"><label>Warranty period</label>
        <input class="form-input" id="edit_m_warranty" placeholder="e.g. 3 months or 1 year" value="${maintEsc(m.warrantyPeriod||'')}">
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <button type="button" class="btn-outline btn-sm" onclick="nestiqLinkMaintToExpense(${m.id})" ${linked?'disabled':''} id="edit_m_link_exp_btn">Link to expense</button>
      </div>
      ${linkLine}
    </div>`;
}

function nestiqOnMaintVendorPick(){
  const sel=document.getElementById('edit_m_vendor');
  const id=sel&&sel.value?Number(sel.value):0;
  const v=(vendors||[]).find(x=>Number(x.id)===id);
  const ph=document.getElementById('edit_m_vendor_phone');
  const ty=document.getElementById('edit_m_vendor_type');
  const cu=document.getElementById('edit_m_vendor_custom');
  if(v){
    if(ph) ph.value=v.phone||'';
    if(ty) ty.value=nestiqMaintTradeTypes().includes(v.type)?v.type:'Other';
    if(cu) cu.value=v.name||'';
  }
}

function nestiqMaintCostVisibility(){
  const st=document.getElementById('edit_m_status')?.value||'open';
  const estW=document.getElementById('edit_m_est_wrap');
  const actW=document.getElementById('edit_m_actual_wrap');
  const compW=document.getElementById('edit_m_completed_wrap');
  const warW=document.getElementById('edit_m_warranty_wrap');
  if(estW) estW.style.display=(st==='open'||st==='progress')?'block':'none';
  if(actW) actW.style.display=st==='done'?'block':'none';
  if(compW) compW.style.display=st==='done'?'block':'none';
  if(warW) warW.style.display=st==='done'?'block':'none';
}

function nestiqApplyMaintCostFields(maintId){
  const m=maintenanceData.find(x=>String(x.id)===String(maintId));
  if(!m) return true;
  const root=document.getElementById('modalContent');
  const clearErr=()=>{
    if(!root) return;
    root.querySelectorAll('#edit_m_issue_cat,#edit_m_vendor,#edit_m_vendor_custom,#edit_m_vendor_phone,#edit_m_est,#edit_m_actual,#edit_m_completed').forEach(el=>{
      el.classList.remove('form-input-error');
      el.parentNode?.querySelectorAll('.field-error-msg').forEach(n=>n.remove());
    });
  };
  const err=(id,msg)=>{
    const inp=document.getElementById(id);
    if(!inp||!msg) return;
    inp.classList.add('form-input-error');
    const e=document.createElement('div');
    e.className='field-error-msg';
    e.style.cssText='font-size:0.75rem;color:var(--rust);margin-top:4px';
    e.textContent=msg;
    inp.parentNode.appendChild(e);
  };
  clearErr();
  const st=document.getElementById('edit_m_status')?.value||m.status;
  m.issueCategory=document.getElementById('edit_m_issue_cat')?.value||'Other';
  const vidRaw=document.getElementById('edit_m_vendor')?.value;
  m.vendorId=vidRaw?String(vidRaw):null;
  m.vendorPhone=document.getElementById('edit_m_vendor_phone')?.value?.trim()||'';
  m.vendorType=document.getElementById('edit_m_vendor_type')?.value||'';
  const customName=document.getElementById('edit_m_vendor_custom')?.value?.trim()||'';
  const vrec=m.vendorId?(vendors||[]).find(x=>Number(x.id)===Number(m.vendorId)):null;
  m.vendorName=(customName||vrec?.name||'').trim();
  m.invoiceNumber=document.getElementById('edit_m_invoice')?.value?.trim()||'';
  m.quotedDate=document.getElementById('edit_m_quoted')?.value?.trim()||'';
  m.completedDate=document.getElementById('edit_m_completed')?.value?.trim()||'';
  m.warrantyPeriod=document.getElementById('edit_m_warranty')?.value?.trim()||'';
  m.estimatedCost=Math.max(0,Number(document.getElementById('edit_m_est')?.value)||0);
  m.actualCost=Math.max(0,Number(document.getElementById('edit_m_actual')?.value)||0);
  if(st==='done'){
    if(!m.completedDate){ err('edit_m_completed','Required when resolved'); return false; }
    if(!m.actualCost||m.actualCost<=0){ err('edit_m_actual','Enter actual cost when resolving'); return false; }
  }
  return true;
}

function nestiqLinkMaintToExpense(maintId){
  const m=maintenanceData.find(x=>Number(x.id)===Number(maintId));
  if(!m) return;
  if(m.costLinkedExpenseId){
    nestiqShowNotif('Expense already linked','warning');
    return;
  }
  const act=Math.max(0,Number(m.actualCost)||0);
  const cd=String(m.completedDate||'').trim();
  if(!act||!cd){
    nestiqShowNotif('Set actual cost and completed date first','warning');
    return;
  }
  const vname=m.vendorName||(vendors||[]).find(v=>Number(v.id)===Number(m.vendorId))?.name||'Vendor';
  const eid=typeof expNextId==='number'?expNextId++:Date.now();
  const row={
    id:eid,
    cat:'Maintenance',
    desc:`${m.title} — ${vname}`,
    amount:act,
    prop:m.property||'',
    date:cd,
    maintId:m.id,
    vendorId:m.vendorId||null,
    invoiceNo:m.invoiceNumber||'',
    color:(typeof catColors!=='undefined'&&catColors.Maintenance)||'#c46a3a'
  };
  expenses.unshift(row);
  m.costLinkedExpenseId=String(eid);
  saveData();
  renderExpenses?.();
  nestiqShowNotif('Expense created and linked','success');
  openEditMaintenanceModal(m.id);
}

function destroyNestiqMaintCharts(){
  const o=window.__nestiqMaintCharts||{};
  Object.keys(o).forEach(k=>{ try{ o[k].destroy(); }catch(_e){} delete o[k]; });
  window.__nestiqMaintCharts=o;
}

function nestiqMaintDoneJobsThisYear(y){
  const yy=y||new Date().getFullYear();
  return(maintenanceData||[]).filter(m=>{
    if(m.status!=='done') return false;
    const iso=String(m.completedDate||'');
    if(/^\d{4}/.test(iso)) return iso.startsWith(String(yy));
    try{
      const p=new Date(m.date);
      return String(p)!=='Invalid Date'&&p.getFullYear()===yy;
    }catch(_e){ return false; }
  });
}

function renderMaintenanceCostAnalytics(){
  const y=new Date().getFullYear();
  const jobs=nestiqMaintDoneJobsThisYear(y).filter(m=>(Number(m.actualCost)||0)>0);
  const total=jobs.reduce((s,m)=>s+(Number(m.actualCost)||0),0);
  const stat=document.getElementById('maintCostYearTotal');
  if(stat) stat.textContent=`R${total.toLocaleString('en-ZA')}`;
  const byProp={};
  const byCat={};
  const byMonth=Array(12).fill(0);
  jobs.forEach(m=>{
    const p=m.property||'—';
    byProp[p]=(byProp[p]||0)+Number(m.actualCost);
    const c=m.issueCategory||'Other';
    byCat[c]=(byCat[c]||0)+Number(m.actualCost);
    const iso=String(m.completedDate||'');
    let mi=null;
    if(/^\d{4}-\d{2}/.test(iso)) mi=parseInt(iso.slice(5,7),10)-1;
    if(mi!=null&&mi>=0&&mi<12) byMonth[mi]+=Number(m.actualCost);
  });
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const textColor=dark?'rgba(240,236,228,0.5)':'rgba(14,17,23,0.4)';
  const gridColor=dark?'rgba(240,236,228,0.06)':'rgba(14,17,23,0.05)';
  const gold='#c9a84c',sage='#5a7a60',rust='#c46a3a',sky='#3a6b8a';
  const baseOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:textColor,font:{family:'DM Sans',size:11},boxWidth:12,padding:12}}}};
  destroyNestiqMaintCharts();
  window.__nestiqMaintCharts=window.__nestiqMaintCharts||{};
  const ChartRef=window.Chart;
  if(!ChartRef) return;
  const propEl=document.getElementById('maintCostByPropChart');
  if(propEl){
    const labels=Object.keys(byProp);
    const data=labels.map(k=>byProp[k]);
    window.__nestiqMaintCharts.byProp=new ChartRef(propEl,{
      type:'bar',
      data:{labels,datasets:[{label:`Spend ${y}`,data,backgroundColor:gold+'aa',borderColor:gold,borderWidth:1}]},
      options:{...baseOpts,scales:{x:{ticks:{color:textColor}},y:{grid:{color:gridColor},ticks:{color:textColor,callback:v=>'R'+(v>=1000?(v/1000).toFixed(0)+'k':v)}}}}
    });
  }
  const catEl=document.getElementById('maintCostByCatChart');
  if(catEl){
    const labels=Object.keys(byCat);
    const data=labels.map(k=>byCat[k]);
    const cols=[rust+'cc',gold+'cc',sky+'cc',sage+'cc','#9b7ebd'+'cc','#888'+'cc'];
    window.__nestiqMaintCharts.byCat=new ChartRef(catEl,{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:labels.map((_,i)=>cols[i%cols.length]),borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:textColor,font:{family:'DM Sans',size:10},boxWidth:10}}},cutout:'58%'}
    });
  }
  const lineEl=document.getElementById('maintCostByMonthChart');
  if(lineEl){
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    window.__nestiqMaintCharts.byMonth=new ChartRef(lineEl,{
      type:'line',
      data:{labels:months,datasets:[{label:'Maintenance spend',data:byMonth,borderColor:sage,backgroundColor:sage+'22',fill:true,tension:0.35}]},
      options:{...baseOpts,scales:{x:{ticks:{color:textColor}},y:{grid:{color:gridColor},ticks:{color:textColor,callback:v=>'R'+v}}}}
    });
  }
  const topBody=document.getElementById('maintCostTopJobsBody');
  if(topBody){
    const top=[...jobs].sort((a,b)=>(Number(b.actualCost)||0)-(Number(a.actualCost)||0)).slice(0,10);
    topBody.innerHTML=top.length?top.map(m=>`<tr><td>${maintEsc(m.title)}</td><td>${maintEsc(m.property||'—')}</td><td>R${Number(m.actualCost||0).toLocaleString('en-ZA')}</td><td>${maintEsc(String(m.completedDate||m.date||'').slice(0,10))}</td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--muted)">No completed jobs with costs this year.</td></tr>';
  }
  const vendBody=document.getElementById('maintCostVendorBody');
  if(vendBody){
    const rows=(vendors||[]).slice().sort((a,b)=>(b.totalCostBilled||0)-(a.totalCostBilled||0));
    vendBody.innerHTML=rows.length?rows.map(v=>{
      const avg=v.jobsCompleted>0?Math.round(v.totalCostBilled/v.jobsCompleted):0;
      const rr=Math.min(5,Math.max(0,Math.round(Number(v.rating)||0)));
      const stars='★'.repeat(rr)+'☆'.repeat(5-rr);
      return `<tr><td>${maintEsc(v.name)}</td><td>${v.jobsCompleted||0}</td><td>R${Number(v.totalCostBilled||0).toLocaleString('en-ZA')}</td><td>R${avg.toLocaleString('en-ZA')}</td><td style="color:var(--gold)">${stars}</td></tr>`;
    }).join(''):'<tr><td colspan="5" style="color:var(--muted)">No vendors yet.</td></tr>';
  }
  const accEl=document.getElementById('maintCostAccuracy');
  if(accEl){
    const pairs=jobs.filter(m=>{ const e=Number(m.estimatedCost)||0,a=Number(m.actualCost)||0; return e>0&&a>0; });
    if(!pairs.length) accEl.textContent='Not enough data (add estimates and actuals on completed jobs).';
    else{
      const pct=pairs.reduce((s,m)=>s+((Number(m.actualCost)-Number(m.estimatedCost))/Number(m.estimatedCost))*100,0)/pairs.length;
      accEl.textContent=`Average variance: ${pct>=0?'+':''}${pct.toFixed(1)}% vs estimate (across ${pairs.length} job${pairs.length===1?'':'s'}).`;
    }
  }
}

let __nestiqMaintChartsTabReady=false;
function nestiqChartsSwitchTab(tab){
  const p=document.getElementById('chartsPortfolioPanel');
  const m=document.getElementById('chartsMaintPanel');
  if(p) p.style.display=tab==='portfolio'?'block':'none';
  if(m) m.style.display=tab==='maint'?'block':'none';
  document.querySelectorAll('.charts-tab-btn').forEach(b=>{
    const on=b.getAttribute('data-charts-tab')===tab;
    b.classList.toggle('btn-primary',on);
    b.classList.toggle('btn-outline',!on);
  });
  if(tab==='maint'){
    if(!__nestiqMaintChartsTabReady) __nestiqMaintChartsTabReady=true;
    renderMaintenanceCostAnalytics();
  }
}

function nestiqInitChartsMaintenanceTab(){
  __nestiqMaintChartsTabReady=false;
}

function nestiqPropertyMaintSummaryHtml(propertyId){
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return '';
  const y=new Date().getFullYear();
  const rows=(maintenanceData||[]).filter(m=>String(m.propertyId)===String(p.id)||m.property===p.name);
  const openC=rows.filter(m=>m.status==='open').length;
  const progC=rows.filter(m=>m.status==='progress').length;
  const doneY=rows.filter(m=>{
    if(m.status!=='done') return false;
    const iso=String(m.completedDate||'');
    if(/^\d{4}/.test(iso)&&iso.startsWith(String(y))) return true;
    try{
      const d=new Date(m.date);
      return String(d)!=='Invalid Date'&&d.getFullYear()===y;
    }catch(_e){ return false; }
  });
  const totalY=doneY.reduce((s,m)=>s+(Number(m.actualCost)||0),0);
  const avg=doneY.length?Math.round(totalY/doneY.length):0;
  const last5=rows.slice().sort((a,b)=>String(b.date||b.completedDate||'').localeCompare(String(a.date||a.completedDate||''))).slice(0,5);
  const list=last5.map(m=>{
    const cls=m.status==='done'?'badge-green':m.status==='progress'?'badge-amber':'badge-red';
    const lb=m.status==='done'?'Resolved':m.status==='progress'?'In progress':'Open';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:0.8rem"><span>${maintEsc(m.title)}</span><span class="badge ${cls}">${lb}</span></div>`;
  }).join('');
  return `<div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--paper)">
    <div style="font-weight:700;margin-bottom:10px">Maintenance summary</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">
      <div>Open requests: <strong>${openC}</strong></div>
      <div>In progress: <strong>${progC}</strong></div>
      <div>Resolved this year: <strong>${doneY.length}</strong></div>
      <div>Total cost (${y}): <strong style="color:var(--gold)">R${totalY.toLocaleString('en-ZA')}</strong></div>
    </div>
    <div style="font-size:0.82rem;margin-top:8px">Average cost per completed job (${y}): <strong>R${avg.toLocaleString('en-ZA')}</strong></div>
    <div style="font-weight:600;margin:12px 0 6px;font-size:0.82rem">Last 5 requests</div>
    ${list||'<div style="color:var(--muted);font-size:0.8rem">None</div>'}
  </div>`;
}

function nestiqParseWarrantyEnd(completedIso,warrantyStr){
  if(!completedIso||!String(warrantyStr||'').trim()) return null;
  const d=new Date(completedIso);
  if(String(d)==='Invalid Date') return null;
  const s=String(warrantyStr).toLowerCase();
  const mo=s.match(/(\d+)\s*month/);
  const yr=s.match(/(\d+)\s*year/);
  const wk=s.match(/(\d+)\s*week/);
  const end=new Date(d);
  if(mo) end.setMonth(end.getMonth()+Number(mo[1]));
  else if(yr) end.setFullYear(end.getFullYear()+Number(yr[1]));
  else if(wk) end.setDate(end.getDate()+7*Number(wk[1]));
  else return null;
  return end;
}

window.nestiqMaintCostEditHtml=nestiqMaintCostEditHtml;
window.nestiqMaintCostVisibility=nestiqMaintCostVisibility;
window.nestiqOnMaintVendorPick=nestiqOnMaintVendorPick;
window.nestiqApplyMaintCostFields=nestiqApplyMaintCostFields;
window.nestiqLinkMaintToExpense=nestiqLinkMaintToExpense;
window.renderVendorsSection=function(){ nestiqRenderVendorList?.(); };
window.openVendorModal=function(id){ if(id!=null&&id!=='') nestiqOpenAddVendorModal(id); else nestiqOpenAddVendorModal(); };
window.deleteVendor=function(id){ nestiqDeleteVendorConfirm?.(id); };
window.nestiqChartsSwitchTab=nestiqChartsSwitchTab;
window.nestiqInitChartsMaintenanceTab=nestiqInitChartsMaintenanceTab;
window.nestiqPropertyMaintSummaryHtml=nestiqPropertyMaintSummaryHtml;
window.nestiqParseWarrantyEnd=nestiqParseWarrantyEnd;

function nestiqSwitchMaintView(view){
  const next=view==='table'?'table':'board';
  window.__nestiqMaintView=next;
  const board=document.getElementById('maintBoardWrap');
  const table=document.getElementById('maintTableWrap');
  const bChip=document.getElementById('maintViewBoard');
  const tChip=document.getElementById('maintViewTable');
  if(bChip) bChip.classList.toggle('active', next==='board');
  if(tChip) tChip.classList.toggle('active', next==='table');
  if(board) board.style.display=next==='table'?'none':'block';
  if(table) table.style.display=next==='table'?'block':'none';
  if(next==='table') nestiqRenderMaintTable();
  else renderKanban();
}
window.nestiqSwitchMaintView=nestiqSwitchMaintView;

function nestiqBindMaintTableClicks(){
  const body=document.getElementById('maintTableBody');
  if(!body||body.dataset.nqBound==='1') return;
  body.dataset.nqBound='1';
  body.addEventListener('click', e=>{
    const tr=e.target.closest('tr[data-maint-id]');
    if(!tr) return;
    nestiqOpenMaintDetail(tr.getAttribute('data-maint-id'));
  });
}

function nestiqRenderMaintTable(){
  const body=document.getElementById('maintTableBody');
  if(!body) return;
  if(window.nestiqMaintenanceLoading){
    body.innerHTML=`<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:28px">Loading requests…</td></tr>`;
    return;
  }
  const rows=(maintenanceData||[]).slice().sort((a,b)=>{
    const rank=m=>{
      const st=String(m.status||'open');
      if(st==='open') return 0;
      if(st==='progress') return 1;
      if(st==='done') return 2;
      if(st==='cancelled') return 3;
      return 4;
    };
    const d=rank(a)-rank(b);
    if(d) return d;
    return String(b.date||'').localeCompare(String(a.date||''));
  });
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:32px">No maintenance requests yet.</td></tr>`;
    return;
  }
  nestiqBindMaintTableClicks();
  body.innerHTML=rows.map(m=>{
    const cat=m.issueCategory||'Other';
    const ic=nestiqMaintCatMeta(cat).ic;
    const who=nestiqMaintReporterLabel(m);
    const initials=nestiqMaintInitials(who);
    const desc=nestiqMaintTrunc(m.description||m.title||'',72);
    const contractor=String(m.vendorName||'').trim()||'—';
    return `<tr class="nestiq-maint-table-row" data-maint-id="${maintEsc(String(m.id))}">
      <td><span class="nestiq-maint-cat-cell"><span class="nestiq-maint-cat-ic" aria-hidden="true">${ic}</span>${maintEsc(cat)}</span></td>
      <td>${maintEsc(m.property||'—')}</td>
      <td><span class="nestiq-maint-req"><span class="nestiq-maint-req-av" aria-hidden="true">${maintEsc(initials)}</span><span>${maintEsc(who||'—')}</span></span></td>
      <td class="nestiq-maint-desc-cell">${maintEsc(desc)}</td>
      <td>${maintEsc(contractor)}</td>
      <td>${nestiqMaintStatusPillHtml(m)}${nestiqMaintPayChipHtml(m)}</td>
    </tr>`;
  }).join('');
}
window.nestiqRenderMaintTable=nestiqRenderMaintTable;

function nestiqMaintVendorOptionsHtml(m){
  const cur=m&&m.vendorId!=null&&m.vendorId!==''?String(m.vendorId):'';
  const list=(vendors||[]).filter(v=>v&&(v.active!==false||(cur&&String(v.id)===cur)));
  const opts=list.map(v=>{
    const id=String(v.id);
    const sel=cur&&id===cur?'selected':'';
    return `<option value="${maintEsc(id)}" ${sel}>${maintEsc(v.name)} (${maintEsc(v.type||'Contractor')})</option>`;
  }).join('');
  return `<option value="">— None / unassign —</option>${opts}`;
}

function nestiqMaintDetailStatusOptionsHtml(m){
  const st=String(m?.status||'open');
  const key=st==='assigned'?'open':st;
  const opts=[
    ['open','Pending'],
    ['progress','In Progress'],
    ['done','Completed'],
    ['cancelled','Cancelled']
  ];
  return opts.map(([val,label])=>`<option value="${val}" ${key===val?'selected':''}>${label}</option>`).join('');
}

function nestiqOpenMaintDetail(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m) return;
  const mid=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(m.id):JSON.stringify(m.id);
  const cat=m.issueCategory||'Other';
  const ic=nestiqMaintCatMeta(cat).ic;
  const photo=nestiqMaintPhotoUrl(m);
  const who=nestiqMaintReporterLabel(m)||'—';
  const photoHtml=photo
    ? `<img class="nestiq-maint-detail-photo" src="${maintEsc(photo)}" alt="Issue photo" onclick="nestiqMaintOpenPhoto(${mid})">`
    : '';
  const lock=nestiqMaintLandlordLockMeta(m);
  const locked=lock.locked;
  const statusControls=`
      <select class="form-input" id="nestiqMaintDetailStatus" ${locked?'disabled':''} title="${locked?maintEsc(lock.message):''}" onchange="nestiqMaintDetailStatusChanged(${mid})">${nestiqMaintDetailStatusOptionsHtml(m)}</select>
      ${locked?`<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">${nestiqMaintAwaitingHtml(m)}</div>
      <p style="font-size:0.78rem;color:var(--muted);margin:8px 0 0">${maintEsc(lock.message)}</p>`:''}
      <div class="nestiq-maint-detail-actions" style="margin-top:8px">
        <button type="button" class="btn-gold btn-sm" onclick="nestiqMaintUpdateStatus(${mid})" ${locked?'disabled':''} title="${locked?maintEsc(lock.message):''}">Update Status</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqMaintCancelJob(${mid})">Cancel request</button>
      </div>`;
  const host=document.getElementById('modalContent');
  if(!host) return;
  host.innerHTML=`
    <h2 class="modal-title">Maintenance Request</h2>
    <p class="modal-sub">${maintEsc(m.title||cat)}</p>
    <div class="nestiq-maint-detail-meta">
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Category</div><div>${ic} ${maintEsc(cat)}</div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Property</div><div>${maintEsc(m.property||'—')}</div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">${maintEsc(nestiqMaintLocationMeta(m).field)}</div><div>${maintEsc(nestiqMaintLocationMeta(m).value)}</div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Tenant</div><div>${maintEsc(m.tenantName||'—')}</div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Reported By</div><div class="nestiq-maint-req"><span class="nestiq-maint-req-av" aria-hidden="true">${maintEsc(nestiqMaintInitials(who==='—'?'':who))}</span><span>${maintEsc(who)}</span></div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Reported</div><div>${maintEsc(nestiqMaintFormatStamp(m.createdAt||m.date)||m.date||'—')}</div></div>
      <div class="nestiq-maint-detail-field"><div class="nestiq-maint-detail-label">Status</div><div>${nestiqMaintStatusPillHtml(m)}</div></div>
    </div>
    ${nestiqMaintVisitBannerHtml(m)}
    <div class="nestiq-maint-detail-field" style="margin-top:12px">
      <div class="nestiq-maint-detail-label">Problem</div>
      <div style="font-size:0.88rem;line-height:1.55;white-space:pre-wrap">${maintEsc(m.description||m.title||'—')}</div>
    </div>
    ${photoHtml?`<div style="margin-top:12px">${photoHtml}</div>`:''}
    ${m.pendingLandlordApproval?`
    <div class="nestiq-maint-detail-field" style="margin-top:14px;padding:12px;border:1px solid var(--gold);border-radius:10px;background:rgba(201,168,76,0.08)">
      <div class="nestiq-maint-detail-label">Pending landlord approval</div>
      <div style="font-size:0.88rem;margin-top:4px">
        Caretaker proposed <strong>${maintEsc(m.proposedVendorName||'a contractor')}</strong>
        at <strong>R${Number(m.proposedEstimatedCost||0).toLocaleString('en-ZA')}</strong>
        ${m.proposedByName?` (by ${maintEsc(m.proposedByName)})`:''}.
      </div>
      <div class="nestiq-maint-detail-actions" style="margin-top:10px">
        <button type="button" class="btn-primary btn-sm" onclick="nestiqMaintApproveCaretakerAssignment(${mid})">Approve assignment</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqMaintRejectCaretakerAssignment(${mid})">Reject</button>
      </div>
    </div>`:''}
    <div class="nestiq-maint-detail-field" style="margin-top:14px">
      <div class="nestiq-maint-detail-label">Contractor</div>
      <select class="form-input" id="nestiqMaintDetailVendor" ${m.pendingLandlordApproval?'disabled':''}>${nestiqMaintVendorOptionsHtml(m)}</select>
      <p class="nestiq-form-hint">Assigning a contractor marks this request as Assigned. Use Status below only when work starts or finishes.</p>
      <div class="nestiq-maint-detail-actions" style="margin-top:8px">
        <button type="button" class="btn-gold btn-sm" onclick="nestiqMaintAssignContractor(${mid})" ${m.pendingLandlordApproval?'disabled':''}>${nestiqMaintHasVendor(m)?'Save contractor':'Assign contractor'}</button>
      </div>
    </div>
    <div class="nestiq-maint-detail-field" style="margin-top:12px">
      <div class="nestiq-maint-detail-label">Status</div>
      ${statusControls}
    </div>
    ${m.completionNotes||(Array.isArray(m.partsLines)&&m.partsLines.length)||m.actualCost?`
    <div class="nestiq-maint-detail-field" style="margin-top:12px">
      <div class="nestiq-maint-detail-label">Work completed</div>
      ${m.completionNotes?`<div style="font-size:0.88rem;line-height:1.55;white-space:pre-wrap">${maintEsc(m.completionNotes)}</div>`:''}
      ${Array.isArray(m.partsLines)&&m.partsLines.length?`<div style="margin-top:8px;font-size:0.84rem">${m.partsLines.map((p,i)=>`<div>${i+1}. ${maintEsc(p.name||'Part')} — R${Number(p.cost||0).toLocaleString('en-ZA')}</div>`).join('')}</div>`:''}
      ${m.partsUsed&&!(m.partsLines||[]).length?`<div style="margin-top:8px;font-size:0.84rem">Parts: ${maintEsc(m.partsUsed)}</div>`:''}
      <div style="margin-top:8px;font-size:0.86rem">
        ${m.partsCost!=null?`<div>Parts: R${Number(m.partsCost||0).toLocaleString('en-ZA')}</div>`:''}
        ${m.labourCost!=null?`<div>Labour: R${Number(m.labourCost||0).toLocaleString('en-ZA')}</div>`:''}
        ${m.actualCost!=null?`<div style="font-weight:700">Total: R${Number(m.actualCost||0).toLocaleString('en-ZA')}</div>`:''}
      </div>
      ${Array.isArray(m.completionPhotos)&&m.completionPhotos.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${m.completionPhotos.map(p=>`<div><div style="font-size:0.7rem;color:var(--muted)">${maintEsc(p.kind||'Photo')}</div><img src="${maintEsc(p.url||'')}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></div>`).join('')}</div>`:''}
      ${!(m.completionPhotos&&m.completionPhotos.length)&&m.completionPhotoUrl?`<div style="margin-top:10px"><img src="${maintEsc(m.completionPhotoUrl)}" alt="Completion photo" style="max-width:100%;max-height:180px;object-fit:cover;border-radius:8px"></div>`:''}
    </div>`:''}
    ${String(m.status||'')==='done'&&nestiqMaintHasVendor(m)?nestiqMaintPayoutCardHtml(m,{canPay:true}):''}
    ${nestiqMaintTimelineHtml(m)}
    ${nestiqMaintActivityHtml(m)}
    ${m.declineReason?`<div class="nestiq-maint-detail-field" style="margin-top:12px"><div class="nestiq-maint-detail-label">Last decline</div><div style="font-size:0.88rem">${maintEsc(m.declineReason)}${m.declineNotes?` — ${maintEsc(m.declineNotes)}`:''}</div></div>`:''}
    <div class="nestiq-maint-detail-field" style="margin-top:12px">
      <div class="nestiq-maint-detail-label">Notes</div>
      <textarea class="form-input form-textarea" id="nestiqMaintDetailNotes" rows="3" placeholder="Internal notes…">${maintEsc(m.notes||'')}</textarea>
      <div class="nestiq-maint-detail-actions" style="margin-top:8px">
        <button type="button" class="btn-outline btn-sm" onclick="nestiqMaintSaveNotes(${mid})">Save Notes</button>
      </div>
    </div>
    <div class="nestiq-maint-detail-actions" style="margin-top:16px">
      <button type="button" class="btn-outline btn-sm" onclick="openEditMaintenanceModal(${mid})">Full edit</button>
    </div>`;
  document.querySelector('#modalOverlay .modal')?.classList.add('modal-wide');
  if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
  else document.getElementById('modalOverlay')?.classList.add('open');
}
window.nestiqOpenMaintDetail=nestiqOpenMaintDetail;

function nestiqMaintOpenPhoto(maintId){
  const m=nestiqFindMaint(maintId);
  const url=nestiqMaintPhotoUrl(m);
  if(!url) return;
  if(typeof nestiqOpenLightbox==='function'){
    nestiqOpenLightbox([{base64:url, caption:m.title||'Maintenance photo'}], 0);
    return;
  }
  openPhotoLightbox?.(url, m.title||'Maintenance photo', m.property||'');
}
window.nestiqMaintOpenPhoto=nestiqMaintOpenPhoto;

function nestiqMaintDetailStatusChanged(maintId){
  const m=nestiqFindMaint(maintId);
  const sel=document.getElementById('nestiqMaintDetailStatus');
  if(!sel) return;
  const lock=nestiqMaintLandlordLockMeta(m);
  if(lock.locked){
    sel.disabled=true;
    sel.value=String(m?.status==='assigned'?'open':(m?.status||'open'));
    nestiqShowNotif?.(lock.message,'warning');
  }
}
window.nestiqMaintDetailStatusChanged=nestiqMaintDetailStatusChanged;

async function nestiqMaintAssignContractor(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m) return;
  const vid=document.getElementById('nestiqMaintDetailVendor')?.value;
  const currentlyAssigned=!!(m.vendorId!=null&&m.vendorId!=='');
  if(!vid){
    if(!currentlyAssigned){
      nestiqShowNotif?.('Select a contractor first','warning');
      return;
    }
    m.vendorId=null;
    m.vendorName='';
    m.vendorPhone='';
    m.vendorType='';
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(db&&lid){
      try{
        const fv=firebase.firestore.FieldValue;
        await window.nestiqFs.maintenance(db, lid).doc(String(m.id)).set({
          vendorId:null,
          vendorName:'',
          vendorPhone:'',
          vendorType:'',
          contractorStage:'',
          updatedAt:fv.serverTimestamp()
        },{ merge:true });
      }catch(err){
        console.warn('NestIQ: unassign contractor Firestore write', err);
        nestiqShowNotif?.('Unassigned locally, but cloud save failed. Check your connection.','warning');
      }
    }
    nestiqAfterCoreDataEdit?.();
    nestiqShowNotif?.('Contractor unassigned','success');
    nestiqOpenMaintDetail(m.id);
    return;
  }
  const v=(vendors||[]).find(x=>String(x.id)===String(vid));
  if(!v){
    nestiqShowNotif?.('Contractor not found','error');
    return;
  }
  const vendorId=String(v.id);
  const actor=typeof landlordName!=='undefined'&&landlordName?String(landlordName):'Landlord';
  m.vendorId=vendorId;
  m.vendorName=v.name||'';
  m.vendorPhone=v.phone||'';
  m.vendorType=v.type||'';
  m.assignedAt=typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString();
  m.contractorStage='assigned';
  m.contractorAcceptedAt=null;
  m.contractorStartedAt=null;
  m.declineReason='';
  m.declineNotes='';
  m.activityLog=nestiqMaintAppendActivity(m, 'assigned', `${actor} assigned job to ${m.vendorName||'contractor'}`, actor);
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(db&&lid){
    try{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(db, lid).doc(String(m.id)).set({
        vendorId,
        vendorName:m.vendorName,
        vendorPhone:m.vendorPhone,
        vendorType:m.vendorType,
        assignedAt:m.assignedAt,
        contractorStage:'assigned',
        contractorAcceptedAt:null,
        contractorStartedAt:null,
        declineReason:'',
        declineNotes:'',
        activityLog:m.activityLog,
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: assign contractor Firestore write', err);
      nestiqShowNotif?.('Assigned locally, but cloud save failed. Check your connection.','warning');
    }
  }
  nestiqAfterCoreDataEdit?.();
  nestiqShowNotif?.(`${m.vendorName||'Contractor'} assigned — the request is now Assigned`,'success');
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintAssignContractor=nestiqMaintAssignContractor;

async function nestiqMaintApproveCaretakerAssignment(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m||!m.pendingLandlordApproval) return;
  const vendorId=String(m.proposedVendorId||'');
  if(!vendorId){
    nestiqShowNotif?.('No proposed contractor on this request','error');
    return;
  }
  m.vendorId=vendorId;
  m.vendorName=m.proposedVendorName||'';
  m.vendorType=m.proposedVendorType||'';
  m.estimatedCost=Number(m.proposedEstimatedCost||0)||0;
  m.pendingLandlordApproval=false;
  m.proposedVendorId=null;
  m.proposedVendorName=null;
  m.proposedVendorType=null;
  m.proposedEstimatedCost=null;
  const actor=typeof landlordName!=='undefined'&&landlordName?String(landlordName):'Landlord';
  m.assignedAt=typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString();
  m.contractorStage='assigned';
  m.activityLog=nestiqMaintAppendActivity(m, 'assigned', `${actor} approved assignment to ${m.vendorName||'contractor'}`, actor);
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(db&&lid){
    try{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(db, lid).doc(String(m.id)).set({
        vendorId,
        vendorName:m.vendorName,
        vendorType:m.vendorType,
        estimatedCost:m.estimatedCost,
        pendingLandlordApproval:false,
        proposedVendorId:null,
        proposedVendorName:null,
        proposedVendorType:null,
        proposedEstimatedCost:null,
        assignedAt:m.assignedAt,
        contractorStage:'assigned',
        activityLog:m.activityLog,
        approvedByLandlordAt:fv.serverTimestamp(),
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: approve caretaker assignment', err);
      nestiqShowNotif?.('Could not save approval to cloud','error');
      return;
    }
  }
  nestiqAfterCoreDataEdit?.();
  nestiqShowNotif?.('Caretaker assignment approved','success');
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintApproveCaretakerAssignment=nestiqMaintApproveCaretakerAssignment;

async function nestiqMaintRejectCaretakerAssignment(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m||!m.pendingLandlordApproval) return;
  m.pendingLandlordApproval=false;
  m.proposedVendorId=null;
  m.proposedVendorName=null;
  m.proposedVendorType=null;
  m.proposedEstimatedCost=null;
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(db&&lid){
    try{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(db, lid).doc(String(m.id)).set({
        pendingLandlordApproval:false,
        proposedVendorId:null,
        proposedVendorName:null,
        proposedVendorType:null,
        proposedEstimatedCost:null,
        rejectedByLandlordAt:fv.serverTimestamp(),
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: reject caretaker assignment', err);
      nestiqShowNotif?.('Could not save rejection to cloud','error');
      return;
    }
  }
  nestiqAfterCoreDataEdit?.();
  nestiqShowNotif?.('Caretaker proposal rejected','warning');
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintRejectCaretakerAssignment=nestiqMaintRejectCaretakerAssignment;

async function nestiqMaintUpdateStatus(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m) return;
  const sel=document.getElementById('nestiqMaintDetailStatus');
  const requested=sel?.value||m.status;
  if(requested==='assigned'){
    const vid=document.getElementById('nestiqMaintDetailVendor')?.value;
    if(vid && !nestiqMaintHasVendor(m)){
      await nestiqMaintAssignContractor(maintId);
      return;
    }
  }
  const blocked=nestiqMaintLandlordStatusBlocked(m, requested==='assigned'?'open':requested);
  if(blocked){
    if(sel) sel.disabled=true;
    nestiqShowNotif?.(blocked,'warning');
    return;
  }
  let next=requested||m.status||'open';
  if(next==='assigned') next='open';
  if(next!=='open'&&next!=='progress'&&next!=='done'&&next!=='cancelled') next='open';
  const ok=await moveMaint(m.id, next);
  if(ok===false) return;
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintUpdateStatus=nestiqMaintUpdateStatus;

async function nestiqMaintCancelJob(maintId){
  const ok=await moveMaint(maintId, 'cancelled');
  if(ok===false) return;
  nestiqOpenMaintDetail(maintId);
}
window.nestiqMaintCancelJob=nestiqMaintCancelJob;

function nestiqMaintSaveNotes(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m) return;
  m.notes=document.getElementById('nestiqMaintDetailNotes')?.value||'';
  nestiqAfterCoreDataEdit?.();
  nestiqShowNotif?.('Notes saved','success');
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintSaveNotes=nestiqMaintSaveNotes;

async function nestiqMaintSavePriority(maintId){
  const m=nestiqFindMaint(maintId);
  if(!m) return;
  const next=nestiqMaintReadPriorityInput('nestiqMaintDetailPriority')||nestiqMaintNormalizePriority(document.getElementById('nestiqMaintDetailPriority')?.value);
  const actor=typeof landlordName!=='undefined'&&landlordName?String(landlordName):'Landlord';
  nestiqMaintApplyOfficialPriority(m, next, actor, 'landlord');
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(db&&lid){
    try{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(db, lid).doc(String(m.id)).set({
        priority:m.priority,
        urgency:m.urgency,
        reportedPriority:m.reportedPriority,
        priorityReviewedBy:m.priorityReviewedBy||'',
        priorityReviewedByRole:m.priorityReviewedByRole||'landlord',
        priorityReviewedAt:m.priorityReviewedAt||null,
        activityLog:m.activityLog||[],
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: save priority', err);
      nestiqShowNotif?.('Could not save priority to cloud','error');
      return;
    }
  }
  nestiqAfterCoreDataEdit?.();
  nestiqShowNotif?.('Priority updated','success');
  nestiqOpenMaintDetail(m.id);
}
window.nestiqMaintSavePriority=nestiqMaintSavePriority;

function updateMaintenanceBadge(){
  const n=(maintenanceData||[]).filter(m=>m.status!=='done'&&m.status!=='cancelled').length;
  const text=n>99?'99+':String(n);
  const show=n>0?'inline-flex':'none';
  ['navMaintBadge','navMaintBadgeMobile'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.textContent=text;
    el.style.display=show;
  });
}
window.updateMaintenanceBadge=updateMaintenanceBadge;

