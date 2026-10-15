/* Shared staff invitation wrappers for contractors. */
(function(){
  async function nestiqCreateContractorInvitation(vendor){
    return window.nestiqCreateStaffInvitation?.({
      role:'contractor',
      sourceId:String(vendor?.id||''),
      vendorId:String(vendor?.id||''),
      name:vendor?.name||'',
      email:vendor?.email||'',
      phone:vendor?.phone||'',
      vendorType:vendor?.type||'',
      staffType:vendor?.type||'',
      landlordName:window.landlordSettings?.name||window.landlordName||''
    }) || null;
  }

  async function nestiqLookupContractorInvitationByCode(code){
    const inv=await window.nestiqLookupStaffInvitationByCode?.(code);
    return inv&&inv.role==='contractor' ? inv : null;
  }

  async function nestiqCompleteContractorInvitationAcceptance(inv, uid, email){
    return window.nestiqCompleteStaffInvitationAcceptance?.(inv, uid, email);
  }

  async function nestiqInviteContractorToPortal(vendorId){
    const btn=typeof nestiqBtnFromEvent==='function'?nestiqBtnFromEvent():document.activeElement;
    if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn,true,'Sending…');
    try{
      const v=(vendors||[]).find(x=>Number(x.id)===Number(vendorId));
      if(!v){
        nestiqShowNotif?.('Vendor not found','error');
        return null;
      }
      if(v.accountStatus==='active'){
        nestiqShowNotif?.('This contractor already has portal access.','info');
        return null;
      }
      const inv=await nestiqCreateContractorInvitation(v);
      if(inv?.code){
        try{ await navigator.clipboard?.writeText?.(inv.code); }catch(_e){}
        nestiqShowContractorInviteModal(inv, v);
      }
      return inv;
    }finally{
      if(typeof nestiqSetBtnLoading==='function') nestiqSetBtnLoading(btn,false);
    }
  }

  function nestiqShowContractorInviteModal(inv, vendor){
    if(typeof window.nestiqShowStaffInviteReadyModal==='function'){
      window.nestiqShowStaffInviteReadyModal(inv, {
        name:vendor?.name||inv?.staffName,
        email:vendor?.email||inv?.staffEmail,
        phone:vendor?.whatsapp||vendor?.phone||inv?.staffPhone
      });
      return;
    }
    const code=String(inv?.code||'');
    if(!code) return;
    const mc=document.getElementById('modalContent');
    if(!mc) return;
    const name=String(vendor?.name||inv?.staffName||'Contractor').replace(/</g,'&lt;');
    mc.innerHTML=`
      <h2 class="modal-title">Contractor portal invitation</h2>
      <p class="modal-sub">${name}</p>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:12px">Share this code so they can create their contractor portal account.</p>
      <div style="background:var(--paper);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-size:0.75rem;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase">Invitation code</div>
        <div style="font-family:ui-monospace,monospace;font-size:1.55rem;font-weight:700;margin-top:6px;letter-spacing:0.08em">${code.replace(/</g,'&lt;')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn-gold btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(code)}).then(()=>nestiqShowNotif('Code copied','success')).catch(()=>nestiqShowNotif('Copy failed','error'))">Copy code</button>
        <button type="button" class="btn-outline btn-sm" onclick="nestiqCloseModalAnimated()">Done</button>
      </div>`;
    if(typeof nestiqOpenModalAnimated==='function') nestiqOpenModalAnimated();
    else document.getElementById('modalOverlay')?.classList.add('open');
  }

  window.nestiqCreateContractorInvitation=nestiqCreateContractorInvitation;
  window.nestiqLookupContractorInvitationByCode=nestiqLookupContractorInvitationByCode;
  window.nestiqCompleteContractorInvitationAcceptance=nestiqCompleteContractorInvitationAcceptance;
  window.nestiqInviteContractorToPortal=nestiqInviteContractorToPortal;
  window.nestiqShowContractorInviteModal=nestiqShowContractorInviteModal;
})();
