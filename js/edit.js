/* NestIQ Pro — edit modals for tenants, properties, expenses, maintenance */

const NESTIQ_PROVINCES=[
  'Western Cape','Gauteng','KwaZulu-Natal','Eastern Cape','Free State','Limpopo','Mpumalanga','North West','Northern Cape'
];
const NESTIQ_PROPERTY_TYPES=[
  {v:'apartment',l:'Apartment'},
  {v:'house',l:'House'},
  {v:'townhouse',l:'Townhouse'},
  {v:'duplex',l:'Duplex'},
  {v:'studio',l:'Studio'},
  {v:'penthouse',l:'Penthouse'},
  {v:'commercial',l:'Commercial'}
];
const TENANT_AMENITIES=[
  {id:'am_water',label:'Water included',value:'Water included'},
  {id:'am_elec',label:'Electricity included',value:'Electricity included'},
  {id:'am_refuse',label:'Refuse included',value:'Refuse included'},
  {id:'am_net',label:'Internet included',value:'Internet included'},
  {id:'am_park',label:'Parking included',value:'Parking included'}
];
const EXPENSE_CATS=['Maintenance','Insurance','Rates & Taxes','Utilities','Agent Fees','Other'];

function escapeEditHtml(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function clearEditErrors(root){
  const el=root||document.getElementById('modalContent');
  if(!el) return;
  el.querySelectorAll('.form-input-error').forEach(n=>n.classList.remove('form-input-error'));
  el.querySelectorAll('.field-error-msg').forEach(n=>n.remove());
}

function setFieldError(id, msg){
  const inp=document.getElementById(id);
  if(!inp) return;
  inp.classList.add('form-input-error');
  const err=document.createElement('div');
  err.className='field-error-msg';
  err.style.cssText='font-size:0.75rem;color:var(--rust);margin-top:4px';
  err.textContent=msg;
  inp.parentNode.appendChild(err);
}

function isValidEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
}

function phoneDigitsCount(v){
  return String(v||'').replace(/\D/g,'').length;
}

function nestiqAfterCoreDataEdit(){
  normalizeDataModel?.();
  saveData();
  renderTenants?.();
  renderProperties?.();
  renderKanban?.();
  renderExpenses?.();
  refreshNestiqCalendar?.();
  refreshMapMarkers?.();
  renderMapSidebar?.();
  if(document.getElementById('page-tax')?.classList.contains('active')) renderTaxReport?.();
  if(document.getElementById('page-charts')?.classList.contains('active')) initCharts?.();
  renderHomeStats?.();
}

function toDateInputValue(v){
  if(!v) return '';
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const d=new Date(s);
  if(String(d)==='Invalid Date') return '';
  return d.toISOString().slice(0,10);
}

function formatLeaseDisplayFromIso(iso){
  if(!iso) return '';
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return iso;
  return d.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'});
}

/* ─── Tenant ─── */

function openEditTenantModal(tenantId){
  const t=tenantsData.find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  const propOpts=(propertiesData||[]).map(p=>{
    const sel=Number(t.propertyId)===Number(p.id)||t.property===p.name;
    return `<option value="${p.id}" ${sel?'selected':''}>${escapeEditHtml(p.name)}</option>`;
  }).join('');
  const dueOpts=Array.from({length:28},(_,i)=>i+1).map(n=>`<option value="${n}" ${Number(t.monthlyDueDate||1)===n?'selected':''}>${n}</option>`).join('');
  const st=t.status||'vacant';
  const amenList=Array.isArray(t.amenities)?t.amenities:[];
  const amenChecks=TENANT_AMENITIES.map(a=>{
    const on=amenList.some(x=>String(x).toLowerCase()===a.value.toLowerCase());
    return `<label style="display:flex;align-items:center;gap:8px;font-size:0.86rem"><input type="checkbox" id="${a.id}" ${on?'checked':''}> ${a.label}</label>`;
  }).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Edit Tenant</h2>
    <p class="modal-sub">${escapeEditHtml(t.name)}</p>
    <div class="form-group"><label>Full Name <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_t_name" value="${escapeEditHtml(t.name)}"></div>
    <div class="form-group"><label>Email Address <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_t_email" type="email" value="${escapeEditHtml(t.email)}"></div>
    <div class="form-group"><label>Phone Number</label><input class="form-input" id="edit_t_phone" value="${escapeEditHtml(t.phone)}"></div>
    <div class="form-group"><label>Unit Number</label><input class="form-input" id="edit_t_unit" value="${escapeEditHtml(t.unit)}"></div>
    <div class="form-group"><label>Property <span style="color:var(--rust)">*</span></label><select class="form-input" id="edit_t_property">${propOpts}</select></div>
    <div class="form-group"><label>Monthly Rent (R) <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_t_rent" type="number" step="1" min="1" value="${Number(t.rent||0)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label>Lease Start Date</label><input class="form-input" id="edit_t_lease_start" type="date" value="${escapeEditHtml(toDateInputValue(t.leaseStart))}"></div>
      <div class="form-group"><label>Lease End Date</label><input class="form-input" id="edit_t_lease_end" type="date" value="${escapeEditHtml(toDateInputValue(t.leaseEnd||t.lease))}"></div>
    </div>
    <div class="form-group"><label>Monthly Due Date</label><select class="form-input" id="edit_t_due_day">${dueOpts}</select></div>
    <div class="form-group"><label>Status</label>
      <select class="form-input" id="edit_t_status">
        <option value="paid" ${st==='paid'?'selected':''}>paid</option>
        <option value="due" ${st==='due'?'selected':''}>due</option>
        <option value="overdue" ${st==='overdue'?'selected':''}>overdue</option>
        <option value="vacant" ${st==='vacant'?'selected':''}>vacant</option>
      </select>
    </div>
    <div class="form-group"><label>Deposit Amount (R)</label><input class="form-input" id="edit_t_deposit" type="number" step="1" min="0" value="${Number(typeof nestiqTenantDepositAmount==='function'?nestiqTenantDepositAmount(t):(t.deposit!=null&&typeof t.deposit==='object'?t.deposit.amount:t.deposit)||Number(t.rent||0)*2)}"></div>
    <div class="form-group"><label>Parking Bay</label><input class="form-input" id="edit_t_parking" value="${escapeEditHtml(t.parkingBay||'')}"></div>
    <div class="form-group"><label>Avatar / Emoji</label><input class="form-input" id="edit_t_avatar" maxlength="8" value="${escapeEditHtml(t.avatar||'')}"></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="edit_t_notes" rows="3">${escapeEditHtml(t.notes||'')}</textarea></div>
    <div class="form-group"><label>Amenities</label><div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">${amenChecks}</div></div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="saveEditedTenant(${t.id})">Save Changes</button>
      <button type="button" class="btn-outline btn-sm" onclick="openLogCommunicationModal(${t.id})">Log communication</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function saveEditedTenant(tenantId){
  const root=document.getElementById('modalContent');
  clearEditErrors(root);
  const t=tenantsData.find(x=>Number(x.id)===Number(tenantId));
  if(!t) return;
  const name=document.getElementById('edit_t_name')?.value?.trim()||'';
  const email=document.getElementById('edit_t_email')?.value?.trim()||'';
  const phone=document.getElementById('edit_t_phone')?.value?.trim()||'';
  const unit=document.getElementById('edit_t_unit')?.value?.trim()||'';
  const rent=Number(document.getElementById('edit_t_rent')?.value);
  const propSel=document.getElementById('edit_t_property');
  const propId=Number(propSel?.value);
  const prop=propertiesData.find(p=>Number(p.id)===propId);
  const ls=document.getElementById('edit_t_lease_start')?.value||'';
  const le=document.getElementById('edit_t_lease_end')?.value||'';
  let ok=true;
  if(!name){ setFieldError('edit_t_name','Required'); ok=false; }
  if(!email){ setFieldError('edit_t_email','Required'); ok=false; }
  else if(!isValidEmail(email)){ setFieldError('edit_t_email','Enter a valid email'); ok=false; }
  if(phone && phoneDigitsCount(phone)<10){ setFieldError('edit_t_phone','Phone must be at least 10 digits'); ok=false; }
  if(!rent||rent<=0){ setFieldError('edit_t_rent','Rent must be greater than 0'); ok=false; }
  if(!prop){ setFieldError('edit_t_property','Select a property'); ok=false; }
  if(ls && le){
    if(new Date(le)<=new Date(ls)){ setFieldError('edit_t_lease_end','Lease end must be after lease start'); ok=false; }
  }
  if(!ok) return;
  const amenities=TENANT_AMENITIES.filter(a=>document.getElementById(a.id)?.checked).map(a=>a.value);
  const av=document.getElementById('edit_t_avatar')?.value?.trim()||'👤';
  const emojiPick=([...av][0]||'👤');
  t.name=name;
  t.email=email.toLowerCase();
  t.phone=phone;
  t.unit=unit;
  t.property=prop.name;
  t.propertyId=prop.id;
  t.rent=rent;
  if(ls) t.leaseStart=ls;
  if(le){
    t.leaseEnd=le;
    t.lease=formatLeaseDisplayFromIso(le);
  }
  t.monthlyDueDate=Math.max(1,Math.min(28,Number(document.getElementById('edit_t_due_day')?.value)||1));
  t.status=document.getElementById('edit_t_status')?.value||t.status;
  const depAmt=Number(document.getElementById('edit_t_deposit')?.value);
  const amt=Number.isFinite(depAmt)&&depAmt>=0?depAmt:rent*2;
  if(typeof nestiqNormalizeTenantDeposit==='function'){
    const prev=t.deposit&&typeof t.deposit==='object'?{...t.deposit,amount:amt}:amt;
    t.deposit=nestiqNormalizeTenantDeposit(prev, rent);
  }else{
    t.deposit=amt;
  }
  t.parkingBay=document.getElementById('edit_t_parking')?.value?.trim()||'';
  t.avatar=emojiPick;
  t.notes=document.getElementById('edit_t_notes')?.value?.trim()||'';
  t.amenities=amenities.length?amenities:['Water included'];
  nestiqAfterCoreDataEdit();
  closeModal();
  showNotif(`✅ ${name} updated successfully`,'success');
}

/* ─── Property ─── */

const NESTIQ_EDIT_PROPERTY_TYPES=[
  {v:'apartment',l:'Apartment'},
  {v:'house',l:'House'},
  {v:'townhouse',l:'Townhouse'},
  {v:'bachelor',l:'Bachelor'},
  {v:'commercial',l:'Commercial'},
  {v:'other',l:'Other'}
];

let __editPropertySnapshot='';
let __editPropertyId=null;

function nestiqToggleEditSection(headerEl){
  if(!headerEl) return;
  const body=headerEl.nextElementSibling;
  const open=!headerEl.classList.contains('open');
  headerEl.classList.toggle('open',open);
  if(body) body.classList.toggle('open',open);
}

function nestiqEditSection(title,bodyHtml,openDefault=false){
  const openCls=openDefault?' open':'';
  return `<div class="nestiq-edit-section">
    <div class="nestiq-edit-section-header${openCls}" onclick="nestiqToggleEditSection(this)">
      <span>${title}</span>
      <span class="nestiq-edit-section-chevron">▶</span>
    </div>
    <div class="nestiq-edit-section-body${openCls}">${bodyHtml}</div>
  </div>`;
}

function nestiqToggleEditStandSize(){
  const type=(document.getElementById('edit_p_type')?.value||'').toLowerCase();
  const row=document.getElementById('edit_p_stand_wrap');
  if(row) row.style.display=(type==='house'||type==='townhouse')?'block':'none';
}

function nestiqToggleEditPublicListing(){
  const st=(document.getElementById('edit_p_status')?.value||'').toLowerCase();
  const row=document.getElementById('edit_p_public_wrap');
  if(row) row.style.display=st==='vacant'?'block':'none';
}

function nestiqToggleAmenityChip(btn){
  btn.classList.toggle('active');
  const id=btn.dataset.amenity;
  btn.setAttribute('aria-pressed',btn.classList.contains('active')?'true':'false');
}

function nestiqCollectEditPropertyForm(){
  const amenities=[];
  document.querySelectorAll('#edit_p_amenities .nestiq-amenity-chip.active').forEach(c=>{
    if(c.dataset.amenity) amenities.push(c.dataset.amenity);
  });
  return {
    name:document.getElementById('edit_p_name')?.value?.trim()||'',
    addr:document.getElementById('edit_p_addr')?.value?.trim()||'',
    type:document.getElementById('edit_p_type')?.value||'apartment',
    bedrooms:document.getElementById('edit_p_bed')?.value||'1',
    bathrooms:document.getElementById('edit_p_bath')?.value||'1',
    parkingBays:document.getElementById('edit_p_parking')?.value||'0',
    floorSize:document.getElementById('edit_p_floor')?.value||'',
    standSize:document.getElementById('edit_p_stand')?.value||'',
    yearBuilt:document.getElementById('edit_p_year')?.value||'',
    complexName:document.getElementById('edit_p_complex')?.value?.trim()||'',
    hoaName:document.getElementById('edit_p_hoa')?.value?.trim()||'',
    rent:document.getElementById('edit_p_rent')?.value||'',
    deposit:document.getElementById('edit_p_deposit')?.value||'',
    levy:document.getElementById('edit_p_levy')?.value||'',
    rates:document.getElementById('edit_p_rates')?.value||'',
    utilitiesIncluded:Boolean(document.getElementById('edit_p_util_inc')?.checked),
    leaseStart:document.getElementById('edit_p_lease_start')?.value||'',
    leaseEnd:document.getElementById('edit_p_lease_end')?.value||'',
    leaseType:document.getElementById('edit_p_lease_type')?.value||'fixed',
    noticePeriod:document.getElementById('edit_p_notice')?.value||'',
    status:document.getElementById('edit_p_status')?.value||'vacant',
    publicListing:Boolean(document.getElementById('edit_p_public_listing')?.checked),
    amenities,
    notes:document.getElementById('edit_p_notes')?.value||''
  };
}

function nestiqEditPropertyDirty(){
  if(!__editPropertySnapshot) return false;
  try{ return JSON.stringify(nestiqCollectEditPropertyForm())!==__editPropertySnapshot; }catch(_e){ return false; }
}

function nestiqCancelEditProperty(){
  if(nestiqEditPropertyDirty()&&!confirm('You have unsaved changes. Are you sure you want to close?')) return;
  __editPropertySnapshot='';
  __editPropertyId=null;
  closeModal();
}

function openEditPropertyModal(propertyId,expandSection){
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  __editPropertyId=p.id;
  const oldName=p.name;
  const typeVal=String(p.type||'apartment').toLowerCase();
  const typeOpts=NESTIQ_EDIT_PROPERTY_TYPES.map(x=>`<option value="${x.v}" ${typeVal===x.v?'selected':''}>${x.l}</option>`).join('');
  const bed=Number(p.bedrooms)||1;
  const bedOpts=[1,2,3,4,'5+'].map(v=>{
    const val=v==='5+'?'5+':String(v);
    const sel=(v==='5+'?bed>=5:bed===v);
    return `<option value="${val}" ${sel?'selected':''}>${val}</option>`;
  }).join('');
  const bath=Number(p.bathrooms)||1;
  const bathOpts=[1,2,3,'4+'].map(v=>{
    const val=v==='4+'?'4+':String(v);
    const sel=(v==='4+'?bath>=4:bath===v);
    return `<option value="${val}" ${sel?'selected':''}>${val}</option>`;
  }).join('');
  const amenIds=typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[];
  const amenChips=(window.NESTIQ_AMENITY_DEFS||[]).map(a=>{
    const on=amenIds.includes(a.id);
    return `<button type="button" class="nestiq-amenity-chip${on?' active':''}" data-amenity="${a.id}" aria-pressed="${on?'true':'false'}" onclick="nestiqToggleAmenityChip(this)">${a.emoji} ${a.label}</button>`;
  }).join('');
  const draftKey=String(p.id);
  if(typeof nestiqSetAmenityDraft==='function') nestiqSetAmenityDraft(draftKey,p.amenityPhotos||[]);

  const basicHtml=`
    <input type="hidden" id="edit_p_old_name" value="${escapeEditHtml(oldName)}">
    <div class="form-group"><label>Property Name <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_p_name" value="${escapeEditHtml(p.name)}"></div>
    <div class="form-group"><label>Full Address <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_p_addr" value="${escapeEditHtml(p.addr||'')}"></div>
    <div class="form-group"><label>Property Type</label><select class="form-input" id="edit_p_type" onchange="nestiqToggleEditStandSize()">${typeOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div class="form-group"><label>Bedrooms</label><select class="form-input" id="edit_p_bed">${bedOpts}</select></div>
      <div class="form-group"><label>Bathrooms</label><select class="form-input" id="edit_p_bath">${bathOpts}</select></div>
      <div class="form-group"><label>Parking Bays</label><input class="form-input" id="edit_p_parking" type="number" min="0" value="${Number(p.parkingBays||0)}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>Floor Size (m²)</label><input class="form-input" id="edit_p_floor" type="number" min="0" value="${p.floorSize!=null?p.floorSize:''}"></div>
      <div class="form-group" id="edit_p_stand_wrap"><label>Stand Size (m²)</label><input class="form-input" id="edit_p_stand" type="number" min="0" value="${p.standSize!=null?p.standSize:''}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>Year Built</label><input class="form-input" id="edit_p_year" type="number" min="1800" max="2100" value="${p.yearBuilt||''}"></div>
      <div class="form-group"><label>Complex / Estate Name</label><input class="form-input" id="edit_p_complex" value="${escapeEditHtml(p.complexName||'')}"></div>
    </div>
    <div class="form-group"><label>Body Corporate / HOA Name</label><input class="form-input" id="edit_p_hoa" value="${escapeEditHtml(p.hoaName||'')}"></div>`;

  const financialHtml=`
    <div class="form-group"><label>Monthly Rent (R) <span style="color:var(--rust)">*</span></label><input class="form-input" id="edit_p_rent" type="number" min="1" value="${Number(p.rent||0)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>Deposit Required (R)</label><input class="form-input" id="edit_p_deposit" type="number" min="0" value="${Number(p.deposit||0)}"></div>
      <div class="form-group"><label>Levy Amount (R/month)</label><input class="form-input" id="edit_p_levy" type="number" min="0" value="${Number(p.levy||0)}"></div>
    </div>
    <div class="form-group"><label>Rates & Taxes (R/month)</label><input class="form-input" id="edit_p_rates" type="number" min="0" value="${Number(p.rates||0)}"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:0.86rem;cursor:pointer"><input type="checkbox" id="edit_p_util_inc" ${p.utilitiesIncluded?'checked':''}> Water and electricity included in rent</label>`;

  const leaseHtml=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>Lease Start Date</label><input class="form-input" id="edit_p_lease_start" type="date" value="${escapeEditHtml(toDateInputValue(p.leaseStart))}"></div>
      <div class="form-group"><label>Lease End Date</label><input class="form-input" id="edit_p_lease_end" type="date" value="${escapeEditHtml(toDateInputValue(p.leaseEnd))}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>Lease Type</label><select class="form-input" id="edit_p_lease_type"><option value="fixed" ${(p.leaseType||'fixed')==='fixed'?'selected':''}>Fixed term</option><option value="month-to-month" ${p.leaseType==='month-to-month'?'selected':''}>Month to month</option></select></div>
      <div class="form-group"><label>Notice Period (days)</label><input class="form-input" id="edit_p_notice" type="number" min="0" value="${Number(p.noticePeriod||30)}"></div>
    </div>`;

  const statusHtml=`
    <div class="form-group"><label>Property Status</label>
      <select class="form-input" id="edit_p_status" onchange="nestiqToggleEditPublicListing()">
        <option value="occupied" ${p.status==='occupied'?'selected':''}>Occupied</option>
        <option value="vacant" ${p.status==='vacant'?'selected':''}>Vacant</option>
        <option value="maintenance" ${p.status==='maintenance'?'selected':''}>Maintenance</option>
      </select>
    </div>
    <div class="form-group" id="edit_p_public_wrap" style="display:${p.status==='vacant'?'block':'none'}">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer">
        <input type="checkbox" id="edit_p_public_listing" ${p.publicListing!==false?'checked':''}>
        Show on public listings
      </label>
    </div>`;

  const amenitiesHtml=`<div id="edit_p_amenities" style="display:flex;flex-wrap:wrap;gap:8px">${amenChips}</div>`;
  const notesHtml=`<div class="form-group"><label>Internal Notes</label><textarea class="form-input" id="edit_p_notes" rows="4">${escapeEditHtml(p.notes||'')}</textarea></div>`;
  const mainPhoto=typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'';
  const photosHtml=`
    <div class="form-group"><label>Main Property Photo</label>
      ${mainPhoto?`<div style="position:relative;height:140px;border-radius:14px;overflow:hidden;border:1px solid var(--border);margin-bottom:8px"><img src="${mainPhoto}" style="width:100%;height:100%;object-fit:cover" alt=""></div>`:''}
      <button type="button" class="btn-outline btn-sm" onclick="changePropertyPhoto('${String(p.id).replace(/'/g,"\\'")}')">Change Main Photo</button>
    </div>
    ${typeof nestiqAmenityUploadSectionHtml==='function'?nestiqAmenityUploadSectionHtml({dropId:'editAmenityDrop',gridId:'editAmenityGrid',countId:'editAmenityCount',inputId:'editAmenityInput'}):''}`;

  document.getElementById('modalContent').innerHTML=`
    <div class="nestiq-edit-property-modal">
      <h2 class="modal-title">Edit Property</h2>
      <p class="modal-sub">${escapeEditHtml(oldName)}</p>
      ${nestiqEditSection('Basic Details',basicHtml,true)}
      ${nestiqEditSection('Financial Details',financialHtml,false)}
      ${nestiqEditSection('Lease Details',leaseHtml,false)}
      ${nestiqEditSection('Status & Visibility',statusHtml,false)}
      ${nestiqEditSection('Amenities',amenitiesHtml,false)}
      ${nestiqEditSection('Notes',notesHtml,false)}
      ${nestiqEditSection('Photos',photosHtml,false)}
      <div class="nestiq-edit-modal-footer">
        <button type="button" class="btn-outline btn-sm" onclick="nestiqCancelEditProperty()">Cancel</button>
        <button type="button" class="btn-primary btn-sm" id="edit_p_save_btn" onclick="saveEditedProperty('${String(p.id).replace(/'/g,"\\'")}')">Save Changes</button>
      </div>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  const modal=document.querySelector('#modalOverlay .modal');
  if(modal) modal.classList.add('modal-wide');
  setTimeout(()=>{
    nestiqToggleEditStandSize();
    nestiqToggleEditPublicListing();
    if(typeof nestiqInitAmenityDropZone==='function'){
      nestiqInitAmenityDropZone({key:draftKey,dropId:'editAmenityDrop',gridId:'editAmenityGrid',countId:'editAmenityCount',inputId:'editAmenityInput',initialPhotos:p.amenityPhotos||[]});
    }
    __editPropertySnapshot=JSON.stringify(nestiqCollectEditPropertyForm());
    if(expandSection){
      const titles={photos:'Photos',amenities:'Amenities',basic:'Basic Details',financial:'Financial Details',lease:'Lease Details',status:'Status & Visibility',notes:'Notes'};
      const label=titles[expandSection]||expandSection;
      document.querySelectorAll('.nestiq-edit-section-header').forEach(h=>{
        if(h.querySelector('span')?.textContent===label) nestiqToggleEditSection(h);
      });
    }
  },80);
}

async function saveEditedProperty(propertyId){
  const root=document.getElementById('modalContent');
  clearEditErrors(root);
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(!p) return;
  const f=nestiqCollectEditPropertyForm();
  let ok=true;
  if(!f.name){ setFieldError('edit_p_name','Required'); ok=false; }
  if(!f.addr){ setFieldError('edit_p_addr','Required'); ok=false; }
  const rent=Number(f.rent);
  if(!rent||rent<=0){ setFieldError('edit_p_rent','Rent must be greater than 0'); ok=false; }
  if(!ok) return;

  const btn=document.getElementById('edit_p_save_btn');
  const prevTxt=btn?.textContent||'Save Changes';
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="nestiq-btn-spinner"></span> Saving…'; }

  const oldName=document.getElementById('edit_p_old_name')?.value||p.name;
  const draftKey=String(propertyId);
  const amenityPhotos=typeof nestiqGetAmenityDraft==='function'?nestiqNormalizeAmenityPhotos(nestiqGetAmenityDraft(draftKey)):[];
  const bedVal=f.bedrooms==='5+'?5:Number(f.bedrooms)||1;
  const bathVal=f.bathrooms==='4+'?4:Number(f.bathrooms)||1;

  p.name=f.name;
  p.addr=f.addr;
  p.type=f.type;
  p.icon=f.type==='house'?'🏠':f.type==='townhouse'?'🏘️':'🏢';
  p.bedrooms=bedVal;
  p.bathrooms=bathVal;
  p.parkingBays=Number(f.parkingBays)||0;
  p.floorSize=f.floorSize?Number(f.floorSize):null;
  p.standSize=f.standSize?Number(f.standSize):null;
  p.yearBuilt=f.yearBuilt?Number(f.yearBuilt):null;
  p.complexName=f.complexName;
  p.hoaName=f.hoaName;
  p.rent=rent;
  p.deposit=Number(f.deposit)||0;
  p.levy=Number(f.levy)||0;
  p.rates=Number(f.rates)||0;
  p.utilitiesIncluded=f.utilitiesIncluded;
  p.leaseStart=f.leaseStart||null;
  p.leaseEnd=f.leaseEnd||null;
  p.leaseType=f.leaseType;
  p.noticePeriod=Number(f.noticePeriod)||30;
  p.status=f.status;
  p.publicListing=f.status==='vacant'?f.publicListing:false;
  p.amenities=f.amenities;
  p.amenityPhotos=amenityPhotos;
  // Never let amenity gallery overwrite / clear the saved main property photo.
  if(!p.photoUrl && propertyPhotos?.[String(propertyId)]){
    const mapped=propertyPhotos[String(propertyId)];
    const persisted=typeof nestiqPhotoUrlForFirestore==='function'?nestiqPhotoUrlForFirestore(mapped):null;
    if(persisted) p.photoUrl=persisted;
  }
  p.notes=f.notes;
  p.garage=f.amenities.includes('garage');
  p.garden=f.amenities.includes('garden');
  p.pool=f.amenities.includes('pool');
  p.petFriendly=f.amenities.includes('pets');

  if(oldName!==f.name){
    tenantsData.forEach(ten=>{ if(ten.property===oldName) ten.property=f.name; });
    expenses.forEach(e=>{ if(e.prop===oldName) e.prop=f.name; });
    maintenanceData.forEach(m=>{ if(m.property===oldName) m.property=f.name; });
  }

  try{
    if(window.nestiqUseFirestore&&window.nestiqDb&&typeof firebase!=='undefined'){
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
      if(lid){
        const ref=window.nestiqFs.properties(window.nestiqDb,lid).doc(String(propertyId));
        const payload={...p};
        delete payload.id;
        await ref.set(payload,{merge:true});
        try{ await window.nestiqSyncPublicListingMirror?.(p); }catch(_e){}
      }
    }
    saveData();
    renderProperties?.();
    if(window.currentPage==='listings') window.nestiqRenderListingsPage?.();
    __editPropertySnapshot='';
    __editPropertyId=null;
    closeModal();
    showNotif('Property updated successfully','success');
  }catch(err){
    console.error('Save property',err);
    showNotif('Failed to save property','error');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=prevTxt; }
    const modal=document.querySelector('#modalOverlay .modal');
    if(modal) modal.classList.remove('modal-wide');
  }
}

function nestiqToggleLevyRow(){
  nestiqToggleEditStandSize();
}

function nestiqTogglePublicListingRow(){
  nestiqToggleEditPublicListing();
}

/* ─── Expense ─── */

function openEditExpenseModal(expenseId){
  const e=expenses.find(x=>Number(x.id)===Number(expenseId));
  if(!e) return;
  const catOpts=EXPENSE_CATS.map(c=>{
    const esc=escapeEditHtml(c);
    return `<option value="${esc}" ${e.cat===c?'selected':''}>${esc}</option>`;
  }).join('');
  const propOpts=(propertiesData||[]).map(p=>`<option ${e.prop===p.name?'selected':''}>${escapeEditHtml(p.name)}</option>`).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Edit Expense</h2>
    <p class="modal-sub">${escapeEditHtml(e.desc)}</p>
    <div class="form-group"><label>Category</label><select class="form-input" id="edit_e_cat">${catOpts}</select></div>
    <div class="form-group"><label>Description</label><input class="form-input" id="edit_e_desc" value="${escapeEditHtml(e.desc)}"></div>
    <div class="form-group"><label>Amount (R)</label><input class="form-input" id="edit_e_amount" type="number" step="0.01" min="0" value="${Number(e.amount)}"></div>
    <div class="form-group"><label>Property</label><select class="form-input" id="edit_e_prop">${propOpts}</select></div>
    <div class="form-group"><label>Date</label><input class="form-input" id="edit_e_date" type="date" value="${escapeEditHtml(toDateInputValue(e.date))}"></div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="saveEditedExpense(${e.id})">Save Changes</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function saveEditedExpense(expenseId){
  const root=document.getElementById('modalContent');
  clearEditErrors(root);
  const e=expenses.find(x=>Number(x.id)===Number(expenseId));
  if(!e) return;
  const desc=document.getElementById('edit_e_desc')?.value?.trim()||'';
  const amt=Number(document.getElementById('edit_e_amount')?.value);
  let ok=true;
  if(!desc){ setFieldError('edit_e_desc','Required'); ok=false; }
  if(!amt||amt<=0){ setFieldError('edit_e_amount','Enter a valid amount'); ok=false; }
  if(!ok) return;
  const cat=document.getElementById('edit_e_cat')?.value||e.cat;
  e.cat=cat;
  e.desc=desc;
  e.amount=amt;
  e.prop=document.getElementById('edit_e_prop')?.value||e.prop;
  e.date=document.getElementById('edit_e_date')?.value||e.date;
  e.color=catColors[cat]||e.color||'#888';
  saveData();
  renderExpenses();
  closeModal();
  showNotif('Expense updated','success');
}

/* ─── Maintenance ─── */

function nestiqMaintResolutionVisibility(){
  const st=document.getElementById('edit_m_status')?.value||'';
  const wrap=document.getElementById('edit_m_resolution_wrap');
  if(wrap) wrap.style.display=st==='done'?'block':'none';
  if(typeof nestiqMaintCostVisibility==='function') nestiqMaintCostVisibility();
}

function openEditMaintenanceModal(maintId){
  const m=maintenanceData.find(x=>Number(x.id)===Number(maintId));
  if(!m) return;
  const propOpts=(propertiesData||[]).map(p=>{
    const sel=Number(m.propertyId)===Number(p.id)||m.property===p.name;
    return `<option ${sel?'selected':''}>${escapeEditHtml(p.name)}</option>`;
  }).join('');
  const pr=m.priority||'Medium';
  const st=m.status||'open';
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Edit Maintenance</h2>
    <p class="modal-sub">${escapeEditHtml(m.title)}</p>
    <div class="form-group"><label>Issue Title</label><input class="form-input" id="edit_m_title" value="${escapeEditHtml(m.title)}"></div>
    <div class="form-group"><label>Property</label><select class="form-input" id="edit_m_prop">${propOpts}</select></div>
    <div class="form-group"><label>Priority</label>
      <select class="form-input" id="edit_m_priority">
        <option ${pr==='High'?'selected':''}>High</option>
        <option ${pr==='Medium'?'selected':''}>Medium</option>
        <option ${pr==='Low'?'selected':''}>Low</option>
      </select>
    </div>
    <div class="form-group"><label>Status</label>
      <select class="form-input" id="edit_m_status" onchange="nestiqMaintResolutionVisibility()">
        <option value="open" ${st==='open'?'selected':''}>open</option>
        <option value="progress" ${st==='progress'?'selected':''}>progress</option>
        <option value="done" ${st==='done'?'selected':''}>done</option>
      </select>
    </div>
    <div class="form-group"><label>Description</label><textarea class="form-input" id="edit_m_desc" rows="3">${escapeEditHtml(m.description||'')}</textarea></div>
    <div class="form-group"><label>Date</label><input class="form-input" id="edit_m_date" type="date" value="${escapeEditHtml(toDateInputValue(m.date))}"></div>
    <div class="form-group"><label>Assigned To</label><input class="form-input" id="edit_m_assign" value="${escapeEditHtml(m.assignedTo||'')}"></div>
    ${typeof nestiqMaintCostEditHtml==='function'?nestiqMaintCostEditHtml(m):''}
    <div class="form-group" id="edit_m_resolution_wrap" style="display:${st==='done'?'block':'none'}"><label>Resolution Notes</label><textarea class="form-input" id="edit_m_resolution" rows="2">${escapeEditHtml(m.resolutionNotes||'')}</textarea></div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="saveEditedMaintenance(${m.id})">Save Changes</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(()=>{ nestiqMaintResolutionVisibility(); nestiqOnMaintVendorPick?.(); },0);
}

function saveEditedMaintenance(maintId){
  const root=document.getElementById('modalContent');
  clearEditErrors(root);
  const m=maintenanceData.find(x=>Number(x.id)===Number(maintId));
  if(!m) return;
  const title=document.getElementById('edit_m_title')?.value?.trim()||'';
  if(!title){ setFieldError('edit_m_title','Required'); return; }
  const propName=document.getElementById('edit_m_prop')?.value||'';
  const prop=propertiesData.find(p=>p.name===propName);
  m.title=title;
  m.property=propName;
  m.propertyId=prop?.id||null;
  m.priority=document.getElementById('edit_m_priority')?.value||m.priority;
  m.status=document.getElementById('edit_m_status')?.value||m.status;
  m.description=document.getElementById('edit_m_desc')?.value?.trim()||'';
  const d=document.getElementById('edit_m_date')?.value;
  if(d) m.date=d;
  m.assignedTo=document.getElementById('edit_m_assign')?.value?.trim()||'';
  if(typeof nestiqApplyMaintCostFields==='function'){
    if(!nestiqApplyMaintCostFields(maintId)) return;
  }
  if(m.status==='done') m.resolutionNotes=document.getElementById('edit_m_resolution')?.value?.trim()||'';
  else m.resolutionNotes='';
  nestiqAfterCoreDataEdit();
  closeModal();
  showNotif('Maintenance updated','success');
}

window.openEditTenantModal=openEditTenantModal;
window.saveEditedTenant=saveEditedTenant;
window.openEditPropertyModal=openEditPropertyModal;
window.saveEditedProperty=saveEditedProperty;
window.nestiqCancelEditProperty=nestiqCancelEditProperty;
window.nestiqToggleEditSection=nestiqToggleEditSection;
window.nestiqToggleAmenityChip=nestiqToggleAmenityChip;
window.openEditExpenseModal=openEditExpenseModal;
window.saveEditedExpense=saveEditedExpense;
window.openEditMaintenanceModal=openEditMaintenanceModal;
window.saveEditedMaintenance=saveEditedMaintenance;
window.nestiqTogglePublicListingRow=nestiqTogglePublicListingRow;
window.nestiqToggleLevyRow=nestiqToggleLevyRow;
window.nestiqMaintResolutionVisibility=nestiqMaintResolutionVisibility;
