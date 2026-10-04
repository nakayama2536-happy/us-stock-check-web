/* Parent owns the only network and transfer boundary. Inner UI remains sandboxed. */
(async function(){
 'use strict';
 const frame=document.getElementById('previewFrame'),status=document.getElementById('deliveryState'),loading=document.getElementById('loading');
 const button=document.getElementById('deliveryRefresh');
 const tabs=['overview','stocks','market','quality','manage'];
 let assets=null,current=null,allowed=null,cycle=0,selection={tab:'overview',ticker:'PLTR'};
 // Device preview does not read or write regular-app preferences.
 const consult=USPreview.installConsultation(()=>allowed,frame);
 function tell(state){document.getElementById('deliverySummary').textContent=({ready:'保存データ表示',offline:'オフライン・保存値／GPT停止',failed:'再取得未確認／GPT停止',loading:'データ確認中／GPT停止'})[state];if(current)frame.contentWindow.postMessage({type:'US_DELIVERY_STATE',generation:current._generation,state},'*');}
 const runner=USDelivery.controller({
  async read(signal){
   try{return await USDelivery.load('./delivery/',{signal});
   }catch(error){if(signal.aborted||current)throw error;const saved=await USSavedDelivery.restore();saved.networkError=error.message;return saved;}
  },
  begin(){cycle++;allowed=null;consult.invalidate();tell('loading');button.disabled=true;status.textContent='配信版を確認中です。前回表示は再確認が終わるまで参考値です。';},
  async commit(bundle){
   const mine=cycle;
   const files={...assets,...Object.fromEntries(Object.entries(bundle.raw).map(([k,v])=>['data/'+k,v]))};
   files['data/ohlcv-history.json']||='{}';
   // Never substitute the fixed preview's historical observations into live input.
   files['data/chart-history.json']=JSON.stringify({basis_date:bundle.objects['status.json'].us_trade_date,series:{},note:'観測終値履歴は未接続。'});
   files._hashes=Object.fromEntries(await Promise.all(Object.entries(files).map(async([name,text])=>[name,await USPreview.blobHash(new TextEncoder().encode(text))])));
   if(mine!==cycle)return;
   if(!bundle.restored){try{await USSavedDelivery.save(bundle,()=>mine===cycle);}catch(_){bundle.storageWarning=true;}}
   if(mine!==cycle)return;
   files._delivery={release:bundle.manifest.release,source_repository:bundle.manifest.source_repository,source_revision:bundle.manifest.source_revision,files:bundle.manifest.files,verified_at:new Date().toISOString(),note:'同一公開版の包装を検証。バックエンド同一実行・市場データ品質の証明ではない。'};
   files._generation=crypto.randomUUID();files._selection={...selection};
   const html=USPreview.makeDocument(files);
   current=files;
   frame.onload=()=>{
    if(mine!==cycle)return;
    allowed=bundle.restored?null:files;frame.hidden=false;loading.hidden=true;button.disabled=false;tell(bundle.restored?(!navigator.onLine?'offline':'failed'):'ready');
    const st=bundle.objects['status.json'];
    status.textContent=(bundle.restored?'保存版（再取得未確認・GPT停止） ':'配信版 ')+bundle.manifest.release.slice(0,12)+' ／ 株価基準日 '+st.us_trade_date+' ／ 計算 '+st.generated_at_jst+'。取得成功は品質PASSを意味しません。'+(bundle.storageWarning?' 今回の版を端末へ保存できませんでした。':'');
   };
   frame.srcdoc=html;
  },
  fail(error){allowed=null;consult.invalidate();tell('failed');button.disabled=false;loading.hidden=true;status.textContent='更新できません：'+error.message+'。'+(current?'前回表示を残しています。GPT転送は停止中です。':'一致確認済みのデータはありません。');}
 });
 function refresh(){if(!assets)return;return runner.refresh();}
 button.onclick=refresh;
 window.addEventListener('message',event=>{
  const d=event.data;
  if(event.source!==frame.contentWindow||event.origin!=='null'||!current||d?.generation!==current._generation)return;
  if(d.type==='US_DELIVERY_REFRESH')refresh();
  if(d.type==='US_DELIVERY_SELECTION'&&tabs.includes(d.tab)&&USDelivery.TICKERS.includes(d.ticker))selection={tab:d.tab,ticker:d.ticker};
 });
 window.addEventListener('offline',()=>{runner.invalidate();tell('offline');button.disabled=false;status.textContent='オフラインです。前回表示を参考値として保持しています。GPT転送は再取得成功まで停止します。';});
 window.addEventListener('online',refresh);
 try{
  const r=await fetch('./assets.json',{cache:'no-store',credentials:'omit'});if(!r.ok||r.redirected)throw Error('UI資材の取得失敗');assets=await r.json();await refresh();
 }catch(e){tell('failed');loading.textContent='候補を起動できません：'+e.message;button.disabled=true;}
})();
