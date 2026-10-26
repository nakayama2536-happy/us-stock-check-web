/* Read-only daily 5-tab unification candidate. No market acquisition, formal trade, or private holdings. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.USUnified=api;
})(typeof window==="undefined"?globalThis:window,function(){
  "use strict";
  const TICKERS=Object.freeze(["PLTR","LLY","BSY","MSTR","SOXL"]);
  const DATE=/^\d{4}-\d{2}-\d{2}$/;
  const escapeHTML=value=>String(value==null?"":value).replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
  function calendarAge(marketDate,today){
    if(!DATE.test(marketDate||"")||!DATE.test(today||""))return null;
    const a=Date.parse(marketDate+"T00:00:00Z"),b=Date.parse(today+"T00:00:00Z");
    if(!Number.isFinite(a)||!Number.isFinite(b))return null;
    return Math.round((b-a)/86400000);
  }
  function tokyoToday(now){
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
      timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(now||new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    return parts.year+"-"+parts.month+"-"+parts.day;
  }
  function validate(status,market,common){
    if(!status||!market||status.app_state!=="SHADOW"||
        !["NORMAL","NO_CHANGE","HOLD"].includes(status.run_state)||
        !DATE.test(status.us_trade_date||"")||
        typeof status.generated_at_jst!=="string"||
        !Array.isArray(market.stocks)||
        market.stocks.length!==TICKERS.length||
        status.quality?.completeness!=="5/5"){
      return {ok:false,reason:"取得状態・基準日・5銘柄の整合が確認できません。"};
    }
    const codes=market.stocks.map(s=>s&&s.ticker);
    if(TICKERS.some(t=>codes.filter(x=>x===t).length!==1)||
        market.stocks.some(s=>s.trade_date!==status.us_trade_date||
        !Number.isFinite(s.close)||s.close<=0||
        (s.change_pct!==null&&s.change_pct!==undefined&&!Number.isFinite(s.change_pct)))){
      return {ok:false,reason:"銘柄または価格と保存基準日の整合が確認できません。"};
    }
    let commonOk=false;
    if(common){
      const items=common.decision_items||[];
      commonOk=common.schema_version==="1.0"&&common.market==="US"&&
        common.timestamps?.market_as_of===status.us_trade_date&&
        common.timestamps?.calculated_at===status.generated_at_jst&&
        items.length===TICKERS.length&&
        TICKERS.every(t=>items.filter(x=>x.ticker===t&&x.as_of===status.us_trade_date).length===1)&&
        items.every(x=>x.formal_action===null);
      if(!commonOk)return {ok:false,reason:"共通判断スナップショットの時刻・対象・正式判断の整合が確認できません。"};
    }
    return {ok:true,commonOk,reason:null};
  }
  function formatMoney(n){return "$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function formatPct(n){return n===null||n===undefined?"—":(n>0?"+":"")+Number(n).toFixed(2)+"%";}
  function render(status,market,legacyDigest,shortState){
    const stocks=Object.fromEntries(market.stocks.map(s=>[s.ticker,s]));
    const rows=TICKERS.map(t=>{
      const s=stocks[t];
      const d=(s.trend!=null&&s.macd_state!=null&&typeof shortState==="function")?shortState(s):null;
      const label=d?.shortTerm||"参考状態未確認";
      const c=s.change_pct==null?"flat":s.change_pct>0?"up":s.change_pct<0?"down":"flat";
      return '<button class="unified-row" type="button" data-unified-ticker="'+t+
        '" aria-label="'+t+' '+escapeHTML(s.name)+' '+escapeHTML(label)+' の銘柄詳細を見る">'+
        '<span class="unified-name"><b>'+t+'</b><small>'+escapeHTML(s.name)+'</small></span>'+
        '<span class="unified-signal"><b>'+escapeHTML(label)+'</b><small>短期参考</small></span>'+
        '<span class="unified-price"><b>'+formatMoney(s.close)+'</b><small class="'+c+'">'+formatPct(s.change_pct)+'</small></span></button>';
    }).join("");
    return '<div class="unified-summary"><h3>5銘柄の早見</h3>'+
      '<p>市場基準日 '+escapeHTML(status.us_trade_date)+'／保存済みの参考分析。正式な売買判断ではありません。</p>'+
      '<div class="unified-rows">'+rows+'</div>'+
      '<details class="unified-legacy"><summary>詳細ダイジェストを表示</summary>'+
      '<div class="unified-legacy-body">'+legacyDigest+'</div></details></div>';
  }
  function notice(status,commonOk,today){
    const q=status.quality||{},notes=[];
    if(status.run_state==="HOLD")notes.push("今回の更新は保留中です。直前の保存値を当日の確定値とみなしません。");
    if(q.qc!=="PASS")notes.push("データ品質は"+String(q.qc||"未確認")+"です。");
    if(q.source_crosscheck!=="PASS")notes.push("独立出典照合は"+String(q.source_crosscheck||"未確認")+"です。");
    if(q.session!=="REGULAR")notes.push("通常取引セッションの確認状態は"+String(q.session||"未確認")+"です。");
    if(!commonOk)notes.push("共通判断スナップショットが未取得です。");
    const age=calendarAge(status.us_trade_date,today);
    if(age===null||age<0)notes.push("保存市場日を確認できません。");
    else if(age>4)notes.push("保存基準日は"+age+"暦日前です。新しい通常取引日の確定値とは限りません。");
    return notes.join(" ");
  }
  return Object.freeze({TICKERS,escapeHTML,calendarAge,tokyoToday,validate,render,notice});
});
