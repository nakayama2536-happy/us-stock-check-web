"""Side-by-side scope isolation; Chromium is not Safari/device acceptance."""
from pathlib import Path
import http.server, threading, tempfile, shutil, json, signal, re
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

def main():
    signal.alarm(240)
    checks = []
    def check(name, value):
        assert value, name
        checks.append(name)
        print('DEVICE PREVIEW PASS:', name, flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(ROOT/'docs', Path(tmp)/'us-stock-check-web')
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw): super().__init__(*a, directory=tmp, **kw)
            def log_message(self, *a): pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}/us-stock-check-web/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
                context = browser.new_context(viewport={'width':390, 'height':844})
                regular = context.new_page()
                regular.goto(base)
                regular.evaluate('navigator.serviceWorker.ready')
                regular.reload()
                root_worker = regular.evaluate('navigator.serviceWorker.controller.scriptURL')
                check('baseline worker belongs to root scope', root_worker.split('?')[0]==base+'sw.js')
                check('normal UI has four tabs', regular.locator('[role=tab]').count()==4)
                regular.evaluate("""async()=>{
                    localStorage.setItem('usstock.activeTab','market');localStorage.setItem('personal-sentinel','preserve');
                    await(await caches.open('other-app-preserve')).put('/sentinel',new Response('preserve'));
                    await(await caches.open('us-stock-check-v0.9.8-cache1')).put('/normal-record-sentinel',new Response('preserve'));
                    await(await caches.open('us-stock-device-shell-obsolete')).put('/old',new Response('old'));
                    const db=await new Promise(resolve=>{const r=indexedDB.open('device-test-records',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result)});
                    await new Promise(resolve=>{const t=db.transaction('records','readwrite');t.objectStore('records').put('preserve','test');t.oncomplete=resolve});db.close();
                }""")
                page = context.new_page()
                page.goto(base+'preview/device/')
                expect(page.locator('#deliveryState')).to_contain_text(re.compile(r'配信版 [0-9a-f]{12}'))
                page.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/preview/device/sw.js')")
                frame = page.frame_locator('#previewFrame')
                check('device UI has five tabs', frame.locator('[role=tab]').count()==5)
                check('normal preference is not imported', frame.locator('#tab-overview').is_visible())
                check('dedicated SW controls only preview', regular.evaluate('navigator.serviceWorker.controller.scriptURL')==root_worker)
                manifest = page.evaluate("fetch('./manifest.webmanifest').then(r=>r.json())")
                check('install identity and scope are separate', all(manifest[k]=='/us-stock-check-web/preview/device/' for k in ['id','scope','start_url']) and manifest['short_name']=='米国確認')
                check('stale device shell is retired', 'us-stock-device-shell-obsolete' not in page.evaluate('caches.keys()'))
                frame.locator('#tabbtn-stocks').click()
                frame.locator('[data-history-window="PLTR"]').select_option('250')
                region=frame.locator('[data-stock-panel="PLTR"] .usr-candles [role=region]')
                check('250 bars retain 240px height and latest edge', region.evaluate('(e)=>Math.abs(e.getBoundingClientRect().height-240)<2 && e.scrollWidth-e.clientWidth-e.scrollLeft<2'))
                check('parent does not overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
                out=ROOT/'test-output-device';out.mkdir(exist_ok=True)
                expect(frame.locator('#appState')).to_have_text('参考分析 / 保存データ表示')
                page.set_viewport_size({'width':844,'height':390})
                check('landscape header at most 100px with visible safety and state', page.locator('header').bounding_box()['height']<=100 and page.locator('#deliverySummary').is_visible() and '売買不可' in page.locator('header').inner_text())
                check('landscape content retains 270px viewport', page.locator('#previewFrame').bounding_box()['height']>=270)
                page.locator('#deviceDetails summary').click()
                check('expanded details and refresh remain accessible', page.locator('#deliveryRefresh').is_visible() and page.locator('#deliveryState').is_visible())
                page.locator('#deviceDetails summary').click()
                region.scroll_into_view_if_needed()
                page.screenshot(path=str(out/'device-landscape.png'))
                page.set_viewport_size({'width':390,'height':844})
                page.screenshot(path=str(out/'device-250.png'))
                context.set_offline(True)
                page.close()
                page=context.new_page();page.clock.install();page.goto(base+'preview/device/')
                expect(page.locator('#deliveryState')).to_contain_text('保存版（再取得未確認・GPT停止）')
                frame=page.frame_locator('#previewFrame')
                check('offline closed-tab restart restores five tabs', frame.locator('[role=tab]').count()==5)
                expect(frame.locator('[data-judgment-card="PLTR"] [data-us-consult]')).to_be_disabled()
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                page.clock.fast_forward(61000)
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                expect(frame.locator('#globalDataNotice')).to_contain_text('オフライン')
                expect(frame.locator('[data-judgment-card="PLTR"] [data-us-consult]')).to_be_disabled()
                check('offline display and GPT lock survive periodic render', True)
                check('offline GPT transfer is blocked', not page.locator('#consultDialog').is_visible())
                context.set_offline(False)
                expect(page.locator('#deliveryState')).to_contain_text(re.compile(r'配信版 [0-9a-f]{12}'))
                expect(frame.locator('#appState')).to_have_text('参考分析 / 保存データ表示')
                expect(page.locator('#deliverySummary')).to_have_text('保存データ表示')
                check('online recovery revalidates', not page.locator('#deliveryRefresh').is_disabled())
                check('normal and foreign cache records preserved', page.evaluate("""async()=>{
                    return await(await(await caches.open('us-stock-check-v0.9.8-cache1')).match('/normal-record-sentinel')).text()==='preserve' && await(await(await caches.open('other-app-preserve')).match('/sentinel')).text()==='preserve';
                }"""))
                check('normal local records preserved', page.evaluate("localStorage.getItem('usstock.activeTab')==='market' && localStorage.getItem('personal-sentinel')==='preserve'"))
                check('IndexedDB record preserved', page.evaluate("""async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('device-test-records');r.onsuccess=()=>resolve(r.result)});return new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get('test');r.onsuccess=()=>{resolve(r.result==='preserve');db.close()}})}"""))
                regular.reload()
                check('normal app still four tabs and root worker', regular.locator('[role=tab]').count()==4 and regular.evaluate('navigator.serviceWorker.controller.scriptURL')==root_worker)
                browser.close()
                (out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'device_pass':False,'restart':'Chromium tab close/reopen; not iPhone or OS termination'},ensure_ascii=False,indent=2)+'\n')
        finally: server.shutdown()

if __name__=='__main__': main()
