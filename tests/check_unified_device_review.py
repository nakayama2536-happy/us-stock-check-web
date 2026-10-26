"""Fail-closed integrity gate for temporary daily five-tab review URL."""
from __future__ import annotations
from hashlib import sha1
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/"docs/preview/unified-daily"
FILES={"index.html","app.js","style.css","unified-ui.js","REVIEW.json"}
TOKEN=re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,})")
def blob(data):
    return sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def verify():
    if not SITE.is_dir() or SITE.is_symlink():
        raise ValueError("Missing isolated review directory")
    if any(p.is_symlink() for p in SITE.rglob("*")):
        raise ValueError("Symlink in isolated review")
    actual={p.relative_to(SITE).as_posix() for p in SITE.rglob("*") if p.is_file()}
    if actual!=FILES:raise ValueError("Unexpected review file: "+repr(actual^FILES))
    info=json.loads((SITE/"REVIEW.json").read_text())
    if info.get("schema")!="us-unified-daily-review/1" or info.get("status")!="REVIEW_ONLY_NOT_ADOPTED" or info.get("source_pr")!=48 or info.get("source_head")!="1231823ca156fd943bc0ba3569adb970b9f8d15b":
        raise ValueError("Unreviewed source identity")
    if any(info.get(k) is not value for k,value in [("normal_root_unchanged",True),("source_readonly",True),("installable",False),("service_worker_registration",False),("device_pass",False)]):
        raise ValueError("Review-only flag mismatch")
    if info.get("formal_engine")!="NOT_IMPLEMENTED" or set(info.get("files",{}))!=FILES-{"REVIEW.json"}:
        raise ValueError("Invalid review manifest")
    for filename,expected in info["files"].items():
        raw=(SITE/filename).read_bytes()
        if blob(raw)!=expected:raise ValueError("Review Git blob mismatch: "+filename)
        if TOKEN.search(raw.decode("utf-8")):raise ValueError("Credential-like content")
    app=(SITE/"app.js").read_text()
    index=(SITE/"index.html").read_text()
    if any(('getJSON("../../data/'+name+'")') not in app for name in ("status.json","market.json","common_snapshot.json")):
        raise ValueError("Review does not load normal Public root JSON")
    if any(x in app for x in ['navigator.serviceWorker.register','localStorage.setItem("usstock.activeTab"', 'getJSON("./data/', 'fetch(path+']):
        raise ValueError("Review may mutate normal PWA or unbounded cache")
    if 'usstock.unifiedReview.activeTab' not in app or app.count('localStorage.')!=2:
        raise ValueError("Review preference isolation mismatch")
    if 'rel="manifest"' in index or '5タブ統合・実機確認用' not in index:
        raise ValueError("Missing review-only UX or unexpected install manifest")
    if 'src="./unified-ui.js?v=unified-review-20261027-rev2"' not in index or 'src="./app.js?v=unified-review-20261027-rev2"' not in index:
        raise ValueError("Missing fixed review code references")
    if "詳細ダイジェストを表示" in (SITE/"unified-ui.js").read_text() or ".unified-legacy" in (SITE/"unified-ui.js").read_text():
        raise ValueError("Duplicate digest reintroduced")
    if list(SITE.rglob("*.json"))!=[SITE/"REVIEW.json"]:
        raise ValueError("Unexpected market or personal JSON copied")
    print("UNIFIED REVIEW GATE PASS: exact 5 files, approved Git blobs, Public root JSON only, no separate SW, no user record migration")
if __name__=="__main__":
    try:verify()
    except Exception as ex:
        print("UNIFIED REVIEW BLOCKED:",type(ex).__name__,str(ex)[:200])
        sys.exit(1)
