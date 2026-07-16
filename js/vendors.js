/* Vendor management — maintenance sub-page, modals, ratings, reports */

window.NESTIQ_TRADE_TYPES=[
  'Plumber','Electrician','General Handyman','Painter','Pest Control','Locksmith',
  'Structural Engineer','Roofer','Tiler','Carpenter','Garden and Landscaping',
  'Cleaning Service','Security','Appliance Repair','HVAC and Air Conditioning','Other'
];

const NESTIQ_ISSUE_TO_TRADE={
  Plumbing:'Plumber',
  Electrical:'Electrician',
  'General Handyman':'General Handyman',
  Painter:'Painter',
  'Pest Control':'Pest Control',
  Locksmith:'Locksmith',
  'Structural Engineer':'Structural Engineer',
  Structural:'Structural Engineer',
  Appliance:'Appliance Repair',
  Other:'Other'
};

const NESTIQ_TRADE_ICONS={
  Plumber:'🔧',Electrician:'⚡','General Handyman':'🛠️',Painter:'🎨','Pest Control':'🐛',
  Locksmith:'🔑','Structural Engineer':'🏗️',Roofer:'🏠',Tiler:'🧱',Carpenter:'🪚',
  'Garden and Landscaping':'🌳','Cleaning Service':'🧹',Security:'🛡️',
  'Appliance Repair':'🔌','HVAC and Air Conditioning':'❄️',Other:'📋'
};
window.NESTIQ_TRADE_ICONS=NESTIQ_TRADE_ICONS;

let __nestiqVendorFilterChip='All';
let __nestiqVendorDetailCharts=[];
let __nestiqVendorStarsDraft=0;

function nestiqVEsc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function nestiqTradeForIssue(cat){
  return NESTIQ_ISSUE_TO_TRADE[String(cat||'').trim()]||'Other';
}

function nestiqVendorsActive(){
  return(vendors||[]).filter(v=>v&&v.active!==false);
}

function nestiqVendorIcon(type){
  return NESTIQ_TRADE_ICONS[type]||NESTIQ_TRADE_ICONS.Other;
}

function nestiqStarsHtml(avg,countLabel){
  const a=Number(avg);
  const full=Math.min(5,Math.max(0,Number.isFinite(a)&&a>0?Math.round(a):0));
  let h='';
  for(let i=1;i<=5;i++){
    h+=i<=full
      ?`<span style="color:var(--gold)">★</span>`
      :`<span style="color:var(--border-soft)">☆</span>`;
  }
  return`<span style="letter-spacing:1px" aria-label="${full} of 5 stars">${h}</span>${countLabel?` <span style="color:var(--muted);font-size:0.75rem">${countLabel}</span>`:''}`;
}

function nestiqVendorMonthKey(d){
  const x=d instanceof Date?d:new Date();
  return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
}

function nestiqVendorActiveThisMonthCount(list){
  const ym=nestiqVendorMonthKey(new Date());
  const seen=new Set();
  (list||[]).forEach(v=>{
    if(!v) return;
    if(String(v.lastUsed||'').startsWith(ym)) seen.add(v.id);
  });
  (maintenanceData||[]).forEach(m=>{
    if(!m||m.vendorId==null) return;
    const d=String(m.completedDate||m.date||'').slice(0,7);
    if(d===ym) seen.add(Number(m.vendorId));
  });
  return seen.size;
}

function nestiqVendorsAverageRating(list){
  const rated=(list||[]).filter(v=>Number(v?.rating)>0);
  if(!rated.length) return 0;
  return rated.reduce((s,v)=>s+Number(v.rating),0)/rated.length;
}

function nestiqWaDigits(phone){
  return String(phone||'').replace(/\D/g,'');
}

function nestiqLandlordNameForMsg(){
  return landlordName||landlordSettings?.name||'Landlord';
}

function nestiqSwitchMaintSubtab(tab){
  const kan=document.getElementById('maintKanbanPanel');
  const ven=document.getElementById('maintVendorsPanel');
  const ta=document.getElementById('maintTrackerActions');
  const va=document.getElementById('maintVendorsActions');
  document.querySelectorAll('.nestiq-maint-subtab').forEach(b=>{
    const on=b.getAttribute('data-maint-tab')===tab;
    b.classList.toggle('btn-primary',on);
    b.classList.toggle('btn-outline',!on);
  });
  if(tab==='vendors'){
    if(kan) kan.style.display='none';
    if(ven) ven.style.display='block';
    if(ta) ta.style.display='none';
    if(va) va.style.display='flex';
    nestiqCloseVendorDetail(false);
    nestiqRenderVendorList();
  }else{
    if(kan) kan.style.display='block';
    if(ven) ven.style.display='none';
    if(ta) ta.style.display='flex';
    if(va) va.style.display='none';
    renderKanban?.();
  }
}

function nestiqVendorGridEl(){
  return document.getElementById('vendorsList')
    || document.getElementById('nestiqVendorGrid');
}

function nestiqVendorFilterHostEl(){
  return document.getElementById('vendorFilterChips')
    || document.getElementById('nestiqVendorFilterChips');
}

function nestiqVendorSearchValue(){
  const a=document.getElementById('vendorSearchInput');
  if(a) return String(a.value||'').trim().toLowerCase();
  const b=document.getElementById('nestiqVendorSearch');
  return String(b?.value||'').trim().toLowerCase();
}

function nestiqRenderVendorStats(){
  const host=document.getElementById('vendorStatsRow');
  if(!host) return;
  const all=Array.isArray(vendors)?vendors:[];
  const activeMonth=nestiqVendorActiveThisMonthCount(all);
  const avg=nestiqVendorsAverageRating(all);
  const jobs=all.reduce((s,v)=>s+Number(v.jobsCompleted||0),0);
  const avgLbl=avg>0?nestiqStarsHtml(avg,avg.toFixed(1)):'—';
  host.innerHTML=`
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${all.length}</div><div class="nestiq-app-stat-lbl">Total Vendors</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-green"><div class="nestiq-app-stat-val">${activeMonth}</div><div class="nestiq-app-stat-lbl">Active This Month</div></div>
    <div class="nestiq-app-stat-card nestiq-app-stat-amber"><div class="nestiq-app-stat-val" style="font-size:1.05rem;line-height:1.2">${avgLbl}</div><div class="nestiq-app-stat-lbl">Average Rating</div></div>
    <div class="nestiq-app-stat-card"><div class="nestiq-app-stat-val">${jobs}</div><div class="nestiq-app-stat-lbl">Total Jobs Completed</div></div>`;
}

function nestiqRenderVendorFilterChips(){
  const host=nestiqVendorFilterHostEl();
  if(!host) return;
  const chips=['All',...window.NESTIQ_TRADE_TYPES];
  host.innerHTML=chips.map(c=>{
    const on=__nestiqVendorFilterChip===c;
    return`<button type="button" class="filter-chip ${on?'active':''}" onclick='nestiqSetVendorFilterChip(${JSON.stringify(c)})'>${nestiqVEsc(c)}</button>`;
  }).join('');
}

function nestiqSetVendorFilterChip(c){
  __nestiqVendorFilterChip=c;
  nestiqRenderVendorFilterChips();
  nestiqRenderVendorList();
}

function nestiqFilterVendors(query){
  const q=String(query??'');
  const main=document.getElementById('vendorSearchInput');
  const hidden=document.getElementById('nestiqVendorSearch');
  if(main&&document.activeElement!==main) main.value=q;
  if(hidden) hidden.value=q;
  nestiqRenderVendorList(true);
}

function nestiqExportVendorsCSV(){
  const rows=[['Name','Company','Trade','Phone','WhatsApp','Email','Active','Jobs Completed','Total Billed','Rating','Rating Count','Last Used','Notes']];
  (vendors||[]).forEach(v=>{
    if(!v) return;
    rows.push([
      v.name||'',v.company||'',v.type||'',v.phone||'',v.whatsapp||'',v.email||'',
      v.active===false?'No':'Yes',
      String(v.jobsCompleted||0),
      String(v.totalCostBilled||0),
      String(v.rating||''),
      String(v.ratingCount||0),
      String(v.lastUsed||''),
      String(v.notes||'')
    ]);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  if(typeof downloadCSV==='function') downloadCSV(csv,'nestiq-vendors.csv');
  else{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='nestiq-vendors.csv';
    a.click();
  }
  showNotif?.('Vendors CSV exported','success');
}

function nestiqRenderVendorsPage(){
  normalizeDataModel?.();
  nestiqCloseVendorDetail(false);
  nestiqRenderVendorStats();
  nestiqRenderVendorFilterChips();
  nestiqRenderVendorList();
}

function nestiqRenderVendorList(skipFullNormalize){
  if(!skipFullNormalize) normalizeDataModel?.();
  const grid=nestiqVendorGridEl();
  const empty=document.getElementById('nestiqVendorEmpty');
  const listV=document.getElementById('nestiqVendorListView');
  const countLine=document.getElementById('nestiqVendorCountLine');
  if(listV) listV.style.display='block';
  const all=vendors||[];
  const q=nestiqVendorSearchValue();
  let list=all.filter(v=>{
    if(!v) return false;
    if(__nestiqVendorFilterChip!=='All'&&String(v.type)!==__nestiqVendorFilterChip) return false;
    if(!q) return true;
    return String(v.name||'').toLowerCase().includes(q)
      ||String(v.type||'').toLowerCase().includes(q)
      ||String(v.phone||'').toLowerCase().includes(q)
      ||String(v.whatsapp||'').replace(/\D/g,'').includes(q.replace(/\D/g,''));
  });
  if(countLine) countLine.textContent=`${list.length} of ${all.length} contractor${all.length===1?'':'s'} shown`;
  if(!skipFullNormalize){
    nestiqRenderVendorStats();
    nestiqRenderVendorFilterChips();
  }
  if(!grid) return;
  if(!all.length){
    grid.innerHTML='';
    if(empty){
      empty.style.display='block';
      empty.innerHTML=`
        <div style="font-size:2.4rem;margin-bottom:10px">🛠️</div>
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:6px">No vendors yet</div>
        <p style="color:var(--muted);font-size:0.88rem;max-width:36ch;margin:0 auto 16px">Add plumbers, electricians and other contractors so you can assign them on maintenance jobs.</p>
        <button type="button" class="btn-gold btn-sm" onclick="nestiqOpenAddVendorModal()">Add Your First Vendor</button>`;
    }
    return;
  }
  if(empty) empty.style.display='none';
  if(!list.length){
    grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:32px">No vendors match your filters.</div>`;
    return;
  }
  grid.innerHTML=list.map(v=>nestiqVendorCardHtml(v)).join('');
}

function nestiqVendorCardHtml(v){
  const jobs=Number(v.jobsCompleted||0);
  const last=String(v.lastUsed||'').slice(0,10)||'—';
  const tel=nestiqWaDigits(v.phone);
  const phoneDisp=nestiqVEsc(v.phone||'—');
  const idJson=JSON.stringify(v.id);
  return`
  <div class="nestiq-vendor-card" data-vendor-id="${nestiqVEsc(v.id)}">
    <span class="nestiq-vendor-card-icon" aria-hidden="true">${nestiqVendorIcon(v.type)}</span>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-right:36px">
      <span class="badge badge-amber" style="font-size:0.7rem">${nestiqVEsc(v.type||'Other')}</span>
    </div>
    <div style="font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700">${nestiqVEsc(v.name)}</div>
    <div style="font-size:0.88rem">
      ${tel?`<a href="tel:${tel}" style="color:inherit;text-decoration:underline;text-underline-offset:2px">${phoneDisp}</a>`:phoneDisp}
    </div>
    <div>${nestiqStarsHtml(v.rating)}</div>
    <div style="font-size:0.84rem;color:var(--muted)">${jobs} job${jobs===1?'':'s'} completed</div>
    <div style="font-size:0.78rem;color:var(--muted)">Last used: ${nestiqVEsc(last)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:8px">
      <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenAddVendorModal(${idJson})'>✏️ Edit</button>
      <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick='nestiqDeleteVendorConfirm(${idJson})'>🗑️ Remove</button>
    </div>
  </div>`;
}

function nestiqCloseVendorDetail(clear){
  const d=document.getElementById('nestiqVendorDetailView');
  const l=document.getElementById('nestiqVendorListView');
  if(d){ d.style.display='none'; d.innerHTML=''; }
  if(l&&clear!==false) l.style.display='block';
  __nestiqVendorDetailCharts.forEach(c=>{ try{ c.destroy(); }catch(e){} });
  __nestiqVendorDetailCharts=[];
}

function nestiqOpenVendorDetail(vid){
  normalizeDataModel?.();
  const v=(vendors||[]).find(x=>Number(x.id)===Number(vid));
  if(!v) return;
  const listV=document.getElementById('nestiqVendorListView');
  const d=document.getElementById('nestiqVendorDetailView');
  if(listV) listV.style.display='none';
  if(!d) return;
  d.style.display='block';
  const jobs=(maintenanceData||[]).filter(m=>Number(m.vendorId)===Number(v.id)).slice().sort((a,b)=>String(b.completedDate||b.date||'').localeCompare(String(a.completedDate||a.date||'')));
  const done=jobs.filter(m=>m.status==='done');
  const totalB=done.reduce((s,m)=>s+(Number(m.actualCost)||0),0);
  const avgCost=done.length?Math.round(totalB/done.length):0;
  const avgRating=(()=>{
    const r=done.filter(m=>Number(m.vendorRating)>=1&&Number(m.vendorRating)<=5);
    return r.length?(r.reduce((s,m)=>s+Number(m.vendorRating),0)/r.length).toFixed(1):'—';
  })();
  const breakdown={1:0,2:0,3:0,4:0,5:0};
  done.forEach(m=>{
    const n=Math.round(Number(m.vendorRating));
    if(n>=1&&n<=5) breakdown[n]++;
  });
  const wa=nestiqWaDigits(v.whatsapp||v.phone);
  const tel=nestiqWaDigits(v.phone);
  d.innerHTML=`
    <div style="margin-bottom:16px">
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseVendorDetail()">← Back to vendors</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:22px;align-items:start" class="nestiq-vendor-detail-grid">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="settings-card" style="margin:0">
          <div style="font-size:2.5rem">${nestiqVendorIcon(v.type)}</div>
          <h2 style="font-family:'Playfair Display',serif;margin:8px 0 4px">${nestiqVEsc(v.name)}</h2>
          ${v.company?`<div style="color:var(--muted);font-size:0.88rem">${nestiqVEsc(v.company)}</div>`:''}
          <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
            <span class="badge badge-amber">${nestiqVEsc(v.type)}</span>
            ${v.active!==false?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Inactive</span>'}
          </div>
          <div style="margin-top:12px">${nestiqStarsHtml(v.rating,`${v.ratingCount||0} ratings`)}</div>
          <p style="font-size:0.88rem;margin-top:8px"><strong>${done.length}</strong> jobs · <strong style="color:var(--gold)">R${totalB.toLocaleString('en-ZA')}</strong> billed</p>
        </div>
        <div class="settings-card" style="margin:0">
          <h3 class="settings-card-title">Contact</h3>
          <p style="font-size:0.88rem">${tel?`<a href="tel:${tel}">${nestiqVEsc(v.phone)}</a>`:nestiqVEsc(v.phone||'—')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            ${tel?`<a class="btn-outline btn-sm" href="tel:${tel}">Call</a>`:''}
            ${wa?`<a class="btn-outline btn-sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>`:''}
          </div>
          ${v.email?`<p style="font-size:0.86rem;margin-top:10px"><a href="mailto:${nestiqVEsc(v.email)}">${nestiqVEsc(v.email)}</a></p>`:''}
          ${v.address?`<p style="font-size:0.82rem;color:var(--muted);margin-top:8px">${nestiqVEsc(v.address)}</p>`:''}
          ${wa?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
            <a class="btn-outline btn-sm" style="font-size:0.7rem" href="https://wa.me/${wa}?text=${encodeURIComponent(nestiqVendorWaTemplate('quote',v,{title:'[issue]',description:'',property:'',propertyId:null},{}))}" target="_blank" rel="noopener">Quote template</a>
            <a class="btn-outline btn-sm" style="font-size:0.7rem" href="https://wa.me/${wa}?text=${encodeURIComponent(nestiqVendorWaTemplate('confirm',v,{title:'',property:'[property]',propertyId:null},{date:'[date]',time:'[time]'}))}" target="_blank" rel="noopener">Confirm apt</a>
            <a class="btn-outline btn-sm" style="font-size:0.7rem" href="https://wa.me/${wa}?text=${encodeURIComponent(nestiqVendorWaTemplate('paid',v,{title:'[job]',property:'[property]',propertyId:null},{amt:0,ref:'[ref]'}))}" target="_blank" rel="noopener">Payment sent</a>
          </div>`:''}
        </div>
        <div class="settings-card" style="margin:0">
          <h3 class="settings-card-title">Payment</h3>
          <div style="font-size:0.84rem;line-height:1.5">
            ${v.bankName?`<div>Bank: ${nestiqVEsc(v.bankName)}</div>`:''}
            ${v.accountNumber?`<div>Acc: ${nestiqVEsc(v.accountNumber)}</div>`:''}
            ${v.branchCode?`<div>Branch: ${nestiqVEsc(v.branchCode)}</div>`:''}
            ${v.accountType?`<div>Type: ${nestiqVEsc(v.accountType)}</div>`:''}
            ${v.vatNumber?`<div>VAT: ${nestiqVEsc(v.vatNumber)}</div>`:''}
            ${!v.bankName&&!v.accountNumber?'<div style="color:var(--muted)">Not set</div>':''}
          </div>
          <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="nestiqVendorPaymentRequestPrint(${v.id})">Generate Payment Request</button>
        </div>
        <div class="settings-card" style="margin:0">
          <h3 class="settings-card-title">Actions</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenAddVendorModal(${v.id})">Edit Vendor</button>
            ${v.active!==false?`<button type="button" class="btn-outline btn-sm" onclick="nestiqDeactivateVendor(${v.id})">Deactivate</button>`:`<button type="button" class="btn-outline btn-sm" onclick="nestiqActivateVendor(${v.id})">Activate</button>`}
            <button type="button" class="btn-outline btn-sm" style="border-color:var(--rust);color:var(--rust)" onclick="nestiqDeleteVendorConfirm(${v.id})">Delete Vendor</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
          <div class="settings-card" style="margin:0;padding:12px;text-align:center"><div style="font-size:1.25rem;font-weight:700">${done.length}</div><div style="font-size:0.72rem;color:var(--muted)">Total jobs</div></div>
          <div class="settings-card" style="margin:0;padding:12px;text-align:center"><div style="font-size:1.1rem;font-weight:700;color:var(--gold)">R${totalB.toLocaleString('en-ZA')}</div><div style="font-size:0.72rem;color:var(--muted)">Total billed</div></div>
          <div class="settings-card" style="margin:0;padding:12px;text-align:center"><div style="font-size:1.1rem;font-weight:700">R${avgCost.toLocaleString('en-ZA')}</div><div style="font-size:0.72rem;color:var(--muted)">Avg cost</div></div>
          <div class="settings-card" style="margin:0;padding:12px;text-align:center"><div style="font-size:1.1rem;font-weight:700">${avgRating}</div><div style="font-size:0.72rem;color:var(--muted)">Avg rating</div></div>
        </div>
        <div class="settings-card" style="margin:0">
          <h3 class="settings-card-title">Rating breakdown</h3>
          ${[5,4,3,2,1].map(n=>{
            const c=breakdown[n]||0;
            const max=Math.max(1,...Object.values(breakdown));
            const pct=Math.round(100*c/max);
            return`<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.8rem"><span style="width:52px">${n}★</span><div style="flex:1;height:8px;background:var(--cream);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--gold)"></div></div><span style="width:24px;text-align:right">${c}</span></div>`;
          }).join('')}
        </div>
        <div class="settings-card" style="margin:0">
          <h3 class="settings-card-title">Monthly billing (12 mo)</h3>
          <div style="height:200px"><canvas id="nestiqVendorMonthChart"></canvas></div>
        </div>
        <div class="settings-card" style="margin:0;overflow:auto">
          <h3 class="settings-card-title">Job history</h3>
          <table class="settings-email-table" style="font-size:0.78rem">
            <thead><tr><th>Date</th><th>Property</th><th>Issue</th><th>Status</th><th>Est</th><th>Act</th><th>★</th><th></th></tr></thead>
            <tbody>
            ${jobs.length?jobs.map(m=>{
              const rated=Number(m.vendorRating)>=1&&Number(m.vendorRating)<=5;
              return`<tr>
                <td>${nestiqVEsc(String(m.completedDate||m.date||'').slice(0,10))}</td>
                <td>${nestiqVEsc(m.property||'—')}</td>
                <td>${nestiqVEsc(m.title||'')}</td>
                <td>${nestiqVEsc(m.status||'')}</td>
                <td>R${(Number(m.estimatedCost)||0).toLocaleString('en-ZA')}</td>
                <td>R${(Number(m.actualCost)||0).toLocaleString('en-ZA')}</td>
                <td>${rated?m.vendorRating:'—'}</td>
                <td>${m.status==='done'&&!rated?`<button type="button" class="btn-outline btn-sm" style="padding:2px 6px;font-size:0.68rem" onclick="nestiqOpenVendorRatingModal(${m.id})">Rate</button>`:''}</td>
              </tr>`;
            }).join(''):'<tr><td colspan="8" style="color:var(--muted)">No jobs yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <style>@media(max-width:900px){.nestiq-vendor-detail-grid{grid-template-columns:1fr!important}}</style>
  `;
  nestiqVendorDetailMonthChart(v,done);
}

function nestiqVendorDetailMonthChart(v,doneJobs){
  const ChartRef=window.Chart;
  const el=document.getElementById('nestiqVendorMonthChart');
  if(!ChartRef||!el) return;
  const now=new Date();
  const labels=[];
  const data=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(d.toLocaleDateString('en-ZA',{month:'short',year:'2-digit'}));
    const sum=doneJobs.reduce((s,m)=>{
      const iso=String(m.completedDate||'');
      if(iso.startsWith(key)) return s+(Number(m.actualCost)||0);
      return s;
    },0);
    data.push(sum);
  }
  __nestiqVendorDetailCharts.push(new ChartRef(el,{
    type:'bar',
    data:{labels,datasets:[{label:'Billed',data,backgroundColor:'rgba(201,168,76,0.55)',borderColor:'#c9a84c',borderWidth:1}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:x=>'R'+x}}}}
  }));
}

function nestiqVendorPaymentRequestPrint(vid){
  const v=(vendors||[]).find(x=>Number(x.id)===Number(vid));
  if(!v) return;
  const amt=prompt('Amount (R) for payment request?','');
  if(amt==null) return;
  const prop=prompt('Reference property name (optional)', '');
  const ref=`${prop||'Property'} maintenance`;
  const w=window.open('','_blank');
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Payment Request</title><style>body{font-family:system-ui;padding:24px;max-width:560px}</style></head><body>
    <h2>Payment request</h2>
    <p>Please process payment to:</p>
    <p><strong>${nestiqVEsc(v.name)}</strong><br>
    ${v.bankName?`${nestiqVEsc(v.bankName)}<br>`:''}
    Acc: ${nestiqVEsc(v.accountNumber||'—')}<br>
    Branch: ${nestiqVEsc(v.branchCode||'—')}</p>
    <p><strong>Amount:</strong> R${Number(amt)||0}</p>
    <p><strong>Reference:</strong> ${nestiqVEsc(ref)}</p>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
}

function nestiqDeactivateVendor(id){
  const v=(vendors||[]).find(x=>Number(x.id)===Number(id));
  if(v){ v.active=false; saveData(); normalizeDataModel?.(); showNotif('Vendor deactivated','success'); nestiqOpenVendorDetail(id); }
}

function nestiqActivateVendor(id){
  const v=(vendors||[]).find(x=>Number(x.id)===Number(id));
  if(v){ v.active=true; saveData(); normalizeDataModel?.(); showNotif('Vendor activated','success'); nestiqOpenVendorDetail(id); }
}

function nestiqDeleteVendorConfirm(id){
  if(!confirm('Delete this vendor? Job history will keep past assignments.')) return;
  vendors=(vendors||[]).filter(x=>Number(x.id)!==Number(id));
  saveData();
  normalizeDataModel?.();
  showNotif('Vendor deleted','warning');
  nestiqCloseVendorDetail();
  if(document.getElementById('vendorsList')||document.getElementById('vendorStatsRow')) nestiqRenderVendorsPage();
  else nestiqRenderVendorList();
}

function nestiqOpenAddVendorModal(existingId){
  const v=existingId?(vendors||[]).find(x=>Number(x.id)===Number(existingId)):null;
  const isNew=!v;
  const typeOpts=window.NESTIQ_TRADE_TYPES.map(t=>`<option value="${nestiqVEsc(t)}" ${(v?.type||'')===t?'selected':''}>${nestiqVEsc(t)}</option>`).join('');
  const pref=Array.isArray(v?.preferredFor)?v.preferredFor.map(Number):[];
  const propChecks=(propertiesData||[]).map(p=>`<label style="display:flex;gap:8px;align-items:center;font-size:0.84rem;margin:4px 0"><input type="checkbox" class="v_pref_prop" value="${p.id}" ${pref.includes(Number(p.id))?'checked':''}> ${nestiqVEsc(p.name)}</label>`).join('');
  __nestiqVendorStarsDraft=0;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">${isNew?'Add New Vendor':'Edit Vendor'}</h2>
    <div style="max-height:70vh;overflow:auto;padding-right:4px">
      <div style="font-weight:700;margin:12px 0 8px">Contact</div>
      <div class="form-group"><label>Full name *</label><input class="form-input" id="nv_name" value="${nestiqVEsc(v?.name||'')}" required></div>
      <div class="form-group"><label>Company</label><input class="form-input" id="nv_company" value="${nestiqVEsc(v?.company||'')}"></div>
      <div class="form-group"><label>Trade type *</label><select class="form-input" id="nv_type">${typeOpts}</select></div>
      <div class="form-group"><label>Phone *</label><input class="form-input" id="nv_phone" value="${nestiqVEsc(v?.phone||'')}"></div>
      <div class="form-group"><label>WhatsApp</label><input class="form-input" id="nv_wa" placeholder="Defaults to phone" value="${nestiqVEsc(v?.whatsapp||'')}"></div>
      <div class="form-group"><label>Email</label><input class="form-input" id="nv_email" type="email" value="${nestiqVEsc(v?.email||'')}"></div>
      <div class="form-group"><label>Address</label><textarea class="form-input" id="nv_addr" rows="2">${nestiqVEsc(v?.address||'')}</textarea></div>
      <div style="font-weight:700;margin:16px 0 8px">Rating & notes</div>
      ${isNew?`<div class="form-group"><label>Initial rating (optional)</label>
        <div id="nv_stars_pick" style="font-size:1.6rem;cursor:pointer;letter-spacing:4px;color:var(--gold)">${[1,2,3,4,5].map(i=>`<span data-s="${i}" onclick="nestiqVendorStarPick(${i})">☆</span>`).join('')}</div>
        <div style="font-size:0.76rem;color:var(--muted)">Optional — job ratings will refine this over time</div>
      </div>`:`<p style="font-size:0.82rem;color:var(--muted)">Overall rating is averaged from job ratings after you complete maintenance.</p>`}
      <div class="form-group"><label>Notes</label><textarea class="form-input" id="nv_notes" rows="2" placeholder="Strengths, weaknesses…">${nestiqVEsc(v?.notes||'')}</textarea></div>
      <div class="form-group"><label>Preferred properties</label><div style="max-height:120px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px">${propChecks||'<span style="color:var(--muted)">No properties</span>'}</div></div>
      <label style="display:flex;gap:10px;align-items:center;margin:12px 0;font-size:0.88rem"><input type="checkbox" id="nv_active" ${v?.active!==false?'checked':''}> Active</label>
      <div style="font-weight:700;margin:16px 0 8px">Payment details</div>
      <p style="font-size:0.78rem;color:var(--muted);margin:-4px 0 8px">Used when generating payment requests</p>
      <div class="form-group"><label>Bank name</label><input class="form-input" id="nv_bank" value="${nestiqVEsc(v?.bankName||'')}"></div>
      <div class="form-group"><label>Account number</label><input class="form-input" id="nv_acc" value="${nestiqVEsc(v?.accountNumber||'')}"></div>
      <div class="form-group"><label>Branch code</label><input class="form-input" id="nv_branch" value="${nestiqVEsc(v?.branchCode||'')}"></div>
      <div class="form-group"><label>Account type</label><select class="form-input" id="nv_acctype"><option value="Cheque" ${(v?.accountType||'Cheque')==='Cheque'?'selected':''}>Cheque</option><option value="Savings" ${v?.accountType==='Savings'?'selected':''}>Savings</option></select></div>
      <div class="form-group"><label>VAT number</label><input class="form-input" id="nv_vat" value="${nestiqVEsc(v?.vatNumber||'')}"></div>
    </div>
    <button type="button" class="btn-primary" style="width:100%;justify-content:center;margin-top:14px" onclick="nestiqSaveVendorForm(${isNew?'null':v.id})">${isNew?'Add Vendor':'Save'}</button>
    <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqVendorStarPick(n){
  __nestiqVendorStarsDraft=n;
  const el=document.getElementById('nv_stars_pick');
  if(el) el.innerHTML=[1,2,3,4,5].map(i=>`<span data-s="${i}" style="cursor:pointer" onclick="nestiqVendorStarPick(${i})">${i<=n?'★':'☆'}</span>`).join('');
}

function nestiqSaveVendorForm(existingId){
  const name=document.getElementById('nv_name')?.value?.trim()||'';
  if(!name){ showNotif('Name required','error'); return; }
  const phone=document.getElementById('nv_phone')?.value?.trim()||'';
  if(!phone){ showNotif('Phone required','error'); return; }
  const type=document.getElementById('nv_type')?.value||'Other';
  const wa=document.getElementById('nv_wa')?.value?.trim()||phone;
  const prefs=[...document.querySelectorAll('.v_pref_prop:checked')].map(c=>Number(c.value)).filter(Number.isFinite);
  const payload={
    name,company:document.getElementById('nv_company')?.value?.trim()||'',type,phone,
    whatsapp:wa,email:document.getElementById('nv_email')?.value?.trim()||'',
    address:document.getElementById('nv_addr')?.value?.trim()||'',
    notes:document.getElementById('nv_notes')?.value?.trim()||'',
    bankName:document.getElementById('nv_bank')?.value?.trim()||'',
    accountNumber:document.getElementById('nv_acc')?.value?.trim()||'',
    branchCode:document.getElementById('nv_branch')?.value?.trim()||'',
    accountType:document.getElementById('nv_acctype')?.value||'Cheque',
    vatNumber:document.getElementById('nv_vat')?.value?.trim()||'',
    preferredFor:prefs,
    active:!!document.getElementById('nv_active')?.checked
  };
  if(existingId==null||existingId==='null'||!Number.isFinite(Number(existingId))){
    if(__nestiqVendorStarsDraft>0){
      payload.rating=__nestiqVendorStarsDraft;
      payload.ratingCount=1;
    }
  }
  if(existingId!=null&&existingId!=='null'&&Number.isFinite(Number(existingId))){
    const v=vendors.find(x=>Number(x.id)===Number(existingId));
    if(v){
      Object.assign(v,payload);
    }
    saveData();
    normalizeDataModel?.();
    closeModal();
    showNotif('Vendor updated','success');
  }else{
    const id=vendorNextId++;
    vendors.push({
      id,...payload,
      rating:__nestiqVendorStarsDraft||0,
      ratingCount:__nestiqVendorStarsDraft?1:0,
      jobsCompleted:0,totalCostBilled:0,
      createdAt:new Date().toISOString().slice(0,10),lastUsed:''
    });
    try{ window.vendorNextId=vendorNextId; }catch(e){}
    saveData();
    normalizeDataModel?.();
    closeModal();
    showNotif(`🔧 ${name} added to your vendor network`,'success');
  }
  if(document.getElementById('vendorsList')||document.getElementById('vendorStatsRow')) nestiqRenderVendorsPage();
  else nestiqRenderVendorList();
  renderKanban?.();
}

function nestiqOpenVendorRatingModal(maintId){
  const m=(maintenanceData||[]).find(x=>Number(x.id)===Number(maintId));
  if(!m) return;
  const v=(vendors||[]).find(x=>Number(x.id)===Number(m.vendorId));
  __nestiqVendorStarsDraft=0;
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Rate ${nestiqVEsc(v?.name||'vendor')}</h2>
    <p class="modal-sub">${nestiqVEsc(m.title||'Job')}</p>
    <div class="form-group"><label>Your rating</label>
      <div id="rate_stars" style="font-size:2rem;cursor:pointer;letter-spacing:6px;color:var(--gold)">${[1,2,3,4,5].map(i=>`<span onclick="nestiqRateJobStarPick(${i})">☆</span>`).join('')}</div>
    </div>
    <div class="form-group"><label>How did the job go?</label><textarea class="form-input" id="rate_notes" rows="3"></textarea></div>
    <button type="button" class="btn-primary" style="width:100%;justify-content:center" onclick="nestiqSubmitJobRating(${m.id})">Submit Rating</button>
    <button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqRateJobStarPick(n){
  __nestiqVendorStarsDraft=n;
  const el=document.getElementById('rate_stars');
  if(el) el.innerHTML=[1,2,3,4,5].map(i=>`<span style="cursor:pointer" onclick="nestiqRateJobStarPick(${i})">${i<=n?'★':'☆'}</span>`).join('');
}

function nestiqSubmitJobRating(maintId){
  if(!__nestiqVendorStarsDraft||__nestiqVendorStarsDraft<1){ showNotif('Pick a star rating','error'); return; }
  const m=(maintenanceData||[]).find(x=>Number(x.id)===Number(maintId));
  if(!m) return;
  m.vendorRating=__nestiqVendorStarsDraft;
  m.vendorRatingNotes=document.getElementById('rate_notes')?.value?.trim()||'';
  m.ratedDate=new Date().toISOString().slice(0,10);
  const v=(vendors||[]).find(x=>Number(x.id)===Number(m.vendorId));
  if(v) v.lastUsed=m.ratedDate;
  saveData();
  normalizeDataModel?.();
  closeModal();
  showNotif('Thanks — rating saved','success');
  renderKanban?.();
  nestiqRenderVendorList();
  const d=document.getElementById('nestiqVendorDetailView');
  if(d&&d.style.display!=='none'&&v) nestiqOpenVendorDetail(v.id);
}

function nestiqVendorAssignmentHtml(m){
  const propId=Number(m.propertyId);
  const trade=nestiqTradeForIssue(m.issueCategory||'Other');
  const all=nestiqVendorsActive();
  const preferred=all.filter(v=>Array.isArray(v.preferredFor)&&v.preferredFor.map(Number).includes(propId));
  const sameType=all.filter(v=>String(v.type)===trade);
  const seen=new Set();
  const ordered=[];
  [...preferred,...sameType,...all].forEach(v=>{
    if(seen.has(v.id)) return;
    seen.add(v.id);
    ordered.push(v);
  });
  const vOpts=`<option value="">— None —</option>`+ordered.map(v=>{
    const rs=(Number(v.rating)||0)>0?(Number(v.rating)).toFixed(1):'—';
    return`<option value="${v.id}" ${Number(m.vendorId)===Number(v.id)?'selected':''}>${nestiqVEsc(v.name)} (${nestiqVEsc(v.type)}) ★${rs}</option>`;
  }).join('');
  const prop=(propertiesData||[]).find(p=>Number(p.id)===propId)||{name:m.property||'',addr:''};
  const rec=preferred.length?`<div style="font-size:0.8rem;font-weight:600;margin:10px 0 6px;color:var(--gold)">Recommended for ${nestiqVEsc(prop.name||'property')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${preferred.map(v=>`<button type="button" class="btn-outline btn-sm" onclick="nestiqPickMaintVendor(${m.id},${v.id})">${nestiqVEsc(v.name)}</button>`).join('')}</div>`:'';
  const vObj=m.vendorId?(vendors||[]).find(x=>Number(x.id)===Number(m.vendorId)):null;
  const wa=nestiqWaDigits(vObj?.whatsapp||vObj?.phone||m.vendorPhone);
  const msg=encodeURIComponent(`Hi ${vObj?.name||'there'}, I have a maintenance job at ${prop.name}, ${prop.addr||''}.\nIssue: ${m.title||''}\n${m.description||''}\nPlease let me know your availability and rate. Thank you. — ${nestiqLandlordNameForMsg()}`);
  return`
    ${rec}
    <div style="font-weight:700;margin-bottom:8px">Assign vendor</div>
    <div class="form-group"><label>Vendor</label>
      <select class="form-input" id="edit_m_vendor" onchange="nestiqOnMaintVendorPick()">${vOpts}</select>
    </div>
    ${wa?`<a class="btn-whatsapp btn-sm" style="display:inline-flex;margin-top:8px;text-decoration:none" href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener">WhatsApp ${nestiqVEsc(vObj?.name||'vendor')} about this job</a>`:''}`;
}

function nestiqPickMaintVendor(maintId,vid){
  const m=(maintenanceData||[]).find(x=>Number(x.id)===Number(maintId));
  const v=(vendors||[]).find(x=>Number(x.id)===Number(vid));
  if(!m||!v) return;
  m.vendorId=v.id;
  m.vendorName=v.name;
  m.vendorPhone=v.phone||'';
  m.vendorType=v.type||'';
  saveData();
  openEditMaintenanceModal(m.id);
}

function nestiqNewMaintVendorFieldsHtml(){
  const all=nestiqVendorsActive();
  const vOpts=`<option value="">— None —</option>`+all.map(v=>`<option value="${v.id}">${nestiqVEsc(v.name)} (${nestiqVEsc(v.type)})</option>`).join('');
  return`
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div class="form-group"><label>Assign vendor (optional)</label>
        <select class="form-input" id="mt_vendor">${vOpts}</select>
      </div>
      <p style="font-size:0.76rem;color:var(--muted)">You can set costs after creating the request.</p>
    </div>`;
}

function nestiqVendorWaTemplate(kind,v,m,extra){
  const name=v?.name||'';
  const prop=m?(propertiesData||[]).find(p=>p.name===m.property||Number(p.id)===Number(m.propertyId)):{};
  const addr=prop?.addr||'';
  const ten=m?.tenantId?(tenantsData||[]).find(t=>Number(t.id)===Number(m.tenantId)):null;
  const L=nestiqLandlordNameForMsg();
  if(kind==='quote') return`Hi ${name}, I need a quote for ${m?.description||m?.title||'work'} at ${m?.property||''}, ${addr}. Please visit at your earliest convenience and send me a quote. Thank you. — ${L}`;
  if(kind==='confirm') return`Hi ${name}, confirming your appointment at ${m?.property||''} on ${extra?.date||'[date]'} at ${extra?.time||'[time]'}. Please contact ${ten?.name||'the tenant'} on ${ten?.phone||''} to arrange access. Thank you. — ${L}`;
  if(kind==='paid') return`Hi ${name}, payment of R${extra?.amt||0} for ${m?.title||'the job'} at ${m?.property||''} has been processed. Reference: ${extra?.ref||'—'}. Thank you for your service. — ${L}`;
  return`Hi ${name}, I have a maintenance job at ${m?.property||''}, ${addr}. Issue: ${m?.title||''}\n${m?.description||''}\nPlease let me know your availability and rate. Thank you. — ${L}`;
}

function nestiqVendorReportPrint(){
  normalizeDataModel?.();
  const from=prompt('Report from (YYYY-MM-DD)?', new Date(new Date().setMonth(new Date().getMonth()-12)).toISOString().slice(0,10));
  const to=prompt('Report to (YYYY-MM-DD)?', new Date().toISOString().slice(0,10));
  const jobs=(maintenanceData||[]).filter(m=>{
    if(m.status!=='done') return false;
    const d=String(m.completedDate||m.date||'').slice(0,10);
    return d>=String(from||'').slice(0,10)&&d<=String(to||'').slice(0,10);
  });
  const spend=jobs.reduce((s,m)=>s+(Number(m.actualCost)||0),0);
  const byVendor={};
  jobs.forEach(m=>{
    const vid=m.vendorId||m.vendorName||'—';
    const key=String(vid);
    if(!byVendor[key]) byVendor[key]={name:m.vendorName||(vendors||[]).find(v=>Number(v.id)===Number(m.vendorId))?.name||'—',trade:(vendors||[]).find(v=>Number(v.id)===Number(m.vendorId))?.type||m.vendorType||'—',jobs:0,sum:0};
    byVendor[key].jobs++;
    byVendor[key].sum+=Number(m.actualCost)||0;
  });
  const rows=Object.values(byVendor).sort((a,b)=>b.sum-a.sum);
  const most=rows[0];
  const rated=(vendors||[]).slice().filter(v=>Number(v.rating)>0).sort((a,b)=>Number(b.rating)-Number(a.rating));
  const bestRated=rated[0];
  const bestValue=(vendors||[]).slice().filter(v=>v.jobsCompleted>0).sort((a,b)=>(Number(b.rating)||0)/(1+Math.sqrt(b.totalCostBilled))-(Number(a.rating)||0)/(1+Math.sqrt(a.totalCostBilled)))[0];
  const byTrade={};
  jobs.forEach(m=>{
    const t=(vendors||[]).find(v=>Number(v.id)===Number(m.vendorId))?.type||m.vendorType||'Other';
    byTrade[t]=(byTrade[t]||0)+(Number(m.actualCost)||0);
  });
  const tradePieTotal=Object.values(byTrade).reduce((s,x)=>s+x,0);
  let tradeAngle=0;
  const pieColors=['#c9a84c','#5a7d5a','#8b2942','#3d5a80','#bc6c25','#606c38','#9b59b6','#e07a5f','#81b29a','#3d405b'];
  const piePaths=tradePieTotal>0?Object.entries(byTrade).map(([label,val],i)=>{
    const frac=val/tradePieTotal;
    const a0=tradeAngle;
    tradeAngle+=frac*Math.PI*2;
    const x1=Math.cos(a0), y1=Math.sin(a0);
    const x2=Math.cos(tradeAngle), y2=Math.sin(tradeAngle);
    const large=frac>0.5?1:0;
    return`<path d="M 0 0 L ${x1.toFixed(4)} ${y1.toFixed(4)} A 1 1 0 ${large} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z" fill="${pieColors[i%pieColors.length]}"><title>${nestiqVEsc(label)}: R${val.toLocaleString('en-ZA')}</title></path>`;
  }).join(''):'';
  const top5=[...jobs].sort((a,b)=>(Number(b.actualCost)||0)-(Number(a.actualCost)||0)).slice(0,5);
  const w=window.open('','_blank');
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Vendor Performance Report</title>
    <style>body{font-family:DM Sans,system-ui;padding:24px;max-width:900px} h1{font-family:Georgia,serif} table{border-collapse:collapse;width:100%;font-size:0.85rem} th,td{border:1px solid #ccc;padding:6px;text-align:left}</style></head><body>
    <h1>Vendor Performance Report</h1>
    <p>Period: ${nestiqVEsc(from)} → ${nestiqVEsc(to)}</p>
    <p>Total vendors: ${(vendors||[]).length} · Jobs in period: ${jobs.length} · Spend: R${spend.toLocaleString('en-ZA')}</p>
    <p>Most used (spend): ${most?nestiqVEsc(most.name):'—'} · Highest rated: ${bestRated?nestiqVEsc(bestRated.name):'—'} · Best value: ${bestValue?nestiqVEsc(bestValue.name):'—'}</p>
    <h3>Per vendor</h3>
    <table><thead><tr><th>Name</th><th>Trade</th><th>Jobs</th><th>Total</th><th>Avg</th><th>Rating</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${nestiqVEsc(r.name)}</td><td>${nestiqVEsc(r.trade)}</td><td>${r.jobs}</td><td>R${r.sum.toLocaleString('en-ZA')}</td><td>R${r.jobs?Math.round(r.sum/r.jobs):0}</td><td>—</td></tr>`).join('')}
    </tbody></table>
    <h3>Spend by trade</h3>
    <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;margin:12px 0">
    ${piePaths?`<svg width="200" height="200" viewBox="-1.15 -1.15 2.3 2.3" style="flex-shrink:0">${piePaths}</svg>`:'<p style="color:#666">No spend by trade in period.</p>'}
    <table style="flex:1;min-width:200px"><thead><tr><th>Trade</th><th>Amount</th></tr></thead><tbody>
    ${Object.entries(byTrade).map(([t,a])=>`<tr><td>${nestiqVEsc(t)}</td><td>R${a.toLocaleString('en-ZA')}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>Top 5 expensive jobs</h3>
    <table><thead><tr><th>Issue</th><th>Property</th><th>Cost</th></tr></thead><tbody>
    ${top5.map(m=>`<tr><td>${nestiqVEsc(m.title)}</td><td>${nestiqVEsc(m.property)}</td><td>R${(Number(m.actualCost)||0).toLocaleString('en-ZA')}</td></tr>`).join('')}
    </tbody></table>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
}

window.nestiqSwitchMaintSubtab=nestiqSwitchMaintSubtab;
window.nestiqRenderVendorList=nestiqRenderVendorList;
window.nestiqRenderVendorsPage=nestiqRenderVendorsPage;
window.nestiqFilterVendors=nestiqFilterVendors;
window.nestiqExportVendorsCSV=nestiqExportVendorsCSV;
window.nestiqOpenAddVendorModal=nestiqOpenAddVendorModal;
window.nestiqVendorStarPick=nestiqVendorStarPick;
window.nestiqSaveVendorForm=nestiqSaveVendorForm;
window.nestiqOpenVendorDetail=nestiqOpenVendorDetail;
window.nestiqCloseVendorDetail=nestiqCloseVendorDetail;
window.nestiqVendorPaymentRequestPrint=nestiqVendorPaymentRequestPrint;
window.nestiqDeactivateVendor=nestiqDeactivateVendor;
window.nestiqActivateVendor=nestiqActivateVendor;
window.nestiqDeleteVendorConfirm=nestiqDeleteVendorConfirm;
window.nestiqOpenVendorRatingModal=nestiqOpenVendorRatingModal;
window.nestiqRateJobStarPick=nestiqRateJobStarPick;
window.nestiqSubmitJobRating=nestiqSubmitJobRating;
window.nestiqVendorAssignmentHtml=nestiqVendorAssignmentHtml;
window.nestiqPickMaintVendor=nestiqPickMaintVendor;
window.nestiqNewMaintVendorFieldsHtml=nestiqNewMaintVendorFieldsHtml;
window.nestiqVendorReportPrint=nestiqVendorReportPrint;
window.nestiqVendorWaTemplate=nestiqVendorWaTemplate;
