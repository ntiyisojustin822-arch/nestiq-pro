/* ═══════════════════════════════
   EXPENSES + RECURRING (all recurring logic here)
═══════════════════════════════ */

function nestiqExpEscapeAttr(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function nestiqParseYmd(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return null;
  const [y,m,d]=String(iso).split('-').map(Number);
  return new Date(y,m-1,d);
}

function nestiqTodayYmd(){
  const n=new Date();
  return n.toISOString().slice(0,10);
}

function nestiqYmdFromDate(d){
  const x=d instanceof Date?d:new Date(d);
  if(String(x)==='Invalid Date') return '';
  const y=x.getFullYear();
  const m=String(x.getMonth()+1).padStart(2,'0');
  const day=String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function nestiqPrYmd(y,mo,dom){
  const last=new Date(y,mo+1,0).getDate();
  const day=Math.min(Math.max(1,dom),Math.min(28,last));
  return new Date(y,mo,day);
}

function nestiqFirstDueDate(rec){
  const start=nestiqParseYmd(rec.startDate)||new Date();
  const dom=Math.min(28,Math.max(1,Number(rec.dayOfMonth)||1));
  const freq=rec.frequency||'monthly';
  if(freq==='monthly'){
    let y=start.getFullYear(),mo=start.getMonth();
    let t=nestiqPrYmd(y,mo,dom);
    if(t<start){
      mo++;
      if(mo>11){mo=0;y++;}
      t=nestiqPrYmd(y,mo,dom);
    }
    return t;
  }
  if(freq==='quarterly'){
    const q0=Math.floor(start.getMonth()/3)*3;
    let y=start.getFullYear(),m=q0;
    let t=nestiqPrYmd(y,m,dom);
    let guard=0;
    while(t<start&&guard++<48){
      m+=3;
      if(m>11){m-=12;y++;}
      t=nestiqPrYmd(y,m,dom);
    }
    return t;
  }
  let y=start.getFullYear(),m=start.getMonth();
  let t=nestiqPrYmd(y,m,dom);
  if(t<start) t=nestiqPrYmd(y+1,m,dom);
  return t;
}

function nestiqAddOnePeriod(d,freq){
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  if(freq==='monthly') x.setMonth(x.getMonth()+1);
  else if(freq==='quarterly') x.setMonth(x.getMonth()+3);
  else x.setFullYear(x.getFullYear()+1);
  return x;
}

function nestiqRePeriodKey(isoDate,freq){
  const d=nestiqParseYmd(isoDate);
  if(!d) return '';
  const y=d.getFullYear();
  if(freq==='monthly') return `${y}-${String(d.getMonth()+1).padStart(2,'0')}`;
  if(freq==='quarterly') return `${y}-Q${Math.floor(d.getMonth()/3)+1}`;
  return String(y);
}

function nestiqHasExpenseForRecurringPeriod(recurringId,dueDate,freq){
  const key=nestiqRePeriodKey(nestiqYmdFromDate(dueDate),freq);
  if(!key) return false;
  return (expenses||[]).some(e=>Number(e.recurringId)===Number(recurringId)&&nestiqRePeriodKey(e.date,freq)===key);
}

function nestiqNextUnpaidDue(rec,todayEnd){
  if(!rec||!rec.active) return null;
  const end=rec.endDate?nestiqParseYmd(rec.endDate):null;
  let due=nestiqFirstDueDate(rec);
  const freq=rec.frequency||'monthly';
  let guard=0;
  while(due<=todayEnd&&guard++<2400){
    if(end&&due>end) return null;
    if(!nestiqHasExpenseForRecurringPeriod(rec.id,due,freq)) return new Date(due);
    due=nestiqAddOnePeriod(due,freq);
  }
  return null;
}

function nestiqNextDueDisplay(rec){
  const today=new Date();
  today.setHours(0,0,0,0);
  const tEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate(),23,59,59);
  const unpaid=nestiqNextUnpaidDue(rec,tEnd);
  if(unpaid) return unpaid;
  let due=nestiqFirstDueDate(rec);
  const freq=rec.frequency||'monthly';
  const end=rec.endDate?nestiqParseYmd(rec.endDate):null;
  let guard=0;
  while(guard++<2400){
    if(end&&due>end) return null;
    if(due>=today) return new Date(due);
    due=nestiqAddOnePeriod(due,freq);
  }
  return null;
}

function nestiqFreqLabel(f){
  if(f==='quarterly') return 'Quarterly';
  if(f==='annual') return 'Annual';
  return 'Monthly';
}

function nestiqFillRecDomSelect(){
  const sel=document.getElementById('exp_rec_dom');
  if(!sel||sel.options.length>=28) return;
  sel.innerHTML=Array.from({length:28},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
}

function nestiqFillExpPropertySelect(){
  const sel=document.getElementById('exp_prop');
  if(!sel) return;
  const opts=(propertiesData||[]).map(p=>`<option value="${nestiqExpEscapeAttr(p.name)}">${nestiqExpEscapeAttr(p.name)}</option>`).join('');
  sel.innerHTML=opts||'<option>—</option>';
}

function nestiqToggleExpRecurring(){
  const on=document.getElementById('exp_recurring_toggle')?.checked;
  const w=document.getElementById('exp_recurring_fields');
  if(w) w.style.display=on?'block':'none';
}

function nestiqScrollToRecurringForm(){
  document.getElementById('exp_recurring_toggle').checked=true;
  nestiqToggleExpRecurring();
  document.getElementById('addExpenseForm')?.scrollIntoView({behavior:'smooth'});
}

function addRecurringExpenseFromForm(){
  const cat=document.getElementById('exp_cat')?.value||'';
  const desc=document.getElementById('exp_desc')?.value?.trim()||'';
  const amount=parseFloat(document.getElementById('exp_amount')?.value);
  const prop=document.getElementById('exp_prop')?.value||'';
  const freq=document.getElementById('exp_rec_freq')?.value||'monthly';
  const dom=parseInt(document.getElementById('exp_rec_dom')?.value||'1',10);
  const endRaw=document.getElementById('exp_rec_end')?.value||'';
  if(!desc){ nestiqShowNotif('Please enter a description','error'); return; }
  if(!amount||amount<=0){ nestiqShowNotif('Please enter a valid amount','error'); return; }
  if(!prop){ nestiqShowNotif('Please select a property','error'); return; }
  const p=(propertiesData||[]).find(x=>x.name===prop);
  const rid=recurringExpenseNextId++;
  try{ window.recurringExpenseNextId=recurringExpenseNextId; }catch(_e){}
  recurringExpenses.push({
    id:rid,
    cat,
    desc,
    amount,
    prop,
    propertyId:p?.id??null,
    frequency:['monthly','quarterly','annual'].includes(freq)?freq:'monthly',
    dayOfMonth:Math.min(28,Math.max(1,dom||1)),
    startDate:nestiqTodayYmd(),
    endDate:endRaw&&/^\d{4}-\d{2}-\d{2}$/.test(endRaw)?endRaw:null,
    lastGenerated:'',
    active:true,
    createdAt:nestiqTodayYmd()
  });
  saveData();
  renderExpenses();
  nestiqShowNotif('Recurring expense saved — it will auto-log each period','success');
}

function checkRecurringExpenses(){
  if(typeof getSession==='function'&&getSession()?.role!=='landlord') return;
  const arr=recurringExpenses||[];
  if(!arr.length) return;
  const today=new Date();
  today.setHours(12,0,0,0);
  const todayIso=nestiqTodayYmd();
  const todayEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate(),23,59,59);
  let changed=false;
  arr.forEach(rec=>{
    if(!rec.active) return;
    let guard=0;
    while(guard++<24){
      const due=nestiqNextUnpaidDue(rec,todayEnd);
      if(!due||due>todayEnd) break;
      if(rec.endDate){
        const en=nestiqParseYmd(rec.endDate);
        if(en&&due>en) break;
      }
      const freq=rec.frequency||'monthly';
      if(nestiqHasExpenseForRecurringPeriod(rec.id,due,freq)) break;
      const monthYear=due.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
      const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
      expenses.unshift({
        id:expNextId++,
        cat:rec.cat,
        desc:`${rec.desc} — ${monthYear}`,
        amount:rec.amount,
        prop:rec.prop,
        date:todayIso,
        recurringId:rec.id,
        autoGenerated:true,
        color:catColors[rec.cat]||'#888',
        landlordId:lid||undefined
      });
      rec.lastGenerated=todayIso;
      changed=true;
      addBellNotif('🔁',`Auto-logged: ${rec.desc} — R${Number(rec.amount).toLocaleString()} for ${rec.prop}`);
    }
  });
  if(changed){
    try{ window.expNextId=expNextId; }catch(_e){}
    saveData();
  }
}

function renderRecurringExpensesList(){
  const host=document.getElementById('recurringExpensesList');
  if(!host) return;
  const list=recurringExpenses||[];
  if(!list.length){
    host.innerHTML='<p class="recurring-empty">No recurring expenses yet. Use the form to add insurance, levies, or rates.</p>';
    return;
  }
  host.innerHTML=list.map(r=>{
    const nd=nestiqNextDueDisplay(r);
    const ndStr=nd?nd.toLocaleDateString('en-ZA',{dateStyle:'medium'}):'—';
    const lg=r.lastGenerated?nestiqParseYmd(r.lastGenerated)?.toLocaleDateString('en-ZA',{dateStyle:'medium'})||r.lastGenerated:'—';
    return`<div class="recurring-exp-row" data-rec-id="${r.id}">
      <div class="recurring-exp-row-top">
        <span class="badge-rec-cat" style="background:${nestiqExpEscapeAttr(catColors[r.cat]||'#888')}22;color:${nestiqExpEscapeAttr(catColors[r.cat]||'#888')}">${nestiqExpEscapeAttr(r.cat)}</span>
        <span class="badge-rec-freq">${nestiqFreqLabel(r.frequency)}</span>
      </div>
      <div class="recurring-exp-desc">${nestiqExpEscapeAttr(r.desc)}</div>
      <div class="recurring-exp-meta">
        <span>${nestiqExpEscapeAttr(r.prop)}</span>
        <span class="recurring-exp-amt">R${Number(r.amount).toLocaleString()}</span>
      </div>
      <div class="recurring-exp-dates">
        <span>Next due: <strong>${nestiqExpEscapeAttr(ndStr)}</strong></span>
        <span>Last generated: ${nestiqExpEscapeAttr(lg)}</span>
      </div>
      <div class="recurring-exp-actions">
        <label class="rec-active-toggle"><input type="checkbox" ${r.active?'checked':''} onchange="nestiqToggleRecurringActive(${r.id},this.checked)"> Active</label>
        <button type="button" class="btn-outline btn-sm" onclick="openEditRecurringModal(${r.id})">Edit</button>
        <button type="button" class="btn-outline btn-sm" onclick="deleteRecurringExpense(${r.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function nestiqToggleRecurringActive(id,active){
  const r=recurringExpenses.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  r.active=Boolean(active);
  saveData();
  renderExpenses();
}

function deleteRecurringExpense(id){
  if(!confirm('Remove this recurring expense? Past logged expenses stay in the list.')) return;
  const ix=recurringExpenses.findIndex(x=>Number(x.id)===Number(id));
  if(ix>=0) recurringExpenses.splice(ix,1);
  saveData();
  renderExpenses();
  nestiqShowNotif('Recurring expense removed','warning');
}

function openEditRecurringModal(id){
  const r=recurringExpenses.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  const domOpts=Array.from({length:28},(_,i)=>`<option value="${i+1}" ${Number(r.dayOfMonth)===i+1?'selected':''}>${i+1}</option>`).join('');
  const propOpts=(propertiesData||[]).map(p=>`<option value="${nestiqExpEscapeAttr(p.name)}" ${p.name===r.prop?'selected':''}>${nestiqExpEscapeAttr(p.name)}</option>`).join('');
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Edit recurring expense</h2>
    <p class="modal-sub">${nestiqExpEscapeAttr(r.desc)}</p>
    <div class="form-group"><label>Category</label>
      <select class="form-input" id="edit_rec_cat">
        <option value="Maintenance" ${r.cat==='Maintenance'?'selected':''}>Maintenance</option>
        <option value="Insurance" ${r.cat==='Insurance'?'selected':''}>Insurance</option>
        <option value="Rates & Taxes" ${r.cat==='Rates & Taxes'?'selected':''}>Rates & Taxes</option>
        <option value="Utilities" ${r.cat==='Utilities'?'selected':''}>Utilities</option>
        <option value="Agent Fees" ${r.cat==='Agent Fees'?'selected':''}>Agent Fees</option>
        <option value="Other" ${r.cat==='Other'?'selected':''}>Other</option>
      </select>
    </div>
    <div class="form-group"><label>Description</label><input class="form-input" id="edit_rec_desc" value="${nestiqExpEscapeAttr(r.desc)}"></div>
    <div class="form-group"><label>Amount (R)</label><input class="form-input" id="edit_rec_amt" type="number" step="0.01" value="${Number(r.amount)}"></div>
    <div class="form-group"><label>Property</label><select class="form-input" id="edit_rec_prop">${propOpts}</select></div>
    <div class="form-group"><label>Frequency</label>
      <select class="form-input" id="edit_rec_freq">
        <option value="monthly" ${r.frequency==='monthly'?'selected':''}>Monthly</option>
        <option value="quarterly" ${r.frequency==='quarterly'?'selected':''}>Quarterly</option>
        <option value="annual" ${r.frequency==='annual'?'selected':''}>Annually</option>
      </select>
    </div>
    <div class="form-group"><label>Day of month</label><select class="form-input" id="edit_rec_dom">${domOpts}</select></div>
    <div class="form-group"><label>Start date</label><input class="form-input" id="edit_rec_start" type="date" value="${nestiqExpEscapeAttr(r.startDate)}"></div>
    <div class="form-group"><label>End date (optional)</label><input class="form-input" id="edit_rec_end" type="date" value="${nestiqExpEscapeAttr(r.endDate||'')}"></div>
    <label class="recurring-toggle-row"><input type="checkbox" id="edit_rec_active" ${r.active?'checked':''}> Active</label>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button type="button" class="btn-primary btn-sm" onclick="saveEditedRecurring(${r.id})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Cancel</button>
    </div>`;
  nestiqOpenModalAnimated();
}

function saveEditedRecurring(id){
  const r=recurringExpenses.find(x=>Number(x.id)===Number(id));
  if(!r) return;
  const desc=document.getElementById('edit_rec_desc')?.value?.trim()||'';
  const amt=parseFloat(document.getElementById('edit_rec_amt')?.value);
  if(!desc){ nestiqShowNotif('Description required','error'); return; }
  if(!amt||amt<=0){ nestiqShowNotif('Valid amount required','error'); return; }
  const prop=document.getElementById('edit_rec_prop')?.value||r.prop;
  const p=(propertiesData||[]).find(x=>x.name===prop);
  r.cat=document.getElementById('edit_rec_cat')?.value||r.cat;
  r.desc=desc;
  r.amount=amt;
  r.prop=prop;
  r.propertyId=p?.id??null;
  r.frequency=document.getElementById('edit_rec_freq')?.value||'monthly';
  r.dayOfMonth=Math.min(28,Math.max(1,parseInt(document.getElementById('edit_rec_dom')?.value||'1',10)));
  r.startDate=document.getElementById('edit_rec_start')?.value||r.startDate;
  const en=document.getElementById('edit_rec_end')?.value||'';
  r.endDate=en&&/^\d{4}-\d{2}-\d{2}$/.test(en)?en:null;
  r.active=Boolean(document.getElementById('edit_rec_active')?.checked);
  saveData();
  nestiqCloseModalAnimated();
  renderExpenses();
  nestiqShowNotif('Recurring expense updated','success');
}

function renderUpcomingRecurringCard(){
  const body=document.getElementById('upcomingRecurringBody');
  const totEl=document.getElementById('upcomingRecurringTotal');
  if(!body||!totEl) return;
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth();
  const items=[];
  let sum=0;
  (recurringExpenses||[]).forEach(r=>{
    if(!r.active) return;
    const nd=nestiqNextDueDisplay(r);
    if(!nd) return;
    if(nd.getFullYear()!==y||nd.getMonth()!==m) return;
    if(nestiqHasExpenseForRecurringPeriod(r.id,nd,r.frequency||'monthly')) return;
    items.push({r,nd});
    sum+=Number(r.amount)||0;
  });
  if(!items.length){
    body.innerHTML='<p class="upcoming-rec-empty">No recurring items due this month that are still outstanding.</p>';
    totEl.textContent='';
    return;
  }
  body.innerHTML=items.map(({r,nd})=>`<div class="upcoming-rec-line">
    <div><strong>${nestiqExpEscapeAttr(r.desc)}</strong><div class="upcoming-rec-sub">${nestiqExpEscapeAttr(r.prop)} · Due ${nd.toLocaleDateString('en-ZA',{day:'numeric',month:'short'})}</div></div>
    <div class="upcoming-rec-line-amt">R${Number(r.amount).toLocaleString()}</div>
  </div>`).join('');
  totEl.innerHTML=`Expected recurring expenses: <strong style="color:var(--gold)">R${sum.toLocaleString()}</strong>`;
}

function renderExpenses(){
  nestiqFillRecDomSelect();
  nestiqFillExpPropertySelect();
  checkRecurringExpenses();
  const rows=document.getElementById('expenseRows');
  if(!rows) return;
  if(window.nestiqExpensesLoading){
    nestiqShowSkeleton?.(rows, 'row', 4);
    return;
  }
  const expList=expenses.filter(e=>!e.isIncome);
  if(!expList.length){
    nestiqShowEmptyState?.(rows, { icon:'💸', title:'No expenses logged', message:'Track your property expenses to generate accurate financial reports.', action:{ label:'+ Add Expense', fn:'nestiqOpenAddExpenseModal' } });
    renderExpSummary();
    renderRecurringExpensesList();
    renderUpcomingRecurringCard();
    return;
  }
  rows.innerHTML=expList.map(e=>{
    const rec=e.recurringId!=null&&e.autoGenerated;
    const r=rec?recurringExpenses.find(x=>Number(x.id)===Number(e.recurringId)):null;
    const tip=r
      ?`Part of recurring: ${r.desc} · Frequency: ${nestiqFreqLabel(r.frequency)} · Click to manage recurring expenses`
      :'Auto-generated recurring expense';
    const badge=rec?`<button type="button" class="exp-rec-badge" title="${nestiqExpEscapeAttr(tip)}" onclick="nestiqGoManageRecurring(event)" aria-label="Recurring expense">🔁</button>`:'';
    return`
    <div class="exp-row">
      <div class="exp-cat"><div class="exp-cat-dot" style="background:${catColors[e.cat]||'#888'}"></div>${badge}${nestiqExpEscapeAttr(e.cat)}</div>
      <div class="exp-desc">${nestiqExpEscapeAttr(e.desc)}</div>
      <div class="exp-amount" style="color:var(--rust)">R${e.amount.toLocaleString()}</div>
      <div class="exp-prop">${nestiqExpEscapeAttr(e.prop)}</div>
      <div class="exp-date">${nestiqExpEscapeAttr(e.date)}</div>
      <div class="exp-actions">
        <button type="button" class="exp-edit" title="Edit" data-nq-tip="Edit" onclick="openEditExpenseModal(${nestiqHtmlJsArg(e.id)})">✏</button>
        <button type="button" class="exp-del" title="Delete" data-nq-tip="Delete" onclick="deleteExpense(${nestiqHtmlJsArg(e.id)})">🗑</button>
      </div>
    </div>`;
  }).join('');
  if(typeof nestiqStaggerChildren==='function') nestiqStaggerChildren(rows, 40);
  renderExpSummary();
  renderRecurringExpensesList();
  renderUpcomingRecurringCard();
  const d=document.getElementById('exp_date');
  if(d&&!d.value) d.value=new Date().toISOString().split('T')[0];
}

function nestiqGoManageRecurring(ev){
  ev.preventDefault();
  ev.stopPropagation();
  showPage('expenses');
  setTimeout(()=>{
    document.getElementById('recurringExpensesCard')?.scrollIntoView({behavior:'smooth'});
  },280);
}

async function addExpense(){
  const cat=document.getElementById('exp_cat').value;
  const desc=document.getElementById('exp_desc').value.trim();
  const amount=parseFloat(document.getElementById('exp_amount').value);
  const prop=document.getElementById('exp_prop').value;
  const date=document.getElementById('exp_date').value;
  if(!desc){nestiqShowNotif('Enter a description','error');return;}
  if(!amount||amount<=0){nestiqShowNotif('Enter a valid amount','error');return;}
  const lid=typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null;
  const fv=typeof firebase!=='undefined'&&firebase.firestore&&firebase.firestore.FieldValue;
  const dateVal=date||new Date().toISOString().split('T')[0];
  if(window.nestiqUseFirestore&&window.nestiqDb&&firebase?.auth?.()?.currentUser&&lid){
    try{
      const row={
        cat,
        desc,
        amount,
        prop,
        date:dateVal,
        color:catColors[cat]||'#888',
        landlordId:lid
      };
      if(fv) row.createdAt=fv.serverTimestamp();
      const lid=window.nestiqCurrentLandlordUid?.();
      await window.nestiqFs.expenses(window.nestiqDb, lid).add({ ...row, landlordId: lid });
      document.getElementById('exp_desc').value='';
      document.getElementById('exp_amount').value='';
      nestiqShowNotif('💸 Expense logged!','success');
      addBellNotif('💸','Expense: '+desc);
      return;
    }catch(err){
      console.error('Add expense',err);
      nestiqShowNotif('Failed to log expense','error');
      return;
    }
  }
  expenses.unshift({id:expNextId++,cat,desc,amount,prop,date:dateVal,color:catColors[cat],landlordId:lid||undefined});
  try{ window.expNextId=expNextId; }catch(_e){}
  document.getElementById('exp_desc').value='';
  document.getElementById('exp_amount').value='';
  saveData();
  renderExpenses();
  addBellNotif('💸','Expense logged: '+desc+' R'+amount.toLocaleString());
  nestiqShowNotif(`💸 R${amount.toLocaleString()} expense logged!`,'success');
}

async function deleteExpense(id){
  if(window.nestiqUseFirestore&&window.nestiqDb){
    try{
      const lid=window.nestiqCurrentLandlordUid?.();
      await window.nestiqFs.expenses(window.nestiqDb, lid).doc(String(id)).delete();
      nestiqShowNotif('Expense removed','warning');
      return;
    }catch(err){
      nestiqShowNotif('Failed to delete expense','error');
      return;
    }
  }
  expenses=expenses.filter(e=>String(e.id)!==String(id));
  saveData();
  renderExpenses();
  nestiqShowNotif('Expense removed','warning');
}

function renderExpSummary(){
  const expOnly=expenses.filter(e=>!e.isIncome);
  const total=expOnly.reduce((s,e)=>s+e.amount,0);
  const bycat={};
  expOnly.forEach(e=>{bycat[e.cat]=(bycat[e.cat]||0)+e.amount});
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const el=document.getElementById('expSummary');
  if(!el) return;
  el.innerHTML=`
    <div class="exp-sum-label">Total Expenses</div>
    <div class="exp-sum-val">R${total.toLocaleString()}</div>
    <div class="exp-sum-label">By Category</div>
    <div class="exp-cat-list">${sorted.map(([cat,amt])=>`
      <div class="exp-cat-item">
        <div class="exp-cat-name"><span style="background:${catColors[cat]||'#888'}"></span>${cat}</div>
        <div class="exp-cat-amount">R${amt.toLocaleString()}</div>
      </div>`).join('')}
    </div>`;
}

function exportExpensesCSV(){
  const hdr='Category,Description,Amount,Property,Date';
  const rows=expenses.map(e=>`"${e.cat}","${e.desc}",${e.amount},"${e.prop}","${e.date}"`);
  downloadCSV([hdr,...rows].join('\n'),'nestiq-expenses.csv');
  nestiqShowNotif('📥 Expenses exported!','success');
}

window.checkRecurringExpenses=checkRecurringExpenses;
window.nestiqToggleExpRecurring=nestiqToggleExpRecurring;
window.addRecurringExpenseFromForm=addRecurringExpenseFromForm;
window.nestiqScrollToRecurringForm=nestiqScrollToRecurringForm;
window.nestiqToggleRecurringActive=nestiqToggleRecurringActive;
window.deleteRecurringExpense=deleteRecurringExpense;
window.openEditRecurringModal=openEditRecurringModal;
window.saveEditedRecurring=saveEditedRecurring;
window.nestiqGoManageRecurring=nestiqGoManageRecurring;
