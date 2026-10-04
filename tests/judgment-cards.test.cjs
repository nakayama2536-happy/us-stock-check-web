"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../docs/preview/s1');
const U=require(path.join(root,'candidate/experience.js'));
const J=require(path.join(root,'judgment-cards.js'));
const P=require(path.join(root,'preview.js'));
const source=['status','market','common_snapshot'].map(n=>JSON.parse(fs.readFileSync(path.join(root,'data/'+n+'.json'),'utf8')));
function fixture(){return structuredClone(source);}
const model=f=>U.model(...f,{now:new Date('2026-10-04T18:30:00+09:00')});
test('Japan-like judgment structure retains five expected securities',()=>{
  const html=J.summaryHtml(model(fixture()));
  assert.equal((html.match(/data-judgment-card=/g)||[]).length,5);
  for(const label of ['パランティア','イーライリリー','ベントレー・システムズ','ストラテジー','半導体ブル3倍ETF'])assert.ok(html.includes(label));
  assert.ok(html.includes('5銘柄の状態・テクニカル'));
});
test('each security has short medium RSI tiles not business-day predictions',()=>{
  const html=J.summaryHtml(model(fixture()));assert.equal((html.match(/class="usj-indicator"/g)||[]).length,15);
  assert.ok(!/1日|3日|5日|14日|保有継続|>待機</.test(html));
  assert.ok(html.includes('営業日予測や売買指示ではありません'));
});
test('existing numbers and analysis state are rendered without recalculation',()=>{
  const m=model(fixture());const row=m.rows[0],v=J.rowView(row,m);
  assert.equal(v.price,'$188.75');assert.equal(v.change,'-0.68%');assert.equal(v.badge,row.signals.shortTerm);
  assert.equal(v.cells[0].detail,row.signals.shortTerm);assert.equal(v.cells[1].detail,row.signals.midTerm);
  assert.equal(v.cells[2].value,'61.2');assert.equal(v.cells[2].detail,row.signals.heat);
});
test('exact independently compared close can display match',()=>{
  const m=model(fixture());assert.equal(J.rowView(m.rows[0],m).check.label,'照合一致');
});
test('missing per-stock source evidence cannot borrow aggregate PASS',()=>{
  const f=fixture();delete f[1].stocks[0].shadow_close_diff_pct;const m=model(f);
  assert.equal(J.rowView(m.rows[0],m).check.label,'照合未確認');
});
test('nonzero difference does not invent a tolerance or match',()=>{
  const f=fixture();f[1].stocks[0].shadow_close_diff_usd=.01;f[1].stocks[0].shadow_close_diff_pct=.01;
  const m=model(f);assert.equal(J.rowView(m.rows[0],m).check.label,'照合差分あり');
});
test('pending independent comparison is not green',()=>{
  const f=fixture();f[0].quality.source_crosscheck='PENDING';f[2].data_quality.source_crosscheck='PENDING';
  const m=model(f);assert.equal(J.rowView(m.rows[0],m).check.label,'照合待ち');
});
test('source identity mismatch does not display match',()=>{
  const f=fixture();f[2].timestamps.calculated_at='2026-10-04T10:00:00+09:00';const m=model(f);
  assert.equal(J.rowView(m.rows[0],m).check.label,'照合未確認');
});
test('missing security keeps denominator 5 and unknown tiles',()=>{
  const f=fixture();f[1].stocks=f[1].stocks.filter(s=>s.ticker!=='MSTR');const m=model(f),v=J.rowView(m.rows[3],m);
  assert.match(J.summaryHtml(m),/4\/5取得/);assert.equal(v.badge,'データ要確認');assert.equal(v.price,'未確認');
  assert.deepEqual(v.cells.map(c=>c.value),['—','—','—']);
});
test('unknown technical axes never become WAIT or neutral',()=>{
  const f=fixture();const s=f[1].stocks[0];s.trend=null;s.macd_state=null;s.ma_state=null;s.rsi14=null;
  const m=model(f),v=J.rowView(m.rows[0],m);assert.equal(v.badge,'未確認');assert.deepEqual(v.cells.map(c=>c.value),['—','—','—']);
});
test('zero RSI is valid and null RSI is not zero',()=>{
  const f=fixture();f[1].stocks[0].rsi14=0;let m=model(f);assert.equal(J.rowView(m.rows[0],m).cells[2].value,'0.0');
  f[1].stocks[0].rsi14=null;m=model(f);assert.equal(J.rowView(m.rows[0],m).cells[2].value,'—');
});
test('HOLD warning is retained across render facade',()=>{
  const f=fixture();f[0].run_state='HOLD';const m=model(f);
  const elements={globalDataNotice:{},digest:{},qualityDigest:{}};
  J.renderState(m,{getElementById:id=>elements[id]});
  assert.equal(elements.globalDataNotice.hidden,false);assert.match(elements.globalDataNotice.textContent,/HOLD/);
  assert.match(elements.digest.innerHTML,/data-judgment-card/);assert.match(elements.qualityDigest.innerHTML,/HOLD/);
});
test('no source data or model mutation',()=>{
  const f=fixture(),m=model(f),before=JSON.stringify({f,m});J.summaryHtml(m);assert.equal(JSON.stringify({f,m}),before);
});
test('dynamic company name is escaped',()=>{
  const f=fixture();f[1].stocks[0].name='\"><img src=x onerror=alert(1)>';const html=J.summaryHtml(model(f));
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});
test('price and direction colors follow existing red-up blue-down presentation',()=>{
  assert.deepEqual(J.direction('上昇優勢'),['↑↑','up']);assert.deepEqual(J.direction('下降優勢'),['↓↓','down']);
  const css=fs.readFileSync(path.join(root,'judgment-cards.css'),'utf8');
  assert.ok(css.includes('.usj-up{color:#a62b2b}'));assert.ok(css.includes('.usj-down{color:#1968a6}'));
});
test('both row links describe implemented detail views, not unimplemented AI export',()=>{
  const html=J.summaryHtml(model(fixture()));assert.equal((html.match(/data-open-evidence=/g)||[]).length,5);
  assert.ok(html.includes('この銘柄を詳しく見る'));assert.ok(html.includes('根拠・監視ライン'));assert.ok(!html.includes('相談文をコピー'));
});
test('assembled preview includes facade with no external loader or SW inside sandbox',()=>{
  const files=Object.fromEntries(Object.keys(P.PINS).map(k=>[k,fs.readFileSync(path.join(root,k),'utf8')]));
  const html=P.makeDocument(files);assert.ok(html.includes('jp-cards.4'));assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!/\bfetch\s*\(|serviceWorker\.register|allow-same-origin/.test(html));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);
});
test('all allowlisted input hashes match after layout addition',async()=>{
  for(const [name,sha]of Object.entries(P.PINS))assert.equal(await P.blobHash(fs.readFileSync(path.join(root,name))),sha);
  assert.equal(Object.keys(P.PINS).length,14);
});
