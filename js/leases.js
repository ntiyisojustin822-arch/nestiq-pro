/* NestIQ lease entity — landlord-scoped landlords/{lid}/leases/{leaseId}
 *
 * Signing is a lightweight in-app acknowledgement (typed full legal name +
 * "I have read and agree" checkbox + timestamp + signer uid). This is appropriate
 * for a student project and is NOT a legally-certified electronic signature
 * (not DocuSign / AES / QES).
 */

(function(){
  const UTILITY_OPTIONS=['water','electricity','refuse','internet','gas'];
  const STATUS_LABEL={
    draft:'Draft',
    pending_signature:'Pending signature',
    awaiting_payment:'Awaiting payment',
    active:'Active',
    expired:'Expired',
    terminated:'Terminated'
  };

  function fv(){
    try{ return firebase.firestore.FieldValue; }catch(_e){ return null; }
  }
  function nowIso(){ return new Date().toISOString(); }
  function lidOf(explicit){
    if(explicit) return String(explicit);
    return (typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():null)
      || window.nestiqTenantSession?.landlordId
      || window.__nestiqSession?.landlordId
      || null;
  }
  function leasesCol(lid){
    const db=window.nestiqDb;
    const id=lidOf(lid);
    if(!db||!id||!window.nestiqFs?.leases) return null;
    return window.nestiqFs.leases(db, id);
  }
  function esc(s){
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }
  function isoDate(v){
    if(!v) return '';
    if(typeof v==='string') return v.slice(0,10);
    try{
      if(v.toDate) return v.toDate().toISOString().slice(0,10);
    }catch(_e){}
    const d=new Date(v);
    return String(d)==='Invalid Date'?'':d.toISOString().slice(0,10);
  }
  function prettyDate(v){
    const iso=isoDate(v);
    if(!iso) return '—';
    if(typeof isoToPretty==='function') return isoToPretty(iso);
    return new Date(iso+'T12:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'});
  }
  function authUid(){
    try{ return firebase.auth().currentUser?.uid||''; }catch(_e){ return ''; }
  }
  function authName(){
    try{
      const u=firebase.auth().currentUser;
      return String(u?.displayName||landlordSettings?.name||u?.email||'').trim();
    }catch(_e){ return String(landlordSettings?.name||'').trim(); }
  }
  function leasesList(){
    if(!Array.isArray(window.leasesData)) window.leasesData=[];
    return window.leasesData;
  }
  function replaceLeases(rows){
    const arr=leasesList();
    arr.length=0;
    (rows||[]).forEach(r=>{ if(r) arr.push(r); });
    window.leasesData=arr;
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
    return arr;
  }

  function nestiqNormalizeLease(raw){
    const r=raw&&typeof raw==='object'?raw:{};
    const pets=r.pets&&typeof r.pets==='object'?r.pets:{allowed:false,details:''};
    const included=Array.isArray(r.utilitiesIncluded)?r.utilitiesIncluded.map(String):[];
    const excluded=Array.isArray(r.utilitiesExcluded)?r.utilitiesExcluded.map(String)
      : UTILITY_OPTIONS.filter(u=>!included.includes(u));
    let status=String(r.status||'draft');
    if(!STATUS_LABEL[status]) status='draft';
    const end=isoDate(r.leaseEnd);
    if(status==='active' && end && end<new Date().toISOString().slice(0,10)) status='expired';
    const ip=r.initialPayment&&typeof r.initialPayment==='object'?r.initialPayment:{};
    return {
      id:r.id!=null&&r.id!==''?String(r.id):'',
      tenantId:r.tenantId!=null&&r.tenantId!==''?String(r.tenantId):'',
      tenantUid:r.tenantUid||null,
      tenantName:String(r.tenantName||''),
      tenantEmail:String(r.tenantEmail||''),
      propertyId:r.propertyId!=null&&r.propertyId!==''?String(r.propertyId):'',
      propertyName:String(r.propertyName||''),
      unitId:r.unitId!=null&&r.unitId!==''?String(r.unitId):null,
      unitLabel:String(r.unitLabel||r.unit||''),
      landlordId:r.landlordId?String(r.landlordId):lidOf(),
      applicationId:r.applicationId!=null?String(r.applicationId):'',
      status,
      storedStatus:String(r.status||'draft'),
      leaseStart:isoDate(r.leaseStart),
      leaseEnd:isoDate(r.leaseEnd),
      rent:Number(r.rent)||0,
      deposit:Number(r.deposit)||0,
      dueDate:Math.max(1,Math.min(28,Number(r.dueDate||r.monthlyDueDate||1))),
      paymentFrequency:String(r.paymentFrequency||'monthly').toLowerCase()==='monthly'?'monthly':String(r.paymentFrequency||'monthly'),
      prorateFirstMonth:r.prorateFirstMonth===true||r.prorateFirstMonth==='true',
      occupants:Math.max(1,Number(r.occupants)||1),
      pets:{ allowed:pets.allowed===true, details:String(pets.details||'') },
      utilitiesIncluded:included,
      utilitiesExcluded:excluded,
      noticePeriodDays:Math.max(1,Number(r.noticePeriodDays)||30),
      maintenanceResponsibilities:String(r.maintenanceResponsibilities||''),
      additionalClauses:Array.isArray(r.additionalClauses)?r.additionalClauses.map(String).filter(Boolean):[],
      landlordSigned:r.landlordSigned&&typeof r.landlordSigned==='object'?r.landlordSigned:null,
      tenantSigned:r.tenantSigned&&typeof r.tenantSigned==='object'?r.tenantSigned:null,
      initialPayment:{
        depositDueNow:ip.depositDueNow!==false,
        firstRentDueNow:ip.firstRentDueNow===true
      },
      createdAt:r.createdAt||null,
      updatedAt:r.updatedAt||null
    };
  }

  function nestiqLeaseStatusLabel(status){
    return STATUS_LABEL[String(status||'')]||String(status||'Draft');
  }

  function nestiqLeaseById(id){
    if(id==null||id==='') return null;
    const raw=leasesList().find(l=>String(l.id)===String(id));
    return raw?nestiqNormalizeLease(raw):null;
  }

  function nestiqLeasesForTenant(tenantId){
    const want=String(tenantId||'');
    const t=(window.currentTenantData&&String(window.currentTenantData.id)===want)
      ? window.currentTenantData
      : (window.tenantsData||[]).find(x=>String(x.id)===want)||null;
    const uid=String(t?.portalUid||t?.tenantUid||'').trim();
    const leaseId=String(t?.leaseId||'').trim();
    return leasesList()
      .filter(l=>{
        if(String(l.tenantId||'')===want) return true;
        if(uid && (String(l.tenantUid||'')===uid || String(l.tenantId||'')===uid)) return true;
        if(leaseId && String(l.id)===leaseId) return true;
        return false;
      })
      .map(nestiqNormalizeLease)
      .sort((a,b)=>String(b.leaseStart||'').localeCompare(String(a.leaseStart||'')));
  }

  function nestiqPrimaryLeaseForTenant(tenantId){
    const list=nestiqLeasesForTenant(tenantId);
    const rank={pending_signature:0,awaiting_payment:1,draft:2,active:3,expired:4,terminated:5};
    return list.slice().sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9))[0]||null;
  }

  function nestiqParseLeaseIsoDate(iso){
    if(!iso) return null;
    const d=new Date(String(iso).slice(0,10)+'T12:00:00');
    if(String(d)==='Invalid Date') return null;
    d.setHours(0,0,0,0);
    return d;
  }
  function nestiqStartOfDay(d){
    const x=new Date(d);
    x.setHours(0,0,0,0);
    return x;
  }
  function nestiqDaysInMonth(y,m0){
    return new Date(y,m0+1,0).getDate();
  }
  function nestiqClampDueDay(day,y,m0){
    const n=Math.max(1,Math.min(28,Number(day)||1));
    return Math.min(n, nestiqDaysInMonth(y,m0));
  }
  function nestiqOrdinalDay(n){
    const d=Math.max(1,Number(n)||1);
    const v=d%100;
    if(v>=11&&v<=13) return d+'th';
    const last=d%10;
    return d+(last===1?'st':last===2?'nd':last===3?'rd':'th');
  }
  function nestiqDueDayOptionsHtml(selected){
    const sel=Math.max(1,Math.min(28,Number(selected)||1));
    return Array.from({length:28},(_,i)=>{
      const n=i+1;
      return `<option value="${n}" ${n===sel?'selected':''}>${nestiqOrdinalDay(n)}</option>`;
    }).join('');
  }
  function nestiqPrettyDueDate(d){
    if(!d) return '—';
    return d.toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'});
  }
  function nestiqDepositIsCollected(tenant){
    if(!tenant) return false;
    if(tenant.depositCollected===true) return true;
    const d=tenant.deposit;
    if(!d||typeof d!=='object') return false;
    const st=String(d.status||'').toLowerCase();
    return d.collected===true||st==='held'||st==='partially-refunded'||st==='refunded';
  }
  function nestiqLeaseInitialDue(lease, tenant){
    const n=nestiqNormalizeLease(lease||{});
    const t=tenant||nestiqFindTenant(n.tenantId)||window.currentTenantData||null;
    const ip=n.initialPayment||{ depositDueNow:true, firstRentDueNow:false };
    const depositAmt=Math.max(0, Number(n.deposit|| (t&&typeof nestiqTenantDepositAmount==='function'?nestiqTenantDepositAmount(t):0) )||0);
    const depositDue=ip.depositDueNow!==false && depositAmt>0 && !nestiqDepositIsCollected(t) ? depositAmt : 0;
    let rentDue=0;
    if(ip.firstRentDueNow===true){
      const monthly=Math.max(0, (t && nestiqTenantMonthlyRent(t, n)) || Number(n.rent)||0);
      const start=nestiqParseLeaseIsoDate(n.leaseStart);
      if(start){
        const y=start.getFullYear(), m0=start.getMonth();
        const paid=typeof nestiqHasPaymentForPeriod==='function' && t ? nestiqHasPaymentForPeriod(t, y, m0) : false;
        if(!paid) rentDue=monthly;
      }else{
        rentDue=monthly;
      }
    }
    return {
      depositDue,
      rentDue,
      total:depositDue+rentDue,
      depositAmt,
      depositDueNow:ip.depositDueNow!==false,
      firstRentDueNow:ip.firstRentDueNow===true
    };
  }
  function nestiqLeaseNeedsInitialPayment(lease, tenant){
    return nestiqLeaseInitialDue(lease, tenant).total>0;
  }
  function nestiqLeaseIsActiveForRent(lease, tenant){
    const st=String(lease?.storedStatus||lease?.status||tenant?.leaseStatus||'').toLowerCase();
    if(!st) return true;
    return st==='active'||st==='expired';
  }
  function nestiqPayableLeaseForTenant(tenant){
    if(!tenant) return null;
    const list=nestiqLeasesForTenant(tenant.id);
    const active=list.find(l=>nestiqLeaseIsActiveForRent(l, tenant));
    if(active) return active;
    if(tenant.leaseId){
      const byId=nestiqLeaseById(tenant.leaseId);
      if(byId) return byId;
    }
    return list[0]||null;
  }
  function nestiqOccupiedUnitForTenant(tenant){
    if(!tenant) return null;
    const units=typeof window.nestiqUnitsList==='function'?window.nestiqUnitsList():(window.unitsData||[]);
    if(!Array.isArray(units)||!units.length) return null;
    const tid=String(tenant.id||'');
    const uid=String(tenant.unitId||tenant.unitDocId||'').trim();
    if(uid){
      const byId=units.find(u=>String(u.id)===uid);
      if(byId) return byId;
    }
    if(tid){
      const byTenant=units.find(u=>String(u.tenantId||'')===tid);
      if(byTenant) return byTenant;
    }
    const pid=String(tenant.propertyId||'');
    const label=String(tenant.unit||tenant.unitNumber||'').trim().toLowerCase();
    if(pid&&label){
      return units.find(u=>String(u.propertyId)===pid && String(u.label||u.unitNumber||'').trim().toLowerCase()===label)||null;
    }
    return null;
  }
  function nestiqTenantMonthlyRent(tenant, lease){
    const unit=nestiqOccupiedUnitForTenant(tenant);
    const ur=Number(unit?.rent);
    if(Number.isFinite(ur)&&ur>0) return ur;
    const tr=Number(tenant?.rent);
    if(Number.isFinite(tr)&&tr>0) return tr;
    const lr=Number(lease?.rent);
    if(Number.isFinite(lr)&&lr>0) return lr;
    return 0;
  }
  function nestiqLeaseLikeFromTenant(tenant){
    const lease=nestiqPayableLeaseForTenant(tenant);
    const rent=nestiqTenantMonthlyRent(tenant, lease);
    if(lease){
      const n=nestiqNormalizeLease(lease);
      if(rent>0) n.rent=rent;
      return n;
    }
    return nestiqNormalizeLease({
      status:tenant?.leaseStatus||'',
      storedStatus:tenant?.leaseStatus||'',
      leaseStart:tenant?.leaseStart,
      leaseEnd:tenant?.leaseEnd||tenant?.lease,
      rent,
      dueDate:tenant?.monthlyDueDate||1,
      prorateFirstMonth:!!tenant?.prorateFirstMonth,
      tenantId:tenant?.id
    });
  }
  function nestiqFirstMonthIsPartial(lease){
    if(!lease||!lease.prorateFirstMonth) return false;
    const start=nestiqParseLeaseIsoDate(lease.leaseStart);
    return !!(start && start.getDate()>1);
  }
  function nestiqLeasePeriodAmount(lease, y, m0){
    const rent=Number(lease?.rent||0)||0;
    const start=nestiqParseLeaseIsoDate(lease?.leaseStart);
    if(start && start.getFullYear()===y && start.getMonth()===m0 && nestiqFirstMonthIsPartial(lease)){
      const dim=nestiqDaysInMonth(y,m0);
      const days=dim-start.getDate()+1;
      return Math.max(0, Math.round(rent*days/dim));
    }
    return rent;
  }
  function nestiqLeasePeriodDueDate(lease, y, m0){
    const start=nestiqParseLeaseIsoDate(lease?.leaseStart);
    const day=nestiqClampDueDay(lease?.dueDate, y, m0);
    const due=new Date(y, m0, day);
    due.setHours(0,0,0,0);
    if(start && start.getFullYear()===y && start.getMonth()===m0){
      if(nestiqFirstMonthIsPartial(lease)) return nestiqStartOfDay(start);
    }
    return due;
  }
  function nestiqLeaseFirstDueDate(lease){
    const start=nestiqParseLeaseIsoDate(lease?.leaseStart);
    if(!start) return null;
    const y=start.getFullYear(), m=start.getMonth();
    if(nestiqFirstMonthIsPartial(lease)) return nestiqStartOfDay(start);
    const due=nestiqLeasePeriodDueDate(lease, y, m);
    if(due>=nestiqStartOfDay(start)) return due;
    const nm=m+1;
    return nestiqLeasePeriodDueDate(lease, nm>11?y+1:y, nm%12);
  }
  function nestiqPaymentYearMonth(p){
    if(!p) return '';
    const raw=p.date||p.paidAt||p.createdAt||'';
    if(typeof raw==='string' && /^\d{4}-\d{2}/.test(raw)) return raw.slice(0,7);
    try{
      let d=null;
      if(raw && typeof raw.toDate==='function') d=raw.toDate();
      else if(raw && typeof raw.seconds==='number') d=new Date(raw.seconds*1000);
      else if(typeof raw==='string' && raw) d=new Date(raw);
      if(d && String(d)!=='Invalid Date'){
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      }
    }catch(_e){}
    const monthStr=String(p.month||'');
    const m=monthStr.match(/([A-Za-z]+)\s+(\d{4})/);
    if(m){
      const names=['january','february','march','april','may','june','july','august','september','october','november','december'];
      const idx=names.indexOf(m[1].toLowerCase());
      if(idx>=0) return m[2]+'-'+String(idx+1).padStart(2,'0');
    }
    return '';
  }
  function nestiqPaymentCountsTowardMonthlyRent(p){
    if(!p) return false;
    const ty=String(p.paymentType||p.type||'').toLowerCase().replace(/-/g,'_');
    const src=String(p.source||'').toLowerCase();
    if(ty==='deposit'||ty==='security_deposit') return false;
    const isMoveIn=ty==='move_in'||src==='tenant-portal-move-in'||src==='move-in'||src==='movein';
    if(isMoveIn){
      // Combined move-in covers first-month rent only when that line was actually charged.
      return p.coversFirstRent===true || ty==='rent';
    }
    return true;
  }
  function nestiqHasPaymentForPeriod(tenant, y, m0){
    if(!tenant) return false;
    const tid=String(tenant.id||tenant.tenantDocId||'').trim();
    if(!tid) return false;
    const tUid=String(tenant.tenantUid||tenant.portalUid||window.currentUser?.uid||'').trim();
    const key=`${y}-${String(m0+1).padStart(2,'0')}`;
    const match=p=>{
      if(!p) return false;
      if(!nestiqPaymentCountsTowardMonthlyRent(p)) return false;
      const amt=Number(p.amount||0);
      if(!(amt>0)) return false;
      const st=String(p.status||'paid').toLowerCase();
      if(st==='pending'||st==='failed'||st==='cancelled'||st==='void'||st==='unpaid') return false;
      return nestiqPaymentYearMonth(p)===key;
    };
    const belongs=p=>{
      const pid=String(p.tenantId||p.tenantDocId||'').trim();
      const puid=String(p.tenantUid||p.portalUid||'').trim();
      if(pid && pid===tid) return true;
      if(tUid && puid && puid===tUid) return true;
      if(!pid && !puid) return true;
      return false;
    };
    const role=(typeof getSession==='function'?getSession():window.__nestiqSession||{})?.role;
    if(window.nestiqUseFirestore && role==='tenant'){
      if(!window.__nestiqTenantPaymentsReady) return false;
      return (window.tenantPayments||[]).some(p=>match(p) && belongs(p));
    }
    if((tenant.payments||[]).some(p=>match(p) && belongs(p))) return true;
    if((window.tenantPayments||[]).some(p=>match(p) && belongs(p))) return true;
    if(role!=='tenant' && (window.paymentsData||[]).some(p=>match(p) && String(p.tenantId||'')===tid)) return true;
    return false;
  }
  function nestiqCurrentRentObligation(tenant, asOf){
    const today=nestiqStartOfDay(asOf||new Date());
    const empty={
      status:'upcoming', label:'UPCOMING', badgeClass:'badge-blue', payable:false,
      amountDue:0, dueDate:null, message:'No rent is due yet.', daysRemaining:null, daysOverdue:0
    };
    if(!tenant||tenant.status==='vacant') return { ...empty, status:'vacant', label:'VACANT', payable:false };
    const lease=nestiqLeaseLikeFromTenant(tenant);
    const amountMonthly=Number(lease.rent||tenant.rent||0)||0;
    if(!nestiqLeaseIsActiveForRent(lease, tenant)){
      const first=nestiqLeaseFirstDueDate(lease);
      const lst=String(tenant.leaseStatus||lease.storedStatus||lease.status||'').toLowerCase();
      const pendingMsg=lst==='pending_signature'
        ? 'Sign your lease before rent can become due.'
        : lst==='awaiting_payment'
          ? 'Pay the move-in amount to activate your tenancy. Recurring rent then follows the lease due day.'
          : 'Rent is not due until the lease is signed and active.';
      return {
        status:'pending-lease',
        label:'PENDING LEASE',
        badgeClass:'badge-blue',
        payable:false,
        amountDue:amountMonthly,
        dueDate:first,
        message:pendingMsg,
        daysRemaining:first?Math.max(0, Math.round((first-today)/86400000)):null,
        daysOverdue:0,
        lease
      };
    }
    const firstDue=nestiqLeaseFirstDueDate(lease);
    const end=nestiqParseLeaseIsoDate(lease.leaseEnd);
    if(end && today>end){
      const endMonthStart=new Date(end.getFullYear(), end.getMonth(), 1);
      const thisMonthStart=new Date(today.getFullYear(), today.getMonth(), 1);
      if(thisMonthStart>endMonthStart){
        return {
          status:'upcoming', label:'LEASE ENDED', badgeClass:'badge-blue', payable:false,
          amountDue:0, dueDate:end, message:'This lease has ended. No rent is due.',
          daysRemaining:0, daysOverdue:0, lease
        };
      }
    }
    if(firstDue && today<firstDue){
      const amt=amountMonthly;
      const start=nestiqParseLeaseIsoDate(lease.leaseStart);
      const leaseNotStarted=start && today<nestiqStartOfDay(start);
      const pretty=nestiqPrettyDueDate(firstDue);
      return {
        status:'upcoming',
        label:'UPCOMING',
        badgeClass:'badge-blue',
        payable:false,
        amountDue:amt,
        dueDate:firstDue,
        message:leaseNotStarted
          ? `Lease starts ${nestiqPrettyDueDate(start)}. First rent: R${amt.toLocaleString('en-ZA')} due ${pretty}`
          : `Next rent payment R${amt.toLocaleString('en-ZA')} · Due: ${pretty}`,
        daysRemaining:Math.max(0, Math.round((firstDue-today)/86400000)),
        daysOverdue:0,
        lease
      };
    }
    const y=today.getFullYear(), m=today.getMonth();
    const due=nestiqLeasePeriodDueDate(lease, y, m);
    const amount=amountMonthly;
    if(nestiqHasPaymentForPeriod(tenant, y, m)){
      return {
        status:'paid', label:'PAID', badgeClass:'badge-green', payable:false,
        amountDue:0, dueDate:due, message:'Paid for '+today.toLocaleString('en-ZA',{month:'long',year:'numeric'}),
        daysRemaining:0, daysOverdue:0, lease
      };
    }
    const prettyDue=nestiqPrettyDueDate(due);
    if(today<due){
      const daysRemaining=Math.max(0, Math.round((due-today)/86400000));
      return {
        status:'upcoming',
        label:'UPCOMING',
        badgeClass:'badge-blue',
        payable:false,
        amountDue:amount,
        dueDate:due,
        message:`Next rent payment R${amount.toLocaleString('en-ZA')} · Due: ${prettyDue}`,
        daysRemaining,
        daysOverdue:0,
        lease
      };
    }
    if(today.getTime()===due.getTime()){
      return {
        status:'due',
        label:'DUE TODAY',
        badgeClass:'badge-amber',
        payable:true,
        amountDue:amount,
        dueDate:due,
        message:`R${amount.toLocaleString('en-ZA')} due today`,
        daysRemaining:0,
        daysOverdue:0,
        lease
      };
    }
    const daysOverdue=Math.max(1, Math.round((today-due)/86400000));
    return {
      status:'overdue',
      label:'OVERDUE',
      badgeClass:'badge-red',
      payable:true,
      amountDue:amount,
      dueDate:due,
      message:daysOverdue+' days overdue',
      daysRemaining:0,
      daysOverdue,
      lease
    };
  }
  function nestiqLeaseSchedulePeriods(lease, fromDate, toDate){
    const start=nestiqParseLeaseIsoDate(lease?.leaseStart);
    const end=nestiqParseLeaseIsoDate(lease?.leaseEnd);
    if(!start) return [];
    const from=nestiqStartOfDay(fromDate||start);
    const to=nestiqStartOfDay(toDate||end||new Date(start.getFullYear()+1, start.getMonth(), start.getDate()));
    const first=nestiqLeaseFirstDueDate(lease);
    if(!first) return [];
    const out=[];
    let y=first.getFullYear(), m=first.getMonth();
    for(let i=0;i<36;i++){
      const due=nestiqLeasePeriodDueDate(lease, y, m);
      if(end && due>end) break;
      if(due>to) break;
      if(due>=from){
        out.push({
          year:y,
          month:m+1,
          dueDate:due,
          amount:nestiqLeasePeriodAmount(lease, y, m),
          prorated:nestiqFirstMonthIsPartial(lease) && start.getFullYear()===y && start.getMonth()===m
        });
      }
      m+=1;
      if(m>11){ m=0; y+=1; }
    }
    return out;
  }

  function nestiqTenantHasActiveOccupancy(t){
    if(!t) return false;
    const st=String(t.status||'').toLowerCase();
    if(st==='vacant'||st==='unassigned') return false;
    const ls=String(t.leaseStatus||'').toLowerCase();
    if(ls==='terminated') return false;
    if(ls && ls!=='active' && ls!=='expired') return false;
    return true;
  }

  function nestiqFindTenant(tenantId){
    return (window.tenantsData||[]).find(t=>String(t.id)===String(tenantId))||null;
  }
  function nestiqFindProperty(propertyId, name){
    const list=window.propertiesData||[];
    return list.find(p=>String(p.id)===String(propertyId))
      || list.find(p=>name&&p.name===name)
      || null;
  }

  function upsertLocalLease(lease){
    const arr=leasesList();
    const idx=arr.findIndex(l=>String(l.id)===String(lease.id));
    if(idx>=0) arr[idx]={...arr[idx],...lease};
    else arr.push(lease);
    window.leasesData=arr;
    try{ window.nestiqBindWindowDataArrays?.(); }catch(_e){}
  }

  function leaseWritePayload(lease){
    const n=nestiqNormalizeLease(lease);
    const payload={
      tenantId:n.tenantId,
      tenantUid:n.tenantUid||null,
      tenantName:n.tenantName,
      tenantEmail:n.tenantEmail,
      propertyId:n.propertyId,
      propertyName:n.propertyName,
      unitId:n.unitId,
      unitLabel:n.unitLabel,
      landlordId:n.landlordId,
      applicationId:n.applicationId||'',
      status:n.storedStatus||n.status,
      leaseStart:n.leaseStart,
      leaseEnd:n.leaseEnd,
      rent:n.rent,
      deposit:n.deposit,
      dueDate:n.dueDate,
      paymentFrequency:n.paymentFrequency||'monthly',
      prorateFirstMonth:!!n.prorateFirstMonth,
      occupants:n.occupants,
      pets:n.pets,
      utilitiesIncluded:n.utilitiesIncluded,
      utilitiesExcluded:n.utilitiesExcluded,
      noticePeriodDays:n.noticePeriodDays,
      maintenanceResponsibilities:n.maintenanceResponsibilities,
      additionalClauses:n.additionalClauses,
      landlordSigned:n.landlordSigned,
      tenantSigned:n.tenantSigned,
      initialPayment:n.initialPayment||{ depositDueNow:true, firstRentDueNow:false }
    };
    const f=fv();
    if(f) payload.updatedAt=f.serverTimestamp();
    return payload;
  }

  async function nestiqPersistLease(lease, extra){
    const n={...nestiqNormalizeLease(lease), ...(extra||{})};
    if(!n.id) n.id='lease-'+Date.now();
    const payload=leaseWritePayload(n);
    payload.id=n.id;
    const f=fv();
    if(f && !lease.createdAt) payload.createdAt=f.serverTimestamp();
    const col=leasesCol(n.landlordId);
    if(col && window.nestiqUseFirestore){
      await col.doc(String(n.id)).set(payload,{ merge:true });
    }
    upsertLocalLease({...n,...payload, id:n.id});
    return nestiqNormalizeLease({...n,...payload, id:n.id});
  }

  async function nestiqCreateDraftLease(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    const tenant=opts.tenant||{};
    const lid=lidOf(opts.landlordId||tenant.landlordId);
    const start=isoDate(opts.leaseStart||tenant.leaseStart)||new Date().toISOString().slice(0,10);
    let end=isoDate(opts.leaseEnd||tenant.leaseEnd);
    if(!end){
      const d=new Date(start+'T12:00:00');
      d.setFullYear(d.getFullYear()+1);
      end=d.toISOString().slice(0,10);
    }
    const rent=Number(opts.rent!=null?opts.rent:tenant.rent)||0;
    let deposit=Number(opts.deposit);
    if(!Number.isFinite(deposit)){
      const dep=tenant.deposit;
      deposit=dep&&typeof dep==='object'?Number(dep.amount)||0:Number(dep)||Math.round(rent*2);
    }
    const draft={
      tenantId:String(tenant.id||opts.tenantId||''),
      tenantUid:tenant.portalUid||tenant.tenantUid||opts.tenantUid||null,
      tenantName:tenant.name||opts.tenantName||'',
      tenantEmail:String(tenant.email||opts.tenantEmail||'').toLowerCase(),
      propertyId:opts.propertyId!=null?String(opts.propertyId):String(tenant.propertyId||''),
      propertyName:opts.propertyName||tenant.property||'',
      unitId:opts.unitId?String(opts.unitId):null,
      unitLabel:opts.unitLabel||tenant.unit||'',
      landlordId:lid,
      applicationId:opts.applicationId||tenant.applicationId||'',
      status:'draft',
      leaseStart:start,
      leaseEnd:end,
      rent,
      deposit,
      dueDate:Math.max(1,Math.min(28,Number(opts.dueDate||tenant.monthlyDueDate||1)||1)),
      paymentFrequency:'monthly',
      prorateFirstMonth:opts.prorateFirstMonth===true,
      occupants:Math.max(1,Number(opts.occupants)||1),
      pets:opts.pets&&typeof opts.pets==='object'
        ? { allowed:opts.pets.allowed===true, details:String(opts.pets.details||'') }
        : { allowed:false, details:'' },
      utilitiesIncluded:[],
      utilitiesExcluded:UTILITY_OPTIONS.slice(),
      noticePeriodDays:30,
      maintenanceResponsibilities:'The tenant shall keep the interior clean and habitable. The landlord is responsible for structural repairs and fair wear and tear.',
      additionalClauses:[],
      landlordSigned:null,
      tenantSigned:null,
      initialPayment:{
        depositDueNow:opts.initialPayment?.depositDueNow!==false,
        firstRentDueNow:opts.initialPayment?.firstRentDueNow===true
      }
    };
    const col=leasesCol(lid);
    let id='lease-'+Date.now();
    if(col && window.nestiqUseFirestore){
      const payload=leaseWritePayload(draft);
      const f=fv();
      if(f) payload.createdAt=f.serverTimestamp();
      const ref=await col.add(payload);
      id=ref.id;
      await col.doc(id).set({ id },{ merge:true });
    }
    draft.id=id;
    upsertLocalLease(draft);
    await nestiqSyncTenantLeaseFields(draft,{ occupancyPending:true });
    await nestiqReserveOccupancyForLease(draft);
    return nestiqNormalizeLease(draft);
  }

  async function nestiqSyncTenantLeaseFields(lease, extra){
    extra=extra||{};
    const t=nestiqFindTenant(lease.tenantId);
    if(!t) return;
    const n=nestiqNormalizeLease(lease);
    t.leaseId=n.id;
    t.leaseStatus=n.storedStatus||n.status;
    t.leaseStart=n.leaseStart;
    t.leaseEnd=n.leaseEnd;
    t.lease=prettyDate(n.leaseEnd);
    t.rent=n.rent;
    t.monthlyDueDate=n.dueDate;
    t.prorateFirstMonth=!!n.prorateFirstMonth;
    t.unitId=n.unitId||t.unitId||null;
    t.unit=n.unitLabel||t.unit;
    t.unitNumber=n.unitLabel||t.unitNumber;
    t.propertyId=n.propertyId||t.propertyId;
    if(n.propertyName) t.property=n.propertyName;
    if(typeof nestiqNormalizeTenantDeposit==='function'){
      t.deposit=nestiqNormalizeTenantDeposit({
        amount:n.deposit,
        collected:(t.deposit&&typeof t.deposit==='object')?t.deposit.collected:false,
        status:(t.deposit&&typeof t.deposit==='object')?t.deposit.status:'pending'
      }, n.rent);
    }else{
      t.deposit=n.deposit;
    }
    if(extra.occupancyPending){
      const future=typeof nestiqTenantLeaseStartsInFuture==='function' && nestiqTenantLeaseStartsInFuture(t);
      if(future) t.status='pending-lease';
      else if(t.status==='vacant' || !t.status) t.status='due';
    }
    if(extra.occupied){
      if(t.status==='vacant') t.status='due';
    }
    try{
      if(window.nestiqUseFirestore && typeof window.nestiqPersistSingleTenantToFirestore==='function'){
        await window.nestiqPersistSingleTenantToFirestore(t);
      }else{
        saveData?.();
      }
    }catch(err){
      console.warn('NestIQ: sync tenant from lease', err);
    }
  }

  async function nestiqSetPropertyStatus(prop, status){
    if(!prop||!status) return;
    prop.status=status;
    const lid=lidOf(prop.landlordId);
    try{
      if(window.nestiqUseFirestore&&window.nestiqDb&&lid&&window.nestiqFs?.properties){
        const patch={ status };
        const f=fv();
        if(f) patch.updatedAt=f.serverTimestamp();
        await window.nestiqFs.properties(window.nestiqDb, lid).doc(String(prop.id)).set(patch,{ merge:true });
      }else{
        saveData?.();
      }
      if(typeof window.nestiqSyncPublicListingMirror==='function'){
        await window.nestiqSyncPublicListingMirror(prop);
      }
    }catch(err){
      console.warn('NestIQ: property occupancy from lease', err);
    }
  }

  async function nestiqReserveOccupancyForLease(lease){
    const n=nestiqNormalizeLease(lease);
    const tenant=nestiqFindTenant(n.tenantId)||{
      id:n.tenantId, name:n.tenantName, rent:n.rent,
      leaseStart:n.leaseStart, leaseEnd:n.leaseEnd, unit:n.unitLabel
    };
    if(n.unitId && typeof window.saveUnit==='function'){
      const unit=(typeof nestiqUnitsList==='function'?nestiqUnitsList():window.unitsData||[])
        .find(u=>String(u.id)===String(n.unitId))||{ id:n.unitId, propertyId:n.propertyId };
      await saveUnit(n.propertyId,{
        ...unit,
        tenantId:n.tenantId,
        tenantName:n.tenantName,
        rent:n.rent||unit.rent,
        status:'reserved',
        leaseStart:n.leaseStart,
        leaseEnd:n.leaseEnd,
        leaseId:n.id
      });
      const prop=nestiqFindProperty(n.propertyId, n.propertyName);
      const units=typeof nestiqUnitsForProperty==='function'?nestiqUnitsForProperty(n.propertyId):[];
      const anyOpen=units.some(u=>{
        const st=String(u.status||'').toLowerCase();
        return (st==='vacant'||st==='available'||st==='due'||st==='') && String(u.id)!==String(n.unitId);
      });
      if(prop && !anyOpen && String(prop.status||'').toLowerCase()==='vacant'){
        await nestiqSetPropertyStatus(prop,'reserved');
      }
      return;
    }
    const prop=nestiqFindProperty(n.propertyId, n.propertyName);
    if(prop && String(prop.status||'').toLowerCase()==='vacant'){
      await nestiqSetPropertyStatus(prop,'reserved');
    }
    void tenant;
  }

  async function nestiqOccupyFromActiveLease(lease){
    const n=nestiqNormalizeLease(lease);
    if((n.storedStatus||n.status)!=='active' && n.status!=='expired') return;
    const tenant=nestiqFindTenant(n.tenantId)||{
      id:n.tenantId, name:n.tenantName, rent:n.rent,
      leaseStart:n.leaseStart, leaseEnd:n.leaseEnd, unit:n.unitLabel
    };
    if(n.unitId && typeof window.nestiqLinkTenantToUnit==='function'){
      try{
        if(typeof window.getPropertyUnits==='function'){
          await window.getPropertyUnits(n.propertyId);
        }
        await window.nestiqLinkTenantToUnit(tenant, n.unitId, n.propertyId);
      }catch(err){
        console.warn('NestIQ: occupy unit from lease', err);
      }
    }
    const prop=nestiqFindProperty(n.propertyId, n.propertyName);
    if(prop){
      const units=typeof nestiqUnitsForProperty==='function'?nestiqUnitsForProperty(n.propertyId):[];
      const anyOpen=units.some(u=>{
        const st=String(u.status||'').toLowerCase();
        return st==='vacant'||st==='available'||st==='due'||st==='';
      });
      if(!units.length || !anyOpen){
        await nestiqSetPropertyStatus(prop,'occupied');
      }
    }
    await nestiqSyncTenantLeaseFields(n,{ occupied:true });
  }

  async function nestiqLeasePostTenantNotice(lease, title, message){
    const n=nestiqNormalizeLease(lease);
    const lid=n.landlordId;
    if(!lid||!n.tenantId||!window.nestiqDb||!window.nestiqFs?.notices) return;
    try{
      const row={
        title,
        message,
        body:message,
        date:new Date().toISOString().slice(0,10),
        postedBy:String(landlordSettings?.name||'Landlord'),
        targetTenantId:String(n.tenantId),
        propertyId:String(n.propertyId||''),
        readBy:[],
        landlordId:lid,
        type:'lease'
      };
      const f=fv();
      if(f) row.createdAt=f.serverTimestamp();
      await window.nestiqFs.notices(window.nestiqDb, lid).add(row);
    }catch(err){
      console.warn('NestIQ: lease tenant notice', err);
    }
  }

  function nestiqLeaseNotifyLandlord(icon, text, route){
    try{ addBellNotif?.(icon, text, route||"showPage('renewals')"); }catch(_e){}
    try{ nestiqShowNotif?.(text,'info'); }catch(_e){}
  }

  async function nestiqMarkLeaseAwaitingPayment(lease){
    const n=nestiqNormalizeLease(lease);
    n.status='awaiting_payment';
    n.storedStatus='awaiting_payment';
    const asLandlord=nestiqSessionIsLeaseLandlord(n);
    let saved=n;
    if(asLandlord){
      saved=await nestiqPersistLease(n,{ status:'awaiting_payment' });
      await nestiqSyncTenantLeaseFields(saved,{ occupancyPending:true });
    }else{
      upsertLocalLease(n);
      const t=nestiqFindTenant(n.tenantId)||window.currentTenantData;
      if(t && String(t.id)===String(n.tenantId)){
        t.leaseId=n.id;
        t.leaseStatus='awaiting_payment';
        t.status='pending-lease';
        if(window.currentTenantData && String(window.currentTenantData.id)===String(t.id)){
          Object.assign(window.currentTenantData, t);
        }
        try{
          const lid=n.landlordId||lidOf();
          const col=lid&&window.nestiqDb&&window.nestiqFs?.tenants
            ? window.nestiqFs.tenants(window.nestiqDb, lid)
            : null;
          if(col){
            await col.doc(String(t.id)).set({
              leaseId:n.id,
              leaseStatus:'awaiting_payment',
              status:'pending-lease'
            },{ merge:true });
          }
        }catch(err){
          console.warn('NestIQ: tenant awaiting-payment merge', err);
        }
      }
    }
    try{ window.renderTenantDashboard?.(); }catch(_e){}
    try{ window.nestiqApplyTenantPortalChrome?.(); }catch(_e){}
    try{ window.renderGettingStartedTenant?.(); }catch(_e){}
    return saved;
  }

  async function nestiqTryActivateLeaseAfterMoney(leaseOrId){
    const lease=leaseOrId&&typeof leaseOrId==='object'
      ? nestiqNormalizeLease(leaseOrId)
      : nestiqLeaseById(leaseOrId);
    if(!lease||!lease.landlordSigned||!lease.tenantSigned) return lease||null;
    const tenant=nestiqFindTenant(lease.tenantId)||window.currentTenantData;
    if(nestiqLeaseNeedsInitialPayment(lease, tenant)) return lease;
    return nestiqActivateLeaseIfFullySigned(lease);
  }

  async function nestiqActivateLeaseIfFullySigned(lease){
    const n=nestiqNormalizeLease(lease);
    const both=!!(n.landlordSigned && n.tenantSigned);
    if(!both) return nestiqNormalizeLease(lease);
    const tenant=nestiqFindTenant(n.tenantId)||window.currentTenantData;
    if(n.storedStatus!=='active' && n.status!=='active' && n.status!=='expired'
      && nestiqLeaseNeedsInitialPayment(n, tenant)){
      return nestiqMarkLeaseAwaitingPayment(n);
    }
    const asLandlord=nestiqSessionIsLeaseLandlord(n);
    if(n.storedStatus==='active'||n.status==='active'||n.status==='expired'){
      if(asLandlord) await nestiqOccupyFromActiveLease(n);
      return n;
    }
    const prev=n.storedStatus;
    n.status='active';
    n.storedStatus='active';
    let saved=n;
    if(asLandlord){
      saved=await nestiqPersistLease(n,{ status:'active' });
      await nestiqOccupyFromActiveLease(saved);
      if(prev!=='active'){
        nestiqLeaseNotifyLandlord('📝', `Lease active: ${n.tenantName||'Tenant'} — ${n.propertyName||'property'} is now occupied.`);
        await nestiqLeasePostTenantNotice(saved,
          'Your lease is now active',
          `Both parties have signed the lease for ${n.propertyName||'your property'}. Your unit is now occupied under this agreement (${prettyDate(n.leaseStart)} – ${prettyDate(n.leaseEnd)}).`
        );
      }
    }else{
      upsertLocalLease(n);
      try{
        const lcol=leasesCol(n.landlordId);
        if(lcol && window.nestiqUseFirestore){
          const lpatch={ status:'active' };
          const f=fv();
          if(f) lpatch.updatedAt=f.serverTimestamp();
          await lcol.doc(String(n.id)).set(lpatch,{ merge:true });
        }
      }catch(err){
        console.warn('NestIQ: tenant lease-active write', err);
      }
      const t=nestiqFindTenant(n.tenantId)||window.currentTenantData;
      if(t && String(t.id)===String(n.tenantId)){
        t.leaseId=n.id;
        t.leaseStatus='active';
        t.leaseStart=n.leaseStart;
        t.leaseEnd=n.leaseEnd;
        t.rent=n.rent;
        t.monthlyDueDate=n.dueDate;
        if(String(t.status||'').toLowerCase()==='pending-lease') t.status='due';
        if(window.currentTenantData && String(window.currentTenantData.id)===String(t.id)){
          Object.assign(window.currentTenantData, t);
        }
        try{
          const lid=n.landlordId||lidOf();
          const col=lid&&window.nestiqDb&&window.nestiqFs?.tenants
            ? window.nestiqFs.tenants(window.nestiqDb, lid)
            : null;
          if(col){
            await col.doc(String(t.id)).set({
              leaseId:n.id,
              leaseStatus:'active',
              leaseStart:n.leaseStart,
              leaseEnd:n.leaseEnd,
              rent:n.rent,
              monthlyDueDate:n.dueDate,
              status:t.status||'due'
            },{ merge:true });
          }
        }catch(err){
          console.warn('NestIQ: tenant lease-active merge', err);
        }
      }
    }
    try{ window.renderRenewalsPage?.(); }catch(_e){}
    try{ window.renderTenantDashboard?.(); }catch(_e){}
    try{ window.renderProperties?.(); }catch(_e){}
    try{ window.renderTenants?.(); }catch(_e){}
    return saved;
  }

  function signaturePayload(typedName){
    return {
      signedBy:authUid()||'unknown',
      signedAt:nowIso(),
      typedName:String(typedName||'').trim(),
      agreed:true
    };
  }

  function nestiqEmailLeaseReady(lease){
    const n=nestiqNormalizeLease(lease);
    const tenant=nestiqFindTenant(n.tenantId)||{
      id:n.tenantId,
      name:n.tenantName,
      email:n.tenantEmail,
      property:n.propertyName,
      unit:n.unitLabel,
      rent:n.rent,
      leaseStart:n.leaseStart,
      leaseEnd:n.leaseEnd
    };
    const to=String(tenant.email||n.tenantEmail||'').trim();
    if(!to) return;
    const start=prettyDate(n.leaseStart);
    const portal=(typeof window.nestiqAppBaseUrlSafe==='function'
      ? window.nestiqAppBaseUrlSafe()
      : String(location.origin||'').replace(/\/?$/,'/')+'/')+'index.html';
    const message=`Your application was approved. Sign in to NestIQ, open My Lease, and type your full name to accept the agreement for ${n.propertyName||'your property'}${n.unitLabel?' (Unit '+n.unitLabel+')':''}. Rent is not due until ${start}.`;
    const params={
      to_name:tenant.name||n.tenantName||'there',
      to_email:to,
      email:to,
      tenant_name:tenant.name||n.tenantName||'',
      property_name:n.propertyName||tenant.property||'Property',
      unit:n.unitLabel||tenant.unit||'',
      amount:String(n.rent||tenant.rent||0),
      lease_start:start,
      lease_end:prettyDate(n.leaseEnd),
      landlord_name:String(landlordSettings?.name||'Landlord'),
      subject:'Your NestIQ lease is ready to sign',
      message,
      dashboard_url:portal,
      invite_url:portal,
      link:portal
    };
    if(typeof window.nestiqSendEmailFireAndForget==='function'){
      window.nestiqSendEmailFireAndForget('leaseReady', params, {
        skipDuplicateCheck:true,
        tenantId:n.tenantId,
        propertyId:n.propertyId
      });
      return;
    }
    if(typeof window.sendCustomEmail==='function'){
      window.sendCustomEmail(tenant, params.subject, message).catch(()=>{});
    }
  }

  async function nestiqLandlordSendLeaseForSignature(leaseId, fields){
    const lease=nestiqLeaseById(leaseId);
    if(!lease) throw new Error('Lease not found');
    const included=Array.isArray(fields.utilitiesIncluded)?fields.utilitiesIncluded:[];
    const name=String(fields.typedName||'').trim();
    if(name.length<3) throw new Error('Type your full legal name to sign.');
    const patch={
      ...lease,
      rent:Number(fields.rent!=null?fields.rent:lease.rent)||0,
      deposit:Number(fields.deposit!=null?fields.deposit:lease.deposit)||0,
      dueDate:Math.max(1,Math.min(28,Number(fields.dueDate!=null?fields.dueDate:lease.dueDate)||1)),
      prorateFirstMonth:fields.prorateFirstMonth!=null?fields.prorateFirstMonth===true:!!lease.prorateFirstMonth,
      occupants:Math.max(1,Number(fields.occupants)||1),
      pets:{ allowed:!!fields.petsAllowed, details:String(fields.petsDetails||'') },
      utilitiesIncluded:included,
      utilitiesExcluded:UTILITY_OPTIONS.filter(u=>!included.includes(u)),
      noticePeriodDays:Math.max(1,Number(fields.noticePeriodDays)||30),
      maintenanceResponsibilities:String(fields.maintenanceResponsibilities||''),
      additionalClauses:String(fields.additionalClauses||'').split(/\n+/).map(s=>s.trim()).filter(Boolean),
      landlordSigned:signaturePayload(name),
      initialPayment:{
        depositDueNow:fields.depositDueNow!==false,
        firstRentDueNow:fields.firstRentDueNow===true
      },
      status:'pending_signature',
      storedStatus:'pending_signature'
    };
    const saved=await nestiqPersistLease(patch);
    await nestiqSyncTenantLeaseFields(saved,{ occupancyPending:true });
    if(saved.landlordSigned && saved.tenantSigned){
      return nestiqActivateLeaseIfFullySigned(saved);
    }
    await nestiqLeasePostTenantNotice(saved,
      'Your lease is ready to sign',
      `Please open your tenant portal, review the lease agreement for ${saved.propertyName||'your property'}, and sign if you agree to the terms.`
    );
    nestiqEmailLeaseReady(saved);
    if(!fields.silent) nestiqShowNotif?.('Lease sent for tenant signature','success');
    try{ window.renderRenewalsPage?.(); }catch(_e){}
    return saved;
  }

  function nestiqSessionIsLeaseLandlord(lease){
    const uid=authUid();
    const lid=String(lease?.landlordId||lidOf()||'');
    return !!(uid && lid && uid===lid);
  }

  async function nestiqTenantSignLease(leaseId, typedName, agreed){
    if(!agreed) throw new Error('You must confirm that you have read and agree to the terms.');
    const name=String(typedName||'').trim();
    if(name.length<3) throw new Error('Type your full legal name to sign.');
    const lease=nestiqLeaseById(leaseId);
    if(!lease) throw new Error('Lease not found');
    if(!lease.landlordSigned){
      throw new Error('The landlord must sign and send this lease before you can sign.');
    }
    if(lease.storedStatus!=='pending_signature' && lease.status!=='pending_signature'){
      throw new Error('This lease is not waiting for your signature.');
    }
    // Tenant Firestore rules allow only tenantSigned / status / updatedAt.
    // This is a typed-name acknowledgement (student project), not a certified e-signature.
    const signed=signaturePayload(name);
    const tenant=nestiqFindTenant(lease.tenantId)||window.currentTenantData;
    const nextStatus=nestiqLeaseNeedsInitialPayment(lease, tenant)?'awaiting_payment':'active';
    const uid=authUid();
    const col=leasesCol(lease.landlordId);
    if(col && window.nestiqUseFirestore){
      const patch={ tenantSigned:signed, status:nextStatus };
      if(uid) patch.tenantUid=uid;
      const f=fv();
      if(f) patch.updatedAt=f.serverTimestamp();
      await col.doc(String(lease.id)).set(patch,{ merge:true });
    }
    const saved=nestiqNormalizeLease({
      ...lease,
      tenantSigned:signed,
      status:nextStatus,
      storedStatus:nextStatus
    });
    upsertLocalLease(saved);
    if(saved.landlordSigned && saved.tenantSigned){
      return nestiqActivateLeaseIfFullySigned(saved);
    }
    nestiqShowNotif?.('Signature saved. Waiting for the landlord to sign.','info');
    return saved;
  }

  function nestiqOpenLeasePdf(leaseId, opts){
    const lease=nestiqLeaseById(leaseId);
    if(!lease){ nestiqShowNotif?.('Lease not found','error'); return; }
    const tenant=nestiqFindTenant(lease.tenantId)||{
      name:lease.tenantName, email:lease.tenantEmail, phone:'',
      unit:lease.unitLabel, leaseStart:lease.leaseStart, leaseEnd:lease.leaseEnd,
      rent:lease.rent, deposit:lease.deposit, monthlyDueDate:lease.dueDate
    };
    const property=nestiqFindProperty(lease.propertyId, lease.propertyName)||{
      name:lease.propertyName, addr:'', type:'', bedrooms:''
    };
    if(typeof generateLeasePDF!=='function'){
      nestiqShowNotif?.('PDF generator is not loaded','error');
      return;
    }
    generateLeasePDF(tenant, property, lease.additionalClauses||[], lease, opts||{});
  }

  function nestiqOpenDraftLeaseModal(leaseId){
    const lease=nestiqLeaseById(leaseId);
    if(!lease){ nestiqShowNotif?.('Lease not found','error'); return; }
    const included=new Set(lease.utilitiesIncluded||[]);
    const utilHtml=UTILITY_OPTIONS.map(u=>`
      <label style="display:flex;gap:8px;align-items:center;font-size:0.86rem">
        <input type="checkbox" data-lease-util="${u}" ${included.has(u)?'checked':''}> ${u.charAt(0).toUpperCase()+u.slice(1)} included
      </label>`).join('');
    document.getElementById('modalContent').innerHTML=`
      <h2 class="modal-title">Configure lease</h2>
      <p class="modal-sub">${esc(lease.tenantName)} · ${esc(lease.propertyName)}${lease.unitLabel?' · '+esc(lease.unitLabel):''}</p>
      <p style="font-size:0.8rem;color:var(--muted);margin:0 0 12px">Student-project acknowledgement: signing captures your typed name, agreement, time, and account id. It is not a certified electronic signature.</p>
      <div class="nestiq-papp-grid2">
        <div class="form-group"><label>Monthly rent (R)</label><input class="form-input" type="number" min="0" id="leaseCfgRent" value="${Number(lease.rent||0)}"></div>
        <div class="form-group"><label>Deposit (R)</label><input class="form-input" type="number" min="0" id="leaseCfgDeposit" value="${Number(lease.deposit||0)}"></div>
        <div class="form-group"><label>Rent due day</label>
          <select class="form-input" id="leaseCfgDueDay">${nestiqDueDayOptionsHtml(lease.dueDate)}</select>
        </div>
        <div class="form-group"><label>Payment frequency</label>
          <select class="form-input" id="leaseCfgFreq" disabled><option value="monthly" selected>Monthly</option></select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <div class="nestiq-money-opts">
            <div class="nestiq-money-opts-kicker">Move-in collection</div>
            <label class="nestiq-money-opt">
              <input type="checkbox" id="leaseCfgDepositNow" ${lease.initialPayment?.depositDueNow!==false?'checked':''}>
              <span>
                <strong>Collect the security deposit before occupancy</strong>
                <em>The unit stays reserved until the tenant pays in the app.</em>
              </span>
            </label>
            <label class="nestiq-money-opt">
              <input type="checkbox" id="leaseCfgFirstRentNow" ${lease.initialPayment?.firstRentDueNow?'checked':''}>
              <span>
                <strong>Also collect first month’s rent now</strong>
                <em>Leave off to bill rent on the due day.</em>
              </span>
            </label>
          </div>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:0.86rem;cursor:pointer">
            <input type="checkbox" id="leaseCfgProrate" ${lease.prorateFirstMonth?'checked':''}>
            <span>Prorate first month if the tenant moves in after day 1 (charge remaining days only, then full rent from the next month)</span>
          </label>
        </div>
        <div class="form-group"><label>Occupants</label><input class="form-input" type="number" min="1" id="leaseCfgOccupants" value="${lease.occupants}"></div>
        <div class="form-group"><label>Notice period (days)</label><input class="form-input" type="number" min="1" id="leaseCfgNotice" value="${lease.noticePeriodDays}"></div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="leaseCfgPetsAllowed" ${lease.pets.allowed?'checked':''}> Pets allowed</label>
          <input class="form-input" id="leaseCfgPetsDetails" placeholder="Pet details (type, number)" value="${esc(lease.pets.details)}" style="margin-top:6px">
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Utilities included</label><div style="display:grid;gap:6px">${utilHtml}</div></div>
        <div class="form-group" style="grid-column:1/-1"><label>Maintenance responsibilities</label>
          <textarea class="form-input form-textarea" id="leaseCfgMaint" rows="3">${esc(lease.maintenanceResponsibilities)}</textarea>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Additional clauses (one per line)</label>
          <textarea class="form-input form-textarea" id="leaseCfgClauses" rows="3">${esc((lease.additionalClauses||[]).join('\n'))}</textarea>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Type your full legal name to sign</label>
          <input class="form-input" id="leaseCfgSignName" autocomplete="name" placeholder="${esc(authName()||'Full name')}">
        </div>
        <label style="grid-column:1/-1;display:flex;gap:8px;align-items:flex-start;font-size:0.86rem">
          <input type="checkbox" id="leaseCfgAgree">
          <span>I have read and agree to these terms, and I send this lease to the tenant for signature.</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="btn-outline btn-sm" onclick='nestiqOpenLeasePdf(${JSON.stringify(String(lease.id))},{preview:true})'>Preview PDF</button>
        <button type="button" class="btn-gold" id="leaseCfgSubmit" style="flex:1;justify-content:center">Sign &amp; send for signature</button>
      </div>`;
    nestiqOpenModalAnimated?.();
    const sendBtn=document.getElementById('leaseCfgSubmit');
    if(sendBtn){
      sendBtn.addEventListener('click',()=>nestiqSubmitDraftLeaseConfig(String(lease.id)));
    }
  }

  async function nestiqSubmitDraftLeaseConfig(leaseId){
    const btn=document.getElementById('leaseCfgSubmit');
    if(!document.getElementById('leaseCfgAgree')?.checked){
      nestiqShowNotif?.('Confirm that you have read and agree to these terms.','warning');
      return;
    }
    const typed=document.getElementById('leaseCfgSignName')?.value||'';
    if(String(typed).trim().length<3){
      nestiqShowNotif?.('Type your full legal name to sign.','warning');
      return;
    }
    const included=[...document.querySelectorAll('[data-lease-util]:checked')].map(el=>el.getAttribute('data-lease-util'));
    nestiqSetBtnLoading?.(btn,true,'Sending…');
    try{
      await nestiqLandlordSendLeaseForSignature(leaseId,{
        rent:document.getElementById('leaseCfgRent')?.value,
        deposit:document.getElementById('leaseCfgDeposit')?.value,
        dueDate:document.getElementById('leaseCfgDueDay')?.value,
        prorateFirstMonth:!!document.getElementById('leaseCfgProrate')?.checked,
        occupants:document.getElementById('leaseCfgOccupants')?.value,
        noticePeriodDays:document.getElementById('leaseCfgNotice')?.value,
        petsAllowed:document.getElementById('leaseCfgPetsAllowed')?.checked,
        petsDetails:document.getElementById('leaseCfgPetsDetails')?.value,
        utilitiesIncluded:included,
        maintenanceResponsibilities:document.getElementById('leaseCfgMaint')?.value,
        additionalClauses:document.getElementById('leaseCfgClauses')?.value,
        depositDueNow:!!document.getElementById('leaseCfgDepositNow')?.checked,
        firstRentDueNow:!!document.getElementById('leaseCfgFirstRentNow')?.checked,
        typedName:typed
      });
      nestiqCloseModalAnimated?.();
    }catch(err){
      console.warn('NestIQ: send lease for signature', err);
      nestiqShowNotif?.(err?.message||'Could not send lease','error');
    }finally{
      nestiqSetBtnLoading?.(btn,false);
    }
  }

  function nestiqOpenTenantSignLeaseModal(leaseId){
    let lease=nestiqLeaseById(leaseId);
    if(!lease && window.currentTenantData && typeof nestiqPrimaryLeaseForTenant==='function'){
      lease=nestiqPrimaryLeaseForTenant(window.currentTenantData.id);
    }
    if(!lease){
      nestiqShowNotif?.('Your lease is not loaded yet. Wait a few seconds and try again. If it still fails, ask the landlord to open Leases and tap Sign & send to tenant.','warning');
      return;
    }
    if(!lease.landlordSigned){
      nestiqShowNotif?.('The landlord signs first — when they approve you (or from Leases → Sign & send). You sign after that.','info');
      return;
    }
    if(lease.tenantSigned){
      nestiqShowNotif?.('You have already signed this lease.','info');
      return;
    }
    const host=document.getElementById('modalContent');
    if(!host){
      nestiqShowNotif?.('Could not open the sign form. Refresh the page and try again.','error');
      return;
    }
    const session=typeof getSession==='function'?getSession():window.__nestiqSession;
    const defaultName=String(session?.name||lease.tenantName||'').trim();
    host.innerHTML=`
      <h2 class="modal-title">Sign lease</h2>
      <p class="modal-sub">${esc(lease.propertyName)}${lease.unitLabel?' · '+esc(lease.unitLabel):''}</p>
      <p style="font-size:0.8rem;color:var(--muted)">The landlord has already signed. Type your full legal name to accept. This is a student-project acknowledgement, not a certified electronic signature.</p>
      <div class="form-group"><label>Type your full legal name</label>
        <input class="form-input" id="leaseTenantSignName" autocomplete="name" value="${esc(defaultName)}">
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:0.86rem;margin:12px 0">
        <input type="checkbox" id="leaseTenantAgree">
        <span>I have read this lease agreement and I agree to these terms.</span>
      </label>
      <button type="button" class="btn-gold" id="leaseTenantSignBtn" style="width:100%;justify-content:center">Sign lease</button>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else{
      const ov=document.getElementById('modalOverlay');
      if(ov){ ov.classList.add('open'); ov.style.display='flex'; }
    }
    const signBtn=document.getElementById('leaseTenantSignBtn');
    if(signBtn){
      signBtn.addEventListener('click',()=>nestiqSubmitTenantLeaseSignature(String(lease.id)));
    }
  }

  async function nestiqSubmitTenantLeaseSignature(leaseId){
    const btn=document.getElementById('leaseTenantSignBtn');
    nestiqSetBtnLoading?.(btn,true,'Signing…');
    try{
      await nestiqTenantSignLease(
        leaseId,
        document.getElementById('leaseTenantSignName')?.value||'',
        !!document.getElementById('leaseTenantAgree')?.checked
      );
      nestiqCloseModalAnimated?.();
      const saved=nestiqLeaseById(leaseId);
      const st=String(saved?.storedStatus||saved?.status||'');
      nestiqShowNotif?.(st==='awaiting_payment'
        ? 'Lease signed — pay the move-in amount to occupy the unit'
        : 'Lease signed — your portal is now unlocked','success');
      try{ window.nestiqApplyTenantPortalChrome?.(); }catch(_e){}
      try{ window.renderGettingStartedTenant?.(); }catch(_e){}
      try{ window.renderTenantLeaseCard?.(window.currentTenantData); }catch(_e){}
      try{ window.renderTenantDashboard?.(); }catch(_e){}
    }catch(err){
      console.warn('NestIQ: tenant sign lease', err);
      const raw=String(err?.code||'')+' '+String(err?.message||'');
      nestiqShowNotif?.(
        /permission-denied|insufficient|Missing or insufficient/i.test(raw)
          ? 'Could not save your signature. Refresh the page, stay signed in as the tenant, and try again. If it still fails, the project Firestore rules need to be published.'
          : (err?.message||'Could not sign lease'),
        'error'
      );
    }finally{
      nestiqSetBtnLoading?.(btn,false);
    }
  }

  function nestiqRenderLeasesPortfolioTable(){
    const host=document.getElementById('nestiqLeasesTableWrap');
    if(!host) return;
    const rows=leasesList().map(nestiqNormalizeLease)
      .sort((a,b)=>String(b.leaseStart||'').localeCompare(String(a.leaseStart||'')));
    if(!rows.length){
      host.innerHTML='<p style="color:var(--muted);font-size:0.86rem;margin:0">No lease records yet. Approving an application creates a lease and sends it to the tenant to sign.</p>';
      return;
    }
    host.innerHTML=`
      <div style="overflow:auto">
        <table class="renewal-tax-table" style="width:100%">
          <thead><tr>
            <th>Status</th><th>Tenant</th><th>Unit</th><th>Rent</th><th>Term</th><th></th>
          </tr></thead>
          <tbody>${rows.map(l=>{
            const idJs=JSON.stringify(String(l.id));
            const badge=l.status==='active'?'badge-green':l.status==='pending_signature'?'badge-amber':l.status==='awaiting_payment'?'badge-gold':l.status==='draft'?'badge-gold':l.status==='expired'?'badge-red':'badge-red';
            let actions='';
            if(!l.landlordSigned){
              actions=`<button type="button" class="btn-gold btn-sm" onclick='nestiqOpenDraftLeaseModal(${idJs})'>Sign &amp; send to tenant</button>`;
            }else{
              const tidJs=l.tenantId?JSON.stringify(String(l.tenantId)):'';
              const end=String(l.leaseEnd||'').slice(0,10);
              const daysLeft=end?(Math.ceil((new Date(end+'T12:00:00')-new Date())/86400000)):null;
              const needsRenew=l.status==='expired'||(daysLeft!=null&&daysLeft<=90);
              actions=`<button type="button" class="btn-outline btn-sm" onclick='nestiqOpenLeasePdf(${idJs},{preview:true})'>View PDF</button>`;
              if(needsRenew&&tidJs&&typeof window.openStartRenewalModal==='function'){
                actions+=` <button type="button" class="btn-primary btn-sm" onclick='openStartRenewalModal(${tidJs})'>Start renewal</button>`;
              }
            }
            return `<tr>
              <td><span class="badge ${badge}">${esc(nestiqLeaseStatusLabel(l.status))}</span></td>
              <td>${esc(l.tenantName||'—')}</td>
              <td>${esc([l.propertyName,l.unitLabel].filter(Boolean).join(' · ')||'—')}</td>
              <td>R${Number(l.rent||0).toLocaleString('en-ZA')}</td>
              <td>${esc(prettyDate(l.leaseStart))} – ${esc(prettyDate(l.leaseEnd))}</td>
              <td style="white-space:nowrap">${actions}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function nestiqRememberLeaseStatuses(rows){
    const prev=window.__nestiqLeaseStatusMemory||{};
    const next={};
    (rows||[]).forEach(raw=>{
      const n=nestiqNormalizeLease(raw);
      next[n.id]=n.storedStatus||n.status;
      const was=prev[n.id];
      const isActive=n.storedStatus==='active'||n.status==='active'||n.status==='expired';
      if(!isActive) return;
      const unit=(typeof nestiqUnitsList==='function'?nestiqUnitsList():window.unitsData||[])
        .find(u=>n.unitId&&String(u.id)===String(n.unitId));
      const unitSt=String(unit?.status||'').toLowerCase();
      const prop=nestiqFindProperty(n.propertyId, n.propertyName);
      const propSt=String(prop?.status||'').toLowerCase();
      const needsOccupy=n.unitId ? (unitSt!=='occupied') : (prop && propSt!=='occupied');
      if(needsOccupy) nestiqOccupyFromActiveLease(n);
      if(was && was!=='active'){
        nestiqLeaseNotifyLandlord('📝', `Lease signed and active: ${n.tenantName||'Tenant'} — ${n.propertyName||'property'} is now occupied.`);
        nestiqLeasePostTenantNotice(n,
          'Your lease is now active',
          `Both parties have signed the lease for ${n.propertyName||'your property'}. Your unit is now occupied under this agreement (${prettyDate(n.leaseStart)} – ${prettyDate(n.leaseEnd)}).`
        );
      }
    });
    window.__nestiqLeaseStatusMemory=next;
  }

  window.leasesData=window.leasesData||[];
  window.nestiqNormalizeLease=nestiqNormalizeLease;
  window.nestiqLeaseStatusLabel=nestiqLeaseStatusLabel;
  window.nestiqLeaseById=nestiqLeaseById;
  window.nestiqLeasesForTenant=nestiqLeasesForTenant;
  window.nestiqPrimaryLeaseForTenant=nestiqPrimaryLeaseForTenant;
  window.nestiqPayableLeaseForTenant=nestiqPayableLeaseForTenant;
  window.nestiqLeaseLikeFromTenant=nestiqLeaseLikeFromTenant;
  window.nestiqTenantMonthlyRent=nestiqTenantMonthlyRent;
  window.nestiqOccupiedUnitForTenant=nestiqOccupiedUnitForTenant;
  window.nestiqLeaseIsActiveForRent=nestiqLeaseIsActiveForRent;
  window.nestiqLeaseInitialDue=nestiqLeaseInitialDue;
  window.nestiqLeaseNeedsInitialPayment=nestiqLeaseNeedsInitialPayment;
  window.nestiqTryActivateLeaseAfterMoney=nestiqTryActivateLeaseAfterMoney;
  window.nestiqMarkLeaseAwaitingPayment=nestiqMarkLeaseAwaitingPayment;
  window.nestiqCurrentRentObligation=nestiqCurrentRentObligation;
  window.nestiqHasPaymentForPeriod=nestiqHasPaymentForPeriod;
  window.nestiqPaymentYearMonth=nestiqPaymentYearMonth;
  window.nestiqPaymentCountsTowardMonthlyRent=nestiqPaymentCountsTowardMonthlyRent;
  window.nestiqLeasePeriodAmount=nestiqLeasePeriodAmount;
  window.nestiqLeasePeriodDueDate=nestiqLeasePeriodDueDate;
  window.nestiqLeaseFirstDueDate=nestiqLeaseFirstDueDate;
  window.nestiqLeaseSchedulePeriods=nestiqLeaseSchedulePeriods;
  window.nestiqDueDayOptionsHtml=nestiqDueDayOptionsHtml;
  window.nestiqOrdinalDay=nestiqOrdinalDay;
  window.nestiqTenantHasActiveOccupancy=nestiqTenantHasActiveOccupancy;
  window.nestiqReplaceLeases=replaceLeases;
  window.nestiqCreateDraftLease=nestiqCreateDraftLease;
  window.nestiqPersistLease=nestiqPersistLease;
  window.nestiqTerminateLeasesForTenant=async function nestiqTerminateLeasesForTenant(tenantId){
    const list=nestiqLeasesForTenant(tenantId);
    const now=new Date().toISOString().slice(0,10);
    for(const l of list){
      const st=String(l.storedStatus||l.status||'').toLowerCase();
      if(st==='terminated'||st==='draft') continue;
      try{ await nestiqPersistLease(l,{ status:'terminated', endedAt:now }); }catch(_e){}
    }
  };
  window.nestiqActivateLeaseIfFullySigned=nestiqActivateLeaseIfFullySigned;
  window.nestiqLandlordSendLeaseForSignature=nestiqLandlordSendLeaseForSignature;
  window.nestiqTenantSignLease=nestiqTenantSignLease;
  window.nestiqOpenLeasePdf=nestiqOpenLeasePdf;
  window.nestiqOpenDraftLeaseModal=nestiqOpenDraftLeaseModal;
  window.nestiqSubmitDraftLeaseConfig=nestiqSubmitDraftLeaseConfig;
  window.nestiqOpenTenantSignLeaseModal=nestiqOpenTenantSignLeaseModal;
  window.nestiqSubmitTenantLeaseSignature=nestiqSubmitTenantLeaseSignature;
  window.nestiqRenderLeasesPortfolioTable=nestiqRenderLeasesPortfolioTable;
  window.nestiqRememberLeaseStatuses=nestiqRememberLeaseStatuses;
  window.NESTIQ_LEASE_UTILITIES=UTILITY_OPTIONS;
})();
