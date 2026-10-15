/* NestIQ billing, plans, PayFast checkout, and plan enforcement */
(function(){
  'use strict';

  // Sandbox merchant (PayFast test). Replace with live merchant ID/key for production charging.
  const PAYFAST_MERCHANT_ID = '10053105';
  const PAYFAST_MERCHANT_KEY = 'f8e8oy0eob5s2';
  const PAYFAST_PASSPHRASE = '';
  const PAYFAST_IS_SANDBOX = true;
  const PAYFAST_PROCESS_URL = PAYFAST_IS_SANDBOX
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  const STRIPE_PUBLISHABLE_KEY = '';
  const STRIPE_ENABLED = Boolean(STRIPE_PUBLISHABLE_KEY);

  const NESTIQ_PLANS = {
    starter: {
      name: 'Starter',
      price_monthly: 0,
      price_annual: 0,
      currency: 'ZAR',
      limits: { properties: 2, tenants: 5, ai_requests: 0, team_members: 1 },
      features: [
        'Up to 2 properties',
        'Up to 5 tenants',
        'Basic rent tracking',
        'Tenant portal',
        'Browse & receive applications',
        'Community support'
      ],
      payfastPlanId: null,
      stripePriceId: null
    },
    pro: {
      name: 'Pro',
      price_monthly: 299,
      price_annual: 2870,
      currency: 'ZAR',
      limits: { properties: -1, tenants: -1, ai_requests: 100, team_members: 3 },
      features: [
        'Unlimited properties',
        'Unlimited tenants',
        'AI-powered tools (100 requests/month)',
        'Financial reports & exports',
        'EmailJS notifications',
        'WhatsApp reminders',
        'Priority support'
      ],
      payfastPlanId: 'PAYFAST_PRO_PLAN_ID',
      stripePriceId: 'STRIPE_PRO_PRICE_ID'
    },
    enterprise: {
      name: 'Enterprise',
      price_monthly: 799,
      price_annual: 7670,
      currency: 'ZAR',
      limits: { properties: -1, tenants: -1, ai_requests: -1, team_members: -1 },
      features: [
        'Everything in Pro',
        'Unlimited AI requests',
        'Unlimited team members',
        'Custom branding',
        'Dedicated account manager',
        'API access',
        'Custom integrations',
        'SLA support'
      ],
      payfastPlanId: 'PAYFAST_ENTERPRISE_PLAN_ID',
      stripePriceId: 'STRIPE_ENTERPRISE_PRICE_ID'
    }
  };

  const PLAN_ORDER = { starter: 0, pro: 1, enterprise: 2 };

  function nestiqFormatZar(amount){
    const n = Number(amount);
    if(!Number.isFinite(n)) return 'R0.00';
    return 'R' + n.toFixed(2);
  }

  function nestiqAppBase(){
    return nestiqPayfastReturnBase();
  }

  /**
   * PayFast return/cancel MUST hit the public Firebase Hosting site.
   * Localhost / preview / API hosts often answer with Express "Cannot GET /index.html".
   */
  function nestiqPayfastReturnBase(){
    const configured = typeof window.NESTIQ_APP_BASE_URL === 'string' ? window.NESTIQ_APP_BASE_URL.trim() : '';
    if(configured){
      return configured.endsWith('/') ? configured : configured + '/';
    }
    try{
      const host = String(location.hostname || '');
      // Never send PayFast back to local/dev hosts — they usually aren't the live app.
      if(host && host !== 'localhost' && host !== '127.0.0.1' && location.protocol === 'https:'){
        return String(location.origin).replace(/\/?$/, '/') ;
      }
    }catch(_e){}
    return 'https://nestiq-pro.web.app/';
  }

  /** Return path PayFast opens after payment (site root — Firebase Hosting always serves the SPA). */
  function nestiqPayfastReturnPath(status){
    const flag = status === 'cancelled' ? 'cancelled' : 'success';
    return `?payment=${flag}`;
  }

  function nestiqMarkPendingPaymentReturn(planKey, billingCycle, mPaymentId, amount){
    try{
      localStorage.setItem('nestiq-pending-payment', JSON.stringify({
        at: Date.now(),
        plan: planKey || 'pro',
        cycle: billingCycle || 'monthly',
        mPaymentId: mPaymentId || null,
        amount: amount != null ? Number(amount) : null
      }));
    }catch(_e){}
  }

  /** Read pending checkout without clearing — only clear after activation succeeds. */
  function nestiqPeekPendingPaymentReturn(){
    try{
      const raw = localStorage.getItem('nestiq-pending-payment');
      return raw ? JSON.parse(raw) : null;
    }catch(_e){
      return null;
    }
  }

  function nestiqClearPendingPaymentReturn(){
    try{ localStorage.removeItem('nestiq-pending-payment'); }catch(_e){}
  }

  function nestiqConsumePendingPaymentReturn(){
    const pending = nestiqPeekPendingPaymentReturn();
    nestiqClearPendingPaymentReturn();
    return pending;
  }

  function nestiqPendingPaymentIsFresh(pending, maxMs){
    if(!pending) return false;
    const max = Number.isFinite(maxMs) ? maxMs : 48 * 60 * 60 * 1000;
    return (Date.now() - Number(pending.at || 0)) < max;
  }

  function nestiqIsRentPaymentReturnUrl(){
    try{
      const p = new URLSearchParams(location.search);
      if(String(p.get('kind')||'') === 'rent') return true;
      return String(p.get('ref')||'').indexOf('RENT-') === 0;
    }catch(_e){
      return false;
    }
  }

  function nestiqIsPaymentReturnUrl(){
    try{
      const p = new URLSearchParams(location.search).get('payment');
      return p === 'success' || p === 'cancelled';
    }catch(_e){
      return false;
    }
  }

  function nestiqShowPaymentReturnGate(kind){
    const outlet = document.getElementById('appOutlet');
    if(!outlet) return;
    const ok = kind === 'success';
    const rent = nestiqIsRentPaymentReturnUrl();
    const title = rent
      ? (ok ? 'Rent payment submitted' : 'Rent payment cancelled')
      : (ok ? 'Payment successful' : 'Payment cancelled');
    const body = rent
      ? (ok
        ? 'Signing you back into your tenant portal. Your rent status will update once PayFast confirms the payment.'
        : 'No rent was taken. Sign in to return to your portal — your rent status is unchanged.')
      : (ok
        ? 'Signing you back into NestIQ and activating your plan. This usually takes a few seconds…'
        : 'No charge was completed. Sign in to return to your dashboard — your plan is unchanged.');
    outlet.innerHTML = `
      <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:var(--paper,#F5F0E8)">
        <div style="max-width:440px;width:100%;text-align:center;background:#fff;border:1px solid rgba(14,17,23,.1);border-radius:16px;padding:32px 24px;box-shadow:0 8px 32px rgba(14,17,23,.06)">
          <div style="font-size:2.4rem;margin-bottom:12px">${ok ? '🎉' : '↩️'}</div>
          <h1 style="font-family:'Playfair Display',serif;font-size:1.45rem;margin:0 0 10px">${title}</h1>
          <p style="color:rgba(14,17,23,.6);line-height:1.55;margin:0 0 20px;font-size:.92rem">${body}</p>
          <div id="nestiqPayReturnStatus" style="font-size:.84rem;color:rgba(14,17,23,.55);margin-bottom:16px">${ok ? 'Restoring your session…' : ''}</div>
          <button type="button" class="btn-gold" style="width:100%;justify-content:center" onclick="nestiqShowSignInLandlord?.()">Sign in to continue</button>
          ${rent ? '' : `<p style="margin-top:14px;font-size:.8rem;color:rgba(14,17,23,.45)">
            <a href="billing.html" style="color:#C46A3A;font-weight:600">Open Billing &amp; Plan</a>
          </p>`}
        </div>
      </section>`;
    try{ window.nestiqHideBootOverlay?.(); }catch(_e){}
  }

  function nestiqGetBilling(){
    const ls = window.landlordSettings || {};
    if(ls.billing && typeof ls.billing === 'object') return ls.billing;
    return { plan: 'starter', status: 'active', billingCycle: null };
  }

  function nestiqGetCurrentPlanKey(){
    const b = nestiqGetBilling();
    const key = String(b.plan || 'starter').toLowerCase();
    return NESTIQ_PLANS[key] ? key : 'starter';
  }

  function nestiqEffectivePlanKey(){
    const b = nestiqGetBilling();
    const key = nestiqGetCurrentPlanKey();
    if(b.status === 'trial' && key === 'pro') return 'pro';
    if(b.status === 'active' || b.status === 'trial') return key;
    return 'starter';
  }

  function nestiqGetUsageCount(limitKey){
    if(limitKey === 'properties') return (window.propertiesData || []).length;
    if(limitKey === 'tenants') return (window.tenantsData || []).length;
    if(limitKey === 'ai_requests'){
      const b = nestiqGetBilling();
      return Number(b.aiRequestsThisMonth || 0);
    }
    if(limitKey === 'team_members') return 1;
    return 0;
  }

  function nestiqIsUnlimited(limit){ return Number(limit) === -1; }

  function nestiqCheckPlanLimit(limitKey, currentCount){
    const planKey = nestiqEffectivePlanKey();
    const limit = NESTIQ_PLANS[planKey].limits[limitKey];
    if(nestiqIsUnlimited(limit)) return true;
    const count = currentCount != null ? Number(currentCount) : nestiqGetUsageCount(limitKey);
    if(!Number.isFinite(limit) || limit <= 0) return limitKey !== 'ai_requests';
    return count < limit;
  }

  async function nestiqRefreshLandlordSettingsFromFirestore(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid || !window.nestiqFs) return;
    try{
      const snap = await window.nestiqFs.settingsRef(db, lid).get();
      if(snap.exists && typeof window.mergeSettingsPayload === 'function'){
        window.mergeSettingsPayload(snap.data());
      }else if(snap.exists){
        const d = snap.data();
        if(d.billing) window.landlordSettings.billing = { ...(window.landlordSettings.billing || {}), ...d.billing };
      }
    }catch(e){ console.warn('NestIQ billing settings refresh', e); }
  }

  async function nestiqIncrementAiUsage(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid) return;
    const b = nestiqGetBilling();
    const n = Number(b.aiRequestsThisMonth || 0) + 1;
    const month = new Date().toISOString().slice(0, 7);
    const patch = {
      billing: {
        ...b,
        aiRequestsThisMonth: n,
        aiUsageMonth: month
      }
    };
    window.landlordSettings.billing = { ...b, aiRequestsThisMonth: n, aiUsageMonth: month };
    try{
      await window.nestiqFs.settingsRef(db, lid).set(patch, { merge: true });
    }catch(e){ console.warn('NestIQ AI usage persist', e); }
  }

  function nestiqGuardAiRequest(){
    if(!nestiqCheckPlanLimit('ai_requests')){
      nestiqShowUpgradePrompt('ai');
      return false;
    }
    return true;
  }

  function nestiqShowUpgradePrompt(reason){
    const messages = {
      properties: 'Starter plan supports up to 2 properties. Upgrade to Pro for unlimited properties.',
      tenants: 'Starter plan supports up to 5 tenants. Upgrade to Pro for unlimited tenants.',
      ai: 'AI tools are available on the Pro plan and above.'
    };
    const msg = messages[reason] || 'Upgrade your plan to unlock this feature.';
    const html = `
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:2.5rem;margin-bottom:12px">🔒</div>
        <h2 class="modal-title" style="margin-bottom:8px">You've reached your Starter plan limit</h2>
        <p class="modal-sub" style="margin-bottom:20px">${msg}</p>
        <button type="button" class="btn-gold" style="width:100%;justify-content:center;margin-bottom:10px"
          onclick="nestiqCloseModalAnimated();nestiqInitiatePayFastCheckout('pro','monthly')">Upgrade to Pro — ${nestiqFormatZar(NESTIQ_PLANS.pro.price_monthly)}/month</button>
        <button type="button" class="btn-outline" style="width:100%;justify-content:center" onclick="nestiqCloseModalAnimated()">Maybe Later</button>
        ${STRIPE_ENABLED ? `<button type="button" class="btn-outline btn-sm" style="width:100%;margin-top:10px" onclick="nestiqCloseModalAnimated();nestiqInitiateStripeCheckout('pro','monthly')">Pay with Stripe</button>` : ''}
      </div>`;
    if(typeof openModal === 'function') openModal();
    const mc = document.getElementById('modalContent');
    if(mc){
      mc.innerHTML = html;
      nestiqOpenModalAnimated();
    } else if(typeof nestiqShowNotif === 'function') nestiqShowNotif(msg, 'warning');
  }

  function nestiqSplitName(full){
    const parts = String(full || 'Landlord').trim().split(/\s+/);
    return {
      firstName: parts[0] || 'Landlord',
      lastName: parts.slice(1).join(' ') || 'User'
    };
  }

  function nestiqPayfastSignature(data, passPhrase){
    const keys = Object.keys(data).filter(k => data[k] !== '' && data[k] != null).sort();
    const str = keys.map(k => `${k}=${encodeURIComponent(String(data[k]).trim()).replace(/%20/g,'+')}`).join('&');
    const full = passPhrase ? str + `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g,'+')}` : str;
    if(typeof CryptoJS !== 'undefined' && CryptoJS.MD5){
      return CryptoJS.MD5(full).toString();
    }
    return '';
  }

  function nestiqInitiatePayFastCheckout(planKey, billingCycle){
    planKey = String(planKey || 'pro').toLowerCase();
    billingCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const plan = NESTIQ_PLANS[planKey];
    if(!plan){
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Invalid plan selected.', 'error');
      return;
    }
    if(plan.price_monthly <= 0 && planKey !== 'starter'){
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Invalid plan selected.', 'error');
      return;
    }
    if(typeof nestiqShowInAppPaymentModal !== 'function'){
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Payment form failed to load. Refresh and try again.', 'error');
      return;
    }

    const amount = billingCycle === 'annual' ? plan.price_annual : plan.price_monthly;
    const label = billingCycle === 'annual' ? 'Annual' : 'Monthly';
    const month = new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' });

    nestiqShowInAppPaymentModal({
      amount,
      description: `NestIQ Pro ${plan.name} Plan — ${label} (${month})`,
      onSuccess: function(ref){
        const landlordId = typeof window.nestiqCurrentLandlordUid === 'function'
          ? window.nestiqCurrentLandlordUid()
          : (window.__nestiqLandlordUid || null);

        if(window.nestiqDb && landlordId){
          window.nestiqDb
            .collection('landlords').doc(landlordId)
            .collection('profile').doc('settings')
            .update({
              'billing.plan': planKey,
              'billing.status': 'active',
              'billing.billingCycle': billingCycle,
              'billing.reference': ref,
              'billing.updatedAt': new Date().toISOString(),
              'billing.currentPeriodStart': new Date().toISOString()
            })
            .then(() => {
              if(window.landlordSettings){
                window.landlordSettings.billing = Object.assign({}, window.landlordSettings.billing || {}, {
                  plan: planKey,
                  status: 'active',
                  billingCycle,
                  reference: ref,
                  updatedAt: new Date().toISOString(),
                  currentPeriodStart: new Date().toISOString()
                });
              }
              if(typeof nestiqShowNotif === 'function'){
                nestiqShowNotif(`🎉 Upgraded to ${plan.name} plan successfully!`, 'success', 6000);
              }
              if(typeof nestiqConfetti === 'function'){
                nestiqConfetti({ count: 120, spread: 80 });
              }
              setTimeout(() => {
                if(typeof nestiqRenderBillingPage === 'function') nestiqRenderBillingPage();
              }, 1200);
            })
            .catch(e => {
              console.warn('[NestIQ] Billing update error:', e);
              // Nested update can fail if billing object missing — fall back to apply helper
              if(typeof nestiqApplyPaidPlan === 'function'){
                nestiqApplyPaidPlan(planKey, billingCycle, { mPaymentId: ref, amount })
                  .then(() => {
                    if(typeof nestiqShowNotif === 'function'){
                      nestiqShowNotif(`🎉 Upgraded to ${plan.name} plan successfully!`, 'success', 6000);
                    }
                    if(typeof nestiqRenderBillingPage === 'function') nestiqRenderBillingPage();
                  })
                  .catch(() => {
                    if(typeof nestiqShowNotif === 'function'){
                      nestiqShowNotif('Payment recorded but plan update failed. Contact support.', 'warning');
                    }
                  });
              }else if(typeof nestiqShowNotif === 'function'){
                nestiqShowNotif('Payment recorded but plan update failed. Contact support.', 'warning');
              }
            });
        }else{
          if(window.landlordSettings){
            window.landlordSettings.billing = window.landlordSettings.billing || {};
            window.landlordSettings.billing.plan = planKey;
            window.landlordSettings.billing.status = 'active';
            window.landlordSettings.billing.billingCycle = billingCycle;
          }
          if(typeof nestiqShowNotif === 'function'){
            nestiqShowNotif(`🎉 Upgraded to ${plan.name} plan!`, 'success', 5000);
          }
          if(typeof nestiqRenderBillingPage === 'function') nestiqRenderBillingPage();
        }
      }
    });
  }

  function nestiqInitiateStripeCheckout(planKey, billingCycle){
    if(!STRIPE_ENABLED){
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Stripe is not configured yet. Use PayFast for now.', 'info');
      return;
    }
    if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Stripe checkout coming soon — use PayFast.', 'info');
  }

  async function nestiqApplyPaidPlan(planKey, billingCycle, meta){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid || !window.nestiqFs) return false;
    planKey = String(planKey || 'pro').toLowerCase();
    if(!NESTIQ_PLANS[planKey] || planKey === 'starter') planKey = 'pro';
    billingCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const months = billingCycle === 'annual' ? 12 : 1;
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    const amount = meta && Number.isFinite(Number(meta.amount))
      ? Number(meta.amount)
      : (billingCycle === 'annual' ? NESTIQ_PLANS[planKey].price_annual : NESTIQ_PLANS[planKey].price_monthly);
    const mPaymentId = meta?.mPaymentId ? String(meta.mPaymentId) : null;
    const patch = {
      billing: {
        ...(nestiqGetBilling() || {}),
        plan: planKey,
        status: 'active',
        billingCycle,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: end.toISOString(),
        payfastPaymentId: mPaymentId,
        updatedAt: new Date().toISOString()
      }
    };
    await window.nestiqFs.settingsRef(db, lid).set(patch, { merge: true });
    try{
      await db.collection('landlords').doc(lid).collection('billing').doc('payments').collection('history').add({
        paymentId: mPaymentId,
        mPaymentId,
        plan: planKey,
        billingCycle,
        amount,
        currency: 'ZAR',
        status: 'paid',
        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
        description: `NestIQ ${planKey} — ${billingCycle}`,
        source: meta?.source || 'client_return'
      });
    }catch(histErr){
      console.warn('NestIQ payment history write', histErr);
    }
    if(mPaymentId){
      try{
        await db.collection('landlords').doc(lid).collection('billing').doc('pending').collection('records').doc(mPaymentId).set({
          status: 'completed',
          completedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }catch(_e){}
    }
    await nestiqRefreshLandlordSettingsFromFirestore();
    nestiqUpdateNavBillingBadge();
    return true;
  }

  /**
   * PayFast return_url success does not always mean the ITN webhook ran (sandbox / missing notify_url).
   * Activate from the pending checkout the landlord just completed.
   * @returns {Promise<boolean>}
   */
  async function nestiqActivatePlanAfterSuccessfulPayment(hint){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid) return false;

    // Prefer live Firestore status (webhook may already have activated).
    try{ await nestiqRefreshLandlordSettingsFromFirestore(); }catch(_e){}

    const current = nestiqGetBilling();
    const curPlan = String(current.plan || '').toLowerCase();
    const curStatus = String(current.status || '').toLowerCase();
    // Paid active (not trial) — already subscribed after payment / webhook.
    if(curStatus === 'active' && curPlan && curPlan !== 'starter'){
      nestiqClearPendingPaymentReturn();
      nestiqUpdateNavBillingBadge();
      return true;
    }

    let planKey = hint?.plan || null;
    let billingCycle = hint?.cycle || null;
    let mPaymentId = hint?.mPaymentId || null;
    let amount = hint?.amount != null ? Number(hint.amount) : null;
    let foundPending = !!(planKey || mPaymentId);

    // Prefer newest pending/completed checkout for this landlord
    try{
      const pendingCol = db.collection('landlords').doc(lid).collection('billing').doc('pending').collection('records');
      let snap;
      try{
        snap = await pendingCol.orderBy('createdAt', 'desc').limit(8).get();
      }catch(_idx){
        snap = await pendingCol.limit(8).get();
      }
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => {
          const st = String(r.status || 'pending').toLowerCase();
          return st === 'pending' || st === 'completed' || st === '';
        });
      if(mPaymentId){
        const match = rows.find(r => r.id === mPaymentId || r.m_payment_id === mPaymentId)
          || snap.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.id === mPaymentId || r.m_payment_id === mPaymentId);
        if(match){
          planKey = match.plan || planKey;
          billingCycle = match.billingCycle || billingCycle;
          amount = match.amount != null ? Number(match.amount) : amount;
          mPaymentId = match.id || mPaymentId;
          foundPending = true;
        }
      }else if(rows.length){
        const newest = rows[0];
        const created = newest.createdAt?.toDate ? newest.createdAt.toDate() : (newest.createdAt ? new Date(newest.createdAt) : null);
        // Only auto-apply recent pending checkouts (48h) so we don't upgrade cold visits.
        if(!created || (Date.now() - created.getTime()) < 48 * 60 * 60 * 1000){
          planKey = newest.plan || planKey || 'pro';
          billingCycle = newest.billingCycle || billingCycle || 'monthly';
          amount = newest.amount != null ? Number(newest.amount) : amount;
          mPaymentId = newest.id || newest.m_payment_id || null;
          foundPending = true;
        }
      }
    }catch(e){
      console.warn('NestIQ pending checkout lookup', e);
    }

    // From PayFast success URL we may only have localStorage hint (plan/cycle).
    if(!foundPending && planKey){
      foundPending = true;
      billingCycle = billingCycle || 'monthly';
    }

    if(!foundPending) return false;

    const ok = await nestiqApplyPaidPlan(planKey || 'pro', billingCycle || 'monthly', {
      mPaymentId,
      amount,
      source: 'payfast_return'
    });
    if(ok) nestiqClearPendingPaymentReturn();
    return ok;
  }

  /**
   * After landlord auth + settings load: if they just paid (local pending or ?payment=success),
   * activate the plan so the UI shows subscribed without a manual refresh.
   */
  async function nestiqSyncSubscriptionAfterLogin(){
    const s = typeof getSession === 'function' ? getSession() : null;
    if(!s || s.role !== 'landlord') return false;
    try{ await nestiqRefreshLandlordSettingsFromFirestore(); }catch(_e){}
    if(nestiqPlanIsPaidActive() && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
        && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter'){
      nestiqClearPendingPaymentReturn();
      nestiqUpdateNavBillingBadge();
      if(document.getElementById('billCurrentPlanName')){
        try{ await nestiqRenderBillingPage(); }catch(_e){}
      }
      return true;
    }
    const pending = nestiqPeekPendingPaymentReturn();
    const urlSuccess = (()=>{
      try{ return new URLSearchParams(location.search).get('payment') === 'success'; }catch(_e){ return false; }
    })();
    const freshPending = nestiqPendingPaymentIsFresh(pending, 48 * 60 * 60 * 1000);
    if(!urlSuccess && !freshPending) return false;
    const ok = await nestiqActivatePlanAfterSuccessfulPayment(pending || { plan: 'pro', cycle: 'monthly' });
    nestiqUpdateNavBillingBadge();
    if(ok){
      nestiqClearPaymentQueryParam();
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('✓ Your Pro plan is now active!', 'success');
      if(document.getElementById('billCurrentPlanName')){
        try{ await nestiqRenderBillingPage(); }catch(_e){}
      }
    }
    return ok;
  }

  function nestiqPlanIsPaidActive(b){
    const plan = String((b || nestiqGetBilling()).plan || '').toLowerCase();
    const status = String((b || nestiqGetBilling()).status || '').toLowerCase();
    return plan && plan !== 'starter' && (status === 'active' || status === 'trial');
  }

  async function nestiqSimulateSuccessfulPayment(planKey){
    return nestiqApplyPaidPlan(planKey || 'pro', 'monthly', { source: 'simulate' });
  }

  async function nestiqDowngradeToStarter(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid) return;
    await window.nestiqFs.settingsRef(db, lid).set({
      billing: { plan: 'starter', status: 'active', billingCycle: null, updatedAt: new Date().toISOString() }
    }, { merge: true });
    await nestiqRefreshLandlordSettingsFromFirestore();
  }

  function nestiqTrialDaysRemaining(){
    const b = nestiqGetBilling();
    if(b.status !== 'trial' || !b.trialEnds) return null;
    const end = new Date(b.trialEnds);
    const diff = Math.ceil((end - Date.now()) / 86400000);
    return diff;
  }

  async function nestiqCheckTrialStatus(){
    const sess = typeof getSession === 'function' ? getSession() : null;
    if(!sess || sess.role !== 'landlord') return;
    const b = nestiqGetBilling();
    if(b.status !== 'trial' || !b.trialEnds) return;
    const days = nestiqTrialDaysRemaining();
    if(days != null && days <= 0){
      await nestiqDowngradeToStarter();
      const html = `
        <div style="text-align:center;padding:12px">
          <h2 class="modal-title">Trial ended</h2>
          <p class="modal-sub">Your 14-day free trial has ended. Upgrade to Pro to keep your full access.</p>
          <button class="btn-gold" style="width:100%;margin-top:16px" onclick="nestiqCloseModalAnimated();location.href='billing.html'">Upgrade Now</button>
        </div>`;
      if(typeof openModal === 'function'){
        document.getElementById('modalContent').innerHTML = html;
        nestiqOpenModalAnimated();
      }
      return;
    }
    if(days != null && days <= 3){
      nestiqShowTrialBanner(days);
    }
  }

  function nestiqShowTrialBanner(days){
    let el = document.getElementById('nestiqTrialBanner');
    if(!el){
      el = document.createElement('div');
      el.id = 'nestiqTrialBanner';
      el.style.cssText = 'background:#fff3cd;color:#856404;padding:12px 16px;text-align:center;font-size:0.88rem;border-bottom:1px solid #ffeeba;position:sticky;top:0;z-index:200';
      const nav = document.getElementById('navbar');
      if(nav && nav.parentNode) nav.parentNode.insertBefore(el, nav);
      else document.body.prepend(el);
    }
    if(sessionStorage.getItem('nestiq-trial-banner-dismiss') === '1') return;
    el.innerHTML = `Your free trial ends in <strong>${days}</strong> day${days === 1 ? '' : 's'}. 
      <a href="billing.html" style="color:#C46A3A;font-weight:600;margin-left:8px">Upgrade now</a>
      <button type="button" onclick="sessionStorage.setItem('nestiq-trial-banner-dismiss','1');document.getElementById('nestiqTrialBanner').remove()" 
        style="margin-left:12px;background:none;border:none;cursor:pointer;text-decoration:underline">Dismiss</button>`;
  }

  function nestiqCreateDefaultTrialBilling(){
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 86400000);
    return {
      plan: 'pro',
      status: 'trial',
      trialStarted: now.toISOString(),
      trialEnds: end.toISOString(),
      billingCycle: null,
      payfastPaymentId: null,
      aiRequestsThisMonth: 0,
      aiUsageMonth: now.toISOString().slice(0, 7)
    };
  }

  window.NESTIQ_PLANS = NESTIQ_PLANS;
  window.nestiqFormatZar = nestiqFormatZar;
  window.nestiqGetBilling = nestiqGetBilling;
  window.nestiqGetCurrentPlanKey = nestiqGetCurrentPlanKey;
  window.nestiqEffectivePlanKey = nestiqEffectivePlanKey;
  window.nestiqCheckPlanLimit = nestiqCheckPlanLimit;
  window.nestiqShowUpgradePrompt = nestiqShowUpgradePrompt;
  window.nestiqInitiatePayFastCheckout = nestiqInitiatePayFastCheckout;
  window.nestiqInitiateStripeCheckout = nestiqInitiateStripeCheckout;
  window.nestiqRefreshLandlordSettingsFromFirestore = nestiqRefreshLandlordSettingsFromFirestore;
  window.nestiqCheckTrialStatus = nestiqCheckTrialStatus;
  window.nestiqSimulateSuccessfulPayment = nestiqSimulateSuccessfulPayment;
  window.nestiqDowngradeToStarter = nestiqDowngradeToStarter;
  window.nestiqGuardAiRequest = nestiqGuardAiRequest;
  window.nestiqCreateDefaultTrialBilling = nestiqCreateDefaultTrialBilling;
  window.nestiqTrialDaysRemaining = nestiqTrialDaysRemaining;
  window.nestiqIncrementAiUsage = nestiqIncrementAiUsage;
  window.PAYFAST_IS_SANDBOX = PAYFAST_IS_SANDBOX;
  window.NESTIQ_PLAN_ORDER = PLAN_ORDER;

  function nestiqLimitLabel(limit){
    if(nestiqIsUnlimited(limit)) return 'Unlimited';
    return String(limit);
  }

  function nestiqUsageBarPct(used, limit){
    if(nestiqIsUnlimited(limit)) return 0;
    if(!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function nestiqUsageBarColor(pct){
    if(pct >= 100) return '#dc3545';
    if(pct >= 80) return '#e6a817';
    return '#C46A3A';
  }

  function nestiqBillingStatusBadge(b){
    const st = String(b.status || 'active');
    if(st === 'failed' || st === 'payment_failed') return '<span class="bill-badge bill-badge-red">Payment Failed</span>';
    if(st === 'trial'){
      const d = nestiqTrialDaysRemaining();
      const label = d != null ? `Trial — ${Math.max(0, d)} day${d === 1 ? '' : 's'} remaining` : 'Trial';
      return `<span class="bill-badge bill-badge-amber">${label}</span>`;
    }
    if(st === 'active' || st === 'cancelled') return '<span class="bill-badge bill-badge-green">Active</span>';
    return `<span class="bill-badge bill-badge-green">${escHtml(st)}</span>`;
  }

  function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function nestiqPlanDisplayName(key){
    const k = nestiqEffectivePlanKey();
    const p = NESTIQ_PLANS[k];
    if(k === 'starter') return 'Free';
    return p ? p.name : 'Starter';
  }

  let __billingCycleToggle = 'monthly';

  function nestiqScrollToPlans(){
    document.getElementById('billPlanSection')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function nestiqLoadPaymentHistory(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    const wrap = document.getElementById('billPaymentHistory');
    if(!wrap || !db || !lid) return [];
    try{
      const snap = await db.collection('landlords').doc(lid).collection('billing').doc('payments').collection('history')
        .orderBy('paidAt', 'desc').limit(24).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }catch(e){
      console.warn('payment history', e);
      return [];
    }
  }

  function nestiqDownloadReceiptById(id){
    const row = (window.__nestiqPaymentRows || []).find(r => r.id === id);
    if(row) nestiqDownloadReceipt(row);
  }

  function nestiqDownloadReceipt(row){
    const jsPDF = window.jspdf?.jsPDF;
    if(!jsPDF){ if(typeof nestiqShowNotif === 'function') nestiqShowNotif('PDF library not loaded', 'error'); return; }
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('NestIQ Payment Receipt', 14, 20);
    doc.setFontSize(11);
    doc.text(`Description: ${row.description || row.plan || 'Subscription'}`, 14, 36);
    doc.text(`Amount: ${nestiqFormatZar(row.amount)}`, 14, 44);
    doc.text(`Status: ${row.status || 'paid'}`, 14, 52);
    const dt = row.paidAt?.toDate ? row.paidAt.toDate() : (row.paidAt ? new Date(row.paidAt) : new Date());
    doc.text(`Date: ${dt.toLocaleDateString('en-ZA')}`, 14, 60);
    doc.save(`NestIQ-receipt-${row.id || Date.now()}.pdf`);
  }

  async function nestiqSaveBillingDetails(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid) return;
    const email = document.getElementById('billInvoiceEmail')?.value?.trim();
    const vat = document.getElementById('billVatNumber')?.value?.trim();
    const patch = {
      billing: {
        ...nestiqGetBilling(),
        invoiceEmail: email,
        vatNumber: vat || null
      }
    };
    await window.nestiqFs.settingsRef(db, lid).set(patch, { merge: true });
    await nestiqRefreshLandlordSettingsFromFirestore();
    if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Billing details saved', 'success');
  }

  async function nestiqCancelSubscription(){
    if(!confirm('Cancel your paid subscription? You will keep access until the end of the current period, then move to Starter.')) return;
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid) return;
    await window.nestiqFs.settingsRef(db, lid).set({
      billing: { ...nestiqGetBilling(), status: 'cancelled', cancelAt: new Date().toISOString() }
    }, { merge: true });
    await nestiqRefreshLandlordSettingsFromFirestore();
    if(typeof window.nestiqSendEmailFireAndForget === 'function'){
      const ls = window.landlordSettings || {};
      window.nestiqSendEmailFireAndForget('subscriptionCancelled', {
        to_name: String(ls.name || '').split(/\s+/)[0] || 'Landlord',
        to_email: ls.email,
        dashboard_url: (typeof nestiqAppBaseUrlSafe === 'function' ? nestiqAppBaseUrlSafe() : '') + 'billing.html',
        support_email: window.NESTIQ_SUPPORT_EMAIL || 'support@nestiq.co.za'
      });
    }
    if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Subscription cancelled', 'warning');
    nestiqRenderBillingPage();
  }

  function nestiqRenderPlanCards(){
    const grid = document.getElementById('billPlanGrid');
    if(!grid) return;
    const current = nestiqEffectivePlanKey();
    const cycle = __billingCycleToggle;
    const keys = ['starter', 'pro', 'enterprise'];
    grid.innerHTML = keys.map(key => {
      const p = NESTIQ_PLANS[key];
      const price = cycle === 'annual' ? p.price_annual : p.price_monthly;
      const per = cycle === 'annual' ? '/year' : '/month';
      const highlight = key === 'pro' ? ' bill-plan-popular recommended' : '';
      const cur = key === current;
      const curIdx = PLAN_ORDER[current] ?? 0;
      const thisIdx = PLAN_ORDER[key] ?? 0;
      let btn = '';
      if(cur) btn = '<button type="button" class="bill-btn bill-btn-muted" disabled>Current Plan</button>';
      else if(thisIdx < curIdx) btn = `<button type="button" class="bill-btn bill-btn-outline" onclick="nestiqDowngradeToStarter();nestiqRenderBillingPage()">Downgrade</button>`;
      else btn = `<button type="button" class="bill-btn bill-btn-gold" onclick="nestiqInitiatePayFastCheckout('${key}','${cycle}')">Upgrade Now</button>`;
      const feats = p.features.map(f => `<li>✓ ${escHtml(f)}</li>`).join('');
      return `<div class="bill-plan-card billing-plan-card${highlight}" data-plan="${key}">
        ${key === 'pro' ? '<div class="bill-popular-tag">Most Popular</div>' : ''}
        <h3 class="font-display text-xl font-bold">${escHtml(p.name)}</h3>
        <p class="bill-price"><span id="billPrice-${key}" class="bill-price-num">${price === 0 ? 'Free' : ('R' + Number(price).toLocaleString('en-ZA'))}</span><span class="bill-price-sub">${price ? per : ''}</span></p>
        <ul class="bill-features">${feats}</ul>
        ${btn}
      </div>`;
    }).join('');
    window.__nestiqBillPricePrev = window.__nestiqBillPricePrev || {};
    keys.forEach(key => {
      const p = NESTIQ_PLANS[key];
      const price = cycle === 'annual' ? p.price_annual : p.price_monthly;
      const el = document.getElementById('billPrice-' + key);
      const prev = window.__nestiqBillPricePrev[key];
      if(el && price > 0 && prev != null && prev !== price && typeof nestiqAnimateCounter === 'function'){
        nestiqAnimateCounter(el, price, 700, 'R', '', prev);
      }
      window.__nestiqBillPricePrev[key] = price;
    });
    grid.querySelectorAll('.bill-plan-card').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.remove('nq-plan-pick');
        void card.offsetWidth;
        card.classList.add('nq-plan-pick');
      });
    });
  }

  function nestiqRenderUsageBars(){
    const planKey = nestiqEffectivePlanKey();
    const limits = NESTIQ_PLANS[planKey].limits;
    const items = [
      { key: 'properties', label: 'Properties' },
      { key: 'tenants', label: 'Tenants' },
      { key: 'ai_requests', label: 'AI requests this month' },
      { key: 'team_members', label: 'Team members' }
    ];
    const wrap = document.getElementById('billUsageBars');
    if(!wrap) return;
    wrap.innerHTML = items.map(it => {
      const used = nestiqGetUsageCount(it.key);
      const lim = limits[it.key];
      const unlimited = nestiqIsUnlimited(lim);
      const pct = nestiqUsageBarPct(used, lim);
      const disabled = lim === 0 && it.key === 'ai_requests';
      const label = unlimited ? `${used} / Unlimited` : `${used} / ${nestiqLimitLabel(lim)}`;
      const upgrade = pct >= 100 && !unlimited
        ? ` <a href="#" class="bill-upgrade-link" onclick="nestiqScrollToPlans();return false">Upgrade to add more</a>` : '';
      return `<div class="bill-usage-item${disabled ? ' bill-usage-disabled' : ''}">
        <div class="bill-usage-head"><span>${it.label}</span><span>${label}${upgrade}</span></div>
        <div class="bill-bar-track"><div class="bill-bar-fill nq-progress" style="--nq-target:${unlimited ? 8 : pct}%;background:${nestiqUsageBarColor(pct)}"></div></div>
      </div>`;
    }).join('');
  }

  async function nestiqRenderBillingPage(){
    const b = nestiqGetBilling();
    const planKey = nestiqEffectivePlanKey();
    const plan = NESTIQ_PLANS[planKey];
    const cycle = b.billingCycle === 'annual' ? 'Annual' : (b.billingCycle === 'monthly' ? 'Monthly' : '—');
    const amt = b.billingCycle === 'annual' ? plan.price_annual : plan.price_monthly;
    const paid = planKey !== 'starter' && (b.status === 'active' || b.status === 'trial');
    const end = (()=>{
      const raw = b.currentPeriodEnd || b.trialEnds;
      if(!raw) return null;
      if(typeof raw.toDate === 'function') return raw.toDate();
      if(raw.seconds != null) return new Date(Number(raw.seconds) * 1000);
      return new Date(raw);
    })();
    const nextBill = end && !isNaN(end) ? end.toLocaleDateString('en-ZA') : '—';

    const title = document.getElementById('billCurrentPlanName');
    if(title) title.textContent = nestiqPlanDisplayName(planKey);
    const badge = document.getElementById('billStatusBadge');
    if(badge) badge.innerHTML = nestiqBillingStatusBadge(b);
    const meta = document.getElementById('billCurrentMeta');
    if(meta) meta.innerHTML = `
      <p><strong>Billing cycle:</strong> ${cycle}</p>
      <p><strong>Next billing date:</strong> ${nextBill}</p>
      <p><strong>Amount due:</strong> ${planKey === 'starter' && b.status !== 'trial' ? 'R0.00' : nestiqFormatZar(amt)}</p>`;
    const cancelBtn = document.getElementById('billCancelBtn');
    const invoiceBtn = document.getElementById('billDownloadInvoiceBtn');
    const refreshPaidBtn = document.getElementById('billRefreshPaidBtn');
    if(cancelBtn) cancelBtn.style.display = paid && b.status === 'active' ? '' : 'none';
    if(invoiceBtn) invoiceBtn.style.display = paid && b.status === 'active' ? '' : 'none';
    // Hide manual recovery once the landlord is on a paid active plan.
    if(refreshPaidBtn){
      const needsManual = !(planKey !== 'starter' && b.status === 'active');
      refreshPaidBtn.style.display = needsManual ? '' : 'none';
    }

    const emailIn = document.getElementById('billInvoiceEmail');
    const vatIn = document.getElementById('billVatNumber');
    if(emailIn) emailIn.value = b.invoiceEmail || window.landlordSettings?.email || '';
    if(vatIn) vatIn.value = b.vatNumber || '';

    nestiqRenderUsageBars();
    nestiqRenderPlanCards();

    const hist = await nestiqLoadPaymentHistory();
    window.__nestiqPaymentRows = hist;
    const tbody = document.getElementById('billPaymentBody');
    if(tbody){
      if(!hist.length){
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No payments yet</td></tr>';
      }else{
        tbody.innerHTML = hist.map(row => {
          const dt = row.paidAt?.toDate ? row.paidAt.toDate() : (row.paidAt ? new Date(row.paidAt) : null);
          const st = String(row.status || 'paid').toLowerCase();
          const badgeCls = st === 'paid' ? 'bill-badge-green' : (st === 'refunded' ? 'bill-badge-amber' : 'bill-badge-red');
          return `<tr>
            <td>${dt ? dt.toLocaleDateString('en-ZA') : '—'}</td>
            <td>${escHtml(row.description || `NestIQ ${row.plan || ''}`)}</td>
            <td>${nestiqFormatZar(row.amount)}</td>
            <td><span class="bill-badge ${badgeCls}">${escHtml(st.charAt(0).toUpperCase() + st.slice(1))}</span></td>
            <td><button type="button" class="bill-btn bill-btn-outline bill-btn-sm" onclick="nestiqDownloadReceiptById('${escHtml(row.id)}')">Download Receipt</button></td>
          </tr>`;
        }).join('');
      }
    }

    const sandbox = document.getElementById('billSandboxPanel');
    if(sandbox) sandbox.style.display = PAYFAST_IS_SANDBOX ? 'block' : 'none';
    nestiqUpdateNavBillingBadge();
  }

  function nestiqUpdateNavBillingBadge(){
    document.querySelectorAll('[data-billing-upgrade-badge]').forEach(el => {
      const k = nestiqEffectivePlanKey();
      el.style.display = k === 'starter' ? 'inline' : 'none';
    });
  }

  function nestiqSetBillingCycleToggle(cycle){
    __billingCycleToggle = cycle === 'annual' ? 'annual' : 'monthly';
    document.getElementById('billCycleMonthly')?.classList.toggle('active', __billingCycleToggle === 'monthly');
    document.getElementById('billCycleAnnual')?.classList.toggle('active', __billingCycleToggle === 'annual');
    nestiqRenderPlanCards();
  }

  function nestiqClearPaymentQueryParam(){
    try{
      const params = new URLSearchParams(location.search);
      if(!params.has('payment') && !params.has('kind') && !params.has('ref')) return;
      params.delete('payment');
      params.delete('kind');
      params.delete('ref');
      const q = params.toString();
      const path = /\/index\.html$/i.test(location.pathname) ? location.pathname : '/index.html';
      history.replaceState({}, '', path + (q ? '?' + q : '') + (location.hash || ''));
    }catch(_e){}
  }

  /** After PayFast redirects back to NestIQ. */
  async function nestiqHandlePaymentReturnOnDashboard(){
    if(nestiqIsRentPaymentReturnUrl()){
      const s = typeof getSession === 'function' ? getSession() : null;
      let firebaseUser = null;
      try{ firebaseUser = firebase?.auth?.()?.currentUser; }catch(_e){}
      if(!firebaseUser && !(s && s.role === 'tenant')){
        const p = new URLSearchParams(location.search);
        nestiqShowPaymentReturnGate(p.get('payment') === 'cancelled' ? 'cancelled' : 'success');
        return;
      }
      try{ window.nestiqCheckPayFastReturn?.(); }catch(_e){}
      return;
    }
    const params = new URLSearchParams(location.search);
    let payment = params.get('payment');
    const pending = nestiqPeekPendingPaymentReturn();
    if(!payment && nestiqPendingPaymentIsFresh(pending, 2 * 60 * 60 * 1000)){
      payment = 'success';
    }
    if(!payment) return;

    const s = typeof getSession === 'function' ? getSession() : null;
    const authedLandlord = s && s.role === 'landlord';
    const firebaseUser = (()=>{ try{ return firebase?.auth?.()?.currentUser; }catch(_e){ return null; } })();

    // Not signed in yet — show a dedicated payment gate instead of the generic login landing.
    if(!authedLandlord && !firebaseUser){
      nestiqShowPaymentReturnGate(payment === 'cancelled' ? 'cancelled' : 'success');
      return;
    }

    if(payment === 'success'){
      nestiqConfetti?.({ count: 100, spread: 70 });
      if(typeof nestiqShowNotif === 'function'){
        nestiqShowNotif('🎉 Payment successful! Activating your plan…', 'success');
      }
      nestiqClearPaymentQueryParam();
      let activated = false;
      try{
        // Refresh first in case the PayFast ITN webhook already wrote status=active.
        await nestiqRefreshLandlordSettingsFromFirestore();
        if(nestiqPlanIsPaidActive()
            && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
            && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter'){
          activated = true;
          nestiqClearPendingPaymentReturn();
        }else{
          activated = await nestiqActivatePlanAfterSuccessfulPayment(pending || {});
        }
      }catch(actErr){
        console.error('NestIQ activate after payment', actErr);
      }
      if(activated){
        nestiqUpdateNavBillingBadge();
        if(typeof nestiqShowNotif === 'function') nestiqShowNotif('✓ Your Pro plan is now active!', 'success');
        if(typeof nestiqRenderBillingPage === 'function' && document.getElementById('billCurrentPlan')){
          try{ await nestiqRenderBillingPage(); }catch(_e){}
        }
        return;
      }
      // Webhook may still be in flight — poll a bit, then force from pending again.
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        await nestiqRefreshLandlordSettingsFromFirestore();
        const liveActive = nestiqPlanIsPaidActive()
          && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
          && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter';
        if(liveActive){
          clearInterval(poll);
          nestiqClearPendingPaymentReturn();
          nestiqUpdateNavBillingBadge();
          if(typeof nestiqShowNotif === 'function') nestiqShowNotif('✓ Your Pro plan is now active!', 'success');
          if(document.getElementById('billCurrentPlanName')){
            try{ await nestiqRenderBillingPage(); }catch(_e){}
          }
          return;
        }
        if(tries >= 6){
          clearInterval(poll);
          try{
            const hint = nestiqPeekPendingPaymentReturn() || pending || { plan: 'pro', cycle: 'monthly' };
            const ok = await nestiqActivatePlanAfterSuccessfulPayment(hint);
            if(ok && typeof nestiqShowNotif === 'function') nestiqShowNotif('✓ Your Pro plan is now active!', 'success');
            else if(typeof nestiqShowNotif === 'function'){
              nestiqShowNotif('Payment received — your plan will update shortly. Open Billing & Plan if it has not updated.', 'info');
            }
            nestiqUpdateNavBillingBadge();
            if(document.getElementById('billCurrentPlanName')){
              try{ await nestiqRenderBillingPage(); }catch(_e){}
            }
          }catch(_e){
            if(typeof nestiqShowNotif === 'function'){
              nestiqShowNotif('Payment received — open Billing & Plan if your plan has not updated yet.', 'info');
            }
          }
        }
      }, 1500);
    }else if(payment === 'cancelled'){
      if(typeof nestiqShowNotif === 'function'){
        nestiqShowNotif('Payment was cancelled. Your plan has not changed.', 'warning');
      }
      nestiqClearPaymentQueryParam();
    }
  }

  async function nestiqHandleBillingReturnUrl(){
    const params = new URLSearchParams(location.search);
    const banner = document.getElementById('billReturnBanner');
    if(!banner){
      await nestiqHandlePaymentReturnOnDashboard();
      return;
    }
    if(params.get('payment') === 'success'){
      banner.className = 'bill-banner bill-banner-success';
      banner.textContent = '🎉 Payment successful! Activating your plan…';
      banner.style.display = 'block';
      const pending = nestiqPeekPendingPaymentReturn();
      let ok = false;
      try{
        await nestiqRefreshLandlordSettingsFromFirestore();
        if(nestiqPlanIsPaidActive()
            && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
            && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter'){
          ok = true;
          nestiqClearPendingPaymentReturn();
        }else{
          ok = await nestiqActivatePlanAfterSuccessfulPayment(pending || {});
        }
      }catch(_e){}
      if(ok){
        banner.textContent = '🎉 Payment successful! Your Pro plan is now active.';
        history.replaceState({}, '', 'billing.html');
        await nestiqRenderBillingPage();
        return;
      }
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        await nestiqRefreshLandlordSettingsFromFirestore();
        const liveActive = nestiqPlanIsPaidActive()
          && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
          && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter';
        if(liveActive || tries >= 8){
          clearInterval(poll);
          if(!liveActive){
            try{
              await nestiqActivatePlanAfterSuccessfulPayment(
                nestiqPeekPendingPaymentReturn() || pending || { plan: 'pro' }
              );
            }catch(_e){}
          }else{
            nestiqClearPendingPaymentReturn();
          }
          history.replaceState({}, '', 'billing.html');
          nestiqRenderBillingPage();
        }
      }, 1500);
    }else if(params.get('payment') === 'cancelled'){
      banner.className = 'bill-banner bill-banner-warn';
      banner.textContent = 'Payment was cancelled. Your plan has not changed.';
      banner.style.display = 'block';
      history.replaceState({}, '', 'billing.html');
    }
  }

  async function nestiqLoadBillingUsageCounts(){
    const db = window.nestiqDb;
    const lid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!db || !lid || !window.nestiqFs) return;
    try{
      const [ps, ts] = await Promise.all([
        window.nestiqFs.properties(db, lid).get(),
        window.nestiqFs.tenants(db, lid).get()
      ]);
      window.propertiesData = ps.docs.map(d => ({ id: d.id, ...d.data() }));
      window.tenantsData = ts.docs.map(d => ({ id: d.id, ...d.data() }));
    }catch(e){ console.warn('usage counts', e); }
  }

  async function nestiqInitBillingPage(){
    await nestiqHandleBillingReturnUrl();
    // Recover only when we have a recent local checkout mark (user actually started PayFast).
    try{
      if(!nestiqPlanIsPaidActive()
          || String(nestiqGetBilling().plan || '').toLowerCase() === 'starter'
          || String(nestiqGetBilling().status || '').toLowerCase() === 'trial'){
        const pending = nestiqPeekPendingPaymentReturn();
        if(nestiqPendingPaymentIsFresh(pending, 48 * 60 * 60 * 1000)){
          await nestiqActivatePlanAfterSuccessfulPayment(pending);
        }
      }
    }catch(_e){}
    await nestiqLoadBillingUsageCounts();
    nestiqSetBillingCycleToggle('monthly');
    await nestiqRenderBillingPage();
  }

  /** Manual recovery for landlords who paid but still see Free. */
  async function nestiqRefreshPaidPlanStatus(){
    if(typeof nestiqShowNotif === 'function') nestiqShowNotif('Checking payment status…', 'info');
    await nestiqRefreshLandlordSettingsFromFirestore();
    if(nestiqPlanIsPaidActive()
        && String(nestiqGetBilling().status || '').toLowerCase() === 'active'
        && String(nestiqGetBilling().plan || '').toLowerCase() !== 'starter'){
      nestiqClearPendingPaymentReturn();
      nestiqUpdateNavBillingBadge();
      await nestiqRenderBillingPage();
      if(typeof nestiqShowNotif === 'function') nestiqShowNotif('✓ Your paid plan is active', 'success');
      return;
    }
    const pending = nestiqPeekPendingPaymentReturn();
    // Only auto-activate when we have evidence of a recent checkout (local mark or Firestore pending).
    const ok = await nestiqActivatePlanAfterSuccessfulPayment(pending || {});
    await nestiqRenderBillingPage();
    nestiqUpdateNavBillingBadge();
    if(typeof nestiqShowNotif === 'function'){
      nestiqShowNotif(
        ok
          ? '✓ Your Pro plan is now active!'
          : 'No recent PayFast checkout was found for this account. If you paid, return from PayFast with payment success, or contact support with your payment reference.',
        ok ? 'success' : 'warning'
      );
    }
  }

  window.nestiqRenderBillingPage = nestiqRenderBillingPage;
  window.nestiqInitBillingPage = nestiqInitBillingPage;
  window.nestiqSaveBillingDetails = nestiqSaveBillingDetails;
  window.nestiqCancelSubscription = nestiqCancelSubscription;
  window.nestiqScrollToPlans = nestiqScrollToPlans;
  window.nestiqSetBillingCycleToggle = nestiqSetBillingCycleToggle;
  window.nestiqDownloadReceipt = nestiqDownloadReceipt;
  window.nestiqDownloadReceiptById = nestiqDownloadReceiptById;
  window.nestiqUpdateNavBillingBadge = nestiqUpdateNavBillingBadge;
  window.nestiqHandlePaymentReturnOnDashboard = nestiqHandlePaymentReturnOnDashboard;
  window.nestiqPayfastReturnBase = nestiqPayfastReturnBase;
  window.nestiqIsPaymentReturnUrl = nestiqIsPaymentReturnUrl;
  window.nestiqIsRentPaymentReturnUrl = nestiqIsRentPaymentReturnUrl;
  window.nestiqShowPaymentReturnGate = nestiqShowPaymentReturnGate;
  window.nestiqPayfastProcessUrl = PAYFAST_PROCESS_URL;
  window.NESTIQ_PAYFAST_MERCHANT_ID = PAYFAST_MERCHANT_ID;
  window.NESTIQ_PAYFAST_MERCHANT_KEY = PAYFAST_MERCHANT_KEY;
  window.nestiqClearPaymentQueryParam = nestiqClearPaymentQueryParam;
  window.nestiqActivatePlanAfterSuccessfulPayment = nestiqActivatePlanAfterSuccessfulPayment;
  window.nestiqSyncSubscriptionAfterLogin = nestiqSyncSubscriptionAfterLogin;
  window.nestiqRefreshPaidPlanStatus = nestiqRefreshPaidPlanStatus;
  window.nestiqApplyPaidPlan = nestiqApplyPaidPlan;
})();
