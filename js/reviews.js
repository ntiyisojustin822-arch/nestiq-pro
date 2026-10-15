(function(){
  const REVIEW_BODY_MAX=2000;
  const FUNCTIONS_REGION='us-central1';

  function nestiqFunctions(){
    try{
      if(typeof firebase==='undefined'||typeof firebase.app!=='function') return null;
      if(typeof firebase.app().functions!=='function') return null;
      return firebase.app().functions(FUNCTIONS_REGION);
    }catch(_e){ return null; }
  }

  function nestiqReviewEsc(s){
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function nestiqReviewStarsHtml(avg, opts){
    const o=opts&&typeof opts==='object'?opts:{};
    const n=Math.max(0, Math.min(5, Number(avg)||0));
    const rounded=Math.round(n);
    let stars='';
    for(let i=1;i<=5;i++){
      stars+=`<span class="nestiq-review-star${i<=rounded?' filled':''}" aria-hidden="true">★</span>`;
    }
    const label=o.hideNumber?'':` <span class="nestiq-review-avg">${n?n.toFixed(1):'—'}</span>`;
    return `<span class="nestiq-review-stars" title="${nestiqReviewEsc((n?n.toFixed(1):'0')+' out of 5')}">${stars}${label}</span>`;
  }

  function nestiqReviewCreatedMs(r){
    const c=r?.createdAt;
    if(!c) return 0;
    if(typeof c.toMillis==='function') return c.toMillis();
    if(c.seconds) return Number(c.seconds)*1000;
    const d=new Date(c);
    return String(d)==='Invalid Date'?0:d.getTime();
  }

  function nestiqNormalizeReviewRow(doc){
    const d=doc&&typeof doc.data==='function'?doc.data():(doc||{});
    const id=doc&&doc.id?doc.id:(d.id||'');
    return {
      id,
      landlordId:String(d.landlordId||''),
      propertyId:String(d.propertyId||''),
      tenantUid:String(d.tenantUid||''),
      tenantName:String(d.tenantName||'Tenant'),
      rating:Math.max(1, Math.min(5, Number(d.rating)||0)),
      body:String(d.body||''),
      showPhoto:d.showPhoto===true,
      photoUrlSnapshot:d.showPhoto===true?String(d.photoUrlSnapshot||''):'',
      createdAt:d.createdAt||null,
      updatedAt:d.updatedAt||null
    };
  }

  async function nestiqLoadReviewsForProperty(propertyId){
    const pid=String(propertyId||'');
    if(!pid||!window.nestiqDb||typeof window.nestiqDb.collection!=='function') return [];
    try{
      const snap=await window.nestiqDb.collection('reviews').where('propertyId','==',pid).get();
      return snap.docs.map(nestiqNormalizeReviewRow).sort((a,b)=>nestiqReviewCreatedMs(b)-nestiqReviewCreatedMs(a));
    }catch(err){
      console.warn('NestIQ: load property reviews', err);
      return [];
    }
  }

  async function nestiqLoadReviewsGrouped(){
    const empty=new Map();
    if(!window.nestiqDb||typeof window.nestiqDb.collection!=='function') return empty;
    try{
      const snap=await window.nestiqDb.collection('reviews').get();
      const map=new Map();
      snap.docs.forEach(doc=>{
        const row=nestiqNormalizeReviewRow(doc);
        const pid=row.propertyId;
        if(!pid) return;
        if(!map.has(pid)) map.set(pid,[]);
        map.get(pid).push(row);
      });
      map.forEach((rows,pid)=>{
        rows.sort((a,b)=>nestiqReviewCreatedMs(b)-nestiqReviewCreatedMs(a));
        map.set(pid, rows);
      });
      return map;
    }catch(err){
      console.warn('NestIQ: load reviews', err);
      return empty;
    }
  }

  function nestiqReviewStats(rows){
    const list=Array.isArray(rows)?rows:[];
    const count=list.length;
    const avg=count?list.reduce((s,r)=>s+Number(r.rating||0),0)/count:0;
    return { count, avg };
  }

  function nestiqListingCardRatingHtml(rows){
    const {count, avg}=nestiqReviewStats(rows);
    if(!count){
      return `<div class="listings-card-reviews nestiq-review-none">No reviews yet</div>`;
    }
    const label=count===1?'1 review':`${count} reviews`;
    return `<div class="listings-card-reviews">${nestiqReviewStarsHtml(avg)} <span class="nestiq-review-count">(${nestiqReviewEsc(label)})</span></div>`;
  }

  function nestiqReviewAvatarHtml(r){
    const photo=r?.showPhoto===true?String(r.photoUrlSnapshot||''):'';
    const initial=String(r?.tenantName||'T').slice(0,1)||'T';
    const inner=(photo&&(photo.startsWith('data:')||photo.startsWith('http')))
      ? `<img src="${nestiqReviewEsc(photo)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="" referrerpolicy="no-referrer">`
      : nestiqReviewEsc(initial);
    return `<div class="tenant-profile-photo nestiq-review-avatar">${inner}</div>`;
  }

  function nestiqReviewDateLabel(r){
    const ms=nestiqReviewCreatedMs(r);
    if(!ms) return '';
    try{
      return new Date(ms).toLocaleDateString('en-ZA',{month:'short',year:'numeric'});
    }catch(_e){ return ''; }
  }

  function nestiqListingDetailReviewsHtml(rows){
    const list=Array.isArray(rows)?rows:[];
    const {count, avg}=nestiqReviewStats(list);
    if(!count){
      return `<aside class="listing-detail-reviews" id="listingDetailReviews">
        <div class="listing-detail-reviews-kicker">Guest feedback</div>
        <h3>Tenant reviews</h3>
        <div class="nestiq-review-empty">
          <span class="nestiq-review-empty-mark" aria-hidden="true">★</span>
          <p>No reviews yet</p>
          <span>Verified tenants can share how living here has been.</span>
        </div>
      </aside>`;
    }
    const cards=list.map(r=>{
      const body=String(r.body||'').trim();
      const when=nestiqReviewDateLabel(r);
      return `<article class="nestiq-review-card">
        <div class="nestiq-review-card-head">
          ${nestiqReviewAvatarHtml(r)}
          <div class="nestiq-review-card-meta">
            <strong>${nestiqReviewEsc(r.tenantName||'Tenant')}</strong>
            <div class="nestiq-review-card-line">${nestiqReviewStarsHtml(r.rating,{hideNumber:true})}${when?`<span class="nestiq-review-date">${nestiqReviewEsc(when)}</span>`:''}</div>
          </div>
        </div>
        ${body?`<p class="nestiq-review-card-body">${nestiqReviewEsc(body)}</p>`:''}
      </article>`;
    }).join('');
    const label=count===1?'1 review':`${count} reviews`;
    return `<aside class="listing-detail-reviews" id="listingDetailReviews">
      <div class="listing-detail-reviews-kicker">Guest feedback</div>
      <h3>Tenant reviews</h3>
      <div class="nestiq-review-summary">${nestiqReviewStarsHtml(avg)} <span class="nestiq-review-count">${nestiqReviewEsc(label)}</span></div>
      <div class="nestiq-review-list">${cards}</div>
    </aside>`;
  }

  function nestiqReviewDocId(landlordId, propertyId, tenantUid){
    return `${String(landlordId||'')}_${String(propertyId||'')}_${String(tenantUid||'')}`;
  }

  async function nestiqFetchMyPropertyReview(landlordId, propertyId, tenantUid){
    if(!window.nestiqDb||!landlordId||!propertyId||!tenantUid) return null;
    try{
      const id=nestiqReviewDocId(landlordId, propertyId, tenantUid);
      const snap=await window.nestiqDb.collection('reviews').doc(id).get();
      if(!snap.exists) return null;
      return nestiqNormalizeReviewRow(snap);
    }catch(err){
      console.warn('NestIQ: fetch own review', err);
      return null;
    }
  }

  function nestiqReviewCallableFailed(err){
    const code=String(err?.code||'');
    const msg=String(err?.message||'');
    return /internal|not-found|unavailable|unimplemented|deadline|resource-exhausted/i.test(code+' '+msg);
  }

  function nestiqPublicReviewName(fullName, fallback){
    const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return fallback||'Tenant';
    if(parts.length===1) return parts[0];
    const initial=String(parts[parts.length-1].charAt(0)||'').toUpperCase();
    return initial?`${parts[0]} ${initial}.`:parts[0];
  }

  function nestiqReviewInitials(fullName){
    const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return 'LL';
    if(parts.length===1) return String(parts[0].slice(0,2)||'L').toUpperCase();
    return (String(parts[0].charAt(0))+String(parts[parts.length-1].charAt(0))).toUpperCase();
  }

  function nestiqReviewTimestamp(){
    try{ return firebase.firestore.FieldValue.serverTimestamp(); }catch(_e){ return new Date(); }
  }

  async function nestiqWritePropertyReviewDirect(propertyId, rating, body, showPhoto){
    const uid=String(firebase.auth?.()?.currentUser?.uid||'').trim();
    const db=window.nestiqDb;
    const t=window.currentTenantData||{};
    const landlordId=String(window.nestiqTenantSession?.landlordId||t.landlordId||'').trim();
    const pid=String(propertyId||t.propertyId||'').trim();
    if(!uid||!db||!landlordId||!pid){
      const err=new Error('Sign in as the tenant for this property to publish a review.');
      err.code='unauthenticated';
      throw err;
    }
    const photo=showPhoto===true
      ? String(t.profilePhoto||t.photoUrl||t.photoURL||'').trim()
      : '';
    const usable=/^https?:\/\//i.test(photo)||photo.startsWith('data:image/')?photo:'';
    const now=nestiqReviewTimestamp();
    const payload={
      landlordId,
      propertyId:pid,
      tenantUid:uid,
      tenantName:nestiqPublicReviewName(t.name||t.tenantName||'','Tenant'),
      rating:Math.max(1, Math.min(5, Math.round(Number(rating)||0))),
      body:String(body||'').trim().slice(0, REVIEW_BODY_MAX),
      showPhoto:showPhoto===true && !!usable,
      updatedAt:now
    };
    if(usable) payload.photoUrlSnapshot=usable;
    const ref=db.collection('reviews').doc(`${landlordId}_${pid}_${uid}`.replace(/\//g,'_'));
    const existing=await ref.get();
    if(existing.exists){
      const patch={...payload};
      if(!usable) patch.photoUrlSnapshot=firebase.firestore.FieldValue.delete();
      await ref.set(patch,{merge:true});
    }else{
      await ref.set({...payload, createdAt:now});
    }
    return { ok:true, reviewId:ref.id, tenantName:payload.tenantName, rating:payload.rating, body:payload.body, showPhoto:payload.showPhoto };
  }

  async function nestiqSubmitPropertyReview(propertyId, rating, body, showPhoto){
    const payload={
      propertyId:String(propertyId||''),
      rating:Number(rating),
      body:String(body||'').slice(0, REVIEW_BODY_MAX),
      showPhoto:showPhoto===true
    };
    const fns=nestiqFunctions();
    if(fns){
      try{
        const callable=fns.httpsCallable('submitPropertyReview');
        const res=await callable(payload);
        return res&&res.data?res.data:res;
      }catch(err){
        if(!nestiqReviewCallableFailed(err)) throw err;
        console.warn('NestIQ: review function unavailable, saving in Firestore', err);
      }
    }
    return nestiqWritePropertyReviewDirect(propertyId, rating, body, showPhoto);
  }

  const PRODUCT_REVIEW_BODY_MAX=400;
  const PRODUCT_REVIEW_BODY_MIN=20;

  function nestiqProductReviewStarsText(rating){
    const n=Math.max(1, Math.min(5, Number(rating)||0));
    let html='';
    for(let i=1;i<=5;i++) html+=i<=n?'★':'☆';
    return html;
  }

  function nestiqNormalizeProductReviewRow(doc){
    const d=doc&&typeof doc.data==='function'?doc.data():(doc||{});
    const id=doc&&doc.id?doc.id:(d.id||'');
    return {
      id,
      landlordId:String(d.landlordId||id||''),
      displayName:String(d.displayName||'Landlord'),
      initials:String(d.initials||'LL').slice(0,3).toUpperCase(),
      city:String(d.city||''),
      rating:Math.max(1, Math.min(5, Number(d.rating)||0)),
      body:String(d.body||''),
      published:d.published!==false,
      createdAt:d.createdAt||null,
      updatedAt:d.updatedAt||null
    };
  }

  async function nestiqFetchMyProductReview(){
    const uid=String(typeof firebase!=='undefined'&&firebase.auth?.()?.currentUser?.uid||'').trim();
    const col=window.nestiqFs?.productReviews?.(window.nestiqDb)||window.nestiqDb?.collection('productReviews');
    if(!uid||!col) return null;
    try{
      const snap=await col.doc(uid).get();
      if(!snap.exists) return null;
      return nestiqNormalizeProductReviewRow(snap);
    }catch(err){
      console.warn('NestIQ: fetch product review', err);
      return null;
    }
  }

  async function nestiqWriteProductReviewDirect(rating, body, city, published){
    const uid=String(firebase.auth?.()?.currentUser?.uid||'').trim();
    const db=window.nestiqDb;
    const col=window.nestiqFs?.productReviews?.(db)||db?.collection('productReviews');
    if(!uid||!col){
      const err=new Error('Sign in as a landlord to publish a review.');
      err.code='unauthenticated';
      throw err;
    }
    const now=nestiqReviewTimestamp();
    const ref=col.doc(uid);
    if(published===false){
      const existing=await ref.get();
      if(!existing.exists){
        const err=new Error('No review to remove.');
        err.code='not-found';
        throw err;
      }
      await ref.set({ published:false, updatedAt:now },{ merge:true });
      return { ok:true, published:false, reviewId:uid };
    }
    const s=typeof getSession==='function'?getSession():null;
    const settings=window.landlordSettings||{};
    const name=String(settings.name||s?.name||firebase.auth?.()?.currentUser?.displayName||'Landlord');
    const payload={
      kind:'product',
      landlordId:uid,
      displayName:nestiqPublicReviewName(name,'Landlord'),
      initials:nestiqReviewInitials(name),
      city:String(city||'').trim().slice(0,40),
      rating:Math.max(1, Math.min(5, Math.round(Number(rating)||0))),
      body:String(body||'').trim().slice(0, PRODUCT_REVIEW_BODY_MAX),
      published:true,
      updatedAt:now
    };
    const existing=await ref.get();
    if(existing.exists) await ref.set(payload,{ merge:true });
    else await ref.set({ ...payload, createdAt:now });
    return { ok:true, published:true, reviewId:uid, ...payload };
  }

  async function nestiqSubmitProductReview(rating, body, city){
    const payload={
      rating:Number(rating),
      body:String(body||'').slice(0, PRODUCT_REVIEW_BODY_MAX),
      city:String(city||'').trim().slice(0,40),
      published:true
    };
    const fns=nestiqFunctions();
    if(fns){
      try{
        const callable=fns.httpsCallable('submitProductReview');
        const res=await callable(payload);
        return res&&res.data?res.data:res;
      }catch(err){
        if(!nestiqReviewCallableFailed(err)) throw err;
        console.warn('NestIQ: product review function unavailable, saving in Firestore', err);
      }
    }
    return nestiqWriteProductReviewDirect(rating, body, city, true);
  }

  async function nestiqUnpublishProductReview(){
    const fns=nestiqFunctions();
    if(fns){
      try{
        const callable=fns.httpsCallable('submitProductReview');
        const res=await callable({ published:false });
        return res&&res.data?res.data:res;
      }catch(err){
        if(!nestiqReviewCallableFailed(err)) throw err;
        console.warn('NestIQ: unpublish review function unavailable, saving in Firestore', err);
      }
    }
    return nestiqWriteProductReviewDirect(0, '', '', false);
  }

  window.nestiqLoadReviewsGrouped=nestiqLoadReviewsGrouped;
  window.nestiqLoadReviewsForProperty=nestiqLoadReviewsForProperty;
  window.nestiqReviewStats=nestiqReviewStats;
  window.nestiqReviewStarsHtml=nestiqReviewStarsHtml;
  window.nestiqListingCardRatingHtml=nestiqListingCardRatingHtml;
  window.nestiqListingDetailReviewsHtml=nestiqListingDetailReviewsHtml;
  window.nestiqReviewAvatarHtml=nestiqReviewAvatarHtml;
  window.nestiqFetchMyPropertyReview=nestiqFetchMyPropertyReview;
  window.nestiqSubmitPropertyReview=nestiqSubmitPropertyReview;
  window.nestiqReviewDocId=nestiqReviewDocId;
  window.nestiqFetchMyProductReview=nestiqFetchMyProductReview;
  window.nestiqSubmitProductReview=nestiqSubmitProductReview;
  window.nestiqUnpublishProductReview=nestiqUnpublishProductReview;
  window.nestiqProductReviewStarsText=nestiqProductReviewStarsText;
  window.nestiqNormalizeProductReviewRow=nestiqNormalizeProductReviewRow;
  window.NESTIQ_PRODUCT_REVIEW_BODY_MAX=PRODUCT_REVIEW_BODY_MAX;
  window.NESTIQ_PRODUCT_REVIEW_BODY_MIN=PRODUCT_REVIEW_BODY_MIN;
})();
