/** Safe embedding of a value in HTML inline onclick="fn(…)" handlers.
 * JSON.stringify alone breaks string ids: onclick="fn("abc")" is invalid HTML.
 */
function nestiqHtmlJsArg(v){
  return JSON.stringify(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
window.nestiqHtmlJsArg=nestiqHtmlJsArg;

/** Tenant photo URL (https or data:) — empty if none / emoji-only. */
function nestiqTenantPhotoUrl(t){
  if(!t||typeof t!=='object') return '';
  const keys=['profilePhoto','photoUrl','photoURL','imageUrl','avatar'];
  for(let i=0;i<keys.length;i++){
    const raw=t[keys[i]];
    if(raw==null) continue;
    const p=String(raw).trim().replace(/[\u200B-\u200D\uFEFF]/g,'');
    if(/^https?:\/\//i.test(p)||p.startsWith('data:image')) return p;
  }
  return '';
}
window.nestiqTenantPhotoUrl=nestiqTenantPhotoUrl;

function nestiqEscAttr(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
window.nestiqEscAttr=nestiqEscAttr;

function nestiqTenantAvatarFallback(t){
  const av=t&&t.avatar!=null?String(t.avatar).trim():'';
  if(av && !/^https?:\/\//i.test(av) && !av.startsWith('data:image')) return av;
  return '👤';
}
window.nestiqTenantAvatarFallback=nestiqTenantAvatarFallback;

function nestiqTenantAvatarImgError(img){
  if(!img) return;
  const fallback=img.getAttribute('data-fallback')||'👤';
  img.onerror=null;
  const wrap=img.parentNode;
  if(wrap&&wrap.classList&&(wrap.classList.contains('tenant-avatar')||wrap.classList.contains('renewal-card-av'))){
    img.remove();
    if(!wrap.querySelector('img')) wrap.textContent=fallback;
    return;
  }
  const span=document.createElement('span');
  span.className=img.className||'nestiq-tenant-av-inline';
  span.style.marginRight='6px';
  span.textContent=fallback;
  if(typeof img.replaceWith==='function') img.replaceWith(span);
  else if(wrap){ wrap.insertBefore(span, img); img.remove(); }
}
window.nestiqTenantAvatarImgError=nestiqTenantAvatarImgError;

/** Landlord UI avatar: profile photo when set, else emoji. */
function nestiqTenantAvatarHtml(t, opts){
  opts=opts||{};
  const cls=String(opts.className||'tenant-avatar');
  const photo=nestiqTenantPhotoUrl(t);
  const fallback=nestiqTenantAvatarFallback(t);
  if(photo){
    return `<div class="${cls}" aria-hidden="true"><img class="loaded" src="${nestiqEscAttr(photo)}" alt="" referrerpolicy="no-referrer" data-fallback="${nestiqEscAttr(fallback)}" onerror="nestiqTenantAvatarImgError(this)"/></div>`;
  }
  return `<div class="${cls}" aria-hidden="true">${fallback}</div>`;
}
window.nestiqTenantAvatarHtml=nestiqTenantAvatarHtml;

/** Compact avatar for titles / inline heads. */
function nestiqTenantAvatarInlineHtml(t, sizePx){
  const size=Number(sizePx)||28;
  const photo=nestiqTenantPhotoUrl(t);
  const fallback=nestiqTenantAvatarFallback(t);
  if(photo){
    return `<img class="nestiq-tenant-av-inline loaded" src="${nestiqEscAttr(photo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px" referrerpolicy="no-referrer" data-fallback="${nestiqEscAttr(fallback)}" onerror="nestiqTenantAvatarImgError(this)"/>`;
  }
  return `<span class="nestiq-tenant-av-inline" style="margin-right:6px">${fallback}</span>`;
}
window.nestiqTenantAvatarInlineHtml=nestiqTenantAvatarInlineHtml;

function nestiqChatPhotoUrl(person){
  if(!person||typeof person!=='object') return '';
  const keys=['profilePhoto','logoBase64','photoUrl','photoURL','logoUrl','avatar'];
  for(let i=0;i<keys.length;i++){
    const p=String(person[keys[i]]||'').trim();
    if(/^https?:\/\//i.test(p)||p.startsWith('data:image')) return p;
  }
  return '';
}
window.nestiqChatPhotoUrl=nestiqChatPhotoUrl;

function nestiqChatAvatarHtml(person, sizePx){
  const size=Number(sizePx)||32;
  const url=nestiqChatPhotoUrl(person);
  const name=String(person&&person.name||'?').trim();
  const initial=(name.slice(0,1)||'?').toUpperCase();
  if(url){
    return `<span class="nestiq-chat-av" style="width:${size}px;height:${size}px"><img src="${nestiqEscAttr(url)}" alt="" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="nestiq-chat-av nestiq-chat-av-fallback" style="width:${size}px;height:${size}px">${initial}</span>`;
}
window.nestiqChatAvatarHtml=nestiqChatAvatarHtml;

function nestiqChatLandlordPerson(){
  const info=window.landlordInfo||{};
  const ls=window.landlordSettings||info.landlordSettings||{};
  return {
    name:info.name||ls.name||'Landlord',
    profilePhoto:info.profilePhoto||info.logoBase64||ls.logoBase64||ls.profilePhoto||ls.logoUrl||''
  };
}
window.nestiqChatLandlordPerson=nestiqChatLandlordPerson;

function nestiqTenantAssignedCaretaker(){
  const live=window.tenantCaretaker;
  if(live&&(live.id||live.name)){
    return {
      id:String(live.id||live.staffId||''),
      staffId:String(live.id||live.staffId||''),
      name:String(live.name||'Caretaker'),
      uid:live.uid||null,
      email:live.email||'',
      phone:live.phone||'',
      profilePhoto:live.profilePhoto||live.photoUrl||''
    };
  }
  const p=window.tenantProperty||{};
  const id=String(p.caretakerId||'').trim();
  if(!id) return null;
  return {
    id,
    staffId:id,
    name:String(p.caretakerName||'Caretaker'),
    uid:p.caretakerUid||null,
    email:p.caretakerEmail||'',
    phone:p.caretakerPhone||'',
    profilePhoto:''
  };
}
window.nestiqTenantAssignedCaretaker=nestiqTenantAssignedCaretaker;

function nestiqCaretakerChatThread(messages){
  return (Array.isArray(messages)?messages:[]).filter(m=>{
    const r=String(m?.fromRole||'');
    return r==='tenant'||r==='caretaker';
  });
}
window.nestiqCaretakerChatThread=nestiqCaretakerChatThread;

function nestiqChatDateLabel(dt){
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(dt); d.setHours(0,0,0,0);
  const diff=Math.round((today-d)/86400000);
  if(diff===0) return 'Today';
  if(diff===1) return 'Yesterday';
  return dt.toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
}
window.nestiqChatDateLabel=nestiqChatDateLabel;

function nestiqChatEsc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}
function nestiqChatIsNarrow(){
  try{ return window.matchMedia('(max-width:720px)').matches; }catch(_e){ return false; }
}
window.nestiqChatIsNarrow=nestiqChatIsNarrow;

function nestiqChatMsgDate(m){
  if(!m) return null;
  if(m.date){
    const d=new Date(m.date);
    if(!isNaN(d.getTime())) return d;
  }
  try{
    const ts=m.createdAt?.toDate?.();
    if(ts) return ts;
    if(typeof m.createdAt?.seconds==='number') return new Date(m.createdAt.seconds*1000);
  }catch(_e){}
  return null;
}
function nestiqChatListTimeLabel(dateVal){
  const dt=dateVal instanceof Date?dateVal:new Date(dateVal||0);
  if(!dateVal||isNaN(dt.getTime())) return '';
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(dt); d.setHours(0,0,0,0);
  const diff=Math.round((today-d)/86400000);
  if(diff===0) return dt.toLocaleTimeString('en-ZA',{hour:'numeric',minute:'2-digit',hour12:true});
  if(diff===1) return 'Yesterday';
  if(diff<7) return dt.toLocaleDateString('en-ZA',{weekday:'short'});
  return dt.toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
}
window.nestiqChatListTimeLabel=nestiqChatListTimeLabel;

function nestiqChatPreviewText(m){
  if(!m||m.deleted) return 'This message was deleted';
  if(m.attachmentUrl&&!String(m.message||'').trim()) return 'Photo';
  const raw=String(m.message||'').replace(/\s+/g,' ').trim();
  if(!raw) return 'Tap to open chat';
  return raw.length>52?raw.slice(0,52)+'…':raw;
}
function nestiqChatLastInThread(messages, tenantId){
  const tid=tenantId==null?'':String(tenantId);
  const list=(typeof nestiqCaretakerChatThread==='function'?nestiqCaretakerChatThread(messages):messages||[])
    .filter(m=>m&&!m.deleted&&(tid===''||String(m.tenantId)===tid));
  if(!list.length) return null;
  return list.slice().sort((a,b)=>{
    const da=nestiqChatMsgDate(a)?.getTime()||0;
    const db=nestiqChatMsgDate(b)?.getTime()||0;
    return da-db;
  }).pop();
}
window.nestiqChatLastInThread=nestiqChatLastInThread;
window.nestiqChatMsgDate=nestiqChatMsgDate;

function nestiqChatListRowHtml(opts){
  opts=opts||{};
  const unread=Math.max(0,Number(opts.unread)||0);
  const last=opts.last||null;
  const mine=Boolean(opts.mine);
  const ticks=mine&&last?`<span class="nestiq-wa-ticks" aria-hidden="true">${last.read?'✓✓':'✓'}</span>`:'';
  const preview=last?nestiqChatPreviewText(last):(opts.preview||'Tap to start a conversation');
  const time=last?nestiqChatListTimeLabel(nestiqChatMsgDate(last)):String(opts.time||'');
  const person=opts.person||{name:opts.name||'Chat'};
  return `<button type="button" class="nestiq-wa-row${opts.active?' is-active':''}${unread?' has-unread':''}" ${opts.attrs||''}>
    ${typeof nestiqChatAvatarHtml==='function'?nestiqChatAvatarHtml(person,52):''}
    <span class="nestiq-wa-main">
      <span class="nestiq-wa-top">
        <span class="nestiq-wa-name">${nestiqChatEsc(opts.name||person.name||'Chat')}</span>
        <span class="nestiq-wa-time${unread?' is-unread':''}">${nestiqChatEsc(time)}</span>
      </span>
      <span class="nestiq-wa-bottom">
        <span class="nestiq-wa-preview">${ticks}${nestiqChatEsc(preview)}</span>
        ${unread?`<span class="nestiq-wa-unread">${unread>99?'99+':unread}</span>`:''}
      </span>
    </span>
  </button>`;
}
window.nestiqChatListRowHtml=nestiqChatListRowHtml;

function nestiqChatLandlordId(){
  try{
    const s=typeof getSession==='function'?getSession():window.__nestiqSession;
    if(s&&s.role==='landlord') return String(s.uid||window.nestiqCurrentLandlordUid?.()||'');
  }catch(_e){}
  return String(window.nestiqTenantSession?.landlordId||window.currentUser?.landlordId||window.nestiqCurrentLandlordUid?.()||'');
}

function nestiqFindChatMessage(id){
  const sid=String(id);
  const pools=[window.tenantMessages,window.messages,window.caretakerMessages];
  for(let i=0;i<pools.length;i++){
    const list=pools[i];
    if(!Array.isArray(list)) continue;
    const hit=list.find(m=>m&&String(m.id)===sid);
    if(hit) return hit;
  }
  return null;
}

function nestiqCanEditChatMessage(m){
  if(!m||m.deleted) return false;
  let role='';
  try{ role=String((typeof getSession==='function'?getSession():window.__nestiqSession)?.role||''); }catch(_e){}
  if(role==='tenant') return m.fromRole==='tenant';
  if(role==='caretaker') return m.fromRole==='caretaker';
  if(role==='landlord') return false;
  return false;
}

function nestiqRefreshOpenChat(){
  if(document.getElementById('nestiqChatEditBox')) return;
  if(document.getElementById('tenantMessages')){
    try{ window.renderMessagesCard?.(); }catch(_e){}
  }
  if(document.getElementById('kCaretakerThread')){
    try{ window.renderCaretakerMessages?.(); }catch(_e){}
  }
  if(document.getElementById('lmThread')&&window.__nestiqOpenChatTenantId!=null){
    try{ window.openLandlordTenantMessages?.(window.__nestiqOpenChatTenantId,{skipMarkRead:true,skipOpen:true}); }catch(_e){}
  }
}

function nestiqBindComposerEnter(el, sendFn){
  if(!el||typeof sendFn!=='function') return;
  el.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      sendFn();
    }
  });
}
window.nestiqBindComposerEnter=nestiqBindComposerEnter;

function nestiqChatThreadHtml(thread, opts){
  opts=opts||{};
  const mineRole=opts.mineRole||'tenant';
  const observer=Boolean(opts.observer)||mineRole==='landlord';
  const tenant=opts.tenant||{};
  const landlord=opts.landlord||nestiqChatLandlordPerson();
  const caretaker=opts.caretaker||{name:'Caretaker'};
  const list=Array.isArray(thread)?thread.slice():[];
  if(!list.length){
    return `<div class="nestiq-chat-empty">No messages yet.</div>`;
  }
  let lastDay='';
  return list.map(m=>{
    const mine=!observer && m.fromRole===mineRole;
    const person=m.fromRole==='tenant'
      ? tenant
      : (m.fromRole==='caretaker'?caretaker:landlord);
    const fromLabel=m.fromRole==='caretaker'?'Caretaker':(m.fromRole==='tenant'?'Tenant':'');
    const dt=new Date(m.date||m.createdAt?.toDate?.()||Date.now());
    const dayKey=dt.toDateString();
    let sep='';
    if(dayKey!==lastDay){
      lastDay=dayKey;
      sep=`<div class="tenant-chat-date-sep nestiq-chat-date-sep">${nestiqChatDateLabel(dt)}</div>`;
    }
    const time=dt.toLocaleString('en-ZA',{hour:'2-digit',minute:'2-digit'});
    const ticks=mine?(m.read?'✓✓':'✓'):'';
    const idArg=nestiqHtmlJsArg(m.id);
    const deleted=Boolean(m.deleted);
    const edited=Boolean(m.editedAt)&&!deleted;
    const img=(!deleted&&m.attachmentUrl)?`<img src="${nestiqEscAttr(m.attachmentUrl)}" class="nestiq-chat-attach-img" alt="">`:'';
    const text=deleted
      ? `<em class="nestiq-chat-deleted">This message was deleted</em>`
      : `${String(m.message||'').replace(/</g,'&lt;')}${img}`;
    const actions=(mine&&!deleted)
      ? `<span class="nestiq-chat-actions"><button type="button" class="nestiq-chat-act" onclick="nestiqBeginChatEdit(${idArg})">Edit</button><button type="button" class="nestiq-chat-act" onclick="nestiqDeleteChatMessage(${idArg})">Delete</button></span>`
      : '';
    const nameHtml=observer?`<div class="nestiq-chat-from">${String(person.name||fromLabel).replace(/</g,'&lt;')}</div>`:'';
    return `${sep}
      <div class="nestiq-chat-row ${mine?'mine':'theirs'} ${m.fromRole==='caretaker'?'from-caretaker':'from-tenant'}" data-chat-msg="${nestiqEscAttr(m.id)}">
        ${mine?'':nestiqChatAvatarHtml(person,32)}
        <div class="nestiq-chat-col">
          ${nameHtml}
          <div class="nestiq-chat-bubble ${deleted?'is-deleted':''}"><div class="nestiq-chat-text">${text}</div></div>
          <div class="nestiq-chat-meta">${time}${edited?' · edited':''} ${ticks}${actions}</div>
        </div>
      </div>`;
  }).join('');
}
window.nestiqChatThreadHtml=nestiqChatThreadHtml;

window.nestiqBeginChatEdit=function(id){
  const m=nestiqFindChatMessage(id);
  if(!nestiqCanEditChatMessage(m)) return;
  const row=document.querySelector('[data-chat-msg="'+CSS.escape(String(id))+'"]');
  const bubble=row&&row.querySelector('.nestiq-chat-text');
  if(!bubble) return;
  const cur=String(m.message||'');
  bubble.innerHTML=`<textarea id="nestiqChatEditBox" class="form-input nestiq-chat-edit-box" maxlength="500">${nestiqEscAttr(cur)}</textarea>
    <div class="nestiq-chat-edit-actions">
      <button type="button" class="btn-primary btn-sm" onclick="nestiqSaveChatEdit(${nestiqHtmlJsArg(id)})">Save</button>
      <button type="button" class="btn-outline btn-sm" onclick="nestiqCancelChatEdit()">Cancel</button>
    </div>`;
  const box=document.getElementById('nestiqChatEditBox');
  if(box){ box.focus(); box.setSelectionRange(box.value.length,box.value.length); }
};

window.nestiqCancelChatEdit=function(){
  nestiqRefreshOpenChat();
};

window.nestiqSaveChatEdit=async function(id){
  const m=nestiqFindChatMessage(id);
  if(!nestiqCanEditChatMessage(m)) return;
  const box=document.getElementById('nestiqChatEditBox');
  const next=String(box?.value||'').trim();
  if(!next){ nestiqShowNotif?.('Message cannot be empty','warning'); return; }
  if(next===String(m.message||'')){ nestiqCancelChatEdit(); return; }
  try{
    const lid=nestiqChatLandlordId();
    if(!lid||!window.nestiqFs?.messages||!window.nestiqDb) throw new Error('Not connected');
    await window.nestiqFs.messages(window.nestiqDb,lid).doc(String(id)).update({
      message:next,
      editedAt:new Date().toISOString()
    });
    m.message=next;
    m.editedAt=new Date().toISOString();
    nestiqShowNotif?.('Message updated','success');
    nestiqRefreshOpenChat();
  }catch(err){
    console.error('edit chat',err);
    nestiqShowNotif?.('Could not edit message','error');
  }
};

window.nestiqDeleteChatMessage=async function(id){
  const m=nestiqFindChatMessage(id);
  if(!nestiqCanEditChatMessage(m)) return;
  if(!window.confirm('Delete this message?')) return;
  try{
    const lid=nestiqChatLandlordId();
    if(!lid||!window.nestiqFs?.messages||!window.nestiqDb) throw new Error('Not connected');
    await window.nestiqFs.messages(window.nestiqDb,lid).doc(String(id)).update({
      deleted:true,
      deletedAt:new Date().toISOString(),
      message:''
    });
    m.deleted=true;
    m.message='';
    nestiqShowNotif?.('Message deleted','success');
    nestiqRefreshOpenChat();
  }catch(err){
    console.error('delete chat',err);
    nestiqShowNotif?.('Could not delete message','error');
  }
};

/** App root (folder containing the SPA index.html), always ends with /. Fixes …/index.html/?… vs other *.html paths. */
function nestiqAppBaseUrl(){
  let p=String(location.pathname||'/');
  if(/\/index\.html\/*$/i.test(p)||/^index\.html\/*$/i.test(p)){
    p=p.replace(/\/index\.html\/*$/i,'').replace(/^index\.html\/*$/i,'');
    p=p.replace(/\/+$/,'');
    if(!p) p='/';
    return location.origin+p+(p.endsWith('/')?'':'/');
  }
  const i=p.lastIndexOf('/');
  return location.origin+(i>=0?p.slice(0,i+1):'/');
}
try{ window.nestiqAppBaseUrl=nestiqAppBaseUrl; }catch(_e){}

function downloadCSV(content, filename){
  const blob=new Blob([content],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function backupData(){
  const data=JSON.stringify({expenses,tenantsData,maintenanceData,propertiesData,propertyPhotos,maintenancePhotos,applications:typeof applications!=='undefined'?applications:[],version:'nestiq-pro-1.0'},null,2);
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='nestiq-backup-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
  nestiqShowNotif('💾 Backup downloaded!','success');
}

function restoreData(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json';
  input.onchange=e=>{
    const file=e.target.files[0];
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        if(d.expenses) expenses=d.expenses;
        if(d.tenantsData) tenantsData=d.tenantsData;
        if(d.maintenanceData) maintenanceData=d.maintenanceData;
        if(d.propertiesData){ propertiesData.splice(0,propertiesData.length,...d.propertiesData); }
        if(d.propertyPhotos && typeof d.propertyPhotos==='object'){ propertyPhotos=d.propertyPhotos; photos=propertyPhotos; }
        if(d.maintenancePhotos && typeof d.maintenancePhotos==='object') maintenancePhotos=d.maintenancePhotos;
        if(Array.isArray(d.applications) && typeof applications!=='undefined'){
          applications.splice(0,applications.length,...d.applications);
          try{ window.applications=applications; }catch(_e){}
          if(typeof normalizeStoredApplications==='function') normalizeStoredApplications();
        }
        saveData();
        nestiqShowNotif('📂 Data restored successfully!','success');
        renderExpenses(); renderTenants(); renderKanban(); renderProperties();
      }catch(err){nestiqShowNotif('Invalid backup file','error');}
    };
    reader.readAsText(file);
  };
  input.click();
}

function normalizeZAPhone(raw){
  const digits=String(raw||'').replace(/[^\d]/g,'');
  if(!digits) return '';
  if(digits.startsWith('0')) return '27'+digits.slice(1);
  if(digits.startsWith('27')) return digits;
  if(digits.startsWith('+' )) return digits.replace(/^\+/, '');
  return digits;
}

function formatWhatsAppNumber(phone){
  let cleaned=String(phone||'').replace(/[\s\-\(\)]/g,'');
  cleaned=cleaned.replace(/[^\d+]/g,'');
  if(cleaned.startsWith('+27')) return cleaned.slice(1);
  if(cleaned.startsWith('0')) return '27'+cleaned.slice(1);
  if(cleaned.startsWith('27')) return cleaned;
  return cleaned.replace(/^\+/,'');
}

function whatsappIconSvg(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.07-1.35C8.44 21.51 10.19 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.64 13.27c-.19.54-1.11 1.03-1.52 1.09-.41.06-.42.32-2.65-.57-.89-.21-2.02-.82-2.87-1.59-.76-.7-1.27-1.53-1.42-1.74-.15-.21-.01-.32.11-.43.11-.09.24-.24.36-.36.12-.12.16-.21.24-.35.08-.14.04-.26-.02-.37-.06-.11-.57-1.38-.79-1.88-.2-.48-.41-.42-.57-.43-.15-.01-.32-.01-.49-.01s-.45.06-.68.32c-.23.26-.89.87-.89 2.13s.91 2.47 1.04 2.64c.13.17 1.79 2.72 4.33 3.71.61.26 1.08.42 1.45.53.61.19 1.16.17 1.6.1.49-.08 1.5-.61 1.71-1.2z"/></svg>`;
}

function getTenantDueDateText(tenant){
  if(typeof window.nestiqCurrentRentObligation==='function'){
    const o=window.nestiqCurrentRentObligation(tenant);
    if(o.dueDate instanceof Date){
      return o.dueDate.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
    }
  }
  const now=new Date();
  const dueDay=Math.max(1,Math.min(28,Number(tenant?.monthlyDueDate||1)));
  return `${dueDay} ${now.toLocaleString('en-ZA',{month:'long'})} ${now.getFullYear()}`;
}

function getTenantDaysOverdue(tenant){
  if(typeof window.nestiqCurrentRentObligation==='function'){
    return Number(window.nestiqCurrentRentObligation(tenant).daysOverdue||0);
  }
  const now=new Date();
  const dueDay=Math.max(1,Math.min(28,Number(tenant?.monthlyDueDate||1)));
  const dueDate=new Date(now.getFullYear(), now.getMonth(), dueDay);
  if(now<=dueDate) return 0;
  return Math.ceil((now-dueDate)/86400000);
}

function formatPortalPaymentReference(tenant, date=new Date()){
  const fmt=String(landlordSettings?.portal?.paymentReferenceFormat||'[TenantName]-[Month]-[Year]');
  const month=date.toLocaleString('en-ZA',{month:'long'});
  const year=String(date.getFullYear());
  const tname=String(tenant?.name||'Tenant').replace(/\s+/g,'');
  return fmt
    .replace(/\[TenantName\]/gi,tname)
    .replace(/\[Month\]/gi,month)
    .replace(/\[Year\]/gi,year);
}
window.formatPortalPaymentReference=formatPortalPaymentReference;

const whatsappTemplates={
  rentReminder(tenant){
    const base=`Hi ${tenant.name}, this is a friendly reminder that your rent of R${Number(tenant.rent||0).toLocaleString()} for ${tenant.property} - ${tenant.unit} is due on the ${getTenantDueDateText(tenant)} of this month. Please ensure payment is made on time. Thank you.`;
    const po=landlordSettings?.portal||{};
    const ref=formatPortalPaymentReference(tenant);
    const bankLine=(po.bankName||po.accountNumber)
      ? `\nBank: ${po.bankName||'—'} · Acc ${po.accountNumber||'—'} · Branch ${po.branchCode||'—'} · ${po.accountType||'Cheque'} · Ref: ${ref}`
      : `\nSuggested payment reference: ${ref}`;
    return `${base}${bankLine} — NestIQ Pro`;
  },
  overdueNotice(tenant, daysOverdue){
    return `Hi ${tenant.name}, your rent of R${Number(tenant.rent||0).toLocaleString()} for ${tenant.property} - ${tenant.unit} was due ${daysOverdue} days ago and has not been received. Please make payment as soon as possible or contact us to make arrangements. — NestIQ Pro`;
  },
  paymentConfirmation(tenant, payment){
    return `Hi ${tenant.name}, thank you for your payment.\nAmount: R${Number(payment?.amount||tenant.rent||0).toLocaleString()}\nDate: ${isoToPretty(payment?.date||new Date().toISOString())}\nMethod: ${payment?.method||'EFT'}\nReceipt: ${payment?.receiptNo||'N/A'}\nProperty: ${tenant.property} - ${tenant.unit}\nYour account is up to date. — NestIQ Pro`;
  },
  leaseExpiry(tenant, daysRemaining){
    return `Hi ${tenant.name}, your lease for ${tenant.property} - ${tenant.unit} expires in ${daysRemaining} days on ${isoToPretty(tenant.leaseEnd||tenant.lease)}. Please contact us as soon as possible to discuss renewal options. — NestIQ Pro`;
  },
  maintenanceUpdate(tenant, request, newStatus){
    const resolved=String(newStatus).toLowerCase()==='resolved' || String(newStatus).toLowerCase()==='done'
      ? ' The issue has been resolved. Please confirm all is in order.'
      : '';
    return `Hi ${tenant.name}, your maintenance request (${request?.title||'Request'}) has been updated to: ${newStatus}.${resolved} — NestIQ Pro`;
  },
  welcomeMessage(tenant){
    return `Hi ${tenant.name}, welcome to ${tenant.property} - ${tenant.unit}. Your monthly rent of R${Number(tenant.rent||0).toLocaleString()} is due on the ${getTenantDueDateText(tenant)} of each month. Login to your tenant portal at any time to view your lease, payment history and submit maintenance requests. — NestIQ Pro`;
  }
};

function formatDueDateDefault(){
  const now=new Date();
  const due=new Date(now.getFullYear(), now.getMonth(), 1);
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(due);
}

function nestiqCommDefer(fn){
  if(typeof requestIdleCallback==='function') requestIdleCallback(()=>{ try{ fn(); }catch(_e){} },{timeout:1200});
  else setTimeout(()=>{ try{ fn(); }catch(_e){} },0);
}

function buildWhatsAppUrl(phone, message){
  const normalized=formatWhatsAppNumber(phone);
  if(!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function logWhatsAppMessage(entry){
  whatsappLog.unshift(entry);
  if(whatsappLog.length>50) whatsappLog=whatsappLog.slice(0,50);
  saveData();
}

function openWhatsApp(phone, message, meta={}){
  const url=buildWhatsAppUrl(phone, message);
  if(!url){
    nestiqShowNotif('No valid phone number for WhatsApp','error');
    return;
  }
  logWhatsAppMessage({
    id:Date.now(),
    tenantId:meta.tenantId??null,
    tenantName:meta.tenantName||'—',
    type:meta.type||'custom',
    phone:formatWhatsAppNumber(phone),
    timestamp:new Date().toISOString(),
    message:String(message||'')
  });
  window.open(url,'_blank','noopener');
  nestiqCommDefer(()=>window.nestiqAutoLogWhatsApp?.(meta,String(message||'')));
}

function openWhatsAppChat(phone, message){
  const normalized=formatWhatsAppNumber(phone);
  if(!normalized){ nestiqShowNotif('No valid phone number for WhatsApp','error'); return; }
  const base=`https://wa.me/${normalized}`;
  const msg=message!=null?String(message).trim():'';
  const url=msg?`${base}?text=${encodeURIComponent(msg)}`:base;
  window.open(url,'_blank','noopener');
}

function fmtMoneyZAR(amount){
  return `R${Number(amount||0).toLocaleString('en-ZA',{maximumFractionDigits:0})}`;
}

function isoToPretty(iso){
  if(!iso) return new Date().toLocaleDateString('en-ZA');
  const d=new Date(iso);
  if(String(d)==='Invalid Date') return String(iso);
  return d.toLocaleDateString('en-ZA');
}

function genReceiptNo(dateIso){
  const d=dateIso?new Date(dateIso):new Date();
  const year=d.getFullYear();
  const seq=String(Math.floor(Math.random()*9000)+1000);
  return `REC-${year}-${seq}`;
}

function getTenantById(id){
  return tenantsData.find(t=>String(t.id)===String(id));
}

function getPropertyByName(name){
  return propertiesData.find(p=>p.name===name);
}

function getPaymentsForTenant(tenantId){
  return (paymentsData||[]).filter(p=>String(p.tenantId)===String(tenantId)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function recordPayment(tenantId, amount, method='EFT', reference='', opts={}){
  const tenant=getTenantById(tenantId);
  if(!tenant){nestiqShowNotif('Tenant not found','error');return null;}
  const dateIso=(typeof opts.paymentDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(opts.paymentDate))
    ?opts.paymentDate
    :new Date().toISOString().slice(0,10);
  const receiptNo=opts.receiptNo||genReceiptNo(dateIso);
  const payId=Number.isFinite(Number(opts.paymentId))?Number(opts.paymentId):(Date.now()+Math.floor(Math.random()*10000));
  const payment={tenantId,date:dateIso,amount:Number(amount||0),method,reference,receiptNo,status:'PAID'};
  if(opts.source) payment.source=String(opts.source);
  if(opts.statementRef!=null&&opts.statementRef!=='') payment.statementRef=String(opts.statementRef);
  tenant.payments=tenant.payments||[];
  const tp={id:payId,amount:Number(amount||0),date:dateIso,method,receiptNo,status:'paid'};
  if(opts.source) tp.source=String(opts.source);
  tenant.payments.unshift(tp);
  paymentsData.unshift(payment);
  const s=(typeof getSession==='function')?getSession():null;
  if(s?.role==='tenant'){
    notifyLandlordPaymentReceived?.(tenant, payment);
  }
  if(window.nestiqUseFirestore && window.nestiqDb){
    try{
      const uid = (window.currentUser && window.currentUser.uid) ? String(window.currentUser.uid) : null;
      const landlordId = String(tenant.landlordId || uid || '');
      window.nestiqFs.payments(window.nestiqDb, landlordId).add({
        tenantId: String(tenant.id),
        tenantUid: tenant.portalUid || null,
        landlordId,
        propertyId: tenant.propertyId || '',
        amount: Number(amount||0),
        date: dateIso,
        method,
        reference: reference || '',
        receiptNo,
        month: new Date(dateIso).toLocaleString('en-ZA', { month:'long', year:'numeric' }),
        status: 'paid',
        recordedBy: 'landlord',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.error('recordPayment firestore', e));
      window.nestiqFs.tenants(window.nestiqDb, landlordId).doc(String(tenant.id)).update({
        status: 'paid',
        lastPaymentDate: dateIso
      }).catch(e => console.error('tenant status update', e));
    }catch(e){
      console.error('recordPayment fire', e);
    }
  }else{
    saveData();
  }
  if(opts.silent){
    syncTenantStatuses?.();
    renderTenants?.();
    renderHomeStats?.();
    refreshNestiqCalendar?.();
    return payment;
  }
  generateRentReceiptPDF(payment);
  showPaymentSuccessModal(tenant, payment, Boolean(opts.emailReceipt));
  nestiqShowNotif('✅ Payment recorded. Receipt generated.','success');
  return payment;
}

function nestiqBindStatCounter(el, value, prefix, suffix){
  if(!el) return;
  const n=Number(value)||0;
  prefix=prefix||'';
  suffix=suffix||'';
  el.dataset.countTo=String(n);
  if(prefix) el.dataset.prefix=prefix; else delete el.dataset.prefix;
  if(suffix) el.dataset.suffix=suffix; else delete el.dataset.suffix;
  if(el.getAttribute('data-count-done')==='1'){
    if(typeof nestiqUpdateStat==='function') nestiqUpdateStat(el,n,prefix,suffix);
    else el.textContent=prefix+n.toLocaleString('en-ZA')+suffix;
    return;
  }
  el.textContent='0';
  if(typeof nestiqInitCounters==='function') nestiqInitCounters();
}

function updateHomeStats(){
  const sk=document.getElementById('homeStatsSkeleton');
  const metrics=document.getElementById('homeDashMetrics');
  if((window.nestiqPropertiesLoading||window.nestiqTenantsLoading) && !document.getElementById('statRevenue')){
    if(sk){ sk.style.display=''; nestiqShowSkeleton?.(sk,'stat',4); }
    return;
  }
  if((window.nestiqPropertiesLoading||window.nestiqTenantsLoading) && metrics && sk && !window.__nestiqHomeStatsReady){
    sk.style.display='';
    nestiqShowSkeleton?.(sk,'stat',4);
    metrics.style.display='none';
    return;
  }
  if(sk) sk.style.display='none';
  if(metrics) metrics.style.display='';
  window.__nestiqHomeStatsReady=true;
  if(typeof syncTenantStatuses==='function') syncTenantStatuses();
  const occupied=tenantsData.filter(t=>t.status!=='vacant');
  const totalRevenue=occupied.reduce((sum,t)=>sum+(Number(t.rent)||0),0);
  const totalProperties=propertiesData.length;
  const occupiedProperties=propertiesData.filter(p=>p.status==='occupied').length;
  const occupancyRate=totalProperties>0?Math.round(occupiedProperties/totalProperties*100):0;
  const activeTenants=occupied.length;
  nestiqBindStatCounter(document.getElementById('statRevenue'), totalRevenue, 'R', '');
  nestiqBindStatCounter(document.getElementById('statOccupancy'), occupancyRate, '', '%');
  nestiqBindStatCounter(document.getElementById('statTenants'), activeTenants, '', '');
}

function renderHomeStats(){
  updateHomeStats();
  const fuEl=document.getElementById('homeFollowUpsStat');
  const s=typeof getSession==='function'?getSession():null;
  if(fuEl && s?.role==='landlord'){
    nestiqBindStatCounter(fuEl, typeof nestiqFollowUpsDueCount==='function'?nestiqFollowUpsDueCount():0, '', '');
  }
  nestiqRenderHomeFollowUpsWidget?.();
  nestiqRenderHomeUnreadMessagesWidget?.();
  if(document.getElementById('nestiqLandlordDashboardHome')) nestiqRenderLandlordDashboardHome?.();
}

window.updateHomeStats=updateHomeStats;
window.renderHomeStats=renderHomeStats;

function nestiqLandlordUnreadMessages(){
  return [];
}
function nestiqLandlordUnreadMsgCount(){
  return nestiqLandlordUnreadMessages().length;
}
function nestiqLandlordUnreadForTenant(tenantId){
  return nestiqLandlordUnreadMessages().filter(m=>String(m.tenantId)===String(tenantId)).length;
}
function nestiqPaintCountBadge(el, count){
  if(!el) return;
  const n=Math.max(0,Number(count)||0);
  el.textContent=n>99?'99+':String(n);
  el.style.display=n>0?'inline-flex':'none';
}
function updateMessageBadge(count){
  const n=count==null?nestiqLandlordUnreadMsgCount():Math.max(0,Number(count)||0);
  nestiqPaintCountBadge(document.getElementById('navMessageBadge'), n);
  nestiqPaintCountBadge(document.getElementById('navMessageBadgeMobile'), n);
  document.querySelectorAll('a[href="#tenants"]').forEach(a=>{
    if(a.querySelector('#navMessageBadge, #navMessageBadgeMobile')) return;
    let b=a.querySelector('.nestiq-tenants-msg-badge');
    if(!b&&n>0){
      b=document.createElement('span');
      b.className='nav-item-badge nestiq-tenants-msg-badge';
      a.appendChild(b);
    }
    nestiqPaintCountBadge(b, n);
  });
  const viewing=window.__nestiqViewingTenantId;
  if(viewing!=null) nestiqPaintCountBadge(document.getElementById('tenantDetailMsgBadge'), nestiqLandlordUnreadForTenant(viewing));
  try{ nestiqRenderHomeUnreadMessagesWidget?.(); }catch(_e){}
  try{ nestiqRenderTenantsUnreadBanner?.(); }catch(_e){}
}
window.nestiqLandlordUnreadMessages=nestiqLandlordUnreadMessages;
window.nestiqLandlordUnreadMsgCount=nestiqLandlordUnreadMsgCount;
window.nestiqLandlordUnreadForTenant=nestiqLandlordUnreadForTenant;
window.updateMessageBadge=updateMessageBadge;

function nestiqRenderHomeUnreadMessagesWidget(){
  let sec=document.getElementById('homeUnreadMsgsSection');
  if(!sec){
    const page=document.getElementById('page-home');
    if(!page) return;
    sec=document.createElement('section');
    sec.className='section';
    sec.id='homeUnreadMsgsSection';
    sec.style.cssText='display:none;max-width:960px;margin:0 auto;padding-top:0;padding-bottom:24px';
    sec.innerHTML='<div id="homeUnreadMsgsWidget"></div>';
    const after=document.getElementById('homeFollowUpsSection')||document.getElementById('gettingStarted')?.closest?.('section');
    if(after&&after.parentNode) after.parentNode.insertBefore(sec, after.nextSibling);
    else page.insertBefore(sec, page.firstChild);
  }
  const w=document.getElementById('homeUnreadMsgsWidget');
  if(!w) return;
  const s=typeof getSession==='function'?getSession():null;
  if(s&&s.role&&s.role!=='landlord'){ sec.style.display='none'; return; }
  const unread=nestiqLandlordUnreadMessages();
  if(!unread.length){ sec.style.display='none'; return; }
  const byTenant=new Map();
  unread.forEach(m=>{
    const id=String(m.tenantId||'');
    if(!id) return;
    const row=byTenant.get(id)||{id,count:0,preview:'',date:''};
    row.count+=1;
    const dt=String(m.date||'');
    if(!row.date||dt>row.date){
      row.date=dt;
      row.preview=String(m.message||'New message');
      row.fromName=String(m.fromName||'');
    }
    byTenant.set(id,row);
  });
  const tenants=Array.isArray(window.tenantsData)?window.tenantsData:[];
  const esc=s=>String(s||'').replace(/</g,'&lt;');
  sec.style.display='block';
  w.innerHTML=`
    <div class="followup-home-card nestiq-unread-msgs-card">
      <div class="followup-home-title">Caretaker inbox</div>
      <p class="followup-home-sub">Tenants message the assigned caretaker. You can view the thread — replies are caretaker-only.</p>
      <div class="followup-home-list">${[...byTenant.values()].map(row=>{
        const t=tenants.find(x=>String(x.id)===row.id);
        const name=esc(t?.name||row.fromName||'Tenant');
        const tidArg=typeof nestiqHtmlJsArg==='function'?nestiqHtmlJsArg(row.id):JSON.stringify(row.id);
        return `<div class="followup-home-row">
          <div>
            <div class="followup-home-tenant">${name}</div>
            <div class="followup-home-prop">${esc(t?.unit||'')} · ${esc(t?.property||'')}</div>
            <div class="followup-home-subj">${esc(row.preview).slice(0,120)}</div>
          </div>
          <button type="button" class="btn-outline btn-sm" onclick="showPage('tenants');openLandlordTenantMessages(${tidArg})">View thread <span class="nav-item-badge" style="display:inline-flex">${row.count>99?'99+':row.count}</span></button>
        </div>`;
      }).join('')}</div>
    </div>`;
}
window.nestiqRenderHomeUnreadMessagesWidget=nestiqRenderHomeUnreadMessagesWidget;

function renderGettingStarted(){
  const hasProperties=propertiesData.length>0;
  const hasTenants=tenantsData.length>0;
  const hasProfile=String(landlordSettings?.name||'').trim()!=='';
  if(hasProperties && hasTenants){
    const gs=document.getElementById('gettingStarted');
    if(gs) gs.style.display='none';
    return;
  }
  const gsEl=document.getElementById('gettingStarted');
  if(!gsEl) return;
  gsEl.style.display='block';
  const steps=[
    {done:hasProfile,icon:'👤',title:'Set up your profile',desc:'Add your name, company and contact details',action:"showPage('settings')",btnText:'Go to Settings'},
    {done:hasProperties,icon:'🏠',title:'Add your first property',desc:'Enter your rental property details',action:"openModal('addProperty');nestiqOpenModalAnimated()",btnText:'Add Property'},
        {done:hasTenants,icon:'👥',title:'Approve your first tenant',desc:'They apply from Browse listings — you review Applications',action:"showPage('listings')",btnText:'Browse listings'},
    {done:false,icon:'💳',title:'Record your first payment',desc:'Log a rent payment to start tracking income',action:"showPage('tenants')",btnText:'Go to Tenants'}
  ];
  gsEl.innerHTML=`
    <div style="
      background: var(--card-bg);
      border-radius: var(--radius);
      padding: 36px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      margin-bottom: 32px;
    ">
      <div style="
        font-family: 'Playfair Display', serif;
        font-size: 1.3rem;
        font-weight: 700;
        margin-bottom: 6px;
      ">
        Welcome to NestIQ Pro 👋
      </div>
      <div style="
        font-size: 0.88rem;
        color: var(--muted);
        margin-bottom: 28px;
      ">
        Complete these steps to get started
      </div>
      <div style="
        display: flex;
        flex-direction: column;
        gap: 14px;
      ">
        ${steps.map((step)=>`
          <div style="
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: var(--paper);
            border-radius: 12px;
            border: 1px solid ${step.done?'var(--sage)':'var(--border)'};
            opacity: ${step.done?'0.6':'1'};
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: ${step.done?'rgba(90,122,96,0.15)':'rgba(201,168,76,0.12)'};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.2rem;
              flex-shrink: 0;
            ">
              ${step.done?'✅':step.icon}
            </div>
            <div style="flex: 1">
              <div style="
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--ink);
                ${step.done?'text-decoration: line-through;':''}
              ">
                ${step.title}
              </div>
              <div style="
                font-size: 0.78rem;
                color: var(--muted);
                margin-top: 2px;
              ">
                ${step.desc}
              </div>
            </div>
            ${!step.done?`
              <button
                class="btn-primary btn-sm"
                onclick="${step.action}"
              >
                ${step.btnText}
              </button>
            `:''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
window.renderGettingStarted=renderGettingStarted;

function nestiqRenderHomeDashProps(){
  const host=document.getElementById('homeDashProps');
  if(!host) return;
  const list=(propertiesData||[]).slice(0,3);
  if(!list.length){
    host.innerHTML='<div class="dash-prop-item" style="opacity:.65"><div class="prop-icon-sm" style="background:rgba(14,17,23,0.06)">🏠</div><div style="flex:1"><div class="prop-name-sm">No properties yet</div><div class="prop-addr-sm">Add a property to see it here</div></div><span class="badge badge-amber">—</span></div>';
    return;
  }
  const badgeFor=st=>{
    if(st==='occupied') return 'badge-green';
    if(st==='vacant') return 'badge-red';
    return 'badge-amber';
  };
  const labelFor=st=>{
    if(st==='occupied') return 'Occupied';
    if(st==='vacant') return 'Vacant';
    return 'Due Soon';
  };
  host.innerHTML=list.map(p=>{
    const st=(p?.status in {occupied:1,vacant:1,due:1})?p.status:'vacant';
    const addr=String(p?.addr||'').split(',')[0]||'—';
    const ic=String(p?.icon||'🏠');
    return`<div class="dash-prop-item"><div class="prop-icon-sm" style="background:rgba(201,168,76,0.12)">${ic}</div><div style="flex:1"><div class="prop-name-sm">${String(p?.name||'Property')}</div><div class="prop-addr-sm">${addr}</div></div><span class="badge ${badgeFor(st)}">${labelFor(st)}</span></div>`;
  }).join('');
}
window.nestiqRenderHomeDashProps=nestiqRenderHomeDashProps;

function showPaymentSuccessModal(tenant, payment, shouldEmailReceipt){
  document.getElementById('modalContent').innerHTML=`
    <h2 class="modal-title">Payment Recorded</h2>
    <p class="modal-sub">${tenant.name} · ${fmtMoneyZAR(payment.amount)} · ${payment.receiptNo}</p>
    <div style="font-size:0.84rem;color:var(--muted);margin-top:6px">Email receipt to ${tenant.name}?</div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn-outline btn-sm" onclick="generateRentReceiptPDF(${JSON.stringify(payment).replace(/"/g,'&quot;')})">Download Receipt PDF</button>
      <button class="btn-primary btn-sm" onclick="emailReceiptNow(${JSON.stringify(tenant.id)},'${payment.receiptNo}')">Yes, Email Receipt</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">No thanks</button>
      <button class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Done</button>
    </div>
  `;
  nestiqOpenModalAnimated();
  if(shouldEmailReceipt){
    emailReceiptNow(tenant.id, payment.receiptNo);
  }
}

async function emailReceiptNow(tenantId, receiptNo){
  const tenant=getTenantById(tenantId);
    const payment=(paymentsData||[]).find(p=>String(p.tenantId)===String(tenantId) && p.receiptNo===receiptNo);
  if(!tenant||!payment) return;
  if(!isEmailConfigured()){
    nestiqShowNotif('Configure EmailJS in Settings to enable email notifications','warning');
    return;
  }
  try{
    await sendReceiptEmail(tenant, payment);
    nestiqShowNotif(`📧 Receipt emailed to ${tenant.name}`,'success');
  }catch(err){
    nestiqShowNotif(err?.message||'Receipt email failed','error');
  }
}

// Expose for inline buttons / future UI hooks
window.recordPayment=recordPayment;
window.emailReceiptNow=emailReceiptNow;
window.formatWhatsAppNumber=formatWhatsAppNumber;
window.whatsappTemplates=whatsappTemplates;
window.openWhatsAppChat=openWhatsAppChat;
window.getTenantDaysOverdue=getTenantDaysOverdue;
window.whatsappIconSvg=whatsappIconSvg;


