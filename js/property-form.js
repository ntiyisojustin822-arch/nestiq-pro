/* NestIQ Pro — redesigned Add Property wizard (property-level → unit configure) */
(function(){
  'use strict';

  const PROP_TYPES=[
    {v:'apartment',l:'Apartment'},
    {v:'apartment-building',l:'Apartment Building'},
    {v:'house',l:'House'},
    {v:'townhouse',l:'Townhouse'},
    {v:'residential-complex',l:'Residential Complex'},
    {v:'commercial',l:'Commercial'},
    {v:'other',l:'Other'}
  ];
  const PROVINCES=['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'];
  const PHOTO_CATEGORIES=['Exterior','Living room','Kitchen','Bedroom','Bathroom','Parking','Garden','Security','Other'];
  const UNIT_STATUSES=[
    {v:'available',l:'Available'},
    {v:'occupied',l:'Occupied'},
    {v:'reserved',l:'Reserved'},
    {v:'maintenance',l:'Maintenance'}
  ];

  function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function lid(){
    return typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  }
  function iconForType(t){
    const x=String(t||'').toLowerCase();
    if(x==='house') return '🏠';
    if(x==='townhouse') return '🏘️';
    if(x==='commercial') return '🏬';
    if(x==='student'||x==='residential-complex'||x==='apartment-building') return '🏢';
    return '🏢';
  }
  function buildAddr(parts){
    return [parts.street, parts.suburb, parts.city, parts.province, parts.postalCode].filter(Boolean).join(', ');
  }
  function collectAmenities(){
    return Array.from(document.querySelectorAll('#new_prop_amenity_chips .nestiq-amenity-chip.active'))
      .map(el=>el.getAttribute('data-amenity')).filter(Boolean);
  }
  function amenityChipsHtml(){
    return (window.NESTIQ_AMENITY_DEFS||[]).map(a=>
      `<button type="button" class="nestiq-amenity-chip" data-amenity="${esc(a.id)}" aria-pressed="false" onclick="nestiqToggleAmenityChip(this)">${a.emoji} ${esc(a.label)}</button>`
    ).join('');
  }
  function unitPreview(prefix, start, total){
    const pre=String(prefix||'A');
    const startN=Math.max(0,parseInt(start,10)||1);
    const n=Math.max(1,Math.min(200,parseInt(total,10)||1));
    const labels=[];
    for(let i=0;i<Math.min(n,3);i++){
      labels.push(`${pre}${String(startN+i).padStart(2,'0')}`);
    }
    if(n>3) labels.push(`… ${pre}${String(startN+n-1).padStart(2,'0')}`);
    return labels.join(', ');
  }

  function buildAddPropertyFormHtml(){
    const typeOpts=PROP_TYPES.map(t=>`<option value="${esc(t.v)}">${esc(t.l)}</option>`).join('');
    const provOpts=['<option value="">Select province</option>'].concat(PROVINCES.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`)).join('');
    const photoSection=typeof nestiqAmenityUploadSectionHtml==='function'
      ? nestiqAmenityUploadSectionHtml({
          dropId:'newAmenityDrop',gridId:'newAmenityGrid',countId:'newAmenityCount',inputId:'newAmenityInput',
          title:'Property Photos',
          sub:'General photos of the whole property (up to 20). Optional category per photo.',
          maxLabel:'20'
        })
      : '';
    return `
      <h2 class="modal-title">Add Property</h2>
      <p class="modal-sub">Property details first. Rooms share one rent by default — you can still change a unit later if needed.</p>
      <div id="nestiqAddPropStep1">
        <div class="form-group">
          <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Main Property Photo</label>
          <div id="newPropertyUploadWrap">${typeof uploadAreaHtml==='function'?uploadAreaHtml({id:'newPropertyUploadArea',height:140,title:'Click to upload main photo',sub:'JPG, PNG or WebP — max 5MB',onClick:'pickNewPropertyPhoto()'}):''}</div>
          <button type="button" class="btn-outline btn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="pickNewPropertyPhoto()">Choose main photo…</button>
        </div>
        ${photoSection}
        <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property Name *</label><input class="form-input" id="new_prop_name" placeholder="e.g. Riverside Gardens"></div>
        <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property Type</label><select class="form-input" id="new_prop_type">${typeOpts}</select></div>
        <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Street Address *</label><input class="form-input" id="new_prop_street" placeholder="Street number and name"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Suburb</label><input class="form-input" id="new_prop_suburb" placeholder="Suburb"></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">City *</label><input class="form-input" id="new_prop_city" placeholder="City"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Province *</label><select class="form-input" id="new_prop_province">${provOpts}</select></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Postal Code</label><input class="form-input" id="new_prop_postal" placeholder="e.g. 2196"></div>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Location on map <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <p style="font-size:0.78rem;color:var(--muted);margin:0 0 8px;line-height:1.4">Pin the property. Click the map, use current location, or drag the pin.</p>
          <div id="new_prop_pin_map" class="nestiq-property-pin-map"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button type="button" class="btn-outline btn-sm" onclick="nestiqPinNewPropertyCurrentLocation()">Use current location</button>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqClearNewPropertyPin()">Clear pin</button>
          </div>
          <input type="hidden" id="new_prop_lat" value="">
          <input type="hidden" id="new_prop_lng" value="">
          <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:0.86rem;cursor:pointer">
            <input type="checkbox" id="new_prop_show_exact" checked>
            Show exact location to tenants
          </label>
          <p style="font-size:0.74rem;color:var(--muted);margin:6px 0 0">When off, public listings show suburb-level location and a rounded map pin.</p>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Amenities</label>
          <div id="new_prop_amenity_chips" style="display:flex;flex-wrap:wrap;gap:8px">${amenityChipsHtml()}</div>
        </div>
        <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Property Description</label><textarea class="form-input form-textarea" id="new_prop_description" rows="3" placeholder="Public-facing description for listings"></textarea></div>
        <div class="form-group" style="margin-top:14px"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Landlord Notes</label><textarea class="form-input form-textarea" id="new_prop_landlord_notes" rows="2" placeholder="Private internal notes — never shown on public listings"></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Total Units / Rooms *</label><input class="form-input" id="new_prop_total_units" type="number" min="1" max="200" value="1" oninput="nestiqRefreshUnitNamingPreview()"></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Unit Prefix</label><input class="form-input" id="new_prop_unit_prefix" value="A" placeholder="e.g. A" oninput="nestiqRefreshUnitNamingPreview()"></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Starting Number</label><input class="form-input" id="new_prop_unit_start" type="number" min="0" value="1" oninput="nestiqRefreshUnitNamingPreview()"></div>
        </div>
        <div style="font-size:0.82rem;color:var(--muted);margin-top:6px">Preview: <strong id="new_prop_unit_preview">A01</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Rent per room (R)</label><input class="form-input" id="new_prop_default_rent" type="number" min="0" step="1" placeholder="Same for every room"></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Deposit per room (R)</label><input class="form-input" id="new_prop_default_deposit" type="number" min="0" step="1" placeholder="Usually 1 month rent"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Bedrooms per room</label><input class="form-input" id="new_prop_default_beds" type="number" min="0" step="1" value="1"></div>
          <div class="form-group"><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Bathrooms per room</label><input class="form-input" id="new_prop_default_baths" type="number" min="0" step="0.5" value="1"></div>
        </div>
        <div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--paper)">
          <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px">CARETAKER</div>
          <div style="font-weight:600">No caretaker assigned</div>
          <div style="font-size:0.8rem;color:var(--muted);margin-top:4px">You can invite a caretaker after the property is saved.</div>
          <button type="button" class="btn-outline btn-sm" style="margin-top:8px" id="new_prop_invite_caretaker_btn" disabled title="Available after the property is saved">Invite Caretaker</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">
          <button type="button" class="btn-outline" style="flex:1;justify-content:center" onclick="nestiqSavePropertyAsDraft()">Save as Draft</button>
          <button type="button" class="btn-primary" style="flex:1;justify-content:center" onclick="nestiqContinueToUnitConfig()">Continue →</button>
        </div>
      </div>
      <div id="nestiqAddPropStep2" style="display:none"></div>`;
  }

  function readPin(){
    const latRaw=document.getElementById('new_prop_lat')?.value;
    const lngRaw=document.getElementById('new_prop_lng')?.value;
    let pinLat=null, pinLng=null;
    if(latRaw!=null&&lngRaw!=null&&String(latRaw).trim()!==''&&String(lngRaw).trim()!==''){
      const la=Number(latRaw), lo=Number(lngRaw);
      if(Number.isFinite(la)&&Number.isFinite(lo)&&la>=-90&&la<=90&&lo>=-180&&lo<=180){
        pinLat=la; pinLng=lo;
      }
    }
    return {pinLat,pinLng};
  }

  function collectPropertyForm(){
    const name=(document.getElementById('new_prop_name')?.value||'').trim();
    const street=(document.getElementById('new_prop_street')?.value||'').trim();
    const suburb=(document.getElementById('new_prop_suburb')?.value||'').trim();
    const city=(document.getElementById('new_prop_city')?.value||'').trim();
    const province=(document.getElementById('new_prop_province')?.value||'').trim();
    const postalCode=(document.getElementById('new_prop_postal')?.value||'').trim();
    const type=document.getElementById('new_prop_type')?.value||'apartment';
    const description=(document.getElementById('new_prop_description')?.value||'').trim();
    const landlordNotes=(document.getElementById('new_prop_landlord_notes')?.value||'').trim();
    const totalUnits=Math.max(1,Math.min(200,parseInt(document.getElementById('new_prop_total_units')?.value||'1',10)||1));
    const unitPrefix=(document.getElementById('new_prop_unit_prefix')?.value||'A').trim()||'A';
    const unitStart=Math.max(0,parseInt(document.getElementById('new_prop_unit_start')?.value||'1',10)||1);
    const defaultRent=Number(document.getElementById('new_prop_default_rent')?.value);
    const defaultDepositRaw=Number(document.getElementById('new_prop_default_deposit')?.value);
    const defaultBeds=Number(document.getElementById('new_prop_default_beds')?.value);
    const defaultBaths=Number(document.getElementById('new_prop_default_baths')?.value);
    const sharedRent=Number.isFinite(defaultRent)&&defaultRent>0?defaultRent:0;
    const sharedDeposit=Number.isFinite(defaultDepositRaw)&&defaultDepositRaw>0?defaultDepositRaw:sharedRent;
    const showExactLocation=!!document.getElementById('new_prop_show_exact')?.checked;
    const amenities=collectAmenities();
    const amenityPhotos=typeof nestiqGetAmenityDraft==='function'?nestiqNormalizeAmenityPhotos(nestiqGetAmenityDraft('new')):[];
    const {pinLat,pinLng}=readPin();
    const addr=buildAddr({street,suburb,city,province,postalCode});
    return {
      name, street, suburb, city, province, postalCode, addr, type, description, landlordNotes,
      totalUnits, unitPrefix, unitStart, showExactLocation, amenities, amenityPhotos, pinLat, pinLng,
      defaultRent:sharedRent, defaultDeposit:sharedDeposit,
      defaultBeds:Number.isFinite(defaultBeds)?defaultBeds:0,
      defaultBaths:Number.isFinite(defaultBaths)?defaultBaths:0
    };
  }

  function validatePropertyForm(f){
    if(!f.name) return 'Enter a property name';
    if(!f.street) return 'Enter street address';
    if(!f.city) return 'Enter city';
    if(!f.province) return 'Select province';
    return null;
  }

  function seedLocalPropertyPhotos(id, localRow){
    const preview=pendingMainPhoto();
    if(preview){
      try{
        if(typeof propertyPhotos!=='undefined') propertyPhotos[String(id)]=preview;
        window.propertyPhotos=window.propertyPhotos||{};
        window.propertyPhotos[String(id)]=preview;
      }catch(_e){}
      localRow.photoUrl=preview;
    }
    if(pendingGallery.length) localRow.amenityPhotos=pendingGallery.slice();
    return localRow;
  }

  async function persistProperty(f, {publishStatus, waitForPhotos}){
    const landlordId=lid();
    const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
    const row={
      name:f.name,
      street:f.street,
      suburb:f.suburb||'',
      city:f.city,
      province:f.province,
      postalCode:f.postalCode||'',
      addr:f.addr,
      type:f.type,
      icon:iconForType(f.type),
      description:f.description||'',
      landlordNotes:f.landlordNotes||'',
      notes:f.landlordNotes||'', // legacy alias for internal notes
      amenities:f.amenities,
      totalUnits:f.totalUnits,
      numberOfUnits:f.totalUnits,
      unitPrefix:f.unitPrefix,
      unitStart:f.unitStart,
      rent:Number(f.defaultRent||0)||0,
      deposit:Number(f.defaultDeposit||0)||0,
      bedrooms:Number(f.defaultBeds||0)||0,
      bathrooms:Number(f.defaultBaths||0)||0,
      showExactLocation:f.showExactLocation!==false,
      publishStatus,
      publicListing:publishStatus==='published',
      archived:false,
      deactivated:false,
      status:'vacant', // derived occupancy placeholder; unit statuses are source of truth
      landlordId:landlordId||undefined,
      caretakerId:null,
      createdAt:fv?fv.serverTimestamp():new Date().toISOString(),
      updatedAt:fv?fv.serverTimestamp():new Date().toISOString()
    };
    if(f.pinLat!=null){ row.lat=f.pinLat; row.lng=f.pinLng; }
    else { row.lat=null; row.lng=null; }
    // Never put base64 property photos on the create payload — Firestore 1MB limit will reject the save.
    const pendingGallery=Array.isArray(f.amenityPhotos)?f.amenityPhotos.slice():[];

    function pendingMainPhoto(){
      return String(window.__newPropertyPhotoBase64||'').trim();
    }

    async function attachMainPhoto(propertyId, docRef, localRow){
      const b64=pendingMainPhoto();
      if(!b64) return localRow;
      let url=b64;
      if(typeof nestiqMaybeUploadPhoto==='function'){
        try{ url=await nestiqMaybeUploadPhoto(`properties/${propertyId}/photo.jpg`,b64); }catch(_e){}
      }
      if(typeof propertyPhotos!=='undefined') propertyPhotos[String(propertyId)]=url;
      try{ window.propertyPhotos=window.propertyPhotos||propertyPhotos; }catch(_e){}
      const persisted=typeof nestiqPhotoUrlForFirestore==='function'
        ? nestiqPhotoUrlForFirestore(url)
        : (String(url).startsWith('http')?url:null);
      if(persisted && docRef){
        await docRef.set({ photoUrl:persisted },{ merge:true });
        localRow.photoUrl=persisted;
      }else if(String(url).startsWith('data:')){
        nestiqShowNotif?.('Property saved, but the main photo stayed local only (cloud upload failed). Check Storage rules.','warning');
      }
      window.__newPropertyPhotoBase64='';
      try{ if(typeof __newPropertyPhotoBase64!=='undefined') __newPropertyPhotoBase64=''; }catch(_e){}
      return localRow;
    }

    async function attachGalleryPhotos(propertyId, docRef, localRow){
      if(!pendingGallery.length) return localRow;
      if(typeof nestiqPersistAmenityPhotos!=='function'){
        localRow.amenityPhotos=pendingGallery;
        return localRow;
      }
      try{
        const persisted=await nestiqPersistAmenityPhotos(propertyId, pendingGallery);
        // Only write URL-backed (or small) photos to Firestore
        const cloudSafe=(persisted||[]).filter(ph=>{
          const src=String(ph.base64||ph.url||'');
          return src.startsWith('http') || (src.startsWith('data:image/') && (typeof estimateBase64Size!=='function' || estimateBase64Size(src)<=550));
        });
        if(docRef && cloudSafe.length){
          await docRef.set({ amenityPhotos:cloudSafe },{ merge:true });
        }
        localRow.amenityPhotos=persisted.length?persisted:pendingGallery;
        if(persisted.length && cloudSafe.length<persisted.length){
          nestiqShowNotif?.('Some gallery photos could not be uploaded to cloud storage.','warning');
        }
      }catch(err){
        console.warn('NestIQ: property gallery persist', err);
        nestiqShowNotif?.('Property saved, but gallery photos could not be stored in the cloud.','warning');
        localRow.amenityPhotos=pendingGallery;
      }
      return localRow;
    }

    if(window.nestiqUseFirestore){
      const authUser=firebase?.auth?.()?.currentUser;
      if(!window.nestiqDb||!authUser) throw new Error('Cloud sync is still starting. Wait a few seconds and try again.');
      if(!landlordId) throw new Error('Could not resolve your landlord account. Sign out and sign in again.');
      const propsCol=window.nestiqFs?.properties?.(window.nestiqDb, landlordId);
      if(!propsCol) throw new Error('Property storage is not available.');
      if(fv){
        row.createdAt=fv.serverTimestamp();
        row.updatedAt=fv.serverTimestamp();
      }
      // Strip undefined — Firestore rejects undefined field values
      Object.keys(row).forEach(k=>{ if(row[k]===undefined) delete row[k]; });
      let docRef;
      try{
        docRef=await propsCol.add(row);
      }catch(err){
        throw new Error(typeof nestiqPropertyFirestoreErrorMessage==='function'
          ? nestiqPropertyFirestoreErrorMessage(err,'save')
          : (err?.message||'Failed to save property'));
      }
      const id=docRef.id;
      const nowMs=Date.now();
      let localRow={ ...row, id, createdAt:nowMs, updatedAt:nowMs };
      localRow=seedLocalPropertyPhotos(id, localRow);
      nestiqPushPropertyToLocalList?.(localRow);
      const photoTask=(async()=>{
        localRow=await attachMainPhoto(id, docRef, localRow);
        localRow=await attachGalleryPhotos(id, docRef, localRow);
        nestiqPushPropertyToLocalList?.(localRow);
        if(publishStatus==='published'){
          try{ await window.nestiqSyncPublicListingMirror?.(localRow); }catch(_e){}
        }
        return localRow;
      })();
      photoTask.catch(err=>console.warn('NestIQ: property photos', err));
      if(waitForPhotos!==false) await photoTask;
      return localRow;
    }

    const id=Date.now();
    let localRow={ ...row, id, createdAt:id, updatedAt:id };
    localRow=seedLocalPropertyPhotos(id, localRow);
    if(Array.isArray(window.propertiesData)) window.propertiesData.unshift(localRow);
    else window.propertiesData=[localRow];
    const photoTask=(async()=>{
      localRow=await attachMainPhoto(id, null, localRow);
      saveData?.();
      nestiqPushPropertyToLocalList?.(localRow);
      return localRow;
    })();
    photoTask.catch(err=>console.warn('NestIQ: property photos', err));
    if(waitForPhotos!==false) await photoTask;
    else saveData?.();
    return localRow;
  }

  async function nestiqSavePropertyAsDraft(){
    const f=collectPropertyForm();
    const err=validatePropertyForm(f);
    if(err){ nestiqShowNotif(err,'error'); return; }
    const propCount=(propertiesData||[]).length;
    if(typeof nestiqCheckPlanLimit==='function' && !nestiqCheckPlanLimit('properties', propCount)){
      nestiqShowUpgradePrompt?.('properties');
      return;
    }
    const btn=nestiqBtnFromEvent?.();
    nestiqSetBtnLoading?.(btn,true,'Saving...');
    try{
      const p=await persistProperty(f,{ publishStatus:'draft', waitForPhotos:false });
      nestiqSetAmenityDraft?.('new',[]);
      nestiqCloseModalAnimated?.();
      nestiqShowNotif('Draft property saved — not visible on public listings','success');
      addBellNotif?.('🏠',`Draft property: ${p.name}`);
      renderProperties?.();
    }catch(e){
      console.error(e);
      nestiqShowNotif(e?.message||'Could not save draft','error');
    }finally{
      nestiqSetBtnLoading?.(btn,false);
    }
  }

  async function nestiqContinueToUnitConfig(){
    const f=collectPropertyForm();
    const err=validatePropertyForm(f);
    if(err){ nestiqShowNotif(err,'error'); return; }
    const propCount=(propertiesData||[]).length;
    if(typeof nestiqCheckPlanLimit==='function' && !nestiqCheckPlanLimit('properties', propCount)){
      nestiqShowUpgradePrompt?.('properties');
      return;
    }
    const btn=nestiqBtnFromEvent?.();
    nestiqSetBtnLoading?.(btn,true,'Creating...');
    try{
      const p=await persistProperty(f,{ publishStatus:'draft', waitForPhotos:false });
      window.__nestiqPendingUnitConfig={
        propertyId:p.id,
        totalUnits:f.totalUnits,
        unitPrefix:f.unitPrefix,
        unitStart:f.unitStart,
        rent:f.defaultRent,
        deposit:f.defaultDeposit,
        bedrooms:f.defaultBeds,
        bathrooms:f.defaultBaths
      };
      await nestiqGenerateUnitsFromWizard(p.id, f.totalUnits, f.unitPrefix, f.unitStart, f);
      showUnitConfigStep(p);
    }catch(e){
      console.error(e);
      nestiqShowNotif(e?.message||'Could not continue','error');
    }finally{
      nestiqSetBtnLoading?.(btn,false);
    }
  }

  async function nestiqGenerateUnitsFromWizard(propertyId, total, prefix, start, defaults){
    const rent=Number(defaults?.defaultRent||0)||0;
    const deposit=Number(defaults?.defaultDeposit||0)||0;
    const bedrooms=Number(defaults?.defaultBeds||0)||0;
    const bathrooms=Number(defaults?.defaultBaths||0)||0;
    if(typeof window.nestiqGenerateUnitsForProperty==='function'){
      return window.nestiqGenerateUnitsForProperty(propertyId,{
        count:total,
        prefix,
        startNumber:start,
        status:'available',
        rent,
        deposit,
        bedrooms,
        bathrooms
      });
    }
    // Fallback to existing sync helper
    return window.nestiqSyncPropertyUnits?.(propertyId, total, prefix, rent);
  }

  function statusOptionsHtml(selected){
    return UNIT_STATUSES.map(s=>`<option value="${s.v}" ${String(selected||'available')===s.v?'selected':''}>${s.l}</option>`).join('');
  }

  function showUnitConfigStep(property){
    const step1=document.getElementById('nestiqAddPropStep1');
    const step2=document.getElementById('nestiqAddPropStep2');
    if(step1) step1.style.display='none';
    if(!step2) return;
    step2.style.display='block';
    const units=(typeof nestiqUnitsForProperty==='function'?nestiqUnitsForProperty(property.id):[]).slice()
      .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
    const pending=window.__nestiqPendingUnitConfig||{};
    const bulkRent=Number(pending.rent||units[0]?.rent||0);
    const bulkDeposit=Number(pending.deposit||units[0]?.deposit||bulkRent||0);
    const bulkBeds=Number(pending.bedrooms||units[0]?.bedrooms||2);
    const bulkBaths=Number(pending.bathrooms||units[0]?.bathrooms||1);
    const pid=esc(String(property.id));
    const rows=units.map((u,i)=>{
      const id=esc(String(u.id));
      return `<tr data-unit-id="${id}">
        <td><input class="form-input" data-field="label" value="${esc(u.label||u.unitNumber||'')}" style="min-width:72px"></td>
        <td><input class="form-input" data-field="unitType" value="${esc(u.unitType||'')}" placeholder="e.g. 2 Bedroom" style="min-width:110px"></td>
        <td><input class="form-input" data-field="bedrooms" type="number" min="0" value="${Number(u.bedrooms||0)}" style="width:70px"></td>
        <td><input class="form-input" data-field="bathrooms" type="number" min="0" step="0.5" value="${Number(u.bathrooms||0)}" style="width:70px"></td>
        <td><input class="form-input" data-field="rent" type="number" min="0" value="${Number(u.rent||0)}" style="width:90px"></td>
        <td><input class="form-input" data-field="deposit" type="number" min="0" value="${Number(u.deposit||0)}" style="width:90px"></td>
        <td><input class="form-input" data-field="maxOccupants" type="number" min="1" value="${Number(u.maxOccupants||2)}" style="width:70px"></td>
        <td><select class="form-input" data-field="status" style="min-width:110px">${statusOptionsHtml(u.status==='vacant'?'available':u.status)}</select></td>
      </tr>`;
    }).join('');
    step2.innerHTML=`
      <h3 style="font-size:1.05rem;margin:0 0 6px">Configure Units — ${esc(property.name||'Property')}</h3>
      <p style="font-size:0.82rem;color:var(--muted);margin:0 0 12px">${units.length} room(s) generated with the same rent. Change one room only if it should be different, then save to publish.</p>
      <div class="modal-section" style="padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--paper);margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:8px">Same details for all rooms</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Unit type</label><input class="form-input" id="bulk_unit_type" placeholder="2 Bedroom Apartment"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Bedrooms</label><input class="form-input" id="bulk_beds" type="number" min="0" value="${Number.isFinite(bulkBeds)?bulkBeds:2}"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Bathrooms</label><input class="form-input" id="bulk_baths" type="number" min="0" step="0.5" value="${Number.isFinite(bulkBaths)?bulkBaths:1}"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Rent (R)</label><input class="form-input" id="bulk_rent" type="number" min="0" value="${bulkRent>0?bulkRent:''}" placeholder="Same for every room"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Deposit (R)</label><input class="form-input" id="bulk_deposit" type="number" min="0" value="${bulkDeposit>0?bulkDeposit:''}"></div>
          <div class="form-group" style="margin:0"><label style="font-size:0.72rem;color:var(--muted)">Max occupants</label><input class="form-input" id="bulk_occ" type="number" min="1" value="2"></div>
        </div>
        <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="nestiqBulkApplyUnitDefaults()">Apply to all</button>
      </div>
      <div class="modal-section" style="overflow:auto;max-height:360px;border:1px solid var(--border);border-radius:10px">
        <table class="nestiq-table" id="nestiqUnitConfigTable" style="width:100%;margin:0;font-size:0.82rem">
          <thead><tr>
            <th>Unit</th><th>Type</th><th>Beds</th><th>Baths</th><th>Rent</th><th>Deposit</th><th>Max occ.</th><th>Status</th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="8" style="text-align:center;color:var(--muted)">No units</td></tr>'}</tbody>
        </table>
      </div>
      <div class="btn-row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button type="button" class="btn-outline" onclick="nestiqCloseModalAnimated()">Save later (stays draft)</button>
        <button type="button" class="btn-primary" style="flex:1;justify-content:center" onclick="nestiqSaveConfiguredUnits('${pid}')">Save Units &amp; Publish</button>
      </div>`;
    document.querySelector('#modalOverlay .modal')?.classList.add('modal-wide');
    if(typeof nestiqAnimateModalContent==='function') nestiqAnimateModalContent(step2);
    const tbody=step2.querySelector('#nestiqUnitConfigTable tbody');
    if(tbody && typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(tbody, 45);
    if(bulkRent>0) setTimeout(()=>window.nestiqBulkApplyUnitDefaults?.(true),0);
  }

  function nestiqBulkApplyUnitDefaults(silent){
    const unitType=document.getElementById('bulk_unit_type')?.value||'';
    const beds=document.getElementById('bulk_beds')?.value||'0';
    const baths=document.getElementById('bulk_baths')?.value||'0';
    const rent=document.getElementById('bulk_rent')?.value||'0';
    const deposit=document.getElementById('bulk_deposit')?.value||'0';
    const occ=document.getElementById('bulk_occ')?.value||'1';
    document.querySelectorAll('#nestiqUnitConfigTable tbody tr').forEach(tr=>{
      const set=(field,val)=>{ const el=tr.querySelector(`[data-field="${field}"]`); if(el) el.value=val; };
      if(unitType) set('unitType',unitType);
      set('bedrooms',beds);
      set('bathrooms',baths);
      set('rent',rent);
      set('deposit',deposit);
      set('maxOccupants',occ);
    });
    if(!silent) nestiqShowNotif?.('Same details applied to all rooms','success');
  }

  function findLocalProperty(propertyId){
    const lists=[];
    try{ if(Array.isArray(propertiesData)) lists.push(propertiesData); }catch(_e){}
    if(Array.isArray(window.propertiesData) && window.propertiesData!==lists[0]) lists.push(window.propertiesData);
    for(const list of lists){
      const hit=list.find(x=>String(x.id)===String(propertyId));
      if(hit) return hit;
    }
    return null;
  }

  function rollupUnitFormRows(rows){
    const rents=rows.map(tr=>Number(tr.querySelector('[data-field="rent"]')?.value||0)).filter(n=>n>0);
    const beds=rows.map(tr=>Number(tr.querySelector('[data-field="bedrooms"]')?.value||0)).filter(n=>n>0);
    const baths=rows.map(tr=>Number(tr.querySelector('[data-field="bathrooms"]')?.value||0)).filter(n=>n>0);
    const deps=rows.map(tr=>Number(tr.querySelector('[data-field="deposit"]')?.value||0)).filter(n=>n>0);
    return {
      totalUnits:rows.length,
      numberOfUnits:rows.length,
      rent:rents.length?Math.min(...rents):0,
      rentMin:rents.length?Math.min(...rents):0,
      rentMax:rents.length?Math.max(...rents):0,
      bedrooms:beds.length?Math.min(...beds):0,
      bathrooms:baths.length?Math.min(...baths):0,
      deposit:deps.length?Math.min(...deps):0
    };
  }

  async function nestiqSaveConfiguredUnits(propertyId){
    const rows=Array.from(document.querySelectorAll('#nestiqUnitConfigTable tbody tr[data-unit-id]'));
    if(!rows.length){ nestiqShowNotif('No units to save','warning'); return; }
    const btn=nestiqBtnFromEvent?.();
    nestiqSetBtnLoading?.(btn,true,'Saving...');
    try{
      const unitRows=[];
      for(const tr of rows){
        const id=tr.getAttribute('data-unit-id');
        const get=f=>tr.querySelector(`[data-field="${f}"]`)?.value;
        const label=(get('label')||'').trim();
        if(!label) throw new Error('Each unit needs a unit number/label');
        const rent=Number(get('rent')||0);
        if(!(rent>0)) throw new Error(`Enter rent for unit ${label}`);
        const beds=Number(get('bedrooms')||0);
        const baths=Number(get('bathrooms')||0);
        const deposit=Number(get('deposit')||0);
        const maxOccupants=Math.max(1,Number(get('maxOccupants')||1));
        const unitType=(get('unitType')||'').trim()||`${beds} Bedroom`;
        const status=get('status')||'available';
        unitRows.push({
          id,
          propertyId,
          label,
          unitNumber:label,
          unitType,
          bedrooms:beds,
          bathrooms:baths,
          rent,
          deposit,
          maxOccupants,
          status
        });
      }
      if(typeof window.nestiqSaveUnitsBatch==='function'){
        await window.nestiqSaveUnitsBatch(propertyId, unitRows, { skipListingMirror:true });
      }else{
        for(const unit of unitRows){
          await saveUnit(propertyId, unit, { skipListingMirror:true });
        }
      }
      const stats=rollupUnitFormRows(rows);
      const publishPatch={
        publishStatus:'published',
        publicListing:true,
        archived:false,
        deactivated:false,
        status:'vacant',
        totalUnits:stats.totalUnits,
        numberOfUnits:stats.numberOfUnits,
        rent:stats.rent||null,
        rentMin:stats.rentMin||null,
        rentMax:stats.rentMax||null,
        bedrooms:stats.bedrooms,
        bathrooms:stats.bathrooms,
        deposit:stats.deposit||null
      };
      let p=findLocalProperty(propertyId);
      const landlordId=lid();
      if(!p){
        p={ id:propertyId, landlordId:landlordId||undefined, name:'Property', ...publishPatch };
        nestiqPushPropertyToLocalList?.(p);
      }else{
        Object.assign(p, publishPatch);
        if(landlordId && !p.landlordId) p.landlordId=landlordId;
      }
      try{ window.nestiqApplyListingStatsFromUnits?.(p); }catch(_e){}
      try{
        if(typeof window.nestiqListingAvailableUnits==='function'){
          p.availableUnits=(window.nestiqListingAvailableUnits(p)||[])
            .filter(u=>u && !u.synthetic);
        }
      }catch(_e){}
      if(Array.isArray(p.availableUnits) && p.availableUnits.length){
        publishPatch.availableUnits=p.availableUnits.slice(0,40);
      }
      if(window.nestiqUseFirestore&&window.nestiqDb){
        if(!landlordId) throw new Error('Could not resolve your landlord account. Sign out and sign in again.');
        const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
        await window.nestiqFs.properties(window.nestiqDb,landlordId).doc(String(propertyId)).set({
          ...publishPatch,
          listedAt:fv?fv.serverTimestamp():new Date().toISOString(),
          updatedAt:fv?fv.serverTimestamp():new Date().toISOString()
        },{ merge:true });
        if(!p.listedAt) p.listedAt=Date.now();
        const synced=await window.nestiqSyncPublicListingMirror?.(p);
        if(synced===false){
          nestiqShowNotif?.('Property saved, but it could not be published to Browse listings. Try Properties → Edit → enable Show on public listings.','warning');
        }
      }else{
        saveData?.();
      }
      window.__nestiqPendingUnitConfig=null;
      nestiqSetAmenityDraft?.('new',[]);
      nestiqCloseModalAnimated?.();
      nestiqShowNotif('Property published with units','success');
      addBellNotif?.('🏠',`Published: ${p?.name||'Property'}`);
      renderProperties?.();
      if(window.currentPage==='listings') window.nestiqRenderListingsPage?.();
    }catch(e){
      console.error(e);
      if(!e?.nestiqUnitCloud) nestiqShowNotif(e?.message||'Could not save units','error');
    }finally{
      nestiqSetBtnLoading?.(btn,false);
    }
  }

  function nestiqRefreshUnitNamingPreview(){
    const el=document.getElementById('new_prop_unit_preview');
    if(!el) return;
    el.textContent=unitPreview(
      document.getElementById('new_prop_unit_prefix')?.value,
      document.getElementById('new_prop_unit_start')?.value,
      document.getElementById('new_prop_total_units')?.value
    );
  }

  function initAddPropertyWizard(){
    nestiqSetAmenityDraft?.('new',[]);
    document.querySelector('#modalOverlay .modal')?.classList.add('modal-wide');
    setTimeout(()=>{
      nestiqInitPropertyPinMap?.('new_prop_pin_map','new_prop_lat','new_prop_lng',{});
      nestiqInitAmenityDropZone?.({key:'new',dropId:'newAmenityDrop',gridId:'newAmenityGrid',countId:'newAmenityCount',inputId:'newAmenityInput',initialPhotos:[],maxPhotos:20});
      nestiqRefreshUnitNamingPreview();
    },80);
  }

  window.NESTIQ_PROP_FORM_TYPES=PROP_TYPES;
  window.nestiqBuildAddPropertyFormHtml=buildAddPropertyFormHtml;
  window.nestiqInitAddPropertyWizard=initAddPropertyWizard;
  window.nestiqRefreshUnitNamingPreview=nestiqRefreshUnitNamingPreview;
  window.nestiqSavePropertyAsDraft=nestiqSavePropertyAsDraft;
  window.nestiqContinueToUnitConfig=nestiqContinueToUnitConfig;
  window.nestiqBulkApplyUnitDefaults=nestiqBulkApplyUnitDefaults;
  window.nestiqSaveConfiguredUnits=nestiqSaveConfiguredUnits;
  window.nestiqGenerateUnitsFromWizard=nestiqGenerateUnitsFromWizard;
})();
