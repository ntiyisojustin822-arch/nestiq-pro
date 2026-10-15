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
  const id=String(row.id);
  const idx=window.propertiesData.findIndex(p=>String(p.id)===id);
  if(idx>=0){
    window.propertiesData[idx]={ ...window.propertiesData[idx], ...row };
    if(idx!==0){
      const [item]=window.propertiesData.splice(idx,1);
      window.propertiesData.unshift(item);
    }
  }else{
    window.propertiesData.unshift(row);
  }
  renderProperties?.();
  window.nestiqRenderHomeDashProps?.();
  window.updateHomeStats?.();
  refreshMapMarkers?.();
}

function nestiqShowTenantsApplyOnly(){
  const mc=document.getElementById('modalContent');
  const ov=document.getElementById('modalOverlay');
  if(!mc||!ov){
    nestiqShowNotif?.('Tenants apply from Browse listings in the web app. You approve them under Applications.','info');
    return;
  }
  mc.innerHTML=`
    <div class="nestiq-apply-modal-hero" aria-hidden="true">📋</div>
    <h2 class="modal-title">Tenants apply in NestIQ</h2>
    <p class="modal-sub" style="line-height:1.55;margin-bottom:16px">A vacant unit is listed. The applicant creates an account, applies, and you decide. That is the only way someone becomes a tenant.</p>
    <div class="nestiq-flow-banner" style="margin:0 0 4px">
      <div class="nestiq-flow-step"><span class="nestiq-flow-num">1</span><strong>List</strong><span>Publish vacant units</span></div>
      <div class="nestiq-flow-step"><span class="nestiq-flow-num">2</span><strong>Apply</strong><span>They apply from listings</span></div>
      <div class="nestiq-flow-step"><span class="nestiq-flow-num">3</span><strong>Approve</strong><span>You review applications</span></div>
    </div>
    <div class="nestiq-apply-modal-actions">
      <button type="button" class="btn-gold btn-sm" onclick="nestiqCloseModalAnimated();showPage('listings')">Browse listings</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated();showPage('applications')">Applications</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button>
    </div>`;
  if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
  else ov.classList.add('open');
}
window.nestiqShowTenantsApplyOnly=nestiqShowTenantsApplyOnly;

function buildAddTenantModalHtml(){
  return '';
}

const modals={
  getStarted:`<h2 class="modal-title">Start Free Trial</h2><p class="modal-sub">No credit card required. Full access for 30 days.</p><div class="form-group"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Full Name</label><input class="form-input" type="text" placeholder="Your full name"></div><div class="form-group" style="margin-top:14px"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Email</label><input class="form-input" type="email" placeholder="you@example.com"></div><div class="form-group" style="margin-top:14px"><label class="form-label" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Properties</label><select class="form-input"><option>1–5 properties</option><option>6–20</option><option>21–50</option><option>50+</option></select></div><button class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="handleSignup()">Create Account →</button>`,
  addProperty:`<!-- built dynamically via nestiqBuildAddPropertyFormHtml -->`,
};

function openModal(t){
  let html=modals[t]||'';
  if(t==='addTenant'){
    nestiqShowTenantsApplyOnly();
    return;
  }
  if(t==='addProperty' && typeof nestiqBuildAddPropertyFormHtml==='function'){
    html=nestiqBuildAddPropertyFormHtml();
  }
  const mc=document.getElementById('modalContent');
  const ov=document.getElementById('modalOverlay');
  if(mc) mc.innerHTML=html;
  if(t==='addProperty'){
    nestiqInitAddPropertyWizard?.();
  }
  if(ov){
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else ov.classList.add('open');
    ov.scrollTop=0;
    const box=ov.querySelector('.modal');
    if(box) box.scrollTop=0;
  }
  if(typeof nestiqAnimateModalContent==='function') nestiqAnimateModalContent(mc);
}
function closeModal(){
  if(typeof nestiqDestroyPropertyPinMap==='function') nestiqDestroyPropertyPinMap();
  if(typeof nestiqDestroyListingDetailMap==='function') nestiqDestroyListingDetailMap();
  document.querySelector('#modalOverlay .modal')?.classList.remove('modal-wide','modal-xwide');
  document.getElementById('modalOverlay').classList.remove('open');
}
function closeModalOutside(e){if(e.target===document.getElementById('modalOverlay'))nestiqCloseModalAnimated()}
function handleSignup(){
  nestiqCloseModalAnimated();
  try{
    const s=typeof getSession==='function'?getSession():null;
    if(s && typeof isValidSession==='function' && isValidSession(s)){
      nestiqShowNotif('You are already signed in.','info');
      return;
    }
  }catch(_e){}
  if(window.nestiqUseFirestore){
    if(typeof nestiqShowSignupForm==='function'){
      nestiqShowSignupForm();
      return;
    }
    nestiqShowNotif('Sign-up is not ready. Refresh the page and try again.','error');
    return;
  }
  nestiqShowNotif('Firebase is not configured. Set your project in js/firebase-config.js.','warning');
}

async function handleAddProperty(){
  // Legacy entry point — new flow uses Save as Draft / Continue
  if(typeof nestiqContinueToUnitConfig==='function') return nestiqContinueToUnitConfig();
  nestiqShowNotif('Property form failed to load. Refresh and try again.','error');
}

modals.shortcuts=`<h2 class="modal-title">Keyboard Shortcuts</h2>
  <p class="modal-sub">Use these shortcuts for lightning-fast navigation.</p>
  <div class="shortcuts-grid">
    <div class="shortcut-item"><span>Open Command Palette</span><kbd>⌘K</kbd></div>
    <div class="shortcut-item"><span>Keyboard Shortcuts</span><kbd>?</kbd></div>
    <div class="shortcut-item"><span>Go to Home</span><kbd>H</kbd></div>
    <div class="shortcut-item"><span>Go to Properties</span><kbd>P</kbd></div>
    <div class="shortcut-item"><span>Go to Analytics</span><kbd>A</kbd></div>
    <div class="shortcut-item"><span>Close / Escape</span><kbd>Esc</kbd></div>
    <div class="shortcut-item"><span>Toggle Dark Mode</span><kbd>via ⌘K</kbd></div>
  </div>`;

async function handleAddTenant(){
  nestiqShowTenantsApplyOnly();
}

async function confirmTenantWelcomeEmail(tenantId){
  const checked=Boolean(document.getElementById('send_welcome_email_chk')?.checked);
  if(checked){
    const t=tenantsData.find(x=>x.id===tenantId);
    if(t) await sendWelcomeEmail?.(t);
  }
  nestiqCloseModalAnimated();
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
      nestiqShowNotif('Recommended rent applied','success');
    });
  }catch(_err){
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
  }
}

async function runTenantScreening(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const loading=document.getElementById('tenantAiLoading');
  const resultEl=document.getElementById('tenantAiResult');
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="runTenantScreening"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Screening...');
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
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
    nestiqSetBtnLoading?.(aiBtn,false);
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
  nestiqShowNotif('Override enabled. You can proceed to add tenant.','warning');
  return false;
}
window.overrideTenantAiDecline=overrideTenantAiDecline;

