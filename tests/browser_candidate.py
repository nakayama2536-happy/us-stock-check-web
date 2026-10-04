"""Chromium integration checks, not iPhone/Safari/PWA device acceptance."""
from __future__ import annotations
import copy
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'build/us-ui-s1'
OUT=ROOT/'test-output'
TICKERS=['PLTR','LLY','BSY','MSTR','SOXL']

def fixture():
    date='2026-10-02'; calculated='2026-10-04T11:00:00+09:00'
    s={'schema_version':'0.2','app_version':'0.9.8','app_state':'SHADOW','run_state':'NO_CHANGE','us_trade_date':date,'generated_at_jst':calculated,
       'quality':{'qc':'PASS','session':'REGULAR','completeness':'5/5','source_crosscheck':'PASS'},'warnings':[],'errors':[]}
    stocks=[{'ticker':t,'name':t,'trade_date':date,'close':100+i,'change_pct':0,'trend':'上昇','macd_state':'強気','ma_state':'50MA > 200MA','rsi14':55,'ma50':90,'ma200':80,'signal':'SHADOW','structural_growth':None,'levels':{}} for i,t in enumerate(TICKERS)]
    m={'schema_version':'0.2','stocks':stocks,'market_environment':[],'model_validation':None}
    c={'schema_version':'1.0','market':'US','timestamps':{'market_as_of':date,'calculated_at':calculated},'snapshot':{'state':'LAST_VALID'},'incident':{'level':'NORMAL'},
       'data_quality':{'qc_state':'PASS','data_state':'FRESH','source_crosscheck':'PASS'},
       'decision_items':[{'ticker':t,'subject_id':t,'as_of':date,'eligibility':'NOT_ELIGIBLE','formal_action':None,'analysis_action':None,'blocking_conditions':[{'id':'FORMAL_ENGINE_NOT_IMPLEMENTED','label':'正式判断未実装'}]} for t in TICKERS]}
    return {'status.json':s,'market.json':m,'common_snapshot.json':c}

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    OUT.mkdir(exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(SITE)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base=f'http://127.0.0.1:{server.server_port}'
    checks=[]
    def check(label,ok):
        assert ok,label
        checks.append(label)
        print('BROWSER PASS:',label)
    chromium=os.getenv('CHROME_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    if not chromium:raise SystemExit('Chromium/Chrome executable unavailable; browser checks not passed')
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844})
            page=context.new_page()
            errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
            state={'data':fixture(),'fail':False,'real':False}
            def route(handler):
                if state['real']:return handler.continue_()
                name=handler.request.url.split('/data/')[-1].split('?')[0]
                if state['fail'] and name=='status.json':return handler.fulfill(status=503,body='unavailable')
                return handler.fulfill(status=200,content_type='application/json',body=json.dumps(state['data'].get(name,{})))
            page.route('**/data/*.json*',route)
            page.add_init_script("localStorage.setItem('usstock.activeTab','market');localStorage.setItem('other-app-record','preserve');")
            page.clock.install(time='2026-10-04T03:00:00Z')
            page.goto(base+'/');page.wait_for_selector('.ux-stock',state='attached')
            check('legacy selected tab restored',page.locator('#tab-market').is_visible())
            page.locator('#tabbtn-overview').click()
            check('five summary rows',page.locator('.ux-stock').count()==5)
            check('formal-engine constraint is not five data incidents',not page.locator('#globalDataNotice').is_visible())
            check('management update button not in overview',not page.locator('#refreshButton').is_visible())
            page.locator('[data-open-stock="MSTR"]').click()
            check('summary opens selected MSTR detail',page.locator('#tab-stocks').is_visible() and page.locator('#stockSelector').input_value()=='MSTR')
            check('only selected stock detail visible',page.locator('[data-stock-panel]:visible').count()==1)
            for width,height in [(320,780),(390,844),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                for tab in ['overview','stocks','market','quality','manage']:
                    page.locator('#tabbtn-'+tab).click()
                    check(f'{width}x{height} {tab} no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
                    check(f'{width}x{height} {tab} one visible tab',page.locator('[data-tab-panel]:visible').count()==1)
            page.set_viewport_size({'width':390,'height':844})
            # Missing one ticker: use 4/4 deliberately to test misleading denominator.
            state['data']['market.json']['stocks']=[s for s in state['data']['market.json']['stocks'] if s['ticker']!='MSTR']
            state['data']['status.json']['quality']['completeness']='4/4'
            page.evaluate('main()')
            check('missing ticker visibly stays 4/5', '4/5取得' in page.locator('#digest').inner_text())
            check('missing ticker global warning',page.locator('#globalDataNotice').is_visible())
            state['data']=fixture();state['data']['status.json']['run_state']='HOLD'
            page.evaluate('main()')
            for tab in ['overview','stocks','market','quality','manage']:
                page.locator('#tabbtn-'+tab).click();check('HOLD visible on '+tab,page.locator('#globalDataNotice').is_visible())
            state['data']=fixture();page.evaluate('main()')
            state['fail']=True;page.evaluate('main()')
            check('refresh failure preserves stock values', '$100.00' in page.locator('#digest').inner_text())
            check('refresh failure explicit across tabs','前回表示' in page.locator('#globalDataNotice').inner_text())
            state['fail']=False;page.evaluate('main()')
            context.set_offline(True)
            page.wait_for_function("document.getElementById('globalDataNotice').textContent.includes('オフライン')")
            check('offline marked as saved value',page.locator('#globalDataNotice').is_visible())
            context.set_offline(False)
            page.wait_for_function("!document.getElementById('refreshButton').disabled")
            check('other local data preserved',page.evaluate("localStorage.getItem('other-app-record')")=='preserve')
            check('candidate registers no service workers',page.evaluate('navigator.serviceWorker.getRegistrations().then(x=>x.length)')==0)
            # Use saved real public JSON for panel compatibility, not as current market verification.
            state['real']=True
            status=json.loads((SITE/'data/status.json').read_text())
            page.clock.set_fixed_time(status['generated_at_jst'])
            page.evaluate('main()');page.locator('#tabbtn-overview').click()
            check('saved public data renders all five securities',page.locator('.ux-stock').count()==5)
            page.screenshot(path=str(OUT/'us-ui-s1-overview.png'),full_page=True)
            page.locator('#tabbtn-quality').click();page.screenshot(path=str(OUT/'us-ui-s1-quality.png'),full_page=True)
            page.locator('#tabbtn-stocks').click();page.select_option('#stockSelector','MSTR')
            check('legacy MSTR panel preserved','MSTR監視方針' in page.locator('#stocks').inner_text())
            page.select_option('#stockSelector','SOXL')
            check('legacy SOXL panel preserved','SOXL参考ステージ' in page.locator('#stocks').inner_text())
            check('no browser page errors',not errors)
            (OUT/'browser-report.json').write_text(json.dumps({'engine':'Chromium','checks':checks,'passed':len(checks),'device_pass':False,'scope':'candidate preview; iPhone/Safari/PWA not verified'},ensure_ascii=False,indent=2)+'\n')
            browser.close()
    finally:
        server.shutdown()

if __name__=='__main__':main()
