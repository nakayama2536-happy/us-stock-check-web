"""Verify the isolated preview and preserve the regular app. Not real iPhone acceptance."""
from pathlib import Path
from functools import partial
import http.server
import threading
import json
import shutil
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    OUT.mkdir(exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'docs')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    checks=[]
    def check(name,value):
        assert value,name
        checks.append(name)
        print('PREVIEW PASS:',name,flush=True)
    chrome=os.getenv('CHROME_PATH') or shutil.which('google-chrome') or shutil.which('chromium')
    if not chrome:raise RuntimeError('No Chromium executable')
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844})
            page=context.new_page()
            page.clock.set_fixed_time('2026-10-04T18:30:00+09:00')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/index.html')
            page.evaluate('navigator.serviceWorker.ready')
            page.evaluate("localStorage.setItem('usstock.activeTab','market');localStorage.setItem('other-app-record','preserve')")
            page.evaluate("caches.open('other-app-preserve').then(c=>c.put('/sentinel',new Response('preserve')))")
            workers=page.evaluate('navigator.serviceWorker.getRegistrations().then(rs=>rs.map(r=>r.active.scriptURL))')
            page.goto(base+'/preview/s1/')
            frame=page.frame_locator('#previewFrame')
            frame.locator('.ux-stock').first.wait_for(state='visible',timeout=30000)
            inner=page.locator('#previewFrame').element_handle().content_frame()
            check('isolated preview loads five summary rows',frame.locator('.ux-stock').count()==5)
            check('preview starts at overview without reading real-app market preference',frame.locator('#tab-overview').is_visible())
            check('saved input remains reference data, not a false five-incident warning',not frame.locator('#globalDataNotice').is_visible())
            check('sandbox blocks storage access',inner.evaluate("()=>{try{localStorage.getItem('usstock.activeTab');return false}catch(_){return true}}"))
            check('sandbox blocks parent document access',inner.evaluate("()=>{try{parent.document.title;return false}catch(_){return true}}"))
            for width,height in [(320,780),(390,844),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                for tab in ['overview','stocks','market','quality','manage']:
                    frame.locator('#tabbtn-'+tab).click()
                    check(f'{width}x{height} {tab} no inner overflow',inner.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
                    check(f'{width}x{height} {tab} one visible panel',frame.locator('[data-tab-panel]:visible').count()==1)
                    box=frame.locator('#tabbtn-'+tab).bounding_box()
                    check(f'{width}x{height} {tab} button in outer viewport',bool(box and box['x']>=-1 and box['y']>=-1 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1))
                frame.locator('#tabbtn-overview').click()
                check(f'{width}x{height} Japan-like card headers do not overlap',inner.evaluate("""()=>Array.from(document.querySelectorAll('.usj-stock-head')).every(el=>{
                    const a=el.querySelector('.usj-company').getBoundingClientRect(),b=el.querySelector('.usj-price-group').getBoundingClientRect();
                    return a.right<=b.left+1;
                })"""))
                check(f'{width}x{height} three indicator columns per security',frame.locator('.usj-indicator').count()==15)
            page.set_viewport_size({'width':390,'height':844})
            frame.locator('#tabbtn-overview').click();frame.locator('.usj-company[data-open-stock="MSTR"]').click()
            check('MSTR detail opens from summary',frame.locator('#stockSelector').input_value()=='MSTR')
            check('MSTR panel retained','MSTR監視方針' in frame.locator('#stocks').inner_text())
            frame.locator('#stockSelector').select_option('SOXL')
            check('SOXL panel retained','SOXL参考ステージ' in frame.locator('#stocks').inner_text())
            frame.locator('#tabbtn-overview').click()
            frame.locator('[data-open-evidence="PLTR"]').click()
            check('evidence link opens selected security',frame.locator('#stockSelector').input_value()=='PLTR' and frame.locator('#tab-stocks').is_visible())
            check('evidence link expands technical and levels',inner.evaluate("""()=>{
                const panel=document.querySelector('[data-stock-panel="PLTR"]');
                return Array.from(panel.querySelectorAll('details')).filter(d=>['テクニカル詳細','テクニカル監視ライン'].includes(d.querySelector('summary').textContent.trim())).every(d=>d.open);
            }"""))
            frame.locator('#tabbtn-overview').click()
            check('judgment does not invent WAIT HOLD or business-day forecasts',not any(text in frame.locator('.usj-list').inner_text() for text in ['保有継続','待機','1日','3日','5日','14日']))
            check('exact close evidence can show match',frame.locator('.usj-check-good').count()==5)
            frame.locator('[data-judgment-card="PLTR"] .usj-check').click()
            check('row source badge opens quality tab',frame.locator('#tab-quality').is_visible())
            frame.locator('#tabbtn-overview').click()
            frame.locator('[data-judgment-card="PLTR"] [data-us-consult]').click()
            page.locator('#consultDialog').wait_for(state='visible')
            check('analysis opens outside isolated iframe',page.locator('#consultTitle').inner_text()=='PLTRをGPTで詳しく解析')
            page.locator('#consultView').select_option('full')
            check('analysis has bound public history','source_commit' in page.locator('#consultText').input_value())
            check('manual copy remains available',page.locator('#consultText').is_visible())
            page.locator('#consultClose').click()
            frame.locator('#tabbtn-quality').click()
            frame.locator('#qualityDigest [data-us-consult="diagnostic"]').click()
            page.locator('#consultDialog').wait_for(state='visible')
            check('diagnostic summary is bounded',len(page.locator('#consultText').input_value())<=8000)
            page.locator('#consultView').select_option('full')
            full=page.locator('#consultText').input_value()
            check('diagnostic covers all five targets',full.count('requested_ticker')==5)
            check('oversized full copy is disabled',page.locator('#consultCopy').is_disabled())
            with page.expect_download() as download_info:page.locator('#consultSave').click()
            download=download_info.value
            check('saved full text is exact',Path(download.path()).read_text()==full)
            check('download filename identifies subject and date',download.suggested_filename=='US_preview_diagnostic_ALL_2026-10-02.txt')
            pieces=[]
            for value in page.locator('#consultView option').evaluate_all('(els)=>els.map(e=>e.value).filter(v=>/^\\d+$/.test(v))'):
                page.locator('#consultView').select_option(value)
                text=page.locator('#consultText').input_value()
                check('split '+value+' stays bounded',len(text)<=8000 and page.locator('#consultCopy').is_enabled())
                pieces.append(text.split('\n',1)[1])
            check('split text reconstructs full evidence',''.join(pieces)==full)
            page.locator('#consultClose').click()
            check('close clears consultation text',page.locator('#consultText').input_value()=='')
            frame.locator('#tabbtn-stocks').click()
            for ticker in ['PLTR','LLY','BSY','MSTR','SOXL']:
                frame.locator('#stockSelector').select_option(ticker)
                check(ticker+' has validated candle and volume chart',frame.locator('[data-stock-panel="'+ticker+'"] .usr-candles svg').is_visible())
                selector=frame.locator('[data-history-window="'+ticker+'"]')
                check(ticker+' initial 90 candles',frame.locator('[data-stock-panel="'+ticker+'"] .usr-volume').count()==90)
                selector.select_option('250')
                check(ticker+' expands to 250 candles',frame.locator('[data-stock-panel="'+ticker+'"] .usr-volume').count()==250)
                selector.select_option('90')
            for width,height in [(320,780),(390,844),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                check(str(width)+' chart no overflow',inner.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
                frame.locator('[data-stock-panel="SOXL"] [data-us-consult="analysis"]').click()
                page.locator('#consultDialog').wait_for(state='visible')
                check(str(width)+' consultation fits viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector("#consultDialog").scrollWidth<=document.querySelector("#consultDialog").clientWidth+1'))
                check(str(width)+' new consultation resets to selected security',page.locator('#consultView').input_value()=='summary' and 'SOXL' in page.locator('#consultText').input_value() and 'PLTR' not in page.locator('#consultText').input_value())
                page.locator('#consultClose').click()
            page.set_viewport_size({'width':390,'height':844})
            frame.locator('[data-stock-panel="SOXL"] .usr-candles').scroll_into_view_if_needed()
            page.screenshot(path=str(OUT/'us-preview-ohlcv.png'))
            frame.locator('#tabbtn-manage').click()
            requests=[];page.on('request',lambda r:requests.append(r.url))
            frame.locator('#refreshButton').click()
            check('redisplay button describes static data','固定データ' in frame.locator('#refreshNote').inner_text())
            check('redisplay creates no network requests',len(requests)==0)
            check('Japan-like card layout survives redisplay',frame.locator('[data-judgment-card]').count()==5)
            check('real-app tab preference preserved',page.evaluate("localStorage.getItem('usstock.activeTab')")=='market')
            check('other records preserved',page.evaluate("localStorage.getItem('other-app-record')")=='preserve')
            check('other cache preserved',page.evaluate("caches.open('other-app-preserve').then(c=>c.match('/sentinel')).then(r=>r.text())")=='preserve')
            check('worker registration unchanged',page.evaluate('navigator.serviceWorker.getRegistrations().then(rs=>rs.map(r=>r.active.scriptURL))')==workers)
            frame.locator('#tabbtn-overview').click();inner.evaluate('document.fonts.ready');page.wait_for_timeout(250)
            page.screenshot(path=str(OUT/'us-preview-overview.png'))
            inner.evaluate("document.querySelector('.usj-list').scrollIntoView({block:'start',behavior:'instant'})")
            page.wait_for_timeout(250);page.screenshot(path=str(OUT/'us-preview-judgment-jp.png'))
            frame.locator('#tabbtn-quality').click();page.wait_for_timeout(250);page.screenshot(path=str(OUT/'us-preview-quality.png'))
            check('no script errors',not errors)
            (OUT/'ui-preview-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'device_pass':False,'kind':'sandboxed static preview / Chromium / jp-cards.4'},ensure_ascii=False,indent=2)+'\n')
            browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
