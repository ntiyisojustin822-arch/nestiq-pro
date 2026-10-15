/* Public vacant listings (Firestore). Landlords still use #properties scoped by landlordId. */
(function(){
  function esc(s){
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }
  function cssUrl(u){
    return String(u||'').trim().replace(/'/g,'%27');
  }

  function nestiqListingsQueryErrorMessage(err){
    const code=String(err&&(err.code||err.name)||'');
    const msg=String(err&&err.message||err||'');
    if(/failed-precondition|requires an index|create_composite/i.test(code+' '+msg)){
      const link=(msg.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)||[])[0];
      return 'Listings index is missing or still building. Deploy Firestore indexes (`firebase deploy --only firestore:indexes`), then wait a few minutes.'+(link?` Open: ${link}`:'');
    }
    if(/permission-denied|Missing or insufficient permissions/i.test(code+' '+msg)){
      return 'Listings could not be loaded (permission denied). Deploy the latest Firestore rules that allow public vacant listings.';
    }
    return msg||'Could not load listings.';
  }

  function nestiqListingTsMs(value){
    if(value==null||value==='') return 0;
    if(typeof value==='number'){
      if(!Number.isFinite(value)||value<=0) return 0;
      return value<1e12 ? Math.round(value*1000) : value;
    }
    if(typeof value==='string'){
      const trimmed=value.trim();
      if(!trimmed) return 0;
      if(/^\d+(\.\d+)?$/.test(trimmed)) return nestiqListingTsMs(Number(trimmed));
      const parsed=Date.parse(trimmed);
      return Number.isFinite(parsed)?parsed:0;
    }
    if(value instanceof Date){
      const t=value.getTime();
      return Number.isFinite(t)?t:0;
    }
    if(typeof value==='object'){
      try{
        if(typeof value.toMillis==='function') return Number(value.toMillis())||0;
      }catch(_e){}
      if(typeof value.seconds==='number') return value.seconds*1000 + Math.floor((Number(value.nanoseconds)||0)/1e6);
      if(typeof value._seconds==='number') return value._seconds*1000 + Math.floor((Number(value._nanoseconds)||0)/1e6);
    }
    return 0;
  }

  function nestiqListingUpdatedMs(row){
    return nestiqListingTsMs(row?.updatedAt);
  }

  function nestiqListingAddedMs(row){
    if(!row||typeof row!=='object') return 0;
    return nestiqListingTsMs(row.listedAt)
      || nestiqListingTsMs(row.publishedAt)
      || nestiqListingTsMs(row.createdAt)
      || nestiqListingTsMs(row.updatedAt)
      || 0;
  }

  function nestiqListingPhotoSrc(p){
    const raw=p?.base64||p?.url||p?.src||p?.photoUrl||'';
    if(typeof nestiqUsablePhotoSrc==='function') return nestiqUsablePhotoSrc(raw);
    const s=String(raw||'').trim();
    if(/^https?:\/\//i.test(s)||s.startsWith('data:image/')) return s;
    return '';
  }

  function nestiqMergeAmenityPhotoLists(a,b){
    const bySrc=new Map();
    [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].forEach((p,i)=>{
      const src=nestiqListingPhotoSrc(p);
      if(!src||bySrc.has(src)) return;
      bySrc.set(src,{
        id:p?.id!=null?p.id:i+1,
        base64:src,
        caption:String(p?.caption||''),
        order:Number.isFinite(Number(p?.order))?Number(p.order):bySrc.size
      });
    });
    return Array.from(bySrc.values()).sort((x,y)=>(x.order||0)-(y.order||0));
  }

  function nestiqPutListingRow(map, row){
    const id=String(row?.id??'').trim();
    if(!id) return;
    const prev=map.get(id);
    if(!prev){
      map.set(id,{...row,id});
      return;
    }
    const preferNew=nestiqListingUpdatedMs(row)>=nestiqListingUpdatedMs(prev);
    const merged=preferNew?{...prev,...row,id}:{...row,...prev,id};
    if(!nestiqListingTsMs(merged.createdAt) && nestiqListingTsMs(prev.createdAt)) merged.createdAt=prev.createdAt;
    if(!nestiqListingTsMs(merged.listedAt) && nestiqListingTsMs(prev.listedAt)) merged.listedAt=prev.listedAt;
    if(!nestiqListingTsMs(merged.publishedAt) && nestiqListingTsMs(prev.publishedAt)) merged.publishedAt=prev.publishedAt;
    // Never let a thinner public mirror wipe a richer gallery from properties/local.
    const prevPu=String(prev.photoUrl||prev.photoURL||'').trim();
    const rowPu=String(row.photoUrl||row.photoURL||'').trim();
    merged.photoUrl=rowPu||prevPu||merged.photoUrl||null;
    merged.amenityPhotos=nestiqMergeAmenityPhotoLists(prev.amenityPhotos,row.amenityPhotos);
    const preferUnits=typeof window.nestiqPreferListingUnitList==='function'
      ? window.nestiqPreferListingUnitList
      : (a,b)=>(Array.isArray(a)&&a.length?a:(Array.isArray(b)&&b.length?b:null));
    merged.availableUnits=preferUnits(row.availableUnits, prev.availableUnits);
    map.set(id,merged);
  }

  async function nestiqFetchPublicListings(){
    const db=window.nestiqDb;
    if(!db) return {rows:[], error:null};
    const byId=new Map();
    let queryError=null;

    // Prefer the denormalized public feed (no composite collectionGroup index required).
    try{
      // Unordered get so listings missing updatedAt are not dropped by orderBy.
      const mirrorSnap=await db.collection('publicListings').limit(200).get();
      mirrorSnap.docs.forEach(d=>nestiqPutListingRow(byId,{id:d.id,...d.data()}));
    }catch(e){
      console.warn('NestIQ listings: publicListings feed', e);
      queryError=e;
    }

    // Also try collectionGroup for any not yet mirrored (index may still be building).
    try{
      const pubSnap=await db.collectionGroup('properties')
        .where('status','==','vacant')
        .where('publicListing','==',true)
        .limit(200)
        .get();
      pubSnap.docs.forEach(d=>nestiqPutListingRow(byId,{id:d.id,...d.data()}));
    }catch(e){
      console.warn('NestIQ listings: public collectionGroup query', e);
      if(!byId.size) queryError=e;
      else queryError=null;
    }

    let uid='';
    try{
      if(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser){
        uid=String(firebase.auth().currentUser.uid||'');
      }
    }catch(_e){}
    const sess=(typeof getSession==='function')?getSession():null;
    if(uid&&sess&&sess.role==='landlord'){
      try{
        const mineSnap=await window.nestiqFs.properties(db, uid).limit(400).get();
        const backfills=[];
        mineSnap.docs.forEach(d=>{
          const data=d.data()||{};
          let row={id:d.id,...data,landlordId:data.landlordId||uid};
          if(row.archived===true||row.deactivated===true||row.publishStatus==='archived') return;
          if(row.publishStatus==='draft') return;
          if(row.publicListing!==true && row.publicListing!==false){
            row={...row, publicListing:true};
            backfills.push(d.ref.set({publicListing:true},{merge:true}).catch(err=>{
              console.warn('NestIQ listings: publicListing backfill failed', d.id, err);
            }));
          }
          if(row.publicListing!==false){
            nestiqPutListingRow(byId, row);
            backfills.push(
              Promise.resolve(window.nestiqSyncPublicListingMirror?.(row)).catch(()=>{})
            );
          }else{
            backfills.push(
              Promise.resolve(window.nestiqHealDraftListingIfReady?.(d.id)).catch(()=>{})
            );
          }
        });
        if(backfills.length) await Promise.all(backfills);
      }catch(e){
        console.warn('NestIQ listings: landlord merge query',e);
        if(!byId.size && !queryError) queryError=e;
      }
      // Also use in-memory portfolio (already loaded in dashboard) and republish.
      try{
        const local=(Array.isArray(window.propertiesData)?window.propertiesData:[]);
        await Promise.all(local.map(p=>Promise.resolve(window.nestiqHealDraftListingIfReady?.(p.id)).catch(()=>{})));
        local.forEach(p=>{
          if(p.archived===true||p.deactivated===true||p.publishStatus==='archived'||p.publishStatus==='draft') return;
          if(p.publicListing===false) return;
          nestiqPutListingRow(byId,{...p, landlordId:p.landlordId||uid, publicListing:true});
        });
        // Always republish so the guest public feed stays in sync.
        await window.nestiqSyncAllPublicListingMirrors?.(local);
        try{
          const mirrorSnap2=await db.collection('publicListings').limit(200).get();
          mirrorSnap2.docs.forEach(d=>nestiqPutListingRow(byId,{id:d.id,...d.data()}));
        }catch(_e){}
      }catch(_e){}
    }
    return {rows:Array.from(byId.values()), error:queryError};
  }

  function nestiqListingsAppBaseHref(){
    try{ return nestiqAppBaseUrl(); }catch(_e){ return location.origin+'/'; }
  }

  /**
   * Open standalone application.html with listing details in the query string.
   * Requires a signed-in tenant account — guests are sent to Create an account first.
   */
  function nestiqPendingApplyStore(payload){
    try{ sessionStorage.setItem('nestiq-pending-apply', JSON.stringify(payload||{})); }catch(_e){}
  }
  function nestiqPendingApplyTake(){
    try{
      const raw=sessionStorage.getItem('nestiq-pending-apply');
      sessionStorage.removeItem('nestiq-pending-apply');
      return raw?JSON.parse(raw):null;
    }catch(_e){ return null; }
  }
  function nestiqIsTenantApplicantSignedIn(){
    let s=null;
    try{ s=(typeof getSession==='function')?getSession():null; }catch(_e){}
    if(!s||s.role!=='tenant') return false;
    if(typeof isValidSession==='function'&&!isValidSession(s)){
      return Boolean(s.uid||s.userId||s.tenantDocId);
    }
    return true;
  }
  function nestiqRequireTenantAccountBeforeApply(pendingPayload){
    if(nestiqIsTenantApplicantSignedIn()) return true;
    nestiqPendingApplyStore(pendingPayload);
    try{ sessionStorage.setItem('nestiq-auth-prefer-tab','reg'); }catch(_e){}
    nestiqShowNotif?.('Create a tenant account first, then apply. After the landlord approves you, sign in with this same account to review and sign your lease.','info');
    if(typeof nestiqShowTenantEntry==='function'){
      nestiqShowTenantEntry();
      try{ nestiqTenantTab?.('reg'); }catch(_e){}
    }else{
      location.hash='';
      location.href=(nestiqListingsAppBaseHref()||'/')+'index.html';
    }
    return false;
  }

  function nestiqOpenApplyForListing(propertyId, fields){
    const id=String(propertyId||'').trim();
    if(!id) return;
    const f=fields&&typeof fields==='object'?fields:{};
    const listing=__nestiqListingCache.find(x=>String(x.id)===id)
      || (Array.isArray(window.propertiesData)?window.propertiesData.find(x=>String(x.id)===id):null);
    if(listing){
      const available=nestiqListingUnitsOf(listing);
      const wantId=String(f.unitId!=null?f.unitId:'').trim();
      const wantLabel=String(f.unitLabel||'').trim();
      const matchFn=typeof window.nestiqListingUnitMatches==='function'
        ? window.nestiqListingUnitMatches
        : (u,id)=>String(u?.id||'')===String(id||'');
      if(!available.length && !wantId && !wantLabel){
        nestiqShowNotif?.('There are no vacant units to apply for on this listing.','warning');
        return;
      }
      const matched=available.find(u=>matchFn(u,wantId,wantLabel))
        || (wantLabel?available.find(u=>String(u.label||u.unitNumber||'').toLowerCase()===wantLabel.toLowerCase()):null);
      if(wantId && !matched && available.length){
        nestiqShowNotif?.('That unit is no longer available. Choose a vacant unit.','warning');
        if(typeof nestiqOpenListingDetail==='function') nestiqOpenListingDetail(id);
        return;
      }
      const chosen=matched
        || (available.length===1?available[0]:null)
        || (wantId||wantLabel?{
            id:wantId,
            label:wantLabel||'Unit',
            rent:Number(f.rent)||0,
            bedrooms:Number(f.bedrooms)||0,
            deposit:Number(f.deposit)||0,
            availableFrom:String(f.leaseEnd||'Available')
          }:null);
      if(chosen){
        f.rent=Number(chosen.rent||f.rent)||0;
        f.bedrooms=Number(chosen.bedrooms||f.bedrooms)||0;
        f.leaseEnd=String(chosen.availableFrom||f.leaseEnd||'Available');
        f.unitId=String(chosen.id||wantId||'');
        f.unitLabel=String(chosen.label||wantLabel||'');
        f.deposit=Number(chosen.deposit||f.deposit)||0;
      }
    }
    const pending={
      propertyId:id,
      name:String(f.name!=null&&f.name!==''?f.name:'Listed rental'),
      rent:Number(f.rent)||0,
      bedrooms:Number(f.bedrooms)||0,
      addr:String(f.addr||''),
      leaseEnd:String(f.leaseEnd!=null&&f.leaseEnd!==''?f.leaseEnd:'Available'),
      landlordId:f.landlordId!=null?String(f.landlordId).trim():'',
      unitId:f.unitId!=null?String(f.unitId).trim():'',
      unitLabel:String(f.unitLabel||''),
      deposit:Number(f.deposit)||0
    };
    if(!nestiqRequireTenantAccountBeforeApply(pending)) return;
    const qs=new URLSearchParams();
    qs.set('property',pending.propertyId);
    qs.set('name',pending.name);
    qs.set('rent',String(pending.rent));
    qs.set('bedrooms',String(pending.bedrooms));
    qs.set('addr',pending.addr);
    qs.set('leaseEnd',pending.leaseEnd);
    if(pending.landlordId) qs.set('landlord',pending.landlordId);
    if(pending.unitId) qs.set('unit',pending.unitId);
    if(pending.unitLabel) qs.set('unitLabel',pending.unitLabel);
    if(pending.deposit>0) qs.set('deposit',String(pending.deposit));
    const base=nestiqListingsAppBaseHref();
    const next=base+'application.html?'+qs.toString();
    location.href=next;
  }

  function nestiqResumePendingApplyIfAny(){
    const pending=nestiqPendingApplyTake();
    if(!pending||!pending.propertyId) return false;
    if(!nestiqIsTenantApplicantSignedIn()){
      nestiqPendingApplyStore(pending);
      return false;
    }
    nestiqOpenApplyForListing(pending.propertyId, pending);
    return true;
  }
  window.nestiqResumePendingApplyIfAny=nestiqResumePendingApplyIfAny;
  window.nestiqPendingApplyStore=nestiqPendingApplyStore;
  window.nestiqIsTenantApplicantSignedIn=nestiqIsTenantApplicantSignedIn;

  function nestiqListingUnitsOf(p){
    if(typeof window.nestiqListingAvailableUnits==='function') return window.nestiqListingAvailableUnits(p)||[];
    if(Array.isArray(p?.availableUnits)){
      return (p.availableUnits||[]).filter(u=>{
        if(!u) return false;
        if(typeof window.nestiqUnitIsOpenForApplication==='function'){
          return window.nestiqUnitIsOpenForApplication({ ...u, status:u.status||'vacant', tenantId:u.tenantId||null });
        }
        const st=String(u.status||'vacant').toLowerCase();
        if(st==='occupied'||st==='reserved'||st==='maintenance'||st==='due') return false;
        return !!(u.id||u.label);
      });
    }
    const propSt=String(p?.status||'').toLowerCase();
    if(propSt==='occupied') return [];
    return [{
      id:'',
      label:String(p?.unit||'Main'),
      bedrooms:Number(p?.bedrooms||0)||0,
      bathrooms:Number(p?.bathrooms||0)||0,
      rent:Number(p?.rent||0)||0,
      deposit:Number(p?.deposit||p?.rent||0)||0,
      availableFrom:String(p?.leaseEnd||'Available'),
      synthetic:true
    }];
  }

  function nestiqOpenApplyForListingFromCard(btn){
    const card=btn&&btn.closest?btn.closest('.nestiq-listing-card'):null;
    if(!card||!card.dataset) return;
    const id=decodeURIComponent(String(card.dataset.applyId||'')).trim();
    if(!id) return;
    const listing=__nestiqListingCache.find(x=>String(x.id)===id);
    const units=nestiqListingUnitsOf(listing||{});
    if(!units.length){
      nestiqShowNotif?.('There are no vacant units to apply for on this listing.','warning');
      return;
    }
    if(units.length>1){
      nestiqOpenListingDetail(id);
      return;
    }
    const u=units[0]||{};
    nestiqOpenApplyForListing(id,{
      name:decodeURIComponent(String(card.dataset.applyName||'')),
      rent:Number(u.rent||card.dataset.applyRent||0),
      bedrooms:Number(u.bedrooms||card.dataset.applyBed||0),
      addr:decodeURIComponent(String(card.dataset.applyAddr||'')),
      leaseEnd:String(u.availableFrom||decodeURIComponent(String(card.dataset.applyLease||''))),
      landlordId:decodeURIComponent(String(card.dataset.applyLandlord||'')).trim(),
      unitId:String(u.id||''),
      unitLabel:String(u.label||''),
      deposit:Number(u.deposit||0)
    });
  }

  function nestiqApplyListingsPageRoleUi(){
    try{ window.syncNavUserUi?.(); }catch(_e){}
    const page=document.getElementById('page-listings');
    const nav=document.getElementById('navbar');
    const navOn=!!(nav && getComputedStyle(nav).display!=='none' && getComputedStyle(nav).visibility!=='hidden');
    if(page) page.classList.toggle('has-app-nav', navOn);
    const s=(typeof getSession==='function')?getSession():null;
    const isLandlord=!!(s&&s.role==='landlord');
    const isTenant=nestiqListingsFavouritesEnabled()||!!(s&&s.role==='tenant'&&(typeof isValidSession!=='function'||isValidSession(s)));
    const guestBar=document.getElementById('nestiqListingsGuestBar');
    nestiqFavPaintChrome();
    const sub=document.querySelector('#page-listings .listings-sub');
    if(sub){
      sub.textContent=isLandlord
        ? 'These are the vacancies applicants see. They apply with a NestIQ account — you review them under Applications.'
        : isTenant
        ? 'Save listings you like, then apply with this account. Track every decision in My Applications.'
        : 'Find a vacant unit, apply with a free NestIQ account, and track the landlord’s decision in My Applications.';
    }
    if(!guestBar) return;
    if(isLandlord||isTenant){
      guestBar.style.display='none';
      if(isTenant && typeof nestiqResolveSignedInApplicantProfile==='function'){
        nestiqResolveSignedInApplicantProfile().then(p=>{
          if(!p?.profilePhoto) return;
          try{
            const sess=typeof getSession==='function'?getSession():null;
            if(sess) sess.profilePhoto=p.profilePhoto;
            if(window.nestiqTenantSession) window.nestiqTenantSession.profilePhoto=p.profilePhoto;
          }catch(_e){}
          window.syncNavUserUi?.();
        }).catch(()=>{});
      }
      return;
    }
    guestBar.style.display='flex';
    guestBar.innerHTML=`
      <button type="button" class="btn-outline btn-sm" onclick="showLandingPage();location.hash='';">Home</button>
      <button type="button" class="btn-gold btn-sm" onclick="nestiqShowTenantEntry();nestiqTenantTab?.('reg')">Create a free account</button>`;
  }

  let __nestiqListingCache=[];
  let __listingsFilter={ q:'', type:'all', beds:0, sort:'newest' };
  let __listingsFavOnly=false;
  let __listingsFavMergeJob=null;
  let __listingsMap=null;
  let __listingsMarkers={};
  let __listingsFiltersHost=null;
  let __listingsHoverId=null;
  let __listingsGeocodeQueue=Promise.resolve();
  const __listingsGeocodeCache={};
  let __listingsResizeObs=null;

  const NESTIQ_FAVOURITES_KEY='nestiq_favourites';

  function nestiqFavNormalizeIds(raw){
    const seen=new Set();
    const out=[];
    (Array.isArray(raw)?raw:[]).forEach(id=>{
      const s=String(id==null?'':id).trim();
      if(!s||seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }

  function nestiqFavReadLocal(){
    try{
      return nestiqFavNormalizeIds(JSON.parse(localStorage.getItem(NESTIQ_FAVOURITES_KEY)||'[]'));
    }catch(_e){
      return [];
    }
  }

  function nestiqFavWriteLocal(ids){
    const next=nestiqFavNormalizeIds(ids);
    try{ localStorage.setItem(NESTIQ_FAVOURITES_KEY, JSON.stringify(next)); }catch(_e){}
    return next;
  }

  function nestiqFavIsSaved(propertyId){
    return nestiqFavReadLocal().includes(String(propertyId||'').trim());
  }

  function nestiqFavSignedInTenant(){
    try{
      const s=(typeof getSession==='function')?getSession():null;
      if(s&&s.role&&s.role!=='tenant') return null;
      if(typeof nestiqIsTenantApplicantSignedIn==='function'?nestiqIsTenantApplicantSignedIn():false){
        return s&&s.role==='tenant'?s:{role:'tenant'};
      }
      if(!s||s.role!=='tenant') return null;
      if(typeof isValidSession==='function'&&!isValidSession(s)){
        if(!s.uid&&!s.userId&&!s.tenantDocId) return null;
      }
      return s;
    }catch(_e){
      return null;
    }
  }

  function nestiqListingsFavouritesEnabled(){
    const s=(typeof getSession==='function')?getSession():null;
    if(s&&s.role&&s.role!=='tenant') return false;
    return !!nestiqFavSignedInTenant();
  }

  function nestiqFavTenantDocIds(session){
    const s=session||nestiqFavSignedInTenant()||{};
    const ts=window.nestiqTenantSession||{};
    const cu=window.currentUser||{};
    let uid='';
    try{
      uid=String(s.uid||cu.uid||(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser&&firebase.auth().currentUser.uid)||'').trim();
    }catch(_e){
      uid=String(s.uid||cu.uid||'').trim();
    }
    return {
      lid:String(s.landlordId||ts.landlordId||cu.landlordId||'').trim(),
      tid:String(s.tenantDocId||s.userId||ts.tenantId||cu.tenantDocId||'').trim(),
      uid
    };
  }

  function nestiqFavIdsFromDoc(data){
    if(!data||typeof data!=='object') return [];
    return nestiqFavNormalizeIds(data.favourites);
  }

  async function nestiqFavPersistRemote(ids){
    if(!nestiqFavSignedInTenant()) return;
    const db=window.nestiqDb;
    if(!db) return;
    const next=nestiqFavNormalizeIds(ids);
    const {lid,tid,uid}=nestiqFavTenantDocIds();
    const payload={favourites:next};
    const jobs=[];
    if(lid&&tid){
      const col=window.nestiqFs?.tenants?.(db, lid);
      if(col) jobs.push(col.doc(tid).set(payload,{merge:true}));
    }
    if(uid){
      const acct=window.nestiqFs?.tenantAccount?.(db, uid);
      if(acct) jobs.push(acct.set(payload,{merge:true}));
    }
    if(!jobs.length) return;
    await Promise.all(jobs.map(p=>Promise.resolve(p).catch(err=>{
      console.warn('NestIQ favourites sync', err);
    })));
  }

  window.nestiqReadFavouritesLocal=nestiqFavReadLocal;

  async function nestiqFavMergeOnTenantLogin(){
    if(!nestiqFavSignedInTenant()) return nestiqFavReadLocal();
    if(__listingsFavMergeJob) return __listingsFavMergeJob;
    __listingsFavMergeJob=(async()=>{
      const local=nestiqFavReadLocal();
      const remote=[];
      const db=window.nestiqDb;
      const {lid,tid,uid}=nestiqFavTenantDocIds();
      if(db){
        if(lid&&tid){
          try{
            const col=window.nestiqFs?.tenants?.(db, lid);
            const snap=col?await col.doc(tid).get():null;
            if(snap&&snap.exists) remote.push(...nestiqFavIdsFromDoc(snap.data()));
          }catch(err){
            console.warn('NestIQ favourites tenant read', err);
          }
        }
        if(uid){
          try{
            const acct=window.nestiqFs?.tenantAccount?.(db, uid);
            const snap=acct?await acct.get():null;
            if(snap&&snap.exists) remote.push(...nestiqFavIdsFromDoc(snap.data()));
          }catch(err){
            console.warn('NestIQ favourites account read', err);
          }
        }
      }
      const merged=nestiqFavWriteLocal([...local, ...remote]);
      await nestiqFavPersistRemote(merged);
      nestiqFavPaintChrome();
      return merged;
    })();
    try{
      return await __listingsFavMergeJob;
    }finally{
      __listingsFavMergeJob=null;
    }
  }

  function nestiqListingFavBtnHtml(propertyId, variant){
    if(!nestiqListingsFavouritesEnabled()) return '';
    const id=String(propertyId||'').trim();
    const saved=nestiqFavIsSaved(id);
    const idEnc=encodeURIComponent(id);
    const kind=variant||'card';
    const label=saved?'Remove from favourites':'Save to favourites';
    return `<button type="button" class="listing-fav-btn listing-fav-btn--${esc(kind)}${saved?' is-saved':''}" data-fav-id="${esc(id)}" aria-pressed="${saved?'true':'false'}" aria-label="${esc(label)}" title="${esc(label)}" onclick="event.preventDefault();event.stopPropagation();nestiqToggleListingFavourite(decodeURIComponent('${idEnc}'),event)"><span class="listing-fav-heart" aria-hidden="true">${saved?'♥':'♡'}</span>${kind==='action'?`<span class="listing-fav-btn-label">${saved?'Saved':'Save'}</span>`:''}</button>`;
  }

  function nestiqFavPaintChrome(){
    const ids=nestiqFavReadLocal();
    const saved=new Set(ids);
    document.querySelectorAll('[data-fav-id]').forEach(btn=>{
      const on=saved.has(String(btn.getAttribute('data-fav-id')||''));
      btn.classList.toggle('is-saved', on);
      btn.setAttribute('aria-pressed', on?'true':'false');
      const label=on?'Remove from favourites':'Save to favourites';
      btn.setAttribute('aria-label', label);
      btn.title=label;
      const heart=btn.querySelector('.listing-fav-heart');
      if(heart) heart.textContent=on?'♥':'♡';
      const text=btn.querySelector('.listing-fav-btn-label');
      if(text) text.textContent=on?'Saved':'Save';
    });
    const countEl=document.getElementById('nestiqListingsFavCount');
    if(countEl){
      countEl.textContent=String(ids.length);
      countEl.hidden=!ids.length;
    }
    const toggle=document.getElementById('nestiqListingsFavToggle');
    if(toggle){
      const on=nestiqListingsFavouritesEnabled();
      if(!on) __listingsFavOnly=false;
      toggle.hidden=!on;
      toggle.style.display=on?'inline-flex':'none';
      toggle.classList.toggle('is-active', !!__listingsFavOnly);
      toggle.setAttribute('aria-pressed', __listingsFavOnly?'true':'false');
    }
  }

  function nestiqToggleListingFavourite(propertyId, ev){
    if(ev){
      ev.preventDefault();
      ev.stopPropagation();
    }
    if(!nestiqListingsFavouritesEnabled()){
      try{ sessionStorage.setItem('nestiq-auth-prefer-tab','reg'); }catch(_e){}
      nestiqShowNotif?.('Create a tenant account to save listings while you look.','info');
      if(typeof nestiqShowTenantEntry==='function'){
        nestiqShowTenantEntry();
        try{ nestiqTenantTab?.('reg'); }catch(_e){}
      }
      return false;
    }
    const id=String(propertyId||'').trim();
    if(!id) return false;
    const cur=nestiqFavReadLocal();
    const next=cur.includes(id)?cur.filter(x=>x!==id):nestiqFavNormalizeIds([...cur, id]);
    nestiqFavWriteLocal(next);
    nestiqFavPaintChrome();
    document.querySelectorAll('[data-fav-id="'+(typeof CSS!=='undefined'&&CSS.escape?CSS.escape(id):id)+'"]').forEach(btn=>{
      btn.classList.remove('is-pop');
      void btn.offsetWidth;
      btn.classList.add('is-pop');
    });
    if(__listingsFavOnly) nestiqPaintFilteredListings();
    nestiqFavPersistRemote(next);
    return false;
  }

  function nestiqSetListingsFavouritesView(on){
    __listingsFavOnly=!!on;
    nestiqFavPaintChrome();
    nestiqPaintFilteredListings();
  }

  function nestiqListingsReadCoords(p){
    if(!p||typeof p!=='object') return null;
    let lat=p.lat;
    let lng=p.lng;
    if(lat && typeof lat==='object' && Number.isFinite(Number(lat.latitude))){
      lng=lat.longitude;
      lat=lat.latitude;
    }
    const loc=p.location||p.coords||p.geo;
    if((!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng))) && loc && typeof loc==='object'){
      if(Number.isFinite(Number(loc.latitude))){
        lat=loc.latitude;
        lng=loc.longitude;
      }else if(loc.lat!=null){
        lat=loc.lat;
        lng=loc.lng||loc.lon;
      }
    }
    lat=Number(lat);
    lng=Number(lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
    if(Math.abs(lat)>90||Math.abs(lng)>180) return null;
    if(lat===0 && lng===0) return null;
    return {lat,lng};
  }

  function nestiqListingsHasCoords(p){
    return !!nestiqListingsReadCoords(p);
  }

  function nestiqListingsSetShellVisible(hasResults){
    const toolbar=document.getElementById('nestiqListingsToolbar');
    const countEl=document.getElementById('nestiqListingsCount');
    const layout=document.getElementById('nestiqListingsLayout');
    if(toolbar) toolbar.style.display=hasResults?'block':'none';
    if(countEl) countEl.style.display=hasResults?'block':'none';
    if(layout) layout.classList.toggle('has-map', !!hasResults);
  }

  function nestiqBindListingsFiltersOnce(){
    const page=document.getElementById('page-listings');
    if(!page) return;
    if(__listingsFiltersHost===page) return;
    __listingsFiltersHost=page;

    const search=document.getElementById('nestiqListingsSearch');
    const sort=document.getElementById('nestiqListingsSort');
    const bedsChip=document.getElementById('nestiqListingsBedsChip');
    const favToggle=document.getElementById('nestiqListingsFavToggle');

    search?.addEventListener('input',()=>{
      __listingsFilter.q=String(search.value||'').trim().toLowerCase();
      nestiqPaintFilteredListings();
    });
    sort?.addEventListener('change',()=>{
      __listingsFilter.sort=String(sort.value||'newest');
      nestiqPaintFilteredListings();
    });

    page.querySelectorAll('#nestiqListingsTypeChips [data-listings-type]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        __listingsFilter.type=String(btn.getAttribute('data-listings-type')||'all');
        page.querySelectorAll('#nestiqListingsTypeChips [data-listings-type]').forEach(b=>{
          b.classList.toggle('active', b===btn);
        });
        nestiqPaintFilteredListings();
      });
    });

    bedsChip?.addEventListener('click',()=>{
      const cycle=[0,1,2,3,4];
      const idx=cycle.indexOf(Number(__listingsFilter.beds)||0);
      const next=cycle[(idx+1)%cycle.length];
      __listingsFilter.beds=next;
      bedsChip.dataset.listingsBeds=String(next);
      bedsChip.textContent=next===0?'Beds: Any':(next===4?'Beds: 4+':`Beds: ${next}`);
      bedsChip.classList.toggle('active', next!==0);
      nestiqPaintFilteredListings();
    });

    favToggle?.addEventListener('click',()=>{
      if(!nestiqListingsFavouritesEnabled()){
        try{ sessionStorage.setItem('nestiq-auth-prefer-tab','reg'); }catch(_e){}
        nestiqShowNotif?.('Create a tenant account to save listings while you look.','info');
        if(typeof nestiqShowTenantEntry==='function'){
          nestiqShowTenantEntry();
          try{ nestiqTenantTab?.('reg'); }catch(_e){}
        }
        return;
      }
      nestiqSetListingsFavouritesView(!__listingsFavOnly);
    });

    if(search) search.value=__listingsFilter.q||'';
    if(sort) sort.value=__listingsFilter.sort||'newest';
    page.querySelectorAll('#nestiqListingsTypeChips [data-listings-type]').forEach(b=>{
      b.classList.toggle('active', String(b.getAttribute('data-listings-type')||'all')===String(__listingsFilter.type||'all'));
    });
    if(bedsChip){
      const beds=Number(__listingsFilter.beds)||0;
      bedsChip.dataset.listingsBeds=String(beds);
      bedsChip.textContent=beds===0?'Beds: Any':(beds===4?'Beds: 4+':`Beds: ${beds}`);
      bedsChip.classList.toggle('active', beds!==0);
    }
  }

  function nestiqFilterSortListings(rows){
    let out=Array.isArray(rows)?rows.slice():[];
    const q=__listingsFilter.q;
    const type=__listingsFilter.type;
    const beds=Number(__listingsFilter.beds)||0;

    if(q){
      out=out.filter(p=>{
        const hay=[p.name,p.addr,p.city].map(x=>String(x||'').toLowerCase()).join(' ');
        return hay.includes(q);
      });
    }
    if(type && type!=='all'){
      out=out.filter(p=>String(p.type||'').trim().toLowerCase()===type);
    }
    if(beds>0){
      out=out.filter(p=>{
        const b=Number(p.bedrooms)||0;
        return beds===4 ? b>=4 : b===beds;
      });
    }
    if(__listingsFavOnly){
      const fav=new Set(nestiqFavReadLocal());
      out=out.filter(p=>fav.has(String(p.id||'')));
    }

    const sort=__listingsFilter.sort||'newest';
    out.sort((a,b)=>{
      if(sort==='price-asc') return Number(a.rent||0)-Number(b.rent||0);
      if(sort==='price-desc') return Number(b.rent||0)-Number(a.rent||0);
      const added=nestiqListingAddedMs(b)-nestiqListingAddedMs(a);
      if(added) return added;
      const updated=nestiqListingUpdatedMs(b)-nestiqListingUpdatedMs(a);
      if(updated) return updated;
      return String(b.id||'').localeCompare(String(a.id||''));
    });
    return out;
  }

  function nestiqBuildListingCardHtml(p, uid){
    const loc=typeof window.nestiqPublicLocationForListing==='function'?window.nestiqPublicLocationForListing(p):null;
    const range=typeof window.nestiqPropertyRentRange==='function'?window.nestiqPropertyRentRange(p):null;
    const rent=Number(p.rentMin||range?.min||p.rent||0);
    const rentMax=Number(p.rentMax||range?.max||rent);
    const compactRent=rentMax>rent
      ? `R${rent.toLocaleString('en-ZA')} – R${rentMax.toLocaleString('en-ZA')}`
      : `R${rent.toLocaleString('en-ZA')}`;
    const beds=Number(p.bedrooms||0);
    const name=esc(p.name||'Rental');
    const addr=esc(loc?.displayAddr||p.addr||'');
    const city=esc(loc?.city||p.city||'');
    const icon=esc(p.icon||'🏢');
    const rawName=String(p.name||'Rental');
    const rawAddr=[p.addr,p.city].filter(Boolean).join(', ');
    const rawLease=String(p.leaseEnd||'');
    const idEnc=encodeURIComponent(String(p.id==null?'':p.id));
    const idAttr=esc(String(p.id==null?'':p.id));
    const nameEnc=encodeURIComponent(rawName);
    const addrEnc=encodeURIComponent(rawAddr);
    const leaseEnc=encodeURIComponent(rawLease);
    const lidEnc=encodeURIComponent(String(p.landlordId||''));
    const applyUnits=nestiqListingUnitsOf(p);
    const unitCount=applyUnits.filter(u=>!u.synthetic).length;
    const canApply=applyUnits.length>0;
    const applyLbl=!canApply?'Fully occupied':(unitCount>1?'View units':'Apply online');
    const mine=uid&&String(p.landlordId||'')===uid;
    const draft=mine&&p.publicListing===false;
    const amenityPhotos=typeof nestiqNormalizeAmenityPhotos==='function'?nestiqNormalizeAmenityPhotos(p.amenityPhotos):[];
    const mainPu=typeof nestiqPropertyCardPhotoUrl==='function'
      ? nestiqPropertyCardPhotoUrl(p)
      : (typeof nestiqUsablePhotoSrc==='function'?nestiqUsablePhotoSrc(p.photoUrl||p.photoURL):'');
    const gallery=typeof nestiqGetSlideshowPhotos==='function'
      ? nestiqGetSlideshowPhotos(p)
      : (mainPu?[{base64:mainPu,caption:'Main photo'}]:[]).concat(amenityPhotos.map(a=>({base64:a.base64,caption:a.caption||''})));
    const countHtml=gallery.length>1?`<div class="prop-photo-count">${gallery.length} photos</div>`:'';
    let imgBlock='';
    const cover=gallery[0]?.base64||mainPu||'';
    const bgAttr=typeof nestiqPropImgAreaBgAttr==='function'?nestiqPropImgAreaBgAttr(cover):'';
    const coverImg=typeof nestiqPropCoverImgHtml==='function'?nestiqPropCoverImgHtml(cover):(cover?`<img class="prop-photo loaded" src="${esc(cover)}" alt="" onerror="nestiqPropertyPhotoImgError(this)">`:'');
    if(gallery.length>1){
      const ssKey=`listing-ss-${idEnc}`;
      window.__nestiqPendingSlideshows=window.__nestiqPendingSlideshows||{};
      window.__nestiqPendingSlideshows[ssKey]=gallery;
      imgBlock=`<div class="prop-img-area"${bgAttr}>${countHtml}${coverImg}<div data-nestiq-slideshow data-ss-key="${ssKey}"></div></div>`;
    }else if(cover){
      imgBlock=`<div class="prop-img-area"${bgAttr}>${coverImg}</div>`;
    }else{
      imgBlock=`<div class="prop-img-area"><span style="font-size:2.2rem">${icon}</span></div>`;
    }
    const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[]):'';
    const favBtn=nestiqListingFavBtnHtml(p.id,'card');
    if(/class="prop-img-area"/.test(imgBlock)){
      imgBlock=imgBlock.replace(/<\/div>\s*$/, favBtn+'</div>');
    }else{
      imgBlock=`<div class="prop-img-area">${imgBlock}${favBtn}</div>`;
    }
    return `<article class="prop-card nestiq-listing-card listings-card"
      data-listing-id="${idAttr}"
      onclick="nestiqOpenListingDetail(decodeURIComponent('${idEnc}'))"
      data-apply-id="${idEnc}" data-apply-name="${nameEnc}" data-apply-rent="${rent}" data-apply-bed="${beds}"
      data-apply-addr="${addrEnc}" data-apply-lease="${leaseEnc}" data-apply-landlord="${lidEnc}">
      ${imgBlock}
      <div class="prop-body listings-card-body">
        ${draft?'<div><span class="badge badge-amber" style="font-size:0.68rem">Not on public browse</span></div>':''}
        <div class="listings-card-top">
          <div class="prop-card-name" title="${name}">${name}</div>
          <div class="listings-card-price">${esc(compactRent)} <span class="listings-card-period">/ month</span></div>
        </div>
        <div class="prop-card-addr">📍 ${addr}${city&&!addr.includes(city)?`, ${city}`:''}</div>
        ${typeof window.nestiqListingCardRatingHtml==='function'?window.nestiqListingCardRatingHtml(p._reviews||[]):''}
        <div class="prop-meta">
          <div><div class="prop-meta-val">${beds||'—'}</div><div class="prop-meta-lbl">Bedrooms</div></div>
          ${unitCount>1?`<div><div class="prop-meta-val">${unitCount}</div><div class="prop-meta-lbl">Vacant units</div></div>`:''}
        </div>
        ${amenitiesHtml}
        <div class="listings-card-cta">${canApply
          ? `<button type="button" class="btn-gold btn-sm" onclick="event.stopPropagation();nestiqOpenApplyForListingFromCard(this)">${esc(applyLbl)}</button>`
          : `<button type="button" class="btn-outline btn-sm" disabled>${esc(applyLbl)}</button>`
        }</div>
      </div>
    </article>`;
  }

  function nestiqListingsPopupHtml(p){
    const range=typeof window.nestiqPropertyRentRange==='function'?window.nestiqPropertyRentRange(p):null;
    const loc=typeof window.nestiqPublicLocationForListing==='function'?window.nestiqPublicLocationForListing(p):null;
    const rentLabel=range?.label||`R${Number(p.rent||0).toLocaleString('en-ZA')}/mo`;
    const photo=(typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'')
      || (typeof nestiqUsablePhotoSrc==='function'?nestiqUsablePhotoSrc(p.photoUrl||p.photoURL):String(p.photoUrl||p.photoURL||'').trim());
    const idEnc=encodeURIComponent(String(p.id==null?'':p.id));
    const photoBlock=photo
      ? `<div class="listings-map-popup-photo">
           <img src="${esc(photo)}" alt="">
         </div>`
      : '';
    return `<div class="listings-map-popup">
      ${photoBlock}
      <div class="listings-map-popup-name">${esc(p.name||'Rental')}</div>
      <div class="listings-map-popup-addr">📍 ${esc(loc?.displayAddr||p.addr||'')}${loc?.city&&!(loc?.displayAddr||'').includes(loc.city)?`, ${esc(loc.city)}`:(!loc&&p.city?`, ${esc(p.city)}`:'')}</div>
      <div class="listings-map-popup-price">${esc(rentLabel)}</div>
      <button type="button" class="btn-gold btn-sm" style="width:100%;justify-content:center"
        onclick="nestiqOpenListingDetail(decodeURIComponent('${idEnc}'))">View listing</button>
    </div>`;
  }

  function nestiqCreateListingsPinIcon(highlighted){
    const on=highlighted?' is-on':'';
    const size=highlighted?20:16;
    return L.divIcon({
      className:'listings-map-pin',
      html:`<div class="listings-pin-dot${on}"></div>`,
      iconSize:[size,size],
      iconAnchor:[size/2,size/2]
    });
  }

  function nestiqClearListingsMarkers(){
    Object.values(__listingsMarkers).forEach(m=>{
      try{ __listingsMap?.removeLayer(m); }catch(_e){}
    });
    __listingsMarkers={};
  }

  function nestiqDestroyListingsMap(){
    nestiqClearListingsMarkers();
    if(__listingsResizeObs){
      try{ __listingsResizeObs.disconnect(); }catch(_e){}
      __listingsResizeObs=null;
    }
    if(__listingsMap){
      try{ __listingsMap.remove(); }catch(_e){}
      __listingsMap=null;
    }
    const el=document.getElementById('nestiqListingsMap');
    if(el){
      try{ delete el._leaflet_id; }catch(_e){}
      el.replaceChildren();
    }
  }

  function nestiqInvalidateListingsMap(){
    const map=__listingsMap;
    if(!map) return;
    const run=()=>{
      try{ map.invalidateSize({ animate:false }); }catch(_e){}
    };
    run();
    requestAnimationFrame(run);
    setTimeout(run,80);
    setTimeout(run,280);
    setTimeout(run,600);
  }

  function nestiqEnsureListingsMap(){
    const el=document.getElementById('nestiqListingsMap');
    if(!el || typeof L==='undefined') return null;
    const layout=document.getElementById('nestiqListingsLayout');
    if(layout && !layout.classList.contains('has-map')) return null;

    if(__listingsMap){
      const host=typeof __listingsMap.getContainer==='function'?__listingsMap.getContainer():null;
      if(host===el && el._leaflet_id){
        nestiqInvalidateListingsMap();
        return __listingsMap;
      }
      nestiqDestroyListingsMap();
    }

    __listingsMap=L.map(el,{
      zoomControl:true,
      scrollWheelZoom:true
    }).setView([-28.4793,24.6727],6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors',
      maxZoom:19
    }).addTo(__listingsMap);

    if(typeof ResizeObserver!=='undefined'){
      try{
        __listingsResizeObs=new ResizeObserver(()=>{
          try{ __listingsMap?.invalidateSize({ animate:false }); }catch(_e){}
        });
        __listingsResizeObs.observe(el);
      }catch(_e){}
    }
    if(!window.__listingsMapResizeBound){
      window.__listingsMapResizeBound=true;
      window.addEventListener('resize',()=>nestiqInvalidateListingsMap());
    }
    nestiqInvalidateListingsMap();
    return __listingsMap;
  }

  function nestiqListingsGeocodeAddr(addr){
    const key=String(addr||'').trim().toLowerCase();
    if(!key || key.length<6) return Promise.resolve(null);
    if(Object.prototype.hasOwnProperty.call(__listingsGeocodeCache,key)){
      return Promise.resolve(__listingsGeocodeCache[key]);
    }
    const job=__listingsGeocodeQueue.then(async()=>{
      if(Object.prototype.hasOwnProperty.call(__listingsGeocodeCache,key)){
        return __listingsGeocodeCache[key];
      }
      await new Promise(r=>setTimeout(r,1100));
      try{
        const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(key);
        const res=await fetch(url,{ headers:{ Accept:'application/json' } });
        const data=await res.json();
        const hit=Array.isArray(data)?data[0]:null;
        const lat=Number(hit?.lat);
        const lng=Number(hit?.lon);
        const coords=(Number.isFinite(lat)&&Number.isFinite(lng))?{lat,lng}:null;
        __listingsGeocodeCache[key]=coords;
        return coords;
      }catch(_e){
        __listingsGeocodeCache[key]=null;
        return null;
      }
    });
    __listingsGeocodeQueue=job.catch(()=>null);
    return job;
  }

  async function nestiqListingsFillMissingCoords(rows){
    const list=Array.isArray(rows)?rows:[];
    let added=false;
    for(const p of list){
      if(nestiqListingsHasCoords(p)) continue;
      const q=[p.addr,p.city].filter(Boolean).join(', ');
      const c=await nestiqListingsGeocodeAddr(q);
      if(!c) continue;
      p.lat=c.lat;
      p.lng=c.lng;
      added=true;
    }
    if(added) nestiqRefreshListingsMap(nestiqFilterSortListings(__nestiqListingCache));
  }

  function nestiqRefreshListingsMap(rows){
    const map=nestiqEnsureListingsMap();
    if(!map) return;
    nestiqClearListingsMarkers();
    const bounds=[];
    (rows||[]).forEach(p=>{
      const c=nestiqListingsReadCoords(p);
      if(!c) return;
      const id=String(p.id);
      const marker=L.marker([c.lat,c.lng],{ icon:nestiqCreateListingsPinIcon(false) });
      marker.bindPopup(nestiqListingsPopupHtml(p),{ maxWidth:260 });
      marker.on('click',()=>{
        nestiqHighlightListingCard(id,true);
      });
      marker.addTo(map);
      __listingsMarkers[id]=marker;
      bounds.push([c.lat,c.lng]);
    });
    try{
      if(bounds.length===1) map.setView(bounds[0],14);
      else if(bounds.length>1) map.fitBounds(bounds,{ padding:[36,36], maxZoom:14 });
      else map.setView([-28.4793,24.6727],6);
    }catch(_e){}
    nestiqInvalidateListingsMap();
  }

  function nestiqHighlightListingCard(id, scrollIntoView){
    document.querySelectorAll('.nestiq-listing-card.listings-card-active').forEach(c=>c.classList.remove('listings-card-active'));
    const card=document.querySelector(`.nestiq-listing-card[data-listing-id="${CSS.escape?CSS.escape(String(id)):String(id).replace(/"/g,'')}"]`);
    if(card){
      card.classList.add('listings-card-active');
      if(scrollIntoView) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  }

  function nestiqBindListingCardMapHover(grid){
    if(!grid) return;
    grid.querySelectorAll('.nestiq-listing-card').forEach(card=>{
      const id=String(card.getAttribute('data-listing-id')||'');
      card.addEventListener('mouseenter',()=>{
        __listingsHoverId=id;
        card.classList.add('listings-card-active');
        const marker=__listingsMarkers[id];
        if(marker && __listingsMap){
          marker.setIcon(nestiqCreateListingsPinIcon(true));
          marker.setZIndexOffset(1000);
          marker.openPopup();
          try{
            const ll=marker.getLatLng();
            if(!__listingsMap.getBounds().pad(-0.15).contains(ll)){
              __listingsMap.panTo(ll,{ animate:true, duration:0.35 });
            }
          }catch(_e){}
        }
      });
      card.addEventListener('mouseleave',()=>{
        if(__listingsHoverId===id) __listingsHoverId=null;
        card.classList.remove('listings-card-active');
        const marker=__listingsMarkers[id];
        if(marker){
          marker.setIcon(nestiqCreateListingsPinIcon(false));
          marker.setZIndexOffset(0);
          try{ marker.closePopup(); }catch(_e){}
        }
      });
    });
  }

  function nestiqPaintFilteredListings(){
    const grid=document.getElementById('nestiqListingsGrid');
    const countEl=document.getElementById('nestiqListingsCount');
    if(!grid) return;

    let uid='';
    try{
      if(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser){
        uid=String(firebase.auth().currentUser.uid||'');
      }
    }catch(_e){}

    const filtered=nestiqFilterSortListings(__nestiqListingCache);
    if(countEl){
      const n=filtered.length;
      countEl.textContent=__listingsFavOnly
        ?(n===1?'1 favourite':`${n} favourites`)
        :(n===1?'1 listing':`${n} listings`);
    }

    if(!filtered.length){
      if(__listingsFavOnly){
        const saved=nestiqFavReadLocal().length;
        grid.innerHTML=saved
          ?`<div class="listings-empty listings-empty--fav">
              <div class="listings-empty-heart" aria-hidden="true">♥</div>
              <h3>None available right now</h3>
              <p>Your saved homes are no longer listed. Browse again and tap the heart to keep new ones here.</p>
            </div>`
          :`<div class="listings-empty listings-empty--fav">
              <div class="listings-empty-heart" aria-hidden="true">♡</div>
              <h3>No saved listings yet</h3>
              <p>Tap the heart on a listing to keep it here while you look.</p>
            </div>`;
      }else{
        grid.innerHTML='<div class="listings-empty">No listings match your filters.</div>';
      }
      nestiqRefreshListingsMap([]);
      nestiqFavPaintChrome();
      return;
    }

    grid.innerHTML=filtered.map(p=>nestiqBuildListingCardHtml(p, uid)).join('');
    if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(grid, 45);
    if(typeof nestiqInitLazyImages==='function') nestiqInitLazyImages();
    if(typeof nestiqInitAllSlideshows==='function') nestiqInitAllSlideshows();
    nestiqBindListingCardMapHover(grid);
    nestiqRefreshListingsMap(filtered);
    nestiqListingsFillMissingCoords(filtered);
    nestiqInvalidateListingsMap();
    nestiqFavPaintChrome();
  }

  async function nestiqRenderListingsPage(){
    const grid=document.getElementById('nestiqListingsGrid');
    const errEl=document.getElementById('nestiqListingsErr');
    if(errEl) errEl.textContent='';
    if(!grid) return;
    nestiqDestroyListingsMap();
    nestiqApplyListingsPageRoleUi();
    nestiqBindListingsFiltersOnce();
    nestiqFavPaintChrome();

    try{
      if(nestiqFavSignedInTenant()) await nestiqFavMergeOnTenantLogin();
    }catch(_e){}

    if(!window.nestiqUseFirestore||!window.nestiqDb){
      nestiqListingsSetShellVisible(false);
      grid.innerHTML='<p style="text-align:center;padding:32px;color:var(--muted)">Connect Firebase in <code>js/firebase-config.js</code> to load live listings.</p>';
      return;
    }

    nestiqListingsSetShellVisible(false);
    grid.innerHTML=Array.from({length:5},()=>'<div class="listings-skel" aria-hidden="true"></div>').join('');

    try{
      const {rows, error}=await nestiqFetchPublicListings();
      __nestiqListingCache=rows.map(raw=>{
        try{
          const local=(Array.isArray(window.propertiesData)?window.propertiesData:[]).find(x=>String(x.id)===String(raw.id));
          const merged=local?{
            ...raw,
            photoUrl:(typeof nestiqUsablePhotoSrc==='function'
              ? (nestiqUsablePhotoSrc(raw.photoUrl||raw.photoURL)||nestiqUsablePhotoSrc(local.photoUrl||local.photoURL)||'')
              : (raw.photoUrl||raw.photoURL||local.photoUrl||local.photoURL||'')),
            amenityPhotos:nestiqMergeAmenityPhotoLists(raw.amenityPhotos, local.amenityPhotos)
          }:raw;
          try{ window.nestiqApplyListingStatsFromUnits?.(merged); }catch(_e){}
          const c=nestiqListingsReadCoords(merged)||nestiqListingsReadCoords(local)||nestiqListingsReadCoords(raw);
          if(c){ merged.lat=c.lat; merged.lng=c.lng; }
          return merged;
        }catch(_e){ return raw; }
      });
      const listingRows=__nestiqListingCache;

      if(!listingRows.length){
        if(nestiqFavReadLocal().length){
          nestiqListingsSetShellVisible(true);
          nestiqPaintFilteredListings();
          return;
        }
        nestiqListingsSetShellVisible(false);
        nestiqClearListingsMarkers();
        const sess=(typeof getSession==='function')?getSession():null;
        if(sess?.role==='landlord'){
          grid.innerHTML=`<div class="listings-empty nq-empty-state" style="padding:40px 24px;border-style:dashed">
            <p style="margin:0 0 8px;font-weight:700;color:var(--ink);font-size:1.05rem">No public vacancies yet</p>
            <p style="margin:0 0 16px;max-width:42ch;line-height:1.55">Publish vacant units so applicants can apply from this page.</p>
            <button type="button" class="btn-gold btn-sm" id="nestiqRepublishListingsBtn">Publish my vacant units</button>
            <p style="margin:14px 0 0;font-size:0.82rem;line-height:1.5">Or open Properties, edit a unit, enable Show on public listings, and save.</p>
          </div>`;
          document.getElementById('nestiqRepublishListingsBtn')?.addEventListener('click',async()=>{
            const btn=document.getElementById('nestiqRepublishListingsBtn');
            if(btn){ btn.disabled=true; btn.textContent='Publishing…'; }
            try{
              const list=window.propertiesData||[];
              await Promise.all(list.map(p=>Promise.resolve(window.nestiqHealDraftListingIfReady?.(p.id)).catch(()=>{})));
              await window.nestiqSyncAllPublicListingMirrors?.(list);
              await nestiqRenderListingsPage();
            }catch(_e){
              if(btn){ btn.disabled=false; btn.textContent='Publish my vacant units'; }
              nestiqShowNotif?.('Could not publish listings','error');
            }
          });
          return;
        }
        if(error){
          const friendly=nestiqListingsQueryErrorMessage(error);
          if(errEl) errEl.textContent=friendly;
          grid.innerHTML=`<div class="listings-empty">${esc(friendly)}</div>`;
          return;
        }
        if(typeof nestiqShowEmptyState==='function'){
          nestiqShowEmptyState(grid, {
            icon:'🏠',
            title:'Nothing listed yet',
            message: sess
              ? 'When a landlord publishes a vacancy, it appears here. Check back soon, or open My Applications if you have already applied.'
              : 'When a landlord publishes a vacancy, it appears here. Create an account so you can apply as soon as a unit is listed.',
            action: sess ? null : { label:'Create a free account', fn:'nestiqShowTenantEntry' }
          });
        }else{
          grid.innerHTML='<div class="listings-empty">No published vacancies yet.</div>';
        }
        return;
      }

      if(error && errEl){
        errEl.textContent='Some listings may be missing until the public listings index finishes building.';
      }

      nestiqListingsSetShellVisible(true);
      try{
        const grouped=typeof window.nestiqLoadReviewsGrouped==='function'
          ? await window.nestiqLoadReviewsGrouped()
          : new Map();
        __nestiqListingCache.forEach(p=>{
          p._reviews=grouped.get(String(p.id))||[];
        });
      }catch(_e){
        __nestiqListingCache.forEach(p=>{ if(!Array.isArray(p._reviews)) p._reviews=[]; });
      }
      nestiqPaintFilteredListings();
    }catch(e){
      console.error('Listings',e);
      nestiqListingsSetShellVisible(false);
      const friendly=nestiqListingsQueryErrorMessage(e);
      if(errEl) errEl.textContent=friendly;
      grid.innerHTML=`<p style="text-align:center;padding:40px;color:var(--muted)">${esc(friendly)}</p>`;
    }
  }

  let __listingDetailMap=null;
  let __listingDetailPhotos=[];

  function nestiqDestroyListingDetailMap(){
    if(__listingDetailMap){
      try{ __listingDetailMap.remove(); }catch(_e){}
      __listingDetailMap=null;
    }
    const el=document.getElementById('listingDetailMap');
    if(el){
      try{ delete el._leaflet_id; }catch(_e){}
      el.replaceChildren();
    }
  }

  function nestiqListingTypeLabel(typeVal){
    const v=String(typeVal||'').toLowerCase();
    const types=(typeof NESTIQ_EDIT_PROPERTY_TYPES!=='undefined'&&Array.isArray(NESTIQ_EDIT_PROPERTY_TYPES))
      ? NESTIQ_EDIT_PROPERTY_TYPES
      : [
        {v:'apartment',l:'Apartment'},{v:'house',l:'House'},{v:'townhouse',l:'Townhouse'},
        {v:'backroom',l:'Backroom / Garden Flat'},{v:'bachelor',l:'Bachelor Apartment'},
        {v:'commercial',l:'Commercial'},{v:'other',l:'Other'}
      ];
    const hit=types.find(t=>t.v===v);
    if(hit) return hit.l;
    if(!v) return '';
    return v.replace(/\b\w/g,m=>m.toUpperCase());
  }

  function nestiqListingAutoOverview(p){
    const type=nestiqListingTypeLabel(p.type)||'Rental';
    const beds=Number(p.bedrooms)||0;
    const place=[p.addr,p.city].filter(Boolean).join(', ')||'this location';
    const bedPart=beds===1?'1 bedroom':`${beds} bedrooms`;
    return `${type} at ${place} with ${bedPart}.`;
  }

  function nestiqSetListingDetailHero(index){
    const photos=__listingDetailPhotos;
    if(!photos.length) return;
    const i=Math.max(0, Math.min(Number(index)||0, photos.length-1));
    const hero=document.getElementById('listingDetailHeroImg');
    const src=nestiqListingPhotoSrc(photos[i]);
    if(hero && src){
      hero.classList.add('is-fading');
      window.setTimeout(()=>{
        hero.src=src;
        hero.classList.remove('is-fading');
      },140);
    }
    document.querySelectorAll('.listing-detail-thumb').forEach((btn,idx)=>{
      const isMore=btn.classList.contains('listing-detail-thumb--more');
      btn.classList.toggle('active', !isMore && idx===i);
    });
  }

  function nestiqListingDetailOpenRest(){
    const photos=__listingDetailPhotos||[];
    if(!photos.length) return;
    const start=Math.min(5, Math.max(0, photos.length-1));
    if(typeof nestiqOpenLightbox==='function'){
      nestiqOpenLightbox(photos.map(ph=>({base64:nestiqListingPhotoSrc(ph), caption:ph.caption||''})), start);
      return;
    }
    nestiqSetListingDetailHero(start);
  }

  function nestiqInitListingDetailMap(p){
    nestiqDestroyListingDetailMap();
    const el=document.getElementById('listingDetailMap');
    if(!el || typeof L==='undefined') return;
    if(!nestiqListingsHasCoords(p)) return;
    const c=nestiqListingsReadCoords(p);
    const lat=c.lat;
    const lng=c.lng;
    __listingDetailMap=L.map(el,{
      zoomControl:false,
      attributionControl:true,
      dragging:false,
      scrollWheelZoom:false,
      doubleClickZoom:false,
      boxZoom:false,
      keyboard:false,
      tap:false,
      touchZoom:false
    }).setView([lat,lng],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors'
    }).addTo(__listingDetailMap);
    const icon=L.divIcon({
      className:'listings-map-pin',
      html:'<div class="listings-pin-dot"></div>',
      iconSize:[16,16],
      iconAnchor:[8,8]
    });
    L.marker([lat,lng],{icon, interactive:false}).addTo(__listingDetailMap);
    setTimeout(()=>{ try{ __listingDetailMap?.invalidateSize(); }catch(_e){} },150);
  }

  const __listingUnitPick={};

  function nestiqListingUnitSort(units){
    return (units||[]).slice().sort((a,b)=>String(a.label||a.unitNumber||a.id||'').localeCompare(String(b.label||b.unitNumber||b.id||''),undefined,{numeric:true,sensitivity:'base'}));
  }

  function nestiqListingUnitPickLabel(u, rentFallback){
    const rent=Number(u?.rent||rentFallback||0);
    const beds=Number(u?.bedrooms||0);
    const bits=[`Unit ${u?.label||u?.unitNumber||'Main'}`];
    if(rent) bits.push(`R${rent.toLocaleString('en-ZA')}/mo`);
    if(beds) bits.push(`${beds} bed${beds===1?'':'s'}`);
    return bits.join(' · ');
  }

  function nestiqListingUnitSummaryHtml(u, rentFallback, bedsFallback){
    if(!u) return `<p class="listing-detail-overview">Choose a unit to see rent and availability.</p>`;
    const rent=Number(u.rent||rentFallback||0);
    const beds=Number(u.bedrooms||bedsFallback||0);
    const dep=Number(u.deposit||0);
    return `<div class="listing-unit-summary">
      <div class="listing-unit-summary-name">${esc(u.label||u.unitNumber||'Unit')}</div>
      <div class="listing-unit-summary-price">R${rent.toLocaleString('en-ZA')}<span>/month</span></div>
      <div class="listing-unit-card-meta">
        ${beds?`<span>${beds} bed${beds===1?'':'s'}</span>`:''}
        ${dep?`<span>Deposit R${dep.toLocaleString('en-ZA')}</span>`:''}
        <span>Available: ${esc(u.availableFrom||'—')}</span>
      </div>
    </div>`;
  }

  function nestiqListingUnitPickFiltered(state){
    const q=String(state?.query||'').trim().toLowerCase();
    const units=nestiqListingUnitSort(state?.units||[]);
    if(!q) return units;
    return units.filter(u=>{
      const hay=[u.label,u.unitNumber,u.id,String(u.rent||''),String(u.bedrooms||'')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function nestiqPaintListingUnitPicker(propertyId){
    const state=__listingUnitPick[String(propertyId)];
    if(!state) return;
    const filtered=nestiqListingUnitPickFiltered(state);
    const sel=document.getElementById('listingUnitSelect');
    const summary=document.getElementById('listingUnitSummary');
    const applyBtn=document.getElementById('listingUnitApplyBtn');
    const countEl=document.getElementById('listingUnitFilterCount');
    if(sel){
      const cur=String(state.selectedId||'');
      const still=filtered.some(u=>String(u.id)===cur);
      const pick=still?cur:(filtered[0]?String(filtered[0].id):'');
      state.selectedId=pick;
      sel.innerHTML=filtered.length
        ? filtered.map(u=>`<option value="${esc(String(u.id||''))}" ${String(u.id)===pick?'selected':''}>${esc(nestiqListingUnitPickLabel(u,state.rent))}</option>`).join('')
        : '<option value="">No units match</option>';
      sel.disabled=!filtered.length;
    }
    const unit=(state.units||[]).find(u=>String(u.id)===String(state.selectedId))||null;
    const grid=document.getElementById('listingUnitGrid');
    if(grid){
      const pidArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(String(state.propertyId||'')):JSON.stringify(String(state.propertyId||''));
      const vis=filtered;
      grid.innerHTML=vis.length
        ? vis.map((u,i)=>{
            const on=String(u.id)===String(state.selectedId);
            const uidArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(String(u.id||'')):JSON.stringify(String(u.id||''));
            const inner=typeof window.nestiqVacantUnitCardBodyHtml==='function'
              ? window.nestiqVacantUnitCardBodyHtml(u,{rent:state.rent,selected:on})
              : esc(u.label||'Unit');
            return `<button type="button" class="nq-unit-card${on?' is-on':''}" onclick="nestiqOnListingUnitSelect(${pidArg},${uidArg})">${inner}</button>`;
          }).join('')
        : '<p class="nq-unit-empty">No vacant units match that search.</p>';
    }
    if(summary){
      if(!unit){
        summary.innerHTML='<p class="nq-unit-empty">Select a vacant unit to continue.</p>';
      }else{
        const rentN=Number(unit.rent||state.rent||0);
        const applying=nestiqIsTenantApplicantSignedIn();
        summary.innerHTML=`<div class="nq-unit-cta${applying?' is-apply':' is-guest'}">
          <div>
            <div class="nq-unit-kicker">${applying?'Applying for':'Selected unit'}</div>
            <div class="nq-unit-cta-name">${esc(unit.label||unit.unitNumber||'Unit')}</div>
          </div>
          <div class="nq-unit-cta-rent">R${rentN.toLocaleString('en-ZA')}<span>/mo</span></div>
        </div>${applying?'':`<p class="nq-unit-cta-hint">This only selects the unit. You will create an account before the application starts.</p>`}`;
      }
    }
    if(applyBtn){
      const applying=nestiqIsTenantApplicantSignedIn();
      const unitName=unit?(unit.label||unit.unitNumber||'this unit'):'';
      applyBtn.disabled=!unit;
      applyBtn.textContent=!unit
        ? 'Select a unit'
        : (applying?('Continue with '+unitName):'Create an account to apply');
    }
    if(countEl){
      const n=filtered.length;
      const total=(state.units||[]).length;
      countEl.textContent=n===total?(n===1?'1 unit':`${n} units`):`${n} of ${total} units`;
    }
  }

  function nestiqOnListingUnitSearch(propertyId, value){
    const state=__listingUnitPick[String(propertyId)];
    if(!state) return;
    state.query=value;
    nestiqPaintListingUnitPicker(propertyId);
  }

  function nestiqOnListingUnitSelect(propertyId, value){
    const state=__listingUnitPick[String(propertyId)];
    if(!state) return;
    state.selectedId=value;
    nestiqPaintListingUnitPicker(propertyId);
  }

  function nestiqApplyPickedListingUnit(propertyId){
    const state=__listingUnitPick[String(propertyId)];
    const unit=(state?.units||[]).find(u=>String(u.id)===String(state.selectedId))
      || (state?.units||[]).find(u=>typeof window.nestiqListingUnitMatches==='function' && window.nestiqListingUnitMatches(u,state.selectedId,state.selectedId));
    if(!state||!unit){
      nestiqShowNotif?.('Select a unit first','warning');
      return;
    }
    nestiqOpenApplyForListing(propertyId,{
      ...state.applyPayload,
      rent:Number(unit.rent||state.rent),
      bedrooms:Number(unit.bedrooms||state.beds),
      leaseEnd:String(unit.availableFrom||state.applyPayload.leaseEnd||''),
      unitId:String(unit.id||''),
      unitLabel:String(unit.label||'Unit'),
      deposit:Number(unit.deposit||0)
    });
  }

  async function nestiqOpenListingDetail(propertyId){
    const p=__nestiqListingCache.find(x=>String(x.id)===String(propertyId));
    if(!p) return;
    const mc=document.getElementById('modalContent');
    const ov=document.getElementById('modalOverlay');
    if(!mc||!ov) return;

    nestiqDestroyListingDetailMap();

    if(typeof window.nestiqLoadReviewsForProperty==='function'){
      try{
        p._reviews=await window.nestiqLoadReviewsForProperty(p.id);
      }catch(_e){
        if(!Array.isArray(p._reviews)) p._reviews=[];
      }
    }

    const galleryPhotos=typeof nestiqGetSlideshowPhotos==='function'?nestiqGetSlideshowPhotos(p):[];
    __listingDetailPhotos=Array.isArray(galleryPhotos)?galleryPhotos.filter(ph=>nestiqListingPhotoSrc(ph)):[];
    const photos=__listingDetailPhotos;

    const amenities=typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[];
    const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(amenities):'';

    const beds=Number(p.bedrooms)||0;
    const baths=Number(p.bathrooms)||0;
    const floor=p.floorSize!=null&&String(p.floorSize).trim()!==''?Number(p.floorSize):NaN;
    const parking=p.parkingBays!=null&&String(p.parkingBays).trim()!==''?Number(p.parkingBays):NaN;
    const deposit=Number(p.deposit);
    const levy=Number(p.levy);
    const typeLabel=nestiqListingTypeLabel(p.type);
    const notes=String(p.notes||'').trim();
    const overview=notes||nestiqListingAutoOverview(p);
    const rent=Number(p.rent||0);
    const addrLine=[p.addr,p.city].filter(Boolean).join(', ');

    const applyPayload={
      name:String(p.name||'Listed rental'),
      rent,
      bedrooms:beds,
      addr:String(p.addr||''),
      leaseEnd:String(p.leaseEnd||''),
      landlordId:String(p.landlordId||'')
    };
    const idArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(String(p.id)):JSON.stringify(String(p.id));
    const units=nestiqListingUnitsOf(p);
    const realUnits=units.filter(u=>!u.synthetic && String(u.id||''));
    const applyUnits=nestiqListingUnitSort(realUnits.length?realUnits:units);
    __listingUnitPick[String(p.id)]={
      propertyId:String(p.id),
      units:applyUnits,
      applyPayload,
      rent,
      beds,
      query:'',
      selectedId:applyUnits[0]?String(applyUnits[0].id):''
    };
    const firstUnit=applyUnits[0]||null;
    const showUnitSearch=applyUnits.length>=8;
    const applying=nestiqIsTenantApplicantSignedIn();
    const unitsHtml=`<div class="listing-detail-section nq-unit-section">
        <div class="nq-unit-kicker">This property</div>
        <h3>Vacant units</h3>
        <p class="listing-detail-overview">${applying
          ? 'Pick the home you want. Occupied and reserved units are not shown.'
          : 'Choose a vacant unit to see rent. Create a tenant account when you are ready to apply.'}</p>
        ${applyUnits.length
          ? `<div class="nq-unit-stage listing-unit-picker">
              <div class="listing-unit-picker-bar">
                ${showUnitSearch?`<input type="search" class="form-input nq-unit-search" id="listingUnitSearch" placeholder="Search unit number" autocomplete="off" oninput="nestiqOnListingUnitSearch(${idArg},this.value)">`:''}
                <select class="form-input" id="listingUnitSelect" onchange="nestiqOnListingUnitSelect(${idArg},this.value)" hidden></select>
                <div class="nq-unit-count" id="listingUnitFilterCount">${applyUnits.length===1?'1 vacant unit':`${applyUnits.length} vacant units`}</div>
              </div>
              <div class="nq-unit-grid" id="listingUnitGrid"></div>
              <div id="listingUnitSummary"></div>
              <button type="button" class="btn-gold nq-unit-apply" id="listingUnitApplyBtn" ${firstUnit?'':'disabled'}
                onclick="nestiqApplyPickedListingUnit(${idArg})">${applying?'Continue':'Create an account to apply'}</button>
            </div>`
          : `<p class="nq-unit-empty">No vacant units on this property right now.</p>`}
      </div>`;

    let heroHtml='';
    const heroFav=nestiqListingFavBtnHtml(p.id,'hero');
    if(photos.length){
      const src0=esc(nestiqListingPhotoSrc(photos[0]));
      heroHtml=`<div class="listing-detail-hero"><img id="listingDetailHeroImg" src="${src0}" alt="${esc(p.name||'Property photo')}" onerror="nestiqPropertyPhotoImgError(this)">${heroFav}</div>`;
    }else{
      heroHtml=`<div class="listing-detail-hero nestiq-detail-main--empty"><div class="listing-detail-hero-ph"><span style="font-size:2.4rem">${esc(p.icon||'🏠')}</span><span>No photos yet</span></div>${heroFav}</div>`;
    }

    let thumbsHtml='';
    if(photos.length){
      const show=Math.min(5, photos.length);
      const extra=photos.length-show;
      const thumbs=[];
      for(let i=0;i<show;i++){
        const src=esc(nestiqListingPhotoSrc(photos[i]));
        thumbs.push(`<button type="button" class="listing-detail-thumb${i===0?' active':''}" data-photo-index="${i}" onclick="nestiqSetListingDetailHero(${i})" aria-label="Photo ${i+1}">
          <img src="${src}" alt="">
        </button>`);
      }
      if(extra>0){
        thumbs.push(`<button type="button" class="listing-detail-thumb listing-detail-thumb--more" onclick="nestiqListingDetailOpenRest()" aria-label="${extra} more photos"><span class="listing-detail-thumb-more">+${extra}</span></button>`);
      }
      thumbsHtml=`<div class="listing-detail-thumbs">${thumbs.join('')}</div>`;
    }

    const stats=[];
    stats.push(`<div class="listing-detail-stat"><span>🛏</span>${beds} bed${beds===1?'':'s'}</div>`);
    if(baths>0) stats.push(`<div class="listing-detail-stat"><span>🛁</span>${baths} bath${baths===1?'':'s'}</div>`);
    if(Number.isFinite(floor) && floor>0) stats.push(`<div class="listing-detail-stat"><span>📐</span>${floor} m²</div>`);

    const featureRows=[];
    if(typeLabel) featureRows.push({lbl:'Type', val:esc(typeLabel), icon:'🏷'});
    if(Number.isFinite(parking) && parking>=0 && String(p.parkingBays).trim()!==''){
      featureRows.push({lbl:'Parking', val:`${parking} bay${parking===1?'':'s'}`, icon:'🚗'});
    }
    if(Number.isFinite(deposit) && deposit>0){
      featureRows.push({lbl:'Deposit', val:`R${deposit.toLocaleString('en-ZA')}`, icon:'💰'});
    }
    if(Number.isFinite(levy) && levy>0){
      featureRows.push({lbl:'Levy', val:`R${levy.toLocaleString('en-ZA')}/mo`, icon:'🏢'});
    }
    let featuresHtml='';
    if(featureRows.length || amenitiesHtml){
      const cells=featureRows.map(r=>`
        <div class="listing-detail-feature">
          <div class="listing-detail-feature-lbl">${r.icon} ${r.lbl}</div>
          <div class="listing-detail-feature-val">${r.val}</div>
        </div>`).join('');
      const amenCell=amenitiesHtml
        ? `<div class="listing-detail-feature span-2">
             <div class="listing-detail-feature-lbl">✨ Amenities</div>
             <div class="listing-detail-feature-val">${amenitiesHtml}</div>
           </div>`
        : '';
      featuresHtml=`<div class="listing-detail-section">
        <h3>Property Information &amp; Features</h3>
        <div class="listing-detail-features">${cells}${amenCell}</div>
      </div>`;
    }

    const hasCoords=nestiqListingsHasCoords(p);
    const locationHtml=hasCoords
      ? `<div id="listingDetailMap" class="listing-detail-map"></div>`
      : `<div class="listing-detail-map-empty">No location pinned for this property</div>`;

    mc.innerHTML=`
      <div class="listing-detail">
        <div class="listing-detail-media">
          ${heroHtml}
          ${thumbsHtml}
          ${typeof window.nestiqListingDetailReviewsHtml==='function'?window.nestiqListingDetailReviewsHtml(p._reviews||[]):''}
        </div>
        <div class="listing-detail-info">
          <h2 class="modal-title" style="margin-bottom:0">${esc(p.name||'Rental')}</h2>
          <p class="listing-detail-addr">📍 ${esc(addrLine||'Address not listed')}</p>
          <div class="listing-detail-stats">${stats.join('')}</div>
          <div class="listing-detail-price">R${rent.toLocaleString('en-ZA')}/month</div>
          <div class="listing-detail-actions">
            ${nestiqListingFavBtnHtml(p.id,'action')}
            <button type="button" class="btn-outline" onclick="nestiqCloseModalAnimated()">Close</button>
          </div>
          ${unitsHtml}
          <div class="listing-detail-section">
            <h3>Overview</h3>
            <p class="listing-detail-overview">${esc(overview)}</p>
          </div>
          ${featuresHtml}
          <div class="listing-detail-section">
            <h3>Location</h3>
            ${locationHtml}
          </div>
        </div>
      </div>`;

    const modalEl=document.querySelector('#modalOverlay .modal');
    if(modalEl){
      modalEl.classList.remove('modal-wide');
      modalEl.classList.add('modal-xwide');
    }

    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else ov.classList.add('open');

    if(hasCoords){
      setTimeout(()=>nestiqInitListingDetailMap(p),80);
    }
    nestiqFavPaintChrome();
    nestiqPaintListingUnitPicker(p.id);
    setTimeout(()=>{
      const list=document.querySelector('#listingDetailReviews .nestiq-review-list');
      if(list&&typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(list, 60);
    }, 80);
  }

  window.nestiqRenderListingsPage=nestiqRenderListingsPage;
  window.nestiqOpenApplyForListing=nestiqOpenApplyForListing;
  window.nestiqOpenApplyForListingFromCard=nestiqOpenApplyForListingFromCard;
  window.nestiqOpenListingDetail=nestiqOpenListingDetail;
  window.nestiqSetListingDetailHero=nestiqSetListingDetailHero;
  window.nestiqListingDetailOpenRest=nestiqListingDetailOpenRest;
  window.nestiqDestroyListingDetailMap=nestiqDestroyListingDetailMap;
  window.nestiqDestroyListingsMap=nestiqDestroyListingsMap;
  window.nestiqOnListingUnitSearch=nestiqOnListingUnitSearch;
  window.nestiqOnListingUnitSelect=nestiqOnListingUnitSelect;
  window.nestiqApplyPickedListingUnit=nestiqApplyPickedListingUnit;
  window.nestiqToggleListingFavourite=nestiqToggleListingFavourite;
  window.nestiqFavMergeOnTenantLogin=nestiqFavMergeOnTenantLogin;
  window.nestiqSetListingsFavouritesView=nestiqSetListingsFavouritesView;
})();
