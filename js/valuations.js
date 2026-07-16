/* ═══════════════════════════════
   PROPERTY VALUATION & PORTFOLIO NET WORTH
   Loaded before data.js — nestiqNormalizePropertyValuation used in normalizeDataModel.
═══════════════════════════════ */

const NESTIQ_VAL_SOURCES = new Set(['manual', 'estimate', 'formal-valuation', 'sale-price']);

function nestiqValEsc(s){
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function nestiqNormalizeValuationRow(v, idx){
  const o = v && typeof v === 'object' ? v : {};
  const src = String(o.source || 'manual').trim();
  return {
    id: Number(o.id) || idx + 1,
    date: String(o.date || '').slice(0, 10),
    value: Math.max(0, Number(o.value) || 0),
    source: NESTIQ_VAL_SOURCES.has(src) ? src : 'manual',
    valuedBy: String(o.valuedBy || ''),
    notes: String(o.notes || ''),
    createdAt: String(o.createdAt || new Date().toISOString().slice(0, 10))
  };
}

function nestiqNormalizeImprovementRow(im, idx){
  const o = im && typeof im === 'object' ? im : {};
  return {
    id: Number(o.id) || idx + 1,
    description: String(o.description || ''),
    cost: Math.max(0, Number(o.cost) || 0),
    date: String(o.date || '').slice(0, 10),
    addedToValue: o.addedToValue === true
  };
}

function nestiqNormalizePropertyValuation(p){
  if (!p || typeof p !== 'object') return p;
  const rawVals = Array.isArray(p.valuations) ? p.valuations : [];
  let valuations = rawVals.map(nestiqNormalizeValuationRow).filter(v => v.date && v.value > 0);
  valuations.sort((a, b) => a.date.localeCompare(b.date));
  const seenV = new Set();
  let autoV = valuations.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0) + 1;
  valuations = valuations.map(v => {
    let id = Number(v.id) || autoV++;
    while (seenV.has(id)) id = autoV++;
    seenV.add(id);
    return { ...v, id };
  });

  const pp = p.purchasePrice;
  const purchasePrice = pp === null || pp === undefined || String(pp).trim() === '' ? null : (Number.isFinite(Number(pp)) ? Number(pp) : null);

  const rawImp = Array.isArray(p.improvements) ? p.improvements : [];
  let improvements = rawImp.map(nestiqNormalizeImprovementRow);
  const seenI = new Set();
  let autoI = improvements.reduce((m, im) => Math.max(m, Number(im.id) || 0), 0) + 1;
  improvements = improvements.map(im => {
    let id = Number(im.id) || autoI++;
    while (seenI.has(id)) id = autoI++;
    seenI.add(id);
    return { ...im, id };
  });

  return {
    ...p,
    valuations,
    purchasePrice,
    purchaseDate: String(p.purchaseDate || '').slice(0, 10),
    bondOriginalAmount: Math.max(0, Number(p.bondOriginalAmount) || 0),
    bondOutstanding: Math.max(0, Number(p.bondOutstanding) || 0),
    bondMonthlyPayment: Math.max(0, Number(p.bondMonthlyPayment) || 0),
    bondInterestRate: Math.max(0, Number(p.bondInterestRate) || 0),
    bondStartDate: String(p.bondStartDate || '').slice(0, 10),
    bondTermYears: Math.max(0, Number(p.bondTermYears) || 0),
    transferCosts: Math.max(0, Number(p.transferCosts) || 0),
    improvements
  };
}

function nestiqValuationSourceLabel(src){
  const m = {
    manual: 'Manual estimate',
    estimate: 'Comparable / online estimate',
    'formal-valuation': 'Formal valuation',
    'sale-price': 'Sale price'
  };
  return m[src] || src;
}

function nestiqLatestValuation(p){
  const v = (p.valuations || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  return v || null;
}

function nestiqPropertyCurrentValue(p){
  const lv = nestiqLatestValuation(p);
  return lv ? lv.value : null;
}

function nestiqFormatMoney(n){
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `R${Number(n).toLocaleString('en-ZA')}`;
}

function nestiqPropertyTotalInvested(p){
  const purchase = p.purchasePrice != null && Number.isFinite(p.purchasePrice) ? p.purchasePrice : 0;
  const transfer = Number(p.transferCosts) || 0;
  const imp = (p.improvements || []).reduce((s, x) => s + (Number(x.cost) || 0), 0);
  return purchase + transfer + imp;
}

function nestiqPropertyCityHint(addr){
  const a = String(addr || '');
  const parts = a.split(',').map(x => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function nestiqAnnualExpensesForPropertyName(propName, year){
  const y = year != null ? year : new Date().getFullYear();
  return (expenses || [])
    .filter(e => e && !e.isIncome && String(e.prop || '') === String(propName || '') && String(e.date || '').startsWith(String(y)))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function nestiqPortfolioLatestValueSum(){
  return (propertiesData || []).reduce((s, p) => s + (nestiqPropertyCurrentValue(p) || 0), 0);
}

function nestiqPortfolioDebtSum(){
  return (propertiesData || []).reduce((s, p) => s + (Number(p.bondOutstanding) || 0), 0);
}

function nestiqPortfolioMonthlyRentSum(){
  return (propertiesData || []).reduce((s, p) => s + (Number(p.rent) || 0), 0);
}

function nestiqPortfolioTotalInvested(){
  return (propertiesData || []).reduce((s, p) => s + nestiqPropertyTotalInvested(p), 0);
}

function nestiqYearsSincePurchase(p){
  if (!p.purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.purchaseDate)) return null;
  const a = new Date(p.purchaseDate + 'T12:00:00');
  const b = new Date();
  if (String(a) === 'Invalid Date') return null;
  return Math.max(0.25, (b - a) / (365.25 * 86400000));
}

function nestiqCapitalGrowthAmount(p){
  const v = nestiqPropertyCurrentValue(p);
  if (v == null) return null;
  const inv = nestiqPropertyTotalInvested(p);
  if (p.purchasePrice == null || !Number.isFinite(p.purchasePrice)) return null;
  return v - inv;
}

function nestiqCapitalGrowthPct(p){
  const g = nestiqCapitalGrowthAmount(p);
  if (g == null) return null;
  const inv = nestiqPropertyTotalInvested(p);
  if (inv <= 0) return null;
  return (g / inv) * 100;
}

function nestiqAnnualizedGrowthPct(p){
  const pct = nestiqCapitalGrowthPct(p);
  const yrs = nestiqYearsSincePurchase(p);
  if (pct == null || yrs == null || yrs <= 0) return null;
  return ((1 + pct / 100) ** (1 / yrs) - 1) * 100;
}

function nestiqPortfolioCapitalGrowth(){
  const props = (propertiesData || []).filter(p => p.purchasePrice != null && nestiqPropertyCurrentValue(p) != null);
  let totalG = 0;
  props.forEach(p => {
    const g = nestiqCapitalGrowthAmount(p);
    if (g != null) totalG += g;
  });
  return totalG;
}

function nestiqPortfolioAvgAnnualReturn(){
  const invested = nestiqPortfolioTotalInvested();
  const value = nestiqPortfolioLatestValueSum();
  if (invested <= 0 || value <= 0) return null;
  let minYear = null;
  (propertiesData || []).forEach(p => {
    if (p.purchaseDate && /^\d{4}/.test(p.purchaseDate)){
      const y = parseInt(p.purchaseDate.slice(0, 4), 10);
      if (minYear == null || y < minYear) minYear = y;
    }
  });
  if (minYear == null) return null;
  const yrs = Math.max(1, new Date().getFullYear() - minYear + 1);
  return ((value / invested) ** (1 / yrs) - 1) * 100;
}

function nestiqLtvClass(ltv){
  if (ltv == null || !Number.isFinite(ltv)) return 'var(--muted)';
  if (ltv < 70) return 'var(--sage)';
  if (ltv <= 80) return 'var(--gold)';
  return 'var(--rust)';
}

function nestiqAmortizationSummary(p){
  const balance = Number(p.bondOutstanding) || 0;
  const pay = Number(p.bondMonthlyPayment) || 0;
  const rate = Number(p.bondInterestRate) || 0;
  const r = rate / 100 / 12;
  if (balance <= 0 || pay <= 0) return null;
  let bal = balance;
  let payments = 0;
  let interestRem = 0;
  const maxIter = 600;
  while (bal > 0.02 && payments < maxIter){
    const intPort = bal * r;
    const prin = pay - intPort;
    if (prin <= 0){
      return { error: 'Payment too low to cover interest', remainingPayments: null, interestRemaining: null, bondFreeDate: null };
    }
    interestRem += intPort;
    bal -= prin;
    payments++;
  }
  const free = new Date();
  free.setMonth(free.getMonth() + payments);
  return { remainingPayments: payments, interestRemaining: interestRem, bondFreeDate: free.toISOString().slice(0, 10) };
}

function nestiqBondFreeYearsMonths(p){
  const sum = nestiqAmortizationSummary(p);
  if (!sum || !sum.remainingPayments) return null;
  const m = sum.remainingPayments;
  return { years: Math.floor(m / 12), months: m % 12 };
}

function nestiqCountPortfolioValuations(){
  return (propertiesData || []).reduce((s, p) => s + (p.valuations || []).length, 0);
}

function nestiqPortfolioTimeSeries(){
  const props = propertiesData || [];
  const monthSet = new Set();
  props.forEach(p => {
    (p.valuations || []).forEach(v => {
      if (v.date) monthSet.add(v.date.slice(0, 7));
    });
    if (p.purchaseDate) monthSet.add(p.purchaseDate.slice(0, 7));
  });
  const months = [...monthSet].sort();
  if (months.length < 2) return null;
  const debt = nestiqPortfolioDebtSum();
  const labels = [];
  const values = [];
  const debts = [];
  const equities = [];
  months.forEach(ym => {
    const endD = `${ym}-28`;
    let total = 0;
    props.forEach(p => {
      const vs = (p.valuations || []).filter(v => v.date <= endD).sort((a, b) => b.date.localeCompare(a.date));
      if (vs[0]) total += vs[0].value;
    });
    labels.push(ym);
    values.push(total);
    debts.push(debt);
    equities.push(Math.max(0, total - debt));
  });
  return { labels, values, debts, equities };
}

let __nestiqPortfolioGrowthChart = null;
let __nestiqValHistoryChart = null;

function nestiqDestroyChart(ref){
  try{
    ref?.destroy?.();
  }catch(_e){}
}

function nestiqRenderPortfolioGrowthChart(){
  const canvas = document.getElementById('nestiqPortfolioGrowthChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const series = nestiqPortfolioTimeSeries();
  nestiqDestroyChart(__nestiqPortfolioGrowthChart);
  __nestiqPortfolioGrowthChart = null;
  if (!series || nestiqCountPortfolioValuations() < 2){
    const wrap = document.getElementById('nestiqPortfolioGrowthWrap');
    if (wrap) wrap.style.display = 'none';
    return;
  }
  const wrap = document.getElementById('nestiqPortfolioGrowthWrap');
  if (wrap) wrap.style.display = 'block';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = dark ? 'rgba(240,236,228,0.55)' : 'rgba(14,17,23,0.45)';
  const gridColor = dark ? 'rgba(240,236,228,0.06)' : 'rgba(14,17,23,0.06)';
  __nestiqPortfolioGrowthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        { label: 'Portfolio value', data: series.values, borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,0.12)', fill: false, tension: 0.25, pointRadius: 3 },
        { label: 'Total debt', data: series.debts, borderColor: '#c46a3a', borderDash: [4, 4], fill: false, tension: 0, pointRadius: 2 },
        { label: 'Equity', data: series.equities, borderColor: '#5a7a60', backgroundColor: 'rgba(90,122,96,0.1)', fill: true, tension: 0.25, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { family: 'DM Sans', size: 11 } } },
        tooltip: {
          callbacks: {
            label(ctx){
              return `${ctx.dataset.label}: R${Number(ctx.raw || 0).toLocaleString('en-ZA')}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45 } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback(v){
              return 'R' + Number(v).toLocaleString('en-ZA');
            }
          }
        }
      }
    }
  });
}

function nestiqRenderValuationPage(){
  normalizeDataModel?.();
  const totalVal = nestiqPortfolioLatestValueSum();
  const totalDebt = nestiqPortfolioDebtSum();
  const equity = Math.max(0, totalVal - totalDebt);
  const invested = nestiqPortfolioTotalInvested();
  const hasValuation = (propertiesData || []).some(p => nestiqPropertyCurrentValue(p) != null);
  const capGrow = hasValuation && totalVal > 0 ? totalVal - invested : null;
  const capPct = capGrow != null && invested > 0 ? (capGrow / invested) * 100 : null;
  const monthlyRent = nestiqPortfolioMonthlyRentSum();
  const avgYield = totalVal > 0 ? ((monthlyRent * 12) / totalVal) * 100 : null;

  const portAnn = nestiqPortfolioAvgAnnualReturn();

  const hero = document.getElementById('nestiqValHero');
  if (hero){
    hero.innerHTML = `
      <div class="settings-card" style="margin:0;padding:20px;border-left:4px solid var(--gold)">
        <div style="font-size:0.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Total portfolio value</div>
        <div style="font-family:'Playfair Display',serif;font-size:2.4rem;font-weight:700;color:var(--gold)">${nestiqFormatMoney(totalVal)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:16px;font-size:0.88rem">
          <div><span style="color:var(--muted)">Total debt</span><br><strong>${nestiqFormatMoney(totalDebt)}</strong></div>
          <div><span style="color:var(--muted)">Total equity</span><br><strong style="color:var(--sage)">${nestiqFormatMoney(equity)}</strong></div>
          <div><span style="color:var(--muted)">Net worth (equity)</span><br><strong>${nestiqFormatMoney(equity)}</strong></div>
        </div>
      </div>`;
  }

  const stats = document.getElementById('nestiqValStats');
  if (stats){
    stats.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0">
        <div class="settings-card" style="margin:0"><div style="font-size:0.72rem;color:var(--muted)">Total invested</div><div style="font-weight:700">${nestiqFormatMoney(invested)}</div></div>
        <div class="settings-card" style="margin:0"><div style="font-size:0.72rem;color:var(--muted)">Capital growth</div><div style="font-weight:700">${capGrow != null ? `${nestiqFormatMoney(capGrow)} (${capPct != null ? capPct.toFixed(1) + '%' : '—'})` : '—'}</div></div>
        <div class="settings-card" style="margin:0"><div style="font-size:0.72rem;color:var(--muted)">Annualised growth (portfolio, illustrative)</div><div style="font-weight:700">${portAnn != null ? portAnn.toFixed(1) + '%' : '—'}</div></div>
        <div class="settings-card" style="margin:0"><div style="font-size:0.72rem;color:var(--muted)">Average yield (gross)</div><div style="font-weight:700">${avgYield != null ? avgYield.toFixed(2) + '%' : '—'}</div></div>
      </div>`;
  }

  const disc = document.getElementById('nestiqValDisclaimer');
  if (disc){
    disc.innerHTML = `<div class="settings-card" style="margin:0;background:rgba(201,168,76,0.08);border:1px solid var(--border)"><strong>Disclaimer:</strong> All values are <strong>estimates only</strong> and are not guarantees. Calculations are <strong>illustrative</strong>. Formal valuations are required for lending or legal purposes.</div>`;
  }

  const mc = document.getElementById('nestiqValMarketContext');
  if (mc){
    const ctx = landlordSettings?.marketContext || {};
    const city = String(ctx.city || '').trim();
    const mg = ctx.growthPercent != null ? Number(ctx.growthPercent) : NaN;
    const propsWithPurchase = (propertiesData || []).filter(pr => pr.purchasePrice != null && nestiqAnnualizedGrowthPct(pr) != null);
    const portAvg = propsWithPurchase.length
      ? propsWithPurchase.reduce((s, pr) => s + (nestiqAnnualizedGrowthPct(pr) || 0), 0) / propsWithPurchase.length
      : null;
    let line = '';
    if (city && Number.isFinite(mg) && portAvg != null){
      const cmp = portAvg >= mg ? 'above' : 'below';
      line = `<p style="margin:8px 0 0;font-size:0.88rem">Your portfolio (annualised, where purchase price set): <strong>${portAvg.toFixed(1)}%</strong> per year. Market average (${nestiqValEsc(city)}): <strong>${mg}%</strong> per year <span style="color:var(--muted)">(${nestiqValEsc(ctx.source || 'source not set')})</span>. You are <strong>${cmp}</strong> the market average.</p>`;
    } else {
      line = `<p style="margin:8px 0 0;font-size:0.84rem;color:var(--muted)">Set your city and market growth in <strong>Settings → Market context</strong> to compare.</p>`;
    }
    mc.innerHTML = `
      <div class="settings-card" style="margin:0">
        <h3 class="settings-card-title">Market context</h3>
        <p style="font-size:0.82rem;color:var(--muted)">Reference data you maintain manually (not live market data).</p>
        ${line}
        <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="nestiqValuationAiMarket()">Get AI market analysis</button>
        <div id="nestiqValAiOut" style="margin-top:10px;font-size:0.84rem;color:var(--muted)"></div>
      </div>`;
  }

  const cards = document.getElementById('nestiqValPropertyCards');
  if (cards){
    cards.innerHTML = (propertiesData || [])
      .map(p => {
        const cur = nestiqPropertyCurrentValue(p);
        const lv = nestiqLatestValuation(p);
        const daysAgo = lv
          ? Math.max(0, Math.floor((Date.now() - new Date(lv.date + 'T12:00:00')) / 86400000))
          : null;
        const investedP = nestiqPropertyTotalInvested(p);
        const cg = nestiqCapitalGrowthAmount(p);
        const cgp = nestiqCapitalGrowthPct(p);
        const ann = nestiqAnnualizedGrowthPct(p);
        const bo = Number(p.bondOutstanding) || 0;
        const ltv = cur && cur > 0 ? (bo / cur) * 100 : null;
        const annualRent = (Number(p.rent) || 0) * 12;
        const annExp = nestiqAnnualExpensesForPropertyName(p.name);
        const grossY = cur && cur > 0 ? (annualRent / cur) * 100 : null;
        const netY = cur && cur > 0 ? ((annualRent - annExp) / cur) * 100 : null;
        const city = nestiqPropertyCityHint(p.addr);
        const impList = (p.improvements || [])
          .map(
            im =>
              `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font-size:0.78rem;border-bottom:1px dashed var(--border);padding:6px 0">
              <span>${nestiqValEsc(im.description)} ${im.addedToValue ? '<span class="badge badge-green" style="font-size:0.65rem">Value</span>' : ''}</span>
              <span>${nestiqFormatMoney(im.cost)} · ${nestiqValEsc(im.date)}</span>
            </div>`
          )
          .join('');
        const impSum = (p.improvements || []).reduce((s, x) => s + (Number(x.cost) || 0), 0);
        return `
        <div class="settings-card" style="margin:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:1.6rem">${nestiqValEsc(p.icon || '🏠')}</div>
              <h3 style="font-family:'Playfair Display',serif;margin:6px 0 2px">${nestiqValEsc(p.name)}</h3>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                <span class="badge badge-amber">${nestiqValEsc(p.type || '—')}</span>
                <span style="font-size:0.82rem;color:var(--muted)">${nestiqValEsc(city || p.addr || '')}</span>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:0.72rem;color:var(--muted)">Current estimated value</div>
              <div style="font-family:'Playfair Display',serif;font-size:1.85rem;font-weight:700;color:var(--gold)">${cur != null ? nestiqFormatMoney(cur) : '—'}</div>
              <div style="font-size:0.76rem;color:var(--muted)">${lv ? `Last valued: ${daysAgo} days ago` : 'No valuation yet'}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;font-size:0.82rem">
            <div><span style="color:var(--muted)">Purchase price</span><br><strong>${p.purchasePrice != null ? nestiqFormatMoney(p.purchasePrice) : '—'}</strong></div>
            <div><span style="color:var(--muted)">Total invested</span><br><strong>${nestiqFormatMoney(investedP)}</strong></div>
            <div><span style="color:var(--muted)">Capital growth</span><br><strong>${cg != null ? `${nestiqFormatMoney(cg)} (${cgp != null ? cgp.toFixed(1) + '%' : '—'})` : '—'}</strong></div>
            <div><span style="color:var(--muted)">Annual growth rate</span><br><strong>${ann != null ? ann.toFixed(1) + '% p.a.' : '—'}</strong></div>
          </div>
          ${bo > 0 || p.bondMonthlyPayment > 0 ? `
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-size:0.82rem">
            <div style="font-weight:700;margin-bottom:6px">Bond</div>
            <div>Outstanding: <strong>${nestiqFormatMoney(bo)}</strong> · Monthly: <strong>${nestiqFormatMoney(p.bondMonthlyPayment)}</strong></div>
            <div>Equity: <strong>${cur != null ? nestiqFormatMoney(cur - bo) : '—'}</strong></div>
            <div>LTV: <strong style="color:${nestiqLtvClass(ltv)}">${ltv != null ? ltv.toFixed(1) + '%' : '—'}</strong></div>
          </div>` : ''}
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-size:0.82rem">
            <div style="font-weight:700;margin-bottom:6px">Rental yield</div>
            <div>Monthly rent: <strong>${nestiqFormatMoney(p.rent)}</strong> · Annual: <strong>${nestiqFormatMoney(annualRent)}</strong></div>
            <div>Gross yield: <strong>${grossY != null ? grossY.toFixed(2) + '%' : '—'}</strong> · Net yield: <strong>${netY != null ? netY.toFixed(2) + '%' : '—'}</strong> <span style="color:var(--muted)">(expenses ${new Date().getFullYear()})</span></div>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
            <div style="font-weight:700;margin-bottom:6px;font-size:0.84rem">Improvements</div>
            ${impList || '<div style="font-size:0.8rem;color:var(--muted)">None recorded.</div>'}
            <div style="font-size:0.78rem;color:var(--muted);margin-top:8px">Total improvements: <strong>${nestiqFormatMoney(impSum)}</strong></div>
            <p style="font-size:0.72rem;color:var(--muted);margin:8px 0 0">May qualify for Section 13sex deductions — consult your tax practitioner.</p>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
            <button type="button" class="btn-primary btn-sm" onclick="nestiqOpenUpdateValuationModal(${p.id})">Update value</button>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenValuationHistoryModal(${p.id})">View history</button>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenImprovementModal(${p.id})">Add improvement</button>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenBondDetailsModal(${p.id})">Update bond details</button>
            <button type="button" class="btn-outline btn-sm" onclick="nestiqOpenPurchaseDetailsModal(${p.id})">Purchase & costs</button>
          </div>
        </div>`;
      })
      .join('');
  }

  setTimeout(() => nestiqRenderPortfolioGrowthChart(), 80);
}

async function nestiqValuationAiMarket(){
  const out = document.getElementById('nestiqValAiOut');
  if (!out) return;
  if (typeof isGeminiConfigured !== 'function' || !isGeminiConfigured()){
    out.innerHTML = '<span style="color:var(--rust)">Configure Gemini in Settings to use AI analysis.</span>';
    return;
  }
  const ctx = landlordSettings?.marketContext || {};
  const city = String(ctx.city || 'South Africa').trim();
  out.textContent = 'Analysing…';
  const prompt = `You are a property analyst for South Africa. Give a short (max 120 words) neutral market context for residential buy-to-let in ${city} in 2026: price growth drivers, risks, and one practical tip for landlords. No investment advice disclaimer in JSON — plain paragraphs.`;
  const raw = await (typeof callGemini === 'function' ? callGemini : window.callGemini)?.(prompt, `market:${city}`);
  out.innerHTML = raw ? `<div style="white-space:pre-wrap;line-height:1.45">${nestiqValEsc(raw)}</div>` : '<span style="color:var(--rust)">No response.</span>';
}

function nestiqOpenUpdateValuationModal(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const cur = nestiqPropertyCurrentValue(p);
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Update Property Value — ${nestiqValEsc(p.name)}</h2>
    <p class="modal-sub">Current estimated value: <strong>${cur != null ? nestiqFormatMoney(cur) : '—'}</strong></p>
    <div class="form-group"><label>New estimated value (R) *</label><input class="form-input" id="nv_val" type="number" step="1" min="0" value="${cur != null ? cur : ''}"></div>
    <div class="form-group"><label>Valuation date *</label><input class="form-input" id="nv_date" type="date" value="${today}"></div>
    <div class="form-group"><label>Source *</label>
      <select class="form-input" id="nv_src">
        <option value="manual">Manual estimate</option>
        <option value="estimate">Comparable sales / online estimate</option>
        <option value="formal-valuation">Formal valuation</option>
        <option value="sale-price">Sale price (if sold)</option>
      </select></div>
    <div class="form-group"><label>Valued by</label><input class="form-input" id="nv_by" placeholder="Person or source"></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="nv_notes" rows="2"></textarea></div>
    <p id="nv_impact" style="font-size:0.84rem;color:var(--muted)"></p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveNewValuation(${p.id})">Save valuation</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  const inp = document.getElementById('nv_val');
  const upd = () => {
    const n = Number(inp?.value);
    const el = document.getElementById('nv_impact');
    if (!el) return;
    if (!Number.isFinite(n) || cur == null) el.textContent = cur == null ? 'Adds to portfolio total once saved.' : '';
    else el.textContent = `This will change portfolio total value by approximately ${nestiqFormatMoney(n - cur)} (this property only).`;
  };
  inp?.addEventListener('input', upd);
  upd();
}

function nestiqSaveNewValuation(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const val = Number(document.getElementById('nv_val')?.value);
  const date = document.getElementById('nv_date')?.value || '';
  const source = document.getElementById('nv_src')?.value || 'manual';
  if (!Number.isFinite(val) || val <= 0 || !date){
    showNotif('Enter value and date', 'error');
    return;
  }
  const ids = (p.valuations || []).map(v => v.id);
  const nid = (ids.length ? Math.max(...ids) : 0) + 1;
  p.valuations = p.valuations || [];
  p.valuations.push({
    id: nid,
    date,
    value: val,
    source: NESTIQ_VAL_SOURCES.has(source) ? source : 'manual',
    valuedBy: document.getElementById('nv_by')?.value?.trim() || '',
    notes: document.getElementById('nv_notes')?.value?.trim() || '',
    createdAt: new Date().toISOString().slice(0, 10)
  });
  saveData?.();
  normalizeDataModel?.();
  closeModal();
  showNotif(`📈 ${p.name} value updated to ${nestiqFormatMoney(val)}`, 'success');
  nestiqRenderValuationPage();
}

function nestiqOpenPurchaseDetailsModal(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Purchase & transfer — ${nestiqValEsc(p.name)}</h2>
    <div class="form-group"><label>Purchase price (R)</label><input class="form-input" id="np_pp" type="number" step="1" min="0" placeholder="Required for growth metrics" value="${p.purchasePrice != null ? p.purchasePrice : ''}"></div>
    <div class="form-group"><label>Purchase date</label><input class="form-input" id="np_pd" type="date" value="${p.purchaseDate || ''}"></div>
    <div class="form-group"><label>Transfer costs (R)</label><input class="form-input" id="np_tc" type="number" step="1" min="0" value="${p.transferCosts || 0}"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSavePurchaseDetails(${p.id})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqSavePurchaseDetails(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const pp = document.getElementById('np_pp')?.value;
  p.purchasePrice = pp === '' || pp == null ? null : Math.max(0, Number(pp));
  p.purchaseDate = document.getElementById('np_pd')?.value || '';
  p.transferCosts = Math.max(0, Number(document.getElementById('np_tc')?.value) || 0);
  saveData?.();
  normalizeDataModel?.();
  closeModal();
  showNotif('Purchase details saved', 'success');
  nestiqRenderValuationPage();
}

function nestiqOpenBondDetailsModal(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const ym = nestiqBondFreeYearsMonths(p);
  const sum = nestiqAmortizationSummary(p);
  const cur = nestiqPropertyCurrentValue(p);
  const bo = Number(p.bondOutstanding) || 0;
  const ltv = cur && cur > 0 ? (bo / cur) * 100 : null;
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Bond details — ${nestiqValEsc(p.name)}</h2>
    <div class="form-group"><label>Original bond amount (R)</label><input class="form-input" id="nb_orig" type="number" step="1" min="0" value="${p.bondOriginalAmount || ''}"></div>
    <div class="form-group"><label>Current outstanding (R)</label><input class="form-input" id="nb_out" type="number" step="1" min="0" value="${p.bondOutstanding || ''}"></div>
    <div class="form-group"><label>Interest rate (% p.a.)</label><input class="form-input" id="nb_rate" type="number" step="0.01" min="0" value="${p.bondInterestRate || ''}"></div>
    <div class="form-group"><label>Monthly payment (R)</label><input class="form-input" id="nb_pay" type="number" step="1" min="0" value="${p.bondMonthlyPayment || ''}"></div>
    <div class="form-group"><label>Bond start date</label><input class="form-input" id="nb_start" type="date" value="${p.bondStartDate || ''}"></div>
    <div class="form-group"><label>Term (years)</label><input class="form-input" id="nb_term" type="number" step="0.5" min="0" value="${p.bondTermYears || ''}"></div>
    <div id="nb_remain_wrap" style="font-size:0.84rem;color:var(--muted);margin-bottom:10px"></div>
    <button type="button" class="btn-outline btn-sm" onclick="nestiqBondCalcRemaining(${p.id})">Calculate bond schedule</button>
    <div id="nb_sched" style="margin-top:12px;font-size:0.84rem"></div>
    ${ym ? `<div style="margin-top:14px;padding:12px;background:var(--cream);border-radius:10px;font-weight:700;color:var(--sage)">Bond free in ${ym.years} years and ${ym.months} months (illustrative)</div>` : ''}
    <div style="margin-top:10px;font-size:0.82rem">Current LTV: <strong>${ltv != null ? ltv.toFixed(1) + '%' : '—'}</strong></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveBondDetails(${p.id})">Save bond details</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Close</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  nestiqBondUpdateRemainingDisplay(p);
}

function nestiqBondUpdateRemainingDisplay(p){
  const el = document.getElementById('nb_remain_wrap');
  if (!el || !p.bondStartDate || !p.bondTermYears) return;
  const start = new Date(p.bondStartDate + 'T12:00:00');
  if (String(start) === 'Invalid Date') return;
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + (Number(p.bondTermYears) || 0));
  const now = new Date();
  const monthsLeft = Math.max(0, Math.round((end - now) / (30.44 * 86400000)));
  el.textContent = `Remaining term (calendar): ~${Math.floor(monthsLeft / 12)} years ${monthsLeft % 12} months from original term`;
}

function nestiqBondCalcRemaining(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  p.bondOriginalAmount = Math.max(0, Number(document.getElementById('nb_orig')?.value) || 0);
  p.bondOutstanding = Math.max(0, Number(document.getElementById('nb_out')?.value) || 0);
  p.bondInterestRate = Math.max(0, Number(document.getElementById('nb_rate')?.value) || 0);
  p.bondMonthlyPayment = Math.max(0, Number(document.getElementById('nb_pay')?.value) || 0);
  p.bondStartDate = document.getElementById('nb_start')?.value || '';
  p.bondTermYears = Math.max(0, Number(document.getElementById('nb_term')?.value) || 0);
  const sum = nestiqAmortizationSummary(p);
  const box = document.getElementById('nb_sched');
  if (!box) return;
  if (!sum || sum.error){
    box.innerHTML = `<span style="color:var(--rust)">${sum?.error || 'Enter outstanding balance and monthly payment.'}</span>`;
    return;
  }
  box.innerHTML = `<div>Remaining payments: <strong>${sum.remainingPayments}</strong></div>
    <div>Total interest still to pay (approx): <strong>${nestiqFormatMoney(sum.interestRemaining)}</strong></div>
    <div>Bond-free date (approx): <strong>${sum.bondFreeDate}</strong></div>`;
}

function nestiqSaveBondDetails(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  p.bondOriginalAmount = Math.max(0, Number(document.getElementById('nb_orig')?.value) || 0);
  p.bondOutstanding = Math.max(0, Number(document.getElementById('nb_out')?.value) || 0);
  p.bondInterestRate = Math.max(0, Number(document.getElementById('nb_rate')?.value) || 0);
  p.bondMonthlyPayment = Math.max(0, Number(document.getElementById('nb_pay')?.value) || 0);
  p.bondStartDate = document.getElementById('nb_start')?.value || '';
  p.bondTermYears = Math.max(0, Number(document.getElementById('nb_term')?.value) || 0);
  saveData?.();
  normalizeDataModel?.();
  closeModal();
  showNotif('Bond details saved', 'success');
  nestiqRenderValuationPage();
}

function nestiqOpenImprovementModal(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Add improvement — ${nestiqValEsc(p.name)}</h2>
    <div class="form-group"><label>Description *</label><input class="form-input" id="ni_desc" placeholder="e.g. Kitchen renovation"></div>
    <div class="form-group"><label>Cost (R)</label><input class="form-input" id="ni_cost" type="number" step="1" min="0"></div>
    <div class="form-group"><label>Date</label><input class="form-input" id="ni_date" type="date" value="${today}"></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:0.86rem"><input type="checkbox" id="ni_addv"> Added to property value (for yield / invested basis)</label>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveImprovement(${p.id})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function nestiqSaveImprovement(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const desc = document.getElementById('ni_desc')?.value?.trim() || '';
  if (!desc){
    showNotif('Description required', 'error');
    return;
  }
  const ids = (p.improvements || []).map(x => x.id);
  const nid = (ids.length ? Math.max(...ids) : 0) + 1;
  p.improvements = p.improvements || [];
  p.improvements.push({
    id: nid,
    description: desc,
    cost: Math.max(0, Number(document.getElementById('ni_cost')?.value) || 0),
    date: document.getElementById('ni_date')?.value || '',
    addedToValue: Boolean(document.getElementById('ni_addv')?.checked)
  });
  saveData?.();
  normalizeDataModel?.();
  closeModal();
  showNotif('Improvement added', 'success');
  nestiqRenderValuationPage();
}

function nestiqOpenValuationHistoryModal(propertyId){
  const p = (propertiesData || []).find(x => Number(x.id) === Number(propertyId));
  if (!p) return;
  const vals = (p.valuations || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const purchase = p.purchasePrice;
  document.getElementById('modalContent').innerHTML = `
    <h2 class="modal-title">Valuation history — ${nestiqValEsc(p.name)}</h2>
    <div style="height:260px;margin-bottom:12px"><canvas id="nestiqValHistChart"></canvas></div>
    <div id="nestiqValPointDetail" style="font-size:0.82rem;color:var(--muted);min-height:36px;margin-bottom:10px">Click a point for details.</div>
    <div style="overflow:auto;max-height:200px">
      <table class="settings-email-table" style="font-size:0.78rem">
        <thead><tr><th>Date</th><th>Value</th><th>Source</th><th>Valued by</th><th>Δ</th><th>Δ%</th></tr></thead>
        <tbody>${vals.length ? vals.map((v, i) => {
    const prev = vals[i - 1];
    const delta = prev ? v.value - prev.value : null;
    const dPct = prev && prev.value ? ((v.value - prev.value) / prev.value) * 100 : null;
    return `<tr>
            <td>${nestiqValEsc(v.date)}</td>
            <td>${nestiqFormatMoney(v.value)}</td>
            <td>${nestiqValEsc(nestiqValuationSourceLabel(v.source))}</td>
            <td>${nestiqValEsc(v.valuedBy)}</td>
            <td>${delta != null ? nestiqFormatMoney(delta) : '—'}</td>
            <td>${dPct != null ? dPct.toFixed(1) + '%' : '—'}</td>
          </tr>`;
  }).join('') : '<tr><td colspan="6">No valuations yet.</td></tr>'}</tbody>
      </table>
    </div>
    <div id="nestiqValHistFoot" style="margin-top:12px;font-size:0.84rem"></div>
    <button type="button" class="btn-outline btn-sm" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => nestiqRenderValHistoryChart(p, vals, purchase), 50);
}

function nestiqRenderValHistoryChart(p, vals, purchase){
  const canvas = document.getElementById('nestiqValHistChart');
  if (!canvas || typeof Chart === 'undefined') return;
  nestiqDestroyChart(__nestiqValHistoryChart);
  const labels = vals.map(v => v.date);
  const data = vals.map(v => v.value);
  const datasets = [
    {
      label: 'Value',
      data,
      borderColor: '#c9a84c',
      backgroundColor: 'rgba(201,168,76,0.15)',
      fill: true,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7
    }
  ];
  if (purchase != null && Number.isFinite(purchase) && purchase > 0){
    datasets.push({
      label: 'Purchase price',
      data: labels.map(() => purchase),
      borderColor: '#888',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false
    });
  }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = dark ? 'rgba(240,236,228,0.55)' : 'rgba(14,17,23,0.45)';
  __nestiqValHistoryChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, elements){
        if (!elements.length) return;
        const i = elements[0].index;
        const v = vals[i];
        const det = document.getElementById('nestiqValPointDetail');
        if (det && v){
          det.innerHTML = `<strong>${nestiqValEsc(v.date)}</strong> · ${nestiqFormatMoney(v.value)} · ${nestiqValEsc(nestiqValuationSourceLabel(v.source))} · ${nestiqValEsc(v.valuedBy || '—')}<br><span style="font-size:0.78rem">${nestiqValEsc(v.notes || '')}</span>`;
        }
      },
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: {
          callbacks: {
            label(ctx){
              return `${ctx.dataset.label}: R${Number(ctx.raw || 0).toLocaleString('en-ZA')}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45 } },
        y: {
          ticks: {
            color: textColor,
            callback(v){
              return 'R' + Number(v).toLocaleString('en-ZA');
            }
          }
        }
      }
    }
  });
  const foot = document.getElementById('nestiqValHistFoot');
  if (foot && vals.length){
    const first = vals[0];
    const last = vals[vals.length - 1];
    const grow = last.value - first.value;
    const gpct = first.value ? (grow / first.value) * 100 : null;
    const yrs = Math.max(0.1, (new Date(last.date) - new Date(first.date)) / (365.25 * 86400000));
    const ann = gpct != null ? ((1 + gpct / 100) ** (1 / yrs) - 1) * 100 : null;
    foot.innerHTML = `<strong>Total capital growth (series):</strong> ${nestiqFormatMoney(grow)}${gpct != null ? ` (${gpct.toFixed(1)}%)` : ''} · Over ${yrs.toFixed(1)} years ≈ ${ann != null ? ann.toFixed(1) + '%' : '—'} per year (illustrative)`;
  }
}

function nestiqPrintNetWorthReport(){
  const landlord = landlordSettings?.name || landlordName || 'Landlord';
  const today = new Date().toISOString().slice(0, 10);
  let totalV = 0;
  let totalB = 0;
  let totalEq = 0;
  let totalInv = 0;
  const rows = (propertiesData || []).map(p => {
    const v = nestiqPropertyCurrentValue(p);
    const lv = nestiqLatestValuation(p);
    const bo = Number(p.bondOutstanding) || 0;
    const eq = v != null ? v - bo : null;
    const cg = nestiqCapitalGrowthAmount(p);
    const cgp = nestiqCapitalGrowthPct(p);
    if (v != null) totalV += v;
    totalB += bo;
    if (eq != null) totalEq += eq;
    totalInv += nestiqPropertyTotalInvested(p);
    return `<tr>
      <td>${nestiqValEsc(p.name)}</td>
      <td>${nestiqValEsc(p.addr || '')}</td>
      <td>${p.purchasePrice != null ? nestiqFormatMoney(p.purchasePrice) : '—'}</td>
      <td>${p.purchaseDate || '—'}</td>
      <td>${v != null ? nestiqFormatMoney(v) : '—'}</td>
      <td>${lv ? nestiqValEsc(lv.date) : '—'}</td>
      <td>${cg != null ? `${nestiqFormatMoney(cg)} (${cgp != null ? cgp.toFixed(1) + '%' : '—'})` : '—'}</td>
      <td>${nestiqFormatMoney(bo)}</td>
      <td>${eq != null ? nestiqFormatMoney(eq) : '—'}</td>
    </tr>`;
  }).join('');
  const capGrow = totalV - totalInv;
  const capPct = totalInv > 0 ? (capGrow / totalInv) * 100 : null;
  const avgRet = nestiqPortfolioAvgAnnualReturn();
  const monthlyRent = nestiqPortfolioMonthlyRentSum();
  const grossY = totalV > 0 ? ((monthlyRent * 12) / totalV) * 100 : null;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Net Worth Statement</title>
    <style>body{font-family:DM Sans,system-ui;padding:24px;max-width:920px;color:#111}h1{font-family:Georgia,serif}table{border-collapse:collapse;width:100%;font-size:0.8rem}th,td{border:1px solid #ccc;padding:6px;text-align:left}.muted{color:#666;font-size:0.85rem}</style></head><body>
    <h1>Property Portfolio Net Worth Statement</h1>
    <p class="muted">Date: ${today}<br>Prepared for: ${nestiqValEsc(landlord)}</p>
    <h3>Properties</h3>
    <table><thead><tr><th>Property</th><th>Address</th><th>Purchase</th><th>Purchase date</th><th>Current value</th><th>Value date</th><th>Capital growth</th><th>Bond</th><th>Equity</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Portfolio totals</h3>
    <p>Total value: <strong>${nestiqFormatMoney(totalV)}</strong><br>
    Total bonds: <strong>${nestiqFormatMoney(totalB)}</strong><br>
    Total equity: <strong>${nestiqFormatMoney(totalEq)}</strong><br>
    Total invested: <strong>${nestiqFormatMoney(totalInv)}</strong><br>
    Total capital growth: <strong>${nestiqFormatMoney(capGrow)}</strong>${capPct != null ? ` (${capPct.toFixed(1)}%)` : ''}<br>
    Average annual return (illustrative): <strong>${avgRet != null ? avgRet.toFixed(1) + '%' : '—'}</strong></p>
    <h3>Rental income summary</h3>
    <p>Total monthly rental income: <strong>${nestiqFormatMoney(monthlyRent)}</strong><br>
    Total annual rental income: <strong>${nestiqFormatMoney(monthlyRent * 12)}</strong><br>
    Overall portfolio gross yield: <strong>${grossY != null ? grossY.toFixed(2) + '%' : '—'}</strong></p>
    <p class="muted" style="margin-top:24px"><strong>Disclaimer:</strong> Property values are estimates only. Formal valuations required for lending or legal purposes.</p>
    <p style="margin-top:40px">Signature: ___________________________</p>
    <p><button onclick="window.print()">Print</button> <span class="muted">Use Print → Save as PDF for a PDF copy.</span></p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w){
    w.document.write(html);
    w.document.close();
  }
}

window.nestiqNormalizePropertyValuation = nestiqNormalizePropertyValuation;
window.nestiqRenderValuationPage = nestiqRenderValuationPage;
window.nestiqOpenUpdateValuationModal = nestiqOpenUpdateValuationModal;
window.nestiqSaveNewValuation = nestiqSaveNewValuation;
window.nestiqOpenValuationHistoryModal = nestiqOpenValuationHistoryModal;
window.nestiqOpenImprovementModal = nestiqOpenImprovementModal;
window.nestiqSaveImprovement = nestiqSaveImprovement;
window.nestiqOpenBondDetailsModal = nestiqOpenBondDetailsModal;
window.nestiqSaveBondDetails = nestiqSaveBondDetails;
window.nestiqBondCalcRemaining = nestiqBondCalcRemaining;
window.nestiqOpenPurchaseDetailsModal = nestiqOpenPurchaseDetailsModal;
window.nestiqSavePurchaseDetails = nestiqSavePurchaseDetails;
window.nestiqPrintNetWorthReport = nestiqPrintNetWorthReport;
window.nestiqValuationAiMarket = nestiqValuationAiMarket;
