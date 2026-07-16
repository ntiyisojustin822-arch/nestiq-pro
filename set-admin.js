/**
 * One-time Admin SDK script: sets Firebase Auth custom claim { role: 'landlord' }.
 *
 * Setup:
 * 1. Firebase Console → Project settings → Service accounts → Generate new private key
 * 2. Save as serviceAccountKey.json in this folder (nestiq-pro)
 * 3. npm install
 * 4. Landlord UID: Authentication → Users → copy UID for your landlord account
 * 5. node set-admin.js
 *
 * Note: NestIQ Pro’s web app resolves landlord/tenant via Firestore users/{uid} and
 * NESTIQ_LANDLORD_EMAIL — it does not read custom claims. Use this script if you want
 * request.auth.token.role in Firestore/Storage rules, or for other server-side checks.
 */

const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Paste your landlord UID (Firebase Console → Authentication → Users)
const LANDLORD_UID = 'paste-your-landlord-uid-here';

async function run() {
  if (!LANDLORD_UID || LANDLORD_UID === 'paste-your-landlord-uid-here') {
    console.error('Set LANDLORD_UID in set-admin.js to your landlord user’s UID.');
    process.exit(1);
  }

  await admin.auth().setCustomUserClaims(LANDLORD_UID, { role: 'landlord' });
  console.log('✅ Landlord role set');

  const user = await admin.auth().getUser(LANDLORD_UID);
  console.log('Claims:', user.customClaims);

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
