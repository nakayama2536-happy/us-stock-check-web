'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {candidateWorker}=require('./build-rehearsal.cjs');
const original=fs.readFileSync(require('node:path').join(__dirname,'../docs/sw.js'),'utf8');
const scope='https://example.test/us-stock-check-web/',oldName='us-stock-check-v0.9.8-cache1';
function harness(source){
 const maps=new Map(),deleted=[],handlers={};let failing=false;
 const key=x=>typeof x==='string'?new URL(x,scope).href:x.url;
 const caches={keys:async()=>[...maps.keys()],delete:async n=>{deleted.push(n);return maps.delete(n)},open:async n=>{
  if(!maps.has(n))maps.set(n,new Map());const m=maps.get(n);
  return {keys:async()=>[...m.keys()].map(u=>new Request(u)),match:async r=>m.get(key(r))?.clone(),put:async(r,v)=>{if(failing&&n.includes('rehearsal'))throw Error('quota');m.set(key(r),v.clone())},addAll:async()=>{}};
 }};
 const self={registration:{scope},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,f)=>handlers[name]=f};
 const ctx=vm.createContext({self,caches,Request,Response,URL,Set,Map,fetch:async()=>{throw Error('offline')}});
 vm.runInContext(source+';globalThis.api={CACHE,canonicalDataKey,networkFirstData};',ctx);
 return {maps,deleted,caches,handlers,api:ctx.api,fail:()=>failing=true,recover:()=>failing=false};
}
async function seed(h,name,url,body){await(await h.caches.open(name)).put(new Request(url),new Response(body));}
async function activate(h){let p;h.handlers.activate({waitUntil:x=>p=x});await p;}
test('reproduces existing t-nonce offline cache miss',async()=>{const h=harness(original);await seed(h,oldName,scope+'data/status.json?t=100','saved');const r=await h.api.networkFirstData(new Request(scope+'data/status.json?t=200'));assert.equal(r.type,'error');});
test('reproduces saved data loss on simple cache version replacement',async()=>{const h=harness(original.replace(oldName,'us-stock-check-v-next'));await seed(h,oldName,scope+'data/status.json?v=100','saved');await activate(h);assert.ok(!h.maps.has(oldName));assert.equal((await h.api.networkFirstData(new Request(scope+'data/status.json?v=200'))).type,'error');});
test('migrates freshest legacy values for four endpoints and preserves other apps',async()=>{
 const h=harness(candidateWorker(original));
 for(const file of ['status','market','history','common_snapshot']){await seed(h,oldName,scope+'data/'+file+'.json?t=100','old');await seed(h,oldName,scope+'data/'+file+'.json?t=200','latest-'+file);}
 await seed(h,'india1400-v5','https://example.test/India_1400/sentinel','foreign');
 await seed(h,oldName,'https://example.test/India_1400/secret','wrong-scope');
 await activate(h);
 for(const file of ['status','market','history','common_snapshot'])assert.equal(await(await h.api.networkFirstData(new Request(scope+'data/'+file+'.json?v=300'))).text(),'latest-'+file);
 assert.equal(await(await(await h.caches.open('india1400-v5')).match('https://example.test/India_1400/sentinel')).text(),'foreign');
 assert.ok(![...h.maps.get(h.api.CACHE).keys()].some(x=>x.includes('India_1400')));
});
test('retains semantic queries and nonnumeric t, ignores unrelated data paths',async()=>{
 const h=harness(candidateWorker(original));
 for(const ticker of ['PLTR','LLY'])await seed(h,oldName,scope+'data/market.json?t=100&ticker='+ticker,ticker);
 await seed(h,oldName,scope+'data/market.json?t=annual','annual');await seed(h,oldName,scope+'data/private.json?t=100','excluded');await activate(h);
 for(const ticker of ['PLTR','LLY'])assert.equal(await(await h.api.networkFirstData(new Request(scope+'data/market.json?v=200&ticker='+ticker))).text(),ticker);
 assert.equal(await(await h.api.networkFirstData(new Request(scope+'data/market.json?t=annual'))).text(),'annual');
 assert.ok(![...h.maps.get(h.api.CACHE).keys()].some(x=>x.includes('private.json')));
});
test('copy failure preserves source and unrelated caches; retry succeeds',async()=>{
 const h=harness(candidateWorker(original));await seed(h,oldName,scope+'data/market.json?t=100','saved');await h.caches.open('foreign');h.fail();await assert.rejects(activate(h),/quota/);assert.ok(h.maps.has(oldName));assert.ok(h.maps.has('foreign'));assert.deepEqual(h.deleted,[]);h.recover();await activate(h);assert.equal(await(await h.api.networkFirstData(new Request(scope+'data/market.json?v=200'))).text(),'saved');
});
test('migration never overwrites a value already present in target cache',async()=>{
 const h=harness(candidateWorker(original));await seed(h,oldName,scope+'data/status.json?t=200','old');await seed(h,h.api.CACHE,scope+'data/status.json','new');await activate(h);assert.equal(await(await h.api.networkFirstData(new Request(scope+'data/status.json?v=300'))).text(),'new');
});
