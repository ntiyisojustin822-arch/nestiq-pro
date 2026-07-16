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
    showNotif('🎉 Setup complete! NestIQ Pro is ready.','success');
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
  if(session.role==='tenant'){
    // Firestore tenants use document id as portal userId; tenant browsers do not load landlords' tenantsData[].
    if(window.nestiqUseFirestore){
      return Boolean(session.userId || session.tenantDocId);
    }
    return Boolean(tenantsData.find(t=>String(t.id)===String(session.userId)));
  }
  return false;
}

function setSession(payload){
  sessionStorage.setItem('nestiq-session', JSON.stringify(payload));
}

function clearSession(){
  sessionStorage.removeItem('nestiq-session');
  window.nestiqClearSignInIntent?.();
  try{ window.__nestiqSession=null; }catch(_e){}
  try{ nestiqClearDemoMode(); }catch(_e){}
}

function logoutSession(){
  window.__nestiqLoggingOut=true;
  try{ window.nestiqShowTenantDashboardLoading?.(false); }catch(_e){}
  try{ window.stopNestiqFirestoreListeners?.(); }catch(_e){}
  try{ clearSession(); }catch(_e){}
  try{ window.nestiqClearSignInIntent?.(); }catch(_e){}
  try{ window.nestiqClearRedirectLoop?.(); }catch(_e){}
  // Keep demo flags only if the user explicitly chose demo; normal logout exits demo.
  try{ nestiqClearDemoMode(); }catch(_e){}
  try{ syncNavUserUi(); }catch(_e){}
  try{ showLandingPage(); }catch(_e){}
  try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
  const auth=window.nestiqAuth||(window.firebase&&window.firebase.auth&&window.firebase.auth());
  if(auth&&window.nestiqUseFirestore){
    Promise.resolve(auth.signOut()).catch(()=>{}).finally(()=>{
      window.__nestiqLoggingOut=false;
    });
    return;
  }
  window.__nestiqLoggingOut=false;
}

function nestiqTenantLogout(){
  logoutSession();
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
  const verifyMode=!!(s&&awaiting);
  document.body.classList.toggle('nestiq-role-tenant', !!isTenant && !verifyMode);
  document.body.classList.toggle('nestiq-role-landlord', !!(s&&!isTenant&&!verifyMode));
  if(nav) nav.style.display=(s&&!isTenant)?'grid':(s&&isTenant)?'none':(s?'grid':'none');
  if(navLinks) navLinks.style.display=(verifyMode||isTenant)?'none':'';
  if(mobile) mobile.style.display=(isTenant||verifyMode)?'none':'';
  if(footer) footer.style.display=(isTenant||verifyMode)?'none':'';
  if(bellWrap) bellWrap.style.display=(s&&!verifyMode&&!isTenant)?'':'none';
  if(userLabel){
    userLabel.style.display=(s&&!isTenant)?'inline':'none';
    // Prefer real name; fall back to role so a mis-defaulted "Tenant" name is not shown for landlords.
    const nm=String(s?.name||'').trim();
    const roleFallback=s?.role==='landlord'?'Landlord':'Tenant';
    userLabel.textContent=(!nm || /^tenant$/i.test(nm) || /^landlord$/i.test(nm) || /^user$/i.test(nm) || /^local$/i.test(nm))
      ? roleFallback
      : nm;
  }
  if(userAvatar){
    userAvatar.style.display=(s&&!isTenant)?'inline-flex':'none';
    userAvatar.textContent=s?String(s.name||'A').charAt(0).toUpperCase():'A';
  }
  if(logoutBtn) logoutBtn.style.display=(s&&!isTenant)?'inline-flex':'none';
  if(hamburger) hamburger.style.display=(verifyMode||isTenant)?'none':'';
  if(themeWrap) themeWrap.style.display=(s&&!verifyMode&&!isTenant)?'':'none';
  if(darkToggle) darkToggle.style.display=(s&&!verifyMode&&!isTenant)?'':'none';
  const navDivider=document.querySelector('#navbar .nav-divider');
  if(navDivider) navDivider.style.display=(s&&!verifyMode&&!isTenant)?'':'none';
  const navTools=document.querySelector('#navbar .nav-tools');
  if(navTools) navTools.style.display=(s&&!verifyMode&&!isTenant)?'flex':'none';
  const navUser=document.querySelector('#navbar .nav-user');
  if(navUser) navUser.style.display=(s&&!isTenant)?'flex':'none';
  document.querySelectorAll('[data-landlord-nav]').forEach(el=>{
    if(!s||isTenant||verifyMode) el.style.display='none';
    else el.style.display=el.tagName==='LI'?'list-item':'block';
  });
  if(typeof window.nestiqUpdateNavBillingBadge === 'function') window.nestiqUpdateNavBillingBadge();
  document.querySelectorAll('[data-tenant-nav]').forEach(el=>{
    if(s&&isTenant&&!verifyMode) el.style.display=el.tagName==='LI'?'list-item':'block';
    else el.style.display='none';
  });
  const navCta=document.querySelector('#navbar .nav-cta');
  if(navCta) navCta.style.display=s?'none':'';
  document.body.classList.toggle('nestiq-verify-email',verifyMode);
  window.refreshPortfolioReportButtons?.();
}

function tenantPasswordFor(tenant){
  return String(tenant.unit||'').toLowerCase().replace(/^unit\s*/,'').replace(/\s+/g,'');
}

function nestiqHideBootOverlay(){
  document.body.classList.add('nestiq-app-ready');
  const el=document.getElementById('nestiqBootOverlay');
  if(el){ el.style.opacity='0'; setTimeout(()=>{ el.style.display='none'; }, 220); }
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
  try{
    let doc=null;
    const lookup=await window.nestiqFs.invitationLookup(window.nestiqDb, String(id)).get();
    if(lookup.exists&&lookup.data().landlordId){
      doc=await window.nestiqFs.invitations(window.nestiqDb, lookup.data().landlordId).doc(String(id).toUpperCase()).get();
    }
    if(!doc||!doc.exists){
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
      if(lid) doc=await window.nestiqFs.invitations(window.nestiqDb, lid).doc(String(id)).get();
    }
    if(!doc||!doc.exists) return;
    const d=doc.data();
    if(String(d.status||'')!=='pending') return;
    let ex=0;
    try{ ex=d.expiresAt&&d.expiresAt.toMillis?d.expiresAt.toMillis():0; }catch(_e){}
    if(ex&&ex<Date.now()) return;
    window.__nestiqPendingInvite={...d,tenantId:Number(d.tenantId),id:Number(d.id),_fireId:doc.id};
    nestiqShowTenantEntry();
    const panel=document.getElementById('tenant_panel_inv');
    if(panel){
      panel.innerHTML=`<p style="font-size:0.86rem;color:var(--muted)">Invitation loaded for <strong>${String(d.tenantName||'').replace(/</g,'&lt;')}</strong>.</p>
        <div class="form-group"><label>Full name</label><input class="form-input" id="treg_name" value="${String(d.tenantName||'').replace(/"/g,'&quot;')}" readonly></div>
        <div class="form-group"><label>Email</label><input class="form-input" id="treg_email" type="email" value="${String(d.tenantEmail||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label>Password</label><div style="display:flex;gap:8px"><input class="form-input" id="treg_pw" type="password"><button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('treg_pw',this)">Show</button></div></div>
        <div class="form-group"><label>Confirm password</label><input class="form-input" id="treg_pw2" type="password"></div>
        <div id="treg_err" class="nestiq-auth-err"></div>
        <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitTenantRegistration()">Create My Account</button>`;
    }
    nestiqTenantTab('inv');
  }catch(_e){}
}

function showLandingPage(bannerMsg=''){
  try{ window.scrollTo(0,0); }catch(_e){}
  try{ nestiqHideBootOverlay(); }catch(_e){}
  syncNavUserUi();
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;

  const entryFlow = typeof nestiqPeekAuthEntryFlow === 'function' ? nestiqPeekAuthEntryFlow() : '';
  const hasUser = !!(window.firebase?.auth?.()?.currentUser);
  if(!hasUser && (entryFlow === 'signup' || entryFlow === 'signin' || entryFlow === 'login')){
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
    <section class="nestiq-landing" style="min-height:100vh;padding:88px 24px 48px;position:relative;background:var(--paper)">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-landing-inner">
        <div class="nestiq-landing-left">
          <div class="nav-logo" style="font-size:clamp(1.6rem,3vw,2.2rem);margin-bottom:16px"><span class="logo-dot"></span>NestIQ Pro</div>
          <p class="nestiq-landing-tagline">Smart Rental Management for South African Landlords</p>
          <ul class="nestiq-landing-features">
            <li>Manage properties and tenants</li>
            <li>Track rent payments and expenses</li>
            <li>Tenant self-service portal</li>
            <li>Maintenance request management</li>
            <li>Tax reports and ROI calculator</li>
            <li>Free to get started</li>
          </ul>
          ${bannerMsg?`<div class="nestiq-landing-banner">${String(bannerMsg).replace(/</g,'&lt;')}</div>`:''}
          <div class="nestiq-landing-actions">
            <button type="button" class="btn-primary btn-lg" onclick="nestiqShowSignupForm()">Create Free Account</button>
            <button type="button" class="btn-outline btn-lg" onclick="nestiqShowSignInLandlord()">Sign In</button>
          </div>
          <div class="flex items-center gap-3 my-4" aria-hidden="true"><div class="flex-1 h-px bg-gray-200"></div><span class="text-sm text-muted">or</span><div class="flex-1 h-px bg-gray-200"></div></div>
          <div class="nestiq-landing-tenant-ctas flex flex-col gap-3">
            <button type="button" class="nestiq-landing-cta nestiq-landing-cta--outline w-full flex items-center justify-center gap-2 border border-gold text-gold rounded-xl py-3 px-5 font-medium hover:bg-gold/10 transition-all duration-200 cursor-pointer" onclick="nestiqShowTenantEntry()">
              <span class="nestiq-landing-cta-icon" aria-hidden="true">🔑</span>
              <span class="nestiq-landing-cta-label">Access Tenant Portal</span>
            </button>
            <button type="button" class="nestiq-landing-cta nestiq-landing-cta--solid w-full flex items-center justify-center gap-2 bg-gold text-white rounded-xl py-3 px-5 font-medium hover:bg-rust shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer" onclick="showPage('listings')">
              <span class="nestiq-landing-cta-icon" aria-hidden="true">🏘️</span>
              <span class="nestiq-landing-cta-label">Browse Available Listings</span>
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

function nestiqHandleAuthEntryFlow(){
  if(firebase?.auth?.()?.currentUser) return;
  const flow = nestiqGetAuthEntryFlow();
  if(flow === 'signup'){
    if(typeof window.nestiqSetSignInIntent === 'function') window.nestiqSetSignInIntent('landlord');
    else window.__nestiqSignInIntent = 'landlord';
    nestiqShowSignupForm();
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(_e){}
    return;
  }
  if(flow === 'signin' || flow === 'login'){
    if(typeof window.nestiqSetSignInIntent === 'function') window.nestiqSetSignInIntent('landlord');
    else window.__nestiqSignInIntent = 'landlord';
    nestiqShowSignInLandlord();
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(_e){}
  }
}

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
  try{ showNotif?.('Demo mode is disabled. Create an account or sign in.','info'); }catch(_e){}
  if(typeof nestiqShowSignupForm==='function') nestiqShowSignupForm();
  else if(typeof nestiqShowSignInLandlord==='function') nestiqShowSignInLandlord();
  else location.href='index.html#auth-signup';
}
window.nestiqContinueLocalDemo=nestiqContinueLocalDemo;

function nestiqInjectDemoBanner(){
  nestiqClearDemoMode();
}
window.nestiqInjectDemoBanner=nestiqInjectDemoBanner;

function showLoginScreen(errMsg=''){ showLandingPage(errMsg); }

function nestiqShowSignInLandlord(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card rounded-2xl shadow-xl bg-white p-8 max-w-md mx-auto">
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title" style="margin-bottom:6px">Sign in</h2>
        <p class="modal-sub">Landlord account</p>
        <div class="form-group"><label>Email</label><input class="form-input" id="li_email" type="email" autocomplete="username" placeholder="you@example.com"></div>
        <div class="form-group"><label>Password</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="form-input" id="li_pass" type="password" autocomplete="current-password" placeholder="Password">
            <button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('li_pass',this)">Show</button>
          </div>
        </div>
        <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
        <div id="li_err" class="nestiq-auth-err"></div>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSubmitLandlordSignIn()">Sign In</button>
        <p class="nestiq-auth-footer"><a href="#" onclick="nestiqShowSignupForm();return false;">Create an account</a></p>
      </div>
    </section>`;
}

function nestiqShowTenantEntry(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--wide rounded-2xl shadow-xl bg-white p-8 max-w-md mx-auto">
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Tenant portal</h2>
        <p class="modal-sub">Set up with an invitation or sign in</p>
        <div class="nestiq-tab-row">
          <button type="button" class="nestiq-tab active" id="ttab_inv" onclick="nestiqTenantTab('inv')">I have an invitation</button>
          <button type="button" class="nestiq-tab" id="ttab_in" onclick="nestiqTenantTab('in')">I already have an account</button>
        </div>
        <div id="tenant_panel_inv">
          <p style="font-size:0.86rem;color:var(--muted);margin-bottom:12px">Enter the code your landlord shared (format NQ-XXXXXX).</p>
          <div class="form-group"><label>Invitation code</label><input class="form-input" id="tinv_code" placeholder="NQ-XXXXXX" oninput="this.value=this.value.toUpperCase().replace(/[^NQ0-9A-Z-]/gi,'')"></div>
          <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqTenantLookupInvite()">Look Up Invitation</button>
          <div id="tinv_result" style="margin-top:16px"></div>
        </div>
        <div id="tenant_panel_in" style="display:none">
          <div class="form-group"><label>Email</label><input class="form-input" id="tli_email" type="email" autocomplete="username"></div>
          <div class="form-group"><label>Password</label>
            <div style="display:flex;gap:8px"><input class="form-input" id="tli_pass" type="password" autocomplete="current-password"><button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('tli_pass',this)">Show</button></div>
          </div>
          <a href="#" class="nestiq-auth-link" onclick="nestiqShowPasswordReset();return false;">Forgot your password?</a>
          <div id="tli_err" class="nestiq-auth-err"></div>
          <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:12px" onclick="nestiqSubmitTenantSignIn()">Sign In</button>
        </div>
      </div>
    </section>`;
}

function nestiqTenantTab(which){
  document.getElementById('ttab_inv')?.classList.toggle('active',which==='inv');
  document.getElementById('ttab_in')?.classList.toggle('active',which==='in');
  const p1=document.getElementById('tenant_panel_inv');
  const p2=document.getElementById('tenant_panel_in');
  if(p1) p1.style.display=which==='inv'?'block':'none';
  if(p2) p2.style.display=which==='in'?'block':'none';
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
  el.innerHTML=`
    <div class="nestiq-invite-summary">
      <p><strong>You have been invited to set up an account for:</strong></p>
      <p>${inv.propertyName||'—'} · ${inv.tenantName||'—'}</p>
      <p>Landlord: ${inv.landlordName||'—'}</p>
    </div>
    <div class="form-group"><label>Full name</label><input class="form-input" id="treg_name" value="${String(inv.tenantName||'').replace(/"/g,'&quot;')}" readonly></div>
    <div class="form-group"><label>Email</label><input class="form-input" id="treg_email" type="email" value="${String(inv.tenantEmail||'').replace(/"/g,'&quot;')}"></div>
    <div class="form-group"><label>Password</label><div style="display:flex;gap:8px"><input class="form-input" id="treg_pw" type="password"><button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('treg_pw',this)">Show</button></div></div>
    <div class="form-group"><label>Confirm password</label><input class="form-input" id="treg_pw2" type="password"></div>
    <div id="treg_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:8px" onclick="nestiqSubmitTenantRegistration()">Create My Account</button>`;
}

async function nestiqSubmitTenantRegistration(){
  const inv=window.__nestiqPendingInvite;
  const errEl=document.getElementById('treg_err');
  if(!inv){ if(errEl) errEl.textContent='Lookup your invitation first.'; return; }
  const email=(document.getElementById('treg_email')?.value||'').trim().toLowerCase();
  const p1=(document.getElementById('treg_pw')?.value||'');
  const p2=(document.getElementById('treg_pw2')?.value||'');
  const st=nestiqPasswordStrength(p1);
  if(!email){ if(errEl) errEl.textContent='Email required'; return; }
  const invEmail=String(inv.tenantEmail||'').trim().toLowerCase();
  if(invEmail && email!==invEmail){
    if(errEl) errEl.textContent='Use the same email address as on your invitation ('+invEmail+').';
    return;
  }
  if(!st.ok){ if(errEl) errEl.textContent='Password must be 8+ chars with a number and a capital letter.'; return; }
  if(p1!==p2){ if(errEl) errEl.textContent='Passwords do not match'; return; }
  try{
    const cred=await firebase.auth().createUserWithEmailAndPassword(email,p1);
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
    document.getElementById('tinv_result').innerHTML=`
      <div class="nestiq-success-box">
        <p><strong>Account created! 🎉</strong></p>
        <p>Welcome to NestIQ, ${inv.tenantName||''}.</p>
        <button type="button" class="btn-primary" style="margin-top:12px" onclick="location.reload()">Go to My Portal →</button>
      </div>`;
  }catch(e){
    if(errEl) errEl.textContent=e?.message||'Sign up failed';
  }
}

async function nestiqSubmitTenantSignIn(){
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('tenant');
  else window.__nestiqSignInIntent='tenant';
  const email=(document.getElementById('tli_email')?.value||'').trim().toLowerCase();
  const pass=(document.getElementById('tli_pass')?.value||'');
  const err=document.getElementById('tli_err');
  if(err) err.textContent='';
  try{
    await firebase.auth().signInWithEmailAndPassword(email,pass);
  }catch(e){
    if(err) err.textContent='Invalid email or password.';
  }
}

function nestiqShowPasswordReset(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card rounded-2xl shadow-xl bg-white p-8 max-w-md mx-auto">
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

function nestiqPasswordStrength(pw){
  const s=String(pw||'');
  let score=0;
  if(s.length>=8) score++;
  if(/[0-9]/.test(s)) score++;
  if(/[A-Z]/.test(s)) score++;
  if(s.length>=12) score++;
  const ok=s.length>=8&&/[0-9]/.test(s)&&/[A-Z]/.test(s);
  let label='Weak',cls='nestiq-pw-weak';
  if(score>=4){ label='Very strong'; cls='nestiq-pw-gold'; }
  else if(score===3){ label='Strong'; cls='nestiq-pw-strong'; }
  else if(score===2){ label='Fair'; cls='nestiq-pw-fair'; }
  return { ok, score, label, cls };
}

function nestiqRefreshSignupPwUi(){
  const pw=document.getElementById('su_pass')?.value||'';
  const st=nestiqPasswordStrength(pw);
  const bar=document.getElementById('su_pw_bar');
  if(bar){
    bar.className='nestiq-pw-bar '+st.cls;
    bar.textContent=st.label;
  }
  const m=document.getElementById('su_pw_match');
  const p2=document.getElementById('su_pass2')?.value||'';
  if(m){
    if(!p2) m.textContent='';
    else m.innerHTML=pw===p2?'<span class="nestiq-ok">✓ Passwords match</span>':'<span class="nestiq-bad">✗ Passwords do not match</span>';
  }
}

function nestiqShowSignupForm(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  outlet.innerHTML=`
    <section class="nestiq-auth-section">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div class="nestiq-auth-card nestiq-auth-card--signup rounded-2xl shadow-xl bg-white p-8 max-w-md mx-auto">
        <button type="button" class="nestiq-auth-back" onclick="showLandingPage()">← Back</button>
        <h2 class="modal-title">Create Your NestIQ Account</h2>
        <p class="modal-sub">Free to start. No credit card needed.</p>
        <div class="form-group"><label>Full name</label><input class="form-input" id="su_name" placeholder="Your full name" oninput="nestiqRefreshSignupPwUi()"></div>
        <div class="form-group"><label>Email</label><input class="form-input" id="su_email" type="email" placeholder="you@example.com" oninput="nestiqRefreshSignupPwUi()"></div>
        <div class="form-group"><label>Phone</label><input class="form-input" id="su_phone" placeholder="071 000 0000" oninput="nestiqRefreshSignupPwUi()">
          <div style="font-size:0.76rem;color:var(--muted);margin-top:4px">Used for WhatsApp notifications</div></div>
        <div class="form-group"><label>Password</label>
          <div style="display:flex;gap:8px"><input class="form-input" id="su_pass" type="password" placeholder="Create a password" oninput="nestiqRefreshSignupPwUi()"><button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('su_pass',this)">Show</button></div>
          <div id="su_pw_bar" class="nestiq-pw-bar nestiq-pw-weak" style="margin-top:6px">Weak</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">Min 8 characters, one number, one capital letter</div>
        </div>
        <div class="form-group"><label>Confirm password</label>
          <div style="display:flex;gap:8px"><input class="form-input" id="su_pass2" type="password" oninput="nestiqRefreshSignupPwUi()"><button type="button" class="btn-outline btn-sm" onclick="nestiqTogglePw('su_pass2',this)">Show</button></div>
          <div id="su_pw_match" style="font-size:0.8rem;margin-top:4px"></div>
        </div>
        <div class="form-group"><label>Company name <span style="color:var(--muted)">(optional)</span></label><input class="form-input" id="su_company" placeholder="Your company or trading name"></div>
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:0.84rem;margin:12px 0;cursor:pointer">
          <input type="checkbox" id="su_terms" onchange="nestiqRefreshSignupPwUi()">
          <span>I agree to the <a href="#" onclick="nestiqOpenLegalModal('terms');return false;">Terms of Service</a> and <a href="#" onclick="nestiqOpenLegalModal('privacy');return false;">Privacy Policy</a></span>
        </label>
        <div id="su_err" class="nestiq-auth-err"></div>
        <button type="button" class="btn-gold" id="su_submit" style="width:100%;justify-content:center" onclick="nestiqSubmitLandlordSignup()">Create Account</button>
        <p class="nestiq-auth-footer">Already have an account? <a href="#" onclick="nestiqShowSignInLandlord();return false;">Sign in</a></p>
      </div>
    </section>`;
  nestiqRefreshSignupPwUi();
}

function nestiqOpenLegalModal(kind){
  const title=kind==='terms'?'Terms of Service':'Privacy Policy';
  const body=kind==='terms'
    ?'<p>Placeholder terms. Replace with your legal text before production.</p>'
    :'<p>Placeholder privacy policy. Replace with your legal text before production.</p>';
  document.getElementById('modalContent').innerHTML=`<h2 class="modal-title">${title}</h2><div class="modal-sub" style="max-height:50vh;overflow:auto">${body}</div><button type="button" class="btn-primary btn-sm" style="margin-top:16px" onclick="closeModal()">Close</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function nestiqSubmitLandlordSignup(){
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
  if(!st.ok){ if(errEl) errEl.textContent='Password must be at least 8 characters and include a number and a capital letter.'; return; }
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
      else if(c==='auth/weak-password') errEl.textContent='Please choose a stronger password.';
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
    showNotif(sent.error,'error');
    return;
  }
  showNotif('Verification email sent. Check spam if you do not see it within a few minutes.','success');
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
  if(typeof window.nestiqSetSignInIntent==='function') window.nestiqSetSignInIntent('landlord');
  else window.__nestiqSignInIntent='landlord';
  try{ nestiqClearDemoMode(); }catch(_e){}
  const email=(document.getElementById('li_email')?.value||'').trim().toLowerCase();
  const pass=(document.getElementById('li_pass')?.value||'');
  const err=document.getElementById('li_err');
  if(err) err.textContent='';
  try{
    await firebase.auth().signInWithEmailAndPassword(email,pass);
  }catch(e){
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
  if(s?.role==='tenant'){
    const tenant=tenantsData.find(t=>t.id===s.userId);
    if(tenant?.preferredLanguage) localStorage.setItem('nestiq-lang', tenant.preferredLanguage);
  }else{
    localStorage.setItem('nestiq-lang','en');
  }
  const th=targetHash||'#home';
  setTimeout(()=>{
    if(window.nestiqUseFirestore){
      location.hash=th;
      const next=String(th).replace('#','').trim()||'home';
      if(typeof mountPage==='function'){
        mountPage(next).catch(()=>showNotif?.('Page failed to load','error'));
      }
      return;
    }
    location.hash=th;
    location.reload();
  },180);
}

function switchLoginLang(lang){
  localStorage.setItem('nestiq-lang', lang);
  showLandingPage();
}

function showTenantWelcomeOverlay(tenant){
  try{ nestiqHideBootOverlay(); }catch(_e){}
  const prop=propertiesData.find(p=>p.id===tenant.propertyId||p.name===tenant.property)||{};
  const po=landlordSettings?.portal||{};
  const rent=Number(tenant.rent||0);
  const due=tenant.monthlyDueDate||1;
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  outlet.innerHTML=`
    <section class="nestiq-welcome-tenant" style="min-height:100vh;padding:80px 20px;background:var(--paper);position:relative">
      <div class="hero-grid nestiq-landing-grid"></div>
      <div style="position:relative;max-width:520px;margin:0 auto;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:28px;box-shadow:var(--shadow-lg)">
        <h2 class="modal-title">Welcome to your portal, ${String(tenant.name||'').replace(/</g,'&lt;')}! 👋</h2>
        <div style="margin:16px 0;padding:14px;background:var(--cream);border-radius:12px">
          <div style="font-size:0.78rem;color:var(--muted)">Your property</div>
          <div style="font-weight:700">${prop.name||tenant.property||'—'}</div>
          <div style="font-size:0.86rem;color:var(--muted)">${prop.addr||'—'} · Unit ${tenant.unit||'—'}</div>
        </div>
        <div style="margin-bottom:14px">
          <div style="font-size:0.78rem;color:var(--muted)">Your landlord</div>
          <div>${landlordName||landlordSettings?.name||'—'}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:0.86rem">
            ${landlordSettings?.phone?`<a href="https://wa.me/${String(landlordSettings.phone).replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>`:''}
            ${landlordSettings?.email?`<span>${landlordSettings.email}</span>`:''}
          </div>
        </div>
        <p>R${rent.toLocaleString('en-ZA')} due on the <strong>${due}</strong> of each month.</p>
        <p style="font-size:0.86rem;color:var(--muted);margin-top:12px">Here you can check rent status, submit maintenance requests, download receipts, view your lease, and message your landlord.</p>
        <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:20px" onclick="nestiqDismissTenantWelcome()">Go to My Dashboard →</button>
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
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqUseTenantPortalFromConflict(){
  window.nestiqClearSignInIntent?.();
  closeModal();
  if(window.nestiqAuth){
    window.nestiqAuth.signOut().then(()=>nestiqShowTenantEntry()).catch(()=>nestiqShowTenantEntry());
    return;
  }
  nestiqShowTenantEntry();
}

async function nestiqSubmitClaimLandlord(){
  const err=document.getElementById('claim_ld_err');
  if(err) err.textContent='';
  try{
    if(typeof window.nestiqClaimLandlordAccount!=='function'){
      if(err) err.textContent='Account repair is not available. Refresh the page and try again.';
      return;
    }
    closeModal();
    window.nestiqClearSignInIntent?.();
    await window.nestiqClaimLandlordAccount();
  }catch(e){
    console.error('Claim landlord',e);
    if(err) err.textContent=e?.message||'Could not switch account. Check Firestore rules are deployed.';
    else window.showNotif?.(e?.message||'Could not switch account','error');
  }
}

window.nestiqShowLandlordRoleConflictModal=nestiqShowLandlordRoleConflictModal;
window.nestiqUseTenantPortalFromConflict=nestiqUseTenantPortalFromConflict;
window.nestiqSubmitClaimLandlord=nestiqSubmitClaimLandlord;
window.logoutSession=logoutSession;
window.nestiqTenantLogout=nestiqTenantLogout;
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
window.nestiqShowSignInLandlord=nestiqShowSignInLandlord;
window.nestiqSubmitLandlordSignup=nestiqSubmitLandlordSignup;
window.nestiqShowTenantEntry=nestiqShowTenantEntry;
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
  showNotif('Account profile saved','success');
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
  showNotif('Profile saved','success');
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
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modalOverlay').classList.add('open');
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
      closeModal();
      showNotif('Check the new inbox and confirm the link. Your sign-in email updates after you confirm.','success');
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
    closeModal();
    showNotif('Email updated.','success');
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
    <div class="form-group"><label>New password</label><input class="form-input" id="cp_new" type="password"></div>
    <div class="form-group"><label>Confirm new password</label><input class="form-input" id="cp_new2" type="password"></div>
    <div id="cp_err" class="nestiq-auth-err"></div>
    <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitChangePassword()">Update password</button>
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function nestiqSubmitChangePassword(){
  const cur=document.getElementById('cp_cur')?.value||'';
  const n1=document.getElementById('cp_new')?.value||'';
  const n2=document.getElementById('cp_new2')?.value||'';
  const err=document.getElementById('cp_err');
  if(err) err.textContent='';
  if(!cur||!n1||n1!==n2){ if(err) err.textContent='Check all fields.'; return; }
  const st=nestiqPasswordStrength(n1);
  if(!st.ok){ if(err) err.textContent='New password must be 8+ chars with a number and capital letter.'; return; }
  const u=firebase.auth().currentUser;
  const em=u?.email;
  if(!u||!em){ if(err) err.textContent='Not signed in.'; return; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(em,cur);
    await u.reauthenticateWithCredential(cred);
    await u.updatePassword(n1);
    closeModal();
    showNotif('Password updated','success');
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
    <button type="button" class="btn-outline btn-sm" style="margin-left:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function nestiqConfirmDeleteAccount(){
  if((document.getElementById('del_confirm')?.value||'')!=='DELETE'){
    document.getElementById('del_err').textContent='Type DELETE to confirm.';
    return;
  }
  try{
    await firebase.auth().currentUser?.delete();
    closeModal();
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
  showNotif('Use Firebase mode. Configure js/firebase-config.js and sign in.','warning');
}
