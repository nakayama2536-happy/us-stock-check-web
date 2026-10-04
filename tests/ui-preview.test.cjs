'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.join(__dirname,'../docs/preview/s1');
const P=require(path.join(root,'preview.js'));
const files=Object.fromEntries(Object.keys(P.PINS).map(k=>[k,fs.readFileSync(path.join(root,k),'utf8')]));
for(const [name,expected] of Object.entries(P.PINS))test('pinned preview blob: '+name,async()=>{
  const b=fs.readFileSync(path.join(root,name));
  const hash=crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
  assert.equal(hash,expected);assert.equal(await P.blobHash(b),expected);
});
test('assembled preview has executable scripts but no network loader or worker registration',()=>{
  const html=P.makeDocument(files);
  assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes('allow-same-origin'));
  assert.ok(!/\bfetch\s*\(|serviceWorker\.register|<script\b[^>]*\bsrc=|<link\b/i.test(html));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);
  assert.ok(html.includes('固定データを再表示'));assert.ok(!html.includes('UI候補・未公開'));
});
test('wrapper is sandboxed without origin/storage/parent privileges',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes('sandbox="allow-scripts"'));assert.ok(!html.includes('allow-same-origin'));
  assert.ok(html.includes('UI確認専用'));assert.ok(html.includes('固定データ'));
});
test('source mismatch cannot silently patch a different legacy UI',()=>{
  assert.throws(()=>P.makeDocument({...files,'reference/app.js':'unexpected source'}));
});
test('frozen data belongs to the disclosed date and five-target set',()=>{
  const s=JSON.parse(files['data/status.json']),m=JSON.parse(files['data/market.json']),c=JSON.parse(files['data/common_snapshot.json']);
  assert.equal(s.us_trade_date,'2026-10-02');assert.equal(s.generated_at_jst,'2026-10-04T17:36:25+09:00');
  assert.deepEqual(m.stocks.map(x=>x.ticker),['PLTR','LLY','BSY','MSTR','SOXL']);
  assert.equal(c.timestamps.calculated_at,s.generated_at_jst);
});
test('public-only static JSON excludes personal and credential fields recursively',()=>{
  const denied=new Set(['shares','quantity','position_size','average_cost','cost_basis','purchase_price','account_type','position_id','planned_total_shares','stage_size','completed_stages','max_stages','brokerage_account','portfolio_id','api_key','apikey','access_token','token','password','secret']);
  function visit(x){if(Array.isArray(x))return x.forEach(visit);if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){assert.ok(!denied.has(k.toLowerCase()),'Private field: '+k);visit(v);}}
  for(const name of Object.keys(files).filter(x=>x.endsWith('.json')))visit(JSON.parse(files[name]));
});
