'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const U=require('../candidate/experience.js');
const NOW=new Date('2026-10-04T03:00:00Z');
function fixture(){
  const asOf='2026-10-02',calculated='2026-10-04T11:00:00+09:00';
  const status={schema_version:'0.2',app_state:'SHADOW',app_version:'0.9.8',run_state:'NO_CHANGE',us_trade_date:asOf,generated_at_jst:calculated,
    quality:{qc:'PASS',session:'REGULAR',completeness:'5/5',source_crosscheck:'PASS'},warnings:[],errors:[]};
  const market={schema_version:'0.2',stocks:U.TICKERS.map(ticker=>({ticker,name:ticker,signal:'SHADOW',trade_date:asOf,close:123.45,change_pct:0,trend:'上昇',macd_state:'強気',ma_state:'50MA > 200MA',rsi14:55,structural_growth:null})),market_environment:[]};
  const common={schema_version:'1.0',market:'US',timestamps:{market_as_of:asOf,calculated_at:calculated},snapshot:{state:'LAST_VALID'},incident:{level:'NORMAL'},
    data_quality:{qc_state:'PASS',data_state:'FRESH',source_crosscheck:'PASS'},decision_items:U.TICKERS.map(ticker=>({ticker,subject_id:ticker,as_of:asOf,eligibility:'NOT_ELIGIBLE',formal_action:null,analysis_action:null,
      blocking_conditions:[{id:'FORMAL_ENGINE_NOT_IMPLEMENTED',label:'正式判断未実装'}]}))};
  return [status,market,common];
}
const make=(f=fixture(),o={})=>U.model(...f,{now:NOW,...o});
test('five-target NO_CHANGE is reference data, not five incidents',()=>{
  const m=make();assert.equal(m.state,'good');assert.equal(m.received,5);assert.equal(m.otherBlockers,0);assert.equal(m.reasons.length,0);assert.match(m.formalLabel,/未実装/);assert.equal(m.sourceVersionVerified,false);
});
test('missing MSTR never shrinks denominator to 4',()=>{
  const f=fixture();f[1].stocks=f[1].stocks.filter(x=>x.ticker!=='MSTR');f[0].quality.completeness='4/4';const m=make(f);
  assert.equal(m.expected,5);assert.equal(m.received,4);assert.equal(m.state,'bad');assert.match(U.summaryHtml(m),/4\/5取得/);
});
test('duplicate ticker is not selected arbitrarily',()=>{
  const f=fixture();f[1].stocks.push({...f[1].stocks[0]});const m=make(f);assert.equal(m.rows[0].stock,null);assert.ok(m.reasons.some(x=>x.code==='DUPLICATE_PLTR'));
});
test('unexpected ticker blocks green',()=>{const f=fixture();f[1].stocks.push({ticker:'OTHER'});assert.equal(make(f).state,'bad');});
test('mismatched stock date stays visible but cannot be normal',()=>{const f=fixture();f[1].stocks[0].trade_date='2026-10-01';assert.equal(make(f).usable,4);assert.equal(make(f).state,'bad');});
test('common timestamp cannot borrow an earlier PASS',()=>{const f=fixture();f[2].timestamps.calculated_at='2026-10-04T10:00:00+09:00';assert.equal(make(f).bound,false);});
test('common target identity must match exactly once',()=>{const f=fixture();f[2].decision_items[0].subject_id='OTHER';assert.equal(make(f).bound,false);});
test('missing common fails closed without inventing actions',()=>{const f=fixture();f[2]=null;assert.equal(make(f).state,'bad');assert.equal(make(f).bound,false);});
test('HOLD is a genuine incident even with historical PASS',()=>{const f=fixture();f[0].run_state='HOLD';assert.equal(make(f).state,'bad');});
test('QC FAIL is not concealed',()=>{const f=fixture();f[0].quality.qc='FAIL';assert.equal(make(f).state,'bad');});
test('source pending is warning, not matching success',()=>{const f=fixture();f[0].quality.source_crosscheck='PENDING';f[2].data_quality.source_crosscheck='PENDING';const m=make(f);assert.equal(m.state,'warn');assert.equal(m.crossLabel,'確認待ち');});
test('ordinary weekend alone does not produce warning',()=>{assert.equal(make().state,'good');});
test('runtime freshness rechecks stale saved PASS',()=>{const m=make(fixture(),{now:new Date('2026-10-08T03:00:00Z')});assert.equal(m.state,'bad');assert.match(m.freshness,/古い/);});
test('future trade date is rejected',()=>{const f=fixture();f[0].us_trade_date='2026-10-09';assert.ok(make(f).reasons.some(x=>x.code==='FUTURE_DATE'));});
test('future calculated timestamp is rejected',()=>{const f=fixture();f[0].generated_at_jst='2026-10-05T11:00:00+09:00';assert.ok(make(f).reasons.some(x=>x.code==='FUTURE_TIME'));});
test('impossible dates and unzoned time are invalid',()=>{assert.equal(U.day('2026-02-30'),null);assert.equal(U.instant('2026-10-04T11:00:00'),null);});
test('null empty boolean infinity do not become zero',()=>{for(const v of [null,undefined,'',' ',false,true,Infinity,NaN,{},[]])assert.equal(U.finite(v),null);assert.equal(U.finite(0),0);});
test('missing axes stay unknown rather than neutral WAIT',()=>{assert.deepEqual(U.signals({}),{shortTerm:'未確認',midTerm:'未確認',heat:'未確認'});});
test('out of range RSI is unknown',()=>{assert.equal(U.signals({rsi14:101}).heat,'未確認');assert.equal(U.signals({rsi14:-1}).heat,'未確認');});
test('valid legacy signals are unchanged across boundaries',()=>{
  for(const trend of ['上昇','下降','混在'])for(const macd_state of ['強気','弱気'])for(const ma_state of ['50MA > 200MA','50MA < 200MA','50MA = 200MA'])for(const rsi14 of [0,30,30.1,40,40.1,50,59.9,60,69.9,70,100]){
    const s={trend,macd_state,ma_state,rsi14};
    const shortTerm=trend==='上昇'?(macd_state==='強気'?'上昇優勢':'上向き'):trend==='下降'?(macd_state==='弱気'?'下降優勢':'下向き'):'中立';
    const midTerm=ma_state.includes(' > ')?'上昇基調':ma_state.includes(' < ')?'下降基調':'中立';
    const heat=rsi14>=70?'過熱気味':rsi14>=60?'やや高め':rsi14<=30?'売られ過ぎ':rsi14<=40?'やや低め':'中立';
    assert.deepEqual(U.signals(s),{shortTerm,midTerm,heat});
  }
});
test('MSTR SOXL scoring scope stays outside growth',()=>{const f=fixture();f[1].stocks[3].structural_growth={score:90};assert.ok(make(f).reasons.some(x=>x.code==='SCOPE_MSTR'));});
test('unexpected formal BUY is never promoted by presentation',()=>{const f=fixture();f[2].decision_items[0].formal_action='BUY';assert.equal(make(f).state,'bad');assert.ok(make(f).reasons.some(x=>x.code==='FORMAL_UNEXPECTED'));});
test('only known design blocker is excluded from data incidents',()=>{const f=fixture();f[2].decision_items[0].blocking_conditions.push({id:'UNKNOWN_BLOCKER',label:'検査未完了'});const m=make(f);assert.equal(m.otherBlockers,1);assert.equal(m.state,'bad');});
test('offline and failed refresh remain explicit',()=>{assert.match(make(fixture(),{offline:true}).freshness,/オフライン/);assert.match(make(fixture(),{loadFailed:true}).freshness,/前回表示/);});
test('source objects are never mutated',()=>{const f=fixture(),before=JSON.stringify(f);make(f);assert.equal(JSON.stringify(f),before);});
test('injected markup is escaped in notices',()=>{const f=fixture();f[0].warnings=['<img src=x onerror=alert(1)>'];assert.ok(!U.qualityHtml(make(f)).includes('<img'));assert.match(U.qualityHtml(make(f)),/&lt;img/);});
test('0 percent is displayed, null price stays unknown',()=>{const f=fixture();f[1].stocks[0].close=null;const s=U.summaryHtml(make(f));assert.match(s,/0\.00%/);assert.match(s,/未確認/);assert.ok(!s.includes('$0.00'));});
test('market groups do not impute missing values',()=>{const groups=U.groups([]);assert.deepEqual(groups.map(x=>x.label),['米国全体','半導体','Bitcoin']);assert.equal(groups[2].items[0].value,null);});
test('five-tab template retains old ids and isolates management',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../candidate/index.html'),'utf8');
  assert.equal((html.match(/data-tab="/g)||[]).length,5);
  for(const id of ['overview','stocks','market','quality','manage'])assert.ok(html.includes('data-tab-panel="'+id+'"'));
  assert.ok(html.indexOf('id="tab-manage"')<html.indexOf('id="refreshButton"'));
  assert.ok(!html.includes('rel="manifest"'));
});
test('candidate bootstrap does not register SW or delete storage',()=>{
  const boot=fs.readFileSync(path.join(__dirname,'../candidate/bootstrap.js'),'utf8');
  assert.ok(!/serviceWorker\.register|localStorage\.(?:clear|removeItem)|caches\.delete/.test(boot));
  assert.ok(boot.includes('sequence!==requestSequence'));
});
