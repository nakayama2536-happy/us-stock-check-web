'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.join(__dirname,'../docs/preview/device'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const adapter=require(path.join(root,'preview-adapter.js'));
test('device uses the reviewed S1 quality-scope display assets without replacing other assets',()=>{
 const {qualityScopeAssets}=require('../scripts/build-device-preview.cjs');
 const assets=JSON.parse(read('assets.json')),before=JSON.stringify(assets),updated=qualityScopeAssets(assets);
 for(const name of ['candidate/experience.js','judgment-cards.js'])assert.equal(assets[name],fs.readFileSync(path.join(__dirname,'../docs/preview/s1',name),'utf8'));
 assert.match(assets['candidate/experience.js'],/data-quality-scope/);
 assert.match(assets['judgment-cards.js'],/保存時の終値照合/);
 assert.equal(JSON.stringify(assets),before);assert.deepEqual(updated,assets);
 assert.throws(()=>qualityScopeAssets({...assets,'judgment-cards.js':'unreviewed'}),/Unreviewed quality-scope asset/);
 for(const [name,value]of Object.entries(assets))if(!['candidate/experience.js','judgment-cards.js'].includes(name))assert.equal(updated[name],value);
});
function consultationFiles(){
 const manifest=JSON.parse(read('delivery/current.json'));
 return {...JSON.parse(read('assets.json')),...Object.fromEntries(Object.keys(manifest.files).map(n=>['data/'+n,read('delivery/releases/'+manifest.release+'/'+n)])),
  'data/chart-history.json':JSON.stringify({basis_date:'2026-10-02',series:{},note:'観測終値履歴は未接続。'}),_delivery:manifest,_hashes:{}};
}
function consultation(files=consultationFiles()){
 const text=adapter.consultationText(files,'diagnostic','ALL');return JSON.parse(text.slice(text.indexOf('{')));
}
function packageAt(at,files=consultationFiles()){
 const pack=adapter.consultationPackage(files,'diagnostic','ALL',new Date(at));
 const parse=t=>JSON.parse(t.slice(t.indexOf('{')));
 return {pack,brief:parse(pack.summary),full:parse(pack.full)};
}
test('old fixed data keeps recorded PASS and zero warnings but exports a separate stale assessment',()=>{
 const files=consultationFiles(),before=JSON.stringify(files),{brief,full,pack}=packageAt('2026-10-14T14:13:24.370Z',files);
 assert.equal(full.freshness.data_kind,'FIXED_PREVIEW');assert.equal(full.freshness.auto_updates_market_data,false);
 assert.equal(full.freshness.age_calendar_days,12);assert.equal(full.freshness.state,'STALE');
 assert.equal(full.freshness.evaluated_at,'2026-10-14T14:13:24.370Z');assert.equal(full.freshness.clock,'DEVICE_CLOCK');
 assert.equal(full.quality_scope,'RECORDED_AT_GENERATION');assert.equal(full.quality.qc,'PASS');
 assert.deepEqual(full.recorded_warnings,[]);assert.equal(brief.warning_count,0);
 assert.deepEqual(brief.freshness,full.freshness);assert.deepEqual(brief.timestamp_meanings,full.timestamp_meanings);
 assert.equal(full.status.generated_at_jst,'2026-10-04T23:37:44+09:00');
 assert.match(brief.timestamp_meanings.verified_at,/株価更新日時ではありません/);
 assert.ok(pack.summary.length<=8000);assert.equal(JSON.stringify(files),before);
});
test('freshness uses the existing 4-calendar-day limit at the JST midnight boundary',()=>{
 const {full:a}=packageAt('2026-10-06T14:59:59.999Z'),{full:b}=packageAt('2026-10-06T15:00:00.000Z');
 assert.equal(a.freshness.age_calendar_days,4);assert.equal(a.freshness.state,'WITHIN_AGE_LIMIT');
 assert.equal(b.freshness.age_calendar_days,5);assert.equal(b.freshness.state,'STALE');
 assert.equal(a.freshness.stale_after_calendar_days,4);assert.equal(a.freshness.calendar_timezone,'Asia/Tokyo');
});
test('freshness never silently treats missing invalid or future dates as fresh',()=>{
 for(const date of [null,'','2026-02-30','2026-13-02','2026-10-02<script>']){
  const files=consultationFiles();files['data/status.json']=JSON.stringify({...JSON.parse(files['data/status.json']),us_trade_date:date});
  const {full}=packageAt('2026-10-14T12:00:00Z',files);
  assert.equal(full.freshness.state,'DATE_UNKNOWN');assert.equal(full.freshness.basis_date,null);assert.equal(full.freshness.age_calendar_days,null);
 }
 const {full:future}=packageAt('2026-10-01T00:00:00Z');assert.equal(future.freshness.state,'FUTURE_DATE');
 const {full:badClock}=packageAt('invalid');assert.equal(badClock.freshness.state,'CLOCK_UNKNOWN');assert.equal(badClock.freshness.evaluated_at,null);
});
test('new file verification time cannot make old market input fresh',()=>{
 const files=consultationFiles();files._delivery.verified_at='2026-10-14T14:13:24.370Z';
 const {full}=packageAt('2026-10-14T14:13:24.370Z',files);
 assert.equal(full.freshness.state,'STALE');assert.equal(full.freshness.age_calendar_days,12);
 assert.equal(full.delivery_manifest.verified_at,files._delivery.verified_at);
});
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
 assert.deepEqual(brief.freshness,full.freshness);assert.equal(brief.quality_scope,full.quality_scope);
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
test('device install requests fresh shell bytes and does not activate after an incomplete download',async()=>{
 const scope='https://example.test/us-stock-check-web/preview/device/';
 for(const fail of [false,true]){
  const events={};let requested,activated=false,completed;
  const context={URL,Request,Promise,Error,
   self:{registration:{scope},addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>{activated=true;}},
   caches:{open:async()=>({addAll:async requests=>{requested=requests;if(fail)throw Error('Download failed');}})}};
  vm.runInNewContext(read('sw.js'),context);
  events.install({waitUntil:p=>completed=p});
  if(fail)await assert.rejects(completed,/Download failed/);else await completed;
  assert.equal(activated,!fail);
  assert.ok(requested.length>0);
  for(const r of requested){assert.equal(r.cache,'reload');assert.ok(r.url.startsWith(scope));assert.ok(!r.url.includes('/delivery/'));}
 }
});
