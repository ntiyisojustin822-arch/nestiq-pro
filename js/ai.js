function geminiModel(){ return landlordSettings?.gemini?.model || 'gemini-1.5-flash'; }
function geminiKey(){ return (landlordSettings?.gemini?.apiKey || geminiApiKey || '').trim(); }

function nestiqAiFeatureEnabled(key){
  const f=landlordSettings?.aiFeatures||{};
  return f[key]!==false;
}
function geminiEndpoint(){ return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`; }
const aiCache={};

function isGeminiConfigured(){ return Boolean(geminiKey()); }
function aiConfigError(){ showNotif('Add Gemini API key in Settings', 'warning'); }
function aiAttribution(){ return `<div style="font-size:.74rem;color:var(--muted);margin-top:8px">AI Powered by Gemini</div>`; }
function aiLoadingHtml(){ return `<div style="font-size:.82rem;color:var(--muted)">Thinking...</div>${aiAttribution()}`; }
function aiRawFallbackCard(raw){ return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)"><div style="font-weight:700;margin-bottom:6px">AI Response</div><pre style="white-space:pre-wrap;font-size:.78rem;color:var(--muted)">${String(raw||'')}</pre>${aiAttribution()}</div>`; }

function parseGeminiJson(text){
  const raw=String(text||'').trim();
  try{return {ok:true,data:JSON.parse(raw),raw};}catch(_err){}
  const m=raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if(m){ try{return {ok:true,data:JSON.parse(m[0]),raw};}catch(_err){} }
  return {ok:false,data:null,raw};
}

async function callGemini(prompt, cacheKey=''){
  if(typeof nestiqGuardAiRequest === 'function' && !nestiqGuardAiRequest()) return null;
  if(!isGeminiConfigured()){ aiConfigError(); return null; }
  if(cacheKey && aiCache[cacheKey]) return aiCache[cacheKey];
  try{
    const res=await fetch(geminiEndpoint(),{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey()},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.3,maxOutputTokens:1000}
      })
    });
    if(!res.ok) throw new Error('AI unavailable, try again');
    const data=await res.json();
    const txt=data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
    if(txt && typeof nestiqIncrementAiUsage === 'function') nestiqIncrementAiUsage();
    if(cacheKey) aiCache[cacheKey]=txt;
    return txt||null;
  }catch(_err){
    showNotif('AI unavailable, try again', 'error');
    return null;
  }
}

async function callGeminiJson(prompt, cacheKey=''){
  const raw=await callGemini(prompt,cacheKey);
  if(!raw) return {ok:false,data:null,raw:''};
  return parseGeminiJson(raw);
}

async function testGeminiConnection(){
  const res=await callGemini('Reply only: ok', 'test-connection');
  if(!res) throw new Error('AI unavailable, try again');
}

async function suggestRentPriceAI(input){
  if(!nestiqAiFeatureEnabled('rentSuggest')){
    showNotif('Rent price suggester is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const prompt=`I have a ${input.bedrooms} bedroom ${input.type} property at ${input.address}, ${input.city}, South Africa. The property is ${input.amenities||'unfurnished, standard features'}.
What is a realistic monthly rental price range for this property in ${input.city} in 2026?
Consider current South African rental market conditions, the area, and property type.
Reply ONLY with valid JSON, no markdown, no explanation:
{"min": number,"recommended": number,"max": number,"marketTrend": "increasing|stable|decreasing","explanation": "one sentence max 20 words","comparables": [{"description":"similar property type","rent": number}]}`;
  return callGeminiJson(prompt,`rent:${input.address}:${input.city}:${input.bedrooms}:${input.type}`);
}

async function assessMaintenanceIssueAI(input){
  if(!nestiqAiFeatureEnabled('maintenanceDx')){
    showNotif('Maintenance diagnosis is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const prompt=`A tenant in a South African rental property has reported this maintenance issue:
'${input.description}'
Property type: ${input.type||'Property'}
City: ${input.city||'South Africa'}
Assess this issue and reply ONLY with valid JSON:
{"urgency":"Emergency|High|Medium|Low","cause":"likely cause in one sentence","costMin":number,"costMax":number,"landlordAction":"what landlord should do, max 15 words","tenantAction":"what tenant should do now, max 15 words","timeframe":"same day|within week|within month","tradeRequired":"Plumber|Electrician|General Handyman|Structural Engineer|Pest Control|None"}`;
  return callGeminiJson(prompt,`maint:${input.description}:${input.type}:${input.city}`);
}

async function generateLeaseClausesAI(input){
  if(!nestiqAiFeatureEnabled('leaseClauses')){
    showNotif('Lease clause generator is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const prompt=`Generate 6 important additional lease agreement clauses for a ${input.type} rental property in ${input.city}, South Africa.
Property details:
- Monthly rent: R${input.amount}
- Tenant: ${input.name}
- Lease period: ${input.leaseStart} to ${input.leaseEnd}
- ${input.furnished||'unfurnished'}
- Deposit: R${input.deposit||0}
Make clauses appropriate for:
- The Rental Housing Act 50 of 1999
- The Consumer Protection Act
- Standard South African rental practice
- ${input.city} specific considerations if any
Reply ONLY with valid JSON array:
[{"title":"clause title max 5 words","clause":"full clause text, formal legal language, max 60 words"}]`;
  return callGeminiJson(prompt,`lease:${input.name}:${input.city}:${input.amount}`);
}

async function screenTenantAI(input){
  if(!nestiqAiFeatureEnabled('tenantScreen')){
    showNotif('Tenant screening AI is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const ratio=(Number(input.income||0)/Math.max(1,Number(input.rent||1))).toFixed(2);
  const prompt=`Screen this rental applicant for a South African rental property:
Property: ${input.property||'Property'}, R${input.rent||0}/month
Applicant: ${input.name||'Applicant'}
Monthly Income: R${input.income||0}
Employment: ${input.employment||'Unknown'}
References: ${input.references||'no'}
Previous Evictions: ${input.evictions||'no'}
Years Renting: ${input.yearsRenting||0}
Income to Rent Ratio: ${ratio}x (South African standard minimum is 3x)
Reply ONLY with valid JSON:
{"score":number,"recommendation":"Approve|Conditional|Decline","riskLevel":"Low|Medium|High","incomeRatioStatus":"Excellent|Adequate|Borderline|Insufficient","redFlags":["flag 1"],"greenFlags":["flag 1"],"conditions":["condition"],"summary":"one paragraph max 40 words"}`;
  return callGeminiJson(prompt,`screen:${input.name}:${input.rent}:${input.income}:${input.employment}:${input.evictions}`);
}

async function analyzePortfolioAI(input){
  if(!nestiqAiFeatureEnabled('portfolioAdvisor')){
    showNotif('Portfolio advisor is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const prompt=`Analyse this South African rental property portfolio and provide actionable advice:
${input}
Provide analysis in ONLY valid JSON:
{"overallHealth":"Excellent|Good|Fair|Poor","healthScore":number,"topInsights":["insight 1","insight 2","insight 3"],"recommendations":[{"priority":"High|Medium|Low","action":"what to do max 15 words","impact":"expected result max 10 words"}],"underperformingProperty":"property name or null","bestPerformingProperty":"property name or null","vacancyRisk":"High|Medium|Low","cashFlowTrend":"Improving|Stable|Declining"}`;
  return callGeminiJson(prompt,`portfolio:${input}`);
}

async function adviseRentIncreaseAI(input){
  if(!nestiqAiFeatureEnabled('portfolioAdvisor')){
    showNotif('Portfolio advisor is off in Settings','warning');
    return {ok:false,data:null,raw:''};
  }
  const prompt=`Advise on a rent increase for a South African rental property:
Current rent: R${input.currentRent}/month
Tenant: ${input.tenantName}, renting since ${input.leaseStart}
Payment history: ${input.paymentHistory}
Current CPI: ${input.cpi}%
Property: ${input.propertyType} in ${input.city}
Market context: 2026 South African rental market
Recommend a fair rent increase and reply ONLY with valid JSON:
{"recommendedIncrease":number,"recommendedNewRent":number,"reasoning":"explanation max 30 words","tenantRetentionRisk":"Low|Medium|High","marketPosition":"Below market|At market|Above market","negotiationTip":"one tip max 20 words"}`;
  return callGeminiJson(prompt,`rent-increase:${input.tenantName}:${input.currentRent}:${input.city}`);
}

function renderRentSuggestionCard(targetId, parsed, applyCb){
  const el=document.getElementById(targetId);
  if(!el) return;
  if(!parsed?.ok){ el.innerHTML=aiRawFallbackCard(parsed?.raw||'No AI response'); return; }
  const d=parsed.data||{};
  const min=Math.round(Number(d.min||0));
  const rec=Math.round(Number(d.recommended||0));
  const max=Math.round(Number(d.max||0));
  const trend=String(d.marketTrend||'stable').toLowerCase();
  const trendLabel=trend==='increasing'?'↑ Increasing':trend==='decreasing'?'↓ Decreasing':'→ Stable';
  const trendColor=trend==='increasing'?'var(--sage)':trend==='decreasing'?'var(--rust)':'var(--gold)';
  const comps=Array.isArray(d.comparables)?d.comparables:[];
  el.innerHTML=`
    <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--paper)">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px"><div style="font-size:0.72rem;color:var(--muted)">Min</div><div style="font-weight:700">R${min.toLocaleString('en-ZA')}</div></div>
        <div style="border:1px solid var(--gold);border-radius:10px;padding:10px;background:rgba(201,168,76,.12)"><div style="font-size:0.72rem;color:var(--muted)">Recommended</div><div style="font-weight:700;font-size:1.12rem;color:var(--gold)">R${rec.toLocaleString('en-ZA')}</div></div>
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px"><div style="font-size:0.72rem;color:var(--muted)">Max</div><div style="font-weight:700">R${max.toLocaleString('en-ZA')}</div></div>
      </div>
      <div style="margin-top:8px"><span class="badge" style="background:${trendColor}22;color:${trendColor}">${trendLabel}</span></div>
      <div style="font-size:0.82rem;color:var(--muted);margin-top:8px">${d.explanation||''}</div>
      ${comps.length?`<div style="margin-top:8px;font-size:0.8rem">${comps.map(c=>`• ${(c.description||'Comparable')}: R${Number(c.rent||0).toLocaleString('en-ZA')}`).join('<br>')}</div>`:''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
        <button class="btn-primary btn-sm" id="${targetId}_apply_btn">Apply Recommended</button>
        <div class="input-prefix" style="max-width:170px"><span class="input-prefix-label">R</span><input id="${targetId}_custom" class="form-input" type="number" value="${rec}"></div>
      </div>
      ${aiAttribution()}
    </div>
  `;
  const btn=document.getElementById(`${targetId}_apply_btn`);
  const custom=document.getElementById(`${targetId}_custom`);
  if(btn){
    btn.onclick=()=>applyCb(Number(custom?.value||rec));
  }
}

window.isGeminiConfigured=isGeminiConfigured;
window.testGeminiConnection=testGeminiConnection;
window.callGemini=callGemini;
window.callGeminiJson=callGeminiJson;
window.parseGeminiJson=parseGeminiJson;
window.aiLoadingHtml=aiLoadingHtml;
window.aiRawFallbackCard=aiRawFallbackCard;
window.aiAttribution=aiAttribution;
window.suggestRentPriceAI=suggestRentPriceAI;
window.assessMaintenanceIssueAI=assessMaintenanceIssueAI;
window.generateLeaseClausesAI=generateLeaseClausesAI;
window.screenTenantAI=screenTenantAI;
window.analyzePortfolioAI=analyzePortfolioAI;
window.adviseRentIncreaseAI=adviseRentIncreaseAI;
window.renderRentSuggestionCard=renderRentSuggestionCard;
window.aiConfigError=aiConfigError;
