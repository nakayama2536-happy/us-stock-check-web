'use strict';
// Opt-in display-only successor. Never edits the approved release or public docs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const SCOPE='/us-stock-check-web/preview/connected/';
const VERSION='us-mobile-overview/1';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unreviewed mobile boundary: '+a.slice(0,55));return s.replace(a,()=>b);}
const CSS=`
/* Mobile overview: same model, directions, data and warnings. */
.ui-s1 .app{padding:8px 12px 86px}.ui-s1 .hero{padding:10px 12px;border-radius:14px}
.ui-s1 h1{font-size:19px;line-height:1.3}.ux-mode{font-size:15px;margin-top:3px}
.ux-formal{font-size:14px;line-height:1.45}.ux-asof{font-size:16px}.ux-asof strong{font-size:18px;font-variant-numeric:tabular-nums}
.ux-global{font-size:16px;line-height:1.45;padding:9px 11px;margin-top:8px}
.ui-s1 section{margin-top:10px}.usj-summary,.usj-list{padding:10px 12px;border-radius:14px}.usj-list{margin-top:8px}
.ux-summary-head h2{font-size:16px;margin:0}.ux-headline{font-size:20px;margin:3px 0}.ux-caption{font-size:14px;margin:3px 0}
.ux-quality-link{font-size:14px;line-height:1.45;margin:4px 0 0}.usj-caption{font-size:14px}.usj-source-note{font-size:16px}
.ui-s1 .usj-list h2{font-size:18px;margin:0 0 4px}.usm-quick{display:grid;gap:0}
.ui-s1 .usm-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(76px,.8fr) minmax(92px,1fr);align-items:center;gap:8px;width:100%;min-height:76px;padding:9px 0;border:0;border-bottom:1px solid #dbe3ed;background:transparent;text-align:left;color:inherit;font:inherit}
.usm-name,.usm-state,.usm-price{min-width:0}.usm-name b{display:block;font-size:18px}.usm-name small{display:block;font-size:14px;line-height:1.35;color:#53637d;overflow-wrap:anywhere}
.usm-state b{display:block;font-size:16px;line-height:1.35}.usm-state small{display:block;font-size:13px;line-height:1.45}.usm-price{text-align:right;font-variant-numeric:tabular-nums}.usm-price b{display:block;font-size:19px;white-space:nowrap}.usm-price small{display:block;font-size:14px}
.usm-overview{background:#fff;border:1px solid #dbe3ed;border-radius:14px;padding:10px 12px;margin-top:8px}.usm-overview>h2{font-size:18px!important;margin:0 0 4px!important}.usm-quality-summary{margin:0}.usm-quality-summary .ux-quality-link{font-size:14px}.usm-quality-summary .ux-headline{font-size:18px}.usm-help,.usm-full{margin:4px 0 0;border:0;box-shadow:none;background:transparent}.ui-s1 .usm-help>summary,.ui-s1 .usm-full>summary{font-size:16px;min-height:44px;padding:10px 0;color:#174d87}.usm-help .usj-source-note{padding:4px 0 10px}
.ui-s1 .bottom-nav{padding:4px 8px;background:#fff}.ui-s1 .bottom-nav button{min-height:48px;font-size:16px;padding:7px 2px;border-radius:10px}.ui-s1 .bottom-nav button.active{box-shadow:none}
.ui-s1 button:focus-visible,.ui-s1 summary:focus-visible{outline:3px solid #3579bb;outline-offset:2px}
@media(max-width:359px){.ui-s1 .app{padding-left:8px;padding-right:8px}.usm-row{gap:5px!important}.usm-name small{font-size:14px}.usm-price b{font-size:18px}}
@media(orientation:landscape) and (max-height:500px){.ui-s1 .hero{padding:8px 12px}.ui-s1 .app{padding-top:6px}.ui-s1 .bottom-nav button{min-height:44px}}
`;
const QUICK=`  function mobileRowsHtml(m){
    return '<div class="usm-quick" aria-label="5銘柄の保存値・参考状態">'+m.rows.map(row=>{
      const v=rowView(row,m),t=esc(v.ticker);
      return '<button type="button" class="usm-row" data-open-stock="'+t+'" aria-label="'+t+' '+esc(v.name)+' '+esc(v.price)+' '+esc(v.badge)+' '+esc(v.check.label)+'。銘柄詳細へ">'+
        '<span class="usm-name"><b>'+t+'</b><small>'+esc(v.name)+'</small></span>'+
        '<span class="usm-state"><b>'+esc(v.badge)+'</b><small class="usj-check-'+v.check.tone+'">'+esc(v.check.label)+'</small></span>'+
        '<span class="usm-price"><b>'+esc(v.price)+'</b><small class="usj-'+v.changeTone+'">'+esc(v.change)+'</small></span></button>';
    }).join('')+'</div>';
  }
`;
function compactAssets(assets){
 const out={...assets};
 let code=out['judgment-cards.js'];
 if(typeof code!=='string'||!out['candidate/experience.css'])throw Error('Missing reviewed UI sources');
 code=once(code,'  function summaryHtml(m){',QUICK+`  function summaryHtml(m){
    return '<article class="usm-quality-summary">'+(!m.reasons.length?'<p class="ux-headline ux-'+m.state+'">'+esc(m.headline)+'</p>':'')+
      '<button type="button" class="ux-quality-link" data-go-tab="quality">保存時：株価 '+m.received+'/5 ／ 終値照合 '+esc(m.crossLabel)+'　品質詳細 ›</button></article>'+
      '<article class="usm-overview"><h2>5銘柄の早見</h2><p class="usj-caption">短期の参考状態です。売買指示ではありません。</p>'+mobileRowsHtml(m)+
      '<details class="usm-full"><summary>テクニカル・根拠を詳しく見る</summary>'+fullSummaryHtml(m)+'</details></article>';
  }
  function fullSummaryHtml(m){`);
 // Keep the complete original detailed rendering and every warning unchanged.
 code=once(code,'    base.renderState(m,doc);',"    const opened=['.usm-help','.usm-full'].filter(s=>doc.querySelector(s)?.open);\n    const active=doc.activeElement;const focusSelector=active?.tagName==='SUMMARY'?opened.find(s=>active.parentElement.matches(s)):null;\n    base.renderState(m,doc);");
 code=once(code,"    doc.getElementById('digest').innerHTML=summaryHtml(m);", "    doc.getElementById('digest').innerHTML=summaryHtml(m);\n    for(const s of opened)doc.querySelector(s).open=true;\n    if(focusSelector)doc.querySelector(focusSelector+'>summary').focus({preventScroll:true});");
 out['judgment-cards.js']=code;
 out['judgment-cards.css']+='\n'+CSS;
 return out;
}
function inventory(root){let out={};for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isSymbolicLink())throw Error('Linked site rejected');if(e.isDirectory()){for(const[n,b]of Object.entries(inventory(p)))out[e.name+'/'+n]=b;}else if(e.isFile())out[e.name]=fs.readFileSync(p);else throw Error('Nonregular site file');}return out;}
function polish(input,output,revision){
 const src=path.resolve(input),out=path.resolve(output);
 if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Full consumer revision required');
 if(out===src||out.startsWith(src+path.sep)||src.startsWith(out+path.sep)||out===ROOT||out.startsWith(ROOT+path.sep)||ROOT.startsWith(out+path.sep)||fs.existsSync(out))throw Error('Fresh external output required');
 if(fs.realpathSync(src)!==src)throw Error('Linked source rejected');
 const bytes=inventory(src),meta=JSON.parse(bytes['BUILD.json']),manifest=JSON.parse(bytes['delivery/current.json']);
 if(meta.schema!=='us-connected-preview/1'||meta.scope!==SCOPE||meta.published!==false||meta.device_pass!==false||meta.mobile_layout)throw Error('Expected unpublished reviewed source');
 for(const[n,digest]of Object.entries(meta.sha256))if(!bytes[n]||hash(bytes[n])!==digest)throw Error('Source UI digest mismatch');
 if(!/^[a-f0-9]{64}$/.test(manifest.release||'')||manifest.schema!=='us-ui-delivery/1'||manifest.source_repository!=='nakayama2536-happy/us-stock-check')throw Error('Producer manifest mismatch');
 const dataNames=['common_snapshot.json','market.json','ohlcv-history.json','status.json'];
 if(Object.keys(manifest.files).sort().join(',')!==dataNames.join(','))throw Error('Source data allowlist mismatch');
 const descriptor={schema:manifest.schema,source_repository:manifest.source_repository,source_revision:manifest.source_revision,files:manifest.files};
 if(hash(JSON.stringify(descriptor))!==manifest.release)throw Error('Source release digest mismatch');
 const dir='delivery/releases/'+manifest.release+'/';
 const allowed=['BUILD.json','assets.json','candidate.js','delivery.js','index.html','manifest.webmanifest','preview-adapter.js','storage.js','sw-register.js','sw.js','icons/us-stock-icon.png','delivery/current.json',...dataNames.map(n=>dir+n)];
 if(Object.keys(bytes).sort().join(',')!==allowed.sort().join(','))throw Error('Source site allowlist mismatch');
 for(const[n,m]of Object.entries(manifest.files)){const b=bytes[dir+n];if(!b||b.length!==m.bytes||hash(b)!==m.sha256)throw Error('Source data digest mismatch');}
 const data=JSON.parse(bytes[dir+'status.json']),common=JSON.parse(bytes[dir+'common_snapshot.json']);
 if(data.app_state!=='SHADOW'||common.decision_items.some(x=>x.formal_action!==null))throw Error('Display-only contract mismatch');
 const assets=compactAssets(JSON.parse(bytes['assets.json']));
 bytes['assets.json']=Buffer.from(JSON.stringify(assets));
 let html=bytes['index.html'].toString();
 html=once(html,'<header><div><b>米国株 接続確認版</b>','<header class="usm-header"><div><b>接続確認版・保存値</b>');
 html=once(html,'<p>通常版とは別の確認用画面です。売買には使用しません。</p>','');
 html=once(html,'<summary>配信版・更新・実機確認</summary>','<summary>版・更新操作</summary>');
 html=once(html,'</style>',`header.usm-header{position:relative;padding-top:calc(4px + env(safe-area-inset-top));padding-bottom:4px;font-size:14px;max-height:45dvh}header.usm-header>div{padding-right:100px;min-height:32px}header.usm-header b{font-size:16px}header.usm-header a{min-height:44px;display:inline-flex;align-items:center}header.usm-header>details>summary{position:absolute;right:12px;top:calc(4px + env(safe-area-inset-top));min-height:44px;padding:10px 0;font-size:14px}header.usm-header p{line-height:1.45;font-size:14px}header.usm-header>details[open]{padding:8px 0}header.usm-header>details>p,header.usm-header>details>button{font-size:16px}.usm-purpose{color:#53637d}body{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}@media(orientation:landscape) and (max-height:500px){header.usm-header{max-height:35dvh}.usm-purpose{margin:0}}</style>`);
 bytes['index.html']=Buffer.from(html);
 const hashes=Object.fromEntries(Object.keys(meta.sha256).filter(n=>n!=='sw.js').map(n=>[n,hash(bytes[n])]));
 const uiHash=hash(JSON.stringify({policy:VERSION,hashes})),cache='us-connected-preview-shell-'+uiHash;
 let sw=bytes['sw.js'].toString();
 sw=once(sw,JSON.stringify(meta.shell_cache),JSON.stringify(cache));
 const oldHashes={...meta.sha256};delete oldHashes['sw.js'];
 sw=once(sw,'FILES='+JSON.stringify(oldHashes),'FILES='+JSON.stringify(hashes));
 bytes['sw.js']=Buffer.from(sw);
 const next={...meta,consumer_revision:revision,ui_sha256:uiHash,shell_cache:cache,sha256:{...hashes,'sw.js':hash(bytes['sw.js'])},mobile_layout:VERSION,parent_consumer_revision:meta.consumer_revision,published:false,device_pass:false};
 bytes['BUILD.json']=Buffer.from(JSON.stringify(next,null,2)+'\n');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 if(fs.realpathSync(path.dirname(out))!==path.dirname(out))throw Error('Linked output parent rejected');
 // No destination is visible until every source and transformation has passed.
 const temp=fs.mkdtempSync(path.join(path.dirname(out),'.us-mobile-'));
 try{for(const[n,b]of Object.entries(bytes)){const p=path.join(temp,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b,{flag:'wx'});}fs.renameSync(temp,out);}finally{if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true});}
 return next;
}
if(require.main===module){try{console.log(JSON.stringify(polish(...process.argv.slice(2))));}catch(e){console.error('MOBILE BUILD REJECTED:',e.message);process.exitCode=1;}}
module.exports={polish,compactAssets,inventory,VERSION};
