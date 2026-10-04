"""Browser checks for the unpublished candidate; all changed records are test fixtures."""
from pathlib import Path
import http.server,threading,tempfile,subprocess,shutil,json,os,signal
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
REVISION='55e872d80e20dac280ef56f2ac17ba18b3a90ee6'

def main():
    signal.alarm(180)
    checks=[]
    def check(name,ok):
        assert ok,name
        checks.append(name);print('ADOPTION PASS:',name,flush=True)
    with tempfile.TemporaryDirectory() as temp:
        site=Path(temp)/'us-stock-check-web'
        subprocess.run(['node',str(ROOT/'adoption/build.cjs'),str(site),REVISION,str(ROOT/'docs/preview/s1/data/ohlcv-history.json')],check=True)
        state={'corrupt':False}
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self,*a,**kw):super().__init__(*a,directory=temp,**kw)
            def log_message(self,*a):pass
            def do_GET(self):
                if state['corrupt'] and self.path.endswith('/market.json'):
                    self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
                super().do_GET()
            def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=os.getenv('CHROME_PATH') or shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':844})
                context.add_init_script("if(window===window.top){localStorage.setItem('usstock.activeTab','stocks');localStorage.setItem('user-record-sentinel','preserve');}")
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/us-stock-check-web/')
                expect(page.locator('#deliveryState')).to_contain_text('配信版 ')
                frame=page.frame_locator('#previewFrame')
                expect(frame.locator('#tab-stocks')).to_be_visible()
                check('five approved tabs and legacy tab preference',frame.locator('[role=tab]').count()==5)
                check('same-origin access remains absent',page.locator('#previewFrame').get_attribute('sandbox')=='allow-scripts')
                check('public date displayed',frame.locator('#tradeDate').inner_text()=='2026/10/02')
                for ticker in ['PLTR','LLY','BSY','MSTR','SOXL']:
                    frame.locator('#stockSelector').select_option(ticker)
                    expect(frame.locator(f'[data-stock-panel="{ticker}"] .usr-candles')).to_be_visible()
                    check(ticker+' verified daily graph',frame.locator(f'[data-stock-panel="{ticker}"] [data-history-window]').count()==1)
                frame.locator('#stockSelector').select_option('PLTR')
                frame.locator('[data-history-window="PLTR"]').select_option('250')
                dims=frame.locator('[data-chart-ticker="PLTR"] .usr-chart-scroll[role=region]').evaluate('(e)=>({h:e.querySelector("svg").getBoundingClientRect().height,end:e.scrollLeft+e.clientWidth>=e.scrollWidth-2})')
                check('250 bars retain fixed height and latest edge',dims['h']==240 and dims['end'])
                frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]').click()
                expect(page.locator('#consultDialog')).to_be_visible()
                page.locator('#consultView').select_option('full')
                content=page.locator('#consultText').input_value()
                check('GPT text has actual delivery provenance', 'delivery_manifest' in content and REVISION in content and 'VERSION_BOUND_UI_CANDIDATE' in content and 'FROZEN_UI_PREVIEW' not in content)
                generation=frame.locator('body').evaluate('()=>DELIVERY_GENERATION')
                state['corrupt']=True
                page.locator('#deliveryRefresh').evaluate('(b)=>b.click()')
                expect(page.locator('#consultDialog')).not_to_be_visible()
                expect(page.locator('#deliveryState')).to_contain_text('更新できません')
                check('failed hash leaves previous display with blocked transfer',frame.locator('#tradeDate').inner_text()=='2026/10/02' and page.locator('#consultText').input_value()=='')
                expect(frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]')).to_be_disabled()
                state['corrupt']=False
                # New public-data package is a TEST FIXTURE, not a backend publication.
                inputs=Path(temp)/'input';shutil.copytree(ROOT/'docs/data',inputs)
                status=json.loads((inputs/'status.json').read_text());status['generated_at_jst']='2026-10-04T17:37:25+09:00'
                common=json.loads((inputs/'common_snapshot.json').read_text());common['timestamps']['calculated_at']=status['generated_at_jst']
                (inputs/'status.json').write_text(json.dumps(status));(inputs/'common_snapshot.json').write_text(json.dumps(common))
                subprocess.run(['node','-e',"require(process.argv[1]).pack(process.argv[2],process.argv[3],process.argv[4])",str(ROOT/'adoption/build.cjs'),str(site/'delivery'),str(inputs),'0'*40],check=True)
                page.locator('#deliveryRefresh').click();expect(page.locator('#deliveryState')).to_contain_text('17:37:25')
                frame=page.frame_locator('#previewFrame')
                expect(frame.locator('#tab-stocks')).to_be_visible()
                check('new package replaces all data while keeping selection',frame.locator('#stockSelector').input_value()=='PLTR')
                check('missing history never reuses fixed 250 bars',frame.locator('.usr-candles').count()==0 and 'グラフは表示できません' in frame.locator('[data-stock-panel="PLTR"]').inner_text())
                frame.locator('body').evaluate("(_,generation)=>parent.postMessage({type:'US_PREVIEW_CONSULT',kind:'analysis',ticker:'PLTR',generation},'*')",generation)
                page.wait_for_timeout(100)
                check('old generation message cannot reopen old consultation',not page.locator('#consultDialog').is_visible())
                frame.locator('[data-stock-panel="PLTR"] [data-us-consult="analysis"]').click()
                expect(page.locator('#consultDialog')).to_be_visible()
                context.set_offline(True);expect(page.locator('#deliveryState')).to_contain_text('オフライン');expect(page.locator('#consultDialog')).not_to_be_visible()
                check('offline closes and clears consultation',page.locator('#consultText').input_value()=='')
                context.set_offline(False);expect(page.locator('#deliveryState')).to_contain_text('配信版 ')
                check('reconnection revalidates package',not page.locator('#deliveryRefresh').is_disabled())
                check('personal record sentinel unchanged',page.evaluate("localStorage.getItem('user-record-sentinel')")=='preserve')
                check('candidate registers no SW',page.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length)')==0)
                check('no browser script errors',errors==[])
                out=ROOT/'test-output-adoption';out.mkdir(exist_ok=True)
                page.screenshot(path=str(out/'candidate.png'),full_page=True)
                (out/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'device_pass':False,'deployed':False,'sw_integration':False,'synthetic_update_fixture':True},indent=2)+'\n')
                browser.close()
        finally:server.shutdown()
if __name__=='__main__':main()
