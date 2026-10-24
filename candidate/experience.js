/* US UI S1 candidate. Presentation only; no order, forecast, or storage writes. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.USExperience=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const VERSION='s1.0.1.0';
  const TICKERS=Object.freeze(['PLTR','LLY','BSY','MSTR','SOXL']);
  const finite=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&
    (typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const list=v=>Array.isArray(v)?v:[];
  const text=v=>typeof v==='string'?v:'';
  function day(v){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(v)))return null;
    const d=new Date(v+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?v:null;
  }
  const instant=v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text(v))&&day(v.slice(0,10))&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
  const dollars=v=>finite(v)===null?'未確認':'$'+finite(v).toFixed(2);
  const percent=v=>finite(v)===null?'未確認':(finite(v)>0?'+':'')+finite(v).toFixed(2)+'%';
  // Identical thresholds and labels to legacy decisionState for valid inputs.
  // Missing/invalid axes remain unknown rather than becoming neutral/WAIT.
  function signals(value){
    const s=obj(value),trend=text(s.trend),macd=text(s.macd_state),ma=text(s.ma_state),rsi=finite(s.rsi14);
    let shortTerm='未確認',midTerm='未確認',heat='未確認';
    if(['上昇','下降','混在'].includes(trend)&&['強気','弱気'].includes(macd)){
      shortTerm='中立';
      if(trend==='上昇'&&macd==='強気')shortTerm='上昇優勢';
      else if(trend==='下降'&&macd==='弱気')shortTerm='下降優勢';
      else if(trend==='上昇')shortTerm='上向き';
      else if(trend==='下降')shortTerm='下向き';
    }
    if(ma==='50MA > 200MA')midTerm='上昇基調';
    else if(ma==='50MA < 200MA')midTerm='下降基調';
    else if(ma==='50MA = 200MA')midTerm='中立';
    if(rsi!==null&&rsi>=0&&rsi<=100){
      heat=rsi>=70?'過熱気味':rsi>=60?'やや高め':rsi<=30?'売られ過ぎ':rsi<=40?'やや低め':'中立';
    }
    return {shortTerm,midTerm,heat};
  }
  function model(statusInput,marketInput,commonInput,options={}){
    const status=obj(statusInput),market=obj(marketInput),common=obj(commonInput),q=obj(status.quality);
    const reasons=[],add=(code,message,severity='bad')=>{if(!reasons.some(x=>x.code===code))reasons.push({code,message,severity});};
    const now=options.now instanceof Date?options.now:new Date();
    const today=Number.isFinite(now.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now):null;
    const asOf=day(status.us_trade_date),generated=instant(status.generated_at_jst);
    const raw=list(market.stocks);
    if(!today)add('CLOCK_UNKNOWN','現在日時を確認できません。');
    if(!asOf)add('DATE_UNKNOWN','株価の基準日が不正または未確認です。');
    if(asOf&&today&&asOf>today)add('FUTURE_DATE','株価の基準日が未来です。');
    const age=asOf&&today?Math.floor((Date.parse(today)-Date.parse(asOf))/86400000):null;
    // Existing core policy is >4 calendar days. This does not infer holidays.
    if(age!==null&&age>4)add('STALE','保存データの基準日が4暦日を超えています。');
    if(generated===null)add('TIME_UNKNOWN','元データの計算日時を確認できません。');
    else if(generated>now.getTime())add('FUTURE_TIME','計算日時が端末の現在時刻より未来です。');
    if(status.app_state!=='SHADOW')add('MODE_UNKNOWN','この候補UIで確認済みのSHADOW形式ではありません。');
    if(status.schema_version!=='0.2'||market.schema_version!=='0.2')add('SCHEMA_UNKNOWN','未対応のデータ形式です。');
    if(!['NORMAL','NO_CHANGE','HOLD'].includes(status.run_state))add('RUN_UNKNOWN','実行状態を確認できません。');
    if(status.run_state==='HOLD')add('HOLD','更新処理はHOLDです。参考利用前に品質を確認してください。');
    if(q.qc!=='PASS')add('QC_NOT_PASS','保存データの品質確認が正常ではありません。');
    if(q.session!=='REGULAR')add('SESSION_NOT_REGULAR','株価が通常取引の確定値か確認できません。');
    if(q.source_crosscheck!=='PASS')add('CROSSCHECK','独立出典照合：'+(q.source_crosscheck==='PENDING'?'確認待ち':'要確認'),q.source_crosscheck==='PENDING'?'warn':'bad');
    const rows=TICKERS.map(ticker=>{
      const hits=raw.filter(x=>obj(x).ticker===ticker);
      const stock=hits.length===1?obj(hits[0]):null;
      let state=hits.length===0?'MISSING':hits.length>1?'DUPLICATE':'OK';
      if(state!=='OK')add(state+'_'+ticker,ticker+'：'+(state==='MISSING'?'データ欠損':'重複データ'));
      if(stock){
        if(!asOf||stock.trade_date!==asOf){state='DATE_MISMATCH';add('DATE_'+ticker,ticker+'：株価の基準日が不一致です。');}
        if(finite(stock.close)===null||finite(stock.close)<=0){state='INVALID';add('PRICE_'+ticker,ticker+'：有効な価格がありません。');}
        const a=signals(stock);
        if(Object.values(a).includes('未確認'))add('TECH_'+ticker,ticker+'：一部のテクニカルは未確認です。','warn');
        if(['MSTR','SOXL'].includes(ticker)&&stock.structural_growth!=null)add('SCOPE_'+ticker,ticker+'：対象外の成長スコアを検出しました。');
      }
      return {ticker,stock,state,signals:signals(stock)};
    });
    if(raw.some(x=>!TICKERS.includes(obj(x).ticker)))add('UNEXPECTED_SECURITY','対象外または識別できない銘柄があります。');
    const received=rows.filter(r=>r.stock&&finite(r.stock.close)!==null&&finite(r.stock.close)>0).length;
    const usable=rows.filter(r=>r.state==='OK').length;
    if(q.completeness!==received+'/'+TICKERS.length)add('COMPLETENESS','取得件数の申告が対象5銘柄と整合しません。');
    const items=list(common.decision_items),ts=obj(common.timestamps),cq=obj(common.data_quality);
    const bound=!!(asOf&&generated!==null&&common.schema_version==='1.0'&&common.market==='US'&&
      ts.market_as_of===asOf&&instant(ts.calculated_at)===generated&&items.length===TICKERS.length&&
      rows.every(r=>items.filter(x=>obj(x).ticker===r.ticker&&obj(x).subject_id===r.ticker&&obj(x).as_of===asOf).length===1));
    if(!bound)add('COMMON_UNBOUND','同じ基準日・計算日時・対象の共通品質情報を確認できません。');
    if(bound){
      if(cq.qc_state==='FAIL'||['STALE','MISSING'].includes(cq.data_state)||obj(common.incident).level==='BLOCKED')add('COMMON_BLOCKED','共通品質情報に利用を妨げる状態があります。');
      else if(!['PASS','WARN'].includes(cq.qc_state)||!['FRESH','PARTIAL'].includes(cq.data_state))add('COMMON_UNKNOWN','共通品質の状態を確認できません。');
      else if(cq.qc_state==='WARN'||cq.data_state==='PARTIAL')add('COMMON_PARTIAL','共通品質：一部確認待ちです。','warn');
      if(!['CURRENT','LAST_VALID'].includes(obj(common.snapshot).state))add('SNAPSHOT_UNKNOWN','参照可能な共通スナップショットを確認できません。');
      if(cq.source_crosscheck!==q.source_crosscheck)add('COMMON_CROSSCHECK_CONFLICT','出典照合状態がデータ間で不一致です。');
    }
    let otherBlockers=0;
    for(const item of items){
      const i=obj(item);
      if(i.formal_action!=null||i.analysis_action!=null||i.eligibility!=='NOT_ELIGIBLE')add('FORMAL_UNEXPECTED','未対応の正式判断または資格状態を検出しました。売買判断へ変換しません。');
      for(const blocker of list(i.blocking_conditions)){
        const b=obj(blocker);
        if(b.id==='FORMAL_ENGINE_NOT_IMPLEMENTED')continue;
        otherBlockers++;
        add('BLOCKER_'+otherBlockers,text(i.ticker)+'：'+(text(b.label)||'追加のブロック条件があります。'));
      }
    }
    list(status.errors).forEach((v,i)=>add('ERROR_'+i,text(v)||'未確認のエラーがあります。'));
    list(status.warnings).forEach((v,i)=>add('WARNING_'+i,text(v)||'未確認の警告があります。','warn'));
    if(options.offline)add('OFFLINE','オフラインです。表示内容は保存値です。');
    if(options.loadFailed)add('LOAD_FAILED',options.hasPrevious===false?'読込に失敗しました。データは未確認です。':'再読込に失敗しました。前回表示を継続しています。');
    if(options.loading)add('LOADING','再確認中です。取得完了までは前回表示です。','warn');
    const bad=reasons.some(r=>r.severity==='bad'),warn=reasons.length>0;
    const state=bad?'bad':warn?'warn':'good';
    const freshness=options.loadFailed?(options.hasPrevious===false?'データ未確認':'前回表示'):options.offline?'保存値・オフライン':!asOf?'基準日未確認':age!==null&&age>4?'古い保存値':'保存値 '+asOf.replace(/-/g,'/');
    return {uiVersion:VERSION,status,market,common,rows,asOf,received,usable,expected:5,bound,age,otherBlockers,reasons,state,freshness,
      headline:bad?'データ確認を優先':warn?'一部確認待ち':'参考データを確認',
      crossLabel:q.source_crosscheck==='PASS'?'正常':q.source_crosscheck==='PENDING'?'確認待ち':'要確認',
      formalLabel:'参考分析のみ・正式売買判断は未実装',
      sourceVersionVerified:false};
  }
  function summaryHtml(m){
    const rows=m.rows.map(r=>'<button type="button" class="ux-stock" data-open-stock="'+r.ticker+'">'+
      '<span class="ux-symbol">'+r.ticker+'</span><span class="ux-value">'+dollars(r.stock&&r.stock.close)+'</span>'+
      '<span class="ux-signal">'+esc(r.state==='OK'?r.signals.shortTerm:'要確認')+'</span>'+
      '<span class="delta '+(finite(r.stock&&r.stock.change_pct)>0?'up':finite(r.stock&&r.stock.change_pct)<0?'down':'flat')+'">'+percent(r.stock&&r.stock.change_pct)+'</span></button>').join('');
    return '<div class="ux-summary-head"><h2>本日の確認サマリー</h2><span class="ux-chip">参考分析</span></div>'+
      '<p class="ux-headline ux-'+m.state+'">'+esc(m.headline)+'</p><p class="ux-caption">'+esc(m.freshness)+' ／ 対象5銘柄</p>'+
      '<button type="button" class="ux-quality-link" data-go-tab="quality">株価 '+m.received+'/5取得 ／ 独立照合 '+esc(m.crossLabel)+'　品質詳細 ›</button>'+
      '<div class="ux-stocks">'+rows+'</div><p class="ux-caption">表示は既存の短期状態です。将来予測や発注指示ではありません。</p>';
  }
  function reasonsHtml(m){
    return m.reasons.length?'<div class="ux-reasons">'+m.reasons.map(r=>'<p class="ux-'+r.severity+'">'+esc(r.message)+'</p>').join('')+'</div>':'<p>現在の表示データに確認事項は検出されていません。正式売買の許可ではありません。</p>';
  }
  function qualityHtml(m){
    return '<div class="ux-quality-grid">'+[
      ['株価取得',m.received+'/5','有効な価格がある対象数'],['対象日整合',m.usable+'/5','重複・対象日・価格を確認'],
      ['独立照合',m.crossLabel,'保存された照合状態'],['共通情報',m.bound?'日時・対象一致':'未確認','同一公開版の完全証明ではありません']
    ].map(x=>'<div class="ux-metric"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></div>').join('')+'</div>'+
      '<p class="ux-caption">取得完了・出典一致・正式売買資格は別の状態です。</p>'+reasonsHtml(m);
  }
  function renderState(m,doc){
    const banner=doc.getElementById('globalDataNotice');
    banner.hidden=m.reasons.length===0;
    banner.className='ux-global ux-'+m.state;
    const priority=m.reasons.find(r=>r.code==='LOAD_FAILED')||m.reasons.find(r=>r.code==='OFFLINE')||m.reasons[0];
    banner.textContent=priority?(m.headline+'：'+priority.message+' 詳細は品質タブへ。'):'';
    doc.getElementById('digest').innerHTML=summaryHtml(m);
    doc.getElementById('qualityDigest').innerHTML=qualityHtml(m);
  }
  function groups(values){
    const defs=[['米国全体',['SPX','NASDAQ','VIX','US10Y']],['半導体',['SOX','SOXX','SMH']],['Bitcoin',['BTC']]];
    return defs.map(([label,symbols])=>({label,items:symbols.map(symbol=>{
      const hits=list(values).filter(x=>obj(x).symbol===symbol);
      return hits.length===1?hits[0]:{symbol,name:symbol,value:null,change_pct:null,trade_date:null};
    })}));
  }
  return Object.freeze({VERSION,TICKERS,finite,esc,day,instant,signals,model,summaryHtml,qualityHtml,reasonsHtml,renderState,groups});
});
