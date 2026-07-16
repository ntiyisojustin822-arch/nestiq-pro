function nestiqModalEscAttr(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function nestiqPropertyFirestoreErrorMessage(err, action){
  const verb=action==='load'?'load':'save';
  const code=String(err?.code||'').toLowerCase();
  const msg=String(err?.message||'').toLowerCase();
  if(code.includes('permission')||msg.includes('permission')){
    return `Could not ${verb} property — Firebase permissions blocked this. Deploy the latest firestore.rules, confirm you are signed in as a landlord, and disable App Check enforcement on Firestore until App Check is configured in the app.`;
  }
  if(code.includes('unavailable')||msg.includes('offline')){
    return `Could not ${verb} property — check your internet connection and try again.`;
  }
  if(code.includes('invalid-argument')||msg.includes('size')||msg.includes('too large')){
    return 'Property could not be saved — photos may be too large. Remove extra images and try again.';
  }
  const detail=err?.code||err?.message;
  return detail?`Failed to ${verb} property (${detail}).`:`Failed to ${verb} property. Try again.`;
}

function nestiqPushPropertyToLocalList(row){
  if(!row) return;
  if(!Array.isArray(window.propertiesData)) window.propertiesData=[];
  const exists=window.propertiesData.some(p=>String(p.id)===String(row.id));
  if(!exists) window.propertiesData.push(row);
  renderProperties?.();
  window.nestiqRenderHomeDashProps?.();
  window.updateHomeStats?.();
  refreshMapMarkers?.();
}

function buildAddTenantModalHtml(){
  const list=propertiesData||[];
  const propOpts=list.length
    ? list.map(p=>`<option value="${nestiqModalEscAttr(p.id)}">${nestiqModalEscAttr(p.name||'Property')}</option>`).join('')
    : '<option disabled value="">Add a property first</option>';
  const dueOpts=Array.from({length:28},(_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>${i+1}</option>`).join('');
  return `<h2 class="modal-title">Add Tenant</h2>
  <p class="modal-sub">Enter the new tenant's details.</p>
  <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Full Name *</label><input class="form-input" id="nt_name" placeholder="Full name"></div>
  <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Email Address *</label><input class="form-input" id="nt_email" type="email" placeholder="email@example.com"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
    <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Phone Number</label><input class="form-input" id="nt_phone" placeholder="07x xxx xxxx"></div>
    <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Unit Number</label><input class="form-input" id="nt_unit" placeholder="e.g. 4B"></div>
  </div>
  <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property *</label>
    <select class="form-input" id="nt_prop">${propOpts}</select></div>
  <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Monthly Rent (R)</label><input class="form-input" id="nt_rent" type="number" placeholder="0"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
    <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Lease Start</label><input class="form-input" id="nt_leaseStart" type="date"></div>
    <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Lease End</label><input class="form-input" id="nt_leaseEnd" type="date"></div>
  </div>
  <div class="form-group" style="margin-top:12px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Monthly Due Date</label>
    <select class="form-input" id="nt_dueDate">${dueOpts}</select></div>
  <input type="hidden" id="nt_income" value="0">
  <input type="hidden" id="nt_employment" value="">
  <input type="hidden" id="nt_refs" value="no">
  <input type="hidden" id="nt_history" value="">
  <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
    <button class="btn-outline btn-sm" onclick="runTenantScreening()">AI Screen</button>
    <span id="tenantAiLoading" style="font-size:0.8rem;color:var(--muted);display:none">Thinking...</span>
  </div>
  <div id="tenantAiResult" style="margin-top:8px"></div>
  <input type="hidden" id="nt_income" value="0">
  <input type="hidden" id="nt_employment" value="">
  <input type="hidden" id="nt_refs" value="no">
  <input type="hidden" id="nt_history" value="">
  <button class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="handleAddTenant()">Add Tenant →</button>`;
}

const modals={
  getStarted:`<h2 class="modal-title">Start Free Trial</h2><p class="modal-sub">No credit card required. Full access for 30 days.</p><div class="form-group"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Full Name</label><input class="form-input" type="text" placeholder="Your full name"></div><div class="form-group" style="margin-top:14px"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Email</label><input class="form-input" type="email" placeholder="you@example.com"></div><div class="form-group" style="margin-top:14px"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Properties</label><select class="form-input"><option>1–5 properties</option><option>6–20</option><option>21–50</option><option>50+</option></select></div><button class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="handleSignup()">Create Account →</button>`,
  addProperty:`<h2 class="modal-title">Add Property</h2><p class="modal-sub">Enter details for your new rental property.</p>
  <div class="form-group">
    <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Photo (optional)</label>
    <div id="newPropertyUploadWrap">${uploadAreaHtml({id:'newPropertyUploadArea',height:140,title:'Click to upload property photo',sub:'JPG, PNG or WebP - max 2MB',onClick:'pickNewPropertyPhoto()'})}</div>
    <button type="button" class="btn-outline btn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="pickNewPropertyPhoto()">Choose photo…</button>
  </div>
  ${typeof nestiqAmenityUploadSectionHtml==='function'?nestiqAmenityUploadSectionHtml({dropId:'newAmenityDrop',gridId:'newAmenityGrid',countId:'newAmenityCount',inputId:'newAmenityInput'}):''}
  <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property Name *</label><input class="form-input" id="new_prop_name" placeholder="e.g. Seaside Studio"></div>
  <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Full Address *</label><input class="form-input" id="new_prop_addr" placeholder="Full street address"></div>
  <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">City</label><input class="form-input" id="new_prop_city" placeholder="City"></div>
  <div class="form-group" style="margin-top:14px">
    <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Location on map <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
    <p style="font-size:0.78rem;color:var(--muted);margin:0 0 8px;line-height:1.4">Pin where the property is on the map (tenants will see this on their portal). Click the map, use your current location, or drag the pin. Address and city update when you move the pin.</p>
    <div id="new_prop_pin_map" class="nestiq-property-pin-map"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button type="button" class="btn-outline btn-sm" onclick="nestiqPinNewPropertyCurrentLocation()">Use current location</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqClearNewPropertyPin()">Clear pin</button>
    </div>
    <input type="hidden" id="new_prop_lat" value="">
    <input type="hidden" id="new_prop_lng" value="">
  </div>
  <div class="form-group" style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property Type</label><select class="form-input" id="new_prop_type"><option>Apartment</option><option>House</option><option>Townhouse</option></select></div>
    <div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Bedrooms</label><select class="form-input" id="new_prop_bedrooms">${Array.from({length:6},(_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>${i+1}</option>`).join('')}</select></div>
  </div>
  <div class="form-group" style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Monthly Rent (R) *</label><input class="form-input" id="new_prop_rent" type="number" placeholder="0"></div>
    <div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Status</label><select class="form-input" id="new_prop_status"><option value="vacant">Vacant</option><option value="occupied">Occupied</option></select></div>
  </div>
  <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Notes (optional)</label><textarea class="form-input form-textarea" id="new_prop_notes" placeholder="Internal notes"></textarea></div>
  <button class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="handleAddProperty()">Add Property →</button>`,
};

function openModal(t){
  let html=modals[t]||'';
  if(t==='addTenant') html=buildAddTenantModalHtml();
  const today=new Date().toISOString().split('T')[0];
  const mc=document.getElementById('modalContent');
  const ov=document.getElementById('modalOverlay');
  if(mc) mc.innerHTML=html;
  if(t==='addTenant'){
    const ls=document.getElementById('nt_leaseStart');
    const le=document.getElementById('nt_leaseEnd');
    if(ls&&!ls.value) ls.value=today;
  }
  if(t==='addProperty'){
    if(typeof nestiqSetAmenityDraft==='function') nestiqSetAmenityDraft('new',[]);
    setTimeout(()=>{
      if(typeof nestiqInitPropertyPinMap==='function'){
        nestiqInitPropertyPinMap('new_prop_pin_map','new_prop_lat','new_prop_lng',{});
      }
      if(typeof nestiqInitAmenityDropZone==='function'){
        nestiqInitAmenityDropZone({key:'new',dropId:'newAmenityDrop',gridId:'newAmenityGrid',countId:'newAmenityCount',inputId:'newAmenityInput',initialPhotos:[]});
      }
    },80);
  }
  if(ov){
    ov.classList.add('open');
    ov.scrollTop=0;
    const box=ov.querySelector('.modal');
    if(box) box.scrollTop=0;
  }
}
function closeModal(){
  if(typeof nestiqDestroyPropertyPinMap==='function') nestiqDestroyPropertyPinMap();
  document.querySelector('#modalOverlay .modal')?.classList.remove('modal-wide');
  document.getElementById('modalOverlay').classList.remove('open');
}
function closeModalOutside(e){if(e.target===document.getElementById('modalOverlay'))closeModal()}
function handleSignup(){
  closeModal();
  try{
    const s=typeof getSession==='function'?getSession():null;
    if(s && typeof isValidSession==='function' && isValidSession(s)){
      showNotif('You are already signed in.','info');
      return;
    }
  }catch(_e){}
  if(window.nestiqUseFirestore){
    if(typeof nestiqShowSignupForm==='function'){
      nestiqShowSignupForm();
      return;
    }
    showNotif('Sign-up is not ready. Refresh the page and try again.','error');
    return;
  }
  showNotif('Firebase is not configured. Set your project in js/firebase-config.js.','warning');
}

async function handleAddProperty(){
  const propCount = (propertiesData || []).length;
  if(typeof nestiqCheckPlanLimit === 'function' && !nestiqCheckPlanLimit('properties', propCount)){
    if(typeof nestiqShowUpgradePrompt === 'function') nestiqShowUpgradePrompt('properties');
    return;
  }
  const nameEl=document.getElementById('new_prop_name');
  const addrEl=document.getElementById('new_prop_addr');
  const cityEl=document.getElementById('new_prop_city');
  const rentEl=document.getElementById('new_prop_rent');
  const typeEl=document.getElementById('new_prop_type');
  const bedroomsEl=document.getElementById('new_prop_bedrooms');
  const statusEl=document.getElementById('new_prop_status');
  const notesEl=document.getElementById('new_prop_notes');
  const name=nameEl?nameEl.value.trim():'';
  const addr=addrEl?addrEl.value.trim():'';
  if(!name){showNotif('Enter a property name','error');return;}
  if(!addr){showNotif('Enter full address','error');return;}
  const rent=parseFloat(rentEl?rentEl.value:0)||0;
  if(!rent){showNotif('Enter monthly rent','error');return;}
  const typeMap={'Apartment':'apartment','House':'house','Townhouse':'apartment'};
  const typeVal=typeEl?typeEl.value:'Apartment';
  const status=(statusEl&&statusEl.value==='occupied')?'occupied':'vacant';
  const city=cityEl?cityEl.value.trim():'';
  const fullAddr=[addr,city].filter(Boolean).join(', ');
  const bedrooms=Math.max(1,parseInt(bedroomsEl?.value||'1',10));
  const notes=notesEl?notesEl.value.trim():'';
  const amenityPhotos=typeof nestiqGetAmenityDraft==='function'?nestiqNormalizeAmenityPhotos(nestiqGetAmenityDraft('new')):[];
  const icon=typeVal==='House'?'🏠':typeVal==='Townhouse'?'🏘️':'🏢';
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  let pinLat=null;
  let pinLng=null;
  const latRaw=document.getElementById('new_prop_lat')?.value;
  const lngRaw=document.getElementById('new_prop_lng')?.value;
  if(latRaw!=null&&lngRaw!=null&&String(latRaw).trim()!==''&&String(lngRaw).trim()!==''){
    const la=Number(latRaw);
    const lo=Number(lngRaw);
    if(Number.isFinite(la)&&Number.isFinite(lo)&&la>=-90&&la<=90&&lo>=-180&&lo<=180){
      pinLat=la;
      pinLng=lo;
    }
  }

  if(window.nestiqUseFirestore){
    const authUser=firebase?.auth?.()?.currentUser;
    if(!window.nestiqDb||!authUser){
      showNotif('Cloud sync is still starting. Wait a few seconds and try again, or refresh the page.','error');
      return;
    }
    if(!lid){
      showNotif('Could not resolve your landlord account. Sign out, sign in again, and retry.','error');
      return;
    }
    const propsCol=window.nestiqFs?.properties?.(window.nestiqDb, lid);
    if(!propsCol){
      showNotif('Property storage is not available. Refresh the page and sign in again.','error');
      return;
    }
    try{
      const row={
        name,
        addr:fullAddr,
        city,
        rent,
        status,
        type:typeMap[typeVal]||'apartment',
        icon,
        bedrooms,
        leaseEnd:status==='occupied'?'See tenant':'Available',
        notes,
        landlordId:lid,
        publicListing:status==='vacant'
      };
      if(pinLat!=null){ row.lat=pinLat; row.lng=pinLng; }
      if(fv) row.createdAt=fv.serverTimestamp();
      const docRef=await propsCol.add(row);
      const id=docRef.id;
      const localRow={ ...row, id };
      if(amenityPhotos.length) localRow.amenityPhotos=amenityPhotos;
      nestiqPushPropertyToLocalList(localRow);
      try{ await window.nestiqSyncPublicListingMirror?.(localRow); }catch(_e){}
      if(__newPropertyPhotoBase64){
        let url=__newPropertyPhotoBase64;
        if(typeof nestiqMaybeUploadPhoto==='function'){
          try{ url=await nestiqMaybeUploadPhoto(`properties/${id}/photo.jpg`,__newPropertyPhotoBase64); }catch(_e){}
        }
        propertyPhotos[String(id)]=url;
        const persisted=typeof nestiqPhotoUrlForFirestore==='function'
          ? nestiqPhotoUrlForFirestore(url)
          : (String(url).startsWith('http') ? url : null);
        if(persisted){
          await docRef.set({ photoUrl:persisted }, { merge:true });
          const added=propertiesData.find(x=>String(x.id)===String(id));
          if(added) added.photoUrl=persisted;
        }else if(String(url).startsWith('data:')){
          showNotif('Photo preview is local only. Cloud Storage did not accept the upload, so it will not appear after refresh. Deploy Storage rules and ensure your user can upload (users/{uid} role landlord).','warning');
        }
        __newPropertyPhotoBase64='';
      }
      if(amenityPhotos.length){
        try{
          await docRef.set({ amenityPhotos }, { merge:true });
        }catch(amenityErr){
          console.warn('NestIQ: amenity photos persist', amenityErr);
          showNotif('Property saved, but amenity photos were too large for cloud sync. Edit the property to re-add smaller photos.','warning');
        }
      }
      if(typeof nestiqSetAmenityDraft==='function') nestiqSetAmenityDraft('new',[]);
      closeModal();
      showNotif('🏠 Property added!','success');
      addBellNotif('🏠',`New property added: ${name}`);
      return;
    }catch(err){
      console.error('Add property',err);
      showNotif(nestiqPropertyFirestoreErrorMessage(err,'save'),'error');
      return;
    }
  }

  const id=Date.now();
  const localRow={
    id,
    name,
    addr:fullAddr,
    city,
    rent,
    status,
    type:typeMap[typeVal]||'apartment',
    icon,
    bedrooms,
    leaseEnd:status==='occupied'?'See tenant':'Available',
    notes,
    landlordId:lid||undefined,
    publicListing:status==='vacant'
  };
  if(amenityPhotos.length) localRow.amenityPhotos=amenityPhotos;
  if(pinLat!=null){ localRow.lat=pinLat; localRow.lng=pinLng; }
  else{ localRow.lat=null; localRow.lng=null; }
  propertiesData.push(localRow);
  if(__newPropertyPhotoBase64){
    let url=__newPropertyPhotoBase64;
    if(typeof nestiqMaybeUploadPhoto==='function'){
      try{ url=await nestiqMaybeUploadPhoto(`properties/${id}/photo.jpg`,__newPropertyPhotoBase64); }catch(_e){}
    }
    propertyPhotos[String(id)]=url;
    const added=propertiesData.find(x=>x.id===id);
    if(added && (typeof nestiqPhotoUrlForFirestore==='function' ? nestiqPhotoUrlForFirestore(url) : String(url).startsWith('http'))){
      const pv=typeof nestiqPhotoUrlForFirestore==='function' ? nestiqPhotoUrlForFirestore(url) : url;
      if(pv) added.photoUrl=pv;
    }
    __newPropertyPhotoBase64='';
  }
  if(typeof nestiqSetAmenityDraft==='function') nestiqSetAmenityDraft('new',[]);
  saveData();
  closeModal();
  showNotif('🏠 Property added successfully!','success');
  addBellNotif('🏠',`New property added: ${name}`);
  if(document.getElementById('page-properties')?.classList.contains('active')) renderProperties();
  refreshMapMarkers?.();
}

modals.shortcuts=`<h2 class="modal-title">Keyboard Shortcuts</h2>
  <p class="modal-sub">Use these shortcuts for lightning-fast navigation.</p>
  <div class="shortcuts-grid">
    <div class="shortcut-item"><span>Open Command Palette</span><kbd>⌘K</kbd></div>
    <div class="shortcut-item"><span>Keyboard Shortcuts</span><kbd>?</kbd></div>
    <div class="shortcut-item"><span>Go to Home</span><kbd>H</kbd></div>
    <div class="shortcut-item"><span>Go to Properties</span><kbd>P</kbd></div>
    <div class="shortcut-item"><span>Go to Analytics</span><kbd>A</kbd></div>
    <div class="shortcut-item"><span>Go to Expenses</span><kbd>E</kbd></div>
    <div class="shortcut-item"><span>Close / Escape</span><kbd>Esc</kbd></div>
    <div class="shortcut-item"><span>Toggle Dark Mode</span><kbd>via ⌘K</kbd></div>
  </div>`;

async function handleAddTenant(){
  const tenantCount = (tenantsData || []).length;
  if(typeof nestiqCheckPlanLimit === 'function' && !nestiqCheckPlanLimit('tenants', tenantCount)){
    if(typeof nestiqShowUpgradePrompt === 'function') nestiqShowUpgradePrompt('tenants');
    return;
  }
  const name=document.getElementById('nt_name')?.value.trim()||'';
  if(!name){showNotif('Enter a name','error');return;}
  const pid=document.getElementById('nt_prop')?.value||'';
  const prop=(propertiesData||[]).find(p=>String(p.id)===String(pid));
  if(!prop){showNotif('Select a property (add one first)','error');return;}
  const propName=prop.name;
  const unit=(document.getElementById('nt_unit')?.value||'Unit').trim()||'Unit';
  const emailLc=String(document.getElementById('nt_email')?.value||'').trim().toLowerCase();
  if(!emailLc){showNotif('Enter tenant email (used for portal login)','error');return;}
  const rent=parseFloat(document.getElementById('nt_rent')?.value)||0;
  const leaseStart=document.getElementById('nt_leaseStart')?.value||new Date().toISOString().split('T')[0];
  const leaseEndRaw=document.getElementById('nt_leaseEnd')?.value||'';
  const leaseEndIso=leaseEndRaw&&/^\d{4}-\d{2}-\d{2}$/.test(leaseEndRaw)?leaseEndRaw:'2026-12-31';
  const monthlyDueDate=parseInt(document.getElementById('nt_dueDate')?.value||'1',10)||1;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const deposit=typeof nestiqNormalizeTenantDeposit==='function'?nestiqNormalizeTenantDeposit(null,rent):rent*2;

  const baseTenant={
    name,
    property:propName,
    propertyId:prop.id,
    unit,
    rent,
    status:'due',
    lease:leaseEndRaw||'TBD',
    leaseStart,
    leaseEnd:leaseEndIso,
    monthlyDueDate,
    payments:[],
    phone:document.getElementById('nt_phone')?.value.trim()||'',
    email:emailLc,
    avatar:'👤',
    notes:'',
    unitPassword:String(unit).toLowerCase().replace(/^unit\s*/,'').replace(/\s+/g,''),
    landlordId:lid||undefined,
    hasPortalAccess:false,
    firstLogin:false,
    deposit
  };

  let newTenant={ ...baseTenant };

  if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
    try{
      const row={ ...baseTenant };
      delete row.payments;
      if(fv) row.createdAt=fv.serverTimestamp();
      const lid=window.nestiqCurrentLandlordUid?.();
      let fireId=null;
      if(typeof window.nestiqCreateTenantDocInFirestore==='function'){
        fireId=await window.nestiqCreateTenantDocInFirestore(baseTenant);
      }else{
        const docRef=await window.nestiqFs.tenants(window.nestiqDb, lid).add({ ...row, landlordId: lid });
        fireId=docRef.id;
      }
      newTenant={ ...baseTenant, id:fireId };
      if(!Array.isArray(tenantsData)) tenantsData=[];
      if(!tenantsData.some(t=>String(t.id)===String(newTenant.id))){
        tenantsData.push(newTenant);
      }
      try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    }catch(err){
      console.error('Add tenant',err);
      showNotif('Failed to add tenant: '+(err?.message||'unknown'),'error');
      return;
    }
  }else{
    newTenant={ ...baseTenant, id:tenantNextId++ };
    tenantsData.push(newTenant);
    saveData();
  }

  if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
    try{ await window.nestiqPersistSingleTenantToFirestore(newTenant); }catch(e){ console.warn('NestIQ: tenant Firestore sync',e); }
  }

  if(typeof window.nestiqMarkApplicationsApprovedForTenant==='function'){
    try{ await window.nestiqMarkApplicationsApprovedForTenant(newTenant,{ email:emailLc }); }catch(_e){}
  }

  if(window.nestiqUseFirestore && typeof window.createTenantAuthAccount==='function'&&!window.nestiqAfterTenantAddedFlow){
    const prov=await window.createTenantAuthAccount(newTenant);
    if(prov&&!prov.ok) showNotif('Tenant saved. Firebase account may already exist or auth failed — check console.','warning');
  }
  closeModal();
  renderTenants?.();
  showNotif('👤 Tenant added!','success');
  addBellNotif('👤',`New tenant added: ${name}`);
  if(window.nestiqUseFirestore && typeof window.nestiqAfterTenantAddedFlow==='function'){
    await window.nestiqAfterTenantAddedFlow(newTenant,{ sendEmail:true });
  } else {
    document.getElementById('modalContent').innerHTML=`
      <h2 class="modal-title">Tenant Added</h2>
      <p class="modal-sub">${newTenant.name}</p>
      <label style="display:flex;gap:8px;align-items:center;font-size:.84rem;margin:8px 0 14px"><input id="send_welcome_email_chk" type="checkbox" checked> Send welcome email to ${newTenant.name}?</label>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="confirmTenantWelcomeEmail(${JSON.stringify(newTenant.id)})">Continue</button>
        <button class="btn-outline btn-sm" onclick="closeModal()">Skip</button>
      </div>
    `;
    document.getElementById('modalOverlay').classList.add('open');
  }
}

async function confirmTenantWelcomeEmail(tenantId){
  const checked=Boolean(document.getElementById('send_welcome_email_chk')?.checked);
  if(checked){
    const t=tenantsData.find(x=>x.id===tenantId);
    if(t) await sendWelcomeEmail?.(t);
  }
  closeModal();
}

function renderRentAiCards(targetId, result, applyCb){
  const el=document.getElementById(targetId);
  if(!el) return;
  const min=Number(result.min||0);
  const rec=Number(result.recommended||0);
  const max=Number(result.max||0);
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)"><div style="font-size:0.72rem;color:var(--muted)">Min</div><div style="font-weight:700">R${min.toLocaleString()}</div></div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:rgba(201,168,76,0.12)"><div style="font-size:0.72rem;color:var(--muted)">Recommended</div><div style="font-weight:700;color:var(--gold)">R${rec.toLocaleString()}</div></div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)"><div style="font-size:0.72rem;color:var(--muted)">Max</div><div style="font-weight:700">R${max.toLocaleString()}</div></div>
    </div>
    <div style="font-size:0.82rem;color:var(--muted);margin-top:8px">${result.explanation||''}</div>
  `;
  const b=document.createElement('button');
  b.className='btn-primary btn-sm';
  b.style.marginTop='8px';
  b.textContent='Apply Recommended Price';
  b.onclick=applyCb;
  el.appendChild(b);
}

async function runAddPropertyAiPrice(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const loading=document.getElementById('newPropAiLoading');
  if(loading) loading.style.display='inline';
  try{
    const addr=document.getElementById('new_prop_addr')?.value||'';
    const city=(addr.split(',').pop()||'').trim()||'South Africa';
    const parsed=await suggestRentPriceAI({
      bedrooms:Number(document.getElementById('new_prop_bedrooms')?.value||1),
      type:document.getElementById('new_prop_type')?.value||'Apartment',
      address:addr||'Address not provided',
      city,
      amenities:document.getElementById('new_prop_amenities')?.value||'standard'
    });
    renderRentSuggestionCard('newPropAiResult', parsed, (val)=>{
      document.getElementById('new_prop_rent').value=Math.round(Number(val||0));
      showNotif('Recommended rent applied','success');
    });
  }catch(_err){
    showNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

async function runTenantScreening(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const loading=document.getElementById('tenantAiLoading');
  const resultEl=document.getElementById('tenantAiResult');
  if(loading) loading.style.display='inline';
  try{
    const data=await screenTenantAI({
      property:document.getElementById('nt_prop')?.value||'Property',
      name:document.getElementById('nt_name')?.value||'Applicant',
      income:Number(document.getElementById('nt_income')?.value||0),
      employment:document.getElementById('nt_employment')?.value||'',
      references:document.getElementById('nt_refs')?.value||'no',
      evictions:'no',
      yearsRenting:2,
      rent:Number(document.getElementById('nt_rent')?.value||0)
    });
    if(resultEl){
      if(!data?.ok){
        resultEl.innerHTML=aiRawFallbackCard(data?.raw||'No AI response');
        return;
      }
      const s=data.data||{};
      const score=Number(s.score||0);
      const scoreColor=score<=40?'var(--rust)':score<=65?'var(--gold)':score<=80?'var(--sage)':'#4fa36b';
      const rec=String(s.recommendation||'Conditional');
      const isDecline=rec==='Decline';
      resultEl.innerHTML=`
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--paper)">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <div style="font-size:0.82rem;color:var(--muted)">AI Screening Score</div>
            <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:${scoreColor};font-weight:700">${score}/100</div>
          </div>
          <div style="font-size:0.82rem;margin-top:6px"><span class="badge ${rec==='Approve'?'badge-green':rec==='Decline'?'badge-red':'badge-amber'}">${rec}</span> · Risk ${s.riskLevel||'Unknown'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Income Ratio:</strong> ${s.incomeRatioStatus||'—'}</div>
          <div style="font-size:0.82rem;margin-top:6px"><strong>Green Flags:</strong><br>${Array.isArray(s.greenFlags)?s.greenFlags.map(x=>`• ${x}`).join('<br>'):'—'}</div>
          <div style="font-size:0.82rem;margin-top:6px"><strong>Red Flags:</strong><br>${Array.isArray(s.redFlags)?s.redFlags.map(x=>`• ${x}`).join('<br>'):'—'}</div>
          ${Array.isArray(s.conditions)&&s.conditions.length?`<div style="font-size:0.82rem;margin-top:6px"><strong>Conditions:</strong><br>${s.conditions.map(x=>`• ${x}`).join('<br>')}</div>`:''}
          <div style="font-size:0.82rem;margin-top:6px">${s.summary||''}</div>
          ${isDecline?`<div style="font-size:0.8rem;margin-top:8px"><a href="#" onclick="return overrideTenantAiDecline(event)">Override and Add Anyway</a></div>`:''}
          ${aiAttribution()}
        </div>
      `;
      const addBtn=document.querySelector('#modalContent button.btn-primary[onclick="handleAddTenant()"]');
      if(addBtn) addBtn.disabled=isDecline;
    }
  }catch(_err){
    showNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

window.runAddPropertyAiPrice=runAddPropertyAiPrice;
window.runTenantScreening=runTenantScreening;
window.confirmTenantWelcomeEmail=confirmTenantWelcomeEmail;
window.nestiqPropertyFirestoreErrorMessage=nestiqPropertyFirestoreErrorMessage;
window.nestiqPushPropertyToLocalList=nestiqPushPropertyToLocalList;

function overrideTenantAiDecline(e){
  e?.preventDefault?.();
  const ok=confirm('Are you sure? AI assessment flagged this as high risk.');
  if(!ok) return false;
  const addBtn=document.querySelector('#modalContent button.btn-primary[onclick="handleAddTenant()"]');
  if(addBtn){ addBtn.disabled=false; }
  showNotif('Override enabled. You can proceed to add tenant.','warning');
  return false;
}
window.overrideTenantAiDecline=overrideTenantAiDecline;

