"""Chromium checks for public dynamic-data 5-tab review, without root PWA replacement."""
from __future__ import annotations
import json
import shutil
from pathlib import Path
from threading import Thread
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/"docs"
PREFIX="/us-stock-check-web/"
OUT=ROOT/"test-output-unified-review"
checks=[]
def check(label,truth):
    assert truth,label
    checks.append(label)
    print("UNIFIED DEVICE REVIEW PASS:",label)
def main():
    OUT.mkdir(exist_ok=True)
    market=json.loads((DOCS/"data/market.json").read_text())
    status=json.loads((DOCS/"data/status.json").read_text())
    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self,url):
            p=urlparse(url).path
            if not p.startswith(PREFIX):return str(ROOT/"no-such-page")
            rel=p[len(PREFIX):] or "index.html"
            return str(DOCS/rel)
        def log_message(self,*args):pass
        def end_headers(self):
            self.send_header("Cache-Control","no-store")
            super().end_headers()
    web=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    Thread(target=web.serve_forever,daemon=True).start()
    base=f"http://127.0.0.1:{web.server_port}"+PREFIX
    try:
        with sync_playwright() as p:
            executable=shutil.which("google-chrome") or shutil.which("chromium") or p.chromium.executable_path
            browser=p.chromium.launch(headless=True,executable_path=executable,args=["--no-sandbox"])
            ctx=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,reduced_motion="reduce")
            page=ctx.new_page()
            errors=[];page.on("pageerror",lambda x:errors.append(str(x)))
            page.goto(base)
            expect(page.locator(".bottom-nav button")).to_have_count(4)
            page.evaluate("localStorage.setItem('usstock.activeTab','quality');localStorage.setItem('usstock.private-review-sentinel','keep')")
            check("production root remains current 4 tabs",True)
            page.goto(base+"preview/unified-daily/")
            expect(page.locator(".unified-row")).to_have_count(5)
            check("five review tickers correctly ordered",[x.get_attribute("data-unified-ticker") for x in page.locator(".unified-row").all()]==["PLTR","LLY","BSY","MSTR","SOXL"])
            check("review date sourced from existing normal Public JSON",status["us_trade_date"].replace("-","/") in page.locator("#tradeDate").inner_text())
            check("review close equals normal market JSON",f"{market['stocks'][0]['close']:,.2f}" in page.locator(".unified-row").first.inner_text())
            check("review is clearly labeled and shows formal trade limitation","5タブ統合・実機確認用" in page.locator(".unified-review-strip").inner_text() and "正式な売買判断ではありません" in page.locator("#digest").inner_text())
            check("preview never overwrote normal root tab/localStorage",page.evaluate("localStorage.getItem('usstock.activeTab')==='quality' && localStorage.getItem('usstock.private-review-sentinel')==='keep'"))
            check("review has no manifest",page.locator("link[rel='manifest']").count()==0)
            check("review never registers an isolated review service worker",page.evaluate("async()=>!(await navigator.serviceWorker.getRegistrations()).some(r=>r.scope.endsWith('/preview/unified-daily/'))"))
            for t in ("overview","stocks","market","quality","manage"):
                page.locator("#tabbtn-"+t).click()
                expect(page.locator("#tab-"+t)).to_be_visible()
            check("all five review tabs navigate without mutating root",True)
            page.locator("#tabbtn-overview").click()
            page.locator('.unified-row[data-unified-ticker="LLY"]').click()
            expect(page.locator('article[data-unified-stock="LLY"]')).to_be_visible()
            check("LLY summary navigates to matching stock detail",True)
            page.locator("#tabbtn-overview").click()
            page.screenshot(path=str(OUT/"iphone-390.png"),full_page=False)
            for width,height in ((320,700),(390,844),(430,932),(844,390)):
                page.set_viewport_size({"width":width,"height":height})
                check(f"review {width}x{height} has no viewport overflow",page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
                check(f"review {width}x{height} all tab targets at least 44px",all((x.bounding_box() or {}).get("height",0)>=44 for x in page.locator(".bottom-nav button").all()))
                if width==844:page.screenshot(path=str(OUT/"landscape-844.png"),full_page=False)
            page.goto(base)
            expect(page.locator(".bottom-nav button")).to_have_count(4)
            check("root remains unchanged after leaving review",page.evaluate("localStorage.getItem('usstock.activeTab')==='quality' && localStorage.getItem('usstock.private-review-sentinel')==='keep'"))
            check("no Javascript runtime exception",not errors)
            ctx.close();browser.close()
    finally:
        web.shutdown();web.server_close()
    report={"schema":"us-unified-review-browser/1","passed":len(checks),"checks":checks,"market_date":status["us_trade_date"],"generated_at_jst":status["generated_at_jst"],"published":False,"device_pass":False,"root_replaced":False,"real_personal_records_tested":False}
    (OUT/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("UNIFIED REVIEW BROWSER REPORT:",json.dumps(report,ensure_ascii=False))
if __name__=="__main__":main()
