'use strict';
// Consume only the vetted four-file output; never upload a private checkout.
const fs=require('node:fs'),path=require('node:path');
const {build}=require('./build.cjs'),delivery=require('./delivery.js'),preview=require('../docs/preview/s1/preview.js');
async function importRun(input,output,publicRevision){
 const dir=path.resolve(input);
 const bundle=await delivery.load('./',{fetcher:async url=>new Response(fs.readFileSync(path.join(dir,url)))});
 if(bundle.manifest.source_repository!=='nakayama2536-happy/us-stock-check')throw Error('Same-run producer required');
 for(const stock of bundle.objects['market.json'].stocks){const detail=preview.ohlcvFor(stock,bundle.objects['ohlcv-history.json']);if(!detail.available)throw Error(stock.ticker+': '+detail.reason);}
 build(output,publicRevision,undefined,{pwa:true});
 const dest=path.join(output,'delivery');fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(path.join(dest,'releases',bundle.manifest.release),{recursive:true});
 for(const[name,raw]of Object.entries(bundle.raw))fs.writeFileSync(path.join(dest,'releases',bundle.manifest.release,name),raw);
 fs.writeFileSync(path.join(dest,'current.json'),JSON.stringify(bundle.manifest));
 return bundle.manifest.release;
}
if(require.main===module)importRun(...process.argv.slice(2)).then(r=>console.log('Candidate release:',r)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={importRun};
