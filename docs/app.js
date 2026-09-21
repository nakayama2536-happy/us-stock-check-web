const $=id=>document.getElementById(id);
const fmt=v=>v===null||v===undefined||v===""?"—":v;
const pct=v=>v===null||v===undefined?"—":`${v>0?"+":""}${Number(v).toFixed(2)}%`;
const jst=v=>{
  if(!v)return "—";
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m?`${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]} JST`:v;
};

function badge(value){
  const v=(value||"").toUpperCase();
  const cls=v==="NORMAL"?"normal":v==="HOLD"?"hold":v==="NO_CHANGE"?"nochange":"";
  return `<span class="badge ${cls}">${fmt(value)}</span>`;
}
async function getJSON(path){
  const r=await fetch(path+`?t=${Date.now()}`,{cache:"no-store"});
  if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
function stockCard(s){
  return `<article class="card">
    <div class="stock-head">
      <div><div class="ticker">${fmt(s.ticker)}</div><div class="name">${fmt(s.name)}</div></div>
      ${badge(s.signal)}
    </div>
    <div class="price">${s.close==null?"—":"$"+Number(s.close).toFixed(2)}</div>
    <div class="delta">${pct(s.change_pct)}</div>
    <div class="meta">
      <div><span class="label">Trend</span>${fmt(s.trend)}</div>
      <div><span class="label">MACD</span>${fmt(s.macd_state)}</div>
      <div><span class="label">RSI14</span>${fmt(s.rsi14)}</div>
      <div><span class="label">50 / 200MA</span>${fmt(s.ma_state)}</div>
    </div>
  </article>`;
}
function marketCard(m){
  return `<article class="card">
    <div class="stock-head"><strong>${fmt(m.name)}</strong><span class="name">${fmt(m.symbol)}</span></div>
    <div class="price">${fmt(m.value)}</div>
    <div class="delta">${pct(m.change_pct)}</div>
  </article>`;
}
async function main(){
  try{
    const [status,market]=await Promise.all([getJSON("./data/status.json"),getJSON("./data/market.json")]);
    $("version").textContent="v"+fmt(status.app_version);
    $("appState").innerHTML=`${fmt(status.app_state_ja)} <small style="font-size:.7em;opacity:.75">/ ${fmt(status.run_state)}</small>`;
    $("tradeDate").textContent=fmt(status.us_trade_date);
    $("updatedAt").textContent=jst(status.generated_at_jst);
    $("statusMessage").textContent=fmt(status.message);
    $("summary").textContent=market.summary||"データ待ちです。";
    $("stocks").innerHTML=(market.stocks||[]).map(stockCard).join("")||'<div class="card muted">主要銘柄データ待ち</div>';
    $("market").innerHTML=(market.market_environment||[]).map(marketCard).join("")||'<div class="card muted">市場データ待ち</div>';
    const q=status.quality||{};
    $("quality").innerHTML=`
      <div class="meta">
        <div><span class="label">Run state</span>${fmt(status.run_state)}</div>
        <div><span class="label">QC</span>${fmt(q.qc)}</div>
        <div><span class="label">Session</span>${fmt(q.session)}</div>
        <div><span class="label">Completeness</span>${fmt(q.completeness)}</div>
        <div><span class="label">Source check</span>${fmt(q.source_crosscheck)}</div>
      </div>`;
  }catch(e){
    $("appState").textContent="読込エラー";
    $("statusMessage").textContent=e.message;
    $("quality").textContent="JSONの取得に失敗しました。";
  }
}
main();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));}
