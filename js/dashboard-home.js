/* Landlord home dashboard — live data only. */
(function(){
  let __nestiqLdRentChart=null;
  let __nestiqLdThemeObs=null;
  let __nestiqLdMaintFilter='all';
  let __nestiqLdMaintCols={property:true, requester:true, description:true};
  let __nestiqLdMaintUi={filtersOpen:false, colsOpen:false};
  let __nestiqLdMaintOutsideBound=false;
  const __nestiqLdStaggerTimers={};

  function nestiqLdStagger(host, kidsEl, delay){
    if(!host || typeof nestiqStaggerChildren!=='function') return;
    const target=kidsEl||host;
    if(!target.children||!target.children.length) return;
    const sig=target.innerHTML;
    if(host.getAttribute('data-nq-stagger-sig')===sig) return;
    host.setAttribute('data-nq-stagger-sig', sig);
    const id=host.id||'ld';
    const useTbody=!!(kidsEl&&kidsEl.tagName==='TBODY');
    clearTimeout(__nestiqLdStaggerTimers[id]);
    __nestiqLdStaggerTimers[id]=setTimeout(()=>{
      const el=useTbody?(host.querySelector('tbody')||host):host;
      if(!el||!el.isConnected||!el.children.length) return;
      nestiqStaggerChildren(el, delay||45);
    }, 80);
  }

  function esc(s){
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function money(n){
    return 'R'+Number(n||0).toLocaleString('en-ZA');
  }

  function nestiqLdIsVerifiedLandlord(){
    let s=null;
    try{ s=typeof getSession==='function'?getSession():null; }catch(_e){}
    if(!s) return false;
    if(typeof isValidSession==='function' && !isValidSession(s)) return false;
    if(s.role==='tenant') return false;
    if(typeof nestiqLandlordAwaitingEmailVerification==='function' && nestiqLandlordAwaitingEmailVerification()) return false;
    return true;
  }

  function nestiqLdApplyVisibility(){
    const show=nestiqLdIsVerifiedLandlord();
    const dash=document.getElementById('nestiqLandlordDashboardHome');
    const mkt=document.getElementById('nestiqMarketingHome');
    if(dash) dash.style.display=show?'block':'none';
    if(mkt) mkt.style.display=show?'none':'';
    return show && !!dash;
  }

  function nestiqLdParseDate(v){
    if(!v) return null;
    if(v && typeof v.toDate==='function'){
      try{ return v.toDate(); }catch(_e){}
    }
    const s=String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const d=new Date(s.slice(0,10)+'T12:00:00');
      return String(d)==='Invalid Date'?null:d;
    }
    if(/^\d{4}-\d{2}/.test(s)){
      const d=new Date(s.slice(0,7)+'-01T12:00:00');
      return String(d)==='Invalid Date'?null:d;
    }
    const d=new Date(s);
    return String(d)==='Invalid Date'?null:d;
  }

  function nestiqLdFmtDate(v){
    const d=nestiqLdParseDate(v);
    if(!d) return '—';
    return d.toLocaleDateString('en-ZA');
  }

  function nestiqLdIsArchived(p){
    if(typeof nestiqPropertyIsArchived==='function') return nestiqPropertyIsArchived(p);
    return !!(p&&(p.archived||p.deactivated));
  }

  function nestiqLdActiveProps(){
    const list=(propertiesData||[]).filter(p=>p&&!nestiqLdIsArchived(p));
    return typeof window.nestiqSortPropertiesNewestFirst==='function'
      ? window.nestiqSortPropertiesNewestFirst(list)
      : list;
  }

  function nestiqLdActiveTenant(p){
    const list=tenantsData||[];
    const hit=list.find(t=>{
      if(!t) return false;
      const occupies=typeof window.nestiqTenantHasActiveOccupancy==='function'
        ? window.nestiqTenantHasActiveOccupancy(t)
        : t.status!=='vacant';
      if(!occupies) return false;
      return String(t.propertyId)===String(p.id)||t.property===p.name;
    });
    if(hit) return hit;
    if(typeof getActiveTenantForProperty==='function') return getActiveTenantForProperty(p);
    return null;
  }

  function nestiqLdActiveTenants(){
    return (tenantsData||[]).filter(t=>{
      if(!t) return false;
      if(typeof window.nestiqTenantHasActiveOccupancy==='function') return window.nestiqTenantHasActiveOccupancy(t);
      return t.status!=='vacant';
    });
  }

  function nestiqLdFindTenant(id){
    if(id==null||id==='') return null;
    return (tenantsData||[]).find(t=>String(t.id)===String(id))||null;
  }

  function nestiqLdEmpty(msg){
    return `<div class="nestiq-ld-empty">${esc(msg)}</div>`;
  }

  function nestiqLdPropertyOccupancy(p){
    if(typeof window.nestiqPropertyOccupancyStats==='function'){
      const s=window.nestiqPropertyOccupancyStats(p);
      return { occupied:s.occupiedUnits, total:s.totalUnits };
    }
    const listed=Math.max(0, Number(p?.numberOfUnits||p?.totalUnits||0));
    const tenants=(tenantsData||[]).filter(t=>{
      if(!t) return false;
      const onProp=String(t.propertyId)===String(p?.id)||t.property===p?.name;
      if(!onProp) return false;
      if(typeof window.nestiqTenantHasActiveOccupancy==='function') return window.nestiqTenantHasActiveOccupancy(t);
      return String(t.status||'')!=='vacant';
    }).length;
    const total=Math.max(listed||1, tenants);
    return { occupied:tenants, total };
  }

  function nestiqLdOccupancyHtml(p){
    const { occupied, total }=nestiqLdPropertyOccupancy(p);
    if(!total) return '';
    const pct=Math.max(0,Math.min(100,Math.round((occupied/total)*100)));
    const noun=total===1?'unit':'units';
    return `<div class="nestiq-ld-lease">
      <div class="nestiq-ld-lease-track" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${occupied}" aria-label="${occupied} of ${total} ${noun} occupied">
        <div class="nestiq-ld-lease-fill" style="width:${pct}%"></div>
      </div>
      <div class="nestiq-ld-lease-lbl">${occupied} / ${total} ${noun} occupied</div>
    </div>`;
  }

  function nestiqLdRenderStats(){
    const host=document.getElementById('nestiqLdStats');
    if(!host) return;
    const props=nestiqLdActiveProps();
    const tenants=nestiqLdActiveTenants();
    const monthly=tenants.reduce((s,t)=>s+(Number(t.rent)||0),0);
    const now=new Date();
    const y=now.getFullYear();
    const m=now.getMonth();
    const collected=(paymentsData||[]).reduce((s,p)=>{
      const d=nestiqLdParseDate(p.date);
      if(!d||d.getFullYear()!==y||d.getMonth()!==m) return s;
      return s+(Number(p.amount)||0);
    },0);
    const cards=[
      {lbl:'Total Properties', val:String(props.length)},
      {lbl:'Active Tenants', val:String(tenants.length)},
      {lbl:'Monthly Rent Income', val:money(monthly)},
      {lbl:'Collected This Month', val:money(collected)}
    ];
    host.innerHTML=cards.map(c=>`
      <div class="nestiq-ld-stat">
        <div class="nestiq-ld-stat-lbl">${esc(c.lbl)}</div>
        <div class="nestiq-ld-stat-val">${esc(c.val)}</div>
      </div>`).join('');
    nestiqLdStagger(host);
  }

  function nestiqLdRenderProps(){
    const host=document.getElementById('nestiqLdProps');
    if(!host) return;
    const props=nestiqLdActiveProps().slice(0,4);
    if(!props.length){
      host.innerHTML=nestiqLdEmpty('No properties yet');
      host.removeAttribute('data-nq-stagger-sig');
      return;
    }
    host.innerHTML=props.map(p=>{
      const tenant=nestiqLdActiveTenant(p);
      const active=!!tenant;
      const photo=typeof nestiqPropertyCardPhotoUrl==='function'?nestiqPropertyCardPhotoUrl(p):'';
      const idArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(p.id):JSON.stringify(p.id);
      const img=photo
        ? `<img src="${esc(photo)}" alt="" class="nestiq-ld-prop-img" onerror="this.style.display='none'">`
        : `<div class="nestiq-ld-prop-ph">${esc(p.icon||'🏠')}</div>`;
      const badge=active
        ? '<span class="nestiq-ld-badge nestiq-ld-badge-active">Active</span>'
        : '<span class="nestiq-ld-badge nestiq-ld-badge-vacant">Vacant</span>';
      const click=typeof viewProperty==='function'
        ? `onclick="viewProperty(${idArg},event)"`
        : `onclick="showPage('properties')"`;
      return `<article class="nestiq-ld-prop-card" ${click}>
        <div class="nestiq-ld-prop-media">${img}${badge}</div>
        <div class="nestiq-ld-prop-body">
          <div class="nestiq-ld-prop-name">${esc(p.name||'Property')}</div>
          <div class="nestiq-ld-prop-addr">${esc(p.addr||'—')}</div>
          ${nestiqLdOccupancyHtml(p)}
        </div>
      </article>`;
    }).join('');
    nestiqLdStagger(host);
  }

  function nestiqLdRenderMaint(){
    const host=document.getElementById('nestiqLdMaint');
    const actions=document.getElementById('nestiqLdMaintActions');
    if(!host) return;

    const filterOpts=[
      {v:'all', l:'All statuses'},
      {v:'Pending', l:'Pending'},
      {v:'Assigned', l:'Assigned'},
      {v:'In Progress', l:'In Progress'},
      {v:'Completed', l:'Completed'},
      {v:'Cancelled', l:'Cancelled'}
    ];
    const colOpts=[
      {k:'property', l:'Property name'},
      {k:'requester', l:'Requested by'},
      {k:'description', l:'Descriptions'}
    ];
    const filterOn=__nestiqLdMaintFilter!=='all';
    if(actions){
      actions.innerHTML=`
        <div class="nestiq-ld-maint-menu">
          <button type="button" class="nestiq-ld-ghost-btn${filterOn?' is-on':''}" onclick="nestiqLdMaintToggleFilters(event)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16l-6.2 8.2V19l-3.6 1.8v-7.6L4 5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            Filters
          </button>
          <div class="nestiq-ld-maint-pop"${__nestiqLdMaintUi.filtersOpen?'':' hidden'}>
            ${filterOpts.map(o=>`<button type="button" class="nestiq-ld-maint-pop-item${__nestiqLdMaintFilter===o.v?' is-active':''}" onclick="nestiqLdMaintSetFilter(${JSON.stringify(o.v)},event)">${esc(o.l)}</button>`).join('')}
          </div>
        </div>
        <div class="nestiq-ld-maint-menu">
          <button type="button" class="nestiq-ld-ghost-btn" onclick="nestiqLdMaintToggleCols(event)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="5" height="14" rx="1.2" stroke="currentColor" stroke-width="2"/><rect x="11" y="5" width="4" height="14" rx="1.2" stroke="currentColor" stroke-width="2"/><rect x="17" y="5" width="3" height="14" rx="1.2" stroke="currentColor" stroke-width="2"/></svg>
            Columns
          </button>
          <div class="nestiq-ld-maint-pop"${__nestiqLdMaintUi.colsOpen?'':' hidden'}>
            ${colOpts.map(o=>`<label class="nestiq-ld-maint-pop-item nestiq-ld-maint-pop-check"><input type="checkbox" ${__nestiqLdMaintCols[o.k]?'checked':''} onchange="nestiqLdMaintToggleCol(${JSON.stringify(o.k)},event)"> ${esc(o.l)}</label>`).join('')}
          </div>
        </div>`;
    }

    const sorted=(maintenanceData||[]).slice().sort((a,b)=>{
      const da=nestiqLdParseDate(a.createdAt||a.date)||new Date(0);
      const db=nestiqLdParseDate(b.createdAt||b.date)||new Date(0);
      return db-da;
    });
    const filtered=sorted.filter(m=>{
      if(__nestiqLdMaintFilter==='all') return true;
      const label=typeof nestiqMaintStatusMeta==='function'?nestiqMaintStatusMeta(m).label:'Pending';
      return label===__nestiqLdMaintFilter;
    }).slice(0,6);

    if(!filtered.length){
      host.innerHTML=nestiqLdEmpty(__nestiqLdMaintFilter==='all'?'No maintenance requests yet':'No requests match this filter');
      host.removeAttribute('data-nq-stagger-sig');
      return;
    }

    const showP=__nestiqLdMaintCols.property!==false;
    const showR=__nestiqLdMaintCols.requester!==false;
    const showD=__nestiqLdMaintCols.description!==false;
    const body=filtered.map(m=>{
      const cat=m.issueCategory||m.category||'Other';
      const ic=nestiqLdMaintCatIcon(cat);
      const tone=nestiqLdMaintCatTone(cat);
      const tenant=nestiqLdFindTenant(m.tenantId);
      const who=String(m.tenantName||tenant?.name||'').trim()||'—';
      const photo=tenant&&typeof nestiqTenantPhotoUrl==='function'?nestiqTenantPhotoUrl(tenant):'';
      const initials=typeof nestiqMaintInitials==='function'?nestiqMaintInitials(who==='—'?'':who):(who[0]||'?');
      const av=photo
        ? `<img class="nestiq-ld-mr-av-img" src="${esc(photo)}" alt="${esc(who)}">`
        : `<span class="nestiq-ld-mr-av-ini">${esc(initials)}</span>`;
      const desc=String(m.description||m.title||'').trim()||'—';
      const reqId=nestiqLdMaintRequestId(m);
      return `<tr class="nestiq-ld-mr-row" onclick="showPage('maintenance')">
        <td>
          <div class="nestiq-ld-mr-complaint">
            <span class="nestiq-ld-mr-ic nestiq-ld-mr-ic--${tone}" aria-hidden="true">${ic}</span>
            <span>
              <span class="nestiq-ld-mr-cat">${esc(cat)}</span>
              <span class="nestiq-ld-mr-id">Request ID: ${esc(reqId)}</span>
            </span>
          </div>
        </td>
        ${showP?`<td class="nestiq-ld-mr-prop">${esc(m.property||'—')}</td>`:''}
        ${showR?`<td><div class="nestiq-ld-mr-who">${av}<span>${esc(who)}</span></div></td>`:''}
        ${showD?`<td class="nestiq-ld-mr-desc">${esc(desc)}</td>`:''}
      </tr>`;
    }).join('');
    host.innerHTML=`<table class="nestiq-ld-mr-table">
      <thead><tr>
        <th>Complaint</th>
        ${showP?'<th>Property name</th>':''}
        ${showR?'<th>Requested by</th>':''}
        ${showD?'<th>Descriptions</th>':''}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
    nestiqLdStagger(host, host.querySelector('tbody'));
  }

  function nestiqLdMaintCatIcon(category){
    const c=String(category||'').toLowerCase();
    const svg=(d)=>`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if(c.includes('plumb')) return svg('M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.8-2.8 2.2-2.2z');
    if(c.includes('electr')) return svg('M13 2 4 14h7l-1 8 9-12h-7l1-8z');
    if(c.includes('hvac')) return svg('M12 3v6M12 15v6M3 12h6M15 12h6M6.2 6.2l4.2 4.2M13.6 13.6l4.2 4.2M17.8 6.2l-4.2 4.2M10.4 13.6l-4.2 4.2');
    if(c.includes('applian')) return svg('M9 7V3M15 7V3M8 7h8v6a4 4 0 0 1-8 0V7zM12 17v4');
    if(c.includes('paint')) return svg('M7 21h4a2 2 0 0 0 2-2v-1H9a2 2 0 0 1-2-2V8l8-4 3 6-6 3H7z');
    if(c.includes('pest')) return svg('M12 7v10M8 9l8 6M16 9l-8 6M12 7c1.7 0 3-1.3 3-3H9c0 1.7 1.3 3 3 3zM9 17h6');
    if(c.includes('lock')) return svg('M8 11V8a4 4 0 0 1 8 0v3M7 11h10v10H7V11z');
    if(c.includes('struct')) return svg('M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5');
    if(c.includes('handyman')) return svg('M14 7l3 3M4 20l8.5-8.5M15 4l5 5-3.5 1.5L13.5 7.5 15 4z');
    return svg('M12 4v2M7 7l1.4 1.4M4 12h2M7 17l1.4-1.4M12 18v2M17 17l-1.4-1.4M18 12h2M17 7l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z');
  }

  function nestiqLdMaintCatTone(category){
    const c=String(category||'').toLowerCase();
    if(c.includes('plumb')) return 'sage';
    if(c.includes('electr')) return 'gold';
    if(c.includes('hvac')||c.includes('applian')) return 'rust';
    if(c.includes('paint')) return 'gold';
    if(c.includes('pest')) return 'sage';
    if(c.includes('lock')) return 'ink';
    if(c.includes('struct')) return 'rust';
    if(c.includes('handyman')) return 'ink';
    return 'sage';
  }

  function nestiqLdMaintRequestId(m){
    const raw=String(m?.id??'').trim();
    if(!raw) return '—';
    if(/^\d+$/.test(raw)) return 'MR-'+raw.padStart(3,'0');
    const tail=raw.replace(/[^a-zA-Z0-9]/g,'').slice(-6).toUpperCase();
    return tail?('MR-'+tail):raw;
  }

  function nestiqLdMaintToggleFilters(ev){
    ev?.stopPropagation?.();
    __nestiqLdMaintUi.filtersOpen=!__nestiqLdMaintUi.filtersOpen;
    __nestiqLdMaintUi.colsOpen=false;
    nestiqLdRenderMaint();
  }
  function nestiqLdMaintSetFilter(val, ev){
    ev?.stopPropagation?.();
    __nestiqLdMaintFilter=val||'all';
    __nestiqLdMaintUi.filtersOpen=false;
    nestiqLdRenderMaint();
  }
  function nestiqLdMaintToggleCols(ev){
    ev?.stopPropagation?.();
    __nestiqLdMaintUi.colsOpen=!__nestiqLdMaintUi.colsOpen;
    __nestiqLdMaintUi.filtersOpen=false;
    nestiqLdRenderMaint();
  }
  function nestiqLdMaintToggleCol(key, ev){
    ev?.stopPropagation?.();
    __nestiqLdMaintCols[key]=!__nestiqLdMaintCols[key];
    nestiqLdRenderMaint();
  }

  function nestiqLdBindMaintOutside(){
    if(__nestiqLdMaintOutsideBound) return;
    __nestiqLdMaintOutsideBound=true;
    document.addEventListener('click',e=>{
      if(!__nestiqLdMaintUi.filtersOpen&&!__nestiqLdMaintUi.colsOpen) return;
      if(e.target.closest?.('.nestiq-ld-maint-actions')) return;
      __nestiqLdMaintUi.filtersOpen=false;
      __nestiqLdMaintUi.colsOpen=false;
      nestiqLdRenderMaint();
    });
  }

  function nestiqLdRenderTxn(){
    const host=document.getElementById('nestiqLdTxn');
    if(!host) return;
    const rows=(paymentsData||[]).slice().sort((a,b)=>{
      const da=nestiqLdParseDate(a.date)||new Date(0);
      const db=nestiqLdParseDate(b.date)||new Date(0);
      return db-da;
    }).slice(0,6);
    if(!rows.length){
      host.innerHTML=nestiqLdEmpty('No transactions yet');
      host.removeAttribute('data-nq-stagger-sig');
      return;
    }
    const body=rows.map(p=>{
      const t=nestiqLdFindTenant(p.tenantId);
      const name=t?.name||p.tenantName||'—';
      const rec=String(p.receiptNo||p.receipt||'').trim()||'—';
      return `<tr>
        <td>${esc(name)}</td>
        <td>${esc(rec)}</td>
        <td><span class="nestiq-maint-status-pill nestiq-maint-st-done">Completed</span></td>
        <td>${esc(nestiqLdFmtDate(p.date))}</td>
        <td>${esc(money(p.amount))}</td>
      </tr>`;
    }).join('');
    host.innerHTML=`<table class="nestiq-table nestiq-ld-table">
      <thead><tr><th>Tenant</th><th>Receipt</th><th>Status</th><th>Date</th><th>Amount</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
    nestiqLdStagger(host, host.querySelector('tbody'));
  }

  function nestiqLdDestroyChart(){
    if(__nestiqLdRentChart){
      try{ __nestiqLdRentChart.destroy(); }catch(_e){}
      __nestiqLdRentChart=null;
    }
  }

  function nestiqLdThemeColor(name, fallback){
    try{
      const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v||fallback;
    }catch(_e){
      return fallback;
    }
  }

  function nestiqLdRenderChart(){
    const wrap=document.getElementById('nestiqLdChartWrap');
    nestiqLdDestroyChart();
    if(!wrap) return;
    const year=new Date().getFullYear();
    const totals=Array(12).fill(0);
    let any=false;
    (paymentsData||[]).forEach(p=>{
      const d=nestiqLdParseDate(p.date);
      if(!d||d.getFullYear()!==year) return;
      totals[d.getMonth()]+=(Number(p.amount)||0);
      any=true;
    });
    if(!any){
      wrap.innerHTML=nestiqLdEmpty('No payments recorded this year');
      return;
    }
    if(!document.getElementById('nestiqLdRentChart')){
      wrap.innerHTML='<canvas id="nestiqLdRentChart" aria-label="Rent collected by month this year"></canvas>';
    }
    const el=document.getElementById('nestiqLdRentChart');
    if(!el||typeof Chart==='undefined') return;
    const gold=nestiqLdThemeColor('--gold','#c9a84c');
    const border=nestiqLdThemeColor('--border','rgba(201,168,76,0.18)');
    const muted=nestiqLdThemeColor('--muted','#8a8478');
    const ink=nestiqLdThemeColor('--ink','#0e1117');
    const cur=new Date().getMonth();
    const labels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const bg=labels.map((_,i)=>i===cur?gold:border);
    __nestiqLdRentChart=new Chart(el.getContext('2d'),{
      type:'bar',
      data:{
        labels,
        datasets:[{
          label:`Collected ${year}`,
          data:totals,
          backgroundColor:bg,
          borderRadius:6,
          maxBarThickness:28
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              label(ctx){ return money(ctx.parsed.y); }
            }
          }
        },
        scales:{
          x:{
            grid:{display:false},
            ticks:{color:muted, font:{family:'DM Sans', size:11}}
          },
          y:{
            beginAtZero:true,
            grid:{color:border},
            ticks:{
              color:muted,
              font:{family:'DM Sans', size:11},
              callback(v){ return 'R'+Number(v).toLocaleString('en-ZA'); }
            }
          }
        },
        color:ink
      }
    });
  }

  function nestiqLdRenderMaintOverview(){
    const host=document.getElementById('nestiqLdMaintOverview');
    if(!host) return;
    const list=maintenanceData||[];
    if(!list.length){
      host.innerHTML=nestiqLdEmpty('No maintenance requests yet');
      return;
    }
    const order=['Pending','Assigned','In Progress','Completed','Cancelled'];
    const clsMap={
      Pending:'nestiq-maint-st-pending',
      Assigned:'nestiq-maint-st-assigned',
      'In Progress':'nestiq-maint-st-progress',
      Completed:'nestiq-maint-st-done',
      Cancelled:'nestiq-maint-st-cancelled'
    };
    const counts=Object.fromEntries(order.map(k=>[k,0]));
    list.forEach(m=>{
      const label=(typeof nestiqMaintStatusMeta==='function'?nestiqMaintStatusMeta(m).label:'Pending');
      if(counts[label]==null) counts[label]=0;
      counts[label]+=1;
    });
    const total=list.length;
    const fillClass={
      Pending:'is-pending',
      Assigned:'is-assigned',
      'In Progress':'is-progress',
      Completed:'is-done',
      Cancelled:'is-cancelled'
    };
    host.innerHTML=order.map(label=>{
      const n=counts[label]||0;
      const pct=Math.round((n/total)*100);
      return `<div class="nestiq-ld-ov-row">
        <div class="nestiq-ld-ov-top">
          <span class="nestiq-maint-status-pill ${clsMap[label]}">${esc(label)}</span>
          <span class="nestiq-ld-ov-pct">${pct}% · ${n}</span>
        </div>
        <div class="nestiq-ld-ov-track"><div class="nestiq-ld-ov-fill ${fillClass[label]}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  function nestiqLdRenderLeases(){
    const host=document.getElementById('nestiqLdLeases');
    if(!host) return;
    const rows=nestiqLdActiveTenants().filter(t=>nestiqLdParseDate(t.leaseEnd)).sort((a,b)=>{
      return nestiqLdParseDate(a.leaseEnd)-nestiqLdParseDate(b.leaseEnd);
    }).slice(0,6);
    if(!rows.length){
      host.innerHTML=nestiqLdEmpty('No leases with an end date yet');
      host.removeAttribute('data-nq-stagger-sig');
      return;
    }
    const body=rows.map(t=>{
      const contact=String(t.email||t.phone||t.mobile||'').trim()||'—';
      const unit=String(t.unit||t.unitNumber||t.unitLabel||'').trim()||'—';
      return `<tr>
        <td>${esc(t.name||'—')}</td>
        <td>${esc(unit)}</td>
        <td>${esc(nestiqLdFmtDate(t.leaseEnd))}</td>
        <td>${esc(contact)}</td>
      </tr>`;
    }).join('');
    host.innerHTML=`<table class="nestiq-table nestiq-ld-table nestiq-ld-leases-table">
      <colgroup>
        <col class="col-tenant">
        <col class="col-unit">
        <col class="col-end">
        <col class="col-contact">
      </colgroup>
      <thead><tr><th>Tenant</th><th>Unit</th><th>Lease End</th><th>Contact</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
    nestiqLdStagger(host, host.querySelector('tbody'));
  }

  function nestiqLdBindThemeObserver(){
    if(__nestiqLdThemeObs||typeof MutationObserver==='undefined') return;
    __nestiqLdThemeObs=new MutationObserver(()=>{
      const dash=document.getElementById('nestiqLandlordDashboardHome');
      if(dash&&dash.style.display!=='none') nestiqRenderLandlordDashboardHome();
    });
    __nestiqLdThemeObs.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }

  function nestiqRenderLandlordDashboardHome(){
    const dash=document.getElementById('nestiqLandlordDashboardHome');
    if(!dash) return;
    if(!nestiqLdApplyVisibility()){
      nestiqLdDestroyChart();
      return;
    }
    const welcome=document.getElementById('nestiqLdWelcome');
    let name='';
    try{ name=typeof nestiqLandlordDisplayName==='function'?nestiqLandlordDisplayName():''; }catch(_e){}
    if(!name||/^landlord$/i.test(name)){
      try{
        const s=typeof getSession==='function'?getSession():null;
        const nm=String(s?.name||'').trim();
        if(nm&&!/^landlord$/i.test(nm)&&!/^user$/i.test(nm)) name=nm;
      }catch(_e){}
    }
    if(!name) name='Landlord';
    if(welcome) welcome.textContent=`Welcome back, ${name}`;

    nestiqLdRenderStats();
    nestiqLdRenderProps();
    nestiqLdRenderMaint();
    nestiqLdRenderTxn();
    nestiqLdRenderChart();
    nestiqLdRenderMaintOverview();
    nestiqLdRenderLeases();
    nestiqLdBindThemeObserver();
    nestiqLdBindMaintOutside();
  }

  window.nestiqRenderLandlordDashboardHome=nestiqRenderLandlordDashboardHome;
  window.nestiqLdMaintToggleFilters=nestiqLdMaintToggleFilters;
  window.nestiqLdMaintSetFilter=nestiqLdMaintSetFilter;
  window.nestiqLdMaintToggleCols=nestiqLdMaintToggleCols;
  window.nestiqLdMaintToggleCol=nestiqLdMaintToggleCol;
})();
