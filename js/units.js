/* NestIQ Pro — landlord-scoped units (landlords/{lid}/units)
 *
 * Unit document shape:
 *   { propertyId, label, bedrooms, bathrooms, rent, deposit,
 *     status: 'vacant'|'occupied'|'due'|'maintenance',
 *     tenantId, notes, order, createdAt, updatedAt }
 *
 * Additive fields (elsewhere):
 *   tenants.unitId (string|null) — alongside propertyId and free-text unit
 *   properties.numberOfUnits (number, default 1)
 *   properties.archived (boolean, default false)
 */

const __nestiqUnitTableStaggerSig={};

function nestiqStaggerUnitsTableBody(wrap, propertyId){
  if(!wrap || typeof nestiqStaggerChildren!=='function') return;
  const tbody=wrap.querySelector('tbody');
  if(!tbody || !tbody.children.length) return;
  const sig=tbody.innerHTML;
  const key=propertyId!=null?String(propertyId):'master';
  if(__nestiqUnitTableStaggerSig[key]===sig) return;
  __nestiqUnitTableStaggerSig[key]=sig;
  nestiqStaggerChildren(tbody, 45);
}

function nestiqUnitsList(){
  if(!Array.isArray(window.unitsData)) window.unitsData=[];
  if(typeof unitsData!=='undefined' && Array.isArray(unitsData) && unitsData!==window.unitsData){
    window.unitsData=unitsData;
  }
  return Array.isArray(unitsData)?unitsData:(window.unitsData||[]);
}

function nestiqReplaceUnits(rows){
  const arr=nestiqUnitsList();
  arr.length=0;
  (rows||[]).forEach(r=>{ if(r) arr.push(r); });
  window.unitsData=arr;
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  return arr;
}
window.nestiqReplaceUnits=nestiqReplaceUnits;

function nestiqUnitEsc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function nestiqUnitClickArg(id){
  return encodeURIComponent(String(id==null?'':id));
}

function nestiqUnitsForProperty(propertyId){
  const pid=String(propertyId??'');
  return nestiqUnitsList().filter(u=>String(u.propertyId)===pid);
}
window.nestiqUnitsForProperty=nestiqUnitsForProperty;

function nestiqUnitsCol(_propertyId){
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  if(!window.nestiqDb||!lid) return null;
  return window.nestiqFs?.units?.(window.nestiqDb,lid)||null;
}

function nestiqUnitFinite(v, fallback){
  const n=Number(v);
  return Number.isFinite(n)?n:(fallback??0);
}

function nestiqUnitDocId(id, propertyId){
  const raw=String(id??'').trim();
  if(raw && raw!=='undefined' && raw!=='null' && !raw.includes('/')) return raw;
  return `unit-${String(propertyId||'p')}-${Date.now()}`;
}

function nestiqUnitIsFirestoreSentinel(v){
  if(!v||typeof v!=='object') return false;
  if(typeof v.toMillis==='function'||typeof v.isEqual==='function') return true;
  const name=v.constructor&&v.constructor.name;
  return !!(name&&/FieldValue|Timestamp|GeoPoint|DocumentReference/.test(name));
}

function nestiqUnitTsForCloud(v, fallback){
  if(v==null||v==='') return fallback;
  if(typeof v==='string'||typeof v==='number') return v;
  if(nestiqUnitIsFirestoreSentinel(v)) return v;
  if(typeof v.seconds==='number') return v;
  return fallback;
}

let __nestiqUnitCloudErrAt=0;
function nestiqUnitCloudErrorMessage(err){
  const code=String(err?.code||'');
  const msg=String(err?.message||'');
  if(code==='permission-denied'||/permission/i.test(msg)){
    return 'Could not save unit — you need to be signed in as the landlord.';
  }
  if(code==='unauthenticated'||/signed in|unauth/i.test(msg)){
    return 'Could not save unit — sign in and try again.';
  }
  if(code==='invalid-argument'||/invalid data|undefined|NaN|Unsupported field/i.test(msg)){
    return 'Could not save unit — some fields were invalid. Check rent, occupancy and try again.';
  }
  return 'Could not save unit to the cloud';
}
function nestiqNotifyUnitCloudError(err){
  const now=Date.now();
  if(now-__nestiqUnitCloudErrAt<1800) return;
  __nestiqUnitCloudErrAt=now;
  nestiqShowNotif?.(nestiqUnitCloudErrorMessage(err),'error');
}

function nestiqUnitCloudPayload(row, propertyId, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  const lid=opts.landlordId
    || (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
  let serverTs=opts.serverTs;
  if(serverTs==null){
    try{
      if(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp){
        serverTs=firebase.firestore.FieldValue.serverTimestamp();
      }
    }catch(_e){}
    if(serverTs==null) serverTs=new Date().toISOString();
  }
  const payload={
    landlordId:lid?String(lid):null,
    propertyId:String(propertyId),
    label:String(row.label||row.unitNumber||'Main'),
    unitNumber:String(row.unitNumber||row.label||'Main'),
    unitType:String(row.unitType||''),
    bedrooms:nestiqUnitFinite(row.bedrooms,0),
    bathrooms:nestiqUnitFinite(row.bathrooms,0),
    rent:nestiqUnitFinite(row.rent,0),
    deposit:nestiqUnitFinite(row.deposit,0),
    maxOccupants:Math.min(50,Math.max(1,nestiqUnitFinite(row.maxOccupants,1))),
    status:String(row.status||'available'),
    tenantId:row.tenantId!=null&&row.tenantId!==''?row.tenantId:null,
    tenantName:row.tenantName?String(row.tenantName):null,
    notes:String(row.notes||''),
    description:String(row.description||row.notes||''),
    sizeSqm:Number.isFinite(Number(row.sizeSqm))?Number(row.sizeSqm):null,
    leaseStart:row.leaseStart||null,
    leaseEnd:row.leaseEnd||null,
    leaseId:row.leaseId||null,
    furnished:!!row.furnished,
    electricity:String(row.electricity||''),
    water:String(row.water||''),
    wifi:String(row.wifi||''),
    parkingSpace:String(row.parkingSpace||''),
    order:nestiqUnitFinite(row.order,0),
    createdAt:nestiqUnitTsForCloud(row.createdAt, serverTs),
    updatedAt:serverTs
  };
  Object.keys(payload).forEach(k=>{
    if(payload[k]===undefined) delete payload[k];
    if(typeof payload[k]==='number' && !Number.isFinite(payload[k])) delete payload[k];
  });
  return payload;
}
window.nestiqUnitCloudPayload=nestiqUnitCloudPayload;

function nestiqNormalizeUnit(u, propertyId){
  const pid=propertyId!=null&&propertyId!==''?propertyId:u?.propertyId;
  const statusRaw=String(u?.status||'available').toLowerCase();
  let status='available';
  if(statusRaw==='occupied') status='occupied';
  else if(statusRaw==='reserved') status='reserved';
  else if(statusRaw==='maintenance') status='maintenance';
  else if(statusRaw==='vacant'||statusRaw==='available'||statusRaw==='due') status=statusRaw==='due'?'available':'available';
  const label=String(u?.label||u?.unitNumber||u?.unit||'').trim()||'Main';
  return {
    id:u?.id!=null&&u.id!==''?u.id:`unit-${pid}-${Date.now()}`,
    propertyId:pid!=null?String(pid):pid,
    label,
    unitNumber:label,
    unitType:String(u?.unitType||'').trim(),
    bedrooms:Number(u?.bedrooms||0)||0,
    bathrooms:Number(u?.bathrooms||0)||0,
    rent:Number(u?.rent||0)||0,
    deposit:Number(u?.deposit||0)||0,
    maxOccupants:Math.min(50,Math.max(1,nestiqUnitFinite(u?.maxOccupants,1))),
    status,
    tenantId:u?.tenantId!=null&&u.tenantId!==''?u.tenantId:null,
    tenantName:u?.tenantName||null,
    notes:String(u?.notes||u?.description||''),
    description:String(u?.description||u?.notes||''),
    sizeSqm:Number.isFinite(Number(u?.sizeSqm))?Number(u.sizeSqm):null,
    furnished:u?.furnished===true||u?.furnished==='yes',
    electricity:String(u?.electricity||''),
    water:String(u?.water||''),
    wifi:String(u?.wifi||''),
    parkingSpace:String(u?.parkingSpace||''),
    unitPhotos:Array.isArray(u?.unitPhotos)?u.unitPhotos:[],
    order:Number.isFinite(Number(u?.order))?Number(u.order):0,
    leaseStart:u?.leaseStart||null,
    leaseEnd:u?.leaseEnd||null,
    leaseId:u?.leaseId||null,
    createdAt:u?.createdAt||null,
    updatedAt:u?.updatedAt||null
  };
}

async function getPropertyUnits(propertyId){
  const local=nestiqUnitsForProperty(propertyId).slice().sort((a,b)=>
    (Number(a.order)||0)-(Number(b.order)||0)
    || String(a.label||a.unitNumber||'').localeCompare(String(b.label||b.unitNumber||''),undefined,{numeric:true,sensitivity:'base'})
  );
  const col=nestiqUnitsCol(propertyId);
  if(!col) return local;
  try{
    const pid=String(propertyId);
    let snap;
    try{
      snap=await col.where('propertyId','==',pid).orderBy('order').get();
    }catch(_orderErr){
      try{
        snap=await col.where('propertyId','==',pid).get();
      }catch(_qe){
        snap=await col.get();
      }
    }
    const rows=snap.docs
      .map(doc=>{
        const d=doc.data()||{};
        return nestiqNormalizeUnit({ ...d, id:d.id!=null&&d.id!==''?d.id:doc.id }, propertyId);
      })
      .filter(u=>String(u.propertyId)===pid);
    const others=nestiqUnitsList().filter(u=>String(u.propertyId)!==pid);
    nestiqReplaceUnits(others.concat(rows));
    return rows.sort((a,b)=>
      (Number(a.order)||0)-(Number(b.order)||0)
      || String(a.label||a.unitNumber||'').localeCompare(String(b.label||b.unitNumber||''),undefined,{numeric:true,sensitivity:'base'})
    );
  }catch(err){
    console.warn('NestIQ: getPropertyUnits',err);
    return local;
  }
}
window.getPropertyUnits=getPropertyUnits;

function nestiqPrepareUnitRow(propertyId, unit){
  const pid=String(propertyId??'');
  const row=nestiqNormalizeUnit(unit, pid);
  row.id=nestiqUnitDocId(row.id, pid);
  const nowIso=new Date().toISOString();
  row.updatedAt=nowIso;
  if(row.createdAt && typeof row.createdAt.toDate==='function'){
    try{ row.createdAt=row.createdAt.toDate().toISOString(); }catch(_e){}
  }
  if(!row.createdAt || (nestiqUnitIsFirestoreSentinel(row.createdAt) && typeof row.createdAt.toMillis!=='function')){
    row.createdAt=nowIso;
  }
  row.leaseId=unit?.leaseId||row.leaseId||null;
  row.propertyId=pid;
  return row;
}

function nestiqUpsertLocalUnitRow(row, pid){
  const arr=nestiqUnitsList();
  const idx=arr.findIndex(u=>String(u.id)===String(row.id)&&String(u.propertyId)===pid);
  if(idx>=0) arr[idx]={ ...arr[idx], ...row };
  else arr.push(row);
  window.unitsData=arr;
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
}

async function nestiqCommitUnitsToCloud(propertyId, rows){
  const pid=String(propertyId||'');
  const list=(rows||[]).filter(Boolean);
  if(!list.length) return;
  const col=nestiqUnitsCol(pid);
  if(!col){
    saveData?.();
    return;
  }
  const authUid=typeof firebase!=='undefined'?firebase.auth?.()?.currentUser?.uid:null;
  if(!authUid){
    const err=new Error('unauthenticated');
    err.code='unauthenticated';
    throw err;
  }
  const landlordId=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():authUid;
  const db=window.nestiqDb;
  const canBatch=db && typeof db.batch==='function';
  try{
    if(canBatch){
      const CHUNK=400;
      for(let i=0;i<list.length;i+=CHUNK){
        const batch=db.batch();
        const slice=list.slice(i,i+CHUNK);
        slice.forEach(row=>{
          const payload=nestiqUnitCloudPayload(row, pid, { landlordId });
          batch.set(col.doc(String(row.id)), payload, { merge:true });
        });
        await batch.commit();
      }
    }else{
      for(const row of list){
        const payload=nestiqUnitCloudPayload(row, pid, { landlordId });
        await col.doc(String(row.id)).set(payload,{ merge:true });
      }
    }
  }catch(err){
    console.error('NestIQ: commit units',err);
    nestiqNotifyUnitCloudError(err);
    const wrapped=new Error(nestiqUnitCloudErrorMessage(err));
    wrapped.cause=err;
    wrapped.nestiqUnitCloud=true;
    throw wrapped;
  }
}

async function nestiqSaveUnitsBatch(propertyId, units, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  const pid=String(propertyId??'');
  const prepared=(units||[]).map(u=>nestiqPrepareUnitRow(pid, u));
  prepared.forEach(row=>nestiqUpsertLocalUnitRow(row, pid));
  await nestiqCommitUnitsToCloud(pid, prepared);
  if(!opts.skipListingMirror){
    try{
      const p=(typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[])
        .find(x=>String(x.id)===pid);
      if(p && typeof window.nestiqSyncPublicListingMirror==='function'){
        window.nestiqSyncPublicListingMirror(p);
      }
    }catch(_e){}
  }
  return prepared;
}
window.nestiqSaveUnitsBatch=nestiqSaveUnitsBatch;

async function saveUnit(propertyId, unit, opts){
  const rows=await nestiqSaveUnitsBatch(propertyId, [unit], opts);
  return rows[0];
}
window.saveUnit=saveUnit;

async function nestiqSyncPropertyUnits(propertyId, totalUnits, prefix, propertyRent){
  const pid=propertyId;
  const p=(typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[]).find(x=>String(x.id)===String(pid));
  const target=Math.max(0,Math.round(Number(totalUnits)||0));
  if(!pid||target<1) return [];
  const pre=String(prefix||p?.unitPrefix||'Unit');
  const rent=Number(propertyRent!=null?propertyRent:p?.rent)||0;
  const existing=await getPropertyUnits(pid);
  const currentCount=existing.length;
  if(target<=currentCount) return existing;
  for(let i=currentCount+1;i<=target;i++){
    const unitNum=`${pre}${String(i).padStart(2,'0')}`;
    await saveUnit(pid,{
      id:`unit-${pid}-${i}`,
      propertyId:pid,
      unitNumber:unitNum,
      tenantId:null,
      tenantName:null,
      rent,
      status:'vacant',
      leaseStart:null,
      leaseEnd:null,
      notes:''
    });
  }
  return getPropertyUnits(pid);
}
window.nestiqSyncPropertyUnits=nestiqSyncPropertyUnits;

async function nestiqGenerateUnitsForProperty(propertyId, opts={}){
  const pid=String(propertyId||'');
  const count=Math.max(1,Math.min(200,Math.round(Number(opts.count)||1)));
  const prefix=String(opts.prefix||'A');
  const start=Math.max(0,Math.round(Number(opts.startNumber!=null?opts.startNumber:1)));
  const status=String(opts.status||'available');
  const existing=nestiqUnitsForProperty(pid);
  if(existing.length>=count) return existing.slice(0,count);
  const created=[];
  for(let i=existing.length;i<count;i++){
    const num=start+i;
    const label=`${prefix}${String(num).padStart(2,'0')}`;
    created.push({
      id:`unit-${pid}-${i+1}`,
      propertyId:pid,
      label,
      unitNumber:label,
      bedrooms:Number(opts.bedrooms||0)||0,
      bathrooms:Number(opts.bathrooms||0)||0,
      rent:Number(opts.rent||0)||0,
      deposit:Number(opts.deposit||0)||0,
      maxOccupants:Number(opts.maxOccupants||2)||2,
      status,
      order:i
    });
  }
  if(created.length){
    await nestiqSaveUnitsBatch(pid, created, { skipListingMirror:true });
  }
  return nestiqUnitsForProperty(pid).slice(0,count);
}
window.nestiqGenerateUnitsForProperty=nestiqGenerateUnitsForProperty;

function nestiqUnitIsAvailable(u){
  const st=String(u?.status||'').toLowerCase();
  return st==='available'||st==='vacant'||st==='due'||st==='';
}

function nestiqVacantUnitCardBodyHtml(u, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  const esc=typeof nestiqUnitEsc==='function'?nestiqUnitEsc:(s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'));
  const rent=Number(u?.rent||opts.rent||0);
  const beds=Number(u?.bedrooms||0);
  const baths=Number(u?.bathrooms||0);
  const dep=Number(u?.deposit||0);
  const label=String(u?.label||u?.unitNumber||'Unit');
  const avail=String(u?.availableFrom||'').trim();
  const meta=[];
  if(beds) meta.push(beds+' bed'+(beds===1?'':'s'));
  if(baths) meta.push(baths+' bath'+(baths===1?'':'s'));
  if(dep>0) meta.push('Deposit R'+dep.toLocaleString('en-ZA'));
  if(avail && !/^available$/i.test(avail)) meta.push(avail);
  return `<div class="nq-unit-card-top">
      <span class="nq-unit-pill">Vacant</span>
      <span class="nq-unit-tick" aria-hidden="true"></span>
    </div>
    <div class="nq-unit-name">${esc(label)}</div>
    <div class="nq-unit-rent">R${rent.toLocaleString('en-ZA')}<span>/ month</span></div>
    ${meta.length?`<div class="nq-unit-meta">${meta.map(m=>`<span>${esc(m)}</span>`).join('')}</div>`:''}`;
}
window.nestiqVacantUnitCardBodyHtml=nestiqVacantUnitCardBodyHtml;

/** Units a prospective tenant may apply for — vacant, unassigned, not reserved. */
function nestiqUnitIsOpenForApplication(u){
  if(!u||typeof u!=='object') return false;
  if(u.synthetic) return false;
  if(u.tenantId!=null && String(u.tenantId).trim()!=='') return false;
  const st=String(u.status||'vacant').toLowerCase();
  if(st==='occupied'||st==='reserved'||st==='maintenance'||st==='due') return false;
  return st===''||st==='available'||st==='vacant';
}
window.nestiqUnitIsOpenForApplication=nestiqUnitIsOpenForApplication;

function nestiqSlimListingUnit(u, property){
  const rent=Number(u?.rent||property?.rent||0)||0;
  const dep=Number(u?.deposit||0)||rent;
  return {
    id:String(u?.id||''),
    label:String(u?.label||u?.unitNumber||'Unit'),
    bedrooms:Number(u?.bedrooms||property?.bedrooms||0)||0,
    bathrooms:Number(u?.bathrooms||0)||0,
    rent,
    deposit:dep,
    availableFrom:String(u?.availableFrom||u?.leaseEnd||property?.leaseEnd||'Available')
  };
}

/** Vacant units for a public listing. Never includes occupied/reserved units. */
function nestiqPreferListingUnitList(primary, secondary){
  const usable=list=>{
    if(!Array.isArray(list)) return null;
    const rows=list.filter(u=>u && (String(u.id||'').trim()||String(u.label||u.unitNumber||'').trim()));
    return rows.length?list:null;
  };
  return usable(primary)||usable(secondary)||null;
}

function nestiqDedupeListingUnits(list){
  const seen=new Set();
  const out=[];
  (list||[]).forEach(u=>{
    if(!u) return;
    const key=String(u.id||'').trim()+'|'+String(u.label||u.unitNumber||'').trim().toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push(u);
  });
  return out;
}

function nestiqListingUnitMatches(u, id, label){
  if(!u) return false;
  const want=String(id||'').trim();
  const uid=String(u.id||'').trim();
  if(want && uid && want===uid) return true;
  const lab=String(label||'').trim().toLowerCase();
  const have=String(u.label||u.unitNumber||'').trim().toLowerCase();
  return !!(lab && have && lab===have);
}

function nestiqListingAvailableUnits(p){
  if(!p) return [];
  const pid=String(p.id||'');
  let allLive=[];
  try{ allLive=nestiqUnitsForProperty(pid); }catch(_e){ allLive=[]; }
  const openLive=(allLive||[]).filter(nestiqUnitIsOpenForApplication).map(u=>nestiqSlimListingUnit(u,p));
  const mirrored=Array.isArray(p.availableUnits)?p.availableUnits.filter(u=>u&&nestiqUnitIsOpenForApplication({
    ...u,
    status:u.status||'vacant',
    tenantId:u.tenantId||null
  })).map(u=>nestiqSlimListingUnit(u,p)):[];
  const combined=nestiqDedupeListingUnits(openLive.concat(mirrored));
  if(combined.length) return combined;
  if((allLive||[]).length>0) return [];

  const propSt=String(p.status||'').toLowerCase();
  if(propSt==='occupied') return [];
  return [{
    id:'',
    label:String(p.unit||p.unitNumber||'Main'),
    bedrooms:Number(p.bedrooms||0)||0,
    bathrooms:Number(p.bathrooms||0)||0,
    rent:Number(p.rent||0)||0,
    deposit:Number(p.deposit||p.rent||0)||0,
    availableFrom:String(p.leaseEnd||'Available'),
    synthetic:true
  }];
}
window.nestiqPreferListingUnitList=nestiqPreferListingUnitList;
window.nestiqListingUnitMatches=nestiqListingUnitMatches;
window.nestiqSlimListingUnit=nestiqSlimListingUnit;
window.nestiqListingAvailableUnits=nestiqListingAvailableUnits;

function nestiqApplyListingStatsFromUnits(property){
  if(!property||typeof property!=='object') return property;
  const units=nestiqUnitsForProperty(property.id);
  if(!units.length) return property;
  const avail=units.filter(u=>typeof nestiqUnitIsOpenForApplication==='function'?nestiqUnitIsOpenForApplication(u):nestiqUnitIsAvailable(u));
  const source=avail.length?avail:units;
  const rents=source.map(u=>Number(u.rent||0)).filter(n=>n>0);
  if(rents.length){
    property.rentMin=Math.min(...rents);
    property.rentMax=Math.max(...rents);
    property.rent=property.rentMin;
  }
  const beds=source.map(u=>Number(u.bedrooms||0)).filter(n=>n>0);
  if(beds.length) property.bedrooms=Math.min(...beds);
  const baths=source.map(u=>Number(u.bathrooms||0)).filter(n=>n>0);
  if(baths.length) property.bathrooms=Math.min(...baths);
  const deps=source.map(u=>Number(u.deposit||0)).filter(n=>n>0);
  if(deps.length && !(Number(property.deposit)>0)) property.deposit=Math.min(...deps);
  return property;
}

function nestiqPropertyRentRange(propertyOrId){
  const p=typeof propertyOrId==='object'&&propertyOrId
    ? propertyOrId
    : (typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[]).find(x=>String(x.id)===String(propertyOrId));
  const units=p?nestiqUnitsForProperty(p.id):[];
  const rents=units.map(u=>Number(u.rent||0)).filter(n=>n>0);
  if(rents.length){
    const min=Math.min(...rents);
    const max=Math.max(...rents);
    return { min, max, label: min===max
      ? `Starting from R${min.toLocaleString('en-ZA')}/month`
      : `R${min.toLocaleString('en-ZA')} – R${max.toLocaleString('en-ZA')}/month` };
  }
  if(p&&Number(p.rentMin)>0){
    const min=Number(p.rentMin), max=Number(p.rentMax||p.rentMin);
    return { min, max, label: min===max
      ? `Starting from R${min.toLocaleString('en-ZA')}/month`
      : `R${min.toLocaleString('en-ZA')} – R${max.toLocaleString('en-ZA')}/month` };
  }
  // Legacy single property.rent
  const legacy=Number(p?.rent||0);
  if(legacy>0){
    return { min:legacy, max:legacy, label:`Starting from R${legacy.toLocaleString('en-ZA')}/month` };
  }
  return { min:0, max:0, label:'Rent on request' };
}
window.nestiqUnitIsAvailable=nestiqUnitIsAvailable;
window.nestiqApplyListingStatsFromUnits=nestiqApplyListingStatsFromUnits;
window.nestiqPropertyRentRange=nestiqPropertyRentRange;

/** Public listing location — suburb-level + rounded coords when showExactLocation is false */
function nestiqPublicLocationForListing(p){
  const exact=p?.showExactLocation!==false && p?.showExactLocation!=='false';
  const suburb=String(p?.suburb||'').trim();
  const city=String(p?.city||'').trim();
  const province=String(p?.province||'').trim();
  let displayAddr;
  if(exact){
    displayAddr=String(p?.addr||[p?.street,suburb,city,province,p?.postalCode].filter(Boolean).join(', ')||'');
  }else{
    displayAddr=[suburb||null, city||null, province||null].filter(Boolean).join(', ')
      || String(p?.city||p?.addr||'Area available on enquiry');
  }
  let lat=Number(p?.lat), lng=Number(p?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){ lat=null; lng=null; }
  else if(!exact){
    lat=Math.round(lat*10)/10; // ~1 decimal ≈ suburb-scale
    lng=Math.round(lng*10)/10;
  }
  return { displayAddr, city, lat, lng, exact };
}
window.nestiqPublicLocationForListing=nestiqPublicLocationForListing;

function nestiqUnitTenantDisplayName(u){
  if(u?.tenantName) return String(u.tenantName);
  if(u?.tenantId==null||u.tenantId==='') return null;
  const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  const t=list.find(x=>String(x.id)===String(u.tenantId));
  return t?.name?String(t.name):null;
}

function nestiqUnitStatusBadge(status){
  const st=String(status||'available').toLowerCase();
  if(st==='occupied') return { cls:'badge-green', label:'Occupied' };
  if(st==='reserved') return { cls:'badge-amber', label:'Reserved' };
  if(st==='maintenance') return { cls:'badge-amber', label:'Maintenance' };
  if(st==='due') return { cls:'badge-amber', label:'Due' };
  return { cls:'badge-red', label: st==='vacant'?'Vacant':'Available' };
}

function nestiqRenderUnitsTable(propertyId){
  const units=nestiqUnitsForProperty(propertyId)
    .slice()
    .sort((a,b)=>
      (Number(a.order)||0)-(Number(b.order)||0)
      || String(a.label||a.unitNumber||'').localeCompare(String(b.label||b.unitNumber||''),undefined,{numeric:true,sensitivity:'base'})
    );

  const pidArg=nestiqUnitClickArg(propertyId);
  const p=(typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[])
    .find(x=>String(x.id)===String(propertyId));
  const defaultBeds=Number(p?.bedrooms||0)||0;
  const defaultBaths=Number(p?.bathrooms||0)||0;
  const defaultRent=Number(p?.rent||0)||0;
  const defaultDeposit=Number(p?.deposit||0)||0;

  const rows=units.length?units.map(u=>{
    const tenantName=nestiqUnitTenantDisplayName(u);
    const { cls, label }=nestiqUnitStatusBadge(u.status);
    const uidArg=nestiqUnitClickArg(u.id);
    const openJs=`nestiqOpenEditUnitModal(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))`;
    return `
    <tr class="nestiq-unit-row" role="button" tabindex="0" title="Edit unit"
      onclick="${openJs}"
      onkeydown="nestiqUnitRowKeydown(event,decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">
      <td><strong>${nestiqUnitEsc(u.label||u.unitNumber||'Unit')}</strong></td>
      <td>${tenantName?nestiqUnitEsc(tenantName):'<span style="color:var(--muted)">—</span>'}</td>
      <td>R${Number(u.rent||0).toLocaleString('en-ZA')}</td>
      <td><span class="badge ${cls}">${label}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button type="button" class="btn-outline btn-sm" onclick="event.stopPropagation();${openJs}">Edit</button>
      </td>
    </tr>`;
  }).join(''):`<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No units yet</td></tr>`;

  const occ=units.filter(u=>String(u.status||'').toLowerCase()==='occupied').length;
  const rents=units.map(u=>Number(u.rent||0));
  const sharedRent=units.length && rents.every(r=>r===rents[0]) && rents[0]>0 ? rents[0] : '';
  const deps=units.map(u=>Number(u.deposit||0));
  const sharedDeposit=units.length && deps.every(d=>d===deps[0]) && deps[0]>0 ? deps[0] : '';
  const samePriceBar=units.length>=2?`
    <div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--paper);margin-bottom:12px">
      <div style="font-weight:700;margin-bottom:4px">Same rent for all rooms</div>
      <p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">These rooms share one price. Enter it once and apply to every unit.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
        <div class="form-group" style="margin:0;flex:1;min-width:120px">
          <label style="font-size:0.72rem;color:var(--muted)">Monthly rent (R)</label>
          <input class="form-input" id="samePriceRent" type="number" min="0" step="1" value="${sharedRent}" placeholder="e.g. 3500">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:120px">
          <label style="font-size:0.72rem;color:var(--muted)">Deposit (R)</label>
          <input class="form-input" id="samePriceDeposit" type="number" min="0" step="1" value="${sharedDeposit}" placeholder="Usually 1 month">
        </div>
        <button type="button" class="btn-gold btn-sm" id="samePriceApplyBtn" onclick="nestiqApplySamePriceToAllUnits(decodeURIComponent('${pidArg}'))">Apply to all rooms</button>
      </div>
    </div>`:'';
  const html=`
    <div id="nestiqPropertyUnitsWrap" data-property-id="${nestiqUnitEsc(String(propertyId))}" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="font-size:0.95rem;font-weight:700;margin:0">
          Units${units.length?` — ${occ} of ${units.length} occupied`:''}
        </h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${units.length?`<button type="button" class="btn-outline btn-sm" onclick="nestiqOpenBulkEditUnits(decodeURIComponent('${pidArg}'))">Edit units</button>`:''}
          <button type="button" class="btn-gold btn-sm" onclick="nestiqToggleAddUnitForm(decodeURIComponent('${pidArg}'))">+ Add Unit</button>
        </div>
      </div>
      ${samePriceBar}
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--card-bg)">
        <table class="nestiq-table" style="width:100%;margin:0">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Rent</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="nestiqAddUnitForm" style="display:none;margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--paper)">
        <div style="font-weight:700;font-size:0.88rem;margin-bottom:10px">New unit</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group" style="grid-column:1/-1;margin:0">
            <label style="font-size:0.78rem;font-weight:600">Name / label</label>
            <input class="form-input" id="addUnitLabel" type="text" placeholder="e.g. Unit 2" maxlength="80">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.78rem;font-weight:600">Bedrooms</label>
            <input class="form-input" id="addUnitBeds" type="number" min="0" step="1" value="${defaultBeds}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.78rem;font-weight:600">Bathrooms</label>
            <input class="form-input" id="addUnitBaths" type="number" min="0" step="0.5" value="${defaultBaths}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.78rem;font-weight:600">Rent (R)</label>
            <input class="form-input" id="addUnitRent" type="number" min="0" step="1" value="${defaultRent}">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.78rem;font-weight:600">Deposit (R)</label>
            <input class="form-input" id="addUnitDeposit" type="number" min="0" step="1" value="${defaultDeposit}">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button type="button" class="btn-gold btn-sm" onclick="nestiqSubmitAddUnit(decodeURIComponent('${pidArg}'))">Create unit</button>
          <button type="button" class="btn-outline btn-sm" onclick="nestiqToggleAddUnitForm(decodeURIComponent('${pidArg}'), true)">Cancel</button>
        </div>
      </div>
    </div>`;
  queueMicrotask(()=>{
    const wrap=document.getElementById('nestiqPropertyUnitsWrap');
    if(wrap && String(wrap.dataset.propertyId)===String(propertyId)) nestiqStaggerUnitsTableBody(wrap, propertyId);
  });
  return html;
}
window.nestiqRenderUnitsTable=nestiqRenderUnitsTable;

function nestiqToggleAddUnitForm(propertyId, forceHide){
  const form=document.getElementById('nestiqAddUnitForm');
  if(!form) return;
  if(forceHide){ form.style.display='none'; return; }
  const show=form.style.display==='none'||!form.style.display;
  form.style.display=show?'block':'none';
  if(show) setTimeout(()=>document.getElementById('addUnitLabel')?.focus(),40);
}
window.nestiqToggleAddUnitForm=nestiqToggleAddUnitForm;

async function nestiqSubmitAddUnit(propertyId){
  const pid=String(propertyId??'');
  if(!pid) return;
  const label=String(document.getElementById('addUnitLabel')?.value||'').trim();
  const beds=Number(document.getElementById('addUnitBeds')?.value);
  const baths=Number(document.getElementById('addUnitBaths')?.value);
  const rent=Number(document.getElementById('addUnitRent')?.value);
  const deposit=Number(document.getElementById('addUnitDeposit')?.value);
  if(!label){
    nestiqShowNotif?.('Enter a unit name / label','warning');
    document.getElementById('addUnitLabel')?.focus();
    return;
  }
  const existing=nestiqUnitsForProperty(pid);
  const nextOrder=existing.reduce((m,u)=>Math.max(m, Number(u.order)||0), -1)+1;
  const newId=`unit-${pid}-${Date.now()}`;
  try{
    await saveUnit(pid,{
      id:newId,
      propertyId:pid,
      label,
      bedrooms:Number.isFinite(beds)?beds:0,
      bathrooms:Number.isFinite(baths)?baths:0,
      rent:Number.isFinite(rent)?rent:0,
      deposit:Number.isFinite(deposit)?deposit:0,
      status:'vacant',
      tenantId:null,
      notes:'',
      order:nextOrder
    });
    const p=(typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[])
      .find(x=>String(x.id)===pid);
    if(p){
      p.numberOfUnits=nestiqUnitsForProperty(pid).length;
      const db=window.nestiqDb;
      const lid=window.nestiqFs?.resolveLandlordId?.();
      const pref=window.nestiqFs?.properties?.(db, lid);
      if(pref){
        pref.doc(pid).set({ numberOfUnits:p.numberOfUnits },{ merge:true }).catch(()=>{});
      }
    }
    const wrap=document.getElementById('nestiqPropertyUnitsWrap');
    if(wrap) wrap.outerHTML=nestiqRenderUnitsTable(pid);
    renderProperties?.();
    nestiqShowNotif?.('Unit added','success');
  }catch(err){
    console.warn('[NestIQ] nestiqSubmitAddUnit', err);
    if(!err?.nestiqUnitCloud) nestiqShowNotif?.('Could not create unit','error');
  }
}
window.nestiqSubmitAddUnit=nestiqSubmitAddUnit;

function nestiqUnitRowKeydown(ev, unitId, propertyId){
  if(!ev) return;
  if(ev.key==='Enter'||ev.key===' '){
    ev.preventDefault();
    nestiqOpenEditUnitModal(unitId, propertyId);
  }
}
window.nestiqUnitRowKeydown=nestiqUnitRowKeydown;

function nestiqSetUnitModalWidth(mode){
  const modal=document.querySelector('#modalOverlay .modal');
  if(!modal) return;
  modal.classList.remove('modal-wide','modal-xwide','nestiq-prop-sheet-modal','nestiq-form-modal');
  modal.style.height='';
  modal.style.maxHeight='';
  modal.style.overflow='';
  modal.style.transform='';
  if(mode==='wide'||mode==='xwide'){
    modal.classList.add('nestiq-form-modal');
    modal.classList.add(mode==='xwide'?'modal-xwide':'modal-wide');
  }
}

function nestiqUnitStatusOptionsHtml(selected){
  const opts=[['available','Available'],['occupied','Occupied'],['reserved','Reserved'],['maintenance','Maintenance']];
  const sel=String(selected||'available').toLowerCase();
  const norm=sel==='vacant'||sel==='due'?'available':sel;
  return opts.map(([v,l])=>`<option value="${v}" ${norm===v?'selected':''}>${l}</option>`).join('');
}

function nestiqFindLocalProperty(propertyId){
  const lists=[];
  try{ if(typeof propertiesData!=='undefined'&&Array.isArray(propertiesData)) lists.push(propertiesData); }catch(_e){}
  if(Array.isArray(window.propertiesData) && window.propertiesData!==lists[0]) lists.push(window.propertiesData);
  for(const list of lists){
    const hit=list.find(x=>String(x.id)===String(propertyId));
    if(hit) return hit;
  }
  return null;
}

async function nestiqPersistPropertyUnitRollup(propertyId){
  const p=nestiqFindLocalProperty(propertyId);
  if(!p) return;
  try{ nestiqApplyListingStatsFromUnits?.(p); }catch(_e){}
  const units=nestiqUnitsForProperty(propertyId);
  p.numberOfUnits=units.length;
  p.totalUnits=units.length;
  const db=window.nestiqDb;
  const lid=typeof window.nestiqFs?.resolveLandlordId==='function'
    ? window.nestiqFs.resolveLandlordId()
    : (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
  const pref=window.nestiqFs?.properties?.(db, lid);
  const patch={
    numberOfUnits:p.numberOfUnits,
    totalUnits:p.totalUnits,
    rent:Number(p.rent||0)||0,
    rentMin:p.rentMin!=null?p.rentMin:null,
    rentMax:p.rentMax!=null?p.rentMax:null,
    bedrooms:Number(p.bedrooms||0)||0,
    bathrooms:Number(p.bathrooms||0)||0,
    deposit:Number(p.deposit||0)||0
  };
  if(pref){
    try{
      let serverTs=new Date().toISOString();
      try{
        if(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp){
          serverTs=firebase.firestore.FieldValue.serverTimestamp();
        }
      }catch(_e){}
      await pref.doc(String(propertyId)).set({ ...patch, updatedAt:serverTs },{ merge:true });
    }catch(err){
      console.warn('[NestIQ] persist unit rollup', err);
    }
  }else{
    saveData?.();
  }
  try{ window.nestiqSyncPublicListingMirror?.(p); }catch(_e){}
}

async function nestiqSyncTenantRentFromUnit(unit){
  if(!unit) return;
  const rent=Number(unit.rent||0);
  const deposit=Number(unit.deposit||0);
  if(!Number.isFinite(rent)||rent<0) return;
  const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  const unitLabel=String(unit.label||unit.unitNumber||'').trim().toLowerCase();
  const pid=String(unit.propertyId||'');
  let tid=unit.tenantId!=null&&String(unit.tenantId).trim()!==''?String(unit.tenantId):'';
  let t=tid?list.find(x=>String(x.id)===tid):null;
  if(!t){
    t=list.find(x=>String(x.unitId||'')===String(unit.id)
      || (pid && unitLabel && String(x.propertyId)===pid && String(x.unit||x.unitNumber||'').trim().toLowerCase()===unitLabel))||null;
    if(t) tid=String(t.id);
  }
  if(!tid) return;
  if(t){
    t.rent=rent;
    if(Number.isFinite(deposit)){
      if(t.deposit&&typeof t.deposit==='object') t.deposit={...t.deposit, amount:deposit};
      else t.deposit=deposit;
    }
  }
  try{
    const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
    if(window.nestiqUseFirestore&&window.nestiqDb&&window.nestiqFs?.tenants&&lid){
      const tenantPatch={ rent };
      if(Number.isFinite(deposit)){
        tenantPatch.depositAmount=deposit;
        if(t?.deposit&&typeof t.deposit==='object') tenantPatch.deposit=t.deposit;
      }
      await window.nestiqFs.tenants(window.nestiqDb,lid).doc(tid).set(tenantPatch,{ merge:true });
    }else{
      saveData?.();
    }
  }catch(err){
    console.warn('[NestIQ] sync tenant rent from unit', err);
  }
  try{
    const lease=(t&&typeof window.nestiqPayableLeaseForTenant==='function'&&window.nestiqPayableLeaseForTenant(t))
      || (typeof window.nestiqPrimaryLeaseForTenant==='function'&&window.nestiqPrimaryLeaseForTenant(tid))
      || null;
    if(lease&&typeof window.nestiqPersistLease==='function'){
      await window.nestiqPersistLease(lease,{
        rent,
        deposit:Number.isFinite(deposit)&&deposit>=0?deposit:lease.deposit
      });
    }
  }catch(err){
    console.warn('[NestIQ] sync lease rent from unit', err);
  }
}

function nestiqReturnToProperty(propertyId){
  nestiqSetUnitModalWidth(null);
  viewProperty?.(propertyId);
}

function nestiqUnitsShareSameRent(propertyId){
  const units=nestiqUnitsForProperty(propertyId);
  if(units.length<2) return true;
  const first=Number(units[0].rent||0);
  return units.every(u=>Number(u.rent||0)===first);
}

async function nestiqApplySharedPricingToUnits(propertyId, patch){
  const pid=String(propertyId??'');
  const rent=Number(patch?.rent||0)||0;
  const deposit=Number(patch?.deposit||0)||0;
  const units=nestiqUnitsForProperty(pid);
  for(const u of units){
    const saved=await saveUnit(pid,{
      ...u,
      rent,
      deposit
    });
    await nestiqSyncTenantRentFromUnit(saved);
  }
  await nestiqPersistPropertyUnitRollup(pid);
}

async function nestiqApplySamePriceToAllUnits(propertyId){
  const pid=String(propertyId??'');
  const rent=Number(document.getElementById('samePriceRent')?.value);
  let deposit=Number(document.getElementById('samePriceDeposit')?.value);
  if(!Number.isFinite(rent)||rent<=0){
    nestiqShowNotif?.('Enter a monthly rent to apply to all rooms','warning');
    document.getElementById('samePriceRent')?.focus();
    return;
  }
  if(!Number.isFinite(deposit)||deposit<=0) deposit=rent;
  const btn=nestiqBtnFromEvent?.()||document.getElementById('samePriceApplyBtn');
  nestiqSetBtnLoading?.(btn,true,'Applying...');
  try{
    await nestiqApplySharedPricingToUnits(pid,{ rent, deposit });
    renderProperties?.();
    nestiqShowNotif?.(`R${rent.toLocaleString('en-ZA')} applied to all rooms`,'success');
    nestiqReturnToProperty(pid);
  }catch(err){
    console.warn('[NestIQ] apply same price', err);
    nestiqShowNotif?.('Could not update room prices','error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}
window.nestiqApplySamePriceToAllUnits=nestiqApplySamePriceToAllUnits;

function nestiqOpenEditUnitModal(unitId, propertyId){
  const pid=String(propertyId??'');
  const uid=String(unitId??'');
  const unit=nestiqUnitsList().find(u=>String(u.id)===uid&&String(u.propertyId)===pid);
  if(!unit){
    nestiqShowNotif?.('Unit not found','error');
    return;
  }
  const p=nestiqFindLocalProperty(pid);
  const uidArg=nestiqUnitClickArg(uid);
  const pidArg=nestiqUnitClickArg(pid);
  const tenantName=nestiqUnitTenantDisplayName(unit);
  const canDelete=!(unit.tenantId!=null&&String(unit.tenantId).trim()!=='');
  const modalEl=document.getElementById('modalContent');
  if(!modalEl) return;
  modalEl.innerHTML=`
    <div class="nestiq-form-modal-body">
      <h2 class="modal-title">Edit unit</h2>
      <p class="modal-sub">${nestiqUnitEsc(p?.name||'Property')} · ${nestiqUnitEsc(unit.label||unit.unitNumber||'Unit')}</p>
      ${tenantName?`<p class="nestiq-form-meta">Tenant: ${nestiqUnitEsc(tenantName)}</p>`:''}
      <div class="nestiq-form-grid">
        <div class="form-group nestiq-form-span">
          <label>Unit number / label</label>
          <input class="form-input" id="editUnitLabel" type="text" maxlength="80" value="${nestiqUnitEsc(unit.label||unit.unitNumber||'')}">
        </div>
        <div class="form-group nestiq-form-span">
          <label>Unit type</label>
          <input class="form-input" id="editUnitType" type="text" placeholder="e.g. 2 Bedroom" value="${nestiqUnitEsc(unit.unitType||'')}">
        </div>
        <div class="form-group">
          <label>Bedrooms</label>
          <input class="form-input" id="editUnitBeds" type="number" min="0" step="1" value="${Number(unit.bedrooms||0)}">
        </div>
        <div class="form-group">
          <label>Bathrooms</label>
          <input class="form-input" id="editUnitBaths" type="number" min="0" step="0.5" value="${Number(unit.bathrooms||0)}">
        </div>
        <div class="form-group">
          <label>Monthly rent (R)</label>
          <input class="form-input" id="editUnitRent" type="number" min="0" step="1" value="${Number(unit.rent||0)}">
        </div>
        <div class="form-group">
          <label>Deposit (R)</label>
          <input class="form-input" id="editUnitDeposit" type="number" min="0" step="1" value="${Number(unit.deposit||0)}">
        </div>
        <div class="form-group">
          <label>Max occupants</label>
          <input class="form-input" id="editUnitMaxOcc" type="number" min="1" step="1" value="${Number(unit.maxOccupants||1)||1}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select class="form-input" id="editUnitStatus">${nestiqUnitStatusOptionsHtml(unit.status)}</select>
        </div>
        <div class="form-group nestiq-form-span">
          <label>Notes</label>
          <textarea class="form-input" id="editUnitNotes" rows="2">${nestiqUnitEsc(unit.notes||unit.description||'')}</textarea>
        </div>
        ${nestiqUnitsForProperty(pid).length>1?`<label class="nestiq-apply-all">
          <input type="checkbox" id="editUnitApplyAll" ${nestiqUnitsShareSameRent(pid)?'checked':''}>
          <span>Apply this rent and deposit to all rooms on this property</span>
        </label>`:''}
      </div>
    </div>
    <div class="nestiq-form-modal-footer">
      <button type="button" class="btn-primary" onclick="nestiqSaveEditedUnit(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">Save unit</button>
      ${canDelete&&!tenantName?`<button type="button" class="btn-gold btn-sm" onclick="nestiqAssignTenantToUnit(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">Assign tenant</button>`:''}
      <button type="button" class="btn-outline" onclick="nestiqReturnToProperty(decodeURIComponent('${pidArg}'))">Back</button>
      ${canDelete?`<button type="button" class="btn-outline nestiq-form-danger" onclick="nestiqDeleteUnit(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">Delete unit</button>`:''}
    </div>`;
  nestiqSetUnitModalWidth('wide');
  nestiqOpenModalAnimated?.();
  setTimeout(()=>document.getElementById('editUnitRent')?.focus(),40);
}
window.nestiqOpenEditUnitModal=nestiqOpenEditUnitModal;

async function nestiqSaveEditedUnit(unitId, propertyId){
  const pid=String(propertyId??'');
  const uid=String(unitId??'');
  const unit=nestiqUnitsList().find(u=>String(u.id)===uid&&String(u.propertyId)===pid);
  if(!unit){ nestiqShowNotif?.('Unit not found','error'); return; }
  const label=String(document.getElementById('editUnitLabel')?.value||'').trim();
  if(!label){
    nestiqShowNotif?.('Enter a unit name / label','warning');
    document.getElementById('editUnitLabel')?.focus();
    return;
  }
  const rent=Number(document.getElementById('editUnitRent')?.value);
  const deposit=Number(document.getElementById('editUnitDeposit')?.value);
  const beds=Number(document.getElementById('editUnitBeds')?.value);
  const baths=Number(document.getElementById('editUnitBaths')?.value);
  const maxOcc=Number(document.getElementById('editUnitMaxOcc')?.value);
  const unitType=String(document.getElementById('editUnitType')?.value||'').trim();
  const status=String(document.getElementById('editUnitStatus')?.value||'available');
  const notes=String(document.getElementById('editUnitNotes')?.value||'');
  const btn=nestiqBtnFromEvent?.()||document.querySelector('#modalContent .btn-primary');
  nestiqSetBtnLoading?.(btn,true,'Saving...');
  try{
    const saved=await saveUnit(pid,{
      ...unit,
      label,
      unitNumber:label,
      unitType,
      bedrooms:Number.isFinite(beds)?beds:0,
      bathrooms:Number.isFinite(baths)?baths:0,
      rent:Number.isFinite(rent)?rent:0,
      deposit:Number.isFinite(deposit)?deposit:0,
      maxOccupants:Math.max(1,Number.isFinite(maxOcc)?maxOcc:1),
      status,
      notes
    });
    await nestiqSyncTenantRentFromUnit(saved);
    const applyAll=!!document.getElementById('editUnitApplyAll')?.checked;
    if(applyAll){
      await nestiqApplySharedPricingToUnits(pid,{
        rent:Number.isFinite(rent)?rent:0,
        deposit:Number.isFinite(deposit)?deposit:0
      });
      nestiqShowNotif?.('Rent applied to all rooms','success');
    }else{
      await nestiqPersistPropertyUnitRollup(pid);
      nestiqShowNotif?.('Unit updated','success');
    }
    renderProperties?.();
    nestiqReturnToProperty(pid);
  }catch(err){
    console.warn('[NestIQ] nestiqSaveEditedUnit', err);
    if(!err?.nestiqUnitCloud) nestiqShowNotif?.('Could not save unit','error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}
window.nestiqSaveEditedUnit=nestiqSaveEditedUnit;

async function nestiqDeleteUnit(unitId, propertyId){
  const pid=String(propertyId??'');
  const uid=String(unitId??'');
  const unit=nestiqUnitsList().find(u=>String(u.id)===uid&&String(u.propertyId)===pid);
  if(!unit){ nestiqShowNotif?.('Unit not found','error'); return; }
  if(unit.tenantId!=null&&String(unit.tenantId).trim()!==''){
    nestiqShowNotif?.('Move the tenant out before deleting this unit','warning');
    return;
  }
  if(!confirm(`Delete unit ${unit.label||unit.unitNumber||''}? This cannot be undone.`)) return;
  const arr=nestiqUnitsList();
  const idx=arr.findIndex(u=>String(u.id)===uid&&String(u.propertyId)===pid);
  if(idx>=0) arr.splice(idx,1);
  window.unitsData=arr;
  try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  const col=nestiqUnitsCol(pid);
  if(col){
    try{ await col.doc(uid).delete(); }
    catch(err){
      console.warn('[NestIQ] delete unit', err);
      nestiqShowNotif?.('Could not delete unit from the cloud','error');
      return;
    }
  }else{
    saveData?.();
  }
  await nestiqPersistPropertyUnitRollup(pid);
  renderProperties?.();
  nestiqShowNotif?.('Unit deleted','success');
  nestiqReturnToProperty(pid);
}
window.nestiqDeleteUnit=nestiqDeleteUnit;

function nestiqOpenBulkEditUnits(propertyId){
  const pid=String(propertyId??'');
  const p=nestiqFindLocalProperty(pid);
  const units=nestiqUnitsForProperty(pid)
    .slice()
    .sort((a,b)=>
      (Number(a.order)||0)-(Number(b.order)||0)
      || String(a.label||a.unitNumber||'').localeCompare(String(b.label||b.unitNumber||''),undefined,{numeric:true,sensitivity:'base'})
    );
  if(!units.length){
    nestiqShowNotif?.('No units to edit','warning');
    return;
  }
  const pidArg=nestiqUnitClickArg(pid);
  const rows=units.map(u=>{
    const id=nestiqUnitEsc(String(u.id));
    return `<tr data-unit-id="${id}">
      <td><input class="form-input" data-field="label" value="${nestiqUnitEsc(u.label||u.unitNumber||'')}" style="min-width:72px"></td>
      <td><input class="form-input" data-field="unitType" value="${nestiqUnitEsc(u.unitType||'')}" placeholder="e.g. 2 Bedroom" style="min-width:110px"></td>
      <td><input class="form-input" data-field="bedrooms" type="number" min="0" value="${Number(u.bedrooms||0)}" style="width:70px"></td>
      <td><input class="form-input" data-field="bathrooms" type="number" min="0" step="0.5" value="${Number(u.bathrooms||0)}" style="width:70px"></td>
      <td><input class="form-input" data-field="rent" type="number" min="0" value="${Number(u.rent||0)}" style="width:90px"></td>
      <td><input class="form-input" data-field="deposit" type="number" min="0" value="${Number(u.deposit||0)}" style="width:90px"></td>
      <td><input class="form-input" data-field="maxOccupants" type="number" min="1" value="${Number(u.maxOccupants||2)}" style="width:70px"></td>
      <td><select class="form-input" data-field="status" style="min-width:110px">${nestiqUnitStatusOptionsHtml(u.status)}</select></td>
    </tr>`;
  }).join('');
  const modalEl=document.getElementById('modalContent');
  if(!modalEl) return;
  modalEl.innerHTML=`
    <div class="nestiq-form-modal-body">
      <h2 class="modal-title">Edit units</h2>
      <p class="modal-sub">${nestiqUnitEsc(p?.name||'Property')} · ${units.length} unit(s). Set rent and details, then save.</p>
      <div class="nestiq-bulk-defaults">
        <div class="nestiq-bulk-defaults-title">Apply same details to all units</div>
        <div class="nestiq-form-grid nestiq-form-grid-3">
          <div class="form-group"><label>Unit type</label><input class="form-input" id="bulk_edit_unit_type" placeholder="2 Bedroom Apartment"></div>
          <div class="form-group"><label>Bedrooms</label><input class="form-input" id="bulk_edit_beds" type="number" min="0" value=""></div>
          <div class="form-group"><label>Bathrooms</label><input class="form-input" id="bulk_edit_baths" type="number" min="0" step="0.5" value=""></div>
          <div class="form-group"><label>Rent (R)</label><input class="form-input" id="bulk_edit_rent" type="number" min="0" value=""></div>
          <div class="form-group"><label>Deposit (R)</label><input class="form-input" id="bulk_edit_deposit" type="number" min="0" value=""></div>
          <div class="form-group"><label>Max occupants</label><input class="form-input" id="bulk_edit_occ" type="number" min="1" value=""></div>
        </div>
        <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="nestiqBulkApplyExistingUnitDefaults()">Apply to all</button>
      </div>
      <div class="nestiq-bulk-table-wrap">
        <table class="nestiq-table" id="nestiqBulkEditUnitsTable">
          <thead><tr>
            <th>Unit</th><th>Type</th><th>Beds</th><th>Baths</th><th>Rent</th><th>Deposit</th><th>Max occ.</th><th>Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="nestiq-form-modal-footer">
      <button type="button" class="btn-outline" onclick="nestiqReturnToProperty(decodeURIComponent('${pidArg}'))">Cancel</button>
      <button type="button" class="btn-primary" onclick="nestiqSaveBulkEditedUnits(decodeURIComponent('${pidArg}'))">Save units</button>
    </div>`;
    nestiqSetUnitModalWidth('xwide');
  nestiqOpenModalAnimated?.();
  const bulkBody=document.querySelector('#nestiqBulkEditUnitsTable tbody');
  if(bulkBody && typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(bulkBody, 45);
  setTimeout(()=>document.getElementById('bulk_edit_rent')?.focus(),40);
}
window.nestiqOpenBulkEditUnits=nestiqOpenBulkEditUnits;

function nestiqBulkApplyExistingUnitDefaults(){
  const unitType=document.getElementById('bulk_edit_unit_type')?.value||'';
  const beds=document.getElementById('bulk_edit_beds')?.value;
  const baths=document.getElementById('bulk_edit_baths')?.value;
  const rent=document.getElementById('bulk_edit_rent')?.value;
  const deposit=document.getElementById('bulk_edit_deposit')?.value;
  const occ=document.getElementById('bulk_edit_occ')?.value;
  let applied=0;
  document.querySelectorAll('#nestiqBulkEditUnitsTable tbody tr').forEach(tr=>{
    const set=(field,val)=>{ const el=tr.querySelector(`[data-field="${field}"]`); if(el) el.value=val; };
    if(unitType) set('unitType',unitType);
    if(beds!==''&&beds!=null) set('bedrooms',beds);
    if(baths!==''&&baths!=null) set('bathrooms',baths);
    if(rent!==''&&rent!=null) set('rent',rent);
    if(deposit!==''&&deposit!=null) set('deposit',deposit);
    if(occ!==''&&occ!=null) set('maxOccupants',occ);
    applied++;
  });
  nestiqShowNotif?.(applied?`Defaults applied to ${applied} unit(s)`:'Nothing to apply','success');
}
window.nestiqBulkApplyExistingUnitDefaults=nestiqBulkApplyExistingUnitDefaults;

async function nestiqSaveBulkEditedUnits(propertyId){
  const pid=String(propertyId??'');
  const rows=Array.from(document.querySelectorAll('#nestiqBulkEditUnitsTable tbody tr[data-unit-id]'));
  if(!rows.length){ nestiqShowNotif?.('No units to save','warning'); return; }
  const btn=nestiqBtnFromEvent?.()||document.querySelector('#modalContent .btn-primary');
  nestiqSetBtnLoading?.(btn,true,'Saving...');
  try{
    for(const tr of rows){
      const id=tr.getAttribute('data-unit-id');
      const get=f=>tr.querySelector(`[data-field="${f}"]`)?.value;
      const label=String(get('label')||'').trim();
      if(!label) throw new Error('Each unit needs a unit number/label');
      const existing=nestiqUnitsList().find(u=>String(u.id)===String(id)&&String(u.propertyId)===pid)||{ id, propertyId:pid };
      const rent=Number(get('rent')||0);
      const beds=Number(get('bedrooms')||0);
      const baths=Number(get('bathrooms')||0);
      const deposit=Number(get('deposit')||0);
      const maxOccupants=Math.max(1,Number(get('maxOccupants')||1));
      const unitType=String(get('unitType')||'').trim();
      const status=get('status')||'available';
      const saved=await saveUnit(pid,{
        ...existing,
        label,
        unitNumber:label,
        unitType,
        bedrooms:Number.isFinite(beds)?beds:0,
        bathrooms:Number.isFinite(baths)?baths:0,
        rent:Number.isFinite(rent)?rent:0,
        deposit:Number.isFinite(deposit)?deposit:0,
        maxOccupants,
        status
      });
      await nestiqSyncTenantRentFromUnit(saved);
    }
    await nestiqPersistPropertyUnitRollup(pid);
    renderProperties?.();
    nestiqShowNotif?.('Units updated','success');
    nestiqReturnToProperty(pid);
  }catch(err){
    console.warn('[NestIQ] nestiqSaveBulkEditedUnits', err);
    if(!err?.nestiqUnitCloud) nestiqShowNotif?.(err?.message||'Could not save units','error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}
window.nestiqSaveBulkEditedUnits=nestiqSaveBulkEditedUnits;

function nestiqUnassignedTenantsForProperty(propertyId){
  const pid=String(propertyId??'');
  const assigned=new Set(
    nestiqUnitsForProperty(pid)
      .filter(u=>u.tenantId!=null&&u.tenantId!=='')
      .map(u=>String(u.tenantId))
  );
  const list=Array.isArray(tenantsData)?tenantsData:(window.tenantsData||[]);
  return list.filter(t=>{
    if(!t||t.status==='vacant') return false;
    const p=(propertiesData||[]).find(x=>String(x.id)===pid);
    const match=String(t.propertyId??'')===pid || (p&&t.property===p.name);
    if(!match) return false;
    if(!t.unitId) return true;
    return !assigned.has(String(t.id));
  });
}

function nestiqAssignTenantToUnit(unitId, propertyId){
  const unit=nestiqUnitsList().find(u=>String(u.id)===String(unitId)&&String(u.propertyId)===String(propertyId));
  if(!unit){ nestiqShowNotif?.('Unit not found','error'); return; }
  const p=(propertiesData||[]).find(x=>String(x.id)===String(propertyId));
  const tenants=nestiqUnassignedTenantsForProperty(propertyId);
  const opts=tenants.length
    ? tenants.map(t=>`<option value="${nestiqUnitEsc(t.id)}">${nestiqUnitEsc(t.name||'Tenant')} — ${nestiqUnitEsc(t.unit||'unassigned')}</option>`).join('')
    : '<option value="">No unassigned tenants on this property</option>';
  const uidArg=nestiqUnitClickArg(unitId);
  const pidArg=nestiqUnitClickArg(propertyId);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Assign Tenant</h2>
    <p class="modal-sub">${nestiqUnitEsc(p?.name||'Property')} · ${nestiqUnitEsc(unit.unitNumber)}</p>
    <div class="form-group">
      <label>Unassigned tenant</label>
      <select class="form-input" id="assign_unit_tenant" ${tenants.length?'':'disabled'}>${opts}</select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      <button type="button" class="btn-primary btn-sm" ${tenants.length?'': 'disabled'}
        onclick="nestiqConfirmAssignTenantToUnit(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">Assign</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated();showPage('applications')">They apply online</button>
      <button type="button" class="btn-outline btn-sm" onclick="viewProperty(decodeURIComponent('${pidArg}'))">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated?.();
}
window.nestiqAssignTenantToUnit=nestiqAssignTenantToUnit;

async function nestiqConfirmAssignTenantToUnit(unitId, propertyId){
  const tenantId=document.getElementById('assign_unit_tenant')?.value||'';
  if(!tenantId){ nestiqShowNotif?.('Select a tenant','warning'); return; }
  const t=(tenantsData||[]).find(x=>String(x.id)===String(tenantId));
  if(!t){ nestiqShowNotif?.('Tenant not found','error'); return; }
  await nestiqLinkTenantToUnit(t, unitId, propertyId);
  nestiqShowNotif?.('Tenant assigned to unit','success');
  viewProperty?.(propertyId);
  renderProperties?.();
  renderTenants?.();
}
window.nestiqConfirmAssignTenantToUnit=nestiqConfirmAssignTenantToUnit;

function nestiqCreateTenantForUnit(unitId, propertyId){
  if(typeof nestiqShowTenantsApplyOnly==='function') nestiqShowTenantsApplyOnly();
  else nestiqShowNotif?.('Tenants apply from Browse listings.','info');
}
window.nestiqCreateTenantForUnit=nestiqCreateTenantForUnit;

function nestiqViewUnitTenant(tenantId){
  if(!tenantId){ nestiqShowNotif?.('No tenant on this unit','warning'); return; }
  viewTenant?.(tenantId);
}
window.nestiqViewUnitTenant=nestiqViewUnitTenant;

async function nestiqLinkTenantToUnit(tenant, unitId, propertyId){
  if(!tenant||!unitId||propertyId==null) return;
  // Free any previous unit linked to this tenant
  try{ await nestiqUnlinkTenantFromUnit(tenant,{ skipTenantPersist:true }); }catch(_e){}

  const unit=nestiqUnitsList().find(u=>String(u.id)===String(unitId))||{ id:unitId, propertyId };
  const p=(propertiesData||[]).find(x=>String(x.id)===String(propertyId));
  const label=String(unit.label||unit.unitNumber||tenant.unit||'Unit');
  await saveUnit(propertyId,{
    ...unit,
    label,
    tenantId:tenant.id,
    tenantName:tenant.name||'',
    rent:Number(tenant.rent||unit.rent||p?.rent||0),
    status:'occupied',
    leaseStart:tenant.leaseStart||unit.leaseStart||null,
    leaseEnd:tenant.leaseEnd||tenant.lease||unit.leaseEnd||null
  });
  tenant.unitId=String(unitId);
  tenant.unitNumber=label;
  tenant.unit=label;
  tenant.propertyId=propertyId;
  if(p?.name) tenant.property=p.name;
  tenant.unitPassword=typeof normalizeUnitPassword==='function'
    ? normalizeUnitPassword(tenant.unit)
    : String(tenant.unit||'').toLowerCase().replace(/^unit\s*/,'').replace(/\s+/g,'');
  try{
    if(window.nestiqUseFirestore&&window.nestiqDb&&window.nestiqFs?.tenants){
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
      if(lid){
        await window.nestiqFs.tenants(window.nestiqDb,lid).doc(String(tenant.id)).set({
          unitId:tenant.unitId,
          unitNumber:tenant.unitNumber,
          unit:tenant.unit,
          propertyId:tenant.propertyId,
          property:tenant.property
        },{ merge:true });
      }
    }else{
      saveData?.();
    }
  }catch(err){
    console.warn('NestIQ: tenant unit link',err);
  }
}
window.nestiqLinkTenantToUnit=nestiqLinkTenantToUnit;

/**
 * Clear unit.tenantId / set vacant when a tenant moves out or is removed.
 * opts.skipTenantPersist — used while re-linking so we don't wipe unitId mid-flow.
 */
async function nestiqUnlinkTenantFromUnit(tenant, opts){
  if(!tenant) return;
  const skipPersist=!!(opts&&opts.skipTenantPersist);
  const tid=String(tenant.id??'');
  const unitId=tenant.unitId!=null&&tenant.unitId!==''?String(tenant.unitId):'';
  let candidates=nestiqUnitsList().filter(u=>{
    if(unitId && String(u.id)===unitId) return true;
    return tid && String(u.tenantId||'')===tid;
  });
  if(!candidates.length){
    try{
      const db=window.nestiqDb;
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
      const col=window.nestiqFs?.units?.(db, lid);
      if(col){
        if(unitId){
          const doc=await col.doc(unitId).get();
          if(doc.exists){
            const d=doc.data()||{};
            candidates=[nestiqNormalizeUnit({ ...d, id:d.id!=null&&d.id!==''?d.id:doc.id }, d.propertyId||tenant.propertyId)];
          }
        }else if(tid){
          const snap=await col.where('tenantId','==',tid).get();
          candidates=snap.docs.map(doc=>{
            const d=doc.data()||{};
            return nestiqNormalizeUnit({ ...d, id:d.id!=null&&d.id!==''?d.id:doc.id }, d.propertyId||tenant.propertyId);
          });
        }
      }
    }catch(err){
      console.warn('[NestIQ] unlink unit lookup', err);
    }
  }
  for(const unit of candidates){
    try{
      await saveUnit(unit.propertyId,{
        ...unit,
        tenantId:null,
        tenantName:null,
        status:'vacant'
      });
    }catch(err){
      console.warn('[NestIQ] unlink unit', err);
    }
  }
  if(!skipPersist){
    tenant.unitId=null;
    try{
      if(window.nestiqUseFirestore&&window.nestiqDb&&window.nestiqFs?.tenants&&tid){
        const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
        if(lid){
          await window.nestiqFs.tenants(window.nestiqDb,lid).doc(tid).set({ unitId:null },{ merge:true });
        }
      }else{
        saveData?.();
      }
    }catch(_e){}
  }
}
window.nestiqUnlinkTenantFromUnit=nestiqUnlinkTenantFromUnit;

function nestiqOnAddTenantUnitChange(){
  nestiqApplyVacantUnitSelection('add_t_unit_select',{
    hiddenLabelId:'nt_unit',
    rentId:'nt_rent'
  });
}
window.nestiqOnAddTenantUnitChange=nestiqOnAddTenantUnitChange;

function nestiqOnApproveUnitChange(){
  nestiqApplyVacantUnitSelection('nestiqApprUnit',{
    rentId:'nestiqApprRent',
    depositId:'nestiqApprDeposit'
  });
}
window.nestiqOnApproveUnitChange=nestiqOnApproveUnitChange;

function nestiqApplyVacantUnitSelection(selectId, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  const select=document.getElementById(selectId);
  if(!select) return;
  const unit=nestiqUnitsList().find(u=>String(u.id)===String(select.value));
  const label=unit?String(unit.label||unit.unitNumber||'Unit'):'';
  if(opts.hiddenLabelId){
    const hidden=document.getElementById(opts.hiddenLabelId);
    if(hidden) hidden.value=label;
  }
  if(opts.rentId && unit && Number(unit.rent)>0){
    const rentEl=document.getElementById(opts.rentId);
    if(rentEl) rentEl.value=unit.rent;
  }
  if(opts.depositId && unit){
    const depEl=document.getElementById(opts.depositId);
    const dep=Number(unit.deposit)>0?Number(unit.deposit):Math.round(Number(unit.rent||0)*2);
    if(depEl && dep>0) depEl.value=dep;
  }
}

async function nestiqLoadUnitsForProperty(propertyId, opts){
  opts=opts&&typeof opts==='object'?opts:{};
  const selectId=opts.selectId||'add_t_unit_select';
  const hintId=opts.hintId||'nt_unit_hint';
  const select=document.getElementById(selectId);
  const hint=document.getElementById(hintId);
  if(!select) return;
  const pid=String(propertyId||'').trim();
  if(!pid){
    select.innerHTML='<option value="">Select a property first</option>';
    if(hint) hint.textContent='';
    return;
  }

  select.disabled=true;
  select.innerHTML='<option value="">Loading units…</option>';
  if(hint) hint.textContent='';

  try{
    const p=(typeof propertiesData!=='undefined'?propertiesData:window.propertiesData||[])
      .find(x=>String(x.id)===pid);
    if(p && typeof nestiqEnsureUnitsForProperty==='function'){
      await nestiqEnsureUnitsForProperty(p);
    }
    if(typeof getPropertyUnits==='function'){
      await getPropertyUnits(pid);
    }
  }catch(err){
    console.warn('[NestIQ] load units for add-tenant', err);
  }

  const all=nestiqUnitsForProperty(pid)
    .slice()
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  const pending=window.__nestiqPendingUnitAssign;
  const prefer=String(opts.preferUnitId||'').trim()
    || (pending&&String(pending.propertyId)===pid?String(pending.unitId):'');

  let vacant=all.filter(u=>typeof nestiqUnitIsOpenForApplication==='function'
    ? nestiqUnitIsOpenForApplication(u)
    : (nestiqUnitIsAvailable(u) && (u.tenantId==null||u.tenantId==='')));
  // Allow preferred unit from "Assign Tenant" even if status is briefly non-vacant
  if(prefer && !vacant.some(u=>String(u.id)===prefer)){
    const prefUnit=all.find(u=>String(u.id)===prefer);
    if(prefUnit) vacant=[prefUnit, ...vacant];
  }

  const applyMode=selectId==='nestiqApprUnit';
  if(!vacant.length){
    select.innerHTML='<option value="">No vacant units available</option>';
    select.disabled=false;
    if(hint){
      hint.style.color='var(--rust)';
      hint.textContent=applyMode
        ? (all.length
          ? 'All units on this property are occupied. Approving will still create a tenant, but no unit will be assigned — waitlist or add a unit first.'
          : 'No units found for this property. Approving will still create a tenant without a unit. Add a unit from the property page first.')
        : (all.length
          ? 'All units on this property are occupied. Add a unit or free one first.'
          : 'No units found — open the property and use + Add Unit.');
    }
    if(applyMode) nestiqOnApproveUnitChange();
    else nestiqOnAddTenantUnitChange();
    return;
  }

  if(hint) hint.style.color='var(--muted)';
  select.innerHTML=vacant.map(u=>{
    const label=String(u.label||u.unitNumber||'Unit');
    const rent=Number(u.rent||0);
    const rentBit=rent>0?` — R${rent.toLocaleString('en-ZA')}/mo`:'';
    const sel=(prefer&&String(u.id)===prefer)||(!prefer&&vacant.length===1)?' selected':'';
    return `<option value="${nestiqUnitEsc(u.id)}"${sel}>${nestiqUnitEsc(label)}${nestiqUnitEsc(rentBit)}</option>`;
  }).join('');

  if(all.length===1 && vacant.length===1){
    select.value=String(vacant[0].id);
    if(hint) hint.textContent='Only one unit on this property — selected automatically.';
  }else if(vacant.length===1){
    select.value=String(vacant[0].id);
    if(hint) hint.textContent='';
  }else if(hint){
    hint.textContent='Choose a vacant unit for this tenant.';
  }

  select.disabled=false;
  if(applyMode) nestiqOnApproveUnitChange();
  else nestiqOnAddTenantUnitChange();
}
window.nestiqLoadUnitsForProperty=nestiqLoadUnitsForProperty;

function nestiqTenantOnProperty(t, p){
  if(!t||!p) return false;
  if(t.propertyId!=null && t.propertyId!=='' && String(t.propertyId)===String(p.id)) return true;
  const pn=String(p.name||'').trim();
  return !!(pn && String(t.property||'').trim()===pn);
}

function nestiqTenantCountsTowardOccupancy(t){
  if(!t) return false;
  const st=String(t.status||'').toLowerCase();
  if(st==='vacant'||st==='unassigned') return false;
  const ls=String(t.leaseStatus||'').toLowerCase();
  if(ls==='cancelled'||ls==='terminated'||ls==='ended'||ls==='void') return false;
  return true;
}

function nestiqUnitLabelKey(u){
  return String(u?.label||u?.unitNumber||u?.unit||'').trim().toLowerCase();
}

function nestiqUnitIsOccupiedByTenants(u, tenants){
  if(!u) return false;
  const st=String(u.status||'').toLowerCase();
  if(st==='occupied'||st==='due'||st==='reserved') return true;
  if(u.tenantId!=null && String(u.tenantId).trim()!=='') return true;
  if(String(u.tenantName||'').trim()) return true;
  const uid=String(u.id||'');
  const label=nestiqUnitLabelKey(u);
  return (tenants||[]).some(t=>{
    if(uid && String(t.unitId||'').trim()===uid) return true;
    const tl=String(t.unit||t.unitNumber||'').trim().toLowerCase();
    return !!(label && tl && tl===label);
  });
}

function nestiqPropertyOccupancyStats(p){
  const units=nestiqUnitsForProperty(p?.id);
  const tenants=(window.tenantsData||[]).filter(t=>nestiqTenantOnProperty(t,p) && nestiqTenantCountsTowardOccupancy(t));
  let occupied=0;
  if(units.length){
    occupied=units.filter(u=>nestiqUnitIsOccupiedByTenants(u, tenants)).length;
  }
  if(!occupied && tenants.length){
    occupied=tenants.length;
  }
  let total=units.length || Number(p?.numberOfUnits||p?.totalUnits||0) || 0;
  if(occupied>total) total=occupied;
  if(!total) total=Math.max(1, occupied);
  occupied=Math.min(occupied, total);
  return {
    totalUnits:total,
    occupiedUnits:occupied,
    vacantUnits:Math.max(0, total-occupied)
  };
}
window.nestiqPropertyOccupancyStats=nestiqPropertyOccupancyStats;
window.nestiqTenantOnProperty=nestiqTenantOnProperty;

function nestiqUnitsCardStats(p){
  return nestiqPropertyOccupancyStats(p);
}

function nestiqUnitsCardRowHtml(p){
  const { totalUnits, occupiedUnits, vacantUnits }=nestiqUnitsCardStats(p);
  return `<div class="prop-units-row" style="display:flex;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
  <div style="flex:1;text-align:center">
    <div style="font-weight:700;font-size:1rem">${totalUnits}</div>
    <div style="font-size:0.7rem;color:var(--muted)">Total Units</div>
  </div>
  <div style="flex:1;text-align:center">
    <div style="font-weight:700;font-size:1rem;color:var(--green)">${occupiedUnits}</div>
    <div style="font-size:0.7rem;color:var(--muted)">Occupied</div>
  </div>
  <div style="flex:1;text-align:center">
    <div style="font-weight:700;font-size:1rem;color:var(--rust)">${vacantUnits}</div>
    <div style="font-size:0.7rem;color:var(--muted)">Available</div>
  </div>
</div>`;
}
window.nestiqUnitsCardRowHtml=nestiqUnitsCardRowHtml;

function nestiqRenderUnitsMasterTable(filteredProps){
  const wrap=document.getElementById('propertiesUnitsView');
  if(!wrap) return;
  const propIds=new Set((filteredProps||[]).map(p=>String(p.id)));
  const nameById=Object.fromEntries((filteredProps||[]).map(p=>[String(p.id),p.name||'Property']));
  const units=nestiqUnitsList()
    .filter(u=>propIds.has(String(u.propertyId)))
    .slice()
    .sort((a,b)=>{
      const pn=String(nameById[String(a.propertyId)]||'').localeCompare(String(nameById[String(b.propertyId)]||''));
      if(pn) return pn;
      return String(a.unitNumber||'').localeCompare(String(b.unitNumber||''),undefined,{numeric:true,sensitivity:'base'});
    });
  if(!units.length){
    wrap.innerHTML=`<div class="nestiq-empty-state" style="padding:28px;text-align:center;color:var(--muted)">No units yet. Edit a property and set Total Units to generate them.</div>`;
    delete __nestiqUnitTableStaggerSig.master;
    return;
  }
  const rows=units.map(u=>{
    const badge=u.status==='occupied'?'badge-green':u.status==='maintenance'?'badge-amber':'badge-red';
    const label=u.status==='occupied'?'Occupied':u.status==='maintenance'?'Maintenance':'Available';
    const uidArg=nestiqUnitClickArg(u.id);
    const pidArg=nestiqUnitClickArg(u.propertyId);
    const openJs=`nestiqOpenEditUnitModal(decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))`;
    return `<tr class="nestiq-unit-row" role="button" tabindex="0" title="Edit unit"
      onclick="${openJs}"
      onkeydown="nestiqUnitRowKeydown(event,decodeURIComponent('${uidArg}'),decodeURIComponent('${pidArg}'))">
      <td>${nestiqUnitEsc(nameById[String(u.propertyId)]||'—')}</td>
      <td><strong>${nestiqUnitEsc(u.unitNumber||u.label||'Unit')}</strong></td>
      <td>${u.tenantName?nestiqUnitEsc(u.tenantName):'<span style="color:var(--muted)">—</span>'}</td>
      <td>R${Number(u.rent||0).toLocaleString()}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button type="button" class="btn-outline btn-sm" onclick="event.stopPropagation();${openJs}">Edit</button>
      </td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--card-bg)">
      <table class="nestiq-table" style="width:100%">
        <thead>
          <tr>
            <th>Property</th>
            <th>Unit</th>
            <th>Tenant</th>
            <th>Rent</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  nestiqStaggerUnitsTableBody(wrap, 'master');
}
window.nestiqRenderUnitsMasterTable=nestiqRenderUnitsMasterTable;

/**
 * Lazy migration: create a default "Main" unit the first time a property needs one.
 * No-op if any unit already exists for propertyId. Never throws (logs warn).
 * Not called from anywhere in stage 1 — wire up in stage 2.
 */
async function nestiqEnsureUnitsForProperty(p){
  try{
    if(!p || p.id==null || p.id==='') return;
    const db=window.nestiqDb;
    const lid=typeof window.nestiqFs?.resolveLandlordId==='function'
      ? window.nestiqFs.resolveLandlordId()
      : (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
    const unitsCol=window.nestiqFs?.units?.(db, lid);
    if(!db || !lid || !unitsCol) return;

    const propertyId=String(p.id);
    const existing=await unitsCol.where('propertyId','==',propertyId).limit(1).get();
    if(!existing.empty) return;

    const statusRaw=String(p.status||'vacant').toLowerCase();
    let status='available';
    if(statusRaw==='occupied') status='occupied';
    else if(statusRaw==='maintenance') status='maintenance';
    else if(statusRaw==='reserved') status='reserved';
    else status='available';
    let serverTs=new Date().toISOString();
    try{
      if(typeof firebase!=='undefined'&&firebase.firestore?.FieldValue?.serverTimestamp){
        serverTs=firebase.firestore.FieldValue.serverTimestamp();
      }
    }catch(_e){}

    let activeTenant=null;
    if(typeof getActiveTenantForProperty==='function'){
      activeTenant=getActiveTenantForProperty(p);
    }else{
      const list=Array.isArray(window.tenantsData)?window.tenantsData
        :(typeof tenantsData!=='undefined'&&Array.isArray(tenantsData)?tenantsData:[]);
      activeTenant=list.find(t=>
        t&&t.status!=='vacant'&&(Number(t.propertyId)===Number(p.id)||t.property===p.name)
      )||null;
    }

    const tenantId=activeTenant&&activeTenant.id!=null&&activeTenant.id!==''
      ? String(activeTenant.id)
      : null;

    const unitPayload={
      propertyId,
      label:'Main',
      unitNumber:'Main',
      unitType:'',
      bedrooms:Number(p.bedrooms||0)||0,
      bathrooms:Number(p.bathrooms||0)||0,
      rent:Number(p.rent||0)||0,
      deposit:Number(p.deposit||0)||0,
      maxOccupants:2,
      status,
      tenantId,
      notes:'',
      order:0,
      createdAt:serverTs,
      updatedAt:serverTs
    };

    const unitRef=await unitsCol.add(unitPayload);
    const unitId=unitRef.id;

    if(tenantId){
      const tenantsCol=window.nestiqFs?.tenants?.(db, lid);
      if(tenantsCol){
        await tenantsCol.doc(tenantId).set({
          unitId,
          updatedAt:serverTs
        },{ merge:true });
      }
      if(activeTenant) activeTenant.unitId=unitId;
      try{
        const list=Array.isArray(window.tenantsData)?window.tenantsData
          :(typeof tenantsData!=='undefined'&&Array.isArray(tenantsData)?tenantsData:[]);
        const idx=list.findIndex(t=>String(t.id)===tenantId);
        if(idx>=0) list[idx].unitId=unitId;
      }catch(_te){}
    }
  }catch(err){
    console.warn('[NestIQ] nestiqEnsureUnitsForProperty failed:', err);
  }
}
window.nestiqEnsureUnitsForProperty=nestiqEnsureUnitsForProperty;
