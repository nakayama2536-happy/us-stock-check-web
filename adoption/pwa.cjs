'use strict';
const fs=require('node:fs'),path=require('node:path');
const {candidateWorker}=require('../migration/build-rehearsal.cjs');
const {once}=require('./adapter.cjs');
const root=path.resolve(__dirname,'..');
function install(out){
 const assetPath=path.join(out,'assets.json'),assets=JSON.parse(fs.readFileSync(assetPath,'utf8'));
 assets['candidate/index.html']=once(assets['candidate/index.html'],'この候補はService Workerを登録しません。公開・PWA実機受入は別工程です。','この候補は検証用Service Workerで画面を保存します。通常版への採用・PWA実機受入は未完了です。');
 fs.writeFileSync(assetPath,JSON.stringify(assets));
 let worker=candidateWorker(fs.readFileSync(path.join(root,'docs/sw.js'),'utf8'));
 worker=once(worker,'us-stock-check-v0.9.8-migration-rehearsal1','us-stock-check-v0.9.8-adoption1');
 const start=worker.indexOf('const STATIC=['),end=worker.indexOf('\n];',start)+3;
 if(start<0||end<3)throw Error('Static cache boundary missing');
 worker=worker.slice(0,start)+`const STATIC=${JSON.stringify(['./','./index.html','./assets.json','./preview-adapter.js','./delivery.js','./storage.js','./candidate.js','./sw-register.js','./manifest.webmanifest','./icons/us-stock-icon.png'])};`+worker.slice(end);
 worker=once(worker,'  if(isData(url)){',`  // Delivery requests MUST reach the network; verified snapshot fallback belongs
  // to the application, which can label it stale and disable GPT transfer.
  if(url.pathname.startsWith(APP_SCOPE.pathname+'delivery/'))return;
  if(isData(url)){`);
 worker=once(worker,'    const response=await fetch(request,{cache:"no-cache"});','    const cached=await ownMatch(request);if(cached)return cached;\n    const response=await fetch(request,{cache:"no-cache"});');
 fs.writeFileSync(path.join(out,'sw.js'),worker);
 fs.writeFileSync(path.join(out,'sw-register.js'),`if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=0.9.7',{updateViaCache:'none'}).catch(()=>{document.getElementById('deliveryState').textContent+=' 保存用SWを登録できません。';}));\n`);
 fs.copyFileSync(path.join(root,'docs/manifest.webmanifest'),path.join(out,'manifest.webmanifest'));
 fs.mkdirSync(path.join(out,'icons'),{recursive:true});fs.copyFileSync(path.join(root,'docs/icons/us-stock-icon.png'),path.join(out,'icons/us-stock-icon.png'));
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 html=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest"></head>').replace('</body>','<script src="./sw-register.js" defer></script></body>');fs.writeFileSync(path.join(out,'index.html'),html);
}
module.exports={install};
