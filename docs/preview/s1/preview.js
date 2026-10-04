/* Frozen, hash-bound UI preview. No same-origin permission in its iframe. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.USPreview=api;api.start();}
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const PINS=Object.freeze({
    'candidate/index.html':'5c46ff665ab6aa770ecbbd2e46a1435143c20c10',
    'candidate/experience.js':'2076f0257887d5758b42692187a68833c86d288c',
    'candidate/experience.css':'2b86c215a1d1867e8d0386382aaf0cbf934bb6c4',
    'candidate/bootstrap.js':'7a7404b2b241bc7f2c13dd0c12b0b0af8e2493bf',
    'reference/app.js':'b8618ae99fab2c72414fe49c65edf81d87ac9c10',
    'reference/style.css':'1f00442914297c7fd3810d07c3c1460ac0bc260a',
    'data/status.json':'678537d44b0f8152b272998b3c4da8bfc870f4fd',
    'data/market.json':'37cc12720758f938a1a29a51f9b4e50cbb50e930',
    'data/common_snapshot.json':'8ee9906b8c5ae448cc81a0fdf398f2912122d46b'
  });
  function once(s,from,to){
    if(s.split(from).length!==2)throw new Error('Unreviewed source boundary');
    return s.replace(from,()=>to);
  }
  function section(s,start,end,value){
    if(s.split(start).length!==2||s.split(end).length!==2)throw new Error('Unreviewed function boundary');
    const a=s.indexOf(start),b=s.indexOf(end);if(b<=a)throw new Error('Invalid boundaries');
    return s.slice(0,a)+value+'\n'+s.slice(b);
  }
  async function blobHash(bytes){
    const head=new TextEncoder().encode('blob '+bytes.length+'\0');
    const full=new Uint8Array(head.length+bytes.length);full.set(head);full.set(bytes,head.length);
    const hash=await globalThis.crypto.subtle.digest('SHA-1',full);
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
  const safeJSON=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  function makeDocument(files){
    const data={};
    for(const name of ['status.json','market.json','common_snapshot.json'])data['./data/'+name]=JSON.parse(files['data/'+name]);
    let source=files['reference/app.js'];
    source=once(source,'const TAB_IDS=["overview","stocks","market","quality"];','const TAB_IDS=["overview","stocks","market","quality","manage"];');
    source=once(source,'const fmt=v=>v===null||v===undefined||v===""?"—":v;','const fmt=v=>v===null||v===undefined||v===""?"—":USExperience.esc(v);');
    source=section(source,'function decisionState(s){','function signalTone(value){','function decisionState(s){return USExperience.signals(s);}\n');
    source=section(source,'async function getJSON(path){','function digestPanel(status,market){','async function getJSON(path){if(!Object.prototype.hasOwnProperty.call(PREVIEW_DATA,path))throw new Error("Unknown preview data");return JSON.parse(JSON.stringify(PREVIEW_DATA[path]));}\n');
    source=once(source,'Number.isFinite(Number(p.value))','USExperience.finite(p.value)!==null');
    source=once(source,'<strong>${ticker}</strong>','<strong>${fmt(ticker)}</strong>');
    if(source.split('async function main(options={}){').length!==2)throw new Error('Unreviewed bootstrap');
    source=source.slice(0,source.indexOf('async function main(options={}){'));
    if(source.includes('serviceWorker.register'))throw new Error('Unexpected worker');
    let boot=files['candidate/bootstrap.js'];
    boot=once(boot,"note.textContent='公開データを確認しています。バックエンド更新は実行しません。';","note.textContent='固定データを再表示しています。市場データの取得・更新は行いません。';");
    boot=once(boot,"note.textContent='公開データ読込完了。品質状態：'","note.textContent='固定データの表示完了。品質状態：'");
    let html=files['candidate/index.html'];
    html=html.replace(/<link\b[^>]*>/gi,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    html=html.replace('UI候補・未公開','UI確認版').replace('公開データを再読込','固定データを再表示');
    html=html.replace('公開済みJSONの再読込だけを行います。バックエンド更新・売買注文は実行しません。','固定データの再表示だけを行います。市場データ取得・売買注文は実行しません。');
    html=html.replace(/<a\b[^>]*class="ux-link"[^>]*>([\s\S]*?)<\/a>/g,'<span class="ux-link" aria-disabled="true">本番の更新操作は通常アプリで行います。</span>');
    const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
    html=html.replace('<head>',()=>'<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">');
    const css=files['reference/style.css']+'\n'+files['candidate/experience.css'];
    html=html.replace('</head>',()=>'<style>'+css+'</style></head>');
    const code='const PREVIEW_DATA='+safeJSON(data)+';\n'+files['candidate/experience.js']+'\n'+source+'\n'+boot;
    return html.replace('</body>',()=>'<script>'+safeScript(code)+'</script></body>');
  }
  async function readPinned(path){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await fetch('./'+path,{cache:'no-store',credentials:'omit',signal:abort.signal});
      if(!response.ok||response.redirected)throw new Error('Source unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>200000||await blobHash(bytes)!==PINS[path])throw new Error('Source integrity mismatch');
      return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }finally{clearTimeout(timer);}
  }
  async function start(){
    const status=document.getElementById('loading'),frame=document.getElementById('previewFrame');
    try{
      const entries=await Promise.all(Object.keys(PINS).map(async path=>[path,await readPinned(path)]));
      frame.srcdoc=makeDocument(Object.fromEntries(entries));
      frame.hidden=false;status.hidden=true;
    }catch(_){status.textContent='確認用データを読み込めませんでした。通信を確認して、このページを再読込してください。通常アプリは変更されていません。';frame.hidden=true;}
  }
  return Object.freeze({PINS,blobHash,makeDocument,start});
});
