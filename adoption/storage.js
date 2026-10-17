/* One atomic verified public snapshot, isolated from personal records and SW shell. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.USSavedDelivery=api;})(globalThis,function(){
 const CACHE='us-stock-check-delivery-v1';
 const key=()=>new URL('./__verified_delivery__',location.href).href;
 let queue=Promise.resolve();
 async function save(bundle,isCurrent=()=>true){
  const text=JSON.stringify({manifest:bundle.manifest,raw:bundle.raw});
  if(new TextEncoder().encode(text).length>4100000)throw Error('保存容量の上限を超えました');
  const job=queue.catch(()=>{}).then(async()=>{const cache=await caches.open(CACHE);if(isCurrent())await cache.put(key(),new Response(text,{headers:{'Content-Type':'application/json'}}));});queue=job;await job;
 }
 async function restore(){
  const response=await(await caches.open(CACHE)).match(key());if(!response)throw Error('検証済みの保存値がありません');
  const text=await response.text();if(text.length>4100000)throw Error('保存データが上限を超えています');
  const stored=JSON.parse(text),prefix='./saved/';
  // Run the SAME hash/binding checks as a network fetch after every restart.
  const result=await USDelivery.load(prefix,{fetcher:async url=>{
   if(url===prefix+'current.json')return new Response(JSON.stringify(stored.manifest));
   const start=prefix+'releases/'+stored.manifest.release+'/';
   if(!url.startsWith(start)||typeof stored.raw?.[url.slice(start.length)]!=='string')return new Response('',{status:404});
   return new Response(stored.raw[url.slice(start.length)]);
  }});
  return {...result,restored:true};
 }
 return {save,restore};
});
