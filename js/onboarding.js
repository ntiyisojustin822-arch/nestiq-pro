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
    showNotif('You can finish setup anytime in Settings.','success');
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
            <li>Add your first property</li><li>Add your first tenant</li><li>Set up your contact details</li><li>Configure your payment details</li>
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
          <div class="form-group"><label>Type</label><select class="form-input" id="ob_ptype"><option>Apartment</option><option>House</option><option>Townhouse</option></select></div>
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
          <h2 class="modal-title">Add your first tenant</h2>
          <p class="modal-sub">Who lives in ${String(prop?.name||'this property').replace(/</g,'&lt;')}?</p>
          <div class="form-group"><label>Full name</label><input class="form-input" id="ob_tname"></div>
          <div class="form-group"><label>Email</label><input class="form-input" id="ob_temail" type="email"></div>
          <div class="form-group"><label>Phone</label><input class="form-input" id="ob_tphone"></div>
          <div class="form-group"><label>Unit</label><input class="form-input" id="ob_tunit" placeholder="e.g. 4B"></div>
          <div class="form-group"><label>Monthly rent (R)</label><input class="form-input" id="ob_trent" type="number" value="${prop?.rent||0}"></div>
          <div class="form-group"><label>Lease start</label><input class="form-input" id="ob_tls" type="date"></div>
          <div class="form-group"><label>Lease end</label><input class="form-input" id="ob_tle" type="date"></div>
          <label style="display:flex;gap:8px;align-items:center;font-size:0.86rem;margin:12px 0"><input type="checkbox" id="ob_tinv" checked> Send portal invitation to this tenant</label>
          <p style="font-size:0.78rem;color:var(--muted)">We will email instructions when EmailJS is configured, or you can share the invitation code.</p>
          <button type="button" class="btn-primary" style="width:100%" onclick="nestiqOnboardAddTenant()">Add Tenant →</button>
          <p style="text-align:center;margin-top:12px"><a href="#" onclick="nestiqOnboardNext(5);return false;">Skip for now</a></p>
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
    if(!name){ showNotif('Property name required','error'); return; }
    const addr=document.getElementById('ob_paddr')?.value?.trim()||'';
    const city=document.getElementById('ob_pcity')?.value?.trim()||'';
    const typeEl=document.getElementById('ob_ptype');
    const typeMap={ Apartment:'apartment', House:'house', Townhouse:'apartment' };
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
      icon:typeVal==='House'?'🏠':'🏢',
      bedrooms:parseInt(String(bed).replace(/\D/g,''),10)||1,
      leaseEnd:'Available',
      lat:null,
      lng:null,
      landlordId:lid||undefined,
      publicListing:!obOccupied
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
        try{ await window.nestiqSyncPublicListingMirror?.(localRow); }catch(_e){}
        saveData?.();
        nestiqOnboardNext(obOccupied?4:5);
        return;
      }catch(err){
        console.error('Onboard add property',err);
        const msg=typeof nestiqPropertyFirestoreErrorMessage==='function'
          ? nestiqPropertyFirestoreErrorMessage(err,'save')
          : 'Failed to add property';
        showNotif(msg,'error');
        return;
      }
    }
    const id=Date.now();
    obPropId=id;
    propertiesData.push({ ...row, id });
    saveData?.();
    nestiqOnboardNext(obOccupied?4:5);
  };

  window.nestiqOnboardAddTenant=async function(){
    const nm=document.getElementById('ob_tname')?.value?.trim();
    const em=document.getElementById('ob_temail')?.value?.trim().toLowerCase();
    if(!nm||!em){ showNotif('Name and email required','error'); return; }
    const prop=propertiesData.find(p=>p.id===obPropId);
    const lid=window.nestiqCurrentLandlordUid?.();
    const tid=typeof tenantNextId==='number'?tenantNextId++:Date.now();
    const unit=(document.getElementById('ob_tunit')?.value||'Unit').trim();
    const newTenant={
      id:tid,
      name:nm,
      property:prop?.name||'',
      propertyId:obPropId,
      unit,
      rent:parseFloat(document.getElementById('ob_trent')?.value||'0')||prop?.rent||0,
      status:'paid',
      lease:'Annual',
      leaseStart:document.getElementById('ob_tls')?.value||new Date().toISOString().slice(0,10),
      leaseEnd:document.getElementById('ob_tle')?.value||'2026-12-31',
      monthlyDueDate:1,
      payments:[],
      phone:document.getElementById('ob_tphone')?.value||'',
      email:em,
      avatar:'👤',
      notes:'',
      landlordId:lid||undefined,
      unitPassword:String(unit).toLowerCase().replace(/^unit\s*/,'').replace(/\s+/g,''),
      firstLogin:false,
      hasPortalAccess:false,
      deposit:typeof nestiqNormalizeTenantDeposit==='function'?nestiqNormalizeTenantDeposit(null,parseFloat(document.getElementById('ob_trent')?.value||'0')||prop?.rent||0):undefined
    };
    tenantsData.push(newTenant);
    saveData?.();
    if(document.getElementById('ob_tinv')?.checked) await window.nestiqAfterTenantAddedFlow?.(newTenant,{ sendEmail:true });
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
    showNotif('🎉 Welcome to NestIQ Pro! Your account is all set up.','success');
    location.hash='#home';
    if(typeof mountPage==='function') mountPage('home').catch(()=>{});
  };
})();
