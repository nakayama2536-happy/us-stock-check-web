'use strict';
// Generate a live-data candidate without altering any published preview bytes.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unreviewed adapter boundary: '+a.slice(0,70));return s.replace(a,()=>b);}
function adapter(){
 let s=fs.readFileSync(path.join(root,'docs/preview/s1/preview.js'),'utf8');
 s=once(s,'else{root.USPreview=api;api.start();}','else{root.USPreview=api;}');
 s=once(s,"const code='const PREVIEW_OHLCV='", "const code='const DELIVERY_GENERATION='+safeJSON(files._generation)+';\\nconst DELIVERY_SELECTION='+safeJSON(files._selection||{})+';\\nconst PREVIEW_OHLCV='");
 s=once(s,"let boot=files['candidate/bootstrap.js'];",`let boot=files['candidate/bootstrap.js'];
    boot=once(boot,"let selectedTicker='PLTR';","let selectedTicker=USExperience.TICKERS.includes(DELIVERY_SELECTION.ticker)?DELIVERY_SELECTION.ticker:'PLTR';");
    boot+=\`\nactivateTab(DELIVERY_SELECTION.tab||'overview');
    window.addEventListener('message',e=>{
      if(e.source!==parent||e.data?.type!=='US_DELIVERY_STATE'||e.data.generation!==DELIVERY_GENERATION)return;
      USExperience.renderState(currentModel({loading:e.data.state==='loading',loadFailed:e.data.state==='failed',offline:e.data.state==='offline'}),document);
      document.querySelectorAll('[data-us-consult]').forEach(b=>b.disabled=e.data.state!=='ready');
    });
    document.addEventListener('click',e=>{
      if(e.target.closest('#refreshButton')){e.stopImmediatePropagation();e.preventDefault();parent.postMessage({type:'US_DELIVERY_REFRESH',generation:DELIVERY_GENERATION},'*');}
      const b=e.target.closest('[data-tab],[data-go-tab],[data-open-stock]');
      if(b)parent.postMessage({type:'US_DELIVERY_SELECTION',generation:DELIVERY_GENERATION,tab:b.dataset.tab||b.dataset.goTab||'stocks',ticker:b.dataset.openStock||selectedTicker},'*');
    },true);
    document.getElementById('stockSelector').addEventListener('change',e=>parent.postMessage({type:'US_DELIVERY_SELECTION',generation:DELIVERY_GENERATION,tab:'stocks',ticker:e.target.value},'*'));
    \`;
`);
 s=once(s,"function consultationRequest(event,frame){","function consultationRequest(event,frame,generation){");
 s=once(s,"Object.keys(d).sort().join(',')==='kind,ticker,type'", "d.generation===generation&&Object.keys(d).sort().join(',')==='generation,kind,ticker,type'");
 s=once(s,"input_git_blob_sha:{...PINS}","input_git_blob_sha:{...files._hashes},delivery_manifest:files._delivery");
 s=once(s,"mode:'FROZEN_UI_PREVIEW'","mode:'VERSION_BOUND_UI_CANDIDATE'");
 s=once(s,'function installConsultation(files,frame){','function installConsultation(getFiles,frame){');
 s=once(s,'if(!consultationRequest(event,frame))return;','const files=getFiles();if(!files||!consultationRequest(event,frame,files._generation))return;');
 s=once(s,"      note.textContent='全文ファイルの保存を開始しました。ChatGPTへご自身で添付してください。';\n    };\n  }", "      note.textContent='全文ファイルの保存を開始しました。ChatGPTへご自身で添付してください。';\n    };\n    return {invalidate:closeConsultation};\n  }");
 s=once(s,'{PINS,blobHash,makeDocument,start,','{PINS,blobHash,makeDocument,installConsultation,');
 s=s.slice(0,s.indexOf('  async function start(){'))+s.slice(s.indexOf('  return Object.freeze({PINS,blobHash,makeDocument,installConsultation,'));
 s=s.replaceAll('固定','読込済み').replaceAll('再表示','再読込').replaceAll('FROZEN_UI_PREVIEW','VERSION_BOUND_UI_CANDIDATE');
 s=s.replaceAll('市場データの取得・更新は行いません。','公開済みの配信データを再取得します。バックエンド更新は行いません。');
 return s;
}
module.exports={adapter,once};
