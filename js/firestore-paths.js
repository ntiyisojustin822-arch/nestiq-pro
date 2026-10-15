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
    /** Landlord-scoped units collection: landlords/{lid}/units/{unitId} */
    units(db, lid){ return col(db, 'units', lid); },
    tenants(db, lid){ return col(db, 'tenants', lid); },
    leases(db, lid){ return col(db, 'leases', lid); },
    applications(db, lid){ return col(db, 'applications', lid); },
    maintenance(db, lid){ return col(db, 'maintenance', lid); },
    expenses(db, lid){ return col(db, 'expenses', lid); },
    notices(db, lid){ return col(db, 'notices', lid); },
    invitations(db, lid){ return col(db, 'invitations', lid); },
    documents(db, lid){ return col(db, 'documents', lid); },
    payments(db, lid){ return col(db, 'payments', lid); },
    pendingPayments(db, lid){ return col(db, 'pendingPayments', lid); },
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
    tenantPortalLink(db, email){
      const key=String(email||'').trim().toLowerCase();
      return db && key ? db.collection('tenantPortalLinks').doc(key) : null;
    },
    tenantAccount(db, tenantUid){
      return db && tenantUid ? db.collection('tenantAccounts').doc(String(tenantUid)) : null;
    },
    staff(db, lid){ return col(db, 'staff', lid); },
    staffInvitations(db, lid){ return col(db, 'staffInvitations', lid); },
    staffInvitationLookup(db, code){
      return db && code ? db.collection('staffInvitationLookup').doc(String(code).toUpperCase().trim()) : null;
    },
    staffAccount(db, staffUid){
      return db && staffUid ? db.collection('staffAccounts').doc(String(staffUid)) : null;
    },
    caretakerProperties(db, lid){ return col(db, 'caretakerProperties', lid); },
    caretakerUnits(db, lid){ return col(db, 'caretakerUnits', lid); },
    caretakerTenants(db, lid){ return col(db, 'caretakerTenants', lid); },
    inspections(db, lid){ return col(db, 'inspections', lid); },
    contractorInvitations(db, lid){ return col(db, 'contractorInvitations', lid); },
    contractorInvitationLookup(db, code){
      return db && code ? db.collection('contractorInvitationLookup').doc(String(code).toUpperCase().trim()) : null;
    },
    contractorAccount(db, contractorUid){
      return db && contractorUid ? db.collection('contractorAccounts').doc(String(contractorUid)) : null;
    },
    vendors(db, lid){ return col(db, 'vendors', lid); },
    productReviews(db){ return db ? db.collection('productReviews') : null; }
  };

  window.nestiqGetLandlordUid = resolveLandlordId;
})();
