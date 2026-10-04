'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {adapter,once}=require('./adapter.cjs'),delivery=require('./delivery.js');
const preview=require('../docs/preview/s1/preview.js');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pack(out,input,revision,ohlcv){
 if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Full public source revision required');
 const raw={},objects={};
 for(const name of delivery.REQUIRED){raw[name]=fs.readFileSync(path.join(input,name));objects[name]=JSON.parse(raw[name]);}
 delivery.binding(objects);
 if(ohlcv){
  raw['ohlcv-history.json']=fs.readFileSync(ohlcv);const capture=JSON.parse(raw['ohlcv-history.json']);
  for(const stock of objects['market.json'].stocks){const v=preview.ohlcvFor(stock,capture);if(!v.available)throw Error(stock.ticker+': '+v.reason);}
 }
 const files=Object.fromEntries(Object.entries(raw).map(([n,b])=>[n,{sha256:sha(b),bytes:b.length}]));
 const descriptor={schema:'us-ui-delivery/1',source_repository:'nakayama2536-happy/us-stock-check-web',source_revision:revision,files};
 const release=sha(JSON.stringify(descriptor)),m={...descriptor,release};delivery.manifest(m);
 const dir=path.join(out,'releases',release);fs.mkdirSync(dir,{recursive:true});
 for(const[n,b]of Object.entries(raw)){const dest=path.join(dir,n);if(fs.existsSync(dest)&&!fs.readFileSync(dest).equals(b))throw Error('Immutable release conflict');fs.writeFileSync(dest,b);}
 fs.writeFileSync(path.join(out,'current.json.tmp'),JSON.stringify(m,null,2)+'\n');
 fs.renameSync(path.join(out,'current.json.tmp'),path.join(out,'current.json'));return m;
}
function build(output,revision,ohlcv,options={}){
 const out=path.resolve(output);
 if(out===root||out.startsWith(root+path.sep))throw Error('Use a disposable directory outside the repository');
 fs.mkdirSync(out,{recursive:true});
 // Verify original sources against approved PINS before generating any derivative.
 const assets={};
 for(const[name,pin]of Object.entries(preview.PINS)){
  const bytes=fs.readFileSync(path.join(root,'docs/preview/s1',name));
  const hash=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
  if(hash!==pin)throw Error('Preview pin mismatch: '+name);
  if(!name.startsWith('data/'))assets[name]=bytes.toString('utf8');
 }
 assets['research.js']=once(assets['research.js'],"type:'US_PREVIEW_CONSULT',kind:","type:'US_PREVIEW_CONSULT',generation:DELIVERY_GENERATION,kind:").replaceAll('固定画面','読込済み画面');
 assets['candidate/index.html']=assets['candidate/index.html'].replace('日時・対象の一致確認は最低限の矛盾検出です。同一公開版の完全な証明は、後段のマニフェスト対応で扱います。','配信一覧のハッシュと日時・対象を照合済みです。配信版の一致は、価格や売買判断の正しさの証明ではありません。');
 fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify(assets));
 fs.writeFileSync(path.join(out,'preview-adapter.js'),adapter());
 for(const name of ['delivery.js','storage.js','candidate.js'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));
 let html=fs.readFileSync(path.join(root,'docs/preview/s1/index.html'),'utf8');
 html=html.replace('UI確認専用','通常データ接続候補・未公開').replace('固定データで表示・操作を確認します。売買には使用しません。','同一配信版の公開データで確認します。売買には使用しません。');
 html=html.replace('href="../../"','href="https://nakayama2536-happy.github.io/us-stock-check-web/"');
 html=html.replace('</header>','<button id="deliveryRefresh" type="button">公開データを再読込</button><p id="deliveryState" role="status"></p></header>');
 html=html.replaceAll('固定公開データ','読込済み公開データ').replace('固定データです。','表示中の配信版のデータです。');
 html=html.replace(/<script src="\.\/preview.js[^>]+><\/script>/,'<script src="./preview-adapter.js" defer></script><script src="./delivery.js" defer></script><script src="./storage.js" defer></script><script src="./candidate.js" defer></script>');
 fs.writeFileSync(path.join(out,'index.html'),html);
 if(options.pwa)require('./pwa.cjs').install(out);
 return pack(path.join(out,'delivery'),path.join(root,'docs/data'),revision,ohlcv);
}
if(require.main===module){if(!process.argv[2])throw Error('Usage: node adoption/build.cjs /tmp/candidate PUBLIC_MAIN_SHA [verified-public-ohlcv]');console.log(JSON.stringify(build(...process.argv.slice(2))));}
module.exports={build,pack};
