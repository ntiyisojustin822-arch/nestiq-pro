const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendSequenceEmail, APP_BASE } = require('./emailSequences-server');

if (!admin.apps.length) {
  admin.initializeApp();
}

const { checkTrialEmails } = require('./emailScheduler');
exports.checkTrialEmails = checkTrialEmails;

function getDatePlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return admin.firestore.Timestamp.fromDate(d);
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
    timestamp: admin.firestore.FieldValue.serverTimestamp()
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

exports.payfastWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const data = req.body || {};
    const db = admin.firestore();

    if (data.payment_status !== 'COMPLETE') {
      await logFailedPayment(data, db);
      return res.status(200).send('OK');
    }

    const landlordId = data.custom_str1;
    const planKey = data.custom_str2;
    const billingCycle = data.custom_str3;
    const amount = parseFloat(data.amount_gross || '0');
    const paymentId = data.pf_payment_id;
    const mPaymentId = data.m_payment_id;

    if (!landlordId || !planKey) {
      return res.status(400).send('Missing metadata');
    }

    const periodEnd = getDatePlusMonths(billingCycle === 'annual' ? 12 : 1);
    const periodEndDate = periodEnd.toDate();

    await db.collection('landlords').doc(landlordId).collection('profile').doc('settings').set({
      billing: {
        plan: planKey,
        billingCycle: billingCycle || 'monthly',
        status: 'active',
        payfastPaymentId: paymentId || null,
        currentPeriodStart: admin.firestore.FieldValue.serverTimestamp(),
        currentPeriodEnd: periodEnd,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      description: `NestIQ ${planKey} — ${billingCycle || 'monthly'}`
    });

    if (mPaymentId) {
      try {
        await db.collection('landlords').doc(landlordId).collection('billing').doc('pending').collection('records').doc(mPaymentId).delete();
      } catch (_e) { /* ignore */ }
    }

    await db.collection('adminActivity').add({
      action: 'payment_received',
      targetId: landlordId,
      amount,
      plan: planKey,
      billingCycle: billingCycle || 'monthly',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    const ctx = await getLandlordEmailContext(db, landlordId);
    await sendSequenceEmail(landlordId, 'paymentSuccess', {
      to_name: ctx.firstName,
      to_email: ctx.landlordEmail,
      amount: `R${amount.toFixed(2)}`,
      plan: planKey,
      billing_cycle: billingCycle || 'monthly',
      next_billing_date: periodEndDate.toLocaleDateString('en-ZA'),
      invoice_url: APP_BASE + 'billing.html'
    }, db);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('PayFast webhook error:', err);
    return res.status(500).send('Error');
  }
});

exports.checkTrialEmails = checkTrialEmails;
