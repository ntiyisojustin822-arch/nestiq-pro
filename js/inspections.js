const CONDITION_ORDER=['excellent','good','fair','poor','damaged'];
const CONDITION_LABEL={excellent:'Excellent',good:'Good',fair:'Fair',poor:'Poor',damaged:'Damaged'};
const CONDITION_COLOR={excellent:'var(--sage)',good:'#7d9a82',fair:'var(--gold)',poor:'var(--rust)',damaged:'#b3362f'};
const INSPECTION_TYPE_LABEL={'move-in':'Move-In','move-out':'Move-Out','routine':'Routine','annual':'Annual'};
let inspectionActiveTab='scheduled';
let activeInspectionId=null;
let inspectionAutoSaveTimer=null;

function nestiqInspectionSession(){
  try{
    return window.__nestiqSession || JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
  }catch(_e){ return null; }
}

function nestiqVisibleInspectionProperties(){
  const s=nestiqInspectionSession();
  if(s?.role==='caretaker'){
    const allowed=new Set((Array.isArray(s.assignedPropertyIds)?s.assignedPropertyIds:[]).map(String));
    return (window.caretakerProperties||[]).filter(p=>allowed.has(String(p.id||p.propertyId||'')));
  }
  return propertiesData;
}

async function nestiqPersistInspection(insp){
  const s=nestiqInspectionSession();
  const lid=s?.landlordId || (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null);
  const db=window.nestiqDb;
  if(db && lid && window.nestiqFs?.inspections){
    await window.nestiqFs.inspections(db, lid).doc(String(insp.id)).set({ ...insp, propertyId:insp.propertyId!=null?String(insp.propertyId):null, landlordId:lid },{ merge:true });
  }
  if(s?.role!=='caretaker') saveData();
}

const ROOM_TEMPLATES=[
  'Entrance / Hallway','Living Room / Lounge','Kitchen','Master Bedroom','Bedroom 2','Bedroom 3',
  'Main Bathroom','En-Suite Bathroom','Guest Toilet','Garage / Parking','Garden / Outdoor Area','Laundry Room'
];
const BASE_ITEMS=['Walls','Ceiling','Floor / Carpet','Windows','Doors and Handles','Light Fittings','Electrical Outlets','Curtains / Blinds'];
const KITCHEN_ITEMS=['Stove / Hob','Oven','Extractor Fan','Dishwasher','Sink and Taps','Kitchen Cupboards','Countertops'];
const BATHROOM_ITEMS=['Toilet','Basin','Shower','Bath','Taps and Mixers','Mirror','Towel Rail','Toilet Roll Holder','Tiles and Grout'];
const GARAGE_ITEMS=['Garage Door','Remote','Floor','Storage Space'];

function fmtZAR(v){ return `R${Number(v||0).toLocaleString('en-ZA',{maximumFractionDigits:0})}`; }
function inspectionById(id){ return (inspections||[]).find(i=>Number(i.id)===Number(id))||null; }
function tenantForPropertyId(propertyId){
  const s=nestiqInspectionSession();
  const src=s?.role==='caretaker' ? (window.caretakerTenants||[]) : tenantsData;
  return src.find(t=>{
    const pid=String(t.propertyId||'');
    const st=String(t.status||'').toLowerCase();
    return pid===String(propertyId) && st!=='vacant' && st!=='moved-out' && st!=='inactive';
  })||null;
}
function propertyById(propertyId){
  const s=nestiqInspectionSession();
  const src=s?.role==='caretaker' ? (window.caretakerProperties||[]) : propertiesData;
  return src.find(p=>String(p.id||p.propertyId)===String(propertyId))||null;
}

function templateItemsForRoom(roomName){
  const lower=String(roomName||'').toLowerCase();
  let items=[...BASE_ITEMS];
  if(lower.includes('kitchen')) items=items.concat(KITCHEN_ITEMS);
  if(lower.includes('bath')) items=items.concat(BATHROOM_ITEMS);
  if(lower.includes('garage')||lower.includes('parking')) items=items.concat(GARAGE_ITEMS);
  return items.map((name,idx)=>({id:Date.now()+Math.random()+idx,name,condition:'',notes:'',photo:null}));
}

function buildRoomsFromNames(roomNames){
  return roomNames.map((name,idx)=>({
    id:Date.now()+idx+Math.random(),
    name,
    items:templateItemsForRoom(name)
  }));
}

function roomCompletion(room){
  const total=(room.items||[]).length;
  const rated=(room.items||[]).filter(i=>i.condition).length;
  return {rated,total,done:total>0&&rated===total};
}

function calcRoomOverall(room){
  const items=room.items||[];
  if(!items.length) return 'fair';
  if(items.some(i=>i.condition==='damaged')) return 'damaged';
  if(items.some(i=>i.condition==='poor')) return 'poor';
  const weights={excellent:5,good:4,fair:3,poor:2,damaged:1};
  const values=items.map(i=>weights[i.condition]||0).filter(Boolean);
  if(!values.length) return 'fair';
  const avg=values.reduce((a,b)=>a+b,0)/values.length;
  if(avg>=4.5) return 'excellent';
  if(avg>=3.6) return 'good';
  if(avg>=2.6) return 'fair';
  if(avg>=1.6) return 'poor';
  return 'damaged';
}

function calcInspectionOverall(insp){
  const roomConditions=(insp.rooms||[]).map(r=>calcRoomOverall(r));
  if(roomConditions.includes('damaged')) return 'damaged';
  if(roomConditions.includes('poor')) return 'poor';
  if(roomConditions.includes('fair')) return 'fair';
  if(roomConditions.includes('good')) return 'good';
  return 'excellent';
}

function inspectionCounts(insp){
  const counts={excellent:0,good:0,fair:0,poor:0,damaged:0,total:0};
  (insp.rooms||[]).forEach(r=>(r.items||[]).forEach(i=>{
    if(i.condition && counts[i.condition]!==undefined) counts[i.condition]+=1;
    counts.total+=1;
  }));
  return counts;
}

function renderInspectionStats(){
  const el=document.getElementById('inspectionStats');
  if(!el) return;
  const total=(inspections||[]).length;
  const scheduled=(inspections||[]).filter(i=>i.status==='scheduled' || i.status==='in-progress').length;
  const completed=(inspections||[]).filter(i=>i.status==='completed').length;
  const monthKey=new Date().toISOString().slice(0,7);
  const thisMonth=(inspections||[]).filter(i=>String(i.date||'').slice(0,7)===monthKey).length;
  const stat=(l,v)=>`<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:12px"><div style="font-size:.72rem;color:var(--muted)">${l}</div><div style="font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700">${v}</div></div>`;
  el.innerHTML=[stat('Total',total),stat('Scheduled',scheduled),stat('Completed',completed),stat('This Month',thisMonth)].join('');
}

function setInspectionTab(tab,btn){
  inspectionActiveTab=tab;
  document.querySelectorAll('#inspTab_scheduled,#inspTab_completed').forEach(x=>x.classList.remove('active'));
  btn?.classList.add('active');
  renderInspectionsPage();
}

function renderInspectionsPage(){
  renderInspectionStats();
  const list=document.getElementById('inspectionsList');
  const formWrap=document.getElementById('inspectionFormWrap');
  if(!list||!formWrap) return;
  if(activeInspectionId){
    list.style.display='none';
    formWrap.style.display='block';
    renderInspectionForm(activeInspectionId);
    return;
  }
  list.style.display='grid';
  formWrap.style.display='none';
  list.style.gridTemplateColumns='repeat(auto-fill,minmax(300px,1fr))';
  list.style.gap='12px';
  const visibleProps=new Set(nestiqVisibleInspectionProperties().map(p=>String(p.id||p.propertyId||'')));
  const items=(inspections||[])
    .filter(i=>!visibleProps.size || visibleProps.has(String(i.propertyId||'')))
    .filter(i=>inspectionActiveTab==='completed'?i.status==='completed':i.status!=='completed')
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(!items.length){
    list.innerHTML='<div style="color:var(--muted);font-size:.85rem">No inspections found for this tab.</div>';
    return;
  }
  list.innerHTML=items.map(i=>{
    const p=propertyById(i.propertyId);
    const statusBadge=i.status==='completed'?'badge-green':i.status==='in-progress'?'badge-amber':'badge-red';
    return `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:14px;box-shadow:var(--shadow)">
      <div style="font-weight:700">${i.propertyName||p?.name||'—'}</div>
      <div style="font-size:.78rem;color:var(--muted)">${p?.addr||'—'}</div>
      <div style="font-size:.82rem;margin-top:6px">Tenant: ${i.tenantName||'Vacant'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <span class="badge badge-amber">${INSPECTION_TYPE_LABEL[i.type]||i.type}</span>
        <span class="badge ${statusBadge}">${i.status}</span>
      </div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:8px">${i.date||'—'}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${i.status==='completed'
          ? `<button class="btn-outline btn-sm" onclick="openInspectionReport(${i.id})">View Report</button>`
          : `<button class="btn-primary btn-sm" onclick="continueInspection(${i.id})">Continue</button>`
        }
      </div>
    </div>`;
  }).join('');
}

function openNewInspectionModal(){
  const sess=nestiqInspectionSession();
  const byDefault=sess?.role==='caretaker'?(sess.name||'Caretaker'):(landlordSettings.name||'Landlord');
  const propertyOptions=nestiqVisibleInspectionProperties().map(p=>`<option value="${p.id||p.propertyId}">${p.name}</option>`).join('');
  const roomChecks=ROOM_TEMPLATES.map((r,idx)=>`<label style="display:flex;gap:8px;align-items:center;font-size:.8rem"><input type="checkbox" class="insp-room-check" value="${r}" ${idx<8?'checked':''}>${r}</label>`).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">New Inspection</h2>
    <p class="modal-sub">Step 1 - Setup</p>
    <div class="form-group"><label>Property</label><select id="insp_property" class="form-input" onchange="onInspectionPropertyChanged()">${propertyOptions}</select></div>
    <div class="form-group" style="margin-top:8px"><label>Tenant</label><input id="insp_tenant" class="form-input" disabled></div>
    <div class="form-group" style="margin-top:8px"><label>Inspection Type</label><select id="insp_type" class="form-input"><option value="move-in">Move-In</option><option value="move-out">Move-Out</option><option value="routine">Routine</option><option value="annual">Annual</option></select></div>
    <div class="form-group" style="margin-top:8px"><label>Date</label><input id="insp_date" type="date" class="form-input" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group" style="margin-top:8px"><label>Conducted By</label><input id="insp_by" class="form-input" value="${String(byDefault).replace(/"/g,'&quot;')}"></div>
    <div class="form-group" style="margin-top:8px">
      <label>Rooms to include</label>
      <div style="display:flex;gap:8px;margin:6px 0 8px"><button class="btn-outline btn-sm" type="button" onclick="selectAllInspectionRooms(true)">Select All</button><button class="btn-outline btn-sm" type="button" onclick="selectAllInspectionRooms(false)">Deselect All</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px">${roomChecks}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="insp_custom_room" class="form-input" placeholder="Custom room name"><button class="btn-outline btn-sm" type="button" onclick="addInspectionCustomRoom()">Add</button></div>
      <div id="insp_custom_rooms" style="font-size:.78rem;color:var(--muted);margin-top:6px"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary btn-sm" onclick="startInspectionFromModal()">Start Inspection</button><button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button></div>
  `;
  nestiqOpenModalAnimated();
  window.__inspCustomRooms=[];
  onInspectionPropertyChanged();
}

function onInspectionPropertyChanged(){
  const pid=String(document.getElementById('insp_property')?.value||'');
  const tenant=tenantForPropertyId(pid);
  const tEl=document.getElementById('insp_tenant');
  if(tEl) tEl.value=tenant?`${tenant.name} (${tenant.unit})`:'No active tenant';
}

function selectAllInspectionRooms(on){
  document.querySelectorAll('.insp-room-check').forEach(c=>{ c.checked=on; });
}

function addInspectionCustomRoom(){
  const input=document.getElementById('insp_custom_room');
  const val=input?.value?.trim();
  if(!val) return;
  window.__inspCustomRooms=window.__inspCustomRooms||[];
  window.__inspCustomRooms.push(val);
  input.value='';
  const tag=document.getElementById('insp_custom_rooms');
  if(tag) tag.textContent=`Custom: ${window.__inspCustomRooms.join(', ')}`;
}

function startInspectionFromModal(){
  const propertyId=String(document.getElementById('insp_property')?.value||'');
  const property=propertyById(propertyId);
  if(!property){ nestiqShowNotif('Select a property','error'); return; }
  const tenant=tenantForPropertyId(propertyId);
  const type=document.getElementById('insp_type')?.value||'routine';
  const date=document.getElementById('insp_date')?.value||new Date().toISOString().slice(0,10);
  const conductedBy=document.getElementById('insp_by')?.value?.trim()||landlordSettings.name||'Landlord';
  const checked=[...document.querySelectorAll('.insp-room-check:checked')].map(x=>x.value);
  const custom=window.__inspCustomRooms||[];
  const rooms=buildRoomsFromNames([...checked,...custom]);
  if(!rooms.length){ nestiqShowNotif('Select at least one room','warning'); return; }
  const nowIso=new Date().toISOString();
  const insp={
    id:Date.now(),
    propertyId:property.id||property.propertyId,
    propertyName:property.name,
    tenantId:tenant?.id||tenant?.tenantId||null,
    tenantName:tenant?.name||'',
    type,
    date,
    conductedBy,
    status:'in-progress',
    rooms,
    overallCondition:'fair',
    notes:'',
    tenantSignature:null,
    landlordSignature:null,
    createdAt:nowIso,
    completedAt:null,
    currentRoomIndex:0
  };
  inspections.unshift(insp);
  if(Array.isArray(window.caretakerInspections) && nestiqInspectionSession()?.role==='caretaker'){
    window.caretakerInspections.unshift(insp);
  }
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  if(nestiqInspectionSession()?.role==='caretaker'){
    window.nestiqNotifyLandlordStaffAction?.(`${nestiqInspectionSession()?.name||'Caretaker'} started an inspection for ${insp.propertyName||'a property'}`,'inspections');
  }
  nestiqCloseModalAnimated();
  activeInspectionId=insp.id;
  if(nestiqInspectionSession()?.role==='caretaker'){
    window.nestiqSwitchCaretakerTab?.('inspections');
    renderInspectionsPage();
    return;
  }
  renderInspectionsPage();
}

function continueInspection(id){
  activeInspectionId=id;
  renderInspectionsPage();
}

function backToInspectionsList(){
  activeInspectionId=null;
  if(inspectionAutoSaveTimer){ clearInterval(inspectionAutoSaveTimer); inspectionAutoSaveTimer=null; }
  if(nestiqInspectionSession()?.role==='caretaker'){
    const wrap=document.getElementById('inspectionFormWrap');
    if(wrap){ wrap.style.display='none'; wrap.innerHTML=''; }
    window.renderCaretakerDashboard?.();
    window.nestiqSwitchCaretakerTab?.('inspections');
    return;
  }
  renderInspectionsPage();
}

function setItemCondition(inspId, roomId, itemId, cond){
  const insp=inspectionById(inspId); if(!insp) return;
  const room=insp.rooms.find(r=>String(r.id)===String(roomId)); if(!room) return;
  const item=room.items.find(i=>String(i.id)===String(itemId)); if(!item) return;
  item.condition=cond;
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  renderInspectionForm(inspId);
}

function setItemNotes(inspId, roomId, itemId, val){
  const insp=inspectionById(inspId); if(!insp) return;
  const room=insp.rooms.find(r=>String(r.id)===String(roomId)); if(!room) return;
  const item=room.items.find(i=>String(i.id)===String(itemId)); if(!item) return;
  item.notes=val;
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
}

function uploadInspectionItemPhoto(inspId, roomId, itemId){
  pickImageFile('image/jpeg,image/png,image/webp',(file)=>{
    compressImage(file,400,0.7,(b64)=>{
      const insp=inspectionById(inspId); if(!insp) return;
      const room=insp.rooms.find(r=>String(r.id)===String(roomId)); if(!room) return;
      const item=room.items.find(i=>String(i.id)===String(itemId)); if(!item) return;
      item.photo=b64;
      nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
      renderInspectionForm(inspId);
    });
  });
}

function addCustomItemToRoom(inspId, roomId){
  const input=document.getElementById(`insp_custom_item_${roomId}`);
  const name=input?.value?.trim();
  if(!name) return;
  const insp=inspectionById(inspId); if(!insp) return;
  const room=insp.rooms.find(r=>String(r.id)===String(roomId)); if(!room) return;
  room.items.push({id:Date.now()+Math.random(),name,condition:'',notes:'',photo:null});
  input.value='';
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  renderInspectionForm(inspId);
}

function setInspectionRoomIndex(inspId, delta){
  const insp=inspectionById(inspId); if(!insp) return;
  insp.currentRoomIndex=Math.max(0,Math.min((insp.rooms.length-1), Number(insp.currentRoomIndex||0)+delta));
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  renderInspectionForm(inspId);
}

function saveInspectionProgress(inspId){
  const insp=inspectionById(inspId); if(!insp) return;
  const notes=document.getElementById('insp_overall_notes')?.value||insp.notes||'';
  insp.notes=notes;
  insp.overallCondition=calcInspectionOverall(insp);
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  nestiqShowNotif('Inspection progress saved','success');
}

function completeInspection(inspId){
  const insp=inspectionById(inspId); if(!insp) return;
  const allRated=insp.rooms.every(r=>(r.items||[]).every(i=>Boolean(i.condition)));
  if(!allRated){ nestiqShowNotif('Condition rating is required for every item before completion','error'); return; }
  insp.notes=document.getElementById('insp_overall_notes')?.value||insp.notes||'';
  insp.overallCondition=calcInspectionOverall(insp);
  insp.status='completed';
  insp.completedAt=new Date().toISOString();
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  if(nestiqInspectionSession()?.role==='caretaker'){
    window.nestiqNotifyLandlordStaffAction?.(`${nestiqInspectionSession()?.name||'Caretaker'} completed an inspection for ${insp.propertyName||'a property'}`,'inspections');
  }
  nestiqShowNotif('Inspection completed','success');
  activeInspectionId=null;
  if(nestiqInspectionSession()?.role==='caretaker'){
    const wrap=document.getElementById('inspectionFormWrap');
    if(wrap){ wrap.style.display='none'; wrap.innerHTML=''; }
    window.renderCaretakerDashboard?.();
    window.nestiqSwitchCaretakerTab?.('inspections');
    return;
  }
  renderInspectionsPage();
}

function renderInspectionForm(inspId){
  const insp=inspectionById(inspId);
  const wrap=document.getElementById('inspectionFormWrap');
  if(!insp||!wrap) return;
  const idx=Math.max(0,Math.min(insp.rooms.length-1,Number(insp.currentRoomIndex||0)));
  insp.currentRoomIndex=idx;
  const current=insp.rooms[idx];
  const doneRooms=insp.rooms.filter(r=>roomCompletion(r).done).length;
  const progress=insp.rooms.length?Math.round((doneRooms/insp.rooms.length)*100):0;
  const roomButtons=insp.rooms.map((r,i)=>{
    const c=roomCompletion(r);
    const active=i===idx?'border-color:var(--gold);background:rgba(201,168,76,.1);':'';
    return `<button class="btn-outline btn-sm" style="${active}" onclick="jumpInspectionRoom(${inspId},${i})">${r.name} ${c.done?'✓':`${c.rated}/${c.total}`}</button>`;
  }).join('');
  const itemRows=(current.items||[]).map(item=>{
    const condBtns=CONDITION_ORDER.map(c=>`<button class="btn-outline btn-sm" style="padding:5px 8px;${item.condition===c?`background:${CONDITION_COLOR[c]}22;border-color:${CONDITION_COLOR[c]};color:${CONDITION_COLOR[c]};font-weight:700;`:''}" onclick="setItemCondition(${inspId},'${current.id}','${item.id}','${c}')">${CONDITION_LABEL[c]}</button>`).join('');
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border-soft)">${item.name}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border-soft)"><div style="display:flex;gap:6px;flex-wrap:wrap">${condBtns}</div></td>
      <td style="padding:8px;border-bottom:1px solid var(--border-soft)"><input class="form-input" value="${(item.notes||'').replace(/"/g,'&quot;')}" oninput="setItemNotes(${inspId},'${current.id}','${item.id}',this.value)"></td>
      <td style="padding:8px;border-bottom:1px solid var(--border-soft)">
        ${item.photo?`<img src="${item.photo}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer" onclick="openPhotoLightbox('${item.photo.replace(/'/g,"\\'")}','${item.name}')">`:''}
        <button class="btn-outline btn-sm" onclick="uploadInspectionItemPhoto(${inspId},'${current.id}','${item.id}')">${item.photo?'Change':'Upload'}</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn-outline btn-sm" onclick="backToInspectionsList()">← Back to Inspections</button>
      <div style="font-size:.82rem;color:var(--muted)">${insp.propertyName} · ${INSPECTION_TYPE_LABEL[insp.type]} · ${insp.date}</div>
    </div>
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted)"><span>Progress</span><span>${doneRooms}/${insp.rooms.length} rooms</span></div>
      <div style="height:8px;background:var(--border-soft);border-radius:999px;margin-top:6px"><div style="height:8px;border-radius:999px;background:var(--gold);width:${progress}%"></div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${roomButtons}</div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:700">${current.name}</div><span class="badge badge-amber">${CONDITION_LABEL[calcRoomOverall(current)]}</span></div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Item</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Condition</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Notes</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border)">Photo</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input id="insp_custom_item_${current.id}" class="form-input" placeholder="Custom item name"><button class="btn-outline btn-sm" onclick="addCustomItemToRoom(${inspId},'${current.id}')">Add Custom Item</button></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn-outline btn-sm" onclick="setInspectionRoomIndex(${inspId},-1)">Previous Room</button>
      <button class="btn-outline btn-sm" onclick="saveInspectionProgress(${inspId})">Save Progress</button>
      <button class="btn-outline btn-sm" onclick="setInspectionRoomIndex(${inspId},1)">Next Room</button>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:12px">
      <div style="font-weight:700;margin-bottom:8px">Complete Inspection</div>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Overall condition: <strong style="color:${CONDITION_COLOR[calcInspectionOverall(insp)]}">${CONDITION_LABEL[calcInspectionOverall(insp)]}</strong></div>
      <textarea id="insp_overall_notes" class="form-input form-textarea" placeholder="Overall notes">${insp.notes||''}</textarea>
      <div style="margin-top:8px"><button class="btn-primary btn-sm" onclick="completeInspection(${inspId})">Complete Inspection</button></div>
    </div>
  `;
  if(inspectionAutoSaveTimer) clearInterval(inspectionAutoSaveTimer);
  inspectionAutoSaveTimer=setInterval(()=>saveInspectionProgress(inspId),30000);
}

function jumpInspectionRoom(inspId, roomIndex){
  const insp=inspectionById(inspId); if(!insp) return;
  insp.currentRoomIndex=roomIndex;
  nestiqPersistInspection(insp).catch(err=>console.warn('NestIQ: persist inspection', err));
  renderInspectionForm(inspId);
}

function openInspectionReport(id){
  const insp=inspectionById(id); if(!insp) return;
  const counts=inspectionCounts(insp);
  const roomHtml=(insp.rooms||[]).map(r=>{
    const rows=(r.items||[]).map(i=>`<tr><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${i.name}</td><td style="padding:6px;border-bottom:1px solid var(--border-soft)"><span class="badge" style="background:${CONDITION_COLOR[i.condition]||'var(--border-soft)'}22;color:${CONDITION_COLOR[i.condition]||'var(--muted)'}">${CONDITION_LABEL[i.condition]||'—'}</span></td><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${i.notes||'—'}</td><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${i.photo?`<img src="${i.photo}" style="width:34px;height:34px;border-radius:6px;object-fit:cover">`:''}</td></tr>`).join('');
    return `<details style="border:1px solid var(--border);border-radius:10px;padding:8px;margin-top:8px"><summary style="cursor:pointer;font-weight:700">${r.name} <span class="badge badge-amber">${CONDITION_LABEL[calcRoomOverall(r)]}</span></summary><div style="overflow:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Item</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Condition</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Notes</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Photo</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }).join('');
  const canCompare=insp.type==='move-out' && !!findMoveInForProperty(insp.propertyId);
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${INSPECTION_TYPE_LABEL[insp.type]} Inspection Report</h2>
    <p class="modal-sub">${insp.date} · ${insp.propertyName} · ${insp.tenantName||'No tenant'}</p>
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:8px">Conducted by: ${insp.conductedBy||'—'}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:8px"><div style="font-size:.72rem;color:var(--muted)">Total Items</div><div style="font-weight:700">${counts.total}</div></div>
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:8px"><div style="font-size:.72rem;color:var(--muted)">Excellent/Good/Fair</div><div style="font-weight:700">${counts.excellent}/${counts.good}/${counts.fair}</div></div>
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:8px"><div style="font-size:.72rem;color:var(--muted)">Poor/Damaged</div><div style="font-weight:700">${counts.poor}/${counts.damaged}</div></div>
    </div>
    <div style="margin-top:8px"><span class="badge badge-amber">Overall: ${CONDITION_LABEL[calcInspectionOverall(insp)]}</span></div>
    <div style="max-height:320px;overflow:auto;margin-top:10px">${roomHtml}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn-outline btn-sm" onclick="printInspectionReport(${id})">Print Report</button>
      <button class="btn-outline btn-sm" onclick="downloadInspectionPdf(${id})">Download PDF</button>
      ${canCompare?`<button class="btn-primary btn-sm" onclick="openMoveOutComparison(${id})">Compare with Move-In</button>`:''}
    </div>
  `;
  nestiqOpenModalAnimated();
}

function printInspectionReport(id){
  const insp=inspectionById(id); if(!insp) return;
  const html=inspectionReportHtml(insp);
  const w=window.open('','_blank');
  if(!w) return;
  w.document.write(`<html><head><title>Inspection Report</title><style>body{font-family:Arial;padding:20px}h1{color:#c9a84c}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;text-align:left}img{width:38px;height:38px;object-fit:cover;border-radius:6px}</style></head><body>${html}<script>window.print()</script></body></html>`);
  w.document.close();
}

function inspectionReportHtml(insp){
  const roomTables=(insp.rooms||[]).map(r=>{
    const rows=(r.items||[]).map(i=>`<tr><td>${i.name}</td><td>${CONDITION_LABEL[i.condition]||'—'}</td><td>${i.notes||''}</td><td>${i.photo?`<img src="${i.photo}">`:''}</td></tr>`).join('');
    return `<h3>${r.name}</h3><table><thead><tr><th>Item</th><th>Condition</th><th>Notes</th><th>Photo</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
  return `<h1>NestIQ Pro — Inspection Report</h1>
    <p><strong>${INSPECTION_TYPE_LABEL[insp.type]}</strong> · ${insp.date}</p>
    <p>${insp.propertyName} · ${insp.tenantName||'No tenant'} · Conducted by ${insp.conductedBy||'—'}</p>
    ${roomTables}
    <p><strong>Overall:</strong> ${CONDITION_LABEL[calcInspectionOverall(insp)]}</p>
    <div style="margin-top:20px;display:flex;justify-content:space-between"><div>Landlord: _______________ Date: ________</div><div>Tenant: _______________ Date: ________</div></div>
    <p style="margin-top:22px;color:#666">NestIQ Pro — Inspection Report</p>`;
}

function downloadInspectionPdf(id){
  const insp=inspectionById(id); if(!insp) return;
  nestiqShowNotif('Generating PDF...','warning');
  try{
    const { jsPDF }=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    let y=pdfGenerator?.addHeader?pdfGenerator.addHeader(doc,'INSPECTION REPORT'):20;
    doc.setFontSize(10);
    doc.text(`${INSPECTION_TYPE_LABEL[insp.type]} · ${insp.date}`,14,y); y+=6;
    doc.text(`${insp.propertyName} · ${insp.tenantName||'No tenant'} · By ${insp.conductedBy||'—'}`,14,y); y+=8;
    (insp.rooms||[]).forEach(r=>{
      if(y>260){ doc.addPage(); y=pdfGenerator?.addHeader?pdfGenerator.addHeader(doc,'INSPECTION REPORT'):20; }
      doc.setFont('helvetica','bold'); doc.text(`${r.name} (${CONDITION_LABEL[calcRoomOverall(r)]})`,14,y); y+=6;
      doc.setFont('helvetica','normal');
      (r.items||[]).forEach(i=>{
        if(y>268){ doc.addPage(); y=pdfGenerator?.addHeader?pdfGenerator.addHeader(doc,'INSPECTION REPORT'):20; }
        doc.text(`- ${i.name}: ${CONDITION_LABEL[i.condition]||'—'} ${i.notes?`| ${i.notes}`:''}`,16,y,{maxWidth:160});
        if(i.photo){ try{ doc.addImage(i.photo,'JPEG',176,y-4,12,12);}catch(_err){} }
        y+=6;
      });
      y+=2;
    });
    y=Math.min(y+8,265);
    doc.text('Landlord: _______________ Date: ________',14,y);
    doc.text('Tenant: _______________ Date: ________',110,y);
    if(typeof finalizePdf==='function') finalizePdf(doc,`inspection-${id}.pdf`);
    else { doc.save(`inspection-${id}.pdf`); nestiqShowNotif('PDF ready','success');}
  }catch(_err){
    nestiqShowNotif('PDF generation failed','error');
  }
}

function findMoveInForProperty(propertyId){
  return (inspections||[]).filter(i=>Number(i.propertyId)===Number(propertyId) && i.type==='move-in' && i.status==='completed').sort((a,b)=>String(b.completedAt||b.date).localeCompare(String(a.completedAt||a.date)))[0]||null;
}

function itemConditionScore(cond){
  const map={excellent:5,good:4,fair:3,poor:2,damaged:1};
  return map[cond]||0;
}

function openMoveOutComparison(moveOutId){
  const moveOut=inspectionById(moveOutId); if(!moveOut) return;
  const moveIn=findMoveInForProperty(moveOut.propertyId);
  if(!moveIn){ nestiqShowNotif('No move-in inspection found for comparison','warning'); return; }
  const worsened=[];
  const rows=(moveOut.rooms||[]).map(rOut=>{
    const rIn=(moveIn.rooms||[]).find(r=>r.name===rOut.name);
    const itemRows=(rOut.items||[]).map(iOut=>{
      const iIn=(rIn?.items||[]).find(i=>i.name===iOut.name);
      const worse=itemConditionScore(iOut.condition)<itemConditionScore(iIn?.condition);
      if(worse) worsened.push({room:rOut.name,item:iOut.name,from:iIn?.condition||'—',to:iOut.condition||'—',cost:0});
      return `<tr style="${worse?'background:rgba(196,106,58,0.12)':''}"><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${iOut.name}</td><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${CONDITION_LABEL[iIn?.condition]||'—'}</td><td style="padding:6px;border-bottom:1px solid var(--border-soft)">${CONDITION_LABEL[iOut.condition]||'—'}</td></tr>`;
    }).join('');
    return `<details style="margin-top:8px" open><summary style="font-weight:700">${rOut.name}</summary><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Item</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Move-In</th><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border)">Move-Out</th></tr></thead><tbody>${itemRows}</tbody></table></details>`;
  }).join('');
  window.__damageAssessment=worsened.map((w,idx)=>({...w,id:idx}));
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Move-In vs Move-Out Comparison</h2>
    <p class="modal-sub">${moveOut.propertyName} · ${moveOut.tenantName||'No tenant'}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.8rem;margin-bottom:8px">
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:8px"><strong>Move-In:</strong> ${moveIn.date}</div>
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:8px"><strong>Move-Out:</strong> ${moveOut.date}</div>
    </div>
    <div style="max-height:240px;overflow:auto">${rows}</div>
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      <div style="font-weight:700;margin-bottom:6px">Damage Assessment</div>
      <div id="damageAssessmentRows">${renderDamageAssessmentRows(moveOut.tenantId)}</div>
      <div id="damageTotals" style="font-size:.82rem;margin-top:8px"></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-primary btn-sm" onclick="deductDamageFromDeposit(${moveOut.tenantId||0})">Deduct from Deposit</button>
        <button class="btn-outline btn-sm" onclick="downloadDamageReportPdf(${moveOutId})">Export Damage PDF</button>
      </div>
    </div>
  `;
  nestiqOpenModalAnimated();
  updateDamageTotals(moveOut.tenantId||0);
}

function renderDamageAssessmentRows(tenantId){
  const rows=window.__damageAssessment||[];
  if(!rows.length) return '<div style="font-size:.8rem;color:var(--muted)">No worsened items detected.</div>';
  return rows.map((r,idx)=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:center;margin-bottom:6px;font-size:.8rem">
    <div>${r.room} — ${r.item}<div style="font-size:.72rem;color:var(--muted)">${CONDITION_LABEL[r.from]||r.from} -> ${CONDITION_LABEL[r.to]||r.to}</div></div>
    <div></div><div></div>
    <div><div class="input-prefix"><span class="input-prefix-label">R</span><input class="form-input" style="height:34px" type="number" value="${r.cost||0}" oninput="setDamageCost(${idx},this.value,${tenantId})"></div></div>
  </div>`).join('');
}

function setDamageCost(idx,val,tenantId){
  if(!window.__damageAssessment) return;
  window.__damageAssessment[idx].cost=Number(val||0);
  updateDamageTotals(tenantId);
}

function updateDamageTotals(tenantId){
  const total=(window.__damageAssessment||[]).reduce((s,r)=>s+Number(r.cost||0),0);
  const t=tenantsData.find(x=>x.id===tenantId);
  const deposit=typeof nestiqTenantDepositTotalValue==='function'?nestiqTenantDepositTotalValue(t):Number(t?.deposit&&typeof t.deposit==='object'?(Number(t.deposit.amount||0)+Number(t.deposit.interestEarned||0)):t?.deposit||0);
  const refund=deposit-total;
  const el=document.getElementById('damageTotals');
  if(!el) return;
  el.innerHTML=`Deposit ${fmtZAR(deposit)} - Damage ${fmtZAR(total)} = ${refund>=0?`Refund ${fmtZAR(refund)}`:`Amount Owed ${fmtZAR(Math.abs(refund))}`}`;
}

function deductDamageFromDeposit(tenantId){
  const t=tenantsData.find(x=>x.id===tenantId);
  if(!t){ nestiqShowNotif('Tenant not found','warning'); return; }
  const total=(window.__damageAssessment||[]).reduce((s,r)=>s+Number(r.cost||0),0);
  const dep=typeof nestiqTenantDepositTotalValue==='function'?nestiqTenantDepositTotalValue(t):Number(t.deposit&&typeof t.deposit==='object'?(Number(t.deposit.amount||0)+Number(t.deposit.interestEarned||0)):t.deposit||0);
  const refund=Math.max(0,dep-total);
  nestiqShowNotif(`Damage assessed: ${fmtZAR(total)}. Refund due: ${fmtZAR(refund)}`,'success');
}

function downloadDamageReportPdf(moveOutId){
  const moveOut=inspectionById(moveOutId); if(!moveOut) return;
  nestiqShowNotif('Generating PDF...','warning');
  try{
    const { jsPDF }=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    let y=pdfGenerator?.addHeader?pdfGenerator.addHeader(doc,'DAMAGE ASSESSMENT REPORT'):20;
    doc.setFontSize(10);
    doc.text(`${moveOut.propertyName} · ${moveOut.tenantName||'No tenant'}`,14,y); y+=8;
    const rows=(window.__damageAssessment||[]);
    rows.forEach(r=>{
      if(y>270){ doc.addPage(); y=pdfGenerator?.addHeader?pdfGenerator.addHeader(doc,'DAMAGE ASSESSMENT REPORT'):20; }
      doc.text(`${r.room} - ${r.item}: ${CONDITION_LABEL[r.from]||r.from} -> ${CONDITION_LABEL[r.to]||r.to} | ${fmtZAR(r.cost)}`,14,y); y+=6;
    });
    const total=rows.reduce((s,r)=>s+Number(r.cost||0),0);
    y+=4; doc.setFont('helvetica','bold'); doc.text(`Total Damage Cost: ${fmtZAR(total)}`,14,y);
    if(typeof finalizePdf==='function') finalizePdf(doc,`damage-report-${moveOutId}.pdf`);
    else { doc.save(`damage-report-${moveOutId}.pdf`); nestiqShowNotif('PDF ready','success'); }
  }catch(_err){
    nestiqShowNotif('PDF generation failed','error');
  }
}

function initInspectionsPage(){
  if(!Array.isArray(inspections)) inspections=[];
  activeInspectionId=null;
  renderInspectionsPage();
}

function getTenantMoveInInspection(tenantId){
  return (inspections||[]).filter(i=>i.status==='completed' && i.type==='move-in' && Number(i.tenantId)===Number(tenantId)).sort((a,b)=>String(b.completedAt||b.date).localeCompare(String(a.completedAt||a.date)))[0]||null;
}

window.initInspectionsPage=initInspectionsPage;
window.openNewInspectionModal=openNewInspectionModal;
window.onInspectionPropertyChanged=onInspectionPropertyChanged;
window.selectAllInspectionRooms=selectAllInspectionRooms;
window.addInspectionCustomRoom=addInspectionCustomRoom;
window.startInspectionFromModal=startInspectionFromModal;
window.setInspectionTab=setInspectionTab;
window.continueInspection=continueInspection;
window.backToInspectionsList=backToInspectionsList;
window.setItemCondition=setItemCondition;
window.setItemNotes=setItemNotes;
window.uploadInspectionItemPhoto=uploadInspectionItemPhoto;
window.addCustomItemToRoom=addCustomItemToRoom;
window.setInspectionRoomIndex=setInspectionRoomIndex;
window.saveInspectionProgress=saveInspectionProgress;
window.completeInspection=completeInspection;
window.jumpInspectionRoom=jumpInspectionRoom;
window.openInspectionReport=openInspectionReport;
window.printInspectionReport=printInspectionReport;
window.downloadInspectionPdf=downloadInspectionPdf;
window.openMoveOutComparison=openMoveOutComparison;
window.setDamageCost=setDamageCost;
window.deductDamageFromDeposit=deductDamageFromDeposit;
window.downloadDamageReportPdf=downloadDamageReportPdf;
window.getTenantMoveInInspection=getTenantMoveInInspection;
