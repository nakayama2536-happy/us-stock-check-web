'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {buildConnected,updateConnected,trusted,SCOPE,DATA_CACHE,PREFIX,publicSafe}=require('./connected-preview.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'docs/preview/device/delivery'),revision='a'.repeat(40);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function sample(dir=source){const manifest=JSON.parse(fs.readFileSync(path.join(dir,'current.json')));const release=path.join(dir,'releases',manifest.release);const objects=Object.fromEntries(Object.keys(manifest.files).map(n=>[n,JSON.parse(fs.readFileSync(path.join(release,n)))]));return {manifest,release,objects,sha:manifest.source_revision,run:objects['ohlcv-history.json'].capture.run_id};}
function reseal(dir,change){const s=sample(dir);change(s.objects);const raw=Object.fromEntries(Object.entries(s.objects).map(([n,o])=>[n,Buffer.from(JSON.stringify(o))]));const files=Object.fromEntries(Object.entries(raw).map(([n,b])=>[n,{sha256:digest(b),bytes:b.length}]));const descriptor={schema:s.manifest.schema,source_repository:s.manifest.source_repository,source_revision:s.sha,files};const manifest={...descriptor,release:digest(JSON.stringify(descriptor))};const dest=path.join(dir,'releases',manifest.release);fs.mkdirSync(dest,{recursive:true});for(const[n,b]of Object.entries(raw))fs.writeFileSync(path.join(dest,n),b);fs.writeFileSync(path.join(dir,'current.json'),JSON.stringify(manifest));return manifest;}
async function temporary(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'us-connected-test-'));try{return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function inventory(dir,prefix=''){const out={};for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name),n=prefix+ent.name;if(ent.isDirectory())Object.assign(out,inventory(p,n+'/'));else out[n]=digest(fs.readFileSync(p));}return out;}

test('isolated build preserves original producer bytes and all published sources',()=>temporary(async temp=>{
 const before=inventory(path.join(root,'docs')),s=sample(),out=path.join(temp,'site');const info=await buildConnected(source,out,revision,s.sha,s.run);
 assert.equal(info.scope,SCOPE);assert.equal(info.published,false);assert.equal(info.device_pass,false);assert.equal(info.data_cache,DATA_CACHE);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.webmanifest')));assert.equal(manifest.scope,SCOPE);assert.equal(manifest.id,SCOPE);assert.equal(manifest.start_url,SCOPE);assert.equal(manifest.short_name,'米国接続確認');
 const current=JSON.parse(fs.readFileSync(path.join(out,'delivery/current.json')));assert.deepEqual(current,s.manifest);
 for(const name of Object.keys(current.files))assert.deepEqual(fs.readFileSync(path.join(out,'delivery/releases',current.release,name)),fs.readFileSync(path.join(s.release,name)));
 assert.deepEqual(inventory(path.join(root,'docs')),before);
 const app=fs.readFileSync(path.join(out,'candidate.js'),'utf8'),storage=fs.readFileSync(path.join(out,'storage.js'),'utf8'),sw=fs.readFileSync(path.join(out,'sw.js'),'utf8');
 assert(!app.includes("getItem('usstock.activeTab')"));assert(storage.includes(DATA_CACHE));assert(!storage.includes('us-stock-check-delivery-v1'));
 assert(sw.includes(PREFIX));assert(!sw.includes('us-stock-device-'));assert(!sw.includes('migration'));
 new vm.Script(sw);new vm.Script(app);
 for(const [name,hash]of Object.entries(info.sha256))assert.equal(digest(fs.readFileSync(path.join(out,name))),hash);
}));

test('unknown or missing producer provenance fails closed',()=>temporary(async temp=>{
 const s=sample();await assert.rejects(buildConnected(source,path.join(temp,'bad'),revision,'b'.repeat(40),s.run),/Producer/);
 await assert.rejects(trusted(source,s.sha,'9999999999'),/Capture/);await assert.rejects(trusted(source,'main',s.run),/Explicit/);
 assert(!fs.existsSync(path.join(temp,'bad')));
}));

test('existing output and repository paths cannot be overwritten',()=>temporary(async temp=>{
 const s=sample(),out=path.join(temp,'existing');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'canary'),'keep');
 await assert.rejects(buildConnected(source,out,revision,s.sha,s.run),/Fresh output/);assert.equal(fs.readFileSync(path.join(out,'canary'),'utf8'),'keep');
 await assert.rejects(buildConnected(source,path.join(root,'docs/preview/connected'),revision,s.sha,s.run),/outside repository/);
}));

test('tampered candidate data does not replace prior pointer or UI shell',()=>temporary(async temp=>{
 const s=sample(),out=path.join(temp,'site'),input=path.join(temp,'bad');await buildConnected(source,out,revision,s.sha,s.run);const before=inventory(out);
 fs.cpSync(source,input,{recursive:true});fs.writeFileSync(path.join(input,'releases',s.manifest.release,'market.json'),'{}');
 await assert.rejects(updateConnected(input,out,s.sha,s.run));assert.deepEqual(inventory(out),before);
}));

for(const [label,mutate] of [
 ['PENDING',o=>o['status.json'].quality.source_crosscheck='PENDING'],
 ['HOLD',o=>o['status.json'].run_state='HOLD'],
 ['PRODUCTION',o=>o['status.json'].app_state='PRODUCTION'],
 ['formal action',o=>o['common_snapshot.json'].decision_items[0].formal_action='BUY'],
 ['private nested data',o=>o['market.json'].stocks[0].quantity=10],
 ['mismatched same-run timestamp',o=>o['ohlcv-history.json'].generated_at_jst='2026-10-05T00:00:00+09:00']
])test('correctly hashed '+label+' input is still rejected',()=>temporary(async temp=>{
 const input=path.join(temp,'input');fs.cpSync(source,input,{recursive:true});const s=sample();reseal(input,mutate);
 await assert.rejects(buildConnected(input,path.join(temp,'site'),revision,s.sha,s.run));assert(!fs.existsSync(path.join(temp,'site')));
}));

test('data refresh changes only delivery and preserves the exact old release',()=>temporary(async temp=>{
 const s=sample(),out=path.join(temp,'site'),input=path.join(temp,'next');await buildConnected(source,out,revision,s.sha,s.run);const before=inventory(out);
 fs.cpSync(source,input,{recursive:true});const newTime='2026-10-05T01:00:00+09:00';const m=reseal(input,o=>{o['status.json'].generated_at_jst=newTime;o['common_snapshot.json'].timestamps.calculated_at=newTime;o['ohlcv-history.json'].generated_at_jst=newTime;});
 assert.equal(await updateConnected(input,out,s.sha,s.run),m.release);
 const after=inventory(out);for(const [n,h]of Object.entries(before))if(n!=='delivery/current.json')assert.equal(after[n],h);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'delivery/current.json'))).release,m.release);
 await assert.rejects(updateConnected(source,out,s.sha,s.run),/Regressive/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'delivery/current.json'))).release,m.release);
}));

test('public privacy scanner blocks keys and credentials without printing values',()=>{
 assert.throws(()=>publicSafe({portfolio_id:'private-value'}),/Private field/);
 assert.throws(()=>publicSafe({text:'ghp_'+'x'.repeat(30)}),/credential/);
 assert.doesNotThrow(()=>publicSafe({message:'BTC reference data unavailable',warnings:[]}));
});

test('delivery symlink is rejected without reading or changing target',()=>temporary(async temp=>{
 const input=path.join(temp,'input');fs.cpSync(source,input,{recursive:true});const s=sample(input),p=path.join(s.release,'status.json'),canary=path.join(temp,'canary');fs.renameSync(p,canary);fs.symlinkSync(canary,p);
 await assert.rejects(trusted(input,s.sha,s.run),/symlink/);assert(fs.existsSync(canary));
}));

module.exports={sample,reseal,inventory};
