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
    if(propertyUnsub){ try{ propertyUnsub(); }catch(_e){} propertyUnsub = null; }
    if(Array.isArray(window.__tenantUnsubs)){
      window.__tenantUnsubs.forEach(u => { try{ u(); }catch(_e){} });
      window.__tenantUnsubs = [];
    }
    if(window.__tenantPropUnsub){
      try{ window.__tenantPropUnsub(); }catch(_e){}
      window.__tenantPropUnsub = null;
    }
    if(window.__tenantNoticesUnsub){
      try{ window.__tenantNoticesUnsub(); }catch(_e){}
      window.__tenantNoticesUnsub = null;
    }
    window.nestiqPropertiesLoading=false;
    window.nestiqTenantsLoading=false;
    window.nestiqExpensesLoading=false;
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
    }
    if(d.billing && typeof d.billing === 'object'){
      window.landlordSettings = window.landlordSettings || {};
      window.landlordSettings.billing = { ...(window.landlordSettings.billing || {}), ...d.billing };
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
      window.applications.splice(0, window.applications.length, ...d.applications);
      if(typeof applications !== 'undefined' && Array.isArray(applications)){
        applications.splice(0, applications.length, ...d.applications);
      }
      if(typeof normalizeStoredApplications === 'function') normalizeStoredApplications();
      try{ window.applications = applications; }catch(_e){}
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

  function hydratePropertiesFromDocs(docs){
    window.propertiesData.length = 0;
    const nextPhotos = {};
    const sorted = docs.slice().sort((a, b) =>
      String((a.data().name || '')).localeCompare(String((b.data().name || '')), undefined, { sensitivity: 'base' })
    );
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
      const row = stripUndefined({ ...d, id, status: statusNorm, publicListing: pub });
      const pu = d.photoUrl || d.photoURL || d.imageUrl;
      if(pu){
        nextPhotos[sid(id)] = String(pu);
      }
      window.propertiesData.push(row);
    });
    try{ window.nestiqSchedulePublicListingSync?.(window.propertiesData); }catch(_e){}
    const phMap = window.propertyPhotos && typeof window.propertyPhotos === 'object' ? window.propertyPhotos : null;
    if(phMap){
      Object.keys(phMap).forEach(k => { delete phMap[k]; });
      Object.assign(phMap, nextPhotos);
    }else{
      window.propertyPhotos = nextPhotos;
    }
    window.photos = window.propertyPhotos;
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
    window.messages = docs.map(doc => {
      const d = doc.data();
      const id = rowIdFromDoc(doc, d);
      return stripUndefined({ ...d, id });
    });
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
      const pu = d.photoUrl || d.photoURL || d.imageUrl;
      if(pu && window.propertyPhotos && typeof window.propertyPhotos === 'object'){
        window.propertyPhotos[sid(id)] = String(pu);
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
    window.showNotif?.(hint,'error');
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
        window.showNotif?.('Some data is taking longer than expected. Showing what we have — try refreshing or check your connection.','warning');
      }
    }, 12000);
    nestUnsubs.push(() => clearTimeout(loadWatchdog));

    attachLandlordColListener('properties', uid, snap => {
      hydratePropertiesFromDocs(snap.docs);
      window.nestiqPropertiesLoading = false;
      try{ window.propertiesLoading = false; }catch(_e){}
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
      window.normalizeDataModel?.();
      window.renderKanban?.();
      window.refreshNestiqCalendar?.();
      landlordFirestoreUiRefresh();
    }, e => console.error('maintenance', e)));

    nestUnsubs.push(landlordCol('notices', uid).onSnapshot(snap => {
      hydrateNoticesFromDocs(snap.docs);
      window.renderTenantDashboard?.();
      landlordFirestoreUiRefresh();
    }, e => console.error('notices', e)));

    nestUnsubs.push(landlordCol('messages', uid).onSnapshot(snap => {
      hydrateMessagesFromDocs(snap.docs);
      const unread = snap.docs.filter(d => {
        const x = d.data();
        return x.fromRole === 'tenant' && !x.read;
      }).length;
      window.updateMessageBadge?.(unread);
      window.renderTenantDashboard?.();
      landlordFirestoreUiRefresh();
    }, e => console.error('messages', e)));

    nestUnsubs.push(landlordCol('invitations', uid).onSnapshot(snap => {
      hydrateInvitationsFromDocs(snap.docs);
      window.nestiqRenderInvitationsTable?.();
    }, e => console.error('invitations', e)));

    const sref = getSettingsDocRef();
    if(sref){
      nestUnsubs.push(sref.onSnapshot(doc => {
        if(doc.exists) mergeSettingsPayload(doc.data());
        window.renderSettings?.();
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
    if(msgCol) nestUnsubs.push(msgCol.where('tenantId', '==', tid).onSnapshot(snap => {
      window.messages = snap.docs.map(doc => {
        const d = doc.data();
        const id = Number(d.id != null ? d.id : doc.id);
        return stripUndefined({ ...d, id });
      });
      window.renderTenantDashboard?.();
    }, e => console.error('messages', e)));

    const maintCol = landlordCol('maintenance', landlordId);
    if(maintCol) nestUnsubs.push(maintCol.where('tenantId', '==', tid).onSnapshot(snap => {
      window.maintenanceData.length = 0;
      snap.docs.forEach(doc => {
        const d = doc.data();
        const id = Number(d.id != null ? d.id : doc.id);
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
    window.showNotif?.('Account switched to landlord. Complete setup if prompted.','success');
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

  // Prefer tenantAccounts linkage when this uid has no landlord properties.
  // Fixes accounts that were wrongly rewritten to landlord but still have a portal link.
  if(tenantIntent || (!hasLandlordSignals && !signInIntent)){
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
        return {
          role:'tenant',
          tenantDocId:tenantDocIdEarly,
          tenantId:d.tenantId != null ? Number(d.tenantId) : legacyNumericTenantId(tenantDocIdEarly),
          name:d.name || user.displayName || 'User',
          email:user.email,
          landlordId:landlordId||null
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
      if(p.role === 'tenant' && (p.tenantDocId != null || p.tenantId != null)){
        return await writeTenantUserProfile(ref,user,{
          tenantDocId:p.tenantDocId||p.tenantId,
          tenantId:p.tenantId||p.tenantDocId,
          landlordId:p.landlordId||null,
          name:p.name||user.displayName
        });
      }
    }

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

  function tenantPayloadSansPayments(t){
    const o = { ...t };
    delete o.payments;
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
    const url=`https://firestore.googleapis.com/v1/${path}`;
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
    return deepStripUndefined(stripUndefined({
      id:tid,
      name:String(tenant.name||''),
      email:String(tenant.email||tenant.portalEmail||'').toLowerCase(),
      phone:String(tenant.phone||''),
      property:String(tenant.property||''),
      propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
      unit:String(tenant.unit||'Unit'),
      rent:Number(tenant.rent)||0,
      status:String(tenant.status||'due'),
      lease:String(tenant.lease||''),
      leaseStart:String(tenant.leaseStart||''),
      leaseEnd:String(tenant.leaseEnd||''),
      monthlyDueDate:Number(tenant.monthlyDueDate)||1,
      landlordId:String(writeLid),
      applicationId:tenant.applicationId!=null?String(tenant.applicationId):'',
      hasPortalAccess:Boolean(tenant.hasPortalAccess),
      firstLogin:Boolean(tenant.firstLogin),
      portalUid:tenant.portalUid||null,
      portalEmail:String(tenant.portalEmail||tenant.email||'').toLowerCase(),
      depositAmount:depositAmt,
      notes:String(tenant.notes||'').slice(0,500)
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
      return id;
    }catch(e){
      try{ window.__nestiqPendingTenantWrites?.delete(String(id)); }catch(_e){}
      throw e;
    }
  }
  window.nestiqCreateTenantDocInFirestore=nestiqCreateTenantDocInFirestore;

  async function nestiqUpsertTenantAccount(authUser, lid, tid, propertyId, status){
    if(!db||!authUser||!lid||!tid) return false;
    const acct=window.nestiqFs?.tenantAccount(db, authUser.uid);
    if(!acct) return false;
    await acct.set(stripUndefined({
      landlordId:String(lid),
      tenantId:String(tid),
      propertyId:propertyId!=null?String(propertyId):'',
      status:status||'active'
    }),{ merge:true });
    window.nestiqTenantSession={
      landlordId:String(lid),
      tenantId:String(tid),
      propertyId:propertyId!=null?String(propertyId):'',
      status:status||'active'
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
      lid=String(acct.landlordId||lid);
      tid=String(acct.tenantId||tid);
      cu.landlordId=lid;
      cu.tenantDocId=tid;
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
          portalEmail:email,
          hasPortalAccess:true
        },{ merge:true });
        const tSnap=await landlordCol('tenants', lid).doc(tid).get();
        const propId=tSnap.exists?tSnap.data().propertyId:null;
        await nestiqUpsertTenantAccount(authUser, lid, tid, propId, 'active');
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
        status:'paid',
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
      window.nestiqShowTenantDashboardError?.('Your account is not linked to a tenant profile. Use your invitation code or contact your landlord.');
      return;
    }
    // Drop previous portal listeners before attaching new ones (logout / re-login).
    if(Array.isArray(window.__tenantUnsubs)){
      window.__tenantUnsubs.forEach(fn=>{ try{ fn(); }catch(_e){} });
    }
    if(window.__tenantPropUnsub){ try{ window.__tenantPropUnsub(); }catch(_e){} window.__tenantPropUnsub=null; }
    if(window.__tenantNoticesUnsub){ try{ window.__tenantNoticesUnsub(); }catch(_e){} window.__tenantNoticesUnsub=null; }

    window.nestiqShowTenantDashboardLoading?.(true);
    const unsubscribers = [];
    window.__tenantUnsubs = unsubscribers;
    window.currentTenantData = null;
    window.tenantPayments = [];
    window.tenantMaintenance = [];
    window.tenantUploadedDocuments = [];
    window.tenantNotices = [];
    window.tenantMessages = [];
    window.landlordInfo = null;
    window.tenantProperty = null;

    const tcol=landlordCol('tenants', lid);
    const payCol=landlordCol('payments', lid);
    const maintCol=landlordCol('maintenance', lid);
    const docsCol=landlordCol('documents', lid);
    const noticesCol=landlordCol('notices', lid);
    const msgCol=landlordCol('messages', lid);
    const propsCol=landlordCol('properties', lid);
    const settingsRef=window.nestiqFs?.settingsRef(dbi, lid);

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

    const unsubTenant = tcol.doc(tid).onSnapshot(doc => {
      if(!doc.exists){
        window.nestiqShowTenantDashboardError?.(
          'Your tenant profile is not in Firebase yet. Your landlord must open NestIQ (signed in), confirm you appear under Tenants, then ask them to resend your portal invitation.'
        );
        return;
      }
      window.currentTenantData = { id: doc.id, ...doc.data() };
      window.nestiqShowTenantDashboardLoading?.(false);
      window.renderTenantDashboard?.();
      window.renderGettingStartedTenant?.();
      window.renderNoticesCard?.();
      window.updateNoticesBadge?.();
      attachTenantNotices(window.currentTenantData?.propertyId||ts.propertyId);
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
        }, err=>console.error('Property error:', err));
      }else{
        window.tenantProperty=null;
        window.renderPropertyInfoCard?.();
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

    bindTenantScoped(payCol, rows=>{
      window.tenantPayments = rows.map(x=>{
        const pid=Number(x.id!=null?x.id:0);
        return { ...x, id:pid };
      });
      window.renderRentStatusCard?.();
      window.renderPaymentHistoryCard?.();
      window.renderFinancesCard?.();
      window.renderDocumentsCard?.();
      window.renderTenantCalendar?.();
    }, 'Tenant payments');

    bindTenantScoped(maintCol, rows=>{
      window.tenantMaintenance = rows
        .sort((a,b)=>String(b.createdAt?.seconds||b.date||'').localeCompare(String(a.createdAt?.seconds||a.date||'')));
      window.renderMaintenanceCard?.();
    }, 'Tenant maintenance');

    bindTenantScoped(docsCol, rows=>{
      window.tenantUploadedDocuments = rows;
      window.renderDocumentsCard?.();
    }, 'Tenant documents');

    bindTenantScoped(msgCol, rows=>{
      window.tenantMessages = rows
        .sort((a,b)=>String(a.createdAt?.seconds||a.date||'').localeCompare(String(b.createdAt?.seconds||b.date||'')));
      window.renderMessagesCard?.();
      window.markLandlordMessagesRead?.();
    }, 'Tenant messages');

    if(settingsRef){
      const unsubSettings = settingsRef.onSnapshot(doc => {
        if(doc.exists){
          const sd=doc.data()||{};
          const ls=sd.landlordSettings&&typeof sd.landlordSettings==='object'?sd.landlordSettings:{};
          window.landlordInfo={
            ...sd,
            name:sd.name||ls.name||'Landlord',
            phone:sd.phone||ls.phone||''
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
    });

    window.tenantsData.forEach(t => {
      batch.set(landlordCol('tenants', lid).doc(sid(t.id)), tenantPayloadSansPayments({ ...t, moveOutChecklist:t.moveOutChecklist || null, landlordId:t.landlordId || lid }), { merge:true });
      n++; push();
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
      if(photoUrl){
        payload.photoUrl=photoUrl;
      }else{
        delete payload.photoUrl;
      }
      batch.set(landlordCol('maintenance', lid).doc(sid(m.id)), payload, { merge:true });
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
      await ensureLandlordRootDoc(auth.currentUser.uid);
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
      if(typeof window.nestiqInitSupportWidget === 'function'){
        try{ window.nestiqInitSupportWidget(); }catch(_e){}
      }
      if(typeof window.nestiqUpdateLandlordLastActive === 'function'){
        try{ window.nestiqUpdateLandlordLastActive(); }catch(_e){}
      }
      attachLandlordListeners();
      try{ window.nestiqEnsureApplicationsFirestoreListener?.(); }catch(_e){}
      try{ window.nestiqUpdateApplicationsBadge?.(); }catch(_e){}
    }else{
      window.__nestiqLandlordUid = null;
      window.currentUser = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        role: 'tenant',
        tenantDocId: profile.tenantDocId || (profile.tenantId != null ? String(profile.tenantId) : null),
        landlordId: profile.landlordId || null,
        name: profile.name || 'Tenant'
      };
      window.currentTenantData = null;
      try{
        const linked=await nestiqEnsureTenantPortalReady(window.currentUser, auth.currentUser);
        if(linked && window.nestiqTenantSession){
          window.currentUser.landlordId = window.nestiqTenantSession.landlordId;
          window.currentUser.tenantDocId = window.nestiqTenantSession.tenantId;
        }
        if(!linked){
          window.nestiqShowTenantDashboardError?.(
            'We could not find your tenant record in the cloud. Ask your landlord to open NestIQ while signed in (Tenants page), confirm you are listed, then try again or use a new invitation code.'
          );
        }else{
          startTenantListeners();
        }
      }catch(ensureErr){
        console.error('NestIQ: tenant portal ensure', ensureErr);
        window.nestiqShowTenantDashboardError?.(
          'Could not link your account to a tenant record ('+(ensureErr?.code||ensureErr?.message||'permissions')+'). Deploy the latest Firestore rules, then log out and try again.'
        );
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
        if(window.__nestiqLoggingOut){
          window.__nestiqLoggingOut=false;
          window.__nestiqSession = null;
          nestiqClearSignInIntent();
          stopNestiqFirestoreListeners();
          try{ sessionStorage.removeItem('nestiq-session'); }catch(_e){}
          window.nestiqClearRedirectLoop?.();
          try{ window.syncNavUserUi?.(); }catch(_e){}
          if(typeof window.showLandingPage === 'function') window.showLandingPage();
          else window.showLoginScreen?.();
          window.nestiqHandleAuthEntryFlow?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }
        // On refresh Firebase can briefly report null before restoring persisted auth.
        if(!window.__nestiqAuthNullGraceDone){
          window.__nestiqAuthNullGraceDone = true;
          await new Promise(r => setTimeout(r, 600));
          if(handlerGen !== __authHandlerGen) return;
          if(firebase.auth().currentUser) return;
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
        try{ await user.reload(); }catch(_e){}
        const profile = await resolveUserProfile(user);
        if(!profile){
          await firebase.auth().signOut();
          if(typeof window.showLandingPage === 'function') window.showLandingPage('Profile not linked. Use an invitation code or ask your landlord.');
          else window.showLoginScreen?.('Profile not linked.');
          window.nestiqHandleAuthEntryFlow?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }
        window.__nestiqSession = {
          role:profile.role,
          userId: profile.role === 'tenant' ? (profile.tenantDocId || null) : profile.tenantId,
          tenantDocId: profile.role === 'tenant' ? (profile.tenantDocId || null) : null,
          landlordId: profile.landlordId || null,
          name:profile.name,
          email:user.email,
          uid:user.uid,
          loggedInAt:new Date().toISOString()
        };
        try{ sessionStorage.setItem('nestiq-session', JSON.stringify(window.__nestiqSession)); }catch(_e){}

        const needLandlordVerify = window.NESTIQ_REQUIRE_LANDLORD_EMAIL_VERIFICATION !== false;
        if(profile.role === 'landlord' && needLandlordVerify && !user.emailVerified){
          window.syncNavUserUi?.();
          window.showEmailVerificationScreen?.();
          try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
          return;
        }

        const landlordSignInAttempt=nestiqIsLandlordSignInIntent();

        if(landlordSignInAttempt&&profile.role==='tenant'){
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
        if(profile.role==='landlord'){
          try{
            const h=(location.hash||'').replace('#','').trim().toLowerCase();
            if(!h || h==='auth-signin' || h==='auth-signup' || h==='signin' || h==='signup' || h==='login' || h==='tenant-dashboard'){
              history.replaceState(null,'',location.pathname+location.search+'#home');
            }
          }catch(_e){}
        }
        // Tenants must always land on the portal — never the landlord marketing Home.
        if(profile.role==='tenant'){
          try{
            const h=(location.hash||'').replace('#','').trim().toLowerCase();
            if(h!=='listings'&&h!=='map'&&h!=='settings'){
              history.replaceState(null,'',location.pathname+location.search+'#tenant-dashboard');
            }
          }catch(_e){}
        }
        setTimeout(() => { if(__routerCb) __routerCb(profile); }, 0);

        await attachAfterProfile(profile);
        if(handlerGen !== __authHandlerGen) return;

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
          try{ location.hash='#tenant-dashboard'; }catch(_h){}
        }
      }catch(err){
        console.error('NestIQ auth bootstrap', err);
        const detail = (err && err.message) ? err.message : String(err);
        const isPerm=String(err?.code||detail).toLowerCase().includes('permission');
        window.showNotif?.(
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

  function nestiqIsPubliclyListedProperty(p){
    if(!p || typeof p!=='object') return false;
    if(String(p.status||'').trim().toLowerCase()!=='vacant') return false;
    return p.publicListing !== false && p.publicListing !== 'false' && p.publicListing !== 0;
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
    // Only URL amenity images — base64 galleries blow past Firestore's 1MB doc limit and break public sync.
    const amenityPhotos=Array.isArray(property.amenityPhotos)
      ? nestiqNormalizeAmenityPhotosForMirror(property.amenityPhotos)
      : [];
    const amenities=Array.isArray(property.amenities)?property.amenities.slice(0,24):[];
    const payload={
      landlordId:lid,
      name:String(property.name||'Rental'),
      addr:String(property.addr||''),
      city:String(property.city||''),
      rent:Number(property.rent)||0,
      bedrooms:Number(property.bedrooms)||0,
      bathrooms:Number(property.bathrooms)||0,
      leaseEnd:String(property.leaseEnd||'Available'),
      icon:String(property.icon||'🏢'),
      type:String(property.type||'apartment'),
      status:'vacant',
      publicListing:true,
      amenities,
      garage:Boolean(property.garage),
      garden:Boolean(property.garden),
      pool:Boolean(property.pool),
      petFriendly:Boolean(property.petFriendly),
      photoUrl:photo||null,
      amenityPhotos,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return stripUndefined(payload);
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
      await ref.set(payload, { merge:true });
      return true;
    }catch(err){
      console.warn('NestIQ: publicListings sync failed', id, err);
      // Retry once without amenity photos if the payload was too large.
      try{
        if(nestiqIsPubliclyListedProperty(row) && lid){
          const slim=nestiqPublicListingMirrorPayload({...row, amenityPhotos:[]}, lid);
          await ref.set(slim, { merge:true });
          return true;
        }
      }catch(err2){
        console.warn('NestIQ: publicListings slim sync failed', id, err2);
      }
      return false;
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
})();

window.nestiqFirebaseInit && window.nestiqFirebaseInit();

