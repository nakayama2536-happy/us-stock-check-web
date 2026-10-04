'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../docs/preview/s1');
const R=require(path.join(root,'research.js')),P=require(path.join(root,'preview.js'));
const files=Object.fromEntries(Object.keys(P.PINS).map(k=>[k,fs.readFileSync(path.join(root,k),'utf8')]));
const market=JSON.parse(files['data/market.json']),history=JSON.parse(files['data/chart-history.json']);
test('all five charts bind to displayed ticker date and close',()=>{
 for(const s of market.stocks){const rows=R.rowsFor(s,history);assert.ok(rows.length>=2);assert.equal(rows.at(-1).close,s.close);assert.ok(R.chartHtml(s,history).includes('保存終値'));}
});
test('missing duplicate invalid and mismatched history cannot draw misleading charts',()=>{
 const s=market.stocks[0];
 for(const mutate of [h=>h.series.PLTR.push(h.series.PLTR.at(-1)),h=>h.series.PLTR[0].close=null,h=>h.series.PLTR[0].date='2026-02-30',h=>h.series.PLTR.at(-1).close++,h=>h.basis_date='2026-09-30']){
  const h=structuredClone(history);mutate(h);assert.deepEqual(R.rowsFor(s,h),[]);assert.ok(!R.chartHtml(s,h).includes('<svg'));
 }
});
test('consultation requests reject foreign windows wrong origins extra fields and invented ticker',()=>{
 const source={},frame={contentWindow:source},event={source,origin:'null',data:{type:'US_PREVIEW_CONSULT',kind:'analysis',ticker:'PLTR'}};
 assert.ok(P.consultationRequest(event,frame));
 for(const e of [{...event,source:{}},{...event,origin:'https://evil.example'},{...event,data:{...event.data,text:'injected'}},{...event,data:{...event.data,ticker:'ALL'}},{...event,data:{...event.data,ticker:'BAD'}}])assert.ok(!P.consultationRequest(e,frame));
});
test('analysis exports only chosen stock with dates evidence and bounded public fields',()=>{
 const m=structuredClone(market);m.stocks[0].account_number='PRIVATE_CANARY';m.stocks[0].structural_growth.secret='PRIVATE_CANARY';
 const f={...files,'data/market.json':JSON.stringify(m)};
 const result=P.consultationText(f,'analysis','PLTR');
 assert.ok(!result.includes('PRIVATE_CANARY'));assert.ok(result.includes('source_commit'));assert.ok(result.includes('2026-10-02'));assert.ok(!result.includes('"requested_ticker": "LLY"'));assert.ok(result.includes('完全な計算履歴ではありません'));
});
test('diagnostics keep five target identities and disclose duplicate missing data',()=>{
 const m=structuredClone(market);m.stocks=m.stocks.filter(s=>s.ticker!=='MSTR');m.stocks.push(m.stocks[0]);
 const out=P.consultationText({...files,'data/market.json':JSON.stringify(m)},'diagnostic','ALL');
 assert.ok(out.includes('"matching_rows": 0'));assert.ok(out.includes('"matching_rows": 2'));assert.equal((out.match(/requested_ticker/g)||[]).length,5);
});
test('periods describe implemented calculation windows not return horizons',()=>{
 const src=files['judgment-cards.js'];assert.ok(src.includes('12・26営業日'));assert.ok(src.includes('50・200営業日'));assert.ok(src.includes('シグナル9営業日'));assert.ok(src.includes('予測先ではありません'));
});

test('consultation retains published PEG and dated fundamental provenance',()=>{
 const out=P.consultationText(files,'analysis','PLTR');
 assert.ok(out.includes('"peg_ratio": 1.86'));assert.ok(out.includes('"fundamental_source"'));assert.ok(out.includes('"fundamental_last_updated"'));
 assert.ok(R.chartHtml(market.stocks[0],history).includes('独立照合が未確認'));
});
