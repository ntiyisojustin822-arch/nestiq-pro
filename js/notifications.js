function showNotif(msg,type,duration){
  if(typeof nestiqShowNotif==='function') return nestiqShowNotif(msg,type,duration);
}

let systemNotifLog=[];
let notifSentLog={};
let notifSettings={
  overdueRent:true,
  leaseExpiry:true,
  maintenanceNew:true,
  paymentReceived:true,
  dailySummary:true,
  lowOccupancy:true,
  leaseExpiryWarningDays:90,
  overdueAfterDays:1,
  lowOccupancyThreshold:80
};
let activeBellTab='inapp';
let notifHourlyTimer=null;
let notifDailyTimer=null;

function isSafariBrowser(){
  const ua=navigator.userAgent||'';
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
}
function supportsBrowserNotification(){
  return typeof window!=='undefined' && 'Notification' in window && !isSafariBrowser();
}

function loadNotificationState(){
  try{
    systemNotifLog=JSON.parse(localStorage.getItem('notificationLog')||'[]');
    notifSentLog=JSON.parse(localStorage.getItem('nestiq-notif-log')||'{}');
    const saved=JSON.parse(localStorage.getItem('nestiq-notification-settings')||'{}');
    const alt=JSON.parse(localStorage.getItem('nestiq-notif-settings')||'{}');
    notifSettings={...notifSettings,...saved,...alt};
  }catch(_err){}
}
function saveNotificationState(){
  localStorage.setItem('notificationLog', JSON.stringify(systemNotifLog||[]));
  localStorage.setItem('nestiq-notif-log', JSON.stringify(notifSentLog||{}));
  const payload=JSON.stringify(notifSettings||{});
  localStorage.setItem('nestiq-notification-settings', payload);
  localStorage.setItem('nestiq-notif-settings', payload);
}
function logSystemNotification(title,body){
  systemNotifLog.unshift({id:Date.now(),title,body,timestamp:new Date().toISOString(),read:false});
  if(systemNotifLog.length>100) systemNotifLog=systemNotifLog.slice(0,100);
  saveNotificationState();
  if(typeof nestiqShakeNotifBell==='function') nestiqShakeNotifBell();
}
function canSendByTag(tag,minMs){
  const last=Number(notifSentLog[tag]||0);
  return Date.now()-last>=minMs;
}
function rememberSent(tag){
  notifSentLog[tag]=Date.now();
  saveNotificationState();
}

function sendBrowserNotif(title, body, options={}){
  if(!supportsBrowserNotification()) return false;
  if(Notification.permission!=='granted') return false;
  try{
    const n=new Notification(title,{
      body,
      icon:'icons/icon-192.png',
      badge:'icons/icon-192.png',
      tag:options.tag||'nestiq',
      requireInteraction:Boolean(options.requireInteraction),
      data:options.data||{}
    });
    n.onclick=()=>{
      window.focus();
      const route=n.data?.route;
      if(route && typeof showPage==='function') showPage(route);
      n.close();
      markSystemNotifReadByTag(options.tag||'nestiq');
    };
    logSystemNotification(title, body);
    renderBell();
    return true;
  }catch(_err){
    return false;
  }
}

function renderBellTabs(){
  const dd=document.getElementById('bellDropdown');
  if(!dd) return;
  const existingTabs=dd.querySelector('#bellTabs');
  const existingSystem=dd.querySelector('#bellSystemWrap');
  if(!existingTabs){
    const header=dd.querySelector('.bell-header');
    if(header){
      header.innerHTML=`<span>Notifications</span><span class="bell-clear" onclick="clearBellNotifs()">Clear all</span>`;
    }
    const tabs=document.createElement('div');
    tabs.id='bellTabs';
    tabs.style.cssText='display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)';
    tabs.innerHTML=`
      <button id="bellTabInApp" class="btn-outline btn-sm" style="padding:5px 10px" onclick="switchBellTab('inapp')">In-App</button>
      <button id="bellTabSystem" class="btn-outline btn-sm" style="padding:5px 10px" onclick="switchBellTab('system')">System</button>
    `;
    dd.insertBefore(tabs, dd.querySelector('#bellList'));
  }
  if(!existingSystem){
    const wrap=document.createElement('div');
    wrap.id='bellSystemWrap';
    wrap.className='bell-list';
    wrap.style.display='none';
    dd.appendChild(wrap);
  }
}

function renderSystemBell(){
  const list=document.getElementById('bellSystemWrap');
  if(!list) return;
  const items=(systemNotifLog||[]).slice(0,20);
  if(!items.length){
    list.innerHTML='<div class="bell-empty">No system notifications</div>';
    return;
  }
  list.innerHTML=`
    <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:flex-end">
      <button class="btn-outline btn-sm" style="padding:4px 10px" onclick="clearSystemNotifs()">Clear all</button>
    </div>
    ${items.map(n=>`
      <div class="bell-item ${n.read?'':'unread'}" onclick="markSystemNotifRead(${n.id})">
        <div class="bell-item-icon">🖥️</div>
        <div>
          <div class="bell-item-text"><strong>${n.title}</strong></div>
          <div class="bell-item-text" style="font-size:0.76rem">${n.body}</div>
          <div class="bell-item-time">${new Date(n.timestamp).toLocaleString('en-ZA')}</div>
        </div>
      </div>
    `).join('')}
  `;
}

function renderBell(){
  renderBellTabs();
  const unreadInApp=bellNotifs.filter(n=>n.unread).length;
  const unreadSystem=systemNotifLog.filter(n=>!n.read).length;
  const unread=unreadInApp+unreadSystem;
  const fu=typeof nestiqFollowUpsDueCount==='function'?nestiqFollowUpsDueCount():0;
  const fuBadge=document.getElementById('bellFollowUpBadge');
  if(fuBadge){
    fuBadge.textContent=fu>9?'9+':String(fu);
    fuBadge.style.display=fu>0?'flex':'none';
  }
  const cnt=document.getElementById('bellCount');
  if(cnt){
    cnt.textContent=unread;
    cnt.classList.toggle('show', unread>0);
  }
  const list=document.getElementById('bellList');
  if(list){
    if(bellNotifs.length===0){
      list.innerHTML='<div class="bell-empty">No notifications</div>';
    }else{
      list.innerHTML=bellNotifs.map(n=>`
        <div class="bell-item ${n.unread?'unread':''}" onclick="markBellRead(${n.id}); try{ ${n.onClickExtra||''} }catch(_e){}">
          <div class="bell-item-icon">${n.icon}</div>
          <div><div class="bell-item-text">${n.text}</div><div class="bell-item-time">${n.time}</div></div>
        </div>`).join('');
    }
  }
  renderSystemBell();
  switchBellTab(activeBellTab);
}
function switchBellTab(tab){
  activeBellTab=tab;
  const inApp=document.getElementById('bellList');
  const sys=document.getElementById('bellSystemWrap');
  const b1=document.getElementById('bellTabInApp');
  const b2=document.getElementById('bellTabSystem');
  if(inApp) inApp.style.display=tab==='inapp'?'block':'none';
  if(sys) sys.style.display=tab==='system'?'block':'none';
  if(b1){ b1.classList.toggle('btn-primary',tab==='inapp'); b1.classList.toggle('btn-outline',tab!=='inapp'); }
  if(b2){ b2.classList.toggle('btn-primary',tab==='system'); b2.classList.toggle('btn-outline',tab!=='system'); }
}
function toggleBell(){
  const dd=document.getElementById('bellDropdown');
  if(!dd) return;
  dd.classList.toggle('open');
  renderBell();
}
function markBellRead(id){bellNotifs=bellNotifs.map(n=>n.id===id?{...n,unread:false}:n);renderBell();}
function markSystemNotifRead(id){systemNotifLog=systemNotifLog.map(n=>n.id===id?{...n,read:true}:n);saveNotificationState();renderBell();}
function markSystemNotifReadByTag(_tag){ systemNotifLog=systemNotifLog.map((n,idx)=>idx===0?{...n,read:true}:n); saveNotificationState(); renderBell(); }
function clearSystemNotifs(){ systemNotifLog=[]; saveNotificationState(); renderBell(); }
function clearBellNotifs(){bellNotifs=[];renderBell();document.getElementById('bellDropdown')?.classList.remove('open');}
function nestiqShakeNotifBell(){
  const bell=document.getElementById('notifBell')
    || document.querySelector('.notif-bell')
    || document.querySelector('.notif-bell-btn')
    || document.querySelector('#bellWrap .notif-bell-btn');
  if(!bell) return;
  bell.style.animation='none';
  void bell.offsetWidth;
  bell.style.animation='nq-shake 0.45s ease';
  bell.addEventListener('animationend',()=>{ bell.style.animation=''; },{once:true});
}

function addBellNotif(icon,text,onClickExtra){
  bellNotifs.unshift({id:Date.now(),icon,text,time:'Just now',unread:true,onClickExtra:onClickExtra||''});
  renderBell();
  nestiqShakeNotifBell();
}

function notifBannerHtml(){
  return `
    <div id="notifPermBanner" style="position:fixed;left:16px;right:16px;bottom:16px;z-index:7100;background:var(--ink);color:var(--paper);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="font-size:0.86rem">Enable notifications to get rent reminders and important alerts</div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-gold btn-sm" onclick="enableBrowserNotifications()">Enable Notifications</button>
          <button class="btn-outline btn-sm" onclick="dismissNotifPermissionBanner()">Not Now</button>
        </div>
      </div>
    </div>
  `;
}
function showNotifPermissionBannerIfNeeded(){
  if(!supportsBrowserNotification()) return;
  if(localStorage.getItem('nestiq-notifications-asked')==='true') return;
  if(Notification.permission==='denied' || Notification.permission==='granted') return;
  if(document.getElementById('notifPermBanner')) return;
  document.body.insertAdjacentHTML('beforeend', notifBannerHtml());
}
function dismissNotifPermissionBanner(){
  document.getElementById('notifPermBanner')?.remove();
  localStorage.setItem('nestiq-notifications-asked','true');
}
async function enableBrowserNotifications(){
  if(!supportsBrowserNotification()){ dismissNotifPermissionBanner(); return; }
  try{
    const res=await Notification.requestPermission();
    dismissNotifPermissionBanner();
    if(res==='granted'){
      nestiqShowNotif('Notifications enabled','success');
      sendBrowserNotif('NestIQ Pro','Notifications are now enabled',{tag:'enabled'});
    }
  }catch(_err){
    dismissNotifPermissionBanner();
  }
}

function settingOn(key){
  return Boolean(notifSettings[key]);
}
function maybeSend(tag,minMs,title,body,options={}){
  if(!canSendByTag(tag,minMs)) return false;
  const ok=sendBrowserNotif(title,body,{...options,tag});
  if(ok) rememberSent(tag);
  return ok;
}

function runLandlordNotificationChecks(){
  if(typeof getSession!=='function') return;
  const s=getSession();
  if(s?.role!=='landlord') return;
  const now=new Date();
  const ym=now.toISOString().slice(0,7);
  const overdueAfter=Math.max(1,Number(notifSettings.overdueAfterDays)||1);
  const leaseWarnDays=Math.max(1,Number(notifSettings.leaseExpiryWarningDays)||90);
  if(settingOn('overdueRent')){
    tenantsData.forEach(t=>{
      if(String(t.status)==='vacant') return;
      const dueDay=Math.max(1,Math.min(28,Number(t.monthlyDueDate||1)));
      const dueDate=new Date(now.getFullYear(),now.getMonth(),dueDay);
      const paid=(t.payments||[]).some(p=>String(p.date||'').slice(0,7)===ym);
      if(!paid && now>dueDate){
        const days=Math.ceil((now-dueDate)/86400000);
        if(days>=overdueAfter){
          maybeSend(`overdue-${t.id}`,24*60*60*1000,'Rent Overdue',`${t.name} - ${t.property} is ${days} days overdue (R${Number(t.rent||0).toLocaleString('en-ZA')})`,{data:{route:'tenants'}});
        }
      }
    });
  }
  if(settingOn('leaseExpiry')){
    tenantsData.forEach(t=>{
      const end=new Date(t.leaseEnd||t.lease||'');
      if(String(end)==='Invalid Date') return;
      const days=Math.ceil((end-now)/86400000);
      if(days>=0 && days<=leaseWarnDays){
        maybeSend(`lease-${t.id}`,7*24*60*60*1000,'Lease Expiring Soon',`${t.name} - ${t.property} lease expires in ${days} days`,{data:{route:'tenants'}});
      }
    });
  }
  if(settingOn('lowOccupancy') && Array.isArray(propertiesData) && propertiesData.length){
    const total=propertiesData.length;
    const occ=propertiesData.filter(p=>String(p.status).toLowerCase()==='occupied').length;
    const pct=Math.round((occ/Math.max(1,total))*100);
    const threshold=Math.min(100,Math.max(0,Number(notifSettings.lowOccupancyThreshold)));
    if(pct<threshold){
      maybeSend('low-occupancy-portfolio',7*24*60*60*1000,'Low portfolio occupancy',`Occupancy is ${pct}% (below ${threshold}% threshold).`,{data:{route:'properties'}});
    }
  }
}

function runTenantNotificationChecks(){
  if(typeof getSession!=='function') return;
  const s=getSession();
  if(s?.role!=='tenant') return;
  const t=tenantsData.find(x=>x.id===s.userId);
  if(!t) return;
  const now=new Date();
  const ym=now.toISOString().slice(0,7);
  const dueDay=Math.max(1,Math.min(28,Number(t.monthlyDueDate||1)));
  const dueDate=new Date(now.getFullYear(),now.getMonth(),dueDay);
  const hasPaid=(t.payments||[]).some(p=>String(p.date||'').slice(0,7)===ym);
  const days=Math.ceil((dueDate-now)/86400000);
  if(settingOn('overdueRent')){
    if(!hasPaid && days===3){
      maybeSend(`due-${ym}`,30*24*60*60*1000,'Rent Due Soon',`Your rent of R${Number(t.rent||0).toLocaleString('en-ZA')} for ${t.property} is due in 3 days`,{data:{route:'tenant-dashboard'}});
    }else if(!hasPaid && now>dueDate){
      const overdueDays=Math.ceil((now-dueDate)/86400000);
      maybeSend(`overdue-${ym}`,24*60*60*1000,'Rent Overdue',`Your rent of R${Number(t.rent||0).toLocaleString('en-ZA')} was due ${overdueDays} days ago. Please pay now.`,{requireInteraction:true,data:{route:'tenant-dashboard'}});
    }
  }
  if(settingOn('leaseExpiry')){
    const end=new Date(t.leaseEnd||t.lease||'');
    const leaseDays=Math.ceil((end-now)/86400000);
    if(leaseDays===60){
      maybeSend(`lease-expiry-${t.id}`,365*24*60*60*1000,'Lease Expiring','Your lease expires in 60 days. Message your caretaker to discuss renewal.',{data:{route:'tenant-dashboard'}});
    }
  }
}

function computeLandlordDailySummary(){
  const now=new Date();
  const ym=now.toISOString().slice(0,7);
  const paid=tenantsData.filter(t=>(t.payments||[]).some(p=>String(p.date||'').slice(0,7)===ym)).length;
  const overdue=tenantsData.filter(t=>String(t.status)==='overdue').length;
  const open=maintenanceData.filter(m=>m.status==='open').length;
  if((paid+overdue+open)===0) return null;
  return `${paid} tenants paid this month. ${overdue} overdue. ${open} maintenance open.`;
}
function scheduleDailySummary(){
  if(notifDailyTimer) clearTimeout(notifDailyTimer);
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='landlord' || !settingOn('dailySummary')) return;
  const now=new Date();
  const next=new Date();
  next.setHours(9,0,0,0);
  if(now>=next) next.setDate(next.getDate()+1);
  const wait=next-now;
  notifDailyTimer=setTimeout(()=>{
    const body=computeLandlordDailySummary();
    if(body) maybeSend(`daily-summary-${new Date().toISOString().slice(0,10)}`,20*60*60*1000,'NestIQ Daily Summary',body,{data:{route:'home'}});
    scheduleDailySummary();
  },wait);
}

function runBrowserNotificationChecks(){
  runLandlordNotificationChecks();
  runTenantNotificationChecks();
}
function initBrowserNotificationChecks(){
  if(notifHourlyTimer) clearInterval(notifHourlyTimer);
  runBrowserNotificationChecks();
  notifHourlyTimer=setInterval(runBrowserNotificationChecks,60*60*1000);
  scheduleDailySummary();
}

function initNotificationsForSession(){
  loadNotificationState();
  renderBell();
  showNotifPermissionBannerIfNeeded();
  initBrowserNotificationChecks();
}

function notifyLandlordMaintenanceRequest(req){
  if(!settingOn('maintenanceNew')) return;
  maybeSend(`maint-${req.id}`,1000,'New Maintenance Request',`${req.tenantName||'Tenant'} from ${req.property}: ${req.title}`,{data:{route:'maintenance'}});
}
function notifyLandlordPaymentReceived(tenant,payment){
  if(!settingOn('paymentReceived')) return;
  maybeSend(`payment-${payment.id||payment.receiptNo||Date.now()}`,1000,'Payment Received',`${tenant.name} paid R${Number(payment.amount||0).toLocaleString('en-ZA')} for ${tenant.property}`,{data:{route:'tenants'}});
}
function notifyTenantNewNotice(notice){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='tenant') return;
  if(notice.targetTenantId!=null && notice.targetTenantId!==s.userId) return;
  maybeSend(`notice-${notice.id}`,1000,'New Notice from Landlord',`${notice.title}`,{data:{route:'tenant-dashboard'}});
}
function notifyTenantMaintenanceUpdate(req){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='tenant' || s.userId!==req.tenantId) return;
  maybeSend(`maint-update-${req.id}`,1000,'Maintenance Update',`Your request (${req.title}) is now ${req.status}`,{data:{route:'tenant-dashboard'}});
}
function notifyTenantNewMessage(msg){
  const s=typeof getSession==='function'?getSession():null;
  if(s?.role!=='tenant' || s.userId!==msg.tenantId || msg.fromRole!=='caretaker') return;
  maybeSend(`message-${msg.id}`,1000,'New Message','Your caretaker sent you a message',{data:{route:'tenant-dashboard'}});
}
function sendTestBrowserNotification(){
  const ok=sendBrowserNotif('NestIQ Pro','Notifications are working correctly',{tag:'nestiq-test',data:{route:'settings'}});
  if(!ok) nestiqShowNotif('Enable browser notifications first','warning');
}
function disableAllNotificationSettings(){
  Object.keys(notifSettings).forEach(k=>{
    if(typeof notifSettings[k]==='boolean') notifSettings[k]=false;
  });
  saveNotificationState();
  if(typeof renderSettings==='function') renderSettings();
  nestiqShowNotif('All notification toggles disabled','success');
}

document.addEventListener('click',e=>{
  const bw=document.getElementById('bellWrap');
  if(!bw) return;
  if(!bw.contains(e.target)) {
    const dd=document.getElementById('bellDropdown');
    if(dd) dd.classList.remove('open');
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    runBrowserNotificationChecks();
  }
});

function hydrateNotificationFieldsFromSettings(settings){
  if(!settings||typeof settings!=='object') return;
  if(Array.isArray(settings.notificationLog)) systemNotifLog=settings.notificationLog;
  if(settings.nestiqNotifLog&&typeof settings.nestiqNotifLog==='object') notifSentLog=settings.nestiqNotifLog;
  else if(settings.notifSentLog&&typeof settings.notifSentLog==='object') notifSentLog=settings.notifSentLog;
  const ns=settings.nestiqNotificationSettings||settings.notificationSettings;
  if(ns&&typeof ns==='object') notifSettings={...notifSettings,...ns};
}
function exportNotificationLogForFirestore(){ return systemNotifLog||[]; }
function exportNestiqNotifLogForFirestore(){ return notifSentLog||{}; }
function exportNotifSettingsForFirestore(){ return notifSettings||{}; }
window.hydrateNotificationFieldsFromSettings=hydrateNotificationFieldsFromSettings;
window.exportNotificationLogForFirestore=exportNotificationLogForFirestore;
window.exportNestiqNotifLogForFirestore=exportNestiqNotifLogForFirestore;
window.exportNotifSettingsForFirestore=exportNotifSettingsForFirestore;

window.sendBrowserNotif=sendBrowserNotif;
window.switchBellTab=switchBellTab;
window.clearSystemNotifs=clearSystemNotifs;
window.markSystemNotifRead=markSystemNotifRead;
window.enableBrowserNotifications=enableBrowserNotifications;
window.dismissNotifPermissionBanner=dismissNotifPermissionBanner;
window.initNotificationsForSession=initNotificationsForSession;
window.notifyLandlordMaintenanceRequest=notifyLandlordMaintenanceRequest;
window.notifyLandlordPaymentReceived=notifyLandlordPaymentReceived;
window.notifyTenantNewNotice=notifyTenantNewNotice;
window.notifyTenantMaintenanceUpdate=notifyTenantMaintenanceUpdate;
window.notifyTenantNewMessage=notifyTenantNewMessage;
window.sendTestBrowserNotification=sendTestBrowserNotification;
window.disableAllNotificationSettings=disableAllNotificationSettings;
window.getNotificationSettings=()=>({...notifSettings});
window.setNotificationSettings=(next)=>{notifSettings={...notifSettings,...(next||{})};saveNotificationState();};

