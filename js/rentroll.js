/* ═══════════════════════════════
   RENT ROLL REPORT
═══════════════════════════════ */

let nestiqRentRollYear=null;
let nestiqRentRollMonth=null;
let nestiqRentRollGrouped=false;

function rentRollInitMonth(){
  const now=new Date();
  nestiqRentRollYear=now.getFullYear();
  nestiqRentRollMonth=now.getMonth()+1;
}

function rentRollYmKey(y,m){
  return `${y}-${String(m).padStart(2,'0')}`;
}

function rentRollMonthLabel(y,m){
  return new Date(y,m-1,1).toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
}

function rentRollIsFuture(y,m){
  const now=new Date();
  const curY=now.getFullYear();
  const curM=now.getMonth()+1;
  return y>curY||(y===curY&&m>curM);
}

function rentRollLastDayIso(y,m){
  const d=new Date(y,m,0);
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${String(m).padStart(2,'0')}-${day}`;
}

function rentRollDefaultPaymentDate(y,m){
  const now=new Date();
  const curY=now.getFullYear();
  const curM=now.getMonth()+1;
  if(y===curY&&m===curM) return now.toISOString().slice(0,10);
  return rentRollLastDayIso(y,m);
}

function getActiveTenantForProperty(p){
  return (tenantsData||[]).find(t=>
    t&&t.status!=='vacant'&&(Number(t.propertyId)===Number(p.id)||t.property===p.name)
  )||null;
}

function getPaymentForTenantMonth(tenant,y,m){
  if(!tenant) return null;
  const key=rentRollYmKey(y,m);
  const tp=(tenant.payments||[]).find(p=>String(p.date||'').slice(0,7)===key);
  if(tp) return tp;
  const gp=(paymentsData||[]).find(p=>p.tenantId===tenant.id&&String(p.date||'').slice(0,7)===key);
  return gp||null;
}

function rentRollRowStatus(tenant,y,m,payment){
  if(!tenant||tenant.status==='vacant') return 'VACANT';
  if(payment) return 'PAID';
  const dueDay=Math.max(1,Math.min(28,Number(tenant.monthlyDueDate||1)));
  const due=new Date(y,m-1,dueDay);
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const monthEnd=new Date(y,m,0,23,59,59);
  const monthStart=new Date(y,m-1,1);
  if(monthEnd<monthStart) return 'DUE';
  if(monthEnd<today){
    return 'OVERDUE';
  }
  if(y===now.getFullYear()&&m===now.getMonth()+1){
    return today>due?'OVERDUE':'DUE';
  }
  return 'OVERDUE';
}

function rentRollExpectedRent(p,tenant){
  if(!tenant||tenant.status==='vacant') return 0;
  return Number(tenant.rent||p.rent||0);
}

function rentRollOutstandingAmount(tenant,p,payment,status){
  if(status==='VACANT'||status==='PAID') return 0;
  const exp=rentRollExpectedRent(p,tenant);
  const paid=payment?Number(payment.amount||0):0;
  return Math.max(0,exp-paid);
}

function vacantInfoForProperty(p,y,m){
  const rent=Number(p.rent||0);
  const start=new Date(y,m-1,1);
  const end=new Date(y,m,0);
  const today=new Date();
  const today0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const endClamp=new Date(Math.min(end,today0));
  let from=start;
  if(p.vacantSince){
    const vs=new Date(p.vacantSince);
    if(String(vs)!=='Invalid Date'&&vs>from) from=vs;
  }
  if(from>endClamp) return {days:0,lost:0};
  const days=Math.ceil((endClamp-from)/86400000)+1;
  const lost=Math.round(days*(rent/30));
  return {days,lost};
}

function buildRentRollRows(y,m){
  const rows=[];
  (propertiesData||[]).forEach(p=>{
    if(!p||p.id==null) return;
    const tenant=getActiveTenantForProperty(p);
    const payment=tenant?getPaymentForTenantMonth(tenant,y,m):null;
    const status=rentRollRowStatus(tenant,y,m,payment);
    const expected=rentRollExpectedRent(p,tenant);
    const dueDay=Math.max(1,Math.min(28,Number(tenant?.monthlyDueDate||1)));
    const dueDateStr=`${dueDay} ${new Date(y,m-1,1).toLocaleDateString('en-ZA',{month:'long',year:'numeric'})}`;
    const out=rentRollOutstandingAmount(tenant,p,payment,status);
    let vac={days:0,lost:0};
    if(status==='VACANT') vac=vacantInfoForProperty(p,y,m);
    rows.push({
      property:p,
      tenant,
      payment,
      status,
      expected,
      dueDateStr,
      outstanding:out,
      vacDays:vac.days,
      vacLost:vac.lost
    });
  });
  rows.sort((a,b)=>String(a.property.name||'').localeCompare(String(b.property.name||'')));
  return rows;
}

function rentRollStats(rows,y,m){
  let expected=0,collected=0,outstanding=0;
  rows.forEach(r=>{
    if(r.status==='VACANT') return;
    expected+=r.expected;
    if(r.payment) collected+=Number(r.payment.amount||0);
    outstanding+=r.outstanding;
  });
  const rate=expected>0?Math.round((collected/expected)*100):100;
  return {expected,collected,outstanding,rate};
}

function renderRentRollStats(stats){
  const el=document.getElementById('rentrollStats');
  if(!el) return;
  const rateColor=stats.rate>=95?'var(--sage)':stats.rate>=80?'var(--gold)':'var(--rust)';
  const outColor=stats.outstanding>0?'var(--rust)':'inherit';
  el.innerHTML=`
    <div class="rentroll-stat-card">
      <div class="rentroll-stat-lbl">Expected This Month</div>
      <div class="rentroll-stat-val" style="color:var(--gold)">R${stats.expected.toLocaleString('en-ZA')}</div>
    </div>
    <div class="rentroll-stat-card">
      <div class="rentroll-stat-lbl">Collected</div>
      <div class="rentroll-stat-val" style="color:var(--sage)">R${stats.collected.toLocaleString('en-ZA')}</div>
    </div>
    <div class="rentroll-stat-card">
      <div class="rentroll-stat-lbl">Outstanding</div>
      <div class="rentroll-stat-val" style="color:${outColor}">R${stats.outstanding.toLocaleString('en-ZA')}</div>
    </div>
    <div class="rentroll-stat-card rentroll-stat-card--wide">
      <div class="rentroll-stat-lbl">Collection Rate</div>
      <div class="rentroll-stat-val" style="color:${rateColor}">${stats.expected?stats.rate+'%':'—'}</div>
      ${stats.expected?`<div class="rentroll-rate-bar"><span style="width:${Math.min(100,stats.rate)}%;background:${rateColor}"></span></div>`:''}
    </div>`;
}

function rentRollStatusBadge(status){
  const map={
    PAID:{cls:'badge-green',t:'PAID'},
    OVERDUE:{cls:'badge-red',t:'OVERDUE'},
    DUE:{cls:'badge-amber',t:'DUE'},
    VACANT:{cls:'badge-gray',t:'VACANT'}
  };
  const x=map[status]||map.DUE;
  return `<span class="badge ${x.cls}">${x.t}</span>`;
}

function rentRollActionsHtml(r,y,m){
  const t=r.tenant;
  const pid=r.property.id;
  const yv=y??nestiqRentRollYear;
  const mv=m??nestiqRentRollMonth;
  const lfExtra=typeof lateFeeRentRollExtraActions==='function'?lateFeeRentRollExtraActions(r,yv,mv):'';
  if(r.status==='VACANT'){
    return `<div class="rentroll-actions-cell">
      <button type="button" class="rentroll-icon-btn" title="Find tenant" onclick="rentRollFindTenant(${pid})">＋</button>
    </div>`;
  }
  const tid=t.id;
  const unpaid=r.status!=='PAID';
  return `<div class="rentroll-actions-cell">
    ${unpaid?`<button type="button" class="rentroll-icon-btn" title="Record payment" onclick="rentRollRecordPayment(${tid})">💳</button>`:''}
    ${unpaid?`<button type="button" class="rentroll-icon-btn" title="WhatsApp reminder" onclick="sendTenantWhatsAppTemplate(${tid},'rentReminder')">📱</button>`:''}
    ${lfExtra}
    <button type="button" class="rentroll-icon-btn" title="View tenant" onclick="viewTenant(${tid})">👤</button>
  </div>`;
}

function rentRollRowHtml(r,no,y,m){
  const yv=y??nestiqRentRollYear;
  const mv=m??nestiqRentRollMonth;
  const lfCell=typeof lateFeeRentRollCell==='function'?lateFeeRentRollCell(r,yv,mv):'—';
  const p=r.property;
  const t=r.tenant;
  const pay=r.payment;
  const addr=String(p.addr||'').replace(/</g,'');
  const nameBold=`<span class="rentroll-prop-name">${String(p.name||'').replace(/</g,'')}</span>`;
  const tenantCell=r.status==='VACANT'
    ? `<div><span style="color:var(--rust);font-weight:600">Vacant</span></div>
       <div class="rentroll-muted-sm">Vacant for ${r.vacDays} day${r.vacDays===1?'':'s'}</div>
       <div class="rentroll-muted-sm">Lost income: R${r.vacLost.toLocaleString('en-ZA')}</div>
       <button type="button" class="btn-outline btn-sm" style="margin-top:6px;padding:4px 10px;font-size:0.72rem" onclick="rentRollFindTenant(${p.id})">Find Tenant</button>`
    : escapeCell(t.name);
  const unit=r.status==='VACANT'?'—':escapeCell(t.unit||'—');
  const rentGold=`<span class="rentroll-money">R${r.expected.toLocaleString('en-ZA')}</span>`;
  const paidDate=pay&&pay.date?escapeCell(String(pay.date).slice(0,10)):'—';
  const method=pay?escapeCell(pay.method||'—'):'—';
  const receipt=pay?escapeCell(pay.receiptNo||'—'):'—';
  const outStr=r.outstanding>0?`<span class="rentroll-money rentroll-out">R${r.outstanding.toLocaleString('en-ZA')}</span>`:'—';
  return `<tr class="rentroll-tr ${no%2?'rentroll-tr-alt':''}">
    <td>${no}</td>
    <td>${nameBold}<div class="rentroll-muted-sm">${addr}</div></td>
    <td>${tenantCell}</td>
    <td>${unit}</td>
    <td>${rentGold}</td>
    <td>${escapeCell(r.dueDateStr)}</td>
    <td>${rentRollStatusBadge(r.status)}</td>
    <td>${paidDate}</td>
    <td>${method}</td>
    <td>${receipt}</td>
    <td>${outStr}</td>
    <td>${lfCell}</td>
    <td class="no-print">${rentRollActionsHtml(r,yv,mv)}</td>
  </tr>`;
}

function escapeCell(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

function rentRollTotalsRow(rows,y,m){
  const yv=y??nestiqRentRollYear;
  const mv=m??nestiqRentRollMonth;
  let sumRent=0,sumOut=0,sumLf=0;
  rows.forEach(r=>{
    sumRent+=r.expected;
    sumOut+=r.outstanding;
    sumLf+=typeof lateFeeRentRollAmount==='function'?lateFeeRentRollAmount(r,yv,mv):0;
  });
  const lfTot=sumLf>0?`<strong class="rentroll-out">R${sumLf.toLocaleString('en-ZA')}</strong>`:'—';
  return `<tr class="rentroll-tr rentroll-tr-totals">
    <td colspan="4"><strong>Totals</strong></td>
    <td><strong class="rentroll-money">R${sumRent.toLocaleString('en-ZA')}</strong></td>
    <td colspan="5"></td>
    <td><strong class="rentroll-out">R${sumOut.toLocaleString('en-ZA')}</strong></td>
    <td>${lfTot}</td>
    <td class="no-print"></td>
  </tr>`;
}

function rentRollSubtotalRows(subrows,y,m){
  const yv=y??nestiqRentRollYear;
  const mv=m??nestiqRentRollMonth;
  let sumRent=0,sumOut=0,sumLf=0;
  subrows.forEach(r=>{
    sumRent+=r.expected;
    sumOut+=r.outstanding;
    sumLf+=typeof lateFeeRentRollAmount==='function'?lateFeeRentRollAmount(r,yv,mv):0;
  });
  const lfTot=sumLf>0?`<em class="rentroll-out">R${sumLf.toLocaleString('en-ZA')}</em>`:'—';
  return `<tr class="rentroll-tr rentroll-tr-subtotals">
    <td colspan="4"><em>Subtotal</em></td>
    <td><em class="rentroll-money">R${sumRent.toLocaleString('en-ZA')}</em></td>
    <td colspan="5"></td>
    <td><em class="rentroll-out">R${sumOut.toLocaleString('en-ZA')}</em></td>
    <td>${lfTot}</td>
    <td class="no-print"></td>
  </tr>`;
}

function renderRentRollTable(rows,y,m){
  const wrap=document.getElementById('rentrollTableWrap');
  if(!wrap) return;
  const head=`<thead><tr>
    <th>No</th><th>Property</th><th>Tenant</th><th>Unit</th><th>Monthly Rent</th><th>Due Date</th><th>Status</th>
    <th>Date Paid</th><th>Method</th><th>Receipt No</th><th>Outstanding</th><th>Late Fee</th><th class="no-print">Actions</th>
  </tr></thead>`;
  if(!nestiqRentRollGrouped){
    let no=1;
    const body=rows.map(r=>rentRollRowHtml(r,no++,y,m)).join('');
    wrap.innerHTML=`<table class="rentroll-table">${head}<tbody>${body}${rentRollTotalsRow(rows,y,m)}</tbody></table>`;
    return;
  }
  const order=['PAID','OVERDUE','DUE','VACANT'];
  const labels={PAID:'PAID',OVERDUE:'OVERDUE',DUE:'DUE',VACANT:'VACANT'};
  const hdrCls={PAID:'rentroll-grp-paid',OVERDUE:'rentroll-grp-overdue',DUE:'rentroll-grp-due',VACANT:'rentroll-grp-vacant'};
  let html='';
  let no=1;
  order.forEach(st=>{
    const sub=rows.filter(r=>r.status===st);
    if(!sub.length) return;
    html+=`<div class="rentroll-group"><div class="rentroll-group-h ${hdrCls[st]}">${labels[st]}</div>`;
    html+=`<table class="rentroll-table">${head}<tbody>`;
    sub.forEach(r=>{ html+=rentRollRowHtml(r,no++,y,m); });
    html+=rentRollSubtotalRows(sub,y,m);
    html+=`</tbody></table></div>`;
  });
  html+=`<table class="rentroll-table rentroll-table-grand"><tbody>${rentRollTotalsRow(rows,y,m)}</tbody></table>`;
  wrap.innerHTML=html;
}

function renderRentRollVacantFooter(rows){
  const el=document.getElementById('rentrollVacantSummary');
  if(!el) return;
  const total=rows.filter(r=>r.status==='VACANT').reduce((s,r)=>s+r.vacLost,0);
  if(total<=0){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  el.innerHTML=`<div class="rentroll-vacant-banner">
    <strong>Total lost income from vacant properties:</strong> R${total.toLocaleString('en-ZA')} this month
  </div>`;
}

function rentRollNextYm(y,m){
  let ny=y,nm=m+1;
  if(nm>12){ ny++; nm=1; }
  return {y:ny,m:nm};
}

function syncRentRollUi(){
  const y=nestiqRentRollYear;
  const m=nestiqRentRollMonth;
  const lbl=document.getElementById('rentrollMonthLabel');
  if(lbl) lbl.textContent=rentRollMonthLabel(y,m);
  const inp=document.getElementById('rentrollMonthInput');
  if(inp) inp.value=rentRollYmKey(y,m);
  const n=rentRollNextYm(y,m);
  const next=document.getElementById('rentrollNext');
  if(next) next.disabled=rentRollIsFuture(n.y,n.m);
}

function renderRentRoll(){
  if(!document.getElementById('page-rentroll')) return;
  const y=nestiqRentRollYear;
  const m=nestiqRentRollMonth;
  if(rentRollIsFuture(y,m)) rentRollInitMonth();
  syncRentRollUi();
  const rows=buildRentRollRows(nestiqRentRollYear,nestiqRentRollMonth);
  const stats=rentRollStats(rows,nestiqRentRollYear,nestiqRentRollMonth);
  renderRentRollStats(stats);
  renderRentRollTable(rows,nestiqRentRollYear,nestiqRentRollMonth);
  renderRentRollVacantFooter(rows);
}

function rentRollPrevMonth(){
  let y=nestiqRentRollYear;
  let m=nestiqRentRollMonth-1;
  if(m<1){ y--; m=12; }
  nestiqRentRollYear=y;
  nestiqRentRollMonth=m;
  renderRentRoll();
}

function rentRollNextMonth(){
  let y=nestiqRentRollYear;
  let m=nestiqRentRollMonth+1;
  if(m>12){ y++; m=1; }
  if(rentRollIsFuture(y,m)) return;
  nestiqRentRollYear=y;
  nestiqRentRollMonth=m;
  renderRentRoll();
}

function rentRollOnMonthInput(){
  const inp=document.getElementById('rentrollMonthInput');
  if(!inp||!inp.value) return;
  const [ys,ms]=inp.value.split('-').map(Number);
  if(rentRollIsFuture(ys,ms)){
    showNotif('Cannot select a future month','warning');
    syncRentRollUi();
    return;
  }
  nestiqRentRollYear=ys;
  nestiqRentRollMonth=ms;
  renderRentRoll();
}

function rentRollSetGrouped(grouped){
  nestiqRentRollGrouped=Boolean(grouped);
  document.getElementById('rentrollToggleAll')?.classList.toggle('active',!grouped);
  document.getElementById('rentrollToggleGroup')?.classList.toggle('active',grouped);
  renderRentRoll();
}

function rentRollRecordPayment(tenantId){
  const y=nestiqRentRollYear;
  const m=nestiqRentRollMonth;
  openPaymentModal(tenantId,{
    defaultDate:rentRollDefaultPaymentDate(y,m),
    onRecorded:()=>renderRentRoll()
  });
}

function rentRollFindTenant(propertyId){
  openModal('addTenant');
  setTimeout(()=>{
    const p=propertiesData.find(x=>Number(x.id)===Number(propertyId));
    const sel=document.getElementById('nt_prop');
    if(sel&&p){
      sel.value=p.name;
      const rent=document.getElementById('nt_rent');
      if(rent) rent.value=Number(p.rent||0);
    }
  },0);
}

function exportRentRollCSV(){
  const y=nestiqRentRollYear;
  const m=nestiqRentRollMonth;
  const rows=buildRentRollRows(y,m);
  const hdr='Property,Address,Tenant,Unit,MonthlyRent,DueDate,Status,DatePaid,Method,ReceiptNo,Outstanding,LateFee';
  const lines=rows.map(r=>{
    const p=r.property;
    const t=r.tenant;
    const pay=r.payment;
    const lf=typeof lateFeeRentRollAmount==='function'?lateFeeRentRollAmount(r,y,m):0;
    const cells=[
      p.name,p.addr||'',r.status==='VACANT'?'Vacant':(t?.name||''),
      r.status==='VACANT'?'':(t?.unit||''),
      r.expected,r.dueDateStr,r.status,
      pay?String(pay.date).slice(0,10):'',
      pay?(pay.method||''):'',
      pay?(pay.receiptNo||''):'',
      r.outstanding>0?r.outstanding:'',
      lf>0?lf:''
    ];
    return cells.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',');
  });
  downloadCSV([hdr,...lines].join('\n'),`nestiq-rentroll-${m}-${y}.csv`);
  showNotif('Rent roll CSV downloaded','success');
}

function exportRentRollPDF(){
  const { jsPDF }=window.jspdf;
  if(!jsPDF){ showNotif('PDF library not loaded','error'); return; }
  const y=nestiqRentRollYear;
  const m=nestiqRentRollMonth;
  const rows=buildRentRollRows(y,m);
  const stats=rentRollStats(rows,y,m);
  const ls=landlordSettings||{};
  const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  const margin=10;
  const colW=[6,30,26,10,17,22,14,17,14,17,15,14];
  const rowH=5.5;
  const tableBottom=pageH-22;
  let yPos=margin;

  function drawTableHeader(){
    const headers=['No','Property','Tenant','Unit','Rent','Due','Status','Paid','Method','Rcpt','Out','Late'];
    doc.setFillColor(201,168,76);
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.5);
    let x=margin;
    headers.forEach((h,i)=>{
      doc.rect(x,yPos,colW[i],6,'F');
      doc.text(h,x+0.8,yPos+4.2);
      x+=colW[i];
    });
    yPos+=6;
    doc.setTextColor(14,17,23);
    doc.setFont('helvetica','normal');
  }

  function drawCoverHeader(){
    doc.setTextColor(201,168,76);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text('NestIQ Pro',margin,yPos);
    yPos+=6;
    doc.setTextColor(14,17,23);
    doc.setFontSize(12);
    doc.text('RENT ROLL REPORT',margin,yPos);
    yPos+=5;
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text(`Month: ${rentRollMonthLabel(y,m)}`,margin,yPos);
    yPos+=4;
    doc.text(`Prepared: ${new Date().toLocaleDateString('en-ZA')}`,margin,yPos);
    yPos+=4;
    doc.text(`${ls.name||'Landlord'}${ls.companyName?` · ${ls.companyName}`:''}`,margin,yPos);
    yPos+=6;
    doc.setDrawColor(201,168,76);
    doc.line(margin,yPos,pageW-margin,yPos);
    yPos+=5;
    const boxW=(pageW-2*margin)/4;
    const boxes=[
      ['Expected',`R${stats.expected.toLocaleString('en-ZA')}`],
      ['Collected',`R${stats.collected.toLocaleString('en-ZA')}`],
      ['Outstanding',`R${stats.outstanding.toLocaleString('en-ZA')}`],
      ['Rate',stats.expected?`${stats.rate}%`:'—']
    ];
    boxes.forEach((pair,i)=>{
      const x=margin+i*boxW;
      doc.setFillColor(246,246,246);
      doc.rect(x,yPos,boxW-2,12,'F');
      doc.setFontSize(7);
      doc.setTextColor(80,80,80);
      doc.text(pair[0],x+1.5,yPos+4);
      doc.setFont('helvetica','bold');
      doc.setTextColor(14,17,23);
      doc.text(pair[1],x+1.5,yPos+9);
      doc.setFont('helvetica','normal');
    });
    yPos+=16;
  }

  function startFirstPage(){
    yPos=margin;
    drawCoverHeader();
    drawTableHeader();
  }

  function startTableContinuationPage(){
    doc.addPage();
    yPos=margin;
    doc.setFont('helvetica','italic');
    doc.setFontSize(8);
    doc.setTextColor(100,100,100);
    doc.text(`Rent Roll — ${rentRollMonthLabel(y,m)} (continued)`,margin,yPos);
    yPos+=6;
    doc.setFont('helvetica','normal');
    doc.setTextColor(14,17,23);
    drawTableHeader();
  }

  function drawRow(r,no,idx){
    const fill=idx%2?245:255;
    doc.setFillColor(fill,fill,fill);
    doc.setDrawColor(220,220,220);
    let x=margin;
    const lfAmt=typeof lateFeeRentRollAmount==='function'?lateFeeRentRollAmount(r,y,m):0;
    const cells=[
      String(no),
      String(r.property.name||'').slice(0,22),
      r.status==='VACANT'?'Vacant':String(r.tenant?.name||'').slice(0,18),
      r.status==='VACANT'?'—':String(r.tenant?.unit||'').slice(0,8),
      `R${r.expected.toLocaleString('en-ZA')}`,
      String(r.dueDateStr).slice(0,18),
      r.status,
      r.payment?String(r.payment.date).slice(0,10):'—',
      r.payment?String(r.payment.method||'').slice(0,7):'—',
      r.payment?String(r.payment.receiptNo||'').slice(0,9):'—',
      r.outstanding>0?`R${r.outstanding.toLocaleString('en-ZA')}`:'—',
      lfAmt>0?`R${lfAmt.toLocaleString('en-ZA')}`:'—'
    ];
    doc.setFontSize(6);
    cells.forEach((txt,i)=>{
      doc.rect(x,yPos,colW[i],rowH,'FD');
      doc.text(String(txt),x+0.6,yPos+3.8);
      x+=colW[i];
    });
    yPos+=rowH;
  }

  startFirstPage();
  let no=1;
  rows.forEach((r,idx)=>{
    if(yPos+rowH>tableBottom){
      startTableContinuationPage();
    }
    drawRow(r,no++,idx);
  });
  if(yPos+rowH>tableBottom) startTableContinuationPage();
  doc.setFont('helvetica','bold');
  doc.setFillColor(230,228,220);
  let x=margin;
  const totRent=rows.reduce((s,r)=>s+r.expected,0);
  const totOut=rows.reduce((s,r)=>s+r.outstanding,0);
  const totLf=rows.reduce((s,r)=>s+(typeof lateFeeRentRollAmount==='function'?lateFeeRentRollAmount(r,y,m):0),0);
  const tot=['','Totals','','',`R${totRent.toLocaleString('en-ZA')}`,``,'','','','',`R${totOut.toLocaleString('en-ZA')}`,totLf>0?`R${totLf.toLocaleString('en-ZA')}`:''];
  tot.forEach((txt,i)=>{
    doc.rect(x,yPos,colW[i],rowH,'FD');
    doc.setFontSize(6.5);
    doc.text(txt,x+0.6,yPos+3.8);
    x+=colW[i];
  });
  yPos+=rowH+8;

  if(yPos+18>tableBottom){ startTableContinuationPage(); }
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(14,17,23);
  doc.text('Prepared by: _______________________________',margin,yPos);
  yPos+=6;
  doc.text('Date: _______________________________',margin,yPos);

  const totalP=doc.internal.getNumberOfPages();
  for(let pg=1;pg<=totalP;pg++){
    doc.setPage(pg);
    doc.setFontSize(7.5);
    doc.setTextColor(100,100,100);
    doc.text(`NestIQ Pro — Rent Roll Report — ${rentRollMonthLabel(y,m)} — Page ${pg} of ${totalP}`,pageW/2,pageH-6,{align:'center'});
    doc.text('Confidential — For landlord use only',pageW/2,pageH-2,{align:'center'});
  }

  doc.save(`nestiq-rentroll-${m}-${y}.pdf`);
  showNotif('PDF exported','success');
}

function initRentRollPage(){
  if(!document.getElementById('page-rentroll')) return;
  rentRollInitMonth();
  nestiqRentRollGrouped=false;
  document.getElementById('rentrollToggleAll')?.classList.add('active');
  document.getElementById('rentrollToggleGroup')?.classList.remove('active');
  document.getElementById('rentrollPrev')?.addEventListener('click',rentRollPrevMonth);
  document.getElementById('rentrollNext')?.addEventListener('click',rentRollNextMonth);
  document.getElementById('rentrollMonthInput')?.addEventListener('change',rentRollOnMonthInput);
  document.getElementById('rentrollToggleAll')?.addEventListener('click',()=>rentRollSetGrouped(false));
  document.getElementById('rentrollToggleGroup')?.addEventListener('click',()=>rentRollSetGrouped(true));
  renderRentRoll();
}

window.renderRentRoll=renderRentRoll;
window.initRentRollPage=initRentRollPage;
window.exportRentRollPDF=exportRentRollPDF;
window.exportRentRollCSV=exportRentRollCSV;
window.rentRollRecordPayment=rentRollRecordPayment;
window.rentRollFindTenant=rentRollFindTenant;
