"""Build an isolated UI candidate; never modify docs/ or publish it.

Fails on an unreviewed legacy UI revision. Runtime data is copied byte-for-byte.
The candidate intentionally omits service-worker registration and PWA installation.
"""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build" / "us-ui-s1"
PINS = {
    "docs/app.js": "b8618ae99fab2c72414fe49c65edf81d87ac9c10",
    "docs/index.html": "d47dc1048cc5d177c8c5d819857c6f034c0715bf",
    "docs/style.css": "1f00442914297c7fd3810d07c3c1460ac0bc260a",
}

def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def exactly_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError("Reviewed source anchor missing or ambiguous: " + old[:70])
    return source.replace(old, new, 1)

def replace_function(source: str, start: str, end: str, replacement: str) -> str:
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError("Function boundary not unique")
    a, b = source.index(start), source.index(end)
    if b <= a:
        raise ValueError("Invalid function boundary")
    return source[:a] + replacement + "\n" + source[b:]

def build() -> None:
    for path, expected in PINS.items():
        if blob_sha((ROOT / path).read_bytes()) != expected:
            raise SystemExit("Unreviewed source revision; candidate build stopped: " + path)
    if OUTPUT.exists():
        raise SystemExit("Candidate output already exists; use a fresh checkout, do not overwrite")
    before = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (ROOT / "docs").rglob("*") if p.is_file()}
    source = (ROOT / "docs/app.js").read_text(encoding="utf-8")
    source = exactly_once(source, 'const TAB_IDS=["overview","stocks","market","quality"];',
                          'const TAB_IDS=["overview","stocks","market","quality","manage"];')
    source = exactly_once(source, 'const fmt=v=>v===null||v===undefined||v===""?"—":v;',
                          'const fmt=v=>v===null||v===undefined||v===""?"—":USExperience.esc(v);')
    source = replace_function(source, 'function decisionState(s){', 'function signalTone(value){',
                               'function decisionState(s){return USExperience.signals(s);}\n')
    source = replace_function(source, 'async function getJSON(path){', 'function digestPanel(status,market){', '''async function getJSON(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(path+`?t=${Date.now()}`,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error("Snapshot unavailable");
    return await response.json();
  }finally{clearTimeout(timer);}
}
''')
    source = exactly_once(source, 'Number.isFinite(Number(p.value))', 'USExperience.finite(p.value)!==null')
    source = exactly_once(source, '<strong>${ticker}</strong>', '<strong>${fmt(ticker)}</strong>')
    marker = 'async function main(options={}){'
    if source.count(marker) != 1:
        raise SystemExit("Legacy bootstrap boundary changed")
    # Keep all legacy panel and chart helpers. A new candidate-only bootstrap is separate.
    source = source[:source.index(marker)]
    OUTPUT.parent.mkdir(exist_ok=True)
    shutil.copytree(ROOT / "docs", OUTPUT)
    (OUTPUT / "app.js").write_text(source, encoding="utf-8")
    for name, target in [("index.html", "index.html"), ("experience.js", "experience.js"),
                         ("experience.css", "experience.css"), ("bootstrap.js", "boot.js")]:
        shutil.copyfile(ROOT / "candidate" / name, OUTPUT / target)
    after = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in (ROOT / "docs").rglob("*") if p.is_file()}
    if before != after:
        raise SystemExit("Production docs changed during candidate build")
    for path, sha in before.items():
        if path.startswith("docs/data/") and hashlib.sha256((OUTPUT / path[5:]).read_bytes()).hexdigest() != sha:
            raise SystemExit("Public data changed")
    if 'serviceWorker.register' in source or 'serviceWorker.register' in (OUTPUT / 'boot.js').read_text():
        raise SystemExit("Candidate must not register a Service Worker")
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        commit = None
    evidence = {"kind": "US_UI_CANDIDATE_NOT_RELEASE", "ui_version": "s1.0.1.0",
                "source_commit": commit, "legacy_blob_pins": PINS,
                "production_docs_unchanged": True, "public_data_bytes_unchanged": True,
                "service_worker_registered": False, "device_acceptance": "NOT_VERIFIED",
                "source_file_sha256": before}
    (OUTPUT / "BUILD_PROVENANCE.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+"\n")
    print("Candidate built: original docs and public data unchanged; no deployment")

if __name__ == "__main__":
    build()
