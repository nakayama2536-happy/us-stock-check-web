'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.join(__dirname,'../docs/preview/device'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('nested public delivery and embedded UI JSON exclude private record fields',()=>{
 const denied=new Set(['shares','quantity','position_size','average_cost','cost_basis','purchase_price','account_type','position_id','planned_total_shares','stage_size','completed_stages','max_stages','opened_at','closed_at','brokerage_account','brokerage_account_id','portfolio_id','api_key','apikey','access_token','token','password','secret']);
 function visit(x){if(Array.isArray(x))return x.forEach(visit);if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){assert.ok(!denied.has(k.toLowerCase()),'Private field: '+k);visit(v);}}
 const m=JSON.parse(read('delivery/current.json'));
 for(const name of Object.keys(m.files))visit(JSON.parse(read('delivery/releases/'+m.release+'/'+name)));
 for(const[name,text]of Object.entries(JSON.parse(read('assets.json'))))if(name.endsWith('.json'))visit(JSON.parse(text));
});
test('all shipped runtime files and delivery bytes are pinned',()=>{
 const b=JSON.parse(read('BUILD.json')),m=JSON.parse(read('delivery/current.json'));
 for(const[n,digest]of Object.entries(b.sha256))assert.equal(sha(fs.readFileSync(path.join(root,n))),digest,n);
 assert.equal(m.release,b.release);assert.equal(m.source_revision,b.producer_revision);
 for(const[n,meta]of Object.entries(m.files)){const bytes=fs.readFileSync(path.join(root,'delivery/releases',m.release,n));assert.equal(bytes.length,meta.bytes);assert.equal(sha(bytes),meta.sha256);}
 const manifest=JSON.parse(read('manifest.webmanifest'));for(const key of ['id','scope','start_url'])assert.equal(manifest[key],'/us-stock-check-web/preview/device/');
});
test('worker activation can only delete obsolete device shell; fetch bypasses normal and delivery paths',async()=>{
 const events={},deleted=[],scope='https://example.test/us-stock-check-web/preview/device/';
 const context={URL,Promise,Error,self:{registration:{scope},clients:{claim:async()=>{}},addEventListener:(n,f)=>events[n]=f},caches:{keys:async()=>['us-stock-check-v0.9.8-cache1','us-stock-check-delivery-v1','other-app','us-stock-device-delivery-v1','us-stock-device-shell-old'],delete:async k=>deleted.push(k)}};
 vm.runInNewContext(read('sw.js'),context);
 let completed;events.activate({waitUntil:p=>completed=p});await completed;assert.deepEqual(deleted,['us-stock-device-shell-old']);
 for(const url of ['https://example.test/us-stock-check-web/','https://example.test/us-stock-check-web/data/market.json',scope+'delivery/current.json','https://other.test/us-stock-check-web/preview/device/index.html']){
  let intercepted=false;events.fetch({request:{method:'GET',url},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
 }
 assert.throws(()=>vm.runInNewContext(read('sw.js'),{...context,self:{...context.self,registration:{scope:'https://example.test/us-stock-check-web/'}}}),/Unexpected preview scope/);
});
