(function(){
  'use strict';

  function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function lid(){
    return typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
  }
  function staffCodePrefix(role){
    return role === 'caretaker' ? 'CT' : 'CQ';
  }
  function staffDocId(role, sourceId){
    const raw=String(sourceId==null?'':sourceId).trim();
    return role === 'caretaker' ? (raw || `caretaker-${Date.now()}`) : `contractor-${raw}`;
  }
  function staffSourceLabel(role){
    return role === 'caretaker' ? 'caretaker' : 'contractor';
  }
  function staffInvitePublicBaseUrl(){
    if(typeof window.nestiqInvitationPublicBaseUrl==='function'){
      try{ return String(window.nestiqInvitationPublicBaseUrl()).replace(/\/*$/,'/'); }catch(_e){}
    }
    try{
      if(typeof window.nestiqAppBaseUrlSafe==='function') return String(window.nestiqAppBaseUrlSafe()).replace(/\/*$/,'/');
    }catch(_e){}
    return String(location.origin||'').replace(/\/*$/,'/')+'/';
  }
  function staffInviteExpiresLabel(expires){
    if(typeof window.nestiqFormatInviteExpiresDate==='function'){
      try{ return window.nestiqFormatInviteExpiresDate(expires); }catch(_e){}
    }
    try{
      const dt=expires instanceof Date?expires:new Date(expires);
      if(Number.isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    }catch(_e){ return ''; }
  }
  function staffInviteEmailCredentials(){
    if(typeof window.nestiqInvitationEmailJsCredentials==='function'){
      try{ return window.nestiqInvitationEmailJsCredentials(); }catch(_e){}
    }
    const ej=(window.landlordSettings&&window.landlordSettings.emailjs)||{};
    const templates=(ej.templates&&typeof ej.templates==='object')?ej.templates:{};
    return{
      publicKey:String(ej.publicKey||'').trim(),
      serviceId:String(ej.serviceId||'').trim(),
      templateId:String(templates.welcomeTenant||templates.customMessage||templates.nestiq_tenant_invitation||templates.tenantInvitation||'').trim()
    };
  }
  function nestiqStaffInviteShareText(opts, code, expires){
    const role=opts?.role==='caretaker'?'caretaker':'contractor';
    const title=role==='caretaker'?'caretaker':'contractor';
    const landlordNm=String(opts?.landlordName||window.landlordSettings?.name||window.landlordName||'Your landlord').trim()||'Your landlord';
    const staffName=String(opts?.staffName||opts?.name||'there').trim()||'there';
    const property=String(opts?.propertyName||'').trim();
    const propertyBit=property?` for ${property}`:'';
    const portalUrl=staffInvitePublicBaseUrl();
    const inviteLink=`${portalUrl}?invite=${encodeURIComponent(String(code||''))}`;
    const expiresLabel=staffInviteExpiresLabel(expires);
    return{
      portalUrl,
      inviteLink,
      landlordNm,
      subject:`Your NestIQ ${title} portal invitation`,
      body:`Hi ${staffName},\n\n${landlordNm} has invited you to the NestIQ ${title} portal${propertyBit}.\n\nInvitation code: ${code}\nOpen this link: ${inviteLink}\nChoose "Staff portal", enter this code, then sign up with the same email this message was sent to.${expiresLabel?`\nExpires: ${expiresLabel}`:''}`
    };
  }
  function nestiqStaffInviteMailtoHref(opts, code, expires){
    const share=nestiqStaffInviteShareText(opts, code, expires);
    const to=encodeURIComponent(String(opts?.staffEmail||opts?.email||'').trim());
    return `mailto:${to}?subject=${encodeURIComponent(share.subject)}&body=${encodeURIComponent(share.body)}`;
  }
  function nestiqStaffInviteWhatsAppHref(opts, code, expires){
    const share=nestiqStaffInviteShareText(opts, code, expires);
    const phone=String(opts?.staffPhone||opts?.phone||'').trim();
    const digits=typeof formatWhatsAppNumber==='function'?formatWhatsAppNumber(phone):phone.replace(/\D/g,'');
    return digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(share.body)}`
      : `https://wa.me/?text=${encodeURIComponent(share.body)}`;
  }
  async function nestiqSendStaffInvitationEmail(opts, code, expires){
    const toEmail=String(opts?.email||opts?.staffEmail||'').trim().toLowerCase();
    if(!toEmail) throw new Error('No email on file');
    const share=nestiqStaffInviteShareText({
      role:opts.role,
      staffName:opts.name||opts.staffName,
      staffEmail:toEmail,
      landlordName:opts.landlordName,
      propertyName:opts.propertyName
    }, code, expires);
    const landlordEmail=String(opts?.landlordEmail||window.landlordSettings?.email||window.landlordEmail||'').trim();
    const params={
      name:share.landlordNm,
      to_name:String(opts.name||opts.staffName||'there'),
      to_email:toEmail,
      email:toEmail,
      user_email:toEmail,
      recipient:toEmail,
      to:toEmail,
      invitation_code:String(code||''),
      property_name:String(opts.propertyName||(opts.role==='caretaker'?'your assigned property':'your contractor portal')),
      landlord_name:share.landlordNm,
      landlord_email:landlordEmail,
      expires_date:staffInviteExpiresLabel(expires),
      portal_url:share.inviteLink,
      invite_url:share.inviteLink,
      role:opts.role==='caretaker'?'caretaker':'contractor',
      subject:share.subject,
      message:share.body
    };
    let lastErr=null;
    if(typeof window.nestiqSendEmail==='function'){
      try{
        const ok=await window.nestiqSendEmail('staffInvitation', params, {
          skipDuplicateCheck:true,
          propertyId:opts.propertyId!=null?opts.propertyId:null
        });
        if(ok){
          if(typeof pushEmailLog==='function'){
            try{
              pushEmailLog({
                id:Date.now(),
                date:new Date().toISOString(),
                recipient:toEmail,
                tenant:String(opts.name||opts.staffName||''),
                type:'staffInvitation',
                scope:String(code||''),
                status:'sent'
              });
            }catch(_e){}
          }
          return true;
        }
      }catch(err){
        lastErr=err;
      }
    }
    const{publicKey,serviceId,templateId}=staffInviteEmailCredentials();
    if(!publicKey||!serviceId||!templateId){
      throw lastErr||new Error('EmailJS not configured — add Public Key, Service ID, and a Welcome Tenant template in Settings → Email');
    }
    if(typeof window.nestiqEmailJsSend==='function'){
      await window.nestiqEmailJsSend(serviceId, templateId, params);
    }else{
      if(typeof window.emailjs==='undefined'||!window.emailjs) throw new Error('EmailJS library not loaded');
      try{
        if(typeof initEmailJS==='function') initEmailJS();
        else window.emailjs.init({ publicKey });
      }catch(_e){}
      await window.emailjs.send(serviceId, templateId, params, { publicKey });
    }
    if(typeof pushEmailLog==='function'){
      try{
        pushEmailLog({
          id:Date.now(),
          date:new Date().toISOString(),
          recipient:toEmail,
          tenant:String(opts.name||opts.staffName||''),
          type:'staffInvitation',
          scope:String(code||''),
          status:'sent'
        });
      }catch(_e){}
    }
    return true;
  }
  function nestiqShowStaffInviteReadyModal(inv, extra){
    extra=extra||{};
    const code=String(inv?.code||'').trim();
    if(!code) return;
    const mc=document.getElementById('modalContent');
    if(!mc) return;
    const role=inv.role==='caretaker'?'caretaker':'contractor';
    const title=role==='caretaker'?'Caretaker':'Contractor';
    const name=esc(extra.name||inv.staffName||title);
    const email=String(extra.email||inv.staffEmail||'').trim();
    const phone=String(extra.phone||inv.staffPhone||'').trim();
    const emailed=inv.nestiqInvitationEmailStatus==='sent';
    const shareOpts={
      role,
      staffName:extra.name||inv.staffName,
      staffEmail:email,
      staffPhone:phone,
      landlordName:inv.landlordName,
      propertyName:extra.propertyName||inv.propertyName
    };
    const mailto=email?nestiqStaffInviteMailtoHref(shareOpts, code, inv.expiresAt):'';
    const wa=nestiqStaffInviteWhatsAppHref(shareOpts, code, inv.expiresAt);
    let statusHtml='';
    if(emailed){
      statusHtml=`<p style="font-size:0.88rem;color:var(--sage);margin-bottom:12px">Invitation emailed to <strong>${esc(email)}</strong>. If they do not receive it, check spam — or send it yourself below.</p>`;
    }else if(!email){
      statusHtml=`<p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">No email on file. Share this code another way.</p>`;
    }else if(inv.nestiqInvitationEmailStatus==='skipped_no_config'){
      statusHtml=`<p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">Email is not configured in Settings → Email. Share this code, or email / WhatsApp it from your device.</p>`;
    }else{
      statusHtml=`<p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">The invite email could not be sent automatically. Share this code, or email / WhatsApp it from your device.</p>`;
    }
    mc.innerHTML=`
      <h2 class="modal-title">${title} portal invitation</h2>
      <p class="modal-sub">${name}${email?' · '+esc(email):''}</p>
      ${statusHtml}
      <div style="background:var(--paper);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-size:0.75rem;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase">Invitation code</div>
        <div style="font-family:ui-monospace,monospace;font-size:1.55rem;font-weight:700;margin-top:6px;letter-spacing:0.08em">${esc(code)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn-gold btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(code)}).then(()=>nestiqShowNotif('Code copied','success')).catch(()=>nestiqShowNotif('Copy failed','error'))">Copy code</button>
        ${email?`<a class="btn-outline btn-sm" href="${String(mailto).replace(/"/g,'&quot;')}">Email ${title.toLowerCase()}</a>`:''}
        <a class="btn-outline btn-sm" href="${String(wa).replace(/"/g,'&quot;')}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Done</button>
      </div>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else document.getElementById('modalOverlay')?.classList.add('open');
  }
  function errShouldPropagate(err){
    const code=String(err?.code||'');
    const msg=String(err?.message||'');
    return code==='permission-denied'||code==='unavailable'||code==='failed-precondition'
      || /permission|unavailable|network|index|offline/i.test(msg);
  }
  async function readStaffDoc(db, landlordId, id){
    if(!db||!landlordId||!id||!window.nestiqFs?.staff) return null;
    const snap=await window.nestiqFs.staff(db, landlordId).doc(String(id)).get();
    return snap.exists ? { id:snap.id, ...snap.data() } : null;
  }
  async function upsertStaffRecord(record){
    const db=window.nestiqDb;
    const landlordId=String(record?.landlordId||lid()||'').trim();
    if(!db||!landlordId) return null;
    const role=record?.role==='caretaker' ? 'caretaker' : 'contractor';
    const staffId=staffDocId(role, record?.id||record?.staffId||record?.sourceId);
    const payload={
      id:staffId,
      role,
      name:String(record?.name||'').trim(),
      email:String(record?.email||'').trim().toLowerCase(),
      phone:String(record?.phone||'').trim(),
      uid:record?.uid||null,
      accountStatus:['invited','active'].includes(String(record?.accountStatus||'')) ? String(record.accountStatus) : 'none',
      assignedPropertyIds:Array.isArray(record?.assignedPropertyIds) ? record.assignedPropertyIds.map(x=>String(x)).filter(Boolean) : [],
      landlordId,
      linkedVendorId:role==='contractor' ? String(record?.linkedVendorId||record?.vendorId||record?.sourceId||'') : null,
      staffType:role==='contractor' ? String(record?.vendorType||record?.staffType||'Contractor') : 'Caretaker',
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await window.nestiqFs.staff(db, landlordId).doc(staffId).set(payload,{ merge:true });
    return payload;
  }
  async function nestiqListLandlordStaff(role){
    const db=window.nestiqDb;
    const landlordId=lid();
    if(!db||!landlordId||!window.nestiqFs?.staff) return [];
    let snap;
    try{
      snap=await window.nestiqFs.staff(db, landlordId).where('role','==',role).get();
    }catch(_e){
      snap=await window.nestiqFs.staff(db, landlordId).get();
    }
    const rows=snap.docs.map(doc=>({ id:doc.id, ...doc.data() }));
    return rows.filter(r=>String(r.role||'')===String(role||''));
  }
  async function nestiqCreateStaffInvitation(opts){
    opts=opts||{};
    const db=window.nestiqDb;
    const landlordId=String(opts.landlordId||lid()||'').trim();
    const role=opts.role==='caretaker' ? 'caretaker' : 'contractor';
    if(!db||!landlordId){
      nestiqShowNotif?.('Could not create invitation (not signed in / cloud offline).','error');
      return null;
    }
    const sourceId=String(opts.sourceId||opts.staffId||opts.vendorId||'').trim();
    const staffId=staffDocId(role, sourceId);
    const staff=await upsertStaffRecord({
      landlordId,
      role,
      id:staffId,
      sourceId,
      name:opts.name,
      email:opts.email,
      phone:opts.phone,
      accountStatus:'invited',
      assignedPropertyIds:opts.assignedPropertyIds||[],
      vendorType:opts.vendorType||opts.staffType||'',
      vendorId:opts.vendorId||sourceId
    });
    const code=`${staffCodePrefix(role)}-${String(Math.floor(100000+Math.random()*900000))}`;
    const expires=new Date(Date.now()+30*864e5);
    const fv=firebase.firestore.FieldValue;
    const row={
      code,
      role,
      staffId,
      sourceId,
      vendorId:role==='contractor' ? String(opts.vendorId||sourceId||'') : null,
      staffName:String(opts.name||staff?.name||'').trim(),
      staffEmail:String(opts.email||staff?.email||'').trim().toLowerCase(),
      staffPhone:String(opts.phone||staff?.phone||'').trim(),
      staffType:String(opts.vendorType||opts.staffType||staff?.staffType||''),
      assignedPropertyIds:Array.isArray(opts.assignedPropertyIds) ? opts.assignedPropertyIds.map(x=>String(x)).filter(Boolean) : [],
      landlordId,
      landlordName:String(opts.landlordName||window.landlordSettings?.name||window.landlordName||'').trim(),
      propertyName:String(opts.propertyName||'').trim(),
      status:'pending',
      createdAt:fv.serverTimestamp(),
      expiresAt:firebase.firestore.Timestamp.fromDate(expires)
    };
    await window.nestiqFs.staffInvitations(db, landlordId).doc(code).set(row);
    await window.nestiqFs.staffInvitationLookup(db, code).set({
      landlordId,
      role,
      staffId,
      sourceId,
      status:'pending',
      expiresAt:row.expiresAt
    });
    if(role==='contractor'){
      try{
        const v=(window.vendors||[]).find(x=>String(x.id)===String(sourceId));
        if(v){
          v.accountStatus='invited';
          if(row.staffEmail) v.email=row.staffEmail;
          saveData?.();
        }
      }catch(_e){}
    }
    const label=role==='caretaker'?'Caretaker':'Contractor';
    const staffEmail=String(row.staffEmail||'').trim();
    if(opts.skipEmail){
      nestiqShowNotif?.(`${label} invite code: ${code}`,'success');
      return {...row,nestiqInvitationEmailStatus:'skipped_opt_out'};
    }
    if(!staffEmail){
      nestiqShowNotif?.(`${label} invite code: ${code}`,'success');
      return {...row,nestiqInvitationEmailStatus:'skipped_no_email'};
    }
    const{publicKey,serviceId,templateId}=staffInviteEmailCredentials();
    const emailConfigured=Boolean(publicKey&&serviceId&&templateId);
    if(!emailConfigured){
      nestiqShowNotif?.(`${label} invite code ${code} created, but email is not configured in Settings → Email. Share the code with ${staffEmail}.`,'warning');
      return {...row,nestiqInvitationEmailStatus:'skipped_no_config',nestiqProminentCode:true};
    }
    try{
      await nestiqSendStaffInvitationEmail({
        role,
        name:row.staffName,
        staffName:row.staffName,
        email:staffEmail,
        staffEmail,
        landlordName:row.landlordName,
        propertyName:row.propertyName,
        propertyId:Array.isArray(row.assignedPropertyIds)&&row.assignedPropertyIds[0]?row.assignedPropertyIds[0]:null
      }, code, expires);
      nestiqShowNotif?.(`Invitation emailed to ${staffEmail} · code ${code} — if they do not see it, check spam or use WhatsApp on the invite popup.`,'success');
      return {...row,nestiqInvitationEmailStatus:'sent'};
    }catch(err){
      console.warn('NestIQ staff invitation email', err);
      if(typeof pushEmailLog==='function'){
        try{
          pushEmailLog({
            id:Date.now(),
            date:new Date().toISOString(),
            recipient:staffEmail,
            tenant:String(row.staffName||''),
            type:'staffInvitation',
            scope:String(code||''),
            status:'failed'
          });
        }catch(_e){}
      }
      nestiqShowNotif?.(`${label} invitation saved but email to ${staffEmail} failed — share this code manually: ${code}`,'warning');
      return {...row,nestiqInvitationEmailStatus:'failed'};
    }
  }
  async function nestiqLookupStaffInvitationByCode(code){
    const db=window.nestiqDb;
    if(!db||!code) return null;
    const normalized=String(code).toUpperCase().trim();
    let lookup=null;
    try{
      const lk=await window.nestiqFs.staffInvitationLookup(db, normalized).get();
      if(lk.exists) lookup=lk.data();
    }catch(err){
      if(errShouldPropagate(err)) throw err;
      return null;
    }
    if(!lookup?.landlordId) return null;
    const landlordId=String(lookup.landlordId);
    let invDoc=null;
    try{
      invDoc=await window.nestiqFs.staffInvitations(db, landlordId).doc(normalized).get();
    }catch(err){
      if(errShouldPropagate(err)) throw err;
      return null;
    }
    if(!invDoc?.exists) return null;
    const d=invDoc.data()||{};
    if(String(d.status||'')!=='pending') return null;
    let ex=0;
    try{
      const exp=d.expiresAt||lookup.expiresAt;
      ex=exp&&exp.toMillis?exp.toMillis():new Date(exp||0).getTime();
    }catch(_e){ ex=0; }
    if(ex&&ex<Date.now()) return null;
    return { ...d, code:normalized, landlordId, role:String(d.role||lookup.role||'contractor'), staffId:String(d.staffId||lookup.staffId||''), sourceId:String(d.sourceId||lookup.sourceId||'') };
  }
  async function nestiqCompleteStaffInvitationAcceptance(inv, uid, email){
    const db=window.nestiqDb;
    if(!db) throw new Error('Cloud is not ready. Refresh and try again.');
    const role=inv?.role==='caretaker' ? 'caretaker' : 'contractor';
    const landlordId=String(inv?.landlordId||'').trim();
    const staffId=String(inv?.staffId||'').trim();
    if(!landlordId||!staffId) throw new Error('Invitation data is incomplete.');
    const fv=firebase.firestore.FieldValue;
    const invitedEmail=String(email||inv.staffEmail||'').trim().toLowerCase();
    let staffSnap=null;
    try{
      staffSnap=await readStaffDoc(db, landlordId, staffId);
    }catch(err){
      console.warn('NestIQ: staff doc read during invite accept', err);
    }
    const assignedPropertyIds=Array.isArray(staffSnap?.assignedPropertyIds)
      ? staffSnap.assignedPropertyIds.map(x=>String(x)).filter(Boolean)
      : Array.isArray(inv?.assignedPropertyIds)
      ? inv.assignedPropertyIds.map(x=>String(x)).filter(Boolean)
      : [];
    const staffPayload={
      landlordId,
      role,
      staffId,
      uid,
      email:invitedEmail,
      name:String(inv.staffName||staffSnap?.name||'').trim(),
      phone:String(inv.staffPhone||staffSnap?.phone||'').trim(),
      accountStatus:'active',
      assignedPropertyIds,
      linkedVendorId:role==='contractor' ? String(inv.vendorId||staffSnap?.linkedVendorId||inv.sourceId||'') : null,
      staffType:String(inv.staffType||staffSnap?.staffType||''),
      landlordName:String(inv.landlordName||'').trim(),
      createdAt:fv.serverTimestamp()
    };
    // Write the signed-in user's own docs first so auth bootstrap can find the profile
    // even if landlord-owned staff/vendor rows are still denied by older rules.
    await window.nestiqFs.staffAccount(db, uid).set(staffPayload,{ merge:true });
    await db.collection('users').doc(uid).set({
      role,
      name:staffPayload.name,
      email:staffPayload.email,
      phone:staffPayload.phone,
      landlordId,
      landlordName:staffPayload.landlordName,
      staffId,
      assignedPropertyIds,
      vendorId:role==='contractor' ? staffPayload.linkedVendorId : null,
      vendorType:role==='contractor' ? staffPayload.staffType : '',
      createdAt:fv.serverTimestamp()
    },{ merge:true });
    try{
      await window.nestiqFs.staff(db, landlordId).doc(staffId).set({
        uid,
        email:staffPayload.email,
        accountStatus:'active',
        updatedAt:fv.serverTimestamp()
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: staff row activate during invite accept', err);
    }
    if(role==='contractor'){
      const vendorId=String(inv.vendorId||staffPayload.linkedVendorId||'');
      if(vendorId){
        await window.nestiqFs.contractorAccount?.(db, uid)?.set({
          landlordId,
          vendorId,
          email:staffPayload.email,
          name:staffPayload.name,
          landlordName:staffPayload.landlordName,
          vendorType:staffPayload.staffType,
          status:'active',
          role:'contractor',
          createdAt:fv.serverTimestamp()
        },{ merge:true });
        try{
          await window.nestiqFs.vendors?.(db, landlordId)?.doc(vendorId).set({
            uid,
            email:staffPayload.email,
            accountStatus:'active'
          },{ merge:true });
        }catch(err){
          console.warn('NestIQ: vendor activate during invite accept', err);
        }
      }
    }
    try{
      await window.nestiqFs.staffInvitations(db, landlordId).doc(String(inv.code||'').toUpperCase()).update({
        status:'accepted',
        acceptedAt:fv.serverTimestamp(),
        acceptedByUid:uid
      });
      await window.nestiqFs.staffInvitationLookup(db, String(inv.code||'').toUpperCase()).set({
        status:'accepted'
      },{ merge:true });
    }catch(_e){}
  }
  async function syncCaretakerMirrorsForProperty(db, landlordId, propertyId, staffId){
    if(!db||!landlordId||propertyId==null||!window.nestiqFs) return;
    const pid=String(propertyId);
    const sid=String(staffId||'').trim()||null;
    const p=(window.propertiesData||[]).find(x=>String(x.id)===pid);
    const limit=Number(p?.maintenanceSettings?.repairApprovalLimit
      ?? window.landlordSettings?.caretakerAutoApproveLimit
      ?? 1000)||1000;
    const cprop=window.nestiqFs.caretakerProperties?.(db, landlordId);
    if(cprop){
      await cprop.doc(pid).set({
        propertyId:pid,
        caretakerId:sid,
        name:p?.name||'',
        addr:p?.addr||'',
        status:p?.status||'',
        type:p?.type||'',
        bedrooms:Number(p?.bedrooms||0)||0,
        bathrooms:Number(p?.bathrooms||0)||0,
        parkingBays:Number(p?.parkingBays||0)||0,
        floorSize:p?.floorSize||null,
        photoUrl:p?.photoUrl||null,
        autoApproveLimit:limit,
        caretakerCanManage:p?.maintenanceSettings?.caretakerCanManage!==false,
        maintenanceSettings:p?.maintenanceSettings||null,
        landlordId
      },{ merge:true });
    }
    const cuid=window.nestiqFs.caretakerUnits?.(db, landlordId);
    if(cuid){
      const units=(window.unitsData||[]).filter(u=>String(u.propertyId||'')===pid);
      await Promise.all(units.map(u=>{
        if(u?.id==null||u.id==='') return Promise.resolve();
        return cuid.doc(String(u.id)).set({
          unitId:String(u.id),
          propertyId:pid,
          label:u.label||u.unitNumber||'',
          unitNumber:u.unitNumber||u.label||'',
          bedrooms:Number(u.bedrooms||0)||0,
          bathrooms:Number(u.bathrooms||0)||0,
          status:u.status||'vacant',
          tenantId:u.tenantId!=null&&u.tenantId!==''?String(u.tenantId):null,
          tenantName:u.tenantName||null,
          notes:u.notes||'',
          landlordId
        },{ merge:true });
      }));
    }
    const cten=window.nestiqFs.caretakerTenants?.(db, landlordId);
    if(cten){
      const tenants=(window.tenantsData||[]).filter(t=>String(t.propertyId||'')===pid);
      await Promise.all(tenants.map(t=>{
        if(t?.id==null||t.id==='') return Promise.resolve();
        return cten.doc(String(t.id)).set({
          tenantId:String(t.id),
          propertyId:pid,
          property:t.property||p?.name||'',
          unit:t.unit||t.unitNumber||'',
          name:t.name||'',
          email:t.email||'',
          phone:t.phone||'',
          status:t.status||'',
          leaseStart:t.leaseStart||t.moveInDate||t.moveIn||null,
          moveInDate:t.moveInDate||t.leaseStart||t.moveIn||null,
          landlordId,
          portalUid:t.portalUid||null
        },{ merge:true });
      }));
    }
  }
  async function nestiqAssignCaretakerToProperty(propertyId, staffId){
    const db=window.nestiqDb;
    const landlordId=lid();
    if(!db||!landlordId||propertyId==null) throw new Error('Property assignment is unavailable right now.');
    const pid=String(propertyId);
    const sid=String(staffId||'').trim();
    const fv=firebase.firestore.FieldValue;
    const prop=(window.propertiesData||[]).find(x=>String(x.id)===pid);
    if(prop){
      prop.caretakerId=sid||null;
      if(!sid){
        prop.caretakerName=null;
        prop.caretakerUid=null;
        prop.caretakerEmail=null;
        prop.caretakerPhone=null;
      }
    }
    const staff=sid?await readStaffDoc(db, landlordId, sid):null;
    await window.nestiqFs.properties(db, landlordId).doc(pid).set({
      caretakerId:sid||null,
      caretakerName:staff?.name||null,
      caretakerUid:staff?.uid||null,
      caretakerEmail:staff?.email||null,
      caretakerPhone:staff?.phone||null,
      updatedAt:fv.serverTimestamp()
    },{ merge:true });
    if(prop&&staff){
      prop.caretakerName=staff.name||null;
      prop.caretakerUid=staff.uid||null;
      prop.caretakerEmail=staff.email||null;
      prop.caretakerPhone=staff.phone||null;
    }
    try{ await syncCaretakerMirrorsForProperty(db, landlordId, pid, sid); }catch(err){
      console.warn('NestIQ: caretaker property mirror', err);
    }
    if(!sid) return null;
    const next=Array.from(new Set([...(Array.isArray(staff?.assignedPropertyIds)?staff.assignedPropertyIds:[]), pid]));
    await window.nestiqFs.staff(db, landlordId).doc(sid).set({
      assignedPropertyIds:next,
      updatedAt:fv.serverTimestamp()
    },{ merge:true });
    if(staff?.uid){
      await window.nestiqFs.staffAccount(db, staff.uid).set({ assignedPropertyIds:next },{ merge:true });
      try{
        await db.collection('users').doc(staff.uid).set({ assignedPropertyIds:next },{ merge:true });
      }catch(_e){}
    }
    return staff;
  }
  async function nestiqUnassignCaretakerFromProperty(propertyId, staffId){
    const db=window.nestiqDb;
    const landlordId=lid();
    if(!db||!landlordId||propertyId==null) throw new Error('Property assignment is unavailable right now.');
    const pid=String(propertyId);
    const sid=String(staffId||'').trim();
    const prop=(window.propertiesData||[]).find(x=>String(x.id)===pid);
    if(prop&&String(prop.caretakerId||'')===sid){
      prop.caretakerId=null;
      prop.caretakerName=null;
      prop.caretakerUid=null;
      prop.caretakerEmail=null;
      prop.caretakerPhone=null;
    }
    await window.nestiqFs.properties(db, landlordId).doc(pid).set({
      caretakerId:null,
      caretakerName:null,
      caretakerUid:null,
      caretakerEmail:null,
      caretakerPhone:null
    },{ merge:true });
    try{ await syncCaretakerMirrorsForProperty(db, landlordId, pid, ''); }catch(_e){}
    if(!sid) return;
    const staff=await readStaffDoc(db, landlordId, sid);
    const next=(Array.isArray(staff?.assignedPropertyIds)?staff.assignedPropertyIds:[]).map(x=>String(x)).filter(x=>x!==pid);
    await window.nestiqFs.staff(db, landlordId).doc(sid).set({ assignedPropertyIds:next },{ merge:true });
    if(staff?.uid){
      await window.nestiqFs.staffAccount(db, staff.uid).set({ assignedPropertyIds:next },{ merge:true });
      try{
        await db.collection('users').doc(staff.uid).set({ assignedPropertyIds:next },{ merge:true });
      }catch(_e){}
    }
  }
  async function nestiqNotifyLandlordStaffAction(text, route){
    const db=window.nestiqDb;
    // Caretaker/contractor sessions must target their landlord — never auth.currentUser.uid
    let landlordId='';
    try{
      const s=window.__nestiqSession||JSON.parse(sessionStorage.getItem('nestiq-session')||'null');
      if(s&&(s.role==='caretaker'||s.role==='contractor')&&s.landlordId){
        landlordId=String(s.landlordId).trim();
      }
    }catch(_e){}
    if(!landlordId) landlordId=String(lid()||'').trim();
    if(!db||!landlordId||!window.nestiqFs?.settingsRef) return;
    const ref=window.nestiqFs.settingsRef(db, landlordId);
    if(!ref) return;
    const entry={
      id:Date.now(),
      icon:'🧑‍🔧',
      text:String(text||'Staff update'),
      time:'Just now',
      unread:true,
      onClickExtra:route?`showPage('${String(route).replace(/'/g,"\\'")}')`:''
    };
    await ref.set({
      bellNotifs:firebase.firestore.FieldValue.arrayUnion(entry)
    },{ merge:true });
  }
  async function nestiqOpenCaretakerManager(propertyId){
    const p=(window.propertiesData||[]).find(x=>String(x.id)===String(propertyId));
    if(!p) return;
    const list=await nestiqListLandlordStaff('caretaker');
    const active=list.filter(x=>String(x.accountStatus||'')==='active');
    const current=list.find(x=>String(x.id)===String(p.caretakerId||''));
    const options=['<option value="">— Select caretaker —</option>'].concat(
      active.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(p.caretakerId||'')?'selected':''}>${esc(x.name||'Caretaker')}${x.email?` (${esc(x.email)})`:''}</option>`)
    ).join('');
    const mc=document.getElementById('modalContent');
    if(!mc) return;
    mc.innerHTML=`
      <h2 class="modal-title">Caretaker</h2>
      <p class="modal-sub">${esc(p.name||'Property')}</p>
        <div class="form-group">
        <label>Current caretaker</label>
        <div class="form-input" style="display:flex;align-items:center;min-height:44px;background:var(--paper)">${current?esc(current.name||current.email||'Caretaker'):'Not assigned'}</div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label>Assign existing active caretaker</label>
        <select class="form-input" id="caretaker_assign_select">${options}</select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="btn-primary btn-sm" onclick="nestiqSubmitCaretakerAssignment('${esc(String(p.id))}')">Assign</button>
        ${current?`<button type="button" class="btn-outline btn-sm" onclick="nestiqSubmitCaretakerUnassign('${esc(String(p.id))}','${esc(String(current.id))}')">Unassign</button>`:''}
      </div>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-weight:700;margin-bottom:8px">Invite new caretaker</div>
        <div class="form-group"><label>Name</label><input class="form-input" id="caretaker_inv_name" placeholder="Full name"></div>
        <div class="form-group" style="margin-top:8px"><label>Email</label><input class="form-input" id="caretaker_inv_email" type="email" placeholder="name@example.com"></div>
        <div class="form-group" style="margin-top:8px"><label>Phone</label><input class="form-input" id="caretaker_inv_phone" placeholder="Phone number"></div>
        <button type="button" class="btn-gold btn-sm" style="margin-top:12px" id="caretaker_inv_send_btn" onclick="nestiqInviteCaretakerForProperty('${esc(String(p.id))}')">Invite caretaker</button>
      </div>`;
    nestiqOpenModalAnimated?.();
  }
  async function nestiqSubmitCaretakerAssignment(propertyId){
    const sid=document.getElementById('caretaker_assign_select')?.value||'';
    if(!sid){
      nestiqShowNotif?.('Select a caretaker first','warning');
      return;
    }
    await nestiqAssignCaretakerToProperty(propertyId, sid);
    saveData?.();
    nestiqShowNotif?.('Caretaker assigned','success');
    nestiqCloseModalAnimated?.();
    viewProperty?.(propertyId);
  }
  async function nestiqSubmitCaretakerUnassign(propertyId, staffId){
    await nestiqUnassignCaretakerFromProperty(propertyId, staffId);
    saveData?.();
    nestiqShowNotif?.('Caretaker unassigned','success');
    nestiqCloseModalAnimated?.();
    viewProperty?.(propertyId);
  }
  async function nestiqInviteCaretakerForProperty(propertyId){
    const p=(window.propertiesData||[]).find(x=>String(x.id)===String(propertyId));
    const name=(document.getElementById('caretaker_inv_name')?.value||'').trim();
    const email=(document.getElementById('caretaker_inv_email')?.value||'').trim().toLowerCase();
    const phone=(document.getElementById('caretaker_inv_phone')?.value||'').trim();
    if(!name||!email){
      nestiqShowNotif?.('Caretaker name and email are required','warning');
      return;
    }
    const btn=document.getElementById('caretaker_inv_send_btn')|| (typeof nestiqBtnFromEvent==='function'?nestiqBtnFromEvent():document.activeElement);
    if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn,true,'Sending…');
    try{
      const staffId=staffDocId('caretaker', `caretaker-${Date.now()}`);
      await upsertStaffRecord({
        landlordId:lid(),
        role:'caretaker',
        id:staffId,
        name,
        email,
        phone,
        accountStatus:'invited',
        assignedPropertyIds:[String(propertyId)]
      });
      await nestiqAssignCaretakerToProperty(propertyId, staffId);
      const inv=await nestiqCreateStaffInvitation({
        role:'caretaker',
        staffId,
        sourceId:staffId,
        name,
        email,
        phone,
        assignedPropertyIds:[String(propertyId)],
        staffType:'Caretaker',
        propertyName:p?.name||''
      });
      if(inv?.code){
        nestiqShowStaffInviteReadyModal(inv, { name, email, phone, propertyName:p?.name||'' });
      }else{
        viewProperty?.(propertyId);
      }
    }finally{
      if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn,false);
    }
  }

  window.nestiqStaffDocId=staffDocId;
  window.nestiqListLandlordStaff=nestiqListLandlordStaff;
  window.nestiqCreateStaffInvitation=nestiqCreateStaffInvitation;
  window.nestiqShowStaffInviteReadyModal=nestiqShowStaffInviteReadyModal;
  window.nestiqLookupStaffInvitationByCode=nestiqLookupStaffInvitationByCode;
  window.nestiqCompleteStaffInvitationAcceptance=nestiqCompleteStaffInvitationAcceptance;
  window.nestiqAssignCaretakerToProperty=nestiqAssignCaretakerToProperty;
  window.nestiqUnassignCaretakerFromProperty=nestiqUnassignCaretakerFromProperty;
  window.nestiqOpenCaretakerManager=nestiqOpenCaretakerManager;
  window.nestiqSubmitCaretakerAssignment=nestiqSubmitCaretakerAssignment;
  window.nestiqSubmitCaretakerUnassign=nestiqSubmitCaretakerUnassign;
  window.nestiqInviteCaretakerForProperty=nestiqInviteCaretakerForProperty;
  window.nestiqNotifyLandlordStaffAction=nestiqNotifyLandlordStaffAction;
})();
