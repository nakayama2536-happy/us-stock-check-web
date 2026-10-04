"""Rebuild isolated chart input from already-public commits, never private data."""
import json, subprocess, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE='e4b0ba505a4eb8d260e76ca9bd1beec5156862d6'
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,text=True)
current=json.loads((ROOT/'docs/preview/s1/data/market.json').read_text())
end=max(s['trade_date'] for s in current['stocks'])
out={s['ticker']:{} for s in current['stocks']}
for commit in git('log',BASE,'--format=%H','--','docs/data/market.json').splitlines():
    try:
        market=json.loads(git('show',commit+':docs/data/market.json'))
        status=json.loads(git('show',commit+':docs/data/status.json'))
    except (subprocess.CalledProcessError,ValueError): continue
    if status.get('quality',{}).get('qc')!='PASS': continue
    stocks=market.get('stocks',[])
    for s in stocks:
        ticker=s.get('ticker'); date=s.get('trade_date'); close=s.get('close')
        if ticker not in out or sum(x.get('ticker')==ticker for x in stocks)!=1: continue
        if not isinstance(date,str) or date>end or date!=status.get('us_trade_date'): continue
        if type(close) not in (int,float) or not math.isfinite(close) or close<=0: continue
        if date not in out[ticker]:
            out[ticker][date]={'date':date,'close':close,'source_commit':commit,'primary_source':s.get('primary_source'),'shadow_source':s.get('shadow_source'),'shadow_close_diff_usd':s.get('shadow_close_diff_usd')}
series={t:sorted(rows.values(),key=lambda r:r['date'])[-60:] for t,rows in out.items()}
for s in current['stocks']:
    assert series[s['ticker']][-1]['date']==s['trade_date'] and series[s['ticker']][-1]['close']==s['close']
payload={'schema':'us-preview-public-close-history/1','source_repository':'nakayama2536-happy/us-stock-check-web','source_path':'docs/data/market.json','source_revision':BASE,'basis_date':end,'note':'公開snapshotの保存終値。完全な連続日足・調整後終値ではなく、未保存日は補間しない。指標の再計算には使用しない。','series':series}
(ROOT/'docs/preview/s1/data/chart-history.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
for t,rows in series.items(): print(t,len(rows),rows[0]['date'],rows[-1]['date'])
