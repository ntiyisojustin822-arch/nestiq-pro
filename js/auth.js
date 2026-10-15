function nestiqSyncTailwindDarkClass(){
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')==='dark';
  html.classList.toggle('dark',isDark);
}

function toggleDark(){
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')==='dark';
  html.setAttribute('data-theme',isDark?'light':'dark');
  localStorage.setItem('nestiq-theme',isDark?'light':'dark');
  nestiqSyncTailwindDarkClass();
  applyTheme?.(getThemeName?.()||'gold',{silent:true});
  if(document.getElementById('page-charts')?.classList.contains('active')) initCharts();
  if(document.getElementById('page-tax')?.classList.contains('active')) renderTaxReport();
}

let wizardStep=1;
function showWizard(){document.getElementById('wizardOverlay').classList.add('open');}
function closeWizard(){
  document.getElementById('wizardOverlay').classList.remove('open');
  localStorage.setItem('nestiq-onboarded','1');
}
function wizardNext(){
  if(wizardStep<4){
    document.getElementById('wizard-step-'+wizardStep).classList.remove('active');
    wizardStep++;
    document.getElementById('wizard-step-'+wizardStep).classList.add('active');
    document.querySelectorAll('.wizard-dot').forEach((d,i)=>{d.classList.toggle('active',i===wizardStep-1)});
    document.getElementById('wizardBar').style.width=(wizardStep*25)+'%';
    if(wizardStep===4) document.getElementById('wizardNextBtn').textContent='Get Started ✓';
  } else {
    closeWizard();
    nestiqShowNotif('🎉 Setup complete! NestIQ Pro is ready.','success');
  }
}

function getSession(){
  try{
    if(window.__nestiqSession) return window.__nestiqSession;
    return JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
  }catch(_err){return null;}
}

function isValidSession(session){
  if(!session || !session.role) return false;
  if(session.role==='landlord') return true;
  if(session.role==='contractor' || session.role==='caretaker'){
    return Boolean(session.uid || session.userId);
  }
  if(session.role==='tenant'){
    if(window.nestiqUseFirestore){
      return Boolean(session.uid || session.userId || session.tenantDocId);
    }
    return Boolean(tenantsData.find(t=>String(t.id)===String(session.userId)));
  }
  return false;
}

/** True when the tenant has an account but is not yet assigned to a property. */
function nestiqTenantSessionIsUnassigned(session){
  const s=session||(typeof getSession==='function'?getSession():null);
  if(!s||s.role!=='tenant') return false;
  if(String(s.status||'').toLowerCase()==='unassigned') return true;
  if(String(window.nestiqTenantSession?.status||'').toLowerCase()==='unassigned') return true;
  return !s.landlordId && !window.nestiqTenantSession?.landlordId;
}
window.nestiqTenantSessionIsUnassigned=nestiqTenantSessionIsUnassigned;

function setSession(payload){
  sessionStorage.setItem('nestiq-session', JSON.stringify(payload));
}

function clearSession(){
  sessionStorage.removeItem('nestiq-session');
  window.nestiqClearSignInIntent?.();
  try{ window.__nestiqSession=null; }catch(_e){}
  try{ nestiqClearDemoMode(); }catch(_e){}
}

function nestiqFadeToSignedOut(dest){
  const outlet=document.getElementById('appOutlet');
  const paint=()=>{
    if(dest==='signin' && typeof nestiqShowSignInLandlord==='function') nestiqShowSignInLandlord();
    else if(dest==='signup' && typeof nestiqShowSignupForm==='function') nestiqShowSignupForm();
    else if(dest==='tenant' && typeof nestiqShowTenantEntry==='function') nestiqShowTenantEntry();
    else if((dest==='contractor' || dest==='caretaker') && typeof nestiqShowContractorEntry==='function') nestiqShowContractorEntry();
    else showLandingPage();
    if(outlet){
      outlet.style.opacity='';
      outlet.style.transition='';
    }
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
  };
  if(!outlet){ paint(); return; }
  outlet.style.transition='opacity 0.22s ease';
  outlet.style.opacity='0';
  setTimeout(paint, 220);
}

function nestiqClearPortalSessionState(){
  try{
    window.currentTenantData=null;
    window.nestiqTenantSession=null;
    window.tenantPayments=[];
    window.tenantMaintenance=[];
    window.tenantUploadedDocuments=[];
    window.tenantNotices=[];
    window.tenantMessages=[];
    window.landlordInfo=null;
    window.tenantProperty=null;
    window.tenantCaretaker=null;
    window.__nestiqTenantPaymentsReady=false;
    window.currentUser=null;
  }catch(_e){}
}
window.nestiqClearPortalSessionState=nestiqClearPortalSessionState;

function logoutSession(opts){
  opts=opts||{};
  const dest=opts.dest||window.__nestiqLogoutDest||'landing';
  window.__nestiqLogoutDest=dest;
  window.__nestiqLoggingOut=true;
  window.__nestiqLogoutUiDone=true;
  try{ window.nestiqShowTenantDashboardLoading?.(false); }catch(_e){}
  try{ window.stopNestiqFirestoreListeners?.(); }catch(_e){}
  try{ nestiqClearPortalSessionState(); }catch(_e){}
  try{ clearSession(); }catch(_e){}
  try{ window.nestiqClearSignInIntent?.(); }catch(_e){}
  try{ window.nestiqClearRedirectLoop?.(); }catch(_e){}
  try{ nestiqClearDemoMode(); }catch(_e){}
  try{ syncNavUserUi(); }catch(_e){}
  try{
    if(dest==='signin') history.replaceState(null,'',location.pathname+location.search+'#auth-signin');
    else if(dest==='signup') history.replaceState(null,'',location.pathname+location.search+'#auth-signup');
    else history.replaceState(null,'',location.pathname+location.search);
  }catch(_e){}
  nestiqFadeToSignedOut(dest);
  const auth=window.nestiqAuth||(window.firebase&&window.firebase.auth&&window.firebase.auth());
  if(auth&&window.nestiqUseFirestore){
    Promise.resolve(auth.signOut()).catch(()=>{}).finally(()=>{
      window.__nestiqLoggingOut=false;
    });
    return;
  }
  window.__nestiqLoggingOut=false;
}

function nestiqConfirmSignOut(opts){
  opts=opts||{};
  let role=opts.role;
  if(!role){
    try{ role=(typeof getSession==='function'?getSession():window.__nestiqSession||{}).role; }catch(_e){ role=''; }
  }
  const dest=role==='tenant'?'tenant':(role==='contractor'||role==='caretaker')?role:'landing';
  const where=role==='tenant'
    ?'your tenant portal'
    :(role==='caretaker'?'your caretaker dashboard':role==='contractor'?'your contractor portal':'your dashboard');
  const mc=document.getElementById('modalContent');
  if(!mc){
    if(window.confirm('Sign out of NestIQ?')) logoutSession({dest});
    return;
  }
  mc.innerHTML=`
    <div style="text-align:center;padding:6px 2px 0">
      <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:rgba(196,106,58,0.12);display:flex;align-items:center;justify-content:center;font-size:1.75rem">↪</div>
      <h2 class="modal-title" style="margin-bottom:8px">Sign out?</h2>
      <p class="modal-sub" style="margin-bottom:22px;max-width:320px;margin-left:auto;margin-right:auto">
        You'll need to sign in again to open ${where}.
      </p>
      <div class="btn-row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button type="button" class="btn-outline" onclick="nestiqCloseModalAnimated()">Stay signed in</button>
        <button type="button" class="btn-gold" id="nqSignOutConfirmBtn" onclick="nestiqPerformConfirmedSignOut('${dest}')">Sign out</button>
      </div>
    </div>`;
  if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
  else document.getElementById('modalOverlay')?.classList.add('open');
}

function nestiqPerformConfirmedSignOut(dest){
  const btn=document.getElementById('nqSignOutConfirmBtn');
  if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn,true,'Signing out…');
  if(typeof nestiqCloseModalAnimated==='function') nestiqCloseModalAnimated();
  setTimeout(()=>logoutSession({dest:(dest==='tenant'||dest==='contractor'||dest==='caretaker')?dest:'landing'}),160);
}

function nestiqTenantLogout(){
  nestiqConfirmSignOut({role:'tenant'});
}

function nestiqLandlordLogout(){
  nestiqConfirmSignOut({role:'landlord'});
}

function nestiqLandlordAwaitingEmailVerification(){
  if(window.NESTIQ_REQUIRE_LANDLORD_EMAIL_VERIFICATION===false) return false;
  if(!window.nestiqUseFirestore||typeof firebase==='undefined'||!firebase.auth) return false;
  try{
    const u=firebase.auth().currentUser;
    if(!u||u.emailVerified) return false;
    const s=getSession();
    return s?.role==='landlord';
  }catch(_e){
    return false;
  }
}

function nestiqSessionProfilePhoto(s){
  if(!s||!s.role) return '';
  const cands=[];
  if(s.role==='tenant'){
    const t=window.currentTenantData||{};
    const ts=window.nestiqTenantSession||{};
    cands.push(s.profilePhoto,s.photoURL,s.photoUrl,t.profilePhoto,t.photoUrl,t.photoURL,ts.profilePhoto,ts.photoUrl);
  }else{
    const ls=window.landlordSettings||{};
    cands.push(s.profilePhoto,s.photoURL,s.photoUrl);
    if(s.role==='landlord') cands.push(ls.profilePhoto,ls.logoUrl);
  }
  let authPhoto='';
  try{
    const u=firebase?.auth?.()?.currentUser;
    if(u && (!s.uid || String(u.uid)===String(s.uid))) authPhoto=String(u.photoURL||'');
  }catch(_e){}
  if(authPhoto) cands.push(authPhoto);
  for(let i=0;i<cands.length;i++){
    const p=String(cands[i]||'').trim();
    if(/^https?:\/\//i.test(p)||p.startsWith('data:image/')) return p;
  }
  if(s.role==='tenant' && typeof nestiqTenantPhotoUrl==='function'){
    const u=nestiqTenantPhotoUrl(window.currentTenantData)||nestiqTenantPhotoUrl(s);
    if(u) return u;
  }
  return '';
}
window.nestiqSessionProfilePhoto=nestiqSessionProfilePhoto;

function nestiqNavIsListingsBrowse(){
  if(String(window.currentPage||'')==='listings') return true;
  const hash=(location.hash||'').replace(/^#/,'').split('?')[0];
  if(hash==='listings') return true;
  return !!document.getElementById('page-listings')?.classList.contains('active');
}

function nestiqFillNavAccountMenu(){
  const menu=document.getElementById('navAccountMenu');
  if(!menu) return;
  const s=typeof getSession==='function'?getSession():null;
  const name=String(s?.name||s?.email||'Account').replace(/</g,'&lt;');
  const email=String(s?.email||'').replace(/</g,'&lt;');
  const isTenant=s?.role==='tenant';
  const unassigned=isTenant&&typeof nestiqTenantSessionIsUnassigned==='function'&&nestiqTenantSessionIsUnassigned(s);
  const rows=isTenant
    ? `<button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();showPage('tenant-dashboard')">My portal</button>
       ${unassigned?`<button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();showPage('tenant-dashboard');setTimeout(()=>nestiqSwitchTenantTab?.('applications'),80)">My applications</button>`:''}
       <button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();showPage('listings')">Browse listings</button>
       <button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();nestiqTenantLogout?.()">Sign out</button>`
    : `<button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();showPage('settings')">Settings</button>
       <button type="button" role="menuitem" onclick="nestiqCloseNavAccountMenu();nestiqLandlordLogout()">Sign out</button>`;
  menu.innerHTML=`
    <div class="nav-account-menu-head">
      <div class="nav-account-menu-name">${name}</div>
      ${email?`<div class="nav-account-menu-sub">${email}</div>`:''}
    </div>
    ${rows}`;
}

function nestiqCloseNavAccountMenu(){
  const menu=document.getElementById('navAccountMenu');
  const btn=document.getElementById('navUserAvatar');
  if(menu){ menu.classList.remove('open'); menu.hidden=true; }
  if(btn) btn.setAttribute('aria-expanded','false');
}
function nestiqToggleNavAccountMenu(ev){
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
  const menu=document.getElementById('navAccountMenu');
  const btn=document.getElementById('navUserAvatar');
  if(!menu) return;
  const open=!menu.classList.contains('open');
  if(open) nestiqFillNavAccountMenu();
  menu.classList.toggle('open', open);
  menu.hidden=!open;
  if(btn) btn.setAttribute('aria-expanded', open?'true':'false');
}
window.nestiqToggleNavAccountMenu=nestiqToggleNavAccountMenu;
window.nestiqCloseNavAccountMenu=nestiqCloseNavAccountMenu;
document.addEventListener('click', (e)=>{
  const wrap=document.getElementById('navUserWrap');
  if(wrap&&e.target&&wrap.contains(e.target)) return;
  nestiqCloseNavAccountMenu();
});

function syncNavUserUi(){
  const s=getSession();
  if(s && !isValidSession(s)){
    clearSession();
  }
  const awaiting=nestiqLandlordAwaitingEmailVerification();
  const nav=document.getElementById('navbar');
  const navLinks=document.querySelector('#navbar .nav-links');
  const mobile=document.getElementById('mobileNav');
  const footer=document.getElementById('siteFooter');
  const bellWrap=document.getElementById('bellWrap');
  const userLabel=document.getElementById('navUserLabel');
  const userAvatar=document.getElementById('navUserAvatar');
  const logoutBtn=document.getElementById('navLogoutBtn');
  const hamburger=document.getElementById('hamburgerBtn');
  const themeWrap=document.getElementById('navThemeWrap');
  const darkToggle=document.querySelector('#navbar .dark-toggle');
  const isTenant=s?.role==='tenant';
  const isContractor=s?.role==='contractor';
  const isCaretaker=s?.role==='caretaker';
  const verifyMode=!!(s&&awaiting);
  const tenantBrowseNav=!!(isTenant && !verifyMode && nestiqNavIsListingsBrowse());
  document.body.classList.toggle('nestiq-role-tenant', !!isTenant && !verifyMode);
  document.body.classList.toggle('nestiq-role-contractor', !!isContractor && !verifyMode);
  document.body.classList.toggle('nestiq-role-caretaker', !!isCaretaker && !verifyMode);
  document.body.classList.toggle('nestiq-role-landlord', !!(s&&!isTenant&&!isContractor&&!isCaretaker&&!verifyMode));
  document.body.classList.toggle('nestiq-tenant-browse', tenantBrowseNav);
  const hideNav=(isTenant&&!tenantBrowseNav)||isContractor||isCaretaker;
  if(nav) nav.style.display=(s&&!hideNav)?'grid':(s&&hideNav)?'none':(s?'grid':'none');
  if(navLinks) navLinks.style.display=(verifyMode||(hideNav&&!tenantBrowseNav))?'none':'';
  if(mobile) mobile.style.display=(hideNav||verifyMode)?'none':'';
  if(footer) footer.style.display=(hideNav||verifyMode)?'none':'';
  if(bellWrap) bellWrap.style.display=(s&&!verifyMode&&!hideNav&&!isTenant)?'':'none';
  if(userLabel){
    userLabel.style.display=(s&&!hideNav&&!isTenant)?'inline':'none';
    const nm=String(s?.name||'').trim();
    const roleFallback=s?.role==='landlord'?'Landlord':s?.role==='caretaker'?'Caretaker':s?.role==='contractor'?'Contractor':'Tenant';
    userLabel.textContent=(!nm || /^tenant$/i.test(nm) || /^landlord$/i.test(nm) || /^user$/i.test(nm) || /^local$/i.test(nm))
      ? roleFallback
      : nm;
  }
  if(userAvatar){
    userAvatar.style.display=(s&&!hideNav)?'inline-flex':'none';
    const photo=nestiqSessionProfilePhoto(s);
    const initial=String(s?.name||s?.email||'A').trim().charAt(0).toUpperCase()||'A';
    if(photo){
      userAvatar.classList.add('is-photo');
      userAvatar.innerHTML=`<img src="${String(photo).replace(/"/g,'&quot;')}" alt="">`;
    }else{
      userAvatar.classList.remove('is-photo');
      userAvatar.textContent=initial;
    }
  }
  if(logoutBtn){
    logoutBtn.style.display=(s&&!hideNav&&!isTenant)?'inline-flex':'none';
    logoutBtn.onclick=isTenant?()=>{ nestiqTenantLogout?.(); }:()=>{ nestiqLandlordLogout(); };
  }
  if(hamburger) hamburger.style.display=(verifyMode||(hideNav&&!tenantBrowseNav))?'none':'';
  if(themeWrap) themeWrap.style.display=(s&&!verifyMode&&!hideNav&&!isTenant)?'':'none';
  if(darkToggle) darkToggle.style.display=(s&&!verifyMode&&!hideNav&&!isTenant)?'':'none';
  const navDivider=document.querySelector('#navbar .nav-divider');
  if(navDivider) navDivider.style.display=(s&&!verifyMode&&!hideNav)?'':'none';
  const navTools=document.querySelector('#navbar .nav-tools');
  if(navTools) navTools.style.display=(s&&!verifyMode&&!hideNav&&!isTenant)?'flex':'none';
  const navUser=document.querySelector('#navbar .nav-user');
  if(navUser) navUser.style.display=(s&&!hideNav)?'flex':'none';
  document.querySelectorAll('[data-landlord-nav]').forEach(el=>{
    if(!s||hideNav||verifyMode||isTenant) el.style.display='none';
    else el.style.display=el.tagName==='LI'?'list-item':'block';
  });
  if(typeof window.nestiqUpdateNavBillingBadge === 'function') window.nestiqUpdateNavBillingBadge();
  document.querySelectorAll('[data-tenant-nav]').forEach(el=>{
    if(s&&isTenant&&!verifyMode&&tenantBrowseNav) el.style.display=el.tagName==='LI'?'list-item':'block';
    else el.style.display='none';
  });
  const navCta=document.querySelector('#navbar .nav-cta');
  if(navCta) navCta.style.display=s?'none':'';
  document.body.classList.toggle('nestiq-verify-email',verifyMode);
  window.refreshPortfolioReportButtons?.();
  try{ window.nestiqRenderLandlordDashboardHome?.(); }catch(_e){}
}

function tenantPasswordFor(tenant){
  return String(tenant.unit||'').toLowerCase().replace(/^unit\s*/,'').replace(/\s+/g,'');
}

function nestiqSetAuthChrome(on){
  document.body.classList.toggle('nestiq-auth-gate', !!on);
  ['navbar','mobileNav','appFooter','siteFooter','shortcutHint'].forEach(function(id){
    const el=document.getElementById(id);
    if(!el) return;
    if(on) el.setAttribute('hidden','');
    else el.removeAttribute('hidden');
  });
  if(on){
    try{ window.scrollTo(0,0); }catch(_e){}
  }
}
window.nestiqSetAuthChrome=nestiqSetAuthChrome;

function nestiqAuthBrandHtml(){
  return `<div class="nestiq-auth-brand"><span class="logo-dot"></span> NestIQ</div>`;
}

function nestiqHideBootOverlay(){
  document.body.classList.add('nestiq-app-ready');
  const el=document.getElementById('nestiqBootOverlay');
  if(el){
    el.style.opacity='0';
    el.style.display='none';
    el.style.pointerEvents='none';
    el.setAttribute('hidden','');
    try{ window.nestiqKillBootOverlay?.(); }catch(_e){}
  }
}

function nestiqDashPreviewHtml(){
  return`<div class="dash-preview nestiq-landing-preview">
    <div class="dash-header"><div class="dash-dots"><span></span><span></span><span></span></div><div class="dash-title-text">NestIQ Dashboard</div><div style="width:44px"></div></div>
    <div class="dash-body">
      <div class="dash-metrics">
        <div class="dash-metric"><div class="dash-metric-val">R24,500</div><div class="dash-metric-lbl">Monthly Revenue</div><div class="dash-metric-chg">Preview</div></div>
        <div class="dash-metric"><div class="dash-metric-val">12</div><div class="dash-metric-lbl">Active Tenants</div><div class="dash-metric-chg">Preview</div></div>
        <div class="dash-metric"><div class="dash-metric-val">94%</div><div class="dash-metric-lbl">Occupancy</div><div class="dash-metric-chg">Preview</div></div>
        <div class="dash-metric"><div class="dash-metric-val">3</div><div class="dash-metric-lbl">Follow-ups</div><div class="dash-metric-chg">Preview</div></div>
      </div>
      <div class="dash-prop-item"><div class="prop-icon-sm" style="background:rgba(201,168,76,0.12)">🏢</div><div style="flex:1"><div class="prop-name-sm">Riverside Apartments</div><div class="prop-addr-sm">12 Waterfront Ave</div></div><span class="badge badge-green">Occupied</span></div>
      <div class="dash-prop-item"><div class="prop-icon-sm" style="background:rgba(58,107,138,0.12)">🏠</div><div style="flex:1"><div class="prop-name-sm">Garden Villa</div><div class="prop-addr-sm">7 Rose Lane</div></div><span class="badge badge-amber">Due Soon</span></div>
    </div>
  </div>`;
}

async function nestiqTryDeepLinkInvite(){
  const id=new URLSearchParams(location.search).get('invite');
  if(!id||!window.nestiqDb) return;
  const raw=String(id).toUpperCase().trim();
  try{
    if(/^(CQ|CT)-[A-Z0-9]{6}$/.test(raw)){
      nestiqShowContractorEntry();
      const codeInput=document.getElementById('cinv_code');
      if(codeInput) codeInput.value=raw;
      await nestiqContractorLookupInvite();
      return;
    }
    let inv=null;
    if(typeof window.nestiqLookupInvitationByCode==='function'){
      inv=await window.nestiqLookupInvitationByCode(String(id));
    }else{
      const lookup=await window.nestiqFs.invitationLookup(window.nestiqDb, String(id)).get();
      if(lookup.exists&&lookup.data().landlordId){
        const doc=await window.nestiqFs.invitations(window.nestiqDb, lookup.data().landlordId).doc(String(id).toUpperCase()).get();
        if(doc.exists){
          const d=doc.data()||{};
          if(String(d.status||'')==='pending'){
            inv={...d,_fireId:doc.id,code:String(id).toUpperCase(),landlordId:lookup.data().landlordId};
          }
        }
      }
    }
    if(!inv) return;
    window.__nestiqPendingInvite=inv;
    nestiqShowTenantEntry();
    nestiqTenantTab('inv');
    const codeInput=document.getElementById('tinv_code');
    if(codeInput) codeInput.value=String(inv.code||id).toUpperCase();
    const resultEl=document.getElementById('tinv_result');
    if(resultEl) nestiqFillTenantInviteRedeemForm(resultEl, inv);
  }catch(err){
    console.warn('NestIQ: deep-link invite load failed', id, err);
  }
}

function showLandingPage(bannerMsg=''){
  try{ window.scrollTo(0,0); }catch(_e){}
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  try{ nestiqHideBootOverlay(); }catch(_e){}
  syncNavUserUi();
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;

  const entryFlow = typeof nestiqPeekAuthEntryFlow === 'function' ? nestiqPeekAuthEntryFlow() : '';
  const hasUser = !!(window.firebase?.auth?.()?.currentUser);
  const hash=(location.hash||'').replace('#','').toLowerCase();
  const choosing=entryFlow==='choose'||hash==='welcome'||hash==='choose';
  if(!hasUser && !choosing && (entryFlow === 'signup' || entryFlow === 'signin' || entryFlow === 'login')){
    nestiqHandleAuthEntryFlow();
    return;
  }
  if(hasUser && entryFlow){
    try{
      sessionStorage.removeItem('nestiq-auth-flow');
      history.replaceState(null, '', location.pathname + location.search);
    }catch(_e){}
  }

  if(!window.nestiqUseFirestore){
    outlet.innerHTML=`
      <section class="nestiq-landing nestiq-landing--offline" style="min-height:100vh;padding:100px 24px 48px;position:relative;background:var(--paper)">
        <div class="hero-grid nestiq-landing-grid"></div>
        <div style="position:relative;max-width:520px;margin:0 auto;text-align:center">
          <div class="nav-logo" style="justify-content:center;font-size:1.8rem;margin-bottom:12px"><span class="logo-dot"></span>NestIQ Pro</div>
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:20px">Firebase is not configured. Set your project in <code style="font-size:0.8rem">js/firebase-config.js</code> to enable cloud sign-up and sync.</p>
          <p style="font-size:0.78rem;color:var(--muted);margin-top:16px">${bannerMsg?String(bannerMsg).replace(/</g,'&lt;'):''}</p>
        </div>
      </section>`;
    return;
  }
  outlet.innerHTML=`
    <section class="nestiq-auth-section nestiq-landing">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-landing-inner">
        <div class="nestiq-landing-left">
          <div class="nav-logo" style="font-size:clamp(1.6rem,3vw,2.2rem);margin-bottom:16px"><span class="logo-dot"></span>NestIQ Pro</div>
          <p class="nestiq-landing-tagline">Smart rental management for South African landlords</p>
          <ul class="nestiq-landing-features">
            <li>Manage properties and tenants</li>
            <li>Track rent payments</li>
            <li>Tenant self-service portal</li>
            <li>Free to get started</li>
          </ul>
          ${bannerMsg?`<div class="nestiq-landing-banner">${String(bannerMsg).replace(/</g,'&lt;')}</div>`:''}
          <div class="nestiq-landing-actions">
            <button type="button" class="btn-primary btn-lg" onclick="nestiqShowSignupForm()">Create free account</button>
            <button type="button" class="btn-outline btn-lg" onclick="nestiqShowSignInLandlord()">Landlord sign in</button>
          </div>
          <div class="nestiq-landing-or" aria-hidden="true"><span>or</span></div>
          <div class="nestiq-landing-tenant-ctas">
            <button type="button" class="nestiq-landing-cta nestiq-landing-cta--outline" onclick="nestiqShowTenantEntry()">
              <span class="nestiq-landing-cta-label">Tenant portal</span>
            </button>
            <button type="button" class="nestiq-landing-cta nestiq-landing-cta--solid" onclick="showPage('listings')">
              <span class="nestiq-landing-cta-label">Browse listings</span>
            </button>
            <button type="button" class="nestiq-landing-cta nestiq-landing-cta--outline" onclick="nestiqShowContractorEntry()">
              <span class="nestiq-landing-cta-label">Staff portal</span>
            </button>
          </div>
        </div>
        <div class="nestiq-landing-right">${nestiqDashPreviewHtml()}</div>
      </div>
    </section>`;
  setTimeout(()=>{ nestiqTryDeepLinkInvite(); }, 0);
}

function nestiqPeekAuthEntryFlow(){
  const params = new URLSearchParams(String(window.location.search || ''));
  let flow = (params.get('flow') || '').toLowerCase();
  const hash = (location.hash || '').replace('#', '').toLowerCase();
  if(!flow && (hash === 'welcome' || hash === 'choose')) flow = 'choose';
  if(!flow && (hash === 'auth-signup' || hash === 'signup')) flow = 'signup';
  if(!flow && (hash === 'auth-signin' || hash === 'signin' || hash === 'login')) flow = 'signin';
  if(!flow){
    try{ flow = sessionStorage.getItem('nestiq-auth-flow') || ''; }catch(_e){}
  }
  return flow;
}

function nestiqGetAuthEntryFlow(){
  const flow = nestiqPeekAuthEntryFlow();
  if(flow){
    try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e){}
  }
  return flow;
}

function nestiqAuthEntryRoleLabel(role){
  const r=String(role||'').toLowerCase();
  if(r==='tenant') return 'tenant';
  if(r==='caretaker') return 'caretaker';
  if(r==='contractor') return 'contractor';
  return 'landlord';
}

function nestiqShowSignedInContinue(session){
  const outlet=document.getElementById('appOutlet');
  if(!outlet || !session) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  const name=String(session.name||session.email||'your account').replace(/[<>&]/g, '');
  const email=String(session.email||'').replace(/[<>&]/g, '');
  const role=nestiqAuthEntryRoleLabel(session.role);
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card">
        ${nestiqAuthBrandHtml()}
        <a href="landing.html" class="nestiq-auth-back">← Back to NestIQ</a>
        <h2 class="modal-title">Welcome back</h2>
        <p class="modal-sub">You already have an active session in this browser.</p>
        <div class="nestiq-auth-session">
          <div class="nestiq-auth-session-av" aria-hidden="true">${(name||'N').slice(0,1).toUpperCase()}</div>
          <div>
            <div class="nestiq-auth-session-name">${name}</div>
            ${email?`<div class="nestiq-auth-session-email">${email}</div>`:''}
            <div class="nestiq-auth-session-role">${role}</div>
          </div>
        </div>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqContinueExistingSession()">Continue as ${role}</button>
        <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:10px" onclick="nestiqSwitchAuthAccount()">Use a different account</button>
      </div>
    </section>`;
  try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
}

function nestiqContinueExistingSession(){
  try{ nestiqSetAuthChrome(false); }catch(_e){}
  window.__nestiqHoldAuthEntry=false;
  try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e){}
  const s=typeof getSession==='function'?getSession():window.__nestiqSession;
  let hash='#home';
  if(s?.role==='tenant'){
    hash='#tenant-dashboard';
  }else if(s?.role==='contractor') hash='#contractor-dashboard';
  else if(s?.role==='caretaker') hash='#caretaker-dashboard';
  try{ history.replaceState(null,'',location.pathname+location.search+hash); }catch(_e){}
  if(typeof window.nestiqBootstrapApp==='function') window.nestiqBootstrapApp();
}

function nestiqSwitchAuthAccount(){
  window.__nestiqHoldAuthEntry=false;
  try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e){}
  logoutSession({ dest:'landing' });
}

function nestiqReleaseAuthEntryHold(){
  window.__nestiqHoldAuthEntry=false;
  try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e){}
}
window.nestiqReleaseAuthEntryHold=nestiqReleaseAuthEntryHold;

function nestiqAuthSetSigningIn(on, btnId){
  const btn=btnId?document.getElementById(btnId):(typeof nestiqBtnFromEvent==='function'?nestiqBtnFromEvent():null);
  const card=btn?.closest('.nestiq-auth-card')||document.querySelector('.nestiq-auth-card');
  if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn, !!on, on?'Signing in…':'');
  else if(btn){
    if(on){
      btn.dataset.originalText=btn.innerHTML;
      btn.disabled=true;
      btn.textContent='Signing in…';
    }else{
      btn.disabled=false;
      btn.innerHTML=btn.dataset.originalText||'Sign In';
    }
  }
  if(!card) return;
  card.classList.toggle('is-signing-in', !!on);
  let veil=card.querySelector('.nestiq-auth-veil');
  if(on){
    if(!veil){
      veil=document.createElement('div');
      veil.className='nestiq-auth-veil';
      veil.setAttribute('role','status');
      veil.setAttribute('aria-live','polite');
      veil.innerHTML='<span class="nestiq-auth-busy-spin" aria-hidden="true"></span><strong>Signing you in</strong><span>Please wait a moment</span>';
      card.appendChild(veil);
    }
    card.querySelectorAll('input,button,select,textarea').forEach(el=>{
      if(el===btn) return;
      if(el.dataset.nqSignLock==null) el.dataset.nqSignLock=el.disabled?'1':'0';
      el.disabled=true;
    });
  }else{
    if(veil) veil.remove();
    card.querySelectorAll('[data-nq-sign-lock]').forEach(el=>{
      el.disabled=el.dataset.nqSignLock==='1';
      delete el.dataset.nqSignLock;
    });
  }
}
window.nestiqAuthSetSigningIn=nestiqAuthSetSigningIn;

function nestiqHandleAuthEntryFlow(){
  const hash=(location.hash||'').replace('#','').toLowerCase();
  let storedFlow='';
  try{ storedFlow=sessionStorage.getItem('nestiq-auth-flow')||''; }catch(_e){}
  const existing=(typeof getSession==='function'?getSession():null);
  const signedIn=existing && (typeof isValidSession!=='function' || isValidSession(existing));
  const chooserHash=hash==='welcome'||hash==='choose';
  // Leftover #welcome after a signed-in refresh must not flash the account chooser.
  if(signedIn && chooserHash && !storedFlow){
    nestiqContinueExistingSession();
    return;
  }
  const flow=nestiqPeekAuthEntryFlow();
  if(flow==='choose' || chooserHash){
    try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e){}
    showLandingPage();
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
    return;
  }
  const authHash=typeof nestiqIsAuthEntryHash==='function' && nestiqIsAuthEntryHash();
  if(signedIn && (window.__nestiqHoldAuthEntry || authHash)){
    nestiqShowSignedInContinue(existing);
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
    return;
  }
  const consumed = nestiqGetAuthEntryFlow() || (authHash
    ? ((location.hash||'').replace('#','').toLowerCase().includes('signup') ? 'signup' : 'signin')
    : (window.__nestiqHoldAuthEntry ? 'signin' : ''));
  if(consumed === 'signup'){
    nestiqShowSignupForm();
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
    return;
  }
  if(consumed === 'signin' || consumed === 'login'){
    nestiqShowSignInLandlord();
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
  }
}
window.nestiqShowSignedInContinue=nestiqShowSignedInContinue;
window.nestiqContinueExistingSession=nestiqContinueExistingSession;
window.nestiqSwitchAuthAccount=nestiqSwitchAuthAccount;

function nestiqClearDemoMode(){
  try{
    localStorage.removeItem('nestiq-demo-mode');
    localStorage.removeItem('nestiq-demo-seeded');
  }catch(_e){}
  try{
    const raw=sessionStorage.getItem('nestiq-session');
    if(raw){
      const s=JSON.parse(raw);
      if(s&&s.demoMode){
        delete s.demoMode;
        sessionStorage.setItem('nestiq-session', JSON.stringify(s));
      }
    }
  }catch(_e){}
  try{ document.getElementById('demoBanner')?.remove(); }catch(_e){}
}
window.nestiqClearDemoMode=nestiqClearDemoMode;

/** Demo mode is disabled project-wide. Redirects to real sign-up/sign-in. */
function nestiqContinueLocalDemo(){
  nestiqClearDemoMode();
  try{ nestiqShowNotif?.('Demo mode is disabled. Create an account or sign in.','info'); }catch(_e){}
  if(typeof nestiqShowSignupForm==='function') nestiqShowSignupForm();
  else if(typeof nestiqShowSignInLandlord==='function') nestiqShowSignInLandlord();
  else location.href='index.html#auth-signup';
}
window.nestiqContinueLocalDemo=nestiqContinueLocalDemo;

function nestiqInjectDemoBanner(){
  let isDemo=false;
  try{
    if(localStorage.getItem('nestiq-demo-mode')==='1') isDemo=true;
    const raw=sessionStorage.getItem('nestiq-session');
    if(raw){
      const s=JSON.parse(raw);
      if(s&&s.demoMode) isDemo=true;
    }
  }catch(_e){}
  if(!isDemo){
    nestiqClearDemoMode();
    return;
  }
  if(document.getElementById('demoBanner')) return;
  const bar=document.createElement('div');
  bar.id='demoBanner';
  bar.className='nq-fade-down';
  bar.setAttribute('role','status');
  bar.style.cssText='position:sticky;top:72px;z-index:190;background:linear-gradient(90deg,var(--gold),var(--rust));color:var(--ink);text-align:center;padding:8px 16px;font-size:0.82rem;font-weight:600';
  bar.textContent='You are viewing a demo workspace. Changes are not saved to a live account.';
  const nav=document.getElementById('navbar');
  if(nav&&nav.parentNode) nav.insertAdjacentElement('afterend', bar);
  else document.body.prepend(bar);
}
window.nestiqInjectDemoBanner=nestiqInjectDemoBanner;

function showLoginScreen(errMsg=''){ showLandingPage(errMsg); }

function nestiqShowSignInLandlord(){
  const existing=(typeof getSession==='function'?getSession():null);
  if(existing && (typeof isValidSession!=='function' || isValidSession(existing))){
    nestiqShowSignedInContinue(existing);
    return;
  }
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  try{ nestiqHideBootOverlay(); }catch(_e){}
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card">
        ${nestiqAuthBrandHtml()}
        <a href="landing.html" class="nestiq-auth-back">← Back to NestIQ</a>
        <h2 class="modal-title">Sign in</h2>
        <p class="modal-sub">Landlord workspace</p>
        <div class="form-group"><label>Email</label><input class="form-input" id="li_email" type="email" autocomplete="username" placeholder="you@example.com"></div>
        <div class="form-group"><label>Password</label>
          <div class="nestiq-auth-pw">
            <input class="form-input" id="li_pass" type="password" autocomplete="current-password" placeholder="Password" onkeydown="if(event.key==='Enter')nestiqSubmitLandlordSignIn()">
            <button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('li_pass',this)">Show</button>
          </div>
        </div>
        <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
        <div id="li_err" class="nestiq-auth-err"></div>
        <button type="button" class="btn-primary" id="li_submit" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSubmitLandlordSignIn()">Sign In</button>
        <p class="nestiq-auth-footer">
          <a href="#" onclick="nestiqShowSignupForm();return false;">Create an account</a>
          <span aria-hidden="true"> · </span>
          <a href="#" onclick="nestiqShowTenantEntry();return false;">Tenant portal</a>
          <span aria-hidden="true"> · </span>
          <a href="#" onclick="nestiqShowContractorEntry();return false;">Staff</a>
        </p>
      </div>
    </section>`;
}

function nestiqSignupPhotoInitials(){
  const name=(document.getElementById('tself_name')?.value||'').trim();
  const parts=name.split(/\s+/).filter(Boolean);
  if(!parts.length) return '';
  if(parts.length===1) return parts[0].slice(0,1).toUpperCase();
  return (parts[0].slice(0,1)+parts[parts.length-1].slice(0,1)).toUpperCase();
}

function nestiqSignupPhotoCamSvg(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
}

function nestiqSignupPhotoPlaceholderInner(){
  const initials=nestiqSignupPhotoInitials();
  if(initials) return initials;
  return `<span class="nestiq-signup-photo-placeholder" aria-hidden="true">${nestiqSignupPhotoCamSvg()}</span>`;
}

function nestiqRenderSignupPhotoPreview(){
  const preview=document.getElementById('tself_photo_preview');
  const wrap=document.getElementById('tself_photo_wrap');
  const removeBtn=document.getElementById('tself_photo_remove');
  if(!preview) return;
  const dataUrl=String(window.__nestiqSignupPhotoDataUrl||'');
  const has=dataUrl.startsWith('data:image/')||/^https?:\/\//i.test(dataUrl);
  wrap?.classList.toggle('has-photo', has);
  if(removeBtn) removeBtn.style.display=has?'inline':'none';
  if(has){
    preview.innerHTML=`<img src="${dataUrl.replace(/"/g,'&quot;')}" alt="Profile preview">
      <span class="nestiq-signup-photo-overlay">${nestiqSignupPhotoCamSvg()}<span>Change</span></span>`;
  }else{
    preview.innerHTML=`${nestiqSignupPhotoPlaceholderInner()}
      <span class="nestiq-signup-photo-overlay">${nestiqSignupPhotoCamSvg()}<span>Add</span></span>`;
  }
}

function nestiqSignupPhotoClear(ev){
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
  window.__nestiqSignupPhotoDataUrl='';
  const input=document.getElementById('tself_photo_input');
  if(input) input.value='';
  nestiqRenderSignupPhotoPreview();
}

function nestiqSignupPhotoFromFile(file){
  if(!file) return;
  const type=String(file.type||'');
  if(!type.startsWith('image/')){
    nestiqShowNotif?.('Please choose a JPG, PNG or WebP photo.','warning');
    return;
  }
  if(file.size>8*1024*1024){
    nestiqShowNotif?.('That photo is too large. Please use an image under 8 MB.','warning');
    return;
  }
  const apply=b64=>{
    window.__nestiqSignupPhotoDataUrl=b64;
    nestiqRenderSignupPhotoPreview();
  };
  if(typeof compressImage==='function'){
    compressImage(file,480,0.84,apply);
  }else{
    const reader=new FileReader();
    reader.onload=()=>apply(String(reader.result||''));
    reader.readAsDataURL(file);
  }
}

function nestiqInitSignupPhotoPicker(){
  const wrap=document.getElementById('tself_photo_wrap');
  const input=document.getElementById('tself_photo_input');
  const btn=document.getElementById('tself_photo_btn');
  if(!wrap||!input||wrap.dataset.bound==='1'){
    nestiqRenderSignupPhotoPreview();
    return;
  }
  wrap.dataset.bound='1';
  btn?.addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>{
    nestiqSignupPhotoFromFile(input.files?.[0]);
    input.value='';
  });
  document.getElementById('tself_name')?.addEventListener('input',()=>{
    if(!window.__nestiqSignupPhotoDataUrl) nestiqRenderSignupPhotoPreview();
  });
  ['dragenter','dragover'].forEach(ev=>{
    wrap.addEventListener(ev,e=>{ e.preventDefault(); e.stopPropagation(); wrap.classList.add('is-dragover'); });
  });
  ['dragleave','drop'].forEach(ev=>{
    wrap.addEventListener(ev,e=>{ e.preventDefault(); e.stopPropagation(); wrap.classList.remove('is-dragover'); });
  });
  wrap.addEventListener('drop',e=>{
    const f=e.dataTransfer?.files?.[0];
    if(f) nestiqSignupPhotoFromFile(f);
  });
  nestiqRenderSignupPhotoPreview();
}

async function nestiqPersistSignupProfilePhoto(uid){
  const dataUrl=String(window.__nestiqSignupPhotoDataUrl||'').trim();
  if(!uid||!dataUrl.startsWith('data:image/')) return '';
  if(typeof window.uploadNestiqFile==='function'){
    try{
      const url=String(await window.uploadNestiqFile(`avatars/${uid}/profile.jpg`, dataUrl, 'image/jpeg')||'');
      if(url) return url;
    }catch(err){
      console.warn('NestIQ signup profile photo', err);
    }
  }
  if(typeof nestiqPhotoUrlForFirestore==='function'){
    return nestiqPhotoUrlForFirestore(dataUrl)||'';
  }
  return dataUrl;
}

function nestiqShowTenantEntry(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--wide">
        ${nestiqAuthBrandHtml()}
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Tenant portal</h2>
        <p class="modal-sub">Create an account to apply for a listing, or sign in if you already have one. After a landlord approves you, use this same login to sign your lease.</p>
        <div class="nestiq-tab-row" id="tenant_tab_row">
          <button type="button" class="nestiq-tab" id="ttab_reg" onclick="nestiqTenantTab('reg')">Create an account</button>
          <button type="button" class="nestiq-tab active" id="ttab_in" onclick="nestiqTenantTab('in')">Sign in</button>
        </div>
        <div id="tenant_panel_inv" style="display:none">
          <p style="font-size:0.86rem;color:var(--muted);margin-bottom:12px">Your landlord sent you a portal link. Confirm the code below to connect your account.</p>
          <div class="form-group"><label>Invitation code</label><input class="form-input" id="tinv_code" placeholder="NQ-XXXXXX" oninput="this.value=this.value.toUpperCase().replace(/[^NQ0-9A-Z-]/gi,'')"></div>
          <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqTenantLookupInvite()">Continue</button>
          <div id="tinv_result" style="margin-top:16px"></div>
        </div>
        <div id="tenant_panel_reg" style="display:none">
          <p style="font-size:0.86rem;color:var(--muted);margin-bottom:12px">Create your login first, then apply from Browse listings. When a landlord accepts your application, sign in with this same account to unlock that property and sign your lease.</p>
          <div class="nestiq-signup-photo" id="tself_photo_wrap">
            <button type="button" class="nestiq-signup-photo-btn" id="tself_photo_btn" aria-label="Add a profile photo (optional)">
              <span class="nestiq-signup-photo-ring">
                <span class="nestiq-signup-photo-preview" id="tself_photo_preview"></span>
              </span>
              <span class="nestiq-signup-photo-badge">Optional</span>
            </button>
            <input type="file" id="tself_photo_input" accept="image/jpeg,image/png,image/webp,image/*" hidden>
            <div class="nestiq-signup-photo-copy">
              <div class="nestiq-signup-photo-title">Profile photo</div>
              <div class="nestiq-signup-photo-hint">Optional — a clear headshot helps landlords recognise you. JPG, PNG or WebP.</div>
              <button type="button" class="nestiq-signup-photo-remove" id="tself_photo_remove" onclick="nestiqSignupPhotoClear(event)">Remove photo</button>
            </div>
          </div>
          <div class="form-group"><label>Full name</label><input class="form-input" id="tself_name" autocomplete="name" placeholder="As on your ID"></div>
          <div class="form-group"><label>Email</label><input class="form-input" id="tself_email" type="email" autocomplete="email"></div>
          <div class="form-group"><label>Phone</label><input class="form-input" id="tself_phone" type="tel" autocomplete="tel" placeholder="e.g. 082 123 4567"></div>
          ${nestiqPasswordGroupHtml('tself')}
          <div class="form-group"><label>Confirm password</label>
            <div class="nestiq-auth-pw">
              <input class="form-input" id="tself_pw2" type="password" autocomplete="new-password" oninput="nestiqRefreshPasswordRulesUi('tself')">
              <button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('tself_pw2',this)">Show</button>
            </div>
            <div id="tself_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
          </div>
          <div id="tself_err" class="nestiq-auth-err"></div>
          <button type="button" class="btn-gold" id="tself_submit" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitSelfServiceTenantSignup()">Create account</button>
        </div>
        <div id="tenant_panel_in">
          <div class="form-group"><label>Email</label><input class="form-input" id="tli_email" type="email" autocomplete="username"></div>
          <div class="form-group"><label>Password</label>
            <div class="nestiq-auth-pw">
              <input class="form-input" id="tli_pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')nestiqSubmitTenantSignIn()">
              <button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('tli_pass',this)">Show</button>
            </div>
          </div>
          <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
          <div id="tli_err" class="nestiq-auth-err"></div>
          <button type="button" class="btn-primary" id="tli_submit" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSubmitTenantSignIn()">Sign In</button>
        </div>
      </div>
    </section>`;
  let preferTab='in';
  try{
    preferTab=sessionStorage.getItem('nestiq-auth-prefer-tab')||'in';
    sessionStorage.removeItem('nestiq-auth-prefer-tab');
  }catch(_e){}
  if(preferTab==='inv') preferTab='in';
  if(preferTab==='reg'||preferTab==='in') nestiqTenantTab(preferTab);
  else nestiqTenantTab('in');
  nestiqInitSignupPhotoPicker();
}

function nestiqTenantTab(which){
  if(which==='inv' && !document.getElementById('tinv_code')) which='in';
  document.getElementById('ttab_reg')?.classList.toggle('active',which==='reg');
  document.getElementById('ttab_in')?.classList.toggle('active',which==='in');
  const tabs=document.getElementById('tenant_tab_row');
  if(tabs) tabs.style.display=which==='inv'?'none':'flex';
  const p1=document.getElementById('tenant_panel_inv');
  const p2=document.getElementById('tenant_panel_in');
  const p3=document.getElementById('tenant_panel_reg');
  if(p1) p1.style.display=which==='inv'?'block':'none';
  if(p2) p2.style.display=which==='in'?'block':'none';
  if(p3) p3.style.display=which==='reg'?'block':'none';
}

/**
 * Self-service signup (no invitation). Creates Auth user + unassigned tenant profile.
 * Landlord-scoped tenant docs are created later when they apply to a listing.
 */
async function nestiqSubmitSelfServiceTenantSignup(){
  nestiqReleaseAuthEntryHold();
  const errEl=document.getElementById('tself_err');
  if(errEl) errEl.textContent='';
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  const name=(document.getElementById('tself_name')?.value||'').trim();
  const email=(document.getElementById('tself_email')?.value||'').trim().toLowerCase();
  const phone=(document.getElementById('tself_phone')?.value||'').trim();
  const p1=(document.getElementById('tself_pw')?.value||'');
  const p2=(document.getElementById('tself_pw2')?.value||'');
  const st=nestiqPasswordStrength(p1);
  if(!name){ if(errEl) errEl.textContent='Full name is required'; return; }
  if(!email){ if(errEl) errEl.textContent='Email is required'; return; }
  if(!phone){ if(errEl) errEl.textContent='Phone is required'; return; }
  if(!st.ok){ if(errEl) errEl.textContent=NESTIQ_PW_FAIL; return; }
  if(p1!==p2){ if(errEl) errEl.textContent='Passwords do not match'; return; }
  if(!window.nestiqDb||typeof firebase==='undefined'){
    if(errEl) errEl.textContent='Firebase is not ready. Refresh and try again.';
    return;
  }
  const submitBtn=document.getElementById('tself_submit');
  nestiqSetBtnLoading?.(submitBtn,true,'Creating account…');
  try{
    const cred=await firebase.auth().createUserWithEmailAndPassword(email,p1);
    const uid=cred.user.uid;
    let photoUrl='';
    try{ photoUrl=await nestiqPersistSignupProfilePhoto(uid); }catch(_e){}
    try{ await cred.user.updateProfile({ displayName:name, ...(photoUrl?{ photoURL:photoUrl }:{}) }); }catch(_e){}
    const fv=firebase.firestore.FieldValue;
    const profile={
      role:'tenant',
      name,
      email,
      phone,
      status:'unassigned',
      selfRegistered:true,
      tenantDocId:uid,
      tenantId:null,
      landlordId:null,
      propertyId:null,
      createdAt:fv.serverTimestamp()
    };
    if(photoUrl) profile.profilePhoto=photoUrl;
    await firebase.firestore().collection('users').doc(uid).set(profile,{ merge:true });
    await firebase.firestore().collection('pendingClaims').doc(uid).set({
      role:'tenant',
      status:'unassigned',
      selfRegistered:true,
      name,
      phone,
      ...(photoUrl?{ profilePhoto:photoUrl }:{}),
      createdAt:fv.serverTimestamp()
    },{ merge:true });
    const acctPayload={
      status:'unassigned',
      selfRegistered:true,
      name,
      email,
      phone,
      landlordId:'',
      tenantId:uid,
      propertyId:'',
      createdAt:fv.serverTimestamp()
    };
    try{
      const favs=JSON.parse(localStorage.getItem('nestiq_favourites')||'[]');
      if(Array.isArray(favs)&&favs.length){
        acctPayload.favourites=favs.map(id=>String(id||'').trim()).filter(Boolean);
      }
    }catch(_e){}
    if(photoUrl) acctPayload.profilePhoto=photoUrl;
    const acct=window.nestiqFs?.tenantAccount?.(window.nestiqDb, uid);
    if(acct){
      await acct.set(acctPayload,{ merge:true });
    }else{
      await window.nestiqDb.collection('tenantAccounts').doc(uid).set(acctPayload,{ merge:true });
    }
    window.__nestiqSignupPhotoDataUrl='';
    window.nestiqTenantSession={
      landlordId:'',
      tenantId:uid,
      propertyId:'',
      status:'unassigned'
    };
    window.__nestiqSession={
      role:'tenant',
      userId:uid,
      tenantDocId:uid,
      landlordId:null,
      name,
      email,
      phone,
      uid,
      status:'unassigned',
      selfRegistered:true,
      ...(photoUrl?{ profilePhoto:photoUrl }:{}),
      loggedInAt:new Date().toISOString()
    };
    try{ sessionStorage.setItem('nestiq-session',JSON.stringify(window.__nestiqSession)); }catch(_e){}
    try{
      const claimed=await window.nestiqClaimTenantEmailPortalLink?.(uid, email);
      if(claimed && claimed.landlordId){
        window.nestiqTenantSession={
          landlordId:claimed.landlordId,
          tenantId:claimed.tenantId,
          propertyId:claimed.propertyId||'',
          status:claimed.status||'active'
        };
        window.__nestiqSession.landlordId=claimed.landlordId;
        window.__nestiqSession.tenantDocId=claimed.tenantId;
        window.__nestiqSession.status=claimed.status||'active';
        window.__nestiqSession.selfRegistered=false;
        try{ sessionStorage.setItem('nestiq-session',JSON.stringify(window.__nestiqSession)); }catch(_e2){}
        nestiqShowNotif?.('Account created and linked to your tenancy. Welcome.','success');
      }else{
        nestiqShowNotif?.('Account created. Welcome to your portal.','success');
      }
    }catch(_e){
      nestiqShowNotif?.('Account created. Welcome to your portal.','success');
    }
    try{ await window.nestiqFavMergeOnTenantLogin?.(); }catch(_e){}
    try{ nestiqSetAuthChrome(false); }catch(_e){}
    if(typeof window.nestiqResumePendingApplyIfAny==='function'&&window.nestiqResumePendingApplyIfAny()){
      return;
    }
    try{ history.replaceState(null,'',location.pathname+location.search+'#tenant-dashboard'); }catch(_e){}
    if(typeof window.nestiqBootstrapApp==='function') window.nestiqBootstrapApp();
    else if(typeof mountPage==='function') mountPage('tenant-dashboard').catch(()=>{});
  }catch(e){
    nestiqSetBtnLoading?.(submitBtn,false);
    const code=String(e?.code||'');
    if(code==='auth/email-already-in-use'){
      if(errEl) errEl.textContent='That email already has an account. Sign in instead.';
    }else if(errEl){
      errEl.textContent=nestiqFirebaseAuthMessage(e);
    }
  }
}
window.nestiqSubmitSelfServiceTenantSignup=nestiqSubmitSelfServiceTenantSignup;

function nestiqAuthHtmlEsc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function nestiqCurrentAuthUser(){
  try{
    if(typeof firebase==='undefined'||!firebase.auth) return null;
    const u=firebase.auth().currentUser;
    if(!u||u.isAnonymous) return null;
    return u;
  }catch(_e){ return null; }
}

function nestiqAuthEmailsEqual(a,b){
  return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
}

function nestiqFillTenantInviteRedeemForm(el, inv){
  if(!el||!inv) return;
  const name=nestiqAuthHtmlEsc(inv.tenantName||'—');
  const prop=nestiqAuthHtmlEsc(inv.propertyName||'—');
  const landlord=nestiqAuthHtmlEsc(inv.landlordName||'—');
  const invEmail=String(inv.tenantEmail||'').trim().toLowerCase();
  const emailAttr=nestiqAuthHtmlEsc(invEmail);
  const user=nestiqCurrentAuthUser();
  const userEmail=String(user?.email||'').trim().toLowerCase();
  const signedInOther=!!(user && invEmail && userEmail && !nestiqAuthEmailsEqual(userEmail, invEmail));
  const signedInMatch=!!(user && (!invEmail || nestiqAuthEmailsEqual(userEmail, invEmail)));
  let fields='';
  if(signedInOther){
    fields=`
      <p class="nestiq-auth-err">You are signed in as ${nestiqAuthHtmlEsc(userEmail)}, but this invitation is for ${emailAttr}. Sign out, then sign in with the account you used when you applied.</p>
      <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" onclick="logoutSession({dest:'tenant'})">Sign out</button>`;
  }else if(signedInMatch){
    fields=`
      <p style="font-size:0.86rem;color:var(--muted);margin:12px 0">You are already signed in as <strong>${nestiqAuthHtmlEsc(userEmail||invEmail)}</strong>. This invitation will unlock the property on this account — you do not need a new password.</p>
      <input type="hidden" id="treg_email" value="${emailAttr||nestiqAuthHtmlEsc(userEmail)}">
      <div id="treg_err" class="nestiq-auth-err"></div>
      <button type="button" class="btn-gold" id="treg_submit" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitTenantRegistration()">Unlock tenant portal</button>`;
  }else{
    fields=`
      <p style="font-size:0.86rem;color:var(--muted);margin:12px 0">If you created an account to apply, enter <strong>that same password</strong> — do not make a new one. If you have never signed up, choose a password here.</p>
      <div class="form-group"><label>Full name</label><input class="form-input" id="treg_name" value="${name}" readonly></div>
      <div class="form-group"><label>Email</label><input class="form-input" id="treg_email" type="email" value="${emailAttr}" autocomplete="username"></div>
      ${nestiqPasswordGroupHtml('treg')}
      <div class="form-group"><label>Confirm password</label><input class="form-input" id="treg_pw2" type="password" autocomplete="new-password" oninput="nestiqRefreshPasswordRulesUi('treg')">
        <div id="treg_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
      </div>
      <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
      <div id="treg_err" class="nestiq-auth-err"></div>
      <button type="button" class="btn-gold" id="treg_submit" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitTenantRegistration()">Unlock tenant portal</button>`;
  }
  el.innerHTML=`
    <div class="nestiq-invite-summary">
      <p><strong>Invitation for:</strong></p>
      <p>${prop} · ${name}</p>
      <p>Landlord: ${landlord}</p>
    </div>
    ${fields}`;
}

async function nestiqTenantLookupInvite(){
  const raw=(document.getElementById('tinv_code')?.value||'').trim().toUpperCase();
  const el=document.getElementById('tinv_result');
  if(!el) return;
  if(!/^NQ-[A-Z0-9]{6}$/.test(raw)){
    el.innerHTML='<p class="nestiq-auth-err">Enter a valid code like NQ-123456</p>';
    return;
  }
  if(!window.nestiqDb){
    el.innerHTML='<p class="nestiq-auth-err">Firebase not ready</p>';
    return;
  }
  el.innerHTML='<p style="color:var(--muted)">Looking up…</p>';
  let inv=null;
  try{
    if(typeof window.nestiqLookupInvitationByCode!=='function'){
      el.innerHTML='<p class="nestiq-auth-err">Invitation service not loaded. Refresh the page and try again.</p>';
      return;
    }
    inv=await window.nestiqLookupInvitationByCode(raw);
  }catch(e){
    console.warn('NestIQ invitation lookup', e);
    const code=String(e?.code||'');
    const msg=String(e?.message||'');
    if(code==='permission-denied'||/permission/i.test(msg)){
      el.innerHTML='<p class="nestiq-auth-err">Could not verify this code (server permissions). Ask your landlord to resend a new invitation, or open the direct invite link they sent.</p>';
    }else if(/index/i.test(msg)){
      el.innerHTML='<p class="nestiq-auth-err">Invitation lookup is still being set up on the server. Try again in a few minutes or use the invite link from your landlord.</p>';
    }else{
      el.innerHTML='<p class="nestiq-auth-err">Could not look up that code. Check your connection and try again.</p>';
    }
    return;
  }
  if(!inv){
    el.innerHTML='<p class="nestiq-auth-err">Invitation code not found or expired. Please contact your landlord for a new invitation.</p>';
    return;
  }
  window.__nestiqPendingInvite=inv;
  nestiqFillTenantInviteRedeemForm(el, inv);
}

function nestiqFirebaseAuthMessage(err){
  const code=String(err?.code||'');
  const msg=String(err?.message||err||'');
  if(code==='auth/too-many-requests'||/too-many-requests/i.test(msg)){
    return 'Firebase temporarily blocked this device after too many sign-in or sign-up attempts. Wait 15–30 minutes (do not keep retrying), then try again. A different network such as mobile data can work sooner.';
  }
  if(code==='auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
  if(code==='auth/invalid-email') return 'Enter a valid email address.';
  if(code==='auth/weak-password') return NESTIQ_PW_FAIL;
  if(code==='auth/wrong-password'||code==='auth/invalid-credential'||code==='auth/user-not-found'){
    return 'Email or password is incorrect.';
  }
  if(code==='auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if(code==='auth/operation-not-allowed') return 'Email sign-up is turned off in Firebase. Enable Email/Password in Authentication → Sign-in method.';
  return msg||'Sign up failed';
}
window.nestiqFirebaseAuthMessage=nestiqFirebaseAuthMessage;

async function nestiqSubmitTenantRegistration(){
  nestiqReleaseAuthEntryHold();
  const inv=window.__nestiqPendingInvite;
  const errEl=document.getElementById('treg_err')||document.getElementById('tdash_inv_err');
  const submitBtn=document.getElementById('treg_submit')||document.getElementById('tdash_inv_submit');
  if(!inv){ if(errEl) errEl.textContent='Lookup your invitation first.'; return; }
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  const invEmail=String(inv.tenantEmail||'').trim().toLowerCase();
  const existingUser=nestiqCurrentAuthUser();
  const existingEmail=String(existingUser?.email||'').trim().toLowerCase();
  const signedInWrongEmail=!!(existingUser && invEmail && existingEmail && !nestiqAuthEmailsEqual(existingEmail, invEmail));
  const canLinkCurrent=!!(existingUser && existingUser.uid && !signedInWrongEmail);
  if(signedInWrongEmail){
    if(errEl) errEl.textContent='You are signed in as '+existingEmail+', but this invitation is for '+invEmail+'. Sign out, then continue with the invitation email.';
    return;
  }
  let email=invEmail||existingEmail;
  let cred=null;
  nestiqSetBtnLoading?.(submitBtn,true,canLinkCurrent?'Unlocking portal…':'Continuing…');
  try{
    if(canLinkCurrent){
      email=existingEmail||invEmail;
      cred={ user:existingUser };
    }else{
      email=(document.getElementById('treg_email')?.value||'').trim().toLowerCase();
      const p1=(document.getElementById('treg_pw')?.value||'');
      const p2=(document.getElementById('treg_pw2')?.value||'');
      const st=nestiqPasswordStrength(p1);
      if(!email){ if(errEl) errEl.textContent='Email required'; nestiqSetBtnLoading?.(submitBtn,false); return; }
      if(invEmail && email!==invEmail){
        if(errEl) errEl.textContent='Use the same email address as on your invitation ('+invEmail+').';
        nestiqSetBtnLoading?.(submitBtn,false);
        return;
      }
      if(!st.ok){ if(errEl) errEl.textContent=NESTIQ_PW_FAIL; nestiqSetBtnLoading?.(submitBtn,false); return; }
      if(p1!==p2){ if(errEl) errEl.textContent='Passwords do not match'; nestiqSetBtnLoading?.(submitBtn,false); return; }
      try{
        cred=await firebase.auth().createUserWithEmailAndPassword(email,p1);
      }catch(createErr){
        if(String(createErr?.code||'')==='auth/email-already-in-use'){
          // Applicant already created an account before applying — sign in, then link invitation.
          try{
            cred=await firebase.auth().signInWithEmailAndPassword(email,p1);
          }catch(signErr){
            const sc=String(signErr?.code||'');
            if(sc==='auth/wrong-password'||sc==='auth/invalid-credential'||sc==='auth/user-not-found'){
              nestiqSetBtnLoading?.(submitBtn,false);
              if(errEl) errEl.textContent='This email already has a NestIQ account from when you applied. Enter that same password — not a new one. If you forgot it, use Forgot password.';
              return;
            }
            throw signErr;
          }
        }else{
          throw createErr;
        }
      }
    }
    const tenantDocId=String(inv.tenantId!=null?inv.tenantId:'').trim();
    const fv=firebase.firestore.FieldValue;
    await firebase.firestore().collection('pendingClaims').doc(cred.user.uid).set({
      role:'tenant',
      tenantId:tenantDocId,
      tenantDocId,
      propertyId:inv.propertyId,
      name:inv.tenantName,
      invitationCode:inv.code,
      landlordId:inv.landlordId,
      createdAt:fv.serverTimestamp()
    });
    await window.nestiqCompleteInvitationAcceptance?.(inv,cred.user.uid,email);
    const resultEl=document.getElementById('tinv_result');
    if(resultEl){
      resultEl.innerHTML=`
        <div class="nestiq-success-box">
          <p><strong>Portal access linked! 🎉</strong></p>
          <p>Welcome to NestIQ, ${nestiqAuthHtmlEsc(inv.tenantName||'')}.</p>
          <button type="button" class="btn-primary" style="margin-top:12px" onclick="location.reload()">Go to My Portal →</button>
        </div>`;
    }else{
      nestiqShowNotif?.('Portal access linked — loading your tenant portal','success');
      location.reload();
    }
  }catch(e){
    nestiqSetBtnLoading?.(submitBtn,false);
    console.warn('NestIQ: tenant invitation registration failed', e);
    if(errEl) errEl.textContent=nestiqFirebaseAuthMessage(e);
  }
}

async function nestiqTenantDashboardRedeemInvite(){
  const errEl=document.getElementById('tdash_inv_err');
  const submitBtn=document.getElementById('tdash_inv_submit');
  const raw=(document.getElementById('tdash_inv_code')?.value||'').trim().toUpperCase();
  if(errEl) errEl.textContent='';
  if(!/^NQ-[A-Z0-9]{6}$/.test(raw)){
    if(errEl) errEl.textContent='Enter a valid code like NQ-123456';
    return;
  }
  if(typeof window.nestiqLookupInvitationByCode!=='function'||!window.nestiqDb){
    if(errEl) errEl.textContent='Invitation service not ready. Refresh and try again.';
    return;
  }
  nestiqSetBtnLoading?.(submitBtn,true,'Looking up…');
  try{
    const inv=await window.nestiqLookupInvitationByCode(raw);
    if(!inv){
      nestiqSetBtnLoading?.(submitBtn,false);
      if(errEl) errEl.textContent='Invitation code not found or expired.';
      return;
    }
    window.__nestiqPendingInvite=inv;
    await nestiqSubmitTenantRegistration();
  }catch(e){
    nestiqSetBtnLoading?.(submitBtn,false);
    console.warn('NestIQ: dashboard invitation redeem failed', e);
    if(errEl) errEl.textContent=nestiqFirebaseAuthMessage(e);
  }
}
window.nestiqTenantDashboardRedeemInvite=nestiqTenantDashboardRedeemInvite;

async function nestiqSubmitTenantSignIn(){
  nestiqReleaseAuthEntryHold();
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  const email=(document.getElementById('tli_email')?.value||'').trim().toLowerCase();
  const pass=(document.getElementById('tli_pass')?.value||'');
  const err=document.getElementById('tli_err');
  if(err) err.textContent='';
  if(!email||!pass){ if(err) err.textContent='Enter email and password.'; return; }
  nestiqAuthSetSigningIn(true,'tli_submit');
  try{
    await firebase.auth().signInWithEmailAndPassword(email,pass);
    try{ history.replaceState(null,'',location.pathname+location.search+'#tenant-dashboard'); }catch(_e){}
    if(typeof window.nestiqResumePendingApplyIfAny==='function'){
      setTimeout(()=>{ try{ window.nestiqResumePendingApplyIfAny(); }catch(_e){} }, 800);
    }
  }catch(e){
    nestiqAuthSetSigningIn(false,'tli_submit');
    if(err) err.textContent='Invalid email or password.';
  }
}

function nestiqShowPasswordReset(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card">
        ${nestiqAuthBrandHtml()}
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Reset your password</h2>
        <p class="modal-sub">Enter the email address for your account</p>
        <div class="form-group"><label>Email</label><input class="form-input" id="rst_email" type="email"></div>
        <div id="rst_msg" style="font-size:0.86rem;color:var(--muted);min-height:20px"></div>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSendPasswordReset()">Send reset email</button>
        <p class="nestiq-auth-footer"><a href="#" onclick="nestiqShowSignInLandlord();return false;">Back to sign in</a></p>
      </div>
    </section>`;
}

async function nestiqSendPasswordReset(){
  const email=(document.getElementById('rst_email')?.value||'').trim();
  const msg=document.getElementById('rst_msg');
  if(!email){ if(msg) msg.textContent='Enter your email.'; return; }
  try{
    await firebase.auth().sendPasswordResetEmail(email);
  }catch(_e){}
  if(msg){
    msg.innerHTML='If an account exists with that email address, you will receive a password reset link shortly. Check your spam folder if you do not see it within a few minutes.';
  }
}

const NESTIQ_PW_SPECIAL=/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;
const NESTIQ_PW_FAIL='Please meet all password requirements: 8+ characters, uppercase, lowercase, a number, and a special character (!@#$%).';

const NESTIQ_PW_FIELDS={
  su:{pw:'su_pass',confirm:'su_pass2',bar:'su_pw_bar',match:'su_pw_match',rules:'su_pw_rules'},
  tself:{pw:'tself_pw',confirm:'tself_pw2',bar:'tself_pw_bar',match:'tself_pw_match',rules:'tself_pw_rules'},
  treg:{pw:'treg_pw',confirm:'treg_pw2',bar:'treg_pw_bar',match:'treg_pw_match',rules:'treg_pw_rules'},
  creg:{pw:'creg_pw',confirm:'creg_pw2',bar:'creg_pw_bar',match:'creg_pw_match',rules:'creg_pw_rules'},
  cp:{pw:'cp_new',confirm:'cp_new2',bar:'cp_pw_bar',match:'cp_pw_match',rules:'cp_pw_rules'},
  tenant:{pw:'tenantNewPass',confirm:'tenantNewPass2',bar:'tenant_pw_bar',match:'tenant_pw_match',rules:'tenant_pw_rules'}
};

function nestiqPasswordStrength(pw){
  const s=String(pw||'');
  const len=s.length>=8;
  const upper=/[A-Z]/.test(s);
  const lower=/[a-z]/.test(s);
  const num=/[0-9]/.test(s);
  const special=NESTIQ_PW_SPECIAL.test(s);
  const met=[len,upper,lower,num,special].filter(Boolean).length;
  const ok=met===5;
  let label='Weak',cls='nestiq-pw-weak';
  if(met>=5){ label='Strong'; cls='nestiq-pw-strong'; }
  else if(met>=3){ label='Medium'; cls='nestiq-pw-medium'; }
  return { ok, score:met, label, cls, len, upper, lower, num, special };
}

function nestiqPasswordRulesBlock(kind){
  const f=NESTIQ_PW_FIELDS[kind];
  if(!f) return '';
  return `<div class="nestiq-pw-rules" id="${f.rules}">
      <div class="nestiq-pw-rules-title">Password requirements</div>
      <ul class="nestiq-pw-rules-list">
        <li class="nestiq-pw-rule" data-rule="len">At least 8 characters</li>
        <li class="nestiq-pw-rule" data-rule="upper">One uppercase letter (A–Z)</li>
        <li class="nestiq-pw-rule" data-rule="lower">One lowercase letter (a–z)</li>
        <li class="nestiq-pw-rule" data-rule="num">One number (0–9)</li>
        <li class="nestiq-pw-rule" data-rule="special">One special character (!@#$%)</li>
      </ul>
    </div>`;
}

function nestiqPasswordStrengthHtml(kind){
  const f=NESTIQ_PW_FIELDS[kind];
  if(!f) return '';
  return `<div id="${f.bar}" class="nestiq-pw-strength nestiq-pw-weak" hidden>
      <div class="nestiq-pw-strength-head">Password strength: <span class="nestiq-pw-strength-word">Weak</span></div>
      <div class="nestiq-pw-strength-track" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>`;
}

function nestiqPasswordGroupHtml(kind, opts){
  const f=NESTIQ_PW_FIELDS[kind];
  if(!f) return '';
  opts=opts||{};
  const ph=opts.placeholder?` placeholder="${String(opts.placeholder).replace(/"/g,'&quot;')}"`:'';
  return `<div class="form-group">
      ${nestiqPasswordRulesBlock(kind)}
      <label>${opts.label||'Password'}</label>
      <div class="nestiq-auth-pw"><input class="form-input" id="${f.pw}" type="password" autocomplete="new-password"${ph} oninput="nestiqRefreshPasswordRulesUi('${kind}')"><button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('${f.pw}',this)">Show</button></div>
      ${nestiqPasswordStrengthHtml(kind)}
    </div>`;
}

function nestiqRefreshPasswordRulesUi(kind){
  const f=NESTIQ_PW_FIELDS[kind];
  if(!f) return;
  const pw=document.getElementById(f.pw)?.value||'';
  const st=nestiqPasswordStrength(pw);
  const rules=document.getElementById(f.rules);
  if(rules){
    const mark=(rule,ok)=>{
      const el=rules.querySelector('[data-rule="'+rule+'"]');
      if(el) el.classList.toggle('met', !!ok);
    };
    mark('len', st.len);
    mark('upper', st.upper);
    mark('lower', st.lower);
    mark('num', st.num);
    mark('special', st.special);
  }
  const bar=document.getElementById(f.bar);
  if(bar){
    bar.hidden=!pw;
    bar.className='nestiq-pw-strength '+st.cls;
    const word=bar.querySelector('.nestiq-pw-strength-word');
    if(word) word.textContent=st.label;
  }
  const match=document.getElementById(f.match);
  const p2=document.getElementById(f.confirm)?.value||'';
  if(match){
    if(!p2) match.textContent='';
    else match.innerHTML=pw===p2?'<span class="nestiq-ok">✓ Passwords match</span>':'<span class="nestiq-bad">✗ Passwords do not match</span>';
  }
}

function nestiqRefreshSignupPwUi(){
  nestiqRefreshPasswordRulesUi('su');
}

function nestiqShowSignupForm(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--signup">
        ${nestiqAuthBrandHtml()}
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Create your account</h2>
        <p class="modal-sub">Free to start. No credit card needed.</p>
        <div class="form-group"><label>Full name</label><input class="form-input" id="su_name" placeholder="Your full name" oninput="nestiqRefreshSignupPwUi()"></div>
        <div class="form-group"><label>Email</label><input class="form-input" id="su_email" type="email" placeholder="you@example.com" oninput="nestiqRefreshSignupPwUi()"></div>
        <div class="form-group"><label>Phone</label><input class="form-input" id="su_phone" placeholder="071 000 0000" oninput="nestiqRefreshSignupPwUi()">
          <div style="font-size:0.76rem;color:var(--muted);margin-top:4px">Used for WhatsApp notifications</div></div>
        ${nestiqPasswordGroupHtml('su',{placeholder:'Create a password'})}
        <div class="form-group"><label>Confirm password</label>
          <div class="nestiq-auth-pw">
            <input class="form-input" id="su_pass2" type="password" autocomplete="new-password" oninput="nestiqRefreshSignupPwUi()">
            <button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('su_pass2',this)">Show</button>
          </div>
          <div id="su_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
        </div>
        <div class="form-group"><label>Company name <span style="color:var(--muted)">(optional)</span></label><input class="form-input" id="su_company" placeholder="Your company or trading name"></div>
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:0.84rem;margin:12px 0;cursor:pointer">
          <input type="checkbox" id="su_terms" onchange="nestiqRefreshSignupPwUi()">
          <span>I agree to the <a href="legal.html#terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="legal.html#privacy" target="_blank" rel="noopener">Privacy Policy</a></span>
        </label>
        <div id="su_err" class="nestiq-auth-err"></div>
        <button type="button" class="btn-gold" id="su_submit" style="width:100%;justify-content:center" onclick="nestiqSubmitLandlordSignup()">Create Account</button>
        <p class="nestiq-auth-footer">Already have an account? <a href="#" onclick="nestiqShowSignInLandlord();return false;">Sign in</a></p>
      </div>
    </section>`;
  nestiqRefreshSignupPwUi();
}

async function nestiqSubmitLandlordSignup(){
  nestiqReleaseAuthEntryHold();
  const errEl=document.getElementById('su_err');
  const name=(document.getElementById('su_name')?.value||'').trim();
  const email=(document.getElementById('su_email')?.value||'').trim().toLowerCase();
  const phone=(document.getElementById('su_phone')?.value||'').trim();
  const company=(document.getElementById('su_company')?.value||'').trim();
  const p1=(document.getElementById('su_pass')?.value||'');
  const p2=(document.getElementById('su_pass2')?.value||'');
  const terms=!!document.getElementById('su_terms')?.checked;
  const st=nestiqPasswordStrength(p1);
  if(errEl) errEl.textContent='';
  if(!name){ if(errEl) errEl.textContent='Enter your full name.'; return; }
  if(!email){ if(errEl) errEl.textContent='Enter your email address.'; return; }
  if(!phone){ if(errEl) errEl.textContent='Enter your phone number (used for WhatsApp notifications).'; return; }
  if(!terms){ if(errEl) errEl.textContent='Please accept the Terms of Service and Privacy Policy.'; return; }
  if(!st.ok){ if(errEl) errEl.textContent=NESTIQ_PW_FAIL; return; }
  if(p1!==p2){ if(errEl) errEl.textContent='Passwords do not match.'; return; }
  const btn=document.getElementById('su_submit');
  if(btn){ btn.disabled=true; btn.textContent='Creating your account...'; }
  try{
    if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('landlord');
    else window.__nestiqSignInIntent='landlord';
    const cred=await firebase.auth().createUserWithEmailAndPassword(email,p1);
    await cred.user.updateProfile({ displayName:name });
    const db=firebase.firestore();
    const fv=firebase.firestore.FieldValue;
    await db.collection('users').doc(cred.user.uid).set({
      role:'landlord',
      name,
      email,
      phone,
      company,
      landlordId:cred.user.uid,
      tenantId:null,
      tenantDocId:null,
      createdAt:fv.serverTimestamp()
    },{ merge:true });
    await db.collection('pendingClaims').doc(cred.user.uid).set({
      role:'landlord', name, phone, company, createdAt:fv.serverTimestamp()
    });
    const sref=window.nestiqFs?.settingsRef(db, cred.user.uid) || db.collection('landlords').doc(cred.user.uid).collection('profile').doc('settings');
    const trialBilling = typeof window.nestiqCreateDefaultTrialBilling === 'function'
      ? window.nestiqCreateDefaultTrialBilling()
      : {
          plan: 'pro',
          status: 'trial',
          trialStarted: new Date().toISOString(),
          trialEnds: new Date(Date.now() + 14 * 86400000).toISOString(),
          billingCycle: null,
          payfastPaymentId: null
        };
    const firstName = String(name || '').trim().split(/\s+/)[0] || 'Landlord';
    await sref.set({
      name, email, phone, companyName:company,
      onboardingComplete: false,
      onboardingStep: 1,
      onboardingPaused: false,
      profile: { firstName, lastName: String(name || '').trim().split(/\s+/).slice(1).join(' '), email, phone },
      landlordSettings:{ name, email, phone, companyName:company },
      billing: trialBilling,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
    window.landlordSettings = window.landlordSettings || { name, email, phone, billing: trialBilling };
    if(typeof window.nestiqSendEmailFireAndForget === 'function'){
      window.nestiqSendEmailFireAndForget('welcome', {
        to_name: firstName,
        to_email: email,
        dashboard_url: (typeof window.nestiqAppBaseUrlSafe === 'function' ? window.nestiqAppBaseUrlSafe() : (location.origin + '/')) + 'index.html',
        trial_ends: typeof window.nestiqFormatTrialEndDate === 'function' ? window.nestiqFormatTrialEndDate() : '',
        features_list: 'Unlimited properties, AI tools, tenant portal, financial reports'
      }, { landlordId: cred.user.uid, skipDuplicateCheck: false });
    }
    const needVerify=window.NESTIQ_REQUIRE_LANDLORD_EMAIL_VERIFICATION!==false;
    if(needVerify){
      const sent=await nestiqSendVerificationToUser(cred.user);
      nestiqShowVerifyEmailScreen(email,{
        sendFailed:!sent.ok,
        sendError:sent.ok?'':sent.error
      });
    }else{
      location.reload();
    }
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='Create Account'; }
    const c=e?.code;
    if(errEl){
      if(c==='auth/email-already-in-use') errEl.innerHTML='An account already exists with this email. <button type="button" class="btn-outline btn-sm" onclick="nestiqShowSignInLandlord()">Sign in</button>';
      else if(c==='auth/weak-password') errEl.textContent=NESTIQ_PW_FAIL;
      else if(c==='auth/invalid-email') errEl.textContent='Please enter a valid email address.';
      else errEl.textContent=e?.message||'Sign up failed';
    }
  }
}

/** Only used when NESTIQ_EMAIL_ACTION_CONTINUE_URL is set; domain must be allowlisted in Firebase Auth. */
function nestiqEmailVerificationActionSettings(){
  const custom=String(window.NESTIQ_EMAIL_ACTION_CONTINUE_URL||'').trim();
  if(!custom) return null;
  return { url: custom.replace(/\/?$/,'/'), handleCodeInApp: false };
}

async function nestiqSendVerificationToUser(user){
  if(!user) return { ok:false, error:'Not signed in.' };
  try{
    try{ await user.reload(); }catch(_r){}
    const ac=nestiqEmailVerificationActionSettings();
    if(ac) await user.sendEmailVerification(ac);
    else await user.sendEmailVerification();
    return { ok:true, error:'' };
  }catch(e){
    const code=e?.code||'';
    const msg=e?.message||'Could not send email';
    console.warn('NestIQ sendEmailVerification', code, msg);
    let friendly=msg;
    if(code==='auth/too-many-requests') friendly='Too many requests. Wait a few minutes, then use Resend.';
    else if(code==='auth/network-request-failed') friendly='Network error. Check your connection and try Resend.';
    else if(code==='auth/unauthorized-continue-uri'){
      friendly='This site’s domain is not allowlisted in Firebase, or NESTIQ_EMAIL_ACTION_CONTINUE_URL points to a domain that is not. In firebase-config.js leave NESTIQ_EMAIL_ACTION_CONTINUE_URL empty, or add your exact domain under Firebase Console → Authentication → Settings → Authorized domains.';
    }
    return { ok:false, error:friendly };
  }
}

let __nestiqResendVerifyTimer=null;
function nestiqShowVerifyEmailScreen(email,opts){
  opts=opts||{};
  const sendFailed=!!opts.sendFailed;
  const intro=sendFailed
    ? `<p class="modal-sub" style="text-align:center">You’re signed in as <strong style="color:var(--gold)">${String(email).replace(/</g,'&lt;')}</strong>. Firebase may not have sent the verification email yet — use <strong>Resend</strong> and check the tips below. Your portfolio stays locked until you verify.</p>`
    : `<p class="modal-sub" style="text-align:center">You’re signed in. We sent a verification link to:<br><strong style="color:var(--gold)">${String(email).replace(/</g,'&lt;')}</strong><br><span style="font-size:0.88em;color:var(--muted)">The dashboard stays hidden until you click the link in that email.</span></p>`;
  try{ nestiqHideBootOverlay(); }catch(_e){}
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card rounded-2xl shadow-xl bg-white p-8 max-w-md mx-auto">
        <div style="font-size:3rem;text-align:center">📧</div>
        <h2 class="modal-title" style="text-align:center">Verify your email address</h2>
        ${intro}
        <ol style="text-align:left;font-size:0.86rem;color:var(--muted);line-height:1.55;margin:12px 0 16px;padding-left:1.25rem;max-width:100%">
          <li>Open that inbox (check <strong>Spam</strong>, Junk, and Promotions).</li>
          <li>Look for the sender <strong>noreply</strong> / Firebase — some providers delay it a few minutes.</li>
          <li>Click <strong>Verify email</strong> in the message, then return here and press <strong>I have verified my email</strong>.</li>
        </ol>
        <p style="font-size:0.78rem;color:var(--muted);line-height:1.45;margin:0 0 10px">If it never arrives: confirm the address is correct, try <strong>Resend</strong>, and in Firebase Console → Authentication → <strong>Templates</strong> ensure the verification template is enabled. Your site domain must be under Authentication → <strong>Authorized domains</strong>.</p>
        <div id="ver_err" class="nestiq-auth-err" style="text-align:center">${opts.sendError?String(opts.sendError).replace(/</g,'&lt;'):''}</div>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqCheckEmailVerified()">I have verified my email</button>
        <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:8px" id="ver_resend" onclick="nestiqResendVerification()">Resend verification email</button>
        <p id="ver_resend_note" style="text-align:center;font-size:0.8rem;color:var(--muted)"></p>
        <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="nestiqChangeEmailAndSignout()">Use a different email</button>
        <p style="text-align:center;margin-top:16px"><a href="#" onclick="firebase.auth().signOut();return false;">Sign out</a></p>
      </div>
    </section>`;
  syncNavUserUi?.();
}

async function nestiqCheckEmailVerified(){
  const u=firebase.auth().currentUser;
  const err=document.getElementById('ver_err');
  if(!u){ if(err) err.textContent='Not signed in.'; return; }
  try{ await u.reload(); }catch(_e){}
  if(u.emailVerified){
    location.reload();
    return;
  }
  if(err) err.textContent='Email not yet verified. Please check your inbox and spam folder.';
}

async function nestiqResendVerification(){
  const u=firebase.auth().currentUser;
  const btn=document.getElementById('ver_resend');
  const note=document.getElementById('ver_resend_note');
  const errEl=document.getElementById('ver_err');
  if(!u||btn?.disabled) return;
  if(errEl) errEl.textContent='';
  const sent=await nestiqSendVerificationToUser(u);
  if(!sent.ok){
    if(errEl) errEl.textContent=sent.error;
    nestiqShowNotif(sent.error,'error');
    return;
  }
  nestiqShowNotif('Verification email sent. Check spam if you do not see it within a few minutes.','success');
  let left=60;
  btn.disabled=true;
  const tick=()=>{
    if(note) note.textContent=left>0?`Resend in ${left}s`:'';
    if(left<=0){ btn.disabled=false; if(note) note.textContent=''; if(__nestiqResendVerifyTimer) clearInterval(__nestiqResendVerifyTimer); return; }
    left--;
  };
  tick();
  __nestiqResendVerifyTimer=setInterval(tick,1000);
}

function nestiqChangeEmailAndSignout(){
  firebase.auth().signOut().then(()=>nestiqShowSignupForm());
}

function showEmailVerificationScreen(){
  const u=firebase.auth().currentUser;
  nestiqShowVerifyEmailScreen(u?.email||'',{});
}

async function nestiqSubmitLandlordSignIn(){
  nestiqReleaseAuthEntryHold();
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('landlord');
  else window.__nestiqSignInIntent='landlord';
  try{ nestiqClearDemoMode(); }catch(_e){}
  const email=(document.getElementById('li_email')?.value||'').trim().toLowerCase();
  const pass=(document.getElementById('li_pass')?.value||'');
  const err=document.getElementById('li_err');
  if(err) err.textContent='';
  if(!email||!pass){ if(err) err.textContent='Enter email and password.'; return; }
  nestiqAuthSetSigningIn(true,'li_submit');
  try{
    await firebase.auth().signInWithEmailAndPassword(email,pass);
  }catch(e){
    nestiqAuthSetSigningIn(false,'li_submit');
    if(err) err.textContent='Invalid email or password.';
  }
}

function nestiqTogglePw(id,btn){
  const el=document.getElementById(id);
  if(!el) return;
  const show=el.type==='password';
  el.type=show?'text':'password';
  if(btn) btn.textContent=show?'Hide':'Show';
}

function toggleLoginPassword(){
  nestiqTogglePw('login_pass',null);
}

function completeLogin(targetHash){
  const s=getSession?.();
  applySessionLanguage?.(s);
  const th=targetHash||'#home';
  setTimeout(()=>{
    if(window.nestiqUseFirestore){
      location.hash=th;
      const next=String(th).replace('#','').trim()||'home';
      if(typeof mountPage==='function'){
        mountPage(next).catch(()=>nestiqShowNotif?.('Page failed to load','error'));
      }
      return;
    }
    location.hash=th;
    location.reload();
  },180);
}

function switchLoginLang(lang){
  setLanguage?.(lang);
  showLandingPage();
}

function showTenantWelcomeOverlay(tenant){
  try{ nestiqHideBootOverlay(); }catch(_e){}
  const prop=propertiesData.find(p=>p.id===tenant.propertyId||p.name===tenant.property)||{};
  const rent=Number(tenant.rent||0);
  const due=tenant.monthlyDueDate||1;
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  const safeName=String(tenant.name||'').replace(/</g,'&lt;');
  outlet.innerHTML=`
    <section class="nestiq-auth-section nestiq-welcome-tenant">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--wide">
        ${nestiqAuthBrandHtml()}
        <h2 class="modal-title">Welcome, ${safeName}</h2>
        <p class="modal-sub">Your tenant portal is ready.</p>
        <div class="nestiq-auth-session">
          <div class="nestiq-auth-session-av" aria-hidden="true">${(prop.name||'P').slice(0,1).toUpperCase()}</div>
          <div>
            <div class="nestiq-auth-session-name">${prop.name||tenant.property||'—'}</div>
            <div class="nestiq-auth-session-email">${prop.addr||'—'} · Unit ${tenant.unit||'—'}</div>
            <div class="nestiq-auth-session-role">Your property</div>
          </div>
        </div>
        <p style="font-size:0.9rem;color:var(--ink);margin:0 0 8px">Rent of R${rent.toLocaleString('en-ZA')} is due on the <strong>${due}</strong> of each month.</p>
        <p class="modal-sub" style="margin-bottom:18px;text-align:left">Check rent, submit maintenance, download receipts, view your lease, and message the caretaker for this property.</p>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqDismissTenantWelcome()">Go to my dashboard</button>
      </div>
    </section>`;
}

async function nestiqDismissTenantWelcome(){
  const s=getSession();
  if(!s?.userId||!window.nestiqDb) return;
  try{
    const lid=window.nestiqTenantSession?.landlordId||s.landlordId;
    const tid=window.nestiqTenantSession?.tenantId||s.userId;
    if(lid&&tid) await window.nestiqFs.tenants(window.nestiqDb, lid).doc(String(tid)).update({ firstLogin:false });
  }catch(_e){}
  const t=tenantsData.find(x=>x.id===s.userId);
  if(t) t.firstLogin=false;
  location.hash='#tenant-dashboard';
  mountPage('tenant-dashboard').catch(()=>{});
}

function nestiqShowLandlordRoleConflictModal(){
  const em=firebase.auth().currentUser?.email||'';
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Landlord or tenant?</h2>
    <p class="modal-sub" style="line-height:1.55">You signed in with <strong>${String(em).replace(/</g,'&lt;')}</strong>, but this login is saved as a <strong>tenant</strong> account.</p>
    <p style="font-size:0.86rem;color:var(--muted);line-height:1.55;margin-top:12px">If you are a <strong>renter</strong>, use <strong>Tenant Portal</strong> on the sign-in page — not Landlord Sign In.</p>
    <p style="font-size:0.86rem;color:var(--muted);line-height:1.55;margin-top:8px">If you are the <strong>property owner</strong> and meant to manage your portfolio, you can switch this same email to landlord access (one role per login).</p>
    <div id="claim_ld_err" class="nestiq-auth-err" style="margin-top:10px"></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      <button type="button" class="btn-primary btn-sm" style="justify-content:center" onclick="nestiqSubmitClaimLandlord()">Switch this account to landlord</button>
      <button type="button" class="btn-outline btn-sm" style="justify-content:center" onclick="nestiqUseTenantPortalFromConflict()">Use Tenant Portal instead</button>
      <button type="button" class="btn-outline btn-sm" style="justify-content:center" onclick="logoutSession()">Sign out</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function nestiqUseTenantPortalFromConflict(){
  window.nestiqClearSignInIntent?.();
  nestiqCloseModalAnimated();
  if(window.nestiqAuth){
    window.nestiqAuth.signOut().then(()=>nestiqShowTenantEntry()).catch(()=>nestiqShowTenantEntry());
    return;
  }
  nestiqShowTenantEntry();
}

async function nestiqSubmitClaimLandlord(){
  nestiqReleaseAuthEntryHold();
  const err=document.getElementById('claim_ld_err');
  if(err) err.textContent='';
  try{
    if(typeof window.nestiqClaimLandlordAccount!=='function'){
      if(err) err.textContent='Account repair is not available. Refresh the page and try again.';
      return;
    }
    nestiqCloseModalAnimated();
    window.nestiqClearSignInIntent?.();
    await window.nestiqClaimLandlordAccount();
  }catch(e){
    console.error('Claim landlord',e);
    if(err) err.textContent=e?.message||'Could not switch account. Check Firestore rules are deployed.';
    else window.nestiqShowNotif?.(e?.message||'Could not switch account','error');
  }
}

/* ═══════════════════════════════
   STAFF PORTAL ENTRY
═══════════════════════════════ */
function nestiqShowContractorEntry(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  try{ nestiqSetAuthChrome(true); }catch(_e){}
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--wide">
        ${nestiqAuthBrandHtml()}
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Staff portal</h2>
        <p class="modal-sub">Redeem an invitation, or sign in if you already have a contractor or caretaker account.</p>
        <div class="nestiq-tab-row" style="flex-wrap:wrap">
          <button type="button" class="nestiq-tab active" id="ctab_inv" onclick="nestiqContractorTab('inv')">I have an invitation</button>
          <button type="button" class="nestiq-tab" id="ctab_in" onclick="nestiqContractorTab('in')">I already have an account</button>
        </div>
        <div id="contractor_panel_inv">
          <p style="font-size:0.86rem;color:var(--muted);margin-bottom:12px">Your landlord emails you an invitation code (for example CQ-123456 or CT-123456), or shares it with you.</p>
          <div class="form-group"><label>Invitation code</label><input class="form-input" id="cinv_code" placeholder="CQ-123456 or CT-123456" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9-]/gi,'')"></div>
          <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqContractorLookupInvite()">Look Up Invitation</button>
          <div id="cinv_result" style="margin-top:16px"></div>
        </div>
        <div id="contractor_panel_in" style="display:none">
          <div class="form-group"><label>Email</label><input class="form-input" id="cli_email" type="email" autocomplete="username"></div>
          <div class="form-group"><label>Password</label>
            <div class="nestiq-auth-pw">
              <input class="form-input" id="cli_pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')nestiqSubmitContractorSignIn()">
              <button type="button" class="nestiq-auth-pw-toggle" onclick="nestiqTogglePw('cli_pass',this)">Show</button>
            </div>
          </div>
          <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
          <div id="cli_err" class="nestiq-auth-err"></div>
          <button type="button" class="btn-primary" id="cli_submit" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSubmitContractorSignIn()">Sign In</button>
        </div>
      </div>
    </section>`;
}

function nestiqContractorTab(which){
  document.getElementById('ctab_inv')?.classList.toggle('active',which==='inv');
  document.getElementById('ctab_in')?.classList.toggle('active',which==='in');
  const p1=document.getElementById('contractor_panel_inv');
  const p2=document.getElementById('contractor_panel_in');
  if(p1) p1.style.display=which==='inv'?'block':'none';
  if(p2) p2.style.display=which==='in'?'block':'none';
}

async function nestiqContractorLookupInvite(){
  const raw=(document.getElementById('cinv_code')?.value||'').trim().toUpperCase();
  const el=document.getElementById('cinv_result');
  if(!el) return;
  if(!/^(CQ|CT)-[A-Z0-9]{6}$/.test(raw)){
    el.innerHTML='<p class="nestiq-auth-err">Enter a valid code like CQ-123456 or CT-123456</p>';
    return;
  }
  if(!window.nestiqDb){
    el.innerHTML='<p class="nestiq-auth-err">Firebase not ready</p>';
    return;
  }
  el.innerHTML='<p style="color:var(--muted)">Looking up…</p>';
  let inv=null;
  try{
    if(typeof window.nestiqLookupStaffInvitationByCode!=='function'){
      el.innerHTML='<p class="nestiq-auth-err">Staff invitation service not loaded. Refresh and try again.</p>';
      return;
    }
    inv=await window.nestiqLookupStaffInvitationByCode(raw);
  }catch(e){
    console.warn('NestIQ staff invitation lookup', e);
    el.innerHTML='<p class="nestiq-auth-err">Could not look up that code. Check your connection and try again.</p>';
    return;
  }
  if(!inv){
    el.innerHTML='<p class="nestiq-auth-err">Invitation code not found or expired. Please contact your landlord for a new invitation.</p>';
    return;
  }
  window.__nestiqPendingContractorInvite=inv;
  const isCaretaker=inv.role==='caretaker';
  const title=isCaretaker?'caretaker':'contractor';
  const displayType=isCaretaker?'Caretaker':String(inv.staffType||'Contractor');
  el.innerHTML=`
    <div class="nestiq-invite-summary">
      <p><strong>You have been invited as a ${title}:</strong></p>
      <p>${String(inv.staffName||'').replace(/</g,'&lt;')}</p>
      <p>Landlord: ${String(inv.landlordName||'').replace(/</g,'&lt;')}</p>
    </div>
    <div class="form-group"><label>Full name</label><input class="form-input" id="creg_name" value="${String(inv.staffName||'').replace(/"/g,'&quot;')}" readonly></div>
    <div class="form-group"><label>Email</label><input class="form-input" id="creg_email" type="email" value="${String(inv.staffEmail||'').replace(/"/g,'&quot;')}" ${inv.staffEmail?'readonly':''}></div>
    <div class="form-group"><label>Role</label><input class="form-input" id="creg_type" value="${displayType.replace(/"/g,'&quot;')}" readonly></div>
    ${nestiqPasswordGroupHtml('creg')}
    <div class="form-group"><label>Confirm password</label><input class="form-input" id="creg_pw2" type="password" autocomplete="new-password" oninput="nestiqRefreshPasswordRulesUi('creg')">
      <div id="creg_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
    </div>
    <div id="creg_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitContractorRegistration()">Create My Account</button>`;
}

async function nestiqSubmitContractorRegistration(){
  nestiqReleaseAuthEntryHold();
  const inv=window.__nestiqPendingContractorInvite;
  const errEl=document.getElementById('creg_err');
  if(!inv){ if(errEl) errEl.textContent='Look up your invitation first.'; return; }
  const invitedEmail=String(inv.staffEmail||'').trim().toLowerCase();
  const email=(document.getElementById('creg_email')?.value||invitedEmail).trim().toLowerCase();
  const p1=(document.getElementById('creg_pw')?.value||'');
  const p2=(document.getElementById('creg_pw2')?.value||'');
  const st=nestiqPasswordStrength(p1);
  if(!email){ if(errEl) errEl.textContent='Email required'; return; }
  if(invitedEmail && email!==invitedEmail){
    if(errEl) errEl.textContent='Use the same email address as on your invitation ('+invitedEmail+').';
    return;
  }
  if(!st.ok){ if(errEl) errEl.textContent=NESTIQ_PW_FAIL; return; }
  if(p1!==p2){ if(errEl) errEl.textContent='Passwords do not match'; return; }
  window.__nestiqStaffInviteLinking=true;
  try{
    let cred=null;
    try{
      cred=await firebase.auth().createUserWithEmailAndPassword(email,p1);
    }catch(createErr){
      if(String(createErr?.code||'')==='auth/email-already-in-use'){
        cred=await firebase.auth().signInWithEmailAndPassword(email,p1);
      }else throw createErr;
    }
    await cred.user.updateProfile({ displayName:inv.staffName||'' });
    try{
      const fv=firebase.firestore.FieldValue;
      await firebase.firestore().collection('pendingClaims').doc(cred.user.uid).set({
        role:inv.role==='caretaker'?'caretaker':'contractor',
        staffId:inv.staffId||'',
        landlordId:inv.landlordId||'',
        landlordName:inv.landlordName||'',
        assignedPropertyIds:Array.isArray(inv.assignedPropertyIds)?inv.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[],
        vendorId:inv.vendorId||'',
        vendorType:inv.staffType||'',
        name:inv.staffName||'',
        invitationCode:inv.code||'',
        createdAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(_e){}
    await window.nestiqCompleteStaffInvitationAcceptance(inv,cred.user.uid,email);
    window.__nestiqSession={
      role:inv.role||'contractor',
      userId:cred.user.uid,
      uid:cred.user.uid,
      name:inv.staffName||'',
      email,
      landlordId:inv.landlordId,
      landlordName:inv.landlordName||'',
      staffId:inv.staffId||'',
      assignedPropertyIds:Array.isArray(inv.assignedPropertyIds)?inv.assignedPropertyIds:[],
      vendorId:inv.role==='contractor'?(inv.vendorId||''):'',
      vendorType:inv.role==='contractor'?(inv.staffType||''):'',
      loggedInAt:new Date().toISOString()
    };
    try{ sessionStorage.setItem('nestiq-session',JSON.stringify(window.__nestiqSession)); }catch(_e){}
    const route=inv.role==='caretaker'?'caretaker-dashboard':'contractor-dashboard';
    document.getElementById('cinv_result').innerHTML=`
      <div class="nestiq-success-box">
        <p><strong>Staff portal access linked!</strong></p>
        <p>Welcome, ${String(inv.staffName||'').replace(/</g,'&lt;')}.</p>
        <button type="button" class="btn-primary" style="margin-top:12px" onclick="location.hash='#${route}';location.reload()">Go to My Dashboard →</button>
      </div>`;
  }catch(e){
    window.__nestiqStaffInviteLinking=false;
    console.warn('NestIQ: contractor registration failed', e);
    const code=String(e?.code||'');
    const msg=String(e?.message||'');
    if(errEl){
      if(code==='permission-denied'||/permission|insufficient/i.test(msg)){
        errEl.textContent='Could not finish linking this invitation (cloud permissions). Sign in with this same email, or ask your landlord to send a new code.';
      }else{
        errEl.textContent=typeof nestiqFirebaseAuthMessage==='function'?nestiqFirebaseAuthMessage(e):(e?.message||'Sign up failed');
      }
    }
  }
}

async function nestiqSubmitContractorSignIn(){
  nestiqReleaseAuthEntryHold();
  const email=(document.getElementById('cli_email')?.value||'').trim().toLowerCase();
  const pass=(document.getElementById('cli_pass')?.value||'');
  const err=document.getElementById('cli_err');
  if(err) err.textContent='';
  if(!email||!pass){ if(err) err.textContent='Enter email and password.'; return; }
  nestiqAuthSetSigningIn(true,'cli_submit');
  try{
    const cred=await firebase.auth().signInWithEmailAndPassword(email,pass);
    const uid=cred.user.uid;
    const userDoc=await window.nestiqDb.collection('users').doc(uid).get();
    let ud=userDoc.exists?userDoc.data():{};
    if(ud.role!=='contractor' && ud.role!=='caretaker'){
      try{
        const acc=await window.nestiqFs?.staffAccount?.(window.nestiqDb, uid)?.get?.();
        if(acc&&acc.exists){
          const a=acc.data()||{};
          if(a.role==='caretaker'||a.role==='contractor'){
            ud={
              role:a.role,
              name:a.name||'',
              email:a.email||email,
              landlordId:a.landlordId||'',
              landlordName:a.landlordName||'',
              staffId:a.staffId||'',
              assignedPropertyIds:Array.isArray(a.assignedPropertyIds)?a.assignedPropertyIds:[],
              vendorId:a.linkedVendorId||a.vendorId||'',
              vendorType:a.staffType||a.vendorType||''
            };
          }
        }
      }catch(_e){}
    }
    if(ud.role!=='contractor' && ud.role!=='caretaker'){
      nestiqAuthSetSigningIn(false,'cli_submit');
      if(err) err.textContent='This account is not a staff account.';
      await firebase.auth().signOut();
      return;
    }
    window.__nestiqSession={
      role:ud.role||'contractor',
      userId:uid,
      uid,
      name:ud.name||cred.user.displayName||'',
      email:ud.email||email,
      landlordId:ud.landlordId||'',
      landlordName:ud.landlordName||'',
      staffId:ud.staffId||'',
      assignedPropertyIds:Array.isArray(ud.assignedPropertyIds)?ud.assignedPropertyIds:[],
      vendorId:ud.vendorId||'',
      vendorType:ud.vendorType||'',
      loggedInAt:new Date().toISOString()
    };
    try{ sessionStorage.setItem('nestiq-session',JSON.stringify(window.__nestiqSession)); }catch(_e){}
    nestiqReleaseAuthEntryHold();
    try{ nestiqSetAuthChrome(false); }catch(_e){}
    const destHash=ud.role==='caretaker'?'#caretaker-dashboard':'#contractor-dashboard';
    try{ history.replaceState(null,'',location.pathname+location.search+destHash); }catch(_e){
      location.hash=destHash;
    }
    nestiqAuthSetSigningIn(false,'cli_submit');
    if(typeof window.nestiqBootstrapApp==='function') await window.nestiqBootstrapApp();
    else if(typeof window.showPage==='function') window.showPage(destHash.slice(1));
  }catch(e){
    nestiqAuthSetSigningIn(false,'cli_submit');
    if(err) err.textContent='Invalid email or password.';
  }
}

function nestiqContractorLogout(){
  const role=(window.__nestiqSession?.role||getSession?.()?.role||'contractor');
  nestiqConfirmSignOut({role});
}

window.nestiqShowContractorEntry=nestiqShowContractorEntry;
window.nestiqShowCaretakerEntry=nestiqShowContractorEntry;
window.nestiqContractorTab=nestiqContractorTab;
window.nestiqContractorLookupInvite=nestiqContractorLookupInvite;
window.nestiqSubmitContractorRegistration=nestiqSubmitContractorRegistration;
window.nestiqSubmitContractorSignIn=nestiqSubmitContractorSignIn;
window.nestiqContractorLogout=nestiqContractorLogout;

window.nestiqShowLandlordRoleConflictModal=nestiqShowLandlordRoleConflictModal;
window.nestiqUseTenantPortalFromConflict=nestiqUseTenantPortalFromConflict;
window.nestiqSubmitClaimLandlord=nestiqSubmitClaimLandlord;
window.logoutSession=logoutSession;
window.nestiqConfirmSignOut=nestiqConfirmSignOut;
window.nestiqPerformConfirmedSignOut=nestiqPerformConfirmedSignOut;
window.nestiqTenantLogout=nestiqTenantLogout;
window.nestiqLandlordLogout=nestiqLandlordLogout;
window.showLoginScreen=showLoginPageAlias;
window.showLandingPage=showLandingPage;
window.nestiqHandleAuthEntryFlow=nestiqHandleAuthEntryFlow;
window.nestiqGetAuthEntryFlow=nestiqGetAuthEntryFlow;
window.nestiqPeekAuthEntryFlow=nestiqPeekAuthEntryFlow;
window.nestiqHideBootOverlay=nestiqHideBootOverlay;
window.nestiqSyncTailwindDarkClass=nestiqSyncTailwindDarkClass;
window.showEmailVerificationScreen=showEmailVerificationScreen;
window.showTenantWelcomeOverlay=showTenantWelcomeOverlay;
window.nestiqDismissTenantWelcome=nestiqDismissTenantWelcome;
window.submitLogin=nestiqLegacySubmitLogin;
window.syncNavUserUi=syncNavUserUi;
window.isValidSession=isValidSession;
window.toggleLoginPassword=toggleLoginPassword;
window.switchLoginLang=switchLoginLang;
window.getSession=getSession;
window.completeLogin=completeLogin;
window.nestiqShowSignupForm=nestiqShowSignupForm;
window.nestiqRefreshPasswordRulesUi=nestiqRefreshPasswordRulesUi;
window.nestiqPasswordRulesBlock=nestiqPasswordRulesBlock;
window.nestiqPasswordGroupHtml=nestiqPasswordGroupHtml;
window.NESTIQ_PW_FAIL=NESTIQ_PW_FAIL;
window.nestiqPasswordStrength=nestiqPasswordStrength;
window.nestiqShowSignInLandlord=nestiqShowSignInLandlord;
window.nestiqSubmitLandlordSignup=nestiqSubmitLandlordSignup;
window.nestiqShowTenantEntry=nestiqShowTenantEntry;
window.nestiqSignupPhotoClear=nestiqSignupPhotoClear;
window.nestiqShowPasswordReset=nestiqShowPasswordReset;
window.nestiqCheckEmailVerified=nestiqCheckEmailVerified;
window.nestiqResendVerification=nestiqResendVerification;
window.nestiqSendVerificationToUser=nestiqSendVerificationToUser;
window.nestiqLandlordAwaitingEmailVerification=nestiqLandlordAwaitingEmailVerification;

function showLoginPageAlias(msg){ showLandingPage(msg); }

function nestiqSaveAccountProfileLandlord(){
  const nm=document.getElementById('acct_ld_name')?.value?.trim()||'';
  const ph=document.getElementById('acct_ld_phone')?.value?.trim()||'';
  landlordSettings.name=nm;
  landlordSettings.phone=ph;
  landlordName=nm||landlordName;
  const s=getSession();
  if(s){ s.name=nm; try{ sessionStorage.setItem('nestiq-session',JSON.stringify(s)); window.__nestiqSession=s; }catch(_e){} }
  const sref=window.nestiqGetSettingsDocRef?.();
  if(sref) sref.set({ name:nm, phone:ph, landlordSettings:{ ...landlordSettings } }, { merge:true }).catch(()=>{});
  saveData?.();
  syncNavUserUi?.();
  nestiqShowNotif('Account profile saved','success');
}

function nestiqSaveAccountProfileTenant(){
  const s=getSession();
  if(s?.role!=='tenant') return;
  const t=tenantsData.find(x=>x.id===s.userId);
  if(!t) return;
  t.name=document.getElementById('acct_tn_name')?.value?.trim()||t.name;
  t.phone=document.getElementById('acct_tn_phone')?.value?.trim()||t.phone;
  if(s){ s.name=t.name; try{ sessionStorage.setItem('nestiq-session',JSON.stringify(s)); window.__nestiqSession=s; }catch(_e){} }
  saveData?.();
  syncNavUserUi?.();
  nestiqShowNotif('Profile saved','success');
}

function nestiqOpenChangeEmailModal(){
  const u=firebase.auth().currentUser;
  const cur=u?.email||'';
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Change sign-in email</h2>
    <p class="modal-sub">We will send a confirmation link to the new address if your project uses “verify before update”. Otherwise the address updates immediately after you reauthenticate.</p>
    <div class="form-group"><label>Current password</label><input class="form-input" id="ce_cur" type="password" autocomplete="current-password"></div>
    <div class="form-group"><label>New email</label><input class="form-input" id="ce_new" type="email" autocomplete="email"></div>
    <div id="ce_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitChangeEmail()">Continue</button>
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="nestiqCloseModalAnimated()">Cancel</button>`;
  nestiqOpenModalAnimated();
  const ne=document.getElementById('ce_new');
  if(ne) ne.value='';
}

async function nestiqSubmitChangeEmail(){
  const curPass=document.getElementById('ce_cur')?.value||'';
  const newEmail=(document.getElementById('ce_new')?.value||'').trim().toLowerCase();
  const errEl=document.getElementById('ce_err');
  if(errEl) errEl.textContent='';
  if(!curPass||!newEmail){ if(errEl) errEl.textContent='Enter password and new email.'; return; }
  const u=firebase.auth().currentUser;
  const oldEm=u?.email;
  if(!u||!oldEm){ if(errEl) errEl.textContent='Not signed in.'; return; }
  if(newEmail===String(oldEm).toLowerCase()){ if(errEl) errEl.textContent='That is already your email.'; return; }
  const db=window.nestiqDb;
  if(!db){ if(errEl) errEl.textContent='Firestore not ready.'; return; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(oldEm,curPass);
    await u.reauthenticateWithCredential(cred);
    if(typeof u.verifyBeforeUpdateEmail==='function'){
      await u.verifyBeforeUpdateEmail(newEmail);
      nestiqCloseModalAnimated();
      nestiqShowNotif('Check the new inbox and confirm the link. Your sign-in email updates after you confirm.','success');
      return;
    }
    await u.updateEmail(newEmail);
    await db.collection('users').doc(u.uid).set({ email:newEmail }, { merge:true });
    const sref=window.nestiqGetSettingsDocRef?.();
    if(sref){
      const ls={ ...(typeof landlordSettings!=='undefined'?landlordSettings:{}) };
      ls.email=newEmail;
      await sref.set({ landlordEmail:newEmail, email:newEmail, landlordSettings:ls }, { merge:true });
    }
    try{ window.landlordEmail=newEmail; }catch(_e){}
    try{ if(typeof landlordSettings!=='undefined') landlordSettings.email=newEmail; }catch(_e){}
    const s=getSession?.();
    if(s&&s.role==='landlord'){
      s.email=newEmail;
      try{ sessionStorage.setItem('nestiq-session',JSON.stringify(s)); window.__nestiqSession=s; }catch(_e){}
    }
    const inp=document.getElementById('acct_ld_email');
    if(inp) inp.value=newEmail;
    nestiqCloseModalAnimated();
    nestiqShowNotif('Email updated.','success');
    syncNavUserUi?.();
  }catch(e){
    if(errEl) errEl.textContent=e?.message||'Could not change email';
  }
}

function nestiqOpenChangePasswordModal(){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Change password</h2>
    <p class="modal-sub">Enter your current password and a new password.</p>
    <div class="form-group"><label>Current password</label><input class="form-input" id="cp_cur" type="password"></div>
    ${nestiqPasswordGroupHtml('cp',{label:'New password'})}
    <div class="form-group"><label>Confirm new password</label><input class="form-input" id="cp_new2" type="password" autocomplete="new-password" oninput="nestiqRefreshPasswordRulesUi('cp')">
      <div id="cp_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
    </div>
    <div id="cp_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitChangePassword()">Update password</button>
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="nestiqCloseModalAnimated()">Cancel</button>`;
  nestiqOpenModalAnimated();
}

async function nestiqSubmitChangePassword(){
  const cur=document.getElementById('cp_cur')?.value||'';
  const n1=document.getElementById('cp_new')?.value||'';
  const n2=document.getElementById('cp_new2')?.value||'';
  const err=document.getElementById('cp_err');
  if(err) err.textContent='';
  if(!cur||!n1||n1!==n2){ if(err) err.textContent='Check all fields.'; return; }
  const st=nestiqPasswordStrength(n1);
  if(!st.ok){ if(err) err.textContent=NESTIQ_PW_FAIL; return; }
  const u=firebase.auth().currentUser;
  const em=u?.email;
  if(!u||!em){ if(err) err.textContent='Not signed in.'; return; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(em,cur);
    await u.reauthenticateWithCredential(cred);
    await u.updatePassword(n1);
    nestiqCloseModalAnimated();
    nestiqShowNotif('Password updated','success');
  }catch(e){
    if(err) err.textContent=e?.message||'Could not update password';
  }
}

function nestiqOpenDeleteAccountModal(){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Delete account</h2>
    <p class="modal-sub">This permanently deletes your Firebase login. Type DELETE to confirm.</p>
    <input class="form-input" id="del_confirm" placeholder="DELETE">
    <div id="del_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-outline btn-sm" style="margin-top:12px;border-color:var(--rust);color:var(--rust)" onclick="nestiqConfirmDeleteAccount()">Delete my account</button>
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="nestiqCloseModalAnimated()">Cancel</button>`;
  nestiqOpenModalAnimated();
}

async function nestiqConfirmDeleteAccount(){
  if((document.getElementById('del_confirm')?.value||'')!=='DELETE'){
    document.getElementById('del_err').textContent='Type DELETE to confirm.';
    return;
  }
  try{
    await firebase.auth().currentUser?.delete();
    nestiqCloseModalAnimated();
  }catch(e){
    document.getElementById('del_err').textContent=e?.message||'Failed — re-login and try again';
  }
}

window.nestiqSaveAccountProfileLandlord=nestiqSaveAccountProfileLandlord;
window.nestiqSaveAccountProfileTenant=nestiqSaveAccountProfileTenant;
window.nestiqOpenChangeEmailModal=nestiqOpenChangeEmailModal;
window.nestiqSubmitChangeEmail=nestiqSubmitChangeEmail;
window.nestiqOpenChangePasswordModal=nestiqOpenChangePasswordModal;
window.nestiqSubmitChangePassword=nestiqSubmitChangePassword;
window.nestiqOpenDeleteAccountModal=nestiqOpenDeleteAccountModal;
window.nestiqConfirmDeleteAccount=nestiqConfirmDeleteAccount;

async function nestiqLegacySubmitLogin(){
  if(window.nestiqUseFirestore){
    nestiqShowSignInLandlord();
    return;
  }
  const email=(document.getElementById('login_user')?.value||'').trim().toLowerCase();
  const password=(document.getElementById('login_pass')?.value||'').trim();
  const tenant=tenantsData.find(t=>String(t.email||'').toLowerCase()===email);
  if(tenant && tenantPasswordFor(tenant)===password.toLowerCase()){
    setSession({role:'tenant',userId:tenant.id,name:tenant.name,loggedInAt:new Date().toISOString()});
    completeLogin('#tenant-dashboard');
    return;
  }
  nestiqShowNotif('Use Firebase mode. Configure js/firebase-config.js and sign in.','warning');
}
