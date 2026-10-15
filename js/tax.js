function renderTaxReport(){
  const year=parseInt(document.getElementById('taxYear')?.value)||2026;
  const incomeData={
    2026:{rental:1130400,other:0},
    2025:{rental:1044000,other:0},
    2024:{rental:984000,other:0},
  };
  const expData={
    2026:{Maintenance:42800,Insurance:5400,'Rates & Taxes':23400,Utilities:3840,'Agent Fees':22500,Other:5600},
    2025:{Maintenance:38500,Insurance:5000,'Rates & Taxes':21600,Utilities:3200,'Agent Fees':20800,Other:4200},
    2024:{Maintenance:32100,Insurance:4600,'Rates & Taxes':19800,Utilities:2900,'Agent Fees':19200,Other:3600},
  };
  const inc=incomeData[year]||incomeData[2026];
  const exp=expData[year]||expData[2026];
  const totalInc=Object.values(inc).reduce((a,b)=>a+b,0);
  const totalExp=Object.values(exp).reduce((a,b)=>a+b,0);
  const netInc=totalInc-totalExp;
  const fmt=v=>`R${v.toLocaleString('en-ZA')}`;

  const content=document.getElementById('taxReportContent');
  if(content){
    content.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700">NestIQ Portfolio</div>
        <div style="font-size:0.82rem;color:var(--muted)">Tax Year ${year} · SARS IT3</div>
      </div>
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:24px">Prepared ${new Date().toLocaleDateString('en-ZA')}</div>
      <div class="tax-section-title">Rental Income</div>
      <div class="tax-row"><span>Gross Rental Income</span><span class="tax-val income">${fmt(inc.rental)}</span></div>
      ${inc.other?`<div class="tax-row"><span>Other Income</span><span class="tax-val income">${fmt(inc.other)}</span></div>`:''}
      <div class="tax-row total"><span>Total Income</span><span class="tax-val income">${fmt(totalInc)}</span></div>
      <div class="tax-section-title">Allowable Deductions</div>
      ${Object.entries(exp).map(([k,v])=>`<div class="tax-row"><span>${k}</span><span class="tax-val expense">(${fmt(v)})</span></div>`).join('')}
      <div class="tax-row total"><span>Total Deductions</span><span class="tax-val expense">(${fmt(totalExp)})</span></div>
      <div class="tax-section-title" style="margin-top:28px">Net Taxable Rental Income</div>
      <div class="tax-row total" style="font-size:1.1rem;padding-top:16px"><span>Net Income</span><span class="tax-val net">${fmt(netInc)}</span></div>
      <div style="margin-top:20px;padding:14px;background:rgba(201,168,76,0.08);border-radius:10px;border:1px solid var(--border);font-size:0.8rem;color:var(--muted);line-height:1.6">
        ⚠️ This summary is for reference purposes only. Consult a registered tax practitioner for your official SARS submission.
      </div>`;
  }

  const summary=document.getElementById('taxSummaryBox');
  if(summary){
    summary.innerHTML=`
      <div style="font-family:'Playfair Display',serif;font-size:0.95rem;font-weight:700;color:var(--paper);margin-bottom:18px">${year} Summary</div>
      <div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(247,244,239,0.4)">Total Income</div><div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--sage)">${fmt(totalInc)}</div></div>
      <div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(247,244,239,0.4)">Total Deductions</div><div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--rust)">(${fmt(totalExp)})</div></div>
      <div style="padding-top:12px;border-top:1px solid rgba(247,244,239,0.1)"><div style="font-size:0.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(247,244,239,0.4)">Net Taxable</div><div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:var(--gold)">${fmt(netInc)}</div></div>`;
  }

  if(typeof appendTaxRenewalSectionToTax==='function') appendTaxRenewalSectionToTax(year);

  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  if(taxChartInst){taxChartInst.destroy();taxChartInst=null;}
  const ctx=document.getElementById('taxExpChart');
  if(ctx){
    taxChartInst=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(exp),datasets:[{data:Object.values(exp),backgroundColor:['#c46a3acc','#c9a84ccc','#3a6b8acc','#9b7ebdcc','#5a7a60cc','#888888cc'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:dark?'rgba(240,236,228,0.5)':'rgba(14,17,23,0.5)',font:{family:'DM Sans',size:10},boxWidth:10,padding:8}}},cutout:'60%'}});
  }
}

function exportTaxCSV(){
  const year=document.getElementById('taxYear')?.value;
  const rows=['Category,Amount','Rental Income,1130400','Maintenance,-42800','Insurance,-5400','Rates & Taxes,-23400','Utilities,-3840','Agent Fees,-22500','Other,-5600','Net Taxable,1027260'];
  downloadCSV(rows.join('\n'),`nestiq-tax-${year}.csv`);
  nestiqShowNotif('📥 Tax report exported!','success');
}

function printTaxReport(){window.print();}

