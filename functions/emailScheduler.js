const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendSequenceEmail, APP_BASE } = require('./emailSequences-server');

if (!admin.apps.length) {
  admin.initializeApp();
}

function profileFirstName(data) {
  return data?.profile?.firstName ||
    String(data?.name || 'Landlord').split(/\s+/)[0] ||
    'Landlord';
}

function profileEmail(data) {
  return data?.profile?.email || data?.email || data?.landlordSettings?.email || '';
}

async function runScheduledEmails() {
  const db = admin.firestore();
  const now = new Date();
  const landlords = await db.collection('landlords').get();

  for (const doc of landlords.docs) {
    const landlordId = doc.id;
    const settingsRef = doc.ref.collection('profile').doc('settings');
    const settings = await settingsRef.get();
    if (!settings.exists) continue;
    const data = settings.data();

    /* ── Trial sequence ── */
    if (data.billing && data.billing.status === 'trial' && data.billing.trialEnds) {
      const trialEndDate = new Date(data.billing.trialEnds);
      const daysRemaining = Math.ceil((trialEndDate - now) / 86400000);
      const emailLogs = await doc.ref.collection('emailLogs')
        .where('sequenceKey', 'in', ['trialDay3', 'trialDay10', 'trialDay13', 'trialExpired'])
        .get();
      const sentKeys = new Set(emailLogs.docs.map((d) => d.data().sequenceKey));

      const templateParams = {
        to_name: profileFirstName(data),
        to_email: profileEmail(data),
        days_remaining: String(Math.max(0, daysRemaining)),
        trial_end_date: trialEndDate.toDateString(),
        upgrade_url: APP_BASE + 'billing.html',
        dashboard_url: APP_BASE + 'index.html'
      };

      if (daysRemaining <= 0 && !sentKeys.has('trialExpired')) {
        await sendSequenceEmail(landlordId, 'trialExpired', templateParams, db);
        await settingsRef.set({
          billing: {
            ...data.billing,
            plan: 'starter',
            status: 'expired'
          }
        }, { merge: true });
      } else if (daysRemaining <= 1 && !sentKeys.has('trialDay13')) {
        await sendSequenceEmail(landlordId, 'trialDay13', templateParams, db);
      } else if (daysRemaining <= 4 && !sentKeys.has('trialDay10')) {
        await sendSequenceEmail(landlordId, 'trialDay10', templateParams, db);
      } else if (daysRemaining <= 11 && !sentKeys.has('trialDay3')) {
        await sendSequenceEmail(landlordId, 'trialDay3', templateParams, db);
      }
    }

    /* ── Lease expiry (30 days) ── */
    const properties = await doc.ref.collection('properties').get();
    for (const prop of properties.docs) {
      const p = prop.data();
      const leaseRaw = p.leaseEnd || p.lease_end;
      if (!leaseRaw || leaseRaw === 'Available' || leaseRaw === 'See tenant') continue;
      const leaseEnd = new Date(leaseRaw);
      if (Number.isNaN(leaseEnd.getTime())) continue;
      const daysToExpiry = Math.ceil((leaseEnd - now) / 86400000);
      if (daysToExpiry !== 30) continue;
      await sendSequenceEmail(landlordId, 'leaseExpiryAlert', {
        to_name: profileFirstName(data),
        to_email: profileEmail(data),
        property_name: p.name || 'Property',
        property_address: p.addr || p.address || '',
        lease_end_date: leaseEnd.toDateString(),
        tenant_name: p.tenantName || 'your tenant',
        dashboard_url: APP_BASE + 'index.html#tenants'
      }, db, { propertyId: prop.id });
    }

    /* ── Rent overdue ── */
    const tenants = await doc.ref.collection('tenants').get();
    for (const tenant of tenants.docs) {
      const t = tenant.data();
      if (String(t.status || '').toLowerCase() !== 'overdue') continue;
      const lastAlertSent = t.lastOverdueAlertSent ? new Date(t.lastOverdueAlertSent) : null;
      const hoursSince = lastAlertSent ? (now - lastAlertSent) / 3600000 : 999;
      if (hoursSince < 24) continue;

      const phone = String(t.phone || '').replace(/\D/g, '');
      await sendSequenceEmail(landlordId, 'rentOverdueAlert', {
        to_name: profileFirstName(data),
        to_email: profileEmail(data),
        tenant_name: t.name || 'Tenant',
        property_name: t.property || 'Property',
        amount_due: `R${Number(t.rent || 0).toLocaleString('en-ZA')}`,
        days_overdue: String(t.daysOverdue || 1),
        whatsapp_url: phone ? `https://wa.me/${phone}` : '',
        dashboard_url: APP_BASE + 'index.html#tenants'
      }, db, { tenantId: tenant.id });

      await tenant.ref.update({ lastOverdueAlertSent: now.toISOString() });
    }

    /* ── Win-back (30 days inactive) ── */
    const lastActive = data.lastActive ? new Date(data.lastActive) : null;
    if (lastActive) {
      const daysSinceActive = Math.ceil((now - lastActive) / 86400000);
      if (daysSinceActive >= 30 && !data.winbackEmailSent) {
        await sendSequenceEmail(landlordId, 'winback', {
          to_name: profileFirstName(data),
          to_email: profileEmail(data),
          dashboard_url: APP_BASE + 'index.html',
          support_email: 'support@nestiq.co.za'
        }, db);
        await settingsRef.set({ winbackEmailSent: true }, { merge: true });
      }
    }
  }

  return null;
}

const checkTrialEmails = functions.pubsub
  .schedule('0 6 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    try {
      await runScheduledEmails();
    } catch (err) {
      console.error('checkTrialEmails failed', err);
    }
    return null;
  });

module.exports = { checkTrialEmails, runScheduledEmails };
