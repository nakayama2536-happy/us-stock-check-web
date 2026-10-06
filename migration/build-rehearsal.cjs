'use strict';
// Builds only a disposable worker/storage rehearsal. NOT the approved five-tab UI port.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function patchOnce(s,from,to){if(s.split(from).length!==2)throw Error('Unreviewed source boundary');return s.replace(from,to);}
function candidateWorker(source){
 let s=patchOnce(source,'const CACHE="us-stock-check-v0.9.8-cache1";','const CACHE="us-stock-check-v0.9.8-migration-rehearsal1";');
 s=patchOnce(s,'  url.searchParams.delete(CACHE_BUSTER_PARAM);',`  url.searchParams.delete(CACHE_BUSTER_PARAM);
  // t was the regular app's timestamp nonce. Only numeric legacy values on
  // reviewed data endpoints are freshness, never arbitrary semantic queries.
  if(legacyDataPath(url)&&/^\\d{1,16}$/.test(url.searchParams.get('t')||''))url.searchParams.delete('t');`);
 const start=s.indexOf('self.addEventListener("activate"'),end=s.indexOf('async function networkFirstData',start);
 if(start<0||end<0)throw Error('Activation boundary missing');
 s=s.slice(0,start)+`const PREVIOUS_CACHE="us-stock-check-v0.9.8-cache1";
const MIGRATION_FILES=new Set(['status.json','market.json','history.json','common_snapshot.json']);
function legacyDataPath(url){return isData(url)&&MIGRATION_FILES.has(url.pathname.slice(DATA_PREFIX.length));}
async function migrateSavedData(){
  if(!(await caches.keys()).includes(PREVIOUS_CACHE))return;
  const old=await caches.open(PREVIOUS_CACHE),next=await caches.open(CACHE),selected=new Map();
  for(const request of await old.keys()){
    const u=new URL(request.url);if(request.method!=='GET'||!legacyDataPath(u))continue;
    const response=await old.match(request);if(!response||!response.ok||response.redirected)continue;
    const key=canonicalDataKey(request),stamp=Math.max(Number(u.searchParams.get('t'))||0,Number(u.searchParams.get('v'))||0);
    const previous=selected.get(key.url);
    if(!previous||stamp>previous.stamp)selected.set(key.url,{key,response,stamp});
  }
  for(const {key,response} of selected.values()){
    // New worker may already have a network-fetched response: never overwrite it.
    if(!await next.match(key))await next.put(key,response.clone());
  }
}
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    // Do not delete the source cache if copying fails (quota, interrupted storage).
    await migrateSavedData();
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

`+s.slice(end);
 return s;
}
function build(output){
 const out=path.resolve(output);if(out===root||out.startsWith(path.join(root,'docs')))throw Error('Output must not overwrite the published site');
 fs.mkdirSync(out,{recursive:true});
 for(const name of ['index.html','app.js','style.css','sw.js','manifest.webmanifest','icons/us-stock-icon.png','data/status.json','data/market.json','data/history.json','data/common_snapshot.json']){
  const dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'docs',name),dest);
 }
 fs.writeFileSync(path.join(out,'sw.js'),candidateWorker(fs.readFileSync(path.join(root,'docs/sw.js'),'utf8')));
 const app=fs.readFileSync(path.join(root,'docs/app.js'),'utf8');
 fs.writeFileSync(path.join(out,'app.js'),patchOnce(app,'path+`?t=${Date.now()}`','path+`?v=${Date.now()}`'));
 return out;
}
if(require.main===module){if(!process.argv[2])throw Error('Specify a disposable output directory');console.log(build(process.argv[2]));}
module.exports={build,candidateWorker};
