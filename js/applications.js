/* ═══════════════════════════════
   TENANT APPLICATIONS — public form + landlord UI
═══════════════════════════════ */
(function(){
'use strict';

const NESTIQ_LS_APPLICATIONS='nestiq-applications';
const NESTIQ_LS_PROPERTIES='nestiq-properties';

const SA_PROVINCES=[
  'Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'
];
const TIME_AT_OPTS=[
  {v:'under-6',l:'Less than 6 months'},
  {v:'6-12',l:'6–12 months'},
  {v:'1-2',l:'1–2 years'},
  {v:'2-5',l:'2–5 years'},
  {v:'5plus',l:'5+ years'}
];

function nestiqAppEsc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

/**
 * In-memory applications array (local + merged Firestore when the landlord listener is active).
 */
function nestiqAppsReadLsArray(){
  try{
    if(typeof applications!=='undefined'&&Array.isArray(applications)) return applications;
  }catch(_e){}
  return [];
}

function nestiqAppsWriteLsArray(arr){
  try{
    if(typeof applications!=='undefined'&&Array.isArray(applications)){
      applications.splice(0,applications.length,...arr);
      window.applications=applications;
    }else{
      window.applications=arr;
    }
  }catch(_e){}
  try{ if(typeof saveData==='function') saveData(); }catch(_e){}
}

let __nestiqAppsFsUnsub=null;
let __nestiqAppsFsPublicUnsub=null;
let __nestiqAppsFsLid=null;
let __nestiqAppsScopedDocs=[];
let __nestiqAppsPublicDocs=[];

function nestiqApplicationsFromFirestoreDoc(doc){
  const d=doc.data();
  if(!d||typeof d!=='object') return null;
  const id=String(d.id||doc.id||'').trim();
  if(!id) return null;
  return {...d,id};
}

const NESTIQ_APP_STATUS_RANK={pending:1,reviewing:2,waitlisted:3,approved:4,declined:4};

function nestiqApplicationStatusRank(st){
  return NESTIQ_APP_STATUS_RANK[String(st||'pending').toLowerCase()]||0;
}

function nestiqMergeApplicationStatus(curSt,incomingSt){
  return nestiqApplicationStatusRank(incomingSt)>=nestiqApplicationStatusRank(curSt)?incomingSt:curSt;
}

function nestiqMergeApplicationRows(cur,incoming){
  if(!cur) return incoming?{...incoming}:null;
  if(!incoming) return {...cur};
  const merged={...cur,...incoming};
  merged.status=nestiqMergeApplicationStatus(cur.status,incoming.status);
  if(!merged.processedDate&&incoming.processedDate) merged.processedDate=incoming.processedDate;
  if(!merged.processedBy&&incoming.processedBy) merged.processedBy=incoming.processedBy;
  if(!merged.linkedTenantId&&incoming.linkedTenantId) merged.linkedTenantId=incoming.linkedTenantId;
  if(!merged.linkedTenantId&&cur.linkedTenantId) merged.linkedTenantId=cur.linkedTenantId;
  return merged;
}

/** Remote rows first, then local overlays; terminal statuses (approved/declined) are never downgraded. */
function nestiqMergeApplicationListsById(remoteArr, localArr){
  const m=new Map();
  (remoteArr||[]).forEach(a=>{
    if(a&&a.id) m.set(String(a.id),{...a});
  });
  (localArr||[]).forEach(a=>{
    if(!a||!a.id) return;
    const id=String(a.id);
    const cur=m.get(id);
    m.set(id, nestiqMergeApplicationRows(cur,a));
  });
  return Array.from(m.values());
}

function nestiqApplicationIsOpen(st){
  const s=String(st||'pending').toLowerCase();
  return s==='pending'||s==='reviewing';
}

function nestiqTenantForApplication(a){
  if(!a||!Array.isArray(tenantsData)) return null;
  if(a.linkedTenantId!=null&&a.linkedTenantId!==''){
    const byLink=tenantsData.find(t=>String(t.id)===String(a.linkedTenantId));
    if(byLink) return byLink;
  }
  const email=String(a.email||'').trim().toLowerCase();
  const appPropId=String(a.propertyId??'').trim();
  const appPropName=String(a.propertyName||'').trim().toLowerCase();

  const byAppId=tenantsData.find(t=>String(t.applicationId||'')===String(a.id));
  if(byAppId) return byAppId;

  if(!email) return null;

  const emailMatches=tenantsData.filter(t=>String(t.email||'').trim().toLowerCase()===email);
  if(!emailMatches.length) return null;

  const byProp=emailMatches.find(t=>{
    const tid=String(t.propertyId??'').trim();
    const tname=String(t.property||'').trim().toLowerCase();
    if(appPropId&&tid&&tid===appPropId) return true;
    if(appPropName&&tname&&tname===appPropName) return true;
    if(appPropId&&tname&&tname===appPropId.toLowerCase()) return true;
    return false;
  });
  if(byProp) return byProp;

  // Unique email → treat as the tenant even if property ids differ (manual Add Tenant, etc.)
  if(emailMatches.length===1) return emailMatches[0];
  return null;
}

/** Persist linkedTenantId when we can resolve a tenant (heals older approvals). */
function nestiqEnsureApplicationTenantLink(a){
  if(!a||(a.status||'')!=='approved') return nestiqTenantForApplication(a);
  const tenant=nestiqTenantForApplication(a);
  if(!tenant) return null;
  if(String(a.linkedTenantId||'')===String(tenant.id)&&String(tenant.applicationId||'')===String(a.id)) return tenant;
  a.linkedTenantId=tenant.id;
  if(!tenant.applicationId) tenant.applicationId=a.id;
  void nestiqPersistApplicationRecordToFirestoreById(a.id);
  if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
    void window.nestiqPersistSingleTenantToFirestore(tenant).catch(()=>{});
  }
  return tenant;
}

function nestiqApplicationCardActionsHtml(appId,st){
  const idJson=JSON.stringify(appId);
  if(nestiqApplicationIsOpen(st)){
    return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>Review</button>
          <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${idJson})'>Approve</button>
          <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick='nestiqApplicationOpenDeclineModal(${idJson})'>Decline</button>
          <button type="button" class="btn-outline btn-sm" onclick='nestiqApplicationWaitlist(${idJson})'>Waitlist</button>`;
  }
  const label=String(st||'pending');
  if(label==='approved'){
    const a=nestiqFindApplication(appId);
    const tenant=nestiqEnsureApplicationTenantLink(a)||nestiqTenantForApplication(a);
    if(!tenant){
      return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>View application</button>
          <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${idJson})'>Create tenant & invite</button>
          <span class="badge badge-amber" style="margin-left:auto">Approved — tenant missing</span>`;
    }
    return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>View application</button>
          <button type="button" class="btn-outline btn-sm" onclick="showPage('tenants')">View tenants</button>
          ${!tenant.portalUid?`<button type="button" class="btn-gold btn-sm" onclick="event.stopPropagation();nestiqInviteTenantToPortal(${tenant.id})">Send portal invite</button>`:''}
          <span class="badge badge-green" style="margin-left:auto">Approved — tenant created</span>`;
  }
  if(label==='declined'){
    return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>View application</button>
          <span class="badge badge-red" style="margin-left:auto">Declined</span>`;
  }
  if(label==='waitlisted'){
    return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>Review</button>
          <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${idJson})'>Approve</button>
          <span class="badge badge-amber">Waitlisted</span>`;
  }
  return `<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>View</button>`;
}

function nestiqStopApplicationsFirestoreListener(){
  if(__nestiqAppsFsUnsub){
    try{ __nestiqAppsFsUnsub(); }catch(_e){}
    __nestiqAppsFsUnsub=null;
  }
  if(__nestiqAppsFsPublicUnsub){
    try{ __nestiqAppsFsPublicUnsub(); }catch(_e){}
    __nestiqAppsFsPublicUnsub=null;
  }
  __nestiqAppsFsLid=null;
  __nestiqAppsScopedDocs=[];
  __nestiqAppsPublicDocs=[];
  __nestiqAppsAlertSeeded=false;
}

function nestiqApplicationsPendingList(list){
  const rows=Array.isArray(list)?list:(typeof applications!=='undefined'&&Array.isArray(applications)?applications:window.applications||[]);
  return rows.filter(a=>{
    const st=String(a?.status||'pending').toLowerCase();
    return st==='pending'||st==='reviewing';
  });
}

function nestiqAppsSeenStorageKey(){
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():'';
  return 'nestiq-apps-seen:'+String(lid||'anon');
}

function nestiqLoadSeenApplicationIds(){
  try{
    const raw=sessionStorage.getItem(nestiqAppsSeenStorageKey());
    const arr=raw?JSON.parse(raw):[];
    return new Set(Array.isArray(arr)?arr.map(String):[]);
  }catch(_e){
    return new Set();
  }
}

function nestiqSaveSeenApplicationIds(set){
  try{
    sessionStorage.setItem(nestiqAppsSeenStorageKey(), JSON.stringify([...set]));
  }catch(_e){}
}

function nestiqUpdateApplicationsBadge(){
  const pending=nestiqApplicationsPendingList();
  const n=pending.length;
  const el=document.getElementById('navAppsBadge');
  if(el){
    el.textContent=n>99?'99+':String(n);
    el.style.display=n>0?'inline-flex':'none';
  }
  // Also badge mobile Applications link if present.
  document.querySelectorAll('a[href="#applications"]').forEach(a=>{
    if(a.closest('#navbar .nav-links')) return;
    let b=a.querySelector('.nav-item-badge');
    if(!b && n>0){
      b=document.createElement('span');
      b.className='nav-item-badge';
      a.appendChild(b);
    }
    if(b){
      b.textContent=n>99?'99+':String(n);
      b.style.display=n>0?'inline-flex':'none';
    }
  });
}

let __nestiqAppsAlertSeeded=false;
function nestiqAlertOnNewApplications(merged){
  const pending=nestiqApplicationsPendingList(merged);
  const seen=nestiqLoadSeenApplicationIds();
  const pendingIds=pending.map(a=>String(a.id||'')).filter(Boolean);

  if(!__nestiqAppsAlertSeeded){
    // First snapshot after login: seed seen IDs so we don't spam for existing apps.
    pendingIds.forEach(id=>seen.add(id));
    nestiqSaveSeenApplicationIds(seen);
    __nestiqAppsAlertSeeded=true;
    nestiqUpdateApplicationsBadge();
    return;
  }

  const fresh=pending.filter(a=>{
    const id=String(a.id||'');
    return id && !seen.has(id);
  });
  pendingIds.forEach(id=>seen.add(id));
  // Drop seen IDs that are no longer pending/reviewing (approved/declined).
  const pendingSet=new Set(pendingIds);
  [...seen].forEach(id=>{ if(!pendingSet.has(id)) seen.delete(id); });
  nestiqSaveSeenApplicationIds(seen);
  nestiqUpdateApplicationsBadge();

  if(!fresh.length) return;
  fresh.forEach(a=>{
    const name=String(a.fullName||a.name||'Applicant').trim()||'Applicant';
    const prop=String(a.propertyName||a.property||'a listing').trim()||'a listing';
    const msg=`New application: ${name} — ${prop}`;
    try{ addBellNotif?.('📋', msg, "showPage('applications')"); }catch(_e){}
    try{ showNotif?.(msg,'info'); }catch(_e){}
    try{
      sendBrowserNotif?.('New NestIQ application', `${name} applied for ${prop}`, {
        tag:'nestiq-app-'+String(a.id||''),
        data:{ route:'applications' }
      });
    }catch(_e){}
  });
  try{ if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function') navigator.vibrate(40); }catch(_e){}
}

function nestiqApplicationsListenerApplyMerge(){
  const remote=[
    ...__nestiqAppsScopedDocs.map(nestiqApplicationsFromFirestoreDoc).filter(Boolean),
    ...__nestiqAppsPublicDocs.map(nestiqApplicationsFromFirestoreDoc).filter(Boolean)
  ];
  const local=Array.isArray(applications)?applications.slice():[];
  const merged=nestiqMergeApplicationListsById(remote, local);
  nestiqApplyApplicationsMergeToGlobals(merged);
  try{ nestiqAlertOnNewApplications(merged); }catch(_e){}
  try{
    if(window.currentPage==='applications' || document.getElementById('page-applications')){
      nestiqRenderApplicationsPage.__skipFsEnsure=true;
      nestiqRenderApplicationsPage();
    }
  }finally{
    try{ delete nestiqRenderApplicationsPage.__skipFsEnsure; }catch(_e){}
  }
}

function nestiqApplyApplicationsMergeToGlobals(merged){
  if(!Array.isArray(merged)) return;
  try{
    if(typeof applications!=='undefined'&&Array.isArray(applications)){
      applications.splice(0,applications.length,...merged);
      window.applications=applications;
    }else{
      window.applications=merged;
    }
  }catch(_e){
    try{ window.applications=merged; }catch(_e2){}
  }
  try{ if(typeof normalizeStoredApplications==='function') normalizeStoredApplications(); }catch(_e){}
}

function nestiqEnsureApplicationsFirestoreListener(){
  if(typeof window.nestiqIsDemo==='function'&&window.nestiqIsDemo()){
    nestiqStopApplicationsFirestoreListener();
    nestiqUpdateApplicationsBadge();
    return;
  }
  const db=window.nestiqDb;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  let sess=null;
  try{ sess=(typeof getSession==='function')?getSession():null; }catch(_e){}
  if(!window.nestiqUseFirestore||!db||!lid||sess?.role!=='landlord'){
    nestiqStopApplicationsFirestoreListener();
    nestiqUpdateApplicationsBadge();
    return;
  }
  if(__nestiqAppsFsUnsub&&__nestiqAppsFsLid===lid){
    nestiqUpdateApplicationsBadge();
    return;
  }
  nestiqStopApplicationsFirestoreListener();
  __nestiqAppsFsLid=lid;
  __nestiqAppsAlertSeeded=false;
  const scoped=window.nestiqFs?.applications(db, lid);
  if(scoped){
    __nestiqAppsFsUnsub=scoped.onSnapshot(snap=>{
      __nestiqAppsScopedDocs=snap.docs;
      try{ nestiqApplicationsListenerApplyMerge(); }catch(e){ console.warn('NestIQ applications scoped listener', e); }
    },err=>{ console.warn('NestIQ applications scoped query', err); });
  }
  const pubQ=db.collection('applications').where('listingLandlordId','==',lid);
  __nestiqAppsFsPublicUnsub=pubQ.onSnapshot(snap=>{
    __nestiqAppsPublicDocs=snap.docs;
    try{ nestiqApplicationsListenerApplyMerge(); }catch(e){ console.warn('NestIQ applications public listener', e); }
  },err=>{ console.warn('NestIQ applications public query', err); });
}

async function nestiqSyncPublicApplicationsToLandlord(){
  const db=window.nestiqDb;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  if(!db||!lid||!window.nestiqFs){
    window.showNotif?.('Sign in as a landlord to sync applications.','warning');
    return;
  }
  const btn=event?.target;
  if(btn){ btn.disabled=true; btn.textContent='Syncing…'; }
  try{
    const snap=await db.collection('applications').where('listingLandlordId','==',lid).get();
    const dest=window.nestiqFs.applications(db, lid);
    let n=0;
    for(const doc of snap.docs){
      await dest.doc(doc.id).set(doc.data(),{ merge:true });
      await doc.ref.delete();
      n++;
    }
    window.showNotif?.(n?('Synced '+n+' public application(s) into your portfolio.'):'No new public applications to sync.','success');
    nestiqApplicationsListenerApplyMerge();
  }catch(e){
    console.warn('NestIQ sync public applications', e);
    window.showNotif?.('Could not sync applications. Check Firestore rules and try again.','error');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='Sync New Applications'; }
  }
}

async function nestiqSyncApplicationRecordToFirestore(record, walkIn){
  if(!window.nestiqDb||!record||!record.id) return true;
  if(!String(record.listingLandlordId||'').trim()){
    console.warn('NestIQ: skip application Firestore sync — missing listingLandlordId');
    return false;
  }
  try{
    const payload=JSON.parse(JSON.stringify(record));
    payload.propertyId=String(payload.propertyId!=null?payload.propertyId:'');
    payload.listingLandlordId=String(payload.listingLandlordId!=null?payload.listingLandlordId:'');
    if(!walkIn&&typeof firebase!=='undefined'&&firebase.auth){
      try{
        if(!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      }catch(_e){}
      try{
        const u=firebase.auth().currentUser;
        if(u) payload.applicantUid=u.uid;
      }catch(_e2){}
    }
    if(walkIn&&window.nestiqFs){
      const lid=String(payload.listingLandlordId||'').trim();
      await window.nestiqFs.applications(window.nestiqDb, lid).doc(String(payload.id)).set(payload);
    }else{
      await window.nestiqDb.collection('applications').doc(String(payload.id)).set(payload);
    }
    return true;
  }catch(e){
    console.warn('NestIQ: application Firestore sync', e);
    return false;
  }
}

/** Landlord-side updates: push current row to `applications/{id}` so other devices and the listener stay aligned. */
async function nestiqPersistApplicationRecordToFirestoreById(appId){
  if(!window.nestiqDb||!appId) return false;
  try{
    const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
    if(!lid) return false;
    const a=nestiqFindApplication(appId);
    if(!a||!a.id) return false;
    if(!String(a.listingLandlordId||'').trim()) a.listingLandlordId=lid;
    if(String(a.listingLandlordId||'')!==String(lid)){
      // Heal mismatches so linkedTenantId can still be saved under this landlord.
      console.warn('NestIQ: healing application listingLandlordId', a.id, a.listingLandlordId, '→', lid);
      a.listingLandlordId=String(lid);
    }
    const payload=JSON.parse(JSON.stringify(a));
    await window.nestiqFs.applications(window.nestiqDb, lid).doc(String(a.id)).set(payload,{merge:true});
    try{ await window.nestiqDb.collection('applications').doc(String(a.id)).delete(); }catch(_del){}
    return true;
  }catch(e){
    console.warn('NestIQ: application Firestore persist', e);
    return false;
  }
}

async function nestiqMarkApplicationsApprovedForTenant(tenant, opts){
  opts=opts||{};
  const db=window.nestiqDb;
  if(!db||!tenant) return;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():tenant.landlordId;
  const email=String(tenant.email||opts.email||'').trim().toLowerCase();
  const appId=tenant.applicationId||opts.applicationId;
  let targets=[];
  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:[];
  if(appId){
    const hit=list.find(x=>String(x.id)===String(appId));
    if(hit) targets=[hit];
  }
  if(!targets.length&&email){
    targets=list.filter(x=>{
      if(String(x.email||'').toLowerCase()!==email) return false;
      if(tenant.propertyId!=null&&x.propertyId!=null&&String(x.propertyId)!==String(tenant.propertyId)) return false;
      const st=String(x.status||'');
      if(nestiqApplicationIsOpen(st)) return true;
      // Heal "approved but tenant missing" after manual Add Tenant / invite
      if(st==='approved'&&!nestiqTenantForApplication(x)) return true;
      if(st==='approved'&&String(x.linkedTenantId||'')!==String(tenant.id)) return true;
      return false;
    });
  }
  for(const a of targets){
    a.status='approved';
    a.processedDate=a.processedDate||new Date().toISOString().slice(0,10);
    a.processedBy=a.processedBy||nestiqLandlordDisplay();
    a.linkedTenantId=tenant.id;
    a.portalInviteAccepted=true;
    if(lid&&!a.listingLandlordId) a.listingLandlordId=lid;
    await nestiqPersistApplicationRecordToFirestoreById(a.id);
  }
  try{ nestiqRenderApplicationsPage?.(); }catch(_e){}
}
window.nestiqMarkApplicationsApprovedForTenant=nestiqMarkApplicationsApprovedForTenant;

function nestiqReadPropertyFromLs(pid){
  const idStr=String(pid);
  try{
    if(typeof propertiesData!=='undefined'&&Array.isArray(propertiesData)){
      const hit=propertiesData.find(p=>String(p?.id)===idStr);
      if(hit) return hit;
    }
  }catch(_e){}
  try{
    const raw=localStorage.getItem(NESTIQ_LS_PROPERTIES);
    if(!raw) return null;
    const list=JSON.parse(raw);
    if(!Array.isArray(list)) return null;
    return list.find(p=>String(p?.id)===idStr)||null;
  }catch(_e){ return null; }
}

function nestiqReadPropertyFromUrlParams(params){
  const id=String(params.get('property')||'').trim();
  if(!id) return null;
  /* URLSearchParams.get is already percent-decoded; do not decodeURIComponent again (throws on "%"). */
  const name=String(params.get('name')||'').replace(/\+/g,' ').trim();
  const leaseRaw=String(params.get('leaseEnd')||'').replace(/\+/g,' ').trim();
  const landlordQs=String(params.get('landlord')||params.get('lid')||'').trim();
  const out={
    id,
    name: name || 'Listed rental',
    addr:String(params.get('addr')||'').replace(/\+/g,' '),
    rent:Number(params.get('rent')||0),
    bedrooms:Number(params.get('bedrooms')||0),
    leaseEnd: leaseRaw || 'Available'
  };
  if(landlordQs) out.landlordId=landlordQs;
  return out;
}

function nestiqSaIdToDobDigits(digits13){
  if(!/^\d{13}$/.test(digits13)) return '';
  const yy=parseInt(digits13.slice(0,2),10);
  const mm=digits13.slice(2,4);
  const dd=digits13.slice(4,6);
  const century=yy<=29?2000:1900;
  const yyyy=century+yy;
  return `${yyyy}-${mm}-${dd}`;
}

function nestiqMaskIdNumber(raw){
  const d=String(raw||'').replace(/\s/g,'');
  if(d.length<8) return '••••••••';
  return `****${d.slice(-8, -4)} ${d.slice(-4)}`;
}

function nestiqAppBaseUrlSafe(){
  try{
    if(typeof nestiqAppBaseUrl==='function') return nestiqAppBaseUrl();
  }catch(_e){}
  let p=String(location.pathname||'/');
  if(/\/index\.html\/*$/i.test(p)||/^index\.html\/*$/i.test(p)){
    p=p.replace(/\/index\.html\/*$/i,'').replace(/^index\.html\/*$/i,'');
    p=p.replace(/\/+$/,'');
    if(!p) p='/';
    return location.origin+p+(p.endsWith('/')?'':'/');
  }
  const i=p.lastIndexOf('/');
  return location.origin+(i>=0?p.slice(0,i+1):'/');
}

function nestiqFormatMoney(n){
  return `R${Math.round(Number(n)||0).toLocaleString('en-ZA')}`;
}

function nestiqIncomeForApp(a){
  const net=Number(a.monthlyNetIncome)||0;
  const gross=Number(a.monthlyGrossIncome)||0;
  return net>0?net:gross;
}

function nestiqRentForApp(a){
  const r=Number(a.listingMonthlyRent)||0;
  if(r>0) return r;
  try{
    const p=(typeof propertiesData!=='undefined'&&propertiesData.find)
      ?propertiesData.find(x=>String(x.id)===String(a.propertyId)):null;
    return Number(p?.rent)||0;
  }catch(_e){ return 0; }
}

function nestiqIncomeRatioLabel(income,rent){
  if(!rent||rent<=0) return {ratio:0,cls:'nestiq-ratio-na',text:'—'};
  const ratio=income/rent;
  let cls='nestiq-ratio-red',text=`${ratio.toFixed(1)}×`;
  if(ratio>=3){ cls='nestiq-ratio-green'; }
  else if(ratio>=2){ cls='nestiq-ratio-amber'; }
  return {ratio,cls,text};
}

function nestiqAiScoreBadgeClass(score){
  const n=Number(score);
  if(!Number.isFinite(n)) return '';
  if(n>=80) return 'nestiq-score-sage';
  if(n>=60) return 'nestiq-score-gold';
  if(n>=40) return 'nestiq-score-amber';
  return 'nestiq-score-rust';
}

/* ═══ Public application page ═══ */
function nestiqResolvePublicProperty(propIdRaw, params, propNameHint){
  let prop=nestiqReadPropertyFromLs(propIdRaw)||nestiqReadPropertyFromUrlParams(params)||null;
  if(!prop && propNameHint && propIdRaw){
    prop={ id:propIdRaw, name:propNameHint, addr:'', rent:0, bedrooms:0, leaseEnd:'—' };
  }
  function mergeLandlordHint(remote){
    const base=remote&&typeof remote==='object'?{...remote}:null;
    const hint=prop&&typeof prop==='object'?prop:{};
    const fromUrl=String(hint.landlordId||hint.landlord||'').trim();
    if(!base) return prop;
    if(fromUrl && !String(base.landlordId||'').trim()) return {...base,landlordId:fromUrl};
    return base;
  }
  const lidHint=String(params.get('landlord')||params.get('listingLandlordId')||(prop&&prop.landlordId)||(prop&&prop.landlord)||'').trim();
  if(propIdRaw && window.nestiqDb && lidHint && window.nestiqFs){
    return window.nestiqFs.properties(window.nestiqDb, lidHint).doc(String(propIdRaw)).get().then(sd=>{
      if(sd.exists) return mergeLandlordHint({ id:sd.id, ...sd.data() });
      return mergeLandlordHint(prop);
    }).catch(()=>mergeLandlordHint(prop));
  }
  return Promise.resolve(mergeLandlordHint(prop));
}

function nestiqInitPublicApplicationPage(){
  const root=document.getElementById('nestiqPublicApplicationRoot');
  if(!root) return;
  const params=new URLSearchParams(location.search);
  const propIdRaw=String(params.get('property')||'').trim();
  const propNameHint=String(params.get('name')||'').replace(/\+/g,' ');
  root.innerHTML='<p class="nestiq-papp-muted" style="padding:28px;text-align:center">Loading property…</p>';
  nestiqResolvePublicProperty(propIdRaw, params, propNameHint).then(prop=>{
    nestiqRunPublicApplicationWizard(root, prop, params, propNameHint, null);
  });
}

function nestiqRunPublicApplicationWizard(root, prop, params, propNameHint, opts){
  const wizardOpts=opts&&typeof opts==='object'?opts:{};
  const walkIn=!!wizardOpts.walkIn;
  if(!prop||!String(prop.id||'').trim()){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">Invalid link</h1><p class="nestiq-papp-muted">This application link is missing a valid property. Request a new link from the landlord or choose a listing from Browse listings.</p></div></div>`;
    return;
  }

  const rent=Number(prop.rent)||0;
  const bedrooms=Number(prop.bedrooms)||0;
  const leaseEnd=String(prop.leaseEnd||'Available');
  const displayName=String(prop.name||propNameHint||'Property');
  const propId=String(prop.id||'').trim();
  const listingLandlordId=prop.landlordId!=null?String(prop.landlordId):'';

  if(!walkIn&&!String(listingLandlordId||'').trim()){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">Cannot apply from this link</h1><p class="nestiq-papp-muted">This listing could not be matched to a landlord (often because the property is not published for public browsing, or the link is missing the landlord reference). Ask your landlord for a new <strong>Share application link</strong> from NestIQ, or use <strong>Browse listings</strong> for published vacancies.</p></div></div>`;
    return;
  }

  const st={
    firstName:'',lastName:'',idNumber:'',dateOfBirth:'',
    email:'',phone:'',whatsapp:'',waSame:true,
    employmentStatus:'permanent',
    employerName:'',
    monthlyNetIncome:'',
    agreedToTerms:false,signature:''
  };

  let step=0;
  const totalSteps=3;

  function syncWa(){
    if(st.waSame) st.whatsapp=st.phone;
  }

  function validateStep(i){
    const err=[];
    const setErr=(id,msg)=>{ err.push({id,msg}); };
    if(i===0){
      if(!st.firstName.trim()) setErr('pa_fn','Required');
      if(!st.lastName.trim()) setErr('pa_ln','Required');
      if(!st.idNumber.trim()) setErr('pa_id','Required');
      if(!st.email.trim()) setErr('pa_em','Required');
      if(!st.phone.trim()) setErr('pa_ph','Required');
    }
    if(i===1){
      if(!st.employmentStatus) setErr('pa_es','Required');
      if(String(st.monthlyNetIncome).trim()===''||Number(st.monthlyNetIncome)<0) setErr('pa_mn','Required');
      if(st.employmentStatus!=='unemployed'&&!st.employerName.trim()) setErr('pa_en','Employer name required');
    }
    if(i===2){
      if(!st.agreedToTerms) setErr('pa_ag','You must agree to the terms');
      if(!st.signature.trim()) setErr('pa_sg','Signature required');
    }
    return err;
  }

  function render(){
    syncWa();
    const pct=Math.round(((step+1)/totalSteps)*100);
    const steps=['Personal Details','Employment & Financials','Review & Submit'];
    const errMap={};
    validateStep(step).forEach(e=>{ errMap[e.id]=e.msg; });

    const errClass=id=>errMap[id]?' nestiq-papp-field-err':'';
    const errMsg=id=>errMap[id]?`<div class="nestiq-papp-err-msg">${nestiqAppEsc(errMap[id])}</div>`:'';

    const affIncome=Number(st.monthlyNetIncome)||0;
    const affOk=rent>0?affIncome>=rent*3:null;

    let body='';
    if(step===0){
      body=`
        <div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_fn')}"><label>First name *</label><input class="form-input" data-k="firstName" value="${nestiqAppEsc(st.firstName)}">${errMsg('pa_fn')}</div>
          <div class="form-group${errClass('pa_ln')}"><label>Last name *</label><input class="form-input" data-k="lastName" value="${nestiqAppEsc(st.lastName)}">${errMsg('pa_ln')}</div>
          <div class="form-group${errClass('pa_id')}" style="grid-column:1/-1"><label>SA ID number *</label><input class="form-input" data-k="idNumber" value="${nestiqAppEsc(st.idNumber)}" inputmode="numeric" autocomplete="off">${errMsg('pa_id')}
            <p class="nestiq-papp-muted" style="margin:6px 0 0;font-size:0.78rem">A valid 13-digit SA ID automatically fills date of birth.</p>
          </div>
          <div class="form-group" style="grid-column:1/-1"><label>Date of birth</label><input class="form-input" type="date" data-k="dateOfBirth" value="${nestiqAppEsc(st.dateOfBirth)}"></div>
          <div class="form-group${errClass('pa_em')}"><label>Email *</label><input class="form-input" type="email" data-k="email" value="${nestiqAppEsc(st.email)}">${errMsg('pa_em')}</div>
          <div class="form-group${errClass('pa_ph')}"><label>Phone *</label><input class="form-input" data-k="phone" value="${nestiqAppEsc(st.phone)}">${errMsg('pa_ph')}</div>
          <div class="form-group" style="grid-column:1/-1"><label>WhatsApp</label><input class="form-input" data-k="whatsapp" value="${nestiqAppEsc(st.whatsapp)}" ${st.waSame?'readonly':''}>
            <label class="nestiq-papp-check"><input type="checkbox" data-wasame="1" ${st.waSame?'checked':''}> Same number for WhatsApp</label>
          </div>
        </div>`;
    }else if(step===1){
      const un=st.employmentStatus==='unemployed';
      const empOpts=[
        ['permanent','Permanent'],
        ['contract','Contract'],
        ['self-employed','Self-employed'],
        ['unemployed','Unemployed']
      ];
      body=`
        <div class="form-group${errClass('pa_es')}"><label>Employment status *</label>
          <select class="form-input" data-k="employmentStatus">
            ${empOpts.map(([v,l])=>`<option value="${v}" ${st.employmentStatus===v?'selected':''}>${nestiqAppEsc(l)}</option>`).join('')}
          </select>${errMsg('pa_es')}
        </div>
        ${un?'':`<div class="form-group${errClass('pa_en')}" style="grid-column:1/-1"><label>Employer name *</label><input class="form-input" data-k="employerName" value="${nestiqAppEsc(st.employerName)}">${errMsg('pa_en')}</div>`}
        <div class="form-group${errClass('pa_mn')}" style="grid-column:1/-1"><label>Monthly net income (R) *</label><input class="form-input" type="number" min="0" step="1" data-k="monthlyNetIncome" value="${nestiqAppEsc(st.monthlyNetIncome)}">${errMsg('pa_mn')}</div>
        <div class="nestiq-papp-afford ${affOk===true?'ok':affOk===false?'bad':''}">
          <p>Monthly <strong>net</strong> income should be at least <strong>3×</strong> the listing rent of ${nestiqFormatMoney(rent)}.</p>
          <p><strong>Minimum required:</strong> ${nestiqFormatMoney(rent*3)} · <strong>Your net income:</strong> ${nestiqFormatMoney(affIncome)}</p>
          ${affOk===true?'<p class="nestiq-papp-afford-msg ok">Meets the 3× rent guideline</p>':''}
          ${affOk===false?'<p class="nestiq-papp-afford-msg bad">Below the 3× rent guideline — you may still submit</p>':''}
          ${rent<=0?'<p class="nestiq-papp-muted">Rent not set on listing — threshold not calculated.</p>':''}
        </div>`;
    }else{
      const waDisp=st.waSame?st.phone:st.whatsapp;
      const empLbl=( {permanent:'Permanent',contract:'Contract','self-employed':'Self-employed',unemployed:'Unemployed'}[st.employmentStatus] )||st.employmentStatus;
      body=`
        <div class="nestiq-papp-summary">
          <p><strong>Name:</strong> ${nestiqAppEsc(st.firstName)} ${nestiqAppEsc(st.lastName)}</p>
          <p><strong>SA ID:</strong> ${nestiqAppEsc(st.idNumber)}</p>
          <p><strong>Date of birth:</strong> ${nestiqAppEsc(st.dateOfBirth||'—')}</p>
          <p><strong>Email:</strong> ${nestiqAppEsc(st.email)}</p>
          <p><strong>Phone:</strong> ${nestiqAppEsc(st.phone)}</p>
          <p><strong>WhatsApp:</strong> ${nestiqAppEsc(waDisp)}</p>
          <p><strong>Employment:</strong> ${nestiqAppEsc(empLbl)}</p>
          ${st.employmentStatus==='unemployed'?'':`<p><strong>Employer:</strong> ${nestiqAppEsc(st.employerName)}</p>`}
          <p><strong>Monthly net income:</strong> ${nestiqFormatMoney(Number(st.monthlyNetIncome)||0)}</p>
        </div>
        <div class="nestiq-papp-terms">
          <p><strong>By submitting this application I confirm that:</strong></p>
          <ol>
            <li>All information provided is true and accurate</li>
            <li>I consent to credit and background checks</li>
            <li>I understand this is an application only and does not guarantee tenancy</li>
            <li>False information will result in immediate disqualification</li>
          </ol>
        </div>
        <div class="form-group${errClass('pa_ag')}"><label class="nestiq-papp-check"><input type="checkbox" data-k="agreedToTerms" ${st.agreedToTerms?'checked':''}> I agree to the above</label>${errMsg('pa_ag')}</div>
        <div class="form-group${errClass('pa_sg')}"><label>Type your full name as your digital signature *</label><input class="form-input" data-k="signature" value="${nestiqAppEsc(st.signature)}">${errMsg('pa_sg')}</div>`;
    }

    root.innerHTML=`
      <div class="nestiq-papp-wrap">
        <header class="nestiq-papp-header">
          <div class="nestiq-papp-brand"><span class="logo-dot"></span> NestIQ</div>
          <p class="nestiq-papp-tag">${walkIn?nestiqAppEsc('Walk-in Application'):'Rental application'}</p>
          ${walkIn?'<p class="nestiq-papp-muted" style="font-size:0.82rem;margin:8px 0 0;line-height:1.45">Manual entry — use this form when the applicant is with you in person or on the phone. It is not the public self-service tenant link.</p>':''}
        </header>
        <div class="nestiq-papp-prophead">
          <h1 class="nestiq-papp-proptitle">${nestiqAppEsc(displayName)}</h1>
          <p class="nestiq-papp-propaddr">${nestiqAppEsc(prop.addr||'')}</p>
          <div class="nestiq-papp-propmeta">
            <span>${nestiqFormatMoney(rent)}/mo</span>
            <span>${bedrooms} bed</span>
            <span>Available: ${nestiqAppEsc(leaseEnd)}</span>
          </div>
          <p class="nestiq-papp-applyfor">${walkIn?'Applicant is applying for this property (walk-in / assisted entry)':'You are applying for this property'}</p>
        </div>
        <div class="nestiq-papp-steps">${steps.map((lbl,i)=>`<span class="nestiq-papp-step ${i===step?'active':i<step?'done':''}">${i+1}. ${nestiqAppEsc(lbl)}</span>`).join('')}</div>
        <div class="nestiq-papp-progressbar"><div class="nestiq-papp-progressfill" style="width:${pct}%"></div></div>
        <div class="nestiq-papp-card">${body}</div>
        <div class="nestiq-papp-nav">
          ${step>0?'<button type="button" class="btn-outline nestiq-papp-prev" style="min-height:44px">Previous</button>':'<span></span>'}
          ${step<totalSteps-1?'<button type="button" class="btn-gold nestiq-papp-next" style="min-height:44px">Next</button>':'<button type="button" class="btn-gold nestiq-papp-submit" style="min-height:44px">Submit Application</button>'}
        </div>
      </div>`;

    root.querySelectorAll('[data-k]').forEach(el=>{
      const k=el.dataset.k;
      el.addEventListener('input',()=>{
        if(el.type==='checkbox'&&k==='agreedToTerms') st[k]=el.checked;
        else if(el.type==='number') st[k]=el.value;
        else st[k]=el.value;
        if(k==='idNumber'){
          const digits=String(st.idNumber||'').replace(/\D/g,'');
          if(digits.length===13) st.dateOfBirth=nestiqSaIdToDobDigits(digits);
        }
        if(step===1&&k==='monthlyNetIncome') render();
      });
      el.addEventListener('change',()=>{
        if(el.type==='checkbox'&&k==='agreedToTerms') st[k]=el.checked;
        else if(k==='employmentStatus'){ st.employmentStatus=el.value; render(); }
      });
    });
    const ws=root.querySelector('[data-wasame]');
    if(ws) ws.addEventListener('change',()=>{ st.waSame=ws.checked; render(); });

    root.querySelector('.nestiq-papp-prev')?.addEventListener('click',()=>{ if(step>0){ step--; render(); } });
    root.querySelector('.nestiq-papp-next')?.addEventListener('click',()=>{
      const e=validateStep(step);
      if(e.length){ render(); return; }
      step++;
      render();
    });
    root.querySelector('.nestiq-papp-submit')?.addEventListener('click',async()=>{
      const e=validateStep(step);
      if(e.length){ render(); return; }
      syncWa();
      const id=`APP-${new Date().getFullYear()}-${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0').toUpperCase()}`;
      const nowIso=new Date().toISOString();
      const un=st.employmentStatus==='unemployed';
      const netInc=Math.max(0,Number(st.monthlyNetIncome)||0);
      const record={
        id,
        propertyId:propId,
        listingLandlordId,
        propertyName:displayName,
        propertyAddress:String(prop.addr||''),
        listingMonthlyRent:rent,
        availableFrom:leaseEnd,
        bedroomsListed:bedrooms,
        firstName:st.firstName.trim(),
        lastName:st.lastName.trim(),
        idNumber:st.idNumber.trim(),
        dateOfBirth:String(st.dateOfBirth||''),
        nationality:'South African',
        email:st.email.trim().toLowerCase(),
        phone:st.phone.trim(),
        whatsapp:(st.waSame?st.phone:st.whatsapp).trim(),
        currentAddress:'',
        currentCity:'',
        currentProvince:'',
        timeAtCurrentAddress:'',
        employmentStatus:st.employmentStatus,
        employerName:un?'':String(st.employerName||'').trim(),
        employerPhone:'',
        jobTitle:'',
        monthlyGrossIncome:netInc,
        monthlyNetIncome:netInc,
        employmentStartDate:'',
        payslipBase64:null,
        payslipName:'',
        currentLandlordName:'',
        currentLandlordPhone:'',
        currentMonthlyRent:0,
        reasonForMoving:'',
        previousEviction:false,
        evictionDetails:'',
        previousAddress:'',
        hasBankAccount:true,
        bankName:'',
        hasOutstandingDebt:false,
        creditScore:'unknown',
        monthlyDebtRepayments:0,
        numberOfOccupants:1,
        occupantDetails:'',
        hasPets:false,
        petDetails:'',
        petType:'',
        petCount:0,
        petBreed:'',
        hasCar:false,
        numberOfCars:0,
        references:[],
        emergencyContactName:'',
        emergencyContactPhone:'',
        emergencyContactRelationship:'',
        agreedToTerms:true,
        signature:st.signature.trim(),
        applicationDate:nowIso.slice(0,10),
        status:'pending',
        aiScore:null,
        aiRiskLevel:null,
        aiRecommendation:null,
        aiKeyFlags:[],
        aiSummary:'',
        aiConditions:[],
        landlordNotes:'',
        processedDate:'',
        processedBy:'',
        declineReasons:[],
        declineNotes:'',
        createdAt:nowIso,
        applicationSource:walkIn?'walkin':'public',
        source:walkIn?'walkin':'public'
      };
      const arr=nestiqAppsReadLsArray().slice();
      arr.push(record);
      nestiqAppsWriteLsArray(arr);
      nestiqRenderApplicationsPage?.();
      let fsSync=true;
      if(window.nestiqDb){
        record.id=String(record.id||'').trim();
        record.listingLandlordId=String(record.listingLandlordId||listingLandlordId||'').trim();
        if(!record.listingLandlordId&&walkIn&&typeof window.nestiqCurrentLandlordUid==='function'){
          record.listingLandlordId=String(window.nestiqCurrentLandlordUid()||'').trim();
        }
        record.agreedToTerms=true;
        if(record.id&&record.listingLandlordId){
          try{
            if(walkIn&&window.nestiqFs){
              await window.nestiqFs.applications(window.nestiqDb, record.listingLandlordId).doc(record.id).set(record);
            }else{
              await window.nestiqDb.collection('applications').doc(record.id).set(record);
            }
          }catch(e){
            console.error('NestIQ: application Firestore write failed',e);
            fsSync=false;
          }
        }else{
          console.warn('NestIQ: skip application Firestore write — missing id or listingLandlordId',{id:record.id,listingLandlordId:record.listingLandlordId});
          fsSync=false;
        }
      }
      const fsWarn=!fsSync&&window.nestiqDb&&String(record.listingLandlordId||'').trim()
        ?'<p style="font-size:0.84rem;color:var(--rust);margin-top:14px;line-height:1.45">We could not save your application to the landlord’s dashboard (connection or permissions). Please send your reference number to the landlord by email or WhatsApp so they can follow up.</p>':'';
      if(walkIn){
        root.innerHTML=`
        <div class="nestiq-papp-wrap">
          <div class="nestiq-papp-card nestiq-papp-success">
            <h1 class="nestiq-papp-title" style="color:var(--sage)">Walk-in application saved</h1>
            <p class="nestiq-papp-lead">Reference: <strong>${nestiqAppEsc(id)}</strong></p>
            <p class="nestiq-papp-muted">The application appears in your Tenant Applications list with other submissions.</p>
            <div class="nestiq-papp-summary" style="margin-top:20px">
              <p><strong>Applicant:</strong> ${nestiqAppEsc(record.firstName)} ${nestiqAppEsc(record.lastName)}</p>
              <p><strong>Property:</strong> ${nestiqAppEsc(displayName)}</p>
              <p><strong>Submitted:</strong> ${nestiqAppEsc(record.applicationDate)}</p>
            </div>
            ${fsWarn}
            <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:20px;min-height:44px" onclick="closeModal()">Done</button>
          </div>
        </div>`;
        showNotif?.('Walk-in application saved','success');
        try{ wizardOpts.onComplete?.(); }catch(_e){}
      }else{
        root.innerHTML=`
        <div class="nestiq-papp-wrap">
          <div class="nestiq-papp-card nestiq-papp-success">
            <h1 class="nestiq-papp-title" style="color:var(--sage)">Application Submitted Successfully!</h1>
            <p class="nestiq-papp-lead">Your reference number is: <strong>${nestiqAppEsc(id)}</strong></p>
            <p class="nestiq-papp-muted">We will contact you within 3–5 business days.</p>
            <p>Thank you for your interest in <strong>${nestiqAppEsc(displayName)}</strong>.</p>
            <div class="nestiq-papp-summary" style="margin-top:20px">
              <p><strong>Applicant:</strong> ${nestiqAppEsc(record.firstName)} ${nestiqAppEsc(record.lastName)}</p>
              <p><strong>Property:</strong> ${nestiqAppEsc(displayName)}</p>
              <p><strong>Submitted:</strong> ${nestiqAppEsc(record.applicationDate)}</p>
              <p><strong>Email:</strong> ${nestiqAppEsc(record.email)}</p>
            </div>
            ${fsWarn}
          </div>
        </div>`;
      }
    });
  }

  render();
}

/* ═══ Landlord UI ═══ */
let nestiqApplicationsFilter='all';
let nestiqReviewOpenAppId=null;
let nestiqNotesTimer=null;

function nestiqApplicationsCounts(){
  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:nestiqAppsReadLsArray();
  const c={all:list.length,pending:0,reviewing:0,approved:0,declined:0,waitlisted:0};
  list.forEach(a=>{
    const s=a.status||'pending';
    if(s in c) c[s]++;
  });
  return c;
}

function nestiqRenderApplicationsPage(){
  const stats=document.getElementById('nestiqApplicationsStats');
  const filt=document.getElementById('nestiqApplicationsFilters');
  const listEl=document.getElementById('nestiqApplicationsList');
  if(!stats||!filt||!listEl) return;
  if(!nestiqRenderApplicationsPage.__skipFsEnsure) nestiqEnsureApplicationsFirestoreListener();
  try{ nestiqUpdateApplicationsBadge(); }catch(_e){}

  const c=nestiqApplicationsCounts();
  stats.innerHTML=`
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${c.all}</div><div class="nestiq-app-stat-lbl">Total Applications</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-amber"><div class="nestiq-app-stat-val">${c.pending+c.reviewing}</div><div class="nestiq-app-stat-lbl">Pending Review</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-green"><div class="nestiq-app-stat-val">${c.approved}</div><div class="nestiq-app-stat-lbl">Approved</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-red"><div class="nestiq-app-stat-val">${c.declined}</div><div class="nestiq-app-stat-lbl">Declined</div></div>`;

  const tabs=['all','pending','reviewing','approved','declined','waitlisted'];
  filt.innerHTML=tabs.map(t=>{
    const label=t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1);
    const active=nestiqApplicationsFilter===t?'active':'';
    return `<button type="button" class="filter-chip ${active}" onclick="nestiqApplicationsSetFilter('${t}')">${label}</button>`;
  }).join('');

  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:nestiqAppsReadLsArray();
  let rows=list.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(nestiqApplicationsFilter!=='all') rows=rows.filter(a=>(a.status||'pending')===nestiqApplicationsFilter);

  if(!rows.length){
    listEl.innerHTML='<p class="nestiq-papp-muted" style="padding:24px;text-align:center">No applications in this filter.</p>';
    return;
  }

  listEl.innerHTML=rows.map(a=>{
    const name=`${a.firstName||''} ${a.lastName||''}`.trim()||'Applicant';
    const isWalkIn=String(a.source||a.applicationSource||'').toLowerCase()==='walkin';
    const walkInBadge=isWalkIn?'<span class="badge" style="margin-left:8px;font-size:0.68rem;background:rgba(201,168,76,0.18);color:var(--ink);border:1px solid var(--gold);vertical-align:middle">Walk-in</span>':'';
    const income=nestiqIncomeForApp(a);
    const rent=nestiqRentForApp(a);
    const {cls:ratioCls,text:ratioText}=nestiqIncomeRatioLabel(income,rent);
    const st=a.status||'pending';
    const badge=st==='approved'?'badge-green':st==='declined'?'badge-red':st==='waitlisted'?'badge-amber':st==='reviewing'?'badge-amber':'badge-amber';
    const gem=typeof isGeminiConfigured==='function'&&isGeminiConfigured();
    const sc=a.aiScore;
    const scoreHtml=gem&&sc!=null?`<span class="nestiq-ai-score ${nestiqAiScoreBadgeClass(sc)}">${Math.round(sc)}/100</span>`:'';
    const riskHtml=gem&&a.aiRiskLevel?`<span class="badge badge-amber">${nestiqAppEsc(a.aiRiskLevel)}</span>`:'';
    return `
      <div class="nestiq-app-card rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 bg-white" data-app-id="${nestiqAppEsc(a.id)}">
        <div class="nestiq-app-card-head">
          <div>
            <div class="nestiq-app-card-name font-semibold text-ink text-lg">${nestiqAppEsc(name)}${walkInBadge}</div>
            <div class="nestiq-app-card-meta">
              <span class="badge" style="background:var(--cream);color:var(--ink);border:1px solid var(--border)">${nestiqAppEsc(a.id)}</span>
              <span>${nestiqAppEsc(a.applicationDate||a.createdAt?.slice(0,10)||'—')}</span>
            </div>
            <div class="nestiq-app-card-prop">${nestiqAppEsc(a.propertyName||'—')}</div>
          </div>
          <div style="text-align:right">
            <span class="badge rounded-full px-3 py-1 text-xs font-semibold ${badge}">${nestiqAppEsc(st)}</span>
            <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${scoreHtml}${riskHtml}</div>
          </div>
        </div>
        <div class="nestiq-app-card-body">
          <div><span class="lbl">Monthly income</span> ${nestiqFormatMoney(income)}</div>
          <div><span class="lbl">Income ratio</span> <span class="${ratioCls}">${ratioText}</span></div>
          <div><span class="lbl">Employment</span> ${nestiqAppEsc(a.employmentStatus||'—')}</div>
          <div><span class="lbl">Current rent</span> ${nestiqFormatMoney(a.currentMonthlyRent)}</div>
          <div><span class="lbl">Time at address</span> ${nestiqAppEsc(a.timeAtCurrentAddress||'—')}</div>
          <div><span class="lbl">Occupants</span> ${nestiqAppEsc(a.numberOfOccupants||'—')}</div>
          <div><span class="lbl">Pets</span> ${a.hasPets?'Yes':'No'}</div>
          <div><span class="lbl">Eviction</span> ${a.previousEviction?'<span class="nestiq-flag-bad">Yes</span>':'No'}</div>
        </div>
        <div class="nestiq-app-card-foot flex gap-2 flex-wrap mt-3">
          ${nestiqApplicationCardActionsHtml(a.id,st)}
        </div>
      </div>`;
  }).join('');
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(listEl, 50, '.nestiq-app-card');
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
}

function nestiqApplicationsSetFilter(t){
  nestiqApplicationsFilter=t;
  nestiqRenderApplicationsPage();
}

function nestiqVacantPropertiesForWalkIn(){
  const list=(typeof propertiesData!=='undefined'&&Array.isArray(propertiesData))?propertiesData:[];
  return list.filter(p=>p&&String(p.status||'').toLowerCase()==='vacant');
}

function nestiqRefreshWalkInWizard(){
  const vacant=nestiqVacantPropertiesForWalkIn();
  const sel=document.getElementById('nestiqWalkInPropertySelect');
  const root=document.getElementById('nestiqWalkInWizardRoot');
  if(!sel||!root) return;
  const raw=sel.value?decodeURIComponent(sel.value):'';
  const p=vacant.find(x=>String(x.id)===String(raw));
  if(!p){
    root.innerHTML='<p class="nestiq-papp-muted" style="padding:16px">Select a vacant property to continue.</p>';
    return;
  }
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():'';
  if(lid&&!p.landlordId) p={...p,landlordId:lid};
  nestiqRunPublicApplicationWizard(root,p,new URLSearchParams(),String(p.name||''),{
    walkIn:true,
    onComplete:()=>{ nestiqRenderApplicationsPage?.(); }
  });
}

function nestiqOpenWalkInApplicationModal(){
  let s=null;
  try{ s=typeof getSession==='function'?getSession():null; }catch(_e){}
  if(!s||s.role!=='landlord'){
    showNotif?.('Sign in as a landlord to add a walk-in application.','info');
    return;
  }
  if(typeof isValidSession==='function'&&!isValidSession(s)){
    showNotif?.('Your session is not valid. Please sign in again.','warning');
    return;
  }
  if(typeof nestiqLandlordAwaitingEmailVerification==='function'&&nestiqLandlordAwaitingEmailVerification()){
    showNotif?.('Verify your email before adding applications.','info');
    return;
  }
  const vacant=nestiqVacantPropertiesForWalkIn();
  if(!vacant.length){
    showNotif?.('No vacant properties available. Mark a unit as vacant first.','warning');
    return;
  }
  const optHtml=vacant.map(p=>{
    const unit=p.unit?` · ${p.unit}`:'';
    return `<option value="${encodeURIComponent(String(p.id))}">${nestiqAppEsc(String(p.name||'Untitled property')+unit)}</option>`;
  }).join('');
  const mc=document.getElementById('modalContent');
  const ov=document.getElementById('modalOverlay');
  if(!mc||!ov) return;
  mc.innerHTML=`
    <h2 class="modal-title">Walk-in Application</h2>
    <p class="modal-sub">Fill in this form on behalf of a prospective tenant applying in person.</p>
    <div class="form-group" style="margin-bottom:12px">
      <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:6px">Vacant property *</label>
      <select class="form-input" id="nestiqWalkInPropertySelect">${optHtml}</select>
    </div>
    <div id="nestiqWalkInWizardRoot" style="max-height:min(70vh,720px);overflow:auto;margin-top:8px"></div>`;
  ov.classList.add('open');
  ov.scrollTop=0;
  const modalBox=ov.querySelector('.modal');
  if(modalBox) modalBox.scrollTop=0;
  const sel=document.getElementById('nestiqWalkInPropertySelect');
  if(sel) sel.addEventListener('change',()=>nestiqRefreshWalkInWizard());
  nestiqRefreshWalkInWizard();
}

function nestiqOpenApplicationLinkModal(propertyId){
  try{
    const list=(typeof propertiesData!=='undefined'&&Array.isArray(propertiesData))?propertiesData:[];
    const p=list.find(x=>String(x.id)===String(propertyId));
    if(!p){ showNotif('Property not found','error'); return; }
    const base=nestiqAppBaseUrlSafe();
    const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():'';
    const landlordIdEnc=encodeURIComponent(String(p.landlordId||lid||''));
    const url=`${base}application.html?property=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.name)}&rent=${encodeURIComponent(Number(p.rent)||0)}&bedrooms=${encodeURIComponent(Number(p.bedrooms)||0)}&addr=${encodeURIComponent(String(p.addr||''))}&leaseEnd=${encodeURIComponent(String(p.leaseEnd||''))}&landlord=${landlordIdEnc}`;
    document.getElementById('modalContent').innerHTML=`
      <h2 class="modal-title">Share Application Link</h2>
      <p class="modal-sub">Prospective tenants can complete this form on any device. Data syncs to this browser’s NestIQ storage until cloud sync is enabled.</p>
      <div class="form-group"><label>Application URL</label>
        <input class="form-input" id="nestiqAppLinkUrl" readonly value="${nestiqAppEsc(url)}"></div>
      <div id="nestiqAppLinkQr" style="margin:12px auto;width:200px;min-height:200px;display:flex;align-items:center;justify-content:center;background:var(--paper);border:1px solid var(--border);border-radius:12px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn-gold btn-sm" onclick="nestiqCopyApplicationLink()">Copy Link</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqDownloadApplicationQr()">Download QR Code</button>
      </div>
      <p class="modal-sub" style="margin-top:14px;font-size:0.8rem">Share via WhatsApp, Property24, social media, or print the QR for an on-site sign.</p>`;
    document.getElementById('modalOverlay').classList.add('open');
    const el=document.getElementById('nestiqAppLinkQr');
    el.innerHTML='';
    try{
      if(typeof QRCode!=='undefined') new QRCode(el,{text:url,width:180,height:180});
      else el.textContent='QR library unavailable';
    }catch(_e){ el.textContent='QR unavailable'; }
  }catch(err){
    console.error(err);
    showNotif('Could not build link','error');
  }
}

function nestiqCopyApplicationLink(){
  const i=document.getElementById('nestiqAppLinkUrl');
  if(!i) return;
  i.select();
  try{
    navigator.clipboard.writeText(i.value);
    showNotif('Link copied','success');
  }catch(_e){
    showNotif('Copy failed — select and copy manually','warning');
  }
}

function nestiqDownloadApplicationQr(){
  const w=document.getElementById('nestiqAppLinkQr');
  if(!w) return;
  const cv=w.querySelector('canvas');
  if(!cv||!cv.toDataURL){ showNotif('No QR to download','warning'); return; }
  const a=document.createElement('a');
  a.href=cv.toDataURL('image/png');
  a.download='nestiq-application-qr.png';
  a.click();
}

function nestiqFindApplication(id){
  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:nestiqAppsReadLsArray();
  return list.find(x=>String(x.id)===String(id));
}

function nestiqLandlordDisplay(){
  try{ return String(landlordName||landlordSettings?.name||'Landlord'); }catch(_e){ return 'Landlord'; }
}

function nestiqOpenApplicationReviewModal(appId){
  const a=nestiqFindApplication(appId);
  if(!a){ showNotif('Application not found','error'); return; }
  nestiqReviewOpenAppId=appId;
  if((a.status||'')==='pending'){
    a.status='reviewing';
    saveData?.();
    nestiqRenderApplicationsPage?.();
    void nestiqPersistApplicationRecordToFirestoreById(appId);
  }
  const income=nestiqIncomeForApp(a);
  const rent=nestiqRentForApp(a);
  const ratio=(rent>0?(income/rent):0).toFixed(2);
  const meets=income>=rent*3&&rent>0;
  const refsOk=(a.references||[]).filter(r=>r.name&&r.phone).length>=2;

  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Application — ${nestiqAppEsc(`${a.firstName||''} ${a.lastName||''}`.trim())}</h2>
    <p class="modal-sub">${nestiqAppEsc(a.id)} · ${nestiqAppEsc(a.propertyName||'')}</p>
    <div class="nestiq-review-tabs">
      <button type="button" class="nestiq-review-tab active" data-tab="overview" onclick="nestiqReviewSwitchTab('overview')">Overview</button>
      <button type="button" class="nestiq-review-tab" data-tab="personal" onclick="nestiqReviewSwitchTab('personal')">Personal</button>
      <button type="button" class="nestiq-review-tab" data-tab="employment" onclick="nestiqReviewSwitchTab('employment')">Employment</button>
      <button type="button" class="nestiq-review-tab" data-tab="financials" onclick="nestiqReviewSwitchTab('financials')">Financials</button>
      <button type="button" class="nestiq-review-tab" data-tab="history" onclick="nestiqReviewSwitchTab('history')">History</button>
      <button type="button" class="nestiq-review-tab" data-tab="references" onclick="nestiqReviewSwitchTab('references')">References</button>
      ${(typeof isGeminiConfigured==='function'&&isGeminiConfigured()) ? `<button type="button" class="nestiq-review-tab" data-tab="ai" onclick="nestiqReviewSwitchTab('ai')">AI Report</button>`:''}
    </div>
    <div id="nestiqReviewPanel"></div>`;
  document.getElementById('modalOverlay').classList.add('open');

  window.__nestiqReviewCtx={a,income,rent,ratio,meets,refsOk};
  nestiqReviewSwitchTab('overview');
}

function nestiqReviewSwitchTab(tab){
  const ctx=window.__nestiqReviewCtx;
  if(!ctx) return;
  const {a,income,rent,ratio,meets,refsOk}=ctx;
  document.querySelectorAll('.nestiq-review-tab').forEach(b=>{
    b.classList.toggle('active',b.dataset.tab===tab);
  });
  const p=document.getElementById('nestiqReviewPanel');
  if(!p) return;

  if(tab==='overview'){
    p.innerHTML=`
      <div class="nestiq-flag-grid">
        ${meets?'<div class="nestiq-flag ok">✅ Income meets requirements (≥ 3×)</div>':'<div class="nestiq-flag bad">❌ Income below threshold (&lt; 3×)</div>'}
        ${!a.previousEviction?'<div class="nestiq-flag ok">✅ No previous evictions declared</div>':'<div class="nestiq-flag bad">❌ Previous eviction declared</div>'}
        ${refsOk?'<div class="nestiq-flag ok">✅ References provided (2+)</div>':'<div class="nestiq-flag warn">⚠️ References incomplete</div>'}
        ${a.hasPets?'<div class="nestiq-flag warn">⚠️ Pets declared</div>':''}
      </div>
      <div class="form-group" style="margin-top:14px"><label>Private notes</label>
        <textarea class="form-input" id="nestiqAppLandlordNotes" rows="3" oninput='nestiqLandlordNotesInput(${JSON.stringify(a.id)},this.value)'>${nestiqAppEsc(a.landlordNotes||'')}</textarea></div>
      ${nestiqApplicationIsOpen(a.status)?`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${JSON.stringify(a.id)})'>Approve Application</button>
        <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick='nestiqApplicationOpenDeclineModal(${JSON.stringify(a.id)})'>Decline Application</button>
        <button type="button" class="btn-outline btn-sm" onclick='nestiqApplicationWaitlist(${JSON.stringify(a.id)});closeModal();'>Add to Waitlist</button>
        <button type="button" class="btn-whatsapp btn-sm" onclick='nestiqAppRequestInfoWa(${JSON.stringify(a.id)})'>Request More Information (WhatsApp)</button>
      </div>`:`
      <div style="margin-top:12px;padding:12px;background:var(--cream);border-radius:10px;font-size:0.88rem">
        ${(a.status||'')==='approved'?((nestiqEnsureApplicationTenantLink(a)||nestiqTenantForApplication(a))
          ?`<strong>Approved</strong>${a.processedDate?` on ${nestiqAppEsc(a.processedDate)}`:''}. Tenant profile exists${(nestiqTenantForApplication(a))?.portalUid?' and portal access is linked':' — send a portal invite from Tenants if they still need a code'}.`
          :`<strong>Approved</strong>${a.processedDate?` on ${nestiqAppEsc(a.processedDate)}`:''}, but no tenant profile was found under <strong>Tenants</strong> for this email. Use <strong>Create tenant & invite</strong> below (a portal login alone is not enough).`):''}
        ${(a.status||'')==='declined'?`<strong>Declined</strong>${a.processedDate?` on ${nestiqAppEsc(a.processedDate)}`:''}.`:''}
        ${(a.status||'')==='waitlisted'?`<strong>On waitlist.</strong> You can still approve this application.`:''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        ${nestiqApplicationCardActionsHtml(a.id,a.status)}
      </div>`}`;
  }else if(tab==='personal'){
    p.innerHTML=`
      <div class="nestiq-dl">${[
        ['Name',`${a.firstName||''} ${a.lastName||''}`],
        ['ID / Passport',nestiqMaskIdNumber(a.idNumber)],
        ['DOB',a.dateOfBirth||'—'],
        ['Nationality',a.nationality||'—'],
        ['Email',a.email||'—'],
        ['Phone',a.phone||'—'],
        ['WhatsApp',a.whatsapp||'—'],
        ['Address',a.currentAddress||'—'],
        ['City',a.currentCity||'—'],
        ['Province',a.currentProvince||'—'],
        ['Time at address',a.timeAtCurrentAddress||'—']
      ].map(([k,v])=>`<div><span class="lbl">${nestiqAppEsc(k)}</span> ${nestiqAppEsc(v)}</div>`).join('')}
      </div>`;
  }else if(tab==='employment'){
    const payslip=a.payslipBase64?`<a class="btn-outline btn-sm" href="${a.payslipBase64}" download="${nestiqAppEsc(a.payslipName||'payslip')}">Download payslip</a>`:'<span class="nestiq-papp-muted">No payslip uploaded</span>';
    p.innerHTML=`
      <div class="nestiq-dl">${[
        ['Status',a.employmentStatus||'—'],
        ['Employer',a.employerName||'—'],
        ['Employer phone',a.employerPhone||'—'],
        ['Job title',a.jobTitle||'—'],
        ['Start date',a.employmentStartDate||'—'],
        ['Gross income',nestiqFormatMoney(a.monthlyGrossIncome)],
        ['Net income',nestiqFormatMoney(a.monthlyNetIncome)]
      ].map(([k,v])=>`<div><span class="lbl">${nestiqAppEsc(k)}</span> ${typeof v==='string'&&v.startsWith('R')?v:nestiqAppEsc(String(v))}</div>`).join('')}
      </div>
      <div style="margin:12px 0">${payslip}</div>
      <div class="nestiq-papp-afford ${meets?'ok':'bad'}" style="margin-top:12px">
        <p>Listing rent: ${nestiqFormatMoney(rent)} · Required (3×): ${nestiqFormatMoney(rent*3)}</p>
        <p>Declared net income: ${nestiqFormatMoney(income)}</p>
        <p><strong>${meets?'Meets requirement':'Does not meet requirement'}</strong></p>
      </div>`;
  }else if(tab==='financials'){
    const debt=Number(a.monthlyDebtRepayments)||0;
    const dti=income>0?((debt/income)*100).toFixed(1):'—';
    const avail=income-debt;
    p.innerHTML=`
      <div class="nestiq-dl">${[
        ['Bank account',a.hasBankAccount?'Yes':'No'],
        ['Bank name',a.bankName||'—'],
        ['Outstanding debt',a.hasOutstandingDebt?'Yes':'No'],
        ['Monthly debt repayments',nestiqFormatMoney(debt)],
        ['Credit (self)',a.creditScore||'—']
      ].map(([k,v])=>`<div><span class="lbl">${nestiqAppEsc(k)}</span> ${nestiqAppEsc(String(v))}</div>`).join('')}
      </div>
      <div class="nestiq-papp-card" style="margin-top:12px;padding:12px">
        <p><strong>Debt-to-income:</strong> ${dti}%</p>
        <p>Available after debt: ${nestiqFormatMoney(avail)} · Required for rent: ${nestiqFormatMoney(rent)}</p>
      </div>`;
  }else if(tab==='history'){
    p.innerHTML=`
      <div class="nestiq-dl">${[
        ['Current landlord',a.currentLandlordName||'—'],
        ['Landlord phone',a.currentLandlordPhone||'—'],
        ['Current rent',nestiqFormatMoney(a.currentMonthlyRent)],
        ['Reason for moving',a.reasonForMoving||'—'],
        ['Previous address',a.previousAddress||'—']
      ].map(([k,v])=>`<div><span class="lbl">${nestiqAppEsc(k)}</span> ${nestiqAppEsc(String(v))}</div>`).join('')}
      </div>
      ${a.previousEviction?`<div class="nestiq-eviction-box"><strong>Eviction declared</strong><p>${nestiqAppEsc(a.evictionDetails||'')}</p></div>`:''}`;
  }else if(tab==='references'){
    p.innerHTML=(a.references||[]).map((r,i)=>`
      <div class="nestiq-ref-row">
        <div><strong>${nestiqAppEsc(r.name||'Ref '+(i+1))}</strong> · ${nestiqAppEsc(r.relationship||'—')}<br><span class="nestiq-papp-muted">${nestiqAppEsc(r.phone||'')} ${nestiqAppEsc(r.email||'')}</span></div>
        <button type="button" class="btn-whatsapp btn-sm" onclick='nestiqApplicationRefWa(${JSON.stringify(a.id)},${i})'>WhatsApp</button>
      </div>`).join('')||'<p class="nestiq-papp-muted">No references</p>';
  }else if(tab==='ai'){
    const gem=typeof isGeminiConfigured==='function'&&isGeminiConfigured();
    if(!gem){
      p.innerHTML='<p class="nestiq-papp-muted">Configure Gemini in Settings to run AI screening.</p>';
      return;
    }
    const hasRun=a.aiScore!=null;
    p.innerHTML=`
      ${hasRun?`
        <div class="nestiq-ai-report">
          <p><span class="nestiq-ai-score ${nestiqAiScoreBadgeClass(a.aiScore)}">${Math.round(a.aiScore)}/100</span>
          <span class="badge badge-amber">${nestiqAppEsc(a.aiRiskLevel||'—')}</span></p>
          <p><strong>Recommendation:</strong> ${nestiqAppEsc(a.aiRecommendation||'—')}</p>
          <p><strong>Summary:</strong> ${nestiqAppEsc(a.aiSummary||'—')}</p>
          ${(a.aiKeyFlags||[]).length?`<p><strong>Flags:</strong> ${(a.aiKeyFlags||[]).map(nestiqAppEsc).join(', ')}</p>`:''}
          ${(a.aiConditions||[]).length?`<p><strong>Conditions:</strong></p><ul>${(a.aiConditions||[]).map(x=>`<li>${nestiqAppEsc(x)}</li>`).join('')}</ul>`:''}
        </div>`:''}
      <button type="button" class="btn-gold btn-sm" style="margin-top:10px" onclick='nestiqRunApplicationAiScreen(${JSON.stringify(a.id)})'>${hasRun?'Re-run AI Screening':'Run AI Screening'}</button>
      <div id="nestiqAppAiBusy" style="display:none;margin-top:8px">${typeof aiLoadingHtml==='function'?aiLoadingHtml():'Thinking…'}</div>`;
  }
}

function nestiqApplicationRefWa(appId, refIdx){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const r=(a.references||[])[refIdx];
  if(!r) return;
  const applicant=`${a.firstName||''} ${a.lastName||''}`.trim();
  const ll=nestiqLandlordDisplay();
  const msg=`Hi ${r.name||'there'}, I am calling about ${applicant} who has applied to rent a property from me and listed you as a reference. Would you be willing to answer a few questions? — ${ll}`;
  const ph=typeof formatWhatsAppNumber==='function'?formatWhatsAppNumber(r.phone):String(r.phone||'').replace(/\D/g,'');
  if(typeof openWhatsAppChat==='function') openWhatsAppChat(ph,msg);
}

function nestiqLandlordNotesInput(appId,val){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  a.landlordNotes=val;
  clearTimeout(nestiqNotesTimer);
  nestiqNotesTimer=setTimeout(()=>{
    try{ saveData(); }catch(_e){}
    void nestiqPersistApplicationRecordToFirestoreById(appId);
  },500);
}

function nestiqAppRequestInfoWa(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const msg=`Hi ${a.firstName||'there'}, this is ${nestiqLandlordDisplay()} regarding your rental application for ${a.propertyName||'our property'}. Could you please send any additional information we requested? Thank you.`;
  const ph=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
  openWhatsAppChat?.(ph,msg);
}

async function nestiqRunApplicationAiScreen(appId){
  const a=nestiqFindApplication(appId);
  if(!a||typeof callGeminiJson!=='function') return;
  const busy=document.getElementById('nestiqAppAiBusy');
  if(busy) busy.style.display='block';
  const income=nestiqIncomeForApp(a);
  const rent=nestiqRentForApp(a);
  const ratio=rent>0?(income/rent).toFixed(2):'n/a';
  const prompt=`Screen this rental application. Return ONLY valid JSON, no markdown.
Monthly Rent: R${rent}
Monthly Income (net preferred): R${income}
Income Ratio: ${ratio}x
Employment: ${a.employmentStatus} at ${a.employerName||'n/a'} since ${a.employmentStartDate||'n/a'}
Eviction history: ${a.previousEviction?'yes':'no'} ${a.evictionDetails||''}
Pets: ${a.hasPets?'yes':'no'} ${a.petDetails||''}
Debt repayments: R${a.monthlyDebtRepayments||0}/month
References: ${(a.references||[]).length}
Credit (self-assessed): ${a.creditScore||'unknown'}

JSON shape:
{"score":0-100,"riskLevel":"low|medium|high","recommendation":"string","keyFlags":["string"],"summary":"string","conditions":["string"]}`;
  try{
    const res=await callGeminiJson(prompt,`app-screen:${appId}`);
    if(res&&res.ok&&res.data){
      const d=res.data;
      a.aiScore=Math.min(100,Math.max(0,Number(d.score)||0));
      a.aiRiskLevel=String(d.riskLevel||'');
      a.aiRecommendation=String(d.recommendation||'');
      a.aiKeyFlags=Array.isArray(d.keyFlags)?d.keyFlags.map(String):[];
      a.aiSummary=String(d.summary||'');
      a.aiConditions=Array.isArray(d.conditions)?d.conditions.map(String):[];
      saveData?.();
      void nestiqPersistApplicationRecordToFirestoreById(appId);
      nestiqReviewSwitchTab('ai');
      nestiqRenderApplicationsPage?.();
    }else showNotif('AI response unclear — try again','warning');
  }catch(_e){
    showNotif('AI failed','error');
  }finally{
    if(busy) busy.style.display='none';
  }
}

function nestiqApplicationOpenApproveModal(appId){
  const a=nestiqFindApplication(appId);
  if(!a){ showNotif('Application not found','error'); return; }
  if((a.status||'')==='approved'&&nestiqTenantForApplication(a)){
    // Re-sync — tenant may only exist in memory after a failed cloud write.
    void (async()=>{
      const t=nestiqTenantForApplication(a);
      if(!t) return;
      a.linkedTenantId=t.id;
      try{
        showNotif('Re-saving tenant to the cloud…','info');
        if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
          await window.nestiqPersistSingleTenantToFirestore(t);
        }else if(window.nestiqUseFirestore&&typeof window.nestiqCreateTenantDocInFirestore==='function'){
          const fireId=await window.nestiqCreateTenantDocInFirestore(t);
          t.id=fireId;
          a.linkedTenantId=fireId;
        }else if(window.nestiqUseFirestore){
          throw new Error('App outdated — hard refresh (Ctrl+F5)');
        }
        await nestiqPersistApplicationRecordToFirestoreById(appId);
        showNotif('Tenant re-saved to cloud. Refresh to confirm it stays.','success');
        nestiqRenderApplicationsPage?.();
        try{ renderTenants?.(); }catch(_e){}
      }catch(e){
        console.error(e);
        // Drop ghost local tenant so the UI returns to Create tenant & invite.
        try{
          if(Array.isArray(tenantsData)){
            const ix=tenantsData.findIndex(x=>String(x.id)===String(t.id));
            if(ix>=0) tenantsData.splice(ix,1);
          }
          a.linkedTenantId=null;
          window.nestiqBindWindowDataArrays?.();
          nestiqRenderApplicationsPage?.();
          renderTenants?.();
        }catch(_e2){}
        showNotif('Tenant was only on this screen (not saved to cloud): '+(e?.message||'unknown')+'. Use Create tenant & invite again.','error');
      }
    })();
    return;
  }
  if((a.status||'')==='declined'){
    showNotif('This application was declined. Re-open it from waitlist or add a new application if needed.','info');
    return;
  }
  const recovering=(a.status||'')==='approved'&&!nestiqTenantForApplication(a);
  const rent=nestiqRentForApp(a);
  const dep=Math.round(rent*2);
  const today=new Date().toISOString().slice(0,10);
  const end=new Date(); end.setFullYear(end.getFullYear()+1);
  const endStr=end.toISOString().slice(0,10);
  const name=`${a.firstName||''} ${a.lastName||''}`.trim();
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${recovering?'Create Tenant From Application':'Approve Application'} — ${nestiqAppEsc(name)}</h2>
    <p class="modal-sub">${nestiqAppEsc(a.propertyName||'')} · ${nestiqFormatMoney(rent)}${recovering?' · Application is approved but no tenant profile exists yet':''}</p>
    <div class="nestiq-papp-grid2">
      <div class="form-group"><label>Move-in date</label><input class="form-input" type="date" id="nestiqApprMoveIn" value="${today}"></div>
      <div class="form-group"><label>Lease start</label><input class="form-input" type="date" id="nestiqApprLeaseStart" value="${today}"></div>
      <div class="form-group"><label>Lease end</label><input class="form-input" type="date" id="nestiqApprLeaseEnd" value="${endStr}"></div>
      <div class="form-group"><label>Monthly rent (R)</label><input class="form-input" type="number" id="nestiqApprRent" value="${rent}"></div>
      <div class="form-group"><label>Deposit (R)</label><input class="form-input" type="number" id="nestiqApprDeposit" value="${dep}"></div>
      <div class="form-group"><label>Unit number / label</label><input class="form-input" id="nestiqApprUnit" placeholder="e.g. Unit 4B" value="Unit"></div>
    </div>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:16px;min-height:44px" onclick='nestiqApplicationConfirmApprove(${JSON.stringify(appId)})'>${recovering?'Create Tenant & Invitation':'Approve and Create Tenant'}</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function nestiqApplicationConfirmApprove(appId){
  const a=nestiqFindApplication(appId);
  if(!a){ showNotif('Application not found','error'); return; }
  const lid=typeof nestiqCurrentLandlordUid==='function'?nestiqCurrentLandlordUid():(firebase?.auth?.()?.currentUser?.uid||null);
  if((a.status||'')==='approved'&&nestiqTenantForApplication(a)){
    const t=nestiqTenantForApplication(a);
    a.linkedTenantId=t.id;
    try{
      if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
        await window.nestiqPersistSingleTenantToFirestore(t);
      }
      await nestiqPersistApplicationRecordToFirestoreById(appId);
      showNotif('Tenant already linked — re-saved to cloud. Refresh to confirm it stays.','success');
    }catch(e){
      console.error(e);
      showNotif('Cloud save failed: '+(e?.message||'unknown'),'error');
    }
    nestiqRenderApplicationsPage?.();
    return;
  }
  const emailLc=String(a.email||'').trim().toLowerCase();
  if(!emailLc){ showNotif('Application has no email — cannot create tenant login','error'); return; }
  const prop=propertiesData.find(p=>String(p.id)===String(a.propertyId))
    ||propertiesData.find(p=>Number(p.id)===Number(a.propertyId)&&Number.isFinite(Number(a.propertyId)));
  const propName=prop?.name||a.propertyName;
  const existingTenant=nestiqTenantForApplication(a)||tenantsData.find(t=>
    String(t.applicationId||'')===String(a.id)
    || (String(t.email||'').toLowerCase()===emailLc&&String(t.propertyId||t.property||'')===String(prop?.id||a.propertyId||propName))
  );
  if(existingTenant){
    a.status='approved';
    a.processedDate=a.processedDate||new Date().toISOString().slice(0,10);
    a.processedBy=a.processedBy||nestiqLandlordDisplay();
    a.linkedTenantId=existingTenant.id;
    if(!existingTenant.applicationId) existingTenant.applicationId=a.id;
    if(lid&&!existingTenant.landlordId) existingTenant.landlordId=lid;
    try{
      if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
        await window.nestiqPersistSingleTenantToFirestore(existingTenant);
      }else if(window.nestiqUseFirestore&&typeof window.nestiqCreateTenantDocInFirestore==='function'&&!existingTenant.id){
        const fireId=await window.nestiqCreateTenantDocInFirestore(existingTenant);
        existingTenant.id=fireId;
        a.linkedTenantId=fireId;
      }
    }catch(e){
      console.error(e);
      showNotif?.('Could not save existing tenant to the cloud: '+(e?.message||'unknown'),'error');
      return;
    }
    const ok=await nestiqPersistApplicationRecordToFirestoreById(appId);
    closeModal?.();
    nestiqRenderApplicationsPage?.();
    showNotif(ok?'Application linked to existing tenant record.':'Application updated locally; cloud sync failed — refresh and try again.','success');
    return;
  }
  const moveIn=document.getElementById('nestiqApprMoveIn')?.value||'';
  const ls=document.getElementById('nestiqApprLeaseStart')?.value||'';
  const le=document.getElementById('nestiqApprLeaseEnd')?.value||'';
  const monthlyRent=Number(document.getElementById('nestiqApprRent')?.value)||0;
  const depositAmt=Number(document.getElementById('nestiqApprDeposit')?.value)||0;
  const unit=(document.getElementById('nestiqApprUnit')?.value||'Unit').trim()||'Unit';
  const name=`${a.firstName||''} ${a.lastName||''}`.trim();

  if(lid) a.listingLandlordId=a.listingLandlordId||lid;

  const leaseLabel=le?new Date(le+'T12:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'TBD';
  const baseTenant={
    name,
    property:propName,
    propertyId:prop?.id||a.propertyId,
    unit,
    rent:monthlyRent,
    status:'paid',
    lease:leaseLabel,
    leaseStart:ls||moveIn||new Date().toISOString().slice(0,10),
    leaseEnd:le||'2026-12-31',
    monthlyDueDate:1,
    payments:[],
    phone:a.phone||'',
    email:emailLc,
    avatar:'👤',
    notes:`From application ${a.id}.`,
    landlordId:lid||undefined,
    hasPortalAccess:false,
    firstLogin:false,
    deposit:typeof nestiqNormalizeTenantDeposit==='function'
      ?nestiqNormalizeTenantDeposit({amount:depositAmt,collected:false,status:'pending'},monthlyRent)
      :depositAmt,
    applicationId:a.id
  };

  let newTenant={ ...baseTenant, id:tenantNextId++ };
  let cloudSaved=false;
  if(window.nestiqUseFirestore){
    if(typeof window.nestiqCreateTenantDocInFirestore!=='function'&&typeof window.nestiqPersistSingleTenantToFirestore!=='function'){
      showNotif?.('App is outdated in this browser cache. Press Ctrl+F5 to hard-refresh, then try again.','error');
      return;
    }
    try{
      showNotif?.('Saving tenant to cloud…','info');
      if(typeof window.nestiqCreateTenantDocInFirestore==='function'){
        const fireId=await window.nestiqCreateTenantDocInFirestore(baseTenant);
        newTenant={ ...baseTenant, id:fireId, landlordId:lid||baseTenant.landlordId };
      }else{
        await window.nestiqPersistSingleTenantToFirestore(newTenant);
      }
      cloudSaved=true;
    }catch(e){
      console.error('NestIQ: tenant Firestore create on approve', e);
      showNotif?.('Could not save tenant to the cloud: '+(e?.message||'unknown error')+'. Hard-refresh (Ctrl+F5) and try again while signed in as landlord.','error');
      return;
    }
    if(!cloudSaved){
      showNotif?.('Tenant was not saved to the cloud. Nothing was approved.','error');
      return;
    }
  }

  // Only mark approved after the tenant actually exists in cloud (or local-only mode).
  a.status='approved';
  a.processedDate=new Date().toISOString().slice(0,10);
  a.processedBy=nestiqLandlordDisplay();
  a.linkedTenantId=newTenant.id;

  if(!Array.isArray(tenantsData)) tenantsData=[];
  if(!tenantsData.some(t=>String(t.id)===String(newTenant.id))){
    tenantsData.push(newTenant);
  }
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  if(prop) prop.status='occupied';
  saveData?.();
  const persisted=await nestiqPersistApplicationRecordToFirestoreById(appId);
  if(!persisted&&window.nestiqUseFirestore){
    showNotif?.('Tenant created, but application status could not sync to the cloud. Refresh the page; if it still shows Pending, open the application and contact support.','warning');
  }

  let inv=null;
  if(window.nestiqUseFirestore){
    try{
      if(typeof window.nestiqAfterTenantAddedFlow==='function'){
        inv=await window.nestiqAfterTenantAddedFlow(newTenant,{ sendEmail:true, fromApprove:true, showModal:false });
      }else if(typeof window.nestiqCreateInvitationRecord==='function'){
        inv=await window.nestiqCreateInvitationRecord({
          tenantId:newTenant.id,
          tenantName:newTenant.name||'',
          tenantEmail:emailLc,
          propertyId:newTenant.propertyId,
          propertyName:propName||'',
          landlordName:nestiqLandlordDisplay(),
          skipEmail:false
        });
      }
    }catch(e){
      console.warn('NestIQ: portal invitation on approve', e);
      showNotif?.('Tenant approved, but portal invitation could not be created. Use Tenants → Portal invitations.','warning');
    }
  }

  closeModal?.();
  try{ renderTenants?.(); }catch(_e){}
  try{ renderProperties?.(); }catch(_e){}
  nestiqRenderApplicationsPage?.();
  showNotif(`✅ ${name} approved and added as tenant`+(inv?.code?` · Invite code ${inv.code}`:''),'success');

  const base=(typeof nestiqAppBaseUrlSafe==='function'?nestiqAppBaseUrlSafe():String(location.origin||'')+'/').replace(/\/?$/,'/');
  let portalBlock='';
  const inviteCode=String(inv?.code||'').trim();
  if(inviteCode){
    const link=`${base}?invite=${encodeURIComponent(inviteCode)}`;
    portalBlock=`*Tenant portal access*\nInvitation code: ${inviteCode}\nOpen ${link}\nChoose "I am a tenant", enter this code, then sign up with ${emailLc}.`;
  }else if(window.nestiqUseFirestore){
    portalBlock='*Tenant portal*\nAn invitation code could not be created automatically. Ask your landlord for a portal invite from NestIQ → Tenants.';
  }
  const msg=[
    `Dear ${a.firstName||name},`,
    ``,
    `Congratulations — your application to rent *${propName}* has been approved.`,
    ``,
    `• Move-in date: ${moveIn}`,
    `• Monthly rent: ${nestiqFormatMoney(monthlyRent)}`,
    `• Deposit required: ${nestiqFormatMoney(depositAmt)}`,
    ``,
    `We will be in contact shortly with your lease agreement.`,
    `Welcome to ${propName}!`,
    ...(portalBlock?[``,portalBlock]:[]),
    ``,
    `— ${nestiqLandlordDisplay()}`
  ].join('\n');
  const ph=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
  if(ph) openWhatsAppChat?.(ph,msg);
  else if(inviteCode){
    // No WhatsApp number — still show the code to the landlord.
    try{ window.nestiqShowInvitationCreatedModal?.(inv, newTenant); }catch(_e){}
  }
}

function nestiqApplicationOpenDeclineModal(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const name=`${a.firstName||''} ${a.lastName||''}`.trim();
  const reasons=[
    ['inc','Income does not meet requirements'],
    ['ev','Previous eviction history'],
    ['ref','Unable to verify references'],
    ['nav','Property no longer available'],
    ['othsel','Another application was selected'],
    ['cred','Credit concerns'],
    ['oth','Other (specify in notes)']
  ];
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Decline — ${nestiqAppEsc(name)}</h2>
    <div class="form-group"><label>Reasons</label>
      ${reasons.map(([k,l])=>`<label class="nestiq-papp-check"><input type="checkbox" class="nestiq-decline-reason" value="${k}"> ${nestiqAppEsc(l)}</label>`).join('<br>')}
    </div>
    <div class="form-group"><label>Additional notes (private)</label><textarea class="form-input" id="nestiqDeclineNotes" rows="3"></textarea></div>
    <label class="nestiq-papp-check"><input type="checkbox" id="nestiqDeclineSendWa" checked> Send decline notification via WhatsApp</label>
    <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:14px;border-color:var(--rust);color:var(--rust);min-height:44px" onclick='nestiqApplicationConfirmDecline(${JSON.stringify(appId)})'>Confirm Decline</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function nestiqApplicationConfirmDecline(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const checked=[...document.querySelectorAll('.nestiq-decline-reason:checked')].map(x=>x.value);
  const reasonLabels={inc:'Income does not meet requirements',ev:'Previous eviction history',ref:'Unable to verify references',nav:'Property no longer available',othsel:'Another application was selected',cred:'Credit concerns',oth:'Other'};
  const notes=document.getElementById('nestiqDeclineNotes')?.value||'';
  const sendWa=document.getElementById('nestiqDeclineSendWa')?.checked!==false;
  a.status='declined';
  a.processedDate=new Date().toISOString().slice(0,10);
  a.processedBy=nestiqLandlordDisplay();
  a.declineReasons=checked.map(c=>reasonLabels[c]||c);
  a.declineNotes=notes;
  saveData?.();
  await nestiqPersistApplicationRecordToFirestoreById(appId);
  closeModal?.();
  nestiqRenderApplicationsPage?.();
  showNotif('Application declined','success');
  if(sendWa){
    const msg=`Dear ${a.firstName||'applicant'}, thank you for your application to rent ${a.propertyName||'our property'}.\nAfter careful consideration we regret to inform you that your application has been unsuccessful at this time.\nWe wish you all the best in finding a suitable property.\n— ${nestiqLandlordDisplay()}`;
    const ph=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
    if(ph) openWhatsAppChat?.(ph,msg);
  }
}

async function nestiqApplicationWaitlist(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  a.status='waitlisted';
  a.processedDate=new Date().toISOString().slice(0,10);
  a.processedBy=nestiqLandlordDisplay();
  saveData?.();
  await nestiqPersistApplicationRecordToFirestoreById(appId);
  closeModal?.();
  nestiqRenderApplicationsPage?.();
  showNotif('Application moved to waitlist','success');
}

function nestiqMountApplicationsShell(){
  const pub=document.getElementById('nestiqPublicApplicationRoot');
  const land=document.getElementById('nestiqLandlordApplicationsSection');
  if(!pub||!land){
    nestiqInitPublicApplicationPage();
    nestiqRenderApplicationsPage();
    return;
  }
  const s=(typeof getSession==='function')?getSession():null;
  const landlordOk=s&&s.role==='landlord'&&(typeof isValidSession!=='function'||isValidSession(s));
  const params=new URLSearchParams(location.search);
  const propParam=String(params.get('property')||'').trim();
  const applyFlag=params.get('apply')==='1'||params.get('apply')==='true';
  const wantPublic=propParam!==''&&(!landlordOk||applyFlag);
  if(wantPublic){
    land.style.display='none';
    pub.style.display='block';
    nestiqInitPublicApplicationPage();
  }else{
    pub.style.display='none';
    land.style.display='block';
    nestiqRenderApplicationsPage();
  }
}

/* init */
window.nestiqMountApplicationsShell=nestiqMountApplicationsShell;

window.nestiqStopApplicationsFirestoreListener=nestiqStopApplicationsFirestoreListener;
window.nestiqEnsureApplicationsFirestoreListener=nestiqEnsureApplicationsFirestoreListener;
window.nestiqUpdateApplicationsBadge=nestiqUpdateApplicationsBadge;
window.nestiqSyncPublicApplicationsToLandlord=nestiqSyncPublicApplicationsToLandlord;
window.nestiqInitPublicApplicationPage=nestiqInitPublicApplicationPage;
window.nestiqRenderApplicationsPage=nestiqRenderApplicationsPage;
window.nestiqApplicationsSetFilter=nestiqApplicationsSetFilter;
window.nestiqOpenWalkInApplicationModal=nestiqOpenWalkInApplicationModal;
window.nestiqOpenApplicationLinkModal=nestiqOpenApplicationLinkModal;
window.nestiqOpenApplicationReviewModal=nestiqOpenApplicationReviewModal;
window.nestiqReviewSwitchTab=nestiqReviewSwitchTab;
window.nestiqLandlordNotesInput=nestiqLandlordNotesInput;
window.nestiqRunApplicationAiScreen=nestiqRunApplicationAiScreen;
window.nestiqApplicationOpenApproveModal=nestiqApplicationOpenApproveModal;
window.nestiqApplicationConfirmApprove=nestiqApplicationConfirmApprove;
window.nestiqApplicationOpenDeclineModal=nestiqApplicationOpenDeclineModal;
window.nestiqApplicationConfirmDecline=nestiqApplicationConfirmDecline;
window.nestiqApplicationWaitlist=nestiqApplicationWaitlist;
window.nestiqCopyApplicationLink=nestiqCopyApplicationLink;
window.nestiqDownloadApplicationQr=nestiqDownloadApplicationQr;
window.nestiqAppRequestInfoWa=nestiqAppRequestInfoWa;
window.nestiqApplicationRefWa=nestiqApplicationRefWa;
})();
