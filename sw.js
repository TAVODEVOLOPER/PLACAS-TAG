/**
 * Service worker mínimo: no cachea nada por su cuenta (para no chocar con
 * el sistema de caché propio de la app ni con el cache-busting de
 * app.js/style.css). Solo existe para que Chrome/Edge/Android ofrezcan el
 * ícono "Instalar app".
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sin intercepción: deja que el navegador maneje la petición normalmente.
});
