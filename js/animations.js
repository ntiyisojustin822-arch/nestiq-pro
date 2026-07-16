/* NestIQ global animation utilities */

function nestiqRevealIfInViewport(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (rect.width <= 0 && rect.height <= 0) return false;
  if (rect.bottom > 0 && rect.top < vh) {
    el.classList.add('revealed', 'visible');
    return true;
  }
  return false;
}

function nestiqInitScrollReveal() {
  const selector = '.reveal:not(.revealed):not(.visible), .reveal-left:not(.revealed):not(.visible), .reveal-right:not(.revealed):not(.visible)';

  const run = () => {
    const els = document.querySelectorAll(selector);
    if (!els.length) return;

    if (!window.__nestiqRevealObs) {
      window.__nestiqRevealObs = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.classList.add('revealed', 'visible');
            }, i * 60);
            window.__nestiqRevealObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }

    els.forEach(el => {
      if (!nestiqRevealIfInViewport(el)) {
        window.__nestiqRevealObs.observe(el);
      }
    });
  };

  run();
  // Layout may not be ready on the first pass right after SPA mount.
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function nestiqAnimateCounter(el, target, duration = 1200, prefix = '', suffix = '') {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  const isDecimal = String(target).includes('.');

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (target - start) * eased;
    el.textContent = prefix + (isDecimal
      ? current.toFixed(2)
      : Math.floor(current).toLocaleString('en-ZA')) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function nestiqInitCounters() {
  const els = document.querySelectorAll('[data-count-to]:not([data-count-done]), [data-count]:not([data-count-done])');
  if (!els.length) return;

  if (!window.__nestiqCounterObs) {
    window.__nestiqCounterObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.dataset.countDone = '1';
          const raw = el.dataset.countTo ?? el.dataset.count;
          const target = parseFloat(raw);
          if (Number.isNaN(target)) return;
          const prefix = el.dataset.prefix || '';
          const suffix = el.dataset.suffix || '';
          const duration = parseInt(el.dataset.duration || 1200, 10);
          el.classList.add('count-up');
          nestiqAnimateCounter(el, target, duration, prefix, suffix);
          window.__nestiqCounterObs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
  }

  els.forEach(el => window.__nestiqCounterObs.observe(el));
}

function nestiqInitRipple() {
  if (window.__nestiqRippleInit) return;
  window.__nestiqRippleInit = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-primary, .btn-gold, .btn-outline, .btn-sm');
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

function nestiqAnimatePage(pageEl) {
  if (!pageEl) return;
  pageEl.classList.remove('page-active');
  void pageEl.offsetWidth;
  pageEl.classList.add('page-active');
}

function nestiqOpenModal(contentHtml, title = '') {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  if (title) {
    content.innerHTML = `<h2 class="modal-title">${title}</h2>${contentHtml}`;
  } else {
    content.innerHTML = contentHtml;
  }
  overlay.classList.remove('modal-closing');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  nestiqInitScrollReveal();
}

function nestiqCloseModal() {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay) return;
  if (!overlay.classList.contains('open')) return;
  overlay.classList.add('modal-closing');
  setTimeout(() => {
    if (typeof nestiqDestroyPropertyPinMap === 'function') nestiqDestroyPropertyPinMap();
    document.querySelector('#modalOverlay .modal')?.classList.remove('modal-wide');
    overlay.classList.remove('open', 'modal-closing');
    document.body.style.overflow = '';
    if (content) content.innerHTML = '';
  }, 200);
}

function nestiqStaggerChildren(parentEl, baseDelay = 50, childSelector) {
  if (!parentEl) return;
  const children = childSelector
    ? parentEl.querySelectorAll(childSelector)
    : parentEl.children;
  Array.from(children).forEach((child, i) => {
    child.style.animationDelay = `${i * baseDelay}ms`;
    child.classList.add('na-fade-in');
  });
}

function nestiqShowNotif(message, type = 'info', duration = 3500) {
  const existing = document.getElementById('nestiqToastContainer');
  const container = existing || (() => {
    const c = document.createElement('div');
    c.id = 'nestiqToastContainer';
    c.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      z-index: 99999; display: flex; flex-direction: column; gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(c);
    return c;
  })();

  const colors = {
    success: { bg: '#16a34a', icon: '✓' },
    error:   { bg: '#dc2626', icon: '✕' },
    warning: { bg: '#d97706', icon: '⚠' },
    info:    { bg: 'var(--gold)', icon: 'ℹ' },
  };
  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    background: ${bg}; color: white;
    padding: 12px 18px; border-radius: 12px;
    font-family: 'DM Sans', sans-serif; font-size: 0.88rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    pointer-events: auto; max-width: 320px; min-width: 220px;
    cursor: pointer;
  `;
  toast.innerHTML = `
    <span style="font-size:1rem;flex-shrink:0">${icon}</span>
    <span style="flex:1;line-height:1.4">${message}</span>
  `;
  toast.classList.add('notif');
  container.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast.onclick = () => dismissToast(toast);

  function dismissToast(t) {
    clearTimeout(timer);
    t.classList.add('hiding');
    setTimeout(() => t.remove(), 250);
  }
}

function nestiqShowSkeleton(containerId, type = 'card', count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const templates = {
    card: `
      <div style="padding:16px">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text" style="width:80%"></div>
        <div class="skeleton skeleton-text" style="width:60%"></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <div class="skeleton skeleton-btn"></div>
          <div class="skeleton skeleton-btn"></div>
        </div>
      </div>`,
    row: `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-text" style="width:40%"></div>
          <div class="skeleton skeleton-text" style="width:60%"></div>
        </div>
        <div class="skeleton skeleton-btn" style="width:80px"></div>
      </div>`,
    stat: `
      <div class="card" style="padding:20px">
        <div class="skeleton skeleton-text" style="width:50%"></div>
        <div class="skeleton" style="height:36px;width:70%;border-radius:8px;margin:8px 0"></div>
        <div class="skeleton skeleton-text" style="width:40%"></div>
      </div>`,
  };
  container.innerHTML = Array(count).fill(templates[type] || templates.card).join('');
}

function nestiqUpdateStatNumber(el, newValue, prefix = '', suffix = '') {
  if (!el) return;
  el.classList.add('na-scale-bounce');
  el.addEventListener('animationend', () => {
    el.classList.remove('na-scale-bounce');
  }, { once: true });
  const target = parseFloat(String(newValue).replace(/[^0-9.]/g, ''));
  if (Number.isNaN(target)) {
    el.textContent = prefix + newValue + suffix;
    return;
  }
  delete el.dataset.countDone;
  nestiqAnimateCounter(el, target, 800, prefix, suffix);
}

function nestiqAnimatedThemeSwitch(applyFn) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: var(--gold);
    opacity: 0; z-index: 99999; pointer-events: none;
    transition: opacity 0.18s ease;
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = '0.15';
    setTimeout(() => {
      applyFn();
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    }, 180);
  });
}

function nestiqInitAnimations() {
  nestiqInitScrollReveal();
  nestiqInitRipple();
  nestiqInitCounters();
}

function nestiqPatchAppGlobals() {
  if (window.__nestiqAnimPatched) return;
  if (typeof window.closeModal === 'function') {
    window.nestiqCloseModal = nestiqCloseModal;
    window.closeModal = nestiqCloseModal;
  }
  if (typeof window.openModal === 'function') {
    const origOpen = window.openModal;
    window.openModal = function (t) {
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.remove('modal-closing');
      origOpen(t);
      nestiqInitScrollReveal();
    };
  }
  window.showNotif = nestiqShowNotif;
  window.__nestiqAnimPatched = true;
}

window.nestiqInitScrollReveal = nestiqInitScrollReveal;
window.nestiqAnimateCounter = nestiqAnimateCounter;
window.nestiqInitCounters = nestiqInitCounters;
window.nestiqInitRipple = nestiqInitRipple;
window.nestiqAnimatePage = nestiqAnimatePage;
window.nestiqOpenModal = nestiqOpenModal;
window.nestiqCloseModal = nestiqCloseModal;
window.nestiqStaggerChildren = nestiqStaggerChildren;
window.nestiqShowNotif = nestiqShowNotif;
window.nestiqShowSkeleton = nestiqShowSkeleton;
window.nestiqUpdateStatNumber = nestiqUpdateStatNumber;
window.nestiqAnimatedThemeSwitch = nestiqAnimatedThemeSwitch;
window.nestiqInitAnimations = nestiqInitAnimations;

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

// Compatibility: treat showNotif as nestiqShowNotif everywhere.
try{ window.showNotif = window.nestiqShowNotif; }catch(_e){}
