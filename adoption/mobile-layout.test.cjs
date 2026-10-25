'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {polish,inventory,VERSION}=require('./mobile-layout.cjs');
const REV='a'.repeat(40);let temp,source;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'us-mobile-tests-'));
 if(process.env.MOBILE_BASE_SITE){source=path.resolve(process.env.MOBILE_BASE_SITE);return;}
 source=path.join(temp,'original');const dir=path.resolve(__dirname,'../docs/preview/device/delivery');
 const m=JSON.parse(fs.readFileSync(path.join(dir,'current.json')));
 const h=JSON.parse(fs.readFileSync(path.join(dir,'releases',m.release,'ohlcv-history.json')));
 await require('./connected-preview.cjs').buildConnected(dir,source,REV,m.source_revision,h.capture.run_id);
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function copied(name){const dest=path.join(temp,name);fs.cpSync(source,dest,{recursive:true});return dest;}
test('display-only successor changes exactly four shell files and no data or runtime contracts',()=>{
 const before=inventory(source),out=path.join(temp,'polished');const meta=polish(source,out,REV),after=inventory(out);
 assert.equal(meta.mobile_layout,VERSION);assert.equal(meta.published,false);assert.equal(meta.device_pass,false);
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 const changed=Object.keys(before).filter(n=>!before[n].equals(after[n])).sort();
 assert.deepEqual(changed,['BUILD.json','assets.json','index.html','sw.js']);
 for(const[n,b]of Object.entries(before))assert.deepEqual(inventory(source)[n],b);
 assert.notEqual(meta.shell_cache,JSON.parse(before['BUILD.json']).shell_cache);
 assert.equal(meta.data_cache,'us-connected-preview-delivery-v1');
});
test('model, stale/QC warnings, research calculations and source data are byte-identical',()=>{
 const out=path.join(temp,'contracts');polish(source,out,REV);
 const a=JSON.parse(fs.readFileSync(path.join(source,'assets.json'))),b=JSON.parse(fs.readFileSync(path.join(out,'assets.json')));
 for(const name of ['candidate/experience.js','candidate/bootstrap.js','candidate/index.html','research.js','reference/app.js'])assert.equal(b[name],a[name]);
 assert.ok(b['judgment-cards.js'].includes('const v=rowView(row,m)'));
 assert.ok(b['judgment-cards.js'].includes('function fullSummaryHtml(m)'));
 assert.ok(b['judgment-cards.js'].includes('base.renderState(m,doc)'));
 assert.ok(b['judgment-cards.js'].includes('const opened='));
});
test('existing output, repository directory and source cannot be overwritten',()=>{
 assert.throws(()=>polish(source,source,REV),/Fresh external/);
 assert.throws(()=>polish(source,path.resolve(__dirname,'..'),REV),/Fresh external/);
 const out=path.join(temp,'existing');fs.mkdirSync(out);assert.throws(()=>polish(source,out,REV),/Fresh external/);
});
test('corrupt UI bytes stop before any candidate directory is published',()=>{
 const src=copied('bad-ui'),out=path.join(temp,'rejected-ui');fs.appendFileSync(path.join(src,'assets.json'),' ');
 assert.throws(()=>polish(src,out,REV),/UI digest/);assert.equal(fs.existsSync(out),false);
});
test('corrupt data bytes stop before any candidate directory is published',()=>{
 const src=copied('bad-data'),out=path.join(temp,'rejected-data');const m=JSON.parse(fs.readFileSync(path.join(src,'delivery/current.json')));
 fs.writeFileSync(path.join(src,'delivery/releases',m.release,'market.json'),'{}');
 assert.throws(()=>polish(src,out,REV),/data digest/);assert.equal(fs.existsSync(out),false);
});
test('unreviewed extra file is not copied into the candidate',()=>{
 const src=copied('extra'),out=path.join(temp,'rejected-extra');fs.writeFileSync(path.join(src,'unreviewed.json'),'{}');
 assert.throws(()=>polish(src,out,REV),/allowlist/);assert.equal(fs.existsSync(out),false);
});
test('symlinks are rejected without following or modifying their target',()=>{
 const src=copied('linked'),out=path.join(temp,'rejected-link');fs.symlinkSync(path.join(source,'BUILD.json'),path.join(src,'linked.json'));
 assert.throws(()=>polish(src,out,REV),/Linked/);assert.equal(fs.existsSync(out),false);
});
test('unknown consumer and repeated transformation fail closed',()=>{
 assert.throws(()=>polish(source,path.join(temp,'unknown'),'main'),/Full consumer/);
 const out=path.join(temp,'once');polish(source,out,REV);
 assert.throws(()=>polish(out,path.join(temp,'twice'),REV),/reviewed source/);
});
