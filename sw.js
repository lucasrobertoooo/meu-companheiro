// Service worker — cacheia a CASCA do app (offline). NÃO cacheia os DADOS
// (snapshot.json / GitHub API) — esses são sempre rede; o app.js guarda o último
// snapshot em localStorage pra exibir offline.
const CACHE = 'companheiro-shell-v2';
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
