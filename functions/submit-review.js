const functions = require('firebase-functions');
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

function publicTenantReviewName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Tenant';
  const first = parts[0];
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1];
  const initial = String(last.charAt(0) || '').toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

function tenantDocMatchesCaller(data, uid, propertyId, email) {
  if (!data || !uid) return false;
  const pid = String(data.propertyId == null ? '' : data.propertyId).trim();
  if (pid !== String(propertyId) && pid !== String(Number(propertyId))) return false;
  const caller = String(uid);
  const linked = String(data.tenantUid || data.portalUid || data.tenantId || '').trim();
  if (linked && linked === caller) return true;
  const docEmail = String(data.email || data.tenantEmail || '').trim().toLowerCase();
  const callerEmail = String(email || '').trim().toLowerCase();
  if (callerEmail && docEmail && docEmail === callerEmail) return true;
  return false;
}

async function findVerifiedTenancy(db, uid, propertyId, email) {
  const pid = String(propertyId || '').trim();
  if (!pid) return null;

  const tryGroup = async (field, value) => {
    try {
      const snap = await db.collectionGroup('tenants')
        .where(field, '==', value)
        .where('propertyId', '==', pid)
        .limit(5)
        .get();
      const hit = snap.docs.find((doc) => tenantDocMatchesCaller(doc.data() || {}, uid, pid, email));
      if (hit) return hit;
    } catch (err) {
      console.warn('[submitPropertyReview] collectionGroup query failed', field, err?.message || err);
    }
    if (/^\d+$/.test(pid)) {
      try {
        const snap = await db.collectionGroup('tenants')
          .where(field, '==', value)
          .where('propertyId', '==', Number(pid))
          .limit(5)
          .get();
        const hit = snap.docs.find((doc) => tenantDocMatchesCaller(doc.data() || {}, uid, pid, email));
        if (hit) return hit;
      } catch (_e) { /* index or type mismatch */ }
    }
    return null;
  };

  const byTenantUid = await tryGroup('tenantUid', uid);
  if (byTenantUid) return byTenantUid;
  const byPortalUid = await tryGroup('portalUid', uid);
  if (byPortalUid) return byPortalUid;

  const acctSnap = await db.collection('tenantAccounts').doc(uid).get();
  const acct = acctSnap.exists ? (acctSnap.data() || {}) : {};
  const lid = String(acct.landlordId || '').trim();
  if (!lid) return null;

  const col = db.collection('landlords').doc(lid).collection('tenants');
  const scan = async (field, value) => {
    if (value == null || value === '') return null;
    try {
      const snap = await col.where(field, '==', value).limit(25).get();
      return snap.docs.find((doc) => tenantDocMatchesCaller(doc.data() || {}, uid, pid, email)) || null;
    } catch (_e) {
      return null;
    }
  };
  const byUid = (await scan('tenantUid', uid)) || (await scan('portalUid', uid));
  if (byUid) return byUid;
  const acctPid = String(acct.propertyId == null ? '' : acct.propertyId).trim();
  const acctTid = String(acct.tenantId || '').trim();
  if (acctTid && (acctPid === pid || !acctPid)) {
    const tenantDoc = await col.doc(acctTid).get();
    if (tenantDoc.exists && tenantDocMatchesCaller(tenantDoc.data() || {}, uid, pid, email)) {
      return tenantDoc;
    }
    if (tenantDoc.exists && String(tenantDoc.data()?.propertyId || '') === pid) {
      return tenantDoc;
    }
  }
  if (email) {
    const byEmail = await scan('email', email);
    if (byEmail) return byEmail;
  }
  return null;
}

function landlordIdFromTenantDoc(doc) {
  const fromField = String(doc.data()?.landlordId || '').trim();
  if (fromField) return fromField;
  try {
    return String(doc.ref.parent.parent.id || '');
  } catch (_e) {
    return '';
  }
}

function usableProfilePhoto(url) {
  const s = String(url == null ? '' : url).trim();
  if (s.startsWith('data:') || s.startsWith('http')) return s;
  return '';
}

exports.handleSubmitPropertyReview = async (data, context) => {
  try {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in with your tenant account to write a review.');
    }
    const uid = context.auth.uid;
    const email = String(context.auth.token?.email || '').trim();
    const propertyId = String(data?.propertyId || '').trim();
    const ratingRaw = Number(data?.rating);
    const rating = Number.isInteger(ratingRaw) ? ratingRaw : Math.round(ratingRaw);
    const body = String(data?.body == null ? '' : data.body).trim().slice(0, 2000);
    const showPhoto = data?.showPhoto === true;

    if (!propertyId) {
      throw new functions.https.HttpsError('invalid-argument', 'A property is required.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Rating must be a whole number from 1 to 5.');
    }

    const db = getAdmin().firestore();
    const tenancy = await findVerifiedTenancy(db, uid, propertyId, email);
    if (!tenancy) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'No verified tenancy found for this property. Only current or past tenants can write a review.'
      );
    }

    const tenant = tenancy.data() || {};
    const landlordId = landlordIdFromTenantDoc(tenancy);
    if (!landlordId) {
      throw new functions.https.HttpsError('failed-precondition', 'Could not resolve the landlord for this tenancy.');
    }

    const reviewId = `${landlordId}_${propertyId}_${uid}`.replace(/\//g, '_');
    const ref = db.collection('reviews').doc(reviewId);
    const existing = await ref.get();
    const fv = getAdmin().firestore.FieldValue;
    const now = fv.serverTimestamp();
    const snapshot = showPhoto ? usableProfilePhoto(tenant.profilePhoto || tenant.photoUrl || tenant.photoURL || '') : '';
    if (snapshot && snapshot.length > 900000) {
      throw new functions.https.HttpsError('invalid-argument', 'Choose a smaller profile photo, or publish without a photo.');
    }
    const payload = {
      landlordId,
      propertyId: String(propertyId),
      tenantUid: uid,
      tenantName: publicTenantReviewName(tenant.name || tenant.tenantName || ''),
      rating,
      body,
      showPhoto,
      updatedAt: now
    };
    if (snapshot) payload.photoUrlSnapshot = snapshot;
    if (existing.exists) {
      const patch = { ...payload };
      if (!snapshot) patch.photoUrlSnapshot = fv.delete();
      await ref.set(patch, { merge: true });
    } else {
      await ref.set({ ...payload, createdAt: now });
    }

    return {
      ok: true,
      reviewId,
      tenantName: payload.tenantName,
      rating,
      body,
      showPhoto,
      photoUrlSnapshot: snapshot || null
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[submitPropertyReview]', err);
    throw new functions.https.HttpsError('internal', 'Could not save the review. Please try again.');
  }
};
