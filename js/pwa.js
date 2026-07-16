let deferredInstallPrompt = null;
let installBannerShown = false;

function showInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  if (installBannerShown) return;
  installBannerShown = true;
  banner.style.display = 'block';
}

function hideInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.style.display = 'none';
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!sessionStorage.getItem('nestiq-install-banner-dismissed')) {
    showInstallBanner();
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallBanner();
  showNotif('NestIQ installed successfully!', 'success');
});

document.addEventListener('click', async (event) => {
  const installBtn = event.target.closest('#installBtn');
  const dismissBtn = event.target.closest('#dismissInstallBtn');

  if (dismissBtn) {
    sessionStorage.setItem('nestiq-install-banner-dismissed', '1');
    hideInstallBanner();
    return;
  }

  if (!installBtn) return;
  if (!deferredInstallPrompt) {
    showNotif('Install is not available on this device yet.', 'warning');
    hideInstallBanner();
    return;
  }

  deferredInstallPrompt.prompt();
  const choiceResult = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallBanner();
  if (choiceResult.outcome !== 'accepted') {
    sessionStorage.setItem('nestiq-install-banner-dismissed', '1');
  }
});
