/* Landlord post-verification onboarding wizard (5 steps) */

(function(){
  let obStep=1;
  let obPropId=null;
  let obOccupied=true;
  let obLogoB64=null;

  function overlayEl(){
    let el=document.getElementById('nestiqOnboardingOverlay');
    if(!el){
      el=document.createElement('div');
      el.id='nestiqOnboardingOverlay';
      el.className='nestiq-onboard-overlay';
      document.body.appendChild(el);
    }
    return el;
  }

  function skipOnboarding(){
    const sref=window.nestiqGetSettingsDocRef?.();
    if(sref) sref.set({ onboardingComplete:true }, { merge:true }).catch(()=>{});
    document.getElementById('nestiqOnboardingOverlay')?.remove();
    window.__nestiqOnboardingComplete=true;
    location.hash='#home';
    if(typeof mountPage==='function') mountPage('home').catch(()=>{});
    nestiqShowNotif('You can finish setup anytime in Settings.','success');
  }

  function render(){
    const el=overlayEl();
    const s=getSession?.();
    const name=s?.name||'';
    const pct=obStep*20;
    if(obStep===1){
      el.innerHTML=`
        <div class="nestiq-onboard-card">
          <div class="nestiq-onboard-bar"><div class="nestiq-onboard-bar-fill" style="width:${pct}%"></div></div>
          <div class="nestiq-onboard-skip"><button type="button" class="btn-outline btn-sm" onclick="nestiqOnboardSkip()">Skip</button></div>
          <div style="font-size:3rem;text-align:center">🎉</div>
          <h2 class="modal-title" style="text-align:center">Welcome to NestIQ Pro, ${String(name).replace(/</g,'&lt;')}!</h2>
          <p class="modal-sub" style="text-align:center">Let's get your account set up in just a few minutes.</p>
          <ul style="font-size:0.88rem;color:var(--muted);line-height:1.7;max-width:400px;margin:16px auto">
            <li>Add your first property</li><li>Publish a vacancy so tenants can apply</li><li>Set up your contact details</li><li>Configure your payment details</li>
          </ul>
          <button type="button" class="btn-primary" style="width:100%;max-width:320px;display:block;margin:20px auto 0" onclick="nestiqOnboardNext(2)">Let's Get Started →</button>
        </div>`;
      return;
    }
    if(obStep===2){
      el.innerHTML=`
        <div class="nestiq-onboard-card">
          <div class="nestiq-onboard-bar"><div class="nestiq-onboard-bar-fill" style="width:${pct}%"></div></div>
          <div class="nestiq-onboard-skip"><button type="button" class="btn-outline btn-sm" onclick="nestiqOnboardSkip()">Skip</button></div>
          <h2 class="modal-title">Tell us about yourself</h2>
          <p class="modal-sub">This information appears on receipts and documents.</p>
          <div class="form-group"><label>Full name</label><input class="form-input" id="ob_name" value="${String(landlordSettings?.name||name).replace(/"/g,'&quot;')}"></div>
          <div class="form-group"><label>Company name</label><input class="form-input" id="ob_company" value="${String(landlordSettings?.companyName||'').replace(/"/g,'&quot;')}"></div>
          <div class="form-group"><label>Phone</label><input class="form-input" id="ob_phone" value="${String(landlordSettings?.phone||'').replace(/"/g,'&quot;')}"></div>
          <div class="form-group"><label>Email</label><input class="form-input" id="ob_email" readonly value="${String(landlordSettings?.email||getSession()?.email||'').replace(/"/g,'&quot;')}"></div>
          <div class="form-group"><label>Physical address</label><textarea class="form-input" id="ob_addr" rows="2">${String(landlordSettings?.physicalAddress||'').replace(/</g,'&lt;')}</textarea></div>
          <div class="form-group"><label>Logo (optional)</label><input type="file" id="ob_logo" accept="image/*" onchange="nestiqOnboardLogoPick(event)"></div>
          <button type="button" class="btn-primary" style="width:100%;margin-top:8px" onclick="nestiqOnboardSaveProfile()">Save and Continue →</button>
        </div>`;
      return;
    }
    if(obStep===3){
      el.innerHTML=`
        <div class="nestiq-onboard-card">
          <div class="nestiq-onboard-bar"><div class="nestiq-onboard-bar-fill" style="width:${pct}%"></div></div>
          <div class="nestiq-onboard-skip"><button type="button" class="btn-outline btn-sm" onclick="nestiqOnboardSkip()">Skip</button></div>
          <h2 class="modal-title">Add your first property</h2>
          <p class="modal-sub">You can add more properties later.</p>
          <div class="form-group"><label>Property name</label><input class="form-input" id="ob_pname" placeholder="e.g. Seaside Studio"></div>
          <div class="form-group"><label>Full address</label><input class="form-input" id="ob_paddr" placeholder="Street address"></div>
          <div class="form-group"><label>City</label><input class="form-input" id="ob_pcity" placeholder="City"></div>
          <div class="form-group"><label>Type</label><select class="form-input" id="ob_ptype"><option>Apartment</option><option>House</option><option>Townhouse</option><option>Bachelor Apartment</option><option>Backroom / Garden Flat</option></select></div>
          <div class="form-group"><label>Bedrooms</label><select class="form-input" id="ob_pbed"><option>1</option><option>2</option><option>3</option><option>4+</option></select></div>
          <div class="form-group"><label>Monthly rent (R)</label><input class="form-input" id="ob_prent" type="number" placeholder="0"></div>
          <div class="form-group"><label>Status</label>
            <div style="display:flex;gap:16px;margin-top:6px">
              <label><input type="radio" name="ob_pstat" id="ob_occ_y" value="occ" checked> Occupied</label>
              <label><input type="radio" name="ob_pstat" id="ob_occ_n" value="vac"> Vacant</label>
            </div>
          </div>
          <button type="button" class="btn-primary" style="width:100%" onclick="nestiqOnboardAddProperty()">Add Property →</button>
          <p style="text-align:center;margin-top:12px"><a href="#" onclick="nestiqOnboardNext(5);return false;">Skip for now</a></p>
        </div>`;
      return;
    }
    if(obStep===4){
      const prop=propertiesData.find(p=>p.id===obPropId);
      el.innerHTML=`
        <div class="nestiq-onboard-card">
          <div class="nestiq-onboard-bar"><div class="nestiq-onboard-bar-fill" style="width:${pct}%"></div></div>
          <div class="nestiq-onboard-skip"><button type="button" class="btn-outline btn-sm" onclick="nestiqOnboardSkip()">Skip</button></div>
        <h2 class="modal-title">Tenants apply in NestIQ</h2>
          <p class="modal-sub" style="line-height:1.55;margin-bottom:16px">You do not add tenants by hand. Publish a vacancy; they apply from the web app.</p>
          <div class="nestiq-flow-banner" style="margin:0 0 18px">
            <div class="nestiq-flow-step"><span class="nestiq-flow-num">1</span><strong>List</strong><span>Vacant units</span></div>
            <div class="nestiq-flow-step"><span class="nestiq-flow-num">2</span><strong>Apply</strong><span>From listings</span></div>
            <div class="nestiq-flow-step"><span class="nestiq-flow-num">3</span><strong>Approve</strong><span>Applications</span></div>
          </div>
          <button type="button" class="btn-gold" style="width:100%;justify-content:center" onclick="nestiqOnboardNext(5)">Continue →</button>
          <p style="text-align:center;margin-top:12px"><a href="#" onclick="nestiqOnboardNext(5);return false;" style="color:var(--muted);font-size:0.84rem">Skip for now</a></p>
        </div>`;
      return;
    }
    el.innerHTML=`
      <div class="nestiq-onboard-card">
        <div class="nestiq-onboard-bar"><div class="nestiq-onboard-bar-fill" style="width:100%"></div></div>
        <div class="nestiq-onboard-skip"><button type="button" class="btn-outline btn-sm" onclick="nestiqOnboardSkip()">Skip</button></div>
        <h2 class="modal-title">Set up your payment details</h2>
        <p class="modal-sub">Shown on rent reminders and receipts.</p>
        <div class="form-group"><label>Bank name</label><input class="form-input" id="ob_bank" value="${String(landlordSettings?.portal?.bankName||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label>Account number</label><input class="form-input" id="ob_acct" value="${String(landlordSettings?.portal?.accountNumber||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label>Branch code</label><input class="form-input" id="ob_branch" value="${String(landlordSettings?.portal?.branchCode||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label>Account type</label>
          <select class="form-input" id="ob_atype"><option value="Cheque">Cheque</option><option value="Savings">Savings</option></select>
        </div>
        <div class="form-group"><label>Payment reference format</label><input class="form-input" id="ob_ref" value="${String(landlordSettings?.portal?.paymentReferenceFormat||'[TenantName]-[Month]-[Year]').replace(/"/g,'&quot;')}"></div>
        <button type="button" class="btn-gold" style="width:100%;margin-top:8px" onclick="nestiqOnboardFinish()">Finish Setup →</button>
      </div>`;
  }

  window.openLandlordOnboardingWizard=function(){
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
    window.location.href = 'onboarding.html';
  };

  window.nestiqOnboardSkip=skipOnboarding;
  window.nestiqOnboardNext=function(n){
    obStep=n;
    if(n===4&&(!obPropId||!obOccupied)) obStep=5;
    render();
  };

  window.nestiqOnboardLogoPick=function(e){
    const f=e.target.files?.[0];
    if(!f||typeof compressImage!=='function') return;
    compressImage(f,200,0.82,b64=>{ obLogoB64=b64; });
  };

  window.nestiqOnboardSaveProfile=async function(){
    const nm=document.getElementById('ob_name')?.value?.trim()||'';
    const co=document.getElementById('ob_company')?.value?.trim()||'';
    const ph=document.getElementById('ob_phone')?.value?.trim()||'';
    const ad=document.getElementById('ob_addr')?.value?.trim()||'';
    landlordSettings.name=nm;
    landlordSettings.companyName=co;
    landlordSettings.phone=ph;
    landlordSettings.physicalAddress=ad;
    if(obLogoB64) landlordSettings.logoBase64=obLogoB64;
    landlordName=nm||landlordName;
    const sref=window.nestiqGetSettingsDocRef?.();
    if(sref){
      await sref.set({
        name:nm, phone:ph, companyName:co,
        landlordSettings:{ ...landlordSettings }
      }, { merge:true });
    }
    saveData?.();
    nestiqOnboardNext(3);
  };

  window.nestiqOnboardAddProperty=async function(){
    const name=document.getElementById('ob_pname')?.value?.trim();
    if(!name){ nestiqShowNotif('Property name required','error'); return; }
    const addr=document.getElementById('ob_paddr')?.value?.trim()||'';
    const city=document.getElementById('ob_pcity')?.value?.trim()||'';
    const typeEl=document.getElementById('ob_ptype');
    const typeMap={ Apartment:'apartment', House:'house', Townhouse:'townhouse', 'Bachelor Apartment':'bachelor', Bachelor:'bachelor', 'Backroom / Garden Flat':'backroom' };
    const typeVal=typeEl?typeEl.value:'Apartment';
    const bed=document.getElementById('ob_pbed')?.value||'1';
    const rent=parseFloat(document.getElementById('ob_prent')?.value||'0')||0;
    obOccupied=document.getElementById('ob_occ_y')?.checked!==false;
    const lid=window.nestiqCurrentLandlordUid?.();
    const fullAddr=[addr,city].filter(Boolean).join(', ');
    const row={
      name,
      addr:fullAddr,
      city,
      rent,
      status:obOccupied?'occupied':'vacant',
      type:typeMap[typeVal]||'apartment',
      icon:typeVal==='House'?'🏠':typeVal==='Backroom / Garden Flat'?'🏡':typeVal==='Bachelor Apartment'?'🛏️':'🏢',
      bedrooms:parseInt(String(bed).replace(/\D/g,''),10)||1,
      leaseEnd:'Available',
      lat:null,
      lng:null,
      landlordId:lid||undefined,
      publicListing:!obOccupied,
      totalUnits:1,
      unitPrefix:'Unit'
    };
    if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
      try{
        const fv=firebase.firestore.FieldValue;
        if(fv) row.createdAt=fv.serverTimestamp();
        const ref=await window.nestiqFs.properties(window.nestiqDb,lid).add(row);
        obPropId=ref.id;
        const localRow={ ...row, id:ref.id };
        if(typeof nestiqPushPropertyToLocalList==='function'){
          nestiqPushPropertyToLocalList(localRow);
        }else{
          propertiesData.push(localRow);
        }
        try{ await window.nestiqSyncPropertyUnits?.(ref.id, 1, 'Unit', rent); }catch(_e){}
        try{ await window.nestiqSyncPublicListingMirror?.(localRow); }catch(_e){}
        saveData?.();
        nestiqOnboardNext(obOccupied?4:5);
        return;
      }catch(err){
        console.error('Onboard add property',err);
        const msg=typeof nestiqPropertyFirestoreErrorMessage==='function'
          ? nestiqPropertyFirestoreErrorMessage(err,'save')
          : 'Failed to add property';
        nestiqShowNotif(msg,'error');
        return;
      }
    }
    const id=Date.now();
    obPropId=id;
    propertiesData.push({ ...row, id });
    try{ await window.nestiqSyncPropertyUnits?.(id, 1, 'Unit', rent); }catch(_e){}
    saveData?.();
    nestiqOnboardNext(obOccupied?4:5);
  };

  window.nestiqOnboardAddTenant=async function(){
    nestiqOnboardNext(5);
  };

  window.nestiqOnboardFinish=async function(){
    landlordSettings.portal=landlordSettings.portal||{};
    landlordSettings.portal.bankName=document.getElementById('ob_bank')?.value||'';
    landlordSettings.portal.accountNumber=document.getElementById('ob_acct')?.value||'';
    landlordSettings.portal.branchCode=document.getElementById('ob_branch')?.value||'';
    landlordSettings.portal.accountType=document.getElementById('ob_atype')?.value==='Savings'?'Savings':'Cheque';
    landlordSettings.portal.paymentReferenceFormat=document.getElementById('ob_ref')?.value||'[TenantName]-[Month]-[Year]';
    const sref=window.nestiqGetSettingsDocRef?.();
    if(sref){
      await sref.set({
        onboardingComplete:true,
        landlordSettings:{ ...landlordSettings }
      }, { merge:true });
    }
    window.__nestiqOnboardingComplete=true;
    saveData?.();
    document.getElementById('nestiqOnboardingOverlay')?.remove();
    nestiqShowNotif('🎉 Welcome to NestIQ Pro! Your account is all set up.','success');
    location.hash='#home';
    if(typeof mountPage==='function') mountPage('home').catch(()=>{});
  };
})();
