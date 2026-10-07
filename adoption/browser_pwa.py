"""Old 4-tab PWA -> candidate 5-tab -> offline restart -> online rollback."""
from pathlib import Path
import http.server,threading,tempfile,subprocess,shutil,json,os,signal,re
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
REV='55e872d80e20dac280ef56f2ac17ba18b3a90ee6'

def main():
    signal.alarm(240);checks=[]
    def check(name,ok):
        assert ok,name
        checks.append(name);print('PWA PASS:',name,flush=True)
    with tempfile.TemporaryDirectory() as temp:
        baseline=Path(temp)/'old'/'us-stock-check-web';candidate=Path(temp)/'new'/'us-stock-check-web'
        shutil.copytree(ROOT/'docs',baseline)
        external=os.getenv('ADOPTION_DELIVERY_DIR')
        if external:subprocess.run(['node',str(ROOT/'adoption/import-run.cjs'),external,str(candidate),REV],check=True)
        else:subprocess.run(['node','-e',"require(process.argv[1]).build(process.argv[2],process.argv[3],process.argv[4],{pwa:true})",str(ROOT/'adoption/build.cjs'),str(candidate),REV,str(ROOT/'docs/preview/s1/data/ohlcv-history.json')],check=True)
        manifest=json.loads((candidate/'delivery/current.json').read_text())
        state={'root':baseline.parent}
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self,*a,**kw):super().__init__(*a,directory=str(state['root']),**kw)
            def log_message(self,*a):pass
            def do_GET(self):
                for h in ['If-Modified-Since','If-None-Match']:
                    if h in self.headers:del self.headers[h]
                super().do_GET()
            def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}/us-stock-check-web/'
        update="""async()=>{const r=await navigator.serviceWorker.getRegistration();const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('update timeout')),90000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()},{once:true})});await Promise.all([r.update(),changed]);const w=navigator.serviceWorker.controller;if(w.state!=='activated')await new Promise(resolve=>w.addEventListener('statechange',()=>{if(w.state==='activated')resolve()}));}"""
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page()
                page.goto(base);page.evaluate('navigator.serviceWorker.ready');page.reload()
                page.evaluate("""async()=>{
                    localStorage.setItem('usstock.activeTab','stocks');localStorage.setItem('personal-sentinel','preserve');
                    await(await caches.open('other-app-sentinel')).put('/other',new Response('preserve'));
                    for(const f of ['status','market','history','common_snapshot'])await(await fetch('./data/'+f+'.json?t=123')).text();
                    const db=await new Promise(resolve=>{const r=indexedDB.open('pwa-sentinel',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result)});
                    await new Promise(resolve=>{const t=db.transaction('records','readwrite');t.objectStore('records').put('preserve','test');t.oncomplete=resolve});db.close();
                }""")
                state['root']=candidate.parent;page.evaluate(update);page.reload()
                expect(page.locator('#deliveryState')).to_contain_text(re.compile(r'配信版 [0-9a-f]{12}'))
                frame=page.frame_locator('#previewFrame');check('old-to-five-tab migration',frame.locator('[role=tab]').count()==5)
                expect(frame.locator('#tab-stocks')).to_be_visible()
                check('same package consumed',manifest['release'][:12] in page.locator('#deliveryState').inner_text())
                expect(frame.locator('#appState')).to_have_text('参考分析 / 保存データ表示')
                check('verified OHLCV available',frame.locator('[data-stock-panel="PLTR"] .usr-candles').count()==1)
                check('legacy cache data copied before retirement',page.evaluate("caches.open('us-stock-check-v0.9.8-adoption1').then(c=>c.match(new URL('./data/history.json',location.href))).then(r=>!!r)"))
                context.set_offline(True);page.close();page=context.new_page();page.clock.install();page.goto(base)
                expect(page.locator('#deliveryState')).to_contain_text('保存版（再取得未確認・GPT停止）')
                frame=page.frame_locator('#previewFrame');check('closed-tab offline restart restores five tabs',frame.locator('[role=tab]').count()==5)
                check('offline restart preserves exact release',manifest['release'][:12] in page.locator('#deliveryState').inner_text())
                expect(frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]')).to_be_disabled()
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                # Exercise the actual periodic redraw without a wall-clock minute.
                page.clock.fast_forward(61000)
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                expect(frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]')).to_be_disabled()
                check('offline header and GPT lock survive periodic redraw',True)
                check('offline snapshot cannot export as current',not page.locator('#consultDialog').is_visible())
                context.set_offline(False);expect(page.locator('#deliveryState')).to_contain_text(re.compile(r'配信版 [0-9a-f]{12}'))
                expect(frame.locator('#appState')).to_have_text('参考分析 / 保存データ表示')
                expect(frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]')).to_be_enabled()
                check('recovery restores truthful header and GPT availability',True)
                check('online recovery revalidates release',not page.locator('#deliveryRefresh').is_disabled())
                # Corrupt saved bytes; do not accept them merely because they were cached.
                await_text="""async()=>{const c=await caches.open('us-stock-check-delivery-v1'),u=new URL('./__verified_delivery__',location.href);const s=await(await c.match(u)).json();s.raw['market.json']='{}';await c.put(u,new Response(JSON.stringify(s)));}"""
                page.evaluate(await_text);context.set_offline(True);page.reload()
                expect(page.locator('#deliveryState')).to_contain_text('一致確認済みのデータはありません')
                check('corrupt saved bundle rejected on restart',page.locator('#previewFrame').is_hidden())
                context.set_offline(False);expect(page.locator('#deliveryState')).to_contain_text(re.compile(r'配信版 [0-9a-f]{12}'))
                check('personal local record preserved',page.evaluate("localStorage.getItem('personal-sentinel')")=='preserve')
                check('IndexedDB preserved',page.evaluate("""async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('pwa-sentinel');r.onsuccess=()=>resolve(r.result)});return new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get('test');r.onsuccess=()=>{resolve(r.result);db.close()}})}""")=='preserve')
                state['root']=baseline.parent;page.evaluate(update);page.reload()
                check('online rollback restores four tabs',page.locator('[role=tab]').count()==4)
                check('rollback retains personal record',page.evaluate("localStorage.getItem('personal-sentinel')")=='preserve')
                check('rollback retains other app cache',page.evaluate("caches.open('other-app-sentinel').then(c=>c.match('/other')).then(r=>r.text())")=='preserve')
                browser.close()
        finally:server.shutdown()
        out=ROOT/'test-output-adoption';out.mkdir(exist_ok=True)
        (out/'pwa-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'release':manifest['release'],'source_repository':manifest['source_repository'],'same_run_input':bool(external),'device_pass':False,'production_changed':False,'restart':'tab close/reopen, not OS termination'},indent=2)+'\n')
if __name__=='__main__':main()
