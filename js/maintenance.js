function nestiqMaintTradeTypes(){
  return(Array.isArray(window.NESTIQ_TRADE_TYPES)&&window.NESTIQ_TRADE_TYPES.length)?window.NESTIQ_TRADE_TYPES:['Plumber','Electrician','General Handyman','Painter','Pest Control','Locksmith','Structural Engineer','Other'];
}
const NESTIQ_MAINT_ISSUE_CATS=[
  'Plumbing','Electrical','General Handyman','Painter','Pest Control','Locksmith','Structural Engineer','Structural','Appliance','Other'
];

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
    issueCategory:'Other'
  };
}

function nestiqKanbanCostHtml(m,colStatus){
  const est=Number(m.estimatedCost)||0;
  const act=Number(m.actualCost)||0;
  if(colStatus==='done'&&act>0){
    return `<div style="font-size:0.72rem;color:var(--sage);margin-top:4px;font-weight:600">Cost: R${act.toLocaleString('en-ZA')}</div>`;
  }
  if((colStatus==='open'||colStatus==='progress')&&est>0){
    return `<div style="font-size:0.72rem;color:var(--gold);margin-top:4px">Est: R${est.toLocaleString('en-ZA')}</div>`;
  }
  return '';
}

function renderKanban(){
  const board=document.getElementById('kanbanBoard');
  if(!board) return;
  board.innerHTML=Object.entries(maintCols).map(([status,col])=>{
    const cards=maintenanceData.filter(m=>m.status===status);
    const cardHtml=cards.length?cards.map(m=>{
      const mid=nestiqHtmlJsArg(m.id);
      return `
        <div class="kanban-card">
          <button type="button" class="card-edit-pencil card-edit-pencil--kanban" title="Edit" aria-label="Edit" onclick="event.stopPropagation();openEditMaintenanceModal(${mid})">✏</button>
          <div class="kanban-card-title">${m.title}</div>
          <div class="kanban-card-meta">📍 ${m.property} · ${m.date}</div>
          ${nestiqKanbanCostHtml(m,status)}
          ${maintenancePhotos[String(m.id)] ? `<div style="display:flex;justify-content:flex-end;margin-top:8px"><img src="${maintenancePhotos[String(m.id)]}" alt="Maintenance photo" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--border);cursor:pointer" onclick="event.stopPropagation();openPhotoLightbox(maintenancePhotos['${String(m.id)}'],'Maintenance Photo','${m.property} - ${m.title.replace(/'/g,"&#39;")}')"></div>` : ``}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <span class="badge" style="background:${priorityColors[m.priority]}22;color:${priorityColors[m.priority]}">${m.priority}</span>
            <div style="display:flex;gap:6px">
              ${status!=='open'?`<button class="btn-outline btn-sm" style="padding:4px 10px;font-size:0.72rem" onclick="moveMaint(${mid},'open')">← Back</button>`:''}
              ${status!=='done'?`<button class="btn-primary btn-sm" style="padding:4px 10px;font-size:0.72rem" onclick="moveMaint(${mid},'${status==='open'?'progress':'done'}')">
                ${status==='open'?'Start →':'Resolve ✓'}</button>`:''}
            </div>
          </div>
        </div>`;
    }).join(''):`<div style="text-align:center;padding:40px 20px;color:var(--muted);font-size:0.85rem">No requests</div>`;
    return `<div class="kanban-col">
      <div class="kanban-col-title" style="color:${col.color}">${col.label} <span class="kanban-count">${cards.length}</span></div>
      ${cardHtml}
      <button class="kanban-add" onclick="openAddMaintModal('${status}')">+ Add card</button>
    </div>`;
  }).join('');
  if(typeof nestiqStaggerChildren==='function'){
    board.querySelectorAll('.kanban-col').forEach(col=>{
      nestiqStaggerChildren(col, 45, '.kanban-card');
    });
  }
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
}

async function moveMaint(id, newStatus){
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  if(window.nestiqUseFirestore&&window.nestiqDb){
    try{
      const patch={ status:newStatus };
      if(fv) patch.updatedAt=fv.serverTimestamp();
      if(newStatus==='done') patch.completedDate=new Date().toISOString().slice(0,10);
      const lid=window.nestiqCurrentLandlordUid?.();
      await window.nestiqFs.maintenance(window.nestiqDb, lid).doc(String(id)).update(patch);
      const labels={open:'Open',progress:'In Progress',done:'Resolved'};
      showNotif(`🔧 Moved to ${labels[newStatus]}`,'success');
      addBellNotif('🔧',`Maintenance updated to ${labels[newStatus]}`);
      return;
    }catch(err){
      showNotif('Failed to update status','error');
      return;
    }
  }
  const prev=maintenanceData.find(m=>String(m.id)===String(id));
  const todayIso=new Date().toISOString().slice(0,10);
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
  const labels={open:'Open',progress:'In Progress',done:'Resolved'};
  showNotif(`🔧 Moved to ${labels[newStatus]}`,'success');
  addBellNotif('🔧',`Maintenance updated to ${labels[newStatus]}`);
  if(newStatus==='done'&&updated?.vendorId&&!(Number(updated.vendorRating)>=1&&Number(updated.vendorRating)<=5)){
    const vn=(vendors||[]).find(x=>Number(x.id)===Number(updated.vendorId))?.name||updated.vendorName||'vendor';
    addBellNotif('⭐',`Rate ${vn} for: ${updated.title}`, `nestiqOpenVendorRatingModal(${updated.id})`);
  }
}

function openAddMaintModal(status='open'){
  clearPendingMaintenancePhoto('landlord');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">New Maintenance Request</h2>
    <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Issue Title</label><input class="form-input" id="mt_title" placeholder="e.g. Broken window"></div>
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property</label>
      <select class="form-input" id="mt_prop">${propertiesData.map(p=>`<option>${p.name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Priority</label>
      <select class="form-input" id="mt_priority"><option>High</option><option>Medium</option><option>Low</option></select></div>
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Description</label><textarea class="form-input form-textarea" id="mt_desc" placeholder="Describe the issue..."></textarea></div>
    <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Attach a photo of the issue (optional)</label>
      <div id="maintUploadWrap">${uploadAreaHtml({id:'maintUploadArea',height:100,title:'Click to upload issue photo',sub:'JPG, PNG or WebP - max 2MB',onClick:`pickMaintenancePhoto('landlord')`})}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn-outline btn-sm" onclick="runMaintAiAssess()">AI Assess</button>
      <span id="mtAiLoading" style="font-size:0.8rem;color:var(--muted);display:none">Thinking...</span>
    </div>
    <div id="mtAiResult" style="margin-top:8px"></div>
    ${typeof nestiqNewMaintVendorFieldsHtml==='function'?nestiqNewMaintVendorFieldsHtml():''}
    <button class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="addMaintCard('${status}')">Add Request →</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function addMaintCard(status){
  const title=document.getElementById('mt_title').value.trim();
  if(!title){showNotif('Enter a title','error');return;}
  const propName=document.getElementById('mt_prop').value;
  const prop=propertiesData.find(p=>p.name===propName);
  const vidRaw=document.getElementById('mt_vendor')?.value;
  const vid=vidRaw?Number(vidRaw):null;
  const vPick=vid?(vendors||[]).find(x=>Number(x.id)===vid):null;
  const base=nestiqNewMaintCostDefaults();
  if(vPick){
    base.vendorId=vPick.id;
    base.vendorName=vPick.name;
    base.vendorPhone=vPick.phone||'';
    base.vendorType=vPick.type||'';
  }
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const row={
    title,
    property:propName,
    propertyId:prop?.id??null,
    tenantId:null,
    priority:document.getElementById('mt_priority').value,
    status:status||'open',
    date:new Date().toLocaleDateString('en-ZA'),
    aiAssessment: window.__maintAiAssessment||null,
    landlordId:lid||undefined,
    ...base
  };
  if(fv) row.createdAt=fv.serverTimestamp();

  if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
    try{
      const lid=window.nestiqCurrentLandlordUid?.();
      const docRef=await window.nestiqFs.maintenance(window.nestiqDb, lid).add({ ...row, landlordId: lid });
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
      closeModal();
      showNotif('🔧 Request added!','success');
      addBellNotif('🔧',`New maintenance: ${title}`);
      return;
    }catch(err){
      console.error('Add maintenance',err);
      showNotif('Failed to add request','error');
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
  closeModal();
  renderKanban();
  showNotif('🔧 Maintenance request added!','success');
  addBellNotif('🔧',`New maintenance: ${title}`);
}

async function runMaintAiAssess(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const desc=document.getElementById('mt_desc')?.value?.trim()||'';
  if(desc.length<20){ showNotif('Description must be at least 20 characters','warning'); return; }
  const loading=document.getElementById('mtAiLoading');
  const out=document.getElementById('mtAiResult');
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
    const urg=String(v.urgency||'Medium');
    const mapped=urg.toLowerCase().includes('emergency')||urg.toLowerCase().includes('high')?'High':urg.toLowerCase().includes('low')?'Low':'Medium';
    const pri=document.getElementById('mt_priority');
    if(pri) pri.value=mapped;
    window.__maintAiAssessment=v;
    if(out){
      const color=urg.toLowerCase().includes('emergency')?'#b3362f':urg.toLowerCase().includes('high')?'var(--rust)':urg.toLowerCase().includes('low')?'var(--sage)':'var(--gold)';
      out.innerHTML=`
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
          <div><span class="badge" style="background:${color}22;color:${color}">${urg}</span></div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Likely Cause:</strong> ${v.cause||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Estimated Cost:</strong> R${Number(v.costMin||0).toLocaleString()} - R${Number(v.costMax||0).toLocaleString()}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Trade Required:</strong> ${v.tradeRequired||'None'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Fix Timeframe:</strong> ${v.timeframe||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Landlord Action:</strong> ${v.landlordAction||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Tenant Action:</strong> ${v.tenantAction||'—'}</div>
          <div style="margin-top:8px"><button class="btn-primary btn-sm" onclick="addMaintCard('open')">Submit with AI Assessment</button></div>
          ${aiAttribution()}
        </div>
      `;
    }
  }catch(_err){
    showNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
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
  const m=maintenanceData.find(x=>Number(x.id)===Number(maintId));
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
  m.vendorId=vidRaw?Number(vidRaw):null;
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
    showNotif('Expense already linked','warning');
    return;
  }
  const act=Math.max(0,Number(m.actualCost)||0);
  const cd=String(m.completedDate||'').trim();
  if(!act||!cd){
    showNotif('Set actual cost and completed date first','warning');
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
  showNotif('Expense created and linked','success');
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

function updateMaintenanceBadge(){
  const n=(maintenanceData||[]).filter(m=>m.status!=='done').length;
  const el=document.getElementById('navMaintBadge');
  if(!el) return;
  el.textContent=n>99?'99+':String(n);
  el.style.display=n>0?'inline-flex':'none';
}
window.updateMaintenanceBadge=updateMaintenanceBadge;

