/* NestIQ support tickets — shared helpers, widget, badges */
(function(){
  'use strict';

  const ADMIN_EMAIL = (window.NESTIQ_SUPPORT_ADMIN_EMAIL || 'admin@nestiq.co.za').toLowerCase();

  function ticketsCol(){
    return window.nestiqDb ? window.nestiqDb.collection('supportTickets') : null;
  }

  function generateTicketId(){
    const n = String(Math.floor(10000 + Math.random() * 90000));
    return `TKT-2026-${n}`;
  }

  async function uniqueTicketId(){
    const col = ticketsCol();
    if(!col) return generateTicketId();
    for(let i = 0; i < 8; i++){
      const id = generateTicketId();
      const snap = await col.doc(id).get();
      if(!snap.exists) return id;
    }
    return generateTicketId() + '-' + Date.now().toString(36).slice(-3);
  }

  async function loadLandlordEmailjs(landlordId){
    if(!window.nestiqDb || !landlordId) return null;
    try{
      const snap = await window.nestiqDb.collection('landlords').doc(landlordId)
        .collection('profile').doc('settings').get();
      if(!snap.exists) return null;
      const ls = snap.data().landlordSettings || {};
      return ls.emailjs || null;
    }catch(e){
      console.warn('NestIQ support emailjs load', e);
      return null;
    }
  }

  async function sendSupportEmail({ to, subject, message, emailjsConfig, landlordId }){
    let cfg = emailjsConfig;
    if(!cfg && landlordId) cfg = await loadLandlordEmailjs(landlordId);
    if(!cfg) cfg = window.landlordSettings?.emailjs;
    if(!cfg?.publicKey || !cfg?.serviceId || !window.emailjs) return false;
    const templates = cfg.templates || {};
    const templateId = templates.customMessage || templates.rentReminder || templates.welcomeTenant || templates.paymentReceipt || cfg.defaultTemplateId;
    if(!templateId) return false;
    try{
      window.emailjs.init(cfg.publicKey);
      await window.emailjs.send(cfg.serviceId, templateId, {
        to_email: to,
        to_name: to.split('@')[0],
        subject: subject || 'NestIQ Support',
        message: message || '',
        landlord_name: window.landlordSettings?.name || 'NestIQ'
      });
      return true;
    }catch(e){
      console.warn('NestIQ support email', e);
      return false;
    }
  }

  function tsToDate(ts){
    if(!ts) return null;
    if(ts.toDate) return ts.toDate();
    if(typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
    return null;
  }

  function formatDt(ts){
    const d = tsToDate(ts);
    return d ? d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  function hasUnreadAdminReply(ticket){
    const msgs = ticket.messages || [];
    if(!msgs.length) return false;
    const last = msgs[msgs.length - 1];
    return last.sender === 'admin' && !last.readByLandlord;
  }

  function priorityBadge(p){
    const x = String(p || 'medium').toLowerCase();
    if(x === 'urgent') return '<span class="sup-badge sup-badge-red">Urgent</span>';
    if(x === 'low') return '<span class="sup-badge sup-badge-gray">Low</span>';
    return '<span class="sup-badge sup-badge-amber">Medium</span>';
  }

  function statusBadge(st){
    const s = String(st || 'open').toLowerCase();
    if(s === 'in progress' || s === 'in_progress') return '<span class="sup-badge sup-badge-blue">In Progress</span>';
    if(s === 'resolved') return '<span class="sup-badge sup-badge-green">Resolved</span>';
    if(s === 'closed') return '<span class="sup-badge sup-badge-gray">Closed</span>';
    return '<span class="sup-badge sup-badge-amber"><span class="sup-open-dot nq-pulse-gold" aria-hidden="true"></span>Open</span>';
  }

  function categoryBadge(c){
    return `<span class="sup-badge sup-badge-outline">${String(c || 'Other').replace(/</g,'')}</span>`;
  }

  let __landlordUnsub = null;
  let __widgetUnsub = null;

  async function countUnreadForLandlord(uid){
    const col = ticketsCol();
    if(!col || !uid) return 0;
    try{
      const snap = await col.where('landlordId', '==', uid).get();
      let n = 0;
      snap.docs.forEach(d => {
        const t = d.data();
        if(hasUnreadAdminReply(t)) n++;
      });
      return n;
    }catch(e){
      return 0;
    }
  }

  function updateFabBadge(n){
    const b = document.getElementById('nestiqSupportFabBadge');
    if(!b) return;
    if(n > 0){
      b.textContent = n > 9 ? '9+' : String(n);
      b.style.display = 'flex';
    }else{
      b.style.display = 'none';
    }
  }

  async function refreshSupportBadge(){
    const uid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : null;
    if(!uid){ updateFabBadge(0); return; }
    const n = await countUnreadForLandlord(uid);
    updateFabBadge(n);
  }

  function playUrgentSound(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    }catch(_e){}
  }

  function injectSupportFab(){
    if(document.getElementById('nestiqSupportFab')) return;
    const wrap = document.createElement('div');
    wrap.id = 'nestiqSupportFabWrap';
    wrap.innerHTML = `
      <div id="nestiqSupportFabMenu" class="nestiq-sup-fab-menu" style="display:none">
        <a href="support.html#help-centre" target="_blank" rel="noopener">Browse Help Articles</a>
        <a href="support.html#submit" target="_blank" rel="noopener">Submit a Ticket</a>
      </div>
      <button type="button" id="nestiqSupportFab" class="nestiq-sup-fab" title="Help &amp; Support" aria-label="Help and Support">💬</button>
      <span id="nestiqSupportFabBadge" class="nestiq-sup-fab-badge" style="display:none">0</span>`;
    document.body.appendChild(wrap);
    const fab = document.getElementById('nestiqSupportFab');
    const menu = document.getElementById('nestiqSupportFabMenu');
    fab.addEventListener('click', e => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { menu.style.display = 'none'; });
    menu.addEventListener('click', e => e.stopPropagation());
  }

  function injectSupportFabStyles(){
    if(document.getElementById('nestiqSupportFabStyles')) return;
    const s = document.createElement('style');
    s.id = 'nestiqSupportFabStyles';
    s.textContent = `
      #nestiqSupportFabWrap{position:fixed;bottom:24px;right:24px;z-index:9990}
      .nestiq-sup-fab{width:56px;height:56px;border-radius:50%;background:#C46A3A;color:#fff;border:none;font-size:1.4rem;cursor:pointer;box-shadow:0 8px 24px rgba(196,106,58,.45);transition:transform .2s}
      .nestiq-sup-fab:hover{transform:scale(1.06)}
      .nestiq-sup-fab-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#dc3545;color:#fff;font-size:.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px}
      .nestiq-sup-fab-menu{position:absolute;bottom:64px;right:0;background:#fff;border:1px solid rgba(14,17,23,.12);border-radius:12px;box-shadow:0 12px 32px rgba(14,17,23,.12);min-width:200px;overflow:hidden}
      .nestiq-sup-fab-menu a{display:block;padding:12px 16px;font-size:.88rem;color:#0E1117;text-decoration:none;border-bottom:1px solid rgba(14,17,23,.06)}
      .nestiq-sup-fab-menu a:last-child{border-bottom:none}
      .nestiq-sup-fab-menu a:hover{background:#F5F0E8}
      @media(max-width:640px){#nestiqSupportFabWrap{bottom:16px;right:16px}}`;
    document.head.appendChild(s);
  }

  function startLandlordTicketListener(uid){
    if(typeof window.nestiqIsDemo==='function'&&window.nestiqIsDemo()) return;
    if(__widgetUnsub) __widgetUnsub();
    const col = ticketsCol();
    if(!col || !uid) return;
    __widgetUnsub = col.where('landlordId', '==', uid).onSnapshot(() => {
      refreshSupportBadge();
    }, e => console.warn('support listener', e));
  }

  function nestiqInitSupportWidget(){
    const sess = typeof window.getSession === 'function' ? window.getSession() : null;
    if(!sess || sess.role !== 'landlord') return;
    injectSupportFabStyles();
    injectSupportFab();
    refreshSupportBadge();
    const uid = typeof window.nestiqCurrentLandlordUid === 'function' ? window.nestiqCurrentLandlordUid() : sess.uid;
    if(uid) startLandlordTicketListener(uid);
  }

  window.nestiqSupport = {
    ADMIN_EMAIL,
    ticketsCol,
    uniqueTicketId,
    sendSupportEmail,
    tsToDate,
    formatDt,
    hasUnreadAdminReply,
    priorityBadge,
    statusBadge,
    categoryBadge,
    refreshSupportBadge,
    playUrgentSound,
    nestiqInitSupportWidget
  };
  window.nestiqGenerateTicketId = uniqueTicketId;
  window.nestiqSupportSendEmail = sendSupportEmail;
  window.nestiqRefreshSupportBadge = refreshSupportBadge;
  window.nestiqInitSupportWidget = nestiqInitSupportWidget;
})();
