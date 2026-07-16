/* Tenant invitations (Firestore) + post-add modal */

(function(){
  async function nestiqLookupInvitationByCode(code){
    const db=window.nestiqDb;
    if(!db||!code) return null;
    const normalized=String(code).toUpperCase().trim();
    let lookup=null;
    try{
      const lk=await window.nestiqFs.invitationLookup(db, normalized).get();
      if(lk.exists) lookup=lk.data();
    }catch(_e){}
    if(!lookup||!lookup.landlordId) return null;
    const lid=String(lookup.landlordId);
    let invDoc=null;
    try{
      invDoc=await window.nestiqFs.invitations(db, lid).doc(normalized).get();
    }catch(_e){}
    if(!invDoc||!invDoc.exists){
      invDoc=await window.nestiqFs.invitations(db, lid).doc(String(lookup.tenantId||'')).get();
    }
    if(!invDoc.exists) return null;
    const d=invDoc.data();
    if(String(d.status||lookup.status||'')!=='pending') return null;
    const now=Date.now();
    let ex=0;
    try{
      const exp=d.expiresAt||lookup.expiresAt;
      ex=exp&&exp.toMillis?exp.toMillis():new Date(exp||0).getTime();
    }catch(_e){}
    if(ex&&ex<now) return null;
    return{...d,id:Number(d.id!=null?d.id:invDoc.id),_fireId:invDoc.id,code:normalized,landlordId:lid};
  }

  async function nestiqCompleteInvitationAcceptance(inv,uid,email){
    const db=window.nestiqDb;
    if(!db) return;
    const code=String(inv.code||inv._fireId||'').toUpperCase().trim();
    const lid=String(inv.landlordId||'');
    const fid=code||String(inv.id);
    const tenantDocId=String(inv.tenantId!=null?inv.tenantId:'');
    const tRef=window.nestiqFs.tenants(db, lid).doc(tenantDocId);

    await window.nestiqFs.tenantAccount(db, uid).set({
      landlordId:lid,
      tenantId:tenantDocId,
      propertyId:inv.propertyId!=null?String(inv.propertyId):'',
      status:'active'
    },{ merge:true });
    window.nestiqTenantSession={
      landlordId:lid,
      tenantId:tenantDocId,
      propertyId:inv.propertyId!=null?String(inv.propertyId):'',
      status:'active'
    };

    await tRef.set({
      id:tenantDocId,
      tenantId:tenantDocId,
      name:String(inv.tenantName||''),
      email:String(email||inv.tenantEmail||'').toLowerCase(),
      propertyId:inv.propertyId!=null?inv.propertyId:null,
      property:String(inv.propertyName||''),
      landlordId:lid,
      hasPortalAccess:true,
      portalEmail:String(email||'').toLowerCase(),
      portalUid:uid,
      firstLogin:true,
      status:'paid',
      monthlyDueDate:1
    },{ merge:true });

    try{
      await window.nestiqFs.invitations(db, lid).doc(fid).update({
        status:'accepted',
        acceptedAt:firebase.firestore.FieldValue.serverTimestamp(),
        acceptedByUid:uid
      });
    }catch(e){
      console.warn('NestIQ: invitation status update', e);
    }
    try{
      await window.nestiqFs.invitationLookup(db, code).set({
        landlordId:lid,
        tenantId:tenantDocId,
        propertyId:inv.propertyId!=null?String(inv.propertyId):'',
        status:'accepted',
        expiresAt:inv.expiresAt||null
      },{ merge:true });
    }catch(_e){}
    try{
      if(typeof window.nestiqMarkApplicationsApprovedForTenant==='function'){
        await window.nestiqMarkApplicationsApprovedForTenant({
          id:inv.tenantId,
          email:String(email||inv.tenantEmail||'').toLowerCase(),
          propertyId:inv.propertyId,
          property:inv.propertyName,
          landlordId:inv.landlordId
        },{ email });
      }
    }catch(_e){ console.warn('NestIQ: mark application approved on invite accept', _e); }
  }

  function nestiqInvitationEmailJsCredentials(){
    const ej=(typeof landlordSettings!=='undefined'&&landlordSettings&&landlordSettings.emailjs)||{};
    const publicKey=String(ej.publicKey||'').trim();
    const serviceId=String(ej.serviceId||'').trim();
    const templateId=String((ej.templates&&ej.templates.welcomeTenant)||'').trim();
    return{publicKey,serviceId,templateId};
  }

  function nestiqFormatInviteExpiresDate(expires){
    const dt=expires instanceof Date?expires:new Date(expires);
    return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }

  async function nestiqSendInvitationEmailJs(opts, code, expires){
    const{publicKey,serviceId,templateId}=nestiqInvitationEmailJsCredentials();
    const toEmail=String(opts.tenantEmail||'').trim();
    if(!publicKey||!serviceId||!templateId||!toEmail){
      throw new Error('EmailJS not configured');
    }
    if(typeof window.emailjs==='undefined'||!window.emailjs){
      throw new Error('EmailJS library not loaded');
    }
    try{
      if(typeof initEmailJS==='function') initEmailJS();
      else if(window.emailjs&&publicKey) window.emailjs.init(publicKey);
    }catch(_e){}
    const portalUrl=(typeof nestiqAppBaseUrlSafe==='function'
      ?nestiqAppBaseUrlSafe()
      :String(location.origin+'/')).replace(/\/*$/,'/');
    const landlordNm=String(opts.landlordName||window.landlordName||landlordSettings?.name||'Landlord');
    const params={
      to_name:String(opts.tenantName||'Tenant'),
      to_email:toEmail,
      invitation_code:String(code||''),
      property_name:String(opts.propertyName||''),
      landlord_name:landlordNm,
      expires_date:nestiqFormatInviteExpiresDate(expires),
      portal_url:portalUrl
    };
    await window.emailjs.send(serviceId, templateId, params);
    if(typeof pushEmailLog==='function'){
      try{
        pushEmailLog({
          id:Date.now(),
          date:new Date().toISOString(),
          recipient:toEmail,
          tenantId:opts.tenantId!=null?opts.tenantId:null,
          tenant:String(opts.tenantName||params.to_name),
          type:'invitation',
          scope:String(code||''),
          status:'sent'
        });
      }catch(_e){}
    }
  }

  async function nestiqCreateInvitationRecord(opts){
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(!db||!lid) return null;
    opts=opts||{};
    const id=Date.now();
    const code='NQ-'+String(Math.floor(100000+Math.random()*900000));
    const expires=new Date(Date.now()+30*864e5);
    const row={
      id,
      code,
      tenantId:opts.tenantId,
      tenantName:opts.tenantName||'',
      tenantEmail:opts.tenantEmail||'',
      propertyId:opts.propertyId||null,
      propertyName:opts.propertyName||'',
      landlordId:lid,
      landlordName:opts.landlordName||window.landlordName||'',
      status:'pending',
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt:firebase.firestore.Timestamp.fromDate(expires)
    };
    await window.nestiqFs.invitations(db, lid).doc(code).set(row);
    await window.nestiqFs.invitationLookup(db, code).set({
      landlordId:lid,
      tenantId:String(opts.tenantId!=null?opts.tenantId:''),
      propertyId:opts.propertyId!=null?String(opts.propertyId):'',
      status:'pending',
      expiresAt:row.expiresAt
    });

    if(opts.skipEmail){
      return {...row,nestiqInvitationEmailStatus:'skipped_opt_out'};
    }
    const tenantEmail=String(opts.tenantEmail||'').trim();
    let nestiqInvitationEmailStatus='skipped_no_email';
    if(!tenantEmail){
      return {...row,nestiqInvitationEmailStatus};
    }

    const{publicKey,serviceId,templateId}=nestiqInvitationEmailJsCredentials();
    const emailConfigured=Boolean(publicKey&&serviceId&&templateId);

    if(!emailConfigured){
      showNotif?.('Email not configured — share this code manually with your tenant: '+code,'warning');
      return {...row,nestiqInvitationEmailStatus:'skipped_no_config',nestiqProminentCode:true};
    }

    try{
      await nestiqSendInvitationEmailJs(opts, code, expires);
      showNotif?.('Invitation sent to '+tenantEmail,'success');
      nestiqInvitationEmailStatus='sent';
    }catch(err){
      console.warn('NestIQ invitation email', err);
      if(typeof pushEmailLog==='function'){
        try{
          pushEmailLog({
            id:Date.now(),
            date:new Date().toISOString(),
            recipient:tenantEmail,
            tenantId:opts.tenantId!=null?opts.tenantId:null,
            tenant:String(opts.tenantName||''),
            type:'invitation',
            scope:String(code||''),
            status:'failed'
          });
        }catch(_e){}
      }
      showNotif?.('Invitation saved but email failed — share this code manually with your tenant: '+code,'warning');
      nestiqInvitationEmailStatus='failed';
    }
    return {...row,nestiqInvitationEmailStatus};
  }

  function nestiqInvitationStatusBadge(st){
    const s=String(st||'pending').toLowerCase();
    if(s==='accepted') return '<span class="badge badge-green">Accepted</span>';
    if(s==='expired') return '<span class="badge badge-amber">Expired</span>';
    if(s==='revoked') return '<span class="badge badge-red">Revoked</span>';
    return '<span class="badge badge-amber">Pending</span>';
  }

  function nestiqFormatInviteTs(v){
    if(!v) return '—';
    try{
      if(v.toDate) return v.toDate().toLocaleDateString('en-GB');
      return new Date(v).toLocaleDateString('en-GB');
    }catch(_e){ return '—'; }
  }

  function nestiqRenderInvitationsTable(){
    const body=document.getElementById('nestiqInvitationsBody');
    if(!body) return;
    const rows=(window.nestiqInvitations||[]).slice().sort((a,b)=>{
      const ta=a.createdAt&&a.createdAt.seconds?a.createdAt.seconds:0;
      const tb=b.createdAt&&b.createdAt.seconds?b.createdAt.seconds:0;
      return tb-ta;
    });
    if(!rows.length){
      body.innerHTML='<tr><td colspan="7" style="padding:14px;color:var(--muted)">No invitations yet.</td></tr>';
      return;
    }
    body.innerHTML=rows.map(inv=>{
      const fid=inv._fireId||inv.code||String(inv.id);
      const pending=String(inv.status||'')==='pending';
      const codeEsc=String(inv.code||'').replace(/</g,'&lt;');
      const acts=pending?`
        <button type="button" class="btn-outline btn-sm" onclick="nestiqCopyInvitationCode(${JSON.stringify(String(inv.code||''))})">Copy code</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqRevokeInvitation(${JSON.stringify(fid)})">Revoke</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqExpireInvitation(${JSON.stringify(fid)})">Mark expired</button>
      `:`${inv.code?`<button type="button" class="btn-outline btn-sm" onclick="nestiqCopyInvitationCode(${JSON.stringify(String(inv.code||''))})">Copy code</button>`:'—'}`;
      return `<tr>
        <td>${String(inv.tenantName||'—').replace(/</g,'&lt;')}</td>
        <td>${String(inv.tenantEmail||'—').replace(/</g,'&lt;')}</td>
        <td>${String(inv.propertyName||'—').replace(/</g,'&lt;')}</td>
        <td><code>${codeEsc||'—'}</code></td>
        <td>${nestiqInvitationStatusBadge(inv.status)}</td>
        <td>${nestiqFormatInviteTs(inv.expiresAt)}</td>
        <td style="white-space:nowrap">${acts}</td>
      </tr>`;
    }).join('');
  }

  async function nestiqUpdateInvitationStatus(fid, status){
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(!db||!lid||!fid) return;
    const code=String(fid).toUpperCase();
    await window.nestiqFs.invitations(db, lid).doc(code).update({ status });
    try{
      await window.nestiqFs.invitationLookup(db, code).set({ status }, { merge:true });
    }catch(_e){}
    nestiqRenderInvitationsTable();
  }

  function nestiqRevokeInvitation(fid){ nestiqUpdateInvitationStatus(fid,'revoked'); }
  function nestiqExpireInvitation(fid){ nestiqUpdateInvitationStatus(fid,'expired'); }

  function nestiqTenantNeedsPortalInvite(t){
    if(!t||t.portalUid) return false;
    const tid=String(t.id);
    const pending=(window.nestiqInvitations||[]).some(inv=>
      String(inv.tenantId)===tid && String(inv.status||'')==='pending'
    );
    return !pending;
  }

  async function nestiqInviteTenantToPortal(tenantId){
    const list=Array.isArray(window.tenantsData)?window.tenantsData:(typeof tenantsData!=='undefined'?tenantsData:[]);
    const tenant=list.find(x=>String(x.id)===String(tenantId));
    if(!tenant){
      showNotif?.('Tenant not found','error');
      return null;
    }
    if(tenant.portalUid){
      showNotif?.('This tenant already has portal access.','info');
      return null;
    }
    const inv=await nestiqAfterTenantAddedFlow(tenant,{ sendEmail:true, showModal:true });
    if(inv?.code){
      try{
        await navigator.clipboard?.writeText?.(inv.code);
      }catch(_e){}
    }
    return inv;
  }

  async function nestiqBulkInviteTenantsWithoutPortal(){
    const list=Array.isArray(window.tenantsData)?window.tenantsData:(typeof tenantsData!=='undefined'?tenantsData:[]);
    const targets=list.filter(nestiqTenantNeedsPortalInvite);
    if(!targets.length){
      showNotif?.('Every tenant already has portal access or a pending invite.','info');
      return;
    }
    if(!confirm(`Create portal invitation codes for ${targets.length} tenant(s)? You’ll see each code so you can share it.`)) return;
    let ok=0;
    for(const t of targets){
      const inv=await nestiqAfterTenantAddedFlow(t,{ sendEmail:true, showModal:false });
      if(inv?.code){
        ok+=1;
        showNotif?.(`${t.name||'Tenant'}: ${inv.code}`,'success');
      }
    }
    if(ok){
      const last=targets[ok-1];
      const invs=(window.nestiqInvitations||[]).filter(i=>
        targets.some(t=>String(t.id)===String(i.tenantId)) && String(i.status||'')==='pending'
      );
      if(invs.length===1) nestiqShowInvitationCreatedModal(invs[0], last);
      else showNotif?.(`Created ${ok} invitation code(s). Copy them from Portal invitations below.`,'success');
    }
  }

  function nestiqCopyInvitationCode(code){
    const c=String(code||'').trim();
    if(!c) return;
    try{
      navigator.clipboard?.writeText?.(c);
      showNotif?.('Copied '+c,'success');
    }catch(_e){
      showNotif?.(c,'info');
    }
  }

  async function nestiqAfterTenantAddedFlow(tenant, opts){
    opts=opts||{};
    if(!tenant) return null;
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(!window.nestiqUseFirestore||!db||!lid){
      showNotif?.('Cloud sync is off — create a portal invitation from Tenants when connected.','warning');
      return null;
    }
    const sendEmail=opts.sendEmail!==false;
    try{
      const inv=await nestiqCreateInvitationRecord({
        tenantId:tenant.id,
        tenantName:tenant.name||'',
        tenantEmail:tenant.email||tenant.portalEmail||'',
        propertyId:tenant.propertyId!=null?tenant.propertyId:null,
        propertyName:tenant.property||'',
        landlordName:window.landlordSettings?.name||window.landlordName||'',
        skipEmail:!sendEmail
      });
      if(!inv||!inv.code){
        showNotif?.('Could not create invitation code. Try Tenants → Portal invitations.','error');
        return null;
      }
      try{
        if(Array.isArray(window.nestiqInvitations)){
          window.nestiqInvitations.unshift({...inv,_fireId:inv.code});
        }
        nestiqRenderInvitationsTable();
      }catch(_e){}
      if(opts.showModal!==false && opts.fromApprove!==true){
        nestiqShowInvitationCreatedModal(inv, tenant);
      }else if(inv.nestiqProminentCode||inv.nestiqInvitationEmailStatus==='skipped_no_config'||inv.nestiqInvitationEmailStatus==='failed'){
        showNotif?.('Portal invitation code: '+inv.code,'info');
      }
      return inv;
    }catch(err){
      console.warn('NestIQ: after tenant added invitation', err);
      showNotif?.('Tenant saved, but invitation failed: '+(err?.message||'unknown error'),'error');
      return null;
    }
  }

  function nestiqShowInvitationCreatedModal(inv, tenant){
    const code=String(inv?.code||'');
    if(!code) return;
    const mc=document.getElementById('modalContent');
    const ov=document.getElementById('modalOverlay');
    if(!mc||!ov) return;
    const email=String(tenant?.email||inv.tenantEmail||'').replace(/</g,'&lt;');
    const name=String(tenant?.name||inv.tenantName||'Tenant').replace(/</g,'&lt;');
    mc.innerHTML=`
      <h2 class="modal-title">Portal invitation ready</h2>
      <p class="modal-sub">${name}${email?' · '+email:''}</p>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">Share this code so they can sign up for the tenant portal.</p>
      <div style="background:var(--paper);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-size:0.75rem;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase">Invitation code</div>
        <div id="nestiqInviteCodeDisplay" style="font-family:ui-monospace,monospace;font-size:1.55rem;font-weight:700;margin-top:6px;letter-spacing:0.08em">${code.replace(/</g,'&lt;')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn-gold btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(code)}).then(()=>showNotif('Code copied','success')).catch(()=>showNotif('Copy failed','error'))">Copy code</button>
        <button type="button" class="btn-outline btn-sm" onclick="closeModal()">Done</button>
      </div>`;
    ov.classList.add('open');
  }

  window.nestiqLookupInvitationByCode=nestiqLookupInvitationByCode;
  window.nestiqCompleteInvitationAcceptance=nestiqCompleteInvitationAcceptance;
  window.nestiqCreateInvitationRecord=nestiqCreateInvitationRecord;
  window.nestiqSendInvitationEmailJs=nestiqSendInvitationEmailJs;
  window.nestiqRenderInvitationsTable=nestiqRenderInvitationsTable;
  window.nestiqRevokeInvitation=nestiqRevokeInvitation;
  window.nestiqExpireInvitation=nestiqExpireInvitation;
  window.nestiqAfterTenantAddedFlow=nestiqAfterTenantAddedFlow;
  window.nestiqShowInvitationCreatedModal=nestiqShowInvitationCreatedModal;
  window.nestiqInviteTenantToPortal=nestiqInviteTenantToPortal;
  window.nestiqBulkInviteTenantsWithoutPortal=nestiqBulkInviteTenantsWithoutPortal;
  window.nestiqCopyInvitationCode=nestiqCopyInvitationCode;
  window.nestiqTenantNeedsPortalInvite=nestiqTenantNeedsPortalInvite;
})();
