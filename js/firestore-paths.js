/* Landlord-scoped Firestore path helpers (load before firebase-db.js). */
(function(){
  function resolveLandlordId(explicit){
    if(explicit != null && String(explicit).trim() !== '') return String(explicit).trim();
    if(typeof window.nestiqGetLandlordUid === 'function'){
      const g = window.nestiqGetLandlordUid();
      if(g) return String(g);
    }
    if(typeof window.nestiqCurrentLandlordUid === 'function'){
      const u = window.nestiqCurrentLandlordUid();
      if(u) return String(u);
    }
    if(typeof window.nestiqCurrentLandlordUid === 'string' && window.nestiqCurrentLandlordUid){
      return String(window.nestiqCurrentLandlordUid);
    }
    const ts = window.nestiqTenantSession;
    if(ts && ts.landlordId) return String(ts.landlordId);
    const sess = window.__nestiqSession;
    if(sess){
      if(sess.role === 'landlord' && sess.uid) return String(sess.uid);
      if(sess.landlordId) return String(sess.landlordId);
    }
    try{
      if(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser){
        return String(firebase.auth().currentUser.uid);
      }
    }catch(_e){}
    return null;
  }

  function landlordRef(db, landlordId){
    const lid = resolveLandlordId(landlordId);
    if(!db || !lid) return null;
    return db.collection('landlords').doc(lid);
  }

  function col(db, name, landlordId){
    const ref = landlordRef(db, landlordId);
    return ref ? ref.collection(name) : null;
  }

  window.nestiqFs = {
    resolveLandlordId,
    landlordRef,
    col,
    settingsRef(db, landlordId){
      const ref = landlordRef(db, landlordId);
      return ref ? ref.collection('profile').doc('settings') : null;
    },
    legacySettingsRef(db, landlordId){
      const lid = resolveLandlordId(landlordId);
      return db && lid ? db.collection('settings').doc('landlord-' + lid) : null;
    },
    properties(db, lid){ return col(db, 'properties', lid); },
    tenants(db, lid){ return col(db, 'tenants', lid); },
    applications(db, lid){ return col(db, 'applications', lid); },
    maintenance(db, lid){ return col(db, 'maintenance', lid); },
    expenses(db, lid){ return col(db, 'expenses', lid); },
    notices(db, lid){ return col(db, 'notices', lid); },
    invitations(db, lid){ return col(db, 'invitations', lid); },
    documents(db, lid){ return col(db, 'documents', lid); },
    payments(db, lid){ return col(db, 'payments', lid); },
    messages(db, lid){ return col(db, 'messages', lid); },
    recurringExpenses(db, lid){ return col(db, 'recurringExpenses', lid); },
    communications(db, lid){ return col(db, 'communications', lid); },
    reconciliations(db, lid){ return col(db, 'reconciliations', lid); },
    publicApplications(db){
      return db ? db.collection('applications') : null;
    },
    invitationLookup(db, code){
      return db && code ? db.collection('invitationLookup').doc(String(code).toUpperCase().trim()) : null;
    },
    tenantAccount(db, tenantUid){
      return db && tenantUid ? db.collection('tenantAccounts').doc(String(tenantUid)) : null;
    }
  };

  window.nestiqGetLandlordUid = resolveLandlordId;
})();
