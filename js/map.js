let propertyMapInstance=null;
let propertyMapMarkers={};
let activeMapFilter='all';
let tenantMiniMapInstance=null;
let tenantMiniMapMarker=null;

function statusColor(status){
  if(status==='occupied') return '#5a7a60';
  if(status==='vacant') return '#c46a3a';
  return '#c9a84c';
}

function statusLabel(status){
  if(status==='occupied') return 'Occupied';
  if(status==='vacant') return 'Vacant';
  return 'Rent Due';
}

function hasCoords(p){
  return Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng));
}

function getTenantForProperty(p){
  return tenantsData.find(x=>(Number(x.propertyId)===Number(p.id) || x.property===p.name) && x.status!=='vacant') || null;
}

function createMapPinIcon(status){
  const color=statusColor(status);
  return L.divIcon({
    className:'',
    html:`<div style="width:16px;height:16px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    iconSize:[16,16],
    iconAnchor:[8,8]
  });
}

function markerVisibleForFilter(propStatus){
  return activeMapFilter==='all' || activeMapFilter===propStatus;
}

function buildMapPopupHtml(p){
  const tenant=getTenantForProperty(p);
  const tenantName=tenant?.name || 'Vacant';
  const typeLabel=String(p.type||'Property').replace(/\b\w/g,m=>m.toUpperCase());
  return `
    <div style="font-family: DM Sans, sans-serif;min-width:200px;padding:4px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.icon||'🏠'} ${p.name}</div>
      <div style="font-size:12px;color:#8a8478;margin-bottom:8px">${p.addr||'—'}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <span style="display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${statusColor(p.status)}22;color:${statusColor(p.status)}">${statusLabel(p.status)}</span>
        <span style="display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(14,17,23,0.07);color:#0e1117">${typeLabel}</span>
      </div>
      <div style="font-size:13px;margin-bottom:4px">Tenant: ${tenantName}</div>
      <div style="font-size:13px;color:#c9a84c;font-weight:600">R${Number(p.rent||0).toLocaleString('en-ZA')}/month</div>
      ${typeof getSession==='function'&&getSession()?.role==='landlord'?`<div style="margin-top:10px">
        <button onclick="showPropertyDetail(${p.id})" style="background:#c9a84c;color:#0e1117;border:none;padding:6px 14px;border-radius:20px;font-size:12px;cursor:pointer;font-weight:600">View Details</button>
      </div>`:''}
    </div>`;
}

function clearMapMarkers(){
  Object.values(propertyMapMarkers).forEach(m=>propertyMapInstance?.removeLayer(m));
  propertyMapMarkers={};
}

function refreshMapMarkers(){
  if(!propertyMapInstance) return;
  clearMapMarkers();
  propertiesData.forEach(p=>{
    if(!hasCoords(p)){
      console.warn(`Map skip: no coordinates for property ${p?.name||p?.id}`);
      return;
    }
    const marker=L.marker([Number(p.lat),Number(p.lng)],{icon:createMapPinIcon(p.status)});
    marker.bindPopup(buildMapPopupHtml(p));
    if(markerVisibleForFilter(p.status)) marker.addTo(propertyMapInstance);
    propertyMapMarkers[p.id]=marker;
  });
}

function applyMapFilter(filter, el){
  activeMapFilter=filter;
  document.querySelectorAll('.map-filter-chip').forEach(c=>c.classList.remove('active'));
  if(el) el.classList.add('active');
  refreshMapMarkers();
  renderMapSidebar();
}

function flyToPropertyPin(propertyId){
  const marker=propertyMapMarkers[propertyId];
  const prop=propertiesData.find(p=>Number(p.id)===Number(propertyId));
  if(!prop || !propertyMapInstance || !marker || !hasCoords(prop)) return;
  propertyMapInstance.flyTo([Number(prop.lat),Number(prop.lng)],14,{duration:0.8});
  setTimeout(()=>marker.openPopup(),500);
}

function renderMapSidebar(){
  const summary=document.getElementById('mapSummary');
  const list=document.getElementById('mapPropertyList');
  if(!summary || !list) return;

  const total=propertiesData.length;
  const occupiedList=propertiesData.filter(p=>p.status==='occupied');
  const monthly=occupiedList.reduce((s,p)=>s+Number(p.rent||0),0);
  const occupied=occupiedList.length;
  const vacant=propertiesData.filter(p=>p.status==='vacant').length;
  const occPct=total?Math.round((occupied/total)*100):0;
  const scoped=activeMapFilter==='all' ? propertiesData : propertiesData.filter(p=>p.status===activeMapFilter);

  summary.innerHTML=`
    <div class="map-summary-title">Portfolio Summary</div>
    <div class="map-stats-grid">
      <div class="map-stat-box"><div class="map-stat-lbl">Total Properties</div><div class="map-stat-val">${total}</div></div>
      <div class="map-stat-box"><div class="map-stat-lbl">Monthly Income</div><div class="map-stat-val">R${monthly.toLocaleString('en-ZA')}</div></div>
      <div class="map-stat-box"><div class="map-stat-lbl">Occupied</div><div class="map-stat-val">${occupied} (${occPct}%)</div></div>
      <div class="map-stat-box"><div class="map-stat-lbl">Vacant</div><div class="map-stat-val">${vacant}</div></div>
    </div>
  `;

  list.innerHTML=scoped.map(p=>{
    const hasLocation=hasCoords(p);
    return `
      <button class="map-list-item" onclick="${hasLocation?`flyToPropertyPin(${p.id})`:'showNotif(\'No location set for this property\',\'warning\')'}">
        <div class="map-list-top">
          <span class="map-status-dot" style="background:${statusColor(p.status)}"></span>
          <div class="map-list-title">${p.name}</div>
        </div>
        <div class="map-list-sub">${p.addr||'—'}</div>
        <div class="map-list-meta">
          <span>${hasLocation?'':'No location set'}</span>
          <span>R${Number(p.rent||0).toLocaleString('en-ZA')}/mo</span>
        </div>
      </button>
    `;
  }).join('');
}

function initMap(){
  const page=document.getElementById('page-map');
  if(!page || typeof L==='undefined' || !page.classList.contains('active')) return;

  const s=getSession?.();
  if(s?.role==='tenant'){
    initTenantMapPage();
    return;
  }

  setMapPageLandlordMode();
  const mapEl=document.getElementById('propertyMap');
  if(!mapEl) return;

  if(propertyMapInstance){
    refreshMapMarkers();
    renderMapSidebar();
    setTimeout(()=>propertyMapInstance.invalidateSize(),120);
    return;
  }

  propertyMapInstance=L.map('propertyMap',{zoomControl:true}).setView([-28.4793,24.6727],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors'
  }).addTo(propertyMapInstance);

  refreshMapMarkers();
  renderMapSidebar();
  setTimeout(()=>propertyMapInstance.invalidateSize(),120);
}

function getTenantMapProperty(tenant){
  if(!tenant) return null;
  if(window.tenantProperty){
    const tp=window.tenantProperty;
    if(hasCoords(tp)) return tp;
    if(tp.id||tp.name) return tp;
  }
  return propertiesData.find(p=>Number(p.id)===Number(tenant?.propertyId))
    || propertiesData.find(p=>p.name===tenant?.property)
    || null;
}

let tenantFullMapInstance=null;
let tenantFullMapMarker=null;

function destroyTenantFullMap(){
  if(tenantFullMapMarker){
    try{ tenantFullMapMarker.remove(); }catch(_e){}
    tenantFullMapMarker=null;
  }
  if(tenantFullMapInstance){
    try{ tenantFullMapInstance.remove(); }catch(_e){}
    tenantFullMapInstance=null;
  }
}

function setMapPageLandlordMode(){
  const nav=document.getElementById('mapTenantNav');
  const tenantShell=document.getElementById('mapTenantShell');
  const landlordShell=document.getElementById('mapLandlordShell');
  const header=document.getElementById('mapPageHeader');
  if(nav) nav.style.display='none';
  if(tenantShell) tenantShell.style.display='none';
  if(landlordShell) landlordShell.style.display='';
  if(header) header.style.display='';
  const eyebrow=document.getElementById('mapPageEyebrow');
  const title=document.getElementById('mapPageTitle');
  const sub=document.getElementById('mapPageSub');
  if(eyebrow) eyebrow.textContent='Geographic View';
  if(title) title.textContent='Property Map';
  if(sub) sub.textContent='Interactive OpenStreetMap view of your full portfolio.';
  destroyTenantFullMap();
}

function setMapPageTenantMode(){
  const nav=document.getElementById('mapTenantNav');
  const tenantShell=document.getElementById('mapTenantShell');
  const landlordShell=document.getElementById('mapLandlordShell');
  const header=document.getElementById('mapPageHeader');
  if(nav) nav.style.display='flex';
  if(tenantShell) tenantShell.style.display='block';
  if(landlordShell) landlordShell.style.display='none';
  if(header) header.style.display='none';
  const page=document.getElementById('page-map');
  if(page) page.style.paddingTop='0';
}

function initTenantPropertyMap(tenant, containerId){
  const mapId=containerId||'tenantPropertyMap';
  const wrap=document.getElementById(mapId);
  if(!wrap || typeof L==='undefined') return;
  const prop=getTenantMapProperty(tenant);
  if(!prop || !hasCoords(prop)){
    wrap.innerHTML='<div class="tenant-mini-map-empty">Your landlord has not pinned this property on the map yet.</div>';
    return;
  }

  if(mapId==='tenantPropertyMap'){
    if(tenantMiniMapInstance){
      tenantMiniMapInstance.remove();
      tenantMiniMapInstance=null;
      tenantMiniMapMarker=null;
    }
    wrap.innerHTML='';
    tenantMiniMapInstance=L.map(mapId,{zoomControl:true,attributionControl:true,dragging:true,scrollWheelZoom:true})
      .setView([Number(prop.lat),Number(prop.lng)],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(tenantMiniMapInstance);
    tenantMiniMapMarker=L.marker([Number(prop.lat),Number(prop.lng)],{icon:createMapPinIcon(prop.status||'occupied')}).addTo(tenantMiniMapInstance);
    tenantMiniMapMarker.bindPopup(buildMapPopupHtml(prop));
    setTimeout(()=>tenantMiniMapInstance.invalidateSize(),120);
    return;
  }

  destroyTenantFullMap();
  wrap.innerHTML='';
  tenantFullMapInstance=L.map(mapId,{zoomControl:true,attributionControl:true})
    .setView([Number(prop.lat),Number(prop.lng)],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(tenantFullMapInstance);
  tenantFullMapMarker=L.marker([Number(prop.lat),Number(prop.lng)],{icon:createMapPinIcon(prop.status||'occupied')}).addTo(tenantFullMapInstance);
  tenantFullMapMarker.bindPopup(buildMapPopupHtml(prop));
  setTimeout(()=>{
    tenantFullMapInstance?.invalidateSize();
    tenantFullMapMarker?.openPopup();
  },200);

  const meta=document.getElementById('mapTenantMeta');
  if(meta){
    meta.innerHTML=`
      <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:1.1rem;margin-bottom:6px">${prop.icon||'🏠'} ${prop.name||'Your property'}</div>
      <div style="font-size:0.88rem;color:var(--muted);margin-bottom:8px">📍 ${prop.addr||'—'}</div>
      <div style="font-size:0.84rem">This pin was set by your landlord when the property was added or updated.</div>`;
  }
}

function initTenantMapPage(){
  const page=document.getElementById('page-map');
  if(!page || !page.classList.contains('active') || typeof L==='undefined') return;
  setMapPageTenantMode();
  const tenant=window.currentTenantData
    || (Array.isArray(tenantsData)?tenantsData:[]).find(t=>{
      const s=getSession?.();
      return s&&String(t.id)===String(s.userId||s.tenantDocId);
    });
  const mapEl=document.getElementById('tenantPropertyMapFull');
  if(!tenant||!mapEl){
    if(mapEl) mapEl.innerHTML='<div class="tenant-mini-map-empty">Sign in to your tenant portal to view your property location.</div>';
    return;
  }
  initTenantPropertyMap(tenant,'tenantPropertyMapFull');
}

function showPropertyDetail(id){
  viewProperty?.(id);
}

// Backward compatibility for existing references.
const initPropertyMap=initMap;

window.initMap=initMap;
window.initPropertyMap=initPropertyMap;
window.applyMapFilter=applyMapFilter;
window.flyToPropertyPin=flyToPropertyPin;
window.showPropertyDetail=showPropertyDetail;
window.initTenantPropertyMap=initTenantPropertyMap;
window.initTenantMapPage=initTenantMapPage;
window.getTenantMapProperty=getTenantMapProperty;
window.refreshMapMarkers=refreshMapMarkers;

/* ─── Property add/edit: pin on map (lat/lng) ─── */

let nestiqPropertyPinMap=null;
let nestiqPropertyPinMarker=null;
let __nestiqReverseDebounceTimer=null;

function nestiqDestroyPropertyPinMap(){
  if(__nestiqReverseDebounceTimer){
    clearTimeout(__nestiqReverseDebounceTimer);
    __nestiqReverseDebounceTimer=null;
  }
  if(nestiqPropertyPinMarker){
    try{ nestiqPropertyPinMarker.remove(); }catch(_e){}
    nestiqPropertyPinMarker=null;
  }
  if(nestiqPropertyPinMap){
    try{ nestiqPropertyPinMap.remove(); }catch(_e){}
    nestiqPropertyPinMap=null;
  }
}

function nestiqSyncPinInputs(latEl, lngEl, ll){
  if(!ll) return;
  if(latEl) latEl.value=String(Number(ll.lat).toFixed(7));
  if(lngEl) lngEl.value=String(Number(ll.lng).toFixed(7));
}

function nestiqBindPinMarkerDrag(latEl, lngEl, latInputId){
  if(!nestiqPropertyPinMarker) return;
  nestiqPropertyPinMarker.on('dragend', ()=>{
    nestiqSyncPinInputs(latEl, lngEl, nestiqPropertyPinMarker.getLatLng());
    nestiqScheduleReverseFillAddress(latInputId);
  });
}

function nestiqParseNominatimAddress(a, displayName){
  if(!a||typeof a!=='object') return null;
  const hn=String(a.house_number||'').trim();
  const road=String(a.road||a.pedestrian||a.path||a.footway||'').trim();
  const sub=String(a.suburb||a.neighbourhood||a.quarter||a.city_district||'').trim();
  const line=[hn,road].filter(Boolean).join(' ').trim();
  const line1=[line,sub].filter(Boolean).join(', ')||line||sub||'';
  const city=String(a.city||a.town||a.village||a.hamlet||a.municipality||'').trim();
  const state=String(a.state||a.region||'').trim();
  let fallbackLine='';
  if(!line1&&displayName){
    const parts=String(displayName).split(',');
    fallbackLine=parts.slice(0,2).map(x=>x.trim()).filter(Boolean).join(', ');
  }
  return {line1, city, state, fallbackLine:fallbackLine||String(displayName||'').split(',')[0].trim()||''};
}

async function nestiqReverseGeocodeLatLng(lat, lng){
  const la=Number(lat);
  const lo=Number(lng);
  if(!Number.isFinite(la)||!Number.isFinite(lo)) return null;
  const url='https://nominatim.openstreetmap.org/reverse?format=json&lat='+encodeURIComponent(la)+'&lon='+encodeURIComponent(lo)+'&addressdetails=1';
  const res=await fetch(url,{headers:{Accept:'application/json'},method:'GET'});
  if(!res.ok) return null;
  const data=await res.json();
  if(!data||!data.address) return null;
  return nestiqParseNominatimAddress(data.address, data.display_name);
}

function nestiqScheduleReverseFillAddress(latInputId){
  if(!latInputId) return;
  if(__nestiqReverseDebounceTimer) clearTimeout(__nestiqReverseDebounceTimer);
  __nestiqReverseDebounceTimer=setTimeout(()=>{
    __nestiqReverseDebounceTimer=null;
    nestiqReverseFillAddressFromPin(latInputId);
  },450);
}

async function nestiqReverseFillAddressFromPin(latInputId){
  const lid=latInputId==='new_prop_lat'?'new_prop_lng':'edit_p_lng';
  const latEl=document.getElementById(latInputId);
  const lngEl=document.getElementById(lid);
  if(!latEl||!lngEl) return;
  const la=Number(latEl.value);
  const lo=Number(lngEl.value);
  if(!Number.isFinite(la)||!Number.isFinite(lo)) return;
  try{
    const parsed=await nestiqReverseGeocodeLatLng(la, lo);
    if(!parsed) return;
    const street=parsed.line1||parsed.fallbackLine||'';
    const city=parsed.city||'';
    if(latInputId==='new_prop_lat'){
      const a=document.getElementById('new_prop_addr');
      const c=document.getElementById('new_prop_city');
      if(a&&street) a.value=street;
      if(c&&city) c.value=city;
    }else{
      const a=document.getElementById('edit_p_addr');
      const c=document.getElementById('edit_p_city');
      const p=document.getElementById('edit_p_province');
      if(a&&street) a.value=street;
      if(c&&city) c.value=city;
      if(p&&parsed.state){
        const want=parsed.state.trim();
        const opts=p.options;
        let idx=-1;
        for(let i=0;i<opts.length;i++){
          if(opts[i].value===want||opts[i].text===want||opts[i].text.includes(want)||want.includes(opts[i].text)){
            idx=i;
            break;
          }
        }
        if(idx>=0) p.selectedIndex=idx;
      }
    }
  }catch(err){
    console.warn('Reverse geocode', err);
  }
}

/**
 * @param {string} containerId
 * @param {string} latInputId
 * @param {string} lngInputId
 * @param {{initialLat?:number|null,initialLng?:number|null}} opts
 */
function nestiqInitPropertyPinMap(containerId, latInputId, lngInputId, opts){
  nestiqDestroyPropertyPinMap();
  const el=document.getElementById(containerId);
  if(!el || typeof L==='undefined'){
    if(el && typeof L==='undefined') el.innerHTML='<div style="padding:14px;font-size:0.82rem;color:var(--muted)">Map unavailable. Check your connection and reload.</div>';
    return;
  }
  el.innerHTML='';
  const latEl=document.getElementById(latInputId);
  const lngEl=document.getElementById(lngInputId);
  let lat=opts&&opts.initialLat!=null&&Number.isFinite(Number(opts.initialLat))?Number(opts.initialLat):null;
  let lng=opts&&opts.initialLng!=null&&Number.isFinite(Number(opts.initialLng))?Number(opts.initialLng):null;
  if((lat==null||lng==null)&&latEl&&lngEl&&latEl.value&&lngEl.value){
    const la=Number(latEl.value);
    const lo=Number(lngEl.value);
    if(Number.isFinite(la)&&Number.isFinite(lo)){ lat=la; lng=lo; }
  }
  const hasPin=lat!=null&&lng!=null&&Number.isFinite(lat)&&Number.isFinite(lng);
  const center=hasPin?[lat,lng]:[-28.5595,24.9375];
  const zoom=hasPin?16:6;
  nestiqPropertyPinMap=L.map(el,{zoomControl:true,scrollWheelZoom:false}).setView(center,zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors'
  }).addTo(nestiqPropertyPinMap);

  if(hasPin){
    nestiqPropertyPinMarker=L.marker([lat,lng],{draggable:true}).addTo(nestiqPropertyPinMap);
    nestiqBindPinMarkerDrag(latEl, lngEl, latInputId);
  }

  nestiqPropertyPinMap.on('click', e=>{
    const ll=e.latlng;
    if(!nestiqPropertyPinMarker){
      nestiqPropertyPinMarker=L.marker(ll,{draggable:true}).addTo(nestiqPropertyPinMap);
      nestiqBindPinMarkerDrag(latEl, lngEl, latInputId);
    }else{
      nestiqPropertyPinMarker.setLatLng(ll);
    }
    nestiqSyncPinInputs(latEl, lngEl, ll);
    nestiqScheduleReverseFillAddress(latInputId);
  });

  setTimeout(()=>{
    try{ nestiqPropertyPinMap.invalidateSize(); }catch(_e){}
  },200);
}

function nestiqApplyPinToPropertyMap(lat, lng, mapContainerId, latInputId, lngInputId){
  const la=Number(lat);
  const lo=Number(lng);
  if(!Number.isFinite(la)||!Number.isFinite(lo)){
    showNotif('Invalid coordinates','warning');
    return;
  }
  const latEl=document.getElementById(latInputId);
  const lngEl=document.getElementById(lngInputId);
  nestiqSyncPinInputs(latEl, lngEl, {lat:la, lng:lo});
  nestiqInitPropertyPinMap(mapContainerId, latInputId, lngInputId, {initialLat:la, initialLng:lo});
  nestiqScheduleReverseFillAddress(latInputId);
}

function nestiqRunGeolocationForPin(mapContainerId, latInputId, lngInputId){
  if(!navigator.geolocation){
    showNotif('Geolocation is not supported in this browser','warning');
    return;
  }
  showNotif('Getting your location…','info');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      nestiqApplyPinToPropertyMap(
        pos.coords.latitude,
        pos.coords.longitude,
        mapContainerId,
        latInputId,
        lngInputId
      );
      showNotif('Pin set to current location','success');
    },
    err=>{
      console.warn('Geolocation', err);
      let msg='Could not get your location';
      if(err.code===1) msg='Location permission denied';
      else if(err.code===2) msg='Location unavailable';
      else if(err.code===3) msg='Location request timed out';
      showNotif(msg,'warning');
    },
    {enableHighAccuracy:true, timeout:15000, maximumAge:60000}
  );
}

function nestiqPinNewPropertyCurrentLocation(){
  nestiqRunGeolocationForPin('new_prop_pin_map','new_prop_lat','new_prop_lng');
}

function nestiqPinEditPropertyCurrentLocation(){
  nestiqRunGeolocationForPin('edit_prop_pin_map','edit_p_lat','edit_p_lng');
}

function nestiqClearNewPropertyPin(){
  const la=document.getElementById('new_prop_lat');
  const lo=document.getElementById('new_prop_lng');
  if(la) la.value='';
  if(lo) lo.value='';
  nestiqInitPropertyPinMap('new_prop_pin_map','new_prop_lat','new_prop_lng',{});
  showNotif('Location pin cleared','info');
}

function nestiqClearEditPropertyPin(){
  const la=document.getElementById('edit_p_lat');
  const lo=document.getElementById('edit_p_lng');
  if(la) la.value='';
  if(lo) lo.value='';
  nestiqInitPropertyPinMap('edit_prop_pin_map','edit_p_lat','edit_p_lng',{});
  showNotif('Location pin cleared','info');
}

window.nestiqDestroyPropertyPinMap=nestiqDestroyPropertyPinMap;
window.nestiqInitPropertyPinMap=nestiqInitPropertyPinMap;
window.nestiqClearNewPropertyPin=nestiqClearNewPropertyPin;
window.nestiqClearEditPropertyPin=nestiqClearEditPropertyPin;
window.nestiqPinNewPropertyCurrentLocation=nestiqPinNewPropertyCurrentLocation;
window.nestiqPinEditPropertyCurrentLocation=nestiqPinEditPropertyCurrentLocation;

