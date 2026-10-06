"""Disposable old->candidate->old worker rehearsal; no deployment and no device PASS."""
from pathlib import Path
import http.server, threading, tempfile, subprocess, shutil, json, os, signal
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output-migration'

def main():
    signal.alarm(240)
    OUT.mkdir(exist_ok=True)
    checks=[]
    def check(name,ok):
        assert ok,name
        checks.append(name);print('MIGRATION PASS:',name,flush=True)
    with tempfile.TemporaryDirectory() as temp:
        original=Path(temp)/'baseline'/'us-stock-check-web';candidate=Path(temp)/'candidate'/'us-stock-check-web'
        shutil.copytree(ROOT/'docs',original)
        subprocess.run(['node',str(ROOT/'migration/build-rehearsal.cjs'),str(candidate)],check=True)
        state={'root':original.parent}
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(state['root']),**kwargs)
            def do_GET(self):
                # Baseline and candidate are built in the same second. Do not let
                # SimpleHTTPRequestHandler return 304 for different worker bytes.
                for header in ['If-Modified-Since','If-None-Match']:
                    if header in self.headers:del self.headers[header]
                if 'sw.js' in self.path:print('SERVE WORKER:',self.directory,self.path,flush=True)
                super().do_GET()
            def log_message(self,*args):pass
            def end_headers(self):
                self.send_header('Cache-Control','no-store');super().end_headers()
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}/us-stock-check-web'
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=os.getenv('CHROME_PATH') or shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page()
                page.on('pageerror',lambda e:print('PAGE ERROR:',e,flush=True))
                page.on('console',lambda m:print('BROWSER:',m.type,m.text,flush=True) if m.type in ['error','log'] else None)
                print('Opening baseline',flush=True)
                page.goto(base+'/');page.evaluate("Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('baseline SW ready timeout')),20000))])")
                print('Baseline worker ready',flush=True)
                page.reload()
                page.evaluate('''async()=>{
                    localStorage.setItem('usstock.activeTab','market');
                    localStorage.setItem('other-app-record',JSON.stringify({note:'REHEARSAL_ONLY',quantity:7}));
                    sessionStorage.setItem('rehearsal-session','preserve');
                    await(await caches.open('india1400-rehearsal-sentinel')).put('/other-app-sentinel',new Response('other app'));
                    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rehearsal-records',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
                    await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put('preserve','sentinel');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
                    for(const f of ['status','market','history','common_snapshot'])await(await fetch('./data/'+f+'.json?t=100',{cache:'no-store'})).text();
                }''')
                print("Baseline records seeded",flush=True)
                original_data=page.evaluate('''async()=>Object.fromEntries(await Promise.all(['status','market','history','common_snapshot'].map(async f=>[f,await(await fetch('./data/'+f+'.json?t=100',{cache:'no-store'})).text()])))''')
                state['root']=candidate.parent
                update='''async()=>{const r=await navigator.serviceWorker.getRegistration();r.addEventListener('updatefound',()=>{const w=r.installing;console.log('WORKER updatefound');w.addEventListener('statechange',()=>console.log('WORKER state',w.state))});const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('controller update timeout')),90000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()},{once:true})});await Promise.all([r.update().then(()=>console.log('WORKER update resolved',r.installing?.state,r.waiting?.state,r.active?.state)),changed]);const w=navigator.serviceWorker.controller;if(w.state!=='activated')await new Promise(resolve=>w.addEventListener('statechange',()=>{if(w.state==='activated')resolve()}));}'''
                page.evaluate(update)
                check('candidate worker activates at unchanged scope',page.evaluate('navigator.serviceWorker.controller!==null'))
                check('legacy US cache retired only after copy',page.evaluate("caches.keys().then(k=>!k.includes('us-stock-check-v0.9.8-cache1')&&k.includes('us-stock-check-v0.9.8-migration-rehearsal1'))"))
                context.set_offline(True);page.reload()
                check('candidate shell starts offline',page.locator('#tradeDate').is_visible())
                for name,raw in original_data.items():
                    text=page.evaluate("async name=>(await fetch('./data/'+name+'.json?v=987654321')).text()",name)
                    check(name+' old cache readable with fresh nonce offline',text==raw)
                check('US tab preference retained',page.evaluate("localStorage.getItem('usstock.activeTab')")=='market')
                check('unrelated local record retained',page.evaluate("JSON.parse(localStorage.getItem('other-app-record')).quantity") ==7)
                check('session record retained',page.evaluate("sessionStorage.getItem('rehearsal-session')")=='preserve')
                check('other PWA cache retained',page.evaluate("caches.open('india1400-rehearsal-sentinel').then(c=>c.match('/other-app-sentinel')).then(r=>r.text())")=='other app')
                check('IndexedDB record retained',page.evaluate('''async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('rehearsal-records');r.onsuccess=()=>resolve(r.result)});const v=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get('sentinel');r.onsuccess=()=>resolve(r.result)});db.close();return v}''')=='preserve')
                context.set_offline(False)
                check('online data fetch resumes',page.evaluate("fetch('./data/status.json?v=987654322').then(r=>r.ok)"))
                # Revert the bytes at the SAME worker URL, without deleting site storage.
                state['root']=original.parent;page.evaluate(update);page.reload()
                check('online rollback returns original worker cache',page.evaluate("caches.keys().then(k=>k.includes('us-stock-check-v0.9.8-cache1')&&!k.includes('us-stock-check-v0.9.8-migration-rehearsal1'))"))
                check('rollback preserves local records',page.evaluate("JSON.parse(localStorage.getItem('other-app-record')).quantity") ==7)
                check('rollback preserves other cache',page.evaluate("caches.open('india1400-rehearsal-sentinel').then(c=>c.match('/other-app-sentinel')).then(r=>r.text())")=='other app')
                browser.close()
        finally:server.shutdown()
    (OUT/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'device_pass':False,'ui_port_complete':False,'production_changed':False,'rollback_requires_online':True},indent=2)+'\n')

if __name__=='__main__':main()
