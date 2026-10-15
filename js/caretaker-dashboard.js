/* Caretaker Dashboard — modeled on tenant-dashboard.js */
(function(){
  window.__nestiqCaretakerSelectedPropertyId=window.__nestiqCaretakerSelectedPropertyId||null;
  const __nqStaggerSig={};
  const __nqStaggerTimers={};

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
      return window.__nestiqSession || JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
    }catch(_e){ return null; }
  }
  function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function greetingText(){
    const h=new Date().getHours();
    if(h<12) return 'Good morning';
    if(h<17) return 'Good afternoon';
    return 'Good evening';
  }
  function assignedPropertyIds(){
    return (Array.isArray(sess()?.assignedPropertyIds)?sess().assignedPropertyIds:[]).map(String).filter(Boolean);
  }
  function activeAssignedProperties(){
    const allowed=new Set(assignedPropertyIds());
    return (window.caretakerProperties||[]).filter(p=>allowed.has(String(p.id||p.propertyId||'')));
  }
  function selectedPropertyId(){
    const props=activeAssignedProperties();
    if(!props.length) return null;
    const cur=String(window.__nestiqCaretakerSelectedPropertyId||'');
    if(cur&&props.some(p=>String(p.id||p.propertyId)===cur)) return cur;
    const first=String(props[0].id||props[0].propertyId||'');
    window.__nestiqCaretakerSelectedPropertyId=first;
    return first;
  }
  function selectedProperty(){
    const pid=selectedPropertyId();
    return activeAssignedProperties().find(p=>String(p.id||p.propertyId)===String(pid))||null;
  }
  function maintenanceForProperty(propertyId){
    return (window.caretakerMaintenance||[]).filter(m=>String(m.propertyId||'')===String(propertyId));
  }
  function tenantRowsForProperty(propertyId){
    return (window.caretakerTenants||[]).filter(t=>String(t.propertyId||'')===String(propertyId));
  }
  function unitRowsForProperty(propertyId){
    return (window.caretakerUnits||[]).filter(u=>String(u.propertyId||'')===String(propertyId));
  }
  function autoApproveLimit(){
    const p=selectedProperty();
    const fromProp=Number(p?.autoApproveLimit);
    if(Number.isFinite(fromProp)&&fromProp>=0) return fromProp;
    const fromSess=Number(sess()?.caretakerAutoApproveLimit);
    if(Number.isFinite(fromSess)&&fromSess>=0) return fromSess;
    return 1000;
  }
  // Same convention as js/properties.js: caretakerCanManage defaults true unless explicitly false.
  function caretakerCanManageOnProperty(p){
    if(!p) return true;
    const fromSettings=p.maintenanceSettings?.caretakerCanManage;
    if(fromSettings===false) return false;
    if(p.caretakerCanManage===false) return false;
    return true;
  }
  function propertyForMaintenanceJob(job){
    const pid=String(job?.propertyId||'');
    if(!pid) return selectedProperty();
    return activeAssignedProperties().find(x=>String(x.id||x.propertyId)===pid)||null;
  }
  const CARETAKER_ASSIGN_BLOCKED_MSG="The landlord hasn't given you permission to assign contractors on this property — ask them to enable it in Property Settings, or flag this request to them directly.";
  function issueCategoryOptions(selected){
    const cats=(Array.isArray(window.NESTIQ_MAINT_ISSUE_CATS)&&window.NESTIQ_MAINT_ISSUE_CATS.length)
      ? window.NESTIQ_MAINT_ISSUE_CATS
      : ['Plumbing','Electrical','General Handyman','Painter','Pest Control','Locksmith','Structural Engineer','Structural','Appliance','Other'];
    return cats.map(c=>`<option value="${esc(c)}" ${c===String(selected||'')?'selected':''}>${esc(c)}</option>`).join('');
  }
  function vendorIdIsSet(m){
    return m?.vendorId!=null && String(m.vendorId).trim()!=='';
  }
  function unitStats(propertyId){
    const units=unitRowsForProperty(propertyId);
    if(units.length){
      const occupied=units.filter(u=>String(u.status||'').toLowerCase()==='occupied'||!!u.tenantId||!!u.tenantName).length;
      return { total:units.length, occupied, vacant:Math.max(0,units.length-occupied) };
    }
    // Fallback: single-tenant-per-property model when no units docs exist
    const tenants=tenantRowsForProperty(propertyId).filter(t=>{
      const st=String(t.status||'').toLowerCase();
      return st!=='vacant'&&st!=='moved-out'&&st!=='inactive';
    });
    const occupied=tenants.length?1:0;
    return { total:1, occupied, vacant:occupied?0:1 };
  }
  function contractorOptions(selectedId){
    return ['<option value="">Assign contractor</option>'].concat(
      (window.caretakerStaff||[]).map(c=>{
        const vid=String(c.linkedVendorId||'');
        if(!vid) return '';
        return `<option value="${esc(vid)}" ${vid===String(selectedId||'')?'selected':''}>${esc(c.name||'Contractor')}${c.staffType?` (${esc(c.staffType)})`:''}</option>`;
      }).filter(Boolean)
    ).join('');
  }
  function maintStatusLabel(m){
    if(m?.pendingLandlordApproval) return 'Pending Landlord Approval';
    const st=String(m?.status||'open');
    if(st==='done') return 'Completed';
    if(st==='progress') return 'In Progress';
    if(st==='cancelled') return 'Cancelled';
    if(m?.vendorName) return 'Assigned';
    return 'Open';
  }
  function maintTabForRecord(m){
    const label=maintStatusLabel(m);
    if(label==='Cancelled') return 'cancelled';
    if(label==='Completed') return 'done';
    if(label==='In Progress') return 'progress';
    if(label==='Pending Landlord Approval' || label==='Assigned') return 'awaiting';
    if(label==='Open' && vendorIdIsSet(m)) return 'awaiting';
    return 'new';
  }
  function sortMaintRows(list){
    return (list||[]).slice().sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
  }
  function nestiqCaretakerSwitchMaintTab(tab){
    window.__nestiqCaretakerMaintTab=String(tab||'new');
    renderCaretakerMaintenance();
  }
  function nestiqCaretakerToggleCreateForm(){
    window.__nestiqCaretakerCreateOpen=!window.__nestiqCaretakerCreateOpen;
    renderCaretakerMaintenance();
  }
  function nestiqCaretakerToggleCancelled(){
    window.__nestiqCaretakerShowCancelled=!window.__nestiqCaretakerShowCancelled;
    if(window.__nestiqCaretakerShowCancelled) window.__nestiqCaretakerMaintTab='cancelled';
    else if(window.__nestiqCaretakerMaintTab==='cancelled') window.__nestiqCaretakerMaintTab='new';
    renderCaretakerMaintenance();
  }
  function propertySwitcherHtml(selectId){
    const props=activeAssignedProperties();
    const cur=selectedPropertyId();
    if(props.length<=1){
      const only=props[0];
      return only?`<div style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">${esc(only.name||'Property')}</div>`:'';
    }
    return `<div class="form-group" style="margin-bottom:14px">
      <label>Property</label>
      <select class="form-input" id="${esc(selectId)}" onchange="nestiqCaretakerSelectProperty(this.value)">
        ${props.map(p=>`<option value="${esc(String(p.id||p.propertyId))}" ${String(p.id||p.propertyId)===String(cur)?'selected':''}>${esc(p.name||'Property')}</option>`).join('')}
      </select>
    </div>`;
  }
  function syncInspectionsForCaretaker(){
    const rows=(window.caretakerInspections||[]).slice();
    window.inspections=rows;
    try{
      if(typeof inspections!=='undefined'&&Array.isArray(inspections)){
        inspections.splice(0,inspections.length,...rows);
      }
    }catch(_e){}
  }
  function nestiqSwitchCaretakerTab(tab){
    document.querySelectorAll('#caretakerTabBar .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    document.querySelectorAll('#caretakerTabContent .tenant-tab-page').forEach(p=>p.classList.toggle('active',p.id==='kTab-'+tab));
    if(tab==='messages') renderCaretakerMessages();
  }
  function nestiqCaretakerSelectProperty(propertyId){
    window.__nestiqCaretakerSelectedPropertyId=String(propertyId||'');
    renderCaretakerDashboard();
  }
  async function renderCaretakerDashboard(){
    const s=sess();
    if(!s||s.role!=='caretaker') return;
    const greeting=document.getElementById('caretakerGreeting');
    if(greeting) greeting.textContent=`${greetingText()}, ${s.name||'Caretaker'}`;
    syncInspectionsForCaretaker();
    selectedPropertyId();
    renderCaretakerHome();
    renderCaretakerProperties();
    renderCaretakerMaintenance();
    renderCaretakerInspections();
    renderCaretakerMessages();
    renderCaretakerProfile();
    nestiqUpdateCaretakerMessageBadge();
  }
  function renderCaretakerHome(){
    const el=document.getElementById('kTab-home');
    if(!el) return;
    const p=selectedProperty();
    if(!p){
      el.innerHTML=`<div class="tenant-home">
        <header class="tenant-home-header">
          <div class="tenant-home-kicker">Caretaker portal</div>
          <h1 class="tenant-home-title">Welcome</h1>
          <p class="tenant-home-sub">No properties have been assigned yet. Ask the landlord to add you on Staff.</p>
        </header>
      </div>`;
      el.removeAttribute('data-nq-stagger-sig');
      try{ window.nestiqHydrateIcons?.(el); }catch(_e){}
      return;
    }
    const pid=String(p.id||p.propertyId);
    const stats=unitStats(pid);
    const maint=maintenanceForProperty(pid);
    const open=maint.filter(m=>String(m.status||'')!=='done'&&String(m.status||'')!=='cancelled');
    const recent=maint.slice().sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,5);
    const tenants=tenantRowsForProperty(pid);
    const limit=autoApproveLimit();
    const place=esc(p.name||'Your property');
    el.innerHTML=`
      <div class="tenant-home">
        <header class="tenant-home-header">
          <div>
            <div class="tenant-home-kicker">Caretaker portal</div>
            <h1 class="tenant-home-title">${place}</h1>
            <p class="tenant-home-sub">Day-to-day operations for this property. Rent and financial reports stay with the landlord.</p>
          </div>
        </header>
        ${propertySwitcherHtml('kHomePropSwitch')}
        <p class="tenant-home-sub" style="margin:0 0 16px">Auto-approve contractor estimates up to <strong>R${Number(limit).toLocaleString('en-ZA')}</strong></p>
        <div class="tenant-quick-stats" id="kHomeStats">
          <div class="tenant-quick-stat">
            <span class="tenant-quick-stat-ico" data-nq-icon="building-2" data-nq-size="16"></span>
            <div class="tenant-quick-stat-val">${stats.total}</div>
            <div class="tenant-quick-stat-lbl">Total units</div>
          </div>
          <div class="tenant-quick-stat">
            <span class="tenant-quick-stat-ico" data-nq-icon="house" data-nq-size="16"></span>
            <div class="tenant-quick-stat-val">${stats.occupied}</div>
            <div class="tenant-quick-stat-lbl">Occupied</div>
          </div>
          <div class="tenant-quick-stat">
            <span class="tenant-quick-stat-ico" data-nq-icon="circle-alert" data-nq-size="16"></span>
            <div class="tenant-quick-stat-val">${stats.vacant}</div>
            <div class="tenant-quick-stat-lbl">Vacant</div>
          </div>
          <button type="button" class="tenant-quick-stat" onclick="nestiqSwitchCaretakerTab('maintenance')">
            <span class="tenant-quick-stat-ico" data-nq-icon="wrench" data-nq-size="16"></span>
            <div class="tenant-quick-stat-val">${open.length}</div>
            <div class="tenant-quick-stat-lbl">Open maintenance</div>
          </button>
        </div>
        <div class="tenant-home-grid">
          <div class="tenant-section-card">
            <div class="tenant-section-title">Tenants</div>
            <div id="kHomeTenants">
              ${tenants.length?tenants.map(t=>{
                const unread=caretakerUnreadForTenant(String(t.tenantId||t.id||''));
                const openCount=maint.filter(m=>String(m.tenantId||'')===String(t.tenantId||t.id||'')&&String(m.status||'')!=='done'&&String(m.status||'')!=='cancelled').length;
                const leaseSt=String(t.status||'active');
                const moveIn=t.leaseStart||t.moveInDate||t.moveIn||'—';
                return `<div class="staff-row-card">
                  <strong>${esc(t.name||'Tenant')}</strong>
                  <div class="staff-row-meta">${esc(t.unit||'—')} · Lease: ${esc(leaseSt)} · Move-in: ${esc(moveIn)} · Open maintenance: ${openCount}</div>
                  <button type="button" class="btn-primary btn-sm" style="margin-top:10px" onclick="nestiqCaretakerOpenTenantChat('${esc(String(t.tenantId||t.id||''))}')">Message tenant${unread?` · ${unread}`:''}</button>
                </div>`;
              }).join(''):'<div class="tenant-empty-hint">No tenants on this property.</div>'}
            </div>
          </div>
          <div class="tenant-section-card">
            <div class="tenant-section-title">Recent maintenance</div>
            <div id="kHomeRecentMaint">
            ${recent.length?recent.map(m=>`<div class="staff-row-card"><strong>${esc(m.title||m.issueCategory||'Request')}</strong><div class="staff-row-meta">${esc(maintStatusLabel(m))} · ${esc(m.date||'')}${m.vendorName?` · ${esc(m.vendorName)}`:''}${m.pendingLandlordApproval&&m.proposedVendorName?` · Proposed: ${esc(m.proposedVendorName)} (R${Number(m.proposedEstimatedCost||0).toLocaleString('en-ZA')})`:''}</div></div>`).join('')
              :'<div class="tenant-empty-hint">No recent maintenance requests.</div>'}
            </div>
          </div>
        </div>
      </div>`;
    try{ window.nestiqHydrateIcons?.(el); }catch(_e){}
  }
  function renderCaretakerProperties(){
    const el=document.getElementById('kTab-properties');
    if(!el) return;
    const p=selectedProperty();
    if(!p){
      el.innerHTML='<div class="tenant-section-card"><p style="color:var(--muted)">No assigned properties yet.</p></div>';
      el.removeAttribute('data-nq-stagger-sig');
      return;
    }
    const pid=String(p.id||p.propertyId);
    const units=unitRowsForProperty(pid);
    const tenants=tenantRowsForProperty(pid);
    el.innerHTML=`
      <div class="tenant-section-card">
        ${propertySwitcherHtml('kPropSwitch')}
        <div class="portal-card-title">${esc(p.name||'Property')}</div>
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:12px">${esc(p.addr||'')}</div>
        <div style="font-size:0.8rem;font-weight:700;margin-bottom:6px">Units</div>
        <div id="kPropUnits" style="display:grid;gap:8px;margin-bottom:12px">${units.length?units.map(u=>`<div style="padding:10px;border:1px solid var(--border);border-radius:10px"><div style="font-weight:600">${esc(u.unitNumber||u.label||'Unit')}</div><div style="font-size:0.78rem;color:var(--muted)">Status: ${esc(u.status||'vacant')}${u.tenantName?` · Tenant: ${esc(u.tenantName)}`:''}</div></div>`).join(''):'<div style="color:var(--muted)">Using property-level occupancy (no unit docs yet).</div>'}</div>
        <div style="font-size:0.8rem;font-weight:700;margin-bottom:6px">Tenants</div>
        <div id="kPropTenants" style="display:grid;gap:8px">${tenants.length?tenants.map(t=>`<div style="padding:10px;border:1px solid var(--border);border-radius:10px"><div style="font-weight:600">${esc(t.name||'Tenant')}</div><div style="font-size:0.78rem;color:var(--muted)">${esc(t.unit||'—')}${t.phone?` · ${esc(t.phone)}`:''}${t.email?` · ${esc(t.email)}`:''}</div></div>`).join(''):'<div style="color:var(--muted)">No active tenants for this property.</div>'}</div>
      </div>`;
    staggerIfNew(el.querySelector('#kPropUnits'));
    staggerIfNew(el.querySelector('#kPropTenants'));
  }
  function renderCaretakerMaintenance(){
    const el=document.getElementById('kTab-maintenance');
    if(!el) return;
    const p=selectedProperty();
    if(!p){
      el.innerHTML='<div class="tenant-section-card"><p style="color:var(--muted)">Select an assigned property to manage maintenance.</p></div>';
      el.removeAttribute('data-nq-stagger-sig');
      return;
    }
    const pid=String(p.id||p.propertyId);
    const rows=maintenanceForProperty(pid);
    const limit=autoApproveLimit();
    const canManage=caretakerCanManageOnProperty(p);
    const tenants=tenantRowsForProperty(pid);
    const units=unitRowsForProperty(pid);
    const showCreate=!!window.__nestiqCaretakerCreateOpen;
    const showCancelled=!!window.__nestiqCaretakerShowCancelled;
    const grouped={ new:[], awaiting:[], progress:[], done:[], cancelled:[] };
    rows.forEach(m=>{
      const tab=maintTabForRecord(m);
      (grouped[tab]||grouped.new).push(m);
    });
    const allowedTabs=showCancelled?['new','awaiting','progress','done','cancelled']:['new','awaiting','progress','done'];
    let active=String(window.__nestiqCaretakerMaintTab||'new');
    if(!allowedTabs.includes(active)) active='new';
    window.__nestiqCaretakerMaintTab=active;
    const draft={
      title:document.getElementById('k_report_title')?.value||'',
      cat:document.getElementById('k_report_cat')?.value||'',
      pri:(typeof nestiqMaintReadPriorityInput==='function'?nestiqMaintReadPriorityInput('k_report_priority'):'')||document.getElementById('k_report_priority')?.value||'Medium',
      desc:document.getElementById('k_report_desc')?.value||'',
      tenant:document.getElementById('k_report_tenant')?.value||'',
      unit:document.getElementById('k_report_unit')?.value||''
    };
    const tabMeta=[
      { id:'new', label:'New Requests', count:grouped.new.length },
      { id:'awaiting', label:'Awaiting Contractor', count:grouped.awaiting.length },
      { id:'progress', label:'In Progress', count:grouped.progress.length },
      { id:'done', label:'Completed', count:grouped.done.length }
    ];
    if(showCancelled) tabMeta.push({ id:'cancelled', label:'Cancelled', count:grouped.cancelled.length });
    const emptyCopy={
      new:'No new requests for this property.',
      awaiting:'Nothing waiting on a contractor or landlord right now.',
      progress:'No jobs in progress.',
      done:'No completed requests yet.',
      cancelled:'No cancelled requests.'
    };
    const jobCard=m=>{
      const id=String(m._id||m.id||'');
      const pending=!!m.pendingLandlordApproval;
      const assigned=vendorIdIsSet(m)&&!pending;
      const label=maintStatusLabel(m);
      const loggedByCaretaker=String(m.reportedBy||m.loggedBy||'')==='caretaker';
      const showAssign=canManage && maintTabForRecord(m)==='new';
      return `<div style="padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700">${esc(m.title||m.issueCategory||'Maintenance Request')}</div>
            <div style="font-size:0.8rem;color:var(--muted)">${esc(m.unit?`Unit ${m.unit}`:'')}${m.tenantName&&!loggedByCaretaker?`${m.unit?' · ':''}${esc(m.tenantName)}`:''}${loggedByCaretaker?`${m.unit||m.tenantName?' · ':''}Logged by caretaker${m.loggedByName?` (${esc(m.loggedByName)})`:''}`:''}</div>
          </div>
          <div style="font-size:0.8rem;font-weight:600;color:${pending?'var(--gold)':'var(--muted)'}">${esc(label)}</div>
        </div>
        ${m.description?`<div style="margin-top:6px;font-size:0.82rem;color:var(--muted)">${esc(String(m.description).length>180?String(m.description).slice(0,177)+'…':m.description)}</div>`:''}
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <span class="badge">${esc(typeof nestiqMaintOfficialPriority==='function'?nestiqMaintOfficialPriority(m):(m.priority||'Medium'))}</span>
          ${typeof nestiqMaintPriorityReviewNoteHtml==='function'?nestiqMaintPriorityReviewNoteHtml(m):''}
        </div>
        <div class="form-group" style="margin-top:8px">
          <label>Review priority</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select class="form-input" id="k_pri_${esc(id)}" style="max-width:180px">${typeof nestiqMaintPriorityOptionsHtml==='function'?nestiqMaintPriorityOptionsHtml(typeof nestiqMaintOfficialPriority==='function'?nestiqMaintOfficialPriority(m):m.priority):''}</select>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqCaretakerSetPriority('${esc(id)}')">Update priority</button>
          </div>
        </div>
        ${pending?`<div style="margin-top:8px;font-size:0.82rem;background:rgba(201,168,76,0.12);border-radius:8px;padding:8px 10px">Waiting for landlord approval: <strong>${esc(m.proposedVendorName||'Contractor')}</strong> · R${Number(m.proposedEstimatedCost||0).toLocaleString('en-ZA')}</div>`:''}
        ${assigned?`<div style="margin-top:8px;font-size:0.82rem;color:var(--muted)">Assigned to ${esc(m.vendorName||'contractor')}${m.estimatedCost!=null?` · Est. R${Number(m.estimatedCost||0).toLocaleString('en-ZA')}`:''}${typeof window.nestiqMaintVisitLabel==='function'&&window.nestiqMaintVisitLabel(m)?` · Visit ${esc(window.nestiqMaintVisitLabel(m))}`:''}</div>`:''}
        ${String(m.status||'')==='done'&&typeof nestiqMaintPayoutCardHtml==='function'?nestiqMaintPayoutCardHtml(m,{canPay:canManage, payId:id}):''}
        ${showAssign?`
          <div class="form-group" style="margin-top:10px">
            <label>Assign contractor</label>
            <select class="form-input" id="k_assign_${esc(id)}">${contractorOptions('')}</select>
          </div>
          <div class="form-group" style="margin-top:8px">
            <label>Estimated cost (R)</label>
            <input class="form-input" type="number" min="0" step="1" id="k_est_${esc(id)}" placeholder="0">
          </div>
          <button type="button" class="btn-primary btn-sm" onclick="nestiqCaretakerAssignContractor('${esc(id)}')">Submit assignment</button>
        `:''}
      </div>`;
    };
    const activeRows=grouped[active]||[];
    el.innerHTML=`
      <div class="tenant-section-card">
        ${propertySwitcherHtml('kMaintPropSwitch')}
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <div class="portal-card-title" style="margin:0">Maintenance Requests</div>
          <button type="button" class="btn-gold btn-sm" onclick="nestiqCaretakerToggleCreateForm()">${showCreate?'Close form':'+ Create Maintenance Request'}</button>
        </div>
        <p style="font-size:0.82rem;color:var(--muted);margin-bottom:12px">${canManage
          ? `Estimates at or below R${Number(limit).toLocaleString('en-ZA')} assign immediately. Higher estimates need landlord approval.`
          : `The landlord hasn't given you permission to assign contractors on this property. You can still log problems for them to handle.`}</p>
        ${showCreate?`
        <div style="padding:12px;border:1px dashed var(--border);border-radius:12px;margin-bottom:14px;background:var(--paper)">
          <div style="font-weight:700;margin-bottom:6px">New maintenance request</div>
          <p style="font-size:0.78rem;color:var(--muted);margin-bottom:10px">Leave tenant and unit empty for common-area issues (for example a broken gate).</p>
          <div class="form-group"><label>Title (optional)</label><input class="form-input" id="k_report_title" placeholder="e.g. Broken gate" value="${esc(draft.title)}"></div>
          <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
            <div class="form-group"><label>Issue category</label>
              <select class="form-input" id="k_report_cat">${issueCategoryOptions(draft.cat)}</select>
            </div>
            <div class="form-group"><label>Priority / Urgency</label>
              ${typeof nestiqMaintPriorityRadiosHtml==='function'?nestiqMaintPriorityRadiosHtml(draft.pri||'Medium','k_report_priority'):`<select class="form-input" id="k_report_priority">
                <option value="Low" ${draft.pri==='Low'?'selected':''}>Low</option>
                <option value="Medium" ${draft.pri==='Medium'?'selected':''}>Medium</option>
                <option value="High" ${draft.pri==='High'?'selected':''}>High</option>
                <option value="Emergency" ${draft.pri==='Emergency'?'selected':''}>Emergency</option>
              </select>`}
            </div>
          </div>
          <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
            <div class="form-group"><label>Tenant (optional)</label>
              <select class="form-input" id="k_report_tenant">
                <option value="">None — common area / no tenant</option>
                ${tenants.map(t=>`<option value="${esc(String(t.tenantId||t.id||''))}" ${String(t.tenantId||t.id||'')===draft.tenant?'selected':''}>${esc(t.name||'Tenant')}${t.unit?` (${esc(t.unit)})`:''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Unit (optional)</label>
              <select class="form-input" id="k_report_unit">
                <option value="">None</option>
                ${units.map(u=>{
                  const val=String(u.unitNumber||u.label||'');
                  return `<option value="${esc(val)}" ${val===draft.unit?'selected':''}>${esc(val||'Unit')}</option>`;
                }).join('')}
                ${!units.length&&tenants.length?tenants.map(t=>t.unit?`<option value="${esc(t.unit)}" ${t.unit===draft.unit?'selected':''}>${esc(t.unit)}</option>`:'').join(''):''}
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:8px"><label>Description</label>
            <textarea class="form-input form-textarea" id="k_report_desc" placeholder="Describe the issue, e.g. the front gate motor won’t close">${esc(draft.desc)}</textarea>
          </div>
          <button type="button" class="btn-primary btn-sm" style="margin-top:10px" onclick="nestiqCaretakerReportProblem()">Submit request</button>
        </div>`:''}
        <div class="tenant-maint-filters" role="tablist" style="margin-bottom:10px">
          ${tabMeta.map(t=>`<button type="button" role="tab" aria-selected="${t.id===active?'true':'false'}" class="tenant-maint-filter${t.id===active?' active':''}" onclick="nestiqCaretakerSwitchMaintTab('${t.id}')">${esc(t.label)} (${t.count})</button>`).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:var(--muted);margin-bottom:12px">
          <input type="checkbox" ${showCancelled?'checked':''} onchange="nestiqCaretakerToggleCancelled()"> Show cancelled
        </label>
        ${activeRows.length?`<div id="kMaintJobList">${sortMaintRows(activeRows).map(jobCard).join('')}</div>`:`<p style="color:var(--muted)">${esc(emptyCopy[active]||'No requests in this tab.')}</p>`}
      </div>`;
    staggerIfNew(el.querySelector('#kMaintJobList'));
  }
  function renderCaretakerInspections(){
    const el=document.getElementById('kTab-inspections');
    if(!el) return;
    const p=selectedProperty();
    const pid=p?String(p.id||p.propertyId):'';
    const rows=(window.caretakerInspections||[])
      .filter(i=>!pid||String(i.propertyId||'')===pid)
      .slice()
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    el.innerHTML=`
      <div class="tenant-section-card">
        ${propertySwitcherHtml('kInspPropSwitch')}
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <div class="portal-card-title">Inspections</div>
          <button type="button" class="btn-gold btn-sm" onclick="nestiqCaretakerStartInspection()">+ New Inspection</button>
        </div>
        <div id="inspectionFormWrap" style="display:none;margin-bottom:12px"></div>
        <div id="inspectionsList" style="display:grid;gap:10px">
          ${rows.length?rows.map(i=>`<div style="padding:12px;border:1px solid var(--border);border-radius:12px"><div style="font-weight:700">${esc(i.propertyName||'Property')}</div><div style="font-size:0.8rem;color:var(--muted)">${esc(i.type||'routine')} · ${esc(i.status||'scheduled')} · ${esc(i.date||'')}</div><button type="button" class="btn-outline btn-sm" style="margin-top:8px" onclick="openInspectionReport(${JSON.stringify(i.id)})">View report</button></div>`).join(''):'<p style="color:var(--muted)">No inspections on this property yet.</p>'}
        </div>
      </div>`;
    staggerIfNew(el.querySelector('#inspectionsList'));
  }
  function renderCaretakerProfile(){
    const el=document.getElementById('kTab-profile');
    const s=sess();
    if(!el) return;
    el.innerHTML=`<div class="tenant-section-card"><div class="portal-card-title">Caretaker Profile</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px"><div><div style="font-size:0.78rem;color:var(--muted)">Name</div><div style="font-weight:600">${esc(s?.name||'')}</div></div><div><div style="font-size:0.78rem;color:var(--muted)">Email</div><div>${esc(s?.email||'')}</div></div></div><div style="margin-top:12px;font-size:0.82rem;color:var(--muted)">Assigned properties: ${assignedPropertyIds().length}</div><button type="button" class="btn-outline btn-sm" style="margin-top:18px" onclick="nestiqContractorLogout()">Sign Out</button></div>`;
  }
  async function nestiqCaretakerAssignContractor(jobId){
    const s=sess();
    const vendorId=document.getElementById(`k_assign_${jobId}`)?.value||'';
    const estimateRaw=Number(document.getElementById(`k_est_${jobId}`)?.value);
    const estimate=Number.isFinite(estimateRaw)&&estimateRaw>=0?estimateRaw:NaN;
    if(!vendorId){ nestiqShowNotif?.('Select a contractor first','warning'); return; }
    if(!Number.isFinite(estimate)){ nestiqShowNotif?.('Enter an estimated cost','warning'); return; }
    const staff=(window.caretakerStaff||[]).find(x=>String(x.linkedVendorId||'')===String(vendorId));
    const job=(window.caretakerMaintenance||[]).find(x=>String(x._id||x.id)===String(jobId));
    if(!s?.landlordId||!job||!staff){ nestiqShowNotif?.('Could not assign contractor','error'); return; }
    const prop=propertyForMaintenanceJob(job);
    if(!caretakerCanManageOnProperty(prop)){
      nestiqShowNotif?.(CARETAKER_ASSIGN_BLOCKED_MSG,'warning');
      return;
    }
    const limit=autoApproveLimit();
    const fv=firebase.firestore.FieldValue;
    const ref=window.nestiqFs.maintenance(window.nestiqDb,s.landlordId).doc(String(jobId));
    try{
      if(estimate>limit){
      await ref.set({
        pendingLandlordApproval:true,
        proposedVendorId:String(vendorId),
        proposedVendorName:staff.name||'Contractor',
        proposedVendorType:staff.staffType||'',
        proposedEstimatedCost:estimate,
        proposedByRole:'caretaker',
        proposedByUid:s.uid||s.userId||null,
        proposedByName:s.name||'Caretaker',
        proposedAt:fv.serverTimestamp(),
        updatedByRole:'caretaker',
        updatedByUid:s.uid||s.userId||null,
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
      Object.assign(job,{
        pendingLandlordApproval:true,
        proposedVendorId:String(vendorId),
        proposedVendorName:staff.name||'Contractor',
        proposedEstimatedCost:estimate
      });
      await window.nestiqNotifyLandlordStaffAction?.(
        `${s.name||'Caretaker'} requested approval to assign ${staff.name||'a contractor'} (R${estimate.toLocaleString('en-ZA')}) on ${job.title||'a maintenance request'}`,
        'maintenance'
      );
      nestiqShowNotif?.('Sent for landlord approval','info');
    }else{
      await ref.set({
        vendorId:String(vendorId),
        vendorName:staff.name||'Contractor',
        vendorType:staff.staffType||'',
        estimatedCost:estimate,
        pendingLandlordApproval:false,
        proposedVendorId:null,
        proposedVendorName:null,
        proposedVendorType:null,
        proposedEstimatedCost:null,
        assignedAt:typeof nestiqMaintNowIso==='function'?nestiqMaintNowIso():new Date().toISOString(),
        contractorStage:'assigned',
        activityLog:(typeof nestiqMaintAppendActivity==='function'
          ? nestiqMaintAppendActivity(job, 'assigned', `${s.name||'Caretaker'} assigned job to ${staff.name||'contractor'}`, s.name||'Caretaker')
          : (job.activityLog||[])),
        updatedByRole:'caretaker',
        updatedByUid:s.uid||s.userId||null,
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
      Object.assign(job,{
        vendorId:String(vendorId),
        vendorName:staff.name||'Contractor',
        estimatedCost:estimate,
        pendingLandlordApproval:false
      });
      await window.nestiqNotifyLandlordStaffAction?.(
        `${s.name||'Caretaker'} assigned ${staff.name||'a contractor'} (R${estimate.toLocaleString('en-ZA')}, auto-approved) to ${job.title||'a maintenance request'}`,
        'maintenance'
      );
      nestiqShowNotif?.('Contractor assigned','success');
      }
      window.__nestiqCaretakerMaintTab='awaiting';
      renderCaretakerDashboard();
    }catch(err){
      console.error('Caretaker assign contractor', err);
      const denied=err?.code==='permission-denied'||/permission/i.test(String(err?.message||''));
      nestiqShowNotif?.(denied?CARETAKER_ASSIGN_BLOCKED_MSG:'Could not assign contractor','error');
    }
  }
  async function nestiqCaretakerReportProblem(){
    const s=sess();
    const p=selectedProperty();
    if(!s?.landlordId||!p){
      nestiqShowNotif?.('Select an assigned property first','warning');
      return;
    }
    const pid=String(p.id||p.propertyId||'');
    if(!pid||!assignedPropertyIds().includes(pid)){
      nestiqShowNotif?.('You can only log problems on properties assigned to you','warning');
      return;
    }
    const title=(document.getElementById('k_report_title')?.value||'').trim();
    const issueCategory=document.getElementById('k_report_cat')?.value||'Other';
    const priority=typeof nestiqMaintReadPriorityInput==='function'
      ? nestiqMaintReadPriorityInput('k_report_priority')
      : (document.getElementById('k_report_priority')?.value||'Medium');
    const description=(document.getElementById('k_report_desc')?.value||'').trim();
    const tenantPick=document.getElementById('k_report_tenant')?.value||'';
    const unitPick=(document.getElementById('k_report_unit')?.value||'').trim();
    const tenant=tenantPick?tenantRowsForProperty(pid).find(t=>String(t.tenantId||t.id)===String(tenantPick)):null;
    const resolvedTitle=title||(`${issueCategory} issue`).trim();
    if(!resolvedTitle){
      nestiqShowNotif?.('Add a short title for this request','error');
      return;
    }
    if(!description||description.length<10){
      nestiqShowNotif?.('Please describe the issue in more detail','error');
      return;
    }
    const fv=firebase.firestore.FieldValue;
    const row={
      property:String(p.name||''),
      propertyId:pid,
      priority,
      reportedPriority:priority,
      urgency:priority,
      issueCategory,
      issueType:issueCategory,
      description,
      title:resolvedTitle,
      status:'open',
      date:new Date().toLocaleDateString('en-ZA'),
      landlordId:s.landlordId,
      tenantId:tenant?String(tenant.tenantId||tenant.id):null,
      tenantName:tenant?String(tenant.name||''):null,
      tenantEmail:tenant?String(tenant.email||tenant.portalEmail||'').trim()||null:null,
      unit:unitPick||tenant?.unit||null,
      locationType:(unitPick||tenant?.unit)?'unit':'common',
      reportedBy:'caretaker',
      reportedByRole:'caretaker',
      loggedBy:'caretaker',
      loggedByName:s.name||'Caretaker',
      loggedByUid:s.uid||s.userId||null,
      createdAt:fv.serverTimestamp()
    };
    delete row.vendorId;
    delete row.vendorName;
    try{
      window.showLoading?.('Submitting request...');
      const add=typeof window.nestiqAddMaintenanceRecord==='function'
        ? window.nestiqAddMaintenanceRecord
        : (payload)=>window.nestiqFs.maintenance(window.nestiqDb,s.landlordId).add(payload);
      const docRef=await add(row);
      window.caretakerMaintenance=Array.isArray(window.caretakerMaintenance)?window.caretakerMaintenance:[];
      if(docRef?.id){
        window.caretakerMaintenance.unshift({ id:docRef.id, _id:docRef.id, ...row, createdAt:null });
      }
      await window.nestiqNotifyLandlordStaffAction?.(
        `${s.name||'Caretaker'} logged a maintenance request on ${p.name||'a property'}: ${resolvedTitle}`,
        'maintenance'
      );
      const titleEl=document.getElementById('k_report_title');
      const descEl=document.getElementById('k_report_desc');
      if(titleEl) titleEl.value='';
      if(descEl) descEl.value='';
      window.hideLoading?.();
      window.__nestiqCaretakerCreateOpen=false;
      window.__nestiqCaretakerMaintTab='new';
      nestiqShowNotif?.('Request created — your landlord can see it on Maintenance','success');
      renderCaretakerDashboard();
    }catch(err){
      window.hideLoading?.();
      console.error('Caretaker maintenance report', err);
      const denied=err?.code==='permission-denied'||/permission/i.test(String(err?.message||''));
      nestiqShowNotif?.(denied
        ? 'Could not create this request. Sign out and back in, or ask the landlord to check your property assignment.'
        : 'Failed to submit request','error');
    }
  }
  function caretakerUnreadForTenant(tenantId){
    return (window.caretakerMessages||[]).filter(m=>String(m.tenantId)===String(tenantId)&&m.fromRole==='tenant'&&!m.read&&!m.deleted).length;
  }
  function nestiqUpdateCaretakerMessageBadge(){
    const n=(window.caretakerMessages||[]).filter(m=>m.fromRole==='tenant'&&!m.read&&!m.deleted).length;
    const el=document.getElementById('tabBadge-caretaker-messages');
    if(el){
      el.textContent=n>99?'99+':String(n);
      el.style.display=n?'flex':'none';
    }
    const tab=document.querySelector('#caretakerTabBar .tab-btn[data-tab="messages"]');
    if(tab) tab.classList.toggle('has-unread', n>0);
  }
  function nestiqCaretakerOpenTenantChat(tenantId){
    window.__nestiqCaretakerChatTenantId=String(tenantId||'');
    window.__nestiqCaretakerListMode=false;
    nestiqSwitchCaretakerTab('messages');
    renderCaretakerMessages();
  }
  function nestiqCaretakerChatBack(){
    window.__nestiqCaretakerListMode=true;
    window.__nestiqCaretakerChatTenantId='';
    renderCaretakerMessages();
  }
  function renderCaretakerMessages(){
    const el=document.getElementById('kTab-messages');
    if(!el) return;
    const s=sess();
    const p=selectedProperty();
    const caretaker={ name:s?.name||'Caretaker' };
    if(!p){
      el.innerHTML='<div class="tenant-section-card"><p style="color:var(--muted)">No assigned property to message tenants on.</p></div>';
      return;
    }
    const viewing=!!document.querySelector('#caretakerTabBar .tab-btn[data-tab="messages"].active');
    const draft=document.getElementById('kCaretakerMsgInput')?.value||'';
    const pid=String(p.id||p.propertyId);
    const tenants=tenantRowsForProperty(pid).slice().sort((a,b)=>{
      const la=typeof nestiqChatLastInThread==='function'?nestiqChatLastInThread(window.caretakerMessages,a.tenantId||a.id):null;
      const lb=typeof nestiqChatLastInThread==='function'?nestiqChatLastInThread(window.caretakerMessages,b.tenantId||b.id):null;
      const da=typeof nestiqChatMsgDate==='function'?nestiqChatMsgDate(la)?.getTime()||0:0;
      const db=typeof nestiqChatMsgDate==='function'?nestiqChatMsgDate(lb)?.getTime()||0:0;
      return db-da;
    });
    const narrow=typeof nestiqChatIsNarrow==='function'?nestiqChatIsNarrow():false;
    const selectedId=String(window.__nestiqCaretakerChatTenantId||'');
    const listMode=narrow && (window.__nestiqCaretakerListMode!==false) && !selectedId;
    const tenant=listMode?null:(tenants.find(t=>String(t.tenantId||t.id)===selectedId)||(!narrow?tenants[0]:null)||null);
    if(tenant) window.__nestiqCaretakerChatTenantId=String(tenant.tenantId||tenant.id);
    const thread=tenant
      ? (typeof nestiqCaretakerChatThread==='function'?nestiqCaretakerChatThread(window.caretakerMessages):window.caretakerMessages||[])
          .filter(m=>String(m.tenantId)===String(tenant.tenantId||tenant.id))
          .slice()
          .sort((a,b)=>String(a.date||a.createdAt?.seconds||'').localeCompare(String(b.date||b.createdAt?.seconds||'')))
      : [];
    const listHtml=tenants.length
      ? tenants.map(t=>{
          const id=String(t.tenantId||t.id);
          const unread=caretakerUnreadForTenant(id);
          const last=typeof nestiqChatLastInThread==='function'?nestiqChatLastInThread(window.caretakerMessages,id):null;
          const row=typeof nestiqChatListRowHtml==='function'
            ? nestiqChatListRowHtml({
                person:t,
                name:t.name||'Tenant',
                last,
                unread,
                active:id===String(window.__nestiqCaretakerChatTenantId||''),
                mine:last&&last.fromRole==='caretaker',
                attrs:`onclick="nestiqCaretakerOpenTenantChat('${esc(id)}')"`
              })
            : '';
          return row;
        }).join('')
      : '<div class="nestiq-chat-empty" style="padding:32px 16px">No tenants on this property yet.</div>';
    const threadHtml=tenant && thread.length && typeof nestiqChatThreadHtml==='function'
      ? nestiqChatThreadHtml(thread,{mineRole:'caretaker',tenant,caretaker})
      : (tenant
        ? `<div class="nestiq-chat-empty nestiq-chat-empty-rich"><div class="nestiq-chat-empty-title">No messages yet</div><div>Tenants write to you here — not the landlord. Send the first note when you’re ready.</div></div>`
        : `<div class="nestiq-chat-empty nestiq-chat-empty-rich"><div class="nestiq-chat-empty-title">Your chats</div><div>Select a tenant to open the conversation.</div></div>`);
    el.innerHTML=`
      <div class="tenant-section-card nestiq-inbox-wrap">
        ${propertySwitcherHtml('kMsgPropSwitch')}
        <div class="portal-card-title" style="margin-bottom:4px">Chats</div>
        <p class="nestiq-inbox-lead">Tenants on this property message you here. Newest conversations sit at the top.</p>
        <div class="nestiq-inbox ${tenant?'is-thread':'is-list'}">
          <aside class="nestiq-wa-list" aria-label="Chats">${listHtml}</aside>
          <section class="nestiq-inbox-thread">
            ${tenant?`
              <div class="nestiq-chat-head">
                <button type="button" class="nestiq-wa-back" onclick="nestiqCaretakerChatBack()" aria-label="Back to chats">‹</button>
                ${typeof nestiqChatAvatarHtml==='function'?nestiqChatAvatarHtml(tenant,44):''}
                <div class="nestiq-chat-head-meta">
                  <div class="nestiq-chat-head-name">${esc(tenant.name||'Tenant')}</div>
                  <div class="nestiq-chat-head-sub">${esc(tenant.unit||'—')} · Tenant</div>
                </div>
              </div>
              <div class="tenant-chat-messages" id="kCaretakerThread">${threadHtml}</div>
              <div class="tenant-chat-input-bar">
                <textarea id="kCaretakerMsgInput" class="form-input" maxlength="500" placeholder="Message…" rows="1"></textarea>
                <button type="button" class="nestiq-wa-send" onclick="nestiqCaretakerSendTenantMessage('${esc(String(tenant.tenantId||tenant.id))}')">➤</button>
              </div>
            `:`<div class="tenant-chat-messages" id="kCaretakerThread">${threadHtml}</div>`}
          </section>
        </div>
      </div>`;
    const input=document.getElementById('kCaretakerMsgInput');
    if(input&&draft) input.value=draft;
    if(input) nestiqBindComposerEnter?.(input, ()=>nestiqCaretakerSendTenantMessage(String(tenant?.tenantId||tenant?.id||'')));
    const th=document.getElementById('kCaretakerThread');
    if(th) th.scrollTop=th.scrollHeight;
    if(viewing&&tenant) nestiqCaretakerMarkTenantRead(String(tenant.tenantId||tenant.id));
    nestiqUpdateCaretakerMessageBadge();
  }
  async function nestiqCaretakerMarkTenantRead(tenantId){
    const lid=sess()?.landlordId;
    const unread=(window.caretakerMessages||[]).filter(m=>String(m.tenantId)===String(tenantId)&&m.fromRole==='tenant'&&!m.read&&!m.deleted&&m.id);
    for(const m of unread){
      m.read=true;
      try{
        if(lid) await window.nestiqFs.messages(window.nestiqDb, lid).doc(String(m.id)).update({ read:true });
      }catch(_e){}
    }
    nestiqUpdateCaretakerMessageBadge();
  }
  function nestiqCaretakerOpenTenantMessage(tenantId){
    nestiqCaretakerOpenTenantChat(tenantId);
  }
  async function nestiqCaretakerSendTenantMessage(tenantId){
    const s=sess();
    const tenant=(window.caretakerTenants||[]).find(t=>String(t.tenantId||t.id)===String(tenantId));
    const input=document.getElementById('kCaretakerMsgInput')||document.getElementById('caretaker_msg_body');
    const body=(input?.value||'').trim();
    if(!tenant||!body||!s?.landlordId) return;
    const fv=firebase.firestore.FieldValue;
    const payload={
      tenantId:String(tenant.tenantId||tenant.id),
      tenantUid:tenant.portalUid||null,
      fromRole:'caretaker',
      fromName:String(s.name||'Caretaker'),
      fromUid:s.uid||s.userId||null,
      toRole:'tenant',
      message:body,
      date:new Date().toISOString(),
      read:false,
      landlordId:s.landlordId,
      propertyId:tenant.propertyId||selectedPropertyId()||null,
      createdAt:fv.serverTimestamp()
    };
    await window.nestiqFs.messages(window.nestiqDb,s.landlordId).add(payload);
    if(input) input.value='';
    window.caretakerMessages=Array.isArray(window.caretakerMessages)?window.caretakerMessages:[];
    window.caretakerMessages.push({ id:'local-'+Date.now(), ...payload, createdAt:null });
    nestiqShowNotif?.('Message sent','success');
    renderCaretakerMessages();
  }
  function nestiqCaretakerStartInspection(){
    try{
      window.__nestiqCaretakerInspectionMode=true;
      syncInspectionsForCaretaker();
      openNewInspectionModal?.();
    }catch(_e){
      nestiqShowNotif?.('Inspection form is unavailable right now','error');
    }
  }

  async function nestiqCaretakerSetPriority(jobId){
    const s=sess();
    const job=(window.caretakerMaintenance||[]).find(x=>String(x._id||x.id)===String(jobId));
    if(!s?.landlordId||!job){
      nestiqShowNotif?.('Could not update priority','error');
      return;
    }
    const next=document.getElementById(`k_pri_${jobId}`)?.value||'Medium';
    const actor=s.name||'Caretaker';
    if(typeof nestiqMaintApplyOfficialPriority==='function'){
      nestiqMaintApplyOfficialPriority(job, next, actor, 'caretaker');
    }else{
      job.priority=next;
    }
    try{
      const fv=firebase.firestore.FieldValue;
      await window.nestiqFs.maintenance(window.nestiqDb,s.landlordId).doc(String(jobId)).set({
        priority:job.priority,
        urgency:job.urgency||job.priority,
        priorityReviewedBy:job.priorityReviewedBy||actor,
        priorityReviewedByRole:'caretaker',
        priorityReviewedAt:job.priorityReviewedAt||new Date().toISOString(),
        activityLog:job.activityLog||[],
        updatedByRole:'caretaker',
        updatedByUid:s.uid||s.userId||null,
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
      nestiqShowNotif?.('Priority updated','success');
      renderCaretakerDashboard();
    }catch(err){
      console.error('Caretaker set priority', err);
      nestiqShowNotif?.('Could not save priority','error');
    }
  }

  window.nestiqSwitchCaretakerTab=nestiqSwitchCaretakerTab;
  window.nestiqCaretakerSelectProperty=nestiqCaretakerSelectProperty;
  window.renderCaretakerDashboard=renderCaretakerDashboard;
  window.renderCaretakerMessages=renderCaretakerMessages;
  window.nestiqCaretakerAssignContractor=nestiqCaretakerAssignContractor;
  window.nestiqCaretakerReportProblem=nestiqCaretakerReportProblem;
  window.nestiqCaretakerSetPriority=nestiqCaretakerSetPriority;
  window.nestiqCaretakerSwitchMaintTab=nestiqCaretakerSwitchMaintTab;
  window.nestiqCaretakerToggleCreateForm=nestiqCaretakerToggleCreateForm;
  window.nestiqCaretakerToggleCancelled=nestiqCaretakerToggleCancelled;
  window.nestiqCaretakerOpenTenantMessage=nestiqCaretakerOpenTenantMessage;
  window.nestiqCaretakerOpenTenantChat=nestiqCaretakerOpenTenantChat;
  window.nestiqCaretakerChatBack=nestiqCaretakerChatBack;
  window.nestiqCaretakerSendTenantMessage=nestiqCaretakerSendTenantMessage;
  window.nestiqCaretakerStartInspection=nestiqCaretakerStartInspection;
})();
