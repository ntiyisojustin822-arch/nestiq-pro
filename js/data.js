/* ═══════════════════════════════
   DATA — live arrays; demo mode is disabled project-wide
═══════════════════════════════ */

let propertiesData=[];
let propertiesLoading=true;
let expenses=[];
let expensesLoading=true;
let expNextId=1;
let recurringExpenses=[];
let recurringExpenseNextId=1;
try{ window.recurringExpenses=recurringExpenses; }catch(_e){}
const catColors={Maintenance:'#c46a3a',Insurance:'#c9a84c','Rates & Taxes':'#3a6b8a',Utilities:'#9b7ebd','Agent Fees':'#5a7a60','Late Fee':'#c9a84c',Other:'#888'};
const expenseCategories=Object.keys(catColors);

let tenantsData=[];
let tenantsLoading=true;
let tenantNextId=1;

let maintenanceData=[];
let maintNextId=1;
let vendors=[];
let vendorNextId=1;
const maintCols={open:{label:'Open',color:'var(--rust)'},progress:{label:'In Progress',color:'var(--gold)'},done:{label:'Resolved',color:'var(--sage)'}};
const priorityColors={High:'var(--rust)',Medium:'var(--gold)',Low:'var(--sage)'};

const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let bellNotifs=[];

let taxChartInst=null;

let paymentsData=[];
let allPayments=[];

let propertyPhotos={}; // { [propertyId]: base64 }
let photos=propertyPhotos; // backward compatibility alias
let maintenancePhotos={}; // { [maintenanceId]: base64 }
const emailConfig={
  serviceId:'',
  templateIdReminder:'',
  templateIdReceipt:'',
  templateIdWelcome:'',
  publicKey:''
};
let landlordEmail='';
let landlordName='';
let sentReminderMonths={}; // { "tenantId-YYYY-MM": true }
let emailLog=[]; // last 50 sends
let geminiApiKey='';
let customEvents=[]; // user-added calendar reminders/notes
let notices=[];
let messages=[];
let communications=[];
let deposits={};
let communicationNextId=1;
try{ window.communications=communications; }catch(_e){}
let reconciliations=[]; // bank reconciliation runs (see reconciliation.js)
let reconciliationNextId=1;
try{ window.reconciliations=reconciliations; }catch(_e){}
let applications=[]; // tenant rental applications (see applications.js)
try{ window.applications=applications; }catch(_e){}
let utilityReadings=[]; // tenant meter submissions
let whatsappLog=[]; // last 50 WhatsApp actions
let rentIncreases=[]; // rent increase history
let inspections=[]; // property inspection manager
let vacancyRecords=[]; // {id,propertyId,propertyName,tenantId,tenantName,vacancyStart,vacatedAt} from move-out workflow
let lateFees=[]; // late fee ledger (see latefees.js)
const landlordSettings={
  name:'',
  phone:'',
  email:'',
  emergencyPhone:'',
  companyName:'',
  bankName:'',
  accountNumber:'',
  branchCode:'',
  accountType:'Cheque',
  paymentReferenceFormat:'[TenantName]-[Month]-[Year]',
  portalWelcomeMessage:'Welcome to your tenant portal',
  emailjs:{
    publicKey:'',
    serviceId:'',
    templates:{
      rentReminder:'',
      paymentReceipt:'',
      overdueNotice:'',
      leaseExpiry:'',
      maintenanceUpdate:'',
      welcomeTenant:'',
      customMessage:''
    }
  },
  gemini:{
    apiKey:'',
    model:'gemini-1.5-flash'
  },
  lateFeePolicy:{
    type:'fixed',
    amount:250,
    percentage:10,
    gracePeriodDays:3,
    maximumFee:1000,
    compound:false,
    compoundDays:7
  }
};

// Demo mode is disabled project-wide: clear any leftover flags and never seed.
(function nestiqDisableDemoModeForever(){
  try{
    localStorage.removeItem('nestiq-demo-mode');
    localStorage.removeItem('nestiq-demo-seeded');
  }catch(_e){}
  try{
    const raw=sessionStorage.getItem('nestiq-session');
    if(!raw) return;
    const s=JSON.parse(raw);
    if(s&&s.demoMode){
      delete s.demoMode;
      sessionStorage.setItem('nestiq-session', JSON.stringify(s));
    }
  }catch(_e){}
  try{ document.getElementById('demoBanner')?.remove(); }catch(_e){}
})();

// ── Demo seed disabled (kept as no-op so old cachebust refs stay harmless) ──
(function nestiqSeedDemoIfNeeded(){
  return;
  try{
    if(localStorage.getItem('nestiq-demo-mode')!=='1') return;
    if(localStorage.getItem('nestiq-demo-seeded')==='1') return;

    const today=new Date().toISOString().slice(0,10);
    const daysAgo=(n)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
    const monthsAgo=(n)=>{
      const d=new Date();
      d.setMonth(d.getMonth()-n);
      return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);
    };
    const lfMonthKeySafe=(monthsBack)=>{
      const d=new Date();
      d.setMonth(d.getMonth()-monthsBack);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };

    // Properties
    propertiesData.push(
      {id:'demo-prop-1',landlordId:'demo-landlord',
        name:'Riverside Gardens Unit 3',addr:'12 Riverside Drive, Sandton, Johannesburg',
        type:'Apartment',bedrooms:2,bathrooms:1,parking:1,floorSize:65,
        rent:8500,deposit:17000,levy:850,status:'occupied',
        leaseStart:'2024-03-01',leaseEnd:'2026-02-28',
        tenantName:'Thabo Nkosi',tenantEmail:'thabo@email.com',
        amenities:['security','fibre','parking','laundry'],publicListing:false},
      {id:'demo-prop-2',landlordId:'demo-landlord',
        name:'Sunset View Townhouse',addr:'45 Sunset Boulevard, Pretoria East',
        type:'Townhouse',bedrooms:3,bathrooms:2,parking:2,floorSize:120,
        rent:14500,deposit:29000,levy:1200,status:'occupied',
        leaseStart:'2023-08-01',leaseEnd:'2025-07-31',
        tenantName:'Sarah Dlamini',tenantEmail:'sarah@email.com',
        amenities:['pool','garden','security','fibre','garage'],publicListing:false},
      {id:'demo-prop-3',landlordId:'demo-landlord',
        name:'Cape Quarter Studio',addr:'8 De Waterkant Street, Cape Town',
        type:'Bachelor',bedrooms:1,bathrooms:1,parking:0,floorSize:38,
        rent:7200,deposit:14400,levy:650,status:'vacant',
        leaseStart:null,leaseEnd:null,tenantName:null,tenantEmail:null,
        amenities:['security','fibre','air-conditioning'],publicListing:true},
      {id:'demo-prop-4',landlordId:'demo-landlord',
        name:'Durban North House',addr:'23 Palm Avenue, Durban North, KZN',
        type:'House',bedrooms:4,bathrooms:2,parking:2,floorSize:210,
        rent:18000,deposit:36000,levy:0,status:'maintenance',
        leaseStart:'2024-01-01',leaseEnd:'2025-12-31',
        tenantName:'Pieter van der Merwe',tenantEmail:'pieter@email.com',
        amenities:['pool','garden','garage','security','pet-friendly'],publicListing:false}
    );

    // Tenants
    tenantsData.push(
      {id:'demo-t-1',landlordId:'demo-landlord',propertyId:'demo-prop-1',
        name:'Thabo Nkosi',email:'thabo@email.com',phone:'0821234567',
        idNumber:'9001015800085',leaseStart:'2024-03-01',leaseEnd:'2026-02-28',
        rent:8500,deposit:17000,status:'paid',lastPaymentDate:today,
        property:'Riverside Gardens Unit 3',unit:'Unit 3',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:true,daysOverdue:0},
      {id:'demo-t-2',landlordId:'demo-landlord',propertyId:'demo-prop-2',
        name:'Sarah Dlamini',email:'sarah@email.com',phone:'0839876543',
        idNumber:'9205120900083',leaseStart:'2023-08-01',leaseEnd:'2025-07-31',
        rent:14500,deposit:29000,status:'overdue',lastPaymentDate:null,
        property:'Sunset View Townhouse',unit:'Unit',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:true,daysOverdue:12},
      {id:'demo-t-3',landlordId:'demo-landlord',propertyId:'demo-prop-4',
        name:'Pieter van der Merwe',email:'pieter@email.com',phone:'0765559876',
        idNumber:'8803085200087',leaseStart:'2024-01-01',leaseEnd:'2025-12-31',
        rent:18000,deposit:36000,status:'due-soon',lastPaymentDate:null,
        property:'Durban North House',unit:'House',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:false,daysOverdue:0},
      {id:'demo-t-4',landlordId:'demo-landlord',propertyId:'demo-prop-1',
        name:'Nomsa Khumalo',email:'nomsa@email.com',phone:'0714445678',
        idNumber:'9508250600081',leaseStart:'2024-06-01',leaseEnd:'2025-05-31',
        rent:8500,deposit:17000,status:'paid',lastPaymentDate:today,
        property:'Riverside Gardens Unit 3',unit:'Unit',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:false,daysOverdue:0},
      {id:'demo-t-5',landlordId:'demo-landlord',propertyId:'demo-prop-2',
        name:'Ahmed Patel',email:'ahmed@email.com',phone:'0823336789',
        idNumber:'8712301800086',leaseStart:'2023-08-01',leaseEnd:'2025-07-31',
        rent:14500,deposit:29000,status:'paid',lastPaymentDate:today,
        property:'Sunset View Townhouse',unit:'Unit',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:true,daysOverdue:0},
      {id:'demo-t-6',landlordId:'demo-landlord',propertyId:'demo-prop-4',
        name:'Lerato Molefe',email:'lerato@email.com',phone:'0796667890',
        idNumber:'9311155400082',leaseStart:'2024-01-01',leaseEnd:'2025-12-31',
        rent:18000,deposit:36000,status:'overdue',lastPaymentDate:null,
        property:'Durban North House',unit:'House',monthlyDueDate:1,payments:[],avatar:'👤',
        hasPortalAccess:false,daysOverdue:7}
    );

    // Maintenance requests
    maintenanceData.push(
      {id:'demo-m-1',landlordId:'demo-landlord',propertyId:'demo-prop-1',
        tenantId:'demo-t-1',title:'Leaking kitchen tap',category:'Plumbing',issueCategory:'Plumbing',
        urgency:'Medium',priority:'Medium',description:'Kitchen tap has been dripping for 3 days.',
        status:'open',col:'open',property:'Riverside Gardens Unit 3',date:daysAgo(3),createdAt:daysAgo(3)},
      {id:'demo-m-2',landlordId:'demo-landlord',propertyId:'demo-prop-2',
        tenantId:'demo-t-2',title:'Geyser not heating water',category:'Electrical',issueCategory:'Electrical',
        urgency:'High',priority:'High',description:'No hot water since yesterday morning.',
        status:'progress',col:'progress',vendorName:'Themba Plumbers',vendorId:1,
        property:'Sunset View Townhouse',date:daysAgo(7),createdAt:daysAgo(7)},
      {id:'demo-m-3',landlordId:'demo-landlord',propertyId:'demo-prop-4',
        tenantId:'demo-t-3',title:'Broken gate motor',category:'Security',issueCategory:'Other',
        urgency:'High',priority:'High',description:'Electric gate motor failed. Cannot open gate.',
        status:'open',col:'open',property:'Durban North House',date:daysAgo(1),createdAt:daysAgo(1)},
      {id:'demo-m-4',landlordId:'demo-landlord',propertyId:'demo-prop-1',
        tenantId:'demo-t-1',title:'Cracked bathroom tiles',category:'General',issueCategory:'Other',
        urgency:'Low',priority:'Low',description:'Two tiles cracked near the shower.',
        status:'done',col:'done',tenantRating:4,vendorRating:4,
        property:'Riverside Gardens Unit 3',date:daysAgo(14),createdAt:daysAgo(14),completedDate:daysAgo(5),resolvedAt:daysAgo(5)},
      {id:'demo-m-5',landlordId:'demo-landlord',propertyId:'demo-prop-2',
        tenantId:'demo-t-5',title:'Stairwell light bulb replacement',category:'Electrical',issueCategory:'Electrical',
        urgency:'Low',priority:'Low',description:'Stairwell light has been out for a week.',
        status:'done',col:'done',tenantRating:5,vendorRating:5,
        property:'Sunset View Townhouse',date:daysAgo(10),createdAt:daysAgo(10),completedDate:daysAgo(8),resolvedAt:daysAgo(8)}
    );

    // 12 months of payments for Thabo (paid) and Ahmed (paid)
    ['demo-t-1','demo-t-5'].forEach((tid)=>{
      const rentAmt=tid==='demo-t-1'?8500:14500;
      const propId=tid==='demo-t-1'?'demo-prop-1':'demo-prop-2';
      Array.from({length:12},(_,i)=>{
        allPayments.push({
          id:`demo-pay-${tid}-${i}`,
          landlordId:'demo-landlord',tenantId:tid,propertyId:propId,
          amount:rentAmt,method:'EFT',
          reference:`EFT-${Math.random().toString(36).substr(2,8).toUpperCase()}`,
          date:monthsAgo(i),
          month:(()=>{const d=new Date();d.setMonth(d.getMonth()-i);return d.toLocaleString('en-ZA',{month:'long',year:'numeric'});})(),
          status:'paid'
        });
      });
    });
    paymentsData.push(...allPayments);

    // Expenses — 6 months across properties
    expenses.push(
      {id:1,landlordId:'demo-landlord',propertyId:'demo-prop-1',
        category:'Maintenance',cat:'Maintenance',amount:1200,date:daysAgo(5),
        description:'Plumber call-out fee',desc:'Plumber call-out fee',prop:'Riverside Gardens Unit 3',color:catColors.Maintenance},
      {id:2,landlordId:'demo-landlord',propertyId:'demo-prop-2',
        category:'Insurance',cat:'Insurance',amount:3400,date:daysAgo(15),
        description:'Monthly building insurance',desc:'Monthly building insurance',prop:'Sunset View Townhouse',color:catColors.Insurance},
      {id:3,landlordId:'demo-landlord',propertyId:'demo-prop-1',
        category:'Rates & Taxes',cat:'Rates & Taxes',amount:2100,date:daysAgo(20),
        description:'Municipal rates',desc:'Municipal rates',prop:'Riverside Gardens Unit 3',color:catColors['Rates & Taxes']},
      {id:4,landlordId:'demo-landlord',propertyId:'demo-prop-4',
        category:'Maintenance',cat:'Maintenance',amount:4500,date:daysAgo(30),
        description:'Gate motor replacement',desc:'Gate motor replacement',prop:'Durban North House',color:catColors.Maintenance},
      {id:5,landlordId:'demo-landlord',propertyId:'demo-prop-2',
        category:'Rates & Taxes',cat:'Rates & Taxes',amount:2800,date:daysAgo(35),
        description:'Municipal rates',desc:'Municipal rates',prop:'Sunset View Townhouse',color:catColors['Rates & Taxes']},
      {id:6,landlordId:'demo-landlord',propertyId:'demo-prop-3',
        category:'Utilities',cat:'Utilities',amount:950,date:daysAgo(40),
        description:'Water and lights (vacant)',desc:'Water and lights (vacant)',prop:'Cape Quarter Studio',color:catColors.Utilities},
      {id:7,landlordId:'demo-landlord',propertyId:'demo-prop-1',
        category:'Insurance',cat:'Insurance',amount:3400,date:daysAgo(45),
        description:'Monthly building insurance',desc:'Monthly building insurance',prop:'Riverside Gardens Unit 3',color:catColors.Insurance},
      {id:8,landlordId:'demo-landlord',propertyId:'demo-prop-4',
        category:'Agent Fees',cat:'Agent Fees',amount:5400,date:daysAgo(60),
        description:'Letting agent commission',desc:'Letting agent commission',prop:'Durban North House',color:catColors['Agent Fees']}
    );
    expNextId=9;

    // Applications — 2 pending for vacant property
    applications.push(
      {id:'APP-2026-4F3A21',landlordId:'demo-landlord',propertyId:'demo-prop-3',
        propertyName:'Cape Quarter Studio',applicantName:'Zanele Mokoena',
        firstName:'Zanele',lastName:'Mokoena',
        email:'zanele@email.com',phone:'0841112233',idNumber:'9407150800089',
        employmentStatus:'Permanent',netIncome:22000,monthlyNetIncome:22000,rent:7200,listingMonthlyRent:7200,
        agreedToTerms:true,status:'pending',
        createdAt:daysAgo(3),applicationDate:daysAgo(3),source:'public',applicationSource:'public'},
      {id:'APP-2026-7B9C14',landlordId:'demo-landlord',propertyId:'demo-prop-3',
        propertyName:'Cape Quarter Studio',applicantName:'Sipho Dube',
        firstName:'Sipho',lastName:'Dube',
        email:'sipho@email.com',phone:'0729998877',idNumber:'9812204500083',
        employmentStatus:'Contract',netIncome:18000,monthlyNetIncome:18000,rent:7200,listingMonthlyRent:7200,
        agreedToTerms:true,status:'reviewing',
        createdAt:daysAgo(7),applicationDate:daysAgo(7),source:'public',applicationSource:'public'}
    );

    // Notices
    notices.push(
      {id:'demo-n-1',landlordId:'demo-landlord',propertyId:'all',
        title:'Water Interruption — All Properties',
        body:'Municipality has scheduled a water interruption on Saturday 8am–2pm. Please store water in advance.',
        message:'Municipality has scheduled a water interruption on Saturday 8am–2pm. Please store water in advance.',
        date:daysAgo(3),createdAt:daysAgo(3),type:'info',postedBy:'NestIQ Demo',readBy:[]},
      {id:'demo-n-2',landlordId:'demo-landlord',propertyId:'demo-prop-1',
        title:'Annual Rent Escalation Notice',
        body:'As per your lease agreement, rent will increase by 8% (CPI-linked) effective 1 March 2026. New rent: R9,180.',
        message:'As per your lease agreement, rent will increase by 8% (CPI-linked) effective 1 March 2026. New rent: R9,180.',
        date:daysAgo(30),createdAt:daysAgo(30),type:'warning',postedBy:'NestIQ Demo',readBy:[]},
      {id:'demo-n-3',landlordId:'demo-landlord',propertyId:'demo-prop-2',
        title:'Upcoming Annual Inspection',
        body:'Your annual property inspection is scheduled for 20 July 2026 at 10:00am. Please ensure access is available.',
        message:'Your annual property inspection is scheduled for 20 July 2026 at 10:00am. Please ensure access is available.',
        date:daysAgo(7),createdAt:daysAgo(7),type:'info',postedBy:'NestIQ Demo',readBy:[]}
    );

    // Vendors (numeric ids + app field names so normalizeDataModel keeps them)
    vendors.push(
      {id:1,name:'Themba Plumbers',trade:'Plumber',type:'Plumber',phone:'0821115555',
        email:'themba@plumbers.co.za',rating:5,ratingCount:1,jobsDone:8,jobsCompleted:8,lastUsed:daysAgo(7),active:true,whatsapp:'0821115555'},
      {id:2,name:'Bright Spark Electrical',trade:'Electrician',type:'Electrician',phone:'0833334444',
        email:'info@brightspark.co.za',rating:4,ratingCount:1,jobsDone:3,jobsCompleted:3,lastUsed:daysAgo(14),active:true,whatsapp:'0833334444'},
      {id:3,name:'SecureGate Solutions',trade:'Security',type:'Security',phone:'0116667777',
        email:'support@securegate.co.za',rating:4,ratingCount:1,jobsDone:2,jobsCompleted:2,lastUsed:daysAgo(30),active:true,whatsapp:'0116667777'}
    );
    vendorNextId=4;

    // Late fees
    lateFees.push(
      {id:'demo-lf-1',landlordId:'demo-landlord',tenantId:'demo-t-2',
        tenantName:'Sarah Dlamini',propertyId:'demo-prop-2',propertyName:'Sunset View Townhouse',
        feeAmount:250,lateFeeAmount:250,rentDueDate:monthsAgo(0),daysLate:12,daysOverdue:12,
        appliedOn:daysAgo(9),status:'outstanding',month:lfMonthKeySafe(0),
        collected:false,waived:false},
      {id:'demo-lf-2',landlordId:'demo-landlord',tenantId:'demo-t-6',
        tenantName:'Lerato Molefe',propertyId:'demo-prop-4',propertyName:'Durban North House',
        feeAmount:250,lateFeeAmount:250,rentDueDate:monthsAgo(0),daysLate:7,daysOverdue:7,
        appliedOn:daysAgo(4),status:'outstanding',month:lfMonthKeySafe(0),
        collected:false,waived:false},
      {id:'demo-lf-3',landlordId:'demo-landlord',tenantId:'demo-t-2',
        tenantName:'Sarah Dlamini',propertyId:'demo-prop-2',propertyName:'Sunset View Townhouse',
        feeAmount:250,lateFeeAmount:250,rentDueDate:monthsAgo(1),daysLate:15,daysOverdue:15,
        appliedOn:daysAgo(42),status:'paid',month:lfMonthKeySafe(1),
        collected:true,collectedDate:daysAgo(30),waived:false}
    );

    // Landlord settings for demo
    landlordSettings.name='Demo Landlord';
    landlordSettings.email='demo@nestiq.co.za';
    landlordSettings.phone='0821234567';
    landlordSettings.companyName='Demo Properties (Pty) Ltd';
    landlordName='Demo Landlord';
    landlordEmail='demo@nestiq.co.za';

    propertiesLoading=false;
    tenantsLoading=false;
    expensesLoading=false;

    try{ window.propertiesData=propertiesData; }catch(_e){}
    try{ window.tenantsData=tenantsData; }catch(_e){}
    try{ window.vendors=vendors; }catch(_e){}
    try{ window.lateFees=lateFees; }catch(_e){}
    try{ window.applications=applications; }catch(_e){}

    localStorage.setItem('nestiq-demo-seeded','1');
    console.log('[NestIQ Demo] Seed complete — 4 properties, 6 tenants, 5 maintenance, 2 applications');
  }catch(err){
    console.warn('[NestIQ Demo] Seed failed:',err);
  }
})();

/* ═══════════════════════════════
   PERSISTENCE — Firebase Firestore (see firebase-db.js)
   localStorage: theme / language / onboarding / notification prefs only
═══════════════════════════════ */

const NESTIQ_LS_PROPERTIES='nestiq-properties';
const NESTIQ_LS_TENANTS='nestiq-tenants';
const NESTIQ_LS_MAINTENANCE='nestiq-maintenance';
const NESTIQ_LS_PAYMENTS='nestiq-payments';
const NESTIQ_LS_EXPENSES='nestiq-expenses';
const NESTIQ_LS_NOTICES='nestiq-notices';
const NESTIQ_LS_APPLICATIONS='nestiq-applications';
const NESTIQ_LS_DEMO_SEEDED='nestiq-demo-seeded';

function nestiqIsLocalDemoMode(){
  return false;
}

/** @deprecated Demo seed now runs immediately via nestiqSeedDemoIfNeeded IIFE above. */
function nestiqSeedDemoDataIfEmpty(){
  try{
    if(localStorage.getItem(NESTIQ_LS_DEMO_SEEDED)==='1') return;
    if(localStorage.getItem('nestiq-demo-seeded')==='1') return;
  }catch(_e){}
}

function saveDataFromLocalStorage(){
  // Demo mode should not persist sample data edits.
  if(nestiqIsLocalDemoMode()) return;
  propertyPhotos=propertyPhotos||photos||{};
  photos=propertyPhotos;
  try{ localStorage.setItem(NESTIQ_LS_PROPERTIES, JSON.stringify(propertiesData||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_TENANTS, JSON.stringify(tenantsData||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_MAINTENANCE, JSON.stringify(maintenanceData||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_PAYMENTS, JSON.stringify(paymentsData||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_EXPENSES, JSON.stringify(expenses||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_APPLICATIONS, JSON.stringify(applications||[])); }catch(_e){}
  try{ localStorage.setItem(NESTIQ_LS_NOTICES, JSON.stringify(notices||[])); }catch(_e){}
  localStorage.setItem('nestiq-propertyPhotos', JSON.stringify(propertyPhotos));
  localStorage.setItem('nestiq-photos', JSON.stringify(propertyPhotos));
  localStorage.setItem('nestiq-maintenancePhotos', JSON.stringify(maintenancePhotos));
  localStorage.setItem('nestiq-emailConfig', JSON.stringify(emailConfig));
  localStorage.setItem('nestiq-landlordEmail', landlordEmail||'');
  localStorage.setItem('nestiq-landlordName', landlordName||'');
  localStorage.setItem('nestiq-sentReminderMonths', JSON.stringify(sentReminderMonths||{}));
  localStorage.setItem('nestiq-emailLog', JSON.stringify(emailLog||[]));
  localStorage.setItem('nestiq-geminiApiKey', geminiApiKey||'');
  localStorage.setItem('nestiq-customEvents', JSON.stringify(customEvents||[]));
  localStorage.setItem('nestiq-communication-next-id', String(communicationNextId||1));
  localStorage.setItem('nestiq-reconciliations', JSON.stringify(reconciliations||[]));
  localStorage.setItem('nestiq-reconciliation-next-id', String(reconciliationNextId||1));
  localStorage.setItem('nestiq-utilityReadings', JSON.stringify(utilityReadings||[]));
  localStorage.setItem('nestiq-whatsappLog', JSON.stringify(whatsappLog||[]));
  localStorage.setItem('nestiq-rentIncreases', JSON.stringify(rentIncreases||[]));
  localStorage.setItem('nestiq-vacancy-records', JSON.stringify(vacancyRecords||[]));
  localStorage.setItem('nestiq-late-fees', JSON.stringify(lateFees||[]));
  try{ window.lateFees=lateFees; }catch(_e){}
  try{ window.vendors=vendors; }catch(_e){}
  try{ window.applications=applications; }catch(_e){}
  if(typeof checkStorageUsageWarn==='function') checkStorageUsageWarn();
  if(typeof refreshNestiqCalendar==='function') refreshNestiqCalendar();
}
function loadDataFromLocalStorage(){
  try{
    try{
      // Demo seed runs at script load; don't overwrite in-memory demo data from stale LS bags.
      if(!nestiqIsLocalDemoMode()){
        const pRaw=localStorage.getItem(NESTIQ_LS_PROPERTIES);
        if(pRaw){
          const pList=JSON.parse(pRaw);
          if(Array.isArray(pList)) propertiesData=pList;
        }
        const tRaw=localStorage.getItem(NESTIQ_LS_TENANTS);
        if(tRaw){
          const tList=JSON.parse(tRaw);
          if(Array.isArray(tList)) tenantsData=tList;
        }
        const mRaw=localStorage.getItem(NESTIQ_LS_MAINTENANCE);
        if(mRaw){
          const mList=JSON.parse(mRaw);
          if(Array.isArray(mList)) maintenanceData=mList;
        }
        const payRaw=localStorage.getItem(NESTIQ_LS_PAYMENTS);
        if(payRaw){
          const payList=JSON.parse(payRaw);
          if(Array.isArray(payList)) paymentsData=payList;
        }
        const expRaw=localStorage.getItem(NESTIQ_LS_EXPENSES);
        if(expRaw){
          const expList=JSON.parse(expRaw);
          if(Array.isArray(expList)) expenses=expList;
        }
        const appRaw=localStorage.getItem(NESTIQ_LS_APPLICATIONS);
        if(appRaw){
          const appList=JSON.parse(appRaw);
          if(Array.isArray(appList)) applications=appList;
        }
        const notRaw=localStorage.getItem(NESTIQ_LS_NOTICES);
        if(notRaw){
          const notList=JSON.parse(notRaw);
          if(Array.isArray(notList)) notices=notList;
        }
      }
    }catch(_e){}
    const phNew=localStorage.getItem('nestiq-propertyPhotos');
    const phOld=localStorage.getItem('nestiq-photos');
    if(phNew) propertyPhotos=JSON.parse(phNew);
    else if(phOld) propertyPhotos=JSON.parse(phOld);
    photos=propertyPhotos;
    const mh=localStorage.getItem('nestiq-maintenancePhotos');
    if(mh) maintenancePhotos=JSON.parse(mh);
    const ec=localStorage.getItem('nestiq-emailConfig');
    if(ec) Object.assign(emailConfig, JSON.parse(ec));
    landlordEmail=localStorage.getItem('nestiq-landlordEmail')||'';
    landlordName=localStorage.getItem('nestiq-landlordName')||'';
    const srm=localStorage.getItem('nestiq-sentReminderMonths');
    if(srm) sentReminderMonths=JSON.parse(srm);
    const elog=localStorage.getItem('nestiq-emailLog');
    if(elog) emailLog=JSON.parse(elog);
    geminiApiKey=localStorage.getItem('nestiq-geminiApiKey')||'';
    const ce=localStorage.getItem('nestiq-customEvents');
    if(ce) customEvents=JSON.parse(ce);
    if(!Array.isArray(communications)) communications=[];
    const cnid=localStorage.getItem('nestiq-communication-next-id');
    if(cnid) communicationNextId=Math.max(1,parseInt(cnid,10)||1);
    const rec=localStorage.getItem('nestiq-reconciliations');
    if(rec) reconciliations=JSON.parse(rec);
    if(!Array.isArray(reconciliations)) reconciliations=[];
    const recnid=localStorage.getItem('nestiq-reconciliation-next-id');
    if(recnid) reconciliationNextId=Math.max(1,parseInt(recnid,10)||1);
    const ur=localStorage.getItem('nestiq-utilityReadings');
    if(ur) utilityReadings=JSON.parse(ur);
    const wl=localStorage.getItem('nestiq-whatsappLog');
    if(wl) whatsappLog=JSON.parse(wl);
    const ri=localStorage.getItem('nestiq-rentIncreases');
    if(ri) rentIncreases=JSON.parse(ri);
    const vr=localStorage.getItem('nestiq-vacancy-records');
    if(vr) vacancyRecords=JSON.parse(vr);
    if(!Array.isArray(vacancyRecords)) vacancyRecords=[];
    const lf=localStorage.getItem('nestiq-late-fees');
    if(lf&&!nestiqIsLocalDemoMode()) lateFees=JSON.parse(lf);
    if(!Array.isArray(lateFees)) lateFees=[];
    if(!Array.isArray(recurringExpenses)) recurringExpenses=[];
    if(!Array.isArray(vendors)) vendors=[];
    normalizeDataModel();
    try{ window.calculateDepositInterest?.(); }catch(_e){}
    try{ window.checkRecurringExpenses?.(); }catch(_e){}
  }catch(err){ console.warn('Load error',err); }
}

function saveData(){
  if(typeof window.nestiqScheduleSaveToFirestore === 'function' && window.nestiqDb){
    window.nestiqScheduleSaveToFirestore();
    if(typeof checkStorageUsageWarn==='function') checkStorageUsageWarn();
    if(typeof refreshNestiqCalendar==='function') refreshNestiqCalendar();
    return;
  }
  saveDataFromLocalStorage();
}
function loadData(){
  if(window.nestiqUseFirestore){
    return Promise.resolve();
  }
  loadDataFromLocalStorage();
  return Promise.resolve();
}

function normalizeUnitPassword(unit){
  return String(unit||'')
    .toLowerCase()
    .replace(/^unit\s*/,'')
    .replace(/\s+/g,'');
}

function safeLeaseEndIso(t){
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(t?.leaseEnd||''))) return t.leaseEnd;
  if(/available|tbd/i.test(String(t?.lease||''))) return '2026-12-31';
  const d=new Date(t?.lease);
  if(String(d)==='Invalid Date') return '2026-12-31';
  try{ return d.toISOString().slice(0,10); }catch(_e){ return '2026-12-31'; }
}

function normalizeDataModel(){
  if(!Array.isArray(tenantsData)) tenantsData=[];
  else tenantsData=tenantsData.filter(t=>t&&typeof t==='object');
  const propByName=Object.fromEntries(propertiesData.map(p=>[p?.name,p]).filter(x=>x[0]));
  const tenantById=Object.fromEntries(tenantsData.map(t=>[String(t.id),t]));

  tenantsData=tenantsData.map(t=>{
    const property=propByName[t.property];
    const emailLc=String(t.email||'').toLowerCase();
    const tenantPayments=(t.payments&&Array.isArray(t.payments)) ? t.payments : [];
    const fromGlobal=(paymentsData||[])
      .filter(p=>String(p.tenantId)===String(t.id))
      .map((p,idx)=>({
        id:p.id||`${t.id}-${idx}-${p.date}`,
        amount:Number(p.amount||0),
        date:p.date,
        method:p.method||'EFT',
        receiptNo:p.receiptNo||'',
        status:String(p.status||'paid').toLowerCase(),
        month:new Date(p.date).toLocaleDateString('en-ZA',{month:'long',year:'numeric'})
      }));
    const leaseEndIso = safeLeaseEndIso(t);
    return {
      ...t,
      email:emailLc,
      propertyId: t.propertyId != null && t.propertyId !== '' ? t.propertyId : (property?.id ?? null),
      monthlyDueDate: Number.isFinite(Number(t.monthlyDueDate)) ? Number(t.monthlyDueDate) : 1,
      leaseStart: t.leaseStart || '2025-01-01',
      leaseEnd: leaseEndIso,
      payments: (tenantPayments.length ? tenantPayments : fromGlobal).map((p,idx)=>({
        id:p.id||idx+1,
        amount:Number(p.amount||0),
        date:p.date,
        method:p.method||'EFT',
        receiptNo:p.receiptNo||'',
        status:String(p.status||'paid').toLowerCase(),
        month:p.month||new Date(p.date).toLocaleDateString('en-ZA',{month:'long',year:'numeric'})
      })),
      unitPassword: normalizeUnitPassword(t.unit),
      deposit: typeof nestiqNormalizeTenantDeposit==='function'
        ? nestiqNormalizeTenantDeposit(t.deposit, t.rent)
        : (Number.isFinite(Number(t.deposit)) ? Number(t.deposit) : Number(t.rent||0)*2),
      leaseType: t.leaseType || 'Annual',
      parkingBay: t.parkingBay || '',
      amenities: Array.isArray(t.amenities)&&t.amenities.length ? t.amenities : [],
      emergencyContact: t.emergencyContact || ''
      ,
      preferredLanguage: ['en','af','zu','xh','st'].includes(String(t.preferredLanguage||'').toLowerCase()) ? String(t.preferredLanguage).toLowerCase() : 'en'
      ,
      preferredTheme: ['gold','ocean','forest','sunset','midnight','classic'].includes(String(t.preferredTheme||'').toLowerCase()) ? String(t.preferredTheme).toLowerCase() : 'gold',
      renewalStatus: (t.renewalStatus===undefined||t.renewalStatus==='') ? null : t.renewalStatus,
      pendingNewLease: (t.pendingNewLease&&typeof t.pendingNewLease==='object') ? t.pendingNewLease : null,
      movingOut: (t.movingOut&&typeof t.movingOut==='object') ? t.movingOut : null,
      renewalDraft: (t.renewalDraft&&typeof t.renewalDraft==='object') ? t.renewalDraft : null,
      renewalHistory: Array.isArray(t.renewalHistory) ? t.renewalHistory : []
    };
  });

  if(!Array.isArray(maintenanceData)) maintenanceData=[];
  maintenanceData=maintenanceData.map(m=>{
    const tenant=m.tenantId!=null&&m.tenantId!=='' ? tenantById[String(m.tenantId)] : null;
    const property=propertiesData.find(p=>String(p.id)===String(m.propertyId)) || propertiesData.find(p=>p.name===m.property) || (tenant ? propertiesData.find(p=>String(p.id)===String(tenant.propertyId)) : null);
    const est=Number(m.estimatedCost);
    const act=Number(m.actualCost);
    return {
      ...m,
      tenantId: m.tenantId!=null&&m.tenantId!=='' ? m.tenantId : (tenant?.id??null),
      propertyId: m.propertyId!=null&&m.propertyId!=='' ? m.propertyId : (property?.id??null),
      tenantName:m.tenantName || tenant?.name || '',
      estimatedCost:Number.isFinite(est)?est:0,
      actualCost:Number.isFinite(act)?act:0,
      vendorName:String(m.vendorName||''),
      vendorPhone:String(m.vendorPhone||''),
      vendorType:String(m.vendorType||''),
      invoiceNumber:String(m.invoiceNumber||''),
      costLinkedExpenseId:m.costLinkedExpenseId!=null&&m.costLinkedExpenseId!==''?String(m.costLinkedExpenseId):null,
      quotedDate:String(m.quotedDate||''),
      completedDate:String(m.completedDate||''),
      warrantyPeriod:String(m.warrantyPeriod||''),
      vendorId:Number.isFinite(Number(m.vendorId))?Number(m.vendorId):null,
      issueCategory:String(m.issueCategory||'Other'),
      vendorRating:Number.isFinite(Number(m.vendorRating))&&Number(m.vendorRating)>=1&&Number(m.vendorRating)<=5?Number(m.vendorRating):null,
      vendorRatingNotes:String(m.vendorRatingNotes||''),
      ratedDate:String(m.ratedDate||'')
    };
  });

  notices=notices.map(n=>({...n,readBy:Array.isArray(n.readBy)?n.readBy:(n.readByTenantIds||[])}));
  if(!Array.isArray(utilityReadings)) utilityReadings=[];
  if(!Array.isArray(rentIncreases)) rentIncreases=[];
  if(!Array.isArray(inspections)) inspections=[];
  if(!landlordSettings.gemini || typeof landlordSettings.gemini!=='object') landlordSettings.gemini={};
  landlordSettings.gemini.apiKey=String(landlordSettings.gemini.apiKey||geminiApiKey||'');
  landlordSettings.gemini.model=String(landlordSettings.gemini.model||'gemini-1.5-flash');
  geminiApiKey=landlordSettings.gemini.apiKey;
  if(!landlordSettings.emailjs || typeof landlordSettings.emailjs!=='object') landlordSettings.emailjs={};
  landlordSettings.emailjs.publicKey=String(landlordSettings.emailjs.publicKey||'');
  landlordSettings.emailjs.serviceId=String(landlordSettings.emailjs.serviceId||'');
  landlordSettings.emailjs.testEmail=String(landlordSettings.emailjs.testEmail||'');
  const tpl=landlordSettings.emailjs.templates||{};
  landlordSettings.emailjs.templates={
    rentReminder:String(tpl.rentReminder||''),
    paymentReceipt:String(tpl.paymentReceipt||''),
    overdueNotice:String(tpl.overdueNotice||''),
    leaseExpiry:String(tpl.leaseExpiry||''),
    maintenanceUpdate:String(tpl.maintenanceUpdate||''),
    welcomeTenant:String(tpl.welcomeTenant||''),
    customMessage:String(tpl.customMessage||'')
  };
  // Back-compat alias for older UI that expects landlordSettings.portal.* fields.
  const po=landlordSettings.portal&&typeof landlordSettings.portal==='object'?landlordSettings.portal:{};
  landlordSettings.portal={
    welcomeMessage:String(po.welcomeMessage||landlordSettings.portalWelcomeMessage||'Welcome to your tenant portal'),
    bankName:String(po.bankName||landlordSettings.bankName||''),
    accountNumber:String(po.accountNumber||landlordSettings.accountNumber||''),
    branchCode:String(po.branchCode||landlordSettings.branchCode||''),
    accountType:(po.accountType||landlordSettings.accountType)==='Savings'?'Savings':'Cheque',
    paymentReferenceFormat:String(po.paymentReferenceFormat||landlordSettings.paymentReferenceFormat||'[TenantName]-[Month]-[Year]')
  };
  propertiesData=propertiesData.map(p=>{
    const o={...p};
    o.lat=Number.isFinite(Number(o.lat)) ? Number(o.lat) : null;
    o.lng=Number.isFinite(Number(o.lng)) ? Number(o.lng) : null;
    return typeof nestiqNormalizePropertyValuation==='function'?nestiqNormalizePropertyValuation(o):o;
  });
  if(!propertyPhotos || typeof propertyPhotos!=='object') propertyPhotos={};
  if(!maintenancePhotos || typeof maintenancePhotos!=='object') maintenancePhotos={};
  photos=propertyPhotos;
  if(!Array.isArray(vacancyRecords)) vacancyRecords=[];
  try{ window.vacancyRecords=vacancyRecords; }catch(_e){}
  if(Array.isArray(window.lateFees)){
    lateFees.splice(0,lateFees.length,...window.lateFees);
  }
  if(!Array.isArray(lateFees)) lateFees=[];
  try{ window.lateFees=lateFees; }catch(_e){}
  if(Array.isArray(window.vendors)){
    vendors.splice(0,vendors.length,...window.vendors);
  }
  if(Number.isFinite(Number(window.vendorNextId))) vendorNextId=Math.max(1,Number(window.vendorNextId));
  if(!Array.isArray(vendors)) vendors=[];
  vendors=vendors.map(v=>({
    id:Number(v.id)||0,
    name:String(v.name||''),
    company:String(v.company||''),
    type:String(v.type||'Other'),
    phone:String(v.phone||''),
    email:String(v.email||''),
    whatsapp:String(v.whatsapp||v.phone||''),
    address:String(v.address||''),
    rating:Math.min(5,Math.max(0,Number(v.rating)||0)),
    ratingCount:Math.max(0,Math.round(Number(v.ratingCount)||0)),
    preferredFor:Array.isArray(v.preferredFor)?v.preferredFor.map(x=>Number(x)).filter(Number.isFinite):[],
    notes:String(v.notes||''),
    bankName:String(v.bankName||''),
    accountNumber:String(v.accountNumber||''),
    branchCode:String(v.branchCode||''),
    accountType:v.accountType==='Savings'?'Savings':'Cheque',
    vatNumber:String(v.vatNumber||''),
    active:v.active!==false,
    jobsCompleted:Math.max(0,Math.round(Number(v.jobsCompleted)||0)),
    totalCostBilled:Math.max(0,Number(v.totalCostBilled)||0),
    createdAt:String(v.createdAt||new Date().toISOString().slice(0,10)),
    lastUsed:String(v.lastUsed||'')
  })).filter(v=>v.id>0);
  if(!vendorNextId||vendorNextId<1) vendorNextId=1;
  const maxVid=vendors.reduce((s,v)=>Math.max(s,v.id),0);
  if(vendorNextId<=maxVid) vendorNextId=maxVid+1;
  vendors=vendors.map(v=>{
    const jobs=(maintenanceData||[]).filter(m=>Number(m.vendorId)===Number(v.id)&&m.status==='done');
    const rated=jobs.filter(m=>Number(m.vendorRating)>=1&&Number(m.vendorRating)<=5);
    let rating=0;
    let ratingCount=0;
    if(rated.length){
      rating=rated.reduce((s,m)=>s+Number(m.vendorRating),0)/rated.length;
      ratingCount=rated.length;
    }else if(Number(v.rating)>0){
      rating=Number(v.rating);
      ratingCount=Math.max(0,Number(v.ratingCount)||1);
    }
    const lastDates=jobs.map(m=>String(m.completedDate||m.date||'')).filter(Boolean).sort((a,b)=>b.localeCompare(a));
    const lastUsed=lastDates[0]||v.lastUsed||'';
    return{
      ...v,
      jobsCompleted:jobs.length,
      totalCostBilled:jobs.reduce((s,m)=>s+(Number(m.actualCost)||0),0),
      rating,
      ratingCount,
      lastUsed
    };
  });
  try{ window.vendors=vendors; }catch(_e){}
  try{ window.vendorNextId=vendorNextId; }catch(_e){}
  const lfp=landlordSettings.lateFeePolicy&&typeof landlordSettings.lateFeePolicy==='object'?landlordSettings.lateFeePolicy:{};
  const lfType=lfp.type==='percentage'?'percentage':'fixed';
  const lfAmt=Math.max(0,Number(lfp.amount ?? lfp.fixedAmount ?? 250));
  const lfGrace=Math.max(0,Number(lfp.gracePeriodDays ?? lfp.graceDays ?? 3));
  const lfMax=Math.max(0,Number(lfp.maximumFee ?? lfp.maxAmount ?? 1000));
  const lfCompound=Boolean(lfp.compound ?? lfp.compoundEnabled);
  landlordSettings.lateFeePolicy={
    type:lfType,
    amount:lfAmt,
    percentage:Math.max(0,Number(lfp.percentage ?? 10)),
    gracePeriodDays:lfGrace,
    maximumFee:lfMax,
    compound:lfCompound,
    compoundDays:Math.max(1,Number(lfp.compoundDays ?? 7)),
    // Back-compat keys used by older modules
    fixedAmount:lfAmt,
    graceDays:lfGrace,
    maxEnabled:true,
    maxAmount:lfMax,
    compoundEnabled:lfCompound
  };
  if(!Array.isArray(recurringExpenses)) recurringExpenses=[];
  recurringExpenses=recurringExpenses.map(r=>{
    const freq=['monthly','quarterly','annual'].includes(String(r.frequency))?String(r.frequency):'monthly';
    const dom=Math.min(28,Math.max(1,Math.round(Number(r.dayOfMonth)||1)));
    return{
      id:Number(r.id)||0,
      cat:String(r.cat||'Other'),
      desc:String(r.desc||''),
      amount:Math.max(0,Number(r.amount)||0),
      prop:String(r.prop||''),
      propertyId:Number.isFinite(Number(r.propertyId))?Number(r.propertyId):null,
      frequency:freq,
      dayOfMonth:dom,
      startDate:/^\d{4}-\d{2}-\d{2}$/.test(String(r.startDate||''))?String(r.startDate):new Date().toISOString().slice(0,10),
      endDate:r.endDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.endDate))?String(r.endDate):null,
      lastGenerated:r.lastGenerated&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.lastGenerated))?String(r.lastGenerated):'',
      active:r.active!==false,
      createdAt:String(r.createdAt||new Date().toISOString().slice(0,10))
    };
  }).filter(r=>r.id>0);
  const maxReId=recurringExpenses.reduce((s,r)=>Math.max(s,r.id),0);
  if(recurringExpenseNextId<=maxReId) recurringExpenseNextId=maxReId+1;
  if(!recurringExpenseNextId||recurringExpenseNextId<1) recurringExpenseNextId=1;
  const wn=Number(window.recurringExpenseNextId);
  if(Number.isFinite(wn)) recurringExpenseNextId=Math.max(recurringExpenseNextId,wn);
  try{ window.expenses=expenses; }catch(_e){}
  try{ window.recurringExpenses=recurringExpenses; }catch(_e){}
  try{ window.recurringExpenseNextId=recurringExpenseNextId; }catch(_e){}
  if(!Array.isArray(communications)) communications=[];
  const commTypes=['whatsapp','email','call','sms','in-person','notice','letter','other'];
  communications=communications.map(c=>({
    id:Number(c.id)||0,
    tenantId:c.tenantId!=null?Number(c.tenantId):null,
    tenantName:String(c.tenantName||''),
    propertyId:c.propertyId!=null&&Number.isFinite(Number(c.propertyId))?Number(c.propertyId):null,
    type:commTypes.includes(c.type)?c.type:'other',
    direction:c.direction==='incoming'?'incoming':'outgoing',
    subject:String(c.subject||''),
    content:String(c.content||''),
    date:/^\d{4}-\d{2}-\d{2}$/.test(String(c.date||''))?String(c.date).slice(0,10):new Date().toISOString().slice(0,10),
    time:String(c.time||'12:00').slice(0,8),
    outcome:String(c.outcome||''),
    followUpRequired:Boolean(c.followUpRequired),
    followUpDate:c.followUpDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(c.followUpDate))?String(c.followUpDate).slice(0,10):'',
    followUpCompleted:Boolean(c.followUpCompleted),
    createdAt:String(c.createdAt||new Date().toISOString())
  }));
  const maxCid=communications.reduce((s,c)=>Math.max(s,Number(c.id)||0),0);
  if(communicationNextId<=maxCid) communicationNextId=maxCid+1;
  const wnc=Number(window.communicationNextId);
  if(Number.isFinite(wnc)) communicationNextId=Math.max(communicationNextId,wnc);
  if(!communicationNextId||communicationNextId<1) communicationNextId=1;
  try{ window.communications=communications; }catch(_e){}
  try{ window.communicationNextId=communicationNextId; }catch(_e){}
  if(!Array.isArray(reconciliations)) reconciliations=[];
  reconciliations=reconciliations.map(r=>({
    id:Number(r.id)||0,
    date:String(r.date||'').slice(0,10),
    bank:String(r.bank||''),
    statementDate:String(r.statementDate||''),
    statementDateFrom:String(r.statementDateFrom||'').slice(0,10),
    statementDateTo:String(r.statementDateTo||'').slice(0,10),
    totalTransactions:Math.max(0,Math.round(Number(r.totalTransactions)||0)),
    matched:Math.max(0,Math.round(Number(r.matched)||0)),
    recorded:Math.max(0,Math.round(Number(r.recorded)||0)),
    totalAmount:Math.max(0,Number(r.totalAmount)||0)
  })).filter(r=>r.id>0);
  const maxRid=reconciliations.reduce((s,r)=>Math.max(s,r.id),0);
  if(reconciliationNextId<=maxRid) reconciliationNextId=maxRid+1;
  const wnr=Number(window.reconciliationNextId);
  if(Number.isFinite(wnr)) reconciliationNextId=Math.max(reconciliationNextId,wnr);
  if(!reconciliationNextId||reconciliationNextId<1) reconciliationNextId=1;
  try{ window.reconciliations=reconciliations; }catch(_e){}
  try{ window.reconciliationNextId=reconciliationNextId; }catch(_e){}
  normalizeStoredApplications();
  try{ window.applications=applications; }catch(_e){}
  nestiqSyncAllPayments();
  nestiqBindWindowDataArrays();
}

function nestiqSyncAllPayments(){
  try{
    allPayments=(paymentsData||[]).slice();
    window.allPayments=allPayments;
  }catch(_e){}
}

function nestiqBindWindowDataArrays(){
  try{
    window.propertiesData=propertiesData;
    window.propertiesLoading=propertiesLoading;
    window.tenantsData=tenantsData;
    window.tenantsLoading=tenantsLoading;
    window.expenses=expenses;
    window.expensesLoading=expensesLoading;
    window.maintenanceData=maintenanceData;
    window.paymentsData=paymentsData;
    window.__nestiqPaymentsDataArr=paymentsData;
    window.notices=notices;
    window.messages=messages;
    window.bellNotifs=bellNotifs;
    window.landlordSettings=landlordSettings;
    window.deposits=deposits;
    // Same object as script globals `propertyPhotos` / `maintenancePhotos` (not only window.*)
    window.propertyPhotos=propertyPhotos;
    window.maintenancePhotos=maintenancePhotos;
    window.photos=propertyPhotos;
  }catch(_e){}
}
window.nestiqSyncAllPayments=nestiqSyncAllPayments;
window.nestiqBindWindowDataArrays=nestiqBindWindowDataArrays;

function normalizeStoredApplications(){
  if(!Array.isArray(applications)) applications=[];
  const okStatus=new Set(['pending','reviewing','approved','declined','waitlisted']);
  const okCredit=new Set(['excellent','good','fair','poor','unknown']);
  const okEmployment=new Set(['permanent','contract','self-employed','unemployed','retired','student']);
  applications=applications.filter(a=>a&&typeof a==='object').map(a=>{
    const refs=(Array.isArray(a.references)?a.references:[]).map(r=>({
      name:String(r?.name||''),
      relationship:String(r?.relationship||''),
      phone:String(r?.phone||''),
      email:String(r?.email||'')
    })).slice(0,5);
    return{
      ...a,
      id:String(a.id||''),
      propertyId:a.propertyId!=null&&a.propertyId!==''?a.propertyId:null,
      propertyName:String(a.propertyName||''),
      propertyAddress:String(a.propertyAddress||''),
      listingMonthlyRent:Number(a.listingMonthlyRent)||0,
      availableFrom:String(a.availableFrom||''),
      bedroomsListed:Math.max(0,Math.round(Number(a.bedroomsListed)||0)),
      firstName:String(a.firstName||''),
      lastName:String(a.lastName||''),
      idNumber:String(a.idNumber||''),
      dateOfBirth:String(a.dateOfBirth||''),
      nationality:String(a.nationality||''),
      email:String(a.email||'').toLowerCase(),
      phone:String(a.phone||''),
      whatsapp:String(a.whatsapp||''),
      currentAddress:String(a.currentAddress||''),
      currentCity:String(a.currentCity||''),
      currentProvince:String(a.currentProvince||''),
      timeAtCurrentAddress:String(a.timeAtCurrentAddress||''),
      employmentStatus:okEmployment.has(a.employmentStatus)?a.employmentStatus:'permanent',
      employerName:String(a.employerName||''),
      employerPhone:String(a.employerPhone||''),
      jobTitle:String(a.jobTitle||''),
      monthlyGrossIncome:Number(a.monthlyGrossIncome)||0,
      monthlyNetIncome:Number(a.monthlyNetIncome)||0,
      employmentStartDate:String(a.employmentStartDate||''),
      payslipBase64:a.payslipBase64!=null?String(a.payslipBase64):null,
      payslipName:String(a.payslipName||''),
      currentLandlordName:String(a.currentLandlordName||''),
      currentLandlordPhone:String(a.currentLandlordPhone||''),
      currentMonthlyRent:Number(a.currentMonthlyRent)||0,
      reasonForMoving:String(a.reasonForMoving||''),
      previousEviction:Boolean(a.previousEviction),
      evictionDetails:String(a.evictionDetails||''),
      previousAddress:String(a.previousAddress||''),
      hasBankAccount:Boolean(a.hasBankAccount),
      bankName:String(a.bankName||''),
      hasOutstandingDebt:Boolean(a.hasOutstandingDebt),
      creditScore:okCredit.has(a.creditScore)?a.creditScore:'unknown',
      monthlyDebtRepayments:Number(a.monthlyDebtRepayments)||0,
      numberOfOccupants:Math.max(0,Math.round(Number(a.numberOfOccupants)||0)),
      occupantDetails:String(a.occupantDetails||''),
      hasPets:Boolean(a.hasPets),
      petDetails:String(a.petDetails||''),
      petType:String(a.petType||''),
      petCount:Math.max(0,Math.round(Number(a.petCount)||0)),
      petBreed:String(a.petBreed||''),
      hasCar:Boolean(a.hasCar),
      numberOfCars:Math.max(0,Math.round(Number(a.numberOfCars)||0)),
      references:refs,
      emergencyContactName:String(a.emergencyContactName||''),
      emergencyContactPhone:String(a.emergencyContactPhone||''),
      emergencyContactRelationship:String(a.emergencyContactRelationship||''),
      agreedToTerms:Boolean(a.agreedToTerms),
      signature:String(a.signature||''),
      applicationDate:String(a.applicationDate||''),
      status:okStatus.has(a.status)?a.status:'pending',
      aiScore:a.aiScore!=null&&Number.isFinite(Number(a.aiScore))?Math.min(100,Math.max(0,Number(a.aiScore))):null,
      aiRiskLevel:a.aiRiskLevel!=null?String(a.aiRiskLevel):null,
      aiRecommendation:a.aiRecommendation!=null?String(a.aiRecommendation):null,
      aiKeyFlags:Array.isArray(a.aiKeyFlags)?a.aiKeyFlags.map(String):[],
      aiSummary:String(a.aiSummary||''),
      aiConditions:Array.isArray(a.aiConditions)?a.aiConditions.map(String):[],
      landlordNotes:String(a.landlordNotes||''),
      processedDate:String(a.processedDate||''),
      processedBy:String(a.processedBy||''),
      declineReasons:Array.isArray(a.declineReasons)?a.declineReasons.map(String):[],
      declineNotes:String(a.declineNotes||''),
      createdAt:String(a.createdAt||''),
      applicationSource:a.applicationSource==='walkin'?'walkin':'public'
    };
  });
}

nestiqBindWindowDataArrays();

window.loadDataFromLocalStorage=loadDataFromLocalStorage;
window.saveDataFromLocalStorage=saveDataFromLocalStorage;
window.normalizeStoredApplications=normalizeStoredApplications;
