"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const ui=require("../docs/unified-ui.js");
const root=path.resolve(__dirname,"../docs/data");
const fixture=n=>JSON.parse(fs.readFileSync(path.join(root,n),"utf8"));
const fresh=()=>({status:fixture("status.json"),market:fixture("market.json"),common:fixture("common_snapshot.json")});

test("existing current public Shadow snapshot validates without creating an action",()=>{
  const {status,market,common}=fresh();
  assert.deepEqual(ui.validate(status,market,common),{ok:true,commonOk:true,reason:null});
  assert.ok(common.decision_items.every(x=>x.formal_action===null));
});
test("five tickers have stable explicit order and reference text",()=>{
  const {status,market}=fresh();
  const html=ui.render(status,market,()=>({shortTerm:"上向き"}));
  const found=[...html.matchAll(/data-unified-ticker="([A-Z]+)"/g)].map(x=>x[1]);
  assert.deepEqual(found,ui.TICKERS);
  assert.match(html,/正式な売買判断ではありません/);
  assert.doesNotMatch(html,/詳細ダイジェスト|unified-legacy|digest-stock/);
  assert.equal((html.match(/class="unified-row"/g)||[]).length,5);
  assert.ok(!html.includes("BUY")&&!html.includes("SELL")&&!html.includes("formal_action="));
});
test("NO_CHANGE is a saved reference, not an incident or new current action",()=>{
  const {status,market,common}=fresh();
  status.run_state="NO_CHANGE";
  assert.equal(ui.validate(status,market,common).ok,true);
});
test("missing price trend remains unknown instead of neutral",()=>{
  const {status,market}=fresh();
  market.stocks[0].trend=null;
  const html=ui.render(status,market,()=>({shortTerm:"中立"}));
  assert.match(html,/参考状態未確認/);
});
test("missing independent Common data can only be shown with explicit warning",()=>{
  const {status,market}=fresh();
  const result=ui.validate(status,market,null);
  assert.equal(result.ok,true);
  assert.equal(result.commonOk,false);
  assert.match(ui.notice(status,result.commonOk,"2026-10-26"),/共通判断スナップショットが未取得/);
});
test("SHADOW-only boundary rejects operational promotion",()=>{
  const {status,market,common}=fresh();status.app_state="PRODUCTION";
  assert.equal(ui.validate(status,market,common).ok,false);
});
test("rejects broken stock date or missing stock, never recomputes missing data",()=>{
  const {status,market,common}=fresh();market.stocks[0].trade_date="2026-10-22";
  assert.equal(ui.validate(status,market,common).ok,false);
  const another=fresh();another.market.stocks.pop();
  assert.equal(ui.validate(another.status,another.market,another.common).ok,false);
});
test("rejects duplicate and unexpected ticker",()=>{
  const f=fresh();f.market.stocks[4].ticker="PLTR";
  assert.equal(ui.validate(f.status,f.market,f.common).ok,false);
  const k=fresh();k.market.stocks[4].ticker="ZZZZ";
  assert.equal(ui.validate(k.status,k.market,k.common).ok,false);
});
test("rejects missing, impossible or manipulated prices",()=>{
  const f=fresh();f.market.stocks[1].close=null;
  assert.equal(ui.validate(f.status,f.market,f.common).ok,false);
  const k=fresh();k.market.stocks[1].close=-1;
  assert.equal(ui.validate(k.status,k.market,k.common).ok,false);
});
test("rejects common mismatched timestamp and non-null formal action",()=>{
  const f=fresh();f.common.timestamps.market_as_of="2026-10-22";
  assert.equal(ui.validate(f.status,f.market,f.common).ok,false);
  const k=fresh();k.common.decision_items[0].formal_action="BUY";
  assert.equal(ui.validate(k.status,k.market,k.common).ok,false);
});
test("rejects mismatch in public completeness",()=>{
  const f=fresh();f.status.quality.completeness="4/5";
  assert.equal(ui.validate(f.status,f.market,f.common).ok,false);
});
test("unconfirmed independent source, QC and HOLD always warn",()=>{
  const f=fresh();f.status.run_state="HOLD";f.status.quality.qc="FAIL";
  f.status.quality.source_crosscheck="PENDING";
  const warning=ui.notice(f.status,true,"2026-10-26");
  assert.match(warning,/保留中/);assert.match(warning,/データ品質/);assert.match(warning,/独立出典照合/);
});
test("age uses calendar days, never an assumed trading calendar",()=>{
  assert.equal(ui.calendarAge("2026-10-23","2026-10-26"),3);
  assert.match(ui.notice(fresh().status,true,"2026-11-05"),/13暦日前/);
  assert.match(ui.notice(fresh().status,true,"2026-10-20"),/保存市場日を確認できません/);
});
test("ticker names are escaped and not executed",()=>{
  const f=fresh();f.market.stocks[0].name='<img src=x onerror="attack()">';
  const html=ui.render(f.status,f.market,()=>({shortTerm:"上昇優勢"}));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
});
test("only existing public data and no new market fetch introduced",()=>{
  const p=fs.readFileSync(path.resolve(__dirname,"../docs/unified-ui.js"),"utf8");
  assert.ok(!/fetch\s*\(|axios|new WebSocket|localStorage|indexedDB|caches\.delete/i.test(p));
  assert.match(p,/正式な売買判断ではありません/);
});
