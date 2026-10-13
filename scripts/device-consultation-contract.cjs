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
 return adapter;
}
module.exports={patch};
