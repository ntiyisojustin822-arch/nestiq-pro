const functions = require('firebase-functions');
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

function publicLandlordReviewName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Landlord';
  const first = parts[0];
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1];
  const initial = String(last.charAt(0) || '').toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

function reviewInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'LL';
  if (parts.length === 1) return String(parts[0].slice(0, 2) || 'L').toUpperCase();
  return (String(parts[0].charAt(0)) + String(parts[parts.length - 1].charAt(0))).toUpperCase();
}

async function resolveLandlordProfile(db, uid, authName) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const landlordRoot = await db.collection('landlords').doc(uid).get();
  const isLandlord = String(user.role || '') === 'landlord' || landlordRoot.exists;
  if (!isLandlord) return null;
  const settingsSnap = await db.collection('landlords').doc(uid)
    .collection('profile').doc('settings').get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const nested = settings.landlordSettings && typeof settings.landlordSettings === 'object'
    ? settings.landlordSettings : {};
  const profileBits = [settings.profile?.firstName, settings.profile?.lastName].filter(Boolean).join(' ');
  const name = String(
    settings.name
    || nested.name
    || profileBits
    || user.name
    || authName
    || ''
  ).trim();
  return { name, cityHint: String(settings.marketContext?.city || nested.city || '').trim() };
}

exports.handleSubmitProductReview = async (data, context) => {
  try {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in as a landlord to publish a review.');
    }
    const uid = context.auth.uid;
    const published = data?.published !== false;
    const db = getAdmin().firestore();
    const profile = await resolveLandlordProfile(db, uid, context.auth.token?.name || '');
    if (!profile) {
      throw new functions.https.HttpsError('permission-denied', 'Only landlords can publish a NestIQ review.');
    }

    const fv = getAdmin().firestore.FieldValue;
    const now = fv.serverTimestamp();
    const ref = db.collection('productReviews').doc(uid);

    if (!published) {
      const existing = await ref.get();
      if (!existing.exists) {
        throw new functions.https.HttpsError('not-found', 'No review to remove.');
      }
      await ref.set({ published: false, updatedAt: now }, { merge: true });
      return { ok: true, published: false, reviewId: uid };
    }

    const ratingRaw = Number(data?.rating);
    const rating = Number.isInteger(ratingRaw) ? ratingRaw : Math.round(ratingRaw);
    const body = String(data?.body == null ? '' : data.body).trim().slice(0, 400);
    const city = String(data?.city == null ? '' : data.city).trim().slice(0, 40);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Rating must be a whole number from 1 to 5.');
    }
    if (body.length < 20) {
      throw new functions.https.HttpsError('invalid-argument', 'Write at least 20 characters so visitors can see a real testimonial.');
    }
    if (!city) {
      throw new functions.https.HttpsError('invalid-argument', 'Add your city so the review matches the landing page cards.');
    }

    const displayName = publicLandlordReviewName(profile.name);
    const initials = reviewInitials(profile.name);
    const existing = await ref.get();
    const payload = {
      kind: 'product',
      landlordId: uid,
      displayName,
      initials,
      city,
      rating,
      body,
      published: true,
      updatedAt: now
    };
    if (existing.exists) {
      await ref.set(payload, { merge: true });
    } else {
      await ref.set({ ...payload, createdAt: now });
    }

    return {
      ok: true,
      published: true,
      reviewId: uid,
      displayName,
      initials,
      city,
      rating,
      body
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[submitProductReview]', err);
    throw new functions.https.HttpsError('internal', 'Could not save the review. Please try again.');
  }
};
