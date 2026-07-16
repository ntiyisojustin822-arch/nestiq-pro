# Firebase setup checklist (NestIQ Pro)

## Deploy rules and indexes

From the `nestiq-pro` folder (with Firebase CLI installed and logged in):

```bash
firebase deploy --only firestore:rules
```

Deploy composite indexes only if the Firebase console shows an index error for a specific query; then add the suggested index to `firestore.indexes.json` and run:

```bash
firebase deploy --only firestore:indexes
```

Most landlord queries use a single `where('landlordId', '==', uid)` and do not need a composite index file entry.

## Authorized domains

In Firebase Console → Authentication → Settings → Authorized domains, add every host where the app runs (for example `localhost`, your production domain, and Firebase Hosting default domain).

## Email verification and password reset

In Authentication → Templates, configure the action URL if you use a custom domain or path. For “verify before update email”, users must complete the link sent to the **new** address before Auth switches the email.

## Legacy data: `landlordId`

If documents were created before multi-landlord scoping, run a **dry run** first, then apply:

```bash
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
npm run migrate:landlord-id -- --landlord=YOUR_FIREBASE_AUTH_UID
npm run migrate:landlord-id -- --landlord=YOUR_FIREBASE_AUTH_UID --apply
```

Use the landlord’s Firebase Auth **UID** (same as `request.auth.uid` when they sign in). Subcollections such as `tenants/{id}/payments` are not listed here; they inherit access via the parent tenant document.

## Service worker cache

After changing `sw.js`, bump the cache name or redeploy hosting so clients pick up new script versions.
