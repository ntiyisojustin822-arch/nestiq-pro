/**
 * Replace placeholders with your Firebase project values (Project settings → General).
 * Landlords and tenants sign up via Firebase Authentication in the app.
 * NESTIQ_LANDLORD_EMAIL is optional: legacy fallback to treat one email as landlord if no users/{uid} doc.
 */
window.NESTIQ_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDoUFyF7N4Dambzrzp2STB6GZYxX5fgI7E',
  authDomain: 'nestiq-pro.firebaseapp.com',
  projectId: 'nestiq-pro',
  storageBucket: 'nestiq-pro.firebasestorage.app',
  messagingSenderId: '375703486251',
  appId: '1:375703486251:web:75c6bb4a11b82bb2f70f6e'
};

/** Optional legacy single-landlord email (leave '' when using multi-landlord sign-up only). */
window.NESTIQ_LANDLORD_EMAIL = '';

/**
 * When true (default), new landlords must click the link in their inbox before the app loads data.
 * Set to false only for local/testing — keep true in production.
 */
window.NESTIQ_REQUIRE_LANDLORD_EMAIL_VERIFICATION = true;

/**
 * If Firestore returns "permission-denied" even with open rules, Firebase Console →
 * App Check → Firestore is likely set to "Enforced". Turn it off until you add App Check
 * (reCAPTCHA v3) to this web app, or set window.NESTIQ_RECAPTCHA_SITE_KEY and enable
 * firebase-app-check-compat in index.html per Firebase docs.
 */
window.NESTIQ_RECAPTCHA_SITE_KEY = '';

/**
 * Optional: URL users land on after clicking "verify email". The URL’s domain must be in Firebase Console →
 * Authentication → Settings → Authorized domains.
 * Leave '' (default): verification email sends without a custom continue URL — avoids auth/unauthorized-continue-uri
 * when you open the app from a host that is not allowlisted (e.g. LAN IP, preview URL).
 */
window.NESTIQ_EMAIL_ACTION_CONTINUE_URL = '';

/**
 * Live NestIQ site used for PayFast return/cancel URLs (must end with /).
 * Do NOT use localhost here — PayFast must redirect to Firebase Hosting.
 * Example: https://nestiq-pro.web.app/
 */
window.NESTIQ_APP_BASE_URL = 'https://nestiq-pro.web.app/';

/** PayFast ITN URL — Cloud Function (set after `firebase deploy --only functions`). */
window.NESTIQ_PAYFAST_ITN_URL = 'https://us-central1-nestiq-pro.cloudfunctions.net/payfastWebhook';

/** PayFast ITN for tenant rent payments. */
window.NESTIQ_PAYFAST_RENT_ITN_URL = 'https://us-central1-nestiq-pro.cloudfunctions.net/payfastRentWebhook';

/** Support ticket notifications to platform admin */
window.NESTIQ_SUPPORT_ADMIN_EMAIL = 'admin@nestiq.co.za';
