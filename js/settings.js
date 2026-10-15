let __pendingLandlordLogo=null;

function applySettingsPageRoleVisibility(){
  const s=typeof getSession==='function'?getSession():null;
  const isTenant=s?.role==='tenant';
  document.querySelectorAll('[data-settings-landlord-only]').forEach(el=>{
    el.style.display=isTenant?'none':'';
  });
  const acL=document.getElementById('nestiqAccountCardLandlord');
  const acT=document.getElementById('nestiqAccountCardTenant');
  if(acL) acL.style.display=isTenant?'none':'';
  if(acT) acT.style.display=isTenant?'block':'none';
  const back=document.getElementById('settingsTenantBack');
  if(back) back.style.display=isTenant?'inline-flex':'none';
}

function syncSettingsDarkLabels(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const light=document.getElementById('settings_mode_light');
  const dark=document.getElementById('settings_mode_dark');
  if(light){
    light.style.fontWeight=isDark?'400':'600';
    light.style.color=isDark?'var(--muted)':'inherit';
  }
  if(dark){
    dark.style.fontWeight=isDark?'600':'400';
    dark.style.color=isDark?'inherit':'var(--muted)';
  }
}

function settingsToggleDarkFromPage(){
  toggleDark();
  syncSettingsDarkLabels();
}

function updateLandlordLogoPreview(b64){
  const wrap=document.getElementById('landlord_logo_preview_wrap');
  const img=document.getElementById('landlord_logo_preview');
  const src=b64||landlordSettings?.logoBase64||'';
  if(wrap && img){
    if(src){
      img.src=src;
      wrap.style.display='block';
    }else{
      wrap.style.display='none';
      img.removeAttribute('src');
    }
  }
}

function handleLandlordLogoPick(e){
  const f=e.target.files?.[0];
  if(!f) return;
  if(typeof compressImage!=='function'){ nestiqShowNotif('Image tools not loaded','error'); return; }
  compressImage(f,200,0.82,(b64)=>{
    __pendingLandlordLogo=b64;
    updateLandlordLogoPreview(b64);
  });
}

function nestiqRevealSettingsPage(){
  const page=document.getElementById('page-settings');
  if(!page) return;
  page.querySelectorAll('.reveal:not(.revealed), .nq-reveal:not(.nq-revealed), .reveal-left:not(.revealed), .reveal-right:not(.revealed)').forEach(el=>{
    el.classList.add('revealed','visible','nq-revealed');
  });
}

function renderSettings(){
  if(!document.getElementById('page-settings')) return;
  nestiqRevealSettingsPage();
  applySettingsPageRoleVisibility();
  syncSettingsDarkLabels();
  try{ window.nestiqInitDeveloperMigrationSection?.(); }catch(_e){}

  const s=getSession?.();
  const g=id=>document.getElementById(id);
  if(g('acct_ld_name')&&s?.role==='landlord'){
    g('acct_ld_name').value=landlordSettings?.name||s?.name||'';
    g('acct_ld_phone').value=landlordSettings?.phone||'';
    g('acct_ld_email').value=s?.email||landlordSettings?.email||'';
  }
  if(g('acct_tn_name')&&s?.role==='tenant'){
    const t=tenantsData.find(x=>x.id===s.userId);
    g('acct_tn_name').value=t?.name||'';
    g('acct_tn_phone').value=t?.phone||'';
  }

  landlordSettings.emailjs=landlordSettings.emailjs||{templates:{}};
  landlordSettings.emailjs.templates=landlordSettings.emailjs.templates||{};

  if(g('email_publicKey')) g('email_publicKey').value=landlordSettings.emailjs.publicKey||'';
  if(g('email_serviceId')) g('email_serviceId').value=landlordSettings.emailjs.serviceId||'';
  if(g('email_tpl_rentReminder')) g('email_tpl_rentReminder').value=landlordSettings.emailjs.templates.rentReminder||'';
  if(g('email_tpl_paymentReceipt')) g('email_tpl_paymentReceipt').value=landlordSettings.emailjs.templates.paymentReceipt||'';
  if(g('email_tpl_overdueNotice')) g('email_tpl_overdueNotice').value=landlordSettings.emailjs.templates.overdueNotice||'';
  if(g('email_tpl_leaseExpiry')) g('email_tpl_leaseExpiry').value=landlordSettings.emailjs.templates.leaseExpiry||'';
  if(g('email_tpl_maintenanceUpdate')) g('email_tpl_maintenanceUpdate').value=landlordSettings.emailjs.templates.maintenanceUpdate||'';
  /* Welcome Tenant Template ID — portal invitation emails (invitations.js). */
  if(g('email_tpl_welcomeTenant')) g('email_tpl_welcomeTenant').value=landlordSettings.emailjs.templates.welcomeTenant||'';
  if(g('email_tpl_customMessage')) g('email_tpl_customMessage').value=landlordSettings.emailjs.templates.customMessage||'';
  if(g('email_test_address')) g('email_test_address').value=landlordSettings.emailjs.testEmail||'';

  if(g('landlord_name_input')) g('landlord_name_input').value=landlordSettings.name||'';
  if(g('landlord_phone_input')) g('landlord_phone_input').value=landlordSettings.phone||'';
  if(g('landlord_email_input')) g('landlord_email_input').value=landlordSettings.email||'';
  if(g('landlord_emergency_input')) g('landlord_emergency_input').value=landlordSettings.emergencyPhone||'';
  if(g('landlord_company_input')) g('landlord_company_input').value=landlordSettings.companyName||'';
  if(g('landlord_address_input')) g('landlord_address_input').value=landlordSettings.physicalAddress||'';
  if(g('landlord_vat_input')) g('landlord_vat_input').value=landlordSettings.vatNumber||'';
  if(g('caretaker_auto_approve_limit')){
    const lim=Number(landlordSettings.caretakerAutoApproveLimit);
    g('caretaker_auto_approve_limit').value=String(Number.isFinite(lim)&&lim>=0?lim:1000);
  }
  __pendingLandlordLogo=null;
  if(g('landlord_logo_input')) g('landlord_logo_input').value='';
  updateLandlordLogoPreview();

  const po=landlordSettings.portal||{};
  if(g('portal_welcome')) g('portal_welcome').value=po.welcomeMessage||'';
  if(g('portal_bank_name')) g('portal_bank_name').value=po.bankName||'';
  if(g('portal_account_number')) g('portal_account_number').value=po.accountNumber||'';
  if(g('portal_branch_code')) g('portal_branch_code').value=po.branchCode||'';
  if(g('portal_account_type')) g('portal_account_type').value=po.accountType==='Savings'?'Savings':'Cheque';
  if(g('portal_ref_format')) g('portal_ref_format').value=po.paymentReferenceFormat||'[TenantName]-[Month]-[Year]';

  const mctx=landlordSettings.marketContext||{};
  if(g('nestiq_market_city')) g('nestiq_market_city').value=mctx.city||'';
  if(g('nestiq_market_growth')) g('nestiq_market_growth').value=mctx.growthPercent!=null&&Number.isFinite(Number(mctx.growthPercent))?String(mctx.growthPercent):'';
  if(g('nestiq_market_source')) g('nestiq_market_source').value=mctx.source||'';
  if(g('nestiq_market_date')) g('nestiq_market_date').value=mctx.asOfDate||'';

  if(g('gemini_api_key')) g('gemini_api_key').value=landlordSettings.gemini?.apiKey||geminiApiKey||'';
  const af=landlordSettings.aiFeatures||{};
  const setChk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=Boolean(v); };
  setChk('ai_feat_rent', af.rentSuggest!==false);
  setChk('ai_feat_maint', af.maintenanceDx!==false);
  setChk('ai_feat_screen', af.tenantScreen!==false);
  setChk('ai_feat_portfolio', af.portfolioAdvisor!==false);
  setChk('ai_feat_lease', af.leaseClauses!==false);

  if(g('aiTestResult')) g('aiTestResult').textContent='';

  updateEmailStatusBadge();
  updateAiStatusBadge();
  renderEmailLogTable();
  renderWhatsAppLog();
  renderNotificationSettingsExtended();
  renderLanguageSettings();
  initSettingsThemePicker?.();
  renderLandlordWhatsAppQr?.();
  renderPwaStatusExtended();
  renderStorageUsageBar();

  const logoIn=document.getElementById('landlord_logo_input');
  if(logoIn && !logoIn.dataset.bound){
    logoIn.dataset.bound='1';
    logoIn.addEventListener('change',handleLandlordLogoPick);
  }

  const restoreIn=document.getElementById('settings_restore_input');
  if(restoreIn && !restoreIn.dataset.bound){
    restoreIn.dataset.bound='1';
    restoreIn.addEventListener('change',settingsOnRestoreFile);
  }

  applyTranslations?.();
  nestiqRevealSettingsPage();
  try{ window.nestiqInitScrollReveal?.(); }catch(_e){}
  nestiqFillProductReviewForm?.();
}

function updateEmailStatusBadge(){
  const el=document.getElementById('emailStatusBadge');
  if(!el) return;
  const full=typeof isEmailJsFullyConfigured==='function' && isEmailJsFullyConfigured();
  const invites=typeof isEmailJsInviteReady==='function' && isEmailJsInviteReady();
  if(full){
    el.className='badge badge-green';
    el.textContent='Configured';
  }else if(invites){
    el.className='badge badge-green';
    el.textContent='Invites ready';
  }else if(typeof isEmailConfigured==='function' && isEmailConfigured()){
    el.className='badge badge-amber';
    el.textContent='Partial';
  }else{
    el.className='badge badge-amber';
    el.textContent='Not configured';
  }
}

function updateAiStatusBadge(){
  const el=document.getElementById('aiStatusBadge');
  if(!el) return;
  const ok=isGeminiConfigured();
  el.className=`badge ${ok?'badge-green':'badge-amber'}`;
  el.textContent=ok?'AI Active':'Not configured';
}

function renderEmailLogTable(){
  const body=document.getElementById('emailLogTableBody');
  const legacy=document.getElementById('emailLogList');
  if(legacy) legacy.innerHTML='';
  if(!body) return;
  if(!emailLog.length){
    body.innerHTML='<tr><td colspan="4" style="color:var(--muted);padding:12px 0">No email activity yet.</td></tr>';
    return;
  }
  body.innerHTML=emailLog.map(e=>`
    <tr>
      <td>${new Date(e.date||e.timestamp).toLocaleString('en-ZA')}</td>
      <td>${(e.recipient||e.tenant||'—').replace(/</g,'&lt;')}</td>
      <td style="text-transform:capitalize">${e.type||'—'}</td>
      <td style="color:${e.status==='sent'?'var(--sage)':'var(--rust)'};text-transform:capitalize">${e.status||'—'}</td>
    </tr>
  `).join('');
}

function clearEmailLog(){
  emailLog=[];
  saveData();
  renderEmailLogTable();
  nestiqShowNotif('Email log cleared','success');
}

function renderWhatsAppLog(){
  const list=document.getElementById('whatsAppLogList');
  if(!list) return;
  if(!whatsappLog.length){
    list.innerHTML='<div style="padding:8px 0">No WhatsApp activity yet.</div>';
    return;
  }
  list.innerHTML=whatsappLog.map(e=>`
    <div style="display:grid;grid-template-columns:150px 1fr 130px;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>${new Date(e.timestamp).toLocaleString('en-ZA')}</div>
      <div>${e.tenantName||'—'}</div>
      <div style="text-transform:capitalize">${e.type||'custom'}</div>
    </div>
  `).join('');
}

function clearWhatsAppLog(){
  whatsappLog=[];
  saveData();
  renderWhatsAppLog();
  nestiqShowNotif('WhatsApp log cleared','success');
}

function renderNotificationSettingsExtended(){
  const s=(typeof getNotificationSettings==='function')?getNotificationSettings():{};
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.checked=Boolean(val); };
  set('notif_overdue', s.overdueRent);
  set('notif_lease', s.leaseExpiry);
  set('notif_maintenance', s.maintenanceNew);
  set('notif_payment', s.paymentReceived);
  set('notif_daily', s.dailySummary);
  set('notif_low_occ', s.lowOccupancy!==false);
  const ld=document.getElementById('notif_lease_days');
  if(ld) ld.value=Number(s.leaseExpiryWarningDays)||90;
  const od=document.getElementById('notif_overdue_days');
  if(od) od.value=Number(s.overdueAfterDays)||1;
  const oc=document.getElementById('notif_occ_threshold');
  if(oc) oc.value=Number(s.lowOccupancyThreshold)||80;
}

function saveNotificationSettingsExtended(){
  const next={
    overdueRent:Boolean(document.getElementById('notif_overdue')?.checked),
    leaseExpiry:Boolean(document.getElementById('notif_lease')?.checked),
    maintenanceNew:Boolean(document.getElementById('notif_maintenance')?.checked),
    paymentReceived:Boolean(document.getElementById('notif_payment')?.checked),
    dailySummary:Boolean(document.getElementById('notif_daily')?.checked),
    lowOccupancy:Boolean(document.getElementById('notif_low_occ')?.checked),
    leaseExpiryWarningDays:Math.max(1,Math.min(365,Number(document.getElementById('notif_lease_days')?.value)||90)),
    overdueAfterDays:Math.max(1,Math.min(90,Number(document.getElementById('notif_overdue_days')?.value)||1)),
    lowOccupancyThreshold:Math.max(0,Math.min(100,Number(document.getElementById('notif_occ_threshold')?.value)||80))
  };
  setNotificationSettings?.(next);
  nestiqShowNotif('Notification settings saved','success');
}

function saveEmailSettings(){
  const btn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="saveEmailSettings"]');
  nestiqSetBtnLoading?.(btn,true,'Saving...');
  try{
  landlordSettings.emailjs=landlordSettings.emailjs||{templates:{}};
  landlordSettings.emailjs.templates=landlordSettings.emailjs.templates||{};
  landlordSettings.emailjs.publicKey=document.getElementById('email_publicKey')?.value.trim()||'';
  landlordSettings.emailjs.serviceId=document.getElementById('email_serviceId')?.value.trim()||'';
  landlordSettings.emailjs.testEmail=document.getElementById('email_test_address')?.value.trim()||'';
  landlordSettings.emailjs.templates.rentReminder=document.getElementById('email_tpl_rentReminder')?.value.trim()||'';
  landlordSettings.emailjs.templates.paymentReceipt=document.getElementById('email_tpl_paymentReceipt')?.value.trim()||'';
  landlordSettings.emailjs.templates.overdueNotice=document.getElementById('email_tpl_overdueNotice')?.value.trim()||'';
  landlordSettings.emailjs.templates.leaseExpiry=document.getElementById('email_tpl_leaseExpiry')?.value.trim()||'';
  landlordSettings.emailjs.templates.maintenanceUpdate=document.getElementById('email_tpl_maintenanceUpdate')?.value.trim()||'';
  landlordSettings.emailjs.templates.welcomeTenant=document.getElementById('email_tpl_welcomeTenant')?.value.trim()||'';
  landlordSettings.emailjs.templates.customMessage=document.getElementById('email_tpl_customMessage')?.value.trim()||'';
  saveData();
  initEmailJS();
  updateEmailStatusBadge();
  nestiqShowNotif('Email settings saved','success');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}

async function sendEmailSettingsTest(){
  const btn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="sendEmailSettingsTest"]');
  nestiqSetBtnLoading?.(btn,true,'Sending...');
  try{
    // Persist form values first so Test Email / template IDs aren't lost if Save wasn't clicked.
    if(typeof saveEmailSettings==='function'){
      const publicKey=document.getElementById('email_publicKey')?.value.trim()||'';
      const serviceId=document.getElementById('email_serviceId')?.value.trim()||'';
      const testTo=document.getElementById('email_test_address')?.value.trim()||'';
      if(publicKey&&serviceId){
        landlordSettings.emailjs=landlordSettings.emailjs||{templates:{}};
        landlordSettings.emailjs.templates=landlordSettings.emailjs.templates||{};
        landlordSettings.emailjs.publicKey=publicKey;
        landlordSettings.emailjs.serviceId=serviceId;
        landlordSettings.emailjs.testEmail=testTo;
        landlordSettings.emailjs.templates.rentReminder=document.getElementById('email_tpl_rentReminder')?.value.trim()||landlordSettings.emailjs.templates.rentReminder||'';
        landlordSettings.emailjs.templates.paymentReceipt=document.getElementById('email_tpl_paymentReceipt')?.value.trim()||landlordSettings.emailjs.templates.paymentReceipt||'';
        landlordSettings.emailjs.templates.overdueNotice=document.getElementById('email_tpl_overdueNotice')?.value.trim()||landlordSettings.emailjs.templates.overdueNotice||'';
        landlordSettings.emailjs.templates.leaseExpiry=document.getElementById('email_tpl_leaseExpiry')?.value.trim()||landlordSettings.emailjs.templates.leaseExpiry||'';
        landlordSettings.emailjs.templates.welcomeTenant=document.getElementById('email_tpl_welcomeTenant')?.value.trim()||landlordSettings.emailjs.templates.welcomeTenant||'';
        landlordSettings.emailjs.templates.maintenanceUpdate=document.getElementById('email_tpl_maintenanceUpdate')?.value.trim()||landlordSettings.emailjs.templates.maintenanceUpdate||'';
        landlordSettings.emailjs.templates.customMessage=document.getElementById('email_tpl_customMessage')?.value.trim()||landlordSettings.emailjs.templates.customMessage||'';
        initEmailJS();
        try{ saveData?.(); }catch(_e){}
      }
    }
    if(!isEmailConfigured()){
      nestiqShowNotif('Configure EmailJS public key and service ID first','warning');
      return;
    }
    const ok=await sendTestEmailToLandlord();
    if(!ok) return;
    renderEmailLogTable();
    nestiqShowNotif('Email sent successfully','success');
  }catch(err){
    renderEmailLogTable();
    nestiqShowNotif(`Error: ${err?.message||'Unknown error'}`,'error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}

async function sendEmailSettingsInviteTest(){
  const btn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="sendEmailSettingsInviteTest"]');
  nestiqSetBtnLoading?.(btn,true,'Sending...');
  try{
    if(typeof saveEmailSettings==='function'){
      const publicKey=document.getElementById('email_publicKey')?.value.trim()||'';
      const serviceId=document.getElementById('email_serviceId')?.value.trim()||'';
      const testTo=document.getElementById('email_test_address')?.value.trim()||'';
      if(publicKey&&serviceId){
        landlordSettings.emailjs=landlordSettings.emailjs||{templates:{}};
        landlordSettings.emailjs.templates=landlordSettings.emailjs.templates||{};
        landlordSettings.emailjs.publicKey=publicKey;
        landlordSettings.emailjs.serviceId=serviceId;
        landlordSettings.emailjs.testEmail=testTo;
        landlordSettings.emailjs.templates.welcomeTenant=document.getElementById('email_tpl_welcomeTenant')?.value.trim()||landlordSettings.emailjs.templates.welcomeTenant||'';
        landlordSettings.emailjs.templates.rentReminder=document.getElementById('email_tpl_rentReminder')?.value.trim()||landlordSettings.emailjs.templates.rentReminder||'';
        initEmailJS();
        try{ saveData?.(); }catch(_e){}
      }
    }
    const to=String(landlordSettings?.emailjs?.testEmail||'').trim()||String(landlordSettings?.email||'').trim();
    const templateId=String(landlordSettings?.emailjs?.templates?.welcomeTenant||'').trim();
    if(!isEmailConfigured()){
      nestiqShowNotif('Save your EmailJS Public Key and Service ID first','warning');
      return;
    }
    if(!templateId){
      nestiqShowNotif('Paste your Welcome Tenant Template ID, then Save EmailJS Settings','warning');
      return;
    }
    if(!to){
      nestiqShowNotif('Enter a Test Email Address first','warning');
      return;
    }
    const code='NQ-TEST01';
    const base=(typeof window.NESTIQ_APP_BASE_URL==='string'&&window.NESTIQ_APP_BASE_URL)?window.NESTIQ_APP_BASE_URL:'https://nestiq-pro.web.app/';
    const inviteUrl=String(base).replace(/\/*$/,'/')+'?invite='+encodeURIComponent(code);
    const ok=await sendEmail(templateId, {
      to_email:to,
      email:to,
      user_email:to,
      to_name:'Test tenant',
      invitation_code:code,
      invite_url:inviteUrl,
      portal_url:String(base).replace(/\/*$/,'/'),
      property_name:'Test property',
      landlord_name:landlordSettings.name||'Landlord',
      expires_date:new Date(Date.now()+30*864e5).toLocaleDateString('en-GB'),
      subject:'NestIQ portal invite test for '+to,
      message:'Test invitation code '+code+' — open '+inviteUrl
    }, {tenantName:'Test tenant',type:'invitation',scope:code});
    if(!ok) return;
    renderEmailLogTable();
    nestiqShowNotif('Test invite sent to '+to+' — if it arrives in THIS inbox, check EmailJS To Email is {{to_email}} so tenant addresses work too.','success');
  }catch(err){
    renderEmailLogTable();
    nestiqShowNotif(`Error: ${err?.message||'Unknown error'}`,'error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}

function renderLanguageSettings(){
  const lang=getCurrentLanguage?.()||'en';
  document.querySelectorAll('input[name="app_lang"]').forEach(r=>{ r.checked=(r.value===lang); });
}

function changeAppLanguage(lang){
  setLanguage?.(lang);
  renderLanguageSettings();
  nestiqShowNotif?.(typeof t==='function'?t('notif.languageChanged'):'Language updated','success');
}

function toggleGeminiKeyVisibility(){
  const inp=document.getElementById('gemini_api_key');
  const btn=document.getElementById('gemini_key_toggle');
  if(!inp||!btn) return;
  const isPwd=inp.type==='password';
  inp.type=isPwd?'text':'password';
  btn.textContent=isPwd?'Hide':'Show';
}

function saveAiSettingsFull(){
  const key=document.getElementById('gemini_api_key')?.value.trim()||'';
  geminiApiKey=key;
  landlordSettings.gemini=landlordSettings.gemini||{};
  landlordSettings.gemini.apiKey=key;
  landlordSettings.gemini.model=landlordSettings.gemini.model||'gemini-2.5-flash';
  landlordSettings.aiFeatures={
    rentSuggest:Boolean(document.getElementById('ai_feat_rent')?.checked),
    maintenanceDx:Boolean(document.getElementById('ai_feat_maint')?.checked),
    tenantScreen:Boolean(document.getElementById('ai_feat_screen')?.checked),
    portfolioAdvisor:Boolean(document.getElementById('ai_feat_portfolio')?.checked),
    leaseClauses:Boolean(document.getElementById('ai_feat_lease')?.checked)
  };
  saveData();
  updateAiStatusBadge();
  nestiqShowNotif('AI settings saved','success');
}

async function testGeminiSettings(){
  const out=document.getElementById('aiTestResult');
  if(out) out.textContent='Testing…';
  try{
    const key=document.getElementById('gemini_api_key')?.value.trim()||'';
    geminiApiKey=key;
    if(typeof landlordSettings==='object' && landlordSettings){
      landlordSettings.gemini=landlordSettings.gemini||{};
      landlordSettings.gemini.apiKey=key;
    }
    if(typeof saveData==='function') saveData();
    if(!isGeminiConfigured()){
      if(out) out.textContent='Paste your Gemini API key first, then test.';
      aiConfigError();
      return;
    }
    const raw=await callGemini('Reply with a single short sentence confirming the NestIQ connection.','',{ skipGuard:true });
    if(!raw){
      if(out) out.textContent='No response from Gemini. Check the key and try again.';
      return;
    }
    const preview=String(raw).slice(0,160);
    if(out) out.textContent=preview+(String(raw).length>160?'…':'');
    nestiqShowNotif('AI connection OK','success');
  }catch(err){
    const msg=err?.message||'AI unavailable, try again';
    if(out) out.textContent=msg;
    nestiqShowNotif(msg,'error');
  }
}

function saveLandlordProfileSettings(){
  const btn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="saveLandlordProfileSettings"]');
  nestiqSetBtnLoading?.(btn,true,'Saving...');
  try{
  landlordSettings.name=document.getElementById('landlord_name_input')?.value?.trim()||landlordSettings.name;
  landlordSettings.phone=document.getElementById('landlord_phone_input')?.value?.trim()||landlordSettings.phone;
  landlordSettings.email=document.getElementById('landlord_email_input')?.value?.trim()||landlordSettings.email;
  landlordSettings.emergencyPhone=document.getElementById('landlord_emergency_input')?.value?.trim()||landlordSettings.emergencyPhone;
  landlordSettings.companyName=document.getElementById('landlord_company_input')?.value?.trim()||landlordSettings.companyName;
  landlordSettings.physicalAddress=document.getElementById('landlord_address_input')?.value?.trim()||'';
  landlordSettings.vatNumber=document.getElementById('landlord_vat_input')?.value?.trim()||'';
  if(__pendingLandlordLogo) landlordSettings.logoBase64=__pendingLandlordLogo;
  __pendingLandlordLogo=null;
  saveData();
  updateLandlordLogoPreview();
  nestiqShowNotif('Profile saved','success');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
  }
}

function savePortalSettings(){
  landlordSettings.portal=landlordSettings.portal||{};
  landlordSettings.portal.welcomeMessage=document.getElementById('portal_welcome')?.value?.trim()||'Welcome to your tenant portal';
  landlordSettings.portal.bankName=document.getElementById('portal_bank_name')?.value?.trim()||'';
  landlordSettings.portal.accountNumber=document.getElementById('portal_account_number')?.value?.trim()||'';
  landlordSettings.portal.branchCode=document.getElementById('portal_branch_code')?.value?.trim()||'';
  landlordSettings.portal.accountType=document.getElementById('portal_account_type')?.value==='Savings'?'Savings':'Cheque';
  landlordSettings.portal.paymentReferenceFormat=document.getElementById('portal_ref_format')?.value?.trim()||'[TenantName]-[Month]-[Year]';
  saveData();
  nestiqShowNotif('Portal settings saved','success');
}

function saveMarketContextSettings(){
  landlordSettings.marketContext=landlordSettings.marketContext||{};
  const g=document.getElementById('nestiq_market_growth')?.value?.trim();
  const gp=g===''||g==null?null:Number(g);
  landlordSettings.marketContext={
    city:document.getElementById('nestiq_market_city')?.value?.trim()||'',
    growthPercent:Number.isFinite(gp)?gp:null,
    source:document.getElementById('nestiq_market_source')?.value?.trim()||'',
    asOfDate:document.getElementById('nestiq_market_date')?.value?.trim()||''
  };
  saveData();
  normalizeDataModel?.();
  nestiqShowNotif('Market context saved','success');
}

function saveLandlordSettings(){
  saveLandlordProfileSettings();
}

function csvEscapeCell(v){
  const s=String(v??'');
  if(/[",\n\r]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function objectsToCsv(rows){
  if(!rows.length) return '';
  const keys=Object.keys(rows[0]);
  return [keys.join(','),...rows.map(r=>keys.map(k=>csvEscapeCell(r[k])).join(','))].join('\n');
}

async function exportNestiqAllDataZip(){
  if(typeof JSZip==='undefined'){
    nestiqShowNotif('ZIP library not loaded — check your connection','error');
    return;
  }
  try{
    const zip=new JSZip();
    const props=(propertiesData||[]).map(p=>({id:p.id,name:p.name,addr:p.addr,rent:p.rent,status:p.status,type:p.type,bedrooms:p.bedrooms,leaseEnd:p.leaseEnd}));
    const ten=(tenantsData||[]).map(t=>({id:t.id,name:t.name,unit:t.unit,property:t.property,rent:t.rent,status:t.status,lease:t.lease,phone:t.phone,email:t.email}));
    const exp=(expenses||[]).map(x=>({id:x.id,cat:x.cat,desc:x.desc,amount:x.amount,prop:x.prop,date:x.date}));
    const maint=(maintenanceData||[]).map(m=>({id:m.id,title:m.title,property:m.property,priority:m.priority,status:m.status,date:m.date}));
    const pay=(paymentsData||[]).map(p=>({tenantId:p.tenantId,date:p.date,amount:p.amount,method:p.method,reference:p.reference,receiptNo:p.receiptNo,status:p.status}));
    zip.file('properties.csv', objectsToCsv(props));
    zip.file('tenants.csv', objectsToCsv(ten));
    zip.file('expenses.csv', objectsToCsv(exp));
    zip.file('maintenance.csv', objectsToCsv(maint));
    zip.file('payments.csv', objectsToCsv(pay));
    const blob=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`nestiq-export-${new Date().toISOString().slice(0,10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    nestiqShowNotif('ZIP export downloaded','success');
  }catch(_err){
    nestiqShowNotif('Export failed','error');
  }
}

function collectFullBackupPayload(){
  return {
    version:'nestiq-pro-backup-1',
    exportedAt:new Date().toISOString(),
    expenses, tenantsData, maintenanceData, propertiesData, paymentsData,
    propertyPhotos, maintenancePhotos, landlordSettings, emailLog, whatsappLog,
    customEvents, notices, messages, utilityReadings, rentIncreases, inspections, vacancyRecords, lateFees, vendors, vendorNextId,
    sentReminderMonths, emailConfig, geminiApiKey, landlordEmail, landlordName,
    notificationSettings: typeof getNotificationSettings==='function'?getNotificationSettings():null
  };
}

function settingsDownloadFullBackup(){
  const data=JSON.stringify(collectFullBackupPayload(),null,2);
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`nestiq-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  nestiqShowNotif('Backup downloaded','success');
}

function settingsPickRestoreBackup(){
  document.getElementById('settings_restore_input')?.click();
}

function settingsOnRestoreFile(e){
  const file=e.target.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(!confirm('Restore backup? This will overwrite current data in this browser.')) return;
      if(d.expenses) expenses=d.expenses;
      if(d.tenantsData) tenantsData=d.tenantsData;
      if(d.maintenanceData) maintenanceData=d.maintenanceData;
      if(d.propertiesData) propertiesData.splice(0,propertiesData.length,...d.propertiesData);
      if(d.paymentsData) paymentsData.splice(0,paymentsData.length,...d.paymentsData);
      if(d.propertyPhotos&&typeof d.propertyPhotos==='object'){ propertyPhotos=d.propertyPhotos; photos=propertyPhotos; }
      if(d.maintenancePhotos&&typeof d.maintenancePhotos==='object') maintenancePhotos=d.maintenancePhotos;
      if(d.landlordSettings&&typeof d.landlordSettings==='object') Object.assign(landlordSettings,d.landlordSettings);
      if(Array.isArray(d.emailLog)) emailLog=d.emailLog;
      if(Array.isArray(d.whatsappLog)) whatsappLog=d.whatsappLog;
      if(Array.isArray(d.customEvents)) customEvents=d.customEvents;
      if(Array.isArray(d.notices)) notices=d.notices;
      if(Array.isArray(d.messages)) messages=d.messages;
      if(Array.isArray(d.utilityReadings)) utilityReadings=d.utilityReadings;
      if(Array.isArray(d.rentIncreases)) rentIncreases=d.rentIncreases;
      if(Array.isArray(d.inspections)) inspections=d.inspections;
      if(Array.isArray(d.vacancyRecords)) vacancyRecords=d.vacancyRecords;
      try{ window.vacancyRecords=vacancyRecords; }catch(_e){}
      if(Array.isArray(d.lateFees)) lateFees=d.lateFees;
      try{ window.lateFees=lateFees; }catch(_e){}
      if(Array.isArray(d.vendors)) vendors=d.vendors;
      if(Number.isFinite(Number(d.vendorNextId))) vendorNextId=Number(d.vendorNextId);
      try{ window.vendors=vendors; window.vendorNextId=vendorNextId; }catch(_e){}
      if(d.sentReminderMonths&&typeof d.sentReminderMonths==='object') sentReminderMonths=d.sentReminderMonths;
      if(d.emailConfig&&typeof d.emailConfig==='object') Object.assign(emailConfig,d.emailConfig);
      if(typeof d.geminiApiKey==='string') geminiApiKey=d.geminiApiKey;
      if(typeof d.landlordEmail==='string') landlordEmail=d.landlordEmail;
      if(typeof d.landlordName==='string') landlordName=d.landlordName;
      if(d.notificationSettings&&typeof d.notificationSettings==='object') setNotificationSettings?.(d.notificationSettings);
      normalizeDataModel?.();
      saveData();
      initEmailJS?.();
      nestiqShowNotif('Backup restored','success');
      renderSettings();
    }catch(_err){
      nestiqShowNotif('Invalid backup file','error');
    }
    e.target.value='';
  };
  reader.readAsText(file);
}

function renderStorageUsageBar(){
  const label=document.getElementById('settings_storage_label');
  const bar=document.getElementById('settings_storage_bar');
  const breakdown=document.getElementById('settings_storage_breakdown');
  if(!label||!bar) return;
  let total=0, tenantKb=0, expKb=0, photoKb=0, otherKb=0;
  for(const key in localStorage){
    if(!Object.prototype.hasOwnProperty.call(localStorage,key)) continue;
    const v=localStorage[key];
    if(typeof v!=='string') continue;
    const bytes=v.length;
    total+=bytes;
    const kb=bytes/1024;
    if(key==='nestiq-tenants') tenantKb+=kb;
    else if(key==='nestiq-expenses') expKb+=kb;
    else if(/nestiq-propertyPhotos|nestiq-photos|nestiq-maintenancePhotos/i.test(key)) photoKb+=kb;
    else otherKb+=kb;
  }
  const maxBytes=5*1024*1024;
  const pct=Math.min(100,Math.round((total/maxBytes)*100));
  label.textContent=`${(total/1024).toFixed(1)} KB`;
  bar.style.width=`${pct}%`;
  if(breakdown){
    breakdown.innerHTML=`Tenant data: ${tenantKb.toFixed(1)} KB<br>Expense data: ${expKb.toFixed(1)} KB<br>Photos: ${photoKb.toFixed(1)} KB<br>Other: ${otherKb.toFixed(1)} KB`;
  }
}

function openSettingsResetModal(){
  const o=document.getElementById('settingsResetOverlay');
  const inp=document.getElementById('settingsResetConfirmInput');
  if(inp) inp.value='';
  if(o){ o.classList.add('open'); o.setAttribute('aria-hidden','false'); }
}

function closeSettingsResetModal(){
  const o=document.getElementById('settingsResetOverlay');
  if(o){ o.classList.remove('open'); o.setAttribute('aria-hidden','true'); }
}

function confirmSettingsFullReset(){
  const inp=document.getElementById('settingsResetConfirmInput')?.value?.trim();
  if(inp!=='RESET'){
    nestiqShowNotif('Type RESET to confirm','warning');
    return;
  }
  localStorage.clear();
  sessionStorage.clear();
  closeSettingsResetModal();
  nestiqShowNotif('All data cleared — reloading…','warning');
  setTimeout(()=>location.reload(),400);
}

async function renderPwaStatusExtended(){
  const appEl=document.getElementById('pwaAppStatus');
  const cacheEl=document.getElementById('pwaCacheStatus');
  const installBtn=document.getElementById('pwaInstallBtn');
  if(!appEl||!cacheEl) return;

  const installed=window.matchMedia('(display-mode: standalone)').matches;
  appEl.textContent=installed?'Running as: Installed App':'Running as: Web Browser';

  let cacheActive=false;
  if('serviceWorker' in navigator){
    const regs=await navigator.serviceWorker.getRegistrations();
    cacheActive=regs.length>0;
  }
  cacheEl.textContent=cacheActive?'Active':'Not active';

  if(installBtn){
    const can=window.nestiqPwa?.canInstall && !installed;
    installBtn.style.display=can?'inline-flex':'none';
  }
}

async function pwaInstallFromSettings(){
  if(window.nestiqPwa?.promptInstall){
    const ok=await window.nestiqPwa.promptInstall();
    if(!ok) nestiqShowNotif('Install prompt not available yet','warning');
  }else{
    nestiqShowNotif('Install prompt not available','warning');
  }
  renderPwaStatusExtended();
}

async function clearPwaCache(){
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    if(window.caches){
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    nestiqShowNotif('Cache cleared','success');
    renderPwaStatusExtended();
  }catch(_err){
    nestiqShowNotif('Failed to clear cache','error');
  }
}

async function updatePwaApp(){
  try{
    const reg=window.nestiqPwa?.swRegistration;
    if(reg){ await reg.update(); nestiqShowNotif('Update check complete','success'); }
    else nestiqShowNotif('Service worker not active','warning');
  }catch(_err){
    nestiqShowNotif('Update check failed','error');
  }
}

function clearAllLocalData(){
  if(!confirm('This will clear all local data. Continue?')) return;
  localStorage.clear();
  sessionStorage.clear();
  nestiqShowNotif('All local data cleared','warning');
  setTimeout(()=>location.reload(),300);
}

function handleLogout(){
  if(typeof nestiqLandlordLogout==='function') nestiqLandlordLogout();
  else if(typeof nestiqConfirmSignOut==='function') nestiqConfirmSignOut({role:'landlord'});
  else logoutSession();
}

function saveCaretakerAutoApproveLimit(){
  const raw=Number(document.getElementById('caretaker_auto_approve_limit')?.value);
  const limit=Number.isFinite(raw)&&raw>=0?Math.round(raw):1000;
  landlordSettings.caretakerAutoApproveLimit=limit;
  try{ window.landlordSettings=landlordSettings; }catch(_e){}
  saveData?.();
  nestiqShowNotif?.(`Caretaker auto-approve limit set to R${limit.toLocaleString('en-ZA')}`,'success');
}
window.saveCaretakerAutoApproveLimit=saveCaretakerAutoApproveLimit;

function nestiqSetProductReviewStars(n){
  const v=Math.max(1, Math.min(5, Number(n)||5));
  window.__nestiqProductReviewRating=v;
  const hidden=document.getElementById('nestiqProductReviewRating');
  if(hidden) hidden.value=String(v);
  document.querySelectorAll('#nestiqProductReviewStarBtns .nestiq-review-star-btn').forEach((btn,i)=>{
    btn.classList.toggle('filled', i<v);
  });
}

function nestiqPaintProductReviewStars(rating){
  const host=document.getElementById('nestiqProductReviewStarBtns');
  if(!host) return;
  const n=Math.max(1, Math.min(5, Number(rating)||5));
  host.innerHTML=[1,2,3,4,5].map(i=>`<button type="button" class="nestiq-review-star-btn${i<=n?' filled':''}" onclick="nestiqSetProductReviewStars(${i})" aria-label="${i} star${i===1?'':'s'}">★</button>`).join('');
  nestiqSetProductReviewStars(n);
}

function nestiqPaintProductReviewStatus(existing){
  const hint=document.getElementById('nestiqProductReviewHint');
  const btn=document.getElementById('nestiqProductReviewSubmitBtn');
  const removeBtn=document.getElementById('nestiqProductReviewRemoveBtn');
  const live=!!(existing&&existing.published!==false);
  if(removeBtn) removeBtn.style.display=live?'':'none';
  if(!existing){
    if(hint) hint.textContent='Shown next to the sample quotes on the marketing site. You can update or remove it later.';
    if(btn) btn.textContent='Publish on landing page';
    return;
  }
  if(live){
    if(hint) hint.textContent='This is already on the landing page. Saving again updates your quote.';
    if(btn) btn.textContent='Update landing page review';
  }else{
    if(hint) hint.textContent='Your quote is saved but hidden. Publish again to show it.';
    if(btn) btn.textContent='Publish on landing page';
  }
}

async function nestiqFillProductReviewForm(){
  const s=typeof getSession==='function'?getSession():null;
  if(!s||s.role!=='landlord') return;
  if(!document.getElementById('nestiqProductReviewBody')) return;
  const cityEl=document.getElementById('nestiqProductReviewCity');
  const bodyEl=document.getElementById('nestiqProductReviewBody');
  const fallbackCity=String(landlordSettings?.marketContext?.city||'').trim();
  if(cityEl&&!cityEl.value) cityEl.value=fallbackCity;
  nestiqPaintProductReviewStars(5);
  nestiqPaintProductReviewStatus(null);
  let existing=null;
  try{ existing=await window.nestiqFetchMyProductReview?.(); }catch(_e){}
  if(existing){
    if(cityEl) cityEl.value=existing.city||cityEl.value||fallbackCity;
    if(bodyEl) bodyEl.value=existing.body||'';
    nestiqPaintProductReviewStars(existing.rating||5);
  }
  nestiqPaintProductReviewStatus(existing);
}

async function nestiqSaveProductReview(){
  const rating=Number(document.getElementById('nestiqProductReviewRating')?.value||window.__nestiqProductReviewRating||0);
  const city=String(document.getElementById('nestiqProductReviewCity')?.value||'').trim();
  const body=String(document.getElementById('nestiqProductReviewBody')?.value||'').trim();
  const min=Number(window.NESTIQ_PRODUCT_REVIEW_BODY_MIN||20);
  if(!Number.isFinite(rating)||rating<1||rating>5){
    nestiqShowNotif?.('Choose a rating from 1 to 5','warning');
    return;
  }
  if(!city){
    nestiqShowNotif?.('Add your city so it can appear like the other cards','warning');
    document.getElementById('nestiqProductReviewCity')?.focus();
    return;
  }
  if(body.length<min){
    nestiqShowNotif?.('Write a short review (at least '+min+' characters)','warning');
    document.getElementById('nestiqProductReviewBody')?.focus();
    return;
  }
  const btn=document.getElementById('nestiqProductReviewSubmitBtn');
  nestiqSetBtnLoading?.(btn,true,'Publishing…');
  let ok=false;
  try{
    if(typeof window.nestiqSubmitProductReview!=='function'){
      throw new Error('Review service is not loaded');
    }
    await window.nestiqSubmitProductReview(rating, body, city);
    ok=true;
    nestiqShowNotif?.('Your review is on the NestIQ landing page','success');
  }catch(err){
    const msg=String(err?.message||'Could not publish review');
    nestiqShowNotif?.(msg.replace(/^Firebase: /,'').replace(/\s*\([^)]*\)\s*$/,''),'error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
    if(ok) nestiqPaintProductReviewStatus({ published:true });
  }
}

async function nestiqRemoveProductReview(){
  const btn=document.getElementById('nestiqProductReviewRemoveBtn');
  nestiqSetBtnLoading?.(btn,true,'Removing…');
  let ok=false;
  try{
    if(typeof window.nestiqUnpublishProductReview!=='function'){
      throw new Error('Review service is not loaded');
    }
    await window.nestiqUnpublishProductReview();
    ok=true;
    nestiqShowNotif?.('Your review is no longer on the landing page','success');
  }catch(err){
    const msg=String(err?.message||'Could not remove review');
    nestiqShowNotif?.(msg.replace(/^Firebase: /,'').replace(/\s*\([^)]*\)\s*$/,''),'error');
  }finally{
    nestiqSetBtnLoading?.(btn,false);
    if(ok) nestiqPaintProductReviewStatus({ published:false });
  }
}

window.renderSettings=renderSettings;
window.saveEmailSettings=saveEmailSettings;
window.sendEmailSettingsTest=sendEmailSettingsTest;
window.clearEmailLog=clearEmailLog;
window.clearWhatsAppLog=clearWhatsAppLog;
window.saveNotificationSettings=saveNotificationSettingsExtended;
window.saveNotificationSettingsExtended=saveNotificationSettingsExtended;
window.changeAppLanguage=changeAppLanguage;
window.saveAiSettings=saveAiSettingsFull;
window.saveAiSettingsFull=saveAiSettingsFull;
window.testGeminiSettings=testGeminiSettings;
window.toggleGeminiKeyVisibility=toggleGeminiKeyVisibility;
window.saveLandlordSettings=saveLandlordSettings;
window.saveLandlordProfileSettings=saveLandlordProfileSettings;
window.savePortalSettings=savePortalSettings;
window.exportNestiqAllDataZip=exportNestiqAllDataZip;
window.settingsDownloadFullBackup=settingsDownloadFullBackup;
window.settingsPickRestoreBackup=settingsPickRestoreBackup;
window.openSettingsResetModal=openSettingsResetModal;
window.closeSettingsResetModal=closeSettingsResetModal;
window.confirmSettingsFullReset=confirmSettingsFullReset;
window.settingsToggleDarkFromPage=settingsToggleDarkFromPage;
window.handleLogout=handleLogout;
window.renderPwaStatus=renderPwaStatusExtended;
window.renderPwaStatusExtended=renderPwaStatusExtended;
window.pwaInstallFromSettings=pwaInstallFromSettings;
window.clearPwaCache=clearPwaCache;
window.updatePwaApp=updatePwaApp;
window.clearAllLocalData=clearAllLocalData;
window.nestiqSetProductReviewStars=nestiqSetProductReviewStars;
window.nestiqFillProductReviewForm=nestiqFillProductReviewForm;
window.nestiqSaveProductReview=nestiqSaveProductReview;
window.nestiqRemoveProductReview=nestiqRemoveProductReview;

document.addEventListener('click',e=>{
  const overlay=document.getElementById('settingsResetOverlay');
  if(overlay && e.target===overlay) closeSettingsResetModal();
});
