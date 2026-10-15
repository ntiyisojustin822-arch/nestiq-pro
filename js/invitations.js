/* Tenant invitations (Firestore) + post-add modal
 *
 * Manual test: docs/invite-redemption-test.md
 */

(function(){
  function nestiqInviteFirestoreErrorShouldPropagate(err){
    const code=String(err?.code||'');
    const msg=String(err?.message||'');
    return code==='permission-denied'
      || code==='unavailable'
      || code==='failed-precondition'
      || /permission|unavailable|network|index|offline/i.test(msg);
  }

  async function nestiqLookupInvitationByCode(code){
    const db=window.nestiqDb;
    if(!db||!code) return null;
    const normalized=String(code).toUpperCase().trim();
    let lookup=null;
    try{
      const lk=await window.nestiqFs.invitationLookup(db, normalized).get();
      if(lk.exists) lookup=lk.data();
    }catch(err){
      console.warn('NestIQ: invitationLookup read failed', normalized, err);
      if(nestiqInviteFirestoreErrorShouldPropagate(err)) throw err;
      return null;
    }
    if(!lookup||!lookup.landlordId) return null;
    const lid=String(lookup.landlordId);
    let invDoc=null;
    try{
      invDoc=await window.nestiqFs.invitations(db, lid).doc(normalized).get();
    }catch(err){
      console.warn('NestIQ: invitations doc read failed', normalized, lid, err);
      if(nestiqInviteFirestoreErrorShouldPropagate(err)) throw err;
      invDoc=null;
    }
    if(!invDoc||!invDoc.exists){
      try{
        invDoc=await window.nestiqFs.invitations(db, lid).doc(String(lookup.tenantId||'')).get();
      }catch(err){
        console.warn('NestIQ: invitations fallback read failed', lookup.tenantId, lid, err);
        if(nestiqInviteFirestoreErrorShouldPropagate(err)) throw err;
        return null;
      }
    }
    if(!invDoc||!invDoc.exists) return null;
    const d=invDoc.data();
    if(String(d.status||lookup.status||'')!=='pending') return null;
    const now=Date.now();
    let ex=0;
    try{
      const exp=d.expiresAt||lookup.expiresAt;
      ex=exp&&exp.toMillis?exp.toMillis():new Date(exp||0).getTime();
    }catch(err){
      console.warn('NestIQ: invitation expiry parse failed', err);
      ex=0;
    }
    if(ex&&ex<now) return null;
    return{...d,id:Number(d.id!=null?d.id:invDoc.id),_fireId:invDoc.id,code:normalized,landlordId:lid};
  }

  async function nestiqCompleteInvitationAcceptance(inv,uid,email){
    const db=window.nestiqDb;
    if(!db){
      console.warn('NestIQ: complete invitation — no Firestore db');
      throw new Error('Cloud is not ready. Refresh and try again.');
    }
    const code=String(inv.code||inv._fireId||'').toUpperCase().trim();
    const lid=String(inv.landlordId||'');
    const fid=code||String(inv.id);
    const tenantDocId=String(inv.tenantId!=null?inv.tenantId:'');
    if(!lid||!tenantDocId){
      console.warn('NestIQ: complete invitation — missing landlordId or tenantId', { lid, tenantDocId, code });
      throw new Error('Invitation data is incomplete. Ask your landlord for a new code.');
    }
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
    }catch(err){
      console.warn('NestIQ: invitationLookup accept update failed', code, err);
    }
    try{
      if(typeof window.nestiqMarkApplicationsApprovedForTenant==='function'){
        await window.nestiqMarkApplicationsApprovedForTenant({
          id:tenantDocId,
          tenantId:tenantDocId,
          email:String(email||inv.tenantEmail||'').toLowerCase(),
          propertyId:inv.propertyId,
          property:inv.propertyName,
          landlordId:lid||inv.landlordId,
          applicationId:inv.applicationId||null,
          hasPortalAccess:true
        },{ email, landlordId:lid||inv.landlordId });
      }
    }catch(err){
      console.warn('NestIQ: mark application approved on invite accept', err);
    }
  }

  function nestiqTenantPortalEmailKey(email){
    return String(email||'').trim().toLowerCase();
  }

  async function nestiqEnsureTenantEmailPortalLink(tenant, opts){
    opts=opts||{};
    const db=window.nestiqDb;
    const email=nestiqTenantPortalEmailKey(opts.tenantEmail||tenant?.email||tenant?.portalEmail||'');
    const lid=String(opts.landlordId||tenant?.landlordId||(typeof window.nestiqCurrentLandlordUid==='function'?window.nestiqCurrentLandlordUid():'')||'').trim();
    const tenantId=String(tenant?.id||opts.tenantId||'').trim();
    if(!db||!email||!lid||!tenantId) return null;
    const ref=window.nestiqFs?.tenantPortalLink?.(db, email);
    if(!ref) return null;
    const payload={
      email,
      landlordId:lid,
      tenantId,
      propertyId:tenant?.propertyId!=null?String(tenant.propertyId):'',
      tenantName:String(tenant?.name||opts.tenantName||''),
      status:'pending',
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload,{ merge:true });
    return payload;
  }
  window.nestiqEnsureTenantEmailPortalLink=nestiqEnsureTenantEmailPortalLink;

  async function nestiqClaimTenantEmailPortalLink(uid, email){
    const db=window.nestiqDb;
    const em=nestiqTenantPortalEmailKey(email);
    if(!db||!uid||!em) return null;
    const ref=window.nestiqFs?.tenantPortalLink?.(db, em);
    if(!ref) return null;
    let snap=null;
    try{ snap=await ref.get(); }catch(err){
      console.warn('NestIQ: tenant portal email link', err);
      return null;
    }
    if(!snap||!snap.exists) return null;
    const d=snap.data()||{};
    const lid=String(d.landlordId||'').trim();
    const tenantId=String(d.tenantId||'').trim();
    if(!lid||!tenantId) return null;
    const claimedBy=String(d.claimedByUid||'').trim();
    if(claimedBy && claimedBy!==String(uid)) return null;
    const propertyId=d.propertyId!=null?String(d.propertyId):'';
    await window.nestiqFs.tenantAccount(db, uid).set({
      landlordId:lid,
      tenantId,
      propertyId,
      status:'active',
      selfRegistered:false,
      email:em
    },{ merge:true });
    try{
      await window.nestiqFs.tenants(db, lid).doc(tenantId).set({
        portalUid:uid,
        tenantUid:uid,
        portalEmail:em,
        email:em,
        hasPortalAccess:true,
        landlordId:lid
      },{ merge:true });
    }catch(err){
      console.warn('NestIQ: tenant portal email claim tenant doc', err);
    }
    try{
      await db.collection('users').doc(uid).set({
        role:'tenant',
        landlordId:lid,
        tenantDocId:tenantId,
        tenantId,
        status:'active',
        selfRegistered:false
      },{ merge:true });
    }catch(_e){}
    try{
      await db.collection('pendingClaims').doc(uid).set({
        role:'tenant',
        landlordId:lid,
        tenantDocId:tenantId,
        tenantId,
        status:'active'
      },{ merge:true });
    }catch(_e){}
    try{
      await ref.set({
        status:'claimed',
        claimedByUid:uid,
        claimedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{ merge:true });
    }catch(_e){}
    window.nestiqTenantSession={
      landlordId:lid,
      tenantId,
      propertyId,
      status:'active'
    };
    return { landlordId:lid, tenantId, propertyId, status:'active' };
  }
  window.nestiqClaimTenantEmailPortalLink=nestiqClaimTenantEmailPortalLink;

  function nestiqInvitationEmailJsCredentials(){
    const ej=(typeof landlordSettings!=='undefined'&&landlordSettings&&landlordSettings.emailjs)||{};
    const publicKey=String(ej.publicKey||'').trim();
    const serviceId=String(ej.serviceId||'').trim();
    const templates=(ej.templates&&typeof ej.templates==='object')?ej.templates:{};
    const templateId=String(
      templates.nestiq_tenant_invitation
      || templates.tenantInvitation
      || templates.welcomeTenant
      || templates.customMessage
      || ''
    ).trim();
    return{publicKey,serviceId,templateId,templates};
  }

  function nestiqInvitationPublicBaseUrl(){
    const configured=String(window.NESTIQ_APP_BASE_URL||'').trim();
    const origin=String(location.origin||'');
    if(configured && /localhost|127\.0\.0\.1/i.test(origin)){
      return configured.endsWith('/')?configured:configured+'/';
    }
    try{
      if(typeof nestiqAppBaseUrlSafe==='function') return String(nestiqAppBaseUrlSafe()).replace(/\/*$/,'/');
      if(typeof nestiqAppBaseUrl==='function') return String(nestiqAppBaseUrl()).replace(/\/*$/,'/');
    }catch(_e){}
    return String(origin+'/').replace(/\/*$/,'/');
  }

  function nestiqFormatInviteExpiresDate(expires){
    if(!expires) return '';
    try{
      if(typeof expires.toDate==='function') expires=expires.toDate();
      else if(typeof expires.toMillis==='function') expires=new Date(expires.toMillis());
      const dt=expires instanceof Date?expires:new Date(expires);
      if(Number.isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    }catch(_e){ return ''; }
  }

  function nestiqInvitationShareText(opts, code, expires){
    const landlordNm=String(opts.landlordName||window.landlordName||landlordSettings?.name||'Your landlord');
    const property=String(opts.propertyName||'your rental');
    const portalUrl=nestiqInvitationPublicBaseUrl();
    const hasCode=!!String(code||'').trim();
    const inviteLink=hasCode?`${portalUrl}?invite=${encodeURIComponent(String(code||''))}`:portalUrl;
    const body=hasCode
      ? `Hi ${opts.tenantName||'there'},\n\n${landlordNm} has invited you to the NestIQ tenant portal for ${property}.\n\nInvitation code: ${code}\nOpen this link: ${inviteLink}\nExpires: ${nestiqFormatInviteExpiresDate(expires)}\n\nUse the same email this message was sent to when you create your account.`
      : `Hi ${opts.tenantName||'there'},\n\n${landlordNm} approved your application for ${property}.\n\nSign in with this email at ${portalUrl}\nOpen My Lease and type your full name to accept.\nNo invitation code is needed.`;
    return {
      portalUrl,
      inviteLink,
      landlordNm,
      subject:hasCode?'Your NestIQ tenant portal invitation':'Your NestIQ tenant portal',
      body
    };
  }

  function nestiqInvitationMailtoHref(opts, code, expires){
    const share=nestiqInvitationShareText(opts, code, expires);
    const to=encodeURIComponent(String(opts.tenantEmail||'').trim());
    return `mailto:${to}?subject=${encodeURIComponent(share.subject)}&body=${encodeURIComponent(share.body)}`;
  }

  async function nestiqSendInvitationEmailJs(opts, code, expires){
    const toEmail=String(opts.tenantEmail||'').trim();
    if(!toEmail) throw new Error('No tenant email on file');

    const share=nestiqInvitationShareText(opts, code, expires);
    const landlordEmail=String(opts.landlordEmail||landlordSettings?.email||window.landlordEmail||'').trim();
    const params={
      name:share.landlordNm,
      to_name:String(opts.tenantName||'Tenant'),
      to_email:toEmail,
      email:toEmail,
      user_email:toEmail,
      recipient:toEmail,
      to:toEmail,
      invitation_code:String(code||''),
      property_name:String(opts.propertyName||'your rental'),
      landlord_name:share.landlordNm,
      landlord_email:landlordEmail,
      expires_date:nestiqFormatInviteExpiresDate(expires),
      portal_url:share.inviteLink,
      invite_url:share.inviteLink,
      subject:'Your NestIQ tenant invitation',
      message:share.body
    };

    let lastErr=null;
    if(typeof window.nestiqSendEmail==='function'){
      try{
        const ok=await window.nestiqSendEmail('tenantInvitation', params, {
          skipDuplicateCheck:true,
          tenantId:opts.tenantId!=null?opts.tenantId:null,
          propertyId:opts.propertyId!=null?opts.propertyId:null
        });
        if(ok){
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
            }catch(err){
              console.warn('NestIQ: pushEmailLog after invitation email sent', err);
            }
          }
          return true;
        }
      }catch(err){
        lastErr=err;
      }
    }

    const{publicKey,serviceId,templateId}=nestiqInvitationEmailJsCredentials();
    if(!publicKey||!serviceId||!templateId){
      throw lastErr||new Error('EmailJS not configured — add Public Key, Service ID, and a Welcome Tenant template in Settings → Email');
    }
    if(typeof window.nestiqEmailJsSend==='function'){
      await window.nestiqEmailJsSend(serviceId, templateId, params);
    }else{
      if(typeof window.emailjs==='undefined'||!window.emailjs){
        throw new Error('EmailJS library not loaded');
      }
      try{
        if(typeof initEmailJS==='function') initEmailJS();
        else window.emailjs.init({ publicKey });
      }catch(err){
        console.warn('NestIQ: EmailJS init before invitation send', err);
      }
      await window.emailjs.send(serviceId, templateId, params, { publicKey });
    }
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
      }catch(err){
        console.warn('NestIQ: pushEmailLog after invitation email sent', err);
      }
    }
    return true;
  }

  async function nestiqCreateInvitationRecord(opts){
    const db=window.nestiqDb;
    const lid=window.nestiqCurrentLandlordUid?.();
    if(!db||!lid){
      console.warn('NestIQ: create invitation skipped — missing db or landlord uid', { hasDb:!!db, lid });
      nestiqShowNotif?.('Could not create invitation (not signed in as landlord / cloud offline).','error');
      return null;
    }
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
      applicationId:opts.applicationId||null,
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
      nestiqShowNotif?.('Invite code '+code+' created, but email is not configured in Settings → Email. Share the code with '+tenantEmail+' or tap Email tenant.','warning');
      return {...row,nestiqInvitationEmailStatus:'skipped_no_config',nestiqProminentCode:true};
    }

    try{
      await nestiqSendInvitationEmailJs(opts, code, expires);
      nestiqShowNotif?.('Invitation emailed to '+tenantEmail+' · code '+code+' — if they do not see it, check spam or use WhatsApp on the invite popup (EmailJS Gmail often delivers only to your inbox unless To Email is {{to_email}}).','success');
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
        }catch(logErr){
          console.warn('NestIQ: pushEmailLog after invitation email failure', logErr);
        }
      }
      nestiqShowNotif?.('Invitation saved but email to '+tenantEmail+' failed — share this code manually: '+code,'warning');
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
        <td><code class="invite-code invite-code-display">${codeEsc||'—'}</code></td>
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
    }catch(err){
      console.warn('NestIQ: invitationLookup status update failed', code, status, err);
    }
    nestiqRenderInvitationsTable();
  }

  function nestiqRevokeInvitation(fid){ nestiqUpdateInvitationStatus(fid,'revoked'); }
  function nestiqExpireInvitation(fid){ nestiqUpdateInvitationStatus(fid,'expired'); }

  function nestiqTenantPortalUnlocked(t){
    return !!(t && t.portalUid && t.hasPortalAccess);
  }

  function nestiqTenantNeedsPortalInvite(t){
    return false;
  }

  async function nestiqInviteTenantToPortal(tenantId){
    const list=Array.isArray(window.tenantsData)?window.tenantsData:(typeof tenantsData!=='undefined'?tenantsData:[]);
    const tenant=list.find(x=>String(x.id)===String(tenantId||''))||null;
    if(!tenant){
      nestiqShowNotif?.('Tenant not found.','error');
      return null;
    }
    return nestiqAfterTenantAddedFlow(tenant,{ sendEmail:true, showModal:true });
  }

  async function nestiqBulkInviteTenantsWithoutPortal(){
    nestiqShowNotif?.('Tenants join by applying from Browse listings. After you approve, they sign in with the same account.','info');
  }

  function nestiqCopyInvitationCode(code){
    const c=String(code||'').trim();
    if(!c) return;
    try{
      navigator.clipboard?.writeText?.(c);
      nestiqShowNotif?.('Copied '+c,'success');
    }catch(_e){
      nestiqShowNotif?.(c,'info');
    }
  }

  async function nestiqAfterTenantAddedFlow(tenant, opts){
    opts=opts||{};
    if(!tenant) return null;
    const email=nestiqTenantPortalEmailKey(opts.tenantEmail||tenant.email||tenant.portalEmail||'');
    try{
      await nestiqEnsureTenantEmailPortalLink(tenant,{ tenantEmail:email });
    }catch(err){
      console.warn('NestIQ: tenant email portal link', err);
    }
    const portalUrl=nestiqInvitationPublicBaseUrl();
    const landlordNm=String(window.landlordSettings?.name||window.landlordName||'Your landlord');
    const property=String(opts.propertyName||tenant.property||'your rental');
    if(opts.sendEmail!==false && email){
      try{
        const share={
          tenantName:tenant.name||'',
          tenantEmail:email,
          propertyName:property,
          landlordName:landlordNm
        };
        await nestiqSendInvitationEmailJs({
          ...share,
          tenantEmail:email,
          fromApprove:!!opts.fromApprove
        }, '', null);
        tenant.nestiqInvitationEmailStatus='sent';
      }catch(err){
        console.warn('NestIQ: portal email', err);
      }
    }
    if(opts.showModal!==false){
      nestiqShowTenantPortalReadyModal(tenant, email, portalUrl, { fromApprove:!!opts.fromApprove });
    }else if(email){
      nestiqShowNotif?.(`${tenant.name||'Tenant'} signs in with ${email} to review the lease.`,'success');
    }
    return { email, code:null };
  }

  function nestiqShowTenantPortalReadyModal(tenant, email, portalUrl, extra){
    extra=extra&&typeof extra==='object'?extra:{};
    const mc=document.getElementById('modalContent');
    const ov=document.getElementById('modalOverlay');
    if(!mc||!ov) return;
    const name=String(tenant?.name||'Tenant').replace(/</g,'&lt;');
    const em=String(email||'').replace(/</g,'&lt;');
    const url=String(portalUrl||nestiqInvitationPublicBaseUrl()).replace(/"/g,'&quot;');
    const waBody=encodeURIComponent(`Hi ${tenant?.name||''},\n\nYour NestIQ application was approved. Sign in with ${email||'your email'} at ${portalUrl||''} and open My Lease to sign.\nNo invitation code.`);
    mc.innerHTML=`
      <div class="nestiq-apply-modal-hero" aria-hidden="true">✓</div>
      <h2 class="modal-title">Lease ready to sign</h2>
      <p class="modal-sub">${name}${em?' · '+em:''}</p>
      <p style="font-size:0.88rem;color:var(--muted);line-height:1.55;margin:0 0 14px">${em
        ? 'They already have a NestIQ account from applying. They sign in with this email, open <strong>My Lease</strong>, and type their full name. No invitation code.'
        : 'They sign in with the same NestIQ account they used to apply, then open My Lease.'}</p>
      ${em?`<div style="background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:4px">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:650">Sign-in email</div>
        <div style="font-weight:700;margin-top:6px;font-size:1.02rem">${em}</div>
      </div>`:''}
      <div class="nestiq-apply-modal-actions">
        ${em?`<a class="btn-outline btn-sm" href="https://wa.me/?text=${waBody}" target="_blank" rel="noopener">WhatsApp</a>`:''}
        <a class="btn-outline btn-sm" href="${url}" target="_blank" rel="noopener">Open portal</a>
        <button type="button" class="btn-gold btn-sm" onclick="nestiqCloseModalAnimated()">Done</button>
      </div>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else ov.classList.add('open');
  }

  function nestiqShowInvitationCreatedModal(inv, tenant){
    const code=String(inv?.code||'');
    if(!code) return;
    const mc=document.getElementById('modalContent');
    const ov=document.getElementById('modalOverlay');
    if(!mc||!ov) return;
    const email=String(tenant?.email||inv.tenantEmail||'').replace(/</g,'&lt;');
    const name=String(tenant?.name||inv.tenantName||'Tenant').replace(/</g,'&lt;');
    const emailed=inv.nestiqInvitationEmailStatus==='sent';
    const share=nestiqInvitationShareText({
      tenantName:tenant?.name||inv.tenantName,
      tenantEmail:tenant?.email||inv.tenantEmail,
      propertyName:tenant?.property||inv.propertyName,
      landlordName:inv.landlordName
    }, code, inv.expiresAt);
    const mailto=nestiqInvitationMailtoHref({
      tenantName:tenant?.name||inv.tenantName,
      tenantEmail:tenant?.email||inv.tenantEmail,
      propertyName:tenant?.property||inv.propertyName,
      landlordName:inv.landlordName
    }, code, inv.expiresAt);
    const wa='https://wa.me/?text='+encodeURIComponent(share.body);
    const statusHtml=emailed
      ? `<p style="font-size:0.88rem;color:var(--sage);margin-bottom:12px">EmailJS accepted a send to <strong>${email||'the tenant'}</strong>. If they do not receive it, check their spam folder — or send it yourself below. Gmail via EmailJS often only delivers to <em>your</em> inbox unless the template To Email is <code>{{to_email}}</code>.</p>`
      : `<p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">${email
          ? 'The invite email could not be sent automatically. Share this code, or email / WhatsApp it from your device.'
          : 'This tenant has no email on file. Share this code another way.'}</p>`;
    mc.innerHTML=`
      <h2 class="modal-title">Portal invitation ready</h2>
      <p class="modal-sub">${name}${email?' · '+email:''}</p>
      ${statusHtml}
      <div style="background:var(--paper);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-size:0.75rem;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase">Invitation code</div>
        <div id="nestiqInviteCodeDisplay" style="font-family:ui-monospace,monospace;font-size:1.55rem;font-weight:700;margin-top:6px;letter-spacing:0.08em">${code.replace(/</g,'&lt;')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn-gold btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(code)}).then(()=>nestiqShowNotif('Code copied','success')).catch(()=>nestiqShowNotif('Copy failed','error'))">Copy code</button>
        ${email?`<a class="btn-outline btn-sm" href="${mailto.replace(/"/g,'&quot;')}">Email tenant</a>`:''}
        <a class="btn-outline btn-sm" href="${wa.replace(/"/g,'&quot;')}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Done</button>
      </div>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else ov.classList.add('open');
  }

  window.nestiqInvitationEmailJsCredentials=nestiqInvitationEmailJsCredentials;
  window.nestiqInvitationPublicBaseUrl=nestiqInvitationPublicBaseUrl;
  window.nestiqFormatInviteExpiresDate=nestiqFormatInviteExpiresDate;
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
