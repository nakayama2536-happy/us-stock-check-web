"""Candidate-only 4->5->4 root PWA migration with same origin/context; not iOS acceptance."""
from __future__ import annotations
import json, shutil, subprocess
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from tempfile import TemporaryDirectory
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
OLD_REV="b3a1ad74254f4b234736b2f1fafb448dc29599c5"
PREFIX="/us-stock-check-web/"
checks=[]
IDB_CHECK="""async()=>await new Promise(resolve=>{
  const req=indexedDB.open('usstock-acceptance-test',1);
  req.onerror=()=>resolve(false);
  req.onsuccess=()=>{
    const db=req.result,tx=db.transaction('snap','readonly'),get=tx.objectStore('snap').get('test');
    get.onsuccess=()=>{const ok=get.result==='keep';db.close();resolve(ok);};
    get.onerror=()=>{db.close();resolve(false);};
  };
})"""
IDB_SETUP="""async()=>{
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open('usstock-acceptance-test',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('snap');
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>resolve(req.result);
  });
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('snap','readwrite');
    tx.objectStore('snap').put('keep','test');
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
  db.close();
  return true;
}"""
def check(name,value):
    if not value:raise AssertionError(name)
    checks.append(name);print("ROOT MIGRATION PASS:",name)
def old_file(name):
    return subprocess.check_output(["git","show",OLD_REV+":"+name],cwd=ROOT)

def main():
    evidence=ROOT/"test-output-unified";evidence.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="us-root-migration-") as dir:
        work=Path(dir)
        previous=work/"old";unified=work/"unified"
        shutil.copytree(ROOT/"docs",previous);shutil.copytree(ROOT/"docs",unified)
        for name in ["index.html","style.css","app.js"]:
            (previous/name).write_bytes(old_file("docs/"+name))
        state={"root":previous}
        class Handler(SimpleHTTPRequestHandler):
            def translate_path(self,url):
                p=urlparse(url).path
                if not p.startswith(PREFIX):return str(work/"not-present")
                return str(state["root"]/(p[len(PREFIX):] or "index.html"))
            def log_message(self,*args):pass
            def end_headers(self):
                self.send_header("Cache-Control","no-store");super().end_headers()
        server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
        Thread(target=server.serve_forever,daemon=True).start()
        url=f"http://127.0.0.1:{server.server_port}{PREFIX}"
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium") or p.chromium.executable_path,headless=True,args=["--no-sandbox"])
                context=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
                page=context.new_page();page.goto(url)
                expect(page.locator(".bottom-nav button")).to_have_count(4)
                page.wait_for_function("navigator.serviceWorker.controller!==null",timeout=20000)
                check("original daily app has 4 tabs and active root worker",True)
                page.evaluate("""async()=>{localStorage.setItem('usstock.legacy.personal','keep');const c=await caches.open('india-other-pwa-sentinel');await c.put('/outside',new Response('unrelated'));return true;}""")
                page.evaluate(IDB_SETUP)
                check("original root IndexedDB acceptance marker stored",page.evaluate(IDB_CHECK))
                page.evaluate("localStorage.setItem('usstock.activeTab','quality')")
                state["root"]=unified
                page.reload()
                expect(page.locator(".unified-row")).to_have_count(5)
                check("same origin upgrades from 4 tabs to the daily 5-tab root",page.locator(".bottom-nav button").count()==5)
                check("old quality tab preference survives",page.locator("#tab-quality").is_visible())
                check("personal localStorage key preserved",page.evaluate("localStorage.getItem('usstock.legacy.personal')")=="keep")
                check("personal IndexedDB marker preserved during upgrade",page.evaluate(IDB_CHECK))
                check("unrelated other-PWA cache survives",page.evaluate("async()=>await caches.has('india-other-pwa-sentinel')"))
                page.locator("#tabbtn-overview").click()
                expect(page.locator(".unified-row")).to_have_count(5)
                context.set_offline(True)
                page.close();page=context.new_page()
                page.goto(url)
                expect(page.locator(".unified-row")).to_have_count(5,timeout=10000)
                check("unified root offline closed-tab restart renders saved 5-stock source",True)
                check("offline still preserves personal and other-PWA storage",page.evaluate("async()=>localStorage.getItem('usstock.legacy.personal')==='keep'&&await caches.has('india-other-pwa-sentinel')"))
                check("offline root retains IndexedDB",page.evaluate(IDB_CHECK))
                context.set_offline(False)
                state["root"]=previous
                page.reload()
                expect(page.locator(".bottom-nav button")).to_have_count(4)
                check("same origin rolls back to 4 tabs via normal network reload",True)
                check("rollback preserves personal and other-PWA cache",page.evaluate("async()=>localStorage.getItem('usstock.legacy.personal')==='keep'&&await caches.has('india-other-pwa-sentinel')"))
                check("online rollback preserves IndexedDB marker",page.evaluate(IDB_CHECK))
                context.set_offline(True)
                page.close();page=context.new_page()
                page.goto(url)
                expect(page.locator(".bottom-nav button")).to_have_count(4,timeout=10000)
                check("closed-tab offline restart after rollback restores 4-tab shell",True)
                check("rollback offline protects personal and other app saved data",page.evaluate("async()=>localStorage.getItem('usstock.legacy.personal')==='keep'&&await caches.has('india-other-pwa-sentinel')") and page.evaluate(IDB_CHECK))
                context.close();browser.close()
        finally:
            server.shutdown();server.server_close()
    report={"kind":"UNPUBLISHED_ROOT_MIGRATION_BROWSER_TEST","checks":checks,"passed":len(checks),"root_live_deployed":False,"iphone_tested":False,"user_records_tested":False,"source_revision":OLD_REV}
    (evidence/"migration-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("ROOT MIGRATION RESULT:",json.dumps(report,ensure_ascii=False))
if __name__=="__main__":main()
