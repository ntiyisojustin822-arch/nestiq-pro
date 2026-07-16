let activeFilter='all';

/** URL for property card / modal: in-memory map first, then Firestore fields on the row. */
function nestiqPropertyCardPhotoUrl(p){
  if(!p) return '';
  const id=String(p.id);
  const fromMap=propertyPhotos[id];
  if(fromMap) return String(fromMap);
  const u=p.photoUrl||p.photoURL||p.imageUrl;
  return u?String(u):'';
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
  if(typeof nestiqDestroyAllSlideshows==='function') nestiqDestroyAllSlideshows();
  if(window.nestiqPropertiesLoading){
    grid.innerHTML=Array.from({length:3},()=>`<div class="nestiq-skel-card" style="
  background: var(--card-bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  height: 200px;
  animation: nestiqShimmer 1.5s infinite;
"></div>`).join('');
    document.getElementById('noResults')?.classList.remove('show');
    return;
  }
  const searchEl=document.getElementById('propSearch');
  const search=searchEl?searchEl.value.toLowerCase():'';
  const list=Array.isArray(propertiesData)?propertiesData:[];
  if(!list.length){
    grid.innerHTML=`
  <div style="
    grid-column: 1/-1;
    text-align: center;
    padding: 80px 40px;
    color: var(--muted);
  ">
    <div style="font-size: 3rem; margin-bottom: 16px">
      🏠
    </div>
    <div style="
      font-family: 'Playfair Display', serif;
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 8px;
    ">
      No properties yet
    </div>
    <div style="
      font-size: 0.9rem;
      margin-bottom: 28px;
      max-width: 320px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.6;
    ">
      Add your first rental property to start
      managing your portfolio
    </div>
    <button
      class="btn-primary"
      onclick="openModal('addProperty')"
    >
      + Add Your First Property
    </button>
  </div>`;
    document.getElementById('noResults')?.classList.remove('show');
    return;
  }
  let filtered=list.filter(p=>{
    const name=String(p?.name||'');
    const addr=String(p?.addr||'');
    const matchSearch=name.toLowerCase().includes(search)||addr.toLowerCase().includes(search);
    const matchFilter=activeFilter==='all'||p.status===activeFilter||p.type===activeFilter;
    return matchSearch&&matchFilter;
  });
  const badgeMap={occupied:'badge-green',vacant:'badge-red',due:'badge-amber'};
  const labelMap={occupied:'Occupied',vacant:'Vacant',due:'Rent Due'};
  const bgMap={occupied:'var(--sage)',vacant:'var(--rust)',due:'var(--gold)'};
  grid.innerHTML=filtered.map(p=>{
    const rent=Number(p?.rent||0);
    const bedrooms=Number(p?.bedrooms||0);
    const name=String(p?.name||'Untitled Property');
    const addr=String(p?.addr||'No address');
    const leaseEnd=String(p?.leaseEnd||'—');
    const icon=String(p?.icon||'🏠');
    const status=(p?.status in labelMap)?p.status:'vacant';
    const idArg=nestiqPropIdClickArg(p.id);
    const badgeHtml=`<div class="prop-img-badge rounded-full px-3 py-1 text-xs font-semibold ${badgeMap[status]}" style="background:${bgMap[status]};color:${status==='due'?'var(--ink)':'white'};z-index:11">${labelMap[status]}</div>`;
    const imgHtml=typeof nestiqPropertyCardImageHtml==='function'
      ?nestiqPropertyCardImageHtml(p,idArg,badgeHtml)
      :`<div class="prop-img-area">${icon}${badgeHtml}</div>`;
    const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[]):'';
    return `
    <div class="prop-card transition-all duration-200 hover:shadow-xl hover:scale-[1.02]" onclick="viewProperty(decodeURIComponent('${idArg}'))">
      <button type="button" class="card-edit-pencil" title="Edit" aria-label="Edit" onclick="event.stopPropagation();openEditPropertyModal(decodeURIComponent('${idArg}'))">✏</button>
      ${imgHtml}
      <div class="prop-body p-4">
        <div class="prop-card-name">${name}</div>
        <div class="prop-card-addr">📍 ${addr}</div>
        <div class="prop-meta">
          <div><div class="prop-meta-val text-gold font-bold">R${rent.toLocaleString()}</div><div class="prop-meta-lbl">Monthly Rent</div></div>
          <div><div class="prop-meta-val">${bedrooms} Bed</div><div class="prop-meta-lbl">Bedrooms</div></div>
          <div><div class="prop-meta-val">${leaseEnd}</div><div class="prop-meta-lbl">Lease End</div></div>
        </div>
        ${amenitiesHtml}
        ${status==='vacant'?`<div style="margin-top:12px"><button type="button" class="btn-gold btn-sm transition-all duration-200 hover:scale-[1.02]" onclick="event.stopPropagation();nestiqOpenApplicationLinkModal(decodeURIComponent('${idArg}'))">Create Application Link</button></div>`:''}
      </div>
    </div>`;
  }).join('');
  document.getElementById('noResults')?.classList.toggle('show',filtered.length===0);
  if(typeof nestiqInitAllSlideshows==='function') nestiqInitAllSlideshows();
  document.querySelectorAll('.prop-img-area .prop-img-badge').forEach(b=>{
    if(!b.style.position) b.style.position='absolute';
    if(!b.style.top) b.style.top='10px';
    if(!b.style.right) b.style.right='10px';
  });
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(grid, 50, '.prop-card');
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
}

function filterProperties(){ renderProperties(); }
function setFilter(f,el){
  activeFilter=f;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderProperties();
}

function viewProperty(propertyId){
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  const idArg=nestiqPropIdClickArg(p.id);
  const tenant=tenantsData.find(t=>(String(t.propertyId)===String(p.id) || t.property===p.name) && t.status!=='vacant');
  const tidArg=tenant?nestiqPropIdClickArg(tenant.id):'';
  const viewTenantOnclick=tenant?(`viewTenant(decodeURIComponent('${tidArg}'))`):("showNotif('No active tenant','warning');closeModal()");
  const waTenantOnclick=tenant?(`sendTenantWhatsAppTemplate(decodeURIComponent('${tidArg}'),'rentReminder')`):("showNotif('No active tenant','warning');closeModal()");
  const recentExpenses=(expenses||[]).filter(e=>e.prop===p.name).slice(0,3);
  const openMaint=(maintenanceData||[]).filter(m=>String(m.propertyId)===String(p.id) && m.status!=='done').slice(0,3);
  const ph=nestiqPropertyCardPhotoUrl(p);
  const galleryPhotos=typeof nestiqGetSlideshowPhotos==='function'?nestiqGetSlideshowPhotos(p):[];
  const galleryHtml=typeof nestiqDetailGalleryHtml==='function'?nestiqDetailGalleryHtml(p.id,galleryPhotos):'';
  const amenitiesList=typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[];
  const amenitiesDisplay=amenitiesList.length?`<div style="margin-top:12px"><div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">AMENITIES</div>${typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(amenitiesList):''}</div>`:'';
  const photoHtml=ph
    ? ``
    : `<div id="propModalUploadWrap">${uploadAreaHtml({id:'propModalUploadArea',height:200,title:'Click to upload property photo',sub:'JPG, PNG or WebP - max 2MB',onClick:`changePropertyPhoto(decodeURIComponent('${idArg}'))`})}</div>`;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-sub">📍 ${p.addr}</p>
    ${photoHtml}
    ${galleryHtml}
    ${amenitiesDisplay}
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn-outline btn-sm" onclick="runPropertyAiPrice(decodeURIComponent('${idArg}'))">AI Suggest Price</button></div>
    <div id="propAiLoading" style="font-size:0.8rem;color:var(--muted);margin-top:8px;display:none">Thinking...</div>
    <div id="propAiResult" style="margin-top:8px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">MONTHLY RENT</div><div style="font-weight:700;color:var(--gold)">${'R'+Number(p.rent||0).toLocaleString()}/mo</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">DEPOSIT</div><div style="font-weight:600">R${Number(p.deposit||0).toLocaleString()}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">STATUS</div><div style="font-weight:600">${p.status}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">TYPE</div><div style="font-weight:600">${p.type||'—'}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">BED / BATH</div><div style="font-weight:600">${Number(p.bedrooms||0)} bed · ${Number(p.bathrooms||0)} bath</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">PARKING</div><div style="font-weight:600">${Number(p.parkingBays||0)} bays</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">TENANT</div><div style="font-weight:600">${tenant?`${tenant.name} (${tenant.unit})`:'—'}</div></div>
      <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">LEASE END</div><div style="font-weight:600">${tenant?.leaseEnd||p.leaseEnd||'—'}</div></div>
      ${p.levy?`<div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">LEVY</div><div style="font-weight:600">R${Number(p.levy).toLocaleString()}/mo</div></div>`:''}
      ${p.floorSize?`<div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">FLOOR SIZE</div><div style="font-weight:600">${p.floorSize} m²</div></div>`:''}
    </div>
    ${p.notes?`<div style="margin-top:12px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--paper)"><div style="font-size:0.7rem;color:var(--muted);margin-bottom:4px">NOTES</div><div style="font-size:0.82rem">${String(p.notes).replace(/</g,'&lt;')}</div></div>`:''}
    <div style="margin-top:12px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:6px">Recent Expenses</div>
      ${recentExpenses.length?recentExpenses.map(e=>`<div style="font-size:.8rem;color:var(--muted);padding:3px 0">${e.date} - ${e.desc} (R${Number(e.amount||0).toLocaleString()})</div>`).join(''):'<div style="font-size:.8rem;color:var(--muted)">No recent expenses</div>'}
    </div>
    ${typeof nestiqPropertyMaintSummaryHtml==='function'?nestiqPropertyMaintSummaryHtml(p.id):`<div style="margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
      <div style="font-weight:700;margin-bottom:6px">Open Maintenance</div>
      ${openMaint.length?openMaint.map(m=>`<div style="font-size:.8rem;color:var(--muted);padding:3px 0">${m.title} - ${m.status}</div>`).join(''):'<div style="font-size:.8rem;color:var(--muted)">No open requests</div>'}
    </div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn-outline btn-sm" onclick="openEditPropertyModal(decodeURIComponent('${idArg}'))">Edit Property</button>
      <button class="btn-outline btn-sm" onclick="${viewTenantOnclick}">View Tenant</button>
      <button class="btn-outline btn-sm" onclick="showPage('expenses');closeModal()">Add Expense</button>
      <button class="btn-whatsapp btn-sm" onclick="${waTenantOnclick}">WhatsApp Tenant</button>
      ${p.status==='vacant'?`<button class="btn-gold btn-sm" onclick="closeModal();nestiqOpenApplicationLinkModal(decodeURIComponent('${idArg}'))">Create Application Link</button>`:''}
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  if(typeof nestiqInitDetailGallery==='function') nestiqInitDetailGallery(galleryPhotos);
}

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
      showNotif('Recommended rent applied','success');
    });
  }catch(_err){
    showNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

window.runPropertyAiPrice=runPropertyAiPrice;

