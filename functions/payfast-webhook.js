const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

function getDatePlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return admin.firestore.Timestamp.fromDate(d);
}

async function logFailedPayment(data) {
  const db = admin.firestore();
  await db.collection('adminActivity').add({
    action: 'payment_failed',
    targetId: data.custom_str1 || '',
    amount: data.amount_gross || '',
    plan: data.custom_str2 || '',
    reason: data.payment_status || 'unknown',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function payfastWebhookHandler(req, res) {
  try {
    const data = req.body || {};
    if (data.payment_status !== 'COMPLETE') {
      await logFailedPayment(data);
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

    const db = admin.firestore();

    await db.collection('landlords').doc(landlordId).collection('profile').doc('settings').set({
      billing: {
        plan: planKey,
        billingCycle: billingCycle || 'monthly',
        status: 'active',
        payfastPaymentId: paymentId || null,
        currentPeriodStart: admin.firestore.FieldValue.serverTimestamp(),
        currentPeriodEnd: getDatePlusMonths(billingCycle === 'annual' ? 12 : 1),
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

    return res.status(200).send('OK');
  } catch (err) {
    console.error('PayFast webhook error:', err);
    return res.status(500).send('Error');
  }
}

module.exports = { payfastWebhookHandler, getDatePlusMonths, logFailedPayment };
