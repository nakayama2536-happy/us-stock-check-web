/* Version-bound public data transport. No orders, private sources or storage writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.USDelivery=api;})(globalThis,function(){
 'use strict';
 const REQUIRED=['status.json','market.json','common_snapshot.json'];
 const OPTIONAL=['ohlcv-history.json'];
 const TICKERS=['PLTR','LLY','BSY','MSTR','SOXL'];
 const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
 const object=o=>o&&typeof o==='object'&&!Array.isArray(o);
 function manifest(m){
  if(!object(m)||m.schema!=='us-ui-delivery/1'||!hex(m.release,64)||!hex(m.source_revision,40)||!['nakayama2536-happy/us-stock-check-web','nakayama2536-happy/us-stock-check'].includes(m.source_repository)||!object(m.files))throw Error('配信一覧の形式・出典が不正です');
  if(Object.keys(m).sort().join(',')!=='files,release,schema,source_repository,source_revision')throw Error('配信一覧に未対応の項目があります');
  const names=Object.keys(m.files);
  if(REQUIRED.some(n=>!names.includes(n))||names.some(n=>![...REQUIRED,...OPTIONAL].includes(n)))throw Error('配信ファイルの対象が不正です');
  for(const [name,v]of Object.entries(m.files))if(!object(v)||Object.keys(v).sort().join(',')!=='bytes,sha256'||!hex(v.sha256,64)||!Number.isSafeInteger(v.bytes)||v.bytes<2||v.bytes>1000000)throw Error('配信ハッシュ・容量が不正です');
  return m;
 }
 function binding(files){
  const status=files['status.json'],market=files['market.json'],common=files['common_snapshot.json'];
  const date=status?.us_trade_date,time=status?.generated_at_jst;
  if(status?.schema_version!=='0.2'||market?.schema_version!=='0.2'||status?.app_state!=='SHADOW'||common?.schema_version!=='1.0'||common?.market!=='US')throw Error('未対応の市場・データ形式です');
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||typeof time!=='string'||!Number.isFinite(Date.parse(time)))throw Error('日時を確認できません');
  if(common.timestamps?.market_as_of!==date||common.timestamps?.calculated_at!==time)throw Error('株価と共通品質情報の日時が不一致です');
  if(!Array.isArray(market.stocks)||market.stocks.length!==5||!Array.isArray(common.decision_items)||common.decision_items.length!==5)throw Error('対象5銘柄が揃っていません');
  for(const t of TICKERS){
   const stocks=market.stocks.filter(s=>s?.ticker===t),items=common.decision_items.filter(s=>s?.ticker===t&&s.subject_id===t);
   if(stocks.length!==1||items.length!==1||stocks[0].trade_date!==date||items[0].as_of!==date)throw Error('銘柄の重複・欠損・基準日不一致です');
  }
  return {date,time};
 }
 async function sha256(bytes){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
 async function read(url,fetcher,signal,max){
  const r=await fetcher(url,{cache:'no-store',credentials:'omit',signal});
  if(!r.ok||r.redirected)throw Error('公開データを取得できません');
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>max)throw Error('公開データが容量上限を超えています');
  return bytes;
 }
 const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 async function load(base,{fetcher=fetch,signal}={}){
  const m=manifest(parse(await read(base+'current.json',fetcher,signal,16000))),raw={},objects={};
  const descriptor={schema:m.schema,source_repository:m.source_repository,source_revision:m.source_revision,files:m.files};
  if(await sha256(new TextEncoder().encode(JSON.stringify(descriptor)))!==m.release)throw Error('配信一覧の版識別子が不一致です');
  await Promise.all(Object.entries(m.files).map(async([name,meta])=>{
   const bytes=await read(base+'releases/'+m.release+'/'+name,fetcher,signal,meta.bytes);
   if(bytes.length!==meta.bytes||await sha256(bytes)!==meta.sha256)throw Error('公開データのハッシュが不一致です');
   objects[name]=parse(bytes);raw[name]=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }));
  binding(objects);
  if(m.source_repository==='nakayama2536-happy/us-stock-check'){
   const capture=objects['ohlcv-history.json'];
   if(capture?.capture?.repository!==m.source_repository||capture.capture.code_sha!==m.source_revision||capture.generated_at_jst!==objects['status.json'].generated_at_jst)throw Error('同一計算実行の履歴を確認できません');
  }
  // Hashes identify one packaged publication; they do not prove data accuracy.
  return {manifest:m,raw,objects};
 }
 function controller({read,begin,commit,fail}){
  let generation=0,abort=null;
  return {invalidate(){generation++;abort?.abort();begin();},async refresh(){
   const mine=++generation;abort?.abort();const requestAbort=new AbortController();abort=requestAbort;const timer=setTimeout(()=>requestAbort.abort(),15000);begin();
   try{const result=await read(abort.signal);if(mine!==generation)return false;await commit(result);return true;}
   catch(e){if(mine===generation)fail(e);return false;}finally{clearTimeout(timer);}
  }};
 }
 return Object.freeze({manifest,binding,load,sha256,controller,REQUIRED,TICKERS});
});
