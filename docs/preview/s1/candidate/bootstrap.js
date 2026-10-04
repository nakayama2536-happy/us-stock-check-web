/* Candidate entry point. Original panel helpers are reused; no Service Worker registration. */
let requestSequence=0;
let lastBundle=null;
let lastFailure=false;
let selectedTicker='PLTR';
function currentModel(extra={}){
  return USExperience.model(...(lastBundle||[{}, {}, null]),{offline:!navigator.onLine,loadFailed:lastFailure,hasPrevious:!!lastBundle,...extra});
}
function selectTicker(ticker){
  if(!USExperience.TICKERS.includes(ticker))return;
  selectedTicker=ticker;
  $('stockSelector').value=ticker;
  document.querySelectorAll('[data-stock-panel]').forEach(el=>{el.hidden=el.dataset.stockPanel!==ticker;});
}
function savedQuality(status,market){
  const q=status.quality||{};
  return '<p class="ux-caption">以下は保存データに記録された品質状態です。現在の表示利用可否は上のダイジェストで確認してください。</p>'+
    '<div class="quality-grid">'+[
      ['実行状態',q.qc===undefined?'未確認':stateLabel(status.run_state)],['保存時QC',q.qc],['取引セッション',q.session],
      ['申告取得件数',q.completeness],['計算日時',jst(status.generated_at_jst)],['独立照合',q.source_crosscheck]
    ].map(([label,value])=>'<div class="quality-item"><span class="label">'+fmt(label)+'</span><div class="quality-value">'+fmt(value)+'</div></div>').join('')+'</div>'+dataFreshnessPanel(status,market);
}
async function main(options={}){
  const sequence=++requestSequence;
  const button=$('refreshButton'),note=$('refreshNote');
  button.disabled=true;
  note.textContent='公開データを確認しています。バックエンド更新は実行しません。';
  if(lastBundle)USExperience.renderState(currentModel({loading:true}),document);
  try{
    const [status,market,common]=await Promise.all([
      getJSON('./data/status.json'),getJSON('./data/market.json'),getJSON('./data/common_snapshot.json').catch(()=>null)
    ]);
    if(sequence!==requestSequence)return;
    if(!status||typeof status!=='object'||Array.isArray(status)||!market||typeof market!=='object'||Array.isArray(market))throw new Error('Unsupported snapshot');
    const m=USExperience.model(status,market,common,{offline:!navigator.onLine});
    const stocks=m.rows.map(r=>r.stock||{ticker:r.ticker,name:'データ未確認',signal:'SHADOW'});
    const env=Array.isArray(market.market_environment)?market.market_environment.filter(x=>x&&typeof x==='object'):[];
    const viewMarket={...market,stocks,market_environment:env};
    // Build strings before committing DOM so rendering failures do not mix old/new cards.
    const stockHtml=stocks.map(s=>'<div data-stock-panel="'+s.ticker+'">'+stockCard(s)+'</div>').join('');
    const marketHtml=USExperience.groups(env).map(g=>'<section class="ux-market-group"><h3>'+fmt(g.label)+'</h3><div class="cards compact">'+g.items.map(marketCard).join('')+'</div>'+(g.label==='Bitcoin'?'<p class="ux-caption">日足参考値です。米国株の通常取引終値と同じ時刻ではなく、リアルタイム価格でもありません。</p>':'')+'</section>').join('');
    const qualityHtml=savedQuality(status,viewMarket);
    const validationHtml=modelValidationPanel(market.model_validation,stocks);
    lastBundle=[status,market,common];
    lastFailure=false;
    $('stocks').innerHTML=stockHtml;
    $('market').innerHTML=marketHtml;
    $('quality').innerHTML=qualityHtml;
    $('modelValidation').innerHTML=validationHtml;
    $('tradeDate').textContent=dateOnly(status.us_trade_date);
    $('updatedAt').textContent=jst(status.generated_at_jst);
    $('version').textContent='Core '+String(status.app_version||'未確認')+' / UI候補 '+USExperience.VERSION;
    $('appState').textContent='参考分析 / '+stateLabel(status.run_state);
    $('stateBox').className='ux-mode';
    $('commonSection').hidden=true;
    $('commonSection').classList.add('hidden');
    USExperience.renderState(m,document);
    renderMarketCharts(env);
    renderRecheckSchedule();
    selectTicker(selectedTicker);
    note.textContent='公開データ読込完了。品質状態：'+(m.state==='good'?'確認事項なし':m.state==='warn'?'一部確認待ち':'要確認')+'。';
  }catch(_){
    if(sequence!==requestSequence)return;
    lastFailure=true;
    USExperience.renderState(currentModel(),document);
    $('appState').textContent=lastBundle?'読込失敗・前回表示':'読込失敗・データ未確認';
    note.textContent='公開データの読込に失敗しました。前回の表示がある場合は保存値として残しています。';
  }finally{
    if(sequence===requestSequence)button.disabled=false;
  }
}
$('refreshButton').addEventListener('click',()=>main({manual:true}));
$('stockSelector').addEventListener('change',e=>selectTicker(e.target.value));
document.addEventListener('click',event=>{
  const go=event.target.closest('[data-go-tab]');
  if(go)activateTab(go.dataset.goTab);
  const stock=event.target.closest('[data-open-stock]');
  if(stock){selectTicker(stock.dataset.openStock);activateTab('stocks');}
});
window.addEventListener('offline',()=>USExperience.renderState(currentModel({offline:true}),document));
window.addEventListener('online',()=>main());
setInterval(()=>{if(lastBundle)USExperience.renderState(currentModel(),document);},60000);
setupTabs();
renderRecheckSchedule();
main();
