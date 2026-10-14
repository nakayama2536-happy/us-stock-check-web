'use strict';
// Build-time patch only. Never changes source data or regular-app behavior.
function once(text, from, to){
 if(text.split(from).length!==2)throw Error('Unreviewed consultation boundary');
 return text.replace(from,()=>to);
}
function patch(adapter){
 adapter=once(adapter,'  function consultationData(files,kind,ticker){',`  // Device consultation contract v2: absent evidence remains unknown.
  function consultationStatus(status){
    const result=pick(status,'app_version app_state us_trade_date generated_at_jst run_state');
    const modes=[status.mode,status.app_state].filter(v=>v!==null&&v!==undefined&&v!=='');
    const valid=modes.length>0&&modes.every(v=>['SHADOW','PRODUCTION'].includes(v))&&new Set(modes).size===1;
    return {...result,mode:valid?modes[0]:null,mode_source:valid?(status.mode?'mode':'app_state'):null,
      mode_status:valid?'RECORDED':modes.length?'CONFLICT_OR_INVALID':'NOT_RECORDED'};
  }
  function consultationCoverage(stock,history,delivery){
    const g=stock.structural_growth;
    // Scope is tied to the reviewed producer config, not inferred for future releases.
    const reviewed=delivery?.source_revision==='e1f8e595099e94e3473be2b1ab8225b4de86c22a';
    const outside=reviewed&&['MSTR','SOXL'].includes(stock.ticker);
    const values=['revenue_growth_ttm_pct','eps_growth_ttm_pct','fcf_growth_ttm_pct','operating_margin_ttm_pct'].map(k=>g?.axes?.financial_growth_quality?.[k]);
    const count=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).length;
    return {growth:outside?'NOT_APPLICABLE':g?'RECORDED':'NOT_RECORDED',
      financial_metrics:outside?'NOT_APPLICABLE':count===4?'RECORDED':count?'PARTIAL':'NOT_RECORDED',
      history:(history.series?.[stock.ticker]||[]).length?'RECORDED':history.note==='観測終値履歴は未接続。'?'NOT_CONNECTED':'NOT_RECORDED',
      note:outside?'この生成版の一般企業向け成長評価の対象外。取得失敗ではありません。':'欠損の理由・取得失敗は、記録がない限り断定しません。'};
  }
  function consultationAcquisition(capture,status,delivery){
    const origin=capture?.capture;
    const same=!!delivery&&origin?.repository===delivery.source_repository&&origin?.code_sha===delivery.source_revision&&
      typeof origin?.run_id==='string'&&/^\\d+$/.test(origin.run_id)&&capture.generated_at_jst===status.generated_at_jst&&capture.basis_date===status.us_trade_date;
    return {relationship:same?'SAME_RUN_DECLARED':'UNCONFIRMED',
      note:same?'収録メタデータは同一計算実行由来を示します。内部ログ・完全な計算入力の独立監査ではありません。':'取得実行の同一性は未確認です。別実行とも断定しません。'};
  }
  function consultationData(files,kind,ticker){`);
 adapter=once(adapter,"status:pick(status,'app_version mode us_trade_date generated_at_jst run_state')","status:consultationStatus(status)");
 adapter=once(adapter,"input_git_blob_sha:{...files._hashes},delivery_manifest:files._delivery,","acquisition:consultationAcquisition(capture,status,files._delivery),\n      input_git_blob_sha:{...files._hashes},delivery_manifest:files._delivery,");
 adapter=once(adapter,"growth:pick(g,'status score data_completeness_pct required_completeness_pct fundamental_source fundamental_last_updated'),","coverage:consultationCoverage(s,history,files._delivery),\n          growth:pick(g,'status score data_completeness_pct required_completeness_pct fundamental_source fundamental_last_updated'),");
 adapter=once(adapter,'元画面とは別の取得実行です。','取得実行の関係はacquisitionを参照してください。');
 adapter=once(adapter,'history_rows:s.history.length,','coverage:s.coverage,history_rows:s.history.length,');
 adapter=once(adapter,'quality:data.quality,','quality:data.quality,acquisition:data.acquisition,');
 return patchFreshness(adapter);
}
function patchFreshness(adapter){
 adapter=once(adapter,'  function consultationData(files,kind,ticker){',String.raw`  // Age is evaluated once per export, separately from the stored quality result.
  function consultationFreshness(status,now){
    const validClock=now instanceof Date&&Number.isFinite(now.getTime());
    const raw=status.us_trade_date;
    const basis=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(Date.parse(raw))&&new Date(raw).toISOString().slice(0,10)===raw?raw:null;
    const today=validClock?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now):null;
    const age=basis&&today?Math.floor((Date.parse(today)-Date.parse(basis))/86400000):null;
    return {data_kind:'FIXED_PREVIEW',auto_updates_market_data:false,
      evaluated_at:validClock?now.toISOString():null,clock:'DEVICE_CLOCK',calendar_timezone:'Asia/Tokyo',basis_date:basis,
      age_calendar_days:age,stale_after_calendar_days:4,
      state:!validClock?'CLOCK_UNKNOWN':!basis?'DATE_UNKNOWN':age<0?'FUTURE_DATE':age>4?'STALE':'WITHIN_AGE_LIMIT',
      note:'端末日時で評価。保存時PASS・警告0件とは別の評価です。営業日数・予測期間ではなく、4暦日以内でも最新価格の保証ではありません。'};
  }
  function consultationData(files,kind,ticker,now=new Date()){`);
 adapter=once(adapter,'status:consultationStatus(status),quality:',`freshness:consultationFreshness(status,now),quality_scope:'RECORDED_AT_GENERATION',
      timestamp_meanings:{generated_at_jst:'市場データの生成日時',verified_at:'配信ファイルの照合日時。株価更新日時ではありません',evaluated_at:'相談文作成時の端末時計による鮮度評価日時'},
      status:consultationStatus(status),quality:`);
 adapter=once(adapter,'function consultationText(files,kind,ticker){','function consultationText(files,kind,ticker,now=new Date()){');
 adapter=once(adapter,'const data=consultationData(files,kind,ticker);','const data=consultationData(files,kind,ticker,now);');
 adapter=once(adapter,'function consultationPackage(files,kind,ticker){','function consultationPackage(files,kind,ticker,now=new Date()){');
 adapter=once(adapter,'const data=consultationData(files,kind,ticker),full=consultationText(files,kind,ticker);','const data=consultationData(files,kind,ticker,now),full=consultationText(files,kind,ticker,now);');
 adapter=once(adapter,'quality:data.quality,acquisition:data.acquisition,','quality:data.quality,quality_scope:data.quality_scope,freshness:data.freshness,timestamp_meanings:data.timestamp_meanings,acquisition:data.acquisition,');
 adapter=once(adapter,"status:clip(data.status.us_trade_date),tickers:","status:clip(data.status.us_trade_date),quality_scope:data.quality_scope,freshness:data.freshness,timestamp_meanings:data.timestamp_meanings,tickers:");
 adapter=once(adapter,'読込済み確認版です。日数は計算期間であり予測期間ではありません。','固定データの確認版です。品質PASSと警告・エラー件数は保存時の記録であり、現在の鮮度はfreshnessを確認してください。日数は計算期間であり予測期間ではありません。');
 return adapter;
}
function patchDeliveryTime(code){
 return once(code,"' ／ 計算 '+st.generated_at_jst+'。取得成功は品質PASSを意味しません。'",
   "' ／ データ生成 '+st.generated_at_jst+' ／ 配信ファイル照合 '+files._delivery.verified_at+'（株価更新日時ではありません）。取得成功は品質PASSを意味しません。'");
}
module.exports={patch,patchFreshness,patchDeliveryTime};
