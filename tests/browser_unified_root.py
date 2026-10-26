"""Read-only root UI migration candidate. Chromium evidence, NOT iPhone acceptance or publication."""
from __future__ import annotations
import json
import shutil
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/"docs"
PREFIX="/us-stock-check-web/"
results=[]
def check(name, condition):
    if not condition:
        raise AssertionError(name)
    results.append(name)
    print("UNIFIED ROOT PASS:",name)

def main():
    output=ROOT/"test-output-unified"
    output.mkdir(exist_ok=True)
    status=json.loads((DOCS/"data/status.json").read_text())
    market=json.loads((DOCS/"data/market.json").read_text())
    shadow={"bad_market":False}
    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self,url):
            p=urlparse(url).path
            if not p.startswith(PREFIX): return str(ROOT/"not-present")
            rel=p[len(PREFIX):] or "index.html"
            return str(DOCS/rel)
        def log_message(self,*args): pass
        def do_GET(self):
            pathname=urlparse(self.path).path
            if shadow["bad_market"] and pathname==PREFIX+"data/market.json":
                bad=json.loads((DOCS/"data/market.json").read_text())
                bad["stocks"][0]["trade_date"]="2026-10-22"
                payload=json.dumps(bad,ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type","application/json")
                self.send_header("Cache-Control","no-store")
                self.send_header("Content-Length",str(len(payload)))
                self.end_headers();self.wfile.write(payload);return
            super().do_GET()
        def end_headers(self):
            self.send_header("Cache-Control","no-store")
            super().end_headers()
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    Thread(target=server.serve_forever,daemon=True).start()
    url=f"http://127.0.0.1:{server.server_port}{PREFIX}"
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium") or p.chromium.executable_path,headless=True,args=["--no-sandbox"])
            context=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,reduced_motion="reduce")
            page=context.new_page()
            errors=[];page.on("pageerror",lambda err:errors.append(str(err)))
            page.goto(url)
            expect(page.locator(".unified-row")).to_have_count(5)
            check("one unified root with 5 navigation tabs",page.locator(".bottom-nav button").count()==5)
            check("five live-source tickers in fixed market-specific order",[x.get_attribute("data-unified-ticker") for x in page.locator(".unified-row").all()]==["PLTR","LLY","BSY","MSTR","SOXL"])
            check("date and price come from same current public data files",status["us_trade_date"].replace("-","/") in page.locator("#tradeDate").inner_text() and f"{market['stocks'][0]['close']:,.2f}" in page.locator(".unified-row").first.inner_text())
            check("no archive 2026-10-16 hardcoded market reference","2026/10/16" not in page.locator("#digest").inner_text())
            check("SHADOW and no formal automatic trade visible","検証" in page.locator("#appState").inner_text() and "正式な売買判断ではありません" in page.locator("#digest").inner_text())
            check("old 4-tab activeTab key remains used",page.evaluate('localStorage.getItem("usstock.activeTab")') in ["overview","stocks","market","quality","manage"])
            check("future root has no second yellow connected-preview header",page.locator(".usm-header").count()==0)
            check("refresh controls moved to management screen",page.locator("#refreshButton").count()==1 and page.locator("#tab-manage #refreshButton").count()==1)
            page.locator('.unified-row[data-unified-ticker="BSY"]').click()
            expect(page.locator("#tab-stocks")).to_be_visible()
            check("ticker tap opens matching stock detail",page.locator('article[data-unified-stock="BSY"]').is_visible())
            for tab in ["overview","stocks","market","quality","manage"]:
                page.locator(f'#tabbtn-{tab}').click()
                expect(page.locator(f'#tab-{tab}')).to_be_visible()
            check("all five tabs operate and management content exists",page.locator('#tab-manage #modelValidation').count()==1)
            for width,height in [(320,700),(375,812),(390,844),(430,932),(844,390)]:
                page.set_viewport_size({"width":width,"height":height})
                check(f"viewport {width}x{height} has five accessible nav buttons",all(page.locator(".bottom-nav button").nth(i).bounding_box()["height"]>=44 for i in range(5)))
            page.set_viewport_size({"width":390,"height":844})
            page.evaluate('localStorage.setItem("us_unrelated_personal_marker","keep");localStorage.setItem("usstock.activeTab","quality")')
            page.reload()
            expect(page.locator("#tab-quality")).to_be_visible()
            check("existing tab preference and unrelated personal marker survive reload",page.evaluate('localStorage.getItem("us_unrelated_personal_marker")')=="keep")
            page.locator("#tabbtn-overview").click()
            expect(page.locator(".unified-row")).to_have_count(5)
            baseline=page.locator("#digest").inner_text()
            shadow["bad_market"]=True
            page.locator("#tabbtn-manage").click()
            page.locator("#refreshButton").click()
            expect(page.locator("#unifiedNotice")).to_be_visible()
            expect(page.locator("#appState")).to_contain_text("読込エラー")
            check("mismatched refreshed market date fails closed", "整合" in page.locator("#unifiedNotice").inner_text())
            check("failed refresh retains prior safe reference content",page.locator("#digest").inner_text()==baseline)
            check("no uncaught browser exceptions",not errors)
            context.close();browser.close()
    finally:
        server.shutdown();server.server_close()
    report={"schema":"us-unified-root-candidate-test/1","source":"Public docs/data saved snapshot", "source_market_day":status["us_trade_date"],"generated_at_jst":status["generated_at_jst"],"checks":results,"passed":len(results),"published":False,"device_pass":False,"trading_engine_added":False,"root_migration_performed":False,"actual_user_records_tested":False}
    (output/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("UNIFIED ROOT REPORT:",json.dumps(report,ensure_ascii=False))
if __name__=="__main__":main()
