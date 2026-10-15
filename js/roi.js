function calcROI(){
  const g=id=>parseFloat(document.getElementById(id)?.value)||0;
  const price=g('roi_price'), deposit=g('roi_deposit'), rent=g('roi_rent');
  const mortgage=g('roi_mortgage'), rates=g('roi_rates'), insurance=g('roi_insurance'), maint=g('roi_maint');
  const vacancy=g('roi_vacancy')/100, mgmt=g('roi_mgmt')/100;

  const annualRent=rent*12;
  const effectiveRent=rent*(1-vacancy);
  const mgmtFee=rent*mgmt;
  const totalExpenses=mortgage+rates+insurance+maint+mgmtFee;
  const monthlyCF=effectiveRent-totalExpenses;
  const annualCF=monthlyCF*12;
  const grossYield=(annualRent/price)*100;
  const netAnnualRent=(effectiveRent-rates-insurance-maint-mgmtFee)*12;
  const netYield=(netAnnualRent/price)*100;
  const cocReturn=deposit>0?(annualCF/deposit)*100:0;
  const breakeven=annualCF>0?(deposit/annualCF):Infinity;

  const fmt=v=>v>=0?`R${Math.abs(v).toLocaleString('en-ZA',{maximumFractionDigits:0})}`:`-R${Math.abs(v).toLocaleString('en-ZA',{maximumFractionDigits:0})}`;
  const pct=v=>v.toFixed(2)+'%';

  const set=(id,text)=>{const el=document.getElementById(id); if(el) el.textContent=text;};
  set('roi_gross_yield',pct(grossYield));
  set('roi_net_yield',pct(netYield));

  const cfEl=document.getElementById('roi_cashflow');
  if(cfEl){
    cfEl.textContent=fmt(monthlyCF)+'/mo';
    cfEl.style.color=monthlyCF>=0?'var(--gold)':'var(--rust)';
  }
  const acfEl=document.getElementById('roi_annual_cf');
  if(acfEl){
    acfEl.textContent=fmt(annualCF)+'/yr';
    acfEl.style.color=annualCF>=0?'var(--gold)':'var(--rust)';
  }
  const cocEl=document.getElementById('roi_coc');
  if(cocEl){
    cocEl.textContent=pct(cocReturn);
    cocEl.style.color=cocReturn>=0?'var(--gold)':'var(--rust)';
  }
  set('roi_breakeven',isFinite(breakeven)?breakeven.toFixed(1)+' yrs':'Never');

  // Sync ROI -> bond calculator inputs when available.
  const bp=document.getElementById('bond_price');
  if(bp && document.activeElement!==bp) bp.value=price||0;
  const br=document.getElementById('bond_rates');
  if(br && document.activeElement!==br) br.value=rates||0;
  calcBondRepayment?.();
  const cpiYearSel=document.getElementById('cpi_year');
  if(cpiYearSel && !cpiYearSel.options.length){
    const pendingTenantId=Number(localStorage.getItem('nestiq-cpi-tenant')||0)||null;
    initCpiRentCalculator?.(pendingTenantId);
    if(pendingTenantId) localStorage.removeItem('nestiq-cpi-tenant');
  }else{
    calcCpiRentIncrease?.();
  }
}

let bondAmortChartInstance=null;
const cpiData = {
  2026: 4.5,
  2025: 4.2,
  2024: 5.1,
  2023: 5.9,
  2022: 6.9,
  2021: 4.5,
  2020: 3.3
};

function rands(v){
  return `R${Number(v||0).toLocaleString('en-ZA',{maximumFractionDigits:0})}`;
}

function transferDutySA(purchasePrice){
  const p=Number(purchasePrice||0);
  if(p<=1100000) return 0;
  if(p<=1512500) return (p-1100000)*0.03;
  if(p<=2117500) return 12375 + (p-1512500)*0.06;
  if(p<=2722500) return 49250 + (p-2117500)*0.08;
  if(p<=12100000) return 97750 + (p-2722500)*0.11;
  return 1128600 + (p-12100000)*0.13;
}

function bondDebtHealth(ratio){
  if(ratio<30) return {label:'Healthy',color:'var(--sage)'};
  if(ratio<=40) return {label:'Manageable',color:'var(--gold)'};
  return {label:'High Risk',color:'var(--rust)'};
}

function calcBondRepayment(){
  const g=id=>parseFloat(document.getElementById(id)?.value)||0;
  const set=(id,text)=>{const el=document.getElementById(id); if(el) el.textContent=text;};
  const show=(id,on)=>{const el=document.getElementById(id); if(el) el.style.display=on?'block':'none';};

  const purchasePrice=g('bond_price');
  const depositPct=Math.max(0,Math.min(40,g('bond_deposit_pct')));
  const interestRate=Math.max(0,g('bond_rate'));
  const years=Math.max(5,Math.min(30,Math.round(g('bond_term_years')||20)));
  const includeFee=document.getElementById('bond_include_fee')?.checked!==false;
  const monthlyLevy=Math.max(0,g('bond_levy'));
  const monthlyRates=Math.max(0,g('bond_rates'));

  set('bond_deposit_val',`${depositPct}%`);
  set('bond_term_val',String(years));

  const depositAmount=purchasePrice*(depositPct/100);
  set('bond_deposit_amt',rands(depositAmount));

  const initiationFee=includeFee?6037:0;
  const loanAmount=(purchasePrice-depositAmount)+initiationFee;
  const n=years*12;
  const r=interestRate/12/100;
  const monthlyPayment=(r===0||n===0) ? (loanAmount/(n||1)) : (loanAmount*((r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1)));
  const totalInterest=(monthlyPayment*n)-loanAmount;
  const totalCost=purchasePrice+totalInterest+initiationFee+(monthlyLevy*n);

  const transferDuty=transferDutySA(purchasePrice);
  const conveyancing=purchasePrice*0.0085;
  const deedsOffice=1800;
  const transferTotal=transferDuty+conveyancing+deedsOffice;

  const totalMonthlyCost=monthlyPayment+monthlyLevy+monthlyRates;
  const rentalIncome=Math.max(0,(parseFloat(document.getElementById('roi_rent')?.value)||0));
  const debtToIncome=rentalIncome>0 ? (monthlyPayment/rentalIncome)*100 : 0;
  const coverage=monthlyPayment>0 ? (rentalIncome/monthlyPayment)*100 : 0;
  const diff=rentalIncome-totalMonthlyCost;

  set('bond_monthly_pay',rands(monthlyPayment));
  set('bond_term_summary',`Loan Term: ${years} years (${n} months)`);
  set('bond_loan_amt',`Total Loan Amount: ${rands(loanAmount)}`);
  set('bond_interest_total',`Total Interest Paid: ${rands(totalInterest)}`);
  set('bond_total_cost',`Total Cost of Property: ${rands(totalCost)}`);

  set('bond_transfer_duty',`Transfer Duty: ${rands(transferDuty)}`);
  set('bond_conveyancing',`Conveyancing Fees: ${rands(conveyancing)}`);
  set('bond_deeds',`Deeds Office: ${rands(deedsOffice)}`);
  set('bond_transfer_total',`Total Transfer Costs: ${rands(transferTotal)}`);

  set('bond_monthly_breakdown',`Monthly Bond: ${rands(monthlyPayment)}`);
  set('bond_monthly_levy',`Monthly Levy: ${rands(monthlyLevy)}`);
  set('bond_monthly_rates',`Monthly Rates: ${rands(monthlyRates)}`);
  set('bond_monthly_total',`Total Monthly Cost: ${rands(totalMonthlyCost)}`);

  const debtEl=document.getElementById('bond_debt_ratio_line');
  if(debtEl) debtEl.textContent=`Debt to Income: ${debtToIncome.toFixed(1)}%`;
  const health=bondDebtHealth(debtToIncome);
  const healthEl=document.getElementById('bond_debt_health_line');
  if(healthEl){
    healthEl.textContent=health.label;
    healthEl.style.color=health.color;
    healthEl.style.fontWeight='700';
  }

  const incomeEl=document.getElementById('bond_income_line');
  const coverageEl=document.getElementById('bond_coverage_line');
  const cashflowEl=document.getElementById('bond_cashflow_line');
  if(rentalIncome>0){
    show('bond_income_line',true); show('bond_coverage_line',true); show('bond_cashflow_line',true);
    if(incomeEl) incomeEl.textContent=`Monthly Rental Income: ${rands(rentalIncome)}`;
    if(coverageEl){
      const state=coverage>=100?'Cash Flow Positive':'Cash Flow Negative';
      coverageEl.textContent=`Bond Coverage: ${coverage.toFixed(1)}% — ${state}`;
      coverageEl.style.color=coverage>=100?'var(--sage)':'var(--rust)';
    }
    if(cashflowEl){
      const prefix=diff>=0?'Surplus':'Shortfall';
      cashflowEl.textContent=`${prefix}: ${rands(Math.abs(diff))}/month`;
      cashflowEl.style.color=diff>=0?'var(--sage)':'var(--rust)';
    }
  }else{
    show('bond_income_line',false); show('bond_coverage_line',false); show('bond_cashflow_line',false);
  }

  const amort=buildAmortizationByYear(loanAmount,r,n,years,monthlyPayment);
  renderBondAmortization(amort);
}

function buildAmortizationByYear(loanAmount, monthlyRate, months, years, monthlyPayment){
  let balance=loanAmount;
  const rows=[];
  for(let y=1;y<=years;y++){
    let yearInterest=0;
    let yearPrincipal=0;
    const opening=balance;
    for(let m=1;m<=12;m++){
      const absoluteMonth=((y-1)*12)+m;
      if(absoluteMonth>months) break;
      const interest=balance*monthlyRate;
      const principal=Math.min(balance, monthlyPayment-interest);
      balance=Math.max(0,balance-principal);
      yearInterest+=interest;
      yearPrincipal+=principal;
    }
    rows.push({year:y,opening,interest:yearInterest,principal:yearPrincipal,closing:balance});
  }
  return rows;
}

function renderBondAmortization(rows){
  const body=document.getElementById('bond_amort_tbody');
  if(body){
    body.innerHTML=rows.map(r=>`<tr><td>${r.year}</td><td>${rands(r.opening)}</td><td>${rands(r.interest)}</td><td>${rands(r.principal)}</td><td>${rands(r.closing)}</td></tr>`).join('');
  }
  const cvs=document.getElementById('bondAmortChart');
  if(!cvs || typeof Chart==='undefined') return;
  if(bondAmortChartInstance) bondAmortChartInstance.destroy();
  bondAmortChartInstance=new Chart(cvs,{
    type:'bar',
    data:{
      labels:rows.map(r=>`Y${r.year}`),
      datasets:[
        {label:'Interest',data:rows.map(r=>Math.round(r.interest)),backgroundColor:'#c9a84c',stack:'bond'},
        {label:'Principal',data:rows.map(r=>Math.round(r.principal)),backgroundColor:'#5a7a60',stack:'bond'}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{position:'top'}},
      scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}
    }
  });
}

function toggleBondAmortization(){
  const wrap=document.getElementById('bondAmortWrap');
  if(!wrap) return;
  const showNow=wrap.style.display==='none';
  wrap.style.display=showNow?'block':'none';
  if(showNow) setTimeout(()=>bondAmortChartInstance?.resize(),50);
}

function setBondPrimeRate(rate){
  const el=document.getElementById('bond_rate');
  if(el) el.value=rate;
  calcBondRepayment();
}

function useBondInROI(){
  const mortgage=document.getElementById('roi_mortgage');
  const paymentText=document.getElementById('bond_monthly_pay')?.textContent||'';
  const payment=Number(String(paymentText).replace(/[^\d.-]/g,''))||0;
  if(mortgage){
    mortgage.value=Math.round(payment);
    calcROI();
    nestiqShowNotif?.('Bond payment copied to ROI mortgage field','success');
  }
}

function cpiFmt(v){
  return `R${Number(v||0).toLocaleString('en-ZA',{maximumFractionDigits:0})}`;
}

function nextRenewalDateForTenant(t){
  const leaseEnd=String(t?.leaseEnd||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(leaseEnd)) return leaseEnd;
  const d=new Date();
  d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,10);
}

function selectedCpiType(){
  return document.querySelector('input[name="cpi_type"]:checked')?.value || 'cpi';
}

function initCpiRentCalculator(prefillTenantId){
  const tenantSelect=document.getElementById('cpi_tenant_id');
  const yearSelect=document.getElementById('cpi_year');
  if(!tenantSelect || !yearSelect) return;

  tenantSelect.innerHTML=`<option value="">-- No tenant selected --</option>${
    tenantsData.map(t=>`<option value="${t.id}">${t.name} — ${t.property}</option>`).join('')
  }`;
  const years=Object.keys(cpiData).map(Number).sort((a,b)=>b-a);
  yearSelect.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  yearSelect.value=String(years[0]);

  if(prefillTenantId){
    tenantSelect.value=String(prefillTenantId);
    onCpiTenantChange();
  }else{
    const eff=document.getElementById('cpi_effective_date');
    if(eff && !eff.value){
      const d=new Date();
      d.setMonth(d.getMonth()+1);
      eff.value=d.toISOString().slice(0,10);
    }
    calcCpiRentIncrease();
  }
}

function onCpiTenantChange(){
  const tenantId=Number(document.getElementById('cpi_tenant_id')?.value||0);
  const t=tenantsData.find(x=>x.id===tenantId);
  const rentEl=document.getElementById('cpi_current_rent');
  const dateEl=document.getElementById('cpi_effective_date');
  const hint=document.getElementById('cpi_renewal_hint');
  const btn=document.getElementById('cpi_apply_btn');
  if(t){
    if(rentEl) rentEl.value=Number(t.rent||0);
    if(dateEl) dateEl.value=nextRenewalDateForTenant(t);
    if(hint) hint.textContent=`Lease renewal date: ${nextRenewalDateForTenant(t)}`;
    if(btn) btn.style.display='inline-flex';
  }else{
    if(hint) hint.textContent='';
    if(btn) btn.style.display='none';
  }
  calcCpiRentIncrease();
}

function calcCpiRentIncrease(){
  const g=id=>parseFloat(document.getElementById(id)?.value)||0;
  const set=(id,text)=>{const el=document.getElementById(id); if(el) el.textContent=text;};
  const show=(id,on)=>{const el=document.getElementById(id); if(el) el.style.display=on?'block':'none';};

  const currentRent=Math.max(0,g('cpi_current_rent'));
  const cpiYear=Number(document.getElementById('cpi_year')?.value||Object.keys(cpiData)[0]);
  const cpiRate=Number(cpiData[cpiYear]||0);
  const t=selectedCpiType();
  const plus=Math.max(0,g('cpi_plus_pct'));
  const fixedPct=Math.max(0,g('cpi_fixed_pct'));
  const fixedAmt=Math.max(0,g('cpi_fixed_amt'));
  const effectiveDate=document.getElementById('cpi_effective_date')?.value||new Date().toISOString().slice(0,10);

  show('cpi_plus_wrap', t==='cpi_plus');
  show('cpi_year_wrap', t==='cpi' || t==='cpi_plus');
  show('cpi_fixed_pct_wrap', t==='fixed_pct');
  show('cpi_fixed_amt_wrap', t==='fixed_amt');
  set('cpi_year_rate', `CPI ${cpiYear}: ${cpiRate.toFixed(1)}%`);

  let incPct=0;
  let typeLabel='CPI linked increase';
  if(t==='cpi'){ incPct=cpiRate; typeLabel='CPI-linked'; }
  if(t==='cpi_plus'){ incPct=cpiRate+plus; typeLabel=`CPI + ${plus}%`; }
  if(t==='fixed_pct'){ incPct=fixedPct; typeLabel='Fixed percentage'; }
  if(t==='fixed_amt'){ incPct=currentRent>0?(fixedAmt/currentRent)*100:0; typeLabel='Fixed amount'; }

  const incAmount=Math.round(t==='fixed_amt' ? fixedAmt : currentRent*(incPct/100));
  const newRent=Math.round(currentRent + incAmount);
  const newAnnual=newRent*12;
  set('cpi_inc_pct', `${incPct.toFixed(2)}%`);
  set('cpi_inc_amt', `Increase Amount: ${cpiFmt(incAmount)}/month`);
  set('cpi_new_rent', `New Monthly Rent: ${cpiFmt(newRent)}/month`);
  set('cpi_new_annual', `New Annual Rent: ${cpiFmt(newAnnual)}/year`);
  set('cpi_effective_from', `Effective From: ${effectiveDate}`);

  window.__lastCpiCalc={
    currentRent,newRent,incAmount,incPct,effectiveDate,type:typeLabel,cpiYear,cpiRate
  };
}

function applyCpiIncreaseToTenant(){
  const tenantId=Number(document.getElementById('cpi_tenant_id')?.value||0);
  const tenant=tenantsData.find(t=>t.id===tenantId);
  if(!tenant){ nestiqShowNotif('Select a tenant first','warning'); return; }
  if(!window.__lastCpiCalc){ calcCpiRentIncrease(); }
  const c=window.__lastCpiCalc||{};
  const oldRent=Math.round(Number(tenant.rent||0));
  tenant.rent=Math.round(Number(c.newRent||oldRent));

  rentIncreases.unshift({
    id:Date.now(),
    tenantId:tenant.id,
    tenantName:tenant.name,
    propertyId:tenant.propertyId||null,
    oldRent,
    newRent:tenant.rent,
    increasePercent:Number(c.incPct||0),
    increaseAmount:Number(c.incAmount||0),
    effectiveDate:c.effectiveDate||new Date().toISOString().slice(0,10),
    type:c.type||'CPI-linked',
    appliedDate:new Date().toISOString()
  });
  rentIncreases=rentIncreases.slice(0,200);
  saveData();
  renderTenants?.();
  nestiqShowNotif(`Rent updated for ${tenant.name}`,'success');
  addBellNotif?.('📈',`Rent increased: ${tenant.name} (${cpiFmt(oldRent)} -> ${cpiFmt(tenant.rent)})`);
  if(document.getElementById('modalOverlay')?.classList.contains('open')) viewTenant?.(tenant.id);

  const send=confirm('Send rent increase notice via WhatsApp?');
  if(send){
    const basis=(selectedCpiType()==='cpi' || selectedCpiType()==='cpi_plus') ? 'CPI' : 'agreed terms';
    const msg=`Dear ${tenant.name}, please be advised that your monthly rental for ${tenant.property} - ${tenant.unit} will increase from ${cpiFmt(oldRent)} to ${cpiFmt(tenant.rent)} with effect from ${c.effectiveDate}. This represents a ${Number(c.incPct||0).toFixed(2)}% increase in line with ${basis}. Please do not hesitate to contact us should you have any queries. — NestIQ Pro`;
    openWhatsApp?.(tenant.phone, msg, {tenantId:tenant.id,tenantName:tenant.name,type:'rentIncrease'});
  }
}

function openCpiForTenant(tenantId){
  localStorage.setItem('nestiq-cpi-tenant', String(tenantId));
  showPage?.('roi');
}

async function runCpiAiSuggestRent(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="runCpiAiSuggestRent"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Suggesting...');
  const out=document.getElementById('cpiAiResult');
  if(out) out.innerHTML=aiLoadingHtml();
  try{
    const tenantId=Number(document.getElementById('cpi_tenant_id')?.value||0);
    const tenant=tenantsData.find(t=>t.id===tenantId);
    const prop=propertiesData.find(p=>p.id===tenant?.propertyId)||propertiesData.find(p=>p.name===tenant?.property)||{};
    const city=(String(prop.addr||'').split(',').pop()||'').trim()||'South Africa';
    const parsed=await suggestRentPriceAI({
      bedrooms:Number(prop.bedrooms||1),
      type:prop.type||'apartment',
      address:prop.addr||tenant?.property||'Address not provided',
      city,
      amenities:((tenant?.amenities||[]).join(', ')||'standard')
    });
    if(!out) return;
    renderRentSuggestionCard('cpiAiResult', parsed, (val)=>{
      const el=document.getElementById('cpi_current_rent');
      if(el) el.value=Math.round(Number(val||0));
      calcCpiRentIncrease();
      nestiqShowNotif('AI rent applied to CPI calculator','success');
    });
  }finally{
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

async function askAiRentIncreaseAdvisor(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const out=document.getElementById('cpiAiResult');
  if(out) out.innerHTML=aiLoadingHtml();
  const tenantId=Number(document.getElementById('cpi_tenant_id')?.value||0);
  const tenant=tenantsData.find(t=>t.id===tenantId);
  const parsed=await adviseRentIncreaseAI({
    currentRent:Number(document.getElementById('cpi_current_rent')?.value||0),
    tenantName:tenant?.name||'Tenant',
    leaseStart:tenant?.leaseStart||'Unknown',
    paymentHistory:tenant?`${(tenant.payments||[]).length} payments recorded`:'Unknown',
    cpi:Number(document.getElementById('cpi_year')?.value?cpiData[document.getElementById('cpi_year').value]:0),
    propertyType:tenant?.property||'Property',
    city:(tenant?.property||'South Africa')
  });
  if(!out) return;
  if(!parsed?.ok){ out.innerHTML=aiRawFallbackCard(parsed?.raw||'No AI response'); return; }
  const d=parsed.data||{};
  out.innerHTML=`
    <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--paper)">
      <div style="font-size:.82rem"><strong>Recommended Increase:</strong> ${Number(d.recommendedIncrease||0).toFixed(2)}%</div>
      <div style="font-size:.82rem;margin-top:4px"><strong>New Rent:</strong> R${Number(d.recommendedNewRent||0).toLocaleString('en-ZA')}</div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge badge-amber">${d.marketPosition||'At market'}</span>
        <span class="badge ${d.tenantRetentionRisk==='Low'?'badge-green':d.tenantRetentionRisk==='High'?'badge-red':'badge-amber'}">Retention Risk: ${d.tenantRetentionRisk||'Medium'}</span>
      </div>
      <div style="font-size:.82rem;color:var(--muted);margin-top:8px">${d.reasoning||''}</div>
      <div style="font-size:.82rem;margin-top:6px"><strong>Negotiation Tip:</strong> ${d.negotiationTip||''}</div>
      <div style="margin-top:8px"><button class="btn-primary btn-sm" onclick="applyAiRentIncreaseRecommendation(${Number(d.recommendedIncrease||0)})">Apply AI Recommendation</button></div>
      ${aiAttribution()}
    </div>
  `;
}

function applyAiRentIncreaseRecommendation(pct){
  const fixedPct=document.getElementById('cpi_fixed_pct');
  const radio=document.querySelector('input[name="cpi_type"][value="fixed_pct"]');
  if(radio) radio.checked=true;
  if(fixedPct) fixedPct.value=Number(pct||0).toFixed(2);
  calcCpiRentIncrease();
}

window.calcBondRepayment=calcBondRepayment;
window.toggleBondAmortization=toggleBondAmortization;
window.setBondPrimeRate=setBondPrimeRate;
window.useBondInROI=useBondInROI;
window.calcCpiRentIncrease=calcCpiRentIncrease;
window.applyCpiIncreaseToTenant=applyCpiIncreaseToTenant;
window.onCpiTenantChange=onCpiTenantChange;
window.openCpiForTenant=openCpiForTenant;
window.initCpiRentCalculator=initCpiRentCalculator;
window.askAiRentIncreaseAdvisor=askAiRentIncreaseAdvisor;
window.applyAiRentIncreaseRecommendation=applyAiRentIncreaseRecommendation;
window.runCpiAiSuggestRent=runCpiAiSuggestRent;
