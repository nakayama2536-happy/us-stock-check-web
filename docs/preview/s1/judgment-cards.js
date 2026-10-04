/* Screenshot-led judgment layout. Rendering only; legacy model and frozen inputs unchanged. */
(function(root,factory){
  'use strict';
  const commonJS=typeof module==='object'&&module.exports;
  const base=commonJS?require('./candidate/experience.js'):root.USExperience;
  const api=factory(base);
  if(commonJS)module.exports=api;
  else{
    root.USJudgmentCards=api;
    root.USExperience=Object.freeze({...base,summaryHtml:api.summaryHtml,renderState:api.renderState});
    api.install(root);
  }
})(typeof globalThis==='undefined'?this:globalThis,function(base){
  'use strict';
  const VERSION='jp-cards.3';
  // Display aliases only. The ticker and original company name stay visible/accessible.
  const NAMES=Object.freeze({PLTR:'パランティア',LLY:'イーライリリー',BSY:'ベントレー・システムズ',MSTR:'ストラテジー',SOXL:'半導体ブル3倍ETF'});
  const esc=base.esc,finite=base.finite;
  const money=v=>finite(v)===null?'未確認':'$'+finite(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=v=>finite(v)===null?'前日比 未確認':(finite(v)>0?'+':'')+finite(v).toFixed(2)+'%';
  const direction=value=>({
    '上昇優勢':['↑↑','up'],'上向き':['↑','up'],'上昇基調':['↑','up'],
    '下降優勢':['↓↓','down'],'下向き':['↓','down'],'下降基調':['↓','down'],
    '中立':['→','flat']
  })[value]||['—','unknown'];
  function arrowIcon(value){
    const paths={
      '↑':'M14 23V5 M6 13L14 5L22 13',
      '↓':'M14 5V23 M6 15L14 23L22 15',
      '↑↑':'M8 23V5 M2 11L8 5L14 11 M28 23V5 M22 11L28 5L34 11',
      '↓↓':'M8 5V23 M2 17L8 23L14 17 M28 5V23 M22 17L28 23L34 17',
      '→':'M4 14H24 M16 6L24 14L16 22'
    };
    if(!Object.prototype.hasOwnProperty.call(paths,value))return esc(value);
    const width=value.length===2?36:28;
    return '<svg width="'+width+'" height="28" viewBox="0 0 '+width+' 28" aria-hidden="true" focusable="false"><path d="'+paths[value]+'" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function rowView(row,m){
    const stock=row.stock||{},valid=row.state==='OK';
    const short=valid?row.signals.shortTerm:'未確認';
    const mid=valid?row.signals.midTerm:'未確認';
    const heat=valid?row.signals.heat:'未確認';
    const rsi=valid?finite(stock.rsi14):null;
    const q=m.status.quality||{};
    let check={label:'照合未確認',tone:'warn'};
    if(valid&&m.bound&&m.state!=='bad'&&q.qc==='PASS'&&q.session==='REGULAR'){
      if(q.source_crosscheck==='PENDING')check={label:'照合待ち',tone:'warn'};
      else if(q.source_crosscheck==='PASS'&&typeof stock.primary_source==='string'&&stock.primary_source.trim()&&
        typeof stock.shadow_source==='string'&&stock.shadow_source.trim()&&
        finite(stock.shadow_close_diff_usd)!==null&&finite(stock.shadow_close_diff_pct)!==null){
        check=finite(stock.shadow_close_diff_usd)===0&&finite(stock.shadow_close_diff_pct)===0?
          {label:'照合一致',tone:'good'}:{label:'照合差分あり',tone:'warn'};
      }
    }
    return {ticker:row.ticker,name:NAMES[row.ticker]||row.ticker,originalName:typeof stock.name==='string'?stock.name:'',
      price:money(stock.close),change:pct(stock.change_pct),changeTone:finite(stock.change_pct)>0?'up':finite(stock.change_pct)<0?'down':'flat',
      badge:valid?short:'データ要確認',badgeTone:valid&&short!=='未確認'?'reference':'warn',check,
      cells:[
        {label:'短期の判定期間：12・26営業日',value:direction(short)[0],tone:direction(short)[1],detail:short},
        {label:'中長期の判定期間：50・200営業日',value:direction(mid)[0],tone:direction(mid)[1],detail:mid},
        {label:'RSI14',value:rsi!==null&&rsi>=0&&rsi<=100?rsi.toFixed(1):'—',tone:'number',detail:heat}
      ]};
  }
  function cardHtml(row,m){
    const v=rowView(row,m),ticker=esc(v.ticker);
    return '<section class="usj-stock ux-stock" data-judgment-card="'+ticker+'" aria-label="'+esc(v.name)+' '+ticker+'">'+
      '<div class="usj-stock-head"><button type="button" class="usj-company" data-open-stock="'+ticker+'" title="'+esc(v.originalName)+'">'+
      '<strong>'+esc(v.name)+'</strong><span>'+ticker+' <span aria-hidden="true">›</span></span></button>'+
      '<div class="usj-price-group"><strong class="usj-price">'+esc(v.price)+'</strong><span class="usj-change usj-'+v.changeTone+'">'+esc(v.change)+'</span></div></div>'+
      '<div class="usj-state-row"><div class="usj-badge-group"><span class="usj-state-caption">短期の状態</span><strong class="usj-badge usj-badge-'+v.badgeTone+'">'+esc(v.badge)+'</strong></div>'+
      '<button type="button" class="usj-check usj-check-'+v.check.tone+'" data-go-tab="quality" aria-label="'+ticker+' 終値'+esc(v.check.label)+'・品質詳細へ">'+esc(v.check.label)+'</button></div>'+
      '<div class="usj-indicators" aria-label="現在のテクニカル状態・将来予測ではありません">'+v.cells.map(c=>
        '<div class="usj-indicator" aria-label="'+esc(c.label+' '+(c.label==='RSI14'?c.value+' ':'')+c.detail)+'"><div><span>'+c.label+'</span><b class="usj-direction usj-'+c.tone+'" aria-hidden="true">'+(c.tone==='number'?c.value:arrowIcon(c.value))+'</b></div><small>'+esc(c.detail)+'</small></div>').join('')+'</div>'+
      '<div class="usj-links"><button type="button" data-open-stock="'+ticker+'">この銘柄を詳しく見る</button>'+
      '<button type="button" data-open-evidence="'+ticker+'">根拠・監視ライン <span aria-hidden="true">›</span></button></div></section>';
  }
  function summaryHtml(m){
    return '<article class="usj-summary"><div class="ux-summary-head"><h2>本日の確認サマリー</h2><span class="ux-chip">参考分析</span></div>'+
      '<p class="ux-headline ux-'+m.state+'">'+esc(m.headline)+'</p><p class="ux-caption">'+esc(m.freshness)+' ／ 対象5銘柄</p>'+
      '<button type="button" class="ux-quality-link" data-go-tab="quality">株価 '+m.received+'/5取得 ／ 独立照合 '+esc(m.crossLabel)+'　品質詳細 ›</button></article>'+
      '<article class="usj-list"><h2>5銘柄の状態・テクニカル</h2><p class="usj-caption">矢印は現在の状態です。上向き＝赤／下向き＝青。営業日予測や売買指示ではありません。</p>'+
      '<p class="usj-caption usj-source-note">日数は計算期間であり、予測先ではありません。短期はMACD（12・26営業日、シグナル9営業日）と終値・50・200日線、中長期は50・200日線の比較。RSI14は14営業日の過熱度。照合は保存時の終値比較です。</p>'+
      m.rows.map(row=>cardHtml(row,m)).join('')+'</article>';
  }
  function renderState(m,doc){
    // Retain all existing global warnings and quality gates; replace judgment markup only.
    base.renderState(m,doc);
    doc.getElementById('digest').innerHTML=summaryHtml(m);
  }
  function install(root){
    const doc=root.document;
    if(!doc||doc.documentElement.dataset.usJudgmentCards===VERSION)return;
    doc.documentElement.dataset.usJudgmentCards=VERSION;
    doc.addEventListener('click',event=>{
      const button=event.target.closest&&event.target.closest('[data-open-evidence]');
      if(!button||!base.TICKERS.includes(button.dataset.openEvidence))return;
      const ticker=button.dataset.openEvidence;
      root.selectTicker(ticker);root.activateTab('stocks');
      const panel=doc.querySelector('[data-stock-panel="'+ticker+'"]');
      if(!panel)return;
      let focus=null;
      panel.querySelectorAll('details').forEach(detail=>{
        const summary=detail.querySelector('summary');
        if(summary&&['テクニカル詳細','テクニカル監視ライン'].includes(summary.textContent.trim())){
          detail.open=true;if(!focus)focus=summary;
        }
      });
      if(focus)root.requestAnimationFrame(()=>{focus.focus({preventScroll:true});focus.scrollIntoView({block:'start',behavior:'instant'});});
    });
  }
  return Object.freeze({VERSION,NAMES,direction,rowView,cardHtml,summaryHtml,renderState,install});
});
