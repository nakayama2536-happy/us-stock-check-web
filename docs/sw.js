const CACHE="us-stock-check-v0.9.5-ops1";
const STATIC=[
  "./",
  "./index.html",
  "./style.css?v=0.9.5-ops1",
  "./app.js?v=0.9.5-ops1",
  "./manifest.webmanifest",
  "./icons/us-stock-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirstData(request){
  const url=new URL(request.url);
  const canonicalKey=new Request(url.origin+url.pathname);
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(canonicalKey,response.clone());
    }
    return response;
  }catch(e){
    return (await caches.match(canonicalKey))||Response.error();
  }
}

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.pathname.includes("/data/")){
    event.respondWith(networkFirstData(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:"no-cache"})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
