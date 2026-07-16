/**
 * One-time Admin SDK migration: set landlordId on legacy top-level documents.
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS points to a service account JSON with Firestore access
 *   - Or run on a machine with gcloud application-default credentials for the project
 *
 * Usage:
 *   node scripts/migrate-landlord-id.mjs --landlord=<FIREBASE_AUTH_UID>     # dry-run (lists only)
 *   node scripts/migrate-landlord-id.mjs --landlord=<UID> --apply           # writes
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const apply = process.argv.includes('--apply');
const landlordArg = process.argv.find(a => a.startsWith('--landlord='));
const landlordId = landlordArg ? landlordArg.slice('--landlord='.length).trim() : '';

if (!landlordId) {
  console.error('Usage: node scripts/migrate-landlord-id.mjs --landlord=<FIREBASE_AUTH_UID> [--apply]');
  process.exit(1);
}

const COLLECTIONS = [
  'properties',
  'tenants',
  'expenses',
  'recurringExpenses',
  'communications',
  'reconciliations',
  'maintenance',
  'notices',
  'messages',
  'invitations'
];

function initAdmin() {
  if (admin.apps.length) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const raw = readFileSync(credPath, 'utf8');
    const cred = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: cred.project_id
    });
    return;
  }
  admin.initializeApp();
}

async function run() {
  initAdmin();
  const db = admin.firestore();
  let count = 0;

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      if (d.landlordId != null && String(d.landlordId).trim() !== '') continue;
      count++;
      console.log(`[${apply ? 'UPDATE' : 'dry-run'}] ${col}/${doc.id}`);
      if (apply) {
        await doc.ref.update({ landlordId });
      }
    }
  }

  console.log(apply ? `Done. Updated ${count} document(s).` : `Dry run complete. ${count} document(s) missing landlordId. Add --apply to write.`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
