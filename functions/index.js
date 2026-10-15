const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendSequenceEmail, APP_BASE } = require('./emailSequences-server');

function getAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

function getDatePlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return getAdmin().firestore.Timestamp.fromDate(d);
}

async function getLandlordEmailContext(db, landlordId) {
  const snap = await db.collection('landlords').doc(landlordId)
    .collection('profile').doc('settings').get();
  const data = snap.exists ? snap.data() : {};
  const name = data.name || data.landlordSettings?.name || 'Landlord';
  return {
    landlordName: name,
    landlordEmail: data.email || data.landlordSettings?.email || data.profile?.email || '',
    firstName: data.profile?.firstName || String(name).split(/\s+/)[0] || 'Landlord'
  };
}

async function logFailedPayment(data, db) {
  const landlordId = data.custom_str1 || '';
  await db.collection('adminActivity').add({
    action: 'payment_failed',
    targetId: landlordId,
    amount: data.amount_gross || '',
    plan: data.custom_str2 || '',
    reason: data.payment_status || 'unknown',
        timestamp: getAdmin().firestore.FieldValue.serverTimestamp()
  });

  if (landlordId) {
    const ctx = await getLandlordEmailContext(db, landlordId);
    const amount = parseFloat(data.amount_gross || '0');
    await sendSequenceEmail(landlordId, 'paymentFailed', {
      to_name: ctx.firstName,
      to_email: ctx.landlordEmail,
      amount: `R${amount.toFixed(2)}`,
      retry_url: APP_BASE + 'billing.html',
      support_email: 'support@nestiq.co.za'
    }, db);
  }
}

async function handleRentPaymentItn(data, db) {
  const landlordId = String(data.custom_str1 || '');
  const tenantId = String(data.custom_str2 || '');
  const mPaymentId = String(data.custom_str3 || data.m_payment_id || '');
  const month = String(data.custom_str4 || '');
  const propertyName = String(data.custom_str5 || '');
  const amount = parseFloat(data.amount_gross || data.amount || '0');
  const payfastId = String(data.pf_payment_id || '');
  const adminSdk = getAdmin();
  const now = adminSdk.firestore.FieldValue.serverTimestamp();

  if (!landlordId || !tenantId) {
    throw new Error('Missing landlord or tenant id');
  }

  const paidDate = new Date().toISOString().slice(0, 10);

  await db.collection('landlords').doc(landlordId)
    .collection('payments').add({
      tenantId,
      landlordId,
      amount,
      month: month || new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' }),
      propertyName,
      date: paidDate,
      method: 'PayFast',
      reference: payfastId || mPaymentId,
      mPaymentId,
      receiptNo: payfastId ? ('PF-' + payfastId) : mPaymentId,
      status: 'paid',
      paidAt: now,
      recordedBy: 'payfast',
      source: 'tenant-portal'
    });

  await db.collection('landlords').doc(landlordId)
    .collection('tenants').doc(String(tenantId))
    .update({
      status: 'paid',
      lastPaymentDate: paidDate,
      daysOverdue: 0
    });

  if (mPaymentId) {
    const pendingRef = db.collection('landlords').doc(landlordId)
      .collection('pendingPayments').doc(mPaymentId);
    const pendingDoc = await pendingRef.get();
    if (pendingDoc.exists) {
      await pendingRef.update({
        status: 'complete',
        payfastId,
        completedAt: now
      });
    }
  }

  await db.collection('adminActivity').add({
    action: 'rent_payment_received',
    landlordId,
    tenantId,
    amount,
    month,
    propertyName,
    payfastId,
    mPaymentId,
    timestamp: now
  });

  console.log(`[payfastRentWebhook] Payment complete: ${mPaymentId} | R${amount} | ${tenantId}`);
}

exports.payfastRentWebhook = functions.https.onRequest(async (req, res) => {
  // PayFast sends ITN as POST with URL-encoded body
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const data = req.body || {};

    if (data.payment_status !== 'COMPLETE') {
      console.log('[payfastRentWebhook] Non-complete status:', data.payment_status);
      return res.status(200).send('OK');
    }

    const landlordId = String(data.custom_str1 || '');
    const tenantId = String(data.custom_str2 || '');
    if (!landlordId || !tenantId) {
      console.error('[payfastRentWebhook] Missing landlordId or tenantId');
      return res.status(400).send('Missing required fields');
    }

    const db = getAdmin().firestore();
    await handleRentPaymentItn(data, db);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[payfastRentWebhook] Error:', err);
    return res.status(500).send('Internal error');
  }
});

exports.payfastWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const data = req.body || {};
    const db = getAdmin().firestore();
    const mPaymentId = String(data.m_payment_id || '');
    const planKeyHint = String(data.custom_str2 || '').toLowerCase();
    const isRent = mPaymentId.indexOf('RENT-') === 0 || (planKeyHint && !['starter', 'pro', 'enterprise'].includes(planKeyHint) && data.custom_str4);

    if (isRent) {
      if (data.payment_status !== 'COMPLETE') {
        return res.status(200).send('OK');
      }
      await handleRentPaymentItn(data, db);
      return res.status(200).send('OK');
    }

    if (data.payment_status !== 'COMPLETE') {
      await logFailedPayment(data, db);
      return res.status(200).send('OK');
    }

    const landlordId = data.custom_str1;
    const planKey = data.custom_str2;
    const billingCycle = data.custom_str3;
    const amount = parseFloat(data.amount_gross || '0');
    const paymentId = data.pf_payment_id;

    if (!landlordId || !planKey) {
      return res.status(400).send('Missing metadata');
    }

    const periodEnd = getDatePlusMonths(billingCycle === 'annual' ? 12 : 1);
    const periodEndIso = periodEnd.toDate().toISOString();
    const periodStartIso = new Date().toISOString();

    await db.collection('landlords').doc(landlordId).collection('profile').doc('settings').set({
      billing: {
        plan: planKey,
        billingCycle: billingCycle || 'monthly',
        status: 'active',
        payfastPaymentId: paymentId || mPaymentId || null,
        currentPeriodStart: periodStartIso,
        currentPeriodEnd: periodEndIso,
        updatedAt: periodStartIso
      }
    }, { merge: true });

    await db.collection('landlords').doc(landlordId).collection('billing').doc('payments').collection('history').add({
      paymentId: paymentId || mPaymentId,
      mPaymentId,
      plan: planKey,
      billingCycle: billingCycle || 'monthly',
      amount,
      currency: 'ZAR',
      status: 'paid',
      paidAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      description: `NestIQ ${planKey} — ${billingCycle || 'monthly'}`,
      source: 'payfast_itn'
    });

    if (mPaymentId) {
      try {
        await db.collection('landlords').doc(landlordId).collection('billing').doc('pending').collection('records').doc(mPaymentId).set({
          status: 'completed',
          completedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
          plan: planKey,
          billingCycle: billingCycle || 'monthly',
          amount,
          pf_payment_id: paymentId || null
        }, { merge: true });
      } catch (_e) { /* ignore */ }
    }

    await db.collection('adminActivity').add({
      action: 'payment_received',
      targetId: landlordId,
      amount,
      plan: planKey,
      billingCycle: billingCycle || 'monthly',
      timestamp: getAdmin().firestore.FieldValue.serverTimestamp(),
    });

    const ctx = await getLandlordEmailContext(db, landlordId);
    await sendSequenceEmail(landlordId, 'paymentSuccess', {
      to_name: ctx.firstName,
      to_email: ctx.landlordEmail,
      amount: `R${amount.toFixed(2)}`,
      plan: planKey,
      billing_cycle: billingCycle || 'monthly',
      next_billing_date: new Date(periodEndIso).toLocaleDateString('en-ZA'),
      invoice_url: APP_BASE + 'billing.html'
    }, db);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('PayFast webhook error:', err);
    return res.status(500).send('Error');
  }
});

exports.submitPropertyReview = functions.region('us-central1').https.onCall(async (data, context) => {
  const { handleSubmitPropertyReview } = require('./submit-review');
  return handleSubmitPropertyReview(data, context);
});

exports.submitProductReview = functions.region('us-central1').https.onCall(async (data, context) => {
  const { handleSubmitProductReview } = require('./submit-product-review');
  return handleSubmitProductReview(data, context);
});

// Lazy-load scheduled emails so PayFast webhook deploy discovery stays fast.
Object.defineProperty(exports, 'checkTrialEmails', {
  enumerable: true,
  configurable: true,
  get() {
    return require('./emailScheduler').checkTrialEmails;
  }
});
