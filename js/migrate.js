/* One-time migration: flat collections → landlords/{landlordId}/… */

async function nestiqMigrateToScopedCollections(){
  const db = window.nestiqDb;
  const Fs = window.nestiqFs;
  if(!db || !Fs){
    window.showNotif?.('Firebase is not initialized.', 'error');
    return;
  }
  const uid = typeof window.nestiqCurrentLandlordUid === 'function'
    ? window.nestiqCurrentLandlordUid()
    : (window.nestiqGetLandlordUid?.() || null);
  if(!uid){
    window.showNotif?.('Sign in as a landlord before running migration.', 'error');
    return;
  }
  if(!confirm('Migrate all flat Firestore data into landlord-scoped collections? This deletes originals after each successful copy. Continue?')){
    return;
  }

  const flatCollections = [
    { name: 'properties', target: 'properties' },
    { name: 'tenants', target: 'tenants' },
    { name: 'applications', target: 'applications' },
    { name: 'maintenance', target: 'maintenance' },
    { name: 'maintenanceRequests', target: 'maintenance' },
    { name: 'expenses', target: 'expenses' },
    { name: 'notices', target: 'notices' },
    { name: 'invitations', target: 'invitations' },
    { name: 'payments', target: 'payments' },
    { name: 'tenantDocuments', target: 'documents' },
    { name: 'messages', target: 'messages' },
    { name: 'recurringExpenses', target: 'recurringExpenses' },
    { name: 'communications', target: 'communications' },
    { name: 'reconciliations', target: 'reconciliations' }
  ];

  let total = 0;
  for(const spec of flatCollections){
    let snap;
    try{
      snap = await db.collection(spec.name).get();
    }catch(e){
      console.warn('NestIQ migrate: skip', spec.name, e);
      continue;
    }
    const byLandlord = new Map();
    snap.docs.forEach(doc => {
      const d = doc.data();
      const lid = String(d.landlordId || d.listingLandlordId || uid).trim();
      if(!lid) return;
      if(!byLandlord.has(lid)) byLandlord.set(lid, []);
      byLandlord.get(lid).push({ id: doc.id, data: d, ref: doc.ref });
    });

    for(const [lid, rows] of byLandlord){
      const dest = Fs.col(db, spec.target, lid);
      if(!dest) continue;
      let n = 0;
      for(const row of rows){
        try{
          const payload = { ...row.data, landlordId: lid };
          if(spec.target === 'payments' && !payload.tenantUid && payload.portalUid){
            payload.tenantUid = payload.portalUid;
          }
          await dest.doc(String(row.id)).set(payload, { merge: true });
          await row.ref.delete();
          n++;
          total++;
        }catch(e){
          console.warn('NestIQ migrate doc failed', spec.name, row.id, e);
        }
      }
      if(n) console.log('Migrated ' + n + ' documents to landlords/' + lid + '/' + spec.target);
    }
  }

  try{
    const legacy = await db.collection('settings').doc('landlord-' + uid).get();
    if(legacy.exists){
      const sref = Fs.settingsRef(db, uid);
      await sref.set(legacy.data(), { merge: true });
      await legacy.ref.delete();
      console.log('Migrated settings to landlords/' + uid + '/profile/settings');
    }
  }catch(e){
    console.warn('NestIQ migrate settings', e);
  }

  try{
    const invSnap = await db.collection('invitations').get();
    for(const doc of invSnap.docs){
      const d = doc.data();
      const code = String(d.code || doc.id).toUpperCase().trim();
      const lid = String(d.landlordId || uid).trim();
      if(!code || !lid) continue;
      await Fs.invitations(db, lid).doc(code).set(d, { merge: true });
      await Fs.invitationLookup(db, code).set({
        landlordId: lid,
        tenantId: d.tenantId != null ? String(d.tenantId) : '',
        propertyId: d.propertyId != null ? String(d.propertyId) : '',
        status: String(d.status || 'pending'),
        expiresAt: d.expiresAt || null
      }, { merge: true });
      await doc.ref.delete();
    }
  }catch(e){
    console.warn('NestIQ migrate invitation lookup', e);
  }

  window.showNotif?.('Migration complete. All data has been moved to secure landlord-scoped collections.', 'success');
}

function nestiqInitDeveloperMigrationSection(){
  const host = document.getElementById('nestiqDeveloperSection');
  if(!host) return;
  const hn = window.location.hostname;
  const local = hn === 'localhost' || hn === '127.0.0.1';
  host.style.display = local ? '' : 'none';
}

window.nestiqMigrateToScopedCollections = nestiqMigrateToScopedCollections;
window.nestiqInitDeveloperMigrationSection = nestiqInitDeveloperMigrationSection;
