let nestiqCalendarFilters={all:true,payments:true,due:true,maintenance:true,leases:true,custom:true};
let nestiqCalendarSources={};

function toISODate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n){ return new Date(d.getFullYear(), d.getMonth()+n, d.getDate()); }
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function parseAnyDate(v){
  if(!v) return null;
  const s=String(v).trim();
  if(!s || /available|tbd/i.test(s)) return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0,10));
  const d=new Date(s);
  if(String(d)!=='Invalid Date') return d;
  const m=s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if(m){
    const mon={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const mi=mon[m[2].slice(0,3).toLowerCase()];
    if(mi>=0) return new Date(Number(m[3]), mi, Number(m[1]));
  }
  return null;
}
function tenantLeaseEndDate(t){ return parseAnyDate(t.leaseEnd||t.lease); }
function getTenantById(id){ return tenantsData.find(t=>Number(t.id)===Number(id)); }
function getPaymentMonthKey(p){ const d=parseAnyDate(p.date); return d?monthKey(d):''; }
function paymentExistsForTenantMonth(tenant,y,m){ return (tenant.payments||[]).some(p=>getPaymentMonthKey(p)===`${y}-${String(m).padStart(2,'0')}`); }
function shortIssue(t){ const s=String(t||'').trim(); return s.length>25?`${s.slice(0,25)}...`:s; }

function generateCalendarEventsByType(type, info){
  const events=[];
  const rangeStart=info?.start?new Date(info.start):addMonths(new Date(),-2);
  const rangeEnd=info?.end?new Date(info.end):addMonths(new Date(),8);
  const now=new Date();

  if(type==='due'){
    for(const tenant of (tenantsData||[])){
      if(tenant.status==='vacant') continue;
      const ls=String(tenant.leaseStatus||'').toLowerCase();
      if(ls && ls!=='active' && ls!=='expired') continue;
      const leaseStart=parseAnyDate(tenant.leaseStart)||addMonths(now,-12);
      const leaseEnd=tenantLeaseEndDate(tenant)||addMonths(now,12);
      const start=new Date(Math.max(leaseStart,rangeStart));
      const end=new Date(Math.min(leaseEnd,rangeEnd));
      const leaseLike=typeof window.nestiqLeaseLikeFromTenant==='function'?window.nestiqLeaseLikeFromTenant(tenant):null;
      const periods=typeof window.nestiqLeaseSchedulePeriods==='function' && leaseLike
        ? window.nestiqLeaseSchedulePeriods(leaseLike, start, end)
        : null;
      if(periods&&periods.length){
        for(const p of periods){
          const paid=paymentExistsForTenantMonth(tenant,p.year,p.month);
          if(paid) continue;
          const past=p.dueDate < new Date(now.getFullYear(),now.getMonth(),now.getDate());
          const amt=Number(p.amount||tenant.rent||0);
          events.push(past?{
            id:`overdue-${tenant.id}-${p.year}-${p.month}`,
            title:`⚠ ${tenant.name} OVERDUE R${amt.toLocaleString('en-ZA')}`,
            start:toISODate(p.dueDate),
            allDay:true,
            color:'#c46a3a',
            textColor:'#ffffff',
            extendedProps:{type:'overdue',tenantId:tenant.id,amount:amt}
          }:{
            id:`due-${tenant.id}-${p.year}-${p.month}`,
            title:`${tenant.name} — R${amt.toLocaleString('en-ZA')} due`,
            start:toISODate(p.dueDate),
            allDay:true,
            color:'#c9a84c',
            textColor:'#0e1117',
            extendedProps:{type:'due',tenantId:tenant.id,amount:amt}
          });
        }
        continue;
      }
      const dueDate=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
      let cur=new Date(start.getFullYear(), start.getMonth(), dueDate);
      while(cur<=end){
        const y=cur.getFullYear(), m=cur.getMonth()+1;
        const paid=paymentExistsForTenantMonth(tenant,y,m);
        if(!paid){
          const past=cur < new Date(now.getFullYear(),now.getMonth(),now.getDate());
          events.push(past?{
            id:`overdue-${tenant.id}-${y}-${m}`,
            title:`⚠ ${tenant.name} OVERDUE R${Number(tenant.rent||0).toLocaleString('en-ZA')}`,
            start:toISODate(cur),
            allDay:true,
            color:'#c46a3a',
            textColor:'#ffffff',
            extendedProps:{type:'overdue',tenantId:tenant.id,amount:Number(tenant.rent||0)}
          }:{
            id:`due-${tenant.id}-${y}-${m}`,
            title:`${tenant.name} — R${Number(tenant.rent||0).toLocaleString('en-ZA')} due`,
            start:toISODate(cur),
            allDay:true,
            color:'#c9a84c',
            textColor:'#0e1117',
            extendedProps:{type:'due',tenantId:tenant.id,amount:Number(tenant.rent||0)}
          });
        }
        cur=addMonths(cur,1);
      }
    }
  }

  if(type==='payments'){
    for(const tenant of (tenantsData||[])){
      for(const payment of (tenant.payments||[])){
        if(!payment?.date) continue;
        events.push({
          id:`paid-${payment.id||Date.now()}`,
          title:`✓ ${tenant.name} R${Number(payment.amount||0).toLocaleString('en-ZA')} paid`,
          start:String(payment.date).slice(0,10),
          color:'#5a7a60',
          textColor:'#ffffff',
          extendedProps:{type:'paid',tenantId:tenant.id,payment}
        });
      }
    }
  }

  if(type==='leases'){
    for(const tenant of (tenantsData||[])){
      const start=parseAnyDate(tenant.leaseStart);
      const end=tenantLeaseEndDate(tenant);
      if(start){
        events.push({id:`lease-start-${tenant.id}`,title:`${tenant.name} lease starts`,start:toISODate(start),color:'#3a6b8a',textColor:'#ffffff',extendedProps:{type:'lease-start',tenantId:tenant.id}});
      }
      if(end){
        events.push({id:`lease-end-${tenant.id}`,title:`${tenant.name} lease expires`,start:toISODate(end),color:'#c46a3a',textColor:'#ffffff',extendedProps:{type:'lease-end',tenantId:tenant.id}});
        events.push({id:`lease-warn-${tenant.id}`,title:`⚠ ${tenant.name} lease in 30 days`,start:toISODate(addDays(end,-30)),color:'#e8a020',textColor:'#0e1117',extendedProps:{type:'lease-warning',tenantId:tenant.id}});
      }
    }
  }

  if(type==='maintenance'){
    for(const req of (maintenanceData||[])){
      const d=parseAnyDate(req.date)||new Date();
      events.push({
        id:`maint-${req.id}`,
        title:`🔧 ${shortIssue(req.title)}`,
        start:toISODate(d),
        color:'#7c5cbf',
        textColor:'#ffffff',
        extendedProps:{type:'maintenance',maintId:req.id}
      });
    }
  }

  if(type==='custom'){
    for(const e of (customEvents||[])){
      events.push({
        id:`custom-${e.id}`,
        title:e.title,
        start:e.date,
        allDay:e.allDay!==false,
        color:e.color||'#888',
        extendedProps:{type:'custom',eventId:e.id,notes:e.notes||''}
      });
    }
  }
  return events;
}

function generateCalendarEvents(info, success, failure){
  try{
    const ev=[
      ...generateCalendarEventsByType('due', info),
      ...generateCalendarEventsByType('payments', info),
      ...generateCalendarEventsByType('leases', info),
      ...generateCalendarEventsByType('maintenance', info),
      ...generateCalendarEventsByType('custom', info)
    ];
    success(ev);
  }catch(err){ failure(err); }
}

function styleCalendarEvent(info){
  info.el.style.border='none';
  info.el.style.borderRadius='4px';
}

function buildCalendarSourceDefs(){
  return {
    due:{id:'due-source',events:(i,s,f)=>s(generateCalendarEventsByType('due',i))},
    payments:{id:'payments-source',events:(i,s,f)=>s(generateCalendarEventsByType('payments',i))},
    leases:{id:'leases-source',events:(i,s,f)=>s(generateCalendarEventsByType('leases',i))},
    maintenance:{id:'maintenance-source',events:(i,s,f)=>s(generateCalendarEventsByType('maintenance',i))},
    custom:{id:'custom-source',events:(i,s,f)=>s(generateCalendarEventsByType('custom',i))}
  };
}

function applyCalendarFilters(){
  const cal=window.nestiqCalendar;
  if(!cal) return;
  cal.getEventSources().forEach(src=>src.remove());
  const defs=buildCalendarSourceDefs();
  nestiqCalendarSources=defs;
  const allOn=nestiqCalendarFilters.all;
  for(const key of ['due','payments','leases','maintenance','custom']){
    if(allOn || nestiqCalendarFilters[key]) cal.addEventSource(defs[key]);
  }
  cal.refetchEvents();
}

function renderCalendarSidebar(){
  const cal=window.nestiqCalendar;
  if(!cal) return;
  const now=cal.getDate();
  const ym=monthKey(now);
  const dueTenants=(tenantsData||[]).filter(t=>t.status!=='vacant');
  const expected=dueTenants.reduce((s,t)=>s+Number(t.rent||0),0);
  const collected=dueTenants.reduce((s,t)=>{
    const p=(t.payments||[]).filter(x=>getPaymentMonthKey(x)===ym).reduce((a,b)=>a+Number(b.amount||0),0);
    return s+p;
  },0);
  const outstanding=Math.max(0, expected-collected);
  const rate=expected>0?Math.min(100,Math.round((collected/expected)*100)):0;
  const sum=document.getElementById('calendarMonthSummary');
  if(sum){
    sum.innerHTML=`
      <div class="fc-side-row"><span>Expected</span><strong>R${expected.toLocaleString('en-ZA')}</strong></div>
      <div class="fc-side-row"><span>Collected</span><strong>R${collected.toLocaleString('en-ZA')}</strong></div>
      <div class="fc-side-row"><span>Outstanding</span><strong>R${outstanding.toLocaleString('en-ZA')}</strong></div>
      <div style="margin-top:8px"><div style="font-size:.76rem;color:var(--muted);margin-bottom:4px">Collection Rate: ${rate}%</div><div style="height:8px;background:var(--cream);border-radius:999px;overflow:hidden"><div style="height:8px;width:${rate}%;background:var(--gold)"></div></div></div>
    `;
  }
  const up=document.getElementById('calendarUpcoming');
  if(up){
    const start=new Date(); start.setHours(0,0,0,0);
    const end=addDays(start,7);
    const ev=cal.getEvents()
      .filter(e=>e.start>=start && e.start<=end)
      .sort((a,b)=>a.start-b.start)
      .slice(0,12);
    up.innerHTML=ev.length?ev.map(e=>`<div class="fc-up-item" onclick="jumpCalendarToDate('${toISODate(e.start)}')"><div class="fc-up-date">${e.start.toLocaleDateString('en-ZA')}</div><div class="fc-up-title"><span class="fc-dot" style="background:${e.backgroundColor||e.borderColor||'#888'}"></span> ${e.title}</div></div>`).join(''):`<div style="font-size:.82rem;color:var(--muted)">No upcoming events.</div>`;
  }
}

function jumpCalendarToDate(iso){ if(window.nestiqCalendar) window.nestiqCalendar.gotoDate(iso); }

function handleCalendarEventClick(info){
  const props=info.event.extendedProps||{};
  const tenant=getTenantById(props.tenantId);
  const date=info.event.start?.toLocaleDateString('en-ZA')||'—';
  let title='Calendar Event';
  let body='';
  let actions='';

  if(props.type==='due' || props.type==='overdue'){
    title=`Rent Due — ${tenant?.name||'Tenant'}`;
    body=`<div><strong>Amount:</strong> R${Number(props.amount||0).toLocaleString('en-ZA')}</div><div><strong>Due date:</strong> ${date}</div><div><strong>Tenant:</strong> ${tenant?.name||'—'} (${tenant?.property||'—'})</div>`;
    actions=`<button class="btn-primary btn-sm" onclick="openPaymentModal(${tenant?.id||0});nestiqCloseModalAnimated()">Record Payment</button>${typeof sendTenantWhatsAppTemplate==='function'?`<button class="btn-whatsapp btn-sm" onclick="sendTenantWhatsAppTemplate(${tenant?.id||0},'rentReminder');nestiqCloseModalAnimated()">Send WhatsApp Reminder</button>`:''}`;
  }else if(props.type==='paid'){
    const p=props.payment||{};
    window.__calendarPaymentPreview=p;
    title='Payment Received';
    body=`<div><strong>Tenant:</strong> ${tenant?.name||'—'}</div><div><strong>Date:</strong> ${date}</div><div><strong>Amount:</strong> R${Number(p.amount||0).toLocaleString('en-ZA')}</div><div><strong>Method:</strong> ${p.method||'—'}</div><div><strong>Receipt:</strong> ${p.receiptNo||'—'}</div>`;
    actions=`<button class="btn-primary btn-sm" onclick="downloadCalendarPaymentReceipt(${tenant?.id||0})">Download Receipt PDF</button>`;
  }else if(props.type==='lease-start' || props.type==='lease-end' || props.type==='lease-warning'){
    title='Lease Event';
    body=`<div><strong>Tenant:</strong> ${tenant?.name||'—'}</div><div><strong>Property:</strong> ${tenant?.property||'—'}</div><div><strong>Date:</strong> ${date}</div><div><strong>Lease Start:</strong> ${tenant?.leaseStart||'—'}</div><div><strong>Lease End:</strong> ${tenant?.leaseEnd||tenant?.lease||'—'}</div>`;
    actions=`<button class="btn-primary btn-sm" onclick="viewTenant(${tenant?.id||0});nestiqCloseModalAnimated()">View Tenant</button>`;
  }else if(props.type==='maintenance'){
    const req=(maintenanceData||[]).find(m=>String(m.id)===String(props.maintId)||Number(m.id)===Number(props.maintId));
    const lock=typeof nestiqMaintLandlordLockMeta==='function'?nestiqMaintLandlordLockMeta(req):(typeof nestiqMaintContractorLockMeta==='function'?nestiqMaintContractorLockMeta(req):null);
    const locked=!!(lock?.locked || (typeof nestiqMaintIsLandlordLocked==='function'&&nestiqMaintIsLandlordLocked(req)));
    title='Maintenance Request';
    body=`<div><strong>Issue:</strong> ${req?.title||'—'}</div><div><strong>Property:</strong> ${req?.property||'—'}</div><div><strong>Status:</strong> ${req?.status||'open'}</div><div><strong>Date:</strong> ${date}</div>${locked&&lock?.message?`<div style="margin-top:8px;font-size:0.82rem;color:var(--muted)">${String(lock.message).replace(/</g,'&lt;')}</div>`:''}`;
    if(locked){
      actions=`<div class="nestiq-maint-awaiting" style="display:inline-flex">${String(lock?.label||'').replace(/</g,'&lt;')}</div>`;
    }else{
      const ridArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(req?.id??0):JSON.stringify(String(req?.id??0));
      actions=`<button class="btn-primary btn-sm" onclick="(async()=>{const ok=await moveMaint(${ridArg},'progress');if(ok!==false)nestiqCloseModalAnimated();})()">Update Status</button>`;
    }
  }else if(props.type==='custom'){
    const ce=(customEvents||[]).find(x=>Number(x.id)===Number(props.eventId));
    title='Custom Event';
    body=`<div><strong>Title:</strong> ${ce?.title||info.event.title}</div><div><strong>Date:</strong> ${date}</div><div><strong>Notes:</strong> ${ce?.notes||'—'}</div>`;
    actions=`<button class="btn-outline btn-sm" onclick="openEditCustomCalendarEvent(${ce?.id||0})">Edit</button><button class="btn-outline btn-sm" onclick="deleteCustomCalendarEvent(${ce?.id||0})">Delete</button>`;
  }

  document.getElementById('modalContent').innerHTML=`<h2 class="modal-title">${title}</h2><div style="font-size:.86rem;color:var(--muted);display:flex;flex-direction:column;gap:8px;margin-bottom:14px">${body}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${actions}<button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Close</button></div>`;
  nestiqOpenModalAnimated();
}

function handleCalendarDateClick(info){ openAddCustomCalendarEvent(info.dateStr); }

function openAddCustomCalendarEvent(defaultDate=''){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Add Event</h2>
    <div class="form-group"><label>Title</label><input class="form-input" id="ce_title" placeholder="Reminder title"></div>
    <div class="form-group" style="margin-top:10px"><label>Date</label><input class="form-input" id="ce_date" type="date" value="${defaultDate||''}"></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input id="ce_all_day" type="checkbox" checked onchange="toggleCustomEventTime()"> All day</label>
    <div id="ce_time_wrap" style="display:none;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
      <div><label>Start time</label><input class="form-input" id="ce_start_time" type="time"></div>
      <div><label>End time</label><input class="form-input" id="ce_end_time" type="time"></div>
    </div>
    <div style="margin-top:10px"><label>Color</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${['#888','#5a7a60','#c9a84c','#c46a3a','#3a6b8a','#7c5cbf'].map(c=>`<button type="button" onclick="pickCustomEventColor('${c}')" data-color="${c}" class="ce-color-dot" style="width:22px;height:22px;border-radius:999px;border:2px solid var(--border);background:${c};cursor:pointer"></button>`).join('')}</div><input type="hidden" id="ce_color" value="#888"></div>
    <div class="form-group" style="margin-top:10px"><label>Notes</label><textarea class="form-input form-textarea" id="ce_note" placeholder="Optional notes"></textarea></div>
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary btn-sm" onclick="saveCustomCalendarEvent()">Add to Calendar</button><button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button></div>
  `;
  nestiqOpenModalAnimated();
}
function toggleCustomEventTime(){
  const on=!document.getElementById('ce_all_day')?.checked;
  const wrap=document.getElementById('ce_time_wrap');
  if(wrap) wrap.style.display=on?'grid':'none';
}
function pickCustomEventColor(color){
  const input=document.getElementById('ce_color');
  if(input) input.value=color;
  document.querySelectorAll('.ce-color-dot').forEach(x=>x.style.outline='none');
  const btn=document.querySelector(`.ce-color-dot[data-color="${color}"]`);
  if(btn) btn.style.outline='2px solid var(--gold)';
}
function saveCustomCalendarEvent(){
  const title=document.getElementById('ce_title')?.value?.trim();
  const date=document.getElementById('ce_date')?.value;
  if(!title || !date){ nestiqShowNotif('Add title and date','error'); return; }
  customEvents.unshift({
    id:Date.now(),
    title,
    date,
    allDay:Boolean(document.getElementById('ce_all_day')?.checked),
    startTime:document.getElementById('ce_start_time')?.value||'',
    endTime:document.getElementById('ce_end_time')?.value||'',
    color:document.getElementById('ce_color')?.value||'#888',
    notes:document.getElementById('ce_note')?.value?.trim()||''
  });
  customEvents=customEvents.slice(0,200);
  saveData();
  nestiqCloseModalAnimated();
  refreshNestiqCalendar();
  nestiqShowNotif('Calendar event added','success');
}
function openEditCustomCalendarEvent(eventId){
  const ce=(customEvents||[]).find(x=>Number(x.id)===Number(eventId));
  if(!ce) return;
  openAddCustomCalendarEvent(ce.date);
  setTimeout(()=>{
    if(document.getElementById('ce_title')) document.getElementById('ce_title').value=ce.title||'';
    if(document.getElementById('ce_note')) document.getElementById('ce_note').value=ce.notes||'';
    if(document.getElementById('ce_all_day')) document.getElementById('ce_all_day').checked=ce.allDay!==false;
    toggleCustomEventTime();
    pickCustomEventColor(ce.color||'#888');
    const addBtn=document.querySelector('#modalContent .btn-primary');
    if(addBtn){
      addBtn.textContent='Save Changes';
      addBtn.onclick=()=>saveEditedCustomCalendarEvent(eventId);
    }
  },0);
}
function saveEditedCustomCalendarEvent(eventId){
  const idx=(customEvents||[]).findIndex(x=>Number(x.id)===Number(eventId));
  if(idx<0) return;
  customEvents[idx]={
    ...customEvents[idx],
    title:document.getElementById('ce_title')?.value?.trim()||customEvents[idx].title,
    date:document.getElementById('ce_date')?.value||customEvents[idx].date,
    allDay:Boolean(document.getElementById('ce_all_day')?.checked),
    startTime:document.getElementById('ce_start_time')?.value||'',
    endTime:document.getElementById('ce_end_time')?.value||'',
    color:document.getElementById('ce_color')?.value||customEvents[idx].color||'#888',
    notes:document.getElementById('ce_note')?.value?.trim()||''
  };
  saveData();
  nestiqCloseModalAnimated();
  refreshNestiqCalendar();
}
function deleteCustomCalendarEvent(eventId){
  customEvents=(customEvents||[]).filter(x=>Number(x.id)!==Number(eventId));
  saveData();
  nestiqCloseModalAnimated();
  refreshNestiqCalendar();
}

function downloadCalendarPaymentReceipt(tenantId){
  const tenant=getTenantById(tenantId);
  const payment=window.__calendarPaymentPreview||null;
  if(tenant && payment) generateReceiptPDF(tenant,payment);
  nestiqCloseModalAnimated();
}

function setCalendarFilter(mode){
  nestiqCalendarFilters={all:false,payments:false,due:false,maintenance:false,leases:false,custom:false};
  if(mode==='all') nestiqCalendarFilters={all:true,payments:true,due:true,maintenance:true,leases:true,custom:true};
  else if(mode==='payments') nestiqCalendarFilters.payments=true;
  else if(mode==='due') nestiqCalendarFilters.due=true;
  else if(mode==='maintenance') nestiqCalendarFilters.maintenance=true;
  else if(mode==='leases') nestiqCalendarFilters.leases=true;
  else if(mode==='custom') nestiqCalendarFilters.custom=true;
  document.querySelectorAll('.cal-filter-chip').forEach(ch=>ch.classList.toggle('active', ch.dataset.filter===mode));
  applyCalendarFilters();
  renderCalendarSidebar();
}

function initFullCalendar(){
  const el=document.getElementById('nestiq-calendar');
  if(!el || !window.FullCalendar) return;
  if(window.nestiqCalendar){
    window.nestiqCalendar.refetchEvents();
    setTimeout(()=>window.nestiqCalendar.render(),60);
    renderCalendarSidebar();
    return;
  }
  window.nestiqCalendar=new FullCalendar.Calendar(el,{
    initialView:'dayGridMonth',
    headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,listMonth'},
    height:'auto',
    firstDay:1,
    locale:'en-ZA',
    buttonText:{today:'Today',month:'Month',week:'Week',list:'Agenda'},
    eventClick:handleCalendarEventClick,
    dateClick:handleCalendarDateClick,
    events:generateCalendarEvents,
    eventDidMount:styleCalendarEvent,
    eventTimeFormat:{hour:'2-digit',minute:'2-digit',hour12:false},
    datesSet:()=>renderCalendarSidebar()
  });
  window.nestiqCalendar.render();
  nestiqCalendarFilters={all:true,payments:true,due:true,maintenance:true,leases:true,custom:true};
  applyCalendarFilters();
  setTimeout(()=>window.nestiqCalendar.render(),80);
  renderCalendarSidebar();
}

function refreshNestiqCalendar(){
  if(window.nestiqCalendar){
    window.nestiqCalendar.refetchEvents();
    renderCalendarSidebar();
  }
}

window.initFullCalendar=initFullCalendar;
window.refreshNestiqCalendar=refreshNestiqCalendar;
window.generateCalendarEvents=generateCalendarEvents;
window.handleCalendarEventClick=handleCalendarEventClick;
window.handleCalendarDateClick=handleCalendarDateClick;
window.styleCalendarEvent=styleCalendarEvent;
window.openAddCustomCalendarEvent=openAddCustomCalendarEvent;
window.saveCustomCalendarEvent=saveCustomCalendarEvent;
window.openEditCustomCalendarEvent=openEditCustomCalendarEvent;
window.deleteCustomCalendarEvent=deleteCustomCalendarEvent;
window.toggleCustomEventTime=toggleCustomEventTime;
window.pickCustomEventColor=pickCustomEventColor;
window.setCalendarFilter=setCalendarFilter;
window.jumpCalendarToDate=jumpCalendarToDate;
window.downloadCalendarPaymentReceipt=downloadCalendarPaymentReceipt;

