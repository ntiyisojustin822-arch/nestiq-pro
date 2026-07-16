/* Shared landlord onboarding redirect logic (index + onboarding.html). */
(function(){
  const FS_TIMEOUT_MS = 8000;

  function withTimeout(promise, ms, label){
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error((label || 'Request') + ' timed out')), ms))
    ]);
  }

  function scopedSettingsRef(db, uid){
    if(!db || !uid) return null;
    if(window.nestiqFs && window.nestiqFs.settingsRef){
      return window.nestiqFs.settingsRef(db, uid);
    }
    return db.collection('landlords').doc(uid).collection('profile').doc('settings');
  }

  function legacySettingsRef(db, uid){
    return db && uid ? db.collection('settings').doc('landlord-' + uid) : null;
  }

  async function nestiqFetchLandlordSettings(db, uid){
    const empty = { exists: false, data: {}, ref: scopedSettingsRef(db, uid), source: null };
    if(!db || !uid) return empty;

    const scoped = scopedSettingsRef(db, uid);
    try{
      const snap = await withTimeout(scoped.get(), FS_TIMEOUT_MS, 'Settings read');
      if(snap.exists){
        return { exists: true, data: snap.data() || {}, ref: scoped, source: 'scoped' };
      }
    }catch(err){
      console.warn('NestIQ: scoped settings read failed', err?.code || err?.message || err);
    }

    const legacy = legacySettingsRef(db, uid);
    if(legacy){
      try{
        const leg = await withTimeout(legacy.get(), FS_TIMEOUT_MS, 'Legacy settings read');
        if(leg.exists){
          const data = leg.data() || {};
          try{
            await scoped.set(data, { merge: true });
            if(data.onboardingComplete == null){
              await scoped.set({ onboardingComplete: true }, { merge: true });
              data.onboardingComplete = true;
            }
          }catch(migrateErr){
            console.warn('NestIQ: legacy settings migrate failed', migrateErr);
          }
          return { exists: true, data, ref: scoped, source: 'legacy' };
        }
      }catch(err){
        console.warn('NestIQ: legacy settings read failed', err?.code || err?.message || err);
      }
    }

    return empty;
  }

  function nestiqIsOnboardingComplete(data, hints){
    const d = data && typeof data === 'object' ? data : {};
    const h = hints || {};
    if(d.onboardingComplete === true) return true;
    if(d.onboardingComplete === false) return false;
    if(h.hasProperties || h.hasTenants) return true;
    if(Number(d.onboardingStep) >= 7) return true;
    if(d.onboardingPaused === true && h.allowPaused) return true;
    if(d.landlordSettings || d.profile || d.name){
      const step = d.onboardingStep;
      if(step == null || Number(step) > 1) return true;
    }
    return false;
  }

  async function nestiqLandlordHasPortfolio(db, uid){
    if(!db || !uid) return { hasProperties: false, hasTenants: false };
    let hasProperties = false;
    let hasTenants = false;
    try{
      const pq = window.nestiqFs?.properties
        ? window.nestiqFs.properties(db, uid)
        : db.collection('landlords').doc(uid).collection('properties');
      if(pq){
        const ps = await withTimeout(pq.limit(1).get(), FS_TIMEOUT_MS, 'Properties read');
        hasProperties = !ps.empty;
      }
    }catch(_e){}
    try{
      const tq = window.nestiqFs?.tenants
        ? window.nestiqFs.tenants(db, uid)
        : db.collection('landlords').doc(uid).collection('tenants');
      if(tq){
        const ts = await withTimeout(tq.limit(1).get(), FS_TIMEOUT_MS, 'Tenants read');
        hasTenants = !ts.empty;
      }
    }catch(_e){}
    return { hasProperties, hasTenants };
  }

  async function nestiqResolveOnboardingState(db, uid){
    const settings = await nestiqFetchLandlordSettings(db, uid);
    const portfolio = await nestiqLandlordHasPortfolio(db, uid);
    const complete = nestiqIsOnboardingComplete(settings.data, {
      hasProperties: portfolio.hasProperties,
      hasTenants: portfolio.hasTenants,
      allowPaused: true
    });
    return {
      complete,
      paused: settings.data.onboardingPaused === true,
      settings,
      portfolio
    };
  }

  function nestiqClearRedirectLoop(){
    try{
      sessionStorage.removeItem('nestiq-redirect-ts');
      sessionStorage.removeItem('nestiq-redirect-count');
    }catch(_e){}
  }

  function nestiqBumpRedirectLoop(){
    try{
      const now = Date.now();
      const last = Number(sessionStorage.getItem('nestiq-redirect-ts') || 0);
      const cnt = Number(sessionStorage.getItem('nestiq-redirect-count') || 0);
      const nextCnt = (now - last) < 15000 ? (cnt + 1) : 1;
      sessionStorage.setItem('nestiq-redirect-ts', String(now));
      sessionStorage.setItem('nestiq-redirect-count', String(nextCnt));
      return nextCnt;
    }catch(_e){
      return 1;
    }
  }

  async function nestiqForceOnboardingComplete(db, uid){
    const ref = scopedSettingsRef(db, uid);
    if(!ref) return false;
    try{
      await ref.set({ onboardingComplete: true, onboardingPaused: false }, { merge: true });
      window.__nestiqOnboardingComplete = true;
      nestiqClearRedirectLoop();
      return true;
    }catch(err){
      console.error('NestIQ: force onboarding complete failed', err);
      return false;
    }
  }

  function nestiqShowOnboardingLoopRecovery(db, uid, onSuccess){
    let el = document.getElementById('nestiqLoopRecovery');
    if(!el){
      el = document.createElement('div');
      el.id = 'nestiqLoopRecovery';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(14,17,23,.45);backdrop-filter:blur(4px)';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="max-width:480px;width:100%;padding:24px;border-radius:16px;background:#fff;box-shadow:0 24px 64px rgba(14,17,23,.18)">'
      + '<h2 style="margin:0 0 8px;font-family:Playfair Display,serif;font-size:1.35rem">Almost there</h2>'
      + '<p style="margin:0 0 20px;color:rgba(14,17,23,.65);line-height:1.55">NestIQ detected a redirect loop. Your account looks ready — continue to open the dashboard.</p>'
      + '<button type="button" id="nestiqLoopRecoveryBtn" style="width:100%;padding:14px 20px;border:none;border-radius:10px;background:#C46A3A;color:#fff;font-weight:600;font-size:1rem;cursor:pointer">Continue to dashboard</button>'
      + '</div>';
    el.style.display = 'flex';
    const btn = document.getElementById('nestiqLoopRecoveryBtn');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Opening…';
      const ok = await nestiqForceOnboardingComplete(db, uid);
      if(ok){
        el.style.display = 'none';
        if(typeof onSuccess === 'function') onSuccess();
        else window.location.reload();
      }else{
        btn.disabled = false;
        btn.textContent = 'Continue to dashboard';
        window.showNotif?.('Could not save settings. Check Firestore rules and try again.', 'error');
      }
    };
  }

  function nestiqGoToOnboarding(){
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
    window.location.replace('onboarding.html');
  }

  function nestiqStartBootSafeguard(ms){
    const delay = Number(ms) > 0 ? Number(ms) : 12000;
    setTimeout(() => {
      if(document.body.classList.contains('nestiq-app-ready')) return;
      const ov = document.getElementById('nestiqBootOverlay');
      if(!ov || ov.style.display === 'none') return;
      if(window.firebase?.auth?.()?.currentUser){
        console.warn('NestIQ: boot safeguard — hiding overlay after slow auth bootstrap');
        try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
        if(typeof window.nestiqBootstrapApp === 'function'){
          window.nestiqBootstrapApp().catch(()=>{});
        }else if(typeof window.mountPage === 'function'){
          const s=typeof window.getSession==='function'?window.getSession():null;
          if(s && typeof window.isValidSession==='function' && window.isValidSession(s)){
            const route=typeof window.getRouteFromHash==='function'?(window.getRouteFromHash()||'home'):'home';
            window.mountPage(route).catch(()=>{});
          }
        }
        window.showNotif?.('The app took longer than expected to load. Some data may still be syncing.','warning');
        return;
      }
      console.warn('NestIQ: boot safeguard — showing sign-in after slow load');
      nestiqClearRedirectLoop();
      if(typeof window.showLandingPage === 'function'){
        window.showLandingPage('Loading took too long. Sign in or create an account below.');
      }else{
        try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
      }
    }, delay);
  }

  window.nestiqFetchLandlordSettings = nestiqFetchLandlordSettings;
  window.nestiqIsOnboardingComplete = nestiqIsOnboardingComplete;
  window.nestiqLandlordHasPortfolio = nestiqLandlordHasPortfolio;
  window.nestiqResolveOnboardingState = nestiqResolveOnboardingState;
  window.nestiqClearRedirectLoop = nestiqClearRedirectLoop;
  window.nestiqBumpRedirectLoop = nestiqBumpRedirectLoop;
  window.nestiqForceOnboardingComplete = nestiqForceOnboardingComplete;
  window.nestiqShowOnboardingLoopRecovery = nestiqShowOnboardingLoopRecovery;
  window.nestiqGoToOnboarding = nestiqGoToOnboarding;
  window.nestiqStartBootSafeguard = nestiqStartBootSafeguard;
})();
