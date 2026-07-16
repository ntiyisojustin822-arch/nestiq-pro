/* NestIQ automated email sequences (client-side) */
(function(){
  'use strict';

  const NESTIQ_SUPPORT_EMAIL = 'support@nestiq.co.za';
  const APP_BASE = 'https://nestiq-pro.web.app/';

  const NESTIQ_EMAIL_SEQUENCES = {
    welcome: {
      templateId: 'nestiq_welcome',
      subject: 'Welcome to NestIQ — Your dashboard is ready',
      trigger: 'onSignup',
      delay: 0
    },
    trialDay3: {
      templateId: 'nestiq_trial_day3',
      subject: 'Getting the most out of your NestIQ trial',
      trigger: 'onTrialDay3',
      delay: 3
    },
    trialDay10: {
      templateId: 'nestiq_trial_day10',
      subject: 'Your NestIQ trial ends in 4 days',
      trigger: 'onTrialDay10',
      delay: 10
    },
    trialDay13: {
      templateId: 'nestiq_trial_day13',
      subject: '⚠️ Last day of your NestIQ free trial',
      trigger: 'onTrialDay13',
      delay: 13
    },
    trialExpired: {
      templateId: 'nestiq_trial_expired',
      subject: 'Your NestIQ trial has ended',
      trigger: 'onTrialExpired',
      delay: 0
    },
    paymentFailed: {
      templateId: 'nestiq_payment_failed',
      subject: '⚠️ NestIQ payment failed — action required',
      trigger: 'onPaymentFailed',
      delay: 0
    },
    paymentSuccess: {
      templateId: 'nestiq_payment_success',
      subject: '✅ NestIQ payment confirmed',
      trigger: 'onPaymentSuccess',
      delay: 0
    },
    subscriptionCancelled: {
      templateId: 'nestiq_cancelled',
      subject: 'Your NestIQ subscription has been cancelled',
      trigger: 'onCancellation',
      delay: 0
    },
    winback: {
      templateId: 'nestiq_winback',
      subject: 'We miss you — come back to NestIQ',
      trigger: 'onInactive30Days',
      delay: 30
    },
    leaseExpiryAlert: {
      templateId: 'nestiq_lease_expiry',
      subject: '📅 Lease expiring soon — [Property Name]',
      trigger: 'onLeaseExpiry30Days',
      delay: 0
    },
    rentOverdueAlert: {
      templateId: 'nestiq_rent_overdue',
      subject: '💰 Overdue rent alert — [Tenant Name]',
      trigger: 'onRentOverdue',
      delay: 0
    },
    tenantInvitation: {
      templateId: 'nestiq_tenant_invitation',
      subject: 'You have been invited to the NestIQ tenant portal',
      trigger: 'onInvitationCreated',
      delay: 0
    },
    maintenanceSubmitted: {
      templateId: 'nestiq_maintenance_submitted',
      subject: '🔧 New maintenance request — [Property Name]',
      trigger: 'onMaintenanceSubmitted',
      delay: 0
    }
  };

  function nestiqAppBaseUrlSafe(){
    if(typeof window.nestiqAppBaseUrlSafe === 'function') return window.nestiqAppBaseUrlSafe();
    if(typeof location !== 'undefined' && location.origin) return String(location.origin).replace(/\/?$/,'/') + '/';
    return APP_BASE;
  }

  function formatTrialEndDate(){
    const b = window.landlordSettings?.billing || {};
    const end = b.trialEnds ? new Date(b.trialEnds) : new Date(Date.now() + 14 * 86400000);
    return end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function currentLandlordId(){
    if(typeof window.nestiqCurrentLandlordUid === 'function') return window.nestiqCurrentLandlordUid();
    return window.__nestiqLandlordUid || null;
  }

  function emailjsConfig(){
    const ls = window.landlordSettings || {};
    return ls.emailjs || ls.email || {};
  }

  function resolveTemplateId(seq, cfg){
    const templates = cfg.templates || {};
    return templates[seq.templateId] || templates[seq.trigger] || seq.templateId;
  }

  async function hasSentSequence(lid, sequenceKey, extra){
    const db = window.nestiqDb;
    if(!db || !lid) return false;
    try{
      let q = db.collection('landlords').doc(lid).collection('emailLogs')
        .where('sequenceKey', '==', sequenceKey)
        .where('status', '==', 'sent');
      if(extra?.propertyId) q = q.where('propertyId', '==', extra.propertyId);
      const snap = await q.limit(1).get();
      return !snap.empty;
    }catch(_e){
      return false;
    }
  }

  async function logEmailAttempt(lid, payload){
    const db = window.nestiqDb;
    if(!db || !lid) return;
    try{
      await db.collection('landlords').doc(lid).collection('emailLogs').add({
        ...payload,
        sentAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      console.warn('NestIQ email log', e);
    }
  }

  async function nestiqSendEmail(sequenceKey, templateParams, options){
    options = options || {};
    try{
      const seq = NESTIQ_EMAIL_SEQUENCES[sequenceKey];
      if(!seq) return false;

      const lid = options.landlordId || currentLandlordId();
      if(!options.skipDuplicateCheck && lid){
        const dup = await hasSentSequence(lid, sequenceKey, options);
        if(dup) return true;
      }

      const cfg = emailjsConfig();
      const publicKey = String(cfg.publicKey || '').trim();
      const serviceId = String(cfg.serviceId || '').trim();
      const templateId = String(resolveTemplateId(seq, cfg) || '').trim();
      const to = String(templateParams?.to_email || templateParams?.to || cfg.testEmail || window.landlordSettings?.email || '').trim();

      if(!publicKey || !serviceId || !templateId || !to){
        if(lid) await logEmailAttempt(lid, {
          sequenceKey,
          templateId: seq.templateId,
          to: to || '',
          subject: seq.subject,
          status: 'failed',
          error: 'EmailJS not configured or missing recipient'
        });
        return false;
      }

      if(typeof window.emailjs === 'undefined'){
        if(lid) await logEmailAttempt(lid, { sequenceKey, templateId, to, subject: seq.subject, status: 'failed', error: 'EmailJS library missing' });
        return false;
      }

      try{
        if(typeof initEmailJS === 'function') initEmailJS();
        else window.emailjs.init(publicKey);
      }catch(_e){}

      const params = {
        ...templateParams,
        to_email: to,
        subject: seq.subject,
        support_email: NESTIQ_SUPPORT_EMAIL
      };

      await window.emailjs.send(serviceId, templateId, params);

      if(lid){
        await logEmailAttempt(lid, {
          sequenceKey,
          templateId: seq.templateId,
          to,
          subject: seq.subject,
          status: 'sent',
          propertyId: options.propertyId || null,
          tenantId: options.tenantId || null
        });
      }
      return true;
    }catch(err){
      const lid = options.landlordId || currentLandlordId();
      const seq = NESTIQ_EMAIL_SEQUENCES[sequenceKey] || {};
      if(lid){
        await logEmailAttempt(lid, {
          sequenceKey,
          templateId: seq.templateId || sequenceKey,
          to: String(templateParams?.to_email || ''),
          subject: seq.subject || '',
          status: 'failed',
          error: String(err?.message || err || 'send failed')
        });
      }
      console.warn('NestIQ nestiqSendEmail', sequenceKey, err);
      return false;
    }
  }

  function nestiqSendEmailFireAndForget(sequenceKey, templateParams, options){
    Promise.resolve(nestiqSendEmail(sequenceKey, templateParams, options)).catch(() => {});
  }

  function nestiqUpdateLandlordLastActive(){
    const db = window.nestiqDb;
    const lid = currentLandlordId();
    if(!db || !lid) return;
    db.collection('landlords').doc(lid).collection('profile').doc('settings')
      .set({ lastActive: new Date().toISOString() }, { merge: true })
      .catch(() => {});
  }

  function nestiqNotifyMaintenanceSubmitted(request, ctx){
    const ls = window.landlordSettings || {};
    const nm = String(ls.name || '').trim();
    const first = ctx?.firstName || nm.split(/\s+/)[0] || 'Landlord';
    nestiqSendEmailFireAndForget('maintenanceSubmitted', {
      to_name: first,
      to_email: ctx?.email || ls.email,
      tenant_name: ctx?.tenantName || request?.tenantName || 'Tenant',
      property_name: ctx?.propertyName || request?.property || request?.propertyName || 'Property',
      issue_title: request?.title || 'Maintenance',
      urgency: request?.urgency || request?.priority || 'medium',
      description: request?.description || request?.title || '',
      dashboard_url: nestiqAppBaseUrlSafe() + 'index.html#maintenance'
    });
  }

  window.NESTIQ_EMAIL_SEQUENCES = NESTIQ_EMAIL_SEQUENCES;
  window.NESTIQ_SUPPORT_EMAIL = NESTIQ_SUPPORT_EMAIL;
  window.nestiqSendEmail = nestiqSendEmail;
  window.nestiqSendEmailFireAndForget = nestiqSendEmailFireAndForget;
  window.nestiqFormatTrialEndDate = formatTrialEndDate;
  window.nestiqUpdateLandlordLastActive = nestiqUpdateLandlordLastActive;
  window.nestiqNotifyMaintenanceSubmitted = nestiqNotifyMaintenanceSubmitted;
})();
