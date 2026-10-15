const enBase={
  'nav.home':'Home','nav.properties':'Properties','nav.tenants':'Tenants','nav.analytics':'Analytics','nav.expenses':'Expenses','nav.maintenance':'Maintenance','nav.calendar':'Calendar','nav.tax':'Tax','nav.rentroll':'Rent Roll','nav.renewals':'Leases','nav.roi':'ROI Calculator','nav.map':'Map','nav.inspections':'Inspections','nav.settings':'Settings','nav.logout':'Logout',
  'login.title':'Welcome to NestIQ Pro','login.landlord':'Landlord','login.tenant':'Tenant','login.username':'Username','login.password':'Password','login.button':'Login','login.error':'Invalid username or password','login.welcome':'Smart Rental Management',
  'dash.totalRevenue':'Total Revenue','dash.occupancyRate':'Occupancy Rate','dash.activeTenants':'Active Tenants','dash.monthlyIncome':'Monthly Income',
  'prop.title':'Properties','prop.add':'Add Property','prop.search':'Search properties','prop.occupied':'Occupied','prop.vacant':'Vacant','prop.due':'Due','prop.rent':'Rent','prop.bedrooms':'Bedrooms','prop.leaseEnd':'Lease End','prop.noResults':'No properties found',
  'tenant.title':'Tenants','tenant.add':'Applications','tenant.export':'Export','tenant.paid':'Paid','tenant.overdue':'Overdue','tenant.vacant':'Vacant','tenant.monthlyRent':'Monthly Rent','tenant.leaseEnd':'Lease End','tenant.sendReminder':'Send Reminder','tenant.recordPayment':'Record Payment',
  'exp.title':'Expenses','exp.add':'Add Expense','exp.category':'Category','exp.description':'Description','exp.amount':'Amount','exp.property':'Property','exp.date':'Date','exp.delete':'Delete','exp.export':'Export','exp.total':'Total','exp.noExpenses':'No expenses yet',
  'maint.title':'Maintenance','maint.add':'Add Request','maint.open':'Open','maint.inProgress':'In Progress','maint.resolved':'Resolved','maint.high':'High','maint.medium':'Medium','maint.low':'Low','maint.property':'Property','maint.date':'Date',
  'portal.welcome':'Welcome back, {{name}}','portal.rentStatus':'Rent Status','portal.paid':'PAID','portal.due':'RENT DUE','portal.overdue':'OVERDUE','portal.daysRemaining':'{{days}} days remaining','portal.daysOverdue':'{{days}} days overdue','portal.payNow':'Pay rent','portal.paymentHistory':'Payment History','portal.submitMaintenance':'Submit Maintenance','portal.myLease':'My Lease','portal.leaseStart':'Lease Start','portal.leaseEnd':'Lease End','portal.monthlyRent':'Monthly Rent','portal.deposit':'Deposit','portal.documents':'Documents','portal.notices':'Notices','portal.noNotices':'No notices','portal.messages':'Messages',
  'common.save':'Save','common.cancel':'Cancel','common.delete':'Delete','common.edit':'Edit','common.close':'Close','common.download':'Download','common.print':'Print','common.export':'Export','common.add':'Add','common.search':'Search','common.filter':'Filter','common.all':'All','common.yes':'Yes','common.no':'No','common.confirm':'Confirm','common.loading':'Loading...','common.error':'Error','common.success':'Success',
  'notif.paymentRecorded':'Payment recorded','notif.tenantAdded':'Tenant added','notif.propertyAdded':'Property added','notif.expenseAdded':'Expense added','notif.maintenanceAdded':'Maintenance request added','notif.noticePosted':'Notice posted','notif.emailSent':'Email sent','notif.pdfGenerated':'PDF generated','notif.languageChanged':'Language updated',
  'lang.english':'English','lang.afrikaans':'Afrikaans','lang.zulu':'isiZulu','lang.xhosa':'isiXhosa','lang.sotho':'Sesotho',
  'relative.daysAgo':'{{days}} days ago','relative.daysIn':'in {{days}} days','relative.today':'today'
};

const translations={
  en:{...enBase},
  af:{...enBase,
    'nav.home':'Tuis','nav.properties':'Eienskappe','nav.tenants':'Huurders','nav.analytics':'Analise','nav.expenses':'Uitgawes','nav.maintenance':'Instandhouding','nav.calendar':'Kalender','nav.tax':'Belasting','nav.rentroll':'Huurrol','nav.renewals':'Huurkontrakte','nav.roi':'ROI Sakrekenaar','nav.map':'Kaart','nav.settings':'Instellings','nav.logout':'Meld af',
    'login.title':'Welkom by NestIQ Pro','login.landlord':'Verhuurder','login.tenant':'Huurder','login.username':'Gebruikersnaam','login.password':'Wagwoord','login.button':'Teken in','login.error':'Ongeldige gebruikersnaam of wagwoord',
    'portal.welcome':'Welkom terug, {{name}}','portal.paid':'BETAAL','portal.due':'HUUR VERSKULDIG','portal.overdue':'AGTERSTALLIG','portal.daysRemaining':'{{days}} dae oor','portal.daysOverdue':'{{days}} dae agter','portal.payNow':'Betaal Huur Nou',
    'common.save':'Stoor','common.cancel':'Kanselleer','common.loading':'Laai...','relative.daysAgo':'{{days}} dae gelede','relative.daysIn':'oor {{days}} dae','relative.today':'vandag'
  },
  zu:{...enBase,
    'nav.home':'Ikhaya','nav.properties':'Izindlu','nav.tenants':'Abahlali','nav.analytics':'Ukuhlaziya','nav.expenses':'Izindleko','nav.maintenance':'Ukunakekela','nav.calendar':'Ikhalenda','nav.tax':'Intela','nav.rentroll':'Iroli yokubhukha','nav.renewals':'Izinkontileka','nav.settings':'Izilungiselelo','nav.logout':'Phuma',
    'login.title':'Wamkelekile ku NestIQ Pro','login.landlord':'Umnikazi','login.tenant':'Umqashi','login.username':'Igama lomsebenzisi','login.password':'Iphasiwedi','login.button':'Ngena','login.error':'Igama noma iphasiwedi engalungile',
    'portal.welcome':'Sawubona futhi, {{name}}','portal.paid':'KUKHOKHIWE','portal.due':'IJARHO IFUNEKA','portal.overdue':'KUDLULELE','portal.payNow':'Khokha Ijarho Manje',
    'common.save':'Gcina','common.cancel':'Khansela','common.loading':'Kulayisha...','relative.daysAgo':'ezinsukwini ezingu-{{days}} ezedlule','relative.daysIn':'ezinsukwini ezingu-{{days}}','relative.today':'namuhla'
  },
  xh:{...enBase,
    'nav.home':'Ikhaya','nav.properties':'Izakhiwo','nav.tenants':'Abaqeshi','nav.analytics':'Uhlalutyo','nav.expenses':'Iindleko','nav.maintenance':'Ulondolozo','nav.calendar':'Ikhalenda','nav.tax':'Irhafu','nav.rentroll':'Irenti eroli','nav.renewals':'Izivumelwano','nav.settings':'Izicwangciso','nav.logout':'Phuma',
    'login.title':'Wamkelekile ku NestIQ Pro','login.landlord':'Umninizindlu','login.tenant':'Umqeshi','login.username':'Igama lomsebenzisi','login.password':'Ipasiwedi','login.button':'Ngena','login.error':'Igama okanye ipasiwedi engachanekanga',
    'portal.welcome':'Wamkelekile, {{name}}','portal.paid':'IHLAWULIWE','portal.due':'IRENTI IFUNEKA','portal.overdue':'IDLULILE','portal.payNow':'Hlawula Irenti Ngoku',
    'common.save':'Gcina','common.cancel':'Rhoxisa','common.loading':'Iyalayisha...','relative.daysAgo':'kwiintsuku eziyi-{{days}} ezidlulileyo','relative.daysIn':'kwiintsuku eziyi-{{days}}','relative.today':'namhlanje'
  },
  st:{...enBase,
    'nav.home':'Lapeng','nav.properties':'Thepa','nav.tenants':'Baahi','nav.analytics':'Tokomane','nav.expenses':'Ditjeheho','nav.maintenance':'Tokiso','nav.calendar':'Khalendara','nav.tax':'Lekgetho','nav.rentroll':'Lenane la haho','nav.renewals':'Konteraka','nav.settings':'Maemo','nav.logout':'Tswa',
    'login.title':'Wamkeloa ho NestIQ Pro','login.landlord':'Mong wa ntlo','login.tenant':'Moahi','login.username':'Lebitso la mosebedisi','login.password':'Mantsoe a sephiri','login.button':'Kena','login.error':'Lebitso kapa mantsoe a phoso',
    'portal.welcome':'Dumelang, {{name}}','portal.paid':'E LESHITSWE','portal.due':'KELETE E HLOKAHALA','portal.overdue':'E FETISITSWE','portal.payNow':'Leshela Kelete Hona Joale',
    'common.save':'Boloka','common.cancel':'Hlakola','common.loading':'E a laela...','relative.daysAgo':'matsatsi a {{days}} a fetileng','relative.daysIn':'ka matsatsi a {{days}}','relative.today':'kajeno'
  }
};

const LANGS=['en','af','zu','xh','st'];
function getSessionRole(){
  try{
    const s=window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
    return s?.role||null;
  }catch(_err){return null;}
}
function nestiqNormalizeLang(lang){
  const l=String(lang||'en').toLowerCase();
  return LANGS.includes(l)?l:'en';
}
function getCurrentLanguage(){
  return nestiqNormalizeLang(localStorage.getItem('nestiq-lang'));
}
function t(key, params){
  const lang=getCurrentLanguage();
  let out=(translations[lang]&&translations[lang][key]) || translations.en[key] || key;
  if(params && typeof out==='string'){
    Object.keys(params).forEach(k=>{ out=out.replace(new RegExp(`\\{\\{${k}\\}\\}`,'g'), String(params[k])); });
  }
  return out;
}
function nestiqPersistLanguagePreference(finalLang){
  const role=getSessionRole();
  if(role==='tenant'){
    const s=window.getSession?.();
    const tenant=window.currentTenantData
      || (window.tenantsData||[]).find(x=>String(x.id)===String(s?.userId||s?.tenantDocId||''));
    if(tenant){
      tenant.preferredLanguage=finalLang;
      window.saveData?.();
    }
    return;
  }
  if(role==='landlord' && window.landlordSettings && typeof window.landlordSettings==='object'){
    window.landlordSettings.preferredLanguage=finalLang;
    window.saveData?.();
  }
}
function applySessionLanguage(session){
  const s=session||window.getSession?.()||null;
  const role=s?.role||getSessionRole();
  let next=localStorage.getItem('nestiq-lang');
  if(role==='tenant'){
    const tenant=window.currentTenantData
      || (window.tenantsData||[]).find(x=>String(x.id)===String(s?.userId||s?.tenantDocId||''));
    if(tenant?.preferredLanguage) next=tenant.preferredLanguage;
  }else if(role==='landlord' && window.landlordSettings?.preferredLanguage){
    next=window.landlordSettings.preferredLanguage;
  }
  localStorage.setItem('nestiq-lang', nestiqNormalizeLang(next));
  applyTranslations();
}
function setLanguage(lang, opts={}){
  const finalLang=nestiqNormalizeLang(lang);
  localStorage.setItem('nestiq-lang', finalLang);
  if(!opts.skipTenantPersist) nestiqPersistLanguagePreference(finalLang);
  applyTranslations();
  document.dispatchEvent(new CustomEvent('nestiq:language',{detail:{lang:finalLang}}));
  if(opts.remount && typeof window.mountPage==='function'){
    const h=(location.hash||'#home').replace('#','')||'home';
    window.mountPage(h).catch(()=>{});
  }
}
function applyTranslations(root=document){
  root.querySelectorAll?.('[data-i18n]')?.forEach(el=>{ el.textContent=t(el.getAttribute('data-i18n')); });
  root.querySelectorAll?.('[data-i18n-placeholder]')?.forEach(el=>{ el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  root.querySelectorAll?.('[data-i18n-title]')?.forEach(el=>{ el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.documentElement.setAttribute('lang', getCurrentLanguage());
}
function formatDateLang(dateString, lang=getCurrentLanguage()){
  const m={en:'en-ZA',af:'af-ZA',zu:'zu-ZA',xh:'xh-ZA',st:'st-ZA'};
  const d=new Date(dateString);
  if(String(d)==='Invalid Date') return String(dateString||'');
  return new Intl.DateTimeFormat(m[lang]||'en-ZA',{day:'2-digit',month:'long',year:'numeric'}).format(d);
}
function formatCurrency(amount, lang=getCurrentLanguage()){
  const m={en:'en-ZA',af:'af-ZA',zu:'zu-ZA',xh:'xh-ZA',st:'st-ZA'};
  const n=Number(amount||0);
  return `R${new Intl.NumberFormat(m[lang]||'en-ZA',{maximumFractionDigits:0}).format(n)}`;
}
function formatRelativeTime(date, lang=getCurrentLanguage()){
  const d=new Date(date); if(String(d)==='Invalid Date') return '';
  const today=new Date(); today.setHours(0,0,0,0);
  const dt=new Date(d); dt.setHours(0,0,0,0);
  const diff=Math.round((dt-today)/86400000);
  if(diff===0) return t('relative.today');
  return diff<0 ? t('relative.daysAgo',{days:Math.abs(diff)}) : t('relative.daysIn',{days:diff});
}

window.translations=translations;
window.t=t;
window.setLanguage=setLanguage;
window.getCurrentLanguage=getCurrentLanguage;
window.applyTranslations=applyTranslations;
window.applySessionLanguage=applySessionLanguage;
window.nestiqNormalizeLang=nestiqNormalizeLang;
window.formatDateLang=formatDateLang;
window.formatCurrency=formatCurrency;
window.formatRelativeTime=formatRelativeTime;
