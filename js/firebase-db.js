/* ═══════════════════════════════
   Firebase Firestore + Storage + Auth wiring
   Replaces localStorage persistence for app data.
═══════════════════════════════ */

(function(){
  let db = null;
  let auth = null;
  let storage = null;
  let nestUnsubs = [];
  let paymentUnsubs = new Map();
  let unitUnsubs = new Map();
  let propertyUnsub = null;
  let __saveTimer = null;
  let __routerCb = null;
  let __authHandlerGen = 0;

  function nestiqIsDemo(){
    // Demo mode disabled project-wide — always use live Firebase data.
    return false;
  }
  window.nestiqIsDemo=nestiqIsDemo;

  function nestiqMarkDemoDataReady(){
    try{ window.propertiesLoading=false; }catch(_e){}
    try{ window.tenantsLoading=false; }catch(_e){}
    try{ window.expensesLoading=false; }catch(_e){}
    window.nestiqPropertiesLoading=false;
    window.nestiqTenantsLoading=false;
    window.nestiqExpensesLoading=false;
    window.nestiqMaintenanceLoading=false;
    window.nestiqApplicationsLoading=false;
    window.nestiqVendorsLoading=false;
    try{ window.normalizeDataModel?.(); }catch(_e){}
    try{ landlordFirestoreUiRefresh?.(); }catch(_e){}
  }

  function stripUndefined(obj){
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const o = {};
    Object.keys(obj).forEach(k => {
      if(obj[k] !== undefined) o[k] = obj[k];
    });
    return o;
  }

  /** Firestore rejects undefined at any depth; nested objects in settings must be sanitized. */
  function deepStripUndefined(input){
    if(input === undefined) return undefined;
    if(input === null || typeof input !== 'object') return input;
    // Preserve Firestore sentinels (FieldValue, Timestamp, GeoPoint, DocumentReference).
    if(typeof input.toMillis === 'function' || typeof input.isEqual === 'function') return input;
    const ctor=input.constructor&&input.constructor.name;
    if(ctor&&/FieldValue|Timestamp|GeoPoint|DocumentReference|Bytes/.test(ctor)) return input;
    if(Array.isArray(input)){
      return input.map(deepStripUndefined).filter(item => item !== undefined);
    }
    const out = {};
    Object.keys(input).forEach(k => {
      const v = deepStripUndefined(input[k]);
      if(v !== undefined) out[k] = v;
    });
    return out;
  }

  function sid(v){ return String(v); }

  /** Stable row id: numeric when stored as digits, else Firestore doc id string */
  function rowIdFromDoc(doc, d){
    const raw = d && d.id != null && d.id !== '' ? d.id : doc.id;
    const n = Number(raw);
    if(Number.isFinite(n) && String(n) === String(raw)) return n;
    return String(raw);
  }

  /** Legacy numeric tenant label from Firestore / pendingClaims; null when id is a non-numeric string (e.g. auto-id). */
  function legacyNumericTenantId(raw){
    if(raw == null || raw === '') return null;
    const n = Number(raw);
    return (Number.isFinite(n) && String(n) === String(raw)) ? n : null;
  }

  function getSettingsDocRef(){
    if(!db) return null;
    const uid = currentLandlordUid();
    if(!uid) return null;
    if(window.nestiqFs && window.nestiqFs.settingsRef){
      return window.nestiqFs.settingsRef(db, uid);
    }
    return db.collection('landlords').doc(uid).collection('profile').doc('settings');
  }

  function currentLandlordUid(){
    if(window.__nestiqLandlordUid) return window.__nestiqLandlordUid;
    try{
      const s=window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
      if(s && (s.role==='caretaker'||s.role==='contractor'||s.role==='tenant') && s.landlordId){
        return String(s.landlordId);
      }
    }catch(_e){}
    return auth && auth.currentUser ? auth.currentUser.uid : null;
  }

  function landlordCol(name, lid){
    const id = lid || currentLandlordUid();
    if(!db || !id) return null;
    if(window.nestiqFs && window.nestiqFs.col) return window.nestiqFs.col(db, name, id);
    return db.collection('landlords').doc(id).collection(name);
  }

  function stopNestiqFirestoreListeners(){
    try{ window.nestiqStopApplicationsFirestoreListener?.(); }catch(_e){}
    nestUnsubs.forEach(u => { try{ u(); }catch(_e){} });
    nestUnsubs = [];
    paymentUnsubs.forEach(u => { try{ u(); }catch(_e){} });
    paymentUnsubs.clear();
    unitUnsubs.forEach(u => { try{ u(); }catch(_e){} });
    unitUnsubs.clear();
    if(propertyUnsub){ try{ propertyUnsub(); }catch(_e){} propertyUnsub = null; }
    if(Array.isArray(window.__tenantUnsubs)){
      window.__tenantUnsubs.forEach(u => { try{ u(); }catch(_e){} });
      window.__tenantUnsubs = [];
    }
    if(window.__tenantPropUnsub){
      try{ window.__tenantPropUnsub(); }catch(_e){}
      window.__tenantPropUnsub = null;
    }
    if(window.__tenantUnitUnsub){
      try{ window.__tenantUnitUnsub(); }catch(_e){}
      window.__tenantUnitUnsub = null;
    }
    if(window.__tenantNoticesUnsub){
      try{ window.__tenantNoticesUnsub(); }catch(_e){}
      window.__tenantNoticesUnsub = null;
    }
    if(Array.isArray(window.__caretakerUnsubs)){
      window.__caretakerUnsubs.forEach(u => { try{ u(); }catch(_e){} });
      window.__caretakerUnsubs = [];
    }
    // Do not force loading=false here — attachAfterProfile sets skeletons true
    // immediately after stop, and the first snapshots clear the flags.
  }

  function rebuildPaymentsDataFromTenants(){
    const flat = (window.tenantsData || []).flatMap(t =>
      (t.payments || []).map(p => ({ ...p, tenantId: t.id }))
    );
    window.paymentsData = flat;
    const payArr = window.__nestiqPaymentsDataArr;
    if(Array.isArray(payArr)){
      payArr.splice(0, payArr.length, ...flat);
    }
    try{
      if(typeof window.nestiqSyncAllPayments === 'function') window.nestiqSyncAllPayments();
    }catch(_e){}
  }

  function mergeSettingsPayload(d){
    if(!d) return;
    if(d.landlordEmail != null) window.landlordEmail = d.landlordEmail;
    if(d.landlordName != null) window.landlordName = d.landlordName;
    if(d.name != null && !window.landlordName) window.landlordName = d.name;
    if(d.email != null && window.landlordSettings) window.landlordSettings.email = window.landlordSettings.email || d.email;
    if(d.phone != null && window.landlordSettings) window.landlordSettings.phone = window.landlordSettings.phone || d.phone;
    if(d.companyName != null && window.landlordSettings) window.landlordSettings.companyName = window.landlordSettings.companyName || d.companyName;
    if(d.emailConfig) Object.assign(window.emailConfig, d.emailConfig);
    if(d.geminiApiKey != null) window.geminiApiKey = d.geminiApiKey;
    if(d.landlordSettings && typeof d.landlordSettings === 'object'){
      Object.assign(window.landlordSettings, d.landlordSettings);
      if(window.landlordSettings.preferredLanguage && typeof window.applySessionLanguage==='function'){
        try{ window.applySessionLanguage(); }catch(_e){}
      }
    }
    if(d.billing && typeof d.billing === 'object'){
      window.landlordSettings = window.landlordSettings || {};
      const billing = { ...(window.landlordSettings.billing || {}), ...d.billing };
      // Normalize Firestore Timestamps so billing UI date parsing stays reliable.
      ['currentPeriodStart', 'currentPeriodEnd', 'trialEnds', 'updatedAt', 'cancelAt'].forEach(k => {
        const v = billing[k];
        if(v && typeof v.toDate === 'function') billing[k] = v.toDate().toISOString();
        else if(v && v.seconds != null) billing[k] = new Date(Number(v.seconds) * 1000).toISOString();
      });
      window.landlordSettings.billing = billing;
    }
    if(d.sentReminderMonths) window.sentReminderMonths = d.sentReminderMonths;
    if(d.customEvents) window.customEvents = d.customEvents;
    if(d.utilityReadings) window.utilityReadings = d.utilityReadings;
    if(d.rentIncreases) window.rentIncreases = d.rentIncreases;
    if(d.inspections) window.inspections = d.inspections;
    if(d.bellNotifs) window.bellNotifs = d.bellNotifs;
    if(Array.isArray(d.vacancyRecords)) window.vacancyRecords = d.vacancyRecords;
    if(Array.isArray(d.lateFees)) window.lateFees = d.lateFees;
    if(Array.isArray(d.vendors)) window.vendors = d.vendors;
    if(Number.isFinite(Number(d.vendorNextId))) window.vendorNextId = Number(d.vendorNextId);
    if(Array.isArray(d.applications) && typeof window.applications !== 'undefined'){
      const live=typeof window.nestiqApplicationsListenerIsLive==='function' && window.nestiqApplicationsListenerIsLive();
      if(!live){
        const incoming=d.applications;
        const current=(typeof applications!=='undefined'&&Array.isArray(applications)?applications:window.applications)||[];
        const merged=typeof window.nestiqMergeApplicationListsById==='function'
          ? window.nestiqMergeApplicationListsById(incoming, current)
          : incoming;
        window.applications.splice(0, window.applications.length, ...merged);
        if(typeof applications !== 'undefined' && Array.isArray(applications)){
          applications.splice(0, applications.length, ...merged);
        }
        if(typeof normalizeStoredApplications === 'function') normalizeStoredApplications();
        try{ window.applications = applications; }catch(_e){}
      }
    }
    if(d.whatsappLog) window.whatsappLog = d.whatsappLog;
    if(d.emailLog) window.emailLog = d.emailLog;
    if(d.counters){
      if(Number.isFinite(Number(d.counters.expNextId))) window.expNextId = Number(d.counters.expNextId);
      if(Number.isFinite(Number(d.counters.tenantNextId))) window.tenantNextId = Number(d.counters.tenantNextId);
      if(Number.isFinite(Number(d.counters.maintNextId))) window.maintNextId = Number(d.counters.maintNextId);
      if(Number.isFinite(Number(d.counters.recurringExpenseNextId))) window.recurringExpenseNextId = Number(d.counters.recurringExpenseNextId);
      if(Number.isFinite(Number(d.counters.communicationNextId))) window.communicationNextId = Number(d.counters.communicationNextId);
      if(Number.isFinite(Number(d.counters.reconciliationNextId))) window.reconciliationNextId = Number(d.counters.reconciliationNextId);
    }
    if(typeof window.hydrateNotificationFieldsFromSettings === 'function'){
      window.hydrateNotificationFieldsFromSettings(d);
    }
    if(d.onboardingComplete != null){
      window.__nestiqOnboardingComplete = Boolean(d.onboardingComplete);
    }
  }
  window.nestiqMergeSettingsPayload = mergeSettingsPayload;

  function hydrateUnitsForProperty(propertyId, docs){
    if(typeof window.nestiqBindWindowDataArrays==='function'){
      try{ window.nestiqBindWindowDataArrays(); }catch(_e){}
    }
    if(!Array.isArray(window.unitsData)) window.unitsData=[];
    const pid=String(propertyId);
    const incoming=docs||[];
    const localForPid=window.unitsData.filter(u=>String(u.propertyId)===pid);
    // An empty first snapshot (listener attached before the batch commit) must not
    // wipe units the landlord just saved — that also emptied public listing units.
    if(!incoming.length && localForPid.length) return;
    const keep=window.unitsData.filter(u=>String(u.propertyId)!==pid);
    window.unitsData.length=0;
    keep.forEach(u=>window.unitsData.push(u));
    incoming.forEach(doc=>{
      const d=doc.data()||{};
      const id=d.id!=null&&d.id!==''?d.id:doc.id;
      window.unitsData.push(stripUndefined({ ...d, id, propertyId:d.propertyId||propertyId }));
    });
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  }

  function syncUnitListenersLandlord(propertyIds){
    if(nestiqIsDemo()) return;
    const want=new Set((propertyIds||[]).map(x=>String(x)));
    unitUnsubs.forEach((u,pid)=>{
      if(!want.has(String(pid))){ try{ u(); }catch(_e){} unitUnsubs.delete(pid); }
    });
    const lid=currentLandlordUid();
    (propertyIds||[]).forEach(pid=>{
      const key=String(pid);
      if(unitUnsubs.has(key)) return;
      const col=window.nestiqFs?.units?.(db,lid);
      if(!col) return;
      const q=col.where('propertyId','==',key);
      const unsub=q.onSnapshot(snap=>{
        hydrateUnitsForProperty(pid, snap.docs);
        try{ window.nestiqHealDraftListingIfReady?.(pid); }catch(_e){}
        try{
          const p=(window.propertiesData||[]).find(x=>String(x.id)===key);
          if(p && p.publishStatus!=='draft' && p.publicListing!==false){
            window.nestiqSyncPublicListingMirror?.(p);
          }
        }catch(_e){}
        if(window.currentPage==='properties') window.renderProperties?.();
        const wrap=document.getElementById('nestiqPropertyUnitsWrap');
        if(wrap&&String(wrap.dataset.propertyId)===key&&typeof window.nestiqRenderUnitsTable==='function'){
          wrap.outerHTML=window.nestiqRenderUnitsTable(pid);
        }
      }, err=>console.error('units listener', pid, err));
      unitUnsubs.set(key, unsub);
    });
  }

  function hydratePropertiesFromDocs(docs){
    window.propertiesData.length = 0;
    const nextPhotos = {};
    const createdMs = (data) => {
      if (typeof window.nestiqPropertyCreatedMs === 'function') return window.nestiqPropertyCreatedMs(data || {});
      const v = data && (data.createdAt || data.listedAt || data.updatedAt);
      if (v == null || v === '') return 0;
      if (typeof v === 'number' && Number.isFinite(v)) return v > 0 && v < 1e12 ? v * 1000 : v;
      if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
        const d = Date.parse(v);
        return Number.isFinite(d) ? d : 0;
      }
      try {
        if (typeof v.toMillis === 'function') return Number(v.toMillis()) || 0;
        if (typeof v.toDate === 'function') return Number(v.toDate().getTime()) || 0;
        if (typeof v.seconds === 'number') return (Number(v.seconds) || 0) * 1000;
      } catch (_e) {}
      return 0;
    };
    const sorted = docs.slice().sort((a, b) => {
      const da = a.data() || {};
      const db = b.data() || {};
      const diff = createdMs(db) - createdMs(da);
      if (diff) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
    sorted.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      const statusNorm=String(d.status||'vacant').trim().toLowerCase();
      // Vacant rows created before publicListing existed: default to published so Browse listings can query them.
      let pub = d.publicListing;
      if (statusNorm === 'vacant' && pub !== true && pub !== false) {
        pub = true;
        try {
          void doc.ref.set({ publicListing: true, status: 'vacant' }, { merge: true }).catch((e) => {
            console.warn('NestIQ: publicListing default skipped', doc.id, e);
          });
        } catch (_e) {
          console.warn('NestIQ: publicListing default skipped', doc.id, _e);
        }
      } else if (d.status && String(d.status) !== statusNorm) {
        try {
          void doc.ref.set({ status: statusNorm }, { merge: true }).catch(()=>{});
        } catch (_e) {}
      }
      if (statusNorm === 'vacant' && (pub === true || pub === 'true' || pub === 1)) {
        pub = true;
      }
      const numberOfUnits=Number.isFinite(Number(d.numberOfUnits))&&Number(d.numberOfUnits)>=1
        ? Number(d.numberOfUnits)
        : (Number.isFinite(Number(d.totalUnits))&&Number(d.totalUnits)>=1?Number(d.totalUnits):1);
      const archived=d.archived===true||d.deactivated===true;
      const row = stripUndefined({ ...d, id, status: statusNorm, publicListing: pub, numberOfUnits, archived });
      const pu = (typeof window.nestiqUsablePhotoSrc==='function'
        ? window.nestiqUsablePhotoSrc(d.photoUrl || d.photoURL || d.imageUrl)
        : String(d.photoUrl || d.photoURL || d.imageUrl || '').trim());
      if(pu && (/^https?:\/\//i.test(pu) || pu.startsWith('data:image/') || pu.startsWith('blob:'))){
        nextPhotos[sid(id)] = pu;
        row.photoUrl = pu;
      }else{
        delete row.photoUrl;
        delete row.photoURL;
        delete row.imageUrl;
      }
      window.propertiesData.push(row);
    });
    try{ window.nestiqSchedulePublicListingSync?.(window.propertiesData); }catch(_e){}
    try{
      (window.propertiesData||[]).forEach(p=>{
        void window.nestiqHealDraftListingIfReady?.(p?.id);
      });
    }catch(_e){}
    const phMap = window.propertyPhotos && typeof window.propertyPhotos === 'object' ? window.propertyPhotos : null;
    if(phMap){
      Object.keys(phMap).forEach(k => { delete phMap[k]; });
      Object.assign(phMap, nextPhotos);
    }else{
      window.propertyPhotos = nextPhotos;
    }
    window.photos = window.propertyPhotos;
    try{ window.nestiqWarmPropertyPhotoUrls?.(window.propertiesData); }catch(_e){}
  }

  function hydrateExpensesFromDocs(docs){
    window.expenses.length = 0;
    const sorted = docs.slice().sort((a, b) =>
      String((b.data().date || '')).localeCompare(String((a.data().date || '')))
    );
    sorted.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.expenses.push(stripUndefined({ ...d, id }));
    });
  }

  function hydrateRecurringExpensesFromDocs(docs){
    if(!Array.isArray(window.recurringExpenses)) window.recurringExpenses = [];
    window.recurringExpenses.length = 0;
    docs.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.recurringExpenses.push(stripUndefined({ ...d, id }));
    });
  }

  function hydrateCommunicationsFromDocs(docs){
    if(!Array.isArray(window.communications)) window.communications = [];
    window.communications.length = 0;
    docs.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.communications.push(stripUndefined({ ...d, id }));
    });
  }

  function hydrateReconciliationsFromDocs(docs){
    if(!Array.isArray(window.reconciliations)) window.reconciliations = [];
    window.reconciliations.length = 0;
    docs.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.reconciliations.push(stripUndefined({ ...d, id }));
    });
  }

  function hydrateMaintenanceFromDocs(docs){
    window.maintenanceData.length = 0;
    const nextMaint = {};
    const sorted = docs.slice().sort((a, b) => {
      const ta = a.data().createdAt && a.data().createdAt.toMillis ? a.data().createdAt.toMillis() : 0;
      const tb = b.data().createdAt && b.data().createdAt.toMillis ? b.data().createdAt.toMillis() : 0;
      return tb - ta;
    });
    sorted.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.maintenanceData.push(stripUndefined({ ...d, id }));
      const pu = d.photoUrl || d.photoURL;
      if(pu) nextMaint[sid(id)] = String(pu);
    });
    const mm = window.maintenancePhotos && typeof window.maintenancePhotos === 'object' ? window.maintenancePhotos : null;
    if(mm){
      Object.keys(mm).forEach(k => { delete mm[k]; });
      Object.assign(mm, nextMaint);
    }else{
      window.maintenancePhotos = nextMaint;
    }
  }

  function hydrateNoticesFromDocs(docs){
    window.notices = docs.map(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      return stripUndefined({ ...d, id });
    });
  }

  function hydrateMessagesFromDocs(docs){
    const next=[];
    (docs||[]).forEach(doc=>{
      const d=doc.data()||{};
      const id=rowIdFromDoc(doc,d);
      const row=stripUndefined({ ...d, id });
      if(row.tenantId!=null&&row.tenantId!=='') row.tenantId=String(row.tenantId);
      next.push(row);
    });
    if(typeof window.nestiqReplaceMessages==='function'){
      window.nestiqReplaceMessages(next);
    }else{
      try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
      if(!Array.isArray(window.messages)) window.messages=[];
      const arr=window.messages;
      arr.length=0;
      next.forEach(row=>arr.push(row));
      try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    }
  }

  function hydrateTenantsFromDocs(docs, includePaymentsArrays){
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    // Keep optimistic local rows while a cloud write is still in flight / before the
    // snapshot includes them — otherwise an empty listener clears the UI and saveData
    // may flush before the write lands.
    const pendingKeep=[];
    try{
      const pending=window.__nestiqPendingTenantWrites;
      if(pending&&pending.size&&Array.isArray(window.tenantsData)){
        window.tenantsData.forEach(t=>{
          if(t&&pending.has(String(t.id))) pendingKeep.push(t);
        });
      }
    }catch(_e){}
    if(!Array.isArray(window.tenantsData)) window.tenantsData=[];
    window.tenantsData.length = 0;
    docs.forEach(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      const row = { ...d, id };
      if(!includePaymentsArrays) delete row.payments;
      window.tenantsData.push(stripUndefined(row));
      try{ window.__nestiqPendingTenantWrites?.delete(String(id)); }catch(_e){}
    });
    pendingKeep.forEach(t=>{
      if(!window.tenantsData.some(x=>String(x.id)===String(t.id))){
        window.tenantsData.push(t);
      }
    });
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    if(includePaymentsArrays) rebuildPaymentsDataFromTenants();
  }

  function syncPaymentListenersLandlord(tenantIds){
    if(nestiqIsDemo()) return;
    const want = new Set(tenantIds.map(x => String(x)));
    paymentUnsubs.forEach((u, tid) => {
      if(!want.has(String(tid))){ try{ u(); }catch(_e){} paymentUnsubs.delete(tid); }
    });
    tenantIds.forEach(tid => {
      const key = String(tid);
      if(paymentUnsubs.has(key)) return;
      const payQ = landlordCol('payments', currentLandlordUid());
      if(!payQ) return;
      const u = payQ.where('tenantId', '==', sid(tid))
        .onSnapshot(ps => {
          const t = window.tenantsData.find(x => String(x.id) === String(tid));
          if(!t) return;
          t.payments = ps.docs.map(d => {
            const x = d.data();
            const pid = Number(x.id != null ? x.id : d.id);
            return stripUndefined({ ...x, id: pid });
          });
          rebuildPaymentsDataFromTenants();
          window.normalizeDataModel?.();
          window.renderTenants?.();
          window.renderTenantDashboard?.();
          window.refreshNestiqCalendar?.();
          window.renderBell?.();
        }, err => console.error('payments listener', tid, err));
      paymentUnsubs.set(key, u);
    });
  }

  function attachPropertyListenerForTenant(propertyId){
    if(nestiqIsDemo()) return;
    if(propertyUnsub){ try{ propertyUnsub(); }catch(_e){} propertyUnsub = null; }
    if(!propertyId) return;
    const lid = window.__nestiqTenantLandlordId || window.nestiqTenantSession?.landlordId || currentLandlordUid();
    const pcol = landlordCol('properties', lid);
    if(!pcol) return;
    propertyUnsub = pcol.doc(sid(propertyId)).onSnapshot(doc => {
      window.propertiesData.length = 0;
      if(!doc.exists) return;
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      window.propertiesData.push(stripUndefined({ ...d, id }));
      const pu = typeof window.nestiqUsablePhotoSrc==='function'
        ? window.nestiqUsablePhotoSrc(d.photoUrl || d.photoURL || d.imageUrl)
        : String(d.photoUrl || d.photoURL || d.imageUrl || '').trim();
      if(pu && window.propertyPhotos && typeof window.propertyPhotos === 'object'){
        window.propertyPhotos[sid(id)] = pu;
      }
      window.photos = window.propertyPhotos;
      window.renderTenantDashboard?.();
    });
  }

  function hydrateInvitationsFromDocs(docs){
    if(!Array.isArray(window.nestiqInvitations)) window.nestiqInvitations = [];
    window.nestiqInvitations.length = 0;
    docs.forEach(doc => {
      const d = doc.data();
      const id = Number(d.id != null ? d.id : doc.id);
      window.nestiqInvitations.push(stripUndefined({ ...d, id, _fireId: doc.id }));
    });
  }

  function landlordFirestoreUiRefresh(){
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    window.normalizeDataModel?.();
    if(window.currentPage === 'properties') window.renderProperties?.();
    if(window.currentPage === 'tenants') window.renderTenants?.();
    if(window.currentPage === 'expenses') window.renderExpenses?.();
    if(window.currentPage === 'maintenance') window.renderKanban?.();
    if(window.currentPage === 'charts') window.initCharts?.();
    window.updateHomeStats?.();
    window.renderGettingStarted?.();
    window.nestiqRenderHomeDashProps?.();
    window.updateMaintenanceBadge?.();
    window.updateMessageBadge?.();
    if(window.currentPage === 'renewals') window.renderRenewalsPage?.();
  }

  function landlordCollectionLoadError(kind, err){
    console.error(kind, err);
    if(kind === 'properties'){
      window.nestiqPropertiesLoading = false;
      try{ window.propertiesLoading = false; }catch(_e){}
      window.renderProperties?.();
    }else if(kind === 'tenants'){
      window.nestiqTenantsLoading = false;
      try{ window.tenantsLoading = false; }catch(_e){}
      window.renderTenants?.();
    }else if(kind === 'expenses'){
      window.nestiqExpensesLoading = false;
      try{ window.expensesLoading = false; }catch(_e){}
      window.renderExpenses?.();
    }
    const code=String(err?.code||'').toLowerCase();
    const isPerm=code.includes('permission');
    const hint=isPerm
      ? (kind==='properties'
        ? 'Could not load properties — Firebase permissions blocked this. Deploy the latest firestore.rules, sign in as a landlord, and disable App Check enforcement on Firestore until App Check is configured.'
        : 'Could not load '+kind+' — Firebase permissions blocked this. Deploy firestore.rules and sign in again.')
      : ('Could not load '+kind+'. Check your connection and refresh the page.');
    window.nestiqShowNotif?.(hint,'error');
  }

  function attachLandlordColListener(colName, uid, onData, onErr){
    if(nestiqIsDemo()){
      nestiqMarkDemoDataReady();
      return;
    }
    const col = landlordCol(colName, uid);
    if(!col){
      try{ onErr?.(new Error(colName+' collection unavailable')); }catch(_e){}
      return;
    }
    nestUnsubs.push(col.onSnapshot(onData, onErr));
  }

  function attachLandlordListeners(){
    if(nestiqIsDemo()){
      // Demo data is already seeded in memory — skip all Firestore listeners.
      nestiqMarkDemoDataReady();
      try{ window.renderProperties?.(); }catch(_e){}
      try{ window.renderTenants?.(); }catch(_e){}
      try{ window.renderExpenses?.(); }catch(_e){}
      try{ window.renderKanban?.(); }catch(_e){}
      try{ window.updateHomeStats?.(); }catch(_e){}
      try{ window.nestiqRenderVendorsPage?.(); }catch(_e){}
      try{ window.nestiqRenderLateFeesPage?.(); }catch(_e){}
      console.log('[NestIQ Demo] Skipping landlord Firestore listeners');
      return;
    }
    const uid = currentLandlordUid();
    if(!uid) return;

    window.nestiqPropertiesLoading = true;
    window.nestiqTenantsLoading = true;
    window.nestiqExpensesLoading = true;
    window.nestiqMaintenanceLoading = true;
    window.nestiqVendorsLoading = true;
    try{ window.propertiesLoading = true; }catch(_e){}
    try{ window.tenantsLoading = true; }catch(_e){}
    try{ window.expensesLoading = true; }catch(_e){}

    const loadWatchdog = setTimeout(() => {
      let stuck = false;
      if(window.nestiqPropertiesLoading){
        window.nestiqPropertiesLoading = false;
        try{ window.propertiesLoading = false; }catch(_e){}
        window.renderProperties?.();
        stuck = true;
      }
      if(window.nestiqTenantsLoading){
        window.nestiqTenantsLoading = false;
        try{ window.tenantsLoading = false; }catch(_e){}
        window.renderTenants?.();
        stuck = true;
      }
      if(window.nestiqExpensesLoading){
        window.nestiqExpensesLoading = false;
        try{ window.expensesLoading = false; }catch(_e){}
        window.renderExpenses?.();
        stuck = true;
      }
      if(stuck){
        console.warn('NestIQ: landlord data load timed out');
        window.nestiqShowNotif?.('Some data is taking longer than expected. Showing what we have — try refreshing or check your connection.','warning');
      }
    }, 12000);
    nestUnsubs.push(() => clearTimeout(loadWatchdog));

    attachLandlordColListener('properties', uid, snap => {
      hydratePropertiesFromDocs(snap.docs);
      window.nestiqPropertiesLoading = false;
      try{ window.propertiesLoading = false; }catch(_e){}
      syncUnitListenersLandlord((window.propertiesData||[]).map(p=>p.id));
      window.normalizeDataModel?.();
      window.renderProperties?.();
      window.renderHomeStats?.();
      window.initMap?.();
      window.refreshNestiqCalendar?.();
      landlordFirestoreUiRefresh();
    }, e => landlordCollectionLoadError('properties', e));

    attachLandlordColListener('tenants', uid, snap => {
      hydrateTenantsFromDocs(snap.docs, false);
      window.nestiqTenantsLoading = false;
      try{ window.tenantsLoading = false; }catch(_e){}
      const ids = window.tenantsData.map(t => t.id);
      syncPaymentListenersLandlord(ids);
      rebuildPaymentsDataFromTenants();
      window.normalizeDataModel?.();
      try{ window.calculateDepositInterest?.(); }catch(_e){}
      try{ window.syncTenantStatuses?.(); }catch(_e){}
      window.renderTenants?.();
      window.renderHomeStats?.();
      window.refreshNestiqCalendarInit?.();
      window.renderBell?.();
      landlordFirestoreUiRefresh();
    }, e => landlordCollectionLoadError('tenants', e));

    attachLandlordColListener('expenses', uid, snap => {
      hydrateExpensesFromDocs(snap.docs);
      window.nestiqExpensesLoading = false;
      try{ window.expensesLoading = false; }catch(_e){}
      window.renderExpenses?.();
      window.renderTaxReport?.();
      window.refreshNestiqCalendar?.();
      landlordFirestoreUiRefresh();
    }, e => landlordCollectionLoadError('expenses', e));

    nestUnsubs.push(landlordCol('recurringExpenses', uid).onSnapshot(snap => {
      hydrateRecurringExpensesFromDocs(snap.docs);
      try{ window.normalizeDataModel?.(); }catch(_e){}
      try{ window.checkRecurringExpenses?.(); }catch(_e){}
      window.renderExpenses?.();
    }, e => console.error('recurringExpenses', e)));

    nestUnsubs.push(landlordCol('communications', uid).onSnapshot(snap => {
      hydrateCommunicationsFromDocs(snap.docs);
      try{ window.normalizeDataModel?.(); }catch(_e){}
      window.nestiqRenderHomeFollowUpsWidget?.();
      window.renderBell?.();
    }, e => console.error('communications', e)));

    nestUnsubs.push(landlordCol('reconciliations', uid).onSnapshot(snap => {
      hydrateReconciliationsFromDocs(snap.docs);
      try{ window.normalizeDataModel?.(); }catch(_e){}
      window.renderReconciliationPage?.();
    }, e => console.error('reconciliations', e)));

    nestUnsubs.push(landlordCol('maintenance', uid).onSnapshot(snap => {
      hydrateMaintenanceFromDocs(snap.docs);
      window.nestiqMaintenanceLoading = false;
      window.normalizeDataModel?.();
      window.renderKanban?.();
      window.refreshNestiqCalendar?.();
      landlordFirestoreUiRefresh();
    }, e => console.error('maintenance', e)));

    if(window.nestiqFs?.inspections){
      nestUnsubs.push(window.nestiqFs.inspections(db, uid).onSnapshot(snap => {
        window.inspections = snap.docs.map(doc => ({ id:doc.id, ...doc.data() }))
          .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
        try{ window.renderInspectionsPage?.(); }catch(_e){}
      }, e => console.error('inspections', e)));
    }

    nestUnsubs.push(landlordCol('notices', uid).onSnapshot(snap => {
      hydrateNoticesFromDocs(snap.docs);
      window.renderTenantDashboard?.();
      landlordFirestoreUiRefresh();
    }, e => console.error('notices', e)));

    nestUnsubs.push(landlordCol('messages', uid).onSnapshot(snap => {
      hydrateMessagesFromDocs(snap.docs);
      window.updateMessageBadge?.(0);
      window.__nestiqMsgListenerReady=true;
      window.__nestiqMsgUnread=0;
      window.renderTenantDashboard?.();
      landlordFirestoreUiRefresh();
      try{
        if(document.getElementById('lmThread')&&window.__nestiqOpenChatTenantId!=null&&!document.getElementById('nestiqChatEditBox')){
          window.openLandlordTenantMessages?.(window.__nestiqOpenChatTenantId,{skipMarkRead:true,skipOpen:true});
        }
      }catch(_e){}
    }, e => console.error('messages', e)));

    nestUnsubs.push(landlordCol('invitations', uid).onSnapshot(snap => {
      hydrateInvitationsFromDocs(snap.docs);
      window.nestiqRenderInvitationsTable?.();
    }, e => console.error('invitations', e)));

    attachLandlordColListener('leases', uid, snap => {
      const rows=snap.docs.map(doc=>{
        const d=doc.data()||{};
        return stripUndefined({ ...d, id:String(d.id||doc.id) });
      });
      if(typeof window.nestiqReplaceLeases==='function') window.nestiqReplaceLeases(rows);
      else window.leasesData=rows;
      try{ window.nestiqRememberLeaseStatuses?.(rows); }catch(_e){}
      try{ window.nestiqRenderLeasesPortfolioTable?.(); }catch(_e){}
      if(window.currentPage==='renewals') window.renderRenewalsPage?.();
    }, e => console.error('leases', e));

    const sref = getSettingsDocRef();
    if(sref){
      nestUnsubs.push(sref.onSnapshot(doc => {
        if(doc.exists) mergeSettingsPayload(doc.data());
        window.nestiqVendorsLoading = false;
        window.renderSettings?.();
        try{ window.nestiqRenderVendorsPage?.(); }catch(_e){}
        // When PayFast ITN (or client) updates billing, refresh subscribed UI immediately.
        try{ window.nestiqUpdateNavBillingBadge?.(); }catch(_e){}
        if(document.getElementById('billCurrentPlanName')){
          try{ window.nestiqRenderBillingPage?.(); }catch(_e){}
        }
      }, e => console.error('settings', e)));
    }
  }

  async function attachTenantListeners(tenantId){
    if(nestiqIsDemo()){
      nestiqMarkDemoDataReady();
      console.log('[NestIQ Demo] Skipping tenant Firestore listeners');
      return;
    }
    const tid = Number(tenantId);
    let landlordId = null;
    try{
      const lidGuess = window.nestiqTenantSession?.landlordId || null;
      const tcol = landlordCol('tenants', lidGuess);
      if(tcol){
        const tSnap = await tcol.doc(sid(tid)).get();
        if(tSnap.exists) landlordId = tSnap.data().landlordId || lidGuess;
      }
    }catch(_e){}
    window.__nestiqTenantLandlordId = landlordId;

    const noticesQ = landlordId
      ? landlordCol('notices', landlordId)
      : db.collection('notices');
    nestUnsubs.push(noticesQ.onSnapshot(snap => {
      let docs = snap.docs;
      if(landlordId){
        docs = docs.filter(doc => {
          const d = doc.data();
          const tgt = d.targetTenantId;
          return tgt == null || tgt === '' || Number(tgt) === tid;
        });
      }
      hydrateNoticesFromDocs(docs);
      window.renderTenantDashboard?.();
    }, e => console.error('notices', e)));

    const msgCol = landlordCol('messages', landlordId);
    if(msgCol) nestUnsubs.push(msgCol.where('tenantId', '==', sid(tid)).onSnapshot(snap => {
      hydrateMessagesFromDocs(snap.docs);
      window.renderTenantDashboard?.();
    }, e => console.error('messages', e)));

    const maintCol = landlordCol('maintenance', landlordId);
    if(maintCol) nestUnsubs.push(maintCol.where('tenantId', '==', tid).onSnapshot(snap => {
      window.maintenanceData.length = 0;
      snap.docs.forEach(doc => {
        const d = doc.data();
        const id = rowIdFromDoc(doc, d);
        window.maintenanceData.push(stripUndefined({ ...d, id }));
        if(d.photoUrl) window.maintenancePhotos[sid(id)] = d.photoUrl;
      });
      window.renderTenantDashboard?.();
    }, e => console.error('maint tenant', e)));

    const setRef = landlordId
      ? (window.nestiqFs?.settingsRef(db, landlordId) || db.collection('landlords').doc(landlordId).collection('profile').doc('settings'))
      : null;
    if(setRef) nestUnsubs.push(setRef.onSnapshot(doc => {
      if(doc.exists) mergeSettingsPayload(doc.data());
      window.renderTenantDashboard?.();
    }, e => console.error('settings', e)));

    const tcol2 = landlordCol('tenants', landlordId);
    if(!tcol2) return;
    nestUnsubs.push(tcol2.doc(sid(tid)).onSnapshot(doc => {
      if(!doc.exists) return;
      const d = doc.data();
      const id = Number(d.id != null ? d.id : doc.id);
      const prevPay = (window.tenantsData[0] && Number(window.tenantsData[0].id) === id) ? (window.tenantsData[0].payments || []) : [];
      window.tenantsData.length = 0;
      window.tenantsData.push(stripUndefined({ ...d, id, payments: prevPay }));
      attachPropertyListenerForTenant(d.propertyId);
    }, e => console.error('tenant doc', e)));

    const payCol = landlordCol('payments', landlordId);
    if(!payCol) return;
    const payUnsub = payCol.where('tenantId', '==', sid(tid)).onSnapshot(ps => {
      const t = window.tenantsData[0];
      if(!t) return;
      t.payments = ps.docs.map(d => {
        const x = d.data();
        const pid = Number(x.id != null ? x.id : d.id);
        return stripUndefined({ ...x, id: pid });
      });
      rebuildPaymentsDataFromTenants();
      window.normalizeDataModel?.();
      window.renderTenantDashboard?.();
      window.refreshNestiqCalendar?.();
    }, e => console.error('tenant payments', e));
    nestUnsubs.push(payUnsub);
  }

  async function ensureSecondaryAuthApp(){
    if(firebase.apps.find(a => a.name === 'Secondary')) return firebase.app('Secondary');
    return firebase.initializeApp(firebase.app().options, 'Secondary');
  }

  async function createTenantAuthAccount(tenant){
    const email = String(tenant.email || '').trim().toLowerCase();
    const pass = window.normalizeUnitPassword ? window.normalizeUnitPassword(tenant.unit) : String(tenant.unit || '').toLowerCase().replace(/^unit\s*/, '').replace(/\s+/g, '');
    if(!email || !pass){ return { ok:false, error:'missing email/unit' }; }
    try{
      const secApp = await ensureSecondaryAuthApp();
      const secAuth = firebase.auth(secApp);
      await secAuth.createUserWithEmailAndPassword(email, pass);
      await secAuth.signOut();
      return { ok:true };
    }catch(err){
      console.warn('Tenant auth provisioning:', err);
      return { ok:false, error:err };
    }
  }

  /** True when this Auth uid owns real landlord portfolio data (not just leftover settings). */
  async function userLooksLikeLandlord(uid){
    if(!db||!uid) return false;
    try{
      const pc=await db.collection('pendingClaims').doc(uid).get();
      if(pc.exists&&String(pc.data()?.role||'')==='landlord') return true;
    }catch(_e){}
    // Properties are the strong signal — empty settings leftovers must not flip tenants.
    try{
      const pq=await landlordCol('properties', uid).limit(1).get();
      if(!pq.empty) return true;
    }catch(_e){}
    return false;
  }

  async function writeLandlordUserProfile(ref, user, patch){
    const nm=patch?.name||user.displayName||'Landlord';
    const payload=deepStripUndefined(stripUndefined({
      role:'landlord',
      tenantId:null,
      tenantDocId:null,
      name:nm,
      email:user.email,
      landlordId:user.uid,
      phone:patch?.phone,
      company:patch?.company
    }));
    await ref.set(payload,{ merge:true });
    // Stale portal linkage rewrites this back to tenant on refresh — remove it.
    try{
      const acct=window.nestiqFs?.tenantAccount(db, user.uid);
      if(acct) await acct.delete();
    }catch(_e){}
    window.nestiqTenantSession=null;
    return { role:'landlord', tenantId:null, tenantDocId:null, name:nm, email:user.email, landlordId:user.uid };
  }

  async function writeStaffUserProfile(ref, user, opts){
    opts=opts||{};
    const role=opts.role==='caretaker'?'caretaker':'contractor';
    const assignedPropertyIds=Array.isArray(opts.assignedPropertyIds)
      ? opts.assignedPropertyIds.map(x=>String(x)).filter(Boolean)
      : [];
    const payload=deepStripUndefined(stripUndefined({
      role,
      name:opts.name||user.displayName||(role==='caretaker'?'Caretaker':'Contractor'),
      email:user.email,
      phone:opts.phone||'',
      landlordId:opts.landlordId||null,
      landlordName:opts.landlordName||'',
      staffId:opts.staffId||null,
      assignedPropertyIds,
      vendorId:opts.vendorId||null,
      vendorType:opts.vendorType||''
    }));
    await ref.set(payload,{ merge:true });
    return {
      role,
      name:payload.name,
      email:user.email,
      phone:payload.phone||'',
      landlordId:payload.landlordId||null,
      landlordName:payload.landlordName||'',
      staffId:payload.staffId||null,
      assignedPropertyIds,
      vendorId:payload.vendorId||null,
      vendorType:payload.vendorType||'',
      uid:user.uid
    };
  }

  async function writeTenantUserProfile(ref, user, opts){
    opts=opts||{};
    const tid=String(opts.tenantDocId||opts.tenantId||'').trim();
    const lid=opts.landlordId!=null?String(opts.landlordId):null;
    const nm=opts.name||user.displayName||'Tenant';
    const legacyTid=legacyNumericTenantId(opts.tenantId != null ? opts.tenantId : tid);
    const payload=deepStripUndefined(stripUndefined({
      role:'tenant',
      tenantId: legacyTid,
      tenantDocId: tid||null,
      name:nm,
      email:user.email,
      landlordId:lid
    }));
    await ref.set(payload,{ merge:true });
    return {
      role:'tenant',
      tenantId: legacyTid,
      tenantDocId: tid||null,
      name:nm,
      email:user.email,
      landlordId:lid
    };
  }

  /** Prefer tenantAccounts linkage over a mistaken landlord role rewrite. */
  async function restoreTenantProfileFromAccount(ref, user){
    const acct=await nestiqVerifyTenantAccount(user);
    if(!acct) return null;
    return writeTenantUserProfile(ref, user, {
      tenantDocId: acct.tenantId,
      tenantId: acct.tenantId,
      landlordId: acct.landlordId,
      name: user.displayName||'Tenant'
    });
  }

  async function nestiqClaimLandlordAccount(){
    const user=auth&&auth.currentUser;
    if(!db||!user) throw new Error('Not signed in');
    const fv=firebase.firestore.FieldValue;
    const nm=user.displayName||'Landlord';
    const sref=window.nestiqFs?.settingsRef(db, user.uid) || db.collection('landlords').doc(user.uid).collection('profile').doc('settings');
    const trialBilling = typeof window.nestiqCreateDefaultTrialBilling === 'function'
      ? window.nestiqCreateDefaultTrialBilling()
      : null;
    const settingsPatch = {
      name:nm,
      email:user.email,
      onboardingComplete:false,
      landlordSettings:{ name:nm, email:user.email },
      createdAt:fv.serverTimestamp()
    };
    if(trialBilling) settingsPatch.billing = trialBilling;
    settingsPatch.onboardingComplete = false;
    settingsPatch.onboardingStep = 1;
    await sref.set(settingsPatch,{ merge:true });
    await db.collection('pendingClaims').doc(user.uid).set({
      role:'landlord',
      name:nm,
      createdAt:fv.serverTimestamp()
    },{ merge:true });
    // Drop portal link so refresh does not keep forcing tenant role.
    try{
      const acct=window.nestiqFs?.tenantAccount(db, user.uid);
      if(acct) await acct.delete();
    }catch(_e){}
    window.nestiqTenantSession=null;
    const profile=await writeLandlordUserProfile(db.collection('users').doc(user.uid),user,{ name:nm });
    window.__nestiqSession={
      role:'landlord',
      userId:null,
      tenantDocId:null,
      landlordId:user.uid,
      name:profile.name,
      email:user.email,
      uid:user.uid,
      loggedInAt:new Date().toISOString()
    };
    try{ sessionStorage.setItem('nestiq-session',JSON.stringify(window.__nestiqSession)); }catch(_e){}
    stopTenantPortalListeners();
    await attachAfterProfile(profile);
    window.syncNavUserUi?.();
    location.hash='#home';
    if(typeof mountPage==='function') await mountPage('home');
    window.nestiqShowNotif?.('Account switched to landlord. Complete setup if prompted.','success');
    return profile;
  }
  window.nestiqClaimLandlordAccount=nestiqClaimLandlordAccount;

  async function tenantRecordOwnedByAuthUser(tenantDocId, uid){
    if(!db||!tenantDocId||!uid) return false;
    try{
      const t=await landlordCol('tenants', uid).doc(String(tenantDocId)).get();
      return t.exists && String(t.data()?.landlordId||'')===String(uid);
    }catch(_e){
      return false;
    }
  }

  function nestiqSetSignInIntent(role){
    const r=role==='landlord'?'landlord':'tenant';
    window.__nestiqSignInIntent=r;
    try{ sessionStorage.setItem('nestiq-sign-in-intent',r); }catch(_e){}
  }

  function nestiqGetSignInIntent(){
    const w=String(window.__nestiqSignInIntent||'').toLowerCase();
    if(w) return w;
    try{ return String(sessionStorage.getItem('nestiq-sign-in-intent')||'').toLowerCase(); }catch(_e){ return ''; }
  }

  function nestiqClearSignInIntent(){
    window.__nestiqSignInIntent=null;
    try{ sessionStorage.removeItem('nestiq-sign-in-intent'); }catch(_e){}
  }

  function nestiqIsLandlordSignInIntent(){
    return nestiqGetSignInIntent()==='landlord';
  }

  window.nestiqSetSignInIntent=nestiqSetSignInIntent;
  window.nestiqGetSignInIntent=nestiqGetSignInIntent;
  window.nestiqClearSignInIntent=nestiqClearSignInIntent;
  window.nestiqIsLandlordSignInIntent=nestiqIsLandlordSignInIntent;

  async function resolveUserProfile(user){
    const ref = db.collection('users').doc(user.uid);
    const email = (user.email || '').toLowerCase();
    const signInIntent=nestiqIsLandlordSignInIntent();
    const tenantIntent=nestiqGetSignInIntent()==='tenant';
    const hasLandlordSignals=await userLooksLikeLandlord(user.uid);

  const cachedStaffRole=(()=>{
    try{ return String((window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null')||{}).role||''); }
    catch(_e){ return ''; }
  })();

  // Prefer tenantAccounts linkage when this uid has no landlord properties.
  // Fixes accounts that were wrongly rewritten to landlord but still have a portal link.
  // Never run this for staff sessions — it can bounce contractors onto the public landing.
  if(cachedStaffRole!=='contractor' && cachedStaffRole!=='caretaker' && (tenantIntent || (!hasLandlordSignals && !signInIntent))){
    try{
      const restored=await restoreTenantProfileFromAccount(ref, user);
      if(restored) return restored;
    }catch(_e){}
  }

    if(signInIntent){
      try{
        const pcEarly=await db.collection('pendingClaims').doc(user.uid).get();
        if(pcEarly.exists&&String(pcEarly.data()?.role||'')==='landlord'){
          return await writeLandlordUserProfile(ref,user,pcEarly.data());
        }
        if(pcEarly.exists&&String(pcEarly.data()?.role||'')==='tenant'){
          const p=pcEarly.data()||{};
          return await writeTenantUserProfile(ref,user,{
            tenantDocId:p.tenantDocId||p.tenantId,
            tenantId:p.tenantId||p.tenantDocId,
            landlordId:p.landlordId||null,
            name:p.name||user.displayName
          });
        }
      }catch(_e){}
      try{
        const ssEarly=await (window.nestiqFs?.settingsRef(db, user.uid) || db.collection('landlords').doc(user.uid).collection('profile').doc('settings')).get();
        if(ssEarly.exists){
          return await writeLandlordUserProfile(ref,user,ssEarly.data());
        }
      }catch(_e){}
    }

    let snap;
    try{
      snap = await ref.get();
    }catch(readErr){
      console.error('NestIQ: users profile read failed', readErr);
      throw readErr;
    }
    if(snap.exists){
      const d = snap.data();
      const tenantDocIdEarly=d.tenantDocId != null && String(d.tenantDocId).trim() !== ''
        ? String(d.tenantDocId)
        : (d.tenantId != null ? String(d.tenantId) : null);

      // True landlord profile for this uid — keep landlord only with real portfolio signals.
      if(String(d.role||'')==='landlord' && String(d.landlordId||user.uid)===String(user.uid) && !tenantIntent){
        if(hasLandlordSignals){
          return {
            role:'landlord',
            tenantDocId:null,
            tenantId:null,
            name:d.name || user.displayName || 'User',
            email:user.email,
            landlordId:user.uid
          };
        }
        // Empty "landlord" shell (often from a bad tenant→landlord rewrite). Prefer portal link.
        try{
          const restoredEmpty=await restoreTenantProfileFromAccount(ref, user);
          if(restoredEmpty) return restoredEmpty;
        }catch(_e){}
        try{
          const pcEmpty=await db.collection('pendingClaims').doc(user.uid).get();
          if(pcEmpty.exists&&String(pcEmpty.data()?.role||'')==='tenant'){
            const p=pcEmpty.data()||{};
            return await writeTenantUserProfile(ref,user,{
              tenantDocId:p.tenantDocId||p.tenantId,
              tenantId:p.tenantId||p.tenantDocId,
              landlordId:p.landlordId||null,
              name:p.name||d.name||user.displayName
            });
          }
        }catch(_e){}
      }

      // Existing tenant profiles must never be auto-converted to landlord on refresh.
      // Landlord sign-in against a tenant account is handled by the role-conflict UI.
      if(String(d.role||'')==='tenant'){
        let landlordId=d.landlordId||window.nestiqTenantSession?.landlordId||null;
        if(d.role === 'tenant' && tenantDocIdEarly && (!d.tenantDocId || String(d.tenantDocId).trim() === '')){
          try{
            await ref.set({
              tenantDocId:tenantDocIdEarly,
              tenantId: legacyNumericTenantId(tenantDocIdEarly)
            }, { merge:true });
          }catch(_e){}
        }
        const status=String(d.status||window.nestiqTenantSession?.status||'').toLowerCase()||null;
        return {
          role:'tenant',
          tenantDocId:tenantDocIdEarly || (status==='unassigned'||d.selfRegistered ? user.uid : null),
          tenantId:d.tenantId != null ? Number(d.tenantId) : legacyNumericTenantId(tenantDocIdEarly||user.uid),
          name:d.name || user.displayName || 'User',
          email:user.email,
          phone:d.phone||'',
          landlordId:landlordId||null,
          status:status||(d.selfRegistered?'unassigned':undefined),
          selfRegistered:!!d.selfRegistered
        };
      }

      if(String(d.role||'')==='contractor'){
        return {
          role:'contractor',
          name:d.name || user.displayName || 'Contractor',
          email:user.email,
          phone:d.phone||'',
          landlordId:d.landlordId||null,
          landlordName:d.landlordName||'',
          vendorId:d.vendorId||null,
          vendorType:d.vendorType||'',
          uid:user.uid
        };
      }

      if(String(d.role||'')==='caretaker'){
        let assignedPropertyIds=Array.isArray(d.assignedPropertyIds)?d.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[];
        let staffId=d.staffId||null;
        let landlordId=d.landlordId||null;
        let landlordName=d.landlordName||'';
        let name=d.name || user.displayName || 'Caretaker';
        let phone=d.phone||'';
        try{
          const acc=await window.nestiqFs?.staffAccount?.(db, user.uid)?.get?.();
          if(acc&&acc.exists){
            const a=acc.data()||{};
            if(Array.isArray(a.assignedPropertyIds)) assignedPropertyIds=a.assignedPropertyIds.map(x=>String(x)).filter(Boolean);
            if(a.staffId) staffId=a.staffId;
            if(a.landlordId) landlordId=a.landlordId;
            if(a.landlordName) landlordName=a.landlordName;
            if(a.name) name=a.name;
            if(a.phone) phone=a.phone;
          }
        }catch(_e){}
        return {
          role:'caretaker',
          name,
          email:user.email,
          phone,
          landlordId:landlordId||null,
          landlordName,
          staffId,
          assignedPropertyIds,
          uid:user.uid
        };
      }

      // Mistaken conversion: landlord role but still linked to another landlord's property.
      if(String(d.role||'')==='landlord' && tenantDocIdEarly && d.landlordId && String(d.landlordId)!==String(user.uid)){
        return await writeTenantUserProfile(ref,user,{
          tenantDocId:tenantDocIdEarly,
          tenantId:d.tenantId,
          landlordId:d.landlordId,
          name:d.name||user.displayName
        });
      }

      // Only fall back to tenantAccounts when explicitly using Tenant Portal,
      // or when this account does not look like a landlord at all.
      if(String(d.role||'')==='landlord' && (tenantIntent || !hasLandlordSignals)){
        const restored=await restoreTenantProfileFromAccount(ref, user);
        if(restored) return restored;
        try{
          const pcTenant=await db.collection('pendingClaims').doc(user.uid).get();
          if(pcTenant.exists&&String(pcTenant.data()?.role||'')==='tenant'){
            const p=pcTenant.data()||{};
            return await writeTenantUserProfile(ref,user,{
              tenantDocId:p.tenantDocId||p.tenantId,
              tenantId:p.tenantId||p.tenantDocId,
              landlordId:p.landlordId||null,
              name:p.name||d.name||user.displayName
            });
          }
        }catch(_e){}
      }

      const tenantDocId=tenantDocIdEarly;
      return {
        role:d.role,
        tenantDocId,
        tenantId:d.tenantId != null ? Number(d.tenantId) : legacyNumericTenantId(tenantDocId),
        name:d.name || user.displayName || 'User',
        email:user.email,
        landlordId:d.landlordId || (d.role === 'landlord' ? user.uid : null)
      };
    }

    const pcSnap = await db.collection('pendingClaims').doc(user.uid).get();
    if(pcSnap.exists){
      const p = pcSnap.data() || {};
      if(p.role === 'landlord'){
        return await writeLandlordUserProfile(ref,user,p);
      }
      if(p.role === 'caretaker' || p.role === 'contractor'){
        return await writeStaffUserProfile(ref,user,{
          role:p.role,
          name:p.name||user.displayName,
          phone:p.phone||'',
          landlordId:p.landlordId||null,
          landlordName:p.landlordName||'',
          staffId:p.staffId||null,
          assignedPropertyIds:p.assignedPropertyIds,
          vendorId:p.vendorId||null,
          vendorType:p.vendorType||p.staffType||''
        });
      }
      if(p.role === 'tenant' && (p.tenantDocId != null || p.tenantId != null)){
        return await writeTenantUserProfile(ref,user,{
          tenantDocId:p.tenantDocId||p.tenantId,
          tenantId:p.tenantId||p.tenantDocId,
          landlordId:p.landlordId||null,
          name:p.name||user.displayName
        });
      }
      // Self-service signup: pendingClaims may exist before any landlord/tenantDoc link.
      if(p.role === 'tenant' && (p.selfRegistered || String(p.status||'')==='unassigned' || tenantIntent)){
        const acct=await nestiqVerifyTenantAccount(user);
        const nm=p.name||acct?.name||user.displayName||'Tenant';
        await ref.set(stripUndefined({
          role:'tenant',
          status:'unassigned',
          selfRegistered:true,
          tenantDocId:user.uid,
          name:nm,
          email:user.email,
          phone:p.phone||acct?.phone||'',
          landlordId:null
        }),{ merge:true });
        return {
          role:'tenant',
          tenantDocId:user.uid,
          tenantId:null,
          name:nm,
          email:user.email,
          phone:p.phone||acct?.phone||'',
          landlordId:null,
          status:'unassigned',
          selfRegistered:true
        };
      }
    }

    // Existing tenantAccounts without users doc (or incomplete profile)
    if(tenantIntent){
      const acct=await nestiqVerifyTenantAccount(user);
      if(acct){
        const st=String(acct.status||'').toLowerCase();
        const nm=acct.name||user.displayName||'Tenant';
        await ref.set(stripUndefined({
          role:'tenant',
          status:st||'unassigned',
          selfRegistered:!!acct.selfRegistered || st==='unassigned',
          tenantDocId:acct.tenantId||user.uid,
          landlordId:acct.landlordId||null,
          name:nm,
          email:user.email,
          phone:acct.phone||''
        }),{ merge:true });
        return {
          role:'tenant',
          tenantDocId:String(acct.tenantId||user.uid),
          tenantId:null,
          name:nm,
          email:user.email,
          phone:acct.phone||'',
          landlordId:acct.landlordId||null,
          status:st||'unassigned',
          selfRegistered:true
        };
      }
    }

    // Staff account restore (caretaker/contractor) — same uid-linked pattern as tenantAccounts
    try{
      const staffAcc=await window.nestiqFs?.staffAccount?.(db, user.uid)?.get?.();
      if(staffAcc&&staffAcc.exists){
        const a=staffAcc.data()||{};
        const role=a.role==='caretaker'?'caretaker':(a.role==='contractor'?'contractor':null);
        if(role){
          const assignedPropertyIds=Array.isArray(a.assignedPropertyIds)?a.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[];
          await ref.set(stripUndefined({
            role,
            name:a.name||user.displayName||(role==='caretaker'?'Caretaker':'Contractor'),
            email:user.email,
            phone:a.phone||'',
            landlordId:a.landlordId||null,
            landlordName:a.landlordName||'',
            staffId:a.staffId||null,
            assignedPropertyIds,
            vendorId:a.linkedVendorId||a.vendorId||null,
            vendorType:a.staffType||a.vendorType||''
          }),{ merge:true });
          return {
            role,
            name:a.name||user.displayName||(role==='caretaker'?'Caretaker':'Contractor'),
            email:user.email,
            phone:a.phone||'',
            landlordId:a.landlordId||null,
            landlordName:a.landlordName||'',
            staffId:a.staffId||null,
            assignedPropertyIds,
            vendorId:a.linkedVendorId||a.vendorId||null,
            vendorType:a.staffType||a.vendorType||'',
            uid:user.uid
          };
        }
      }
    }catch(_e){}

    if(hasLandlordSignals && !tenantIntent){
      const pc=pcSnap.exists?(pcSnap.data()||{}):{};
      return await writeLandlordUserProfile(ref,user,pc);
    }

    const landlordEmail = String(window.NESTIQ_LANDLORD_EMAIL || '').toLowerCase();
    if(user.email && email === landlordEmail && !tenantIntent){
      return await writeLandlordUserProfile(ref,user,{ name:user.displayName||'Admin' });
    }

    if(signInIntent && !tenantIntent){
      return await writeLandlordUserProfile(ref,user,{ name:user.displayName||'Landlord' });
    }
    return null;
  }

  function stopTenantPortalListeners(){
    stopNestiqFirestoreListeners();
  }

  function nestiqBootstrapTenantFromLocalCache(){
    if(window.currentTenantData) return window.currentTenantData;
    if(window.nestiqUseFirestore) return null;
    const u=window.currentUser;
    let tid=u?.tenantDocId||null;
    try{
      const s=typeof getSession==='function'?getSession():null;
      if(!tid) tid=s?.tenantDocId||s?.userId||null;
    }catch(_e){}
    if(!tid||!Array.isArray(window.tenantsData)) return null;
    const hit=window.tenantsData.find(t=>t&&String(t.id)===String(tid));
    if(!hit) return null;
    window.currentTenantData={...hit,id:String(hit.id)};
    return window.currentTenantData;
  }
  window.nestiqBootstrapTenantFromLocalCache=nestiqBootstrapTenantFromLocalCache;

  async function nestiqLinkUserTenantDocId(uid, tenantDocId, patch){
    if(!db||!uid||!tenantDocId) return;
    const legacy=legacyNumericTenantId(tenantDocId);
    await db.collection('users').doc(uid).set(stripUndefined({
      role:'tenant',
      tenantDocId:String(tenantDocId),
      tenantId:legacy,
      name:patch?.name,
      email:patch?.email,
      landlordId:patch?.landlordId
    }),{ merge:true });
    try{
      const sess=JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
      if(sess&&sess.role==='tenant'){
        sess.tenantDocId=String(tenantDocId);
        sess.userId=String(tenantDocId);
        sessionStorage.setItem('nestiq-session',JSON.stringify(sess));
        window.__nestiqSession=sess;
      }
    }catch(_e){}
  }

  function nestiqHttpsPhotoUrl(v){
    const s=String(v==null?'':v).trim().replace(/[\u200B-\u200D\uFEFF]/g,'');
    return /^https?:\/\//i.test(s)?s:'';
  }

  function tenantPayloadSansPayments(t){
    const o = { ...t };
    delete o.payments;
    const photo=nestiqHttpsPhotoUrl(o.profilePhoto||o.photoUrl||o.photoURL);
    if(photo) o.profilePhoto=photo;
    else delete o.profilePhoto;
    return deepStripUndefined(stripUndefined(o));
  }

  function firestoreRestProjectId(){
    return String(window.NESTIQ_FIREBASE_CONFIG?.projectId||'nestiq-pro');
  }

  function toFirestoreRestValue(v){
    if(v===null) return { nullValue:null };
    if(typeof v==='boolean') return { booleanValue:v };
    if(typeof v==='number'){
      if(!Number.isFinite(v)) return { nullValue:null };
      return Number.isInteger(v)?{ integerValue:String(v) }:{ doubleValue:v };
    }
    if(typeof v==='string') return { stringValue:v };
    if(Array.isArray(v)){
      return { arrayValue:{ values:v.map(toFirestoreRestValue) } };
    }
    if(typeof v==='object'){
      // Skip Firestore FieldValue / Timestamp sentinels — they are not REST-serializable here.
      if(typeof v.toMillis==='function'||typeof v.isEqual==='function') return null;
      const ctor=v.constructor&&v.constructor.name;
      if(ctor&&/FieldValue|Timestamp|GeoPoint|DocumentReference|Bytes/.test(ctor)) return null;
      const fields={};
      Object.keys(v).forEach(k=>{
        if(v[k]===undefined) return;
        const mapped=toFirestoreRestValue(v[k]);
        if(mapped) fields[k]=mapped;
      });
      return { mapValue:{ fields } };
    }
    return { stringValue:String(v) };
  }

  function toFirestoreRestDocument(obj){
    const fields={};
    Object.keys(obj||{}).forEach(k=>{
      if(obj[k]===undefined) return;
      const mapped=toFirestoreRestValue(obj[k]);
      if(mapped) fields[k]=mapped;
    });
    return { fields };
  }

  async function nestiqFirestoreRestWriteTenant(landlordId, tenantId, payload){
    const user=auth&&auth.currentUser;
    if(!user) throw new Error('Not signed in');
    const token=await user.getIdToken(true);
    const projectId=firestoreRestProjectId();
    const path=`projects/${projectId}/databases/(default)/documents/landlords/${encodeURIComponent(landlordId)}/tenants/${encodeURIComponent(tenantId)}`;
    // updateMask is required: a PATCH without it replaces the whole tenant doc and
    // drops fields the payload omits (e.g. profilePhoto uploaded from the portal).
    const mask=Object.keys(payload||{}).filter(k=>payload[k]!==undefined);
    const qs=mask.map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
    const url=`https://firestore.googleapis.com/v1/${path}${qs?'?'+qs:''}`;
    const res=await fetch(url,{
      method:'PATCH',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(toFirestoreRestDocument(payload))
    });
    if(!res.ok){
      let detail='';
      try{ detail=await res.text(); }catch(_e){}
      throw new Error('REST tenant write failed ('+res.status+'): '+(detail||res.statusText).slice(0,240));
    }
    return true;
  }

  async function nestiqFirestoreRestGetTenant(landlordId, tenantId){
    const user=auth&&auth.currentUser;
    if(!user) throw new Error('Not signed in');
    const token=await user.getIdToken(true);
    const projectId=firestoreRestProjectId();
    const path=`projects/${projectId}/databases/(default)/documents/landlords/${encodeURIComponent(landlordId)}/tenants/${encodeURIComponent(tenantId)}`;
    const url=`https://firestore.googleapis.com/v1/${path}`;
    const res=await fetch(url,{
      method:'GET',
      headers:{ Authorization:'Bearer '+token }
    });
    if(res.status===404) return null;
    if(!res.ok){
      let detail='';
      try{ detail=await res.text(); }catch(_e){}
      throw new Error('REST tenant read failed ('+res.status+'): '+(detail||res.statusText).slice(0,240));
    }
    return await res.json();
  }

  /** Require a committed server read — never treat offline/cache as success. */
  async function assertTenantDocOnServer(docRef, label){
    let lastErr=null;
    for(let attempt=0; attempt<5; attempt++){
      try{
        if(typeof db.waitForPendingWrites==='function'){
          try{ await db.waitForPendingWrites(); }catch(_w){}
        }
        const snap=await docRef.get({ source:'server' });
        if(snap.exists) return snap;
        lastErr=new Error((label||'Tenant')+' missing on server');
      }catch(e){
        lastErr=e;
      }
      await new Promise(r=>setTimeout(r, 350*(attempt+1)));
    }
    const detail=lastErr?.code||lastErr?.message||'unknown';
    throw new Error((label||'Tenant write')+' did not confirm on the server ('+detail+'). Check your connection and Firebase permissions, then try again.');
  }

  function nestiqMinimalTenantCloudPayload(tenant, writeLid, tid){
    const deposit=tenant.deposit;
    let depositAmt=0;
    if(deposit&&typeof deposit==='object') depositAmt=Number(deposit.amount)||0;
    else depositAmt=Number(deposit)||0;
    const photo=nestiqHttpsPhotoUrl(tenant.profilePhoto||tenant.photoUrl||tenant.photoURL);
    return deepStripUndefined(stripUndefined({
      id:tid,
      name:String(tenant.name||''),
      email:String(tenant.email||tenant.portalEmail||'').toLowerCase(),
      phone:String(tenant.phone||''),
      property:String(tenant.property||''),
      propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
      unit:String(tenant.unit||'Unit'),
      unitId:tenant.unitId!=null&&tenant.unitId!==''?String(tenant.unitId):null,
      rent:Number(tenant.rent)||0,
      status:String(tenant.status||'due'),
      lease:String(tenant.lease||''),
      leaseStart:String(tenant.leaseStart||''),
      leaseEnd:String(tenant.leaseEnd||''),
      monthlyDueDate:Number(tenant.monthlyDueDate)||1,
      prorateFirstMonth:Boolean(tenant.prorateFirstMonth),
      leaseId:tenant.leaseId!=null&&tenant.leaseId!==''?String(tenant.leaseId):'',
      leaseStatus:tenant.leaseStatus!=null&&tenant.leaseStatus!==''?String(tenant.leaseStatus):'',
      unitNumber:String(tenant.unitNumber||tenant.unit||''),
      landlordId:String(writeLid),
      applicationId:tenant.applicationId!=null?String(tenant.applicationId):'',
      hasPortalAccess:Boolean(tenant.hasPortalAccess),
      firstLogin:Boolean(tenant.firstLogin),
      portalUid:tenant.portalUid||null,
      tenantUid:tenant.tenantUid||tenant.portalUid||null,
      portalEmail:String(tenant.portalEmail||tenant.email||'').toLowerCase(),
      depositAmount:depositAmt,
      depositCollected:!!(tenant.depositCollected===true || (deposit&&typeof deposit==='object'&&deposit.collected===true)),
      deposit:(deposit&&typeof deposit==='object')?{
        amount:depositAmt,
        collected:deposit.collected===true,
        collectedDate:String(deposit.collectedDate||''),
        collectedMethod:String(deposit.collectedMethod||''),
        status:String(deposit.status|| (deposit.collected?'held':'pending')),
        bankName:String(deposit.bankName||''),
        accountNumber:String(deposit.accountNumber||''),
        interestRate:Number(deposit.interestRate)||3.5,
        interestEarned:Number(deposit.interestEarned)||0,
        lastInterestCalculated:String(deposit.lastInterestCalculated||''),
        receiptIssued:deposit.receiptIssued===true,
        receiptDate:String(deposit.receiptDate||'')
      }:undefined,
      notes:String(tenant.notes||'').slice(0,500),
      profilePhoto:photo||undefined
    }));
  }

  async function nestiqPersistSingleTenantToFirestore(tenant){
    if(!db||!tenant) throw new Error('Missing tenant');
    const authLid=auth&&auth.currentUser?String(auth.currentUser.uid):'';
    if(!authLid) throw new Error('Not signed in as landlord — cannot save tenant');
    const writeLid=authLid;
    const tid=sid(tenant.id);
    if(!tid||tid==='undefined'||tid==='null'||tid==='NaN') throw new Error('Invalid tenant id');
    const payload=nestiqMinimalTenantCloudPayload(tenant, writeLid, tid);
    if(!window.__nestiqPendingTenantWrites) window.__nestiqPendingTenantWrites=new Set();
    window.__nestiqPendingTenantWrites.add(String(tid));
    try{
      // REST write first — bypasses SDK offline cache false-positives.
      await nestiqFirestoreRestWriteTenant(writeLid, tid, payload);
      const restDoc=await nestiqFirestoreRestGetTenant(writeLid, tid);
      if(!restDoc) throw new Error('Tenant save did not appear via REST read-back');
      // Keep SDK cache in sync for listeners.
      const tcol=landlordCol('tenants', writeLid);
      if(tcol){
        try{ await tcol.doc(tid).set(payload,{ merge:true }); }catch(_e){}
      }
      tenant.landlordId=writeLid;
      try{ window.nestiqEnsureTenantEmailPortalLink?.(tenant); }catch(_e){}
      return tid;
    }catch(e){
      try{ window.__nestiqPendingTenantWrites?.delete(String(tid)); }catch(_e){}
      throw e;
    }
  }
  window.nestiqPersistSingleTenantToFirestore=nestiqPersistSingleTenantToFirestore;

  /** Create tenant doc with Firestore auto-id, verified over REST. */
  async function nestiqCreateTenantDocInFirestore(tenant){
    if(!db||!tenant) throw new Error('Missing tenant');
    const writeLid=auth&&auth.currentUser?String(auth.currentUser.uid):'';
    if(!writeLid) throw new Error('Not signed in as landlord');
    const id=db.collection('_').doc().id;
    const payload=nestiqMinimalTenantCloudPayload(tenant, writeLid, id);
    if(!window.__nestiqPendingTenantWrites) window.__nestiqPendingTenantWrites=new Set();
    window.__nestiqPendingTenantWrites.add(String(id));
    try{
      await nestiqFirestoreRestWriteTenant(writeLid, id, payload);
      const restDoc=await nestiqFirestoreRestGetTenant(writeLid, id);
      if(!restDoc) throw new Error('Tenant create did not appear via REST read-back');
      const tcol=landlordCol('tenants', writeLid);
      if(tcol){
        try{ await tcol.doc(id).set(payload,{ merge:true }); }catch(_e){}
      }
      tenant.landlordId=writeLid;
      tenant.id=id;
      try{ window.nestiqEnsureTenantEmailPortalLink?.(tenant); }catch(_e){}
      return id;
    }catch(e){
      try{ window.__nestiqPendingTenantWrites?.delete(String(id)); }catch(_e){}
      throw e;
    }
  }
  window.nestiqCreateTenantDocInFirestore=nestiqCreateTenantDocInFirestore;

  async function nestiqReleaseTenantAccount(uid){
    if(!db||!uid) return false;
    const acct=window.nestiqFs?.tenantAccount(db, uid);
    if(!acct) return false;
    try{
      await acct.set(stripUndefined({
        status:'unassigned',
        propertyId:'',
        tenantId:String(uid)
      }),{ merge:true });
      return true;
    }catch(e){
      console.warn('NestIQ: release tenant account', e);
      return false;
    }
  }
  window.nestiqReleaseTenantAccount=nestiqReleaseTenantAccount;

  async function nestiqUpsertTenantAccount(authUser, lid, tid, propertyId, status){
    if(!db||!authUser) return false;
    const acct=window.nestiqFs?.tenantAccount(db, authUser.uid);
    if(!acct) return false;
    const st=status||(lid&&tid?'active':'unassigned');
    await acct.set(stripUndefined({
      landlordId:lid!=null&&String(lid)?String(lid):'',
      tenantId:tid!=null&&String(tid)?String(tid):String(authUser.uid),
      propertyId:propertyId!=null?String(propertyId):'',
      status:st
    }),{ merge:true });
    window.nestiqTenantSession={
      landlordId:lid!=null&&String(lid)?String(lid):'',
      tenantId:tid!=null&&String(tid)?String(tid):String(authUser.uid),
      propertyId:propertyId!=null?String(propertyId):'',
      status:st
    };
    return true;
  }

  async function nestiqVerifyTenantAccount(authUser){
    const acct=window.nestiqFs?.tenantAccount(db, authUser?.uid);
    if(!acct) return null;
    try{
      const snap=await acct.get();
      if(!snap.exists) return null;
      const d=snap.data()||{};
      const st=String(d.status||'').toLowerCase();
      const assigned=!!String(d.propertyId||'').trim() && st && st!=='unassigned';
      // Self-registered tenants may exist before any landlord assignment.
      if(!assigned && (st==='unassigned' || d.selfRegistered)){
        window.nestiqTenantSession={
          landlordId:d.landlordId!=null?String(d.landlordId):'',
          tenantId:d.tenantId!=null?String(d.tenantId):String(authUser.uid),
          propertyId:d.propertyId!=null?String(d.propertyId):'',
          status:st||'unassigned',
          name:d.name||'',
          email:d.email||authUser.email||'',
          phone:d.phone||''
        };
        return d;
      }
      if(!d.landlordId||!d.tenantId) return null;
      window.nestiqTenantSession={
        landlordId:String(d.landlordId),
        tenantId:String(d.tenantId),
        propertyId:d.propertyId!=null?String(d.propertyId):'',
        status:d.status||'active'
      };
      return d;
    }catch(_e){
      return null;
    }
  }

  async function nestiqEnsureTenantAccountFromProfile(authUser, cu){
    if(!db||!authUser||!cu) return null;
    const existing=await nestiqVerifyTenantAccount(authUser);
    if(existing) return existing;
    const lid=String(cu.landlordId||'').trim();
    const tid=String(cu.tenantDocId||'').trim();
    if(!lid||!tid) return null;
    try{
      const ok=await nestiqUpsertTenantAccount(authUser, lid, tid, cu.propertyId, 'active');
      return ok ? await nestiqVerifyTenantAccount(authUser) : null;
    }catch(e){
      console.warn('NestIQ: seed tenantAccounts from profile', e);
      return null;
    }
  }

  async function nestiqEnsureTenantPortalReady(cu, authUser){
    if(!db||!cu||cu.role!=='tenant'||!authUser) return null;
    let tid=String(cu.tenantDocId||'').trim();
    const email=String(authUser.email||'').toLowerCase();
    let lid=String(cu.landlordId||'').trim();

    try{
      const pc=await db.collection('pendingClaims').doc(authUser.uid).get();
      if(pc.exists){
        const p=pc.data()||{};
        if(!lid) lid=String(p.landlordId||'').trim();
        if(!tid) tid=String(p.tenantDocId||p.tenantId||'').trim();
        if(p.propertyId!=null && cu.propertyId==null) cu.propertyId=p.propertyId;
      }
    }catch(_e){}

    const acct=await nestiqEnsureTenantAccountFromProfile(authUser, cu);
    if(acct){
      lid=String(acct.landlordId||lid).trim();
      tid=String(acct.tenantId||tid).trim();
      cu.landlordId=lid||null;
      cu.tenantDocId=tid||cu.tenantDocId;
      if(acct.status) cu.status=acct.status;
    }

    // Self-registered / not yet assigned — do not invent a paid portal linkage.
    const unassigned=String(cu.status||acct?.status||'').toLowerCase()==='unassigned'
      || !!cu.selfRegistered
      || !!acct?.selfRegistered;
    if(unassigned && !lid){
      try{
        const claimed=await window.nestiqClaimTenantEmailPortalLink?.(authUser.uid, email);
        if(claimed && claimed.landlordId && claimed.tenantId){
          lid=String(claimed.landlordId);
          tid=String(claimed.tenantId);
          cu.landlordId=lid;
          cu.tenantDocId=tid;
          cu.status=claimed.status||'active';
          cu.selfRegistered=false;
        }
      }catch(e){
        console.warn('NestIQ: claim tenant by email', e);
      }
    }
    if(unassigned && !lid){
      window.nestiqTenantSession={
        landlordId:'',
        tenantId:tid||authUser.uid,
        propertyId:'',
        status:'unassigned',
        name:cu.name||acct?.name||'',
        email:email,
        phone:cu.phone||acct?.phone||''
      };
      return null;
    }

    const lidOrAny=(t)=>!lid||String(t.landlordId||'')===String(lid);

    const tryId=async(id, landlordId)=>{
      if(!id||!landlordId) return false;
      try{
        const snap=await landlordCol('tenants', landlordId).doc(String(id)).get();
        return snap.exists;
      }catch(e){
        if(String(e?.code||'').includes('permission')) return false;
        throw e;
      }
    };

    if(lid&&await tryId(tid, lid)){
      try{
        await landlordCol('tenants', lid).doc(tid).set({
          portalUid:authUser.uid,
          tenantUid:authUser.uid,
          portalEmail:email,
          hasPortalAccess:true
        },{ merge:true });
        const tSnap=await landlordCol('tenants', lid).doc(tid).get();
        const tData=tSnap.exists?(tSnap.data()||{}):{};
        const propId=tData.propertyId!=null?tData.propertyId:null;
        const tStatus=String(tData.status||'').toLowerCase();
        const acctStatus=(tStatus==='unassigned' || !propId)?'unassigned':'active';
        await nestiqUpsertTenantAccount(authUser, lid, tid, propId, acctStatus);
        if(acctStatus==='unassigned'){
          cu.status='unassigned';
          // Linked to a landlord stub but not yet approved — allow listings, not full portal.
          return null;
        }
      }catch(_e){}
      return (await nestiqVerifyTenantAccount(authUser)) ? tid : null;
    }

    const local=(window.tenantsData||[]).find(t=>{
      if(!t) return false;
      if(tid&&String(t.id)===tid) return true;
      return email&&String(t.email||'').toLowerCase()===email;
    });
    if(local&&lidOrAny(local)){
      try{
        await nestiqPersistSingleTenantToFirestore(local);
        tid=String(local.id);
        cu.tenantDocId=tid;
        if(!lid) lid=String(local.landlordId||'').trim();
        cu.landlordId=lid;
        await nestiqLinkUserTenantDocId(authUser.uid,tid,local);
        await nestiqUpsertTenantAccount(authUser, lid, tid, local.propertyId, 'active');
        return (await nestiqVerifyTenantAccount(authUser)) ? tid : null;
      }catch(e){
        console.warn('NestIQ: push local tenant to Firestore',e);
      }
    }

    if(tid){
      const stub={
        id:tid,
        name:cu.name||'Tenant',
        email,
        landlordId:cu.landlordId||null,
        property:'',
        propertyId:null,
        unit:'',
        rent:0,
        status:'due',
        monthlyDueDate:1,
        hasPortalAccess:true,
        portalUid:authUser.uid,
        portalEmail:email,
        firstLogin:true
      };
      try{
        if(lid){
          await landlordCol('tenants', lid).doc(tid).set(tenantPayloadSansPayments(stub),{ merge:true });
        }
        cu.tenantDocId=tid;
        await nestiqLinkUserTenantDocId(authUser.uid,tid,stub);
        await nestiqUpsertTenantAccount(authUser, lid, tid, stub.propertyId, 'active');
        return (await nestiqVerifyTenantAccount(authUser)) ? tid : null;
      }catch(e){
        console.warn('NestIQ: tenant self-provision',e);
      }
    }
    return null;
  }
  window.nestiqEnsureTenantPortalReady=nestiqEnsureTenantPortalReady;

  function startTenantListeners(){
    if(nestiqIsDemo()){
      nestiqMarkDemoDataReady();
      try{ window.nestiqShowTenantDashboardLoading?.(false); }catch(_e){}
      try{ window.renderTenantDashboard?.(); }catch(_e){}
      console.log('[NestIQ Demo] Skipping portal Firestore listeners');
      return;
    }
    const dbi = db;
    const u = window.currentUser;
    const ts=window.nestiqTenantSession||{};
    const lid=String(ts.landlordId||u?.landlordId||'').trim();
    const tid=String(ts.tenantId||u?.tenantDocId||'').trim();
    const tenantUid=auth?.currentUser?.uid||null;
    if(!dbi || !u || u.role !== 'tenant' || !tid || !lid){
      const unassigned=String(u?.status||window.nestiqTenantSession?.status||'').toLowerCase()==='unassigned'
        || !!u?.selfRegistered;
      if(unassigned){
        window.nestiqShowUnassignedApplicantPortal?.(
          'Your account is ready. Browse listings and apply — track status under My Applications. If a landlord approves you, sign in with this same account to review and sign your lease.'
        );
      }else{
        window.nestiqShowTenantDashboardError?.('Your account is not linked to a tenant profile yet. Apply from Browse listings, or wait until your landlord approves your application.');
      }
      return;
    }
    // Drop previous portal listeners before attaching new ones (logout / re-login).
    if(Array.isArray(window.__tenantUnsubs)){
      window.__tenantUnsubs.forEach(fn=>{ try{ fn(); }catch(_e){} });
    }
    if(window.__tenantPropUnsub){ try{ window.__tenantPropUnsub(); }catch(_e){} window.__tenantPropUnsub=null; }
    if(window.__tenantUnitUnsub){ try{ window.__tenantUnitUnsub(); }catch(_e){} window.__tenantUnitUnsub=null; }
    if(window.__tenantNoticesUnsub){ try{ window.__tenantNoticesUnsub(); }catch(_e){} window.__tenantNoticesUnsub=null; }

    window.nestiqShowTenantDashboardLoading?.(true);
    const unsubscribers = [];
    window.__tenantUnsubs = unsubscribers;
    window.currentTenantData = null;
    window.tenantPayments = [];
    window.__nestiqTenantPaymentsReady = false;
    window.tenantMaintenance = [];
    window.tenantUploadedDocuments = [];
    window.tenantNotices = [];
    window.tenantMessages = [];
    window.landlordInfo = null;
    window.tenantProperty = null;
    window.tenantCaretaker = null;

    const tcol=landlordCol('tenants', lid);
    const payCol=landlordCol('payments', lid);
    const maintCol=landlordCol('maintenance', lid);
    const docsCol=landlordCol('documents', lid);
    const noticesCol=landlordCol('notices', lid);
    const msgCol=landlordCol('messages', lid);
    const propsCol=landlordCol('properties', lid);
    const settingsRef=window.nestiqFs?.settingsRef(dbi, lid);

    function attachTenantCaretaker(caretakerId){
      if(window.__tenantCaretakerUnsub){
        try{ window.__tenantCaretakerUnsub(); }catch(_e){}
        window.__tenantCaretakerUnsub=null;
      }
      const sid=String(caretakerId||'').trim();
      const p=window.tenantProperty||{};
      const fallback=()=>{
        window.tenantCaretaker=sid?{
          id:sid,
          name:p.caretakerName||'Caretaker',
          uid:p.caretakerUid||null,
          email:p.caretakerEmail||'',
          phone:p.caretakerPhone||''
        }:null;
        window.renderMessagesCard?.();
      };
      if(!sid||!window.nestiqFs?.staff){
        fallback();
        return;
      }
      try{
        window.__tenantCaretakerUnsub=window.nestiqFs.staff(dbi, lid).doc(sid).onSnapshot(doc=>{
          if(doc.exists) window.tenantCaretaker={ id:doc.id, ...doc.data() };
          else fallback();
          window.renderMessagesCard?.();
        }, err=>{
          console.warn('NestIQ: tenant caretaker staff', err);
          fallback();
        });
      }catch(_e){
        fallback();
      }
    }

    function attachTenantNotices(propertyId){
      if(window.__tenantNoticesUnsub){
        try{ window.__tenantNoticesUnsub(); }catch(_e){}
        window.__tenantNoticesUnsub=null;
      }
      const pid=propertyId!=null?String(propertyId).trim():'';
      const applySnap=(snap)=>{
        window.tenantNotices = snap.docs.map(d => ({ id:d.id, ...d.data() }))
          .sort((a,b)=>String(b.createdAt?.seconds||b.date||'').localeCompare(String(a.createdAt?.seconds||a.date||'')));
        window.renderNoticesCard?.();
        window.updateNoticesBadge?.();
      };
      const onErr=(err)=>console.error('Notices error:', err);
      // Prefer property-scoped query (rules-safe). Fallback: notices aimed at this tenant.
      if(pid){
        window.__tenantNoticesUnsub=noticesCol.where('propertyId','==',pid).onSnapshot(applySnap, err=>{
          console.warn('NestIQ: notices by property failed, trying targetTenantId', err?.code||err?.message||err);
          window.__tenantNoticesUnsub=noticesCol.where('targetTenantId','==',tid).onSnapshot(applySnap, onErr);
        });
      }else{
        window.__tenantNoticesUnsub=noticesCol.where('targetTenantId','==',tid).onSnapshot(applySnap, onErr);
      }
    }

    function attachTenantOccupiedUnit(tenant){
      if(window.__tenantUnitUnsub){
        try{ window.__tenantUnitUnsub(); }catch(_e){}
        window.__tenantUnitUnsub=null;
      }
      const unitsCol=window.nestiqFs?.units?.(dbi, lid);
      if(!unitsCol||!tenant) return;
      const applyRows=rows=>{
        const next=Array.isArray(rows)?rows:[];
        const ids=new Set(next.map(r=>String(r.id)));
        const prev=Array.isArray(window.unitsData)?window.unitsData:[];
        window.unitsData=prev.filter(u=>!ids.has(String(u.id))).concat(next);
        try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
        try{ window.nestiqTenantRefreshVisibleSections?.(); }catch(_e){}
      };
      const uid=String(tenant.unitId||'').trim();
      if(uid){
        window.__tenantUnitUnsub=unitsCol.doc(uid).onSnapshot(doc=>{
          applyRows(doc.exists?[{ id:doc.id, ...doc.data() }]:[]);
        }, err=>console.warn('NestIQ: tenant unit', err));
        return;
      }
      window.__tenantUnitUnsub=unitsCol.where('tenantId','==',String(tenant.id)).onSnapshot(snap=>{
        applyRows((snap.docs||[]).map(d=>({ id:d.id, ...d.data() })));
      }, err=>console.warn('NestIQ: tenant unit query', err));
    }

    const unsubTenant = tcol.doc(tid).onSnapshot(doc => {
      if(!doc.exists){
        window.currentTenantData = null;
        try{
          if(window.nestiqTenantSession){
            window.nestiqTenantSession.status='unassigned';
            window.nestiqTenantSession.propertyId='';
            window.nestiqTenantSession.tenantId=String(tenantUid||tid);
          }
          if(window.currentUser) window.currentUser.status='unassigned';
        }catch(_e){}
        void (async()=>{
          try{
            if(tenantUid && typeof window.nestiqReleaseTenantAccount==='function'){
              await window.nestiqReleaseTenantAccount(tenantUid);
            }
          }catch(_e){}
        })();
        window.nestiqShowUnassignedApplicantPortal?.();
        return;
      }
      const raw={ id: doc.id, ...doc.data() };
      // Occupancy `status: paid` and any payments[] copied onto the tenant doc are not
      // proof of this month's rent. Portal status comes from the payments collection.
      delete raw.payments;
      if(window.__nestiqTenantPaymentsReady){
        raw.payments=(window.tenantPayments||[]).slice();
      }
      window.currentTenantData = raw;
      window.nestiqShowTenantDashboardLoading?.(false);
      window.renderTenantDashboard?.();
      window.renderGettingStartedTenant?.();
      window.renderNoticesCard?.();
      window.updateNoticesBadge?.();
      attachTenantNotices(window.currentTenantData?.propertyId||ts.propertyId);
      attachTenantOccupiedUnit(window.currentTenantData);
      const pid=window.currentTenantData?.propertyId;
      if(pid!=null&&String(pid).trim()!==''){
        if(window.__tenantPropUnsub){ try{ window.__tenantPropUnsub(); }catch(_e){} }
        window.__tenantPropUnsub=propsCol.doc(String(pid)).onSnapshot(pdoc=>{
          if(pdoc.exists){
            window.tenantProperty={ id:pdoc.id, ...pdoc.data() };
          }else{
            window.tenantProperty=null;
          }
          window.renderPropertyInfoCard?.();
          attachTenantCaretaker(window.tenantProperty?.caretakerId);
        }, err=>console.error('Property error:', err));
      }else{
        window.tenantProperty=null;
        window.tenantCaretaker=null;
        window.renderPropertyInfoCard?.();
        window.renderMessagesCard?.();
      }
    }, err => {
      console.error('Tenant doc error:', err);
      window.nestiqShowTenantDashboardError?.(
        'Could not load your tenant profile ('+(err?.code||err?.message||'error')+'). Log out, sign in again, and use the same email as on your landlord invitation. If it persists, ask your landlord to resend your portal invitation, or check Firebase Console → App Check (Firestore must not be Enforced without App Check in the app).'
      );
    });
    unsubscribers.push(unsubTenant);
    unsubscribers.push(()=>{
      if(window.__tenantNoticesUnsub){ try{ window.__tenantNoticesUnsub(); }catch(_e){} window.__tenantNoticesUnsub=null; }
    });
    unsubscribers.push(()=>{
      if(window.__tenantPropUnsub){ try{ window.__tenantPropUnsub(); }catch(_e){} window.__tenantPropUnsub=null; }
      if(window.__tenantUnitUnsub){ try{ window.__tenantUnitUnsub(); }catch(_e){} window.__tenantUnitUnsub=null; }
      if(window.__tenantCaretakerUnsub){ try{ window.__tenantCaretakerUnsub(); }catch(_e){} window.__tenantCaretakerUnsub=null; }
    });

    // Prefer Auth uid (portal) rows; also merge legacy tenantId-only rows when needed.
    const bindTenantScoped=(col, apply, label)=>{
      if(tenantUid){
        const u1=col.where('tenantUid','==',tenantUid).onSnapshot(snap=>{
          apply(snap.docs.map(d=>({ id:d.id, ...d.data() })));
        }, err=>{
          console.warn('NestIQ: '+label+' by tenantUid failed, trying tenantId', err?.code||err?.message||err);
          const u2=col.where('tenantId','==',tid).onSnapshot(snap=>{
            apply(snap.docs.map(d=>({ id:d.id, ...d.data() })));
          }, e=>console.error(label+' error:', e));
          unsubscribers.push(u2);
        });
        unsubscribers.push(u1);
      }else{
        const u2=col.where('tenantId','==',tid).onSnapshot(snap=>{
          apply(snap.docs.map(d=>({ id:d.id, ...d.data() })));
        }, e=>console.error(label+' error:', e));
        unsubscribers.push(u2);
      }
    };

    const payById=new Map();
    const ingestTenantPayments=rows=>{
      (rows||[]).forEach(x=>{
        const id=String(x.id||'');
        if(!id) return;
        payById.set(id,{ ...x, id });
      });
      window.tenantPayments=Array.from(payById.values()).sort((a,b)=>
        String(b.date||b.paidAt||'').localeCompare(String(a.date||a.paidAt||''))
      );
      window.__nestiqTenantPaymentsReady=true;
      if(window.currentTenantData){
        window.currentTenantData.payments=window.tenantPayments.slice();
      }
      window.renderRentStatusCard?.();
      window.renderPaymentHistoryCard?.();
      window.renderFinancesCard?.();
      window.renderDocumentsCard?.();
      window.renderTenantCalendar?.();
      window.renderTenantHomeStatusBanner?.();
      window.nestiqTenantRefreshVisibleSections?.();
    };
    unsubscribers.push(payCol.where('tenantId','==',tid).onSnapshot(snap=>{
      ingestTenantPayments((snap.docs||[]).map(d=>({ id:d.id, ...d.data() })));
    }, function(e){
      console.error('Tenant payments error:', e);
      window.__nestiqTenantPaymentsReady=true;
    }));
    if(tenantUid){
      unsubscribers.push(payCol.where('tenantUid','==',tenantUid).onSnapshot(snap=>{
        ingestTenantPayments((snap.docs||[]).map(d=>({ id:d.id, ...d.data() })));
      }, function(err){ console.warn('NestIQ: payments by tenantUid', err && (err.code||err.message)||err); }));
    }

    bindTenantScoped(maintCol, rows=>{
      window.tenantMaintenance = rows
        .sort((a,b)=>String(b.createdAt?.seconds||b.date||'').localeCompare(String(a.createdAt?.seconds||a.date||'')));
      window.renderMaintenanceCard?.();
      window.nestiqTenantRefreshVisibleSections?.();
    }, 'Tenant maintenance');

    if(docsCol){
      unsubscribers.push(docsCol.where('tenantId','==',tid).onSnapshot(snap=>{
        window.tenantUploadedDocuments = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        window.renderDocumentsCard?.();
      }, e=>console.error('Tenant documents error:', e)));
    }

    const leasesCol=window.nestiqFs?.leases?.(dbi, lid);
    if(leasesCol){
      const leaseById=new Map();
      const applyLeases=rows=>{
        if(typeof window.nestiqReplaceLeases==='function') window.nestiqReplaceLeases(rows);
        else window.leasesData=rows;
        try{ window.renderTenantLeaseCard?.(window.currentTenantData); }catch(_e){}
        try{ window.nestiqTenantRefreshVisibleSections?.(); }catch(_e){}
        try{ window.renderGettingStartedTenant?.(); }catch(_e){}
      };
      const ingestLeaseSnap=snap=>{
        (snap.docs||[]).forEach(d=>leaseById.set(d.id,{ id:d.id, ...d.data() }));
        applyLeases(Array.from(leaseById.values()));
      };
      unsubscribers.push(leasesCol.where('tenantId','==',tid).onSnapshot(ingestLeaseSnap, e=>console.error('Tenant leases error:', e)));
      if(tenantUid){
        unsubscribers.push(leasesCol.where('tenantUid','==',tenantUid).onSnapshot(ingestLeaseSnap, err=>{
          console.warn('NestIQ: Tenant leases by tenantUid', err?.code||err?.message||err);
        }));
      }
    }

    const msgById=new Map();
    const applyTenantMessages=()=>{
      window.tenantMessages=Array.from(msgById.values()).sort((a,b)=>
        String(a.createdAt?.seconds||a.date||'').localeCompare(String(b.createdAt?.seconds||b.date||''))
      );
      window.renderMessagesCard?.();
      if(typeof window.nestiqOnTenantMessagesUpdated==='function'){
        window.nestiqOnTenantMessagesUpdated();
      }else{
        window.nestiqUpdateTenantBadges?.();
      }
    };
    const ingestMsgSnap=snap=>{
      (snap.docs||[]).forEach(d=>msgById.set(d.id,{ id:d.id, ...d.data() }));
      applyTenantMessages();
    };
    if(msgCol){
      if(tenantUid){
        unsubscribers.push(msgCol.where('tenantUid','==',tenantUid).onSnapshot(ingestMsgSnap, err=>{
          console.warn('NestIQ: Tenant messages by tenantUid failed', err?.code||err?.message||err);
        }));
      }
      unsubscribers.push(msgCol.where('tenantId','==',tid).onSnapshot(ingestMsgSnap, e=>console.error('Tenant messages error:', e)));
      const tidNum=Number(tid);
      if(Number.isFinite(tidNum)&&String(tidNum)===String(tid)){
        unsubscribers.push(msgCol.where('tenantId','==',tidNum).onSnapshot(ingestMsgSnap, ()=>{}));
      }
    }

    if(settingsRef){
      const unsubSettings = settingsRef.onSnapshot(doc => {
        if(doc.exists){
          const sd=doc.data()||{};
          const ls=sd.landlordSettings&&typeof sd.landlordSettings==='object'?sd.landlordSettings:{};
          window.landlordInfo={
            ...sd,
            name:sd.name||ls.name||'Landlord',
            phone:sd.phone||ls.phone||'',
            logoBase64:sd.logoBase64||ls.logoBase64||'',
            profilePhoto:sd.profilePhoto||ls.profilePhoto||sd.logoUrl||ls.logoUrl||sd.logoBase64||ls.logoBase64||'',
            portal:ls.portal&&typeof ls.portal==='object'?ls.portal:{},
            bankName:ls.portal?.bankName||ls.bankName||sd.bankName||'',
            accountNumber:ls.portal?.accountNumber||ls.accountNumber||sd.accountNumber||'',
            branchCode:ls.portal?.branchCode||ls.branchCode||sd.branchCode||'',
            accountType:ls.portal?.accountType||ls.accountType||'Cheque'
          };
          window.renderPropertyInfoCard?.();
        }
      }, err => console.error('Landlord settings error:', err));
      unsubscribers.push(unsubSettings);
    }

    // Safety: if tenant doc never arrives, stop the infinite loading state.
    setTimeout(()=>{
      if(!window.currentTenantData){
        window.nestiqShowTenantDashboardLoading?.(false);
      }
    }, 12000);
  }

  function startCaretakerListeners(){
    const dbi=db;
    const u=window.currentUser;
    const lid=String(u?.landlordId||'').trim();
    const assigned=(Array.isArray(u?.assignedPropertyIds)?u.assignedPropertyIds:[]).map(x=>String(x)).filter(Boolean);
    if(!dbi || !u || u.role!=='caretaker' || !lid){
      window.nestiqShowTenantDashboardError?.('Your caretaker account is not linked to a landlord yet.');
      return;
    }
    if(Array.isArray(window.__caretakerUnsubs)){
      window.__caretakerUnsubs.forEach(fn=>{ try{ fn(); }catch(_e){} });
    }
    const unsubscribers=[];
    window.__caretakerUnsubs=unsubscribers;
    window.caretakerProperties=[];
    window.caretakerUnits=[];
    window.caretakerTenants=[];
    window.caretakerMaintenance=[];
    window.caretakerInspections=[];
    window.caretakerStaff=[];
    window.caretakerMessages=[];
    const assignedKey=assigned.slice().sort().join('|');
    try{
      const accRef=window.nestiqFs?.staffAccount?.(dbi, u.uid);
      if(accRef){
        unsubscribers.push(accRef.onSnapshot(doc=>{
          if(!doc.exists) return;
          const a=doc.data()||{};
          const next=Array.isArray(a.assignedPropertyIds)?a.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[];
          if(window.currentUser) window.currentUser.assignedPropertyIds=next;
          try{
            const s=window.__nestiqSession||{};
            if(s&&s.role==='caretaker'){
              s.assignedPropertyIds=next;
              window.__nestiqSession=s;
              sessionStorage.setItem('nestiq-session', JSON.stringify(s));
            }
          }catch(_e){}
          const nextKey=next.slice().sort().join('|');
          if(nextKey!==assignedKey){
            startCaretakerListeners();
            return;
          }
          window.renderCaretakerDashboard?.();
        }, err=>console.error('caretaker staffAccount', err)));
      }
    }catch(_e){}
    const propsCol=window.nestiqFs?.caretakerProperties?.(dbi,lid);
    const unitsCol=window.nestiqFs?.caretakerUnits?.(dbi,lid);
    const tenantsCol=window.nestiqFs?.caretakerTenants?.(dbi,lid);
    const maintCol=window.nestiqFs?.maintenance?.(dbi,lid);
    const inspCol=window.nestiqFs?.inspections?.(dbi,lid);
    const staffCol=window.nestiqFs?.staff?.(dbi,lid);
    const byId=(rows)=>rows.sort((a,b)=>String(a.name||a.propertyName||a.label||'').localeCompare(String(b.name||b.propertyName||b.label||''),undefined,{sensitivity:'base'}));
    const bindAssignedDocs=(col, targetKey)=>{
      if(!col) return;
      const map=new Map();
      const refresh=()=>{
        window[targetKey]=byId(Array.from(map.values()));
        window.renderCaretakerDashboard?.();
      };
      (assigned||[]).forEach(pid=>{
        try{
          unsubscribers.push(col.doc(String(pid)).onSnapshot(doc=>{
            if(doc.exists) map.set(String(pid), { id:doc.id, ...doc.data() });
            else map.delete(String(pid));
            refresh();
          }, err=>console.error(targetKey, err)));
        }catch(err){
          console.error(targetKey, err);
        }
      });
    };
    const bindPropertyScoped=(col, targetKey, sortKey)=>{
      if(!col) return;
      const map=new Map();
      const refresh=()=>{
        const rows=Array.from(map.values());
        window[targetKey]=sortKey
          ? rows.sort((a,b)=>String(b[sortKey]||b.createdAt?.seconds||'').localeCompare(String(a[sortKey]||a.createdAt?.seconds||'')))
          : byId(rows);
        window.renderCaretakerDashboard?.();
      };
      (assigned||[]).forEach(pid=>{
        try{
          unsubscribers.push(col.where('propertyId','==',String(pid)).onSnapshot(snap=>{
            const ids=new Set(snap.docs.map(d=>d.id));
            [...map.keys()].forEach(k=>{
              const row=map.get(k);
              if(row&&String(row.propertyId||'')===String(pid)&&!ids.has(k)) map.delete(k);
            });
            snap.docs.forEach(doc=>map.set(doc.id,{ id:doc.id, ...doc.data() }));
            refresh();
          }, err=>console.error(targetKey, err)));
        }catch(err){
          console.error(targetKey, err);
        }
      });
    };
    bindAssignedDocs(propsCol,'caretakerProperties');
    bindPropertyScoped(unitsCol,'caretakerUnits');
    bindPropertyScoped(tenantsCol,'caretakerTenants');
    if(staffCol){
      unsubscribers.push(staffCol.onSnapshot(snap=>{
        window.caretakerStaff=snap.docs.map(d=>({ id:d.id, ...d.data() })).filter(row=>String(row.role||'')==='contractor' && String(row.accountStatus||'')==='active');
        window.renderCaretakerDashboard?.();
      }, err=>console.error('caretaker staff', err)));
    }
    bindPropertyScoped(maintCol,'caretakerMaintenance','date');
    bindPropertyScoped(inspCol,'caretakerInspections','date');
    const msgCol=window.nestiqFs?.messages?.(dbi,lid);
    bindPropertyScoped(msgCol,'caretakerMessages','date');
    setTimeout(()=>window.renderCaretakerDashboard?.(),200);
  }

  function persistedPhotoUrlFromSources(rawFromMap, row){
    const r=rawFromMap!=null&&String(rawFromMap).trim()!==''?String(rawFromMap):'';
    if(r&&typeof window.nestiqPhotoUrlForFirestore==='function'){
      const ok=window.nestiqPhotoUrlForFirestore(r);
      if(ok) return ok;
    }else if(r&&(r.startsWith('http://')||r.startsWith('https://'))){
      return r;
    }
    const pUrl=row&&row.photoUrl!=null?String(row.photoUrl).trim():'';
    if(!pUrl) return null;
    if(typeof window.nestiqPhotoUrlForFirestore==='function') return window.nestiqPhotoUrlForFirestore(pUrl);
    return pUrl.startsWith('http')?pUrl:null;
  }

  async function flushToFirestore(){
    if(!db) return;
    const role = window.getSession?.()?.role;
    if(role !== 'landlord') return;
    const lid = currentLandlordUid();
    if(!lid) return;

    let batch = db.batch();
    let n = 0;
    const push = async () => {
      if(n >= 450){ await batch.commit(); batch = db.batch(); n = 0; }
    };

    window.propertiesData.forEach(p => {
      const pcol=landlordCol('properties', lid);
      if(!pcol) return;
      const fromMap=window.propertyPhotos&&window.propertyPhotos[sid(p.id)];
      const photoUrl=persistedPhotoUrlFromSources(fromMap,p);
      const payload=stripUndefined({ ...p, landlordId:p.landlordId || lid });
      if(photoUrl){
        payload.photoUrl=photoUrl;
      }else{
        delete payload.photoUrl;
      }
      batch.set(pcol.doc(sid(p.id)), payload, { merge:true });
      n++; push();
      const cprop=window.nestiqFs?.caretakerProperties?.(db, lid);
      if(cprop){
        batch.set(cprop.doc(sid(p.id)), stripUndefined({
          propertyId:sid(p.id),
          caretakerId:p.caretakerId!=null&&p.caretakerId!==''?String(p.caretakerId):null,
          name:p.name||'',
          addr:p.addr||'',
          status:p.status||'',
          type:p.type||'',
          bedrooms:Number(p.bedrooms||0)||0,
          bathrooms:Number(p.bathrooms||0)||0,
          parkingBays:Number(p.parkingBays||0)||0,
          floorSize:p.floorSize||null,
          photoUrl:photoUrl||null,
          autoApproveLimit:Number(p?.maintenanceSettings?.repairApprovalLimit??window.landlordSettings?.caretakerAutoApproveLimit??1000)||1000,
          caretakerCanManage:p?.maintenanceSettings?.caretakerCanManage!==false,
          maintenanceSettings:p?.maintenanceSettings||null,
          landlordId:lid
        }), { merge:true });
        n++; push();
      }
    });

    (window.unitsData || []).forEach(u => {
      if(!u || u.propertyId == null || u.propertyId === '' || u.id == null || u.id === '') return;
      const ucol=window.nestiqFs?.units?.(db, lid, u.propertyId);
      if(!ucol) return;
      const payload=typeof window.nestiqUnitCloudPayload==='function'
        ? window.nestiqUnitCloudPayload(u, u.propertyId, { landlordId:lid })
        : stripUndefined({
            landlordId:lid,
            propertyId:u.propertyId,
            label:u.label||u.unitNumber||'',
            unitNumber:u.unitNumber||u.label||'',
            status:u.status||'available',
            tenantId:u.tenantId!=null&&u.tenantId!==''?u.tenantId:null
          });
      batch.set(ucol.doc(sid(u.id)), payload, { merge:true });
      n++; push();
      const cuid=window.nestiqFs?.caretakerUnits?.(db, lid);
      if(cuid){
        batch.set(cuid.doc(sid(u.id)), stripUndefined({
          unitId:sid(u.id),
          propertyId:String(u.propertyId),
          label:u.label||u.unitNumber||'',
          unitNumber:u.unitNumber||u.label||'',
          bedrooms:Number(u.bedrooms||0)||0,
          bathrooms:Number(u.bathrooms||0)||0,
          status:u.status||'vacant',
          tenantId:u.tenantId!=null&&u.tenantId!==''?String(u.tenantId):null,
          tenantName:u.tenantName||null,
          notes:u.notes||'',
          landlordId:lid
        }),{ merge:true });
        n++; push();
      }
    });

    window.tenantsData.forEach(t => {
      batch.set(landlordCol('tenants', lid).doc(sid(t.id)), tenantPayloadSansPayments({ ...t, moveOutChecklist:t.moveOutChecklist || null, landlordId:t.landlordId || lid }), { merge:true });
      n++; push();
      const cten=window.nestiqFs?.caretakerTenants?.(db, lid);
      if(cten){
        batch.set(cten.doc(sid(t.id)), stripUndefined({
          tenantId:sid(t.id),
          propertyId:t.propertyId!=null&&t.propertyId!==''?String(t.propertyId):null,
          property:t.property||'',
          unit:t.unit||t.unitNumber||'',
          name:t.name||'',
          email:t.email||'',
          phone:t.phone||'',
          status:t.status||'',
          leaseStart:t.leaseStart||t.moveInDate||t.moveIn||null,
          moveInDate:t.moveInDate||t.leaseStart||t.moveIn||null,
          landlordId:lid,
          portalUid:t.portalUid||null
        }), { merge:true });
        n++; push();
      }
    });

    window.tenantsData.forEach(t => {
      (t.payments || []).forEach(p => {
        const pid = sid(p.id);
        batch.set(landlordCol('payments', lid).doc(pid), stripUndefined({
          ...p,
          id:Number(p.id),
          tenantId:sid(t.id),
          tenantUid:t.portalUid||null,
          landlordId:lid
        }), { merge:true });
        n++; push();
      });
    });

    window.expenses.forEach(e => {
      batch.set(landlordCol('expenses', lid).doc(sid(e.id)), stripUndefined({ ...e, landlordId:e.landlordId || lid }), { merge:true });
      n++; push();
    });

    (window.recurringExpenses || []).forEach(r => {
      batch.set(landlordCol('recurringExpenses', lid).doc(sid(r.id)), stripUndefined({ ...r, landlordId:r.landlordId || lid }), { merge:true });
      n++; push();
    });

    (window.communications || []).forEach(c => {
      batch.set(landlordCol('communications', lid).doc(sid(c.id)), stripUndefined({ ...c, landlordId:c.landlordId || lid }), { merge:true });
      n++; push();
    });

    (window.reconciliations || []).forEach(r => {
      batch.set(landlordCol('reconciliations', lid).doc(sid(r.id)), stripUndefined({ ...r, landlordId:r.landlordId || lid }), { merge:true });
      n++; push();
    });

    window.maintenanceData.forEach(m => {
      const fromMap=window.maintenancePhotos&&window.maintenancePhotos[sid(m.id)];
      const photoUrl=persistedPhotoUrlFromSources(fromMap,m);
      const payload=stripUndefined({ ...m, landlordId:m.landlordId || lid });
      if(m.vendorId!=null&&m.vendorId!=='') payload.vendorId=String(m.vendorId);
      if(photoUrl){
        payload.photoUrl=photoUrl;
      }else{
        delete payload.photoUrl;
      }
      batch.set(landlordCol('maintenance', lid).doc(sid(m.id)), payload, { merge:true });
      n++; push();
    });

    (window.inspections || []).forEach(insp => {
      const icol=window.nestiqFs?.inspections?.(db, lid);
      if(!icol) return;
      batch.set(icol.doc(sid(insp.id)), stripUndefined({ ...insp, landlordId:lid, propertyId:insp.propertyId!=null?String(insp.propertyId):null }), { merge:true });
      n++; push();
    });

    window.notices.forEach(nt => {
      batch.set(landlordCol('notices', lid).doc(sid(nt.id)), stripUndefined({ ...nt, landlordId:nt.landlordId || lid }), { merge:true });
      n++; push();
    });

    window.messages.forEach(m => {
      batch.set(landlordCol('messages', lid).doc(sid(m.id)), stripUndefined({ ...m, landlordId:m.landlordId || lid }), { merge:true });
      n++; push();
    });

    const sref = getSettingsDocRef();
    if(!sref){ if(n) await batch.commit(); return; }

    batch.set(sref, deepStripUndefined(stripUndefined({
      landlordEmail:window.landlordEmail,
      landlordName:window.landlordName,
      emailConfig:window.emailConfig,
      geminiApiKey:window.geminiApiKey,
      landlordSettings:window.landlordSettings,
      sentReminderMonths:window.sentReminderMonths||{},
      emailLog:window.emailLog||[],
      whatsappLog:window.whatsappLog||[],
      customEvents:window.customEvents||[],
      utilityReadings:window.utilityReadings||[],
      rentIncreases:window.rentIncreases||[],
      inspections:window.inspections||[],
      vacancyRecords:window.vacancyRecords||[],
      lateFees:window.lateFees||[],
      vendors:window.vendors||[],
      vendorNextId:window.vendorNextId||1,
      counters:{
        expNextId:window.expNextId,
        tenantNextId:window.tenantNextId,
        maintNextId:window.maintNextId,
        recurringExpenseNextId:window.recurringExpenseNextId||1,
        communicationNextId:window.communicationNextId||1,
        reconciliationNextId:window.reconciliationNextId||1
      },
      bellNotifs:window.bellNotifs||[],
      notificationLog:typeof window.exportNotificationLogForFirestore === 'function' ? window.exportNotificationLogForFirestore() : undefined,
      nestiqNotifLog:typeof window.exportNestiqNotifLogForFirestore === 'function' ? window.exportNestiqNotifLogForFirestore() : undefined,
      nestiqNotificationSettings:typeof window.exportNotifSettingsForFirestore === 'function' ? window.exportNotifSettingsForFirestore() : undefined,
      applications:window.applications || []
    })), { merge:true });
    n++; push();

    if(n) await batch.commit();
  }

  function nestiqScheduleSaveToFirestore(){
    if(nestiqIsDemo()) return;
    clearTimeout(__saveTimer);
    __saveTimer = setTimeout(() => {
      flushToFirestore().catch(e => console.error('Firestore save', e));
    }, 450);
  }

  async function ensureLandlordRootDoc(uid){
    if(!db||!uid) return;
    try{
      const fv=firebase.firestore.FieldValue;
      await db.collection('landlords').doc(uid).set({
        ownerUid:uid,
        updatedAt:fv.serverTimestamp()
      }, { merge:true });
    }catch(e){
      console.warn('NestIQ: landlord root doc', e?.code||e?.message||e);
    }
  }

  async function attachAfterProfile(profile){
    // Real auth must exit demo — otherwise listeners never attach and cloud
    // properties never hydrate (empty portfolio after "Continue with local data").
    try{ window.nestiqClearDemoMode?.(); }catch(_e){}
    stopNestiqFirestoreListeners();
    rebuildPaymentsDataFromTenants();
    if(profile.role === 'landlord'){
      window.__nestiqLandlordUid = auth.currentUser.uid;
      window.nestiqTenantSession = null;

      // Show skeletons immediately so Properties/Tenants never flash "empty".
      window.nestiqPropertiesLoading = true;
      window.nestiqTenantsLoading = true;
      window.nestiqExpensesLoading = true;
      window.nestiqMaintenanceLoading = true;
      window.nestiqVendorsLoading = true;
      try{ window.propertiesLoading = true; }catch(_e){}
      try{ window.tenantsLoading = true; }catch(_e){}
      try{ window.expensesLoading = true; }catch(_e){}
      try{ window.renderProperties?.(); }catch(_e){}
      try{ window.renderTenants?.(); }catch(_e){}
      try{ window.renderHomeStats?.(); }catch(_e){}

      // Minimal setup, then attach live data listeners BEFORE settings/billing awaits.
      try{ await ensureLandlordRootDoc(auth.currentUser.uid); }catch(_e){}
      attachLandlordListeners();
      try{ window.nestiqEnsureApplicationsFirestoreListener?.(); }catch(_e){}
      try{ window.nestiqUpdateApplicationsBadge?.(); }catch(_e){}

      // Settings / trial / PayFast sync — run after listeners so portfolio paints first.
      (async ()=>{
        try{
          const sref = getSettingsDocRef();
          if(sref){
            try{
              const ss = await Promise.race([
                sref.get(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('settings read timeout')), 8000))
              ]);
              if(ss.exists) mergeSettingsPayload(ss.data());
              window.landlordSettings = window.landlordSettings || {};
            }catch(_e){
              console.warn('NestIQ: landlord settings read failed', _e?.message || _e);
            }
          }
          if(typeof window.nestiqCheckTrialStatus === 'function'){
            try{ await window.nestiqCheckTrialStatus(); }catch(_e){}
          }
          if(typeof window.nestiqSyncSubscriptionAfterLogin === 'function'){
            try{ await window.nestiqSyncSubscriptionAfterLogin(); }catch(_e){}
          }
          if(typeof window.nestiqInitSupportWidget === 'function'){
            try{ window.nestiqInitSupportWidget(); }catch(_e){}
          }
          if(typeof window.nestiqUpdateLandlordLastActive === 'function'){
            try{ window.nestiqUpdateLandlordLastActive(); }catch(_e){}
          }
        }catch(bgErr){
          console.warn('NestIQ: landlord background setup', bgErr);
        }
      })();
    }else if(profile.role === 'contractor'){
      window.__nestiqLandlordUid = null;
      window.currentUser = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        role: 'contractor',
        landlordId: profile.landlordId || null,
        landlordName: profile.landlordName || '',
        name: profile.name || 'Contractor',
        phone: profile.phone || '',
        vendorId: profile.vendorId || null,
        vendorType: profile.vendorType || ''
      };
    }else if(profile.role === 'caretaker'){
      window.__nestiqLandlordUid = null;
      window.currentUser = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        role: 'caretaker',
        landlordId: profile.landlordId || null,
        landlordName: profile.landlordName || '',
        name: profile.name || 'Caretaker',
        phone: profile.phone || '',
        staffId: profile.staffId || null,
        assignedPropertyIds: Array.isArray(profile.assignedPropertyIds)?profile.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[]
      };
      startCaretakerListeners();
    }else{
      window.__nestiqLandlordUid = null;
      window.currentUser = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        role: 'tenant',
        tenantDocId: profile.tenantDocId || (profile.tenantId != null ? String(profile.tenantId) : null),
        landlordId: profile.landlordId || null,
        name: profile.name || 'Tenant',
        phone: profile.phone || '',
        status: profile.status || null,
        selfRegistered: !!profile.selfRegistered
      };
      window.currentTenantData = null;
      try{
        const unassigned=String(profile.status||'').toLowerCase()==='unassigned'
          || !!profile.selfRegistered
          || String(window.nestiqTenantSession?.status||'').toLowerCase()==='unassigned';
        const linked=await nestiqEnsureTenantPortalReady(window.currentUser, auth.currentUser);
        if(linked && window.nestiqTenantSession){
          window.currentUser.landlordId = window.nestiqTenantSession.landlordId;
          window.currentUser.tenantDocId = window.nestiqTenantSession.tenantId;
          if(window.nestiqTenantSession.status) window.currentUser.status=window.nestiqTenantSession.status;
        }
        const stillUnassigned=String(window.currentUser.status||window.nestiqTenantSession?.status||'').toLowerCase()==='unassigned'
          || (!window.currentUser.landlordId && (unassigned || !!profile.selfRegistered));
        if(stillUnassigned && !linked){
          // Self-registered / not yet assigned — browse listings; no portal listeners yet.
          window.nestiqTenantSession=window.nestiqTenantSession||{
            landlordId:'',
            tenantId:String(window.currentUser.tenantDocId||auth.currentUser.uid),
            propertyId:'',
            status:'unassigned'
          };
          window.nestiqShowUnassignedApplicantPortal?.();
        }else if(!linked){
          window.nestiqShowTenantDashboardError?.(
            'We could not find your tenant record. Apply from Browse listings, or wait until your landlord approves your application — then sign in with the same email.'
          );
        }else{
          startTenantListeners();
        }
      }catch(ensureErr){
        console.error('NestIQ: tenant portal ensure', ensureErr);
        const unassigned=String(profile.status||'').toLowerCase()==='unassigned'||!!profile.selfRegistered;
        if(unassigned){
          window.nestiqTenantSession=window.nestiqTenantSession||{
            landlordId:'',
            tenantId:String(profile.tenantDocId||auth.currentUser.uid),
            propertyId:'',
            status:'unassigned'
          };
          window.nestiqShowUnassignedApplicantPortal?.();
        }else{
          window.nestiqShowTenantDashboardError?.(
            'Could not link your account to a tenant record ('+(ensureErr?.code||ensureErr?.message||'permissions')+'). Deploy the latest Firestore rules, then log out and try again.'
          );
        }
      }
    }
    try{
      window.normalizeDataModel?.();
      if(profile.role==='landlord') window.checkRecurringExpenses?.();
    }catch(normErr){
      console.error('NestIQ: normalizeDataModel', normErr);
    }
  }

  window.nestiqFirebaseInit = function(){
    if(!window.firebase || !window.NESTIQ_FIREBASE_CONFIG || window.NESTIQ_FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY'){
      console.warn('NestIQ: Firebase not configured (js/firebase-config.js). Using offline localStorage fallback.');
      window.nestiqUseFirestore = false;
      return false;
    }
    if(window.__nestiqFirebaseInited){
      return true;
    }
    if(!firebase.apps.length) firebase.initializeApp(window.NESTIQ_FIREBASE_CONFIG);
    try{
      // Persist across PayFast offsite redirects (same browser, same origin).
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    }catch(_p){}
    db = firebase.firestore();
    try{
      db.settings({ experimentalAutoDetectLongPolling: true });
    }catch(_s){}
    auth = firebase.auth();
    storage = firebase.storage();
    window.nestiqDb = db;
    window.nestiqAuth = auth;
    window.nestiqStorage = storage;
    window.nestiqUseFirestore = true;
    window.__nestiqFirebaseInited = true;
    return true;
  };

  window.createTenantAuthAccount = createTenantAuthAccount;

  window.uploadNestiqFile = async function(path, dataUrl, contentType){
    if(!storage) throw new Error('Storage not ready');
    const ref = storage.ref().child(path);
    const blob = await (await fetch(dataUrl)).blob();
    await ref.put(blob, { contentType: contentType || blob.type || 'image/jpeg' });
    return ref.getDownloadURL();
  };

  window.nestiqRegisterAuthRouterInit = function(cb){
    __routerCb = cb;
    window.nestiqStartBootSafeguard?.(12000);
    if(!window.nestiqFirebaseInit()){
      if(typeof window.loadDataFromLocalStorage === 'function') window.loadDataFromLocalStorage();
      cb(null);
      return;
    }
    firebase.auth().onAuthStateChanged(async user => {
      const handlerGen = ++__authHandlerGen;
      window.nestiqAuthBootDone = true;
      if(!user){
        // Intentional logout: clear immediately (skip persisted-auth grace).
        if(window.__nestiqLoggingOut || window.__nestiqLogoutUiDone){
          window.__nestiqLoggingOut=false;
          window.__nestiqLogoutUiDone=false;
          window.__nestiqSession = null;
          nestiqClearSignInIntent();
          stopNestiqFirestoreListeners();
          try{ sessionStorage.removeItem('nestiq-session'); }catch(_e){}
          window.nestiqClearRedirectLoop?.();
          try{ window.syncNavUserUi?.(); }catch(_e){}
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          // logoutSession already painted the signed-out screen — don't flash landing again.
          window.__nestiqLogoutDest='';
          return;
        }
        // On refresh Firebase can briefly report null before restoring persisted auth.
        const cachedSess=(()=>{
          try{
            const s=window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
            return s && s.role ? s : null;
          }catch(_e){ return null; }
        })();
        if(!window.__nestiqAuthNullGraceDone){
          window.__nestiqAuthNullGraceDone = true;
          const waitMs=cachedSess?2500:800;
          await new Promise(r => setTimeout(r, waitMs));
          if(handlerGen !== __authHandlerGen) return;
          if(firebase.auth().currentUser) return;
        }
        // A stored session means the chooser must not flash while Auth is still restoring.
        if(cachedSess && firebase.auth().currentUser) return;
        // Staff/tenant portals already painted from sessionStorage — do not flash the
        // marketing landing while persisted Auth is still restoring.
        if(cachedSess && (cachedSess.role==='contractor'||cachedSess.role==='caretaker'||cachedSess.role==='tenant')){
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }
        window.__nestiqSession = null;
        nestiqClearSignInIntent();
        stopNestiqFirestoreListeners();
        try{ sessionStorage.removeItem('nestiq-session'); }catch(_e){}
        window.nestiqClearRedirectLoop?.();
        // PayFast return: show payment confirmation, not a cold login landing.
        if(typeof window.nestiqIsPaymentReturnUrl === 'function' && window.nestiqIsPaymentReturnUrl()){
          try{ window.nestiqShowPaymentReturnGate?.(new URLSearchParams(location.search).get('payment') === 'cancelled' ? 'cancelled' : 'success'); }
          catch(_e){ if(typeof window.showLandingPage === 'function') window.showLandingPage(); }
          window.nestiqHandleAuthEntryFlow?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }
        if(typeof window.showLandingPage === 'function') window.showLandingPage();
        else window.showLoginScreen?.();
        window.syncNavUserUi?.();
        window.nestiqHandleAuthEntryFlow?.();
        try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
        return;
      }
      try{
        try{
          await Promise.race([
            user.getIdToken(false),
            new Promise((_, rej) => setTimeout(() => rej(new Error('token timeout')), 8000))
          ]);
        }catch(_tok){}
        try{
          const cachedRole=(()=>{
            try{ return String((window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null')||{}).role||''); }
            catch(_e){ return ''; }
          })();
          if(cachedRole!=='contractor' && cachedRole!=='caretaker'){
            await Promise.race([
              user.reload(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('reload timeout')), 4000))
            ]);
          }
        }catch(_e){}
        const profile = await resolveUserProfile(user);
        if(!profile){
          if(window.__nestiqStaffInviteLinking){
            try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
            return;
          }
          await firebase.auth().signOut();
          if(typeof window.showLandingPage === 'function') window.showLandingPage('Profile not linked yet. Apply from Browse listings, then sign in with the same account.');
          else window.showLoginScreen?.('Profile not linked.');
          window.nestiqHandleAuthEntryFlow?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }
        window.__nestiqSession = {
          role:profile.role,
          userId: profile.role === 'tenant' ? (profile.tenantDocId || user.uid || null) : (profile.role === 'contractor' || profile.role === 'caretaker') ? user.uid : profile.tenantId,
          tenantDocId: profile.role === 'tenant' ? (profile.tenantDocId || user.uid || null) : null,
          landlordId: profile.landlordId || null,
          landlordName: profile.landlordName || '',
          staffId: profile.staffId || null,
          assignedPropertyIds: Array.isArray(profile.assignedPropertyIds)?profile.assignedPropertyIds.map(x=>String(x)).filter(Boolean):[],
          vendorId: profile.vendorId || null,
          vendorType: profile.vendorType || '',
          name:profile.name,
          email:user.email,
          phone:profile.phone||'',
          uid:user.uid,
          profilePhoto: profile.profilePhoto || profile.photoURL || '',
          status: profile.status || null,
          selfRegistered: !!profile.selfRegistered,
          loggedInAt:new Date().toISOString()
        };
        try{ sessionStorage.setItem('nestiq-session', JSON.stringify(window.__nestiqSession)); }catch(_e){}
        if(profile.role!=='tenant'){
          try{ window.nestiqClearPortalSessionState?.(); }catch(_e){}
        }

        const needLandlordVerify = window.NESTIQ_REQUIRE_LANDLORD_EMAIL_VERIFICATION !== false;
        if(profile.role === 'landlord' && needLandlordVerify && !user.emailVerified){
          window.syncNavUserUi?.();
          window.showEmailVerificationScreen?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }

        const landlordSignInAttempt=nestiqIsLandlordSignInIntent();

        if(landlordSignInAttempt&&profile.role==='tenant'&&!window.__nestiqHoldAuthEntry){
          window.syncNavUserUi?.();
          window.nestiqShowLandlordRoleConflictModal?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }

        // Mount dashboard immediately; Firestore listeners + onboarding run after.
        window.syncNavUserUi?.();
        if(profile.role==='landlord'&&typeof window.nestiqIsLandlordSignInIntent==='function'&&window.nestiqIsLandlordSignInIntent()){
          try{
            const onListings=(location.hash||'').replace('#','').trim()==='listings';
            if(onListings) history.replaceState(null,'',location.pathname+location.search+'#home');
          }catch(_e){}
        }
        // Prefer #home for landlords so hashchange + bootstrap don't fight over auth hashes,
        // and never land on leftover #tenant-dashboard from a prior tenant session.
        // Explicit Sign In from the marketing landing must not skip the account chooser.
        if(profile.role==='landlord' && !window.__nestiqHoldAuthEntry){
          try{
            const h=(location.hash||'').replace('#','').trim().toLowerCase();
            if(!h || h==='auth-signin' || h==='auth-signup' || h==='signin' || h==='signup' || h==='login' || h==='tenant-dashboard'){
              history.replaceState(null,'',location.pathname+location.search+'#home');
            }
          }catch(_e){}
        }
        if(window.__nestiqHoldAuthEntry){
          window.nestiqHandleAuthEntryFlow?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          await attachAfterProfile(profile);
          return;
        }
        // Tenants must always land on the portal — never the landlord marketing Home.
        // Unassigned / self-registered tenants browse listings until approved.
        if(profile.role==='tenant'){
          try{
            const h=(location.hash||'').replace('#','').trim().toLowerCase();
            if(h!=='listings'&&h!=='map'&&h!=='settings'&&h!=='tenant-dashboard'){
              history.replaceState(null,'',location.pathname+location.search+'#tenant-dashboard');
            }
            window.__nestiqHoldAuthEntry=false;
            try{ sessionStorage.removeItem('nestiq-auth-flow'); }catch(_e2){}
          }catch(_e){}
        }
        if(profile.role==='contractor'){
          try{
            history.replaceState(null,'',location.pathname+location.search+'#contractor-dashboard');
          }catch(_e){}
        }
        if(profile.role==='caretaker'){
          try{
            history.replaceState(null,'',location.pathname+location.search+'#caretaker-dashboard');
          }catch(_e){}
        }
        setTimeout(() => { if(__routerCb) __routerCb(profile); }, 0);

        await attachAfterProfile(profile);
        if(handlerGen !== __authHandlerGen) return;
        if(profile.role==='tenant'){
          try{ await window.nestiqFavMergeOnTenantLogin?.(); }catch(_e){}
          try{
            if(document.getElementById('page-listings')?.classList.contains('active')){
              window.nestiqRenderListingsPage?.();
            }
          }catch(_e){}
        }

        if(profile.role === 'landlord'){
          nestiqClearSignInIntent();
          let ob = window.__nestiqOnboardingComplete === true;
          let onboardingPaused = false;
          try{
            if(typeof window.nestiqResolveOnboardingState === 'function'){
              const obState = await window.nestiqResolveOnboardingState(db, auth.currentUser.uid);
              ob = obState.complete;
              onboardingPaused = obState.paused;
              if(obState.settings.exists && obState.settings.data){
                mergeSettingsPayload(obState.settings.data);
              }
              if(ob && obState.settings.ref && obState.settings.data.onboardingComplete !== true){
                try{
                  await obState.settings.ref.set({ onboardingComplete: true }, { merge: true });
                  window.__nestiqOnboardingComplete = true;
                }catch(_e){}
              }
            }else{
              const sref = getSettingsDocRef();
              if(sref){
                const ss = await sref.get();
                const sd = ss.exists ? ss.data() : {};
                ob = sd.onboardingComplete === true;
                onboardingPaused = sd.onboardingPaused === true;
              }
            }
          }catch(_e){}
          if(ob){
            window.nestiqClearRedirectLoop?.();
          }else if(!onboardingPaused){
            window.syncNavUserUi?.();
            const onOnboarding = /onboarding\.html/i.test(String(window.location.pathname || ''));
            if(!onOnboarding){
              const nextCnt = typeof window.nestiqBumpRedirectLoop === 'function'
                ? window.nestiqBumpRedirectLoop()
                : 1;
              if(nextCnt >= 4){
                const uid = auth.currentUser.uid;
                const forced = typeof window.nestiqForceOnboardingComplete === 'function'
                  ? await window.nestiqForceOnboardingComplete(db, uid)
                  : false;
                if(forced){
                  ob = true;
                }else{
                  window.nestiqShowOnboardingLoopRecovery?.(db, uid, () => {
                    window.syncNavUserUi?.();
                    setTimeout(() => { if(__routerCb) __routerCb(profile); }, 0);
                  });
                  try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
                  return;
                }
              }else{
                if(typeof window.nestiqGoToOnboarding === 'function') window.nestiqGoToOnboarding();
                else window.location.replace('onboarding.html');
                return;
              }
            }
          }
          if(ob){
            window.nestiqClearRedirectLoop?.();
          }
        }

        // Tenant portal welcome is handled via `firstTenantLogin` on the tenant doc.

        if(profile.role==='tenant'&&nestiqGetSignInIntent()==='tenant'){
          nestiqClearSignInIntent();
        }

        if(profile.role==='tenant'){
          try{
            const h=(location.hash||'').replace('#','').trim().toLowerCase();
            if(h!=='listings'&&h!=='map'&&h!=='settings'){
              location.hash='#tenant-dashboard';
            }
          }catch(_h){}
        }
      }catch(err){
        console.error('NestIQ auth bootstrap', err);
        const detail = (err && err.message) ? err.message : String(err);
        const isPerm=String(err?.code||detail).toLowerCase().includes('permission');
        window.nestiqShowNotif?.(
          isPerm
            ? 'Firebase permissions blocked sign-in. Deploy firestore.rules from NestIQ, then log in again.'
            : ('Firebase sync failed: ' + detail),
          'error'
        );
        if(isPerm && window.__nestiqSession?.role==='tenant'&&!nestiqIsLandlordSignInIntent()){
          try{
            window.syncNavUserUi?.();
            location.hash='#tenant-dashboard';
            if(typeof mountPage==='function'){
              mountPage('tenant-dashboard')
                .catch(()=>{})
                .finally(()=>{ try{ window.nestiqHideBootOverlay?.(); }catch(_e){} });
            }else{
              try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
            }
          }catch(_e){
            try{ window.nestiqHideBootOverlay?.(); }catch(_e2){}
          }
          return;
        }
        try{
          window.__nestiqSession = null;
          sessionStorage.removeItem('nestiq-session');
        }catch(_e){}
        try{ window.nestiqHideBootOverlay?.(); }catch(_e2){}
        if(typeof window.showLandingPage === 'function'){
          window.showLandingPage(isPerm
            ? 'Firebase permissions blocked sign-in. Deploy firestore.rules, then try again.'
            : ('Sign-in failed: ' + detail));
          window.nestiqHandleAuthEntryFlow?.();
        }
        firebase.auth().signOut().catch(()=>{});
      }
    });
  };

  function nestiqPropertyHasListableVacancy(p){
    if(!p || typeof p!=='object') return false;
    const openFn=typeof window.nestiqUnitIsOpenForApplication==='function'
      ? window.nestiqUnitIsOpenForApplication
      : (u)=>{
          if(!u||(u.tenantId!=null&&String(u.tenantId).trim()!=='')) return false;
          const us=String(u.status||'').toLowerCase();
          return us===''||us==='available'||us==='vacant';
        };
    try{
      const units=typeof window.nestiqUnitsForProperty==='function'?window.nestiqUnitsForProperty(p.id):[];
      if((units||[]).length) return units.some(openFn);
    }catch(_e){}
    if(Array.isArray(p.availableUnits)){
      return p.availableUnits.some(u=>openFn({ ...u, status:u?.status||'vacant', tenantId:u?.tenantId||null }));
    }
    const st=String(p.status||'').trim().toLowerCase();
    return st===''||st==='vacant'||st==='available';
  }

  function nestiqIsPubliclyListedProperty(p){
    if(!p || typeof p!=='object') return false;
    if(p.archived===true||p.deactivated===true||p.publishStatus==='archived') return false;
    if(p.publishStatus==='draft') return false;
    if(p.publishStatus==='published'){
      return p.publicListing !== false && p.publicListing !== 'false' && p.publicListing !== 0;
    }
    // Legacy properties without publishStatus
    return p.publicListing !== false && p.publicListing !== 'false' && p.publicListing !== 0;
  }

  const __nestiqListingHealInflight=new Set();
  async function nestiqHealDraftListingIfReady(propertyId){
    const pid=String(propertyId||'').trim();
    if(!pid || __nestiqListingHealInflight.has(pid)) return false;
    if(window.__nestiqPendingUnitConfig && String(window.__nestiqPendingUnitConfig.propertyId)===pid) return false;
    const p=(Array.isArray(window.propertiesData)?window.propertiesData:[]).find(x=>String(x.id)===pid);
    if(!p) return false;
    if(p.archived===true||p.deactivated===true||p.publishStatus==='archived') return false;
    if(p.publicListing===true && (p.publishStatus==='published' || !p.publishStatus)) return false;
    const units=typeof window.nestiqUnitsForProperty==='function'?window.nestiqUnitsForProperty(pid):[];
    const ready=(units||[]).some(u=>{
      const st=String(u?.status||'').toLowerCase();
      const open=st==='available'||st==='vacant'||st==='';
      return open && (u.tenantId==null||u.tenantId==='') && Number(u.rent)>0;
    });
    if(!ready) return false;
    __nestiqListingHealInflight.add(pid);
    try{
      p.publishStatus='published';
      p.publicListing=true;
      p.archived=false;
      p.deactivated=false;
      if(!p.status || String(p.status).toLowerCase()==='draft') p.status='vacant';
      try{ window.nestiqApplyListingStatsFromUnits?.(p); }catch(_e){}
      const lid=String(p.landlordId||currentLandlordUid()||'').trim();
      if(lid && db && window.nestiqFs?.properties){
        const patch={
          publishStatus:'published',
          publicListing:true,
          archived:false,
          deactivated:false,
          status:'vacant',
          rent:p.rent||p.rentMin||null,
          rentMin:p.rentMin||null,
          rentMax:p.rentMax||null,
          bedrooms:Number(p.bedrooms)||0,
          bathrooms:Number(p.bathrooms)||0
        };
        if(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp){
          patch.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
        }
        await window.nestiqFs.properties(db, lid).doc(pid).set(patch, { merge:true });
      }
      await nestiqSyncPublicListingMirror(p);
      return true;
    }catch(err){
      console.warn('NestIQ: listing heal failed', pid, err);
      return false;
    }finally{
      __nestiqListingHealInflight.delete(pid);
    }
  }

  function nestiqResolvePropertyPhotoForMirror(property){
    const id=String(property?.id??'');
    const fromProp=property?.photoUrl||property?.photoURL||'';
    const fromMap=window.propertyPhotos?.[id]||window.propertyPhotos?.[Number(id)]||'';
    const raw=String(fromProp||fromMap||'').trim();
    // Public feed must stay small — only persist cloud URLs, never data: URLs.
    if(raw.startsWith('http://')||raw.startsWith('https://')) return raw;
    return '';
  }

  function nestiqPropertyForPublicListingSync(property){
    if(!property || typeof property!=='object') return property;
    const id=String(property.id??'').trim();
    const photoUrl=nestiqResolvePropertyPhotoForMirror(property);
    const lid=String(property.landlordId||currentLandlordUid()||'').trim();
    return stripUndefined({
      ...property,
      id,
      landlordId:lid||property.landlordId,
      photoUrl:photoUrl||undefined
    });
  }

  function nestiqPublicListingMirrorPayload(property, landlordId){
    const lid=String(landlordId||property.landlordId||'').trim();
    const photo=nestiqResolvePropertyPhotoForMirror(property);
    try{ window.nestiqApplyListingStatsFromUnits?.(property); }catch(_e){}
    // Only URL amenity images — base64 galleries blow past Firestore's 1MB doc limit and break public sync.
    const amenityPhotos=Array.isArray(property.amenityPhotos)
      ? nestiqNormalizeAmenityPhotosForMirror(property.amenityPhotos)
      : [];
    const amenities=Array.isArray(property.amenities)?property.amenities.slice(0,24):[];
    const loc=typeof window.nestiqPublicLocationForListing==='function'
      ? window.nestiqPublicLocationForListing(property)
      : { displayAddr:String(property.addr||''), city:String(property.city||''), lat:property.lat, lng:property.lng, exact:true };
    const range=typeof window.nestiqPropertyRentRange==='function'
      ? window.nestiqPropertyRentRange(property)
      : { min:Number(property.rent)||0, max:Number(property.rent)||0, label:'' };
    const rentMin=Number(property.rentMin||range.min||property.rent)||0;
    const rentMax=Number(property.rentMax||range.max||property.rent)||rentMin;
    const payload={
      landlordId:lid,
      name:String(property.name||'Rental'),
      addr:String(loc.displayAddr||property.addr||''),
      city:String(loc.city||property.city||''),
      suburb:String(property.suburb||''),
      province:String(property.province||''),
      street:loc.exact?String(property.street||''):'',
      showExactLocation:loc.exact!==false,
      rent:rentMin,
      rentMin,
      rentMax,
      rentLabel:range.label||'',
      bedrooms:Number(property.bedrooms)||0,
      bathrooms:Number(property.bathrooms)||0,
      leaseEnd:String(property.leaseEnd||'Available'),
      icon:String(property.icon||'🏢'),
      type:String(property.type||'apartment'),
      status:'vacant',
      publishStatus:'published',
      publicListing:true,
      amenities,
      garage:Boolean(property.garage),
      garden:Boolean(property.garden),
      pool:Boolean(property.pool),
      petFriendly:Boolean(property.petFriendly),
      photoUrl:photo||null,
      amenityPhotos,
      description:String(property.description||'').slice(0,800),
      notes:'', // never mirror landlord private notes
      floorSize:Number(property.floorSize)||0,
      parkingBays:Number(property.parkingBays??property.parking)||0,
      deposit:Number(property.deposit)||0,
      levy:Number(property.levy)||0,
      lat:Number.isFinite(Number(loc.lat))?Number(loc.lat):null,
      lng:Number.isFinite(Number(loc.lng))?Number(loc.lng):null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const created=nestiqTimestampForPublicListingWrite(property.createdAt);
    if(created) payload.createdAt=created;
    const listed=nestiqTimestampForPublicListingWrite(property.listedAt||property.publishedAt);
    if(listed) payload.listedAt=listed;
    try{
      const pid=String(property.id||'');
      const allLive=typeof window.nestiqUnitsForProperty==='function'?window.nestiqUnitsForProperty(pid):[];
      const hasInventory=Array.isArray(allLive)&&allLive.length>0;
      const units=typeof window.nestiqListingAvailableUnits==='function'
        ? window.nestiqListingAvailableUnits({ ...property, availableUnits:property.availableUnits })
        : [];
      const mapped=(units||[])
        .filter(u=>u && !u.synthetic && (String(u.id||'').trim()||String(u.label||u.unitNumber||'').trim()))
        .slice(0,40)
        .map(u=>({
          id:String(u.id||''),
          label:String(u.label||u.unitNumber||'Unit'),
          bedrooms:Number(u.bedrooms)||0,
          bathrooms:Number(u.bathrooms)||0,
          rent:Number(u.rent)||0,
          deposit:Number(u.deposit||u.rent)||0,
          availableFrom:String(u.availableFrom||property.leaseEnd||'Available'),
          status:'vacant'
        }));
      if(mapped.length){
        payload.availableUnits=mapped;
      }else if(hasInventory){
        payload.availableUnits=[];
      }
      // If units are not in memory yet, omit availableUnits so merge does not
      // wipe a listing that already has vacant rooms.
    }catch(_e){}
    return stripUndefined(payload);
  }

  function nestiqTimestampForPublicListingWrite(value){
    if(value==null||value==='') return null;
    if(typeof value.toMillis==='function') return value;
    if(typeof value.seconds==='number') return value;
    if(typeof value._seconds==='number') return value;
    if(value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if(typeof value==='number' && Number.isFinite(value) && value>0){
      return new Date(value<1e12?value*1000:value);
    }
    if(typeof value==='object' && (value._methodName || value.isEqual)) return value;
    return null;
  }

  function nestiqNormalizeAmenityPhotosForMirror(list){
    if(!Array.isArray(list)) return [];
    return list.slice(0,8).map((a,i)=>{
      const src=String(a?.base64||a?.url||'').trim();
      if(!(src.startsWith('http://')||src.startsWith('https://'))) return null;
      return {
        caption:String(a?.caption||''),
        base64:src,
        order:Number.isFinite(Number(a?.order))?Number(a.order):i
      };
    }).filter(Boolean);
  }

  let __publicListingSyncTimer=null;
  async function nestiqSyncPublicListingMirror(property){
    if(!window.nestiqUseFirestore || !db || typeof firebase==='undefined') return false;
    const row=nestiqPropertyForPublicListingSync(property);
    const id=String(row?.id??'').trim();
    if(!id) return false;
    const lid=String(row.landlordId || currentLandlordUid() || '').trim();
    const ref=db.collection('publicListings').doc(id);
    try{
      if(!nestiqIsPubliclyListedProperty(row) || !lid){
        await ref.delete().catch(()=>{});
        return true;
      }
      if(row.publicListing !== true){
        try{
          await window.nestiqFs.properties(db, lid).doc(id).set({ publicListing:true }, { merge:true });
          row.publicListing=true;
        }catch(_e){}
      }
      const payload=nestiqPublicListingMirrorPayload(row, lid);
      await nestiqPreservePublicListingCreatedAt(ref, payload);
      await ref.set(payload, { merge:true });
      return true;
    }catch(err){
      console.warn('NestIQ: publicListings sync failed', id, err);
      // Retry once without amenity photos if the payload was too large.
      try{
        if(nestiqIsPubliclyListedProperty(row) && lid){
          const slim=nestiqPublicListingMirrorPayload({...row, amenityPhotos:[]}, lid);
          await nestiqPreservePublicListingCreatedAt(ref, slim);
          await ref.set(slim, { merge:true });
          return true;
        }
      }catch(err2){
        console.warn('NestIQ: publicListings slim sync failed', id, err2);
      }
      return false;
    }
  }

  async function nestiqPreservePublicListingCreatedAt(ref, payload){
    try{
      const snap=await ref.get();
      if(snap.exists){
        const existing=snap.data()||{};
        if(existing.createdAt) delete payload.createdAt;
        if(existing.listedAt) delete payload.listedAt;
        else delete payload.listedAt;
        return;
      }
      if(!payload.createdAt) payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();
      if(!payload.listedAt) payload.listedAt=firebase.firestore.FieldValue.serverTimestamp();
    }catch(_e){
      if(!payload.createdAt) payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();
      if(!payload.listedAt) payload.listedAt=firebase.firestore.FieldValue.serverTimestamp();
    }
  }

  async function nestiqSyncAllPublicListingMirrors(list){
    const rows=Array.isArray(list)?list:(window.propertiesData||[]);
    const jobs=rows.map(p=>nestiqSyncPublicListingMirror(p));
    return Promise.all(jobs);
  }

  function nestiqSchedulePublicListingSync(list){
    try{ if(__publicListingSyncTimer) clearTimeout(__publicListingSyncTimer); }catch(_e){}
    __publicListingSyncTimer=setTimeout(()=>{
      nestiqSyncAllPublicListingMirrors(list).catch(err=>{
        console.warn('NestIQ: scheduled publicListings sync', err);
      });
    }, 400);
  }

  window.mergeSettingsPayload = mergeSettingsPayload;
  window.nestiqScheduleSaveToFirestore = nestiqScheduleSaveToFirestore;
  window.nestiqCurrentLandlordUid = currentLandlordUid;
  window.nestiqGetLandlordUid = currentLandlordUid;
  window.nestiqGetSettingsDocRef = getSettingsDocRef;
  window.nestiqAttachLandlordListeners = attachLandlordListeners;
  window.startTenantListeners = startTenantListeners;
  window.stopNestiqFirestoreListeners = stopNestiqFirestoreListeners;
  window.nestiqSyncPublicListingMirror = nestiqSyncPublicListingMirror;
  window.nestiqSyncAllPublicListingMirrors = nestiqSyncAllPublicListingMirrors;
  window.nestiqSchedulePublicListingSync = nestiqSchedulePublicListingSync;
  window.nestiqIsPubliclyListedProperty = nestiqIsPubliclyListedProperty;
  window.nestiqHealDraftListingIfReady = nestiqHealDraftListingIfReady;
})();

window.nestiqFirebaseInit && window.nestiqFirebaseInit();

