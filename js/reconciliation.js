/* ═══════════════════════════════
   BANK RECONCILIATION (CSV import + tenant matching)
═══════════════════════════════ */

const NESTIQ_RECON_BANKS={
  standard:{label:'Standard Bank',keys:['date','description','amount','balance']},
  fnb:{label:'FNB',keys:['date','credit amount','debit amount']},
  nedbank:{label:'Nedbank',keys:['date','description','debit','credit']},
  absa:{label:'Absa',keys:['transaction date','description','debit amount','credit amount']}
};

let nestiqReconState=null;

function nestiqReconNormHeader(h){
  return String(h==null?'':h).replace(/^\uFEFF/,'').trim().replace(/^["']|["']$/g,'').toLowerCase().replace(/\s+/g,' ');
}

function nestiqReconFindKey(row, candidates){
  const keys=Object.keys(row||{});
  for(const cand of candidates){
    const nc=nestiqReconNormHeader(cand);
    const hit=keys.find(k=>nestiqReconNormHeader(k)===nc||nestiqReconNormHeader(k).includes(nc));
    if(hit) return hit;
  }
  return null;
}

function nestiqReconDetectFormat(fieldNames){
  const h=(fieldNames||[]).map(nestiqReconNormHeader);
  const hs=new Set(h);
  if(h.some(x=>x.includes('transaction date'))&&h.some(x=>x.includes('credit amount'))&&h.some(x=>x.includes('debit amount'))) return 'absa';
  if(hs.has('credit amount')&&hs.has('debit amount')) return 'fnb';
  if(hs.has('credit')&&hs.has('debit')&&hs.has('description')) return 'nedbank';
  if(hs.has('amount')&&hs.has('description')&&!hs.has('credit amount')) return 'standard';
  return 'unknown';
}

function nestiqReconParseAmount(v){
  if(v==null||v==='') return NaN;
  let s=String(v).trim().replace(/\s/g,'').replace(/"/g,'');
  if(/^[\d,]+\.\d{2}$/.test(s)) s=s.replace(/,/g,'');
  else if(/^[\d.]+,\d{2}$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  const n=parseFloat(s);
  return Number.isFinite(n)?n:NaN;
}

function nestiqReconParseDate(v){
  const s=String(v==null?'':v).trim();
  if(!s) return '';
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){
    let d=parseInt(m[1],10),mo=parseInt(m[2],10),y=parseInt(m[3],10);
    if(y<100) y+=2000;
    if(d>12&&mo<=12){ const t=d;d=mo;mo=t; }
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const d=new Date(s);
  if(String(d)!=='Invalid Date') return d.toISOString().slice(0,10);
  return '';
}

function nestiqReconExtractCredit(format, row){
  let dateISO='',desc='',amt=NaN,bal='';
  if(format==='standard'){
    const dk=nestiqReconFindKey(row,['Date','date']);
    const nk=nestiqReconFindKey(row,['Description','description']);
    const ak=nestiqReconFindKey(row,['Amount','amount']);
    const bk=nestiqReconFindKey(row,['Balance','balance']);
    dateISO=nestiqReconParseDate(dk?row[dk]:'');
    desc=String(nk?row[nk]:'').trim();
    amt=nestiqReconParseAmount(ak?row[ak]:'');
    bal=bk?String(row[bk]):'';
    if(!Number.isFinite(amt)||amt<=0) return null;
    return{dateISO,description:desc,amount:amt,balance:bal};
  }
  if(format==='fnb'){
    const dk=nestiqReconFindKey(row,['Date','date']);
    const ck=nestiqReconFindKey(row,['Credit Amount','credit amount','Credit']);
    dateISO=nestiqReconParseDate(dk?row[dk]:'');
    const credit=nestiqReconParseAmount(ck?row[ck]:'');
    if(!Number.isFinite(credit)||credit<=0) return null;
    const sc=nestiqReconFindKey(row,['Service Charges','service charges']);
    desc=String(sc&&row[sc]!=null?row[sc]:'').trim()||'Credit';
    return{dateISO,description:desc,amount:credit,balance:''};
  }
  if(format==='nedbank'){
    const dk=nestiqReconFindKey(row,['Date','date']);
    const nk=nestiqReconFindKey(row,['Description','description']);
    const ck=nestiqReconFindKey(row,['Credit','credit']);
    dateISO=nestiqReconParseDate(dk?row[dk]:'');
    desc=String(nk?row[nk]:'').trim();
    const credit=nestiqReconParseAmount(ck?row[ck]:'');
    if(!Number.isFinite(credit)||credit<=0) return null;
    return{dateISO,description:desc,amount:credit,balance:''};
  }
  if(format==='absa'){
    const dk=nestiqReconFindKey(row,['Transaction Date','transaction date','Date']);
    const nk=nestiqReconFindKey(row,['Description','description']);
    const ck=nestiqReconFindKey(row,['Credit Amount','credit amount']);
    dateISO=nestiqReconParseDate(dk?row[dk]:'');
    desc=String(nk?row[nk]:'').trim();
    const credit=nestiqReconParseAmount(ck?row[ck]:'');
    if(!Number.isFinite(credit)||credit<=0) return null;
    return{dateISO,description:desc,amount:credit,balance:''};
  }
  return null;
}

function nestiqReconPaymentExists(dateISO, amount){
  const a=Math.round(Number(amount)*100)/100;
  return(paymentsData||[]).some(p=>{
    const d=String(p.date||'').slice(0,10);
    const pa=Math.round(Number(p.amount)*100)/100;
    return d===dateISO&&Math.abs(pa-a)<0.02;
  });
}

function nestiqReconNormDesc(s){
  return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/gi,' ').replace(/\s+/g,' ').trim();
}

function nestiqReconNameParts(name){
  const p=String(name||'').trim().split(/\s+/).filter(Boolean);
  return{first:p[0]||'',last:p.length>1?p[p.length-1]:''};
}

function nestiqReconRefScore(desc, tenant){
  const fmt=String(landlordSettings?.portal?.paymentReferenceFormat||'').toLowerCase();
  if(!fmt) return 0;
  const d=nestiqReconNormDesc(desc);
  const tn=nestiqReconNormDesc(tenant.name||'');
  if(!tn) return 0;
  const parts=tn.split(' ');
  const hits=parts.filter(w=>w.length>2&&d.includes(w)).length;
  if(fmt.includes('tenant')&&hits>=1) return 10;
  if(fmt.includes('month')&&(d.includes('jan')||d.includes('feb')||d.includes('mar')||d.includes('apr')||d.includes('may')||d.includes('jun')||d.includes('jul')||d.includes('aug')||d.includes('sep')||d.includes('oct')||d.includes('nov')||d.includes('dec')||/\b20\d{2}\b/.test(d))) return 10;
  if(d.includes(tn.replace(/\s/g,''))) return 10;
  return 0;
}

function nestiqReconScoreRow(description, amount, tenant){
  if(!tenant||tenant.status==='vacant') return 0;
  let score=0;
  const rent=Number(tenant.rent||0);
  const diff=Math.abs(Number(amount)-rent);
  if(diff<0.5) score+=40;
  else if(diff<=50) score+=25;
  else if(diff<=200) score+=10;
  const d=nestiqReconNormDesc(description);
  const full=nestiqReconNormDesc(tenant.name);
  const{first,last}=nestiqReconNameParts(tenant.name);
  if(full&&d.includes(full)) score+=30;
  else{
    if(first&&first.length>1&&d.includes(nestiqReconNormDesc(first))) score+=15;
    if(last&&last.length>1&&last!==first&&d.includes(nestiqReconNormDesc(last))) score+=15;
  }
  const prop=nestiqReconNormDesc(tenant.property||'');
  if(prop&&d.includes(prop)) score+=20;
  score+=nestiqReconRefScore(description,tenant);
  return score;
}

function nestiqReconDueThisMonth(tenant){
  if(tenant.status==='vacant') return false;
  const ym=new Date().toISOString().slice(0,7);
  const paid=(tenant.payments||[]).some(p=>String(p.date||'').slice(0,7)===ym)||(paymentsData||[]).some(p=>p.tenantId===tenant.id&&String(p.date||'').slice(0,7)===ym);
  return !paid;
}

function nestiqReconBestTenant(description, amount){
  const tenants=(tenantsData||[]).filter(t=>t&&t.status!=='vacant');
  const scored=tenants.map(t=>({t,score:nestiqReconScoreRow(description,amount,t)}));
  const maxScore=Math.max(0,...scored.map(s=>s.score));
  const top=scored.filter(s=>s.score===maxScore&&maxScore>0);
  if(!top.length) return{tenantId:'',score:0,status:'UNMATCHED'};
  const due=top.filter(x=>nestiqReconDueThisMonth(x.t));
  const pick=(due.length?due:top)[0];
  const bestScore=pick.score;
  const best=pick.t;
  let status='UNMATCHED';
  if(bestScore>=60) status='AUTO';
  else if(bestScore>=30) status='POSSIBLE';
  return{tenantId:best.id,score:bestScore,status};
}

function nestiqReconEscape(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function nestiqReconOnFileSelect(ev){
  const f=ev.target?.files?.[0];
  if(f) nestiqReconParseFile(f);
}

function nestiqReconParseFile(file){
  const errEl=document.getElementById('reconParseError');
  if(errEl){ errEl.style.display='none'; errEl.textContent=''; }
  if(!file||!file.name.toLowerCase().endsWith('.csv')){
    if(errEl){ errEl.style.display='block'; errEl.textContent='Please choose a .csv file.'; }
    return;
  }
  if(typeof Papa==='undefined'){
    if(errEl){ errEl.style.display='block'; errEl.textContent='CSV parser not loaded. Refresh the page.'; }
    return;
  }
  Papa.parse(file,{
    header:true,
    skipEmptyLines:'greedy',
    complete:(res)=>{
      const fields=res.meta.fields||[];
      const fmt=nestiqReconDetectFormat(fields);
      if(fmt==='unknown'){
        if(errEl){ errEl.style.display='block'; errEl.textContent='Could not detect bank format from the header row. Use Standard Bank, FNB, Nedbank, or Absa CSV exports.'; }
        return;
      }
      const credits=[];
      (res.data||[]).forEach((row,idx)=>{
        const c=nestiqReconExtractCredit(fmt,row);
        if(c&&c.dateISO&&Number.isFinite(c.amount)) credits.push({...c,rowIndex:idx});
      });
      if(!credits.length){
        if(errEl){ errEl.style.display='block'; errEl.textContent='No credit transactions found. Debits are ignored.'; }
        return;
      }
      const bankLabel=NESTIQ_RECON_BANKS[fmt]?.label||fmt;
      nestiqReconState={format:fmt,bankLabel,credits,rows:[]};
      credits.forEach((c,i)=>{
        const stmtRef=`recon-${c.dateISO}-${c.amount}-${i}-${c.rowIndex}`;
        const exists=nestiqReconPaymentExists(c.dateISO,c.amount);
        const m=nestiqReconBestTenant(c.description,c.amount);
        let status=m.status;
        if(exists) status='RECORDED';
        const include=status==='AUTO'&&!exists;
        const preTenant=exists||status==='UNMATCHED'?'':String(m.tenantId||'');
        nestiqReconState.rows.push({
          ...c,
          statementRef:stmtRef,
          matchScore:m.score,
          matchStatus:status,
          selectedTenantId:preTenant,
          include
        });
      });
      nestiqReconRenderPreview();
      document.getElementById('reconPreviewWrap').style.display='block';
    },
    error:(e)=>{
      if(errEl){ errEl.style.display='block'; errEl.textContent=String(e.message||'Failed to read file'); }
    }
  });
}

function nestiqReconRenderPreview(){
  const meta=document.getElementById('reconPreviewMeta');
  const tb=document.getElementById('reconPreviewTable');
  if(!nestiqReconState||!meta||!tb) return;
  meta.innerHTML=`<strong>${nestiqReconEscape(nestiqReconState.bankLabel)}</strong> · ${nestiqReconState.credits.length} credit transaction(s) imported`;
  const sample=nestiqReconState.credits.slice(0,15);
  tb.innerHTML=`<thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody>${sample.map(c=>`<tr><td>${nestiqReconEscape(c.dateISO)}</td><td>${nestiqReconEscape(c.description.slice(0,60))}</td><td>R${Number(c.amount).toLocaleString('en-ZA')}</td></tr>`).join('')}</tbody>`;
}

function nestiqReconGoToMatch(){
  if(!nestiqReconState) return;
  document.getElementById('reconStepUpload').style.display='none';
  document.getElementById('reconStepMatch').style.display='block';
  nestiqReconRenderMatchTable();
}

function nestiqReconTenantOptions(selectedId){
  const opts=(tenantsData||[]).filter(t=>t.status!=='vacant').map(t=>`<option value="${t.id}" ${String(t.id)===String(selectedId)?'selected':''}>${nestiqReconEscape(t.name)} · ${nestiqReconEscape(t.property||'')}</option>`).join('');
  return`<option value="">Not a rent payment</option>${opts}`;
}

function nestiqReconRenderMatchTable(){
  const body=document.getElementById('reconMatchBody');
  if(!body||!nestiqReconState) return;
  body.innerHTML=nestiqReconState.rows.map((r,i)=>{
    const st=r.matchStatus;
    let badge='recon-b-un',lbl='Unmatched';
    if(st==='AUTO'){ badge='recon-b-auto'; lbl='AUTO-MATCHED'; }
    else if(st==='POSSIBLE'){ badge='recon-b-pos'; lbl='POSSIBLE MATCH'; }
    else if(st==='RECORDED'){ badge='recon-b-rec'; lbl='ALREADY RECORDED'; }
    else lbl='UNMATCHED';
    const dis=st==='RECORDED';
    const sel=r.selectedTenantId||'';
    return`<tr data-recon-i="${i}">
      <td><input type="checkbox" class="recon-inc" data-i="${i}" ${r.include&&!dis?'checked':''} ${dis?'disabled':''} onchange="nestiqReconToggleInclude(${i},this.checked)"></td>
      <td>${nestiqReconEscape(r.dateISO)}</td>
      <td style="max-width:240px;word-break:break-word">${nestiqReconEscape(r.description)}</td>
      <td>R${Number(r.amount).toLocaleString('en-ZA')}</td>
      <td><select class="form-input recon-tenant-sel" style="min-width:200px;padding:6px 8px;font-size:0.76rem" data-i="${i}" onchange="nestiqReconSelectTenant(${i},this.value)" ${dis?'disabled':''}>${nestiqReconTenantOptions(sel)}</select></td>
      <td><span class="recon-badge ${badge}">${lbl}</span></td>
    </tr>`;
  }).join('');
}

function nestiqReconToggleInclude(i,on){
  if(!nestiqReconState?.rows[i]) return;
  nestiqReconState.rows[i].include=on;
}

function nestiqReconSelectTenant(i,val){
  if(!nestiqReconState?.rows[i]) return;
  nestiqReconState.rows[i].selectedTenantId=val?String(val):'';
}

function nestiqReconConfirmAllAuto(){
  if(!nestiqReconState) return;
  nestiqReconState.rows.forEach(r=>{
    if(r.matchStatus==='AUTO'){
      r.include=true;
      if(!r.selectedTenantId){
        const m=nestiqReconBestTenant(r.description,r.amount);
        r.selectedTenantId=String(m.tenantId||'');
      }
    }
  });
  nestiqReconRenderMatchTable();
}

function nestiqReconReset(){
  nestiqReconState=null;
  const fi=document.getElementById('reconFileInput');
  if(fi) fi.value='';
  document.getElementById('reconStepUpload').style.display='block';
  document.getElementById('reconStepMatch').style.display='none';
  document.getElementById('reconPreviewWrap').style.display='none';
  const pe=document.getElementById('reconParseError');
  if(pe){ pe.style.display='none'; pe.textContent=''; }
}

function nestiqReconRowsToRecord(){
  if(!nestiqReconState) return[];
  return nestiqReconState.rows.filter(r=>r.include&&r.selectedTenantId&&r.matchStatus!=='RECORDED'&&!nestiqReconPaymentExists(r.dateISO,r.amount));
}

function nestiqReconOpenRecordConfirm(){
  const rows=nestiqReconRowsToRecord();
  if(!rows.length){ nestiqShowNotif('Select at least one row with a tenant and tick Record','warning'); return; }
  const lines=rows.map(r=>{
    const t=tenantsData.find(x=>String(x.id)===String(r.selectedTenantId));
    return`<li>${nestiqReconEscape(t?.name||'Tenant')} — R${Number(r.amount).toLocaleString('en-ZA')} on ${nestiqReconEscape(r.dateISO)}</li>`;
  }).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Confirm payments</h2>
    <p class="modal-sub">You are about to record the following (${rows.length}):</p>
    <ul style="margin:12px 0;padding-left:20px;font-size:0.88rem;line-height:1.6">${lines}</ul>
    <p style="font-size:0.82rem;color:var(--muted)">These will appear on the tenant ledger as EFT payments from bank reconciliation.</p>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqReconExecuteRecord()">Confirm and record</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function nestiqReconExecuteRecord(){
  const rows=nestiqReconRowsToRecord();
  nestiqCloseModalAnimated();
  if(!rows.length) return;
  let recorded=0,totalAmt=0;
  rows.forEach((r,idx)=>{
    if(nestiqReconPaymentExists(r.dateISO,r.amount)) return;
    const tenant=tenantsData.find(x=>String(x.id)===String(r.selectedTenantId));
    if(!tenant) return;
    const pay=recordPayment(tenant.id,r.amount,'EFT',r.description,{
      silent:true,
      paymentDate:r.dateISO,
      source:'bank-reconciliation',
      statementRef:r.statementRef,
      paymentId:Date.now()+idx
    });
    if(pay){ recorded++; totalAmt+=Number(r.amount)||0; }
  });
  const matched=nestiqReconState.rows.filter(x=>x.matchStatus==='AUTO'||x.matchStatus==='POSSIBLE').length;
  const total=nestiqReconState.rows.length;
  const dates=nestiqReconState.rows.map(x=>x.dateISO).filter(Boolean).sort();
  const from=dates[0]||'', to=dates[dates.length-1]||'';
  const hist={
    id:reconciliationNextId++,
    date:new Date().toISOString().slice(0,10),
    bank:nestiqReconState.bankLabel,
    statementDate:from&&to?(from===to?from:`${from} – ${to}`):'',
    statementDateFrom:from,
    statementDateTo:to,
    totalTransactions:total,
    matched,
    recorded,
    totalAmount:totalAmt
  };
  try{ window.reconciliationNextId=reconciliationNextId; }catch(_e){}
  try{ window.reconciliations=reconciliations; }catch(_e){}
  reconciliations.unshift(hist);
  saveData();
  const notMatched=total-recorded;
  nestiqShowNotif(`${recorded} payment(s) recorded from ${total} transaction(s). ${notMatched} transaction(s) not matched.`,'success');
  nestiqReconReset();
  renderReconciliationPage();
}

function nestiqReconRenderHistory(){
  const body=document.getElementById('reconHistoryBody');
  if(!body) return;
  const list=(reconciliations||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(!list.length){
    body.innerHTML='<tr><td colspan="6" style="color:var(--muted);padding:16px">No reconciliations yet.</td></tr>';
    return;
  }
  body.innerHTML=list.map(h=>`<tr>
    <td>${nestiqReconEscape(h.date)}</td>
    <td>${nestiqReconEscape(h.bank)}</td>
    <td>${h.totalTransactions}</td>
    <td>${h.matched}</td>
    <td>${h.recorded}</td>
    <td>R${Number(h.totalAmount||0).toLocaleString('en-ZA')}</td>
  </tr>`).join('');
}

function renderReconciliationPage(){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='landlord') return;
  if(document.getElementById('reconHistoryBody')) nestiqReconRenderHistory();
}

function nestiqReconInitDropzone(){
  const z=document.getElementById('reconDropZone');
  const inp=document.getElementById('reconFileInput');
  if(!z||!inp) return;
  z.addEventListener('dragover',e=>{ e.preventDefault(); z.classList.add('recon-drop-hover'); });
  z.addEventListener('dragleave',()=>z.classList.remove('recon-drop-hover'));
  z.addEventListener('drop',e=>{
    e.preventDefault();
    z.classList.remove('recon-drop-hover');
    const f=e.dataTransfer?.files?.[0];
    if(f) nestiqReconParseFile(f);
  });
}

window.nestiqReconOnFileSelect=nestiqReconOnFileSelect;
window.nestiqReconGoToMatch=nestiqReconGoToMatch;
window.nestiqReconConfirmAllAuto=nestiqReconConfirmAllAuto;
window.nestiqReconToggleInclude=nestiqReconToggleInclude;
window.nestiqReconSelectTenant=nestiqReconSelectTenant;
window.nestiqReconOpenRecordConfirm=nestiqReconOpenRecordConfirm;
window.nestiqReconExecuteRecord=nestiqReconExecuteRecord;
window.nestiqReconReset=nestiqReconReset;
window.renderReconciliationPage=renderReconciliationPage;
window.nestiqReconInitDropzone=nestiqReconInitDropzone;
