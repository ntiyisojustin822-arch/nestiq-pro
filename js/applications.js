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

function nestiqApplicantPhotoUrl(a){
  const s=String(a?.profilePhoto||a?.photoUrl||a?.photoURL||'').trim();
  if(/^https?:\/\//i.test(s)||s.startsWith('data:image/')) return s;
  return '';
}

function nestiqApplicantAvatarHtml(a, sizePx){
  const size=Number(sizePx)||44;
  const url=nestiqApplicantPhotoUrl(a);
  const name=`${a?.firstName||''} ${a?.lastName||''}`.trim()||String(a?.name||'Applicant');
  const initial=(name.slice(0,1)||'A').toUpperCase();
  const cls=size>=60?'nestiq-app-avatar nestiq-app-avatar--lg':'nestiq-app-avatar';
  if(url){
    return `<span class="${cls}" style="width:${size}px;height:${size}px"><img src="${nestiqAppEsc(url)}" alt="" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="${cls} nestiq-app-avatar--fallback" style="width:${size}px;height:${size}px">${nestiqAppEsc(initial)}</span>`;
}

/** Signed-in (non-anonymous) tenant applicant profile for public apply / listings. */
async function nestiqResolveSignedInApplicantProfile(){
  let u=null;
  try{
    if(typeof firebase!=='undefined'&&firebase.auth){
      u=firebase.auth().currentUser;
      if(!u){
        u=await new Promise(resolve=>{
          const t=setTimeout(()=>resolve(null),2500);
          const unsub=firebase.auth().onAuthStateChanged(user=>{
            clearTimeout(t); unsub(); resolve(user||null);
          });
        });
      }
    }
  }catch(_e){}
  if(!u||u.isAnonymous) return null;
  let sess=null;
  try{ sess=(typeof getSession==='function')?getSession():JSON.parse(sessionStorage.getItem('nestiq-session')||'null'); }catch(_e){}
  if(sess&&sess.role==='landlord') return null;
  let name=String(sess?.name||u.displayName||'').trim();
  let email=String(sess?.email||u.email||'').trim().toLowerCase();
  let phone=String(sess?.phone||'').trim();
  let profilePhoto=String(sess?.profilePhoto||u.photoURL||'').trim();
  try{
    const db=window.nestiqDb||(typeof firebase!=='undefined'?firebase.firestore():null);
    if(db){
      const acctRef=window.nestiqFs?.tenantAccount?.(db, u.uid)||db.collection('tenantAccounts').doc(u.uid);
      const snap=await acctRef.get();
      if(snap.exists){
        const d=snap.data()||{};
        if(d.name) name=String(d.name).trim();
        if(d.email) email=String(d.email).trim().toLowerCase();
        if(d.phone) phone=String(d.phone).trim();
        if(d.profilePhoto) profilePhoto=String(d.profilePhoto).trim();
      }
      if(!name||!phone||!profilePhoto){
        const us=await db.collection('users').doc(u.uid).get();
        if(us.exists){
          const d=us.data()||{};
          if(!name&&d.name) name=String(d.name).trim();
          if(!phone&&d.phone) phone=String(d.phone).trim();
          if(!email&&d.email) email=String(d.email).trim().toLowerCase();
          if(!profilePhoto&&d.profilePhoto) profilePhoto=String(d.profilePhoto).trim();
        }
      }
    }
  }catch(_e){}
  const parts=name.split(/\s+/).filter(Boolean);
  const firstName=parts[0]||'';
  const lastName=parts.slice(1).join(' ')||'';
  if(profilePhoto && !(/^https?:\/\//i.test(profilePhoto)||profilePhoto.startsWith('data:image/'))){
    profilePhoto='';
  }
  return{
    uid:u.uid,
    name,
    firstName,
    lastName,
    email,
    phone,
    profilePhoto,
    locked:true,
    hasPortalAccount:true
  };
}
window.nestiqResolveSignedInApplicantProfile=nestiqResolveSignedInApplicantProfile;

function nestiqReadFavouritesLocal(){
  try{
    const parsed=JSON.parse(localStorage.getItem('nestiq_favourites')||'[]');
    if(!Array.isArray(parsed)) return [];
    const seen=new Set();
    const out=[];
    parsed.forEach(id=>{
      const s=String(id==null?'':id).trim();
      if(!s||seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }catch(_e){
    return [];
  }
}
window.nestiqReadFavouritesLocal=nestiqReadFavouritesLocal;

/** Ensure landlords/{lid}/tenants/{uid} stub exists for a self-registered applicant. */
async function nestiqEnsureApplicantTenantStub(listingLandlordId, profile){
  const lid=String(listingLandlordId||'').trim();
  const uid=String(profile?.uid||'').trim();
  if(!lid||!uid||!window.nestiqDb) return null;
  const db=window.nestiqDb;
  const tRef=window.nestiqFs?.tenants?.(db, lid)?.doc(uid)
    || db.collection('landlords').doc(lid).collection('tenants').doc(uid);
  const row={
    id:uid,
    tenantId:uid,
    portalUid:uid,
    landlordId:lid,
    name:String(profile.name||'').trim(),
    email:String(profile.email||'').trim().toLowerCase(),
    phone:String(profile.phone||'').trim(),
    status:'unassigned',
    propertyId:null,
    property:'',
    unit:'',
    rent:0,
    hasPortalAccess:false,
    portalEmail:String(profile.email||'').trim().toLowerCase(),
    selfRegistered:true,
    firstLogin:false
  };
  const favs=(typeof window.nestiqReadFavouritesLocal==='function'?window.nestiqReadFavouritesLocal():nestiqReadFavouritesLocal());
  if(favs.length) row.favourites=favs;
  const photo=String(profile.profilePhoto||'').trim();
  if(/^https?:\/\//i.test(photo)) row.profilePhoto=photo;
  await tRef.set(row,{ merge:true });
  try{
    const acct=window.nestiqFs?.tenantAccount?.(db, uid)||db.collection('tenantAccounts').doc(uid);
    await acct.set({
      landlordId:lid,
      tenantId:uid,
      propertyId:'',
      status:'unassigned',
      selfRegistered:true,
      name:row.name,
      email:row.email,
      phone:row.phone,
      ...(favs.length?{ favourites:favs }:{}),
      ...(row.profilePhoto?{ profilePhoto:row.profilePhoto }:{})
    },{ merge:true });
  }catch(_e){}
  try{
    await db.collection('users').doc(uid).set({
      role:'tenant',
      landlordId:lid,
      tenantDocId:uid,
      status:'unassigned',
      selfRegistered:true,
      name:row.name,
      email:row.email,
      phone:row.phone
    },{ merge:true });
  }catch(_e){}
  try{
    if(window.nestiqTenantSession){
      window.nestiqTenantSession.landlordId=lid;
      window.nestiqTenantSession.tenantId=window.nestiqTenantSession.tenantId||uid;
    }
    const s=(typeof getSession==='function')?getSession():null;
    if(s&&s.role==='tenant'){
      s.landlordId=lid;
      s.tenantDocId=s.tenantDocId||uid;
      s.userId=s.userId||uid;
      try{
        sessionStorage.setItem('nestiq-session',JSON.stringify(s));
        window.__nestiqSession=s;
      }catch(_e){}
    }
  }catch(_e){}
  try{ await window.nestiqFavMergeOnTenantLogin?.(); }catch(_e){}
  return row;
}
window.nestiqEnsureApplicantTenantStub=nestiqEnsureApplicantTenantStub;

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
let __nestiqAppsPublicPoll=null;
let __nestiqAppsIngestTimer=null;
let __nestiqAppsIngestBusy=false;

function nestiqApplicationsFromFirestoreDoc(doc){
  const d=doc.data();
  if(!d||typeof d!=='object') return null;
  const id=String(d.id||doc.id||'').trim();
  if(!id) return null;
  return {...d,id};
}

const NESTIQ_APP_STATUS_RANK={pending:1,reviewing:2,info_required:2,waitlisted:3,approved:4,declined:4};

function nestiqApplicationStatusRank(st){
  return NESTIQ_APP_STATUS_RANK[String(st||'pending').toLowerCase()]||0;
}

function nestiqMergeApplicationStatus(curSt,incomingSt){
  const cur=String(curSt||'pending').toLowerCase();
  const inc=String(incomingSt||cur||'pending').toLowerCase();
  const curR=nestiqApplicationStatusRank(cur);
  const incR=nestiqApplicationStatusRank(inc);
  // A decision (approved / declined) always beats pending / reviewing copies.
  if(curR>=4 || incR>=4) return incR>=curR?inc:cur;
  if(inc==='info_required' && curR<3) return inc;
  if(cur==='info_required' && inc==='reviewing') return inc;
  if(cur==='info_required' && incR<2) return cur;
  return incR>=curR?inc:cur;
}

function nestiqMergeApplicationRows(cur,incoming){
  if(!cur) return incoming?{...incoming}:null;
  if(!incoming) return {...cur};
  const status=nestiqMergeApplicationStatus(cur.status,incoming.status);
  const merged={...cur,...incoming};
  merged.status=status;
  if(status==='approved'||status==='declined'){
    merged.processedDate=cur.processedDate||incoming.processedDate||merged.processedDate||'';
    merged.processedBy=cur.processedBy||incoming.processedBy||merged.processedBy||'';
    merged.linkedTenantId=cur.linkedTenantId||incoming.linkedTenantId||merged.linkedTenantId||null;
  }
  if(!merged.processedDate&&incoming.processedDate) merged.processedDate=incoming.processedDate;
  if(!merged.processedBy&&incoming.processedBy) merged.processedBy=incoming.processedBy;
  if(!merged.linkedTenantId&&incoming.linkedTenantId) merged.linkedTenantId=incoming.linkedTenantId;
  if(!merged.linkedTenantId&&cur.linkedTenantId) merged.linkedTenantId=cur.linkedTenantId;
  return merged;
}

/** Remote rows first, then local overlays; terminal statuses (approved/declined) are never downgraded. */
function nestiqMergeApplicationListsById(remoteArr, localArr){
  const m=new Map();
  const put=(a)=>{
    if(!a||!a.id) return;
    const id=String(a.id);
    const cur=m.get(id);
    m.set(id, nestiqMergeApplicationRows(cur, a));
  };
  // Merge both remote sources by id — never let a stale public "pending" overwrite landlord "approved".
  (remoteArr||[]).forEach(put);
  (localArr||[]).forEach(put);
  return Array.from(m.values());
}

function nestiqApplicationIsOpen(st){
  const s=String(st||'pending').toLowerCase();
  return s==='pending'||s==='reviewing'||s==='info_required';
}

function nestiqPrettyAppDate(raw){
  const s=String(raw||'').slice(0,10);
  if(!s) return '—';
  const d=new Date(s+'T12:00:00');
  if(String(d)==='Invalid Date') return s;
  return d.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
}

function nestiqApplicationSubmittedDocs(a){
  const docs=[];
  if(a?.idDocumentName||a?.idDocumentBase64){
    docs.push({label:'Identity document', name:a.idDocumentName||'ID document', url:a.idDocumentBase64||''});
  }
  if(a?.payslipName||a?.payslipBase64){
    docs.push({label:'Proof of income', name:a.payslipName||'Payslip', url:a.payslipBase64||''});
  }
  (Array.isArray(a?.infoResponseDocuments)?a.infoResponseDocuments:[]).forEach(d=>{
    if(!d) return;
    docs.push({label:'Additional document', name:d.name||'Document', url:d.url||''});
  });
  return docs;
}

function nestiqApplicationHasLiveTenancy(a, tenant){
  if(!a) return false;
  if(a.tenancyEndedAt||a.occupancyEnded) return false;
  if(!tenant) return false;
  const st=String(tenant.status||'').toLowerCase();
  if(st==='vacant'||st==='unassigned') return false;
  if(typeof window.nestiqTenantHasActiveOccupancy==='function' && !window.nestiqTenantHasActiveOccupancy(tenant)) return false;
  const appProp=String(a.propertyId||'').trim();
  const tProp=String(tenant.propertyId||'').trim();
  if(appProp && tProp && appProp!==tProp) return false;
  const tid=String(tenant.id||'');
  const unitId=String(tenant.unitId||'').trim();
  const units=typeof window.nestiqUnitsList==='function'?window.nestiqUnitsList():(window.unitsData||[]);
  if(Array.isArray(units)&&units.length){
    const unit=unitId
      ? units.find(u=>String(u.id)===unitId)
      : units.find(u=>String(u.tenantId||'')===tid);
    if(unit){
      const ust=String(unit.status||'').toLowerCase();
      if(ust==='vacant'||ust==='available') return false;
      if(String(unit.tenantId||'')!==tid) return false;
    }
  }
  return true;
}

function nestiqApplicationJourneyState(a){
  const st=String(a?.status||'pending').toLowerCase();
  let tenant=typeof nestiqTenantForApplication==='function'?nestiqTenantForApplication(a):null;
  const cur=window.currentTenantData;
  const samePerson=!!(cur && (
    String(cur.applicationId||'')===String(a?.id||'')
    || String(cur.id||'')===String(a?.linkedTenantId||a?.applicantUid||'')
  ));
  if(!tenant && samePerson) tenant=cur;
  const occupancyLive=nestiqApplicationHasLiveTenancy(a, tenant);
  let lease=tenant&&typeof window.nestiqPrimaryLeaseForTenant==='function'
    ?window.nestiqPrimaryLeaseForTenant(tenant.id)
    :null;
  if(!lease && typeof window.nestiqPrimaryLeaseForTenant==='function'){
    const uid=(typeof nestiqApplicantAuthUid==='function'?nestiqApplicantAuthUid():'')||String(a?.applicantUid||cur?.id||'');
    if(uid) lease=window.nestiqPrimaryLeaseForTenant(uid);
  }
  const leaseSt=String(lease?.storedStatus||lease?.status||tenant?.leaseStatus||(samePerson?cur?.leaseStatus:'')||'').toLowerCase();
  const leaseLooksActive=leaseSt==='active'||leaseSt==='expired'
    || (typeof window.nestiqLeaseIsActiveForRent==='function' && lease && window.nestiqLeaseIsActiveForRent(lease, tenant||cur));
  const leaseTerminated=leaseSt==='terminated'
    || String(tenant?.leaseStatus||'').toLowerCase()==='terminated'
    || (samePerson && String(cur?.leaseStatus||'').toLowerCase()==='terminated');
  const unitVacated=(()=>{
    if(!tenant) return false;
    const units=typeof window.nestiqUnitsList==='function'?window.nestiqUnitsList():(window.unitsData||[]);
    if(!Array.isArray(units)||!units.length) return false;
    const tid=String(tenant.id||'');
    const unitId=String(tenant.unitId||'').trim();
    const unit=unitId
      ? units.find(u=>String(u.id)===unitId)
      : units.find(u=>String(u.tenantId||'')===tid);
    if(!unit) return false;
    const ust=String(unit.status||'').toLowerCase();
    if(ust==='vacant'||ust==='available') return true;
    return !!(tid && String(unit.tenantId||'') && String(unit.tenantId||'')!==tid);
  })();
  const tenancyEnded=!!(a?.tenancyEndedAt||a?.occupancyEnded||leaseTerminated||unitVacated);
  const leaseActive=!!(!tenancyEnded && (occupancyLive || leaseLooksActive));
  const leaseReady=st==='approved' && !leaseActive && !tenancyEnded && (leaseSt==='pending_signature'||leaseSt==='draft'||st==='approved');
  const steps=[
    {key:'submitted', label:'Application Submitted'},
    {key:'review', label:st==='info_required'?'More Information':'Under Review'},
    {key:'decision', label:'Decision'},
    {key:'lease', label:'Lease'},
    {key:'active', label:tenancyEnded?'Tenancy ended':'Active Tenant'}
  ];
  let current=1;
  let failed=false;
  if(st==='declined'){ current=2; failed=true; }
  else if(st==='waitlisted'){ current=2; }
  else if(tenancyEnded){ current=4; failed=true; }
  else if(st==='approved'||st==='info_required'||st==='reviewing'||st==='pending'){
    if(leaseActive) current=4;
    else if(st==='approved') current=leaseReady?3:2;
    else current=1;
  }
  return {st, steps, current, failed, leaseActive, leaseReady, lease, tenant, leaseSt, occupancyLive, tenancyEnded};
}

function nestiqApplicationJourneyHtml(a){
  const j=nestiqApplicationJourneyState(a);
  return `<ol class="nestiq-app-journey" aria-label="Application progress">
    ${j.steps.map((step,i)=>{
      let cls='';
      if(j.failed && i>j.current) cls='is-idle';
      else if(i<j.current) cls='is-done';
      else if(i===j.current) cls=j.failed?'is-failed':'is-current';
      else cls='is-idle';
      const mark=cls==='is-done'?'✓':cls==='is-failed'?'✕':cls==='is-current'?'●':'○';
      return `<li class="nestiq-app-journey-step ${cls}">
        <span class="nestiq-app-journey-mark" aria-hidden="true">${mark}</span>
        <span class="nestiq-app-journey-label">${nestiqAppEsc(step.label)}</span>
      </li>`;
    }).join('')}
  </ol>`;
}

function nestiqTenantRepresentsApprovedApplication(tenant, app){
  if(!tenant||!app) return false;
  if(String(tenant.applicationId||'')===String(app.id||'')) return true;
  const tenantStatus=String(tenant.status||'').toLowerCase();
  const assignedProperty=String(tenant.propertyId||'').trim();
  const appProperty=String(app.propertyId||'').trim();
  if(tenantStatus==='unassigned') return false;
  if(!assignedProperty||!appProperty) return false;
  return assignedProperty===appProperty;
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
          <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${idJson})'>Create tenant profile</button>
          <span class="badge badge-amber" style="margin-left:auto">Approved — tenant missing</span>`;
    }
    return `
          <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenApplicationReviewModal(${idJson})'>View application</button>
          <button type="button" class="btn-outline btn-sm" onclick="showPage('tenants')">View tenants</button>
          ${(!tenant.portalUid||!tenant.hasPortalAccess)&&tenant.email?`<p style="font-size:0.8rem;color:var(--muted);margin-top:8px">They sign in with <strong>${nestiqAppEsc(tenant.email)}</strong> — the same account they used to apply.</p>`:''}
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
  if(__nestiqAppsPublicPoll){
    try{ clearInterval(__nestiqAppsPublicPoll); }catch(_e){}
    __nestiqAppsPublicPoll=null;
  }
  if(__nestiqAppsIngestTimer){
    try{ clearTimeout(__nestiqAppsIngestTimer); }catch(_e){}
    __nestiqAppsIngestTimer=null;
  }
  __nestiqAppsFsLid=null;
  __nestiqAppsScopedDocs=[];
  __nestiqAppsPublicDocs=[];
  __nestiqAppsAlertSeeded=false;
}

function nestiqApplicationsListenerIsLive(){
  return !!(__nestiqAppsFsLid && (__nestiqAppsFsUnsub || __nestiqAppsFsPublicUnsub || __nestiqAppsPublicPoll));
}
window.nestiqApplicationsListenerIsLive=nestiqApplicationsListenerIsLive;

function nestiqApplicationsPendingList(list){
  const rows=Array.isArray(list)?list:(typeof applications!=='undefined'&&Array.isArray(applications)?applications:window.applications||[]);
  return rows.filter(a=>{
    const st=String(a?.status||'pending').toLowerCase();
    return st==='pending'||st==='reviewing'||st==='info_required';
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
    try{ nestiqShowNotif?.(msg,'info'); }catch(_e){}
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
  // Heal only when a truly assigned tenant profile exists for the application.
  // Do not auto-approve merely because a self-registered applicant stub exists.
  try{
    if(Array.isArray(tenantsData)&&tenantsData.length){
      merged.forEach(a=>{
        if(!a||!nestiqApplicationIsOpen(a.status)) return;
        const t=nestiqTenantForApplication(a);
        if(!t) return;
        if(!nestiqTenantRepresentsApprovedApplication(t, a)) return;
        a.status='approved';
        a.linkedTenantId=t.id;
        a.portalInviteAccepted=a.portalInviteAccepted||Boolean(t.hasPortalAccess||t.portalUid);
        a.processedDate=a.processedDate||new Date().toISOString().slice(0,10);
        void nestiqPersistApplicationRecordToFirestoreById(a.id);
      });
    }
  }catch(_e){}
  nestiqApplyApplicationsMergeToGlobals(merged);
  window.nestiqApplicationsLoading=false;
  try{ nestiqAlertOnNewApplications(merged); }catch(_e){}
  try{ nestiqUpdateApplicationsBadge?.(); }catch(_e){}
  try{ nestiqScheduleIngestPublicApplications(); }catch(_e){}
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
    window.nestiqApplicationsLoading=false;
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
    window.nestiqApplicationsLoading=false;
    nestiqUpdateApplicationsBadge();
    return;
  }
  if(__nestiqAppsFsUnsub&&__nestiqAppsFsLid===lid){
    // Listener already live — don't leave the page stuck on skeleton.
    if(window.nestiqApplicationsLoading){
      window.nestiqApplicationsLoading=false;
      try{
        if(window.currentPage==='applications' || document.getElementById('page-applications')){
          nestiqRenderApplicationsPage.__skipFsEnsure=true;
          nestiqRenderApplicationsPage();
        }
      }finally{
        try{ delete nestiqRenderApplicationsPage.__skipFsEnsure; }catch(_e){}
      }
    }
    nestiqUpdateApplicationsBadge();
    return;
  }
  nestiqStopApplicationsFirestoreListener();
  __nestiqAppsFsLid=lid;
  __nestiqAppsAlertSeeded=false;
  window.nestiqApplicationsLoading=true;
  try{ nestiqShowSkeleton?.(document.getElementById('nestiqApplicationsList')||'applicationsList','card',3); }catch(_e){}

  const finishLoading=(why)=>{
    if(!window.nestiqApplicationsLoading) return;
    window.nestiqApplicationsLoading=false;
    try{
      if(window.currentPage==='applications' || document.getElementById('page-applications')){
        nestiqRenderApplicationsPage.__skipFsEnsure=true;
        nestiqRenderApplicationsPage();
      }
    }finally{
      try{ delete nestiqRenderApplicationsPage.__skipFsEnsure; }catch(_e){}
    }
    if(why) console.warn('NestIQ applications load ended:', why);
  };

  // Safety: never leave Applications spinning forever if a query stalls.
  const watchdog=setTimeout(()=>finishLoading('watchdog timeout'), 8000);
  const clearWatch=()=>{ try{ clearTimeout(watchdog); }catch(_e){} };

  const scoped=window.nestiqFs?.applications(db, lid);
  if(scoped){
    __nestiqAppsFsUnsub=scoped.onSnapshot(snap=>{
      clearWatch();
      __nestiqAppsScopedDocs=snap.docs;
      try{ nestiqApplicationsListenerApplyMerge(); }catch(e){ console.warn('NestIQ applications scoped listener', e); finishLoading(e); }
    },err=>{
      console.warn('NestIQ applications scoped query', err);
      clearWatch();
      try{ nestiqApplicationsListenerApplyMerge(); }catch(_e){ finishLoading(err); }
    });
  }
  const pubQ=db.collection('applications').where('listingLandlordId','==',lid);
  __nestiqAppsFsPublicUnsub=pubQ.onSnapshot(snap=>{
    clearWatch();
    __nestiqAppsPublicDocs=snap.docs;
    try{ nestiqApplicationsListenerApplyMerge(); }catch(e){ console.warn('NestIQ applications public listener', e); finishLoading(e); }
  },err=>{
    console.warn('NestIQ applications public query', err);
    // Query listener failed — poll so new submissions still appear without a Sync button.
    clearWatch();
    try{ nestiqApplicationsListenerApplyMerge(); }catch(_e){ finishLoading(err); }
    nestiqStartPublicApplicationsPoll(db, lid);
  });

  // If neither collection path attached, don't spin.
  if(!scoped&&!__nestiqAppsFsPublicUnsub){
    clearWatch();
    finishLoading('no applications collection');
  }
}

function nestiqStartPublicApplicationsPoll(db, lid){
  if(__nestiqAppsPublicPoll || !db || !lid) return;
  const tick=async ()=>{
    if(String(__nestiqAppsFsLid||'')!==String(lid)) return;
    try{
      const snap=await db.collection('applications').where('listingLandlordId','==',lid).get();
      __nestiqAppsPublicDocs=snap.docs||[];
      nestiqApplicationsListenerApplyMerge();
    }catch(e){
      console.warn('NestIQ applications public poll', e);
    }
  };
  tick();
  __nestiqAppsPublicPoll=setInterval(tick, 8000);
}

function nestiqScheduleIngestPublicApplications(){
  if(__nestiqAppsIngestTimer) clearTimeout(__nestiqAppsIngestTimer);
  __nestiqAppsIngestTimer=setTimeout(()=>{
    void nestiqIngestPublicApplicationsIntoLandlordScope();
  }, 250);
}

async function nestiqIngestPublicApplicationsIntoLandlordScope(){
  if(__nestiqAppsIngestBusy) return;
  const db=window.nestiqDb;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  if(!db||!lid||!window.nestiqFs?.applications) return;
  const dest=window.nestiqFs.applications(db, lid);
  const scopedIds=new Set((__nestiqAppsScopedDocs||[]).map(d=>String(d.id)));
  const publicDocs=__nestiqAppsPublicDocs||[];
  if(!publicDocs.length) return;
  __nestiqAppsIngestBusy=true;
  try{
    for(const doc of publicDocs){
      const id=String(doc.id||'');
      if(!id || scopedIds.has(id)) continue;
      const incoming={ id, ...(doc.data()||{}) };
      if(incoming.payslipBase64&&String(incoming.payslipBase64).length>200000) delete incoming.payslipBase64;
      if(incoming.idDocumentBase64&&String(incoming.idDocumentBase64).length>200000) delete incoming.idDocumentBase64;
      await dest.doc(id).set(incoming,{ merge:true });
      scopedIds.add(id);
    }
  }catch(e){
    console.warn('NestIQ ingest public applications', e);
  }finally{
    __nestiqAppsIngestBusy=false;
  }
}

async function nestiqSyncPublicApplicationsToLandlord(){
  const db=window.nestiqDb;
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  if(!db||!lid) return;
  try{
    const snap=await db.collection('applications').where('listingLandlordId','==',lid).get();
    __nestiqAppsPublicDocs=snap.docs||[];
    nestiqApplicationsListenerApplyMerge();
    await nestiqIngestPublicApplicationsIntoLandlordScope();
  }catch(e){
    console.warn('NestIQ applications refresh', e);
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
        const u=firebase.auth().currentUser;
        // Only tag real portal accounts — never anonymous Auth uids from public submit.
        if(u&&!u.isAnonymous){
          payload.applicantUid=u.uid;
          payload.hasPortalAccount=true;
          if(!payload.linkedTenantId) payload.linkedTenantId=u.uid;
        }
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

function nestiqApplicationDecisionPatch(a, lid){
  return{
    id:String(a.id),
    status:String(a.status||'pending'),
    listingLandlordId:String(lid||a.listingLandlordId||''),
    processedDate:String(a.processedDate||''),
    processedBy:String(a.processedBy||''),
    linkedTenantId:a.linkedTenantId!=null&&a.linkedTenantId!==''?a.linkedTenantId:null,
    shareDeclineReason:!!a.shareDeclineReason,
    declineReasons:Array.isArray(a.declineReasons)?a.declineReasons:[],
    declineNotes:String(a.declineNotes||''),
    occupancyEnded:!!a.occupancyEnded,
    tenancyEndedAt:a.tenancyEndedAt||null,
    infoRequestMessage:String(a.infoRequestMessage||''),
    infoRequestedAt:String(a.infoRequestedAt||''),
    updatedAt:new Date().toISOString()
  };
}

/** Landlord-side updates: push current row to both application copies so the list cannot stay "pending". */
async function nestiqPersistApplicationRecordToFirestoreById(appId, overrideRow){
  if(!window.nestiqDb||!appId) return false;
  try{
    const lid=typeof window.nestiqCurrentLandlordUid==='function'
      ?window.nestiqCurrentLandlordUid()
      :(overrideRow?.listingLandlordId||overrideRow?.landlordId||window.nestiqTenantSession?.landlordId||null);
    if(!lid) return false;
    const a=overrideRow&&String(overrideRow.id)===String(appId)?overrideRow:nestiqFindApplication(appId);
    if(!a||!a.id) return false;
    if(!String(a.listingLandlordId||'').trim()) a.listingLandlordId=lid;
    if(String(a.listingLandlordId||'')!==String(lid)){
      console.warn('NestIQ: healing application listingLandlordId', a.id, a.listingLandlordId, '→', lid);
      a.listingLandlordId=String(lid);
    }
    const scoped=window.nestiqFs.applications(window.nestiqDb, lid).doc(String(a.id));
    const pub=window.nestiqDb.collection('applications').doc(String(a.id));
    // Small status patch first — full docs with payslips can exceed Firestore's 1MB limit.
    const decision=nestiqApplicationDecisionPatch(a, lid);
    await scoped.set(decision,{merge:true});
    try{ await pub.set(decision,{merge:true}); }catch(_pub){}
    try{
      const payload=JSON.parse(JSON.stringify(a));
      if(payload.payslipBase64&&String(payload.payslipBase64).length>200000) delete payload.payslipBase64;
      if(payload.idDocumentBase64&&String(payload.idDocumentBase64).length>200000) delete payload.idDocumentBase64;
      await scoped.set(payload,{merge:true});
      try{ await pub.set(payload,{merge:true}); }catch(_pub2){}
    }catch(fullErr){
      console.warn('NestIQ: full application persist skipped, decision saved', fullErr);
    }
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
  const lid=typeof window.nestiqCurrentLandlordUid==='function'
    ?window.nestiqCurrentLandlordUid()
    :(tenant.landlordId||opts.landlordId||window.nestiqTenantSession?.landlordId||null);
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

  // Tenant invite-accept often has an empty local applications array — load from Firestore.
  if(!targets.length&&db&&lid&&window.nestiqFs){
    try{
      const col=window.nestiqFs.applications(db, lid);
      if(col){
        let docs=[];
        if(appId){
          const one=await col.doc(String(appId)).get();
          if(one.exists) docs=[one];
        }
        if(!docs.length&&email){
          const snap=await col.where('email','==',email).get().catch(()=>null);
          if(snap&&!snap.empty) docs=snap.docs;
        }
        if(!docs.length){
          // Fallback: scan landlord applications (small portfolios / school demo).
          const all=await col.limit(100).get().catch(()=>null);
          if(all&&!all.empty){
            docs=all.docs.filter(d=>{
              const x=d.data()||{};
              const st=String(x.status||'pending');
              if(email&&String(x.email||'').toLowerCase()===email&&nestiqApplicationIsOpen(st)) return true;
              if(appId&&String(d.id)===String(appId)) return true;
              return false;
            });
          }
        }
        targets=docs.map(d=>{
          const row=nestiqApplicationsFromFirestoreDoc(d);
          return row||{...d.data(),id:String(d.id)};
        }).filter(Boolean);
      }
    }catch(e){
      console.warn('NestIQ: load applications to mark approved', e);
    }
  }

  for(const a of targets){
    a.status='approved';
    a.processedDate=a.processedDate||new Date().toISOString().slice(0,10);
    a.processedBy=a.processedBy||(typeof nestiqLandlordDisplay==='function'?nestiqLandlordDisplay():'Landlord');
    a.linkedTenantId=tenant.id||tenant.tenantId||a.linkedTenantId||null;
    a.portalInviteAccepted=true;
    if(lid&&!a.listingLandlordId) a.listingLandlordId=lid;
    // Keep in-memory list in sync for the landlord UI.
    try{
      const arr=typeof applications!=='undefined'&&Array.isArray(applications)?applications:null;
      if(arr){
        const idx=arr.findIndex(x=>String(x.id)===String(a.id));
        if(idx>=0) arr[idx]={...arr[idx],...a};
        else arr.push(a);
        window.applications=arr;
      }
    }catch(_e){}
    await nestiqPersistApplicationRecordToFirestoreById(a.id, a);
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

function nestiqNormalizeSaIdDigits(raw){
  return String(raw||'').replace(/\D/g,'').slice(0,13);
}

function nestiqSaIdToDobDigits(raw){
  const d=nestiqNormalizeSaIdDigits(raw);
  if(d.length<6) return '';
  const yy=parseInt(d.slice(0,2),10);
  const mm=Number(d.slice(2,4));
  const dd=Number(d.slice(4,6));
  if(!Number.isFinite(yy)||mm<1||mm>12||dd<1||dd>31) return '';
  const thisYY=new Date().getFullYear()%100;
  const century=yy>thisYY?1900:2000;
  const yyyy=century+yy;
  const dt=new Date(yyyy, mm-1, dd);
  if(dt.getFullYear()!==yyyy || dt.getMonth()!==mm-1 || dt.getDate()!==dd) return '';
  return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

function nestiqSaIdLooksValid(raw){
  const d=nestiqNormalizeSaIdDigits(raw);
  return d.length===13 && !!nestiqSaIdToDobDigits(d);
}

function nestiqPaintApplyDobFromId(root, st, digits){
  const iso=nestiqSaIdToDobDigits(digits);
  const dob=root?.querySelector?.('[data-k="dateOfBirth"]');
  const hint=root?.querySelector?.('[data-dob-hint]');
  st._paintingDob=true;
  try{
    if(iso){
      st.dateOfBirth=iso;
      st.dobFromId=true;
      if(dob){
        dob.value=iso;
        dob.classList.add('nestiq-papp-dob-auto');
      }
      if(hint) hint.textContent='Filled from your ID number';
      return;
    }
    if(st.dobFromId && nestiqNormalizeSaIdDigits(digits).length<6){
      st.dobFromId=false;
    }
    if(dob) dob.classList.remove('nestiq-papp-dob-auto');
    if(hint) hint.textContent='A valid SA ID fills this automatically';
  }finally{
    st._paintingDob=false;
  }
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
  async function load(){
    let out=prop;
    if(propIdRaw && window.nestiqDb){
      try{
        const pub=await window.nestiqDb.collection('publicListings').doc(String(propIdRaw)).get();
        if(pub.exists){
          const pubData=pub.data()||{};
          const base=out&&typeof out==='object'?out:{};
          const prefer=typeof window.nestiqPreferListingUnitList==='function'?window.nestiqPreferListingUnitList:(a,b)=>a||b;
          out={
            ...pubData,
            ...base,
            id:pub.id,
            availableUnits:prefer(pubData.availableUnits, base.availableUnits),
            landlordId:String(pubData.landlordId||base.landlordId||lidHint||'').trim()||base.landlordId,
            _publicListingFound:true
          };
        }
      }catch(_e){}
    }
    if(propIdRaw && window.nestiqDb && lidHint && window.nestiqFs){
      try{
        const sd=await window.nestiqFs.properties(window.nestiqDb, lidHint).doc(String(propIdRaw)).get();
        if(sd.exists){
          const remote={ id:sd.id, ...sd.data() };
          const prefer=typeof window.nestiqPreferListingUnitList==='function'?window.nestiqPreferListingUnitList:(a,b)=>a||b;
          out=mergeLandlordHint({
            ...remote,
            availableUnits:prefer(out&&out.availableUnits, remote.availableUnits),
            landlordId:remote.landlordId||lidHint
          });
        }
      }catch(_e){}
    }
    return mergeLandlordHint(out);
  }
  return load();
}

function nestiqInitPublicApplicationPage(){
  const root=document.getElementById('nestiqPublicApplicationRoot');
  if(!root) return;
  const params=new URLSearchParams(location.search);
  const propIdRaw=String(params.get('property')||'').trim();
  const propNameHint=String(params.get('name')||'').replace(/\+/g,' ');
  root.innerHTML='<p class="nestiq-papp-muted" style="padding:28px;text-align:center">Loading property…</p>';
  Promise.all([
    nestiqResolvePublicProperty(propIdRaw, params, propNameHint),
    nestiqResolveSignedInApplicantProfile()
  ]).then(([prop, applicant])=>{
    const units=(typeof window.nestiqListingAvailableUnits==='function'
      ? window.nestiqListingAvailableUnits(prop||{})
      : [])||[];
    const paramUnit=String(params.get('unit')||params.get('unitId')||'').trim();
    const paramLabel=String(params.get('unitLabel')||'').replace(/\+/g,' ').trim();
    const fromLink=!!(paramUnit||paramLabel);
    if(!fromLink && !units.length){
      root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">No vacant units</h1><p class="nestiq-papp-muted">There are no available units to apply for on this listing. Occupied, reserved, and maintenance units cannot be applied to.</p><p style="margin-top:16px"><a class="btn-outline btn-sm" href="./index.html#listings">Back to listings</a></p></div></div>`;
      return;
    }
    if(!applicant||!applicant.uid){
      try{
        sessionStorage.setItem('nestiq-pending-apply', JSON.stringify({
          propertyId:propIdRaw,
          name:propNameHint||String(prop?.name||''),
          rent:Number(prop?.rent)||Number(params.get('rent')||0),
          bedrooms:Number(prop?.bedrooms)||Number(params.get('bedrooms')||0),
          addr:String(prop?.addr||params.get('addr')||''),
          leaseEnd:String(prop?.leaseEnd||params.get('leaseEnd')||'Available'),
          landlordId:String(prop?.landlordId||params.get('landlord')||''),
          unitId:String(params.get('unit')||params.get('unitId')||''),
          unitLabel:String(params.get('unitLabel')||''),
          deposit:Number(params.get('deposit')||0)
        }));
        sessionStorage.setItem('nestiq-auth-prefer-tab','reg');
      }catch(_e){}
      const home=(typeof nestiqAppBaseUrlSafe==='function'?nestiqAppBaseUrlSafe():'./').replace(/\/?$/,'/');
      root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card">
        <h1 class="nestiq-papp-title">Create an account to apply</h1>
        <p class="nestiq-papp-muted">You need a NestIQ tenant account before applying for a listing. After you apply, track the status under My Applications. If the landlord approves you, sign in with this same account to review and sign your lease.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          <a class="btn-gold btn-sm" href="${home}index.html">Create account / sign in</a>
          <a class="btn-outline btn-sm" href="${home}index.html#listings">Back to listings</a>
        </div>
      </div></div>`;
      return;
    }
    nestiqRunPublicApplicationWizard(root, prop, params, propNameHint, { applicant });
  });
}

function nestiqRunPublicApplicationWizard(root, prop, params, propNameHint, opts){
  const wizardOpts=opts&&typeof opts==='object'?opts:{};
  if(wizardOpts.walkIn){
    if(root) root.innerHTML='<p class="nestiq-papp-muted" style="padding:16px">Walk-in applications are not used. Prospective tenants apply from Browse listings.</p>';
    return;
  }
  const walkIn=false;
  const applicant=wizardOpts.applicant&&typeof wizardOpts.applicant==='object'?wizardOpts.applicant:null;
  if(!prop||!String(prop.id||'').trim()){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">Invalid link</h1><p class="nestiq-papp-muted">This application link is missing a valid property. Request a new link from the landlord or choose a listing from Browse listings.</p></div></div>`;
    return;
  }

  const displayName=String(prop.name||propNameHint||'Property');
  const propId=String(prop.id||'').trim();
  const listingLandlordId=prop.landlordId!=null?String(prop.landlordId):'';

  if(!walkIn&&!String(listingLandlordId||'').trim()){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">Cannot apply from this link</h1><p class="nestiq-papp-muted">This listing could not be matched to a landlord (often because the property is not published for public browsing, or the link is missing the landlord reference). Ask your landlord for a new <strong>Share application link</strong> from NestIQ, or use <strong>Browse listings</strong> for published vacancies.</p></div></div>`;
    return;
  }

  const listingUnits=(typeof window.nestiqListingAvailableUnits==='function'
    ? window.nestiqListingAvailableUnits(prop)
    : (Array.isArray(prop.availableUnits)?prop.availableUnits.filter(u=>{
        if(!u) return false;
        const st=String(u.status||'vacant').toLowerCase();
        if(st==='occupied'||st==='reserved'||st==='maintenance'||st==='due') return false;
        if(u.tenantId!=null && String(u.tenantId).trim()!=='') return false;
        return true;
      }):[]))||[];
  const matchFn=typeof window.nestiqListingUnitMatches==='function'
    ? window.nestiqListingUnitMatches
    : (u,id,label)=>String(u?.id||'')===String(id||'');
  const paramUnitId=String(params.get('unit')||params.get('unitId')||'').trim();
  const paramUnitLabel=String(params.get('unitLabel')||'').replace(/\+/g,' ').trim();
  if((paramUnitId||paramUnitLabel) && !listingUnits.some(u=>matchFn(u,paramUnitId,paramUnitLabel))){
    listingUnits.push({
      id:paramUnitId,
      label:paramUnitLabel||'Unit',
      bedrooms:Number(params.get('bedrooms')||prop.bedrooms||0)||0,
      bathrooms:Number(prop.bathrooms||0)||0,
      rent:Number(params.get('rent')||prop.rent||0)||0,
      deposit:Number(params.get('deposit')||prop.deposit||0)||0,
      availableFrom:String(params.get('leaseEnd')||prop.leaseEnd||'Available')
    });
  }
  const hasUnitInventory=(Array.isArray(prop.availableUnits)&&prop.availableUnits.length>0)
    || listingUnits.some(u=>!u.synthetic && String(u.id||'').trim());
  let selectedUnit=listingUnits.find(u=>matchFn(u,paramUnitId,paramUnitLabel))||null;
  if(!selectedUnit && paramUnitLabel){
    selectedUnit=listingUnits.find(u=>String(u.label||'').toLowerCase()===paramUnitLabel.toLowerCase())||null;
  }
  if(!selectedUnit && listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim()).length===1){
    selectedUnit=listingUnits.find(u=>!u.synthetic && String(u.id||'').trim())||listingUnits[0];
  }
  if(paramUnitId && !selectedUnit){
    const otherVacant=listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim());
    if(!otherVacant.length && !paramUnitLabel){
      root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">Unit not available</h1><p class="nestiq-papp-muted">That unit is not vacant, so it cannot be applied for. Choose another available unit from the listing, or check back later.</p><p style="margin-top:16px"><a class="btn-outline btn-sm" href="./index.html#listings">Back to listings</a></p></div></div>`;
      return;
    }
  }

  if(!walkIn && hasUnitInventory && !listingUnits.length){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">No vacant units</h1><p class="nestiq-papp-muted">There are no available units to apply for on this listing right now. Occupied, reserved, and maintenance units cannot be applied to. Check back later or choose another listing.</p><p style="margin-top:16px"><a class="btn-outline btn-sm" href="./index.html#listings">Back to listings</a></p></div></div>`;
    return;
  }
  if(walkIn && hasUnitInventory && !listingUnits.length){
    root.innerHTML='<p class="nestiq-papp-muted" style="padding:16px">This property has no vacant units to apply for. Free a unit or pick another property.</p>';
    return;
  }
  if(!walkIn && !listingUnits.length){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">No vacant units</h1><p class="nestiq-papp-muted">This listing has no available units to apply for.</p><p style="margin-top:16px"><a class="btn-outline btn-sm" href="./index.html#listings">Back to listings</a></p></div></div>`;
    return;
  }

  if(!walkIn && !prop._publicListingFound && !listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim()).length){
    root.innerHTML=`<div class="nestiq-papp-wrap"><div class="nestiq-papp-card"><h1 class="nestiq-papp-title">No vacant units</h1><p class="nestiq-papp-muted">This listing has no units available to apply for. Occupied units cannot be applied to. Use Browse listings to choose a vacant unit.</p><p style="margin-top:16px"><a class="btn-outline btn-sm" href="./index.html#listings">Back to listings</a></p></div></div>`;
    return;
  }

  const rent=Number(selectedUnit?.rent||params.get('rent')||prop.rent||0)||0;
  const bedrooms=Number(selectedUnit?.bedrooms||params.get('bedrooms')||prop.bedrooms||0)||0;
  const depositAmt=Number(selectedUnit?.deposit||params.get('deposit')||prop.deposit||rent)||0;
  const leaseEnd=String(selectedUnit?.availableFrom||prop.leaseEnd||'Available');
  const unitLabel=String(selectedUnit?.label||'');
  const unitId=String(selectedUnit?.id||'');

  const durationOpts=[
    {v:'6',l:'6 months'},
    {v:'12',l:'12 months'},
    {v:'24',l:'24 months'}
  ];
  const empOpts=[
    ['permanent','Employed (permanent)'],
    ['contract','Employed (contract)'],
    ['self-employed','Self-employed'],
    ['unemployed','Unemployed'],
    ['retired','Retired']
  ];

  const st={
    firstName:applicant?.firstName||'',lastName:applicant?.lastName||'',idNumber:'',dateOfBirth:'',
    email:applicant?.email||'',phone:applicant?.phone||'',whatsapp:applicant?.phone||'',waSame:true,
    currentAddress:'',currentCity:'',currentProvince:'',
    unitId, unitLabel, unitSearch:'',
    preferredMoveInDate:'', desiredLeaseMonths:'12',
    employmentStatus:'permanent',
    employerName:'', jobTitle:'', employmentLength:'', employerPhone:'',
    monthlyNetIncome:'',
    hasRentedBefore:'',
    currentLandlordName:'', currentLandlordPhone:'', currentLandlordEmail:'',
    previousAddress:'', currentMonthlyRent:'', rentalPeriod:'', reasonForMoving:'',
    numberOfOccupants:'1', occupantDetails:'',
    hasPets:'no', petType:'', petCount:'1', petBreed:'', petSize:'',
    idDocName:'', idDocData:'', incomeDocName:'', incomeDocData:'',
    refName:'', refPhone:'', refEmail:'',
    agreedToTerms:false, agreedPrivacy:false, signature:''
  };
  const lockIdentity=!!(applicant&&applicant.hasPortalAccount&&applicant.uid);

  let step=0;
  let stepDir='fwd';
  const totalSteps=6;
  const steps=['Personal','Rental','Employment','Household','Documents','Review'];

  function syncWa(){
    if(st.waSame) st.whatsapp=st.phone;
  }

  function needsEmployer(){
    return st.employmentStatus!=='unemployed' && st.employmentStatus!=='retired';
  }

  function validateStep(i){
    const err=[];
    const setErr=(id,msg)=>{ err.push({id,msg}); };
    if(i===0){
      if(!st.firstName.trim()) setErr('pa_fn','Required');
      if(!st.lastName.trim()) setErr('pa_ln','Required');
      if(!st.idNumber.trim()) setErr('pa_id','Required');
      else if(nestiqNormalizeSaIdDigits(st.idNumber).length!==13) setErr('pa_id','Enter 13 digits (numbers only)');
      if(!st.email.trim()) setErr('pa_em','Required');
      if(!st.phone.trim()) setErr('pa_ph','Required');
      if(!st.currentAddress.trim()) setErr('pa_ad','Required');
    }
    if(i===1){
      if(!walkIn && listingUnits.filter(u=>!u.synthetic && u.id).length && !String(st.unitId||unitId||'').trim()){
        setErr('pa_unit','Select a vacant unit');
      }
      if(!st.preferredMoveInDate) setErr('pa_mv','Select a move-in date');
      if(!st.desiredLeaseMonths) setErr('pa_ld','Required');
    }
    if(i===2){
      if(!st.employmentStatus) setErr('pa_es','Required');
      if(String(st.monthlyNetIncome).trim()===''||Number(st.monthlyNetIncome)<0) setErr('pa_mn','Required');
      if(needsEmployer()&&!st.employerName.trim()) setErr('pa_en','Employer / business name required');
    }
    if(i===3){
      if(!st.hasRentedBefore) setErr('pa_hr','Required');
      if(st.hasRentedBefore==='yes'){
        if(!st.currentLandlordName.trim()) setErr('pa_lnl','Required');
        if(!st.previousAddress.trim()) setErr('pa_pra','Required');
      }
      if(!st.numberOfOccupants||Number(st.numberOfOccupants)<1) setErr('pa_oc','Required');
      if(!st.hasPets) setErr('pa_pt','Required');
      if(st.hasPets==='yes'&&!st.petType.trim()) setErr('pa_pty','Required');
    }
    if(i===4){
      if(!st.idDocData) setErr('pa_idoc','Upload a copy of your ID or passport');
      if(!st.incomeDocData) setErr('pa_inc','Upload proof of income');
    }
    if(i===5){
      if(!st.agreedToTerms) setErr('pa_ag','You must confirm the information is accurate');
      if(!st.agreedPrivacy) setErr('pa_pr','You must agree to the privacy notice');
      if(!st.signature.trim()) setErr('pa_sg','Signature required');
    }
    return err;
  }

  function appFilePickerHtml(kind, attachedName){
    const has=!!String(attachedName||'').trim();
    const name=has?String(attachedName):'Drop a file here or browse';
    return `<div class="nestiq-papp-file ${has?'is-attached':''}" data-file-drop="${kind}">
      <input class="nestiq-papp-file-native" type="file" accept="image/*,.pdf,application/pdf" data-file="${kind}" id="nestiqPappFile-${kind}">
      <div class="nestiq-papp-file-icon" aria-hidden="true">${has?'✓':'↑'}</div>
      <div class="nestiq-papp-file-copy">
        <span class="nestiq-papp-file-name" title="${nestiqAppEsc(name)}">${nestiqAppEsc(name)}</span>
        <span class="nestiq-papp-file-hint">${has?'Attached · you can replace this file':'JPG, PNG or PDF · max 280KB'}</span>
      </div>
      <label class="nestiq-papp-file-btn" for="nestiqPappFile-${kind}">${has?'Replace':'Browse'}</label>
    </div>`;
  }

  function readAppFile(file, keyName, keyData, errId){
    if(!file) return;
    if(file.size>280000){
      nestiqShowNotif?.('Please upload a file under 280KB (JPG, PNG or PDF).','warning');
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>{
      st[keyName]=file.name;
      st[keyData]=String(reader.result||'');
      render();
    };
    reader.readAsDataURL(file);
  }

  function lockedRentalHtml(){
    const u=liveUnit();
    const uLbl=String((u&&(u.label||u.unitNumber))||st.unitLabel||'');
    return `<div class="nestiq-papp-locked">
      <p><strong>Property:</strong> ${nestiqAppEsc(displayName)}</p>
      <p><strong>Unit:</strong> ${nestiqAppEsc(uLbl||'Choose a vacant unit')}</p>
      <p><strong>Monthly rent:</strong> ${nestiqFormatMoney(liveRent())}</p>
      <p><strong>Deposit:</strong> ${nestiqFormatMoney(liveDeposit())}</p>
      <p><strong>Available:</strong> ${nestiqAppEsc(u?String(u.availableFrom||leaseEnd):leaseEnd)}</p>
    </div>`;
  }

  function liveUnit(){
    const id=String(st.unitId||'').trim();
    if(!id) return null;
    return listingUnits.find(x=>String(x.id||'')===id)||null;
  }
  function liveRent(){
    return Number(liveUnit()?.rent||rent)||0;
  }
  function liveDeposit(){
    const u=liveUnit();
    if(u) return Number(u.deposit||u.rent||depositAmt)||0;
    return depositAmt;
  }

  function vacantUnitPickerHtml(errClass, errMsg){
    const realUnits=listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim());
    if(!realUnits.length) return '';
    const unitQ=String(st.unitSearch||'').trim().toLowerCase();
    const unitChoices=unitQ?realUnits.filter(u=>[u.label,u.unitNumber,u.id,String(u.rent||'')].join(' ').toLowerCase().includes(unitQ)):realUnits;
    const u=liveUnit();
    const cardFn=typeof window.nestiqVacantUnitCardBodyHtml==='function'?window.nestiqVacantUnitCardBodyHtml:null;
    return `<section class="nq-unit-stage${errClass('pa_unit')?' is-err':''}">
      <header class="nq-unit-stage-head">
        <div>
          <div class="nq-unit-kicker">Choose a vacant unit</div>
          <h3>${nestiqAppEsc(displayName)}</h3>
          <p>Only unoccupied units on this property. Occupied and reserved homes stay hidden.</p>
        </div>
        <div class="nq-unit-stage-sel">
          <div class="nq-unit-kicker">Monthly rent</div>
          <div class="nq-unit-stage-amt">${u?nestiqFormatMoney(liveRent()):'—'}</div>
          <div class="nq-unit-stage-sub">${u?nestiqAppEsc(u.label||u.unitNumber||'Unit'):'Select a unit'}</div>
        </div>
      </header>
      ${realUnits.length>=8?`<input class="form-input nq-unit-search" data-unit-search="1" placeholder="Search unit number" value="${nestiqAppEsc(st.unitSearch||'')}" aria-label="Search vacant units">`:''}
      <div class="nq-unit-grid" role="radiogroup" aria-label="Vacant units">
        ${unitChoices.length?unitChoices.map((row,i)=>{
          const on=String(st.unitId)===String(row.id);
          const inner=cardFn?cardFn(row,{rent,selected:on}):`<strong>${nestiqAppEsc(row.label||'Unit')}</strong>`;
          return `<label class="nq-unit-card${on?' is-on':''}">
            <input type="radio" name="appVacantUnit" data-k="unitId" value="${nestiqAppEsc(row.id)}" ${on?'checked':''}>
            ${inner}
          </label>`;
        }).join(''):`<p class="nq-unit-empty">No units match that search.</p>`}
      </div>
      ${realUnits.length>=8?`<p class="nq-unit-count">${unitChoices.length} of ${realUnits.length} vacant</p>`:''}
      ${errMsg('pa_unit')}
    </section>`;
  }

  function paintAffordBox(host, income, rent){
    const box=host?.querySelector('.nestiq-papp-afford');
    if(!box) return;
    const affOk=rent>0?income>=rent*3:null;
    box.classList.toggle('ok', affOk===true);
    box.classList.toggle('bad', affOk===false);
    const incomeEl=box.querySelector('[data-afford-income]');
    if(incomeEl) incomeEl.textContent=typeof nestiqFormatMoney==='function'?nestiqFormatMoney(income):('R'+Number(income||0).toLocaleString('en-ZA'));
    let msg=box.querySelector('.nestiq-papp-afford-msg');
    if(affOk===true){
      if(!msg){
        msg=document.createElement('p');
        box.appendChild(msg);
      }
      msg.className='nestiq-papp-afford-msg ok';
      msg.textContent='✓ Meets the 3× rent guideline';
    }else if(affOk===false){
      if(!msg){
        msg=document.createElement('p');
        box.appendChild(msg);
      }
      msg.className='nestiq-papp-afford-msg bad';
      msg.textContent='⚠ Below the 3× rent guideline — you may still submit';
    }else if(msg){
      msg.remove();
    }
  }

  function render(){
    syncWa();
    const pct=Math.round(((step+1)/totalSteps)*100);
    const errMap={};
    validateStep(step).forEach(e=>{ errMap[e.id]=e.msg; });
    const errClass=id=>errMap[id]?' nestiq-papp-field-err':'';
    const errMsg=id=>errMap[id]?`<div class="nestiq-papp-err-msg">${nestiqAppEsc(errMap[id])}</div>`:'';
    const affIncome=Number(st.monthlyNetIncome)||0;
    const stepRent=liveRent();
    const affOk=stepRent>0?affIncome>=stepRent*3:null;
    const showUnitPick=listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim()).length>0;

    let body='';
    if(step===0){
      const roFirst=(lockIdentity&&String(st.firstName||'').trim())?' readonly':'';
      const roLast=(lockIdentity&&String(st.lastName||'').trim())?' readonly':'';
      const roEmail=(lockIdentity&&String(st.email||'').trim())?' readonly':'';
      const lockHint=lockIdentity
        ?`<p class="nestiq-papp-muted" style="grid-column:1/-1;margin:0 0 8px;font-size:0.8rem">Signed in as <strong>${nestiqAppEsc(applicant.email||applicant.name||'tenant')}</strong> — any details already on your account are pre-filled.</p>`
        :'';
      body=`
        ${lockHint}
        <h2 class="nestiq-papp-subtitle">Personal details</h2>
        <div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_fn')}"><label>First name *</label><input class="form-input" data-k="firstName" value="${nestiqAppEsc(st.firstName)}"${roFirst}>${errMsg('pa_fn')}</div>
          <div class="form-group${errClass('pa_ln')}"><label>Last name *</label><input class="form-input" data-k="lastName" value="${nestiqAppEsc(st.lastName)}"${roLast}>${errMsg('pa_ln')}</div>
          <div class="form-group${errClass('pa_id')}" style="grid-column:1/-1;position:relative"><label>SA ID / passport number *</label>
            <div style="position:relative">
              <input class="form-input" data-k="idNumber" value="${nestiqAppEsc(st.idNumber)}" inputmode="numeric" pattern="[0-9]{13}" maxlength="13" minlength="13" autocomplete="off" style="padding-right:36px">
              ${nestiqSaIdLooksValid(st.idNumber)?`<span class="nestiq-papp-id-ok nq-pop" aria-hidden="true" style="position:absolute;right:12px;top:0;bottom:0;display:flex;align-items:center;color:#16a34a;font-weight:800;font-size:1.1rem">✓</span>`:''}
            </div>
            ${errMsg('pa_id')}
            <p class="nestiq-papp-muted" style="margin:6px 0 0;font-size:0.78rem">Numbers only — exactly 13 digits. Date of birth is taken from a valid SA ID.</p>
          </div>
          <div class="form-group" style="grid-column:1/-1"><label>Date of birth</label>
            <input class="form-input${st.dobFromId?' nestiq-papp-dob-auto':''}" type="date" data-k="dateOfBirth" value="${nestiqAppEsc(st.dateOfBirth)}">
            <p class="nestiq-papp-muted" data-dob-hint style="margin:6px 0 0;font-size:0.78rem">${st.dobFromId?'Filled from your ID number':'A valid SA ID fills this automatically'}</p>
          </div>
          <div class="form-group${errClass('pa_em')}"><label>Email *</label><input class="form-input" type="email" data-k="email" value="${nestiqAppEsc(st.email)}"${roEmail}>${errMsg('pa_em')}</div>
          <div class="form-group${errClass('pa_ph')}"><label>Phone *</label><input class="form-input" data-k="phone" value="${nestiqAppEsc(st.phone)}">${errMsg('pa_ph')}</div>
          <div class="form-group" style="grid-column:1/-1"><label>WhatsApp</label><input class="form-input" data-k="whatsapp" value="${nestiqAppEsc(st.whatsapp)}" ${st.waSame?'readonly':''}>
            <label class="nestiq-papp-check"><input type="checkbox" data-wasame="1" ${st.waSame?'checked':''}> Same number for WhatsApp</label>
          </div>
          <div class="form-group${errClass('pa_ad')}" style="grid-column:1/-1"><label>Current residential address *</label><input class="form-input" data-k="currentAddress" value="${nestiqAppEsc(st.currentAddress)}">${errMsg('pa_ad')}</div>
          <div class="form-group"><label>City</label><input class="form-input" data-k="currentCity" value="${nestiqAppEsc(st.currentCity)}"></div>
          <div class="form-group"><label>Province</label>
            <select class="form-input" data-k="currentProvince">
              <option value="">Select</option>
              ${SA_PROVINCES.map(p=>`<option value="${nestiqAppEsc(p)}" ${st.currentProvince===p?'selected':''}>${nestiqAppEsc(p)}</option>`).join('')}
            </select>
          </div>
        </div>`;
    }else if(step===1){
      body=`
        ${showUnitPick?vacantUnitPickerHtml(errClass, errMsg):lockedRentalHtml()}
        <div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_mv')}"><label>Preferred move-in date *</label><input class="form-input" type="date" data-k="preferredMoveInDate" value="${nestiqAppEsc(st.preferredMoveInDate)}">${errMsg('pa_mv')}</div>
          <div class="form-group${errClass('pa_ld')}"><label>Desired lease duration *</label>
            <select class="form-input" data-k="desiredLeaseMonths">
              ${durationOpts.map(o=>`<option value="${o.v}" ${st.desiredLeaseMonths===o.v?'selected':''}>${nestiqAppEsc(o.l)}</option>`).join('')}
            </select>${errMsg('pa_ld')}
          </div>
        </div>
        <p class="nestiq-papp-muted">Rent is taken from the listing so you do not need to type it.</p>`;
    }else if(step===2){
      const un=!needsEmployer();
      body=`
        <h2 class="nestiq-papp-subtitle">Employment &amp; income</h2>
        <div class="form-group${errClass('pa_es')}"><label>Employment status *</label>
          <select class="form-input" data-k="employmentStatus">
            ${empOpts.map(([v,l])=>`<option value="${v}" ${st.employmentStatus===v?'selected':''}>${nestiqAppEsc(l)}</option>`).join('')}
          </select>${errMsg('pa_es')}
        </div>
        ${un?'':`<div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_en')}" style="grid-column:1/-1"><label>Employer / business name *</label><input class="form-input" data-k="employerName" value="${nestiqAppEsc(st.employerName)}">${errMsg('pa_en')}</div>
          <div class="form-group"><label>Job title</label><input class="form-input" data-k="jobTitle" value="${nestiqAppEsc(st.jobTitle)}"></div>
          <div class="form-group"><label>Length of employment</label><input class="form-input" data-k="employmentLength" placeholder="e.g. 2 years" value="${nestiqAppEsc(st.employmentLength)}"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Employer contact (phone or email)</label><input class="form-input" data-k="employerPhone" value="${nestiqAppEsc(st.employerPhone)}"></div>
        </div>`}
        <div class="form-group${errClass('pa_mn')}"><label>Monthly net income (R) *</label>
          <input class="form-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-k="monthlyNetIncome" value="${nestiqAppEsc(st.monthlyNetIncome)}" placeholder="e.g. 15000">
          ${errMsg('pa_mn')}</div>
        <div class="nestiq-papp-afford ${affOk===true?'ok':affOk===false?'bad':''}">
          <p>Monthly <strong>net</strong> income should be at least <strong>3×</strong> the listing rent of ${nestiqFormatMoney(stepRent)}.</p>
          <p><strong>Minimum required:</strong> ${nestiqFormatMoney(stepRent*3)} · <strong>Your net income:</strong> <span data-afford-income>${nestiqFormatMoney(affIncome)}</span></p>
          ${affOk===true?'<p class="nestiq-papp-afford-msg ok">✓ Meets the 3× rent guideline</p>':''}
          ${affOk===false?'<p class="nestiq-papp-afford-msg bad">⚠ Below the 3× rent guideline — you may still submit</p>':''}
          ${stepRent<=0?'<p class="nestiq-papp-muted">Rent not set on listing — threshold not calculated.</p>':''}
        </div>`;
    }else if(step===3){
      body=`
        <h2 class="nestiq-papp-subtitle">Household</h2>
        <p class="nestiq-papp-section-label">Have you rented a property before? *</p>
        <div class="nestiq-papp-radio${errClass('pa_hr')}">
          <label><input type="radio" name="hasRented" data-k="hasRentedBefore" value="yes" ${st.hasRentedBefore==='yes'?'checked':''}> Yes</label>
          <label><input type="radio" name="hasRented" data-k="hasRentedBefore" value="no" ${st.hasRentedBefore==='no'?'checked':''}> No</label>
        </div>${errMsg('pa_hr')}
        ${st.hasRentedBefore==='yes'?`<div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_lnl')}"><label>Previous landlord's name *</label><input class="form-input" data-k="currentLandlordName" value="${nestiqAppEsc(st.currentLandlordName)}">${errMsg('pa_lnl')}</div>
          <div class="form-group"><label>Landlord phone / email</label><input class="form-input" data-k="currentLandlordPhone" value="${nestiqAppEsc(st.currentLandlordPhone)}"></div>
          <div class="form-group${errClass('pa_pra')}" style="grid-column:1/-1"><label>Previous property address *</label><input class="form-input" data-k="previousAddress" value="${nestiqAppEsc(st.previousAddress)}">${errMsg('pa_pra')}</div>
          <div class="form-group"><label>Previous rental amount (R)</label><input class="form-input" type="number" min="0" data-k="currentMonthlyRent" value="${nestiqAppEsc(st.currentMonthlyRent)}"></div>
          <div class="form-group"><label>Rental period</label><input class="form-input" data-k="rentalPeriod" placeholder="e.g. 2023–2025" value="${nestiqAppEsc(st.rentalPeriod)}"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Reason for leaving</label><input class="form-input" data-k="reasonForMoving" value="${nestiqAppEsc(st.reasonForMoving)}"></div>
        </div>`:''}
        <div class="form-group${errClass('pa_oc')}" style="margin-top:12px"><label>How many people will occupy the unit? *</label>
          <input class="form-input" type="number" min="1" data-k="numberOfOccupants" value="${nestiqAppEsc(st.numberOfOccupants)}">${errMsg('pa_oc')}</div>
        <div class="form-group"><label>Additional occupants (name and relationship)</label>
          <textarea class="form-input" rows="2" data-k="occupantDetails" placeholder="e.g. Thandi Mokoena — spouse">${nestiqAppEsc(st.occupantDetails)}</textarea></div>
        <p style="font-weight:600;margin:14px 0 6px">Do you have pets? *</p>
        <div class="nestiq-papp-radio${errClass('pa_pt')}">
          <label><input type="radio" name="hasPets" data-k="hasPets" value="yes" ${st.hasPets==='yes'?'checked':''}> Yes</label>
          <label><input type="radio" name="hasPets" data-k="hasPets" value="no" ${st.hasPets==='no'?'checked':''}> No</label>
        </div>${errMsg('pa_pt')}
        ${st.hasPets==='yes'?`<div class="nestiq-papp-grid2">
          <div class="form-group${errClass('pa_pty')}"><label>Type of pet *</label><input class="form-input" data-k="petType" value="${nestiqAppEsc(st.petType)}">${errMsg('pa_pty')}</div>
          <div class="form-group"><label>Number of pets</label><input class="form-input" type="number" min="1" data-k="petCount" value="${nestiqAppEsc(st.petCount)}"></div>
          <div class="form-group"><label>Breed</label><input class="form-input" data-k="petBreed" value="${nestiqAppEsc(st.petBreed)}"></div>
          <div class="form-group"><label>Size</label><input class="form-input" data-k="petSize" placeholder="Small / medium / large" value="${nestiqAppEsc(st.petSize)}"></div>
        </div>`:''}`;
    }else if(step===4){
      body=`
        <h2 class="nestiq-papp-subtitle">Supporting documents</h2>
        <p class="nestiq-papp-muted" style="margin-bottom:16px">Upload a clear copy of your identity document and proof of income. These stay with this application only.</p>
        <div class="form-group${errClass('pa_idoc')}"><label>ID / passport *</label>
          ${appFilePickerHtml('id', st.idDocName)}
          ${errMsg('pa_idoc')}
        </div>
        <div class="form-group${errClass('pa_inc')}" style="margin-top:14px"><label>Proof of income *</label>
          ${appFilePickerHtml('income', st.incomeDocName)}
          ${errMsg('pa_inc')}
        </div>
        <p class="nestiq-papp-section-label">Reference <span>(optional)</span></p>
        <div class="nestiq-papp-grid2">
          <div class="form-group"><label>Name</label><input class="form-input" data-k="refName" value="${nestiqAppEsc(st.refName)}"></div>
          <div class="form-group"><label>Phone</label><input class="form-input" data-k="refPhone" value="${nestiqAppEsc(st.refPhone)}"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Email</label><input class="form-input" type="email" data-k="refEmail" value="${nestiqAppEsc(st.refEmail)}"></div>
        </div>`;
    }else{
      const empLbl=(Object.fromEntries(empOpts))[st.employmentStatus]||st.employmentStatus;
      const docs=[st.idDocName,st.incomeDocName].filter(Boolean).length;
      body=`
        <h2 class="nestiq-papp-subtitle">Review &amp; submit</h2>
        <div class="nestiq-papp-summary">
          <div><span>Property</span><strong>${nestiqAppEsc(displayName)}</strong></div>
          <div><span>Unit</span><strong>${nestiqAppEsc(st.unitLabel||liveUnit()?.label||'—')}</strong></div>
          <div><span>Rent</span><strong>${nestiqFormatMoney(liveRent())}/month</strong></div>
          <div><span>Move-in</span><strong>${nestiqAppEsc(st.preferredMoveInDate||'—')}</strong></div>
          <div><span>Lease</span><strong>${nestiqAppEsc(st.desiredLeaseMonths||'12')} months</strong></div>
          <div><span>Applicant</span><strong>${nestiqAppEsc(st.firstName)} ${nestiqAppEsc(st.lastName)}</strong></div>
          <div><span>Employment</span><strong>${nestiqAppEsc(empLbl)}</strong></div>
          <div><span>Monthly income</span><strong>${nestiqFormatMoney(Number(st.monthlyNetIncome)||0)}</strong></div>
          <div><span>Occupants</span><strong>${nestiqAppEsc(st.numberOfOccupants||'1')}</strong></div>
          <div><span>Pets</span><strong>${st.hasPets==='yes'?'Yes':'No'}</strong></div>
          <div><span>Documents</span><strong>${docs} uploaded</strong></div>
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
        <div class="form-group${errClass('pa_ag')}"><label class="nestiq-papp-check"><input type="checkbox" data-k="agreedToTerms" ${st.agreedToTerms?'checked':''}> I confirm that the information provided is accurate</label>${errMsg('pa_ag')}</div>
        <div class="form-group${errClass('pa_pr')}"><label class="nestiq-papp-check"><input type="checkbox" data-k="agreedPrivacy" ${st.agreedPrivacy?'checked':''}> I agree to the application's terms and <a href="legal.html#privacy" target="_blank" rel="noopener">privacy notice</a></label>${errMsg('pa_pr')}</div>
        <div class="form-group${errClass('pa_sg')}"><label>Type your full name as your digital signature *</label><input class="form-input" data-k="signature" value="${nestiqAppEsc(st.signature)}">${errMsg('pa_sg')}</div>`;
    }

    root.innerHTML=`
      <div class="nestiq-papp-wrap">
        <header class="nestiq-papp-header">
          <div class="nestiq-papp-brand"><span class="logo-dot"></span> NestIQ</div>
          <p class="nestiq-papp-tag">Rental application</p>
        </header>
        <div class="nestiq-papp-prophead">
          <h1 class="nestiq-papp-proptitle">${nestiqAppEsc(displayName)}</h1>
          <p class="nestiq-papp-propaddr">${nestiqAppEsc(prop.addr||'')}</p>
          <div class="nestiq-papp-propmeta">
            <span>${nestiqFormatMoney(rent)}/mo</span>
            <span>${bedrooms} bed</span>
            ${unitLabel?`<span>Unit ${nestiqAppEsc(st.unitLabel||unitLabel)}</span>`:''}
            <span>Available: ${nestiqAppEsc(leaseEnd)}</span>
          </div>
          <p class="nestiq-papp-applyfor">${walkIn?'You are applying for this unit':'You are applying for this home'}</p>
        </div>
        <div class="nestiq-papp-steps">${steps.map((lbl,i)=>`<span class="nestiq-papp-step ${i===step?'active':i<step?'done':''}">${i+1}. ${nestiqAppEsc(lbl)}</span>`).join('')}</div>
        <div class="nestiq-papp-progressbar"><div class="nestiq-papp-progressfill" style="width:${pct}%"></div></div>
        <div class="nestiq-papp-card ${stepDir==='back'?'nq-fade-left':'nq-fade-right'}">${body}</div>
        <div class="nestiq-papp-nav">
          ${step>0?'<button type="button" class="btn-outline nestiq-papp-prev" style="min-height:44px">Previous</button>':'<span></span>'}
          ${step<totalSteps-1?'<button type="button" class="btn-gold nestiq-papp-next" style="min-height:44px">Next</button>':'<button type="button" class="btn-gold nestiq-papp-submit" style="min-height:44px">Submit Application</button>'}
        </div>
      </div>`;

    root.querySelector('[data-unit-search]')?.addEventListener('input',e=>{
      const pos=e.target.selectionStart;
      st.unitSearch=e.target.value||'';
      render();
      const next=root.querySelector('[data-unit-search]');
      if(next){
        next.focus();
        try{ next.setSelectionRange(pos,pos); }catch(_e){}
      }
    });
    root.querySelectorAll('[data-k]').forEach(el=>{
      const k=el.dataset.k;
      el.addEventListener('input',()=>{
        if(el.type==='checkbox'&&(k==='agreedToTerms'||k==='agreedPrivacy')) st[k]=el.checked;
        else if(el.type==='radio') st[k]=el.value;
        else if(el.type==='number') st[k]=el.value;
        else st[k]=el.value;
        if(k==='monthlyNetIncome'){
          const digits=String(el.value||'').replace(/\D/g,'');
          st[k]=digits;
          if(el.value!==digits){
            const pos=Math.min(digits.length, Number(el.selectionStart)||digits.length);
            el.value=digits;
            try{ el.setSelectionRange(pos,pos); }catch(_e){}
          }
          paintAffordBox(root, Number(digits)||0, liveRent());
        }
        if(k==='idNumber'){
          const digits=nestiqNormalizeSaIdDigits(el.value);
          st.idNumber=digits;
          if(el.value!==digits){
            const pos=Math.min(digits.length, Number(el.selectionStart)||digits.length);
            el.value=digits;
            try{ el.setSelectionRange(pos,pos); }catch(_e){}
          }
          nestiqPaintApplyDobFromId(root, st, digits);
          const wrap=el.parentElement;
          let mark=wrap?.querySelector('.nestiq-papp-id-ok');
          if(nestiqSaIdLooksValid(digits)){
            if(!mark && wrap){
              mark=document.createElement('span');
              mark.className='nestiq-papp-id-ok nq-pop';
              mark.setAttribute('aria-hidden','true');
              mark.style.cssText='position:absolute;right:12px;top:0;bottom:0;display:flex;align-items:center;color:#16a34a;font-weight:800;font-size:1.1rem';
              mark.textContent='✓';
              wrap.appendChild(mark);
            }
          }else if(mark) mark.remove();
        }
      });
      if(k==='idNumber'){
        el.addEventListener('keydown',ev=>{
          if(ev.ctrlKey||ev.metaKey||ev.altKey) return;
          if(ev.key.length===1 && !/[0-9]/.test(ev.key)) ev.preventDefault();
        });
        el.addEventListener('paste',ev=>{
          ev.preventDefault();
          const text=(ev.clipboardData||window.clipboardData)?.getData('text')||'';
          const start=Number(el.selectionStart)||0;
          const end=Number(el.selectionEnd)||0;
          const cur=String(el.value||'');
          const next=nestiqNormalizeSaIdDigits(cur.slice(0,start)+text+cur.slice(end));
          el.value=next;
          st.idNumber=next;
          el.dispatchEvent(new Event('input',{ bubbles:true }));
        });
      }
      el.addEventListener('change',()=>{
        if(el.type==='checkbox'&&(k==='agreedToTerms'||k==='agreedPrivacy')){ st[k]=el.checked; return; }
        if(el.type==='radio'){
          st[k]=el.value;
          if(k==='unitId'){
            const u=listingUnits.find(x=>String(x.id)===String(el.value));
            if(u) st.unitLabel=String(u.label||u.unitNumber||'Unit');
          }
          render();
          return;
        }
        if(k==='dateOfBirth'){
          if(st._paintingDob) return;
          st.dateOfBirth=el.value;
          st.dobFromId=false;
          el.classList.remove('nestiq-papp-dob-auto');
          const hint=root.querySelector('[data-dob-hint]');
          if(hint) hint.textContent='A valid SA ID fills this automatically';
        }
        if(k==='employmentStatus'){ st.employmentStatus=el.value; render(); }
        if(k==='unitId'){
          st.unitId=el.value;
          const u=listingUnits.find(x=>String(x.id)===String(el.value));
          if(u) st.unitLabel=String(u.label||u.unitNumber||'Unit');
          render();
          return;
        }
      });
    });
    root.querySelectorAll('[data-file]').forEach(el=>{
      el.addEventListener('change',()=>{
        const f=el.files&&el.files[0];
        if(el.dataset.file==='id') readAppFile(f,'idDocName','idDocData','pa_idoc');
        if(el.dataset.file==='income') readAppFile(f,'incomeDocName','incomeDocData','pa_inc');
      });
    });
    root.querySelectorAll('[data-file-drop]').forEach(zone=>{
      const kind=zone.getAttribute('data-file-drop');
      const take=f=>{
        if(!f) return;
        if(kind==='id') readAppFile(f,'idDocName','idDocData','pa_idoc');
        if(kind==='income') readAppFile(f,'incomeDocName','incomeDocData','pa_inc');
      };
      ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{ e.preventDefault(); e.stopPropagation(); zone.classList.add('is-drag'); }));
      ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{ e.preventDefault(); e.stopPropagation(); zone.classList.remove('is-drag'); }));
      zone.addEventListener('drop',e=>take(e.dataTransfer?.files?.[0]));
    });
    const ws=root.querySelector('[data-wasame]');
    if(ws) ws.addEventListener('change',()=>{ st.waSame=ws.checked; render(); });

    root.querySelector('.nestiq-papp-prev')?.addEventListener('click',()=>{ if(step>0){ stepDir='back'; step--; render(); } });
    root.querySelector('.nestiq-papp-next')?.addEventListener('click',()=>{
      const e=validateStep(step);
      if(e.length){ render(); return; }
      stepDir='fwd';
      step++;
      render();
    });
    root.querySelector('.nestiq-papp-submit')?.addEventListener('click',async()=>{
      const e=validateStep(step);
      if(e.length){ render(); return; }
      const submitBtn=root.querySelector('.nestiq-papp-submit');
      const chosenUnitId=String(st.unitId||'').trim();
      const openReal=listingUnits.filter(u=>!u.synthetic && String(u.id||'').trim());
      if(openReal.length && !openReal.some(u=>String(u.id)===chosenUnitId)){
        nestiqShowNotif?.('Choose a vacant unit at this property. Occupied units cannot be applied for.','warning');
        return;
      }
      const chosen=openReal.find(u=>String(u.id)===chosenUnitId)||null;
      const submitRent=Number(chosen?.rent||liveRent()||rent)||0;
      const submitDeposit=Number(chosen?.deposit||liveDeposit()||depositAmt)||0;
      const submitBeds=Number(chosen?.bedrooms||bedrooms)||0;
      const submitLabel=String(chosen?.label||st.unitLabel||unitLabel||'');
      const submitAvail=String(chosen?.availableFrom||leaseEnd);
      if(!listingUnits.length){
        nestiqShowNotif?.('There are no vacant units to apply for on this listing.','warning');
        return;
      }
      nestiqSetBtnLoading?.(submitBtn,true,'Submitting...');
      try{
      syncWa();
      const id=`APP-${new Date().getFullYear()}-${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0').toUpperCase()}`;
      const nowIso=new Date().toISOString();
      const un=!needsEmployer();
      const netInc=Math.max(0,Number(st.monthlyNetIncome)||0);
      const refs=st.refName.trim()?[{ name:st.refName.trim(), relationship:'Reference', phone:st.refPhone.trim(), email:st.refEmail.trim() }]:[];
      const record={
        id,
        propertyId:propId,
        listingLandlordId,
        propertyName:displayName,
        propertyAddress:String(prop.addr||''),
        listingMonthlyRent:submitRent,
        listingDeposit:submitDeposit,
        availableFrom:submitAvail,
        bedroomsListed:submitBeds,
        unitId:chosenUnitId,
        unitLabel:submitLabel,
        preferredMoveInDate:st.preferredMoveInDate,
        desiredLeaseMonths:String(st.desiredLeaseMonths||'12'),
        firstName:st.firstName.trim(),
        lastName:st.lastName.trim(),
        idNumber:nestiqNormalizeSaIdDigits(st.idNumber),
        dateOfBirth:String(st.dateOfBirth||''),
        nationality:'South African',
        email:st.email.trim().toLowerCase(),
        phone:st.phone.trim(),
        whatsapp:(st.waSame?st.phone:st.whatsapp).trim(),
        currentAddress:st.currentAddress.trim(),
        currentCity:st.currentCity.trim(),
        currentProvince:st.currentProvince,
        timeAtCurrentAddress:'',
        employmentStatus:st.employmentStatus,
        employerName:un?'':String(st.employerName||'').trim(),
        employerPhone:un?'':String(st.employerPhone||'').trim(),
        jobTitle:un?'':String(st.jobTitle||'').trim(),
        monthlyGrossIncome:netInc,
        monthlyNetIncome:netInc,
        employmentStartDate:String(st.employmentLength||''),
        payslipBase64:st.incomeDocData||null,
        payslipName:st.incomeDocName||'',
        idDocumentName:st.idDocName||'',
        idDocumentBase64:st.idDocData||null,
        currentLandlordName:st.currentLandlordName.trim(),
        currentLandlordPhone:st.currentLandlordPhone.trim(),
        currentMonthlyRent:Math.max(0,Number(st.currentMonthlyRent)||0),
        reasonForMoving:st.reasonForMoving.trim(),
        previousEviction:false,
        evictionDetails:'',
        previousAddress:st.previousAddress.trim(),
        rentalPeriod:st.rentalPeriod.trim(),
        hasRentedBefore:st.hasRentedBefore==='yes',
        hasBankAccount:true,
        bankName:'',
        hasOutstandingDebt:false,
        creditScore:'unknown',
        monthlyDebtRepayments:0,
        numberOfOccupants:Math.max(1,Number(st.numberOfOccupants)||1),
        occupantDetails:st.occupantDetails.trim(),
        hasPets:st.hasPets==='yes',
        petDetails:st.hasPets==='yes'?[st.petType,st.petBreed,st.petSize].filter(Boolean).join(' · '):'',
        petType:st.petType.trim(),
        petCount:st.hasPets==='yes'?Math.max(1,Number(st.petCount)||1):0,
        petBreed:st.petBreed.trim(),
        hasCar:false,
        numberOfCars:0,
        references:refs,
        emergencyContactName:'',
        emergencyContactPhone:'',
        emergencyContactRelationship:'',
        agreedToTerms:true,
        agreedPrivacy:true,
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
      if(lockIdentity&&applicant?.uid){
        record.applicantUid=String(applicant.uid);
        record.hasPortalAccount=true;
        record.linkedTenantId=String(applicant.uid);
        const photo=nestiqApplicantPhotoUrl(applicant);
        if(photo) record.profilePhoto=photo;
        try{
          const stub=await nestiqEnsureApplicantTenantStub(listingLandlordId, {
            uid:applicant.uid,
            name:`${st.firstName} ${st.lastName}`.trim(),
            email:st.email,
            phone:st.phone,
            profilePhoto:photo||''
          });
          if(stub?.id) record.linkedTenantId=String(stub.id);
        }catch(stubErr){
          console.warn('NestIQ: applicant tenant stub', stubErr);
        }
      }
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
              <p><strong>Property:</strong> ${nestiqAppEsc(displayName)}${record.unitLabel?' — Unit '+nestiqAppEsc(record.unitLabel):''}</p>
              <p><strong>Submitted:</strong> ${nestiqAppEsc(record.applicationDate)}</p>
            </div>
            ${fsWarn}
            <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:20px;min-height:44px" onclick="nestiqCloseModalAnimated()">Done</button>
          </div>
        </div>`;
        nestiqShowNotif?.('Walk-in application saved','success');
        nestiqConfetti?.({ count: 80, spread: 65 });
        try{ wizardOpts.onComplete?.(); }catch(_e){}
      }else{
        const home=(typeof nestiqAppBaseUrlSafe==='function'?nestiqAppBaseUrlSafe():'./').replace(/\/?$/,'/');
        root.innerHTML=`
        <div class="nestiq-papp-wrap">
          <div class="nestiq-papp-card nestiq-papp-success">
            <h1 class="nestiq-papp-title" style="color:var(--sage)">Application Submitted</h1>
            <p class="nestiq-papp-lead">Application <strong>${nestiqAppEsc(id)}</strong></p>
            <p>${nestiqAppEsc(displayName)}${record.unitLabel?' — Unit '+nestiqAppEsc(record.unitLabel):''}</p>
            <p style="margin-top:8px"><span class="badge badge-amber">Under Review</span></p>
            <p class="nestiq-papp-muted" style="margin-top:12px">Your application has been submitted successfully. The landlord will review it. You are not a tenant yet — track this under My Applications in your portal.</p>
            <div class="nestiq-papp-summary" style="margin-top:20px">
              <p><strong>Applicant:</strong> ${nestiqAppEsc(record.firstName)} ${nestiqAppEsc(record.lastName)}</p>
              <p><strong>Submitted:</strong> ${nestiqAppEsc(record.applicationDate)}</p>
            </div>
            ${fsWarn}
            <a class="btn-gold" style="display:flex;justify-content:center;margin-top:20px;min-height:44px;align-items:center" href="${home}index.html#tenant-dashboard">View My Applications</a>
          </div>
        </div>`;
        nestiqConfetti?.({ count: 80, spread: 65 });
      }
      }catch(submitErr){
        console.error('NestIQ: application submit', submitErr);
        nestiqSetBtnLoading?.(submitBtn,false);
        nestiqShowNotif?.('Could not submit application. Please try again.','error');
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
  const c={all:list.length,pending:0,reviewing:0,info_required:0,approved:0,declined:0,waitlisted:0};
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
  // Always ensure the Firestore listener is attached — even while showing skeleton.
  // Previously we returned early on loading and never started the listener, so the page could spin forever.
  if(!nestiqRenderApplicationsPage.__skipFsEnsure){
    try{ nestiqEnsureApplicationsFirestoreListener(); }catch(_e){}
  }
  if(window.nestiqApplicationsLoading){
    nestiqShowSkeleton?.(listEl, 'card', 3);
    return;
  }
  try{ nestiqUpdateApplicationsBadge(); }catch(_e){}

  const c=nestiqApplicationsCounts();
  stats.innerHTML=`
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${c.all}</div><div class="nestiq-app-stat-lbl">Total Applications</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-amber"><div class="nestiq-app-stat-val">${c.pending+c.reviewing+c.info_required}</div><div class="nestiq-app-stat-lbl">Pending Review</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-green"><div class="nestiq-app-stat-val">${c.approved}</div><div class="nestiq-app-stat-lbl">Approved</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-red"><div class="nestiq-app-stat-val">${c.declined}</div><div class="nestiq-app-stat-lbl">Declined</div></div>`;

  const tabs=['all','pending','reviewing','info_required','approved','declined','waitlisted'];
  filt.innerHTML=tabs.map(t=>{
    const label=t==='all'?'All':t==='info_required'?'Info needed':t.charAt(0).toUpperCase()+t.slice(1);
    const active=nestiqApplicationsFilter===t?'active':'';
    return `<button type="button" class="filter-chip ${active}" onclick="nestiqApplicationsSetFilter('${t}')">${label}</button>`;
  }).join('');

  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:nestiqAppsReadLsArray();
  let rows=list.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(nestiqApplicationsFilter!=='all'){
    if(nestiqApplicationsFilter==='pending'){
      rows=rows.filter(a=>['pending','reviewing','info_required'].includes(a.status||'pending'));
    }else{
      rows=rows.filter(a=>(a.status||'pending')===nestiqApplicationsFilter);
    }
  }

  if(!rows.length){
    const hasAny=list.length>0;
    nestiqShowEmptyState?.(listEl, hasAny
      ? { icon:'🔎', title:'No matches', message:'No applications in this filter.' }
      : { icon:'📋', title:'Waiting for applicants', message:'Publish a vacant unit, then open Browse listings. Applications appear here the moment someone submits.', action:{ label:'Browse listings', fn:'nestiqGoToListings' } });
    return;
  }

  listEl.innerHTML=rows.map(a=>{
    const name=`${a.firstName||''} ${a.lastName||''}`.trim()||'Applicant';
    const walkInBadge='';
    const income=nestiqIncomeForApp(a);
    const rent=nestiqRentForApp(a);
    const {cls:ratioCls,text:ratioText}=nestiqIncomeRatioLabel(income,rent);
    const st=a.status||'pending';
    const badge=st==='approved'?'badge-green':st==='declined'?'badge-red':st==='info_required'?'badge-gold':st==='waitlisted'?'badge-amber':st==='reviewing'?'badge-amber':'badge-amber';
    const gem=typeof isGeminiConfigured==='function'&&isGeminiConfigured();
    const sc=a.aiScore;
    const scoreHtml=gem&&sc!=null?`<span class="nestiq-ai-score ${nestiqAiScoreBadgeClass(sc)}">${Math.round(sc)}/100</span>`:'';
    const riskHtml=gem&&a.aiRiskLevel?`<span class="badge badge-amber">${nestiqAppEsc(a.aiRiskLevel)}</span>`:'';
    return `
      <div class="nestiq-app-card nq-fade-in" data-app-id="${nestiqAppEsc(a.id)}">
        <div class="nestiq-app-card-head">
          <div class="nestiq-app-card-identity">
            ${nestiqApplicantAvatarHtml(a,44)}
            <div>
            <div class="nestiq-app-card-name">${nestiqAppEsc(name)}${walkInBadge}</div>
            <div class="nestiq-app-card-meta">
              <span class="badge" style="background:var(--cream);color:var(--ink);border:1px solid var(--border)">${nestiqAppEsc(a.id)}</span>
              <span>${nestiqAppEsc(a.applicationDate||a.createdAt?.slice(0,10)||'—')}</span>
            </div>
            <div class="nestiq-app-card-prop">${nestiqAppEsc(a.propertyName||'—')}${a.unitLabel?' · Unit '+nestiqAppEsc(a.unitLabel):''}</div>
            </div>
          </div>
          <div style="text-align:right">
            <span class="badge ${badge}">${nestiqAppEsc((typeof nestiqApplicationStatusLabel==='function'?nestiqApplicationStatusLabel(st).text:st))}</span>
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
        <div class="nestiq-app-card-foot">
          ${nestiqApplicationCardActionsHtml(a.id,st)}
        </div>
      </div>`;
  }).join('');
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(document.getElementById('applicationsList') || listEl, 50);
  if(typeof nestiqInitScrollReveal==='function') nestiqInitScrollReveal();
}

function nestiqApplicationsSetFilter(t){
  nestiqApplicationsFilter=t;
  nestiqRenderApplicationsPage();
}
window.nestiqGoToListings=window.nestiqGoToListings||function(){ if(typeof showPage==='function') showPage('listings'); };

function nestiqOpenWalkInApplicationModal(){
  nestiqShowNotif?.('Walk-in applications are not used. Prospective tenants apply from Browse listings in the web app.','info');
}

function nestiqOpenApplicationLinkModal(propertyId){
  try{
    const list=(typeof propertiesData!=='undefined'&&Array.isArray(propertiesData))?propertiesData:[];
    const p=list.find(x=>String(x.id)===String(propertyId));
    if(!p){ nestiqShowNotif('Property not found','error'); return; }
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
        <button type="button" class="btn-gold btn-sm" onclick="nestiqCopyApplicationLink()" title="Copy link" data-nq-tip="Copy link">Copy Link</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqDownloadApplicationQr()" title="Download QR code" data-nq-tip="Download QR code">Download QR Code</button>
      </div>
      <p class="modal-sub" style="margin-top:14px;font-size:0.8rem">Share via WhatsApp, Property24, social media, or print the QR for an on-site sign.</p>`;
    nestiqOpenModalAnimated();
    const el=document.getElementById('nestiqAppLinkQr');
    el.innerHTML='';
    try{
      if(typeof QRCode!=='undefined') new QRCode(el,{text:url,width:180,height:180});
      else el.textContent='QR library unavailable';
    }catch(_e){ el.textContent='QR unavailable'; }
  }catch(err){
    console.error(err);
    nestiqShowNotif('Could not build link','error');
  }
}

function nestiqCopyApplicationLink(){
  const i=document.getElementById('nestiqAppLinkUrl');
  if(!i) return;
  i.select();
  try{
    navigator.clipboard.writeText(i.value);
    nestiqShowNotif('Link copied','success');
  }catch(_e){
    nestiqShowNotif('Copy failed — select and copy manually','warning');
  }
}

function nestiqDownloadApplicationQr(){
  const w=document.getElementById('nestiqAppLinkQr');
  if(!w) return;
  const cv=w.querySelector('canvas');
  if(!cv||!cv.toDataURL){ nestiqShowNotif('No QR to download','warning'); return; }
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
  if(!a){ nestiqShowNotif('Application not found','error'); return; }
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
    <div class="nestiq-review-hero">
      ${nestiqApplicantAvatarHtml(a,64)}
      <div>
        <h2 class="modal-title" style="margin-bottom:4px">Application — ${nestiqAppEsc(`${a.firstName||''} ${a.lastName||''}`.trim())}</h2>
        <p class="modal-sub" style="margin:0">${nestiqAppEsc(a.id)} · ${nestiqAppEsc(a.propertyName||'')}${a.unitLabel?' · Unit '+nestiqAppEsc(a.unitLabel):''}</p>
      </div>
    </div>
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
  nestiqOpenModalAnimated();

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
      ${(a.status||'')==='info_required'?`<div class="nestiq-app-info-banner" style="margin-top:14px">
        <strong>Waiting for more information</strong>
        <p style="margin:6px 0 0">${nestiqAppEsc(a.infoRequestMessage||'Additional documents requested.')}</p>
        ${(a.infoResponseDocuments||[]).length?`<p style="margin:8px 0 0;font-size:0.82rem">Received ${(a.infoResponseDocuments||[]).length} document(s)${a.infoRespondedAt?' on '+nestiqPrettyAppDate(a.infoRespondedAt):''}.</p>`:'<p style="margin:8px 0 0;font-size:0.82rem;color:var(--muted)">The applicant has not replied yet.</p>'}
      </div>`:''}
      <div class="form-group" style="margin-top:14px"><label>Private notes</label>
        <textarea class="form-input" id="nestiqAppLandlordNotes" rows="3" oninput='nestiqLandlordNotesInput(${JSON.stringify(a.id)},this.value)'>${nestiqAppEsc(a.landlordNotes||'')}</textarea></div>
      ${nestiqApplicationIsOpen(a.status)?`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicationOpenApproveModal(${JSON.stringify(a.id)})'>Approve Application</button>
        <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick='nestiqApplicationOpenDeclineModal(${JSON.stringify(a.id)})'>Decline Application</button>
        <button type="button" class="btn-outline btn-sm" onclick='nestiqApplicationWaitlist(${JSON.stringify(a.id)});nestiqCloseModalAnimated();'>Add to Waitlist</button>
        <button type="button" class="btn-outline btn-sm" onclick='nestiqAppOpenRequestInfoModal(${JSON.stringify(a.id)})'>Request more information</button>
      </div>`:`
      <div style="margin-top:12px;padding:12px;background:var(--cream);border-radius:10px;font-size:0.88rem">
        ${(a.status||'')==='approved'?((nestiqEnsureApplicationTenantLink(a)||nestiqTenantForApplication(a))
          ?`<strong>Approved</strong>${a.processedDate?` on ${nestiqAppEsc(a.processedDate)}`:''}. Tenant profile exists${(nestiqTenantForApplication(a))?.hasPortalAccess?' and portal access is active':(nestiqTenantForApplication(a)?.email)?` — they sign in with <strong>${nestiqAppEsc(nestiqTenantForApplication(a).email)}</strong> (no invitation code)`:''}.`
          :`<strong>Approved</strong>${a.processedDate?` on ${nestiqAppEsc(a.processedDate)}`:''}, but no tenant profile was found under <strong>Tenants</strong> for this email. Use <strong>Create tenant profile</strong> below.`):''}
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
      </div>
      ${a.idDocumentBase64?`<div style="margin-top:12px"><a class="btn-outline btn-sm" href="${a.idDocumentBase64}" download="${nestiqAppEsc(a.idDocumentName||'id-document')}">Download ID / passport</a></div>`:''}`;
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
        ['Previous address',a.previousAddress||'—'],
        ['Rental period',a.rentalPeriod||'—'],
        ['Occupants',a.numberOfOccupants||'—'],
        ['Occupant details',a.occupantDetails||'—'],
        ['Pets',a.hasPets?(a.petDetails||'Yes'):'No'],
        ['Preferred move-in',a.preferredMoveInDate||'—'],
        ['Lease duration',a.desiredLeaseMonths?a.desiredLeaseMonths+' months':'—'],
        ['Unit',a.unitLabel||'—']
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
  const msg=a.infoRequestMessage
    ?`Hi ${a.firstName||'there'}, this is ${nestiqLandlordDisplay()} regarding your rental application for ${a.propertyName||'our property'}.\n\n${a.infoRequestMessage}\n\nPlease reply in your NestIQ portal under My Applications.`
    :`Hi ${a.firstName||'there'}, this is ${nestiqLandlordDisplay()} regarding your rental application for ${a.propertyName||'our property'}. Could you please send any additional information we requested? Thank you.`;
  const ph=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
  openWhatsAppChat?.(ph,msg);
}

function nestiqAppOpenRequestInfoModal(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Request more information</h2>
    <p class="modal-sub">The applicant will see this in their portal. Their application returns to Under Review after they submit.</p>
    <div class="form-group"><label>Message to applicant</label>
      <textarea class="form-input" id="nestiqInfoRequestMsg" rows="4" placeholder="Please provide your latest proof of income.">${nestiqAppEsc(a.infoRequestMessage||'')}</textarea>
    </div>
    <label class="nestiq-papp-check"><input type="checkbox" id="nestiqInfoRequestWa" checked> Also send via WhatsApp</label>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:14px;min-height:44px" onclick='nestiqAppConfirmRequestInfo(${JSON.stringify(appId)})'>Send request</button>`;
  nestiqOpenModalAnimated();
}

async function nestiqAppConfirmRequestInfo(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const msg=String(document.getElementById('nestiqInfoRequestMsg')?.value||'').trim();
  if(!msg){ nestiqShowNotif('Add a short message so the applicant knows what to send.','warning'); return; }
  const sendWa=document.getElementById('nestiqInfoRequestWa')?.checked!==false;
  a.status='info_required';
  a.infoRequestMessage=msg;
  a.infoRequestedAt=new Date().toISOString();
  a.infoResponseNote='';
  saveData?.();
  await nestiqPersistApplicationRecordToFirestoreById(appId, a);
  closeModal?.();
  nestiqRenderApplicationsPage?.();
  nestiqShowNotif('Information request sent to the applicant.','success');
  if(sendWa) nestiqAppRequestInfoWa(appId);
}

async function nestiqRunApplicationAiScreen(appId){
  const a=nestiqFindApplication(appId);
  if(!a||typeof callGeminiJson!=='function') return;
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="nestiqRunApplicationAiScreen"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Screening...');
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
    }else nestiqShowNotif('AI response unclear — try again','warning');
  }catch(_e){
    nestiqShowNotif('AI failed','error');
  }finally{
    if(busy) busy.style.display='none';
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

function nestiqApplicationOpenApproveModal(appId){
  const a=nestiqFindApplication(appId);
  if(!a){ nestiqShowNotif('Application not found','error'); return; }
  if((a.status||'')==='approved'&&nestiqTenantForApplication(a)){
    // Re-sync — tenant may only exist in memory after a failed cloud write.
    void (async()=>{
      const t=nestiqTenantForApplication(a);
      if(!t) return;
      a.linkedTenantId=t.id;
      try{
        nestiqShowNotif('Re-saving tenant to the cloud…','info');
        if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
          await window.nestiqPersistSingleTenantToFirestore(t);
        }else if(window.nestiqUseFirestore&&typeof window.nestiqCreateTenantDocInFirestore==='function'){
          const fireId=await window.nestiqCreateTenantDocInFirestore(t);
          t.id=fireId;
          a.linkedTenantId=fireId;
        }else if(window.nestiqUseFirestore){
          throw new Error('App outdated — hard refresh (Ctrl+F5)');
        }
        await nestiqPersistApplicationRecordToFirestoreById(appId, a);
        nestiqShowNotif('Tenant re-saved to cloud. Refresh to confirm it stays.','success');
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
        nestiqShowNotif('Tenant was only on this screen (not saved to cloud): '+(e?.message||'unknown')+'. Use Create tenant profile again.','error');
      }
    })();
    return;
  }
  if((a.status||'')==='declined'){
    nestiqShowNotif('This application was declined. Re-open it from waitlist or add a new application if needed.','info');
    return;
  }
  const recovering=(a.status||'')==='approved'&&!nestiqTenantForApplication(a);
  const rent=nestiqRentForApp(a);
  const dep=Number(a.listingDeposit)>0?Number(a.listingDeposit):Math.round(rent*2);
  const today=new Date().toISOString().slice(0,10);
  const movePref=String(a.preferredMoveInDate||'').slice(0,10)||today;
  const months=Math.max(1,Number(a.desiredLeaseMonths)||12);
  const end=new Date(movePref+'T12:00:00');
  if(String(end)!=='Invalid Date') end.setMonth(end.getMonth()+months);
  else { const e=new Date(); e.setFullYear(e.getFullYear()+1); }
  const endStr=(String(end)!=='Invalid Date'?end:new Date(Date.now()+31536000000)).toISOString().slice(0,10);
  const name=`${a.firstName||''} ${a.lastName||''}`.trim();
  const unitHint=a.unitLabel?`Applicant selected unit ${a.unitLabel}.`:'';
  const startDay=Math.max(1,Math.min(28,Number(String(movePref||today).slice(8,10))||1));
  const prorateDefault=Number(String(movePref||today).slice(8,10))>1;
  const dueOpts=typeof window.nestiqDueDayOptionsHtml==='function'
    ? window.nestiqDueDayOptionsHtml(startDay)
    : Array.from({length:28},(_,i)=>`<option value="${i+1}" ${i+1===startDay?'selected':''}>${i+1}</option>`).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${recovering?'Create Tenant From Application':'Approve Application'} — ${nestiqAppEsc(name)}</h2>
    <p class="modal-sub">${nestiqAppEsc(a.propertyName||'')} ${a.unitLabel? '· Unit '+nestiqAppEsc(a.unitLabel)+' ':''}· ${nestiqFormatMoney(rent)}${recovering?' · Application is approved but no tenant profile exists yet':''}</p>
    <div class="nestiq-papp-grid2">
      <div class="form-group"><label>Move-in date</label><input class="form-input" type="date" id="nestiqApprMoveIn" value="${nestiqAppEsc(movePref)}"></div>
      <div class="form-group"><label>Lease start</label><input class="form-input" type="date" id="nestiqApprLeaseStart" value="${nestiqAppEsc(movePref)}"></div>
      <div class="form-group"><label>Lease end</label><input class="form-input" type="date" id="nestiqApprLeaseEnd" value="${nestiqAppEsc(endStr)}"></div>
      <div class="form-group"><label>Monthly rent (R)</label><input class="form-input" type="number" id="nestiqApprRent" value="${rent}"></div>
      <div class="form-group"><label>Deposit (R)</label><input class="form-input" type="number" id="nestiqApprDeposit" value="${dep}"></div>
      <div class="form-group"><label>Rent due day</label>
        <select class="form-input" id="nestiqApprDueDay">${dueOpts}</select>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:0.86rem;cursor:pointer">
          <input type="checkbox" id="nestiqApprProrate" ${prorateDefault?'checked':''}>
          <span>Prorate first month if they move in after day 1 (remaining days only, then full rent from the next month)</span>
        </label>
      </div>
      <div class="form-group" style="grid-column:1/-1"><label>Unit</label>
        <select class="form-input" id="nestiqApprUnit" onchange="nestiqOnApproveUnitChange()">
          <option value="">Loading units…</option>
        </select>
        <p id="nestiqApprUnitHint" style="font-size:0.75rem;color:var(--muted);margin:6px 0 0;line-height:1.4">${nestiqAppEsc(unitHint)}</p>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Type your full legal name to sign the lease</label>
      <input class="form-input" id="nestiqApprSignName" autocomplete="name" placeholder="${nestiqAppEsc(nestiqLandlordDisplay()||'Full name')}">
    </div>
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:0.86rem;margin:10px 0 0;cursor:pointer">
      <input type="checkbox" id="nestiqApprSignAgree">
      <span>I have read these terms. Approving signs as landlord and sends the lease to the tenant. They sign second in their portal.</span>
    </label>
    <div class="nestiq-money-opts">
      <div class="nestiq-money-opts-kicker">Move-in collection</div>
      <label class="nestiq-money-opt">
        <input type="checkbox" id="nestiqApprDepositNow" checked>
        <span>
          <strong>Collect the security deposit before occupancy</strong>
          <em>Recommended. The unit stays reserved until the tenant pays in the app.</em>
        </span>
      </label>
      <label class="nestiq-money-opt">
        <input type="checkbox" id="nestiqApprFirstRentNow">
        <span>
          <strong>Also collect first month’s rent now</strong>
          <em>Leave off to bill rent on the lease due day, as usual.</em>
        </span>
      </label>
    </div>
        <p class="nestiq-papp-muted" style="margin-top:10px">You sign first. The tenant signs next. Occupancy starts after any required move-in amount is paid.</p>
    <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-top:16px;min-height:44px" onclick='nestiqApplicationConfirmApprove(${JSON.stringify(appId)})'>${recovering?'Create tenant & send lease':'Approve, sign &amp; send lease'}</button>`;
  nestiqOpenModalAnimated();
  const propId=a.propertyId||(propertiesData||[]).find(p=>p&&p.name===a.propertyName)?.id;
  if(propId && typeof nestiqLoadUnitsForProperty==='function'){
    void nestiqLoadUnitsForProperty(propId,{
      selectId:'nestiqApprUnit',
      hintId:'nestiqApprUnitHint',
      preferUnitId:String(a.unitId||'')
    });
  }
}

async function nestiqUnlockSelfApplicantPortal(tenant, lid){
  if(!tenant||!lid||!window.nestiqDb) return false;
  const uid=String(tenant.portalUid||tenant.id||'').trim();
  if(!uid) return false;
  tenant.hasPortalAccess=true;
  try{
    const acct=window.nestiqFs?.tenantAccount?.(window.nestiqDb, uid);
    if(acct){
      await acct.set({
        landlordId:String(lid),
        tenantId:String(tenant.id),
        propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
        status:'pending-lease',
        name:tenant.name||'',
        email:tenant.email||'',
        phone:tenant.phone||''
      },{ merge:true });
    }
  }catch(e){
    console.warn('NestIQ: unlock tenantAccount', e);
  }
  try{
    await window.nestiqDb.collection('users').doc(uid).set({
      status:'pending-lease',
      landlordId:String(lid),
      tenantDocId:String(tenant.id)
    },{ merge:true });
  }catch(_e){}
  return true;
}

function nestiqTenantStatusForLeaseStart(ls){
  if(!ls) return 'pending-lease';
  try{
    const d=new Date(String(ls).slice(0,10)+'T12:00:00');
    if(String(d)==='Invalid Date') return 'pending-lease';
    const today=new Date(); today.setHours(0,0,0,0);
    d.setHours(0,0,0,0);
    if(d.getTime()>today.getTime()) return 'pending-lease';
  }catch(_e){}
  return 'due';
}

async function nestiqAttachApprovedLeaseSummary(tenant, property){
  if(!tenant||!window.nestiqUseFirestore||!window.nestiqDb) return null;
  const lid=typeof nestiqCurrentLandlordUid==='function'?nestiqCurrentLandlordUid():firebase?.auth?.()?.currentUser?.uid;
  if(!lid||!window.nestiqFs?.documents) return null;
  if(typeof generateLeasePDF!=='function'){
    console.warn('NestIQ: generateLeasePDF missing — skip lease document attach');
    return null;
  }
  try{
    const dataUrl=generateLeasePDF(tenant, property||{}, [], (typeof window.nestiqPrimaryLeaseForTenant==='function'?window.nestiqPrimaryLeaseForTenant(tenant.id):null), { returnDataUrl:true, silent:true });
    if(!dataUrl) return null;
    let url=dataUrl;
    try{
      if(typeof window.uploadNestiqFile==='function'){
        const path=`landlords/${lid}/tenant-docs/${tenant.id}/lease-summary-${Date.now()}.pdf`;
        url=await window.uploadNestiqFile(path, dataUrl, 'application/pdf');
      }
    }catch(err){
      console.warn('NestIQ: lease PDF storage upload, using inline URL', err);
    }
    const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
    const row={
      tenantId:String(tenant.id),
      tenantUid:tenant.portalUid||null,
      propertyId:tenant.propertyId!=null?String(tenant.propertyId):'',
      landlordId:lid,
      name:'System-generated lease summary',
      type:'lease',
      url,
      systemGenerated:true,
      source:'approval',
      date:new Date().toISOString().slice(0,10),
      readBy:[]
    };
    if(fv) row.uploadedAt=fv.serverTimestamp();
    await window.nestiqFs.documents(window.nestiqDb, lid).add(row);
    return true;
  }catch(err){
    console.warn('NestIQ: attach lease summary document', err);
    nestiqShowNotif?.('Tenant approved, but the lease PDF could not be saved to Documents.','warning');
    return null;
  }
}

async function nestiqApplicationConfirmApprove(appId){
  const a=nestiqFindApplication(appId);
  if(!a){ nestiqShowNotif('Application not found','error'); return; }
  const apprBtn=nestiqBtnFromEvent?.()||document.querySelector('#modalOverlay .btn-gold');
  nestiqSetBtnLoading?.(apprBtn,true,'Approving...');
  try{
  const lid=typeof nestiqCurrentLandlordUid==='function'?nestiqCurrentLandlordUid():(firebase?.auth?.()?.currentUser?.uid||null);
  if((a.status||'')==='approved'&&nestiqTenantForApplication(a)){
    const t=nestiqTenantForApplication(a);
    a.linkedTenantId=t.id;
    try{
      if(window.nestiqUseFirestore&&typeof window.nestiqPersistSingleTenantToFirestore==='function'){
        await window.nestiqPersistSingleTenantToFirestore(t);
      }
      await nestiqPersistApplicationRecordToFirestoreById(appId, a);
      nestiqShowNotif('Tenant already linked — re-saved to cloud. Refresh to confirm it stays.','success');
    }catch(e){
      console.error(e);
      nestiqShowNotif('Cloud save failed: '+(e?.message||'unknown'),'error');
    }
    nestiqRenderApplicationsPage?.();
    return;
  }
  const emailLc=String(a.email||'').trim().toLowerCase();
  if(!emailLc){ nestiqShowNotif('Application has no email — cannot create tenant login','error'); return; }
  const prop=propertiesData.find(p=>String(p.id)===String(a.propertyId))
    ||propertiesData.find(p=>Number(p.id)===Number(a.propertyId)&&Number.isFinite(Number(a.propertyId)));
  const propName=prop?.name||a.propertyName;
  const moveIn=document.getElementById('nestiqApprMoveIn')?.value||'';
  const ls=document.getElementById('nestiqApprLeaseStart')?.value||'';
  const le=document.getElementById('nestiqApprLeaseEnd')?.value||'';
  const monthlyRent=Number(document.getElementById('nestiqApprRent')?.value)||0;
  const depositAmt=Number(document.getElementById('nestiqApprDeposit')?.value)||0;
  const dueDay=Math.max(1,Math.min(28,Number(document.getElementById('nestiqApprDueDay')?.value)||1));
  const prorateFirstMonth=!!document.getElementById('nestiqApprProrate')?.checked;
  if(!document.getElementById('nestiqApprSignAgree')?.checked){
    nestiqShowNotif('Tick the box to sign as landlord and send the lease.','warning');
    nestiqSetBtnLoading?.(apprBtn,false);
    return;
  }
  const landlordSignName=String(document.getElementById('nestiqApprSignName')?.value||'').trim();
  if(landlordSignName.length<3){
    nestiqShowNotif('Type your full legal name to sign the lease as landlord.','warning');
    nestiqSetBtnLoading?.(apprBtn,false);
    return;
  }
  const depositDueNow=document.getElementById('nestiqApprDepositNow')
    ? !!document.getElementById('nestiqApprDepositNow')?.checked
    : true;
  const firstRentDueNow=!!document.getElementById('nestiqApprFirstRentNow')?.checked;
  const unitSel=document.getElementById('nestiqApprUnit');
  const selectedUnitId=String(unitSel?.value||'').trim();
  const selectedUnit=selectedUnitId
    ? (typeof nestiqUnitsList==='function'?nestiqUnitsList():(window.unitsData||[])).find(u=>String(u.id)===selectedUnitId)
    : null;
  const unitOpen=selectedUnit
    && (typeof nestiqUnitIsOpenForApplication==='function'
      ? nestiqUnitIsOpenForApplication(selectedUnit)
      : (typeof nestiqUnitIsAvailable==='function'
        ? nestiqUnitIsAvailable(selectedUnit)
        : ['vacant','available',''].includes(String(selectedUnit.status||'').toLowerCase())))
    && (selectedUnit.tenantId==null||selectedUnit.tenantId==='');
  const unitIdToAssign=unitOpen?selectedUnitId:'';
  const unit=String(selectedUnit?.label||selectedUnit?.unitNumber||'Unit').trim()||'Unit';
  if(!unitIdToAssign){
    nestiqShowNotif('No vacant unit selected — the lease will still be sent for signature. You can assign a unit from Leases later.','warning');
  }
  const name=`${a.firstName||''} ${a.lastName||''}`.trim();
  const leaseLabel=le?new Date(le+'T12:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'TBD';
  if(lid) a.listingLandlordId=a.listingLandlordId||lid;
  const linkApprovedUnit=async (tenant)=>{
    if(!tenant) return;
    tenant.unit=unit;
    tenant.unitId=unitIdToAssign||tenant.unitId||null;
    tenant.unitNumber=unit;
    tenant.leaseStatus=tenant.leaseStatus||'pending_signature';
  };

  function nestiqApproveLeaseSignName(){
    const typed=String(document.getElementById('nestiqApprSignName')?.value||'').trim();
    if(typed.length>=3) return typed;
    const n=String(nestiqLandlordDisplay()||landlordSettings?.name||firebase?.auth?.()?.currentUser?.displayName||'').trim();
    if(n.length>=3) return n;
    const emailPart=String(firebase?.auth?.()?.currentUser?.email||'').split('@')[0].trim();
    if(emailPart.length>=3) return emailPart;
    return 'Landlord';
  }
  function nestiqApproveLeasePetsDetails(){
    if(!a.hasPets) return '';
    return String(a.petDetails||[a.petType,a.petBreed,a.petSize].filter(Boolean).join(' · ')||'').trim();
  }
  async function createDraftLeaseForApprovedTenant(tenant){
    if(typeof window.nestiqCreateDraftLease!=='function') return null;
    try{
      const lease=await window.nestiqCreateDraftLease({
        tenant,
        propertyId:prop?.id||a.propertyId,
        propertyName:propName,
        unitId:unitIdToAssign||null,
        unitLabel:unit,
        leaseStart:ls||moveIn,
        leaseEnd:le,
        rent:monthlyRent,
        deposit:depositAmt,
        dueDate:dueDay,
        prorateFirstMonth,
        applicationId:a.id,
        landlordId:lid,
        occupants:Math.max(1,Number(a.numberOfOccupants)||1),
        pets:{ allowed:!!a.hasPets, details:nestiqApproveLeasePetsDetails() },
        initialPayment:{ depositDueNow, firstRentDueNow }
      });
      if(lease?.id) a.leaseId=lease.id;
      if(lease?.id && typeof window.nestiqLandlordSendLeaseForSignature==='function'){
        try{
          const sent=await window.nestiqLandlordSendLeaseForSignature(lease.id,{
            occupants:Math.max(1,Number(a.numberOfOccupants)||lease.occupants||1),
            petsAllowed:!!a.hasPets,
            petsDetails:nestiqApproveLeasePetsDetails(),
            utilitiesIncluded:Array.isArray(lease.utilitiesIncluded)?lease.utilitiesIncluded:[],
            noticePeriodDays:lease.noticePeriodDays||30,
            maintenanceResponsibilities:lease.maintenanceResponsibilities||'',
            additionalClauses:(lease.additionalClauses||[]).join('\n'),
            dueDate:lease.dueDate,
            prorateFirstMonth:!!lease.prorateFirstMonth,
            rent:lease.rent,
            deposit:lease.deposit,
            typedName:nestiqApproveLeaseSignName(),
            depositDueNow,
            firstRentDueNow,
            silent:true
          });
          return sent||lease;
        }catch(sendErr){
          console.warn('NestIQ: send lease on approve', sendErr);
          nestiqShowNotif?.('Tenant approved, but the lease could not be sent for signature. Open Leases to send it.','warning');
          return lease;
        }
      }
      return lease;
    }catch(e){
      console.warn('NestIQ: draft lease on approve', e);
      nestiqShowNotif?.('Tenant created, but the lease could not be saved. Open Leases to retry.','warning');
      return null;
    }
  }

  const portalUid=a.hasPortalAccount&&a.applicantUid?String(a.applicantUid):'';
  let existingTenant=null;
  if(portalUid){
    existingTenant=(tenantsData||[]).find(t=>
      String(t.id)===String(a.linkedTenantId||'')
      || String(t.portalUid||'')===portalUid
      || String(t.id)===portalUid
    )||null;
  }
  if(!existingTenant){
    existingTenant=nestiqTenantForApplication(a)||tenantsData.find(t=>
      String(t.applicationId||'')===String(a.id)
      || (String(t.email||'').toLowerCase()===emailLc&&String(t.propertyId||t.property||'')===String(prop?.id||a.propertyId||propName))
    )||null;
  }

  // Self-registered applicant: save tenant details and unlock the portal on this same account.
  if(portalUid){
    const patch={
      name:name||existingTenant?.name||'',
      property:propName,
      propertyId:prop?.id||a.propertyId,
      unit,
      unitId:unitIdToAssign||null,
      unitNumber:unit,
      rent:monthlyRent,
      status:'pending-lease',
      leaseStatus:'pending_signature',
      lease:leaseLabel,
      leaseStart:ls||moveIn||new Date().toISOString().slice(0,10),
      leaseEnd:le||'2026-12-31',
      monthlyDueDate:dueDay,
      prorateFirstMonth,
      phone:a.phone||existingTenant?.phone||'',
      email:emailLc,
      landlordId:lid||existingTenant?.landlordId,
      hasPortalAccess:true,
      portalUid,
      tenantUid:portalUid,
      portalEmail:emailLc,
      selfRegistered:true,
      applicationId:a.id,
      deposit:typeof nestiqNormalizeTenantDeposit==='function'
        ?nestiqNormalizeTenantDeposit({amount:depositAmt,collected:false,status:'pending'},monthlyRent)
        :depositAmt
    };
    const apPhoto=nestiqApplicantPhotoUrl(a)||nestiqApplicantPhotoUrl(existingTenant);
    if(apPhoto) patch.profilePhoto=apPhoto;
    let tenant=existingTenant;
    if(!tenant){
      tenant={ ...patch, id:a.linkedTenantId||portalUid, payments:[] };
      if(!Array.isArray(tenantsData)) tenantsData=[];
      tenantsData.push(tenant);
    }else{
      Object.assign(tenant, patch);
    }
    try{
      if(window.nestiqUseFirestore){
        if(typeof window.nestiqPersistSingleTenantToFirestore==='function'){
          await window.nestiqPersistSingleTenantToFirestore(tenant);
        }
        const db=window.nestiqDb;
        if(db&&lid){
          await (window.nestiqFs?.tenants?.(db, lid)||db.collection('landlords').doc(lid).collection('tenants'))
            .doc(String(tenant.id)).set({ ...patch, id:String(tenant.id), portalUid, hasPortalAccess:true },{ merge:true });
        }
      }
    }catch(e){
      console.error(e);
      nestiqShowNotif?.('Could not update existing tenant: '+(e?.message||'unknown'),'error');
      return;
    }
    a.status='approved';
    a.processedDate=new Date().toISOString().slice(0,10);
    a.processedBy=nestiqLandlordDisplay();
    a.linkedTenantId=tenant.id;
    a.hasPortalAccount=true;
    saveData?.();
    await nestiqPersistApplicationRecordToFirestoreById(appId, a);
    await linkApprovedUnit(tenant);
    await createDraftLeaseForApprovedTenant(tenant);
    await nestiqPersistApplicationRecordToFirestoreById(appId, a);
    await nestiqAttachApprovedLeaseSummary(tenant, prop||{});

    await nestiqUnlockSelfApplicantPortal(tenant, lid);

    closeModal?.();
    try{ renderTenants?.(); }catch(_e){}
    try{ renderProperties?.(); }catch(_e){}
    nestiqRenderApplicationsPage?.();
    nestiqConfetti?.({ count: 60, density: 55 });

    nestiqShowNotif(`✅ ${name} approved · lease sent for signature. They can sign in with the same account — no invite code needed.`,'success');
    const portalBlock=`*Tenant portal*\nSign in to NestIQ with ${emailLc} (the same account you used to apply). Your lease is ready — open the portal and tap Sign lease. Rent is only due after the lease is signed, on the due dates in the agreement.`;
    const waMsg=[
      `Dear ${a.firstName||name},`,
      ``,
      `Congratulations — your application to rent *${propName}*${unit?` (Unit ${unit})`:''} has been approved.`,
      ``,
      `Your lease is ready to review and sign in NestIQ. Sign in with this same account, open My Lease, and type your full name to accept.`,
      ``,
      `• Move-in date: ${moveIn}`,
      `• Monthly rent: ${nestiqFormatMoney(monthlyRent)}`,
      `• Deposit required: ${nestiqFormatMoney(depositAmt)}`,
      ``,
      portalBlock,
      ``,
      `— ${nestiqLandlordDisplay()}`
    ].join('\n');
    const phP=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
    if(phP) openWhatsAppChat?.(phP,waMsg);
    return;
  }

  // Existing tenant without portal login: link + still send invite if needed.
  if(existingTenant){
    a.status='approved';
    a.processedDate=a.processedDate||new Date().toISOString().slice(0,10);
    a.processedBy=a.processedBy||nestiqLandlordDisplay();
    a.linkedTenantId=existingTenant.id;
    if(!existingTenant.applicationId) existingTenant.applicationId=a.id;
    if(lid&&!existingTenant.landlordId) existingTenant.landlordId=lid;
    Object.assign(existingTenant,{
      property:propName||existingTenant.property,
      propertyId:prop?.id||a.propertyId||existingTenant.propertyId,
      unit:unit||existingTenant.unit,
      unitId:unitIdToAssign||existingTenant.unitId||null,
      unitNumber:unit||existingTenant.unitNumber||existingTenant.unit,
      rent:monthlyRent||existingTenant.rent,
      lease:leaseLabel||existingTenant.lease,
      leaseStart:ls||moveIn||existingTenant.leaseStart,
      leaseEnd:le||existingTenant.leaseEnd,
      leaseStatus:existingTenant.leaseStatus||'pending_signature',
      monthlyDueDate:dueDay,
      prorateFirstMonth,
      status:'pending-lease'
    });
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
      nestiqShowNotif?.('Could not save existing tenant to the cloud: '+(e?.message||'unknown'),'error');
      return;
    }
    await linkApprovedUnit(existingTenant);
    await createDraftLeaseForApprovedTenant(existingTenant);
    await nestiqAttachApprovedLeaseSummary(existingTenant, prop||{});
    const ok=await nestiqPersistApplicationRecordToFirestoreById(appId, a);
    closeModal?.();
    nestiqRenderApplicationsPage?.();
    let invExisting=null;
    const needsInvite=!(existingTenant.portalUid&&existingTenant.hasPortalAccess);
    if(window.nestiqUseFirestore&&needsInvite){
      try{
        if(typeof window.nestiqAfterTenantAddedFlow==='function'){
          invExisting=await window.nestiqAfterTenantAddedFlow(existingTenant,{
            sendEmail:true,
            fromApprove:true,
            showModal:true,
            applicationId:a.id,
            tenantEmail:emailLc,
            propertyName:propName
          });
        }
      }catch(e){
        console.warn('NestIQ: portal email for existing tenant', e);
      }
    }
    nestiqShowNotif(
      ok
        ? (emailLc?`Application linked. They sign in with ${emailLc} — no invitation code.`:'Application linked to existing tenant record.')
        :'Application updated locally; cloud sync failed — refresh and try again.',
      'success'
    );
    return;
  }

  const baseTenant={
    name,
    property:propName,
    propertyId:prop?.id||a.propertyId,
    unit,
    unitId:unitIdToAssign||null,
    unitNumber:unit,
    rent:monthlyRent,
    status:'pending-lease',
    leaseStatus:'pending_signature',
    lease:leaseLabel,
    leaseStart:ls||moveIn||new Date().toISOString().slice(0,10),
    leaseEnd:le||'2026-12-31',
    monthlyDueDate:dueDay,
    prorateFirstMonth,
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
  const walkInPhoto=nestiqApplicantPhotoUrl(a);
  if(walkInPhoto) baseTenant.profilePhoto=walkInPhoto;

  let newTenant={ ...baseTenant, id:tenantNextId++ };
  let cloudSaved=false;
  if(window.nestiqUseFirestore){
    if(typeof window.nestiqCreateTenantDocInFirestore!=='function'&&typeof window.nestiqPersistSingleTenantToFirestore!=='function'){
      nestiqShowNotif?.('App is outdated in this browser cache. Press Ctrl+F5 to hard-refresh, then try again.','error');
      return;
    }
    try{
      nestiqShowNotif?.('Saving tenant to cloud…','info');
      if(typeof window.nestiqCreateTenantDocInFirestore==='function'){
        const fireId=await window.nestiqCreateTenantDocInFirestore(baseTenant);
        newTenant={ ...baseTenant, id:fireId, landlordId:lid||baseTenant.landlordId };
      }else{
        await window.nestiqPersistSingleTenantToFirestore(newTenant);
      }
      cloudSaved=true;
    }catch(e){
      console.error('NestIQ: tenant Firestore create on approve', e);
      nestiqShowNotif?.('Could not save tenant to the cloud: '+(e?.message||'unknown error')+'. Hard-refresh (Ctrl+F5) and try again while signed in as landlord.','error');
      return;
    }
    if(!cloudSaved){
      nestiqShowNotif?.('Tenant was not saved to the cloud. Nothing was approved.','error');
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
  saveData?.();
  const persisted=await nestiqPersistApplicationRecordToFirestoreById(appId, a);
  await linkApprovedUnit(newTenant);
  await createDraftLeaseForApprovedTenant(newTenant);
  await nestiqAttachApprovedLeaseSummary(newTenant, prop||{});
  await nestiqPersistApplicationRecordToFirestoreById(appId, a);
  if(!persisted&&window.nestiqUseFirestore){
    nestiqShowNotif?.('Tenant created, but application status could not sync to the cloud. Refresh the page; if it still shows Pending, open the application and contact support.','warning');
  }

  closeModal?.();
  try{ renderTenants?.(); }catch(_e){}
  try{ renderProperties?.(); }catch(_e){}
  nestiqRenderApplicationsPage?.();
  nestiqConfetti?.({ count: 60, density: 55 });

  let inv=null;
  if(window.nestiqUseFirestore){
    try{
      if(typeof window.nestiqAfterTenantAddedFlow==='function'){
        inv=await window.nestiqAfterTenantAddedFlow(newTenant,{
          sendEmail:true,
          fromApprove:true,
          showModal:true,
          tenantEmail:emailLc,
          propertyName:propName,
          applicationId:a.id
        });
      }
    }catch(e){
      console.warn('NestIQ: portal email on approve', e);
    }
  }

  nestiqShowNotif(`✅ ${name} approved · lease sent for signature`+(emailLc?` · they sign in with ${emailLc}`:''),'success');

  const base=(typeof nestiqAppBaseUrlSafe==='function'?nestiqAppBaseUrlSafe():String(location.origin||'')+'/').replace(/\/?$/,'/');
  let portalBlock='';
  if(emailLc){
    portalBlock=`*Next step*\nSign in with ${emailLc} at ${base}\nOpen My Lease and type your full name.\nNo invitation code.`;
  }
  const msg=[
    `Dear ${a.firstName||name},`,
    ``,
    `Congratulations — your application to rent *${propName}* has been approved.`,
    ``,
    `Your lease is ready to review and sign in NestIQ. Open the tenant portal, go to My Lease, and type your full name to accept.`,
    ``,
    `• Move-in date: ${moveIn}`,
    `• Monthly rent: ${nestiqFormatMoney(monthlyRent)}`,
    `• Deposit required: ${nestiqFormatMoney(depositAmt)}`,
    ``,
    `Welcome to ${propName}!`,
    ...(portalBlock?[``,portalBlock]:[]),
    ``,
    `— ${nestiqLandlordDisplay()}`
  ].join('\n');
  const ph=formatWhatsAppNumber?.(a.phone)||String(a.phone||'').replace(/\D/g,'');
  if(ph) openWhatsAppChat?.(ph,msg);
  }finally{
    nestiqSetBtnLoading?.(apprBtn,false);
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
    <label class="nestiq-papp-check"><input type="checkbox" id="nestiqDeclineShareReason"> Show the selected reason to the applicant in their portal</label>
    <label class="nestiq-papp-check"><input type="checkbox" id="nestiqDeclineSendWa" checked> Send decline notification via WhatsApp</label>
    <button type="button" class="btn-outline" style="width:100%;justify-content:center;margin-top:14px;border-color:var(--rust);color:var(--rust);min-height:44px" onclick='nestiqApplicationConfirmDecline(${JSON.stringify(appId)})'>Confirm Decline</button>`;
  nestiqOpenModalAnimated();
}

async function nestiqApplicationConfirmDecline(appId){
  const a=nestiqFindApplication(appId);
  if(!a) return;
  const checked=[...document.querySelectorAll('.nestiq-decline-reason:checked')].map(x=>x.value);
  const reasonLabels={inc:'Income does not meet requirements',ev:'Previous eviction history',ref:'Unable to verify references',nav:'Property no longer available',othsel:'Another application was selected',cred:'Credit concerns',oth:'Other'};
  const notes=document.getElementById('nestiqDeclineNotes')?.value||'';
  const sendWa=document.getElementById('nestiqDeclineSendWa')?.checked!==false;
  const shareReason=document.getElementById('nestiqDeclineShareReason')?.checked===true;
  a.status='declined';
  a.processedDate=new Date().toISOString().slice(0,10);
  a.processedBy=nestiqLandlordDisplay();
  a.declineReasons=checked.map(c=>reasonLabels[c]||c);
  a.declineNotes=notes;
  a.shareDeclineReason=shareReason;
  saveData?.();
  await nestiqPersistApplicationRecordToFirestoreById(appId, a);
  closeModal?.();
  nestiqRenderApplicationsPage?.();
  nestiqShowNotif('Application declined','success');
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
  await nestiqPersistApplicationRecordToFirestoreById(appId, a);
  closeModal?.();
  nestiqRenderApplicationsPage?.();
  nestiqShowNotif('Application moved to waitlist','success');
}

async function nestiqInviteFromApplication(appId){
  const a=nestiqFindApplication(appId);
  if(!a){
    nestiqShowNotif?.('Application not found','error');
    return null;
  }
  const tenant=nestiqEnsureApplicationTenantLink(a)||nestiqTenantForApplication(a);
  if(!tenant||tenant.id==null||tenant.id===''){
    nestiqShowNotif?.('No tenant profile linked yet. Approve the application first.','warning');
    return null;
  }
  if(tenant.portalUid&&tenant.hasPortalAccess){
    nestiqShowNotif?.('This tenant already has portal access.','info');
    return null;
  }
  if(typeof window.nestiqInviteTenantToPortal!=='function'){
    nestiqShowNotif?.('Invitation service not loaded. Hard-refresh (Ctrl+F5) and try again.','error');
    return null;
  }
  return window.nestiqInviteTenantToPortal(tenant.id);
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

function nestiqApplicationStatusLabel(st, extras){
  extras=extras&&typeof extras==='object'?extras:{};
  if(extras.tenancyEnded) return { text:'Tenancy ended', cls:'badge-amber', tone:'ended' };
  const s=String(st||'pending').toLowerCase();
  if(s==='approved') return { text:'Application Approved', cls:'badge-green', tone:'approved' };
  if(s==='declined') return { text:'Not Approved', cls:'badge-red', tone:'declined' };
  if(s==='waitlisted') return { text:'Waitlisted', cls:'badge-amber', tone:'waitlisted' };
  if(s==='info_required') return { text:'More Information Required', cls:'badge-gold', tone:'info' };
  if(s==='reviewing') return { text:'Under Review', cls:'badge-amber', tone:'review' };
  return { text:'Under Review', cls:'badge-amber', tone:'review' };
}

function nestiqApplicationStatusCopy(a){
  const st=String(a?.status||'pending').toLowerCase();
  const unit=a?.unitLabel||a?.unit||'this unit';
  const j=nestiqApplicationJourneyState(a);
  if(st==='info_required'){
    return 'The landlord has requested additional information. Upload what they asked for, then submit.';
  }
  if(st==='declined'){
    return `Unfortunately, your application for ${unit} was not approved.`;
  }
  if(st==='waitlisted'){
    return 'You are on the waitlist. The landlord may still approve this application if a unit becomes available.';
  }
  if(j.tenancyEnded){
    return 'Your tenancy at this property has ended. You are no longer an occupant. Browse listings to apply for another vacant unit.';
  }
  if(st==='approved' && j.leaseActive){
    return 'Your lease is signed. You are now an active tenant.';
  }
  if(st==='approved'){
    return `Congratulations. Your application for ${unit} has been approved. Next step: review and sign your lease agreement.`;
  }
  return 'Your application is currently being reviewed by the landlord.';
}

function nestiqApplicantAuthUid(){
  try{ return firebase?.auth?.()?.currentUser?.uid||''; }catch(_e){ return ''; }
}

async function nestiqFetchMyApplications(){
  const uid=nestiqApplicantAuthUid();
  const email=(()=>{
    try{
      const s=typeof getSession==='function'?getSession():null;
      return String(s?.email||firebase?.auth?.()?.currentUser?.email||'').trim().toLowerCase();
    }catch(_e){ return ''; }
  })();
  const byId=new Map();
  const put=a=>{
    if(!a||!a.id) return;
    const cur=byId.get(String(a.id));
    byId.set(String(a.id), cur?nestiqMergeApplicationRows(cur,a):a);
  };
  (nestiqAppsReadLsArray()||[]).forEach(a=>{
    if(uid && String(a.applicantUid||'')===uid) put(a);
    else if(email && String(a.email||'').toLowerCase()===email) put(a);
  });
  const db=window.nestiqDb;
  if(db && uid){
    try{
      const snap=await db.collection('applications').where('applicantUid','==',uid).get();
      snap.docs.forEach(d=>put({ id:d.id, ...d.data() }));
    }catch(e){
      console.warn('NestIQ: fetch my applications', e);
    }
    const lid=String(window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId||window.currentTenantData?.landlordId||'').trim();
    if(lid && window.nestiqFs?.applications){
      try{
        const scoped=await window.nestiqFs.applications(db, lid).where('applicantUid','==',uid).get();
        scoped.docs.forEach(d=>put({ id:d.id, ...d.data() }));
      }catch(e){
        console.warn('NestIQ: fetch my landlord applications', e);
      }
    }
  }
  return Array.from(byId.values()).sort((a,b)=>String(b.createdAt||b.applicationDate||'').localeCompare(String(a.createdAt||a.applicationDate||'')));
}

function nestiqStopMyApplicationsWatch(){
  if(window.__nestiqMyAppsUnsubs){
    window.__nestiqMyAppsUnsubs.forEach(fn=>{ try{ fn(); }catch(_e){} });
    window.__nestiqMyAppsUnsubs=null;
  }
}

function nestiqWatchMyApplications(onChange){
  nestiqStopMyApplicationsWatch();
  const uid=nestiqApplicantAuthUid();
  const db=window.nestiqDb;
  if(!uid||!db||typeof onChange!=='function'){
    Promise.resolve(nestiqFetchMyApplications()).then(onChange).catch(()=>onChange([]));
    return;
  }
  const unsubs=[];
  const byId=new Map();
  const emit=()=>{
    const rows=Array.from(byId.values()).sort((a,b)=>String(b.createdAt||b.applicationDate||'').localeCompare(String(a.createdAt||a.applicationDate||'')));
    try{ onChange(rows); }catch(_e){}
  };
  const ingest=snap=>{
    snap.docChanges().forEach(ch=>{
      if(ch.type==='removed') return;
      const incoming={ id:ch.doc.id, ...ch.doc.data() };
      const cur=byId.get(ch.doc.id);
      byId.set(ch.doc.id, cur?nestiqMergeApplicationRows(cur, incoming):incoming);
    });
    emit();
  };
  unsubs.push(db.collection('applications').where('applicantUid','==',uid).onSnapshot(ingest, err=>{
    console.warn('NestIQ: my applications watch', err);
    nestiqFetchMyApplications().then(onChange).catch(()=>onChange([]));
  }));
  const lid=String(window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId||window.currentTenantData?.landlordId||'').trim();
  if(lid && window.nestiqFs?.applications){
    unsubs.push(window.nestiqFs.applications(db, lid).where('applicantUid','==',uid).onSnapshot(ingest, ()=>{}));
  }
  window.__nestiqMyAppsUnsubs=unsubs;
  nestiqFetchMyApplications().then(rows=>{
    rows.forEach(a=>byId.set(String(a.id), a));
    emit();
  }).catch(()=>emit());
}

async function nestiqApplicantPersistApplicationPatch(appId, patch){
  const uid=nestiqApplicantAuthUid();
  const db=window.nestiqDb;
  if(!uid||!db||!appId||!patch) return false;
  const lid=String(patch.listingLandlordId||window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId||window.currentTenantData?.landlordId||'').trim();
  const payload={
    status:patch.status,
    updatedAt:new Date().toISOString()
  };
  if('infoResponseDocuments' in patch) payload.infoResponseDocuments=patch.infoResponseDocuments;
  if('infoRespondedAt' in patch) payload.infoRespondedAt=patch.infoRespondedAt;
  if('infoResponseNote' in patch) payload.infoResponseNote=patch.infoResponseNote;
  let ok=false;
  try{
    await db.collection('applications').doc(String(appId)).update(payload);
    ok=true;
  }catch(e){
    console.warn('NestIQ: applicant public application update', e);
  }
  if(lid && window.nestiqFs?.applications){
    try{
      await window.nestiqFs.applications(db, lid).doc(String(appId)).update(payload);
      ok=true;
    }catch(e){
      console.warn('NestIQ: applicant scoped application update', e);
    }
  }
  return ok;
}

async function nestiqApplicantUploadInfoDoc(appId, file){
  if(!file||!appId) return null;
  if(file.size>8*1024*1024){
    nestiqShowNotif?.('Please choose a file smaller than 8MB.','warning');
    return null;
  }
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
  let url='';
  if(typeof window.uploadNestiqFile==='function'){
    try{
      const safe=String(file.name||'document').replace(/[^\w.\-]+/g,'_').slice(0,80);
      url=await window.uploadNestiqFile(`applications/${appId}/extra/${Date.now()}_${safe}`, dataUrl, file.type||'application/octet-stream');
    }catch(e){
      console.warn('NestIQ: extra application upload', e);
    }
  }
  if(!url){
    nestiqShowNotif?.('Could not upload the file. Try a smaller PDF or image.','error');
    return null;
  }
  return { name:file.name||'Document', url, uploadedAt:new Date().toISOString() };
}

async function nestiqApplicantSubmitInfoResponse(appId){
  const rows=window.__nestiqMyApplicationsCache||[];
  const a=rows.find(x=>String(x.id)===String(appId));
  if(!a){ nestiqShowNotif?.('Application not found. Refresh and try again.','error'); return false; }
  if(String(a.status||'')!=='info_required'){
    nestiqShowNotif?.('This application is not waiting for extra information.','info');
    return false;
  }
  const docs=Array.isArray(a.infoResponseDocuments)?a.infoResponseDocuments:[];
  const note=String(document.getElementById('nestiqInfoReplyNote-'+appId)?.value||'').trim();
  if(!docs.length && !note){
    nestiqShowNotif?.('Upload a document or add a short reply first.','warning');
    return false;
  }
  const patch={
    status:'reviewing',
    infoResponseDocuments:docs,
    infoResponseNote:note,
    infoRespondedAt:new Date().toISOString(),
    listingLandlordId:a.listingLandlordId||''
  };
  const ok=await nestiqApplicantPersistApplicationPatch(appId, patch);
  if(ok){
    Object.assign(a, patch);
    nestiqShowNotif?.('Submitted. Your application is back under review.','success');
    try{ window.nestiqRenderTenantApplications?.(); }catch(_e){}
  }else{
    nestiqShowNotif?.('Could not submit. Try again in a moment.','error');
  }
  return ok;
}

async function nestiqMarkApplicationsTenancyEndedForTenant(tenant){
  if(!tenant) return;
  const tid=String(tenant.id||'');
  const email=String(tenant.email||'').trim().toLowerCase();
  const uid=String(tenant.portalUid||tenant.tenantUid||tenant.applicantUid||'').trim();
  const pid=String(tenant.propertyId||'').trim();
  const now=new Date().toISOString();
  const list=typeof applications!=='undefined'&&Array.isArray(applications)?applications:[];
  const seen=new Set();
  const hits=[];
  list.forEach(a=>{
    if(!a||!a.id) return;
    const match=String(a.linkedTenantId||'')===tid
      || String(tenant.applicationId||'')===String(a.id)
      || (uid && String(a.applicantUid||'')===uid && (!pid || String(a.propertyId||'')===pid))
      || (email && String(a.email||'').trim().toLowerCase()===email && (!pid || String(a.propertyId||'')===pid));
    if(!match) return;
    if(String(a.status||'').toLowerCase()!=='approved') return;
    hits.push(a);
    seen.add(String(a.id));
  });
  for(const a of hits){
    a.occupancyEnded=true;
    a.tenancyEndedAt=a.tenancyEndedAt||now;
    try{ await nestiqPersistApplicationRecordToFirestoreById(a.id, a); }catch(_e){}
  }
}
window.nestiqMarkApplicationsTenancyEndedForTenant=nestiqMarkApplicationsTenancyEndedForTenant;

function nestiqMyApplicationCardHtml(a){
  const j=nestiqApplicationJourneyState(a);
  const st=nestiqApplicationStatusLabel(a.status,{ tenancyEnded:j.tenancyEnded });
  const rent=typeof nestiqRentForApp==='function'?nestiqRentForApp(a):Number(a.listingMonthlyRent||0);
  const unit=a.unitLabel||a.unit||'—';
  const tone=st.tone||'review';
  const leaseId=j.lease?JSON.stringify(String(j.lease.id)):'';
  let cta='';
  if(String(a.status||'')==='info_required'){
    cta=`<button type="button" class="btn-gold btn-sm" onclick='nestiqOpenMyApplicationDetail(${JSON.stringify(String(a.id))})'>Upload document</button>`;
  }else if(String(a.status||'')==='approved' && j.lease && !j.leaseActive && !j.tenancyEnded){
    cta=`<button type="button" class="btn-gold btn-sm" onclick='nestiqOpenLeasePdf(${leaseId},{preview:true})'>View Lease</button>
      ${j.leaseSt==='pending_signature'&&j.lease.landlordSigned&&!j.lease.tenantSigned?`<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenTenantSignLeaseModal(${leaseId})'>Sign lease</button>`:''}`;
  }else{
    cta=`<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenMyApplicationDetail(${JSON.stringify(String(a.id))})'>View Application</button>`;
  }
  const reason=String(a.status||'')==='declined' && a.shareDeclineReason && (a.declineReasons||[]).length
    ? `<p class="nestiq-myapp-reason">Reason: ${nestiqAppEsc((a.declineReasons||[]).join(', '))}</p>`
    : '';
  return `<article class="nestiq-myapp-card nestiq-myapp-card--${tone}">
    <div class="nestiq-myapp-card-main">
      <div class="nestiq-myapp-kicker">${nestiqAppEsc(a.id||'Application')}</div>
      <h3 class="nestiq-myapp-title">${nestiqAppEsc(a.propertyName||'Property')}</h3>
      <p class="nestiq-myapp-unit">Unit ${nestiqAppEsc(unit)}</p>
      <dl class="nestiq-myapp-meta">
        <div><dt>Monthly rent</dt><dd>${nestiqFormatMoney(rent)}</dd></div>
        <div><dt>Preferred move-in</dt><dd>${nestiqPrettyAppDate(a.preferredMoveInDate||a.availableFrom)}</dd></div>
        <div><dt>Applied</dt><dd>${nestiqPrettyAppDate(a.applicationDate||a.createdAt)}</dd></div>
      </dl>
      <div class="nestiq-myapp-status"><span class="badge ${st.cls}">${nestiqAppEsc(st.text)}</span></div>
      <p class="nestiq-myapp-copy">${nestiqAppEsc(nestiqApplicationStatusCopy(a))}</p>
      ${reason}
      ${String(a.status||'')==='info_required'&&a.infoRequestMessage?`<blockquote class="nestiq-myapp-request">${nestiqAppEsc(a.infoRequestMessage)}</blockquote>`:''}
      <div class="nestiq-myapp-actions">${cta}</div>
    </div>
    ${nestiqApplicationJourneyHtml(a)}
  </article>`;
}

function nestiqOpenMyApplicationDetail(appId){
  const rows=window.__nestiqMyApplicationsCache||[];
  const a=rows.find(x=>String(x.id)===String(appId));
  if(!a){ nestiqShowNotif?.('Application not found','error'); return; }
  const docs=nestiqApplicationSubmittedDocs(a);
  const j=nestiqApplicationJourneyState(a);
  const st=nestiqApplicationStatusLabel(a.status,{ tenancyEnded:j.tenancyEnded });
  const info=String(a.status||'')==='info_required';
  const host=document.getElementById('modalContent');
  if(!host) return;
  host.innerHTML=`
    <h2 class="modal-title">Application ${nestiqAppEsc(a.id||'')}</h2>
    <p class="modal-sub">${nestiqAppEsc(a.propertyName||'')} · Unit ${nestiqAppEsc(a.unitLabel||a.unit||'—')}</p>
    <div class="nestiq-myapp-status" style="margin:8px 0 16px"><span class="badge ${st.cls}">${nestiqAppEsc(st.text)}</span></div>
    ${nestiqApplicationJourneyHtml(a)}
    <div class="nestiq-dl" style="margin-top:16px">${[
      ['Monthly rent', nestiqFormatMoney(nestiqRentForApp(a))],
      ['Preferred move-in', nestiqPrettyAppDate(a.preferredMoveInDate||a.availableFrom)],
      ['Date applied', nestiqPrettyAppDate(a.applicationDate||a.createdAt)],
      ['Occupants', a.numberOfOccupants||'—'],
      ['Employment', a.employmentStatus||'—']
    ].map(([k,v])=>`<div><dt>${k}</dt><dd>${nestiqAppEsc(String(v))}</dd></div>`).join('')}</div>
    <h3 class="nestiq-myapp-section">Documents you submitted</h3>
    ${docs.length?`<ul class="nestiq-myapp-docs">${docs.map(d=>`<li>${d.url?`<a href="${nestiqAppEsc(d.url)}" target="_blank" rel="noopener">${nestiqAppEsc(d.label+': '+d.name)}</a>`:nestiqAppEsc(d.label+': '+d.name)}</li>`).join('')}</ul>`:'<p class="nestiq-papp-muted">No files were attached to this application.</p>'}
    ${info?`
      <div class="nestiq-myapp-reply">
        <h3 class="nestiq-myapp-section">Landlord request</h3>
        <blockquote class="nestiq-myapp-request">${nestiqAppEsc(a.infoRequestMessage||'Please provide additional information.')}</blockquote>
        <div class="form-group"><label>Your reply (optional)</label>
          <textarea class="form-input" id="nestiqInfoReplyNote-${nestiqAppEsc(a.id)}" rows="3" placeholder="A short note to the landlord">${nestiqAppEsc(a.infoResponseNote||'')}</textarea>
        </div>
        <div class="form-group"><label>Upload document</label>
          <input class="form-input" type="file" accept="image/*,.pdf,application/pdf" id="nestiqInfoReplyFile-${nestiqAppEsc(a.id)}">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn-outline btn-sm" onclick='nestiqApplicantAttachInfoFile(${JSON.stringify(String(a.id))})'>Add file</button>
          <button type="button" class="btn-gold btn-sm" onclick='nestiqApplicantSubmitInfoResponse(${JSON.stringify(String(a.id))})'>Submit</button>
        </div>
      </div>`:''}`;
  nestiqOpenModalAnimated();
}

async function nestiqApplicantAttachInfoFile(appId){
  const input=document.getElementById('nestiqInfoReplyFile-'+appId);
  const file=input?.files?.[0];
  if(!file){ nestiqShowNotif?.('Choose a file first.','warning'); return; }
  const uploaded=await nestiqApplicantUploadInfoDoc(appId, file);
  if(!uploaded) return;
  const rows=window.__nestiqMyApplicationsCache||[];
  const a=rows.find(x=>String(x.id)===String(appId));
  if(!a) return;
  a.infoResponseDocuments=[...(Array.isArray(a.infoResponseDocuments)?a.infoResponseDocuments:[]), uploaded];
  const ok=await nestiqApplicantPersistApplicationPatch(appId, {
    status:'info_required',
    infoResponseDocuments:a.infoResponseDocuments,
    listingLandlordId:a.listingLandlordId||''
  });
  if(ok){
    nestiqShowNotif?.('Document added. Submit when you are ready.','success');
    nestiqOpenMyApplicationDetail(appId);
  }
}

/* init */
window.nestiqMountApplicationsShell=nestiqMountApplicationsShell;

window.nestiqMergeApplicationListsById=nestiqMergeApplicationListsById;
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
window.nestiqInviteFromApplication=nestiqInviteFromApplication;
window.nestiqFetchMyApplications=nestiqFetchMyApplications;
window.nestiqWatchMyApplications=nestiqWatchMyApplications;
window.nestiqStopMyApplicationsWatch=nestiqStopMyApplicationsWatch;
window.nestiqApplicationStatusLabel=nestiqApplicationStatusLabel;
window.nestiqApplicationJourneyHtml=nestiqApplicationJourneyHtml;
window.nestiqMyApplicationCardHtml=nestiqMyApplicationCardHtml;
window.nestiqOpenMyApplicationDetail=nestiqOpenMyApplicationDetail;
window.nestiqApplicantSubmitInfoResponse=nestiqApplicantSubmitInfoResponse;
window.nestiqApplicantAttachInfoFile=nestiqApplicantAttachInfoFile;
window.nestiqAppOpenRequestInfoModal=nestiqAppOpenRequestInfoModal;
window.nestiqAppConfirmRequestInfo=nestiqAppConfirmRequestInfo;
window.nestiqPrettyAppDate=nestiqPrettyAppDate;
})();
