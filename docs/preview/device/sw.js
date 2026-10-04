/* Device scope only. Never migrates or deletes regular app caches. */
const SCOPE="/us-stock-check-web/preview/device/",PREFIX='us-stock-device-shell-',CACHE=PREFIX+'f8570ff9ea3262a8';
if(new URL(self.registration.scope).pathname!==SCOPE)throw Error('Unexpected preview scope');
const STATIC=["./","./index.html","./assets.json","./preview-adapter.js","./delivery.js","./storage.js","./candidate.js","./device-status.js","./sw-register.js","./manifest.webmanifest","./icons/us-stock-icon.png"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url),base=new URL(self.registration.scope);
 if(r.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(SCOPE))return;
 const relative='./'+u.pathname.slice(SCOPE.length);if(!STATIC.includes(relative))return;
 u.search='';e.respondWith((async()=>{const c=await caches.open(CACHE);return(await c.match(u.href))||fetch(r);})());
});
