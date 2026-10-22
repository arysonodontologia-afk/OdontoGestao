// OdontoGestão — service worker: deixa o app instalável e abre a tela mesmo com internet ruim.
// Arquivos do próprio site: busca sempre a versão mais nova; usa a cópia guardada só se estiver sem internet.
const CACHE='odontogestao-v2.8.1';
const ARQUIVOS=['./','index.html','estilo.css?v=2.8.1','app.js?v=2.8.1','nuvem.js?v=2.8.1','firebase-config.js?v=2.8.1','versoes.js?v=2.8.1','manifest.json','icones/icone-192.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQUIVOS)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin) return;   // Firebase e Google passam direto
  e.respondWith(fetch(e.request).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); } return r; })
    .catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
