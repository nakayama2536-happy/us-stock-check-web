const CACHE_PREFIX="us-stock-check-v";
const CACHE="us-stock-check-v0.9.8-cache1";
const STATIC=[
  "./",
  "./index.html",
  "./style.css?v=0.9.8",
  "./app.js?v=0.9.8",
  "./unified-ui.js?v=unified-candidate-1",
  "./manifest.webmanifest",
  "./icons/us-stock-icon.png"
];

const APP_SCOPE=new URL(self.registration.scope);
const DATA_PREFIX=APP_SCOPE.pathname+"data/";
const CACHE_BUSTER_PARAM="v";
const DATA_FRESHNESS_NONCE="t";
const PUBLIC_SNAPSHOT_NAMES=new Set(["status.json","market.json","common_snapshot.json","history.json"]);

function inAppScope(url){
  return url.origin===APP_SCOPE.origin && url.pathname.startsWith(APP_SCOPE.pathname);
}
function isData(url){
  return inAppScope(url) && url.pathname.startsWith(DATA_PREFIX);
}
function canonicalDataKey(request){
  const url=new URL(request.url);
  // Ignore only documented freshness nonces; preserve all semantic query parameters.
  url.searchParams.delete(CACHE_BUSTER_PARAM);
  const name=url.pathname.startsWith(DATA_PREFIX)?url.pathname.slice(DATA_PREFIX.length):"";
  const stamp=url.searchParams.get(DATA_FRESHNESS_NONCE)||"";
  if(PUBLIC_SNAPSHOT_NAMES.has(name)&&/^\d{13}$/.test(stamp)&&url.searchParams.getAll(DATA_FRESHNESS_NONCE).length===1){
    url.searchParams.delete(DATA_FRESHNESS_NONCE);
  }
  return new Request(url.href,{method:"GET",headers:request.headers});
}
async function ownMatch(key){
  try{return await (await caches.open(CACHE)).match(key)}
  catch(_){return undefined}
}
async function storeResponse(key,response){
  if(!response.ok||response.redirected)return;
  try{await (await caches.open(CACHE)).put(key,response.clone())}
  catch(_){/* Cache is best effort; a successful network response remains usable. */}
}

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
      .then(keys=>Promise.all(
        keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE)
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

async function networkFirstData(request){
  const key=canonicalDataKey(request);
  try{
    const response=await fetch(request,{cache:"no-store"});
    await storeResponse(key,response);
    return response;
  }catch(_){
    return (await ownMatch(key))||Response.error();
  }
}

async function networkFirstShell(request){
  try{
    const response=await fetch(request,{cache:"no-cache"});
    await storeResponse(request,response);
    return response;
  }catch(_){
    return (await ownMatch(request))||Response.error();
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);
  // Never intercept another app, another origin, or non-GET requests.
  if(request.method!=="GET"||!inAppScope(url))return;
  if(isData(url)){
    event.respondWith(networkFirstData(request));
    return;
  }
  event.respondWith(networkFirstShell(request));
});
