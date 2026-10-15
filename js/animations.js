/* ============================================================
   NESTIQ PRO — ANIMATION ENGINE
   ============================================================ */

// ---- Scroll Reveal ----------------------------------------
let _nqRevealObserver = null;
function nestiqInitScrollReveal() {
  if (_nqRevealObserver) _nqRevealObserver.disconnect();
  _nqRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      setTimeout(() => {
        entry.target.classList.add('nq-revealed', 'revealed', 'visible');
      }, i * 55);
      _nqRevealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.10, rootMargin: '0px 0px -36px 0px' });
  document.querySelectorAll(
    '.nq-reveal, .nq-reveal-left, .nq-reveal-right, .nq-reveal-scale, .reveal, .reveal-left, .reveal-right'
  ).forEach(el => {
    if (el.classList.contains('nq-revealed') || el.classList.contains('revealed') || el.classList.contains('visible')) return;
    if (el.closest('#nestiqMarketingHome')) {
      _nqRevealObserver.observe(el);
      return;
    }
    // In-app pages: show immediately. Scroll-reveal is for the public marketing home only.
    el.classList.add('nq-revealed', 'revealed', 'visible');
  });
}

// ---- Animated Number Counter ------------------------------
function nestiqAnimateCounter(el, target, duration, prefix, suffix, from) {
  if (!el) return;
  duration = duration || 1300;
  prefix   = prefix   || '';
  suffix   = suffix   || '';
  const dest = parseFloat(target) || 0;
  const startVal = from != null && from !== '' ? (parseFloat(from) || 0) : 0;
  const isFloat = String(target).includes('.') || String(from || '').includes('.');
  const start   = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3); // cubic ease-out
    const v = startVal + (dest - startVal) * e;
    const shown = isFloat ? v.toFixed(2) : (dest >= startVal ? Math.floor(v) : Math.ceil(v));
    el.textContent = prefix + Number(shown).toLocaleString('en-ZA') + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function nestiqInitCounters() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      if (el.dataset.countDone === '1') { obs.unobserve(el); return; }
      el.dataset.countDone = '1';
      nestiqAnimateCounter(
        el,
        parseFloat(el.dataset.countTo ?? el.dataset.count),
        parseInt(el.dataset.duration || 1300, 10),
        el.dataset.prefix || '',
        el.dataset.suffix || ''
      );
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count-to]:not([data-count-done]), [data-count]:not([data-count-done])').forEach(el => obs.observe(el));
}

// ---- Smooth Stat Update -----------------------------------
function nestiqUpdateStat(el, newValue, prefix, suffix) {
  if (!el) return;
  el.classList.remove('nq-scale-bounce');
  void el.offsetWidth;
  el.classList.add('nq-scale-bounce');
  el.addEventListener('animationend', () => el.classList.remove('nq-scale-bounce'), { once: true });
  nestiqAnimateCounter(el, parseFloat(String(newValue).replace(/[^0-9.]/g, '')) || 0, 900, prefix || '', suffix || '');
}

// ---- Button Ripple ----------------------------------------
function nestiqInitRipple() {
  if (window.__nestiqRippleInit) return;
  window.__nestiqRippleInit = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest(
      '.btn-primary,.btn-gold,.btn-outline,.btn-sm,button[class*="btn"]'
    );
    if (!btn || btn.disabled) return;
    const r    = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const x    = e.clientX - r.left - size / 2;
    const y    = e.clientY - r.top  - size / 2;
    const rpl  = document.createElement('span');
    rpl.className = 'nq-ripple';
    rpl.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(rpl);
    rpl.addEventListener('animationend', () => rpl.remove());
  });
}

// ---- Page Transition --------------------------------------
function nestiqAnimatePage(pageEl) {
  if (!pageEl) return;
  pageEl.classList.add('active');
  pageEl.classList.remove('page-active');
  void pageEl.offsetWidth;
  pageEl.classList.add('page-active');
  setTimeout(() => {
    nestiqInitScrollReveal();
    nestiqInitCounters();
    nestiqStaggerPage(pageEl);
  }, 40);
}

// ---- Stagger Page Children --------------------------------
function nestiqStaggerPage(pageEl) {
  if (!pageEl) return;
  const targets = pageEl.querySelectorAll(
    '.card, .stat-card, .prop-card, .nestiq-app-card, .portal-card, .kanban-col, .vendor-card'
  );
  targets.forEach((el, i) => {
    el.style.willChange = 'transform, opacity';
    el.style.animationDelay = (i * 48) + 'ms';
    el.classList.add('nq-fade-in');
    el.addEventListener('animationend', () => {
      el.style.animationDelay = '';
      el.classList.remove('nq-fade-in');
      el.style.willChange = '';
    }, { once: true });
  });
}

function nestiqStaggerChildren(parentEl, baseDelay) {
  if (!parentEl) return;
  baseDelay = baseDelay || 48;
  Array.from(parentEl.children).forEach((child, i) => {
    child.style.willChange = 'transform, opacity';
    child.style.animationDelay = (i * baseDelay) + 'ms';
    child.classList.add('nq-fade-in');
    const clear = () => {
      child.style.animationDelay = '';
      child.classList.remove('nq-fade-in');
      child.style.willChange = '';
      child.style.opacity = '';
      child.style.transform = '';
    };
    child.addEventListener('animationend', clear, { once: true });
    setTimeout(clear, (i * baseDelay) + 900);
  });
}

// ---- Modal Animations -------------------------------------
function nestiqOpenModalAnimated() {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay) return;
  overlay.classList.remove('modal-closing');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (content) content.style.animation = 'nq-modal-in 0.34s cubic-bezier(.34,1.15,.64,1) both';
  setTimeout(() => {
    nestiqInitScrollReveal();
    nestiqInitCounters();
    nestiqAnimateModalContent(content || document.getElementById('modalContent'));
    nestiqInitLazyImages();
  }, 60);
}

function nestiqCloseModalAnimated() {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  const modal = overlay?.querySelector('.modal');
  if (!overlay) return;
  if (typeof nestiqDestroyPropertyPinMap === 'function') nestiqDestroyPropertyPinMap();
  if (typeof nestiqDestroyListingDetailMap === 'function') nestiqDestroyListingDetailMap();
  overlay.classList.add('modal-closing');
  if (modal) {
    modal.style.animation = 'none';
    modal.style.transition = 'transform 0.22s cubic-bezier(.25,.46,.45,.94), opacity 0.2s ease';
    modal.style.transform = 'scale(0.94) translateY(16px)';
    modal.style.opacity = '0';
  }
  if (content) content.style.animation = 'nq-modal-out 0.22s cubic-bezier(.25,.46,.45,.94) both';
  setTimeout(() => {
    overlay.style.display = '';
    overlay.classList.remove('modal-closing', 'open');
    document.body.style.overflow = '';
    if (modal) {
      modal.classList.remove('modal-wide', 'modal-xwide', 'nestiq-prop-sheet-modal', 'nestiq-form-modal', 'nestiq-report-issue-modal');
      modal.style.transform = '';
      modal.style.opacity = '';
      modal.style.transition = '';
      modal.style.animation = '';
      modal.style.transformOrigin = '';
    }
    if (content) { content.innerHTML = ''; content.style.animation = ''; }
  }, 240);
}

function nestiqOpenPropertySheet(fromEl) {
  const overlay = document.getElementById('modalOverlay');
  const modal = overlay && overlay.querySelector('.modal');
  const content = document.getElementById('modalContent');
  if (!overlay || !modal) return;
  const reduce = (()=>{ try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_e) { return false; } })();
  const wasOpen = overlay.classList.contains('open') && overlay.style.display === 'flex';
  overlay.classList.remove('modal-closing');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  modal.classList.add('modal-xwide', 'nestiq-prop-sheet-modal');
  if (content) content.style.animation = 'none';
  modal.style.opacity = '1';
  if (wasOpen || reduce || !fromEl || typeof fromEl.getBoundingClientRect !== 'function') {
    modal.style.transition = 'none';
    modal.style.transform = 'none';
    if (!wasOpen && content) content.style.animation = 'nq-modal-in 0.4s cubic-bezier(.22,1,.36,1) both';
    setTimeout(() => { try { nestiqInitLazyImages(); } catch (_e) {} }, 40);
    return;
  }
  modal.style.transition = 'none';
  modal.style.transform = 'none';
  void modal.offsetWidth;
  const dest = modal.getBoundingClientRect();
  const card = fromEl.getBoundingClientRect();
  const sx = Math.max(0.42, Math.min(0.88, card.width / Math.max(dest.width, 1)));
  const sy = Math.max(0.42, Math.min(0.88, card.height / Math.max(dest.height, 1)));
  const dx = (card.left + card.width / 2) - (dest.left + dest.width / 2);
  const dy = (card.top + card.height / 2) - (dest.top + dest.height / 2);
  modal.style.transformOrigin = 'center center';
  modal.style.opacity = '0.55';
  modal.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.style.transition = 'transform 0.5s cubic-bezier(.16,1,.3,1), opacity 0.35s ease';
      modal.style.transform = 'translate(0,0) scale(1)';
      modal.style.opacity = '1';
    });
  });
  setTimeout(() => { try { nestiqInitLazyImages(); } catch (_e) {} }, 80);
}

function nestiqOpenModal(contentHtml, title) {
  const content = document.getElementById('modalContent');
  if (content) {
    content.innerHTML = title
      ? `<h2 class="modal-title">${title}</h2>${contentHtml || ''}`
      : (contentHtml || '');
  }
  nestiqOpenModalAnimated();
}

function nestiqCloseModal() {
  nestiqCloseModalAnimated();
}

let __nqModalContentAnim = 0;
function nestiqAnimateModalContent(contentEl) {
  if (!contentEl) contentEl = document.getElementById('modalContent');
  if (!contentEl) return;
  const gen = ++__nqModalContentAnim;
  const sections = contentEl.querySelectorAll(
    '.modal-section, .form-group, .card, h2, h3, .stat-card, table, .btn-row'
  );
  sections.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'none';
    setTimeout(() => {
      if (gen !== __nqModalContentAnim) return;
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 60 + i * 40);
  });
}

function nestiqInitLazyImages() {
  document.querySelectorAll('img').forEach(img => {
    if (img.classList.contains('loaded')) return;
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load',  () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('loaded'), { once: true });
    }
  });
}

// ---- Toast Notifications ----------------------------------
function nestiqShowNotif(message, type, duration) {
  type     = type     || 'info';
  duration = duration || 3600;
  let container = document.getElementById('nqToastWrap');
  const leftover = document.getElementById('notifContainer');
  if (leftover && leftover !== container) leftover.replaceChildren();
  if (!container) {
    container = document.createElement('div');
    container.id = 'nqToastWrap';
    container.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:99999',
      'display:flex', 'flex-direction:column', 'gap:10px',
      'pointer-events:none', 'max-width:340px'
    ].join(';');
    document.body.appendChild(container);
  }
  const cfg = {
    success: { bg:'#16a34a', icon:'✓', glow:'rgba(22,163,74,0.28)' },
    error:   { bg:'#dc2626', icon:'✕', glow:'rgba(220,38,38,0.28)' },
    warning: { bg:'#d97706', icon:'⚠', glow:'rgba(217,119,6,0.28)' },
    info:    { bg:'#C46A3A', icon:'ℹ', glow:'rgba(196,106,58,0.28)' },
  };
  const { bg, icon, glow } = cfg[type] || cfg.info;
  const toast = document.createElement('div');
  toast.className = 'nq-toast';
  toast.style.cssText = [
    `background:${bg}`, 'color:white',
    'padding:13px 18px', 'border-radius:14px',
    'font-family:"DM Sans",sans-serif', 'font-size:0.88rem',
    `box-shadow:0 8px 28px ${glow},0 2px 8px rgba(0,0,0,0.12)`,
    'pointer-events:auto', 'cursor:pointer',
    'display:flex', 'align-items:center', 'gap:11px',
    'min-width:220px', 'max-width:340px', 'line-height:1.4',
    'border:1px solid rgba(255,255,255,0.15)'
  ].join(';');
  toast.innerHTML = `<span style="font-size:1.05rem;flex-shrink:0">${icon}</span><span style="flex:1">${message}</span><span style="opacity:0.6;font-size:1rem;flex-shrink:0">✕</span>`;
  container.appendChild(toast);
  function dismiss() {
    toast.classList.add('nq-toast-out');
    setTimeout(() => toast.remove(), 300);
  }
  toast.onclick = dismiss;
  const t = setTimeout(dismiss, duration);
  toast.onmouseenter = () => clearTimeout(t);
  toast.onmouseleave = () => setTimeout(dismiss, 1200);
}

// ---- Resolve list containers (legacy + current IDs) -------
function nestiqResolveEl(containerId) {
  if (!containerId) return null;
  if (typeof containerId !== 'string') return containerId;
  return document.getElementById(containerId)
    || (containerId === 'tenantsList' && document.getElementById('tenantsGrid'))
    || (containerId === 'applicationsList' && document.getElementById('nestiqApplicationsList'))
    || (containerId === 'expensesList' && document.getElementById('expenseRows'))
    || (containerId === 'vendorsList' && (document.getElementById('nestiqVendorGrid') || document.getElementById('nestiqVendorListView')))
    || (containerId === 'ticketsList' && document.getElementById('sup_tickets_list'))
    || null;
}

function nestiqBtnFromEvent(e) {
  try {
    const ev = e || (typeof window !== 'undefined' ? window.event : null);
    if (ev && ev.target) {
      const btn = ev.target.closest ? ev.target.closest('button,[role="button"]') : ev.target;
      if (btn) return btn;
    }
  } catch (_e) {}
  const ae = document.activeElement;
  return (ae && (ae.tagName === 'BUTTON' || ae.getAttribute?.('role') === 'button')) ? ae : null;
}

// ---- Button loading spinner -------------------------------
function nestiqSetBtnLoading(btn, loading, originalText) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="nq-spin" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;vertical-align:middle;margin-right:8px"></span>${originalText || 'Loading...'}`;
    btn.style.opacity = '0.8';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || originalText || btn.innerHTML;
    btn.style.opacity = '';
  }
}

// ---- Empty state ------------------------------------------
function nestiqShowEmptyState(containerId, opts) {
  const el = nestiqResolveEl(containerId);
  if (!el) return;
  opts = opts || {};
  const actionFn = opts.action && opts.action.fn ? String(opts.action.fn).replace(/[^\w$.]/g, '') : '';
  el.innerHTML = `
    <div class="nq-empty-state nq-fade-in">
      <div class="nq-empty-icon" aria-hidden="true">${opts.icon || '📭'}</div>
      <h3>${opts.title || 'Nothing here yet'}</h3>
      <p>${opts.message || 'Add your first item to get started.'}</p>
      ${opts.action && actionFn ? `<button type="button" class="btn-gold btn-sm nq-scale-bounce" onclick="${actionFn}()">${opts.action.label || 'Add'}</button>` : ''}
    </div>`;
}

// ---- Page loading bar -------------------------------------
function nestiqStartPageBar() {
  const bar = document.getElementById('nqPageBar');
  if (!bar) return;
  bar.style.opacity = '1';
  bar.style.width = '0%';
  requestAnimationFrame(() => { bar.style.width = '70%'; });
}
function nestiqFinishPageBar() {
  const bar = document.getElementById('nqPageBar');
  if (!bar) return;
  bar.style.width = '100%';
  setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => { bar.style.width = '0%'; }, 300); }, 250);
}

// ---- Confetti burst ---------------------------------------
function nestiqConfetti(opts) {
  if (typeof confetti !== 'function') return;
  opts = opts || {};
  confetti({
    particleCount: opts.count || 80,
    spread:        opts.spread || 65,
    origin:        opts.origin || { y: 0.65 },
    colors: ['#C46A3A','#F5F0E8','#0E1117','#A63D2F','#ffffff','#FFD700'],
    gravity:       0.9,
    scalar:        0.9,
  });
}

// ---- Empty-state action aliases ---------------------------
function nestiqOpenAddPropertyModal() {
  if (typeof openModal === 'function') openModal('addProperty');
  if (typeof nestiqOpenModalAnimated === 'function') nestiqOpenModalAnimated();
}
function nestiqOpenAddTenantModal() {
  if (typeof nestiqShowTenantsApplyOnly === 'function') nestiqShowTenantsApplyOnly();
  else if (typeof nestiqShowNotif === 'function') nestiqShowNotif('Tenants apply from Browse listings.','info');
}
function nestiqOpenAddExpenseModal() {
  if (typeof showPage === 'function') showPage('expenses');
  setTimeout(() => {
    const form = document.getElementById('addExpenseForm') || document.getElementById('exp_desc');
    form?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    if (form && form.focus) form.focus();
  }, 400);
}

// ---- Default icon-only tooltips ---------------------------
function nestiqApplyDefaultTips(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const stamp = (sel, tip) => {
    try {
      scope.querySelectorAll(sel).forEach(el => {
        if (!el.getAttribute('data-nq-tip')) el.setAttribute('data-nq-tip', tip);
        if (!el.getAttribute('title')) el.setAttribute('title', tip);
      });
    } catch (_e) {}
  };
  stamp('.btn-whatsapp, .wa-item[onclick*="WhatsApp"]', 'Send WhatsApp');
  stamp('.card-edit-pencil, .exp-edit, [aria-label="Edit"]', 'Edit');
  stamp('.exp-del, [aria-label="Delete"], .nestiq-vendor-card [onclick*="Delete"], .nestiq-vendor-card [onclick*="nestiqDelete"]', 'Delete');
  stamp('[onclick*="generateLease"], [onclick*="generateReceipt"], [onclick*="Download PDF"], [title="Download PDF"]', 'Download PDF');
  stamp('[onclick*="nestiqCopy"], [onclick*="Copy link"], [onclick*="copyInvitation"], [onclick*="nestiqCopyInvitation"]', 'Copy link');
  stamp('[onclick*="downloadQR"], [onclick*="Download QR"], [onclick*="nestiqDownloadApplicationQr"]', 'Download QR code');
  stamp('[onclick*="runTenantScreening"], [onclick*="runMaintAiAssess"], [onclick*="runCpiAiSuggestRent"], [onclick*="runAiPortfolioAnalysis"], [onclick*="openLeaseClauseGenerator"], [onclick*="nestiqRunApplicationAiScreen"]', 'AI Powered');
  stamp('.notif-bell-btn', 'Notifications');
  stamp('#nestiqSupportFab, .nestiq-support-fab, a[href="support.html"][target="_blank"]', 'Help & Support');
  stamp('[onclick="window.print()"], [onclick*="printTax"], [onclick*="printInspection"]', 'Print this page');
}

// ---- Skeleton Loader --------------------------------------
function nestiqShowSkeleton(containerId, type, count) {
  const el = nestiqResolveEl(containerId);
  if (!el) return;
  type  = type  || 'card';
  count = count || 3;
  const t = {
    card: `<div style="padding:16px;border:1px solid var(--border);border-radius:14px;margin-bottom:12px">
      <div class="nq-skeleton nq-sk-title"></div>
      <div class="nq-skeleton nq-sk-text" style="width:80%"></div>
      <div class="nq-skeleton nq-sk-text" style="width:62%"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <div class="nq-skeleton nq-sk-btn"></div>
        <div class="nq-skeleton nq-sk-btn"></div>
      </div></div>`,
    row: `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div class="nq-skeleton nq-sk-avatar"></div>
      <div style="flex:1">
        <div class="nq-skeleton nq-sk-text" style="width:42%"></div>
        <div class="nq-skeleton nq-sk-text" style="width:62%"></div>
      </div>
      <div class="nq-skeleton nq-sk-btn" style="width:80px"></div></div>`,
    stat: `<div class="card" style="padding:22px">
      <div class="nq-skeleton nq-sk-text" style="width:50%"></div>
      <div class="nq-skeleton" style="height:38px;width:65%;border-radius:8px;margin:10px 0"></div>
      <div class="nq-skeleton nq-sk-text" style="width:40%"></div></div>`,
  };
  el.innerHTML = Array(count).fill(t[type] || t.card).join('');
}

// ---- Theme Switch Animation -------------------------------
function nestiqAnimatedThemeSwitch(applyFn) {
  const run = () => { if (typeof applyFn === 'function') applyFn(); };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    run();
    return;
  }
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(run);
    return;
  }
  let flash = document.querySelector('.nq-theme-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.className = 'nq-theme-flash';
    document.body.appendChild(flash);
  }
  requestAnimationFrame(() => {
    flash.style.opacity = '0.08';
    setTimeout(() => {
      run();
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 200);
    }, 120);
  });
}

// ---- Pause animations when tab is hidden ------------------
document.addEventListener('visibilitychange', () => {
  document.documentElement.style.setProperty(
    '--nq-anim-state',
    document.hidden ? 'paused' : 'running'
  );
});

// ---- Initialise -------------------------------------------
function nestiqInitAnimations() {
  nestiqInitScrollReveal();
  nestiqInitRipple();
  nestiqInitCounters();
  nestiqApplyDefaultTips();
  nestiqInitLazyImages();
}

function nestiqPatchAppGlobals() {
  if (window.__nestiqAnimPatched) return;
  if (typeof window.closeModal === 'function') {
    window.closeModal = nestiqCloseModalAnimated;
  }
  if (typeof window.openModal === 'function') {
    const origOpen = window.openModal;
    window.openModal = function (t) {
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.remove('modal-closing');
      origOpen(t);
      nestiqAnimateModalContent(document.getElementById('modalContent'));
    };
  }
  window.showNotif = nestiqShowNotif;
  window.__nestiqAnimPatched = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    nestiqInitAnimations();
    nestiqPatchAppGlobals();
  });
} else {
  nestiqInitAnimations();
  nestiqPatchAppGlobals();
}
setTimeout(nestiqPatchAppGlobals, 0);

// ---- Expose globally --------------------------------------
window.nestiqAnimatePage         = nestiqAnimatePage;
window.nestiqStaggerChildren      = nestiqStaggerChildren;
window.nestiqShowSkeleton         = nestiqShowSkeleton;
window.nestiqShowNotif            = nestiqShowNotif;
window.nestiqUpdateStat           = nestiqUpdateStat;
window.nestiqUpdateStatNumber     = nestiqUpdateStat;
window.nestiqAnimatedThemeSwitch  = nestiqAnimatedThemeSwitch;
window.nestiqOpenModalAnimated    = nestiqOpenModalAnimated;
window.nestiqOpenPropertySheet    = nestiqOpenPropertySheet;
window.nestiqCloseModalAnimated   = nestiqCloseModalAnimated;
window.nestiqOpenModal            = nestiqOpenModal;
window.nestiqCloseModal           = nestiqCloseModal;
window.nestiqInitScrollReveal     = nestiqInitScrollReveal;
window.nestiqAnimateCounter       = nestiqAnimateCounter;
window.nestiqInitCounters         = nestiqInitCounters;
window.nestiqInitAnimations       = nestiqInitAnimations;
window.nestiqInitRipple           = nestiqInitRipple;
window.nestiqSetBtnLoading        = nestiqSetBtnLoading;
window.nestiqShowEmptyState       = nestiqShowEmptyState;
window.nestiqStartPageBar         = nestiqStartPageBar;
window.nestiqFinishPageBar        = nestiqFinishPageBar;
window.nestiqConfetti             = nestiqConfetti;
window.nestiqBtnFromEvent         = nestiqBtnFromEvent;
window.nestiqResolveEl            = nestiqResolveEl;
window.nestiqApplyDefaultTips     = nestiqApplyDefaultTips;
window.nestiqAnimateModalContent  = nestiqAnimateModalContent;
window.nestiqInitLazyImages       = nestiqInitLazyImages;
window.nestiqOpenAddPropertyModal = nestiqOpenAddPropertyModal;
window.nestiqOpenAddTenantModal   = nestiqOpenAddTenantModal;
window.nestiqOpenAddExpenseModal  = nestiqOpenAddExpenseModal;
try { window.showNotif = nestiqShowNotif; } catch (_e) {}
