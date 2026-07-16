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

  function nestiqListingUpdatedMs(row){
    const u=row?.updatedAt;
    if(u && typeof u.toMillis==='function') return u.toMillis();
    if(typeof u==='number') return u;
    if(typeof u==='string') return Date.parse(u)||0;
    return 0;
  }

  function nestiqPutListingRow(map, row){
    const id=String(row?.id??'').trim();
    if(!id) return;
    const prev=map.get(id);
    if(!prev || nestiqListingUpdatedMs(row)>=nestiqListingUpdatedMs(prev)){
      map.set(id,{...prev,...row,id});
    }
  }

  async function nestiqFetchPublicListings(){
    const db=window.nestiqDb;
    if(!db) return {rows:[], error:null};
    const byId=new Map();
    let queryError=null;

    // Prefer the denormalized public feed (no composite collectionGroup index required).
    try{
      const mirrorSnap=await db.collection('publicListings').limit(80).get();
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
        .limit(80)
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
        const mineSnap=await window.nestiqFs.properties(db, uid)
          .where('status','==','vacant')
          .limit(80)
          .get();
        const backfills=[];
        mineSnap.docs.forEach(d=>{
          const data=d.data()||{};
          let row={id:d.id,...data,landlordId:data.landlordId||uid};
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
        local.forEach(p=>{
          if(String(p.status||'').toLowerCase()!=='vacant') return;
          if(p.publicListing===false) return;
          nestiqPutListingRow(byId,{...p, landlordId:p.landlordId||uid, status:'vacant', publicListing:true});
        });
        // Always republish so the guest public feed stays in sync.
        await window.nestiqSyncAllPublicListingMirrors?.(local);
        try{
          const mirrorSnap2=await db.collection('publicListings').limit(80).get();
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
   * Open standalone application.html with listing details in the query string
   * (property, name, rent, bedrooms, addr, leaseEnd) for applicants without the main SPA session.
   */
  function nestiqOpenApplyForListing(propertyId, fields){
    const id=String(propertyId||'').trim();
    if(!id) return;
    const f=fields&&typeof fields==='object'?fields:{};
    const qs=new URLSearchParams();
    qs.set('property',id);
    qs.set('name',String(f.name!=null&&f.name!==''?f.name:'Listed rental'));
    qs.set('rent',String(Number(f.rent)||0));
    qs.set('bedrooms',String(Number(f.bedrooms)||0));
    qs.set('addr',String(f.addr||''));
    qs.set('leaseEnd',String(f.leaseEnd!=null&&f.leaseEnd!==''?f.leaseEnd:'Available'));
    if(f.landlordId!=null&&String(f.landlordId).trim()) qs.set('landlord',String(f.landlordId).trim());
    const base=nestiqListingsAppBaseHref();
    const next=base+'application.html?'+qs.toString();
    location.href=next;
  }

  function nestiqOpenApplyForListingFromCard(btn){
    const card=btn&&btn.closest?btn.closest('.nestiq-listing-card'):null;
    if(!card||!card.dataset) return;
    const id=decodeURIComponent(String(card.dataset.applyId||'')).trim();
    if(!id) return;
    nestiqOpenApplyForListing(id,{
      name:decodeURIComponent(String(card.dataset.applyName||'')),
      rent:Number(card.dataset.applyRent||0),
      bedrooms:Number(card.dataset.applyBed||0),
      addr:decodeURIComponent(String(card.dataset.applyAddr||'')),
      leaseEnd:decodeURIComponent(String(card.dataset.applyLease||'')),
      landlordId:decodeURIComponent(String(card.dataset.applyLandlord||'')).trim()
    });
  }

  function nestiqApplyListingsPageRoleUi(){
    const s=(typeof getSession==='function')?getSession():null;
    const isLandlord=!!(s&&s.role==='landlord');
    const guestBar=document.getElementById('nestiqListingsGuestBar');
    if(guestBar) guestBar.style.display=isLandlord?'none':'flex';
  }

  async function nestiqRenderListingsPage(){
    const grid=document.getElementById('nestiqListingsGrid');
    const errEl=document.getElementById('nestiqListingsErr');
    if(errEl) errEl.textContent='';
    if(!grid) return;
    nestiqApplyListingsPageRoleUi();
    if(!window.nestiqUseFirestore||!window.nestiqDb){
      grid.innerHTML='<p style="text-align:center;padding:32px;color:var(--muted)">Connect Firebase in <code>js/firebase-config.js</code> to load live listings.</p>';
      return;
    }
    grid.innerHTML=Array.from({length:4},()=>'<div class="nestiq-skel-card" style="height:180px;border-radius:var(--radius);border:1px solid var(--border);animation:nestiqShimmer 1.5s infinite"></div>').join('');
    try{
      let uid='';
      try{
        if(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser){
          uid=String(firebase.auth().currentUser.uid||'');
        }
      }catch(_e){}
      const {rows, error}=await nestiqFetchPublicListings();
      __nestiqListingCache=rows;
      if(!rows.length){
        const sess=(typeof getSession==='function')?getSession():null;
        if(sess?.role==='landlord'){
          grid.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">
            <p style="margin:0 0 14px">No published vacancies in the public feed yet.</p>
            <button type="button" class="btn-gold btn-sm" id="nestiqRepublishListingsBtn">Publish my vacant units</button>
            <p style="margin:12px 0 0;font-size:0.82rem">Or open <strong>Properties</strong> → Edit a vacant unit → enable <strong>Show on public listings</strong> → Save.</p>
          </div>`;
          document.getElementById('nestiqRepublishListingsBtn')?.addEventListener('click',async()=>{
            const btn=document.getElementById('nestiqRepublishListingsBtn');
            if(btn){ btn.disabled=true; btn.textContent='Publishing…'; }
            try{
              await window.nestiqSyncAllPublicListingMirrors?.(window.propertiesData||[]);
              await nestiqRenderListingsPage();
            }catch(_e){
              if(btn){ btn.disabled=false; btn.textContent='Publish my vacant units'; }
              showNotif?.('Could not publish listings','error');
            }
          });
          return;
        }
        if(error){
          const friendly=nestiqListingsQueryErrorMessage(error);
          if(errEl) errEl.textContent=friendly;
          grid.innerHTML=`<p style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">${esc(friendly)}</p>`;
          return;
        }
        grid.innerHTML='<p style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">No published vacancies yet.</p>';
        return;
      }
      if(error && errEl){
        errEl.textContent='Some listings may be missing until the public listings index finishes building.';
      }
      if(typeof nestiqDestroyAllSlideshows==='function') nestiqDestroyAllSlideshows();
      grid.innerHTML=rows.map(p=>{
        const rent=Number(p.rent||0);
        const beds=Number(p.bedrooms||0);
        const name=esc(p.name||'Rental');
        const addr=esc(p.addr||'');
        const city=esc(p.city||'');
        const icon=esc(p.icon||'🏢');
        const rawName=String(p.name||'Rental');
        const rawAddr=[p.addr,p.city].filter(Boolean).join(', ');
        const rawLease=String(p.leaseEnd||'');
        const idEnc=encodeURIComponent(String(p.id==null?'':p.id));
        const nameEnc=encodeURIComponent(rawName);
        const addrEnc=encodeURIComponent(rawAddr);
        const leaseEnc=encodeURIComponent(rawLease);
        const lidEnc=encodeURIComponent(String(p.landlordId||''));
        const mine=uid&&String(p.landlordId||'')===uid;
        const draft=mine&&p.publicListing===false;
        const amenityPhotos=typeof nestiqNormalizeAmenityPhotos==='function'?nestiqNormalizeAmenityPhotos(p.amenityPhotos):[];
        const mainPu=(typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'')||p.photoUrl||p.photoURL||'';
        const gallery=typeof nestiqGetSlideshowPhotos==='function'
          ? nestiqGetSlideshowPhotos(p)
          : (mainPu?[{base64:mainPu,caption:'Main photo'}]:[]).concat(amenityPhotos.map(a=>({base64:a.base64,caption:a.caption||''})));
        let imgBlock='';
        if(gallery.length>1){
          const enc=typeof nestiqEncodeSlideshowPhotos==='function'
            ? nestiqEncodeSlideshowPhotos(gallery)
            : encodeURIComponent(JSON.stringify(gallery.map(a=>({base64:a.base64,caption:a.caption||''}))));
          imgBlock=`<div class="prop-img-area" style="padding:0;height:auto"><div data-nestiq-slideshow data-photos="${enc}" style="width:100%"></div></div>`;
        }else if(mainPu){
          imgBlock=`<div class="prop-img-area" style="background-image:url('${cssUrl(mainPu)}');background-size:cover;background-position:center"></div>`;
        }else if(gallery.length===1){
          const enc=typeof nestiqEncodeSlideshowPhotos==='function'
            ? nestiqEncodeSlideshowPhotos(gallery)
            : encodeURIComponent(JSON.stringify([{base64:gallery[0].base64,caption:gallery[0].caption||''}]));
          imgBlock=`<div class="prop-img-area" style="padding:0;height:auto"><div data-nestiq-slideshow data-photos="${enc}" style="width:100%"></div></div>`;
        }else{
          imgBlock=`<div class="prop-img-area"><span style="font-size:2.2rem">${icon}</span></div>`;
        }
        const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[]):'';
        return `<article class="prop-card nestiq-listing-card" style="cursor:pointer" onclick="nestiqOpenListingDetail(decodeURIComponent('${idEnc}'))" data-apply-id="${idEnc}" data-apply-name="${nameEnc}" data-apply-rent="${rent}" data-apply-bed="${beds}" data-apply-addr="${addrEnc}" data-apply-lease="${leaseEnc}" data-apply-landlord="${lidEnc}">
          ${imgBlock}
          <div class="prop-body">
            ${draft?'<div style="margin-bottom:8px"><span class="badge badge-amber" style="font-size:0.72rem">Not on public browse</span></div>':''}
            <div class="prop-card-name">${name}</div>
            <div class="prop-card-addr">📍 ${addr}${city?`, ${city}`:''}</div>
            <div class="prop-meta" style="margin-top:8px">
              <div><div class="prop-meta-val">R${rent.toLocaleString('en-ZA')}</div><div class="prop-meta-lbl">Monthly</div></div>
              <div><div class="prop-meta-val">${beds}</div><div class="prop-meta-lbl">Bedrooms</div></div>
            </div>
            ${amenitiesHtml}
            <div style="margin-top:12px"><button type="button" class="btn-gold btn-sm" style="width:100%;justify-content:center" onclick="event.stopPropagation();nestiqOpenApplyForListingFromCard(this)">Apply online</button></div>
          </div>
        </article>`;
      }).join('');
      if(typeof nestiqInitAllSlideshows==='function') nestiqInitAllSlideshows();
    }catch(e){
      console.error('Listings',e);
      const friendly=nestiqListingsQueryErrorMessage(e);
      if(errEl) errEl.textContent=friendly;
      grid.innerHTML=`<p style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">${esc(friendly)}</p>`;
    }
  }

  let __nestiqListingCache=[];

  async function nestiqOpenListingDetail(propertyId){
    const p=__nestiqListingCache.find(x=>String(x.id)===String(propertyId));
    if(!p) return;
    const galleryPhotos=typeof nestiqGetSlideshowPhotos==='function'?nestiqGetSlideshowPhotos(p):[];
    const galleryHtml=typeof nestiqDetailGalleryHtml==='function'?nestiqDetailGalleryHtml(p.id,galleryPhotos,{showEdit:false}):'';
    const amenitiesHtml=typeof nestiqAmenityChipsRowHtml==='function'?nestiqAmenityChipsRowHtml(typeof nestiqPropertyAmenities==='function'?nestiqPropertyAmenities(p):[]):'';
    const idEnc=encodeURIComponent(String(p.id));
    const mc=document.getElementById('modalContent');
    const ov=document.getElementById('modalOverlay');
    if(!mc||!ov) return;
    mc.innerHTML=`
      <h2 class="modal-title">${esc(p.name||'Rental')}</h2>
      <p class="modal-sub">📍 ${esc(p.addr||'')}</p>
      ${galleryHtml}
      ${amenitiesHtml?`<div style="margin-top:12px">${amenitiesHtml}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
        <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted)">MONTHLY RENT</div><div style="font-weight:700;color:var(--gold)">R${Number(p.rent||0).toLocaleString()}/mo</div></div>
        <div style="background:var(--paper);border-radius:9px;padding:12px;border:1px solid var(--border)"><div style="font-size:0.7rem;color:var(--muted)">BEDROOMS</div><div style="font-weight:600">${Number(p.bedrooms||0)}</div></div>
      </div>
      <button type="button" class="btn-gold btn-sm" style="width:100%;justify-content:center;margin-top:16px" onclick="nestiqOpenApplyForListing(decodeURIComponent('${idEnc}'),{name:'${esc(p.name||'').replace(/'/g,"\\'")}',rent:${Number(p.rent||0)},bedrooms:${Number(p.bedrooms||0)},addr:'${esc(p.addr||'').replace(/'/g,"\\'")}',leaseEnd:'${esc(p.leaseEnd||'').replace(/'/g,"\\'")}',landlordId:'${esc(p.landlordId||'').replace(/'/g,"\\'")}'})">Apply for this rental</button>`;
    ov.classList.add('open');
    if(typeof nestiqInitDetailGallery==='function') nestiqInitDetailGallery(galleryPhotos);
  }

  window.nestiqRenderListingsPage=nestiqRenderListingsPage;
  window.nestiqOpenApplyForListing=nestiqOpenApplyForListing;
  window.nestiqOpenApplyForListingFromCard=nestiqOpenApplyForListingFromCard;
  window.nestiqOpenListingDetail=nestiqOpenListingDetail;
})();
