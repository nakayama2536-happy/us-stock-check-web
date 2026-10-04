'use strict';
// Derive a scope-isolated device preview from the validated artifact, never a root PWA.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SCOPE='/us-stock-check-web/preview/device/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unreviewed device boundary');return s.replace(a,()=>b);}
function build(input,out){
 const m=JSON.parse(fs.readFileSync(path.join(input,'delivery/current.json')));
 if(m.release!=='b88f9c8734bc69cd680187331307869295a3d67651ae86e5c062792b306aeba8')throw Error('Unreviewed release');
 const files=['assets.json','candidate.js','delivery.js','index.html','preview-adapter.js','storage.js','icons/us-stock-icon.png'];
 fs.mkdirSync(out,{recursive:true});
 for(const name of files){const dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(input,name),dest);}
 for(const[name,meta]of Object.entries(m.files)){
  if(!['status.json','market.json','common_snapshot.json','ohlcv-history.json'].includes(name))throw Error('Unknown data file');
  const rel='delivery/releases/'+m.release+'/'+name,b=fs.readFileSync(path.join(input,rel));if(b.length!==meta.bytes||sha(b)!==meta.sha256)throw Error('Delivery digest mismatch');
  const dest=path.join(out,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);
 }
 fs.writeFileSync(path.join(out,'delivery/current.json'),JSON.stringify(m));
 let storage=fs.readFileSync(path.join(out,'storage.js'),'utf8');storage=once(storage,"const CACHE='us-stock-check-delivery-v1';","const CACHE='us-stock-device-delivery-v1';");fs.writeFileSync(path.join(out,'storage.js'),storage);
 let code=fs.readFileSync(path.join(out,'candidate.js'),'utf8');code=once(code,"try{const t=localStorage.getItem('usstock.activeTab');if(tabs.includes(t))selection.tab=t;}catch(_){}","// Device preview does not read or write regular-app preferences.");fs.writeFileSync(path.join(out,'candidate.js'),code);
 const manifest=JSON.parse(fs.readFileSync(path.join(input,'manifest.webmanifest')));Object.assign(manifest,{id:SCOPE,start_url:SCOPE,scope:SCOPE,name:'米国株 実機確認版',short_name:'米国確認',description:'通常アプリと独立した実機確認用。売買には使用しません。'});fs.writeFileSync(path.join(out,'manifest.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');html=html.replace('通常データ接続候補・未公開','米国株 実機確認版').replace('同一配信版の公開データで確認します。売買には使用しません。','10/4 23:37 JST生成の確認用データです。自動更新ではありません。売買には使用しません。');
 html=html.replace('</header>','<details><summary>実機確認の手順・状態</summary><p>① Safariで5タブと250本表示を確認<br>② 共有から「ホーム画面に追加」、米国確認を起動<br>③ 通信を切り、閉じて再起動。保存版・GPT停止を確認後、通信を戻す</p><p id="deviceStatus"></p><p>通常アプリの削除・データ消去は不要です。実機の合否は未判定です。</p></details></header>');
 html=html.replace('</body>','<script src="./device-status.js" defer></script></body>');fs.writeFileSync(path.join(out,'index.html'),html);
 fs.writeFileSync(path.join(out,'device-status.js'),`function deviceStatus(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;const controller=navigator.serviceWorker?.controller;document.getElementById('deviceStatus').textContent='起動：'+(standalone?'ホーム画面':'ブラウザー')+' ／ 通信：'+(navigator.onLine?'オンライン':'オフライン')+' ／ SW：'+(controller?.scriptURL.includes('${SCOPE}sw.js')?'確認版':'登録待ち（オンラインで再読込）');}deviceStatus();addEventListener('online',deviceStatus);addEventListener('offline',deviceStatus);navigator.serviceWorker?.addEventListener('controllerchange',deviceStatus);\n`);
 fs.writeFileSync(path.join(out,'sw-register.js'),`if(location.pathname.startsWith('${SCOPE}')&&'serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{document.getElementById('deviceStatus').textContent='確認版SWの登録に失敗しました。';}));\n`);
 const STATIC=['./','./index.html','./assets.json','./preview-adapter.js','./delivery.js','./storage.js','./candidate.js','./device-status.js','./sw-register.js','./manifest.webmanifest','./icons/us-stock-icon.png'];
 const digest=sha(Buffer.concat(STATIC.filter(x=>x!=='./').map(n=>fs.readFileSync(path.join(out,n))))).slice(0,16);
 fs.writeFileSync(path.join(out,'sw.js'),`/* Device scope only. Never migrates or deletes regular app caches. */
const SCOPE=${JSON.stringify(SCOPE)},PREFIX='us-stock-device-shell-',CACHE=PREFIX+'${digest}';
if(new URL(self.registration.scope).pathname!==SCOPE)throw Error('Unexpected preview scope');
const STATIC=${JSON.stringify(STATIC)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url),base=new URL(self.registration.scope);
 if(r.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(SCOPE))return;
 const relative='./'+u.pathname.slice(SCOPE.length);if(!STATIC.includes(relative))return;
 u.search='';e.respondWith((async()=>{const c=await caches.open(CACHE);return(await c.match(u.href))||fetch(r);})());
});\n`);
 const hashes={};
 function inventory(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())inventory(file);else{const rel=path.relative(out,file).split(path.sep).join('/');if(!['BUILD.json','README.md'].includes(rel))hashes[rel]=sha(fs.readFileSync(file));}}}
 inventory(out);
 fs.writeFileSync(path.join(out,'BUILD.json'),JSON.stringify({release:m.release,artifact_id:11306590625,artifact_sha256:'c372d4b5655f8b53308bd21b74b53c937f486110ca95fc181751ed244513e428',producer_revision:m.source_revision,consumer_revision:'4ec017b323bdc841ef7b8202c52abd89f7cd1dea',public_base:'55e872d80e20dac280ef56f2ac17ba18b3a90ee6',scope:SCOPE,sha256:hashes},null,2)+'\n');
 return {release:m.release,scope:SCOPE,cache:CACHE_NAME(digest)};
}
function CACHE_NAME(digest){return 'us-stock-device-shell-'+digest;}
if(require.main===module)console.log(JSON.stringify(build(process.argv[2],process.argv[3])));
module.exports={build};
