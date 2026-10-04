/* Display-only charts and explicit consultation requests. No inner storage/network/clipboard. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.USResearch=api;api.install(root);}
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const esc=x=>String(x??'未確認').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  function rowsFor(stock,history){
    const rows=history?.series?.[stock.ticker];
    if(!Array.isArray(rows)||!rows.length||history.basis_date!==stock.trade_date)return [];
    if(rows.some((r,i)=>!validDate(r.date)||typeof r.close!=='number'||!Number.isFinite(r.close)||r.close<=0||(i&&rows[i-1].date>=r.date)))return [];
    const last=rows[rows.length-1];
    return last.date===stock.trade_date&&last.close===stock.close?rows:[];
  }
  function chartHtml(stock,history,detail,window=90){
    if(detail?.available)return candleHtml(stock,detail,window);
    const rows=rowsFor(stock,history),title=esc(stock.ticker)+' 保存終値の推移（USD）';
    if(rows.length<2)return '<section class="usr-chart"><h3>'+title+'</h3><p>履歴不足または表示データと不一致のため、グラフは表示できません。</p></section>';
    const pending=rows.filter(r=>typeof r.shadow_close_diff_usd!=='number'||!r.shadow_source||r.shadow_source==='Independent close pending').length;
    const lo=Math.min(...rows.map(r=>r.close)),hi=Math.max(...rows.map(r=>r.close)),pad=Math.max((hi-lo)*.12,lo*.005),min=lo-pad,max=hi+pad;
    const start=Date.parse(rows[0].date),end=Date.parse(rows.at(-1).date);
    const xy=r=>[60+(Date.parse(r.date)-start)/(end-start)*550,18+(max-r.close)/(max-min)*145];
    const dots=rows.map(r=>{const [x,y]=xy(r);return '<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="4"><title>'+esc(r.date)+' $'+r.close.toFixed(2)+'</title></circle>';}).join('');
    const grid=[min,(min+max)/2,max].map(v=>{const y=18+(max-v)/(max-min)*145;return '<line x1="60" x2="610" y1="'+y+'" y2="'+y+'"/><text x="54" y="'+(y+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>';}).join('');
    return '<section class="usr-chart"><h3>'+title+'</h3>'+(detail?.reason?'<p>長期日足は表示不可：'+esc(detail.reason)+'</p>':'')+'<p>'+rows[0].date+' ～ '+rows.at(-1).date+' ／ '+rows.length+'観測</p><svg viewBox="0 0 640 198" role="img" aria-label="'+title+' '+rows.length+'観測"><g class="usr-grid">'+grid+'</g><g class="usr-dots">'+dots+'</g><text x="60" y="190">'+rows[0].date+'</text><text x="610" y="190" text-anchor="end">'+rows.at(-1).date+'</text></svg><p class="usr-note">公開済みの保存終値を点で表示。未保存日は補間しません。完全な日足履歴・調整後株価ではありません。'+(pending?' 保存時の独立照合が未確認の点：'+pending+'件。':'')+'</p><details><summary>日付・終値を表で確認</summary><table><thead><tr><th>取引日</th><th>終値（USD）</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.date+'</td><td>'+r.close.toFixed(2)+'</td></tr>').join('')+'</tbody></table></details></section>';
  }
  function candleHtml(stock,detail,window=90){
    const rows=detail.rows.slice(-(window===250?250:90)),title=esc(stock.ticker)+' 日足・出来高';
    const low=Math.min(...rows.map(r=>r.low)),high=Math.max(...rows.map(r=>r.high)),pad=Math.max((high-low)*.05,high*.001);
    const min=low-pad,max=high+pad,vol=Math.max(1,...rows.map(r=>r.volume)),step=560/rows.length;
    const x=i=>60+(i+.5)*step,y=p=>18+(max-p)/(max-min)*200;
    const candles=rows.map((r,i)=>{const xx=x(i),up=r.close>=r.open,cl=up?'usr-rise':'usr-fall';
      return '<g class="'+cl+'"><title>'+r.date+' 始 '+r.open.toFixed(2)+' 高 '+r.high.toFixed(2)+' 安 '+r.low.toFixed(2)+' 終 '+r.close.toFixed(2)+' 出来高 '+r.volume+'</title><line x1="'+xx+'" x2="'+xx+'" y1="'+y(r.high)+'" y2="'+y(r.low)+'"/><rect x="'+(xx-step*.3)+'" y="'+Math.min(y(r.open),y(r.close))+'" width="'+Math.max(.8,step*.6)+'" height="'+Math.max(.8,Math.abs(y(r.open)-y(r.close)))+'"/><rect class="usr-volume" x="'+(xx-step*.3)+'" y="'+(290-r.volume/vol*45)+'" width="'+Math.max(.8,step*.6)+'" height="'+r.volume/vol*45+'"/></g>';
    }).join('');
    const grid=[min,(min+max)/2,max].map(v=>'<line x1="60" x2="620" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="55" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>').join('');
    return '<section class="usr-chart usr-candles" data-chart-ticker="'+esc(stock.ticker)+'"><h3>'+title+'</h3><label>表示範囲 <select data-history-window="'+esc(stock.ticker)+'"><option value="90"'+(window!==250?' selected':'')+'>直近90本</option><option value="250"'+(window===250?' selected':'')+'>保存250本</option></select></label><p>'+rows[0].date+' ～ '+rows.at(-1).date+' ／ '+rows.length+'本 ／ USD<br>赤：終値≧始値、青：終値＜始値。下段は出来高（株）。横にスクロールできます。</p><div class="usr-chart-scroll" tabindex="0" role="region" aria-label="'+title+' 横スクロール"><svg viewBox="0 0 650 320" role="img" aria-label="'+title+' '+rows.length+'本"><g class="usr-grid">'+grid+'</g>'+candles+'<text x="5" y="250">出来高</text><text x="5" y="269">'+(vol/1000000).toFixed(1)+'M</text><text x="60" y="312">'+rows[0].date+'</text><text x="620" y="312" text-anchor="end">'+rows.at(-1).date+'</text></svg></div><details><summary>取得時点・データの制限</summary><p>履歴取得：'+esc(detail.generated_at_jst)+'。固定画面とは別実行で取得し、最終日・終値・主要指標の一致を検証しています。調整方式の同等性・全営業日の網羅・過去OHLCVの独立照合は未確認です。完全な計算履歴ではありません。出来高0：'+detail.zero_volume_rows+'件（欠損の可能性）。</p></details><details><summary>日足の数値を表で確認</summary><div class="usr-chart-scroll"><table><thead><tr><th>日付</th><th>始値</th><th>高値</th><th>安値</th><th>終値</th><th>出来高</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.date+'</td>'+['open','high','low','close'].map(k=>'<td>'+r[k].toFixed(2)+'</td>').join('')+'<td>'+r.volume.toLocaleString('ja-JP')+'</td></tr>').join('')+'</tbody></table></div></details></section>';
  }
  function install(w){
    const old=w.stockCard;
    w.stockCard=s=>old(s).replace('</article>',()=>chartHtml(s,PREVIEW_HISTORY,PREVIEW_OHLCV[s.ticker])+'<div class="usr-actions"><button type="button" data-us-consult="analysis" data-us-ticker="'+esc(s.ticker)+'">GPTでこの銘柄を詳しく解析</button><button type="button" data-us-consult="diagnostic" data-us-ticker="'+esc(s.ticker)+'">データ不備を調べる</button></div></article>');
    const base=w.USExperience;
    w.USExperience=Object.freeze({...base,renderState(m,doc){
      base.renderState(m,doc);
      doc.querySelectorAll('.usj-stock').forEach(card=>{
        const box=doc.createElement('div');box.className='usr-actions';
        const b=doc.createElement('button');b.type='button';b.dataset.usConsult='analysis';b.dataset.usTicker=card.dataset.judgmentCard;b.textContent='GPTでこの銘柄を詳しく解析';box.append(b);card.append(box);
      });
      const q=doc.getElementById('qualityDigest');
      if(q&&!q.querySelector('[data-us-consult]')){const b=doc.createElement('button');b.type='button';b.dataset.usConsult='diagnostic';b.dataset.usTicker='ALL';b.className='usr-diagnose';b.textContent='データ不備を調べる';q.append(b);}
    }});
    w.document.addEventListener('change',e=>{
      const selector=e.target.closest('[data-history-window]');if(!selector)return;
      const ticker=selector.dataset.historyWindow,stock=PREVIEW_DATA['./data/market.json'].stocks.find(s=>s.ticker===ticker);
      if(!stock)return;const host=selector.closest('.usr-chart');host.outerHTML=chartHtml(stock,PREVIEW_HISTORY,PREVIEW_OHLCV[ticker],Number(selector.value));
      w.document.querySelector('[data-history-window="'+ticker+'"]')?.focus();
    });
    w.document.addEventListener('click',e=>{
      const b=e.target.closest('[data-us-consult]');if(!b)return;
      w.parent.postMessage({type:'US_PREVIEW_CONSULT',kind:b.dataset.usConsult,ticker:b.dataset.usTicker},'*');
    });
  }
  return {rowsFor,chartHtml,install};
});
