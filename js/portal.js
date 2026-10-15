function initPortal(){
  // Tenant portal is now Firestore-driven.
  // The real-time listeners populate:
  // - window.currentTenantData
  // - window.tenantPayments
  // - window.tenantMaintenance
  // - window.tenantNotices
  // - window.tenantMessages
  // and the render functions populate the UI.
  window.renderTenantProfile?.();
  window.renderRentStatusCard?.();
  window.renderLeaseCard?.();
  window.renderPaymentHistoryCard?.();
  window.renderMaintenanceCard?.();
  window.renderDocumentsCard?.();
  window.renderNoticesCard?.();
  window.renderMessagesCard?.();
  window.renderPropertyInfoCard?.();
}

function switchPortalTab(tab,el){
  ['payments','lease','maintenance','documents'].forEach(t=>{
    const pane=document.getElementById('portal-tab-'+t);
    if(pane) pane.style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('.portal-nav-item').forEach(i=>i.classList.remove('active'));
  el.classList.add('active');
  if(tab==='lease') setTimeout(()=>{document.querySelectorAll('.lease-fill').forEach(el=>{el.style.width=el.dataset.width+'%'})},200);
  if(tab==='maintenance'){
    const wrap=document.getElementById('portalMaintUploadWrap');
    if(wrap){
      clearPendingMaintenancePhoto('portal');
      wrap.innerHTML=uploadAreaHtml({id:'portalMaintUploadArea',height:100,title:'Attach a photo of the issue (optional)',sub:'JPG, PNG or WebP - max 2MB',onClick:`pickMaintenancePhoto('portal')`});
    }
  }
}

async function submitPortalMaintRequest(){
  // Map legacy portal form ids into the tenant dashboard handler.
  const type=document.getElementById('pm_issue')?.value||'Other';
  const desc=document.getElementById('pm_desc')?.value?.trim()||'';
  const ensure=(id, val)=>{
    let el=document.getElementById(id);
    if(!el){
      el=document.createElement(id.includes('desc')?'textarea':'input');
      el.id=id;
      el.style.display='none';
      document.body.appendChild(el);
    }
    el.value=val;
  };
  ensure('portal_maint_type', type);
  ensure('portal_maint_desc', desc);
  await window.submitTenantMaintenance?.();
}

async function runPortalMaintAiAssess(){
  if(!isGeminiConfigured()){ aiConfigError(); return; }
  const desc=document.getElementById('pm_desc')?.value?.trim()||'';
  if(!desc){ nestiqShowNotif('Add a maintenance description first','warning'); return; }
  const loading=document.getElementById('pmAiLoading');
  const out=document.getElementById('pmAiResult');
  const aiBtn=nestiqBtnFromEvent?.()||document.querySelector('[onclick*="runPortalMaintAiAssess"]');
  nestiqSetBtnLoading?.(aiBtn,true,'Diagnosing...');
  if(loading) loading.style.display='inline';
  try{
    const data=await assessMaintenanceIssueAI(desc);
    const urg=String(data.urgency||'Medium');
    const select=document.getElementById('pm_urgency');
    if(select){
      const mapped=typeof nestiqMaintNormalizePriority==='function'?nestiqMaintNormalizePriority(urg):urg;
      select.value=['Emergency','High','Medium','Low'].includes(mapped)?mapped:'Medium';
    }
    if(out){
      out.innerHTML=`
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--paper)">
          <div style="font-size:0.82rem"><strong>Urgency:</strong> ${urg}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Cause:</strong> ${data.cause||'—'}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Cost:</strong> R${Number(data.costMin||0).toLocaleString()} - R${Number(data.costMax||0).toLocaleString()}</div>
          <div style="font-size:0.82rem;margin-top:4px"><strong>Action:</strong> ${data.action||'—'}</div>
        </div>
      `;
    }
  }catch(_err){
    nestiqShowNotif('AI unavailable, try again','error');
  }finally{
    if(loading) loading.style.display='none';
    nestiqSetBtnLoading?.(aiBtn,false);
  }
}

window.runPortalMaintAiAssess=runPortalMaintAiAssess;

