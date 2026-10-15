let activeFilter='all';
let showArchived=false;
window.showArchived=false;
/** @deprecated use showArchived — kept for any leftover callers */
let showDeactivated=false;
window.showDeactivated=false;
let propertiesViewMode='grid';
window.propertiesViewMode=propertiesViewMode;

function nestiqPropertyIsArchived(p){
  return !!(p&&(p.archived||p.deactivated));
}

function nestiqPropertyCreatedMs(p){
  if(!p) return 0;
  const v=p.createdAt!=null&&p.createdAt!==''?p.createdAt:(p.listedAt!=null&&p.listedAt!==''?p.listedAt:p.updatedAt);
  if(v==null||v==='') return 0;
  if(typeof v==='number' && Number.isFinite(v)) return v>0 && v<1e12?v*1000:v;
  if(typeof v==='string'){
    const n=Number(v);
    if(Number.isFinite(n) && n>0 && String(v).trim()!=='') return n<1e12?n*1000:n;
    const d=Date.parse(v);
    return Number.isFinite(d)?d:0;
  }
  try{
    if(typeof v.toMillis==='function') return Number(v.toMillis())||0;
    if(typeof v.toDate==='function') return Number(v.toDate().getTime())||0;
    if(typeof v.seconds==='number') return (Number(v.seconds)||0)*1000 + Math.floor((Number(v.nanoseconds)||0)/1e6);
  }catch(_e){}
  return 0;
}
window.nestiqPropertyCreatedMs=nestiqPropertyCreatedMs;

function nestiqSortPropertiesNewestFirst(list){
  return (list||[]).slice().sort((a,b)=>{
    const diff=nestiqPropertyCreatedMs(b)-nestiqPropertyCreatedMs(a);
    if(diff) return diff;
    return String(b?.id||'').localeCompare(String(a?.id||''), undefined, { numeric:true, sensitivity:'base' });
  });
}
window.nestiqSortPropertiesNewestFirst=nestiqSortPropertiesNewestFirst;

function nestiqSetPropertiesView(mode){
  propertiesViewMode=mode==='units'?'units':'grid';
  window.propertiesViewMode=propertiesViewMode;
  document.querySelectorAll('.prop-view-btn').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-view')===propertiesViewMode);
  });
  renderProperties();
}
window.nestiqSetPropertiesView=nestiqSetPropertiesView;

function nestiqToggleShowArchived(elOrOn){
  if(typeof elOrOn==='boolean'){
    showArchived=elOrOn;
  }else if(elOrOn&&elOrOn.classList){
    elOrOn.classList.toggle('active');
    showArchived=elOrOn.classList.contains('active');
  }else{
    showArchived=!showArchived;
  }
  window.showArchived=showArchived;
  showDeactivated=showArchived;
  window.showDeactivated=showArchived;
  const chip=document.getElementById('propFilterArchived');
  if(chip) chip.classList.toggle('active', showArchived);
  renderProperties();
}
window.nestiqToggleShowArchived=nestiqToggleShowArchived;

/** @deprecated alias */
function nestiqToggleShowDeactivated(on){
  nestiqToggleShowArchived(!!on);
}
window.nestiqToggleShowDeactivated=nestiqToggleShowDeactivated;

/** URL for property card / modal: in-memory map first, then Firestore fields on the row. */
function nestiqPropertyCardPhotoUrl(p){
  if(!p) return '';
  const usable=typeof nestiqUsablePhotoSrc==='function'?nestiqUsablePhotoSrc:(v)=>{
    const s=String(v==null?'':v).trim();
    if(/^https?:\/\//i.test(s)||s.startsWith('data:image/')) return s;
    return '';
  };
  const id=String(p.id);
  const fromMap=typeof propertyPhotos==='object'&&propertyPhotos?propertyPhotos[id]:'';
  return usable(fromMap)||usable(p.photoUrl)||usable(p.photoURL)||usable(p.imageUrl)||'';
}

/** Safe inside style="... url('...') ..." (URLs must not break the quoted url() token). */
function nestiqCssUrlForBackground(u){
  return String(u||'').trim().replace(/'/g,'%27');
}

/** Use inside onclick="fn(decodeURIComponent('…'))" so Firestore string ids never break HTML quotes. */
function nestiqPropIdClickArg(id){
  return encodeURIComponent(String(id==null?'':id));
}

function renderProperties(){
  const grid=document.getElementById('propertiesGrid');
  if(!grid) return;
  // Show skeleton while cloud properties are still loading — never flash "No properties yet".
  if(window.nestiqPropertiesLoading){
    nestiqShowSkeleton('propertiesGrid', 'card', 4);
    document.getElementById('noResults')?.classList.remove('show');
    const unitsEl=document.getElementById('propertiesUnitsView');
    if(unitsEl) unitsEl.style.display='none';
    const gridEl=document.getElementById('propertiesGrid');
    if(gridEl) gridEl.style.display='';
    return;
  }
  const searchEl=document.getElementById('propSearch');
  const search=searchEl?searchEl.value.toLowerCase():'';
  const list=Array.isArray(propertiesData)?propertiesData:[];
  nestiqEnsureShowArchivedChip();
  if(!list.length){
    nestiqShowEmptyState('propertiesGrid', { icon:'🏘️', title:'No properties yet', message:'Add your first property to start managing your portfolio.', action:{ label:'+ Add Property', fn:'nestiqOpenAddPropertyModal' } });
    document.getElementById('noResults')?.classList.remove('show');
    const unitsEl=document.getElementById('propertiesUnitsView');
    if(unitsEl) unitsEl.style.display='none';
    return;
  }
  let filtered=list.filter(p=>{
    const archived=nestiqPropertyIsArchived(p);
    if(archived&&!showArchived) return false;
    if(!archived&&activeFilter==='archived') return false;
    return true;
  }).filter(p=>{
    const name=String(p?.name||'');
    const addr=String(p?.addr||'');
    const matchSearch=name.toLowerCase().includes(search)||addr.toLowerCase().includes(search);
    if(activeFilter==='archived') return matchSearch&&nestiqPropertyIsArchived(p);
    const matchFilter=activeFilter==='all'||p.status===activeFilter||p.type===activeFilter;
    return matchSearch&&matchFilter;
  });
  filtered=typeof nestiqSortPropertiesNewestFirst==='function'
    ? nestiqSortPropertiesNewestFirst(filtered)
    : filtered;
  const badgeMap={occupied:'badge-green',vacant:'badge-red',due:'badge-amber',reserved:'badge-amber'};
  const labelMap={occupied:'Occupied',vacant:'Vacant',due:'Rent Due',reserved:'Reserved'};
  const bgMap={occupied:'var(--sage)',vacant:'var(--rust)',due:'var(--gold)',reserved:'var(--gold)'};
  grid.innerHTML=filtered.map(p=>{
    const rent=Number(p?.rent||0);
    const bedrooms=Number(p?.bedrooms||0);
    const name=String(p?.name||'Untitled Property');
    const addr=String(p?.addr||'No address');
    const leaseEnd=String(p?.leaseEnd||'—');
    const icon=String(p?.icon||'🏠');
    const status=(p?.status in labelMap)?p.status:'vacant';
    const idArg=nestiqPropIdClickArg(p.id);
    const propUnits=typeof nestiqUnitsForProperty==='function'?nestiqUnitsForProperty(p.id):[];
    const rentRange=typeof nestiqPropertyRentRange==='function'?nestiqPropertyRentRange(p):null;
    const rentDisplay=rentRange?.label
      ? rentRange.label.replace('/month','')
      : `R${rent.toLocaleString()}`;
    const bedsDisplay=propUnits.length
      ? (()=>{
          const beds=propUnits.map(u=>Number(u.bedrooms||0)).filter(n=>n>=0);
          if(!beds.length) return bedrooms?`${bedrooms} Bed`:'—';
          const mn=Math.min(...beds), mx=Math.max(...beds);
          return mn===mx?`${mn} Bed`:`${mn}–${mx} Bed`;
        })()
      : `${bedrooms} Bed`;
    const draftBadge=p.publishStatus==='draft'
      ? `<div style="margin-bottom:8px"><span class="badge badge-amber" style="font-size:0.72rem">Draft</span></div>`
      : '';
    let badgeHtml;
    // Multi-unit: "{occupied}/{total} occupied". Single-unit (0 or 1 docs) keeps today's vacant/occupied/due badge.
    if(propUnits.length>1){
      const stats=typeof nestiqPropertyOccupancyStats==='function'
        ? nestiqPropertyOccupancyStats(p)
        : { occupiedUnits:propUnits.filter(u=>String(u.status||'').toLowerCase()==='occupied').length, totalUnits:propUnits.length };
      const occ=stats.occupiedUnits;
      const total=stats.totalUnits||propUnits.length;
      const allOcc=occ===total;
      const noneOcc=occ===0;
      const badgeCls=allOcc?'badge-green':noneOcc?'badge-red':'badge-amber';
      const badgeBg=allOcc?'var(--sage)':noneOcc?'var(--rust)':'var(--gold)';
      badgeHtml=`<div class="prop-img-badge ${badgeCls}" style="background:${badgeBg}">${occ}/${total} occupied</div>`;
    }else{
      badgeHtml=`<div class="prop-img-badge ${badgeMap[status]}" style="background:${bgMap[status]}">${labelMap[status]}</div>`;
    }
    const imgHtml=typeof nestiqPropertyCardImageHtml==='function'
      ?nestiqPropertyCardImageHtml(p,idArg,badgeHtml)
      :`<div class="prop-img-area">${icon}${badgeHtml}</div>`;
    const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[]):'';
    const unitsRowHtml=propUnits.length>1&&typeof nestiqUnitsCardRowHtml==='function'?nestiqUnitsCardRowHtml(p):'';
    const archivedBadge=nestiqPropertyIsArchived(p)
      ? `<div style="margin-bottom:8px"><span class="badge badge-amber" style="font-size:0.72rem">Archived</span></div>`
      : '';
    return `
    <div class="prop-card" onclick="viewProperty(decodeURIComponent('${idArg}'),event)" style="${nestiqPropertyIsArchived(p)?'opacity:0.85':''}">
      <button type="button" class="card-edit-pencil" title="Edit" aria-label="Edit" data-nq-tip="Edit" onclick="event.stopPropagation();openEditPropertyModal(decodeURIComponent('${idArg}'))">✏</button>
      ${imgHtml}
      <div class="prop-body p-4">
        ${archivedBadge}${draftBadge}
        <div class="prop-card-name">${name}</div>
        <div class="prop-card-addr">📍 ${addr}</div>
        <div class="prop-meta" style="margin-top:8px">
          <div><div class="prop-meta-val text-gold font-bold">${rentDisplay}</div><div class="prop-meta-lbl">Monthly Rent</div></div>
          <div><div class="prop-meta-val">${bedsDisplay}</div><div class="prop-meta-lbl">Bedrooms</div></div>
          <div><div class="prop-meta-val">${leaseEnd}</div><div class="prop-meta-lbl">Lease End</div></div>
        </div>
        ${amenitiesHtml}
        ${unitsRowHtml}
        ${nestiqPropertyIsArchived(p)&&showArchived?`<div style="margin-top:12px"><button type="button" class="btn-gold btn-sm" onclick="event.stopPropagation();nestiqReactivateProperty(decodeURIComponent('${idArg}'))">Reactivate</button></div>`:''}
      </div>
    </div>`;
  }).join('');
  document.getElementById('noResults')?.classList.toggle('show',filtered.length===0 && propertiesViewMode!=='units');
  const gridEl=document.getElementById('propertiesGrid');
  const unitsEl=document.getElementById('propertiesUnitsView');
  if(propertiesViewMode==='units'){
    if(gridEl) gridEl.style.display='none';
    if(unitsEl){
      unitsEl.style.display='block';
      nestiqRenderUnitsMasterTable?.(filtered);
    }
  }else{
    if(gridEl) gridEl.style.display='';
    if(unitsEl) unitsEl.style.display='none';
  }
  if(typeof nestiqInitAllSlideshows==='function') nestiqInitAllSlideshows();
  if(typeof nestiqInitLazyImages==='function') nestiqInitLazyImages();
  document.querySelectorAll('.prop-img-area .prop-img-badge').forEach(b=>{
    if(!b.style.position) b.style.position='absolute';
    if(!b.style.top) b.style.top='10px';
    if(!b.style.right) b.style.right='10px';
  });
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(document.getElementById('propertiesGrid') || grid, 55);
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
}

function filterProperties(){ renderProperties(); }
function nestiqEnsureShowArchivedChip(){
  const row=document.querySelector('#page-properties .search-filters');
  if(!row) return;
  let chip=document.getElementById('propFilterArchived');
  if(!chip){
    chip=document.createElement('button');
    chip.type='button';
    chip.className='filter-chip';
    chip.id='propFilterArchived';
    chip.textContent='Show archived';
    chip.setAttribute('onclick','nestiqToggleShowArchived(this)');
    row.appendChild(chip);
  }
  chip.classList.toggle('active', !!showArchived);
  // Hide legacy checkbox if still in the page markup
  const legacy=document.getElementById('propShowDeactivatedWrap');
  if(legacy) legacy.style.display='none';
}
window.nestiqEnsureShowArchivedChip=nestiqEnsureShowArchivedChip;

/** @deprecated */
function nestiqEnsureShowDeactivatedToggle(){
  nestiqEnsureShowArchivedChip();
}
window.nestiqEnsureShowDeactivatedToggle=nestiqEnsureShowDeactivatedToggle;

function setFilter(f,el){
  activeFilter=f;
  document.querySelectorAll('#page-properties .search-filters .filter-chip').forEach(c=>{
    if(c.id==='propFilterArchived') return; // archived chip is independent
    c.classList.remove('active');
  });
  if(el&&el.id!=='propFilterArchived') el.classList.add('active');
  renderProperties();
}

async function nestiqPersistPropertyArchiveState(p){
  if(!p||p.id==null) return false;
  const archived=!!p.archived;
  p.deactivated=archived; // keep legacy edit-form field in sync
  try{ saveData?.(); }catch(_e){}
  try{
    const db=window.nestiqDb;
    const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
    const pref=window.nestiqFs?.properties?.(db, lid);
    if(window.nestiqUseFirestore&&pref){
      await pref.doc(String(p.id)).set({
        archived,
        deactivated:archived,
        publishStatus:archived?'archived':(p.publishStatus==='archived'?'published':(p.publishStatus||'published')),
        publicListing:archived?false:(p.publicListing!==false),
        updatedAt:typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp
          ? firebase.firestore.FieldValue.serverTimestamp()
          : new Date().toISOString()
      },{ merge:true });
    }
  }catch(err){
    console.warn('[NestIQ] persist archive state', err);
    nestiqShowNotif?.('Saved locally; cloud sync failed','warning');
  }
  return true;
}

async function nestiqDeactivateProperty(propertyId){
  const p=(propertiesData||[]).find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  if(!confirm('Deactivate this property?\n\nIt will be hidden from your active portfolio. Tenants, payments, and maintenance records stay linked and are not deleted.')){
    return;
  }
  p.archived=true;
  p.publishStatus='archived';
  p.publicListing=false;
  await nestiqPersistPropertyArchiveState(p);
  nestiqShowNotif?.('Property deactivated','success');
  nestiqCloseModalAnimated?.();
  renderProperties();
}
window.nestiqDeactivateProperty=nestiqDeactivateProperty;

async function nestiqReactivateProperty(propertyId){
  const p=(propertiesData||[]).find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  if(!confirm('Reactivate this property and show it in your active portfolio again?')){
    return;
  }
  p.archived=false;
  if(p.publishStatus==='archived') p.publishStatus='published';
  await nestiqPersistPropertyArchiveState(p);
  nestiqShowNotif?.('Property reactivated','success');
  nestiqCloseModalAnimated?.();
  renderProperties();
}
window.nestiqReactivateProperty=nestiqReactivateProperty;

function nestiqPaintPropertySheet(p, opts){
  opts=opts||{};
  const idArg=nestiqPropIdClickArg(p.id);
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const attr=s=>typeof nestiqEscAttr==='function'?nestiqEscAttr(s):String(s??'').replace(/"/g,'&quot;');
  const tenant=tenantsData.find(t=>(String(t.propertyId)===String(p.id) || t.property===p.name) && t.status!=='vacant');
  const tidArg=tenant?nestiqPropIdClickArg(tenant.id):'';
  const viewTenantOnclick=tenant?(`viewTenant(decodeURIComponent('${tidArg}'))`):("nestiqShowNotif('No active tenant','warning');nestiqCloseModalAnimated()");
  const waTenantOnclick=tenant?(`sendTenantWhatsAppTemplate(decodeURIComponent('${tidArg}'),'rentReminder')`):("nestiqShowNotif('No active tenant','warning');nestiqCloseModalAnimated()");
  const openMaint=(maintenanceData||[]).filter(m=>String(m.propertyId)===String(p.id) && m.status!=='done').slice(0,3);
  const galleryPhotos=typeof nestiqGetSlideshowPhotos==='function'?nestiqGetSlideshowPhotos(p):[];
  const amenitiesList=typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[];
  const amenitiesDisplay=amenitiesList.length
    ? `<div class="nestiq-prop-sheet-amenities">${typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(amenitiesList):''}</div>`
    : '';
  const unitsTableHtml=typeof nestiqRenderUnitsTable==='function'?nestiqRenderUnitsTable(p.id):'';
  const rentRange=typeof nestiqPropertyRentRange==='function'?nestiqPropertyRentRange(p):null;
  const rentLabel=rentRange?.label||(`R${Number(p.rent||0).toLocaleString()}/mo`);
  const globalLimit=Number(window.landlordSettings?.caretakerAutoApproveLimit??1000)||1000;
  const maintSettings=p.maintenanceSettings||{};
  const allowTenantReport=maintSettings.allowTenantReport!==false;
  const requireLandlordApproval=!!maintSettings.requireLandlordApproval;
  const caretakerCanManage=maintSettings.caretakerCanManage!==false;
  const repairLimit=Number.isFinite(Number(maintSettings.repairApprovalLimit))?Number(maintSettings.repairApprovalLimit):globalLimit;
  const pubStatus=p.publishStatus||(nestiqPropertyIsArchived(p)?'archived':(p.publicListing===false?'draft':'published'));
  const caretaker=opts.caretaker||null;
  const caretakerHtml=`<div class="nestiq-prop-sheet-caretaker">
        <div>
          <div class="nestiq-prop-sheet-stat-lbl">Caretaker</div>
          <div class="nestiq-prop-sheet-caretaker-name">${caretaker?esc(caretaker.name||caretaker.email||'Caretaker'):'Not assigned'}</div>
          <div class="nestiq-prop-sheet-caretaker-sub">${caretaker?esc(caretaker.email||caretaker.phone||''):'Invite a caretaker to manage day-to-day on this property.'}</div>
        </div>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenCaretakerManager(decodeURIComponent('${idArg}'))">Manage</button>
      </div>`;
  const statusPill=pubStatus==='published'?'':'<span class="nestiq-prop-sheet-pill">'+esc(pubStatus)+'</span>';
  let heroInner='';
  if(galleryPhotos.length){
    const thumbs=galleryPhotos.length>1
      ? `<div id="nestiqDetailThumbs" class="nestiq-detail-thumbs nestiq-prop-sheet-thumbs">${galleryPhotos.map((ph,i)=>`<img class="nestiq-detail-thumb${i===0?' active':''}" src="${attr(ph.base64)}" data-idx="${i}" alt="">`).join('')}</div>`
      : '';
    const heroSrc=galleryPhotos[0].base64||'';
    const heroBg=/^https?:\/\//i.test(heroSrc)?` style="background-image:url('${nestiqCssUrlForBackground(heroSrc)}')"`:'';
    heroInner=`<div class="nestiq-prop-sheet-hero-photo" id="nestiqDetailMain"${heroBg}>
        <img id="nestiqDetailMainImg" class="loaded" src="${attr(heroSrc)}" alt="" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" onerror="nestiqPropertyPhotoImgError(this)">
      </div>
      <div class="nestiq-prop-sheet-hero-fade"></div>
      <div class="nestiq-prop-sheet-hero-copy${galleryPhotos.length>1?'':' is-solo'}">
        <div class="nestiq-prop-sheet-kicker">Property ${statusPill}</div>
        <h2 class="nestiq-prop-sheet-title">${esc(p.name)}</h2>
        <p class="nestiq-prop-sheet-addr">${esc(p.addr)}</p>
      </div>
      <button type="button" class="nestiq-prop-sheet-photo-edit" onclick="openEditPropertyModal(decodeURIComponent('${idArg}'),'photos')">Edit photos</button>
      ${thumbs}`;
  }else{
    heroInner=`<div class="nestiq-prop-sheet-hero-empty">
        <span aria-hidden="true">${esc(p.icon||'🏠')}</span>
        <div class="nestiq-prop-sheet-hero-copy is-solo">
          <div class="nestiq-prop-sheet-kicker">Property ${statusPill}</div>
          <h2 class="nestiq-prop-sheet-title">${esc(p.name)}</h2>
          <p class="nestiq-prop-sheet-addr">${esc(p.addr)}</p>
        </div>
        <button type="button" class="nestiq-prop-sheet-photo-edit" onclick="changePropertyPhoto(decodeURIComponent('${idArg}'))">Add photo</button>
      </div>`;
  }
  const host=document.getElementById('modalContent');
  if(!host) return;
  host.innerHTML=`
    <div class="nestiq-prop-sheet">
      <div class="nestiq-prop-sheet-hero">${heroInner}</div>
      <div class="nestiq-prop-sheet-body">
        ${amenitiesDisplay}
        <div class="nestiq-prop-sheet-stats">
          <div class="nestiq-prop-sheet-stat"><div class="nestiq-prop-sheet-stat-lbl">Monthly rent</div><div class="nestiq-prop-sheet-stat-val is-gold">${rentLabel}</div></div>
          <div class="nestiq-prop-sheet-stat"><div class="nestiq-prop-sheet-stat-lbl">Units</div><div class="nestiq-prop-sheet-stat-val">${(typeof nestiqUnitsForProperty==='function'?nestiqUnitsForProperty(p.id):[]).length||Number(p.totalUnits||p.numberOfUnits||1)}</div></div>
          <div class="nestiq-prop-sheet-stat"><div class="nestiq-prop-sheet-stat-lbl">Type</div><div class="nestiq-prop-sheet-stat-val">${esc(p.type||'—')}</div></div>
          <div class="nestiq-prop-sheet-stat"><div class="nestiq-prop-sheet-stat-lbl">Listed</div><div class="nestiq-prop-sheet-stat-val">${esc(pubStatus)}</div></div>
        </div>
        <div class="nestiq-prop-sheet-panel" id="propSheetCaretaker">${caretakerHtml}</div>
        ${unitsTableHtml?`<div class="nestiq-prop-sheet-panel nestiq-prop-sheet-units" id="propSheetUnits"><div class="nestiq-prop-sheet-stat-lbl">Units</div>${unitsTableHtml}</div>`:'<div id="propSheetUnits"></div>'}
        ${(p.description||p.landlordNotes||p.notes)?`<div class="nestiq-prop-sheet-panel">
          ${p.description?`<div class="nestiq-prop-sheet-stat-lbl">Description</div><p class="nestiq-prop-sheet-copy">${esc(p.description)}</p>`:''}
          ${(p.landlordNotes||p.notes)?`<div class="nestiq-prop-sheet-stat-lbl">Landlord notes</div><p class="nestiq-prop-sheet-copy">${esc(p.landlordNotes||p.notes)}</p>`:''}
        </div>`:''}
        <div class="nestiq-prop-sheet-tabs-wrap">
          <div class="nestiq-prop-sheet-tabs">
            <button type="button" class="nestiq-prop-sheet-tab is-active" onclick="nestiqSwitchPropDetailTab('maint',this)">Maintenance</button>
            <button type="button" class="nestiq-prop-sheet-tab" onclick="nestiqSwitchPropDetailTab('docs',this)">Documents</button>
          </div>
          <div id="propDetailTab-maint" class="nestiq-prop-sheet-tabpanel">
            <label class="settings-toggle-row"><span>Allow tenants to report maintenance</span><input type="checkbox" id="prop_maint_tenant" ${allowTenantReport?'checked':''}></label>
            <label class="settings-toggle-row"><span>Require landlord approval</span><input type="checkbox" id="prop_maint_landlord_appr" ${requireLandlordApproval?'checked':''}></label>
            <label class="settings-toggle-row"><span>Caretaker can manage requests</span><input type="checkbox" id="prop_maint_caretaker" ${caretakerCanManage?'checked':''}></label>
            <div class="form-group" style="margin-top:12px"><label>Repair approval limit (R)</label><input class="form-input" type="number" min="0" id="prop_maint_limit" value="${repairLimit}"><div class="nestiq-prop-sheet-hint">Defaults to your global caretaker limit (R${globalLimit.toLocaleString('en-ZA')}).</div></div>
            <button type="button" class="btn-primary btn-sm" style="margin-top:10px" onclick="nestiqSavePropertyMaintenanceSettings(decodeURIComponent('${idArg}'))">Save settings</button>
            ${typeof nestiqPropertyMaintSummaryHtml==='function'?nestiqPropertyMaintSummaryHtml(p.id):`<div class="nestiq-prop-sheet-maint-list">
              <div class="nestiq-prop-sheet-stat-lbl">Open requests</div>
              ${openMaint.length?openMaint.map(m=>`<div class="nestiq-prop-sheet-maint-row">${esc(m.title)} · ${esc(m.status)}</div>`).join(''):'<div class="nestiq-prop-sheet-hint">No open requests</div>'}
            </div>`}
            <button type="button" class="btn-outline btn-sm" style="margin-top:12px" onclick="runPropertyAiPrice(decodeURIComponent('${idArg}'))">AI suggest rent</button>
            <div id="propAiLoading" class="nestiq-prop-sheet-hint" style="display:none;margin-top:8px">Thinking…</div>
            <div id="propAiResult" style="margin-top:8px"></div>
          </div>
          <div id="propDetailTab-docs" class="nestiq-prop-sheet-tabpanel" style="display:none">
            <p class="nestiq-prop-sheet-hint">Lease templates, house rules and certificates for this property.</p>
            <div class="form-group"><label>Document name</label><input class="form-input" id="prop_doc_name" placeholder="e.g. House rules"></div>
            <div class="form-group" style="margin-top:8px"><label>Type</label>
              <select class="form-input" id="prop_doc_type">
                <option>Lease Template</option><option>Property Rules</option><option>Safety Certificate</option><option>Inspection Report</option><option>Other</option>
              </select>
            </div>
            <div class="form-group" style="margin-top:8px"><label>File URL</label><input class="form-input" id="prop_doc_url" placeholder="https://..."></div>
            <button type="button" class="btn-gold btn-sm" style="margin-top:10px" onclick="nestiqSavePropertyDocument(decodeURIComponent('${idArg}'))">Add document</button>
            <div id="propDocsList" style="margin-top:12px"></div>
          </div>
        </div>
      </div>
      <div class="nestiq-prop-sheet-footer">
        <button class="btn-primary btn-sm" onclick="openEditPropertyModal(decodeURIComponent('${idArg}'))">Edit</button>
        <button class="btn-outline btn-sm" onclick="${viewTenantOnclick}">Tenant</button>
        <button class="btn-whatsapp btn-sm" onclick="${waTenantOnclick}">WhatsApp</button>
        ${nestiqPropertyIsArchived(p)
          ? `<button type="button" class="btn-gold btn-sm" onclick="nestiqReactivateProperty(decodeURIComponent('${idArg}'))">Reactivate</button>`
          : `<button type="button" class="btn-outline btn-sm nestiq-prop-sheet-danger" onclick="nestiqDeactivateProperty(decodeURIComponent('${idArg}'))">Deactivate</button>`}
      </div>
    </div>`;
  if(typeof nestiqInitDetailGallery==='function') nestiqInitDetailGallery(galleryPhotos);
  nestiqLoadPropertyDocuments?.(p.id);
}
window.nestiqPaintPropertySheet=nestiqPaintPropertySheet;

function nestiqStaggerPropertySheetUnitsOnce(){
  if(window.__nestiqPropSheetUnitsDidStagger) return;
  const wrap=document.getElementById('propSheetUnits');
  const tbody=wrap&&wrap.querySelector('tbody');
  if(!tbody||!tbody.children.length) return;
  window.__nestiqPropSheetUnitsDidStagger=true;
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(tbody, 45);
}

function nestiqStaggerPropertySheetOnce(){
  if(window.__nestiqPropSheetDidStagger) return;
  if(!document.querySelector('.nestiq-prop-sheet')) return;
  window.__nestiqPropSheetDidStagger=true;
  if(typeof nestiqStaggerChildren!=='function') return;
  const stats=document.querySelector('.nestiq-prop-sheet-stats');
  if(stats) nestiqStaggerChildren(stats, 55);
  const amen=document.querySelector('.nestiq-prop-sheet-amenities .nestiq-card-amenities')
    || document.querySelector('.nestiq-prop-sheet-amenities');
  if(amen&&amen.children.length) nestiqStaggerChildren(amen, 55);
  const tabs=document.querySelector('.nestiq-prop-sheet-tabs');
  if(tabs) nestiqStaggerChildren(tabs, 55);
  nestiqStaggerPropertySheetUnitsOnce();
}

async function viewProperty(propertyId, evt){
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  const card=(evt&&evt.target&&typeof evt.target.closest==='function')?evt.target.closest('.prop-card, .nestiq-ld-prop-card'):null;
  window.__nestiqOpenPropertyId=String(p.id);
  window.__nestiqPropSheetDidStagger=false;
  window.__nestiqPropSheetUnitsDidStagger=false;
  nestiqPaintPropertySheet(p, { caretaker:null });
  if(typeof nestiqOpenPropertySheet==='function') nestiqOpenPropertySheet(card);
  else nestiqOpenModalAnimated();
  setTimeout(nestiqStaggerPropertySheetOnce, 60);

  try{
    if(typeof nestiqEnsureUnitsForProperty==='function'){
      await nestiqEnsureUnitsForProperty(p);
    }
  }catch(err){
    console.warn('[NestIQ] nestiqEnsureUnitsForProperty', err);
  }

  try{
    const db=window.nestiqDb;
    const lid=typeof window.nestiqFs?.resolveLandlordId==='function'
      ? window.nestiqFs.resolveLandlordId()
      : (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
    const unitsCol=window.nestiqFs?.units?.(db, lid);
    if(unitsCol){
      let snap;
      try{
        snap=await unitsCol.where('propertyId','==',String(p.id)).orderBy('order').get();
      }catch(_orderErr){
        snap=await unitsCol.where('propertyId','==',String(p.id)).get();
      }
      if(typeof nestiqNormalizeUnit==='function'&&typeof nestiqReplaceUnits==='function'){
        const pid=String(p.id);
        const rows=(snap.docs||[]).map(doc=>{
          const d=doc.data()||{};
          return nestiqNormalizeUnit({ ...d, id:d.id!=null&&d.id!==''?d.id:doc.id }, pid);
        }).filter(u=>String(u.propertyId)===pid);
        const others=(typeof nestiqUnitsList==='function'?nestiqUnitsList():(window.unitsData||[]))
          .filter(u=>String(u.propertyId)!==pid);
        nestiqReplaceUnits(others.concat(rows));
      }
    }else if(typeof getPropertyUnits==='function'){
      await getPropertyUnits(p.id);
    }
  }catch(err){
    console.warn('[NestIQ] fetch property units', err);
    try{ await getPropertyUnits?.(p.id); }catch(_e){}
  }

  let caretaker=null;
  try{
    const db=window.nestiqDb;
    const lid=window.nestiqFs?.resolveLandlordId?.();
    if(db&&lid&&p.caretakerId&&window.nestiqFs?.staff){
      const snap=await window.nestiqFs.staff(db, lid).doc(String(p.caretakerId)).get();
      if(snap.exists) caretaker={ id:snap.id, ...snap.data() };
    }
  }catch(err){
    console.warn('[NestIQ] fetch caretaker', err);
  }

  if(window.__nestiqOpenPropertyId!==String(p.id)) return;
  const unitsEl=document.getElementById('propSheetUnits');
  if(unitsEl&&typeof nestiqRenderUnitsTable==='function'){
    const html=nestiqRenderUnitsTable(p.id)||'';
    if(html){
      unitsEl.className='nestiq-prop-sheet-panel nestiq-prop-sheet-units';
      unitsEl.innerHTML=`<div class="nestiq-prop-sheet-stat-lbl">Units</div>${html}`;
      nestiqStaggerPropertySheetUnitsOnce();
    }
  }
  const careEl=document.getElementById('propSheetCaretaker');
  if(careEl&&caretaker){
    const idArg=nestiqPropIdClickArg(p.id);
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    careEl.innerHTML=`<div class="nestiq-prop-sheet-caretaker">
        <div>
          <div class="nestiq-prop-sheet-stat-lbl">Caretaker</div>
          <div class="nestiq-prop-sheet-caretaker-name">${esc(caretaker.name||caretaker.email||'Caretaker')}</div>
          <div class="nestiq-prop-sheet-caretaker-sub">${esc(caretaker.email||caretaker.phone||'')}</div>
        </div>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenCaretakerManager(decodeURIComponent('${idArg}'))">Manage</button>
      </div>`;
  }
}
window.viewProperty=viewProperty;

async function runPropertyAiPrice(propertyId){
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const loading=document.getElementById('propAiLoading');
  if(loading) loading.style.display='block';
  try{
    const city=(String(p.addr||'').split(',').pop()||'').trim()||'South Africa';
    const parsed=await suggestRentPriceAI({
      bedrooms:Number(p.bedrooms||1),
      type:p.type||'apartment',
      address:p.addr||'Address not provided',
      city,
      amenities:'standard'
    });
    renderRentSuggestionCard('propAiResult', parsed, (val)=>{
      p.rent=Math.round(Number(val||p.rent||0));
      saveData();
      renderProperties();
      viewProperty(propertyId);
      nestiqShowNotif('Recommended rent applied','success');
    });
  }catch(_err){
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

window.runPropertyAiPrice=runPropertyAiPrice;

function nestiqSwitchPropDetailTab(tab,btn){
  const maint=document.getElementById('propDetailTab-maint');
  const docs=document.getElementById('propDetailTab-docs');
  if(maint) maint.style.display=tab==='maint'?'block':'none';
  if(docs) docs.style.display=tab==='docs'?'block':'none';
  if(btn&&btn.parentElement){
    btn.parentElement.querySelectorAll('.nestiq-prop-sheet-tab, button').forEach(b=>{
      b.classList.toggle('is-active', b===btn);
      if(!b.classList.contains('nestiq-prop-sheet-tab')) b.style.fontWeight=b===btn?'700':'400';
    });
  }
}
window.nestiqSwitchPropDetailTab=nestiqSwitchPropDetailTab;

async function nestiqSavePropertyMaintenanceSettings(propertyId){
  const p=(propertiesData||[]).find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  const settings={
    allowTenantReport:!!document.getElementById('prop_maint_tenant')?.checked,
    requireLandlordApproval:!!document.getElementById('prop_maint_landlord_appr')?.checked,
    caretakerCanManage:!!document.getElementById('prop_maint_caretaker')?.checked,
    repairApprovalLimit:Math.max(0,Number(document.getElementById('prop_maint_limit')?.value)||0)
  };
  p.maintenanceSettings=settings;
  try{ saveData?.(); }catch(_e){}
  try{
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(window.nestiqUseFirestore&&db&&lid){
      await window.nestiqFs.properties(db,lid).doc(String(propertyId)).set({ maintenanceSettings:settings },{ merge:true });
      // Keep caretaker mirror auto-approve in sync when present
      try{
        await window.nestiqFs.caretakerProperties?.(db,lid)?.doc(String(propertyId))?.set({
          autoApproveLimit:settings.repairApprovalLimit,
          caretakerCanManage:settings.caretakerCanManage,
          maintenanceSettings:settings
        },{ merge:true });
      }catch(_e){}
    }
  }catch(err){
    console.warn('NestIQ: save property maintenance settings', err);
    nestiqShowNotif?.('Saved locally; cloud sync failed','warning');
    return;
  }
  nestiqShowNotif?.('Maintenance settings saved','success');
}
window.nestiqSavePropertyMaintenanceSettings=nestiqSavePropertyMaintenanceSettings;

async function nestiqLoadPropertyDocuments(propertyId){
  const el=document.getElementById('propDocsList');
  if(!el) return;
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(!window.nestiqUseFirestore||!db||!lid||!window.nestiqFs?.documents){
    el.innerHTML='<div style="font-size:0.82rem;color:var(--muted)">Documents require cloud sync.</div>';
    return;
  }
  try{
    const snap=await window.nestiqFs.documents(db,lid).where('propertyId','==',String(propertyId)).where('scope','==','property').get();
    const rows=snap.docs.map(d=>({ id:d.id, ...d.data() }));
    if(!rows.length){
      el.innerHTML='<div style="font-size:0.82rem;color:var(--muted)">No property documents yet.</div>';
      return;
    }
    el.innerHTML=rows.map(d=>`<div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px">
      <div style="font-weight:600">${String(d.name||'Document').replace(/</g,'&lt;')}</div>
      <div style="font-size:0.78rem;color:var(--muted)">${String(d.type||'').replace(/</g,'&lt;')}</div>
      ${d.url?`<a href="${String(d.url).replace(/"/g,'&quot;')}" target="_blank" rel="noopener" style="font-size:0.8rem">Open</a>`:''}
    </div>`).join('');
  }catch(err){
    console.warn('NestIQ: load property documents', err);
    // Fallback without scope filter (older docs)
    try{
      const snap=await window.nestiqFs.documents(db,lid).where('propertyId','==',String(propertyId)).get();
      const rows=snap.docs.map(d=>({ id:d.id, ...d.data() })).filter(d=>d.scope==='property'||(!d.tenantId&&!d.tenantUid));
      el.innerHTML=rows.length?rows.map(d=>`<div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px"><div style="font-weight:600">${String(d.name||'Document').replace(/</g,'&lt;')}</div></div>`).join(''):'<div style="font-size:0.82rem;color:var(--muted)">No property documents yet.</div>';
    }catch(_e){
      el.innerHTML='<div style="font-size:0.82rem;color:var(--muted)">Could not load documents.</div>';
    }
  }
}
window.nestiqLoadPropertyDocuments=nestiqLoadPropertyDocuments;

async function nestiqSavePropertyDocument(propertyId){
  const name=(document.getElementById('prop_doc_name')?.value||'').trim();
  const type=(document.getElementById('prop_doc_type')?.value||'Other').trim();
  const url=(document.getElementById('prop_doc_url')?.value||'').trim();
  if(!name||!url){ nestiqShowNotif?.('Name and file URL are required','warning'); return; }
  const db=window.nestiqDb;
  const lid=window.nestiqCurrentLandlordUid?.();
  if(!window.nestiqUseFirestore||!db||!lid){ nestiqShowNotif?.('Cloud sync required to save documents','error'); return; }
  try{
    await window.nestiqFs.documents(db,lid).add({
      scope:'property',
      propertyId:String(propertyId),
      landlordId:lid,
      name,
      type,
      url,
      tenantId:null,
      tenantUid:null,
      uploadedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    nestiqShowNotif?.('Document added','success');
    if(document.getElementById('prop_doc_name')) document.getElementById('prop_doc_name').value='';
    if(document.getElementById('prop_doc_url')) document.getElementById('prop_doc_url').value='';
    await nestiqLoadPropertyDocuments(propertyId);
  }catch(err){
    console.warn('NestIQ: save property document', err);
    nestiqShowNotif?.('Could not save document','error');
  }
}
window.nestiqSavePropertyDocument=nestiqSavePropertyDocument;

