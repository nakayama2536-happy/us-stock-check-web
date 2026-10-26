"""Candidate-only mobile regression: saved fixture, not iPhone or live-market proof."""
import json
import os
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
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)
    print('MOBILE PASS:', name)


def main():
    evidence = ROOT / 'test-output-mobile'
    evidence.mkdir(exist_ok=True)
    revision = os.environ.get('PUBLIC_REVISION') or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    with TemporaryDirectory(prefix='us-mobile-browser-') as temp:
        temp = Path(temp)
        source = temp / 'source'
        delivery = ROOT / 'docs/preview/device/delivery'
        manifest = json.loads((delivery / 'current.json').read_text())
        capture = json.loads((delivery / 'releases' / manifest['release'] / 'ohlcv-history.json').read_text())
        subprocess.run(['node', str(ROOT/'adoption/connected-preview.cjs'), 'build', str(delivery), str(source), revision, manifest['source_revision'], capture['capture']['run_id']], check=True)
        mobile = temp / 'mobile'
        subprocess.run(['node', str(ROOT/'adoption/mobile-layout.cjs'), str(source), str(mobile), revision], check=True)
        state = {'root': source, 'corrupt': False}

        class Handler(SimpleHTTPRequestHandler):
            def translate_path(self, url):
                route = urlparse(url).path
                if route.startswith(SCOPE):
                    return str(state['root'] / (route[len(SCOPE):] or 'index.html'))
                return str(temp / 'NOT_FOUND')
            def log_message(self, *args):
                pass
            def do_GET(self):
                if state['corrupt'] and urlparse(self.path).path.endswith('/market.json'):
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b'{}'); return
                super().do_GET()

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_port}{SCOPE}'
        try:
            with sync_playwright() as p:
                executable = shutil.which('google-chrome') or shutil.which('chromium')
                browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
                base_context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
                before = base_context.new_page(); before.goto(url)
                expect(before.locator('#connectedState')).to_contain_text('配信データ表示')
                old_top = before.frame_locator('#previewFrame').locator('[data-judgment-card="PLTR"]').bounding_box()['y']
                before.screenshot(path=str(evidence/'before.png')); base_context.close()
                state['root'] = mobile
                context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
                page = context.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(url)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                frame = page.frame_locator('#previewFrame')
                expect(frame.locator('.usm-row')).to_have_count(5)
                top = frame.locator('.usm-row').first.bounding_box()['y']
                check('first stock reaches initial screen without shrinking warning text', top < 500 and old_top-top >= 150)
                check('five ticker rows remain explicit and actionable', frame.locator('.usm-row').all_inner_texts() and all(frame.locator(f'.usm-row[data-open-stock="{t}"]').count()==1 for t in ['PLTR','LLY','BSY','MSTR','SOXL']))
                check('stale warning stays visible above ticker list', frame.locator('#globalDataNotice').is_visible() and '4暦日' in frame.locator('#globalDataNotice').inner_text())
                check('all ticker hit areas exceed 44 px', all(frame.locator('.usm-row').nth(i).bounding_box()['height']>=44 for i in range(5)))
                page.screenshot(path=str(evidence/'after.png'))
                frame.locator('.usm-row[data-open-stock="BSY"]').click()
                expect(frame.locator('#stockSelector')).to_have_value('BSY')
                check('ticker row opens the matching stock, not a new trade action', frame.locator('#tab-stocks').is_visible())
                frame.locator('[data-history-window="BSY"]').select_option('250')
                chart=frame.locator('.usr-window-250 svg').first.bounding_box()
                check('250-bar chart retains bounded height', chart is not None and 200 <= chart['height'] <= 260)
                for tab in ['overview','stocks','market','quality','manage']:
                    frame.locator(f'#tabbtn-{tab}').click()
                    expect(frame.locator(f'#tab-{tab}')).to_be_visible()
                check('all five tabs still operate', True)
                frame.locator('#tabbtn-overview').click()
                frame.locator('.usm-full>summary').click()
                page.frames[1].evaluate('renderDeliveryState()')
                check('open detail survives a periodic redraw', frame.locator('.usm-full').evaluate('(e)=>e.open'))
                frame.locator('.usm-full>summary').click()
                for width,height in [(320,700),(375,812),(430,932),(844,390)]:
                    page.set_viewport_size({'width':width,'height':height})
                    expect(frame.locator('#tabbtn-manage')).to_be_visible()
                    check(f'viewport {width}x{height}: no page overflow; navigation remains tappable', page.frames[1].evaluate('document.documentElement.scrollWidth<=innerWidth+1') and frame.locator('#tabbtn-manage').bounding_box()['height']>=44)
                page.set_viewport_size({'width':390,'height':844})
                page.wait_for_function('navigator.serviceWorker.controller!==null')
                context.set_offline(True)
                expect(page.locator('#connectedState')).to_contain_text('オフライン')
                expect(frame.locator('[data-us-consult]:not([disabled])')).to_have_count(0)
                check('offline keeps the existing GPT transfer lock', True)
                page.close(); page=context.new_page(); page.goto(url)
                expect(page.locator('#deliveryState')).to_contain_text('保存版（再取得未確認・GPT停止）')
                check('offline tab recreation restores the same immutable release', manifest['release'][:12] in page.locator('#deliveryState').text_content())
                context.set_offline(False)
                expect(page.locator('#connectedState')).to_contain_text('配信データ表示')
                check('online recovery requires successful revalidation', True)
                page.locator('header summary').click()
                state['corrupt']=True; page.locator('#deliveryRefresh').click()
                expect(page.locator('#deliveryState')).to_contain_text('更新できません')
                expect(page.locator('#connectedState')).to_contain_text('再取得未確認')
                check('corrupt update leaves the previous display and blocks GPT', page.frame_locator('#previewFrame').locator('[data-us-consult]:not([disabled])').count()==0)
                check('no uncaught browser exception', not errors)
                context.close(); browser.close()
        finally:
            server.shutdown(); server.server_close()
        report={'kind':'SAVED_FIXED_FIXTURE_MOBILE_UI','passed':len(checks),'checks':checks,'consumer_sha':revision,'source_release':manifest['release'],'first_stock_y_before':old_top,'first_stock_y_after':top,'device_pass':False,'public_published':False,'new_market_acquisition':False,'actual_personal_records_tested':False,'restart':'Chromium tab recreation, not iOS termination'}
        (evidence/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print('MOBILE RESULT:',json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    main()
