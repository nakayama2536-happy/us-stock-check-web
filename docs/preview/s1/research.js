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
  function chartHtml(stock,history){
    const rows=rowsFor(stock,history),title=esc(stock.ticker)+' 保存終値の推移（USD）';
    if(rows.length<2)return '<section class="usr-chart"><h3>'+title+'</h3><p>履歴不足または表示データと不一致のため、グラフは表示できません。</p></section>';
    const lo=Math.min(...rows.map(r=>r.close)),hi=Math.max(...rows.map(r=>r.close)),pad=Math.max((hi-lo)*.12,lo*.005),min=lo-pad,max=hi+pad;
    const start=Date.parse(rows[0].date),end=Date.parse(rows.at(-1).date);
    const xy=r=>[60+(Date.parse(r.date)-start)/(end-start)*550,18+(max-r.close)/(max-min)*145];
    const dots=rows.map(r=>{const [x,y]=xy(r);return '<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="4"><title>'+esc(r.date)+' $'+r.close.toFixed(2)+'</title></circle>';}).join('');
    const grid=[min,(min+max)/2,max].map(v=>{const y=18+(max-v)/(max-min)*145;return '<line x1="60" x2="610" y1="'+y+'" y2="'+y+'"/><text x="54" y="'+(y+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>';}).join('');
    return '<section class="usr-chart"><h3>'+title+'</h3><p>'+rows[0].date+' ～ '+rows.at(-1).date+' ／ '+rows.length+'観測</p><svg viewBox="0 0 640 198" role="img" aria-label="'+title+' '+rows.length+'観測"><g class="usr-grid">'+grid+'</g><g class="usr-dots">'+dots+'</g><text x="60" y="190">'+rows[0].date+'</text><text x="610" y="190" text-anchor="end">'+rows.at(-1).date+'</text></svg><p class="usr-note">公開済みの保存終値を点で表示。未保存日は補間しません。完全な日足履歴・調整後株価ではありません。</p><details><summary>日付・終値を表で確認</summary><table><thead><tr><th>取引日</th><th>終値（USD）</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.date+'</td><td>'+r.close.toFixed(2)+'</td></tr>').join('')+'</tbody></table></details></section>';
  }
  function install(w){
    const old=w.stockCard;
    w.stockCard=s=>old(s).replace('</article>',()=>chartHtml(s,PREVIEW_HISTORY)+'<div class="usr-actions"><button type="button" data-us-consult="analysis" data-us-ticker="'+esc(s.ticker)+'">GPTでこの銘柄を詳しく解析</button><button type="button" data-us-consult="diagnostic" data-us-ticker="'+esc(s.ticker)+'">データ不備を調べる</button></div></article>');
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
    w.document.addEventListener('click',e=>{
      const b=e.target.closest('[data-us-consult]');if(!b)return;
      w.parent.postMessage({type:'US_PREVIEW_CONSULT',kind:b.dataset.usConsult,ticker:b.dataset.usTicker},'*');
    });
  }
  return {rowsFor,chartHtml,install};
});
