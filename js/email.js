function emailjsCfg(){ return landlordSettings?.emailjs||{}; }
function emailTpl(){ return emailjsCfg().templates||{}; }
function monthKey(dateObj){ const y=dateObj.getFullYear(); const m=String(dateObj.getMonth()+1).padStart(2,'0'); return `${y}-${m}`; }

function isEmailConfigured(){
  const cfg=emailjsCfg();
  return Boolean(cfg.publicKey && cfg.serviceId);
}

function isEmailJsFullyConfigured(){
  const cfg=emailjsCfg();
  const t=cfg.templates||{};
  const testTo=String(cfg.testEmail||'').trim()||String(landlordSettings?.email||'').trim();
  return Boolean(
    cfg.publicKey && cfg.serviceId &&
    t.rentReminder && t.paymentReceipt && t.overdueNotice && t.leaseExpiry &&
    testTo
  );
}

function initEmailJS(){
  if(!window.emailjs || !emailjsCfg().publicKey) return false;
  try{
    window.emailjs.init(emailjsCfg().publicKey);
    return true;
  }catch(err){
    console.warn('EmailJS init error', err);
    return false;
  }
}

function pushEmailLog(entry){
  emailLog.unshift(entry);
  if(emailLog.length>50) emailLog=emailLog.slice(0,50);
  saveData();
}

function hasPaymentForTenantThisMonth(tenantId, dt=new Date()){
  const key=monthKey(dt);
  return (paymentsData||[]).some(p=>p.tenantId===tenantId && String(p.date||'').slice(0,7)===key);
}

function hasEmailLogWithin(tenantId, type, ms, scope=''){
  const now=Date.now();
  return (emailLog||[]).some(e=>{
    if(type && e.type!==type) return false;
    if(tenantId && Number(e.tenantId)!==Number(tenantId)) return false;
    if(scope && e.scope!==scope) return false;
    if(e.status!=='sent') return false;
    return (now-new Date(e.date||e.timestamp||0).getTime())<=ms;
  });
}

async function sendEmail(templateId, params, meta={}){
  if(!isEmailConfigured()){
    showNotif('Configure EmailJS in Settings to enable emails','warning');
    return false;
  }
  if(!templateId){
    showNotif('Missing template ID in Email settings','warning');
    return false;
  }
  if(!params?.to_email){
    showNotif(`No email on record for ${meta.tenantName||'tenant'}`,'error');
    return false;
  }
  initEmailJS();
  try{
    await window.emailjs.send(emailjsCfg().serviceId, templateId, params);
    pushEmailLog({
      id:Date.now(),
      date:new Date().toISOString(),
      recipient:params.to_email,
      tenantId:meta.tenantId||null,
      tenant:meta.tenantName||params.to_name||'—',
      type:meta.type||'email',
      scope:meta.scope||'',
      status:'sent'
    });
    nestiqCommDefer(()=>window.nestiqAutoLogEmail?.(meta,params));
    showNotif(`Email sent to ${meta.tenantName||params.to_name||'recipient'}`,'success');
    return true;
  }catch(err){
    pushEmailLog({
      id:Date.now(),
      date:new Date().toISOString(),
      recipient:params.to_email,
      tenantId:meta.tenantId||null,
      tenant:meta.tenantName||params.to_name||'—',
      type:meta.type||'email',
      scope:meta.scope||'',
      status:'failed'
    });
    showNotif(`Email failed: ${err?.text||err?.message||'Unknown error'}`,'error');
    return false;
  }
}

function emailParamsForTenant(tenant){
  return {
    to_email:tenant.email||'',
    to_name:tenant.name||'Tenant',
    property_name:tenant.property||'Property',
    unit:tenant.unit||'',
    amount:Number(tenant.rent||0).toLocaleString('en-ZA'),
    due_date:getTenantDueDateText(tenant),
    landlord_name:landlordSettings.name||'Landlord',
    landlord_email:landlordSettings.email||'',
    landlord_phone:landlordSettings.phone||''
  };
}

async function sendTenantEmailTemplate(tenant, kind, extra={}){
  if(!tenant?.email){ showNotif(`No email on record for ${tenant?.name||'tenant'}`,'error'); return false; }
  const templates=emailTpl();
  const map={
    rentReminder:templates.rentReminder,
    paymentReceipt:templates.paymentReceipt,
    overdueNotice:templates.overdueNotice,
    leaseExpiry:templates.leaseExpiry,
    maintenanceUpdate:templates.maintenanceUpdate,
    welcomeTenant:templates.welcomeTenant,
    customMessage:templates.customMessage
  };
  const templateId=map[kind];
  return sendEmail(templateId, {...emailParamsForTenant(tenant), ...extra}, {tenantId:tenant.id,tenantName:tenant.name,type:kind,scope:extra.scope||''});
}

async function sendRentReminderEmail(tenant, dueDateText, opts={}){
  return sendTenantEmailTemplate(tenant,'rentReminder',{due_date:dueDateText||getTenantDueDateText(tenant), scope:opts.scope||monthKey(new Date())});
}
async function sendReceiptEmail(tenant, payment){
  return sendTenantEmailTemplate(tenant,'paymentReceipt',{
    amount:Number(payment?.amount||0).toLocaleString('en-ZA'),
    date:isoToPretty(payment?.date),
    method:payment?.method||'EFT',
    receipt_no:payment?.receiptNo||'',
    scope:payment?.receiptNo||''
  });
}
async function sendOverdueEmail(tenant, daysOverdue){
  return sendTenantEmailTemplate(tenant,'overdueNotice',{days_overdue:String(daysOverdue||0),scope:monthKey(new Date())});
}
async function sendLeaseExpiryEmail(tenant, daysRemaining){
  return sendTenantEmailTemplate(tenant,'leaseExpiry',{lease_end:isoToPretty(tenant.leaseEnd||tenant.lease),days_remaining:String(daysRemaining||0),scope:String(tenant.leaseEnd||tenant.lease)});
}
async function sendMaintenanceUpdateEmail(tenant, req, oldStatus, newStatus){
  return sendTenantEmailTemplate(tenant,'maintenanceUpdate',{issue_title:req?.title||'Maintenance Issue',old_status:oldStatus||'',new_status:newStatus||'',scope:String(req?.id||Date.now())});
}
async function sendWelcomeEmail(tenant){
  return sendTenantEmailTemplate(tenant,'welcomeTenant',{scope:String(tenant.id)});
}
async function sendCustomEmail(tenant, subject, message){
  return sendTenantEmailTemplate(tenant,'customMessage',{subject:subject||'Message from landlord',message:message||'',scope:String(Date.now())});
}

async function sendTestEmailToLandlord(){
  const to=String(landlordSettings?.emailjs?.testEmail||'').trim()||String(landlordSettings?.email||'').trim();
  if(!to){
    showNotif('Enter a test email address or save your landlord email','warning');
    return false;
  }
  const templateId=emailTpl().customMessage||emailTpl().rentReminder||emailTpl().welcomeTenant||emailTpl().paymentReceipt;
  return sendEmail(templateId, {
    to_email:to,
    to_name:landlordSettings.name||'Landlord',
    subject:'NestIQ Pro — Email Test',
    message:'Your EmailJS integration is working correctly.',
    landlord_name:landlordSettings.name||'Landlord',
    property_name:'NestIQ Test Property',
    unit:'Test Unit',
    amount:'0',
    due_date:new Date().toLocaleDateString('en-ZA')
  }, {tenantName:'Landlord',type:'test',scope:'test'});
}

async function runAutomatedEmailChecks(){
  const now=new Date();
  for(const tenant of tenantsData){
    if(!tenant?.email || tenant.status==='vacant') continue;
    const dueDay=Math.max(1,Math.min(28, Number(tenant.monthlyDueDate||1)));
    const dueDate=new Date(now.getFullYear(),now.getMonth(),dueDay);
    const monthScope=monthKey(now);
    const paid=hasPaymentForTenantThisMonth(tenant.id, now);

    if(now.getDate()===Math.max(1,dueDay-3) && !paid && !hasEmailLogWithin(tenant.id,'rentReminder',31*24*60*60*1000,monthScope)){
      await sendRentReminderEmail(tenant, getTenantDueDateText(tenant), {scope:monthScope});
    }
    if(now>dueDate){
      const daysOver=Math.ceil((now-dueDate)/86400000);
      if(!hasEmailLogWithin(tenant.id,'overdueNotice',24*60*60*1000)){
        await sendOverdueEmail(tenant, daysOver);
      }
    }
    const leaseEnd=new Date(tenant.leaseEnd||tenant.lease||'');
    if(String(leaseEnd)!=='Invalid Date'){
      const daysRemaining=Math.ceil((leaseEnd-now)/86400000);
      if(daysRemaining===30 && !hasEmailLogWithin(tenant.id,'leaseExpiry',400*24*60*60*1000,String(tenant.leaseEnd||tenant.lease))){
        await sendLeaseExpiryEmail(tenant, daysRemaining);
      }
    }
  }
}

let __emailAutomationStarted=false;
function startEmailAutomation(){
  if(__emailAutomationStarted) return;
  __emailAutomationStarted=true;
  runAutomatedEmailChecks().catch(()=>{});
  setInterval(()=>runAutomatedEmailChecks().catch(()=>{}),24*60*60*1000);
}

window.isEmailConfigured=isEmailConfigured;
window.isEmailJsFullyConfigured=isEmailJsFullyConfigured;
window.initEmailJS=initEmailJS;
window.sendEmail=sendEmail;
window.sendRentReminderEmail=sendRentReminderEmail;
window.sendReceiptEmail=sendReceiptEmail;
window.sendOverdueEmail=sendOverdueEmail;
window.sendLeaseExpiryEmail=sendLeaseExpiryEmail;
window.sendMaintenanceUpdateEmail=sendMaintenanceUpdateEmail;
window.sendWelcomeEmail=sendWelcomeEmail;
window.sendCustomEmail=sendCustomEmail;
window.sendTenantEmailTemplate=sendTenantEmailTemplate;
window.sendTestEmailToLandlord=sendTestEmailToLandlord;
window.runAutomatedEmailChecks=runAutomatedEmailChecks;
window.runAutomatedRentReminderCheck=runAutomatedEmailChecks;
window.startEmailAutomation=startEmailAutomation;
