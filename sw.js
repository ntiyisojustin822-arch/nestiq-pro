const CACHE_NAME = 'nestiq-pro-v54-auth-polish';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './landing.html',
  './legal.html',
  './billing.html',
  './admin.html',
  './onboarding.html',
  './support.html',
  './changelog.html',
  './offline.html',
  './application.html',
  './manifest.json',
  './css/styles.css',
  './css/animations.css',
  './js/icons.js',
  './pages/home.html',
  './pages/properties.html',
  './pages/map.html',
  './pages/listings.html',
  './pages/tenants.html',
  './pages/deposits.html',
  './pages/applications.html',
  './pages/expenses.html',
  './pages/reconcile.html',
  './pages/maintenance.html',
  './pages/vendors.html',
  './pages/latefees.html',
  './pages/inspections.html',
  './pages/calendar.html',
  './pages/charts.html',
  './pages/valuation.html',
  './pages/roi.html',
  './pages/tax.html',
  './pages/rentroll.html',
  './pages/renewals.html',
  './pages/portal.html',
  './pages/settings.html',
  './pages/tenant-dashboard.html',
  './pages/caretaker-dashboard.html',
  './pages/contractor-dashboard.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  /* Admin panel is a separate app — never intercept (avoids showing landlord landing page). */
  if (url.pathname === '/admin.html' || url.pathname.endsWith('/admin.html')
    || url.pathname === '/billing.html' || url.pathname.endsWith('/billing.html')
    || url.pathname === '/onboarding.html' || url.pathname.endsWith('/onboarding.html')
    || url.pathname === '/support.html' || url.pathname.endsWith('/support.html')
    || url.pathname === '/changelog.html' || url.pathname.endsWith('/changelog.html')) {
    return;
  }

  // Navigation fallback: serve offline page when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./offline.html'))
    );
    return;
  }
  const isApiCall = url.pathname.includes('/api/') || url.hostname.includes('generativelanguage.googleapis.com');

  if (isApiCall) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    // Always network-first for JS — never serve stale tenant-save logic from SW cache.
    (url.pathname.includes('/js/') || url.pathname.endsWith('.js')
      ? fetch(event.request, { cache: 'no-store' }).then((response) => response)
          .catch(() => caches.match(event.request))
      : caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request)
            .then((response) => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              return response;
            })
            .catch(() => {
              if (event.request.mode === 'navigate') return caches.match('./offline.html');
              return new Response('', { status: 504, statusText: 'Offline' });
            });
        }))
  );
});
