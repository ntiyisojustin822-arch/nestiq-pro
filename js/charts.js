let chartInstances={};

function nestiqChartMonthKeys(){
  const keys=[];
  const labels=[];
  const now=new Date();
  for(let i=11;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    keys.push(d.toISOString().slice(0,7));
    labels.push(d.toLocaleString('en-ZA',{month:'short'}));
  }
  return { keys, labels };
}

function nestiqPaymentsTotalsByMonth(){
  const b={};
  (paymentsData||[]).forEach(p=>{
    const k=String(p.date||'').slice(0,7);
    if(k.length<7) return;
    b[k]=(b[k]||0)+Number(p.amount||0);
  });
  return b;
}

function nestiqExpenseTotalsByMonth(){
  const b={};
  (expenses||[]).forEach(e=>{
    if(e.isIncome) return;
    const k=String(e.date||'').slice(0,7);
    if(k.length<7) return;
    b[k]=(b[k]||0)+Number(e.amount||0);
  });
  return b;
}

function nestiqChartSkeleton(canvasId, show){
  const canvas=document.getElementById(canvasId);
  const wrap=canvas?.closest('.chart-wrap')||canvas?.parentElement;
  if(!wrap) return;
  let sk=wrap.querySelector('.nq-chart-skel');
  if(show){
    if(!sk){
      sk=document.createElement('div');
      sk.className='nq-chart-skel';
      sk.style.cssText='position:absolute;inset:8px;z-index:2;pointer-events:none';
      wrap.style.position='relative';
      wrap.appendChild(sk);
    }
    nestiqShowSkeleton?.(sk,'card',1);
    return;
  }
  sk?.remove();
}

function initCharts(){
  const emptyEl=document.getElementById('chartsEmptyState');
  const grid=document.getElementById('chartsGrid');
  const statsRow=document.getElementById('chartStatsRow');
  ['revenueChart','occupancyChart','expenseDonut','cashflowChart'].forEach(id=>nestiqChartSkeleton(id,true));
  const noData=(!(propertiesData||[]).length&&!(tenantsData||[]).length);

  if(noData){
    ['revenueChart','occupancyChart','expenseDonut','cashflowChart'].forEach(id=>nestiqChartSkeleton(id,false));
    if(emptyEl) emptyEl.style.display='block';
    if(grid) grid.style.display='none';
    if(statsRow) statsRow.innerHTML='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  if(grid) grid.style.display='';

  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const textColor=dark?'rgba(240,236,228,0.5)':'rgba(14,17,23,0.4)';
  const gridColor=dark?'rgba(240,236,228,0.06)':'rgba(14,17,23,0.05)';
  const gold='#c9a84c', sage='#5a7a60', rust='#c46a3a', sky='#3a6b8a';

  const occupied=tenantsData.filter(t=>t.status!=='vacant');
  const monthlyRevenue=occupied.reduce((s,t)=>s+Number(t.rent||0),0);
  const expOnly=(expenses||[]).filter(e=>!e.isIncome);
  const totalExpLogged=expOnly.reduce((s,e)=>s+Number(e.amount||0),0);
  const net=monthlyRevenue-totalExpLogged;
  const occRate=propertiesData.length?Math.round(propertiesData.filter(p=>p.status==='occupied').length/propertiesData.length*100):0;

  if(statsRow){
    statsRow.innerHTML=[
      {val:'R'+monthlyRevenue.toLocaleString('en-ZA'),lbl:'Monthly Revenue',trend:'Live',up:true},
      {val:'R'+totalExpLogged.toLocaleString('en-ZA'),lbl:'Logged Expenses',trend:'Live',up:false},
      {val:'R'+Math.max(0,net).toLocaleString('en-ZA'),lbl:'Net (rev − logged exp)',trend:'Live',up:net>=0},
      {val:occRate+'%',lbl:'Occupancy Rate',trend:'Live',up:true},
    ].map(s=>`<div class="chart-stat"><div class="chart-stat-val">${s.val}</div><div class="chart-stat-lbl">${s.lbl}</div><div class="chart-stat-trend ${s.up?'trend-up':'trend-dn'}">${s.trend}</div></div>`).join('');
  }

  const { keys, labels:months }=nestiqChartMonthKeys();
  const payM=nestiqPaymentsTotalsByMonth();
  const expM=nestiqExpenseTotalsByMonth();
  const revArr=keys.map(k=>payM[k]||0);
  const expArr=keys.map(k=>expM[k]||0);
  const cashArr=keys.map((k,i)=>(revArr[i]||0)-(expArr[i]||0));
  const occArr=keys.map(()=>occRate);

  const baseOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:textColor,font:{family:'DM Sans',size:11},boxWidth:12,padding:16}}},scales:{x:{grid:{color:gridColor},ticks:{color:textColor,font:{family:'DM Sans',size:10}}},y:{grid:{color:gridColor},ticks:{color:textColor,font:{family:'DM Sans',size:10}}}}};
  const destroy=id=>{if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id]}};

  const revEl=document.getElementById('revenueChart');
  if(revEl){
    destroy('revenue');
    chartInstances.revenue=new Chart(revEl,{
      type:'bar',
      data:{labels:months,datasets:[
        {label:'Revenue',data:revArr,backgroundColor:gold+'99',borderColor:gold,borderWidth:1.5,borderRadius:5},
        {label:'Expenses',data:expArr,backgroundColor:sage+'99',borderColor:sage,borderWidth:1.5,borderRadius:5}
      ]},
      options:{...baseOpts,scales:{...baseOpts.scales,y:{...baseOpts.scales.y,ticks:{...baseOpts.scales.y.ticks,callback:v=>'R'+(Number(v)>=1000?(Number(v)/1000).toFixed(0)+'k':Number(v))}}}}
    });
  }

  const occEl=document.getElementById('occupancyChart');
  if(occEl){
    destroy('occupancy');
    chartInstances.occupancy=new Chart(occEl,{
      type:'line',
      data:{labels:months,datasets:[{label:'Occupancy %',data:occArr,borderColor:gold,backgroundColor:gold+'18',fill:true,tension:0.4,pointBackgroundColor:gold,pointRadius:4}]},
      options:{...baseOpts,scales:{...baseOpts.scales,y:{...baseOpts.scales.y,min:0,max:100,ticks:{...baseOpts.scales.y.ticks,callback:v=>v+'%'}}}}
    });
  }

  const bycat={};
  expOnly.forEach(e=>{bycat[e.cat]=(bycat[e.cat]||0)+Number(e.amount||0);});
  const donutLabels=Object.keys(bycat).length?Object.keys(bycat):['Other'];
  const donutData=Object.keys(bycat).length?Object.values(bycat):[1];
  const colorPal=[rust,gold,sky,sage,'#9b7ebd','#888'];

  const donutEl=document.getElementById('expenseDonut');
  if(donutEl){
    destroy('expDonut');
    chartInstances.expDonut=new Chart(donutEl,{
      type:'doughnut',
      data:{labels:donutLabels,datasets:[{data:donutData,backgroundColor:donutLabels.map((_,i)=>colorPal[i%colorPal.length]+'cc'),borderWidth:0,hoverOffset:8}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:textColor,font:{family:'DM Sans',size:11},boxWidth:12}}},cutout:'65%'}
    });
  }

  const cfEl=document.getElementById('cashflowChart');
  if(cfEl){
    destroy('cashflow');
    chartInstances.cashflow=new Chart(cfEl,{
      type:'line',
      data:{labels:months,datasets:[{label:'Net Cash Flow',data:cashArr,borderColor:sage,backgroundColor:sage+'18',fill:true,tension:0.4,pointBackgroundColor:sage,pointRadius:4}]},
      options:{...baseOpts,scales:{...baseOpts.scales,y:{...baseOpts.scales.y,ticks:{...baseOpts.scales.y.ticks,callback:v=>'R'+(Number(v)>=1000?(Number(v)/1000).toFixed(0)+'k':Number(v))}}}}
    });
  }
  if(typeof nestiqInitChartsMaintenanceTab==='function') nestiqInitChartsMaintenanceTab();
  ['revenueChart','occupancyChart','expenseDonut','cashflowChart'].forEach(id=>nestiqChartSkeleton(id,false));
}

async function runAiPortfolioAnalysis(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="runAiPortfolioAnalysis"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Analysing...');
  const out=document.getElementById('aiPortfolioResult');
  if(out) out.innerHTML=aiLoadingHtml();
  try{
  const totalProps=propertiesData.length;
  const occupied=propertiesData.filter(p=>p.status==='occupied').length;
  const vacant=propertiesData.filter(p=>p.status==='vacant').length;
  const occRate=totalProps?Math.round((occupied/totalProps)*100):0;
  const revenue=tenantsData.filter(t=>t.status!=='vacant').reduce((s,t)=>s+Number(t.rent||0),0);
  const expForAi=(expenses||[]).filter(e=>!e.isIncome);
  const expensesMonthly=expForAi.reduce((s,e)=>s+Number(e.amount||0),0)/Math.max(1,12);
  const net=revenue-expensesMonthly;
  const overallYield=((revenue*12)/Math.max(1,propertiesData.reduce((s,p)=>s+Number(p.rent||0)*12,0))*100).toFixed(1);
  const propLines=propertiesData.map(p=>{
    const pExp=expForAi.filter(e=>e.prop===p.name).reduce((s,e)=>s+Number(e.amount||0),0)/12;
    const y=((Number(p.rent||0)*12)/Math.max(1,Number(p.rent||0)*12)*100).toFixed(1);
    return `- ${p.name}: R${Number(p.rent||0).toLocaleString('en-ZA')}/month, ${p.status}, yield ${y}%, expenses R${Math.round(pExp).toLocaleString('en-ZA')}/month`;
  }).join('\n');
  const topExp=Object.entries(expForAi.reduce((a,e)=>{a[e.cat]=(a[e.cat]||0)+Number(e.amount||0);return a;},{})).map(([k,v])=>`${k}: R${Math.round(v).toLocaleString('en-ZA')}`).join(', ');
  const openMaint=maintenanceData.filter(m=>m.status!=='done').length;
  const summary=`Portfolio Summary:
- Total Properties: ${totalProps}
- Occupied: ${occupied} (${occRate}%)
- Vacant: ${vacant} (losing R${propertiesData.filter(p=>p.status==='vacant').reduce((s,p)=>s+Number(p.rent||0),0).toLocaleString('en-ZA')}/month)
- Total Monthly Revenue: R${Math.round(revenue).toLocaleString('en-ZA')}
- Total Monthly Expenses: R${Math.round(expensesMonthly).toLocaleString('en-ZA')}
- Net Monthly Income: R${Math.round(net).toLocaleString('en-ZA')}
- Overall Yield: ${overallYield}%
Properties:
${propLines}
Top expenses: ${topExp}
Open maintenance: ${openMaint} requests`;
  const parsed=await analyzePortfolioAI(summary);
  if(!out) return;
  if(!parsed?.ok){ out.innerHTML=aiRawFallbackCard(parsed?.raw||'No AI response'); return; }
  const d=parsed.data||{};
  const score=Math.max(0,Math.min(100,Number(d.healthScore||0)));
  const col=score>70?'var(--sage)':score>=50?'var(--gold)':'var(--rust)';
  const recs=Array.isArray(d.recommendations)?d.recommendations.sort((a,b)=>({High:0,Medium:1,Low:2}[a.priority]-({High:0,Medium:1,Low:2}[b.priority]))):[];
  out.innerHTML=`<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:14px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="width:86px;height:86px;border-radius:50%;border:6px solid ${col};display:grid;place-items:center;font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700;color:${col}">${score}</div>
      <div><div style="font-weight:700">Portfolio Health Score</div><span class="badge ${d.overallHealth==='Excellent'?'badge-green':d.overallHealth==='Poor'?'badge-red':'badge-amber'}">${d.overallHealth||'Fair'}</span></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px">${(d.topInsights||[]).slice(0,3).map(i=>`<div style="background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:.82rem">${i}</div>`).join('')}</div>
    <div style="margin-top:10px">${recs.map(r=>`<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px"><span class="badge ${r.priority==='High'?'badge-red':r.priority==='Medium'?'badge-amber':'badge-green'}">${r.priority}</span> <strong>${r.action}</strong><div style="font-size:.8rem;color:var(--muted)">${r.impact}</div></div>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="badge badge-amber">Best: ${d.bestPerformingProperty||'—'}</span><span class="badge badge-amber">Underperforming: ${d.underperformingProperty||'—'}</span><span class="badge badge-amber">Vacancy Risk: ${d.vacancyRisk||'—'}</span><span class="badge badge-amber">Cash Flow: ${d.cashFlowTrend||'—'}</span></div>
    ${aiAttribution()}
  </div>`;
  }finally{
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

window.runAiPortfolioAnalysis=runAiPortfolioAnalysis;
