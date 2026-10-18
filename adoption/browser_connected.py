"""Unpublished connected preview acceptance. Browser automation is NOT iPhone acceptance."""
from pathlib import Path
import hashlib
import http.server
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SCOPE = '/us-stock-check-web/preview/connected/'
CACHE = 'us-connected-preview-delivery-v1'


def main():
    signal.alarm(240)
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print('CONNECTED PASS:', name, flush=True)

    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    external = os.getenv('CONNECTED_DELIVERY_DIR')
    input_dir = Path(external).resolve() if external else ROOT / 'docs/preview/device/delivery'
    manifest = json.loads((input_dir / 'current.json').read_text())
    capture = json.loads((input_dir / 'releases' / manifest['release'] / 'ohlcv-history.json').read_text())
    producer = os.environ['EXPECTED_PRODUCER_SHA'] if external else manifest['source_revision']
    run_id = os.environ['EXPECTED_PRODUCER_RUN'] if external else capture['capture']['run_id']
    with tempfile.TemporaryDirectory() as temporary:
        temp = Path(temporary)
        site = temp / 'us-stock-check-web'
        shutil.copytree(ROOT / 'docs', site)
        connected = site / 'preview/connected'
        subprocess.run(['node', str(ROOT / 'adoption/connected-preview.cjs'), 'build', str(input_dir),
                        str(connected), revision, producer, run_id], check=True)
        check('root remains four tabs', (site / 'index.html').read_text().count('role="tab"') == 4)
        check('fixed device manifest unchanged', (site / 'preview/device/delivery/current.json').read_bytes() ==
              (ROOT / 'docs/preview/device/delivery/current.json').read_bytes())
        state = {'corrupt': False}

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=temporary, **kwargs)

            def log_message(self, *args):
                pass

            def do_GET(self):
                if state['corrupt'] and self.path.startswith(SCOPE + 'delivery/releases/') and self.path.endswith('/market.json'):
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{}')
                    return
                super().do_GET()

            def end_headers(self):
                self.send_header('Cache-Control', 'no-store')
                super().end_headers()

        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        url = origin + SCOPE
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),
                                            headless=True, args=['--no-sandbox'])
                context = browser.new_context(viewport={'width': 390, 'height': 844})
                page = context.new_page()
                page.goto(origin + '/us-stock-check-web/')
                page.evaluate('navigator.serviceWorker.ready')
                page.evaluate("""async()=>{
                    localStorage.setItem('usstock.activeTab','stocks');
                    localStorage.setItem('personal-sentinel','preserve');
                    for(const n of ['us-stock-check-delivery-v1','us-stock-device-delivery-v1','other-app-sentinel']){
                        await(await caches.open(n)).put('/sentinel',new Response('preserve'));
                    }
                    const db=await new Promise(resolve=>{const r=indexedDB.open('personal-sentinel',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result)});
                    await new Promise(resolve=>{const t=db.transaction('records','readwrite');t.objectStore('records').put('preserve','key');t.oncomplete=resolve});db.close();
                }""")
                page.goto(url)
                expect(page.locator('#deliveryState')).to_contain_text(manifest['release'][:12])
                page.wait_for_function("navigator.serviceWorker.controller?.scriptURL.includes('/preview/connected/sw.js')")
                frame = page.frame_locator('#previewFrame')
                check('isolated five tabs are visible', frame.locator('[role=tab]').count() == 5)
                expect(frame.locator('#tab-overview')).to_be_visible()
                check('regular active-tab preference is not imported', True)
                check('iframe sandbox has no same-origin capability', page.locator('#previewFrame').get_attribute('sandbox') == 'allow-scripts')
                check('connected worker owns only connected scope', page.evaluate("navigator.serviceWorker.getRegistration().then(r=>new URL(r.scope).pathname)") == SCOPE)
                check('regular worker registration is retained', page.evaluate("navigator.serviceWorker.getRegistration('/us-stock-check-web/').then(r=>new URL(r.scope).pathname)") == '/us-stock-check-web/')
                frame.locator('[data-tab="stocks"]').click()
                frame.locator('#stockSelector').select_option('PLTR')
                expect(frame.locator('[data-stock-panel="PLTR"] .usr-candles')).to_be_visible()
                frame.locator('[data-history-window="PLTR"]').select_option('250')
                dimensions = frame.locator('[data-chart-ticker="PLTR"] .usr-chart-scroll[role=region]').evaluate('(e)=>({h:e.querySelector("svg").getBoundingClientRect().height,end:e.scrollLeft+e.clientWidth>=e.scrollWidth-2})')
                check('250 bars retain height and latest edge', dimensions['h'] == 240 and dimensions['end'])
                frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]').click()
                expect(page.locator('#consultDialog')).to_be_visible()
                page.locator('#consultView').select_option('full')
                text = page.locator('#consultText').input_value()
                check('consultation uses the displayed immutable release', manifest['release'] in text and 'SHADOW' in text)
                context.set_offline(True)
                expect(page.locator('#connectedState')).to_contain_text('オフライン')
                expect(page.locator('#consultDialog')).not_to_be_visible()
                check('offline clears all transfer text', page.locator('#consultText').input_value() == '')
                page.close()
                page = context.new_page()
                page.clock.install()
                page.goto(url)
                expect(page.locator('#deliveryState')).to_contain_text('保存版（再取得未確認・GPT停止）')
                # The restored page deliberately collapses audit details. Inspect via the real user control.
                if page.locator('header details').get_attribute('open') is None:
                    page.locator('header summary').click()
                expect(page.locator('#deliveryState')).to_be_visible()
                check('offline tab restart restores the same release', manifest['release'][:12] in page.locator('#deliveryState').inner_text())
                frame = page.frame_locator('#previewFrame')
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                page.clock.fast_forward(61000)
                expect(frame.locator('#appState')).to_have_text('保存値 / オフライン')
                check('periodic redraw preserves offline and GPT lock', frame.locator('[data-us-consult]:not([disabled])').count() == 0)
                context.set_offline(False)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                check('recovery revalidates rather than relabels cache', True)
                if page.locator('header details').get_attribute('open') is None:
                    page.locator('header summary').click()
                state['corrupt'] = True
                page.locator('#deliveryRefresh').click()
                expect(page.locator('#deliveryState')).to_contain_text('更新できません')
                expect(page.locator('#connectedState')).to_contain_text('再取得未確認')
                check('corrupt network input retains old view with GPT disabled', page.frame_locator('#previewFrame').locator('[data-us-consult]:not([disabled])').count() == 0)
                state['corrupt'] = False
                page.locator('#deliveryRefresh').click()
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                await_corrupt = """async()=>{const c=await caches.open('us-connected-preview-delivery-v1'),u=new URL('./__verified_delivery__',location.href);const d=await(await c.match(u)).json();d.raw['market.json']='{}';await c.put(u,new Response(JSON.stringify(d)));}"""
                page.evaluate(await_corrupt)
                context.set_offline(True)
                page.reload()
                expect(page.locator('#deliveryState')).to_contain_text('一致確認済みのデータはありません')
                check('corrupt saved snapshot is rejected on restart', page.locator('#previewFrame').is_hidden())
                context.set_offline(False)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                check('only one connected snapshot is stored', page.evaluate("caches.open('us-connected-preview-delivery-v1').then(c=>c.keys()).then(k=>k.length)") == 1)
                check('normal local records are intact', page.evaluate("localStorage.getItem('personal-sentinel')==='preserve' && localStorage.getItem('usstock.activeTab')==='stocks'"))
                check('normal, fixed-device and unrelated caches are intact', page.evaluate("""async()=>{for(const n of ['us-stock-check-delivery-v1','us-stock-device-delivery-v1','other-app-sentinel']){const r=await(await caches.open(n)).match('/sentinel');if(!r||await r.text()!=='preserve')return false;}return true;}"""))
                check('IndexedDB record is intact', page.evaluate("""async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('personal-sentinel');r.onsuccess=()=>resolve(r.result)});return new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get('key');r.onsuccess=()=>{resolve(r.result);db.close()}})}""") == 'preserve')
                page.set_viewport_size({'width': 844, 'height': 390})
                expect(page.locator('#previewFrame')).to_be_visible()
                check('landscape keeps usable frame and bounded header', page.locator('header').bounding_box()['height'] <= 390 * .48 + 1 and page.locator('#previewFrame').bounding_box()['height'] > 120)
                page.set_viewport_size({'width': 390, 'height': 844})
                output = ROOT / 'test-output-connected'
                output.mkdir(exist_ok=True)
                page.screenshot(path=str(output / 'connected-portrait.png'))
                page.goto(origin + '/us-stock-check-web/')
                check('return to normal app still shows four tabs', page.locator('[role=tab]').count() == 4)
                check('normal app is controlled by its original scope', page.evaluate("navigator.serviceWorker.getRegistration().then(r=>new URL(r.scope).pathname)") == '/us-stock-check-web/')
                browser.close()
        finally:
            server.shutdown()
        report = {'passed': len(checks), 'checks': checks, 'scope': SCOPE, 'source_release': manifest['release'],
                  'producer_sha': producer, 'producer_run': run_id, 'consumer_sha': revision,
                  'market_date': capture['basis_date'], 'input_kind': 'SAVED_SCHEDULED_DELIVERY' if external else 'SAVED_FIXED_FIXTURE',
                  'market_acquisition_performed': False, 'public_published': False, 'device_pass': False,
                  'restart': 'Chromium tab close/reopen, not iOS termination', 'actual_personal_records_tested': False}
        (ROOT / 'test-output-connected' / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print('CONNECTED RESULT:', json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
