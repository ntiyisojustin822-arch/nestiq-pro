/* ═══════════════════════════════
   PORTFOLIO SUMMARY REPORT (print + PDF)
═══════════════════════════════ */

function prFmtMoney(n){
  return `R${Math.round(Number(n)||0).toLocaleString('en-ZA')}`;
}

function prIso(d){
  if(!d) return '';
  const x=d instanceof Date?d:new Date(d);
  return String(x)==='Invalid Date'?'':x.toISOString().slice(0,10);
}

function prLandlordMeta(){
  const ls=landlordSettings||{};
  return{
    name:String(ls.name||landlordName||'Landlord'),
    company:String(ls.companyName||''),
    email:String(ls.email||landlordEmail||''),
    phone:String(ls.phone||''),
    logo:String(ls.logoBase64||'')
  };
}

function prGetReportDateRange(period, customStart, customEnd){
  const now=new Date();
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59);
  let start;
  if(period==='custom'&&customStart&&customEnd){
    start=new Date(customStart+'T00:00:00');
    const e=new Date(customEnd+'T23:59:59');
    return{start,end:e};
  }
  if(period==='month'){
    start=new Date(now.getFullYear(),now.getMonth(),1);
  }else if(period==='3m'){
    start=new Date(now.getFullYear(),now.getMonth()-2,1);
  }else if(period==='6m'){
    start=new Date(now.getFullYear(),now.getMonth()-5,1);
  }else if(period==='12m'){
    start=new Date(now.getFullYear(),now.getMonth()-11,1);
  }else if(period==='tax'){
    start=new Date(now.getFullYear(),0,1);
  }else{
    start=new Date(now.getFullYear(),now.getMonth()-11,1);
  }
  return{start,end};
}

function prDaysInclusive(a,b){
  const ms=86400000;
  return Math.max(1,Math.ceil((b-a)/ms)+1);
}

function prAnnualFactor(start,end){
  return 365/prDaysInclusive(start,end);
}

function prCollectPaymentsFlat(){
  const out=[];
  const seen=new Set();
  (paymentsData||[]).forEach(p=>{
    const k=`g-${p.tenantId}-${p.date}-${p.amount}`;
    if(seen.has(k)) return;
    seen.add(k);
    out.push({date:String(p.date||'').slice(0,10),amount:Number(p.amount||0),tenantId:p.tenantId,status:String(p.status||'')});
  });
  (tenantsData||[]).forEach(t=>{
    (t.payments||[]).forEach(p=>{
      const k=`t-${t.id}-${p.date}-${p.amount}`;
      if(seen.has(k)) return;
      seen.add(k);
      out.push({date:String(p.date||'').slice(0,10),amount:Number(p.amount||0),tenantId:t.id,status:String(p.status||'')});
    });
  });
  return out;
}

function prPayInRange(pay,start,end){
  const d=String(p.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t=new Date(d+'T12:00:00');
  return t>=start&&t<=end;
}

function prExpInRange(e,start,end){
  const d=String(e.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t=new Date(d+'T12:00:00');
  return t>=start&&t<=end;
}

function prMonthlyBucketsLast12(endDate){
  const labels=[];
  const income=[];
  for(let i=11;i>=0;i--){
    const d=new Date(endDate.getFullYear(),endDate.getMonth()-i,1);
    labels.push(d.toLocaleDateString('en-ZA',{month:'short',year:'2-digit'}));
    income.push(0);
  }
  const startMonth=new Date(endDate.getFullYear(),endDate.getMonth()-11,1);
  prCollectPaymentsFlat().forEach(p=>{
    const t=new Date(String(p.date).slice(0,10)+'T12:00:00');
    if(t<startMonth||t>endDate) return;
    const idx=(t.getFullYear()-startMonth.getFullYear())*12+(t.getMonth()-startMonth.getMonth());
    if(idx>=0&&idx<12) income[idx]+=Number(p.amount||0);
  });
  return{labels,income};
}

function prCashflowByMonthYear(year){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const inc=Array(12).fill(0);
  const exp=Array(12).fill(0);
  const ys=String(year);
  prCollectPaymentsFlat().forEach(p=>{
    if(!String(p.date||'').startsWith(ys)) return;
    const m=parseInt(String(p.date).slice(5,7),10)-1;
    if(m>=0&&m<12) inc[m]+=Number(p.amount||0);
  });
  (expenses||[]).filter(e=>!e.isIncome).forEach(e=>{
    if(!String(e.date||'').startsWith(ys)) return;
    const m=parseInt(String(e.date).slice(5,7),10)-1;
    if(m>=0&&m<12) exp[m]+=Number(e.amount||0);
  });
  return{months,inc,exp,net:months.map((_,i)=>inc[i]-exp[i])};
}

function prTenantOnTimePct(tenant){
  const pays=(tenant.payments||[]).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||'')));
  if(!pays.length) return null;
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  let ok=0;
  pays.forEach(p=>{
    const d=new Date(String(p.date).slice(0,10)+'T12:00:00');
    const due=new Date(d.getFullYear(),d.getMonth(),dueDay);
    if(d<=due) ok++;
  });
  return Math.round((ok/pays.length)*100);
}

function prPropertyValue(p){
  const explicit=Number(p.marketValue||p.estimatedValue||p.portfolioValue||0);
  if(explicit>0) return explicit;
  const ar=Number(p.rent||0)*12;
  return Math.round(ar*14);
}

function prPropertyEquity(p,val){
  const ex=Number(p.equity||0);
  if(ex>0) return ex;
  return Math.round(val*0.6);
}

function prComputeDataset(range){
  const{start,end}=range;
  const af=prAnnualFactor(start,end);
  const pays=prCollectPaymentsFlat().filter(p=>prPayInRange(p,start,end));
  const gross=pays.reduce((s,p)=>s+Number(p.amount||0),0);
  const expRows=(expenses||[]).filter(e=>!e.isIncome&&prExpInRange(e,start,end));
  const expSum=expRows.reduce((s,e)=>s+Number(e.amount||0),0);
  const annualGross=gross*af;
  const annualExp=expSum*af;
  const netAnnual=annualGross-annualExp;
  const props=propertiesData||[];
  const occupied=props.filter(p=>p.status==='occupied').length;
  const occPct=props.length?Math.round((occupied/props.length)*100):0;
  const activeTenants=(tenantsData||[]).filter(t=>t.status!=='vacant');
  const monthlyIncome=activeTenants.reduce((s,t)=>s+Number(t.rent||0),0);
  let totalValue=0;
  let totalEquity=0;
  props.forEach(p=>{
    const v=prPropertyValue(p);
    totalValue+=v;
    totalEquity+=prPropertyEquity(p,v);
  });
  const avgYield=totalValue>0&&netAnnual!==0?((netAnnual/totalValue)*100):0;
  const portfolioNetYield=totalValue>0?(netAnnual/totalValue)*100:0;
  const byCat={};
  expRows.forEach(e=>{
    const c=e.cat||'Other';
    byCat[c]=(byCat[c]||0)+Number(e.amount||0);
  });
  const byCatAnnual=Object.fromEntries(Object.entries(byCat).map(([k,v])=>[k,v*af]));
  const catPct=Object.fromEntries(Object.entries(byCatAnnual).map(([k,v])=>[k,annualGross>0?(v/annualGross)*100:0]));
  const maint=(maintenanceData||[]).filter(m=>{
    const ds=String(m.completedDate||m.date||'');
    let t;
    if(/^\d{4}-\d{2}-\d{2}$/.test(ds)) t=new Date(ds+'T12:00:00');
    else t=new Date(m.date);
    if(String(t)==='Invalid Date') return false;
    return t>=start&&t<=end;
  });
  const maintCost=maint.reduce((s,m)=>s+(Number(m.actualCost)||0),0);
  const renewals=(tenantsData||[]).filter(t=>{
    if(t.status==='vacant') return false;
    const endL=new Date(t.leaseEnd||t.lease||'');
    if(String(endL)==='Invalid Date') return false;
    const days=Math.ceil((endL-new Date())/86400000);
    return days>=0&&days<=90;
  });
  return{
    start,end,af,gross,expSum,annualGross,annualExp,netAnnual,monthlyIncome,
    occPct,portfolioNetYield,avgYield,totalValue,totalEquity,
    totalProperties:props.length,occupiedCount:occupied,
    byCatAnnual,catPct,expRows,pays,
    maint,maintCost,renewals,
    monthly12:prMonthlyBucketsLast12(end),
    cashflowY:prCashflowByMonthYear(end.getFullYear())
  };
}

function openPortfolioReportOptionsModal(){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='landlord'){
    showNotif('Portfolio report is available to landlords only','warning');
    return;
  }
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Portfolio report</h2>
    <p class="modal-sub">Print-ready summary for banks, investors and accountants.</p>
    <div class="form-group"><label>Report period</label>
      <select class="form-input" id="pr_period" onchange="document.getElementById('pr_custom_wrap').style.display=this.value==='custom'?'grid':'none'">
        <option value="month">Current month</option>
        <option value="3m">Last 3 months</option>
        <option value="6m">Last 6 months</option>
        <option value="12m" selected>Last 12 months</option>
        <option value="tax">Current tax year (calendar)</option>
        <option value="custom">Custom range</option>
      </select>
    </div>
    <div id="pr_custom_wrap" style="display:none;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label>From</label><input type="date" class="form-input" id="pr_from"></div>
      <div class="form-group"><label>To</label><input type="date" class="form-input" id="pr_to"></div>
    </div>
    <div style="font-weight:600;margin:14px 0 8px;font-size:0.85rem">Include sections</div>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_exec" checked> Executive summary</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_prop" checked> Property breakdown</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_fin" checked> Financial detail</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_ten" checked> Tenant summary</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_maint" checked> Maintenance summary</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="checkbox" id="pr_sec_charts" checked> Charts and graphs</label>
    <div style="font-weight:600;margin:14px 0 8px;font-size:0.85rem">Format</div>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="radio" name="pr_fmt" value="print" checked> Print preview (new tab)</label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:0.86rem"><input type="radio" name="pr_fmt" value="pdf"> Download PDF</label>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="generatePortfolioReportFromModal()">Generate report</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  const t=new Date().toISOString().slice(0,10);
  const f=document.getElementById('pr_from');
  const t0=document.getElementById('pr_to');
  if(f) f.value=new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString().slice(0,10);
  if(t0) t0.value=t;
  document.getElementById('modalOverlay').classList.add('open');
}

function generatePortfolioReportFromModal(){
  const period=document.getElementById('pr_period')?.value||'12m';
  const from=document.getElementById('pr_from')?.value||'';
  const to=document.getElementById('pr_to')?.value||'';
  const sections={
    exec:Boolean(document.getElementById('pr_sec_exec')?.checked),
    prop:Boolean(document.getElementById('pr_sec_prop')?.checked),
    fin:Boolean(document.getElementById('pr_sec_fin')?.checked),
    ten:Boolean(document.getElementById('pr_sec_ten')?.checked),
    maint:Boolean(document.getElementById('pr_sec_maint')?.checked),
    charts:Boolean(document.getElementById('pr_sec_charts')?.checked)
  };
  const fmt=document.querySelector('input[name="pr_fmt"]:checked')?.value||'print';
  closeModal();
  const range=prGetReportDateRange(period,from,to);
  const data=prComputeDataset(range);
  const meta=prLandlordMeta();
  const prepared=new Date().toLocaleDateString('en-ZA',{dateStyle:'long'});
  if(fmt==='pdf'){
    __nestiqPortfolioPdfDirect(data,sections,meta,prepared,range);
    return;
  }
  const w=window.open('','_blank');
  if(!w){ showNotif('Allow pop-ups to open the report','warning'); return; }
  w.document.write(prBuildReportDocument(data,sections,meta,prepared,range));
  w.document.close();
}

function prEscapeHtml(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function prBuildReportDocument(data,sections,meta,prepared,range){
  const periodLbl=`${prIso(range.start)} — ${prIso(range.end)}`;
  const logoBlock=meta.logo&&String(meta.logo).startsWith('data:')
    ?`<img src="${meta.logo}" alt="Logo" style="max-height:52px;max-width:180px;object-fit:contain">`
    :`<div style="font-family:Georgia,serif;font-size:1.6rem;font-weight:700;color:#c9a84c">NestIQ</div>`;
  const occVac=Math.max(0,(data.totalProperties||0)-(data.occupiedCount||0));
  const chartDataJson=JSON.stringify({
    occ:{labels:['Occupied','Vacant'],datasets:[{data:[data.occupiedCount||0,occVac],backgroundColor:['#5a7a60cc','#c46a3acc']}]},
    inc12:{labels:data.monthly12.labels,datasets:[{label:'Income',data:data.monthly12.income,backgroundColor:'#c9a84c99',borderColor:'#c9a84c'}]},
    cf:{labels:data.cashflowY.months,datasets:[
      {label:'Income',data:data.cashflowY.inc,borderColor:'#c9a84c',backgroundColor:'#c9a84c22',fill:true},
      {label:'Expenses',data:data.cashflowY.exp,borderColor:'#c46a3a',backgroundColor:'#c46a3a22',fill:true}
    ]}
  });
  const showCharts=sections.charts;
  let pages=[];
  if(sections.exec){
    pages.push(`<section class="pr-page">
      <header class="pr-head">${logoBlock}
        <div><div class="pr-title">PROPERTY PORTFOLIO REPORT</div>
        <div class="pr-sub">${prEscapeHtml(meta.name)}${meta.company?` · ${prEscapeHtml(meta.company)}`:''}</div>
        <div class="pr-meta">Prepared ${prEscapeHtml(prepared)} · <strong>Confidential</strong></div>
        <div class="pr-meta">Period: ${prEscapeHtml(periodLbl)}</div></div>
      </header>
      <div class="pr-box"><div class="pr-box-title">Portfolio overview</div>
        <div class="pr-stats4">
          <div><div class="pr-stat-val">${data.totalProperties}</div><div class="pr-stat-lbl">Total properties</div></div>
          <div><div class="pr-stat-val">${prFmtMoney(data.monthlyIncome)}</div><div class="pr-stat-lbl">Total monthly income</div></div>
          <div><div class="pr-stat-val">${data.occPct}%</div><div class="pr-stat-lbl">Occupancy rate</div></div>
          <div><div class="pr-stat-val">${data.portfolioNetYield.toFixed(1)}%</div><div class="pr-stat-lbl">Portfolio net yield</div></div>
        </div>
      </div>
      <table class="pr-table"><tbody>
        <tr><td>Gross annual income (annualized)</td><td class="pr-num">${prFmtMoney(data.annualGross)}</td></tr>
        <tr><td>Total annual expenses (annualized)</td><td class="pr-num">${prFmtMoney(data.annualExp)}</td></tr>
        <tr><td><strong>Net annual income</strong></td><td class="pr-num"><strong>${prFmtMoney(data.netAnnual)}</strong></td></tr>
        <tr><td>Average yield</td><td class="pr-num">${data.avgYield.toFixed(1)}%</td></tr>
        <tr><td>Total portfolio value <span class="pr-note">(est.)</span></td><td class="pr-num">${prFmtMoney(data.totalValue)}</td></tr>
        <tr><td>Total equity <span class="pr-note">(est.)</span></td><td class="pr-num">${prFmtMoney(data.totalEquity)}</td></tr>
      </tbody></table>
      ${showCharts?`<div class="pr-chart-wrap"><canvas id="chartOcc" height="220"></canvas></div>`:`<p class="pr-note">Charts omitted.</p>`}
      ${sections.maint?`<div class="pr-box" style="margin-top:14px"><div class="pr-box-title">Maintenance (period)</div>
        <p style="margin:0;font-size:0.88rem">Requests touching period: <strong>${data.maint.length}</strong> · Total recorded job cost: <strong>${prFmtMoney(data.maintCost)}</strong></p></div>`:''}
    </section>`);
  }
  if(sections.prop){
    const rows=(propertiesData||[]).map(p=>{
      const tenant=(tenantsData||[]).find(t=>t.status!=='vacant'&&(Number(t.propertyId)===Number(p.id)||t.property===p.name));
      const mr=Number(p.rent||0);
      const ar=mr*12;
      const val=prPropertyValue(p);
      const propEx=(expenses||[]).filter(e=>!e.isIncome&&e.prop===p.name);
      const exSum=propEx.reduce((s,e)=>s+Number(e.amount||0),0)*data.af;
      const net=ar-exSum;
      const yld=val>0?(net/val)*100:0;
      return`<tr>
        <td>${prEscapeHtml(p.name)}</td><td>${prEscapeHtml((p.addr||'').slice(0,42))}</td><td>${prEscapeHtml(p.type||'—')}</td><td class="pr-num">${p.bedrooms??'—'}</td>
        <td class="pr-num">${prFmtMoney(val)}</td><td class="pr-num">${prFmtMoney(mr)}</td><td class="pr-num">${prFmtMoney(ar)}</td>
        <td class="pr-num">${prFmtMoney(exSum)}</td><td class="pr-num">${prFmtMoney(net)}</td><td class="pr-num">${yld.toFixed(1)}%</td>
        <td>${prEscapeHtml(p.status||'—')}</td><td>${tenant?prEscapeHtml(tenant.name):'—'}</td>
      </tr>`;
    }).join('');
    const tmr=(propertiesData||[]).reduce((s,p)=>s+Number(p.rent||0),0);
    const tar=tmr*12;
    pages.push(`<section class="pr-page">
      <h2 class="pr-h2">Property breakdown</h2>
      <table class="pr-table pr-tight"><thead><tr>
        <th>Property</th><th>Location</th><th>Type</th><th>Beds</th><th>Value</th><th>Monthly</th><th>Annual rent</th><th>Ann. exp.</th><th>Net</th><th>Yield</th><th>Status</th><th>Tenant</th>
      </tr></thead><tbody>${rows}
      <tr class="pr-total"><td colspan="4"><strong>Totals</strong></td><td class="pr-num"><strong>${prFmtMoney(data.totalValue)}</strong></td>
        <td class="pr-num"><strong>${prFmtMoney(tmr)}</strong></td><td class="pr-num"><strong>${prFmtMoney(tar)}</strong></td>
        <td class="pr-num"><strong>${prFmtMoney(data.annualExp)}</strong></td><td class="pr-num"><strong>${prFmtMoney(data.netAnnual)}</strong></td><td></td><td colspan="2"></td></tr>
      </tbody></table>
      <p class="pr-note">Values estimated as 14× annual rent where not set on property.</p>
    </section>`);
  }
  if(sections.fin){
    pages.push(`<section class="pr-page">
      <h2 class="pr-h2">Financial detail</h2>
      ${showCharts?`<div class="pr-chart-wrap tall"><canvas id="chartInc12" height="260"></canvas></div>`:''}
      <h3 class="pr-h3">Expense breakdown (annualized)</h3>
      <table class="pr-table"><thead><tr><th>Category</th><th>Annual amount</th><th>% of income</th></tr></thead><tbody>
        ${Object.keys(data.byCatAnnual).length?Object.entries(data.byCatAnnual).map(([k,v])=>`<tr><td>${prEscapeHtml(k)}</td><td class="pr-num">${prFmtMoney(v)}</td><td class="pr-num">${(data.catPct[k]||0).toFixed(1)}%</td></tr>`).join(''):'<tr><td colspan="3">No expenses in period</td></tr>'}
      </tbody></table>
      <h3 class="pr-h3">Cash flow — ${range.end.getFullYear()}</h3>
      <table class="pr-table"><thead><tr><th></th>${data.cashflowY.months.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Income</td>${data.cashflowY.inc.map(v=>`<td class="pr-num">${prFmtMoney(v)}</td>`).join('')}</tr>
        <tr><td>Expenses</td>${data.cashflowY.exp.map(v=>`<td class="pr-num">${prFmtMoney(v)}</td>`).join('')}</tr>
        <tr><td><strong>Net</strong></td>${data.cashflowY.net.map(v=>`<td class="pr-num"><strong>${prFmtMoney(v)}</strong></td>`).join('')}</tr>
      </tbody></table>
      ${showCharts?`<div class="pr-chart-wrap tall"><canvas id="chartCf" height="260"></canvas></div>`:''}
    </section>`);
  }
  if(sections.ten){
    const trows=(tenantsData||[]).filter(t=>t&&t.id!=null).map(t=>{
      const pct=prTenantOnTimePct(t);
      return`<tr>
        <td>${prEscapeHtml(t.name||'')}</td><td>${prEscapeHtml(t.property||'')}</td><td>${prEscapeHtml(t.unit||'')}</td><td class="pr-num">${prFmtMoney(t.rent)}</td>
        <td>${prEscapeHtml(String(t.leaseStart||'').slice(0,10)||'—')}</td><td>${prEscapeHtml(String(t.leaseEnd||t.lease||'').slice(0,16))}</td>
        <td>${prEscapeHtml(t.status||'')}</td><td class="pr-num">${pct==null?'—':pct+'%'}</td>
      </tr>`;
    }).join('');
    const ren=data.renewals.map(t=>{
      const endL=String(t.leaseEnd||t.lease||'');
      return`<li>${prEscapeHtml(t.name)} — ${prEscapeHtml(t.property||'')} · lease end ${prEscapeHtml(endL)}</li>`;
    }).join('');
    pages.push(`<section class="pr-page">
      <h2 class="pr-h2">Tenant summary</h2>
      <table class="pr-table pr-tight"><thead><tr>
        <th>Name</th><th>Property</th><th>Unit</th><th>Rent</th><th>Lease start</th><th>Lease end</th><th>Status</th><th>On-time %</th>
      </tr></thead><tbody>${trows||'<tr><td colspan="8">No tenants</td></tr>'}</tbody></table>
      <h3 class="pr-h3">Renewals due within 90 days</h3>
      ${ren?`<ul class="pr-ul">${ren}</ul>`:'<p class="pr-note">None in the next 90 days.</p>'}
    </section>`);
  }
  const totalPages=pages.length||1;
  const foot=(n)=>`<footer class="pr-foot">Prepared by NestIQ Pro on ${prEscapeHtml(prepared)} · ${prEscapeHtml(meta.name)}${meta.company?` — ${prEscapeHtml(meta.company)}`:''}<br>
    Page ${n} of ${totalPages} · For financial enquiries: ${prEscapeHtml(meta.email||'—')} ${prEscapeHtml(meta.phone||'')}</footer>`;
  const bodyInner=pages.map((html,i)=>html+foot(i+1)).join('');
  return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Portfolio Report — NestIQ Pro</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
*{box-sizing:border-box}
body{font-family:'DM Sans',system-ui,sans-serif;margin:0;background:#f4f1eb;color:#0e1117;font-size:13px;line-height:1.45}
.pr-toolbar{position:sticky;top:0;z-index:10;background:#0e1117;color:#f7f4ef;padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pr-toolbar button{background:#c9a84c;color:#0e1117;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer}
.pr-toolbar button.secondary{background:transparent;color:#f7f4ef;border:1px solid rgba(247,244,239,.35)}
.pr-page{padding:28px 36px 48px;page-break-after:always;background:#fff;max-width:900px;margin:0 auto 16px;box-shadow:0 4px 24px rgba(14,17,23,.08)}
.pr-page:last-of-type{page-break-after:auto}
.pr-head{display:flex;gap:20px;align-items:flex-start;border-bottom:2px solid #c9a84c;padding-bottom:16px;margin-bottom:20px}
.pr-title{font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:700;letter-spacing:.04em}
.pr-sub{font-size:0.95rem;margin-top:4px}
.pr-meta{font-size:0.78rem;color:#5c6473;margin-top:6px}
.pr-h2{font-family:'Playfair Display',serif;font-size:1.15rem;border-bottom:1px solid #e5e1d8;padding-bottom:8px;margin:0 0 14px}
.pr-h3{font-size:0.95rem;margin:18px 0 8px}
.pr-box{border:1px solid #e5e1d8;border-radius:10px;padding:14px 16px;margin-bottom:16px;background:#faf8f4}
.pr-box-title{font-weight:700;margin-bottom:12px;color:#8a6d2e}
.pr-stats4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center}
.pr-stat-val{font-family:'Playfair Display',serif;font-size:1.25rem;font-weight:700;color:#c9a84c}
.pr-stat-lbl{font-size:0.72rem;text-transform:uppercase;letter-spacing:.06em;color:#5c6473;margin-top:4px}
.pr-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.78rem}
.pr-table th,.pr-table td{border:1px solid #e5e1d8;padding:6px 8px;text-align:left}
.pr-table th{background:#f4f1eb;font-weight:600}
.pr-num{text-align:right;white-space:nowrap}
.pr-total td{background:#faf8f4}
.pr-tight td,.pr-tight th{padding:5px 6px;font-size:0.72rem}
.pr-note{font-size:0.75rem;color:#6b7280;margin-top:8px}
.pr-chart-wrap{max-width:520px;margin:16px auto}
.pr-chart-wrap.tall{max-width:640px}
.pr-ul{margin:8px 0;padding-left:18px}
.pr-foot{margin-top:28px;padding-top:12px;border-top:1px solid #e5e1d8;font-size:0.72rem;color:#6b7280;text-align:center}
@media(max-width:700px){.pr-stats4{grid-template-columns:1fr 1fr}}
@media print{
  .pr-toolbar{display:none!important}
  body{background:#fff}
  .pr-page{box-shadow:none;margin:0;max-width:100%;page-break-after:always}
  .pr-page:last-of-type{page-break-after:auto}
}
</style></head><body>
<div class="pr-toolbar no-print">
  <button type="button" onclick="window.print()">Print</button>
  <button type="button" class="secondary" onclick="opener.__nestiqBuildPortfolioPDF(window)">Download PDF</button>
  <button type="button" class="secondary" onclick="window.close()">Close</button>
</div>
${bodyInner}
<script>
(function(){
  var D=${chartDataJson};
  var show=${showCharts?'true':'false'};
  function go(){
    if(!show||typeof Chart==='undefined') return;
    var occ=document.getElementById('chartOcc');
    if(occ) new Chart(occ,{type:'pie',data:D.occ,options:{plugins:{legend:{position:'bottom'}},maintainAspectRatio:true}});
    var i12=document.getElementById('chartInc12');
    if(i12) new Chart(i12,{type:'bar',data:{labels:D.inc12.labels,datasets:D.inc12.datasets},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    var cf=document.getElementById('chartCf');
    if(cf) new Chart(cf,{type:'line',data:{labels:D.cf.labels,datasets:D.cf.datasets},options:{plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
})();
<\/script>
</body></html>`;
}

function __nestiqBuildPortfolioPDF(reportWin){
  const{jsPDF}=window.jspdf||{};
  if(!jsPDF){ showNotif('PDF library not loaded','error'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  const meta=prLandlordMeta();
  const prepared=new Date().toLocaleDateString('en-ZA',{dateStyle:'long'});
  const pages=reportWin.document.querySelectorAll('.pr-page');
  if(!pages.length){
    doc.setFontSize(14);
    doc.text('Portfolio report',14,20);
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text(`Prepared by NestIQ Pro on ${prepared}`,pageW/2,pageH-10,{align:'center'});
    doc.save('nestiq-portfolio-report.pdf');
    showNotif('PDF downloaded','success');
    return;
  }
  pages.forEach((section,idx)=>{
    if(idx>0) doc.addPage();
    let y=14;
    doc.setFontSize(16);
    doc.setTextColor(201,168,76);
    doc.text('NestIQ Pro',14,y);
    y+=8;
    doc.setTextColor(14,17,23);
    const clone=section.cloneNode(true);
    clone.querySelectorAll('footer').forEach(f=>f.remove());
    const raw=(clone.innerText||clone.textContent||'').replace(/\s+/g,' ').trim();
    const lines=doc.splitTextToSize(raw,pageW-28);
    doc.setFontSize(7.5);
    lines.forEach(line=>{
      if(y>pageH-32){ doc.addPage(); y=14; }
      doc.text(line,14,y);
      y+=3.6;
    });
    section.querySelectorAll('canvas').forEach(cv=>{
      try{
        const img=cv.toDataURL('image/png');
        if(y>pageH-58){ doc.addPage(); y=14; }
        doc.addImage(img,'PNG',14,y,pageW-28,48);
        y+=52;
      }catch(_e){}
    });
  });

  const tp=doc.internal.getNumberOfPages();
  for(let i=1;i<=tp;i++){
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text(`Prepared by NestIQ Pro on ${prepared}`,pageW/2,pageH-18,{align:'center'});
    doc.text(`${meta.name}${meta.company?' — '+meta.company:''}`,pageW/2,pageH-14,{align:'center'});
    doc.text(`Page ${i} of ${tp} · For financial enquiries: ${meta.email||'—'} ${meta.phone||''}`,pageW/2,pageH-10,{align:'center'});
  }
  doc.save(`nestiq-portfolio-report-${new Date().toISOString().slice(0,10)}.pdf`);
  showNotif('PDF downloaded','success');
}

window.__nestiqBuildPortfolioPDF=__nestiqBuildPortfolioPDF;

function __nestiqPortfolioPdfDirect(data,sections,meta,prepared,range){
  const{jsPDF}=window.jspdf||{};
  if(!jsPDF){ showNotif('PDF library not loaded','error'); return; }
  const w=window.open('','_blank');
  if(!w){ showNotif('Allow pop-ups for PDF generation','warning'); return; }
  w.document.write(prBuildReportDocument(data,sections,meta,prepared,range));
  w.document.close();
  let tries=0;
  const tryPdf=()=>{
    tries++;
    const needCharts=sections.charts&&w.document.querySelector('canvas');
    const chartReady=!needCharts||tries>35||Array.from(w.document.querySelectorAll('canvas')).some(c=>(c.width||0)>0);
    if(needCharts&&!chartReady&&tries<35){
      setTimeout(tryPdf,100);
      return;
    }
    __nestiqBuildPortfolioPDF(w);
    try{ w.close(); }catch(_e){}
  };
  setTimeout(tryPdf,sections.charts?400:150);
}

function refreshPortfolioReportButtons(){
  const s=typeof getSession==='function'?getSession():null;
  const ok=s?.role==='landlord';
  document.querySelectorAll('[data-portfolio-report]').forEach(el=>{
    el.style.display=ok?'inline-flex':'none';
  });
}

window.openPortfolioReportOptionsModal=openPortfolioReportOptionsModal;
window.generatePortfolioReportFromModal=generatePortfolioReportFromModal;
window.refreshPortfolioReportButtons=refreshPortfolioReportButtons;
