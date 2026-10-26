"""Same-browser-context SW upgrade/rollback with explicit tab close/reopen.

A plain reload retained the old document in earlier runs. The supported test
procedure therefore observes activation, closes the tab, then opens it again.
No unregister/cache reset is used. This is not iOS termination acceptance.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SCOPE = '/us-stock-check-web/preview/connected/'
NORMAL_SCOPE = '/us-stock-check-web/'
BASE_UI = '5a4b1052f7ef3327ee5594535b3ee5f875c386f9'
MOBILE_UI = '48475f9263bbad5aacb0bfe857a23b9554891327'
CHECKS = []
RELOAD_OBSERVATIONS = []


def check(name, ok):
    if not ok:
        raise AssertionError(name)
    CHECKS.append(name)
    print('SW ROUNDTRIP PASS:', name, flush=True)


def inventory(folder):
    return {p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in folder.rglob('*') if p.is_file()}


PRESERVATION = """async () => {
  const names = ['us-roundtrip-normal-sentinel', 'us-device-preview-roundtrip-sentinel', 'other-pwa-roundtrip-sentinel'];
  const values = {};
  for (const name of names) {
    const cache = await caches.open(name);
    const response = await cache.match(new URL('/sentinel', location.origin).href);
    values[name] = response ? await response.text() : null;
  }
  values.local = localStorage.getItem('usstock.roundtrip-sentinel');
  values.otherLocal = localStorage.getItem('other-pwa.roundtrip-sentinel');
  values.idb = await new Promise((resolve,reject) => {
    const request = indexedDB.open('us-roundtrip-idb',1);
    request.onerror = () => reject(Error('IDB read failed'));
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('records').objectStore('records').get('sentinel');
      get.onsuccess = () => { const value=get.result; db.close(); resolve(value); };
      get.onerror = () => { db.close(); reject(Error('IDB value failed')); };
    };
  });
  return values;
}"""
SNAPSHOT = """async (name) => {
  if (!(await caches.has(name))) return null;
  const cache = await caches.open(name), keys = await cache.keys();
  if (keys.length !== 1) throw Error('Expected one connected snapshot');
  return await (await cache.match(keys[0])).text();
}"""
SEED = """async () => {
  localStorage.setItem('usstock.roundtrip-sentinel','normal-preserved');
  localStorage.setItem('other-pwa.roundtrip-sentinel','other-preserved');
  for (const name of ['us-roundtrip-normal-sentinel','us-device-preview-roundtrip-sentinel','other-pwa-roundtrip-sentinel']) {
    const c=await caches.open(name);
    await c.put(new URL('/sentinel',location.origin).href,new Response(name+'-preserved'));
  }
  await new Promise((resolve,reject)=>{
    const r=indexedDB.open('us-roundtrip-idb',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('records');
    r.onerror=()=>reject(Error('IDB seed failed'));
    r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put('idb-preserved','sentinel');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(Error('IDB seed transaction failed'));};
  });
}"""


def main():
    evidence = ROOT / 'test-output-sw-roundtrip'
    evidence.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='us-sw-roundtrip-') as temp_name:
        temp=Path(temp_name)
        old,mobile=temp/'old',temp/'mobile'
        source=ROOT/'docs/preview/device/delivery'
        manifest=json.loads((source/'current.json').read_text())
        capture=json.loads((source/'releases'/manifest['release']/'ohlcv-history.json').read_text())
        subprocess.run(['node',str(ROOT/'adoption/connected-preview.cjs'),'build',str(source),str(old),BASE_UI,manifest['source_revision'],capture['capture']['run_id']],check=True)
        subprocess.run(['node',str(ROOT/'adoption/mobile-layout.cjs'),str(old),str(mobile),MOBILE_UI],check=True)
        old_meta=json.loads((old/'BUILD.json').read_text())
        new_meta=json.loads((mobile/'BUILD.json').read_text())
        old_files,new_files=inventory(old),inventory(mobile)
        changed=sorted(k for k in old_files if old_files[k]!=new_files[k])
        check('generation changes only the four approved UI files',changed==['BUILD.json','assets.json','index.html','sw.js'])
        check('data cache and delivery manifest stay identical',old_meta['data_cache']==new_meta['data_cache'] and old_files['delivery/current.json']==new_files['delivery/current.json'])
        state={'root':old}

        class Handler(SimpleHTTPRequestHandler):
            def translate_path(self,url):
                route=urlparse(url).path
                if route.startswith(SCOPE):
                    return str(state['root']/(route[len(SCOPE):] or 'index.html'))
                if route.startswith(NORMAL_SCOPE):
                    return str(ROOT/'docs'/(route[len(NORMAL_SCOPE):] or 'index.html'))
                return str(temp/'NOT_FOUND')
            def end_headers(self):
                self.send_header('Cache-Control','no-store')
                super().end_headers()
            def log_message(self,*args):
                pass

        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        Thread(target=server.serve_forever,daemon=True).start()
        origin=f'http://127.0.0.1:{server.server_port}'
        url=origin+SCOPE
        try:
            with sync_playwright() as p:
                executable=shutil.which('google-chrome') or shutil.which('chromium')
                browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
                page=context.new_page()
                page.goto(origin+NORMAL_SCOPE)
                page.wait_for_function('navigator.serviceWorker.controller!==null',timeout=20000)
                normal_scope=page.evaluate('async()=> (await navigator.serviceWorker.getRegistration()).scope')
                check('regular four-tab worker is installed before transition',normal_scope==origin+NORMAL_SCOPE and page.locator('.bottom-nav [role="tab"]').count()==4)
                page.goto(url)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                page.wait_for_function('async n=>navigator.serviceWorker.controller!==null && await caches.has(n)',arg=old_meta['shell_cache'],timeout=20000)
                page.reload()
                expect(page.frame_locator('#previewFrame').locator('[data-judgment-card="PLTR"]')).to_have_count(1)
                check('old connected UI is controlled by its isolated worker',page.evaluate('async()=> (await navigator.serviceWorker.getRegistration()).scope')==url)
                page.evaluate(SEED)
                sentinels=page.evaluate(PRESERVATION)
                page.wait_for_function('async n=> {if(!await caches.has(n))return false;return (await (await caches.open(n)).keys()).length===1;}',arg=old_meta['data_cache'],timeout=20000)
                snapshot=page.evaluate(SNAPSHOT,old_meta['data_cache'])
                check('old UI saved the exact fixture release',json.loads(snapshot)['manifest']['release']==manifest['release'])

                def transition(folder,meta,retired,label,count):
                    nonlocal page
                    state['root']=folder
                    page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();if(!r)throw Error("Missing registration");window.__previousWorker=navigator.serviceWorker.controller;await r.update();}')
                    page.wait_for_function('''async x=>{
                        const r=await navigator.serviceWorker.getRegistration(),c=navigator.serviceWorker.controller;
                        return c && c!==window.__previousWorker && c.state==='activated' && r.active===c
                            && await caches.has(x.live) && !await caches.has(x.retired);
                    }''',arg={'live':meta['shell_cache'],'retired':retired},timeout=20000)
                    response=page.reload()
                    expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                    observed=hashlib.sha256(response.body()).hexdigest()
                    RELOAD_OBSERVATIONS.append({'phase':label,'expected_index_sha256':meta['sha256']['index.html'],'reload_index_sha256':observed,'reload_matched':observed==meta['sha256']['index.html']})
                    # The required rollout procedure is close/reopen, in the SAME
                    # context. Do not unregister a worker or clear any user data.
                    page.close()
                    page=context.new_page()
                    response=page.goto(url)
                    expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                    check(label+': reopened navigation uses exact target HTML',hashlib.sha256(response.body()).hexdigest()==meta['sha256']['index.html'])
                    expect(page.frame_locator('#previewFrame').locator('.usm-row')).to_have_count(count)
                    check(label+': matching UI rendered after worker activation and reopen',True)
                    check(label+': stored data bytes and release unchanged',page.evaluate(SNAPSHOT,meta['data_cache'])==snapshot)
                    check(label+': normal/device/other cache and local/IDB sentinels retained',page.evaluate(PRESERVATION)==sentinels)
                    installed=page.evaluate('async()=> (await navigator.serviceWorker.getRegistrations()).map(r=>r.scope)')
                    check(label+': original normal worker registration retained',normal_scope in installed and url in installed)

                transition(mobile,new_meta,old_meta['shell_cache'],'upgrade',5)
                context.set_offline(True)
                page.close();page=context.new_page();page.goto(url)
                expect(page.locator('#deliveryState')).to_contain_text('再取得未確認')
                expect(page.frame_locator('#previewFrame').locator('.usm-row')).to_have_count(5)
                expect(page.frame_locator('#previewFrame').locator('[data-us-consult]:not([disabled])')).to_have_count(0)
                check('new UI offline tab restart retains data and locks GPT',True)
                context.set_offline(False)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                transition(old,old_meta,new_meta['shell_cache'],'rollback',0)
                expect(page.frame_locator('#previewFrame').locator('[data-judgment-card="PLTR"]')).to_have_count(1)
                check('rollback restores original full card without deleting saved data',True)
                page.goto(origin+NORMAL_SCOPE)
                check('normal app remains four tabs and original worker after round trip',page.locator('.bottom-nav [role="tab"]').count()==4 and page.evaluate('async()=> (await navigator.serviceWorker.getRegistration()).scope')==normal_scope)
                check('normal local and IndexedDB records survive the complete round trip',page.evaluate(PRESERVATION)==sentinels)
                context.close();browser.close()
        finally:
            server.shutdown();server.server_close()
        report={'kind':'SAVED_FIXED_FIXTURE_SAME_CONTEXT_SW_ROUNDTRIP','passed':len(CHECKS),'checks':CHECKS,'test_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'base_ui':BASE_UI,'successor_ui':MOBILE_UI,'release':manifest['release'],'market_date':'2026-10-02','old_shell':old_meta['shell_cache'],'new_shell':new_meta['shell_cache'],'changed_files':changed,'single_browser_context':True,'update_procedure':'wait for worker activation, then close/reopen tab; not iOS termination','reload_observations':RELOAD_OBSERVATIONS,'published':False,'device_pass':False,'actual_personal_records_tested':False,'market_acquisition_performed':False}
        (evidence/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print('SW ROUNDTRIP RESULT:',json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
