'use strict';
// Opt-in, unpublished /preview/connected/ builder. Never writes the repository.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const delivery=require('./delivery.js'),preview=require('../docs/preview/s1/preview.js');
const {build}=require('./build.cjs'),{once}=require('./adapter.cjs');
const ROOT=path.resolve(__dirname,'..');
const SCOPE='/us-stock-check-web/preview/connected/';
const DATA_CACHE='us-connected-preview-delivery-v1',PREFIX='us-connected-preview-shell-';
const PRODUCER='nakayama2536-happy/us-stock-check';
const FILES=['status.json','market.json','common_snapshot.json','ohlcv-history.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const forbidden=new Set(['shares','quantity','position_size','average_cost','cost_basis','purchase_price','account_type','position_id','planned_total_shares','stage_size','completed_stages','max_stages','opened_at','closed_at','brokerage_account','brokerage_account_id','portfolio_id','api_key','apikey','access_token','token','password','secret','burnin_evidence']);
function publicSafe(value,depth=0){
 if(depth>40)throw Error('Public structure too deep');
 if(typeof value==='string'&&/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,})/.test(value))throw Error('Private credential-like value rejected');
 if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(forbidden.has(k.toLowerCase()))throw Error('Private field rejected');publicSafe(v,depth+1);}
}
function safeRead(root,relative){
 const parts=relative.replace(/^\.\//,'').split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw Error('Invalid delivery path');
 let file=root;for(const part of parts){file=path.join(file,part);if(fs.lstatSync(file).isSymbolicLink())throw Error('Delivery symlink rejected');}
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size>1000000)throw Error('Invalid delivery file size/type');
 return fs.readFileSync(file);
}
async function trusted(input,producerSha,runId){
 if(!/^[a-f0-9]{40}$/.test(producerSha||'')||!/^\d+$/.test(runId||''))throw Error('Explicit producer SHA and run ID required');
 const root=path.resolve(input);if(fs.realpathSync(root)!==root)throw Error('Input symlink rejected');
 const b=await delivery.load('./',{fetcher:async url=>new Response(safeRead(root,url))});
 if(Object.keys(b.raw).sort().join(',')!==FILES.slice().sort().join(','))throw Error('Exactly four approved files required');
 if(b.manifest.source_repository!==PRODUCER||b.manifest.source_revision!==producerSha)throw Error('Producer source mismatch');
 const s=b.objects['status.json'],m=b.objects['market.json'],c=b.objects['common_snapshot.json'],h=b.objects['ohlcv-history.json'];
 if(s.app_state!=='SHADOW'||!['NORMAL','NO_CHANGE'].includes(s.run_state)||s.quality?.qc!=='PASS'||s.quality?.session!=='REGULAR'||s.quality?.source_crosscheck!=='PASS'||(s.errors||[]).length)throw Error('Preview quality gate rejected');
 if(c.market!=='US'||!Array.isArray(c.decision_items)||c.decision_items.length!==5||c.decision_items.some(x=>x.formal_action!==null||x.eligibility!=='NOT_ELIGIBLE'))throw Error('Formal action/eligibility cannot be introduced');
 if(h.capture?.repository!==PRODUCER||h.capture.code_sha!==producerSha||h.capture.run_id!==runId||h.generated_at_jst!==s.generated_at_jst||h.basis_date!==s.us_trade_date)throw Error('Capture run/time mismatch');
 for(const stock of m.stocks){const result=preview.ohlcvFor(stock,h);if(!result.available)throw Error('OHLCV binding rejected: '+stock.ticker);}
 for(const o of Object.values(b.objects))publicSafe(o);
 return b;
}
function externalTarget(output){
 const out=path.resolve(output);
 if(out===ROOT||out.startsWith(ROOT+path.sep)||ROOT.startsWith(out+path.sep))throw Error('Output must be outside repository');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 if(fs.realpathSync(path.dirname(out))!==path.dirname(out))throw Error('Output parent symlink rejected');
 return out;
}
function storeBundle(bundle,directory){
 fs.mkdirSync(directory,{recursive:true});if(fs.realpathSync(directory)!==path.resolve(directory))throw Error('Output symlink rejected');
 const dest=path.join(directory,'releases',bundle.manifest.release);
 fs.mkdirSync(dest,{recursive:true});if(fs.realpathSync(dest)!==dest)throw Error('Release symlink rejected');
 for(const[name,text]of Object.entries(bundle.raw)){const p=path.join(dest,name);if(fs.existsSync(p)&&(fs.lstatSync(p).isSymbolicLink()||!fs.readFileSync(p).equals(Buffer.from(text))))throw Error('Immutable release conflict');}
 for(const[name,text]of Object.entries(bundle.raw)){const p=path.join(dest,name);if(!fs.existsSync(p))fs.writeFileSync(p,text,{flag:'wx'});}
 const tmp=path.join(directory,'current.'+crypto.randomUUID()+'.tmp');
 fs.writeFileSync(tmp,JSON.stringify(bundle.manifest)+'\n',{flag:'wx'});
 fs.renameSync(tmp,path.join(directory,'current.json'));
}
function installShell(out,revision){
 let assets=JSON.parse(fs.readFileSync(path.join(out,'assets.json')));
 assets['candidate/index.html']=once(assets['candidate/index.html'],'この候補はService Workerを登録しません。公開・PWA実機受入は別工程です。','この接続確認版は専用の保存領域を使用します。通常版への切替・実機受入は別工程です。');
 fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify(assets));
 let storage=fs.readFileSync(path.join(out,'storage.js'),'utf8');
 storage=once(storage,"const CACHE='us-stock-check-delivery-v1';",`const CACHE='${DATA_CACHE}';`);
 fs.writeFileSync(path.join(out,'storage.js'),storage);
 let app=fs.readFileSync(path.join(out,'candidate.js'),'utf8');
 app=once(app,"try{const t=localStorage.getItem('usstock.activeTab');if(tabs.includes(t))selection.tab=t;}catch(_){}",'// No regular-app preferences are read, imported or changed.');
 app=once(app," 'use strict';",` 'use strict';\n if(!location.pathname.startsWith('${SCOPE}')){document.body.textContent='接続確認版は専用URLでのみ起動します。';return;}`);
 app=once(app,'function tell(state){if(current)',"function tell(state){document.getElementById('connectedState').textContent=({ready:'配信データ表示 / 参考分析',offline:'保存値 / オフライン・GPT停止',failed:'再取得未確認 / GPT停止',loading:'データ確認中 / GPT停止'})[state];if(current)");
 fs.writeFileSync(path.join(out,'candidate.js'),app);
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 html=html.replace(/<header>[\s\S]*?<\/header>/,`<header><div><b>米国株 接続確認版</b><a href="/us-stock-check-web/" target="_top">通常版へ</a></div><p>通常版とは別の確認用画面です。売買には使用しません。</p><p id="connectedState" role="status">データ確認中 / GPT停止</p><details><summary>配信版・更新・実機確認</summary><button id="deliveryRefresh" type="button">配信データを再読込</button><p id="deliveryState" role="status"></p><p>再読込は配信済みデータの照合です。市場取得の実行や最新価格の保証ではありません。</p><p>ホーム画面名：米国接続確認。通常アプリの削除・保存データ消去は不要です。</p></details></header>`);
 html=html.replace('</style>','header{max-height:48dvh;overflow-y:auto}header summary,header button{min-height:44px;font:inherit}#connectedState{font-weight:700}@media(orientation:landscape) and (max-height:500px){header{padding-top:2px;padding-bottom:2px}header p{margin:0}header>div{min-height:28px}}</style>');
 html=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./icons/us-stock-icon.png"><meta name="apple-mobile-web-app-title" content="米国接続確認"><meta name="apple-mobile-web-app-capable" content="yes"></head>');
 html=html.replace('</body>','<script src="./sw-register.js" defer></script></body>');
 fs.writeFileSync(path.join(out,'index.html'),html);
 fs.mkdirSync(path.join(out,'icons'));fs.copyFileSync(path.join(ROOT,'docs/icons/us-stock-icon.png'),path.join(out,'icons/us-stock-icon.png'));
 fs.writeFileSync(path.join(out,'manifest.webmanifest'),JSON.stringify({id:SCOPE,start_url:SCOPE,scope:SCOPE,name:'米国株 接続確認版',short_name:'米国接続確認',display:'standalone',lang:'ja',icons:[{src:'./icons/us-stock-icon.png',sizes:'512x512',type:'image/png'}]})+'\n');
 fs.writeFileSync(path.join(out,'sw-register.js'),`if(location.pathname.startsWith('${SCOPE}')&&'serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{document.getElementById('connectedState').textContent+=' / 保存用SW登録失敗';}));\n`);
 const names=['index.html','assets.json','preview-adapter.js','delivery.js','storage.js','candidate.js','sw-register.js','manifest.webmanifest','icons/us-stock-icon.png'];
 const hashes=Object.fromEntries(names.map(n=>[n,hash(fs.readFileSync(path.join(out,n)))]));
 const uiHash=hash(JSON.stringify({policy:'connected-shell-v1',hashes})),cache=PREFIX+uiHash;
 const worker=`/* Isolated connected preview. Never migrates normal/device/other app data. */
const SCOPE=${JSON.stringify(SCOPE)},PREFIX=${JSON.stringify(PREFIX)},CACHE=${JSON.stringify(cache)},FILES=${JSON.stringify(hashes)};
if(new URL(self.registration.scope).pathname!==SCOPE)throw Error('Unexpected connected preview scope');
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const [name,expected]of Object.entries(FILES)){const url=new URL(name,self.registration.scope);const r=await fetch(new Request(url,{cache:'reload',credentials:'omit'}));if(!r.ok||r.redirected||hex(await crypto.subtle.digest('SHA-256',await r.clone().arrayBuffer()))!==expected)throw Error('UI install digest mismatch');await c.put(url.href,r);}await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(PREFIX)&&/^[a-f0-9]{64}$/.test(k.slice(PREFIX.length))&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL(self.registration.scope);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(SCOPE))return;const name=u.pathname.slice(SCOPE.length)||'index.html';if(!Object.hasOwn(FILES,name)||Array.from(u.searchParams.keys()).some(k=>!['v','t','_'].includes(k)))return;const key=new URL(name,base);e.respondWith((async()=>{const c=await caches.open(CACHE);return await c.match(key.href)||fetch(e.request);})());});
`;
 fs.writeFileSync(path.join(out,'sw.js'),worker);
 return {schema:'us-connected-preview/1',scope:SCOPE,consumer_revision:revision,ui_sha256:uiHash,shell_cache:cache,data_cache:DATA_CACHE,sha256:{...hashes,'sw.js':hash(worker)},published:false,device_pass:false,note:'UI identity only. Current market release is delivery/current.json; this build does not activate a publishing schedule.'};
}
async function buildConnected(input,output,revision,producerSha,runId){
 if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Explicit consumer SHA required');
 const out=externalTarget(output);if(fs.existsSync(out))throw Error('Fresh output required; existing preview is never overwritten');
 const b=await trusted(input,producerSha,runId);
 const temp=fs.mkdtempSync(path.join(path.dirname(out),'.us-connected-build-'));
 try{
  const captured=path.join(temp,'captured');fs.mkdirSync(captured);
  for(const[n,v]of Object.entries(b.raw))fs.writeFileSync(path.join(captured,n),v);
  const site=path.join(temp,'site');build(site,revision,path.join(captured,'ohlcv-history.json'),{inputDir:captured});
  // Remove only a generated temporary manifest, never an existing/public release.
  fs.rmSync(path.join(site,'delivery'),{recursive:true});storeBundle(b,path.join(site,'delivery'));
  const meta=installShell(site,revision);meta.initial_release=b.manifest.release;
  fs.writeFileSync(path.join(site,'BUILD.json'),JSON.stringify(meta,null,2)+'\n');
  fs.renameSync(site,out);return {...meta,release:b.manifest.release};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
async function updateConnected(input,output,producerSha,runId){
 const out=externalTarget(output),meta=JSON.parse(fs.readFileSync(path.join(out,'BUILD.json')));
 if(meta.schema!=='us-connected-preview/1'||meta.scope!==SCOPE||meta.data_cache!==DATA_CACHE)throw Error('Not an isolated connected preview');
 const b=await trusted(input,producerSha,runId),dest=path.join(out,'delivery');
 const current=await delivery.load('./',{fetcher:async url=>new Response(safeRead(dest,url))});
 const oldTime=Date.parse(current.objects['status.json'].generated_at_jst),newTime=Date.parse(b.objects['status.json'].generated_at_jst);
 if(!Number.isFinite(newTime)||!Number.isFinite(oldTime)||newTime<oldTime||(newTime===oldTime&&b.manifest.release!==current.manifest.release))throw Error('Regressive or ambiguous preview generation');
 storeBundle(b,dest);return b.manifest.release;
}
if(require.main===module){const fn=process.argv[2]==='update'?updateConnected:buildConnected;fn(...process.argv.slice(3)).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={buildConnected,updateConnected,trusted,SCOPE,DATA_CACHE,PREFIX,publicSafe};
