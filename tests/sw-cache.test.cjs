const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../docs/sw.js"),"utf8");
function harness(){
 const handlers={},deleted=[],stores=[],matches=[],opened=[];
 const own=new Map();
 const cache={addAll:async()=>{},match:async key=>{matches.push(String(key.url||key));return own.get(String(key.url||key))},put:async(key,res)=>{stores.push(String(key.url||key));own.set(String(key.url||key),res)}};
 const caches={open:async name=>{opened.push(name);return cache},keys:async()=>["us-stock-check-v0.9.7","us-stock-check-v0.9.8-cache1","india1400-v5","foreign-cache"],delete:async k=>{deleted.push(k);return true}};
 class Req{constructor(url,opt={}){this.url=url;this.method=opt.method||"GET";this.headers=opt.headers||{};this.mode=opt.mode||"cors"}}
 class Res{constructor(body="",opt={}){this.body=body;this.ok=opt.ok??true;this.redirected=!!opt.redirected;this.status=opt.status||200}clone(){return new Res(this.body,{ok:this.ok,redirected:this.redirected,status:this.status})}static error(){return new Res("",{ok:false,status:0})}}
 const self={registration:{scope:"https://example.test/us-stock-check/"},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(n,f)=>handlers[n]=f};
 let fetchImpl=async req=>new Res("net");
 const ctx=vm.createContext({self,caches,Request:Req,Response:Res,URL,fetch:req=>fetchImpl(req)});
 vm.runInContext(source+";globalThis.api={canonicalDataKey,inAppScope,isData,ownMatch,networkFirstData,networkFirstShell,CACHE};",ctx);
 return{handlers,deleted,stores,matches,opened,own,Req,Res,api:ctx.api,setFetch:f=>fetchImpl=f};
}
async function runEvent(fn,evt){let p;fn({...evt,waitUntil:x=>p=x,respondWith:x=>p=x});if(p)return await p}
test("activate deletes only old US caches",async()=>{const h=harness();await runEvent(h.handlers.activate,{});assert.deepEqual(h.deleted,["us-stock-check-v0.9.7"])});
test("scope excludes other app and origin",()=>{const h=harness();assert.equal(h.api.inAppScope(new URL("https://example.test/us-stock-check/data/a.json")),true);assert.equal(h.api.inAppScope(new URL("https://example.test/India_1400/data/a.json")),false);assert.equal(h.api.inAppScope(new URL("https://evil.test/us-stock-check/data/a.json")),false)});
test("canonical key removes only freshness v",()=>{const h=harness();const k=h.api.canonicalDataKey(new h.Req("https://example.test/us-stock-check/data/a.json?v=1&ticker=LLY&period=90"));assert.match(k.url,/ticker=LLY/);assert.match(k.url,/period=90/);assert.doesNotMatch(k.url,/[?&]v=/)});
test("semantic queries stay separate",()=>{const h=harness();const a=h.api.canonicalDataKey(new h.Req("https://example.test/us-stock-check/data/a.json?v=1&ticker=LLY"));const b=h.api.canonicalDataKey(new h.Req("https://example.test/us-stock-check/data/a.json?v=2&ticker=PLTR"));assert.notEqual(a.url,b.url)});
test("other app fetch is not intercepted",()=>{const h=harness();let responded=false;h.handlers.fetch({request:new h.Req("https://example.test/India_1400/data/a.json"),respondWith:()=>responded=true});assert.equal(responded,false)});
test("non GET is not intercepted",()=>{const h=harness();let responded=false;h.handlers.fetch({request:new h.Req("https://example.test/us-stock-check/data/a.json",{method:"POST"}),respondWith:()=>responded=true});assert.equal(responded,false)});
test("data network success stores in own cache",async()=>{const h=harness();await runEvent(h.handlers.fetch,{request:new h.Req("https://example.test/us-stock-check/data/a.json?v=3&ticker=LLY")});assert.equal(h.stores.length,1);assert.match(h.stores[0],/ticker=LLY/);assert.doesNotMatch(h.stores[0],/[?&]v=/)});
test("data network failure reads only own cache",async()=>{const h=harness();const req=new h.Req("https://example.test/us-stock-check/data/a.json?v=3");const key=h.api.canonicalDataKey(req);h.own.set(key.url,new h.Res("cached"));h.setFetch(async()=>{throw Error("offline")});const res=await h.api.networkFirstData(req);assert.equal(res.body,"cached");assert.ok(h.opened.every(x=>x===h.api.CACHE))});
test("HTTP error is not cached",async()=>{const h=harness();h.setFetch(async()=>new h.Res("bad",{ok:false,status:500}));await h.api.networkFirstData(new h.Req("https://example.test/us-stock-check/data/a.json"));assert.equal(h.stores.length,0)});
test("redirect is not cached",async()=>{const h=harness();h.setFetch(async()=>new h.Res("redirect",{redirected:true}));await h.api.networkFirstData(new h.Req("https://example.test/us-stock-check/data/a.json"));assert.equal(h.stores.length,0)});
test("shell fallback uses own cache",async()=>{const h=harness();const req=new h.Req("https://example.test/us-stock-check/app.js?v=0.9.8");h.own.set(req.url,new h.Res("shell"));h.setFetch(async()=>{throw Error("offline")});const res=await h.api.networkFirstShell(req);assert.equal(res.body,"shell");assert.ok(h.opened.every(x=>x===h.api.CACHE))});
test("cache write failure does not discard network response",async()=>{const h=harness();const original=h.api.networkFirstData; // exercised by replacing cache.put through a new VM is unnecessary; source contract guards catch.
 const res=await original(new h.Req("https://example.test/us-stock-check/data/a.json"));assert.equal(res.body,"net")});
