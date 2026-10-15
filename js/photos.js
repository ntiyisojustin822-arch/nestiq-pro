function nestiqUsablePhotoSrc(v){
  if(v==null||v===false) return '';
  if(typeof v==='object'){
    v=v.url||v.downloadURL||v.photoUrl||v.photoURL||v.src||v.base64||v.imageUrl||'';
  }
  const s=String(v).trim().replace(/[\u200B-\u200D\uFEFF]/g,'');
  if(!s||s==='null'||s==='undefined'||s==='[object Object]') return '';
  if(/^https?:\/\//i.test(s)||s.startsWith('data:image/')||s.startsWith('blob:')) return s;
  return '';
}
window.nestiqUsablePhotoSrc=nestiqUsablePhotoSrc;

function nestiqPropertyPhotoImgError(img){
  if(!img) return;
  img.onerror=null;
  const area=img.closest('.prop-img-area, .nestiq-detail-main, .nestiq-slide, .listing-detail-hero');
  img.remove();
  if(!area) return;
  if(area.querySelector('img')) return;
  if(area.classList.contains('prop-img-area')){
    area.classList.add('prop-img-area--empty');
    if(!area.querySelector('.prop-photo-fallback')){
      const span=document.createElement('span');
      span.className='prop-photo-fallback';
      span.setAttribute('aria-hidden','true');
      span.textContent='🏠';
      area.appendChild(span);
    }
    return;
  }
  if(area.classList.contains('nestiq-detail-main')||area.classList.contains('listing-detail-hero')){
    area.classList.add('nestiq-detail-main--empty');
    if(!area.querySelector('.prop-photo-fallback')){
      const span=document.createElement('span');
      span.className='prop-photo-fallback';
      span.textContent='Photo unavailable';
      area.appendChild(span);
    }
  }
}
window.nestiqPropertyPhotoImgError=nestiqPropertyPhotoImgError;

let __newPropertyPhotoBase64='';
let __newMaintenancePhotoBase64='';
let __tenantMaintPhotoBase64='';
let __portalMaintPhotoBase64='';

function compressImage(file, maxWidth=800, quality=0.75, callback){
  if(typeof maxWidth==='function'){
    callback=maxWidth;
    maxWidth=800;
    quality=0.75;
  }else if(typeof quality==='function'){
    callback=quality;
    quality=0.75;
  }
  try{
    const reader=new FileReader();
    reader.onerror=()=>nestiqShowNotif('Failed to read image file','error');
    reader.onload=(e)=>{
      const img=new Image();
      img.onerror=()=>nestiqShowNotif('Invalid image file','error');
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        let w=img.width;
        let h=img.height;
        if(w>maxWidth){
          const ratio=maxWidth/w;
          w=Math.round(maxWidth);
          h=Math.round(h*ratio);
        }
        canvas.width=w;
        canvas.height=h;
        const ctx=canvas.getContext('2d');
        if(!ctx){ nestiqShowNotif('Image processing failed','error'); return; }
        ctx.drawImage(img,0,0,w,h);
        const base64=canvas.toDataURL('image/jpeg', quality);
        callback(base64);
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  }catch(_err){
    nestiqShowNotif('Image compression failed','error');
  }
}

function estimateBase64Size(base64){
  const raw=String(base64||'').split(',')[1]||'';
  const bytes=Math.ceil((raw.length*3)/4);
  return Math.round(bytes/1024);
}

/**
 * Value safe to store on a Firestore property as `photoUrl`:
 * normal Storage download URLs, or a small inline data URL fallback when upload fails.
 * (Large data URLs are rejected to avoid exceeding document size limits.)
 */
function nestiqPhotoUrlForFirestore(url){
  const s=String(url||'').trim();
  if(!s) return null;
  if(s.startsWith('https://') || s.startsWith('http://')) return s;
  if(s.startsWith('data:image/')){
    const kb=estimateBase64Size(s);
    if(kb>0 && kb<=550) return s;
  }
  return null;
}

async function nestiqMaybeUploadPhoto(storagePath,dataUrl){
  if(!dataUrl) return null;
  if(String(dataUrl).startsWith('http')) return dataUrl;
  if(window.nestiqUseFirestore && typeof window.uploadNestiqFile==='function'){
    try{
      return await window.uploadNestiqFile(storagePath,dataUrl,'image/jpeg');
    }catch(err){
      const code=err&&err.code;
      const msg=err&&err.message;
      console.warn('NestIQ Storage upload failed',code||'',msg||err);
      if(typeof nestiqShowNotif==='function'){
        const hint=code==='storage/unauthorized'
          ? 'Storage blocked this upload. Deploy updated storage.rules (property owner must match landlordId) or check Firebase Console → Storage → Rules.'
          : (msg||'Check the browser console for details.');
        nestiqShowNotif('Photo upload failed: '+hint,'error');
      }
    }
  }
  return dataUrl;
}

function checkStorageUsageWarn(){
  try{
    let total=0;
    for(const key in localStorage){
      const v=localStorage[key];
      if(typeof v==='string') total+=v.length;
    }
    if(total>4000000){
      nestiqShowNotif('Storage is getting full. Consider removing old photos to free up space.','warning');
    }
  }catch(_err){}
}

function isValidImageType(file){
  return ['image/jpeg','image/png','image/webp'].includes(String(file?.type||''));
}

function pickImageFile(accept='image/jpeg,image/png,image/webp', cb, maxBytes){
  const limit=Number.isFinite(Number(maxBytes))&&Number(maxBytes)>0?Number(maxBytes):(5*1024*1024);
  const input=document.createElement('input');
  input.type='file';
  input.accept=accept;
  input.onchange=()=>{
    const file=input.files?.[0];
    if(!file) return;
    if(!isValidImageType(file)){ nestiqShowNotif('Please choose a JPG, PNG, or WebP image','error'); return; }
    if(file.size>limit){
      const mb=Math.round(limit/1024/1024);
      nestiqShowNotif(`Image is larger than ${mb}MB. Please choose a smaller file.`,'error');
      return;
    }
    cb(file);
  };
  input.click();
}

function setUploadAreaLoading(targetId, txt='Compressing...'){
  const el=document.getElementById(targetId);
  if(!el) return;
  el.innerHTML=`<div style="font-size:0.82rem;color:var(--muted)">${txt}</div>`;
}

function uploadAreaHtml(opts){
  const h=opts.height||140;
  const click=opts.onClick||'';
  return `
    <div id="${opts.id}" class="photo-upload-area" onclick="${click}" style="height:${h}px;border-radius:14px;display:grid;place-items:center;text-align:center;padding:10px">
      <div>
        <div style="font-size:1.4rem">📷</div>
        <div style="font-size:0.85rem;font-weight:600">${opts.title||'Click to upload photo'}</div>
        <div style="font-size:0.74rem;color:var(--muted)">${opts.sub||'JPG, PNG or WebP - max 5MB'}</div>
      </div>
    </div>
  `;
}

function uploadPreviewHtml(opts){
  return `
    <div id="${opts.id}" style="position:relative;height:${opts.height||140}px;border-radius:14px;overflow:hidden;border:1px solid var(--border)">
      <img src="${opts.base64}" style="width:100%;height:100%;object-fit:cover;display:block" alt="Uploaded photo">
      <button class="btn-outline btn-sm" style="position:absolute;right:10px;bottom:10px;background:rgba(14,17,23,0.6);color:#fff;border-color:rgba(255,255,255,0.35)" onclick="${opts.changeClick}">Change Photo</button>
      ${opts.removeClick?`<button class="btn-outline btn-sm" style="position:absolute;left:10px;bottom:10px;background:rgba(196,106,58,0.8);color:#fff;border-color:transparent" onclick="${opts.removeClick}">Remove Photo</button>`:''}
    </div>
    <div style="font-size:0.74rem;color:var(--muted);margin-top:6px">Photo: ${opts.kb} KB</div>
  `;
}

function setPropertyUploadPreview(base64, holderId='newPropertyUploadWrap'){
  const wrap=document.getElementById(holderId);
  if(!wrap) return;
  const kb=estimateBase64Size(base64);
  if(kb>500) nestiqShowNotif('This image is large and may affect performance. Consider using a smaller photo.','warning');
  wrap.innerHTML=uploadPreviewHtml({
    id:'newPropPreview',
    base64,
    kb,
    height:140,
    changeClick:'event.stopPropagation();pickNewPropertyPhoto()'
  });
}

function pickNewPropertyPhoto(){
  pickImageFile('image/jpeg,image/png,image/webp',(file)=>{
    setUploadAreaLoading('newPropertyUploadWrap');
    // Slightly stronger compression so Storage/Firestore fallbacks stay reliable
    compressImage(file,1000,0.72,(b64)=>{
      __newPropertyPhotoBase64=b64;
      window.__newPropertyPhotoBase64=b64;
      setPropertyUploadPreview(b64);
    });
  }, 5*1024*1024);
}

function changePropertyPhoto(propertyId){
  pickImageFile('image/jpeg,image/png,image/webp',(file)=>{
    compressImage(file,800,0.75,async (b64)=>{
      let url=b64;
      if(typeof nestiqMaybeUploadPhoto==='function'){
        try{ url=await nestiqMaybeUploadPhoto(`properties/${propertyId}/photo.jpg`,b64); }catch(_e){}
      }
      propertyPhotos[String(propertyId)]=url;
      const p=propertiesData.find(x=>String(x.id)===String(propertyId));
      const persisted=typeof nestiqPhotoUrlForFirestore==='function'
        ? nestiqPhotoUrlForFirestore(url)
        : (String(url).startsWith('http') ? url : null);
      if(p){
        if(persisted) p.photoUrl=persisted;
        else delete p.photoUrl;
      }
      if(window.nestiqUseFirestore && window.nestiqDb && typeof firebase!=='undefined'){
        const lid=window.nestiqCurrentLandlordUid?.();
        if(lid){
          const ref=window.nestiqFs.properties(window.nestiqDb,lid).doc(String(propertyId));
          try{
            if(persisted) await ref.set({ photoUrl:persisted }, { merge:true });
            else await ref.update({ photoUrl: firebase.firestore.FieldValue.delete() }).catch(()=>{});
            if(p) await window.nestiqSyncPublicListingMirror?.(p);
          }catch(err){
            console.warn('NestIQ: property photo cloud sync', err);
          }
        }
      }
      if(!persisted && String(url).startsWith('data:')){
        nestiqShowNotif('Photo could not be saved to cloud storage. It may disappear after refresh until Storage upload works. Check Storage rules and deploy them.','warning');
      }
      saveData();
      renderProperties?.();
      if(window.currentPage==='listings') window.nestiqRenderListingsPage?.();
      nestiqShowNotif('Property photo updated','success');
      if(document.getElementById('modalOverlay')?.classList.contains('open')){
        viewProperty?.(propertyId);
      }
    });
  });
}

function removePropertyPhoto(propertyId){
  if(!confirm('Remove this property photo?')) return;
  delete propertyPhotos[String(propertyId)];
  const p=propertiesData.find(x=>String(x.id)===String(propertyId));
  if(p) delete p.photoUrl;
  if(window.nestiqUseFirestore && window.nestiqDb && typeof firebase!=='undefined' && firebase.firestore){
    const lid=window.nestiqCurrentLandlordUid?.();
    const ref=window.nestiqFs.properties(window.nestiqDb, lid).doc(String(propertyId));
    ref.update({ photoUrl: firebase.firestore.FieldValue.delete() }).catch(()=>{});
    if(p) window.nestiqSyncPublicListingMirror?.(p).catch(()=>{});
  }
  saveData();
  renderProperties?.();
  if(window.currentPage==='listings') window.nestiqRenderListingsPage?.();
  viewProperty?.(propertyId);
  nestiqShowNotif('Property photo removed','success');
}

function pickMaintenancePhoto(mode='landlord'){
  pickImageFile('image/jpeg,image/png,image/webp',(file)=>{
    const holderId=mode==='tenant'?'tenantMaintUploadWrap':mode==='portal'?'portalMaintUploadWrap':'maintUploadWrap';
    setUploadAreaLoading(holderId);
    compressImage(file,600,0.7,(b64)=>{
      const kb=estimateBase64Size(b64);
      if(kb>500) nestiqShowNotif('This image is large and may affect performance. Consider using a smaller photo.','warning');
      if(mode==='tenant') __tenantMaintPhotoBase64=b64;
      else if(mode==='portal') __portalMaintPhotoBase64=b64;
      else __newMaintenancePhotoBase64=b64;
      const wrap=document.getElementById(holderId);
      if(wrap){
        wrap.innerHTML=uploadPreviewHtml({
          id:`${mode}MaintPreview`,
          base64:b64,
          kb,
          height:100,
          changeClick:`event.stopPropagation();pickMaintenancePhoto('${mode}')`
        });
      }
    });
  });
}

function getPendingMaintenancePhoto(mode='landlord'){
  return mode==='tenant'?__tenantMaintPhotoBase64:mode==='portal'?__portalMaintPhotoBase64:__newMaintenancePhotoBase64;
}

function clearPendingMaintenancePhoto(mode='landlord'){
  if(mode==='tenant') __tenantMaintPhotoBase64='';
  else if(mode==='portal') __portalMaintPhotoBase64='';
  else __newMaintenancePhotoBase64='';
}

/* ─── Amenity definitions & slideshow ─── */
const NESTIQ_AMENITY_DEFS=[
  {id:'wifi',emoji:'📶',label:'WiFi'},
  {id:'fibre',emoji:'🛜',label:'Fibre ready'},
  {id:'parking',emoji:'🅿️',label:'Parking'},
  {id:'garage',emoji:'🚗',label:'Garage'},
  {id:'security',emoji:'🔒',label:'Security gate'},
  {id:'cctv',emoji:'📷',label:'CCTV'},
  {id:'pool',emoji:'🏊',label:'Swimming pool'},
  {id:'laundry',emoji:'🧺',label:'Laundry'},
  {id:'garden',emoji:'🌳',label:'Garden'},
  {id:'ac',emoji:'❄️',label:'Air conditioning'},
  {id:'fireplace',emoji:'🔥',label:'Fireplace'},
  {id:'pets',emoji:'🐾',label:'Pet friendly'},
  {id:'furnished',emoji:'🪑',label:'Furnished'},
  {id:'wheelchair',emoji:'♿',label:'Wheelchair accessible'},
  {id:'gym',emoji:'🏋️',label:'Gym'},
  {id:'cleaning',emoji:'🧹',label:'Cleaning included'}
];
const NESTIQ_PHOTO_CATEGORIES=['Exterior','Living room','Kitchen','Bedroom','Bathroom','Parking','Garden','Security','Other'];
const NESTIQ_AMENITY_BY_ID=Object.fromEntries(NESTIQ_AMENITY_DEFS.map(a=>[a.id,a]));

window.__nestiqSlideshows=window.__nestiqSlideshows||[];
window.__nestiqAmenityDrafts=window.__nestiqAmenityDrafts||{};
window.__nestiqAmenityNextId=window.__nestiqAmenityNextId||1;

function nestiqAmenityNextId(){
  return window.__nestiqAmenityNextId++;
}

function nestiqNormalizeAmenityPhotos(arr){
  if(!Array.isArray(arr)) return [];
  return arr.map((p,i)=>({
    id:p.id!=null?p.id:nestiqAmenityNextId(),
    base64:nestiqUsablePhotoSrc(p.base64||p.url||p.src||p.photoUrl),
    caption:String(p.caption||''),
    category:String(p.category||''),
    order:Number.isFinite(Number(p.order))?Number(p.order):i
  })).filter(p=>p.base64).sort((a,b)=>a.order-b.order);
}

function nestiqPropertyAmenities(p){
  if(Array.isArray(p?.amenities)&&p.amenities.length) return p.amenities;
  const legacy=[];
  if(p?.garage) legacy.push('garage');
  if(p?.garden) legacy.push('garden');
  if(p?.pool) legacy.push('pool');
  if(p?.petFriendly) legacy.push('pets');
  return legacy;
}

function nestiqGetSlideshowPhotos(p){
  const amenity=nestiqNormalizeAmenityPhotos(p?.amenityPhotos);
  const main=typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'';
  const out=[];
  const seen=new Set();
  const add=(src,caption)=>{
    const s=nestiqUsablePhotoSrc(src);
    if(!s||seen.has(s)) return;
    seen.add(s);
    out.push({base64:s,caption:String(caption||'')});
  };
  // Main property photo always comes first — amenity shots are extras, never replacements.
  if(main) add(main,'Main photo');
  amenity.forEach(a=>add(a.base64,a.caption));
  return out;
}

function nestiqEncodeSlideshowPhotos(photos){
  return encodeURIComponent(JSON.stringify((photos||[]).map(a=>({base64:a.base64,caption:a.caption||''}))));
}

function nestiqAmenityChipsRowHtml(amenityIds){
  const ids=Array.isArray(amenityIds)?amenityIds:[];
  if(!ids.length) return '';
  const labels=ids.map(id=>{
    const d=NESTIQ_AMENITY_BY_ID[id];
    return d?`${d.emoji} ${d.label}`:id;
  });
  const shown=ids.slice(0,5);
  const extra=ids.length-shown.length;
  const chips=shown.map(id=>{
    const d=NESTIQ_AMENITY_BY_ID[id];
    return `<span class="nestiq-amenity-chip" title="${d?d.label:id}">${d?d.emoji:'•'}</span>`;
  }).join('');
  const more=extra>0?`<span class="nestiq-amenity-more" style="font-size:0.72rem;color:var(--muted)">+${extra} more</span>`:'';
  const tip=labels.join(', ');
  return `<div class="nestiq-card-amenities" title="${tip.replace(/"/g,'&quot;')}" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:8px">${chips}${more}</div>`;
}

function nestiqDestroyAllSlideshows(){
  (window.__nestiqSlideshows||[]).forEach(s=>{ try{s.destroy();}catch(_e){} });
  window.__nestiqSlideshows=[];
}

function nestiqSafeCssBgUrl(u){
  return String(u||'').trim().replace(/'/g,'%27').replace(/[\r\n"]/g,'');
}

function nestiqPropImgAreaBgAttr(src){
  const u=nestiqUsablePhotoSrc(src);
  if(!u||!/^https?:\/\//i.test(u)) return '';
  return ` style="background-image:url('${nestiqSafeCssBgUrl(u)}')"`;
}

function nestiqPropCoverImgHtml(src){
  const u=nestiqUsablePhotoSrc(src);
  if(!u) return '';
  const enc=typeof nestiqEscAttr==='function'?nestiqEscAttr(u):String(u).replace(/"/g,'&quot;');
  return `<img class="prop-photo loaded" src="${enc}" alt="" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" onerror="nestiqPropertyPhotoImgError(this)">`;
}

function nestiqWarmPropertyPhotoUrls(list){
  const seen=Object.create(null);
  const add=raw=>{
    const u=nestiqUsablePhotoSrc(raw);
    if(!u||seen[u]||!/^https?:\/\//i.test(u)) return;
    seen[u]=1;
    const im=new Image();
    im.decoding='async';
    im.referrerPolicy='no-referrer';
    im.src=u;
  };
  (Array.isArray(list)?list:[]).forEach(p=>{
    add(typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):(p&&(p.photoUrl||p.photoURL)));
    nestiqGetSlideshowPhotos(p).slice(0,4).forEach(ph=>add(ph&&ph.base64));
  });
}
window.nestiqWarmPropertyPhotoUrls=nestiqWarmPropertyPhotoUrls;

function nestiqInitAllSlideshows(){
  nestiqDestroyAllSlideshows();
  const pending=window.__nestiqPendingSlideshows||{};
  document.querySelectorAll('[data-nestiq-slideshow]').forEach(el=>{
    let photos=[];
    const ssKey=el.getAttribute('data-ss-key');
    if(ssKey && Array.isArray(pending[ssKey]) && pending[ssKey].length){
      photos=pending[ssKey];
      el.__nestiqPhotos=photos;
    }else if(Array.isArray(el.__nestiqPhotos) && el.__nestiqPhotos.length){
      photos=el.__nestiqPhotos;
    }else{
      const raw=el.getAttribute('data-photos');
      try{ photos=JSON.parse(decodeURIComponent(raw||'%5B%5D')); }catch(_e){ photos=[]; }
    }
    if(!photos.length) return;
    const ss=new NestiqSlideshow(el,photos,{delay:8000, startOffset:(window.__nestiqSlideshows.length%6)*900});
    window.__nestiqSlideshows.push(ss);
  });
}

class NestiqSlideshow{
  constructor(container,photos,options={}){
    this.container=container;
    this.photos=photos||[];
    this.current=0;
    this.interval=null;
    this._offsetTimer=null;
    this.delay=Math.max(6500, Number(options.delay)||8000);
    this._startOffset=Math.max(0, Number(options.startOffset)||0);
    this.touchStartX=0;
    this.render();
    if(this.photos.length>1) this.startAuto();
    this._bindTouch();
    this._bindHover();
  }

  render(){
    const c=this.container;
    c.classList.add('nestiq-slideshow');
    c.innerHTML='';
    if(!this.photos.length){
      c.innerHTML='<span style="font-size:2.8rem">🏠</span>';
      return;
    }
    this.photos.forEach((ph,i)=>{
      const slide=document.createElement('div');
      slide.className='nestiq-slide'+(i===0?' active nestiq-slide-instant':'');
      const src=String(ph.base64||'').replace(/"/g,'&quot;');
      slide.innerHTML=`<img class="loaded" src="${src}" alt="${String(ph.caption||'').replace(/"/g,'&quot;')}" decoding="async" referrerpolicy="no-referrer" onerror="nestiqPropertyPhotoImgError(this)">${ph.caption?`<div class="nestiq-slide-caption">${ph.caption}</div>`:''}`;
      c.appendChild(slide);
    });
    requestAnimationFrame(()=>{
      c.querySelectorAll('.nestiq-slide-instant').forEach(el=>el.classList.remove('nestiq-slide-instant'));
      c.classList.add('nestiq-ss-ready');
    });
    if(this.photos.length>1){
      const prev=document.createElement('button');
      prev.type='button';
      prev.className='nestiq-slide-arrow prev';
      prev.innerHTML='‹';
      prev.setAttribute('aria-label','Previous photo');
      prev.onclick=(e)=>{ e.stopPropagation(); this.prev(true); };
      const next=document.createElement('button');
      next.type='button';
      next.className='nestiq-slide-arrow next';
      next.innerHTML='›';
      next.setAttribute('aria-label','Next photo');
      next.onclick=(e)=>{ e.stopPropagation(); this.next(true); };
      const dots=document.createElement('div');
      dots.className='nestiq-slide-dots';
      this.photos.forEach((_,i)=>{
        const dot=document.createElement('button');
        dot.type='button';
        dot.className='nestiq-slide-dot'+(i===0?' active':'');
        dot.setAttribute('aria-label','Photo '+(i+1));
        dot.onclick=(e)=>{ e.stopPropagation(); this.goTo(i, true); };
        dots.appendChild(dot);
      });
      c.appendChild(prev);
      c.appendChild(next);
      c.appendChild(dots);
    }
    c.onclick=(e)=>{
      if(e.target.closest('.nestiq-slide-arrow')||e.target.closest('.nestiq-slide-dot')) return;
      e.stopPropagation();
      nestiqOpenLightbox(this.photos,this.current);
    };
  }

  goTo(index, fromUser){
    if(!this.photos.length) return;
    const slides=this.container.querySelectorAll('.nestiq-slide');
    const dots=this.container.querySelectorAll('.nestiq-slide-dot');
    const next=((index%this.photos.length)+this.photos.length)%this.photos.length;
    if(next===this.current) return;
    slides[this.current]?.classList.remove('active');
    dots[this.current]?.classList.remove('active');
    this.current=next;
    slides[this.current]?.classList.add('active');
    dots[this.current]?.classList.add('active');
    if(fromUser) this.startAuto();
  }

  next(fromUser){ this.goTo(this.current+1, fromUser); }
  prev(fromUser){ this.goTo(this.current-1, fromUser); }

  startAuto(){
    this.stopAuto();
    if(this.photos.length<=1) return;
    const wait=this.delay+(this._startOffset||0);
    this._startOffset=0;
    this._offsetTimer=setTimeout(()=>{
      this._offsetTimer=null;
      this.next();
      this.interval=setInterval(()=>this.next(), this.delay);
    }, wait);
  }

  stopAuto(){
    if(this._offsetTimer){ clearTimeout(this._offsetTimer); this._offsetTimer=null; }
    clearInterval(this.interval);
    this.interval=null;
  }

  destroy(){ this.stopAuto(); if(this.container) this.container.innerHTML=''; }

  _bindTouch(){
    const container=this.container;
    container.addEventListener('touchstart',e=>{
      this.touchStartX=e.touches[0].clientX;
      this.stopAuto();
    },{passive:true});
    container.addEventListener('touchend',e=>{
      const diff=this.touchStartX-e.changedTouches[0].clientX;
      if(Math.abs(diff)>40) diff>0?this.next():this.prev();
      this.startAuto();
    },{passive:true});
  }

  _bindHover(){
    this.container.addEventListener('mouseenter',()=>this.stopAuto());
    this.container.addEventListener('mouseleave',()=>this.startAuto());
  }
}

function nestiqEnsureLightboxDom(){
  let lb=document.getElementById('nestiqLightbox');
  if(lb&&lb.querySelector('.nestiq-lightbox-close')) return lb;
  if(lb) lb.remove();
  lb=document.createElement('div');
  lb.id='nestiqLightbox';
  lb.className='nestiq-lightbox';
  lb.innerHTML=`
    <button type="button" class="nestiq-lightbox-close" aria-label="Close">&times;</button>
    <div class="nestiq-lightbox-counter"></div>
    <button type="button" class="nestiq-lightbox-nav prev" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.12);border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:1.4rem;cursor:pointer">‹</button>
    <img class="nestiq-lightbox-img" alt="">
    <div class="nestiq-lightbox-caption"></div>
    <div class="nestiq-lightbox-thumbs"></div>
    <button type="button" class="nestiq-lightbox-nav next" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.12);border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:1.4rem;cursor:pointer">›</button>`;
  document.body.appendChild(lb);
  lb.querySelector('.nestiq-lightbox-close').onclick=()=>nestiqCloseLightbox();
  lb.querySelector('.nestiq-lightbox-nav.prev').onclick=()=>nestiqLightboxNav(-1);
  lb.querySelector('.nestiq-lightbox-nav.next').onclick=()=>nestiqLightboxNav(1);
  lb.onclick=(e)=>{ if(e.target===lb) nestiqCloseLightbox(); };
  document.addEventListener('keydown',nestiqLightboxKeydown);
  return lb;
}

let __nestiqLightboxPhotos=[];
let __nestiqLightboxIndex=0;

function nestiqLightboxRender(){
  const lb=nestiqEnsureLightboxDom();
  const ph=__nestiqLightboxPhotos[__nestiqLightboxIndex];
  if(!ph) return;
  lb.querySelector('.nestiq-lightbox-img').src=ph.base64;
  lb.querySelector('.nestiq-lightbox-caption').textContent=ph.caption||'';
  lb.querySelector('.nestiq-lightbox-counter').textContent=`${__nestiqLightboxIndex+1} / ${__nestiqLightboxPhotos.length}`;
  const thumbs=lb.querySelector('.nestiq-lightbox-thumbs');
  thumbs.innerHTML=__nestiqLightboxPhotos.map((p,i)=>`<img class="nestiq-lightbox-thumb${i===__nestiqLightboxIndex?' active':''}" src="${p.base64}" alt="" data-idx="${i}">`).join('');
  thumbs.querySelectorAll('.nestiq-lightbox-thumb').forEach(t=>{
    t.onclick=()=>{ __nestiqLightboxIndex=Number(t.dataset.idx); nestiqLightboxRender(); };
  });
}

function nestiqOpenLightbox(photos,startIndex=0){
  __nestiqLightboxPhotos=photos||[];
  __nestiqLightboxIndex=Math.max(0,Math.min(startIndex,__nestiqLightboxPhotos.length-1));
  if(!__nestiqLightboxPhotos.length) return;
  const lb=nestiqEnsureLightboxDom();
  nestiqLightboxRender();
  requestAnimationFrame(()=>lb.classList.add('open'));
}

function nestiqCloseLightbox(){
  const lb=document.getElementById('nestiqLightbox');
  if(lb) lb.classList.remove('open');
}

function nestiqLightboxNav(dir){
  __nestiqLightboxIndex=(__nestiqLightboxIndex+dir+__nestiqLightboxPhotos.length)%__nestiqLightboxPhotos.length;
  nestiqLightboxRender();
}

function nestiqLightboxKeydown(e){
  const lb=document.getElementById('nestiqLightbox');
  if(!lb?.classList.contains('open')) return;
  if(e.key==='Escape') nestiqCloseLightbox();
  else if(e.key==='ArrowLeft') nestiqLightboxNav(-1);
  else if(e.key==='ArrowRight') nestiqLightboxNav(1);
}

function nestiqAmenityUploadSectionHtml(opts={}){
  const dropId=opts.dropId||'nestiqAmenityDrop';
  const gridId=opts.gridId||'nestiqAmenityGrid';
  const countId=opts.countId||'nestiqAmenityCount';
  const inputId=opts.inputId||'nestiqAmenityInput';
  const title=opts.title||'Property Photos';
  const sub=opts.sub||'General photos of the whole property. Optional category per photo.';
  const maxLabel=opts.maxLabel||'20';
  return `
    <div class="form-group" style="margin-top:14px">
      <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:4px">${title}</label>
      <p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">${sub}</p>
      <div id="${dropId}" class="nestiq-amenity-drop-zone" tabindex="0">Drag photos here or click to browse</div>
      <input type="file" id="${inputId}" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div id="${gridId}" class="nestiq-amenity-upload-grid"></div>
      <div id="${countId}" style="font-size:0.75rem;color:var(--muted);margin-top:8px">0 / ${maxLabel} photos added</div>
    </div>`;
}

function nestiqGetAmenityDraft(key){
  if(!window.__nestiqAmenityDrafts[key]) window.__nestiqAmenityDrafts[key]=[];
  return window.__nestiqAmenityDrafts[key];
}

function nestiqSetAmenityDraft(key,photos){
  window.__nestiqAmenityDrafts[key]=nestiqNormalizeAmenityPhotos(photos);
  return window.__nestiqAmenityDrafts[key];
}

function nestiqRenderAmenityGrid(key,gridId,countId){
  const photos=nestiqGetAmenityDraft(key);
  const grid=document.getElementById(gridId);
  const countEl=document.getElementById(countId);
  if(!grid) return;
  const catOpts=['<option value="">Category (optional)</option>'].concat((typeof NESTIQ_PHOTO_CATEGORIES!=='undefined'?NESTIQ_PHOTO_CATEGORIES:[]).map(c=>`<option value="${c}">${c}</option>`)).join('');
  grid.innerHTML=photos.map((p,i)=>`
    <div class="nestiq-amenity-thumb-wrap" draggable="true" data-amenity-id="${p.id}" data-order="${i}">
      <span class="nestiq-amenity-drag" style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.45);color:#fff;border-radius:4px;padding:0 4px;font-size:0.65rem;cursor:grab;z-index:2">⠿</span>
      <img src="${p.base64}" alt="">
      <input class="nestiq-amenity-thumb-caption" type="text" placeholder="Caption" value="${String(p.caption||'').replace(/"/g,'&quot;')}" data-amenity-id="${p.id}">
      <select class="nestiq-amenity-thumb-category form-input" data-amenity-id="${p.id}" style="font-size:0.72rem;padding:4px 6px;margin-top:4px">${catOpts}</select>
      <button type="button" class="nestiq-amenity-thumb-delete" data-amenity-id="${p.id}" aria-label="Remove">✕</button>
    </div>`).join('');
  if(countEl) countEl.textContent=`${photos.length} / 20 photos added`;
  grid.querySelectorAll('.nestiq-amenity-thumb-category').forEach(sel=>{
    const id=Number(sel.dataset.amenityId);
    const ph=photos.find(x=>x.id===id);
    if(ph&&ph.category) sel.value=ph.category;
    sel.onchange=()=>{ if(ph) ph.category=sel.value; };
  });
  grid.querySelectorAll('.nestiq-amenity-thumb-caption').forEach(inp=>{
    inp.oninput=()=>{
      const id=Number(inp.dataset.amenityId);
      const ph=photos.find(x=>x.id===id);
      if(ph) ph.caption=inp.value;
    };
  });
  grid.querySelectorAll('.nestiq-amenity-thumb-delete').forEach(btn=>{
    btn.onclick=(e)=>{
      e.stopPropagation();
      const id=Number(btn.dataset.amenityId);
      const next=photos.filter(x=>x.id!==id).map((x,j)=>({...x,order:j}));
      nestiqSetAmenityDraft(key,next);
      nestiqRenderAmenityGrid(key,gridId,countId);
    };
  });
  nestiqBindAmenityDragReorder(key,gridId,countId);
}

function nestiqBindAmenityDragReorder(key,gridId,countId){
  const grid=document.getElementById(gridId);
  if(!grid) return;
  let dragId=null;
  grid.querySelectorAll('.nestiq-amenity-thumb-wrap').forEach(wrap=>{
    wrap.ondragstart=e=>{ dragId=Number(wrap.dataset.amenityId); e.dataTransfer.effectAllowed='move'; };
    wrap.ondragover=e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; };
    wrap.ondrop=e=>{
      e.preventDefault();
      const targetId=Number(wrap.dataset.amenityId);
      if(dragId==null||dragId===targetId) return;
      const photos=[...nestiqGetAmenityDraft(key)];
      const from=photos.findIndex(x=>x.id===dragId);
      const to=photos.findIndex(x=>x.id===targetId);
      if(from<0||to<0) return;
      const [item]=photos.splice(from,1);
      photos.splice(to,0,item);
      nestiqSetAmenityDraft(key,photos.map((x,j)=>({...x,order:j})));
      nestiqRenderAmenityGrid(key,gridId,countId);
    };
  });
}

function nestiqInitAmenityDropZone(opts){
  const key=opts.key||'new';
  const dropId=opts.dropId||'nestiqAmenityDrop';
  const gridId=opts.gridId||'nestiqAmenityGrid';
  const countId=opts.countId||'nestiqAmenityCount';
  const inputId=opts.inputId||'nestiqAmenityInput';
  const maxPhotos=Number(opts.maxPhotos)||20;
  const drop=document.getElementById(dropId);
  const input=document.getElementById(inputId);
  if(!drop||!input) return;
  const openPicker=()=>input.click();
  drop.onclick=openPicker;
  drop.onkeydown=e=>{ if(e.key==='Enter'||e.key===' ') openPicker(); };
  drop.ondragover=e=>{ e.preventDefault(); drop.classList.add('drag-over'); };
  drop.ondragleave=()=>drop.classList.remove('drag-over');
  drop.ondrop=e=>{
    e.preventDefault();
    drop.classList.remove('drag-over');
    nestiqAddAmenityFiles(key,e.dataTransfer.files,gridId,countId,maxPhotos);
  };
  input.onchange=()=>{
    nestiqAddAmenityFiles(key,input.files,gridId,countId,maxPhotos);
    input.value='';
  };
  if(opts.initialPhotos) nestiqSetAmenityDraft(key,opts.initialPhotos);
  nestiqRenderAmenityGrid(key,gridId,countId);
}

function nestiqAddAmenityFiles(key,fileList,gridId,countId,maxPhotos=20){
  const files=Array.from(fileList||[]);
  if(!files.length) return;
  const photos=[...nestiqGetAmenityDraft(key)];
  const room=maxPhotos-photos.length;
  if(room<=0){ nestiqShowNotif(`Maximum ${maxPhotos} property photos`,'warning'); return; }
  let added=0;
  const processNext=(idx)=>{
    if(idx>=files.length||photos.length>=maxPhotos){
      nestiqSetAmenityDraft(key,photos);
      nestiqRenderAmenityGrid(key,gridId,countId);
      if(added) nestiqShowNotif(`${added} photo${added>1?'s':''} added`,'success');
      return;
    }
    const file=files[idx];
    if(!isValidImageType(file)){
      nestiqShowNotif(`${file.name}: use JPG, PNG, or WebP`,'warning');
      processNext(idx+1);
      return;
    }
    if(file.size>5*1024*1024){
      nestiqShowNotif(`${file.name} exceeds 5MB`,'warning');
      processNext(idx+1);
      return;
    }
    compressImage(file,900,0.78,(b64)=>{
      photos.push({id:nestiqAmenityNextId(),base64:b64,caption:'',category:'',order:photos.length});
      added++;
      processNext(idx+1);
    });
  };
  processNext(0);
}

async function nestiqPersistAmenityPhotos(propertyId, list){
  const photos=nestiqNormalizeAmenityPhotos(list);
  const mapped=await Promise.all(photos.map(async (a,i)=>{
    let src=String(a.base64||'').trim();
    if(src.startsWith('data:') && typeof nestiqMaybeUploadPhoto==='function'){
      try{
        const up=await nestiqMaybeUploadPhoto(`properties/${propertyId}/amenities/${a.id||i}.jpg`,src);
        if(up) src=up;
      }catch(_e){}
    }
    if(!src) return null;
    return {
      id:a.id!=null?a.id:nestiqAmenityNextId(),
      base64:src,
      caption:String(a.caption||''),
      category:String(a.category||''),
      order:Number.isFinite(Number(a.order))?Number(a.order):i
    };
  }));
  return mapped.filter(Boolean);
}
window.nestiqPersistAmenityPhotos=nestiqPersistAmenityPhotos;

function nestiqDetailGalleryHtml(propertyId,photos,opts={}){
  const showEdit=opts.showEdit!==false;
  const idArg=typeof nestiqPropIdClickArg==='function'?nestiqPropIdClickArg(propertyId):encodeURIComponent(String(propertyId));
  if(!photos.length){
    return `<div style="margin-top:16px;padding:24px;text-align:center;background:var(--paper);border-radius:14px;border:1px solid var(--border);color:var(--muted)">No photos yet</div>
      ${showEdit?`<button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="openEditPropertyModal(decodeURIComponent('${idArg}'),'photos')">Edit Photos</button>`:''}`;
  }
  const thumbs=photos.map((ph,i)=>`<img class="nestiq-detail-thumb${i===0?' active':''}" src="${typeof nestiqEscAttr==='function'?nestiqEscAttr(ph.base64):String(ph.base64).replace(/"/g,'&quot;')}" data-idx="${i}" alt="" onerror="nestiqPropertyPhotoImgError(this)">`).join('');
  return `
    <div class="nestiq-detail-gallery" style="margin-top:16px">
      <div style="font-weight:600;margin-bottom:8px;font-size:0.9rem">Photo Gallery</div>
      <div id="nestiqDetailMain" class="nestiq-detail-main">
        <img id="nestiqDetailMainImg" src="${typeof nestiqEscAttr==='function'?nestiqEscAttr(photos[0].base64):String(photos[0].base64).replace(/"/g,'&quot;')}" alt="" onerror="nestiqPropertyPhotoImgError(this)">
        <div id="nestiqDetailMainCap" class="nestiq-detail-main-cap">${photos[0].caption||''}</div>
      </div>
      <div id="nestiqDetailThumbs" class="nestiq-detail-thumbs">${thumbs}</div>
      ${showEdit?`<button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="openEditPropertyModal(decodeURIComponent('${idArg}'),'photos')">Edit Photos</button>`:''}
    </div>`;
}

function nestiqInitDetailGallery(photos){
  const mainImg=document.getElementById('nestiqDetailMainImg');
  const cap=document.getElementById('nestiqDetailMainCap');
  document.querySelectorAll('#nestiqDetailThumbs .nestiq-detail-thumb').forEach(th=>{
    th.onclick=()=>{
      const idx=Number(th.dataset.idx);
      const ph=photos[idx];
      if(!ph||!mainImg) return;
      mainImg.style.opacity='0';
      setTimeout(()=>{
        mainImg.src=ph.base64;
        if(cap) cap.textContent=ph.caption||'';
        mainImg.style.opacity='1';
      },180);
      document.querySelectorAll('#nestiqDetailThumbs .nestiq-detail-thumb').forEach(t=>t.classList.remove('active'));
      th.classList.add('active');
    };
  });
}

function nestiqPropertyCardImageHtml(p,idArg,badgeHtml=''){
  const gallery=nestiqGetSlideshowPhotos(p);
  const main=typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'';
  const icon=String(p?.icon||'🏠');
  const badge=badgeHtml||'';
  const camBtns=`<button class="prop-camera-btn" style="left:auto;right:12px" onclick="event.stopPropagation();changePropertyPhoto(decodeURIComponent('${idArg}'))" aria-label="Change photo">📷</button>
      <button class="prop-camera-btn" onclick="event.stopPropagation();openPropertyQrModal(decodeURIComponent('${idArg}'))" aria-label="Property QR code">🔳</button>`;
  const countHtml=gallery.length>1?`<div class="prop-photo-count">${gallery.length} photos</div>`:'';
  const cover=gallery[0]?.base64||main||'';
  const bg=nestiqPropImgAreaBgAttr(cover);
  const coverImg=nestiqPropCoverImgHtml(cover);
  // Prefer a slideshow only when there is more than one photo; keep main cover otherwise.
  if(gallery.length>1){
    const ssKey=`prop-ss-${idArg}`;
    window.__nestiqPendingSlideshows=window.__nestiqPendingSlideshows||{};
    window.__nestiqPendingSlideshows[ssKey]=gallery;
    return `<div class="prop-img-area"${bg}>${camBtns}${badge}${countHtml}${coverImg}<div data-nestiq-slideshow data-ss-key="${ssKey}"></div></div>`;
  }
  if(cover){
    return `<div class="prop-img-area"${bg}>${camBtns}${badge}${coverImg}</div>`;
  }
  return `<div class="prop-img-area">${icon}${camBtns}${badge}</div>`;
}

function openPhotoLightbox(base64, title='Photo', sub=''){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${title}</h2>
    <div style="margin-top:10px;display:flex;justify-content:center">
      <img src="${base64}" style="max-width:90vw;max-height:70vh;object-fit:contain;border-radius:12px;border:1px solid var(--border)" alt="${title}">
    </div>
    ${sub?`<div style="font-size:0.8rem;color:var(--muted);margin-top:8px;text-align:center">${sub}</div>`:''}
  `;
  nestiqOpenModalAnimated();
}

function openImageModal(base64, title='Photo'){
  openPhotoLightbox(base64,title);
}

window.compressImage=compressImage;
window.estimateBase64Size=estimateBase64Size;
window.checkStorageUsageWarn=checkStorageUsageWarn;
window.pickImageFile=pickImageFile;
window.uploadAreaHtml=uploadAreaHtml;
window.pickNewPropertyPhoto=pickNewPropertyPhoto;
window.nestiqPhotoUrlForFirestore=nestiqPhotoUrlForFirestore;
window.changePropertyPhoto=changePropertyPhoto;
window.removePropertyPhoto=removePropertyPhoto;
window.pickMaintenancePhoto=pickMaintenancePhoto;
window.getPendingMaintenancePhoto=getPendingMaintenancePhoto;
window.clearPendingMaintenancePhoto=clearPendingMaintenancePhoto;
window.openPhotoLightbox=openPhotoLightbox;
window.openImageModal=openImageModal;
window.nestiqMaybeUploadPhoto=nestiqMaybeUploadPhoto;
window.NestiqSlideshow=NestiqSlideshow;
window.nestiqOpenLightbox=nestiqOpenLightbox;
window.nestiqCloseLightbox=nestiqCloseLightbox;
window.nestiqInitAllSlideshows=nestiqInitAllSlideshows;
window.nestiqDestroyAllSlideshows=nestiqDestroyAllSlideshows;
window.nestiqPropImgAreaBgAttr=nestiqPropImgAreaBgAttr;
window.nestiqPropCoverImgHtml=nestiqPropCoverImgHtml;
window.nestiqWarmPropertyPhotoUrls=nestiqWarmPropertyPhotoUrls;
window.nestiqAmenityUploadSectionHtml=nestiqAmenityUploadSectionHtml;
window.nestiqInitAmenityDropZone=nestiqInitAmenityDropZone;
window.nestiqGetAmenityDraft=nestiqGetAmenityDraft;
window.nestiqSetAmenityDraft=nestiqSetAmenityDraft;
window.nestiqNormalizeAmenityPhotos=nestiqNormalizeAmenityPhotos;
window.nestiqGetSlideshowPhotos=nestiqGetSlideshowPhotos;
window.nestiqEncodeSlideshowPhotos=nestiqEncodeSlideshowPhotos;
window.nestiqPropertyAmenities=nestiqPropertyAmenities;
window.nestiqAmenityChipsRowHtml=nestiqAmenityChipsRowHtml;
window.nestiqDetailGalleryHtml=nestiqDetailGalleryHtml;
window.nestiqInitDetailGallery=nestiqInitDetailGallery;
window.nestiqPropertyCardImageHtml=nestiqPropertyCardImageHtml;
window.NESTIQ_AMENITY_DEFS=NESTIQ_AMENITY_DEFS;
