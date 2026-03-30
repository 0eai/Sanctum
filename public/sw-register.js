if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/pwa-sw.js', { scope: '/' });
  });
}
