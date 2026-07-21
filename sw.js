// Service worker — cacheia a CASCA do app (offline). NÃO cacheia os DADOS
// (snapshot.json / GitHub API) — esses são sempre rede; o app.js guarda o último
// snapshot em localStorage pra exibir offline.
const CACHE = 'companheiro-shell-v15';
const SHELL = [
  './', './index.html', './style.css', './app.js', './creature-art.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// PUSH-2026-07-15 · notificações REAIS (chegam com o app fechado quando instalado na tela inicial · iOS 16.4+).
// O sistema acorda o SW e dispara o push event mesmo sem o app rodando — diferente de notificação da página.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Companheiro';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'companheiro',
    renotify: true,
    data: { url: data.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { try { await c.navigate(url); } catch (err) {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // dados: sempre rede, sem cache (o app.js guarda o último snapshot em localStorage)
  if (url.hostname === 'api.github.com' || url.pathname.endsWith('snapshot.json')) return;
  // casca: stale-while-revalidate — serve do cache na hora e atualiza em 2º plano,
  // então updates do app propagam no próximo open (sem bump manual de versão).
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const network = fetch(e.request).then(r => { if (r && r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    return cached || (await network) || fetch(e.request);
  })());
});
