// Service worker: recebe as notificações e guarda os arquivos do app para abrir rápido
const CACHE = 'remedios-v5';
const ARQUIVOS = ['./', './index.html', './estilo.css', './app.js', './remedios-base.js', './relatorio-comum.js', './saude.js', './manifest.json', './icones/icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro; se estiver sem internet, usa o que está guardado
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Remédios', body: e.data?.text() || '' }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Remédios', {
      body: d.body || '',
      tag: d.tag,
      renotify: true,
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-192.png',
      data: { url: d.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  const ps = new URL(url).searchParams;
  const dose = ps.get('dose'), consulta = ps.get('consulta');
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (j.url.startsWith(self.registration.scope)) {
        await j.focus();
        if (dose) j.postMessage({ dose });
        if (consulta) j.postMessage({ consulta });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
