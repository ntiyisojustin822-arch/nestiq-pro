/* ═══════════════════════════════
   ROUTER + NAV
═══════════════════════════════ */

// Hash-based SPA navigation + reloads can restore scroll to a deep position.
// Force deterministic top-of-page on every mount/navigation.
try{
  if('scrollRestoration' in history) history.scrollRestoration='manual';
}catch(_e){}

function observeReveals(){
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
  if(typeof nestiqInitCounters==='function') nestiqInitCounters();
}

function nestiqEnsureDemoBanner(){
  if(typeof window.nestiqInjectDemoBanner==='function'){
    window.nestiqInjectDemoBanner();
    return;
  }
  try{ document.getElementById('demoBanner')?.remove(); }catch(_e){}
  try{ window.nestiqClearDemoMode?.(); }catch(_e){}
}

async function ensureContractorDashboardLoaded(){
  if(typeof window.renderContractorDashboard==='function') return;
  const existing=document.getElementById('contractorDashboardScript');
  if(existing) existing.remove();
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.id='contractorDashboardScript';
    s.src=`./js/contractor-dashboard.js?v=visit-date1&ts=${Date.now()}`;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Failed to load contractor dashboard script'));
    document.body.appendChild(s);
  });
}

async function ensureCaretakerDashboardLoaded(){
  if(typeof window.renderCaretakerDashboard==='function') return;
  const existing=document.getElementById('caretakerDashboardScript');
  if(existing) existing.remove();
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.id='caretakerDashboardScript';
    s.src=`./js/caretaker-dashboard.js?v=visit-date1&ts=${Date.now()}`;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Failed to load caretaker dashboard script'));
    document.body.appendChild(s);
  });
}

async function ensureTenantDashboardLoaded(){
  if(typeof window.renderTenantDashboard==='function') return;
  const existing=document.getElementById('tenantDashboardScript');
  if(existing) existing.remove();
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.id='tenantDashboardScript';
    s.src=`./js/tenant-dashboard.js?v=rent-sync1&ts=${Date.now()}`;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Failed to load tenant dashboard script'));
    document.body.appendChild(s);
  });
  if(typeof window.renderTenantDashboard!=='function'){
    throw new Error('Tenant dashboard script loaded but did not initialize');
  }
}

function renderTenantDashboardFallback(){
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;
  const s=getSession?.();
  const tenant=tenantsData.find(t=>t.id===s?.userId);
  const prop=propertiesData.find(p=>p.id===tenant?.propertyId) || propertiesData.find(p=>p.name===tenant?.property);
  const title=document.getElementById('tenantDashTitle');
  const sub=document.getElementById('tenantDashSub');
  if(title) title.textContent=`Welcome back, ${tenant?.name||'Tenant'}`;
  if(sub) sub.textContent=`${tenant?.property||'—'} · ${tenant?.unit||'—'} · ${new Date().toLocaleDateString('en-ZA')}`;
  const panel=document.getElementById('tTab-home')||document.getElementById('tenantTabHome');
  if(panel){
    panel.innerHTML=`
      <div class="tenant-section-card">
        <div class="portal-card-title">Tenant Dashboard</div>
        <div style="font-size:0.88rem;color:var(--muted)">The full tenant portal could not load (often an outdated cached copy of the app). Use Reload App below. If this continues: hard-refresh (Ctrl+F5), or clear site data for NestIQ, then sign in again.</div>
        <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><strong>${tenant?.name||'—'}</strong><div style="font-size:0.82rem;color:var(--muted)">${tenant?.email||'—'}</div></div>
          <div><strong>${tenant?.property||'—'}</strong><div style="font-size:0.82rem;color:var(--muted)">${prop?.addr||'—'}</div></div>
        </div>
        <button class="btn-primary btn-sm" style="margin-top:14px" onclick="location.reload()">Reload App</button>
      </div>`;
    panel.classList.add('active');
  }
}

let __mountGen=0;

function nestiqRestorePageVisibility(el){
  if(!el) return;
  try{
    el.classList.add('active','page-active');
    el.style.visibility='visible';
    el.style.opacity='1';
    el.style.transform='none';
    el.style.transition='';
  }catch(_e){}
}

async function mountPage(id){
  try{ window.nestiqSetAuthChrome?.(false); }catch(_e){}
  // Tenants must never render landlord pages (defends against stale #home hash races).
  try{
    const s=typeof getSession==='function'?getSession():window.__nestiqSession;
    if(s&&s.role==='contractor'&&id!=='contractor-dashboard'){
      id='contractor-dashboard';
      try{
        if((location.hash||'').replace('#','').trim()!=='contractor-dashboard'){
          history.replaceState(null,'',location.pathname+location.search+'#contractor-dashboard');
        }
      }catch(_e){}
    }
    if(s&&s.role==='caretaker'&&id!=='caretaker-dashboard'){
      id='caretaker-dashboard';
      try{
        if((location.hash||'').replace('#','').trim()!=='caretaker-dashboard'){
          history.replaceState(null,'',location.pathname+location.search+'#caretaker-dashboard');
        }
      }catch(_e){}
    }
    if(s&&s.role==='tenant'&&id!=='tenant-dashboard'&&id!=='settings'&&id!=='listings'&&id!=='map'){
      id='tenant-dashboard';
      try{
        if((location.hash||'').replace('#','').trim()!=='tenant-dashboard'){
          history.replaceState(null,'',location.pathname+location.search+'#tenant-dashboard');
        }
      }catch(_e){}
    }
  }catch(_e){}
  if(id && !nestiqKnownPageIds().has(id)){
    nestiqShow404();
    return;
  }
  const gen=++__mountGen;
  // Keep applications listener alive for landlord alerts while signed in.
  window.currentPage=id;
  const outlet=document.getElementById('appOutlet');
  if(!outlet) return;

  const currentPage=outlet.querySelector('.page.active');
  let fadedOut=false;
  if(currentPage){
    currentPage.style.transition='opacity 0.14s ease';
    currentPage.style.opacity='0';
    fadedOut=true;
    await new Promise(r=>setTimeout(r,140));
    if(gen!==__mountGen){
      nestiqRestorePageVisibility(currentPage);
      return;
    }
    currentPage.style.transition='';
    currentPage.style.opacity='';
  }

  const pageFile=id==='home'?'home':id;
  let fetchUrl=`./pages/${pageFile}.html?v=listings-search1`;
  try{
    if(typeof nestiqAppBaseUrl==='function') fetchUrl=nestiqAppBaseUrl()+`pages/${pageFile}.html?v=listings-search1`;
  }catch(_e){}
  let html;
  try{
    const res=await fetch(fetchUrl,{cache:'no-store'});
    if(gen!==__mountGen){
      if(fadedOut) nestiqRestorePageVisibility(currentPage);
      return;
    }
    if(!res.ok) throw new Error(`Failed to load page: ${id}`);
    html=await res.text();
    if(gen!==__mountGen){
      if(fadedOut) nestiqRestorePageVisibility(currentPage);
      return;
    }
  }catch(err){
    if(fadedOut) nestiqRestorePageVisibility(currentPage);
    nestiqShow404();
    return;
  }

  // Stale mount lost the race — do not wipe a newer page.
  if(gen!==__mountGen) return;

  outlet.innerHTML=html;
  if(typeof nestiqHydrateIcons==='function') nestiqHydrateIcons(outlet);
  const pageEl=outlet.querySelector('.page');
  if(pageEl){
    // Auto-apply scroll reveal classes to common UI blocks inside page fragments.
    try{
      pageEl.querySelectorAll('.stat-card, .card, .chart-wrap, .bill-card, .portal-card, h2').forEach(el=>{
        if(!el.classList.contains('reveal') && !el.classList.contains('nq-reveal') && !el.classList.contains('reveal-left') && !el.classList.contains('reveal-right')){
          el.classList.add('reveal','nq-reveal');
        }
      });
    }catch(_e){}
    if(typeof nestiqAnimatePage==='function') nestiqAnimatePage(pageEl);
    else{
      pageEl.classList.add('active','page-active');
      nestiqRestorePageVisibility(pageEl);
    }
    try{ window.nestiqInitScrollReveal?.(); }catch(_e){}
    try{ window.nestiqInitCounters?.(); }catch(_e){}
    // After enter animation, lock visibility so a mid-fade race cannot hide the page.
    setTimeout(()=>nestiqRestorePageVisibility(pageEl),420);
  }

  applyActiveNav(id);

  // Use instant scroll: smooth scrolling can get interrupted by layout / focus.
  window.scrollTo(0,0);
  nestiqStampPrintMeta();

  const safeRun=(fn,label)=>{
    try{ fn?.(); }
    catch(err){
      console.error(`Mount error in ${label}`, err);
      nestiqShowNotif(`Section failed: ${label}`,'error');
    }
  };
  if(id==='charts') safeRun(()=>initCharts(),'charts');
  if(id==='valuation') safeRun(()=>nestiqRenderValuationPage(),'valuation');
  if(id==='home') safeRun(()=>renderHomeStats?.(),'home');
  if(id==='home') safeRun(()=>renderGettingStarted?.(),'home getting started');
  if(id==='home') safeRun(()=>nestiqRenderHomeDashProps?.(),'home dash props');
  if(id==='home') safeRun(()=>window.renderHomeLeaseWidget?.(),'home lease renewals');
  if(id==='home'||id==='charts') safeRun(()=>window.refreshPortfolioReportButtons?.(),'portfolio report buttons');
  if(id==='roi') safeRun(()=>calcROI(),'roi');
  if(id==='expenses') safeRun(()=>renderExpenses(),'expenses');
  if(id==='portal') safeRun(()=>initPortal(),'portal');
  if(id==='properties') safeRun(()=>renderProperties(),'properties');
  if(id==='map') safeRun(()=>initMap(),'map');
  if(id==='tenants') safeRun(()=>renderTenants(),'tenants');
  if(id==='applications') safeRun(()=>{
    if(typeof nestiqMountApplicationsShell==='function') nestiqMountApplicationsShell();
    else nestiqRenderApplicationsPage();
  },'applications');
  if(id==='listings') safeRun(()=>nestiqRenderListingsPage?.(),'listings');
  if(id==='deposits') safeRun(()=>nestiqRenderDepositsPage(),'deposits');
  if(id==='vendors') safeRun(()=>nestiqRenderVendorsPage?.(),'vendors');
  if(id==='latefees') safeRun(()=>nestiqRenderLateFeesPage?.(),'latefees');
  if(id==='maintenance') safeRun(()=>{ nestiqSwitchMaintSubtab?.('tracker'); if(typeof nestiqSwitchMaintView==='function') nestiqSwitchMaintView(window.__nestiqMaintView||'board'); else renderKanban(); },'maintenance');
  if(id==='inspections') safeRun(()=>initInspectionsPage(),'inspections');
  if(id==='calendar') safeRun(()=>initFullCalendar(),'calendar');
  if(id==='tax') safeRun(()=>renderTaxReport(),'tax');
  if(id==='rentroll') safeRun(()=>initRentRollPage(),'rentroll');
  if(id==='renewals') safeRun(()=>initRenewalsPage(),'renewals');
  if(id==='reconcile') safeRun(()=>{ nestiqReconInitDropzone?.(); renderReconciliationPage?.(); },'reconcile');
  if(id==='settings') safeRun(()=>renderSettings(),'settings');
  if(id==='contractor-dashboard') await ensureContractorDashboardLoaded();
  if(id==='contractor-dashboard') safeRun(()=>{
    if(typeof window.renderContractorDashboard==='function'){
      window.renderContractorDashboard();
    }
  },'contractor dashboard');
  if(id==='caretaker-dashboard') await ensureCaretakerDashboardLoaded();
  if(id==='caretaker-dashboard') safeRun(()=>{
    if(typeof window.renderCaretakerDashboard==='function'){
      window.renderCaretakerDashboard();
    }
  },'caretaker dashboard');
  if(id==='tenant-dashboard') await ensureTenantDashboardLoaded();
  if(id==='tenant-dashboard') safeRun(()=>{
    if(typeof window.nestiqBootstrapTenantFromLocalCache==='function'){
      window.nestiqBootstrapTenantFromLocalCache();
    }
    if(typeof window.renderTenantDashboard==='function'){
      window.renderTenantDashboard();
      return;
    }
    renderTenantDashboardFallback();
  },'tenant dashboard');

  // Ensure expense date defaults when expenses page mounts
  const dField=document.getElementById('exp_date');
  if(dField&&!dField.value) dField.value=new Date().toISOString().split('T')[0];

  setTimeout(observeReveals,100);
  // Ensure reveals run even if delayed timers are skipped.
  try{ window.nestiqInitScrollReveal?.(); }catch(_e){}
  applyTranslations?.();
}

function nestiqBootstrapRouteForSession(s){
  let route=getRouteFromHash()||'home';
  if(!s||!isValidSession?.(s)) return route;
  if(s.role==='contractor') return 'contractor-dashboard';
  if(s.role==='caretaker') return 'caretaker-dashboard';
  if(s.role==='tenant'){
    if(route!=='listings'&&route!=='map'&&route!=='settings') return 'tenant-dashboard';
    return route;
  }
  if(s.role==='landlord'){
    // Public browse / tenant-only pages — not the landlord dashboard after sign-in.
    if(route==='listings') return 'home';
    if(route==='map') return 'properties';
    // Leftover #tenant-dashboard from a prior tenant session leaves landlords stuck
    // on "Loading your portal…" with no tenant record.
    if(route==='tenant-dashboard') return 'home';
    // Pages removed from landlord nav — leftover hashes go home.
    if(route==='portal'||route==='roi'||route==='tax'||route==='reconcile'||route==='expenses') return 'home';
    return route;
  }
  return route;
}
window.nestiqBootstrapRouteForSession=nestiqBootstrapRouteForSession;

function nestiqEnsureBootstrapHash(route){
  const next=String(route||'home').trim()||'home';
  const current=(location.hash||'').replace('#','').trim();
  if(current!==next){
    history.replaceState(null,'',location.pathname+location.search+'#'+next);
  }
  return next;
}

function nestiqKnownPageIds(){
  return new Set(['home','properties','map','listings','tenants','applications','deposits','charts','valuation','expenses','reconcile','maintenance','vendors','latefees','inspections','calendar','roi','tax','rentroll','renewals','portal','settings','tenant-dashboard','contractor-dashboard','caretaker-dashboard']);
}

function nestiqShow404(){
  const outlet=document.getElementById('appOutlet')||document.getElementById('mainContent');
  if(!outlet) return;
  outlet.innerHTML=`
    <div class="nq-fade-in" style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; min-height:70vh; text-align:center; padding:40px;
    ">
      <div style="font-size:5rem;margin-bottom:20px;animation:nq-float 3s ease-in-out infinite">🏠</div>
      <h2 style="font-size:1.6rem;font-weight:700;color:var(--ink);margin-bottom:10px">Page not found</h2>
      <p style="color:var(--muted);margin-bottom:24px;max-width:320px">
        This page doesn't exist or hasn't been loaded yet.
      </p>
      <button class="btn-gold" onclick="showPage('home')">Go to Dashboard</button>
    </div>`;
  try{ window.nestiqFinishPageBar?.(); }catch(_e){}
}
window.nestiqShow404=nestiqShow404;

function getRouteFromHash(){
  const h=(location.hash||'').replace('#','').trim();
  if(!h) return 'home';
  const authEntry=new Set(['auth-signup','auth-signin','signup','signin','login','welcome','choose']);
  if(authEntry.has(h.toLowerCase())) return null;
  return h;
}
window.getRouteFromHash=getRouteFromHash;

function nestiqIsAuthEntryHash(){
  const h=(location.hash||'').replace('#','').trim().toLowerCase();
  return h==='auth-signup'||h==='auth-signin'||h==='signup'||h==='signin'||h==='login'||h==='welcome'||h==='choose';
}
window.nestiqIsAuthEntryHash=nestiqIsAuthEntryHash;

function nestiqStampPrintMeta(){
  const label=new Date().toLocaleDateString('en-ZA',{day:'2-digit',month:'long',year:'numeric'});
  try{ document.body.setAttribute('data-print-date',label); }catch(_e){}
  const el=document.getElementById('printDateLabel');
  if(el) el.textContent='Generated: '+label;
}
window.nestiqStampPrintMeta=nestiqStampPrintMeta;

function showPage(id){
  try{ window.nestiqStartPageBar?.(); }catch(_e){}
  const currentPage=document.querySelector('#appOutlet .page.active');
  if(currentPage){
    currentPage.style.opacity='0';
    currentPage.style.transition='opacity 0.14s ease';
  }
  const unfadeCurrent=()=>{
    if(!currentPage || !currentPage.isConnected) return;
    currentPage.style.opacity='';
    currentPage.style.transition='';
  };

  nestiqEnsureDemoBanner();
  nestiqStampPrintMeta();
  window.currentPage=id;
  if(id==='listings'){
    if(location.hash!=='#listings') location.hash='#listings';
    else mountPage('listings').then(nestiqAfterPageSwitch).catch(()=>{ try{ window.nestiqFinishPageBar?.(); }catch(_e){} nestiqShowNotif('Page failed to load','error'); });
    return;
  }
  const s=getSession?.();
  if(!s || !isValidSession?.(s)){ unfadeCurrent(); showLoginScreen(); try{ window.nestiqFinishPageBar?.(); }catch(_e){} return; }
  if(typeof nestiqLandlordAwaitingEmailVerification==='function' && nestiqLandlordAwaitingEmailVerification()){
    unfadeCurrent();
    nestiqShowNotif?.('Verify your email before using the dashboard.','info');
    try{ window.nestiqFinishPageBar?.(); }catch(_e){}
    return;
  }
  if(s.role==='landlord' && id==='map'){
    nestiqShowNotif?.('Set property locations when adding or editing a property. Tenants see the pin on their portal.','info');
    if(location.hash!=='#properties') location.hash='#properties';
    else mountPage('properties').then(nestiqAfterPageSwitch).catch(()=>{ try{ window.nestiqFinishPageBar?.(); }catch(_e){} nestiqShowNotif('Page failed to load','error'); });
    return;
  }
  if(s.role==='landlord' && (id==='tenant-dashboard'||id==='portal'||id==='roi'||id==='tax'||id==='reconcile'||id==='expenses')){
    if(location.hash!=='#home') location.hash='#home';
    else mountPage('home').then(nestiqAfterPageSwitch).catch(()=>{ try{ window.nestiqFinishPageBar?.(); }catch(_e){} nestiqShowNotif('Page failed to load','error'); });
    return;
  }
  if(s.role==='contractor' && id!=='contractor-dashboard'){
    location.hash='#contractor-dashboard';
    return;
  }
  if(s.role==='caretaker' && id!=='caretaker-dashboard'){
    location.hash='#caretaker-dashboard';
    return;
  }
  if(s.role==='tenant' && id!=='tenant-dashboard' && id!=='settings' && id!=='listings' && id!=='map'){
    location.hash='#tenant-dashboard';
    return;
  }
  if(id && !nestiqKnownPageIds().has(id)){
    unfadeCurrent();
    nestiqShow404();
    applyActiveNav(id);
    return;
  }
  if(location.hash===`#${id}`){
    window.scrollTo(0,0);
    mountPage(id).then(nestiqAfterPageSwitch).catch(()=>{ try{ window.nestiqFinishPageBar?.(); }catch(_e){} nestiqShowNotif('Page failed to load','error'); });
    return;
  }
  window.scrollTo(0,0);
  location.hash=`#${id}`;
  applyTranslations?.();
}

function nestiqAfterPageSwitch(){
  try{ window.nestiqInitScrollReveal?.(); }catch(_e){}
  try{ window.nestiqInitCounters?.(); }catch(_e){}
  try{ window.nestiqApplyDefaultTips?.(); }catch(_e){}
  try{ window.nestiqInitLazyImages?.(); }catch(_e){}
  try{ window.nestiqFinishPageBar?.(); }catch(_e){}
}

function applyActiveNav(id){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const moreBtn=document.getElementById('navMoreBtn');
  if(moreBtn) moreBtn.classList.remove('active');
  const nav=document.querySelector(`.nav-tab[data-nav="${id}"]`) || Array.from(document.querySelectorAll('.nav-tab')).find(a=>String(a.getAttribute('onclick')||'').includes(`showPage('${id}')`));
  if(nav) nav.classList.add('active');
  // Highlight More when the active route lives inside the overflow menu.
  const moreMenu=document.getElementById('navMoreMenu');
  if(moreBtn && moreMenu && nav && moreMenu.contains(nav)){
    moreBtn.classList.add('active');
  }
}

window.addEventListener('hashchange',()=>{
  if(nestiqIsAuthEntryHash()){
    window.nestiqHandleAuthEntryFlow?.();
    return;
  }
  const next=getRouteFromHash();
  if(next==='listings'){
    window.scrollTo(0,0);
    mountPage('listings').catch(()=>nestiqShowNotif('Page failed to load','error'));
    return;
  }
  const s=getSession?.();
  if(!s || !isValidSession?.(s)){ showLoginScreen(); return; }
  if(typeof nestiqLandlordAwaitingEmailVerification==='function' && nestiqLandlordAwaitingEmailVerification()){
    const h=(location.hash||'').replace(/^#/,'').trim();
    if(h){
      history.replaceState(null,'',location.pathname+location.search);
      window.showEmailVerificationScreen?.();
      nestiqShowNotif?.('Verify your email to open the dashboard.','info');
    }
    return;
  }
  if(s.role==='landlord' && next==='map'){
    history.replaceState(null,'',location.pathname+location.search+'#properties');
    mountPage('properties').catch(()=>nestiqShowNotif('Page failed to load','error'));
    nestiqShowNotif?.('Set property locations when adding or editing a property. Tenants see the pin on their portal.','info');
    return;
  }
  if(s.role==='landlord' && (next==='tenant-dashboard'||next==='portal'||next==='roi'||next==='tax'||next==='reconcile'||next==='expenses')){
    history.replaceState(null,'',location.pathname+location.search+'#home');
    mountPage('home').catch(()=>nestiqShowNotif('Page failed to load','error'));
    return;
  }
  if(s.role==='contractor' && next!=='contractor-dashboard'){
    location.hash='#contractor-dashboard';
    return;
  }
  if(s.role==='caretaker' && next!=='caretaker-dashboard'){
    location.hash='#caretaker-dashboard';
    return;
  }
  if(s.role==='tenant' && next!=='tenant-dashboard' && next!=='settings' && next!=='listings' && next!=='map'){
    location.hash='#tenant-dashboard';
    return;
  }
  if(next && !nestiqKnownPageIds().has(next)){
    nestiqShow404();
    return;
  }
  window.scrollTo(0,0);
  mountPage(next||'home').catch(()=>{ nestiqShow404(); });
});

function toggleMobileNav(){
  document.getElementById('mobileNav')?.classList.toggle('open');
}
document.addEventListener('click', e=>{
  const mn=document.getElementById('mobileNav');
  const hb=document.getElementById('hamburgerBtn');
  if(!mn||!hb) return;
  if(mn.classList.contains('open') && !mn.contains(e.target) && !hb.contains(e.target)){
    mn.classList.remove('open');
  }
});

function positionNavMoreMenu(){
  const wrap=document.getElementById('navMoreWrap');
  const menu=document.getElementById('navMoreMenu');
  const btn=document.getElementById('navMoreBtn');
  if(!wrap||!menu||!btn||!wrap.classList.contains('open')) return;
  const br=btn.getBoundingClientRect();
  const pad=8;
  menu.style.display='grid';
  const mw=Math.max(280, menu.offsetWidth||280);
  const mh=Math.min(menu.offsetHeight||320, window.innerHeight-pad*2);
  let left=br.left + br.width/2 - mw/2;
  if(left+mw>window.innerWidth-pad) left=Math.max(pad, window.innerWidth-mw-pad);
  if(left<pad) left=pad;
  let top=br.bottom+8;
  if(top+mh>window.innerHeight-pad) top=Math.max(pad, br.top-mh-8);
  if(top<pad) top=pad;
  menu.style.left=`${Math.round(left)}px`;
  menu.style.top=`${Math.round(top)}px`;
}

function resetNavMoreMenuStyles(){
  const menu=document.getElementById('navMoreMenu');
  if(!menu) return;
  menu.style.left='';
  menu.style.top='';
  menu.style.display='';
}

function closeNavMoreMenu(){
  const wrap=document.getElementById('navMoreWrap');
  const btn=document.getElementById('navMoreBtn');
  if(wrap) wrap.classList.remove('open');
  if(btn) btn.setAttribute('aria-expanded','false');
  resetNavMoreMenuStyles();
}

function toggleNavMoreMenu(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();
  const wrap=document.getElementById('navMoreWrap');
  const btn=document.getElementById('navMoreBtn');
  if(!wrap || !btn) return;
  const next=!wrap.classList.contains('open');
  wrap.classList.toggle('open', next);
  btn.setAttribute('aria-expanded', next?'true':'false');
  if(next) requestAnimationFrame(()=>positionNavMoreMenu());
  else resetNavMoreMenuStyles();
}

document.addEventListener('click', e=>{
  const wrap=document.getElementById('navMoreWrap');
  if(!wrap) return;
  if(wrap.classList.contains('open') && !wrap.contains(e.target)){
    closeNavMoreMenu();
  }
});

window.addEventListener('resize', ()=>{
  const wrap=document.getElementById('navMoreWrap');
  if(wrap?.classList.contains('open')) positionNavMoreMenu();
});
window.addEventListener('scroll', ()=>{
  const wrap=document.getElementById('navMoreWrap');
  if(wrap?.classList.contains('open')) positionNavMoreMenu();
}, true);

window.toggleNavMoreMenu=toggleNavMoreMenu;
window.closeNavMoreMenu=closeNavMoreMenu;

/* ═══════════════════════════════
   COMMAND PALETTE
═══════════════════════════════ */
const cmdItems=[
  {label:'Go to Home', icon:'🏠', action:()=>showPage('home'), shortcut:'H'},
  {label:'Go to Properties', icon:'🏘️', action:()=>showPage('properties'), shortcut:'P'},
  {label:'Go to Map', icon:'🗺️', action:()=>showPage('map'), shortcut:'M'},
  {label:'Browse public listings', icon:'🏷️', action:()=>showPage('listings')},
  {label:'Go to Tenants', icon:'👥', action:()=>showPage('tenants')},
  {label:'Tenant Applications', icon:'📋', action:()=>showPage('applications')},
  {label:'Go to Deposits', icon:'🏦', action:()=>showPage('deposits')},
  {label:'Vendor Management', icon:'🛠️', action:()=>showPage('vendors')},
  {label:'Late Fee Management', icon:'💸', action:()=>showPage('latefees')},
  {label:'Go to Analytics', icon:'📊', action:()=>showPage('charts'), shortcut:'A'},
  {label:'Go to Maintenance', icon:'🔧', action:()=>showPage('maintenance')},
  {label:'Go to Inspections', icon:'📝', action:()=>showPage('inspections')},
  {label:'Go to Calendar', icon:'📅', action:()=>showPage('calendar')},
  {label:'Go to Settings', icon:'⚙️', action:()=>showPage('settings')},
  {label:'Go to Rent Roll', icon:'📋', action:()=>showPage('rentroll')},
  {label:'Go to Leases', icon:'📄', action:()=>showPage('renewals')},
  {label:'Add Property', icon:'➕', action:()=>{openModal('addProperty');nestiqOpenModalAnimated();}},
  {label:'Toggle Dark Mode', icon:'🌙', action:()=>toggleDark()},
  {label:'Keyboard Shortcuts', icon:'⌨️', action:()=>nestiqShowShortcutsModal(), shortcut:'?'},
  {label:'Backup Data (JSON)', icon:'💾', action:()=>backupData()},
  {label:'Restore Data (JSON)', icon:'📂', action:()=>restoreData()},
  {label:'Sign out', icon:'↪', action:()=>nestiqLandlordLogout?.()||nestiqConfirmSignOut?.({role:'landlord'})},
];

function nestiqShowShortcutsModal(){
  const shortcuts=[
    {key:'H', label:'Go to Home', icon:'🏠'},
    {key:'P', label:'Go to Properties', icon:'🏘️'},
    {key:'M', label:'Go to Map', icon:'🗺️'},
    {key:'A', label:'Go to Analytics', icon:'📊'},
    {key:'/', label:'Open Command Palette', icon:'🔍'},
    {key:'?', label:'Show Keyboard Shortcuts', icon:'⌨️'},
    {key:'Esc', label:'Close Modal / Drawer', icon:'✕'},
  ];

  const rows=shortcuts.map(s=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">${s.icon}</span>
        <span style="font-size:0.9rem;color:var(--ink)">${s.label}</span>
      </div>
      <kbd style="background:var(--ink);color:white;border-radius:6px;padding:4px 10px;font-size:0.8rem;font-family:'DM Sans',sans-serif;font-weight:600;letter-spacing:0.05em;min-width:32px;text-align:center">${s.key}</kbd>
    </div>`).join('');

  const html=`
    <div style="padding:4px 0">
      <h2 class="modal-title" style="margin-bottom:4px">⌨️ Keyboard Shortcuts</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:20px">
        Press these keys anywhere in the app for fast navigation.
      </p>
      <div>${rows}</div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <p style="font-size:0.8rem;color:var(--muted);margin:0">
          💡 Tip: Press <kbd style="background:var(--ink);color:white;border-radius:4px;padding:2px 7px;font-size:0.75rem">/</kbd> to open the command palette and search all pages and actions.
        </p>
      </div>
    </div>`;

  const mc=document.getElementById('modalContent');
  const ov=document.getElementById('modalOverlay');
  if(mc) mc.innerHTML=html;
  if(ov){
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else ov.classList.add('open');
    ov.scrollTop=0;
  }
}
window.nestiqShowShortcutsModal=nestiqShowShortcutsModal;

let cmdSelected=0;
let cmdFiltered=[...cmdItems];
function openCmdPalette(){
  document.getElementById('cmdOverlay').classList.add('open');
  document.getElementById('cmdInput').value='';
  renderCmdResults();
  setTimeout(()=>document.getElementById('cmdInput').focus(),50);
}
function closeCmdPalette(){document.getElementById('cmdOverlay').classList.remove('open');}
function renderCmdResults(){
  const q=document.getElementById('cmdInput').value.toLowerCase();
  const sess=typeof getSession==='function'?getSession():null;
  const hideListingsForLandlord=sess&&sess.role==='landlord';
  const hideMapForLandlord=sess&&sess.role==='landlord';
  cmdFiltered=cmdItems.filter(i=>{
    if(hideListingsForLandlord&&i.label==='Browse public listings') return false;
    if(hideMapForLandlord&&i.label==='Go to Map') return false;
    return i.label.toLowerCase().includes(q);
  });
  cmdSelected=0;
  const el=document.getElementById('cmdResults');
  if(cmdFiltered.length===0){el.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.88rem">No results</div>';return;}
  el.innerHTML='<div class="cmd-section">Actions</div>'+cmdFiltered.map((i,idx)=>`
    <div class="cmd-item ${idx===0?'selected':''}" id="cmd-item-${idx}" onclick="runCmdItem(${idx})">
      <span class="cmd-item-icon">${i.icon}</span>
      <span class="cmd-item-label">${i.label}</span>
      ${i.shortcut?`<span class="cmd-item-shortcut">${i.shortcut}</span>`:''}
    </div>`).join('');
}
function runCmdItem(idx){
  closeCmdPalette();
  if(cmdFiltered[idx]) cmdFiltered[idx].action();
}
function handleCmdKey(e){
  if(e.key==='Escape'){closeCmdPalette();return;}
  if(e.key==='ArrowDown'){cmdSelected=Math.min(cmdSelected+1,cmdFiltered.length-1);}
  else if(e.key==='ArrowUp'){cmdSelected=Math.max(cmdSelected-1,0);}
  else if(e.key==='Enter'){runCmdItem(cmdSelected);return;}
  document.querySelectorAll('.cmd-item').forEach((el,i)=>el.classList.toggle('selected',i===cmdSelected));
  const sel=document.getElementById('cmd-item-'+cmdSelected);
  if(sel) sel.scrollIntoView({block:'nearest'});
}

/* ═══════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════ */
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return;
  const k=e.key.toLowerCase();
  if(k==='?'||(e.shiftKey&&e.key==='/')){
    e.preventDefault();
    nestiqShowShortcutsModal();
    return;
  }
  if((e.metaKey||e.ctrlKey)&&k==='k'){e.preventDefault();openCmdPalette();return;}
  if(k==='h'){showPage('home');return;}
  if(k==='p'){showPage('properties');return;}
  if(k==='m'){
    const sess=typeof getSession==='function'?getSession():null;
    if(sess?.role==='tenant') showPage('map');
    return;
  }
  if(k==='a'){showPage('charts');return;}
  if(k==='escape'){closeCmdPalette();}
});

window.addEventListener('scroll',()=>document.getElementById('navbar')?.classList.toggle('scrolled',scrollY>40));

/* ═══════════════════════════════
   INIT
═══════════════════════════════ */
(() => {
  const savedTheme=localStorage.getItem('nestiq-theme');
  if(savedTheme) document.documentElement.setAttribute('data-theme',savedTheme);
  window.nestiqSyncTailwindDarkClass?.();
  // When returning from full-page navigations, ensure we start at top.
  window.addEventListener('pageshow', ()=>{ try{ window.scrollTo(0,0); }catch(_e){} }, { once:true });

  try{
    window.__nestiqHoldAuthEntry=nestiqIsAuthEntryHash();
  }catch(_e){
    window.__nestiqHoldAuthEntry=false;
  }

  let __bootstrapPromise=null;
  let __bootstrapGen=0;
  async function bootstrapApp(){
    const gen=++__bootstrapGen;
    const stale=()=>gen!==__bootstrapGen;
    const run=(async()=>{
    loadData?.();
    nestiqEnsureDemoBanner();
    if(!window.nestiqUseFirestore){
      window.nestiqPropertiesLoading=false;
      window.nestiqTenantsLoading=false;
      window.nestiqExpensesLoading=false;
    }
    applyTranslations?.();
    loadSavedTheme?.();
    syncNavUserUi?.();
    if(stale()) return;
    const s=getSession?.();
    if(window.__nestiqHoldAuthEntry && s && isValidSession?.(s)){
      if(stale()) return;
      window.nestiqHandleAuthEntryFlow?.();
      window.nestiqHideBootOverlay?.();
      return;
    }
    if(!s || !isValidSession?.(s)){
      if(stale()) return;
      if(window.nestiqUseFirestore && getRouteFromHash()==='listings'){
        try{
          await mountPage('listings');
        }catch(_e){
          nestiqShowNotif('Page failed to load','error');
        }
        window.nestiqHideBootOverlay?.();
        return;
      }
      // Returning from PayFast: never dump straight onto the login landing.
      if(typeof nestiqIsPaymentReturnUrl==='function' && nestiqIsPaymentReturnUrl()){
        try{ await nestiqHandlePaymentReturnOnDashboard?.(); }catch(_e){}
        window.nestiqHideBootOverlay?.();
        return;
      }
      showLoginScreen?.();
      window.nestiqHandleAuthEntryFlow?.();
      window.nestiqHideBootOverlay?.();
      return;
    }
    if(stale()) return;
    if(s.role==='contractor'){
      syncNavUserUi?.();
      try{ history.replaceState(null,'',location.pathname+location.search+'#contractor-dashboard'); }catch(_e){}
      try{ await mountPage('contractor-dashboard'); }catch(_e){ nestiqShowNotif('Page failed to load','error'); }
      window.nestiqHideBootOverlay?.();
      return;
    }
    if(s.role==='caretaker'){
      syncNavUserUi?.();
      initNotificationsForSession?.();
      try{ history.replaceState(null,'',location.pathname+location.search+'#caretaker-dashboard'); }catch(_e){}
      try{ await mountPage('caretaker-dashboard'); }catch(_e){ nestiqShowNotif('Page failed to load','error'); }
      window.nestiqHideBootOverlay?.();
      return;
    }
    if(s.role==='tenant'){
      const pendingLandlord=typeof window.nestiqIsLandlordSignInIntent==='function'&&window.nestiqIsLandlordSignInIntent();
      if(pendingLandlord){
        window.syncNavUserUi?.();
        window.nestiqShowLandlordRoleConflictModal?.();
        window.nestiqHideBootOverlay?.();
        return;
      }
      const tenant=(Array.isArray(tenantsData)?tenantsData:[]).find(t=>String(t.id)===String(s.userId||s.tenantDocId));
      applySessionLanguage?.(s);
      if(tenant?.preferredTheme) localStorage.setItem('nestiq-theme-name', tenant.preferredTheme);
      loadSavedTheme?.();
      syncNavUserUi?.();
      initNotificationsForSession?.();
      location.hash='#tenant-dashboard';
      try{
        await mountPage('tenant-dashboard');
      }catch(_e){
        nestiqShowNotif('Page failed to load','error');
      }
      window.nestiqHideBootOverlay?.();
      return;
    }
    applySessionLanguage?.(s);
    loadSavedTheme?.();
    initEmailJS();
    startEmailAutomation?.();
    initNotificationsForSession?.();
    renderBell();

    if(typeof nestiqHandlePaymentReturnOnDashboard === 'function'){
      try{ await nestiqHandlePaymentReturnOnDashboard(); }catch(_payRet){}
    }

    const route=nestiqEnsureBootstrapHash(nestiqBootstrapRouteForSession(s));
    try{
      await mountPage(route);
      // Login can race bootstrap + hashchange; ensure landlord Home is actually on screen.
      const outletPage=document.querySelector('#appOutlet .page.active');
      if(!outletPage || String(window.currentPage||'')!==String(route)){
        await mountPage(route);
      }else{
        nestiqRestorePageVisibility(outletPage);
      }
    }catch(_e){
      nestiqShowNotif('Page failed to load','error');
      try{ await mountPage('home'); }catch(_e2){}
    }
    applyActiveNav(route);
    window.nestiqHideBootOverlay?.();

    if(!localStorage.getItem('nestiq-onboarded') && !window.__nestiqOnboardingComplete){
      setTimeout(()=>{
        if(document.getElementById('nestiqOnboardingOverlay')) return;
        showWizard?.();
      },1800);
    }
    if(!sessionStorage.getItem('nestiq-welcome-toast')){
      try{ sessionStorage.setItem('nestiq-welcome-toast','1'); }catch(_e){}
      setTimeout(()=>nestiqShowNotif('👋 Welcome to NestIQ Pro! Press ⌘K to search.','success'),1000);
    }
    })();
    __bootstrapPromise=run.finally(()=>{ if(gen===__bootstrapGen) __bootstrapPromise=null; });
    return run;
  }
  window.nestiqBootstrapApp=bootstrapApp;

  // Browser back/forward cache can restore index.html without rerunning scripts,
  // leaving the boot overlay visible. Re-bootstrap on bfcache restore.
  window.addEventListener('pageshow', (e)=>{
    try{
      if(e && e.persisted) bootstrapApp();
    }catch(_e2){}
  });

  if(typeof nestiqRegisterAuthRouterInit === 'function'){
    // Session survives refresh in sessionStorage — mount immediately instead of
    // waiting for Firebase auth + Firestore onboarding checks (can take 10s+).
    const cachedSession=getSession?.();
    const valid=!!(cachedSession && isValidSession?.(cachedSession));
    let storedFlow='';
    try{ storedFlow=sessionStorage.getItem('nestiq-auth-flow')||''; }catch(_e){}
    const landingHop=storedFlow==='choose'||storedFlow==='signin'||storedFlow==='signup'||storedFlow==='login';
    if(valid && !landingHop){
      if(nestiqIsAuthEntryHash()){
        window.__nestiqHoldAuthEntry=false;
        const dest=cachedSession.role==='tenant'
          ? '#tenant-dashboard'
          : cachedSession.role==='contractor'?'#contractor-dashboard'
          : cachedSession.role==='caretaker'?'#caretaker-dashboard'
          : '#home';
        try{ history.replaceState(null,'',location.pathname+location.search+dest); }catch(_e){}
      }
      bootstrapApp();
    }
    nestiqRegisterAuthRouterInit((_profile) => bootstrapApp());
    if((window.__nestiqHoldAuthEntry || nestiqIsAuthEntryHash()) && !(valid && !landingHop)){
      try{ window.nestiqStartBootSafeguard?.(4000); }catch(_e){}
      setTimeout(()=>{
        window.nestiqHandleAuthEntryFlow?.();
        window.nestiqHideBootOverlay?.();
      }, 0);
    }
    return;
  }
  loadDataFromLocalStorage?.();
  normalizeDataModel?.();
  bootstrapApp();
})();
