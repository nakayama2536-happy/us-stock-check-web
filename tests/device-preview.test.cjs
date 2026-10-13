'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.join(__dirname,'../docs/preview/device'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const adapter=require(path.join(root,'preview-adapter.js'));
function consultationFiles(){
 const manifest=JSON.parse(read('delivery/current.json'));
 return {...JSON.parse(read('assets.json')),...Object.fromEntries(Object.keys(manifest.files).map(n=>['data/'+n,read('delivery/releases/'+manifest.release+'/'+n)])),
  'data/chart-history.json':JSON.stringify({basis_date:'2026-10-02',series:{},note:'観測終値履歴は未接続。'}),_delivery:manifest,_hashes:{}};
}
function consultation(files=consultationFiles()){
 const text=adapter.consultationText(files,'diagnostic','ALL');return JSON.parse(text.slice(text.indexOf('{')));
}
test('device consultation exports real SHADOW and declared acquisition without altering numeric inputs',()=>{
 const files=consultationFiles(),before=JSON.stringify(files),out=consultation(files),market=JSON.parse(files['data/market.json']),capture=JSON.parse(files['data/ohlcv-history.json']);
 assert.equal(out.status.mode,'SHADOW');assert.equal(out.status.app_state,'SHADOW');assert.equal(out.status.mode_source,'app_state');assert.equal(out.status.mode_status,'RECORDED');
 assert.equal(out.acquisition.relationship,'SAME_RUN_DECLARED');assert.ok(!out.limitations.join('').includes('別の取得実行'));
 for(const s of out.securities){const orig=market.stocks.find(x=>x.ticker===s.ticker);
  for(const key of ['trade_date','close','change_pct','rsi14','ma50','ma200','macd','macd_signal','trend','macd_state','ma_state'])assert.equal(s[key],orig[key]);
  assert.deepEqual(s.ohlcv.rows,capture.securities[s.ticker].rows);
  assert.equal(s.coverage.history,'NOT_CONNECTED');
  assert.equal(s.coverage.growth,['MSTR','SOXL'].includes(s.ticker)?'NOT_APPLICABLE':'RECORDED');
 }
 assert.equal(JSON.stringify(files),before);
});
test('unknown or contradictory modes are not invented as SHADOW',()=>{
 for(const [patch,expected,reason] of [[{app_state:null},null,'NOT_RECORDED'],[{mode:'PRODUCTION'},null,'CONFLICT_OR_INVALID'],[{app_state:'BAD'},null,'CONFLICT_OR_INVALID'],[{mode:'SHADOW'},'SHADOW','RECORDED']]){
  const files=consultationFiles(),status={...JSON.parse(files['data/status.json']),...patch};files['data/status.json']=JSON.stringify(status);
  const out=consultation(files);assert.equal(out.status.mode,expected);assert.equal(out.status.mode_status,reason);
 }
});
test('missing acquisition evidence remains unconfirmed',()=>{
 for(const key of ['code_sha','run_id','repository']){
  const files=consultationFiles(),capture=JSON.parse(files['data/ohlcv-history.json']);delete capture.capture[key];files['data/ohlcv-history.json']=JSON.stringify(capture);
  assert.equal(consultation(files).acquisition.relationship,'UNCONFIRMED');
 }
 const files=consultationFiles();delete files._delivery;assert.equal(consultation(files).acquisition.relationship,'UNCONFIRMED');
});
test('missing financial and history data are distinct from scoped exclusions and failures',()=>{
 const files=consultationFiles(),market=JSON.parse(files['data/market.json']);delete market.stocks[0].structural_growth;delete market.stocks[1].structural_growth.axes.financial_growth_quality.eps_growth_ttm_pct;
 files['data/market.json']=JSON.stringify(market);files['data/chart-history.json']='{}';
 const out=consultation(files);assert.equal(out.securities[0].coverage.growth,'NOT_RECORDED');assert.equal(out.securities[0].coverage.financial_metrics,'NOT_RECORDED');
 assert.equal(out.securities[1].coverage.financial_metrics,'PARTIAL');assert.equal(out.securities[0].coverage.history,'NOT_RECORDED');
 files._delivery.source_revision='0'.repeat(40);assert.equal(consultation(files).securities[3].coverage.growth,'NOT_RECORDED');
});
test('summary full text and split copies retain the same diagnostic states',()=>{
 const files=consultationFiles(),pack=adapter.consultationPackage(files,'diagnostic','ALL');
 const brief=JSON.parse(pack.summary.slice(pack.summary.indexOf('{'))),full=JSON.parse(pack.full.slice(pack.full.indexOf('{')));
 assert.deepEqual(brief.status,full.status);assert.deepEqual(brief.acquisition,full.acquisition);
 assert.deepEqual(brief.securities.map(s=>s.coverage),full.securities.map(s=>s.coverage));
 assert.ok(pack.summary.length<=8000);assert.ok(pack.parts.every(x=>x.length<=8000));
 assert.equal(pack.parts.map(x=>x.slice(x.indexOf('\n')+1)).join(''),pack.full);
});
test('device build derives the same consultation patch and rejects repeated application',()=>{
 const {patch}=require('../scripts/device-consultation-contract.cjs'),current=read('preview-adapter.js');
 assert.ok(fs.readFileSync(path.join(__dirname,'../scripts/build-device-preview.cjs'),'utf8').includes("require('./device-consultation-contract.cjs').patch(adapter)"));
 assert.throws(()=>patch(current),/Unreviewed consultation boundary/);
});
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
