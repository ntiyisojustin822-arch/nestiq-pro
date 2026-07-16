const NESTIQ_SUPPORT_EMAIL = 'support@nestiq.co.za';
const APP_BASE = 'https://nestiq-pro.web.app/';

const NESTIQ_EMAIL_SEQUENCES = {
  welcome: { templateId: 'nestiq_welcome', subject: 'Welcome to NestIQ — Your dashboard is ready' },
  trialDay3: { templateId: 'nestiq_trial_day3', subject: 'Getting the most out of your NestIQ trial' },
  trialDay10: { templateId: 'nestiq_trial_day10', subject: 'Your NestIQ trial ends in 4 days' },
  trialDay13: { templateId: 'nestiq_trial_day13', subject: '⚠️ Last day of your NestIQ free trial' },
  trialExpired: { templateId: 'nestiq_trial_expired', subject: 'Your NestIQ trial has ended' },
  paymentFailed: { templateId: 'nestiq_payment_failed', subject: '⚠️ NestIQ payment failed — action required' },
  paymentSuccess: { templateId: 'nestiq_payment_success', subject: '✅ NestIQ payment confirmed' },
  subscriptionCancelled: { templateId: 'nestiq_cancelled', subject: 'Your NestIQ subscription has been cancelled' },
  winback: { templateId: 'nestiq_winback', subject: 'We miss you — come back to NestIQ' },
  leaseExpiryAlert: { templateId: 'nestiq_lease_expiry', subject: '📅 Lease expiring soon' },
  rentOverdueAlert: { templateId: 'nestiq_rent_overdue', subject: '💰 Overdue rent alert' },
  tenantInvitation: { templateId: 'nestiq_tenant_invitation', subject: 'NestIQ tenant portal invitation' },
  maintenanceSubmitted: { templateId: 'nestiq_maintenance_submitted', subject: '🔧 New maintenance request' }
};

function resolveTemplateId(seq, emailjs) {
  const templates = emailjs?.templates || {};
  return templates[seq.templateId] || seq.templateId;
}

async function hasSentSequence(db, landlordId, sequenceKey, extra) {
  let q = db.collection('landlords').doc(landlordId).collection('emailLogs')
    .where('sequenceKey', '==', sequenceKey)
    .where('status', '==', 'sent');
  if (extra?.propertyId) {
    q = q.where('propertyId', '==', extra.propertyId);
  }
  const snap = await q.limit(1).get();
  return !snap.empty;
}

async function sendEmailJs(publicKey, serviceId, templateId, templateParams) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: templateParams
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `EmailJS HTTP ${res.status}`);
  }
  return true;
}

async function sendSequenceEmail(landlordId, sequenceKey, templateParams, db, options) {
  options = options || {};
  const seq = NESTIQ_EMAIL_SEQUENCES[sequenceKey];
  if (!seq) return false;

  if (!options.skipDuplicateCheck) {
    const dup = await hasSentSequence(db, landlordId, sequenceKey, options);
    if (dup) return false;
  }

  const settingsSnap = await db.collection('landlords').doc(landlordId)
    .collection('profile').doc('settings').get();
  const data = settingsSnap.exists ? settingsSnap.data() : {};
  const emailjs = data.landlordSettings?.emailjs || {};
  const publicKey = String(emailjs.publicKey || '').trim();
  const serviceId = String(emailjs.serviceId || '').trim();
  const templateId = String(resolveTemplateId(seq, emailjs) || '').trim();
  const to = String(
    templateParams?.to_email ||
    templateParams?.to ||
    data.email ||
    data.profile?.email ||
  '').trim();

  const subject = seq.subject;
  const logBase = {
    sequenceKey,
    templateId: seq.templateId,
    to,
    subject,
    propertyId: options.propertyId || null,
    tenantId: options.tenantId || null
  };

  if (!publicKey || !serviceId || !templateId || !to) {
    await db.collection('landlords').doc(landlordId).collection('emailLogs').add({
      ...logBase,
      status: 'failed',
      error: 'EmailJS not configured or missing recipient',
      sentAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
    });
    return false;
  }

  const params = {
    ...templateParams,
    to_email: to,
    subject,
    support_email: NESTIQ_SUPPORT_EMAIL,
    upgrade_url: APP_BASE + 'billing.html',
    dashboard_url: APP_BASE + 'index.html',
    invoice_url: APP_BASE + 'billing.html',
    retry_url: APP_BASE + 'billing.html'
  };

  try {
    await sendEmailJs(publicKey, serviceId, templateId, params);
    await db.collection('landlords').doc(landlordId).collection('emailLogs').add({
      ...logBase,
      status: 'sent',
      sentAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (err) {
    await db.collection('landlords').doc(landlordId).collection('emailLogs').add({
      ...logBase,
      status: 'failed',
      error: String(err.message || err),
      sentAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
    });
    console.error('sendSequenceEmail', landlordId, sequenceKey, err);
    return false;
  }
}

module.exports = {
  NESTIQ_EMAIL_SEQUENCES,
  NESTIQ_SUPPORT_EMAIL,
  APP_BASE,
  sendSequenceEmail,
  hasSentSequence
};
