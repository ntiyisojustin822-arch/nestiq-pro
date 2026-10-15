/* Contractor Dashboard — modeled on tenant-dashboard.js */
(function(){

window.contractorJobs = window.contractorJobs || [];
const __nqStaggerSig={};
const __nqStaggerTimers={};
const DECLINE_REASONS=[
  'Not my specialization',
  "I'm unavailable",
  'Cannot reach the location',
  'Other'
];

function staggerIfNew(kidsEl, delay){
  if(!kidsEl || typeof nestiqStaggerChildren!=='function') return;
  if(!kidsEl.children||!kidsEl.children.length) return;
  const key=kidsEl.id||'anon';
  const sig=kidsEl.innerHTML;
  if(__nqStaggerSig[key]===sig) return;
  __nqStaggerSig[key]=sig;
  clearTimeout(__nqStaggerTimers[key]);
  __nqStaggerTimers[key]=setTimeout(()=>{
    const el=key==='anon'?kidsEl:document.getElementById(key);
    if(!el||!el.isConnected||!el.children.length) return;
    nestiqStaggerChildren(el, delay||45);
  }, 80);
}

function sess(){
  try{
    if(window.__nestiqSession) return window.__nestiqSession;
    return JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
  }catch(_e){ return null; }
}

function esc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}
function jobIdArg(j){
  return String(j?._id||j?.id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function nestiqSwitchContractorTab(tab){
  document.querySelectorAll('#contractorTabBar .tab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===tab);
  });
  document.querySelectorAll('#contractorTabContent .tenant-tab-page').forEach(p=>{
    p.classList.toggle('active', p.id==='cTab-'+tab);
  });
}
window.nestiqSwitchContractorTab=nestiqSwitchContractorTab;

function greetingText(){
  const h=new Date().getHours();
  if(h<12) return 'Good morning';
  if(h<17) return 'Good afternoon';
  return 'Good evening';
}

async function renderContractorDashboard(){
  const s=sess();
  if(!s||s.role!=='contractor') return;
  const greeting=document.getElementById('contractorGreeting');
  if(greeting) greeting.textContent=`${greetingText()}, ${s.name||'Contractor'}`;

  await loadContractorJobs();
  try{
    const lid=s?.landlordId;
    const db=window.nestiqDb;
    if(db&&lid&&!(window.landlordSettings?.emailjs?.publicKey&&window.landlordSettings?.emailjs?.serviceId)){
      const sref=window.nestiqFs?.settingsRef?.(db, lid)||db.collection('landlords').doc(lid).collection('profile').doc('settings');
      const ss=await sref.get();
      if(ss.exists&&typeof window.nestiqMergeSettingsPayload==='function'){
        window.nestiqMergeSettingsPayload(ss.data());
      }else if(ss.exists){
        const d=ss.data()||{};
        window.landlordSettings=window.landlordSettings||{};
        if(d.landlordSettings&&typeof d.landlordSettings==='object') Object.assign(window.landlordSettings, d.landlordSettings);
        else if(d.emailjs) Object.assign(window.landlordSettings, d);
      }
    }
  }catch(_e){}
  renderContractorHome();
  renderContractorJobsList();
  renderContractorCompleted();
  renderContractorProfile();
  updateJobsBadge();
}
window.renderContractorDashboard=renderContractorDashboard;

async function loadContractorJobs(){
  const s=sess();
  const db=window.nestiqDb;
  if(!db||!s?.landlordId) return;
  let vendorId=s.vendorId!=null&&s.vendorId!==''?String(s.vendorId):'';
  if(!vendorId){
    try{
      const acc=await window.nestiqFs.contractorAccount(db, s.uid||s.userId).get();
      if(acc&&acc.exists){
        vendorId=String(acc.data()?.vendorId||'');
        if(vendorId&&s) s.vendorId=vendorId;
      }
    }catch(_e){}
  }
  if(!vendorId){
    console.warn('NestIQ: contractor session has no vendorId');
    window.contractorJobs=[];
    return;
  }
  const col=window.nestiqFs.maintenance(db, s.landlordId);
  if(!col) return;
  const seen=new Set();
  const jobs=[];
  async function pull(val){
    try{
      const snap=await col.where('vendorId','==',val).get();
      snap.forEach(doc=>{
        if(seen.has(doc.id)) return;
        seen.add(doc.id);
        jobs.push({...doc.data(), _id:doc.id, id:doc.data()?.id||doc.id});
      });
    }catch(err){
      console.warn('NestIQ: contractor jobs query failed', val, err);
    }
  }
  await pull(vendorId);
  const n=Number(vendorId);
  if(Number.isFinite(n)&&String(n)===vendorId) await pull(n);
  window.contractorJobs=sortJobsNewestFirst(jobs);
}

function jobTimeMs(j){
  const toMs=v=>{
    if(v==null||v==='') return 0;
    if(typeof window.nestiqMaintToDate==='function'){
      const d=window.nestiqMaintToDate(v);
      if(d&&!Number.isNaN(d.getTime())) return d.getTime();
    }
    if(typeof v.toDate==='function'){
      try{ return v.toDate().getTime(); }catch(_e){}
    }
    if(typeof v.seconds==='number') return v.seconds*1000;
    const d=new Date(v);
    return Number.isNaN(d.getTime())?0:d.getTime();
  };
  return Math.max(
    toMs(j?.assignedAt),
    toMs(j?.createdAt),
    toMs(j?.date),
    toMs(j?.updatedAt),
    toMs(j?.contractorCompletedAt),
    toMs(j?.completedDate)
  );
}

function sortJobsNewestFirst(list){
  return (list||[]).slice().sort((a,b)=>{
    const diff=jobTimeMs(b)-jobTimeMs(a);
    if(diff) return diff;
    return String(b?._id||b?.id||'').localeCompare(String(a?._id||a?.id||''));
  });
}

function jobStage(j){
  if(typeof window.nestiqMaintContractorStage==='function') return window.nestiqMaintContractorStage(j);
  const st=String(j?.status||'open');
  if(st==='done') return 'completed';
  if(st==='progress') return 'progress';
  if(j?.contractorAcceptedAt||j?.contractorStage==='accepted') return 'accepted';
  if(st==='open'&&(j?.vendorName||(j?.vendorId!=null&&j.vendorId!==''))) return 'assigned';
  return st||'open';
}

function newJobs(){
  return sortJobsNewestFirst((window.contractorJobs||[]).filter(j=>jobStage(j)==='assigned'));
}
function inProgressJobs(){
  return sortJobsNewestFirst((window.contractorJobs||[]).filter(j=>{
    const st=jobStage(j);
    return st==='accepted'||st==='progress';
  }));
}
function activeJobs(){
  return sortJobsNewestFirst((window.contractorJobs||[]).filter(j=>{
    const st=jobStage(j);
    return st==='assigned'||st==='accepted'||st==='progress';
  }));
}
function completedJobs(){
  return sortJobsNewestFirst((window.contractorJobs||[]).filter(j=>jobStage(j)==='completed'||j.status==='done'));
}

function updateJobsBadge(){
  const badge=document.getElementById('cTabBadge-jobs');
  const count=activeJobs().length;
  if(badge){
    badge.textContent=String(count);
    badge.style.display=count>0?'':'none';
  }
}

function renderContractorHome(){
  const s=sess();
  const el=document.getElementById('cTab-home');
  if(!el) return;
  const nj=newJobs();
  const ip=inProgressJobs();
  const completed=completedJobs();
  const active=activeJobs();
  const unpaid=completed.filter(j=>{
    const paid=typeof nestiqMaintContractorIsPaid==='function'?nestiqMaintContractorIsPaid(j):!!j.contractorPaidAt;
    const amt=typeof nestiqMaintJobAmount==='function'?nestiqMaintJobAmount(j):(Number(j.actualCost)||0);
    return !paid && amt>0;
  });
  const unpaidAmt=unpaid.reduce((sum,j)=>sum+(typeof nestiqMaintJobAmount==='function'?nestiqMaintJobAmount(j):(Number(j.actualCost)||0)),0);
  const first=esc(String(s?.name||'Contractor').trim().split(/\s+/)[0]||'Contractor');
  el.innerHTML=`
    <div class="tenant-home">
      <header class="tenant-home-header">
        <div>
          <div class="tenant-home-kicker">Contractor portal</div>
          <h1 class="tenant-home-title">Welcome back, ${first}</h1>
          <p class="tenant-home-sub">Assigned jobs appear here newest first. Accept work, update progress, and wait for the landlord to mark payment.</p>
        </div>
      </header>
      <div class="tenant-quick-stats cols-3" id="cHomeStats">
        <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchContractorTab('jobs')">
          <span class="tenant-quick-stat-ico" data-nq-icon="inbox" data-nq-size="16"></span>
          <div class="tenant-quick-stat-val">${nj.length}</div>
          <div class="tenant-quick-stat-lbl">New jobs</div>
        </button>
        <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchContractorTab('jobs')">
          <span class="tenant-quick-stat-ico" data-nq-icon="wrench" data-nq-size="16"></span>
          <div class="tenant-quick-stat-val">${ip.length}</div>
          <div class="tenant-quick-stat-lbl">In progress</div>
        </button>
        <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchContractorTab('completed')">
          <span class="tenant-quick-stat-ico" data-nq-icon="circle-check" data-nq-size="16"></span>
          <div class="tenant-quick-stat-val">${completed.length}</div>
          <div class="tenant-quick-stat-lbl">Completed</div>
        </button>
      </div>
      ${unpaid.length?`<div class="nestiq-payout-home-note">You have ${unpaid.length} completed job${unpaid.length===1?'':'s'} awaiting payment${unpaidAmt>0?` · ${(typeof nestiqMaintFormatZar==='function'?nestiqMaintFormatZar(unpaidAmt):'R'+unpaidAmt.toLocaleString('en-ZA'))}`:''}.</div>`:''}
      <div class="tenant-section-card">
        <div class="tenant-section-title">Active jobs</div>
        ${active.length?`<div id="cHomeActiveJobs">${active.slice(0,5).map(j=>jobCardHtml(j)).join('')}</div>`
          :'<div class="tenant-empty-hint">No active jobs right now. New assignments from the landlord will show here.</div>'}
      </div>
    </div>`;
  try{ window.nestiqHydrateIcons?.(el); }catch(_e){}
}

function statusLabel(j){
  const st=jobStage(j);
  if(st==='assigned') return 'Assigned';
  if(st==='accepted') return 'Accepted';
  if(st==='progress') return 'In Progress';
  if(st==='completed') return 'Completed';
  return j.status||'—';
}

function statusBadge(j){
  const label=statusLabel(j);
  if(label==='Assigned') return '<span class="badge badge-amber">Assigned</span>';
  if(label==='Accepted') return '<span class="badge" style="background:rgba(58,107,138,0.12);color:var(--slate)">Accepted</span>';
  if(label==='In Progress') return '<span class="badge badge-blue" style="background:rgba(58,107,138,0.12);color:var(--slate)">In Progress</span>';
  if(label==='Completed') return '<span class="badge badge-green">Completed</span>';
  return `<span class="badge">${esc(label)}</span>`;
}

function priorityBadge(p){
  const pr=typeof nestiqMaintNormalizePriority==='function'?nestiqMaintNormalizePriority(p):String(p||'medium');
  if(pr==='Emergency') return '<span class="badge badge-red" style="font-size:0.68rem">Emergency</span>';
  if(pr==='High'||String(p||'').toLowerCase()==='urgent') return '<span class="badge badge-red" style="font-size:0.68rem">High</span>';
  if(pr==='Low') return '<span class="badge" style="font-size:0.68rem;background:var(--cream);color:var(--muted)">Low</span>';
  return '<span class="badge badge-amber" style="font-size:0.68rem">Medium</span>';
}

function categoryIcon(cat){
  const icons=window.NESTIQ_TRADE_ICONS||{};
  const trade=window.nestiqTradeForIssue?.(cat)||cat||'Other';
  return icons[trade]||icons.Other||'🔧';
}

function locationBits(j){
  const loc=typeof window.nestiqMaintLocationMeta==='function'
    ? window.nestiqMaintLocationMeta(j)
    : {kind:j.unit?'unit':'common', label:j.unit||'Common Area', field:j.unit?'Unit':'Location', value:j.unit||'Common Area'};
  return loc;
}

function jobCardHtml(j){
  const title=esc(j.title||j.issueCategory||'Maintenance Request');
  const prop=esc(j.property||'');
  const tenant=esc(j.tenantName||'');
  const s=sess();
  const landlordName=esc(s?.landlordName||j.landlordName||'');
  const id=jobIdArg(j);
  const icon=categoryIcon(j.issueCategory);
  const loc=locationBits(j);
  const locBit=loc.kind==='unit'?` · Unit ${esc(loc.label)}`:' · Common Area';
  const stamp=typeof window.nestiqMaintFormatStamp==='function'
    ? window.nestiqMaintFormatStamp(j.createdAt||j.date)
    : (j.date||'');
  const visitLine=typeof window.nestiqMaintVisitLabel==='function'?window.nestiqMaintVisitLabel(j):'';
  return`
    <div class="tenant-section-card" style="margin-bottom:10px;cursor:pointer;transition:box-shadow 0.15s" onclick="nestiqContractorOpenJob('${id}')" onmouseenter="this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:1.4rem">${icon}</span>
          <div>
            <div style="font-weight:600;font-size:0.95rem">${title}</div>
            <div style="font-size:0.82rem;color:var(--muted)">${prop}${locBit}${tenant?' · '+tenant:''}</div>
            ${landlordName?`<div style="font-size:0.76rem;color:var(--muted);margin-top:2px">Assigned by: ${landlordName}</div>`:''}
            <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">${esc(stamp)}</div>
            ${visitLine?`<div class="nestiq-visit-chip-mini">${esc(visitLine)}</div>`:''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${priorityBadge(typeof nestiqMaintOfficialPriority==='function'?nestiqMaintOfficialPriority(j):j.priority)} ${statusBadge(j)}${typeof nestiqMaintPayChipHtml==='function'?nestiqMaintPayChipHtml(j):''}</div>
      </div>
    </div>`;
}

function renderContractorJobsList(){
  const el=document.getElementById('cTab-jobs');
  if(!el) return;
  const jobs=activeJobs();
  if(!jobs.length){
    el.innerHTML='<div class="tenant-section-card"><p style="color:var(--muted)">No active jobs assigned to you right now.</p></div>';
    delete __nqStaggerSig.cJobsList;
    return;
  }
  el.innerHTML=`<div class="tenant-section-card">
    <div class="portal-card-title" style="margin-bottom:12px">Active Jobs (${jobs.length})</div>
    <div id="cJobsList">${jobs.map(j=>jobCardHtml(j)).join('')}</div>
  </div>`;
  staggerIfNew(el.querySelector('#cJobsList'));
}

function renderContractorCompleted(){
  const el=document.getElementById('cTab-completed');
  if(!el) return;
  const jobs=completedJobs();
  if(!jobs.length){
    el.innerHTML='<div class="tenant-section-card"><p style="color:var(--muted)">No completed jobs yet.</p></div>';
    delete __nqStaggerSig.cCompletedList;
    return;
  }
  el.innerHTML=`<div class="tenant-section-card">
    <div class="portal-card-title" style="margin-bottom:12px">Completed Jobs (${jobs.length})</div>
    <div id="cCompletedList">${jobs.map(j=>jobCardHtml(j)).join('')}</div>
  </div>`;
  staggerIfNew(el.querySelector('#cCompletedList'));
}

function renderContractorProfile(){
  const s=sess();
  const el=document.getElementById('cTab-profile');
  if(!el) return;
  el.innerHTML=`
    <div class="tenant-section-card">
      <div class="portal-card-title">Contractor Profile</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
        <div><div style="font-size:0.78rem;color:var(--muted)">Name</div><div style="font-weight:600">${esc(s?.name||'')}</div></div>
        <div><div style="font-size:0.78rem;color:var(--muted)">Email</div><div>${esc(s?.email||'')}</div></div>
      </div>
      <button type="button" class="btn-outline btn-sm" style="margin-top:18px" onclick="nestiqContractorLogout()">Sign Out</button>
    </div>`;
}

function partRowHtml(name, cost){
  return `<div class="cj-part-row">
    <input class="form-input cj-part-name" placeholder="Part name" value="${esc(name||'')}">
    <input class="form-input cj-part-cost" type="number" min="0" step="0.01" placeholder="0.00" value="${esc(cost||'')}" oninput="nestiqContractorUpdateTotal()">
    <button type="button" class="btn-outline btn-sm" onclick="this.closest('.cj-part-row').remove();nestiqContractorUpdateTotal()" aria-label="Remove part">×</button>
  </div>`;
}

function workFormHtml(j){
  const lines=Array.isArray(j.partsLines)&&j.partsLines.length?j.partsLines:[{name:j.partsUsed||'', cost:j.partsCost||''}];
  const labour=j.labourCost!=null?j.labourCost:'';
  return `
    <div class="nestiq-job-section">
      <div class="nestiq-job-section-title">Work</div>
      <div class="form-group"><label>What was done *</label>
        <textarea class="form-input" id="cj_done" rows="3" placeholder="e.g. Replaced damaged pipe and kitchen tap. Tested water pressure and confirmed there are no further leaks.">${esc(j.completionNotes||'')}</textarea>
      </div>
      <div class="form-group">
        <label>Parts used</label>
        <div id="cj_parts_list">${lines.map(p=>partRowHtml(p.name||p, p.cost)).join('')}</div>
        <button type="button" class="btn-outline btn-sm" style="margin-top:4px" onclick="nestiqContractorAddPart()">+ Add Part</button>
      </div>
      <div class="form-group"><label>Labour cost (R)</label>
        <input class="form-input" id="cj_labour_cost" type="number" min="0" step="0.01" placeholder="0.00" value="${esc(labour)}" oninput="nestiqContractorUpdateTotal()">
      </div>
      <div style="margin-top:8px">
        <div class="cj-cost-row"><span>Parts total</span><span id="cj_parts_total">R0.00</span></div>
        <div class="cj-cost-row"><span>Labour</span><span id="cj_labour_total">R0.00</span></div>
        <div class="cj-cost-row cj-cost-total"><span>Total cost</span><span id="cj_cost_display">R0.00</span></div>
      </div>
      <div class="form-group" style="margin-top:12px"><label>Before repair (optional)</label><input type="file" id="cj_photo_before" accept="image/*" class="form-input"></div>
      <div class="form-group"><label>After repair (optional)</label><input type="file" id="cj_photo_after" accept="image/*" class="form-input"></div>
      <div class="form-group"><label>More photos (optional)</label><input type="file" id="cj_photos_more" accept="image/*" multiple class="form-input"></div>
    </div>`;
}

function declinePanelHtml(j){
  const id=jobIdArg(j);
  return `<div id="cj_decline_panel" style="display:none;margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--paper)">
    <div class="form-group"><label>Reason for declining</label>
      ${DECLINE_REASONS.map((r,i)=>`<label style="display:flex;gap:8px;align-items:center;font-size:0.88rem;margin:6px 0"><input type="radio" name="cj_decline_reason" value="${esc(r)}" ${i===0?'checked':''}> ${esc(r)}</label>`).join('')}
    </div>
    <div class="form-group"><label>Details (required for Other)</label>
      <input class="form-input" id="cj_decline_notes" placeholder="Optional extra detail">
    </div>
    <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqContractorDeclineJob('${id}')">Confirm decline</button>
  </div>`;
}

function existingPhotosHtml(j){
  const photos=Array.isArray(j.completionPhotos)?j.completionPhotos:[];
  if(j.completionPhotoUrl&&!photos.length) photos.push({url:j.completionPhotoUrl, kind:'after'});
  if(!photos.length) return '';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${photos.map(p=>{
    const url=esc(p.url||p);
    const kind=esc(p.kind||'Photo');
    return `<div><div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">${kind}</div><img src="${url}" alt="${kind}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></div>`;
  }).join('')}</div>`;
}

function visitScheduleHtml(j, opts){
  const mode=(opts&&opts.mode)||'accept';
  const windows=typeof window.nestiqMaintVisitWindows==='function'?window.nestiqMaintVisitWindows():[
    {id:'morning', label:'Morning', hint:'08:00–12:00'},
    {id:'afternoon', label:'Afternoon', hint:'12:00–17:00'},
    {id:'anytime', label:'Anytime', hint:'During the day'}
  ];
  const today=typeof window.nestiqMaintTodayIso==='function'?window.nestiqMaintTodayIso():new Date().toISOString().slice(0,10);
  const cur=typeof window.nestiqMaintVisitDateIso==='function'?window.nestiqMaintVisitDateIso(j):String(j?.scheduledDate||'');
  const winId=String(j?.scheduledWindow||'anytime').toLowerCase();
  const chips=windows.map(w=>{
    const on=w.id===winId?'checked':'';
    return `<label class="nestiq-visit-window ${on?'is-on':''}">
      <input type="radio" name="cj_visit_window" value="${esc(w.id)}" ${on} onchange="nestiqContractorSyncVisitChips()">
      <span class="nestiq-visit-window-name">${esc(w.label)}</span>
      <span class="nestiq-visit-window-hint">${esc(w.hint)}</span>
    </label>`;
  }).join('');
  const kicker=mode==='accept'?'When will you visit?':'Need to change the day?';
  const copy=mode==='accept'
    ? 'Pick a date before you accept. The tenant is emailed as soon as you confirm.'
    : 'Update the date if plans change. The tenant gets a follow-up email.';
  return `<div class="nestiq-visit-panel">
    <div class="nestiq-visit-panel-kicker">${kicker}</div>
    <p class="nestiq-visit-panel-copy">${copy}</p>
    <div class="form-group" style="margin-bottom:12px">
      <label for="cj_visit_date">Visit date</label>
      <input class="form-input" type="date" id="cj_visit_date" min="${esc(today)}" value="${esc(cur)}">
    </div>
    <div class="nestiq-visit-window-label">Time window</div>
    <div class="nestiq-visit-windows" role="radiogroup">${chips}</div>
  </div>`;
}

function nestiqContractorSyncVisitChips(){
  document.querySelectorAll('.nestiq-visit-window').forEach(el=>{
    const on=!!el.querySelector('input[type="radio"]:checked');
    el.classList.toggle('is-on', on);
  });
}
window.nestiqContractorSyncVisitChips=nestiqContractorSyncVisitChips;

function readVisitFields(){
  const date=(document.getElementById('cj_visit_date')?.value||'').trim();
  const windowId=(document.querySelector('input[name="cj_visit_window"]:checked')?.value||'anytime').trim()||'anytime';
  const today=typeof window.nestiqMaintTodayIso==='function'?window.nestiqMaintTodayIso():new Date().toISOString().slice(0,10);
  if(!date){
    nestiqShowNotif?.('Choose the day you will visit.','warning');
    document.getElementById('cj_visit_date')?.focus();
    return null;
  }
  if(date<today){
    nestiqShowNotif?.('Visit date cannot be in the past.','warning');
    return null;
  }
  return {scheduledDate:date, scheduledWindow:windowId};
}

function nestiqContractorOpenJob(jobId){
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  if(!j) return;
  const mc=document.getElementById('modalContent');
  if(!mc) return;
  const title=esc(j.title||j.issueCategory||'Maintenance Request');
  const desc=esc(j.description||'').replace(/\n/g,'<br>');
  const prop=esc(j.property||'');
  const tenant=esc(j.tenantName||'');
  const loc=locationBits(j);
  const photo=j.photoUrl?`<div style="margin-top:12px"><img src="${esc(j.photoUrl)}" alt="Issue photo" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:cover"></div>`:'';
  const stage=jobStage(j);
  const id=jobIdArg(j);
  const reported=typeof window.nestiqMaintFormatStamp==='function'
    ? window.nestiqMaintFormatStamp(j.createdAt||j.date)
    : (j.date||'—');
  const activity=typeof window.nestiqMaintActivityHtml==='function'?window.nestiqMaintActivityHtml(j):'';
  const timeline=typeof window.nestiqMaintTimelineHtml==='function'?window.nestiqMaintTimelineHtml(j):'';

  let actions='';
  if(stage==='assigned'){
    actions=`
      ${visitScheduleHtml(j,{mode:'accept'})}
      <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:16px" onclick="nestiqContractorAcceptJob('${id}')">Accept &amp; notify tenant</button>
      <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqContractorToggleDecline()">Decline job</button>
      ${declinePanelHtml(j)}`;
  }else if(stage==='accepted'){
    actions=`
      ${typeof window.nestiqMaintVisitBannerHtml==='function'?window.nestiqMaintVisitBannerHtml(j):''}
      ${visitScheduleHtml(j,{mode:'reschedule'})}
      <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:16px" onclick="nestiqContractorStartJob('${id}')">Start job</button>
      <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqContractorSaveVisit('${id}')">Update visit date</button>
      <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqContractorToggleDecline()">Decline job</button>
      ${declinePanelHtml(j)}`;
  }else if(stage==='progress'){
    actions=`
      ${typeof window.nestiqMaintVisitBannerHtml==='function'?window.nestiqMaintVisitBannerHtml(j):''}
      ${visitScheduleHtml(j,{mode:'reschedule'})}
      <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqContractorSaveVisit('${id}')">Update visit date</button>
      ${workFormHtml(j)}`;
  }else if(stage==='completed'){
    const payout=typeof window.nestiqMaintPayoutCardHtml==='function'?window.nestiqMaintPayoutCardHtml(j,{canPay:false}):'';
    const total=typeof nestiqMaintJobAmount==='function'?nestiqMaintJobAmount(j):(Number(j.actualCost)||0);
    actions=`
      ${j.completionNotes?`<div class="nestiq-job-section"><div class="nestiq-job-section-title">What was done</div><div style="font-size:0.9rem;line-height:1.55;white-space:pre-wrap">${esc(j.completionNotes)}</div></div>`:''}
      ${existingPhotosHtml(j)}
      ${total>0?`<div class="nestiq-job-section"><div class="nestiq-job-section-title">Invoice total</div><div style="font-weight:700">${typeof nestiqMaintFormatZar==='function'?esc(nestiqMaintFormatZar(total)):'R'+Number(total).toLocaleString('en-ZA')}</div></div>`:''}
      ${payout}`;
  }

  mc.innerHTML=`
    <h2 class="modal-title" style="text-transform:uppercase">${title}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <span style="font-size:0.78rem;color:var(--muted)">Status:</span> ${statusBadge(j)}
      <span style="font-size:0.78rem;color:var(--muted);margin-left:6px">Priority:</span> ${priorityBadge(typeof nestiqMaintOfficialPriority==='function'?nestiqMaintOfficialPriority(j):j.priority)}
    </div>
    ${typeof nestiqMaintPriorityReviewNoteHtml==='function'?nestiqMaintPriorityReviewNoteHtml(j):''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.88rem;margin-bottom:12px">
      <div><span style="color:var(--muted)">Property:</span> ${prop||'—'}</div>
      <div><span style="color:var(--muted)">${esc(loc.field)}:</span> ${esc(loc.value)}</div>
      <div><span style="color:var(--muted)">Tenant:</span> ${tenant||'—'}</div>
      <div><span style="color:var(--muted)">Category:</span> ${esc(j.issueCategory||'—')}</div>
      <div><span style="color:var(--muted)">Reported:</span> ${esc(reported||'—')}</div>
      ${j.scheduledDate?`<div><span style="color:var(--muted)">Visit:</span> ${esc(typeof window.nestiqMaintVisitLabel==='function'?window.nestiqMaintVisitLabel(j):j.scheduledDate)}</div>`:''}
    </div>
    <div class="nestiq-job-section" style="margin-top:4px;padding-top:12px">
      <div class="nestiq-job-section-title">Problem</div>
      <div style="font-size:0.9rem;line-height:1.55">${desc||'<span style="color:var(--muted)">No description provided.</span>'}</div>
      ${photo}
    </div>
    ${actions}
    ${timeline}
    ${activity}
    ${stage==='progress'?`<button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:14px" onclick="nestiqContractorCompleteJob('${id}')">Mark as Completed</button>`:''}
    <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:10px" onclick="nestiqCloseModalAnimated()">Close</button>`;
  if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
  else document.getElementById('modalOverlay')?.classList.add('open');
  if(stage==='progress') nestiqContractorUpdateTotal();
  nestiqContractorSyncVisitChips();
}
window.nestiqContractorOpenJob=nestiqContractorOpenJob;

function nestiqContractorAddPart(){
  const host=document.getElementById('cj_parts_list');
  if(!host) return;
  host.insertAdjacentHTML('beforeend', partRowHtml('',''));
}
window.nestiqContractorAddPart=nestiqContractorAddPart;

function nestiqContractorToggleDecline(){
  const panel=document.getElementById('cj_decline_panel');
  if(!panel) return;
  panel.style.display=panel.style.display==='none'?'block':'none';
}
window.nestiqContractorToggleDecline=nestiqContractorToggleDecline;

function randStr(){
  return typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString();
}

function appendActivity(j, action, detail, actor){
  if(typeof window.nestiqMaintAppendActivity==='function') return window.nestiqMaintAppendActivity(j, action, detail, actor);
  const log=Array.isArray(j?.activityLog)?j.activityLog.slice():[];
  log.push({at:randStr(), action, detail:detail||'', actor:actor||''});
  return log;
}

async function patchJob(jobId, update, localAssign){
  const s=sess();
  const db=window.nestiqDb;
  if(!db||!s?.landlordId) return false;
  await window.nestiqFs.maintenance(db, s.landlordId).doc(jobId).update(update);
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  if(j) Object.assign(j, localAssign||update);
  return true;
}

async function notifyTenantVisit(job, reschedule){
  const s=sess();
  try{
    if(typeof window.nestiqEmailTenantContractorVisit!=='function') return 'no-config';
    return await window.nestiqEmailTenantContractorVisit(job,{
      reschedule:!!reschedule,
      contractorName:s?.name||job?.vendorName||'Contractor'
    });
  }catch(_e){
    return 'failed';
  }
}

function visitSaveResultMessage(mail, reschedule){
  if(mail==='sent') return reschedule?'Visit updated. The tenant has been emailed.':'Job accepted. The tenant has been emailed the visit date.';
  if(mail==='no-email') return reschedule?'Visit updated. Add the tenant email to notify them next time.':'Job accepted. The tenant will see the date in their portal.';
  if(mail==='no-config') return reschedule?'Visit updated. The tenant will see the new date in their portal.':'Job accepted. The tenant will see the date in their portal.';
  return reschedule?'Visit updated.':'Job accepted.';
}

async function saveContractorVisit(jobId, extraUpdate, localExtra, reschedule){
  const s=sess();
  const visit=readVisitFields();
  if(!visit) return false;
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  const actor=s?.name||'Contractor';
  const now=randStr();
  const label=typeof window.nestiqMaintVisitLabel==='function'
    ? window.nestiqMaintVisitLabel(visit)
    : `${visit.scheduledDate} · ${visit.scheduledWindow}`;
  const detail=reschedule?`${actor} rescheduled visit to ${label}`:`${actor} accepted job · visit ${label}`;
  const update={
    ...(extraUpdate||{}),
    scheduledDate:visit.scheduledDate,
    scheduledWindow:visit.scheduledWindow,
    scheduledAt:now,
    activityLog:appendActivity(j||{}, reschedule?'rescheduled':'accepted', detail, actor),
    updatedAt:now
  };
  await patchJob(jobId, update, {...update, ...(localExtra||{})});
  const fresh=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId))||{...j,...visit};
  const mail=await notifyTenantVisit(fresh, reschedule);
  if(mail==='sent'){
    try{ await patchJob(jobId, {visitNotifiedAt:now}, {visitNotifiedAt:now}); }catch(_e){}
  }
  nestiqShowNotif?.(visitSaveResultMessage(mail, reschedule),'success');
  return true;
}

async function nestiqContractorAcceptJob(jobId){
  const s=sess();
  const now=randStr();
  try{
    const ok=await saveContractorVisit(jobId,{
      contractorStage:'accepted',
      contractorAcceptedAt:now
    },{
      contractorStage:'accepted',
      contractorAcceptedAt:now
    }, false);
    if(!ok) return;
    try{
      sendBrowserNotif?.('Job Accepted',`${s?.name||'Contractor'} accepted: ${(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId))?.title||'maintenance request'}`,{tag:'contractor-accept-'+jobId});
      window.nestiqNotifyLandlordStaffAction?.(`${s?.name||'Contractor'} accepted: a maintenance request`,'maintenance');
    }catch(_e){}
    nestiqContractorOpenJob(jobId);
    renderContractorDashboard();
  }catch(err){
    console.warn('NestIQ: accept job failed', err);
    nestiqShowNotif?.('Failed to accept job: '+(err?.message||'unknown'),'error');
  }
}
window.nestiqContractorAcceptJob=nestiqContractorAcceptJob;

async function nestiqContractorSaveVisit(jobId){
  try{
    const ok=await saveContractorVisit(jobId, {}, {}, true);
    if(!ok) return;
    nestiqContractorOpenJob(jobId);
    renderContractorDashboard();
  }catch(err){
    console.warn('NestIQ: reschedule visit failed', err);
    nestiqShowNotif?.('Could not update visit date: '+(err?.message||'unknown'),'error');
  }
}
window.nestiqContractorSaveVisit=nestiqContractorSaveVisit;

async function nestiqContractorStartJob(jobId){
  const s=sess();
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  const actor=s?.name||'Contractor';
  const now=randStr();
  const update={
    status:'progress',
    contractorStage:'progress',
    contractorStartedAt:now,
    activityLog:appendActivity(j||{}, 'started', `${actor} started work`, actor)
  };
  try{
    await patchJob(jobId, update);
    nestiqShowNotif?.('Job started — status is now In Progress','success');
    try{
      sendBrowserNotif?.('Job Started',`${s?.name||'Contractor'} started: ${j?.title||'maintenance request'}`,{tag:'contractor-start-'+jobId});
    }catch(_e){}
    nestiqContractorOpenJob(jobId);
    renderContractorDashboard();
  }catch(err){
    console.warn('NestIQ: start job failed', err);
    nestiqShowNotif?.('Failed to start job: '+(err?.message||'unknown'),'error');
  }
}
window.nestiqContractorStartJob=nestiqContractorStartJob;

async function nestiqContractorDeclineJob(jobId){
  const s=sess();
  const reason=(document.querySelector('input[name="cj_decline_reason"]:checked')?.value||'').trim();
  const notes=(document.getElementById('cj_decline_notes')?.value||'').trim();
  if(!reason){
    nestiqShowNotif?.('Choose a reason for declining.','warning');
    return;
  }
  if(reason==='Other'&&!notes){
    nestiqShowNotif?.('Please add a short reason.','warning');
    return;
  }
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  const actor=s?.name||'Contractor';
  const now=randStr();
  const detail=`${actor} declined: ${reason}${notes?` — ${notes}`:''}`;
  const update={
    status:'open',
    contractorStage:'declined',
    contractorDeclinedAt:now,
    contractorAcceptedAt:null,
    contractorStartedAt:null,
    declineReason:reason,
    declineNotes:notes,
    vendorId:null,
    vendorName:'',
    vendorPhone:'',
    vendorType:'',
    scheduledDate:null,
    scheduledWindow:null,
    scheduledAt:null,
    visitNotifiedAt:null,
    activityLog:appendActivity(j||{}, 'declined', detail, actor)
  };
  try{
    await patchJob(jobId, update);
    window.contractorJobs=(window.contractorJobs||[]).filter(x=>String(x._id||x.id)!==String(jobId));
    nestiqShowNotif?.('Job declined. The landlord can reassign it.','success');
    try{
      sendBrowserNotif?.('Job Declined',`${actor} declined: ${j?.title||'maintenance request'} (${reason})`,{tag:'contractor-decline-'+jobId});
      window.nestiqNotifyLandlordStaffAction?.(`${actor} declined ${j?.title||'a job'}: ${reason}`,'maintenance');
    }catch(_e){}
    nestiqCloseModalAnimated?.();
    renderContractorDashboard();
  }catch(err){
    console.warn('NestIQ: decline job failed', err);
    nestiqShowNotif?.('Failed to decline job: '+(err?.message||'unknown'),'error');
  }
}
window.nestiqContractorDeclineJob=nestiqContractorDeclineJob;

function nestiqContractorReadParts(){
  const rows=[];
  document.querySelectorAll('#cj_parts_list .cj-part-row').forEach(row=>{
    const name=(row.querySelector('.cj-part-name')?.value||'').trim();
    const cost=parseFloat(row.querySelector('.cj-part-cost')?.value||'0')||0;
    if(name||cost) rows.push({name, cost});
  });
  return rows;
}

function nestiqContractorUpdateTotal(){
  const parts=nestiqContractorReadParts().reduce((s,p)=>s+(Number(p.cost)||0),0);
  const labour=parseFloat(document.getElementById('cj_labour_cost')?.value||'0')||0;
  const fmt=n=>`R${n.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const pEl=document.getElementById('cj_parts_total');
  const lEl=document.getElementById('cj_labour_total');
  const tEl=document.getElementById('cj_cost_display');
  if(pEl) pEl.textContent=fmt(parts);
  if(lEl) lEl.textContent=fmt(labour);
  if(tEl) tEl.textContent=fmt(parts+labour);
}
window.nestiqContractorUpdateTotal=nestiqContractorUpdateTotal;

function fileToCompressedDataUrl(file){
  return new Promise(resolve=>{
    if(!file){ resolve(''); return; }
    if(typeof compressImage==='function'){
      compressImage(file, 900, 0.78, b64=>resolve(b64||''));
      return;
    }
    const r=new FileReader();
    r.onload=()=>resolve(r.result||'');
    r.onerror=()=>resolve('');
    r.readAsDataURL(file);
  });
}

async function uploadMaintPhoto(jobId, file, suffix){
  if(!file) return '';
  const dataUrl=await fileToCompressedDataUrl(file);
  if(!dataUrl) return '';
  const path=`maintenance/${jobId}/${suffix}.jpg`;
  let url=dataUrl;
  if(typeof window.nestiqMaybeUploadPhoto==='function'){
    try{ url=await window.nestiqMaybeUploadPhoto(path, dataUrl); }catch(_e){}
  }
  const persisted=typeof nestiqPhotoUrlForFirestore==='function'
    ? nestiqPhotoUrlForFirestore(url)
    : (String(url||'').startsWith('http')?url:url);
  return persisted||'';
}

async function nestiqContractorCompleteJob(jobId){
  const s=sess();
  const db=window.nestiqDb;
  if(!db||!s?.landlordId) return;
  const done=(document.getElementById('cj_done')?.value||'').trim();
  if(!done){
    nestiqShowNotif?.('Please describe what was done before completing the job.','warning');
    return;
  }
  const partsLines=nestiqContractorReadParts();
  const partsCost=partsLines.reduce((sum,p)=>sum+(Number(p.cost)||0),0);
  const labourCost=parseFloat(document.getElementById('cj_labour_cost')?.value||'0')||0;
  const cost=partsCost+labourCost;
  const photos=[];
  try{
    const before=document.getElementById('cj_photo_before')?.files?.[0];
    const after=document.getElementById('cj_photo_after')?.files?.[0];
    const more=Array.from(document.getElementById('cj_photos_more')?.files||[]);
    if(before){
      const url=await uploadMaintPhoto(jobId, before, 'before-'+Date.now());
      if(url) photos.push({url, kind:'before', at:randStr()});
    }
    if(after){
      const url=await uploadMaintPhoto(jobId, after, 'after-'+Date.now());
      if(url) photos.push({url, kind:'after', at:randStr()});
    }
    for(let i=0;i<more.length;i++){
      const url=await uploadMaintPhoto(jobId, more[i], 'extra-'+Date.now()+'-'+i);
      if(url) photos.push({url, kind:'photo', at:randStr()});
    }
  }catch(_e){ console.warn('NestIQ: completion photo upload failed', _e); }
  const j=(window.contractorJobs||[]).find(x=>String(x._id||x.id)===String(jobId));
  const actor=s?.name||'Contractor';
  const now=randStr();
  const update={
    status:'done',
    contractorStage:'done',
    completedDate:new Date().toISOString().slice(0,10),
    contractorCompletedAt:now,
    partsCost,
    labourCost,
    actualCost:cost,
    completionNotes:done,
    partsUsed:partsLines.map(p=>p.name).filter(Boolean).join(', '),
    partsLines,
    completedByContractor:true,
    activityLog:appendActivity(j||{}, 'completed', `${actor} marked job completed`, actor)
  };
  if(photos.length){
    update.completionPhotos=photos;
    const after=photos.find(p=>p.kind==='after')||photos[photos.length-1];
    if(after?.url) update.completionPhotoUrl=after.url;
  }
  try{
    await window.nestiqFs.maintenance(db, s.landlordId).doc(jobId).update(update);
    if(j) Object.assign(j, update);
    nestiqShowNotif?.('Job marked as completed','success');
    try{
      sendBrowserNotif?.('Job Completed',`${s.name||'Contractor'} completed: ${j?.title||'maintenance request'} — R${cost.toFixed(2)}`,{tag:'contractor-complete-'+jobId});
      window.nestiqNotifyLandlordStaffAction?.(`${s?.name||'Contractor'} completed ${j?.title||'a job'} (R${cost.toFixed(2)})`,'maintenance');
    }catch(_e){}
    nestiqCloseModalAnimated?.();
    renderContractorDashboard();
  }catch(err){
    console.warn('NestIQ: complete job failed', err);
    nestiqShowNotif?.('Failed to complete job: '+(err?.message||'unknown'),'error');
  }
}
window.nestiqContractorCompleteJob=nestiqContractorCompleteJob;

})();
