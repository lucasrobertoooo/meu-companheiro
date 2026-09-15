// Service worker — cacheia a CASCA do app (offline). NÃO cacheia os DADOS
// (snapshot.json / GitHub API) — esses são sempre rede; o app.js guarda o último
// snapshot em localStorage pra exibir offline.
const CACHE = 'companheiro-shell-v48';
const SHELL = [
  './', './index.html', './style.css', './app.js', './creature-art.js',
  './_shared/regras.js', './skincare-catalog.js',   // CORE-2026-08-24 · faltavam no cache offline
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
  /* ROBUSTEZ-2026-09-14 · o parse ficava FORA do try do resto: um payload `null` (JSON válido) fazia o
     handler morrer antes do showNotification. Push recebido e não mostrado é exatamente o que o iOS
     pune revogando a permissão do site. Agora tudo que pode falhar está dentro, e sempre sai alguma
     notificação. */
  let data = {};
  try { data = e.data ? (e.data.json() || {}) : {}; } catch (err) { try { data = { body: e.data ? e.data.text() : '' }; } catch (e2) { data = {}; } }
  if (typeof data !== 'object' || data === null) data = {};
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
/* ASSINATURA-2026-09-14 · trocar de aparelho, reinstalar o PWA ou limpar dados do site INVALIDA a
   assinatura de push, e sem este handler ela só morria: o Mac seguia mandando pro endereço velho e
   recebendo 410, e nenhum lado sabia. O navegador dispara este evento quando isso acontece; aqui a
   gente reassina na hora e guarda pra página empurrar ao repo no próximo boot. O `applicationServerKey`
   vem da assinatura antiga quando ela existe, senão da chave embutida (mesma VAPID pública do app). */
const VAPID_PUB_SW = 'BMxE9r6DrUygHVJkhr2sDXSyeguI7zzeDeunLkOgY2qZr7lS52logWdLOCblLdmuiFm6TweBneHldcQ_V4Wfhag';
function b64ToU8(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s), arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try{
      const antiga = e.oldSubscription || await self.registration.pushManager.getSubscription();
      const chave = (antiga && antiga.options && antiga.options.applicationServerKey) || b64ToU8(VAPID_PUB_SW);
      const nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
      /* o SW não tem o token do GitHub (ele vive no localStorage da página), então deixa a assinatura
         nova num cache e a página empurra assim que abrir. */
      const c = await caches.open('push-pendente');
      await c.put('/nova-assinatura', new Response(JSON.stringify(nova), { headers: { 'Content-Type': 'application/json' } }));
      /* e avisa qualquer aba aberta agora, pro caso de o app estar em primeiro plano */
      const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cls.forEach(cl => { try{ cl.postMessage({ tipo: 'assinatura-nova' }); }catch(err){} });
    }catch(err){ /* sem o que fazer aqui; a página tenta de novo no boot */ }
  })());
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
    /* AUDIT2-2026-09-02 (B4) · chave sem querystring: o "Abrir no navegador" gera ?r=<timestamp> único
       por toque e cada um virava entrada NOVA no cache pra sempre. A casca não varia por query. */
    const chave = (url.origin === self.location.origin) ? new Request(url.origin + url.pathname) : e.request;
    /* LEITURA-FIX-2026-09-08 · com a chave normalizada (AUDIT2/B4), o "?r=<timestamp>" do botão
       "Abrir no navegador" passou a ACERTAR o cache — e o atalho de forçar atualização virou letra
       morta (precisava de duas aberturas). Agora, quando a URL traz query (que só existe quando é
       cache-buster deliberado), vai na REDE primeiro e cai no cache só se a rede falhar. Sem query,
       segue stale-while-revalidate normal, e o cache não cresce porque a chave continua sem query. */
    if (url.search){
      try {
        const fresco = await fetch(e.request, { cache: 'reload' });
        if (fresco && fresco.ok) { cache.put(chave, fresco.clone()); return fresco; }
      } catch (err) {}
      return (await cache.match(chave)) || fetch(e.request);
    }
    const cached = await cache.match(chave);
    const network = fetch(e.request).then(r => { if (r && r.ok) cache.put(chave, r.clone()); return r; }).catch(() => null);
    return cached || (await network) || fetch(e.request);
  })());
});
